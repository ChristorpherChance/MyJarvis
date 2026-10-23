"""Isolated Linux fixtures for managed operation pins and legacy held captures."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

GUARD = Path(__file__).with_name('storage-retention') / 'jarvis-backup-retention.py'
spec = importlib.util.spec_from_file_location('retention_protocol_guard', GUARD)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ManagedRetentionProtocolTests(unittest.TestCase):
    def setUp(self):
        if os.geteuid() != 0:
            self.skipTest('guard strictly requires uid 0; fixture cannot relax production owner checks')
        self.temp = tempfile.TemporaryDirectory(prefix='managed-retention-fixture-', dir='/root')
        self.addCleanup(self.temp.cleanup)
        self.control = Path(self.temp.name) / 'control'
        os.chmod(self.temp.name, 0o700)
        self.control.mkdir(mode=0o700)
        os.chmod(self.control, 0o700)
        self.owner_uid = os.geteuid()
        self.owner_gid = os.getegid()
        self.recovery = Path(self.temp.name) / 'capture-release-recovery.py'
        self.recovery.write_text('# isolated fake recovery verifier; never executed\n')
        os.chmod(self.recovery, 0o600)
        self.owner_uid, self.owner_gid = os.geteuid(), os.getegid()
        for path in (Path(self.temp.name), self.control, self.recovery):
            os.chown(path, self.owner_uid, self.owner_gid)

    def capture(self, name, release, created, pin=True, terminal_hash=None):
        root = self.control / name
        root.mkdir(mode=0o700)
        snap = root / 'data-snapshot'
        snap.mkdir(mode=0o700)
        payload = snap / 'payload'
        payload.mkdir(mode=0o700)
        (payload / 'fixture.txt').write_text('synthetic-only')
        os.chmod(payload / 'fixture.txt', 0o600)
        manifest = {
            'schema': 1, 'scope': 'primary', 'sourceRoot': '/var/lib/jarvis/data',
            'fixtureOwnerUid': self.owner_uid, 'fixtureOwnerGid': self.owner_gid,
            'privateManifest': True, 'sourceWasRequiredQuiescent': True,
            'release': release, 'createdAt': created,
            'inventory': {'files': [{'size': 14, 'sha256': hashlib.sha256(b'synthetic-only').hexdigest()}], 'directories': []},
            'sqliteDatabasesChecked': 0,
        }
        raw = guard.encoded(manifest)
        (snap / 'manifest.json').write_bytes(raw)
        manifest_hash = hashlib.sha256(raw).hexdigest()
        summary = {
            'status': 'passed', 'operation': 'snapshot-created', 'release': release, 'scope': 'primary',
            'manifestSha256': manifest_hash, 'files': 1, 'directories': 0, 'bytes': 14,
            'sqliteDatabasesChecked': 0, 'sqliteIntegrity': 'ok', 'completeTreeVerified': True,
            'liveDirectoryModified': False, 'automaticRollback': False,
        }
        terminal = {
            'node': '112', 'release': release, 'active': True, 'activationLockHeld': True,
            'productionDataRestored': False, 'dataSnapshot': summary, 'isolatedRestore': {**summary, 'operation': 'isolated-restore-verified'},
            'recoverySHA256': terminal_hash or hashlib.sha256(self.recovery.read_bytes()).hexdigest(),
        }
        (root / 'activation.json').write_bytes(guard.encoded(terminal))
        if pin:
            operation = {'pins': {'node': '112', 'release': release, 'recoveryPath': str(self.recovery)}}
            (root / 'operation.json').write_bytes(guard.encoded(operation))
        return root

    def test_current_managed_shape_passes_pin_validation_and_selects(self):
        current = self.capture('capture-upgrade-new-112', 'rel-new', '2026-10-21T01:00:00+00:00')
        row = guard.metadata_capture(current, self.control)
        self.assertTrue(row['availablePayload'])
        pin = guard.pinned_recovery(current, self.control)
        self.assertEqual(pin['path'], str(self.recovery))
        self.assertEqual(pin['sha256'], hashlib.sha256(self.recovery.read_bytes()).hexdigest())

    def test_legacy_missing_pin_is_protected_even_when_older_than_two(self):
        legacy = self.capture('capture-upgrade-old-112', 'rel-old', '2026-10-18T01:00:00+00:00', pin=False)
        newer1 = self.capture('capture-upgrade-newer1-112', 'rel-a', '2026-10-20T01:00:00+00:00')
        newer2 = self.capture('capture-upgrade-newer2-112', 'rel-b', '2026-10-21T01:00:00+00:00')
        selection = guard.select_latest_two(self.control)
        self.assertEqual({r['capture'] for r in selection['kept']}, {str(newer1), str(newer2)})
        self.assertIn(str(legacy), selection['protected'])
        self.assertNotIn(str(legacy), {r['capture'] for r in selection['older']})

    def test_mismatched_recovery_hash_is_protected(self):
        broken = self.capture('capture-upgrade-bad-112', 'rel-bad', '2026-10-21T01:00:00+00:00', terminal_hash='0' * 64)
        with self.assertRaises(guard.RetentionError):
            guard.metadata_capture(broken, self.control)


if __name__ == '__main__':
    unittest.main()
