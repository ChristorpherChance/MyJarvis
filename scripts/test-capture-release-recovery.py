"""Synthetic private-temp fixtures only. No production data, network, services or models."""
import contextlib
import importlib.util
import io
import json
import os
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("capture_release_recovery", Path(__file__).with_name("capture-release-recovery.py"))
recovery = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recovery)
RELEASE = "fixture-release"


class RecoveryFixtures(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jarvis-release-recovery-fixture-")
        self.root = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)
        if os.name == "nt":
            recovery.windows_private(self.root, secure=True)
        else:
            os.chmod(self.root, 0o700)
        self.data, self.private = self.root / "owned-data", self.root / "owned-private"
        self.data.mkdir(mode=0o700)
        recovery.make_private_directory(self.private)

    def source(self, wal=False):
        connections = []
        for relative in ("jarvis.db", "execution/execution.sqlite", "project-decisions/decisions.sqlite",
                         "project-supervision-plans/supervision-plans.sqlite", "project-autonomy/autonomy.sqlite"):
            path = self.data / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(path)
            if wal and relative == "jarvis.db":
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("PRAGMA wal_autocheckpoint=0")
            connection.execute("CREATE TABLE fixture(value TEXT NOT NULL)")
            connection.execute("INSERT INTO fixture VALUES(?)", ("synthetic-reference-record",))
            connection.commit()
            if wal and relative == "jarvis.db":
                connections.append(connection)
            else:
                connection.close()
        for relative, content in {"inbox-materials/owned-original.bin": b"RIFF-owned-synthetic-recording\x00\xff",
                                  "pi/owned-session.json": b'{"synthetic":true}',
                                  "runtime/voice-master.key": b"owned-fixture-bytes-not-a-real-key",
                                  "knowledge-uploads/owned-original.bin": b"owned-original-document"}.items():
            path = self.data / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        (self.data / "owned-empty-directory").mkdir()
        for connection in connections:
            self.addCleanup(connection.close)
        return connections

    def create(self, name="snapshot"):
        return recovery.snapshot(self.data, self.private / name, RELEASE, "fixture")

    def test_full_tree_wal_sqlite_and_original_bytes_restore_into_private_new_sibling(self):
        self.source(wal=True)
        before = recovery.inventory(self.data)
        result = self.create()
        self.assertEqual(result["sqliteDatabasesChecked"], 5)
        saved = self.private / "snapshot"
        value, count = recovery.verify(saved, result["manifestSha256"], RELEASE)
        self.assertEqual(count, 5)
        self.assertEqual(recovery.content_inventory(value["inventory"]), recovery.content_inventory(before))
        target = self.private / "restored"
        restored = recovery.restore(saved, target, result["manifestSha256"], RELEASE)
        self.assertEqual(restored["operation"], "isolated-restore-verified")
        self.assertEqual(restored["sqliteDatabasesChecked"], 5)
        self.assertEqual(recovery.content_inventory(recovery.inventory(target)), recovery.content_inventory(before))
        self.assertEqual(recovery.inventory(self.data), before)
        self.assertTrue((target / "owned-empty-directory").is_dir())
        self.assertEqual((target / "inbox-materials/owned-original.bin").read_bytes(), (self.data / "inbox-materials/owned-original.bin").read_bytes())
        recovery.verify_private_tree(saved)
        recovery.verify_private_tree(target)
        output = json.dumps(result)
        self.assertNotIn(str(self.root), output)
        self.assertNotIn("owned-original", output)
        self.assertNotIn("voice-master", output)
        # WAL-only committed data is readable from the restored database, not just an empty main DB.
        database = sqlite3.connect(target / "jarvis.db")
        try:
            self.assertEqual(database.execute("SELECT value FROM fixture").fetchall(), [("synthetic-reference-record",)])
        finally:
            database.close()

    def test_links_existing_outputs_and_non_sibling_or_live_targets_are_refused(self):
        self.source()
        outside = self.root / "owned-outside"
        outside.mkdir()
        (outside / "fixture.bin").write_bytes(b"owned-outside-fixture")
        link = self.data / "owned-linked-directory"
        if os.name == "nt":
            result = subprocess.run(["cmd.exe", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True, check=False)
            self.assertEqual(result.returncode, 0, "owned junction fixture creation failed")
        else:
            link.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(recovery.RecoveryError, "LINK_REFUSED"):
            self.create("linked")
        link.rmdir() if os.name == "nt" else link.unlink()
        hardlink = self.data / "owned-hardlink.bin"
        os.link(outside / "fixture.bin", hardlink)
        with self.assertRaisesRegex(recovery.RecoveryError, "NONREGULAR_OR_HARDLINK_REFUSED"):
            self.create("hardlinked")
        hardlink.unlink()
        result = self.create()
        with self.assertRaisesRegex(recovery.RecoveryError, "DESTINATION_EXISTS"):
            self.create()
        saved = self.private / "snapshot"
        target = self.private / "existing"
        target.mkdir()
        (target / "keep.bin").write_bytes(b"must-remain")
        with self.assertRaisesRegex(recovery.RecoveryError, "DESTINATION_EXISTS"):
            recovery.restore(saved, target, result["manifestSha256"], RELEASE)
        self.assertEqual((target / "keep.bin").read_bytes(), b"must-remain")
        with self.assertRaisesRegex(recovery.RecoveryError, "RESTORE_PRIVATE_SIBLING_REQUIRED"):
            recovery.restore(saved, self.data, result["manifestSha256"], RELEASE)
        with self.assertRaisesRegex(recovery.RecoveryError, "SOURCE_DESTINATION_OVERLAP"):
            recovery.snapshot(self.private, self.private / "nested", RELEASE, "fixture")

    def test_corrupt_payload_manifest_traversal_and_bad_sqlite_fail_without_live_mutation(self):
        self.source()
        result = self.create()
        saved = self.private / "snapshot"
        private_file = saved / "payload/inbox-materials/owned-original.bin"
        original = private_file.read_bytes()
        private_file.write_bytes(b"tampered-fixture")
        with self.assertRaisesRegex(recovery.RecoveryError, "SNAPSHOT_FINGERPRINT_MISMATCH"):
            recovery.verify(saved, result["manifestSha256"], RELEASE)
        private_file.write_bytes(original)
        manifest = saved / "manifest.json"
        value = json.loads(manifest.read_bytes())
        value["inventory"]["files"][0]["path"] = "../outside.bin"
        raw = recovery.encoded_json(value)
        manifest.write_bytes(raw)
        with self.assertRaisesRegex(recovery.RecoveryError, "MANIFEST_INVALID"):
            recovery.verify(saved, recovery.sha(raw), RELEASE)
        bad = self.data / "owned-corrupt.sqlite"
        bad.write_bytes(b"not-a-sqlite-database")
        with self.assertRaisesRegex(recovery.RecoveryError, "SQLITE_INTEGRITY_FAILED"):
            self.create("corrupt-database")
        self.assertEqual(bad.read_bytes(), b"not-a-sqlite-database")

    def test_mid_copy_source_change_fails_and_cli_errors_never_print_paths_or_file_names(self):
        self.source()
        actual_copy = recovery.copy_inventory

        def changed(source, target, expected):
            actual_copy(source, target, expected)
            (source / "inbox-materials/owned-original.bin").write_bytes(b"changed-after-copy")

        with patch.object(recovery, "copy_inventory", side_effect=changed):
            with self.assertRaisesRegex(recovery.RecoveryError, "SOURCE_CHANGED"):
                self.create("unstable")
        self.assertFalse((self.private / "unstable/manifest.json").exists())
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = recovery.main(["verify", "--snapshot", str(self.private / "absent-private"),
                                    "--expect-manifest-sha256", "0" * 64, "--release", RELEASE])
        self.assertEqual(status, 1)
        self.assertEqual(json.loads(output.getvalue())["status"], "failed")
        self.assertNotIn(str(self.root), output.getvalue())
        self.assertNotIn("absent-private", output.getvalue())

    def test_cross_platform_drive_and_unc_manifest_paths_are_rejected(self):
        for path in ("C:/outside.bin", "D:drive-relative.bin", "//server/share/file", "/absolute.bin", "../outside.bin"):
            value = {"schema": 1, "release": RELEASE, "scope": "fixture", "sourceRoot": str(self.data),
                     "inventory": {"directories": [{"path": ""}], "files": [
                         {"path": path, "size": 0, "sha256": "0" * 64, "sqlite": False}]}}
            with self.assertRaisesRegex(recovery.RecoveryError, "MANIFEST_INVALID"):
                recovery.validate_manifest(value)


if __name__ == "__main__":
    unittest.main(verbosity=2)
