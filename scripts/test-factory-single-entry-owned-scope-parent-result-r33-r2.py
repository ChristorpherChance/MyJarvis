"""One new original-JSON parent gate case; no old tests, Linux or actors."""
import importlib.util
import json
from pathlib import Path
import unittest


HELPER = Path(__file__).with_name('test-factory-single-entry-owned-scope-observer-r33-r2.py')
spec = importlib.util.spec_from_file_location('controlled_r2_data_only', HELPER)
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)  # Definitions and controlled data only; unittest main is guarded.


class ParentResultGateTests(unittest.TestCase):
    def test_raw_false_parent_result_blocks_fixture_true_before_kernel_poison(self):
        scope = data.definitions()
        p, rows, proof = data.sample(scope)
        sources, unit = p['sourceExpected'], p['owner']['unit']

        def row(value):
            raw = json.dumps(value, separators=(',', ':')).encode()
            return {'base64': data.base64.b64encode(raw).decode(), 'bytes': len(raw), 'sha256': scope['digest'](raw)}

        common = {'schemaVersion': 1, 'nonce': p['nonce'], 'phase': 'native', 'sourceProtocol': scope['PROTOCOL'],
                  'ownerSHA256': sources['ownerSHA256'], 'fixtureSHA256': sources['fixtureSHA256'],
                  'generatedSHA256': sources['generatedSHA256'], 'buildStaticMappingSHA256': sources['buildStaticMappingSHA256'],
                  'fixtureWorkSeconds': 45, 'runtimeMaxSec': 80, 'timeoutStopSec': 10, 'hardParentBoundSeconds': 90}
        activation = {**common, 'kind': 'r33-single-entry-method-root-activation-r2',
                      'parentReview': {'sha256': sources['sourceReviewSHA256']}}
        rows['control/activation.json'] = row(activation)
        p['activationSHA256'] = rows['control/activation.json']['sha256']
        once = {**common, 'kind': 'r33-single-entry-method-root-once-r2', 'unit': unit, 'activationSHA256': p['activationSHA256']}
        rows['control/once.json'] = row(once)
        p['onceSHA256'] = rows['control/once.json']['sha256']
        owner = {**p['owner'], 'ownerSHA256': sources['ownerSHA256'], 'fixtureSHA256': sources['fixtureSHA256'],
                 'generatedSHA256': sources['generatedSHA256'], 'activationSHA256': p['activationSHA256'], 'onceSHA256': p['onceSHA256'],
                 'profile': {'realEffectiveSavedUID': [0, 0, 0], 'realEffectiveSavedGID': [0, 0, 0], 'noNewPrivileges': 1,
                 'rootCapabilitiesAreZero': False, 'capabilities': {'CapEff': 'e2', 'CapPrm': 'e2', 'CapInh': '0', 'CapAmb': '0'}}}
        method = {'kind': 'r33-single-entry-bound-method-fixture-result', 'phase': 'native',
                  'childIdentity': p['child'], 'fixtureQualified': True}
        rows['work/fixture.stdout.json'] = row(method)
        rows['work/fixture.stderr.raw'] = {'base64': '', 'bytes': 0, 'sha256': scope['digest'](b'')}
        result = {'kind': 'r33-single-entry-method-owner-result-r2', 'nonce': p['nonce'], 'phase': 'native',
                  'sourceProtocol': scope['PROTOCOL'], 'owner': owner, 'fixtureProcessIdentity': p['fixture'], 'fixtureResult': method,
                  'fixtureStdoutSHA256': rows['work/fixture.stdout.json']['sha256'],
                  'fixtureStderrSHA256': rows['work/fixture.stderr.raw']['sha256'], 'methodSubsetProducerPassed': False}
        proof.update(kind='r33-single-entry-method-root-unit-proof-r2', nonce=p['nonce'], unit=unit,
                     invocationId=p['invocationId'], ownerSHA256=sources['ownerSHA256'],
                     activationSHA256=p['activationSHA256'], onceSHA256=p['onceSHA256'])
        proof['configuration'].update(rootUID=0, rootGID=0, rootCapabilityMask=226, fixtureUID=1000, fixtureGID=1000,
             noNewPrivileges=True, ambientCapabilitiesEmpty=True, privateNetwork=True, runtimeMaxSec=80, timeoutStopSec=10,
             totalParentSeconds=90, killMode='control-group', killSignal='SIGKILL', restart='no')
        for action, field in [('--run', 'execStartSHA256'), ('--stopped', 'execStopPostSHA256')]:
            proof['configuration'][field] = scope['digest'](json.dumps(['/usr/bin/python3', '-I', scope['BASE'] + '/' + p['nonce'] + '/control/owner.py',
                 action, p['nonce']], separators=(',', ':')).encode())
        docs = {'work/owner.json': owner, 'work/fixture-process.json': p['fixture'], 'work/result.json': result,
                'unit-proof.json': proof, 'work/stopped.json': {'kind': 'r33-single-entry-method-owner-stopped-r2',
                'nonce': p['nonce'], 'unit': unit, 'invocationId': p['invocationId'], 'ownerSHA256': sources['ownerSHA256'],
                'activationSHA256': p['activationSHA256'], 'serviceResult': 'success'}}
        rows.update({name: row(value) for name, value in docs.items()})
        rows.update({'control/' + name: {'sha256': sources[field]} for name, field in
                     [('owner.py', 'ownerSHA256'), ('fixture.py', 'fixtureSHA256'), ('generated.py', 'generatedSHA256')]})
        self.assertIs(scope['raw_json'](rows, 'work/result.json')['methodSubsetProducerPassed'], False)
        self.assertIs(scope['raw_json'](rows, 'work/fixture.stdout.json')['fixtureQualified'], True)
        called = []

        def poisoned_kernel(*_):
            called.append(True)
            return True  # Would turn the old unguarded parent-false branch green.

        scope['verify_original_kernel_facts'] = poisoned_kernel
        facts = scope['verify_raw_chain'](p, rows)
        self.assertEqual(called, [])
        self.assertFalse(facts['originalKernelFactsVerified'])
        self.assertFalse(facts['methodSubsetProducerPassed'])
        self.assertFalse(facts['actualMethodSubsetSourceFactsVerified'])
        self.assertTrue(facts['ownerStderrEmpty'])
        self.assertEqual(facts['kernelFactsError']['errorCode'], 'R33_OWNED_R2_PARENT_METHOD_NOT_PASSED')


if __name__ == '__main__':
    unittest.main(verbosity=2)
