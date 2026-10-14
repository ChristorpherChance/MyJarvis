"""New observer AST/fake-OS checks only. No Linux observation or actor creation."""
import ast
import base64
from contextlib import contextmanager
import copy
import errno
import hashlib
import json
from pathlib import Path
import re
import stat
from types import SimpleNamespace
import unittest

RAW = Path(__file__).with_name('factory-single-entry-owned-scope-observer-r33.py').read_bytes()
TREE = ast.parse(RAW)
NAMES = {'BASE', 'PROTOCOL', 'CONTROL', 'WORK', 'RAW_NAMES', 'FIXED_SOURCES', 'H', 'N', 'BOOT', 'IDENTITY_KEYS', 'SELECTED_SOURCES'}
NODES = [node for node in TREE.body if isinstance(node, ast.FunctionDef) or isinstance(node, ast.Assign)
         and any(isinstance(target, ast.Name) and target.id in NAMES for target in node.targets)]


class ForbiddenOS:
    def __getattr__(self, name):
        raise AssertionError('Unexpected runtime access: ' + name)


def definitions():
    scope = {'re': re, 'json': json, 'base64': base64, 'hashlib': hashlib, 'errno': errno,
             'stat': stat, 'Path': Path, 'contextmanager': contextmanager, 'os': ForbiddenOS(),
             'sys': SimpleNamespace(platform='controlled-not-linux')}
    exec(compile(ast.Module(body=NODES, type_ignores=[]), '<actual-owned-observer-definitions-only>', 'exec'), scope)
    return scope


def controlled_payload(scope):
    boot = '11111111-1111-1111-1111-111111111111'
    nonce = 'a' * 32
    unit = 'jarvis-single-entry-method-r33-' + nonce + '.service'
    def actor(pid, ppid):
        return {'pid': pid, 'ppid': ppid, 'startTicks': str(pid), 'boot': boot, 'procDevice': 160, 'procInode': pid + 1000}
    owner = {**actor(111, 1), 'uid': 0, 'gid': 0, 'unit': unit, 'controlGroup': '/system.slice/' + unit, 'invocationId': 'b' * 32}
    fixture = {**actor(112, 111), 'uid': 1000, 'controlGroup': owner['controlGroup'], 'argvSHA256': 'c' * 64, 'commandSHA256': 'd' * 64}
    source = {**scope['FIXED_SOURCES'], 'ownerSHA256': '1' * 64, 'starterSHA256': '2' * 64, 'sourceReviewSHA256': '3' * 64}
    pins = {name: {'sha256': '4' * 64, 'bytes': None if name.startswith('control/') or name == 'unit-proof.json' else 0}
            for name in scope['RAW_NAMES']}
    return {'schemaVersion': 1, 'kind': 'r33-single-entry-owned-scope-observation-input', 'nonce': nonce,
            'phase': 'native', 'sourceProtocol': scope['PROTOCOL'], 'owner': owner, 'fixture': fixture,
            'child': actor(113, 112), 'activationSHA256': '5' * 64, 'onceSHA256': '6' * 64,
            'unitProofSHA256': '7' * 64, 'invocationId': 'b' * 32, 'expectedRawFiles': pins, 'sourceExpected': source}


def fake_stat(inode=1111):
    return SimpleNamespace(st_dev=160, st_ino=inode, st_uid=0, st_gid=0, st_mode=stat.S_IFDIR | 0o755,
                           st_nlink=1, st_size=0, st_mtime_ns=1700000000000000001, st_ctime_ns=1700000000000000002)


class ObserverTests(unittest.TestCase):
    def test_default_and_invalid_packet_reject_before_runtime_io(self):
        scope = definitions()
        result = scope['observe_owned_scope_r33']()
        self.assertFalse(result['ready'])
        self.assertFalse(result['runtimeIOPerformed'])
        self.assertFalse(result['actualMethodSubsetSourceFactsVerified'])
        with self.assertRaisesRegex(RuntimeError, 'ACTUAL_PACKET_REQUIRED'):
            scope['observe_owned_scope_r33']({})

    def test_exact_payload_allows_unknown_control_size_not_unknown_work_size(self):
        scope = definitions()
        p = controlled_payload(scope)
        self.assertIs(scope['validate_payload'](p), p)
        for change in ('workSize', 'boolSize', 'oldSourceName', 'extraOwnerField'):
            value = copy.deepcopy(p)
            if change == 'workSize': value['expectedRawFiles']['work/owner.json']['bytes'] = None
            if change == 'boolSize': value['expectedRawFiles']['work/owner.json']['bytes'] = False
            if change == 'oldSourceName': value['sourceExpected']['generatedNativeSHA256'] = value['sourceExpected'].pop('generatedSHA256')
            if change == 'extraOwnerField': value['owner']['selfPIDFD'] = {}
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                scope['validate_payload'](value)

    def test_first_read_error_survives_nested_close_failures_and_fd_zero_is_closed(self):
        scope = definitions()
        attempted = []
        first = OSError(errno.EACCES, 'controlled-read')
        close_first = OSError(errno.EIO, 'controlled-close')
        def close(fd):
            attempted.append(fd)
            raise close_first if fd == 0 else OSError(errno.EBADF, 'controlled-other-close')
        scope['os'] = SimpleNamespace(close=close)
        with self.assertRaises(OSError) as caught:
            with scope['preserving_close']([1], 'NAMESPACE_READ'):
                with scope['preserving_close']([0], 'PROC_FILE_READ'):
                    raise first
        self.assertIs(caught.exception, first)
        self.assertEqual(attempted, [0, 1])
        projected = scope['closed_error'](first)
        self.assertEqual(projected['errno'], errno.EACCES)
        self.assertEqual(projected['readPhase'], 'PROC_FILE_READ')
        self.assertEqual([row['errno'] for row in projected['secondaryCloseFailures']], [errno.EIO, errno.EBADF])
        attempted.clear()
        with self.assertRaises(OSError) as caught:
            with scope['preserving_close']([0, 1], 'ACTOR_READ'):
                pass
        self.assertIs(caught.exception, close_first)
        self.assertEqual(attempted, [0, 1])
        self.assertEqual(caught.exception.owned_read_phase, 'ACTOR_READ_CLOSE')

    def test_current_path_absence_never_attaches_but_reuse_and_attach_failure_stay_unknown(self):
        scope = definitions()
        p = controlled_payload(scope)
        calls = []
        def missing(*_args, **_kwargs):
            raise FileNotFoundError(errno.ENOENT, 'controlled-path-absent')
        def attach(pid, *_):
            calls.append(pid)
            raise ProcessLookupError(errno.ESRCH, 'controlled-attachment-race')
        scope['os'] = SimpleNamespace(stat=missing, pidfd_open=attach)
        row = scope['actor_probe'](p['owner'], 'owner', '/controlled', p['owner']['boot'])
        self.assertTrue(row['currentPathAbsent'])
        self.assertFalse(row['historicalExitInferredFromAbsence'])
        self.assertEqual(calls, [])
        with self.assertRaisesRegex(RuntimeError, 'ABSENCE_UNKNOWN'):
            scope['actor_probe'](p['owner'], 'owner', '/controlled', '0' * 36)
        scope['os'].stat = lambda *_a, **_k: fake_stat(9999)
        with self.assertRaisesRegex(RuntimeError, 'PID_REUSED'):
            scope['actor_probe'](p['owner'], 'owner', '/controlled', p['owner']['boot'])
        self.assertEqual(calls, [])
        scope['os'].stat = lambda *_a, **_k: fake_stat(p['owner']['procInode'])
        with self.assertRaises(ProcessLookupError):
            scope['actor_probe'](p['owner'], 'owner', '/controlled', p['owner']['boot'])
        self.assertEqual(calls, [111])

    def test_cgroup_missing_trusted_ancestor_is_not_missing_unit_leaf(self):
        scope = definitions()
        group = controlled_payload(scope)['owner']['controlGroup']
        def absent_parent(_): raise FileNotFoundError(errno.ENOENT, 'controlled-missing-ancestor')
        scope['anchored_directory'] = absent_parent
        with self.assertRaises(FileNotFoundError): scope['cgroup_frame'](group)
        seen = []
        scope['anchored_directory'] = lambda path: seen.append(path) or 0
        def missing_leaf(*_a, **_k): raise FileNotFoundError(errno.ENOENT, 'controlled-missing-unit')
        scope['os'] = SimpleNamespace(stat=missing_leaf, fstat=lambda _: fake_stat(), close=lambda fd: seen.append(fd))
        frame = scope['cgroup_frame'](group)
        self.assertTrue(frame['absent'])
        self.assertTrue(frame['complete'])
        self.assertEqual(seen, ['/sys/fs/cgroup/system.slice', 0])

    def test_loaded_unit_must_keep_exact_invocation_and_notfound_must_be_default_empty(self):
        scope = definitions()
        p = controlled_payload(scope)
        unit = p['owner']['unit']
        props = {'Id': unit, 'LoadState': 'loaded', 'ActiveState': 'failed', 'SubState': 'failed', 'MainPID': '0',
                 'ControlGroup': p['owner']['controlGroup'], 'InvocationID': p['invocationId'], 'Result': 'exit-code',
                 'ExecMainCode': '1', 'ExecMainStatus': '1'}
        scope['subprocess'] = SimpleNamespace(run=lambda *_a, **_k: SimpleNamespace(returncode=0,
            stdout='\n'.join(k + '=' + v for k, v in props.items()).encode()))
        self.assertTrue(scope['unit_frame'](unit, p['invocationId'])['currentStopped'])
        props['InvocationID'] = 'f' * 32
        with self.assertRaisesRegex(RuntimeError, 'INVOCATION_CHANGED'):
            scope['unit_frame'](unit, p['invocationId'])
        props.update(LoadState='not-found', ActiveState='inactive', SubState='dead', ControlGroup='', InvocationID='',
                     Result='success', ExecMainCode='0', ExecMainStatus='0')
        self.assertTrue(scope['unit_frame'](unit, p['invocationId'])['currentStopped'])
        props['MainPID'] = '111'
        with self.assertRaisesRegex(RuntimeError, 'DEFAULTS_CHANGED'):
            scope['unit_frame'](unit, p['invocationId'])

    def test_original_integer_json_and_two_typed_pidfd_chains_are_not_boolean_claims(self):
        scope = definitions()
        p = controlled_payload(scope)
        huge = 1700000000000000001
        raw = json.dumps({'metadata': [huge]}).encode()
        value = scope['raw_json']({'row': {'base64': base64.b64encode(raw).decode()}}, 'row')
        self.assertEqual(value['metadata'][0], huge)
        self.assertFalse(scope['same_json'](value, {'metadata': [huge + 1]}))
        self.assertFalse(scope['same_json']({'fact': True}, {'fact': 1}))
        with self.assertRaisesRegex(RuntimeError, 'DUPLICATE_JSON_KEY'):
            scope['raw_json']({'row': {'base64': base64.b64encode(b'{"fact":1,"fact":2}').decode()}}, 'row')
        owner = {**p['owner'], 'selfPIDFD': {'requestedPID': 111, 'attached': True, 'identityBound': True,
                  'livePollEvents': 0, 'fdIdentity': [1, 2, 0, 0, 0, 1, 0, huge, huge + 1]}}
        child = p['child']
        method = {'schemaVersion': 1, 'fixtureQualified': True, 'source': {'phase': 'native',
            'generatedSourceSHA256': scope['FIXED_SOURCES']['generatedSHA256'], 'generatorSHA256': scope['FIXED_SOURCES']['generatorSHA256'],
            'pureModuleSHA256': scope['FIXED_SOURCES']['moduleSHA256'], 'selectedSourceSHA256': scope['SELECTED_SOURCES'],
            'wholeProgramTopLevelExecuted': False, 'censusDefinitionLoaded': False, 'actualSourceMappingQualified': False},
            'runtime': {'realEffectiveSavedUID': [1000] * 3, 'realEffectiveSavedGID': [1000] * 3, 'noNewPrivileges': 1,
                'isolatedPython': True, 'rootOwnerProfileAsserted': False, 'cgroups': [p['owner']['controlGroup']],
                'capabilities': dict.fromkeys(['CapEff', 'CapPrm', 'CapInh'], '0'), 'fixtureIdentity': p['fixture']},
            'childIdentity': child, 'requestedChildPID': 113, 'liveRecord': {**child, 'uid': 1000, 'state': 'S', 'cgroups': [p['owner']['controlGroup']]},
            'originalBoundExitProof': {'pid': 113, 'boot': child['boot'], 'processIdentity': child,
                'listedProcIdentity': {'device': child['procDevice'], 'inode': child['procInode']}, 'kernelProof': {
                'type': 'pidfd-POLLIN', 'requestedPID': 113, 'pollEvents': 1, 'attached': True, 'identityBound': True,
                'exitConfirmed': True, 'procPathAbsent': True}},
            'readyProtocolSHA256': 'b7648b15b26e79747f5dd39557acde5a710b8efd9b7e4172eee10de00dbaa408',
            **dict.fromkeys(['methodSubsetExercised', 'readyHandshakeCompleted', 'releaseGateSent', 'naturalChildExit', 'childReaped', 'descriptorClosed'], True),
            'signalsSent': False, 'firstFailure': None, 'secondaryFailures': [], 'fixturePhase': 'COMPLETE', 'childExitCode': 0,
            'descriptorLedger': [{'sequence': 0, 'fd': 0, 'closeAttempted': True, 'closed': True, 'closeError': None}],
            'selfAcquisition': {'numericPIDPathUsed': True, 'eofObserved': True, 'adapterMatchedPrimitiveWithoutDotEntries': True,
                'adapterBorrowedFDStayedOpen': True, 'primitiveRecords': [], 'primitiveCallsIncludingEOF': 1},
            'childFDAcquisition': {'borrowedFDStayedOpen': True, 'getfdUsed': False, 'knownPipeSlots': {'1': {'matched': True}, '2': {'matched': True}}}}
        result = {'fixtureKernelExitProof': {'type': 'parent-owned-fixture-pidfd-POLLIN', 'requestedPID': 112,
            'processIdentity': p['fixture'], 'pollEvents': 17, 'attached': True, 'identityBound': True, 'exitConfirmed': True, 'procPathAbsent': True},
            'fixturePIDFDClosed': True, 'ownerSelfPIDFDClosed': True, 'emergencyStopAttempted': False, 'fixtureExitCode': 0,
            'requestedFixturePID': 112, 'firstFailure': None, 'secondaryFailures': [], 'methodSubsetProducerPassed': True}
        stopped = {'serviceResult': 'success', 'exitCode': 'exited', 'exitStatus': '0'}
        self.assertTrue(scope['verify_original_kernel_facts'](p, owner, p['fixture'], method, result, stopped))
        result['fixtureKernelExitProof']['pollEvents'] = True
        with self.assertRaisesRegex(RuntimeError, 'PARENT_EXIT_PROOF_CHANGED'):
            scope['verify_original_kernel_facts'](p, owner, p['fixture'], method, result, stopped)
        method['fixtureQualified'] = False
        self.assertFalse(scope['verify_original_kernel_facts'](p, owner, p['fixture'], method, result, stopped))


if __name__ == '__main__':
    unittest.main(verbosity=2)
