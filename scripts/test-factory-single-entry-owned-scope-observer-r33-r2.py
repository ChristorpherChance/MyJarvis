"""Two new R2 stderr/scope AST checks. No real Linux, actor or old suite execution."""
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

SOURCE = Path(__file__).with_name('factory-single-entry-owned-scope-observer-r33-r2.py').read_bytes()
TREE = ast.parse(SOURCE)
CONSTANTS = {'BASE', 'PROTOCOL', 'CONTROL', 'WORK', 'RAW_NAMES', 'FIXED_SOURCES', 'H', 'N', 'BOOT', 'IDENTITY_KEYS', 'SELECTED_SOURCES'}
NODES = [n for n in TREE.body if isinstance(n, ast.FunctionDef) or isinstance(n, ast.Assign)
         and any(isinstance(t, ast.Name) and t.id in CONSTANTS for t in n.targets)]


class ForbiddenOS:
    def __getattr__(self, name):
        raise AssertionError('Unexpected OS access: ' + name)


def definitions():
    scope = {'re': re, 'json': json, 'base64': base64, 'hashlib': hashlib, 'Path': Path, 'stat': stat,
             'contextmanager': contextmanager, 'os': ForbiddenOS(), 'sys': SimpleNamespace(platform='controlled-only')}
    exec(compile(ast.Module(body=NODES, type_ignores=[]), '<actual-r2-observer-definition-nodes>', 'exec'), scope)
    return scope


def sample(scope, raw=b''):
    nonce = 'a' * 32
    unit = 'jarvis-single-entry-method-r33-r2-' + nonce + '.service'
    group = '/system.slice/' + unit
    boot = '11111111-1111-1111-1111-111111111111'
    def core(pid, ppid): return {'pid': pid, 'ppid': ppid, 'boot': boot, 'startTicks': str(pid), 'procDevice': 160, 'procInode': 1000 + pid}
    p = {'nonce': nonce, 'invocationId': 'b' * 32, 'activationSHA256': '4' * 64, 'onceSHA256': '5' * 64,
         'unitProofSHA256': '6' * 64, 'sourceExpected': {**scope['FIXED_SOURCES'], 'ownerSHA256': '1' * 64,
         'starterSHA256': '2' * 64, 'sourceReviewSHA256': '3' * 64},
         'owner': {**core(111, 1), 'uid': 0, 'gid': 0, 'unit': unit, 'controlGroup': group, 'invocationId': 'b' * 32},
         'fixture': {**core(112, 111), 'uid': 1000, 'controlGroup': group}, 'child': core(113, 112)}
    initial = [1, 2, 0, 0, stat.S_IFREG | 0o600, 1, 0, 1700000000000000001, 1700000000000000002]
    row = {'base64': base64.b64encode(raw).decode(), 'sha256': scope['digest'](raw), 'bytes': len(raw),
           'metadata': initial[:6] + [len(raw)] + initial[7:]}
    p['expectedRawFiles'] = {'work/owner.stderr.raw': {'sha256': row['sha256'], 'bytes': row['bytes']}}
    proof = {'ownerStderrInitialIdentity': initial, 'ownerStderrInitialIdentitySHA256': scope['digest'](scope['canonical'](initial)),
             'configuration': {'standardOutput': 'null', 'standardError': 'append',
             'standardErrorFile': scope['BASE'] + '/' + nonce + '/work/owner.stderr.raw'}}
    return p, {'work/owner.stderr.raw': row}, proof


class R2ObserverTests(unittest.TestCase):
    def test_thirteen_rows_default_zero_io_and_original_stderr_inode_not_recreated(self):
        scope = definitions()
        self.assertEqual(len(scope['RAW_NAMES']), 13)
        result = scope['observe_owned_scope_r33_r2']()
        self.assertFalse(result['runtimeIOPerformed'])
        self.assertFalse(result['actualMethodSubsetSourceFactsVerified'])
        p, rows, proof = sample(scope)
        self.assertEqual(scope['verify_r2_stderr_binding'](p, rows, proof)['bytes'], 0)
        for change in ('inode', 'initialHash', 'oldDestination', 'boolMetadata'):
            changed_rows, changed_proof = copy.deepcopy(rows), copy.deepcopy(proof)
            if change == 'inode': changed_rows['work/owner.stderr.raw']['metadata'][1] += 1
            if change == 'initialHash': changed_proof['ownerStderrInitialIdentitySHA256'] = '0' * 64
            if change == 'oldDestination': changed_proof['configuration']['standardErrorFile'] = '/old/owner.stderr.raw'
            if change == 'boolMetadata': changed_proof['ownerStderrInitialIdentity'][2] = False
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                scope['verify_r2_stderr_binding'](p, changed_rows, changed_proof)

    def test_nonempty_root_stderr_blocks_claimed_success_before_original_kernel_validator(self):
        scope = definitions()
        p, rows, proof = sample(scope, b'controlled early failure')
        sources = p['sourceExpected'];unit = p['owner']['unit']
        common = {'schemaVersion': 1, 'nonce': p['nonce'], 'phase': 'native', 'sourceProtocol': scope['PROTOCOL'],
                  'ownerSHA256': sources['ownerSHA256'], 'fixtureSHA256': sources['fixtureSHA256'],
                  'generatedSHA256': sources['generatedSHA256'], 'buildStaticMappingSHA256': sources['buildStaticMappingSHA256'],
                  'fixtureWorkSeconds': 45, 'runtimeMaxSec': 80, 'timeoutStopSec': 10, 'hardParentBoundSeconds': 90}
        activation = {**common, 'kind': 'r33-single-entry-method-root-activation-r2', 'parentReview': {'sha256': sources['sourceReviewSHA256']}}
        once = {**common, 'kind': 'r33-single-entry-method-root-once-r2', 'unit': unit, 'activationSHA256': p['activationSHA256']}
        owner = {**p['owner'], 'ownerSHA256': sources['ownerSHA256'], 'fixtureSHA256': sources['fixtureSHA256'],
                 'generatedSHA256': sources['generatedSHA256'], 'activationSHA256': p['activationSHA256'], 'onceSHA256': p['onceSHA256'],
                 'profile': {'realEffectiveSavedUID': [0, 0, 0], 'realEffectiveSavedGID': [0, 0, 0], 'noNewPrivileges': 1,
                 'rootCapabilitiesAreZero': False, 'capabilities': {'CapEff': 'e2', 'CapPrm': 'e2', 'CapInh': '0', 'CapAmb': '0'}}}
        method = {'kind': 'r33-single-entry-bound-method-fixture-result', 'phase': 'native', 'childIdentity': p['child'], 'fixtureQualified': True}
        rows.update({name: {'sha256': value} for name, value in {'control/owner.py': sources['ownerSHA256'], 'control/fixture.py': sources['fixtureSHA256'],
            'control/generated.py': sources['generatedSHA256'], 'control/activation.json': p['activationSHA256'], 'control/once.json': p['onceSHA256'],
            'work/fixture.stdout.json': '7' * 64, 'work/fixture.stderr.raw': '8' * 64}.items()})
        result = {'kind': 'r33-single-entry-method-owner-result-r2', 'nonce': p['nonce'], 'phase': 'native', 'sourceProtocol': scope['PROTOCOL'],
                  'owner': owner, 'fixtureProcessIdentity': p['fixture'], 'fixtureResult': method,
                  'fixtureStdoutSHA256': '7' * 64, 'fixtureStderrSHA256': '8' * 64, 'methodSubsetProducerPassed': True}
        proof.update(kind='r33-single-entry-method-root-unit-proof-r2', nonce=p['nonce'], unit=unit, invocationId=p['invocationId'],
                     ownerSHA256=sources['ownerSHA256'], activationSHA256=p['activationSHA256'], onceSHA256=p['onceSHA256'])
        proof['configuration'].update(rootUID=0, rootGID=0, rootCapabilityMask=226, fixtureUID=1000, fixtureGID=1000,
             noNewPrivileges=True, ambientCapabilitiesEmpty=True, privateNetwork=True, runtimeMaxSec=80, timeoutStopSec=10,
             totalParentSeconds=90, killMode='control-group', killSignal='SIGKILL', restart='no')
        for action, key in [('--run', 'execStartSHA256'), ('--stopped', 'execStopPostSHA256')]:
            proof['configuration'][key] = scope['digest'](json.dumps(['/usr/bin/python3', '-I', scope['BASE'] + '/' + p['nonce'] + '/control/owner.py', action, p['nonce']], separators=(',', ':')).encode())
        docs = {'control/activation.json': activation, 'control/once.json': once, 'work/owner.json': owner,
                'work/fixture-process.json': p['fixture'], 'work/fixture.stdout.json': method, 'work/result.json': result,
                'unit-proof.json': proof, 'work/stopped.json': {'kind': 'r33-single-entry-method-owner-stopped-r2', 'nonce': p['nonce'],
                'unit': unit, 'invocationId': p['invocationId'], 'ownerSHA256': sources['ownerSHA256'], 'activationSHA256': p['activationSHA256']}}
        scope['raw_json'] = lambda _rows, name: docs[name]  # Controlled already-decoded data only.
        def forbidden_kernel(*_): raise AssertionError('Nonempty stderr must block before method success validator')
        scope['verify_original_kernel_facts'] = forbidden_kernel
        facts = scope['verify_raw_chain'](p, rows)
        self.assertFalse(facts['originalKernelFactsVerified'])
        self.assertFalse(facts['ownerStderrEmpty'])
        self.assertFalse(facts['actualMethodSubsetSourceFactsVerified'])
        self.assertEqual(facts['kernelFactsError']['errorCode'], 'R33_OWNED_R2_OWNER_STDERR_NOT_EMPTY')


if __name__ == '__main__':
    unittest.main(verbosity=2)
