"""Local-only contract tests. No Docker, remote node, model, or source task."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).parent
spec = importlib.util.spec_from_file_location('main_wrapper_r26', SCRIPTS / 'factory-main-acceptance-wrapper-r26.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
RUN = 'a' * 40
ATTEMPT = 'b' * 32


def baseline():
    value = json.loads((SCRIPTS / 'project-autonomy-baseline-r22.json').read_bytes())
    value.update(workspace=w.WORKSPACE, sourceFingerprintObserved=w.SOURCE_SHA256)
    return value


def policy():
    return {'mode': 'fa01-isolated-v1', 'workspace': w.WORKSPACE, 'workPackage': w.WORK_PACKAGE,
            'goalSpecHash': w.GOAL_HASH, 'evidenceRoot': w.ROOT, 'sourceFingerprint': w.SOURCE_SHA256,
            'expectedChecks': list(w.REQUIRED),
            'imageIds': {k: 'sha256:' + str(i) * 64 for i, k in enumerate(['node', 'postgres', 'redis', 'minio'])}}


def lifecycle():
    resource = hashlib.sha256((RUN + ATTEMPT).encode()).hexdigest()[:40]
    prefix = 'jarvis-fa01-' + resource
    return {'owner': {'pid': 234, 'start': '12345', 'boot': '12345678-1234-1234-1234-123456789abc'},
            'labels': {'jarvis.validation.runId': RUN, 'jarvis.validation.attempt': ATTEMPT,
                       'jarvis.validation.role': 'project-autonomy-fa01',
                       'jarvis.validation.sourceFingerprint': w.SOURCE_SHA256},
            'resourceId': resource, 'fingerprint': w.SOURCE_SHA256,
            'containers': [prefix + '-' + v for v in ['postgres', 'redis', 'minio', 'build', 'runtime', 'probe']],
            'network': prefix + '-net', 'brokerScope': w.BROKER_ROOT + '/' + resource}


class MainAcceptanceWrapperTests(unittest.TestCase):
    def reject_config(self, p=None, b=None, code=None):
        with self.assertRaisesRegex(ValueError, code or 'MAIN_ACCEPTANCE_'):
            w.validate_config(p if p is not None else policy(), b if b is not None else baseline())

    def test_original_floor_matches_all_frozen_45_and_30(self):
        frozen = baseline()
        self.assertEqual(tuple(frozen['requiredTestFiles']), w.ORIGINAL_TESTS)
        self.assertEqual(tuple(frozen['requiredPrototypeSuites']), w.ORIGINAL_SUITES)
        self.assertEqual(len(w.ORIGINAL_TESTS), 45)
        self.assertEqual(len(w.ORIGINAL_SUITES), 30)
        w.validate_config(policy(), frozen)

    def test_required_tests_cannot_be_replaced_even_if_count_stays_45(self):
        b = baseline()
        b['requiredTestFiles'][0] = 'apps/server/src/replacement.test.ts'
        self.reject_config(b=b, code='ORIGINAL_TESTS_REQUIRED')

    def test_shared_tests_cannot_be_reduced_to_old_narrow_run(self):
        b = baseline()
        b['requiredTestFiles'] = b['requiredTestFiles'][-3:]
        self.reject_config(b=b, code='ORIGINAL_TESTS_REQUIRED')

    def test_test_and_suite_duplicates_remain_errors(self):
        for field in ['requiredTestFiles', 'requiredPrototypeSuites']:
            b = baseline()
            b[field].append(b[field][0])
            self.reject_config(b=b)
        b = baseline()
        b['requiredPrototypeSuites'] = (b['requiredPrototypeSuites'] * 5)[:146]
        self.reject_config(b=b, code='ORIGINAL_SUITES_REQUIRED')

    def test_stronger_new_baseline_is_allowed_without_removing_old(self):
        b = baseline()
        b['requiredTestFiles'].append('apps/web/src/new-browser.test.tsx')
        b['requiredPrototypeSuites'].append('new-customer-flow')
        b['minimumCoverage'] = {'lines': 95, 'branches': 90}
        w.validate_config(policy(), b)

    def test_no_coverage_weakening_nonfinite_or_boolean(self):
        for values in [{'lines': 89, 'branches': 80}, {'lines': 90, 'branches': 79},
                       {'lines': float('nan'), 'branches': 80}, {'lines': True, 'branches': 80}]:
            b = baseline()
            b['minimumCoverage'] = values
            self.reject_config(b=b, code='COVERAGE_FLOOR_REQUIRED')

    def test_main_policy_cannot_point_to_r22_or_other_goal_package(self):
        for key, value in [('workspace', '/home/superopen/All-Projects/msf-jarvis-autonomy-r22'),
                           ('evidenceRoot', '/var/lib/jarvis-development/101/autonomy-evidence'),
                           ('goalSpecHash', 'f' * 64), ('workPackage', 'FA-02'),
                           ('sourceFingerprint', 'f' * 64)]:
            p = policy()
            p[key] = value
            self.reject_config(p=p, code='POLICY_MISMATCH')

    def test_baseline_scope_cannot_drift(self):
        for key in ['workspace', 'sourceFingerprintObserved']:
            b = baseline()
            b[key] = 'wrong'
            self.reject_config(b=b, code='BASELINE_SCOPE_MISMATCH')

    def test_missing_duplicate_checks_or_unpinned_images_fail(self):
        p = policy()
        p['expectedChecks'][-1] = p['expectedChecks'][0]
        self.reject_config(p=p, code='CHECKS_CHANGED')
        for image in [{}, {'node': 'latest'}, {**policy()['imageIds'], 'node': 'sha256:bad'}]:
            p = policy()
            p['imageIds'] = image
            self.reject_config(p=p, code='IMAGE_IDS_REQUIRED')

    def test_duplicate_json_keys_and_nan_fail(self):
        for raw in [b'{"mode":"a","mode":"b"}', b'{"price":NaN}', b'[]']:
            with self.assertRaisesRegex(ValueError, 'MAIN_ACCEPTANCE_JSON_'):
                w.decode_json(raw)

    def test_all_tool_pins_match_actual_frozen_local_bytes(self):
        def read(path, **_):
            return (SCRIPTS / Path(path).name).read_bytes()
        with patch.object(w, 'read_trusted', side_effect=read):
            bodies = w.tool_bodies()
        self.assertEqual(set(bodies), set(w.TOOL_SHA256))
        poisoned = copy.copy(bodies)
        poisoned['project-autonomy-fa01-collector.mjs'] += b'\nchanged'
        with patch.object(w, 'read_trusted', side_effect=lambda path, **_: poisoned[Path(path).name]):
            with self.assertRaisesRegex(ValueError, 'TOOL_HASH_CHANGED'):
                w.tool_bodies()

    def test_real_import_adapter_has_new_scope_and_finite_watchdog_entry(self):
        bodies = {name: (SCRIPTS / name).read_bytes() for name in w.TOOL_SHA256}
        coordinator, helper = w.adapt_tools(bodies, RUN)
        self.assertEqual(coordinator.WORKSPACE, w.WORKSPACE)
        self.assertEqual(coordinator.ROOT, Path(w.ROOT))
        self.assertEqual(coordinator.BASELINE, Path(w.BASELINE))
        self.assertEqual(coordinator.__file__, w.ENTRY)
        self.assertEqual(coordinator.load_helper(), helper)
        self.assertEqual(coordinator.REQUIRED, w.REQUIRED)
        self.assertEqual(coordinator.BROKER_ROOT, Path(w.BROKER_ROOT))

    def fake_adapter(self, before=None, copied=None):
        calls = []
        helper = SimpleNamespace(fingerprint=lambda _: {'sha256': before or w.SOURCE_SHA256},
                                 snapshot=lambda a, b: calls.append((a, b)) or {'sha256': copied or w.SOURCE_SHA256})
        coordinator = SimpleNamespace()
        with patch.object(w, 'load_python', side_effect=[coordinator, helper]):
            _, adapted = w.adapt_tools({'project-autonomy-fa01-coordinator.py': b'0', 'project-autonomy-evidence.py': b'0'}, RUN)
        return adapted, calls

    def test_snapshot_refuses_wrong_source_before_copy(self):
        helper, calls = self.fake_adapter(before='f' * 64)
        with self.assertRaisesRegex(ValueError, 'SOURCE_CHANGED'):
            helper.snapshot(w.WORKSPACE, w.ROOT + '/' + RUN + '/' + ATTEMPT + '/snapshot')
        self.assertEqual(calls, [])

    def test_source_race_in_snapshot_is_detected(self):
        helper, calls = self.fake_adapter(copied='f' * 64)
        with self.assertRaisesRegex(ValueError, 'SNAPSHOT_CHANGED'):
            helper.snapshot(w.WORKSPACE, w.ROOT + '/' + RUN + '/' + ATTEMPT + '/snapshot')
        self.assertEqual(len(calls), 1)

    def test_snapshot_cannot_copy_to_old_root_other_run_or_parent_escape(self):
        helper, calls = self.fake_adapter()
        for path in ['/var/lib/jarvis-development/101/autonomy-evidence/' + RUN + '/' + ATTEMPT + '/snapshot',
                     w.ROOT + '/' + 'c' * 40 + '/' + ATTEMPT + '/snapshot',
                     w.ROOT + '/' + RUN + '/' + ATTEMPT + '/../snapshot']:
            with self.assertRaises(ValueError):
                helper.snapshot(w.WORKSPACE, path)
        self.assertEqual(calls, [])

    def test_watchdog_requires_new_root_exact_run_resource_and_source_labels(self):
        path = w.ROOT + '/' + RUN + '/' + ATTEMPT + '/lifecycle.json'
        w.validate_watchdog(path, lifecycle())
        for key, value in [('network', 'business-network'), ('brokerScope', '/var/lib/jarvis'),
                           ('fingerprint', 'c' * 64), ('containers', ['business-server'])]:
            state = lifecycle()
            state[key] = value
            with self.assertRaisesRegex(ValueError, 'WATCHDOG_IDENTITY_INVALID'):
                w.validate_watchdog(path, state)
        for invalid in ['/etc/passwd', path.replace('main-acceptance-r26', 'autonomy-evidence'),
                        path.replace('/lifecycle.json', '/../lifecycle.json')]:
            with self.assertRaises(ValueError):
                w.validate_watchdog(invalid, lifecycle())

    def execute_mock(self, args, returncode=1, source=None, exists=False):
        calls = []
        coordinator = SimpleNamespace(run=lambda *values: calls.append(('run', values)) or returncode)
        helper = SimpleNamespace(fingerprint=lambda _: {'sha256': source or w.SOURCE_SHA256})
        def read(path, **_):
            calls.append(('read', path))
            return json.dumps(policy() if path == w.POLICY else baseline()).encode() if path in [w.POLICY, w.BASELINE] else b'entry'
        with contextlib.ExitStack() as stack:
            for name, value in [('clean_environment', lambda: None), ('__file__', w.ENTRY),
                                ('trusted', lambda *a, **k: None), ('read_trusted', read),
                                ('tool_bodies', lambda: {}), ('adapt_tools', lambda *a: (coordinator, helper))]:
                stack.enter_context(patch.object(w, name, value))
            stack.enter_context(patch.object(w.os.path, 'lexists', return_value=exists))
            stack.enter_context(patch.object(w.os, 'mkdir', side_effect=lambda *a: calls.append(('mkdir', a))))
            result = w.execute(args)
        return result, calls

    def test_fixed_binding_preserves_original_failure_without_product_pass(self):
        result, calls = self.execute_mock([w.WORKSPACE, RUN], returncode=1)
        self.assertEqual(result, 1)
        self.assertEqual(calls[-1], ('run', (w.POLICY, w.WORKSPACE, RUN, w.WORK_PACKAGE, w.GOAL_HASH)))
        self.assertEqual(calls[-2], ('mkdir', (w.ROOT + '/' + RUN, 0o700)))

    def test_wrong_args_duplicate_run_or_changed_source_do_not_dispatch(self):
        for args, opts in [([w.WORKSPACE + '-r22', RUN], {}), ([w.WORKSPACE, '../escape'], {}),
                           ([w.WORKSPACE, RUN, 'FA-02'], {}), ([w.WORKSPACE, RUN], {'exists': True}),
                           ([w.WORKSPACE, RUN], {'source': 'f' * 64})]:
            with self.assertRaises(ValueError):
                self.execute_mock(args, **opts)

    def test_arbitrary_watchdog_path_is_refused_before_read(self):
        with patch.object(w, 'clean_environment'), patch.object(w, '__file__', w.ENTRY), \
             patch.object(w, 'trusted'), patch.object(w, 'tool_bodies', return_value={}), \
             patch.object(w, 'read_trusted', side_effect=lambda path, **_: json.dumps(policy() if path == w.POLICY else baseline()).encode()) as read:
            with self.assertRaises(ValueError):
                w.execute(['--watchdog', '/etc/private-secret.json'])
            self.assertNotIn('/etc/private-secret.json', [v.args[0] for v in read.call_args_list])

    def test_root_environment_rejects_unprivileged_and_nonisolated_entry(self):
        with patch.object(w.os, 'geteuid', return_value=1000, create=True):
            with self.assertRaisesRegex(ValueError, 'ROOT_REQUIRED'):
                w.clean_environment()
        with patch.object(w.os, 'geteuid', return_value=0, create=True), patch.object(w.sys, 'flags', SimpleNamespace(isolated=0)):
            with self.assertRaisesRegex(ValueError, 'ISOLATED_PYTHON_REQUIRED'):
                w.clean_environment()

    def test_root_environment_drops_inherited_keys_and_sets_private_umask(self):
        with patch.object(w.os, 'geteuid', return_value=0, create=True), patch.object(w.sys, 'flags', SimpleNamespace(isolated=1)), \
             patch.dict(w.os.environ, {'PYTHONPATH': '/untrusted', 'LD_PRELOAD': 'bad', 'API_KEY': 'private'}, clear=True), \
             patch.object(w.os, 'umask') as umask:
            w.clean_environment()
            self.assertEqual(dict(w.os.environ), {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'HOME': '/root'})
            umask.assert_called_once_with(0o077)

    def test_private_exception_details_are_never_in_protocol(self):
        output = io.StringIO()
        with patch.object(w, 'execute', side_effect=OSError('private /etc/key value')), contextlib.redirect_stdout(output):
            self.assertEqual(w.main([]), 2)
        value = json.loads(output.getvalue())
        self.assertEqual(value, {'schemaVersion': 1, 'kind': 'project-autonomy-validation', 'status': 'fail',
                                 'simulated': False, 'errorCode': 'MAIN_ACCEPTANCE_EXECUTION_FAILED'})
        self.assertNotIn('private', output.getvalue())


if __name__ == '__main__':
    unittest.main(verbosity=2)
