"""Local adversarial fixtures only; no Docker, SSH, source product or models."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
from datetime import datetime, timezone
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fa01', Path(__file__).with_name('project-autonomy-fa01-coordinator.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PATHS = ['apps/server/dist/main.js', 'apps/web/dist/index.html', 'packages/shared/dist/index.js',
         'packages/shared/dist/esm/index.js', 'pnpm-lock.yaml', 'package.json']


def fixture(path, *, prefix='./', omitted=None, corrupt=False, extra=None):
    files = {name: ('public fixture ' + name).encode() for name in PATHS}
    manifest = {'runId': 'a' * 40, 'sourceFingerprint': 'b' * 64, 'goalSpecHash': 'c' * 64,
                'files': [{'path': name, 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)} for name, body in files.items()]}
    if corrupt:
        manifest['files'][0]['sha256'] = '0' * 64
    files['jarvis-package-manifest.json'] = json.dumps(manifest).encode()
    files['apps/server/src/db/migrations/001.sql'] = b'SELECT 1;'
    with tarfile.open(path, 'w:gz') as archive:
        entry = tarfile.TarInfo(prefix + 'node_modules/.pnpm')
        entry.type = tarfile.DIRTYPE
        archive.addfile(entry)
        for name, body in files.items():
            if name == omitted:
                continue
            entry = tarfile.TarInfo(prefix + name)
            entry.size = len(body)
            archive.addfile(entry, io.BytesIO(body))
        if extra:
            archive.addfile(extra, io.BytesIO(b'x' * extra.size) if extra.isfile() else None)
    return manifest


class PackageFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.path = self.root / 'package.tar.gz'

    def tearDown(self):
        self.temp.cleanup()

    def test_leading_dot_headers_real_bytes_extract_and_install(self):
        expected = fixture(self.path)
        actual = module.safe_archive(self.path, self.root / 'installed')
        self.assertEqual(actual['manifest'], expected)
        self.assertEqual((self.root / 'installed' / PATHS[0]).read_bytes(), ('public fixture ' + PATHS[0]).encode())

    def test_wrong_manifest_bytes_rejected_before_extraction(self):
        fixture(self.path, corrupt=True)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_MANIFEST_BYTES_MISMATCH'):
            module.safe_archive(self.path, self.root / 'installed')
        self.assertFalse((self.root / 'installed').exists())

    def test_missing_frontend_not_a_complete_package(self):
        fixture(self.path, omitted='apps/web/dist/index.html')
        with self.assertRaisesRegex(ValueError, 'PACKAGE_COMPONENT_MISSING'):
            module.safe_archive(self.path)

    def test_traversal_refused(self):
        extra = tarfile.TarInfo('../escaped')
        extra.size = 1
        fixture(self.path, extra=extra)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_PATH_INVALID'):
            module.safe_archive(self.path)

    def test_absolute_header_refused(self):
        extra = tarfile.TarInfo('/etc/not-written')
        fixture(self.path, extra=extra)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_PATH_INVALID'):
            module.safe_archive(self.path)

    def test_symlink_escape_refused(self):
        extra = tarfile.TarInfo('node_modules/outside')
        extra.type, extra.linkname = tarfile.SYMTYPE, '../../outside'
        fixture(self.path, extra=extra)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_LINK_OUTSIDE_ROOT'):
            module.safe_archive(self.path)

    def test_internal_dependency_symlink_allowed(self):
        extra = tarfile.TarInfo('node_modules/pkg')
        extra.type, extra.linkname = tarfile.SYMTYPE, '.pnpm/pkg'
        fixture(self.path, extra=extra)
        self.assertEqual(module.safe_archive(self.path)['entries'], 10)

    def test_duplicate_normalized_header_refused(self):
        extra = tarfile.TarInfo(PATHS[0])
        fixture(self.path, extra=extra)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_ENTRY_INVALID'):
            module.safe_archive(self.path)

    def test_special_header_refused(self):
        extra = tarfile.TarInfo('unsafe-fifo')
        extra.type = tarfile.FIFOTYPE
        fixture(self.path, extra=extra)
        with self.assertRaisesRegex(ValueError, 'PACKAGE_ENTRY_INVALID'):
            module.safe_archive(self.path)

    def test_compressed_bound_and_existing_destination_refused(self):
        fixture(self.path)
        with patch.object(module, 'MAX_PACKAGE', 0), self.assertRaisesRegex(ValueError, 'PACKAGE_COMPRESSED_LIMIT'):
            module.safe_archive(self.path)
        dest = self.root / 'installed'
        dest.mkdir()
        with self.assertRaisesRegex(ValueError, 'PACKAGE_INSTALL_DESTINATION_EXISTS'):
            module.safe_archive(self.path, dest)


class CleanupFixtures(unittest.TestCase):
    def test_phase_unknown_json_cannot_mask_signal_or_unexpected_exit(self):
        for exit_code in [-15, 137, 1, 0, 3]:
            errors = []
            report = {'status': 'unknown', 'checks': [{'status': 'unknown'}]}
            module.phase_process_result(exit_code, report, errors)
            self.assertEqual(errors, [{'id': 'phase-contract', 'errorCode': 'PHASE_PROCESS_ABNORMAL_EXIT'}])
        for exit_code, status in [(0, 'pass'), (1, 'fail'), (2, 'unknown')]:
            errors = []
            module.phase_process_result(exit_code, {'status': status}, errors)
            self.assertEqual(errors, [])

    def test_nonzero_or_signal_collector_exit_refuses_passing_report(self):
        report = {'checks': [{'status': 'pass', 'exitCode': 0}], 'problems': []}
        for result in [1, 137, -15]:
            errors = []
            self.assertIs(module.collector_process_result('runtime', result, report, errors), report)
            self.assertEqual(errors, [{'id': 'collector-runtime', 'errorCode': 'COLLECTOR_PROCESS_NONZERO'}])
        errors = []
        module.collector_process_result('build', 0, report, errors)
        self.assertEqual(errors, [])

    def test_public_manifest_rejects_added_source_but_excludes_only_generated_prototype_output(self):
        old = [{'path': 'src/index.ts', 'sha256': 'a' * 64, 'bytes': 5}, {'path': 'doc/evidence/page.png', 'sha256': 'b' * 64, 'bytes': 5}]
        self.assertEqual(module.source_manifest(old), module.source_manifest(old[:1]))
        self.assertNotEqual(module.source_manifest(old), module.source_manifest(old + [{'path': 'src/injected.ts', 'sha256': 'c' * 64, 'bytes': 5}]))

    def test_phase_report_requires_identity_and_all_distinct_contract_ids(self):
        row = {'id': 'fa02-input-contract', 'required': True, 'executed': True, 'status': 'pass', 'exitCode': 0, 'command': 'actual trusted HTTP test', 'evidenceSha256': 'd' * 64}
        value = {'runId': 'a' * 40, 'sourceFingerprint': 'b' * 64, 'workPackage': 'FA-02', 'goalSpecHash': 'c' * 64, 'checks': [row], 'problems': [], 'artifacts': []}
        args = ['a' * 40, 'b' * 64, 'FA-02', 'c' * 64, ['fa02-input-contract']]
        self.assertEqual(module.phase_report(value, *args), value)
        with self.assertRaisesRegex(ValueError, 'PHASE_REPORT_IDENTITY_MISMATCH'):
            module.phase_report({**value, 'runId': 'e' * 40}, *args)
        with self.assertRaisesRegex(ValueError, 'PHASE_REPORT_DENOMINATOR_MISMATCH'):
            module.phase_report({**value, 'checks': [row, row]}, *args)
        with self.assertRaisesRegex(ValueError, 'PHASE_CHECK_INVALID'):
            module.phase_report({**value, 'checks': [{**row, 'executed': False}]}, *args)

    def test_only_owned_labelled_resource_ids_are_removed(self):
        state = {'containers': ['ours', 'not-ours', 'absent'], 'network': 'ours-net',
                 'labels': {'scope': 'ours'}, 'resourceId': 'a' * 40, 'fingerprint': 'b' * 64}
        def inspected(kind, name):
            return {'ours': {'Id': 'ours-id', 'Config': {'Labels': {'scope': 'ours'}}},
                    'not-ours': {'Id': 'business-id', 'Config': {'Labels': {'scope': 'other'}}},
                    'ours-net': {'Id': 'network-id', 'Labels': {'scope': 'ours'}, 'Internal': True}}.get(name)
        removed = []
        with patch.object(module, 'inspect', side_effect=inspected), patch.object(module, 'docker', side_effect=lambda args, *_: removed.append(args) or 0):
            result = module.cleanup(state, '/unused')
        self.assertFalse(result['complete'])
        self.assertEqual(removed, [['rm', '--force', '--volumes', 'ours-id'], ['network', 'rm', 'network-id']])
        self.assertFalse(result['businessResourcesTouched'])

    def test_stale_owner_identity_never_sends_signal_to_reused_pid(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'lifecycle.json'
            p.write_text(json.dumps({'owner': {'pid': 9999, 'start': 'old', 'boot': 'old'}}))
            result = {'complete': True, 'businessResourcesTouched': False}
            with patch.object(module, 'trusted'), patch.object(module, 'write_json'), patch.object(module, 'process_identity', return_value={'pid': 9999, 'start': 'new', 'boot': 'old'}), patch.object(module, 'cleanup', return_value=result), patch.object(module.os, 'pidfd_open', create=True) as kill:
                self.assertEqual(module.watchdog(str(p)), 0)
                kill.assert_not_called()


class PrerequisiteMetadataFixtures(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.evidence = Path(self.tmp.name)
        self.run, self.attempt, self.source, self.goal = 'a' * 40, 'b' * 32, 'c' * 64, 'd' * 64
        self.clock = datetime(2026, 10, 11, tzinfo=timezone.utc)
        self.metadata = {'schemaVersion': 1, 'kind': 'project-autonomy-prerequisite-status', 'simulated': False,
                         'runId': self.run, 'attempt': self.attempt, 'sourceFingerprint': self.source,
                         'goalSpecHash': self.goal, 'workPackage': 'FA-03', 'observedAt': '2026-10-11T00:00:00Z',
                         'observationsAreAcceptance': False,
                         'waiting': [{'id': 'provider', 'reasonCode': 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING'}]}
        self.binding = {'id': 'provider', 'checkId': 'fa03-definition-model-context', 'objectiveIds': ['MSF-OBJ-021'],
                        'errorCode': 'TRUSTED_PREREQUISITE_RECEIPT_MISSING', 'sourceFingerprint': self.source,
                        'goalSpecHash': self.goal, 'workPackage': 'FA-03'}
        self.checks = [{'id': 'build', 'executed': True, 'status': 'pass', 'exitCode': 0},
                       {'id': 'fa03-definition-model-context', 'executed': True, 'status': 'unknown', 'exitCode': 2,
                        'tests': {'total': 2, 'passed': 1, 'failed': 0, 'skipped': 0, 'unknown': 1}}]
        self.errors = [{'id': 'fa03-definition-model-context', 'errorCode': 'TRUSTED_PREREQUISITE_RECEIPT_MISSING'}]

    def tearDown(self):
        self.tmp.cleanup()

    def invoke(self, changes=None, checks=None, errors=None, stable=True, raw=None):
        body = (json.dumps({**self.metadata, **(changes or {})}, indent=2) + '\n').encode() if raw is None else raw
        (self.evidence / 'prerequisite-status.json').write_bytes(body)
        value = {'waitingPrerequisites': [self.binding], 'observerExport': {'status': 'waiting', 'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}}
        with patch.object(module, 'trusted'), patch.object(module.os, 'O_NOFOLLOW', 0, create=True):
            return module.prerequisite_wait_metadata(value, self.evidence, self.run, self.attempt, self.source, 'FA-03', self.goal,
                                                     self.checks if checks is None else checks, self.errors if errors is None else errors, stable, self.clock)

    def test_real_raw_bytes_hash_and_complete_unknown_mapping_forwarded(self):
        result = self.invoke()
        body = (self.evidence / 'prerequisite-bound-status.json').read_bytes()
        self.assertTrue(result['prerequisiteWaitEligible'])
        self.assertEqual(result['prerequisiteStatusJson'].encode(), body)
        self.assertEqual(result['prerequisiteStatusSha256'], hashlib.sha256(body).hexdigest())
        self.assertEqual(result['waitingPrerequisites'][0]['checkId'], 'fa03-definition-model-context')

    def test_unrelated_long_pending_is_not_forwarded_for_provider_phase(self):
        self.metadata['waiting'].append({'id': 'long-observation', 'reasonCode': 'LONG_OBSERVATION_IN_PROGRESS',
                                         'actualObservedSeconds': 90.8, 'requiredSeconds': 259200})
        result = self.invoke()
        bound = json.loads(result['prerequisiteStatusJson'])
        original = json.loads((self.evidence / 'prerequisite-status.json').read_bytes())
        self.assertEqual([v['id'] for v in bound['waiting']], ['provider'])
        self.assertEqual(len(original['waiting']), 2)
        self.assertEqual(bound['observedAt'], original['observedAt'])

    def test_true_millisecond_finish_does_not_truncate_observer_timestamp(self):
        actual = datetime(2026, 10, 11, 0, 0, 0, 567000, tzinfo=timezone.utc)
        with patch.object(module, 'datetime') as clock:
            clock.now.return_value = actual
            self.assertEqual(module.utc_now(), '2026-10-11T00:00:00.567Z')

    def test_product_fail_or_signal_or_cleanup_fault_is_not_resource_wait(self):
        for code in ['COLLECTOR_PROCESS_NONZERO', 'SCOPED_CLEANUP_INCOMPLETE', 'PACKAGE_PUBLIC_SOURCE_CHANGED']:
            self.assertEqual(self.invoke(errors=self.errors + [{'id': 'actual-fault', 'errorCode': code}]), {})
        self.assertEqual(self.invoke(checks=[{**self.checks[0], 'status': 'fail', 'exitCode': 1}, self.checks[1]]), {})
        self.assertEqual(self.invoke(stable=False), {})

    def test_phase_unknown_process_signal_cannot_forward_wait_metadata(self):
        for exit_code in [-15, 137, 1, 0, 3]:
            errors = list(self.errors)
            module.phase_process_result(exit_code, {'status': 'unknown'}, errors)
            self.assertEqual(self.invoke(errors=errors), {})

    def test_unknown_mapped_group_cannot_hide_failed_test_count(self):
        checks = [self.checks[0], {**self.checks[1], 'tests': {**self.checks[1]['tests'], 'failed': 1}}]
        self.assertEqual(self.invoke(checks=checks), {})

    def test_missing_unknown_check_binding_is_rejected(self):
        checks = [*self.checks, {'id': 'another-unknown', 'executed': True, 'status': 'unknown', 'exitCode': 2}]
        with self.assertRaisesRegex(ValueError, 'PREREQUISITE_CHECK_MAPPING_INCOMPLETE'):
            self.invoke(checks=checks)

    def test_changed_source_attempt_or_goal_cannot_use_stale_root_status(self):
        for field in ['runId', 'attempt', 'sourceFingerprint', 'goalSpecHash']:
            with self.assertRaisesRegex(ValueError, 'PREREQUISITE_STATUS_IDENTITY_MISMATCH'):
                self.invoke({field: 'e' * 64})

    def test_old_or_future_or_unknown_reason_is_rejected(self):
        for stamp in ['2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z']:
            with self.assertRaisesRegex(ValueError, 'PREREQUISITE_STATUS_NOT_FRESH'):
                self.invoke({'observedAt': stamp})
        with self.assertRaisesRegex(ValueError, 'PREREQUISITE_STATUS_REASON_INVALID'):
            self.invoke({'waiting': [{'id': 'provider', 'reasonCode': 'MODEL_SAID_READY'}]})


if __name__ == '__main__':
    unittest.main(verbosity=2)
