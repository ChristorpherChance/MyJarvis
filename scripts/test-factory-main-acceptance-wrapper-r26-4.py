"""Local-only regression of the real terminal evidence shape and fixed tail.

No models, Docker, remote execution, service operations or main-source edits.
The real report contributes public filenames/statuses only, never assertion text.
"""
import ast
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


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


w = load('main_wrapper_r26_4', SCRIPTS / 'factory-main-acceptance-wrapper-r26-4.py')
prior = load('main_wrapper_r26_original_tests', SCRIPTS / 'test-factory-main-acceptance-wrapper-r26.py')
prior.w = w  # Reuse all 22 original policy/snapshot/watchdog tests on the new entry.
OLD_BODY = (SCRIPTS / 'project-autonomy-fa01-coordinator.py').read_bytes()
NEW_BODY = w.patched_coordinator_body(OLD_BODY)
BODIES = {name: (SCRIPTS / name).read_bytes() for name in w.TOOL_SHA256}
DIAGNOSIS = SCRIPTS.parent / 'artifacts/software-factory/acceptance-r26/main-terminal-protocol-diagnosis-r26-20261012.json'
DIAGNOSIS_SHA256 = '204fb542cf62c2755241d31d28c92b3890ccbd5fe2aad3cec15d839a5704386c'
raw = DIAGNOSIS.read_bytes()
if hashlib.sha256(raw).hexdigest() != DIAGNOSIS_SHA256:
    raise ValueError('REGRESSION_PUBLIC_FIXTURE_CHANGED')
facts = json.loads(raw)
INVENTORY = next(v['publicInventory'] for v in facts['host']['vitestFixtures'] if v['file'] == 'applicable-tests.json')
REAL_FILES = {'applicable-tests.json': INVENTORY}
for value in facts['host']['vitestFixtures']:
    if 'publicFileResults' in value:
        REAL_FILES[value['file']] = {'testResults': value['publicFileResults']}


class EvidenceFile:
    def __init__(self, owner, name):
        self.owner, self.name = owner, name

    def exists(self):
        return self.name in self.owner.files

    def read_text(self, **_):
        self.owner.reads.append(self.name)
        value = self.owner.files[self.name]
        if isinstance(value, Exception):
            raise value
        return value if isinstance(value, str) else json.dumps(value)


class Evidence:
    def __init__(self, files):
        self.files, self.reads = copy.deepcopy(files), []

    def __truediv__(self, name):
        return EvidenceFile(self, name)

    def glob(self, pattern):
        if pattern == '*.log':
            return []
        if pattern != '*-tests.json':
            raise AssertionError('Unexpected evidence selection')
        return [EvidenceFile(self, k) for k in sorted(self.files) if k.endswith('-tests.json')]


def replay_tail(body, files, initial_errors=None):
    """Execute the actual coordinator's entire terminal tail in memory.

    Its filesystem publishers are spies. It still constructs detailed-report,
    required unknown checks, protocol JSON and the actual failure return code.
    """
    module = ast.parse(body)
    run = next(v for v in module.body if isinstance(v, ast.FunctionDef) and v.name == 'run')
    index = next(i for i, v in enumerate(run.body) if isinstance(v, ast.Assign)
                 and any(isinstance(t, ast.Name) and t.id == 'stable' for t in v.targets))
    run.name, run.args = 'replay_terminal_tail', ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[])
    run.body = run.body[index:]
    tree = ast.fix_missing_locations(ast.Module(body=[run], type_ignores=[]))
    coordinator, _ = w.adapt_tools(BODIES, prior.RUN)
    writes, protocols, output = {}, [], io.StringIO()
    evidence = Evidence(files)
    before = {'sha256': w.SOURCE_SHA256, 'manifest': INVENTORY}
    environment = dict(coordinator.__dict__)
    environment.update(evidence=evidence, before=before, after=before,
                       errors=copy.deepcopy(initial_errors or []), checks=[{
                           'id': 'tests', 'required': True, 'command': '["fixed-tests"]',
                           'executed': True, 'status': 'fail', 'exitCode': 1,
                           'evidenceSha256': 'a' * 64,
                           'tests': {'total': 332, 'passed': 326, 'failed': 6, 'skipped': 0, 'unknown': 0}}],
                       private=Path('/private-regression'), workspace=w.WORKSPACE,
                       run_id=prior.RUN, attempt=prior.ATTEMPT, goal_hash=w.GOAL_HASH,
                       work_package=w.WORK_PACKAGE, expected=w.REQUIRED,
                       phase_value=None, started='2026-10-11T15:37:00Z', artifacts=[],
                       cleaned={'complete': True, 'errorCodes': [], 'businessResourcesTouched': False},
                       write_json=lambda path, value: writes.__setitem__(Path(path).name, copy.deepcopy(value)),
                       publish_file=lambda _helper, _workspace, _source, relative: {
                           'path': relative, 'sha256': 'b' * 64, 'bytes': 100},
                       helper=SimpleNamespace(publish_protocol=protocols.append),
                       digest=lambda _path: 'c' * 64)
    exec(compile(tree, w.ENTRY, 'exec'), environment)
    with contextlib.redirect_stdout(output):
        exit_code = environment['replay_terminal_tail']()
    return SimpleNamespace(exit_code=exit_code, writes=writes, protocols=protocols,
                           stdout=output.getvalue(), evidence=evidence)


class MainAcceptanceWrapperR264Tests(prior.MainAcceptanceWrapperTests):
    def fake_adapter(self, before=None, copied=None):
        calls = []
        helper = SimpleNamespace(fingerprint=lambda _: {'sha256': before or w.SOURCE_SHA256},
                                 snapshot=lambda a, b: calls.append((a, b)) or {'sha256': copied or w.SOURCE_SHA256})
        coordinator = SimpleNamespace()
        with patch.object(w, 'load_python', side_effect=[coordinator, helper]):
            _, adapted = w.adapt_tools(BODIES, prior.RUN)
        return adapted, calls

    def test_only_fixed_diagnostic_scanner_changes_original_bytes(self):
        self.assertEqual(NEW_BODY.replace(w.SUMMARY_SCAN_TO, w.SUMMARY_SCAN_FROM), OLD_BODY)
        self.assertEqual(hashlib.sha256(OLD_BODY).hexdigest(), w.TOOL_SHA256['project-autonomy-fa01-coordinator.py'])
        self.assertEqual(hashlib.sha256(NEW_BODY).hexdigest(), '276c4f8f80d6df906654df97314f913f0f168208da0dbf1d6bd8c601513041c4')
        self.assertEqual(w.ENTRY, '/usr/local/libexec/jarvis-msf-main-acceptance-r26-4')
        self.assertEqual(w.CONFIG_ROOT, '/etc/jarvis-development/main-acceptance-r26-4')
        self.assertEqual(w.ROOT, '/var/lib/jarvis-development/101/main-acceptance-r26-4')

    def test_original_real_47_inventory_reproduces_actual_attribute_error(self):
        self.assertEqual(len(INVENTORY), 47)
        self.assertEqual(facts['runId'], 'e5ca06dfe49f0e3692b90b0fa9f0120ebc58e849')
        with self.assertRaisesRegex(AttributeError, "list.*get"):
            replay_tail(OLD_BODY, REAL_FILES)

    def test_real_failed_vitest_files_produce_complete_failure_protocol(self):
        result = replay_tail(NEW_BODY, REAL_FILES, [{'id': 'coordinator', 'errorCode': 'TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE'}])
        self.assertEqual(result.exit_code, 1)
        self.assertNotIn('applicable-tests.json', result.evidence.reads)
        self.assertEqual(result.writes['failure-summary.json']['failedTestFiles'], [
            'apps/server/src/modules/executor/sandbox.integration.test.ts',
            'apps/server/src/modules/platform/storage.service.test.ts'])
        self.assertEqual(len(result.protocols), 1)
        report = json.loads(result.protocols[0])
        self.assertEqual(report, result.writes['detailed-report.json']['report'])
        self.assertEqual(report['status'], 'fail')
        self.assertEqual(report['sourceFingerprint'], w.SOURCE_SHA256)
        self.assertEqual(report['runId'], prior.RUN)
        self.assertTrue(report['sourceStable'])
        self.assertEqual(next(v['tests'] for v in report['checks'] if v['id'] == 'tests')['failed'], 6)
        self.assertEqual({v['id'] for v in report['checks']}, set(w.REQUIRED))
        self.assertEqual(next(v for v in report['checks'] if v['id'] == 'isolated-health')['status'], 'unknown')
        self.assertIn({'id': 'coordinator', 'errorCode': 'TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE'},
                      result.writes['detailed-report.json']['errorCodes'])

    def test_malformed_actual_report_cannot_suppress_failure_or_crash_tail(self):
        for invalid in [[], {}, {'testResults': {}}, {'testResults': [None]},
                        {'testResults': [{'name': 123, 'status': 'failed'}]},
                        {'testResults': [{'name': INVENTORY[0]['path']}]},
                        '{broken-json', OSError('private error text')]:
            with self.subTest(shape=type(invalid).__name__):
                result = replay_tail(NEW_BODY, {'applicable-tests.json': INVENTORY, 'apps-server-tests.json': invalid})
                self.assertEqual(result.exit_code, 1)
                self.assertEqual(json.loads(result.protocols[0])['status'], 'fail')
                self.assertIn({'id': 'failure-summary-tests', 'errorCode': 'FAILURE_TEST_REPORT_INVALID'},
                              result.writes['detailed-report.json']['errorCodes'])
                self.assertNotIn('private error text', result.stdout)

    def test_changed_original_body_and_changed_patch_target_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'COORDINATOR_HASH_CHANGED'):
            w.patched_coordinator_body(OLD_BODY + b'\n# changed')
        changed = OLD_BODY.replace(w.SUMMARY_SCAN_FROM, b'    # scanner changed\n', 1)
        with patch.dict(w.TOOL_SHA256, {'project-autonomy-fa01-coordinator.py': hashlib.sha256(changed).hexdigest()}):
            with self.assertRaisesRegex(ValueError, 'PATCH_TARGET_CHANGED'):
                w.patched_coordinator_body(changed)

    def test_added_generated_candidate_still_fails_source_consistency(self):
        coordinator, _ = w.adapt_tools(BODIES, prior.RUN)
        candidate = facts['host']['generatedCandidate']
        self.assertFalse(candidate['presentInOriginal'])
        self.assertFalse(candidate['presentInFrozenManifest'])
        self.assertTrue(candidate['matchesCurrentPrototypeSHA256'])
        old = [{'path': 'doc/msf-prototype.html', 'sha256': candidate['sha256'], 'bytes': candidate['bytes']}]
        new = old + [{'path': candidate['relativePath'], 'sha256': candidate['sha256'], 'bytes': candidate['bytes']}]
        self.assertNotEqual(coordinator.source_manifest(old), coordinator.source_manifest(new))
        with self.assertRaisesRegex(ValueError, 'TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE'):
            coordinator.need(coordinator.source_manifest(old) == coordinator.source_manifest(new),
                             'TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE')


if __name__ == '__main__':
    unittest.main(verbosity=2)
