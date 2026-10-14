"""Two new failure-only AST/data checks; no real unit, cgroup or actor access."""
import ast
import base64
from contextlib import contextmanager
import copy
import hashlib
import json
from pathlib import Path
import re
import stat
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).with_name('factory-single-entry-failure-unit-scope-observer-r33.py').read_bytes()
TREE = ast.parse(SOURCE)
CONSTANTS = {'BASE', 'NONCE', 'PROTOCOL', 'INVOCATION', 'DEPENDENCY_SHA256', 'CONTROL', 'WORK', 'EXPECTED_RAW_FILES', 'ACTUAL_REFS', 'H'}
NODES = [n for n in TREE.body if isinstance(n, ast.FunctionDef) or isinstance(n, ast.Assign)
         and any(isinstance(t, ast.Name) and t.id in CONSTANTS for t in n.targets)]


class ForbiddenOS:
    def __getattr__(self, name):
        raise AssertionError('Unexpected actual OS access: ' + name)


def definitions():
    scope = {'base64': base64, 'contextmanager': contextmanager, 'hashlib': hashlib, 'json': json,
             'Path': Path, 're': re, 'stat': stat, 'os': ForbiddenOS(),
             'sys': SimpleNamespace(platform='controlled-not-linux')}
    exec(compile(ast.Module(body=NODES, type_ignores=[]), '<new-failure-only-observer-definitions>', 'exec'), scope)
    return scope


def controlled_payload(scope):
    return {'schemaVersion': 1, 'kind': 'r33-single-entry-failure-unit-cgroup-observation-input',
            'nonce': scope['NONCE'], 'sourceProtocol': scope['PROTOCOL'], 'invocationId': scope['INVOCATION'],
            'readerReview': {'path': 'artifacts/software-factory/goals-r29/r33-single-entry-failed-unit-scope-independent-local-review-1111111111111-11111111-1111-1111-1111-111111111111.json', 'sha256': '1' * 64},
            'actualRefs': copy.deepcopy(scope['ACTUAL_REFS']), 'expectedRawFiles': copy.deepcopy(scope['EXPECTED_RAW_FILES'])}


def saved_original_rows():
    path = Path('.jarvis-dev/maintenance/r33-single-entry-method-transport-1791882974219-c1d2e582-100e-4f29-86de-378772841eed.json')
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == '5c0960ab3ed110748d78a122c460a41998942cbc717fb41b2ef54c0d5374b05a'
    frame = json.loads(base64.b64decode(json.loads(raw)['stdoutBase64'], validate=True))
    return frame['rawReports']


def fake_stat(fd):
    modes = {0: 0o711, 1: 0o555, 2: 0o700}
    return SimpleNamespace(st_dev=1, st_ino=100 + fd, st_uid=0, st_gid=0, st_mode=stat.S_IFDIR | modes[fd],
                           st_nlink=2, st_size=0, st_mtime_ns=1700000000000000001, st_ctime_ns=1700000000000000002)


class FailureUnitScopeTests(unittest.TestCase):
    def test_default_missing_review_refs_and_extra_actor_scope_reject_before_os(self):
        scope = definitions()
        result = scope['observe_failed_unit_scope_r33']()
        self.assertFalse(result['runtimeIOPerformed'])
        self.assertFalse(result['currentFailureUnitAndCgroupScopeClosedVerified'])
        self.assertTrue(result['unknownOriginalActorIdentitiesPreserved'])
        p = controlled_payload(scope)
        self.assertIs(scope['validate_failure_payload'](p), p)
        for change in ('missingReview', 'missingRefs', 'alterNonce', 'alterRecordSize', 'extraActor'):
            value = copy.deepcopy(p)
            if change == 'missingReview': value['readerReview'] = None
            if change == 'missingRefs': value['actualRefs'] = None
            if change == 'alterNonce': value['nonce'] = 'a' * 32
            if change == 'alterRecordSize': value['expectedRawFiles']['unit-proof.json']['bytes'] = 0
            if change == 'extraActor': value['ownerPID'] = 1
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                scope['observe_failed_unit_scope_r33'](value)

    def test_six_original_raw_chain_empty_work_and_controlled_current_unit_cgroup_only(self):
        scope = definitions()
        raw_rows = saved_original_rows()
        self.assertTrue(scope['verify_failure_records'](raw_rows))
        attempted = []
        work_names = []
        scope['anchored_directory'] = lambda _path: 0
        scope['held_file'] = lambda _fd, name, _mode: (base64.b64decode(raw_rows['unit-proof.json' if name == 'unit-proof.json' else 'control/' + name]['base64']),
                    [1, 1000, 0, 0, stat.S_IFREG | 0o444, 1, 0, 1700000000000000001, 1700000000000000002])
        scope['os'] = SimpleNamespace(O_RDONLY=0, O_DIRECTORY=0, O_NOFOLLOW=0, O_CLOEXEC=0,
             getresuid=lambda: (0, 0, 0), getresgid=lambda: (0, 0, 0),
             fstat=fake_stat, stat=lambda name, **_kwargs: fake_stat(1 if name == 'control' else 2),
             open=lambda name, *_args, **_kwargs: 1 if name == 'control' else 2,
             listdir=lambda fd: ['control', 'work', 'unit-proof.json'] if fd == 0 else list(scope['CONTROL']) if fd == 1 else work_names,
             close=lambda fd: attempted.append(fd))
        output = {}
        first = scope['failure_namespace_read'](output)
        self.assertEqual(set(output), set(scope['EXPECTED_RAW_FILES']))
        self.assertEqual(first['missingWorkNames'], list(scope['WORK']))
        self.assertIn(0, attempted)
        work_names.append('owner.json')
        with self.assertRaisesRegex(RuntimeError, 'WORK_OR_CONTROL_SET_CHANGED'):
            scope['failure_namespace_read']({})
        work_names.clear()
        unit = 'jarvis-single-entry-method-r33-' + scope['NONCE'] + '.service'
        scope['unit_frame'] = lambda *_: {'complete': True, 'currentStopped': True, 'properties': {
            'Id': unit, 'LoadState': 'loaded', 'ActiveState': 'failed', 'MainPID': '0', 'ControlGroup': '', 'InvocationID': scope['INVOCATION']}}
        scope['cgroup_frame'] = lambda *_: {'absent': True, 'members': [], 'complete': True}
        scope['sys'] = SimpleNamespace(platform='linux')  # Controlled OS, never a Linux claim.
        value = scope['observe_failed_unit_scope_r33'](controlled_payload(scope))
        self.assertTrue(value['currentFailureUnitAndCgroupScopeClosedVerified'])
        self.assertEqual(len(value['physicalFrames']), 2)
        self.assertFalse(value['actualMethodSubsetIndependentlyQualified'])
        self.assertFalse(value['currentOwnedScopeCleanupVerified'])
        self.assertFalse(value['wholeProcCensusExecuted'])
        self.assertFalse(value['fullProtectionQualified'])
        self.assertIsNone(value['ownerIdentity'])
        scope['cgroup_frame'] = lambda *_: {'absent': False, 'members': [999], 'complete': True}
        value = scope['observe_failed_unit_scope_r33'](controlled_payload(scope))
        self.assertFalse(value['currentFailureUnitAndCgroupScopeClosedVerified'])
        self.assertFalse(value['ready'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
