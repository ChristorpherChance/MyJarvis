"""Two actual-definition diagnostic guards, controlled only; no Linux/old tests."""
import ast
import base64
import copy
from contextlib import contextmanager
import errno
import hashlib
import json
from pathlib import Path
import re
import stat
from types import SimpleNamespace
import unittest

RAW = Path(__file__).with_name('factory-single-entry-unit-config-diagnostic-r33-r2.py').read_bytes()
TREE = ast.parse(RAW)
CONSTANTS = {'BASE','NONCE','PROTOCOL','CONTROL','WORK','EXPECTED_CONTROL5','ACTUAL_REFS','UNIT_PROPERTIES','H'}
NODES = [n for n in TREE.body if isinstance(n, ast.FunctionDef) or isinstance(n, ast.Assign)
         and any(isinstance(t, ast.Name) and t.id in CONSTANTS for t in n.targets)]


class ForbiddenOS:
    def __getattr__(self, name):
        raise AssertionError('Unexpected OS access: ' + name)


def definitions():
    scope = {'re':re,'base64':base64,'json':json,'hashlib':hashlib,'contextmanager':contextmanager,
             'Path':Path,'stat':stat,'errno':errno,'os':ForbiddenOS(),'sys':SimpleNamespace(platform='controlled-only')}
    exec(compile(ast.Module(body=NODES,type_ignores=[]), '<actual-unit-diagnostic-asts>', 'exec'), scope)
    return scope


def packet(s):
    return {'schemaVersion':1,'kind':'r33-single-entry-unit-config-diagnostic-input-r2','nonce':s['NONCE'],
            'sourceProtocol':s['PROTOCOL'],'readerReview':{'path':'artifacts/software-factory/goals-r29/r33-single-entry-unit-config-diagnostic-independent-local-review-r2-1791880000000-11111111-1111-1111-1111-111111111111.json','sha256':'a'*64},
            'actualRefs':copy.deepcopy(s['ACTUAL_REFS']),'expectedControl5':copy.deepcopy(s['EXPECTED_CONTROL5'])}


class DiagnosticTests(unittest.TestCase):
    def test_default_and_exact_original_source_context_reject_before_os(self):
        s = definitions()
        value = s['observe_single_entry_unit_config_r33_r2']()
        self.assertFalse(value['runtimeIOPerformed'])
        self.assertFalse(value['ready'])
        self.assertFalse(value['currentFailureUnitAndCgroupScopeClosedVerified'])
        self.assertFalse(value['actorProbeExecuted'])
        self.assertEqual(s['validate_diagnostic_payload'](packet(s)), packet(s))
        for change in ['reviewMissing','nonceChanged','originalSourceChanged','refChanged']:
            p = packet(s)
            if change == 'reviewMissing': p['readerReview'] = None
            if change == 'nonceChanged': p['nonce'] = '0'*32
            if change == 'originalSourceChanged': p['expectedControl5']['activation.json']['sha256'] = '0'*64
            if change == 'refChanged': p['actualRefs']['journal']['sha256'] = '0'*64
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                s['observe_single_entry_unit_config_r33_r2'](p)

    def test_systemd_original_properties_preserved_and_incomplete_not_absence(self):
        s = definitions()
        props = dict.fromkeys(s['UNIT_PROPERTIES'], '')
        props.update(Id='jarvis-single-entry-method-r33-r2-'+s['NONCE']+'.service', LoadState='loaded',
                     ActiveState='failed',MainPID='0',InvocationID='b'*32,
                     StandardOutput='null',StandardError='file',StandardErrorFile='/controlled/original-sink')
        original = ('\n'.join(k+'='+props[k] for k in s['UNIT_PROPERTIES'])+'\n').encode()
        calls = []
        def run(argv, **kwargs):
            calls.append((argv,kwargs))
            return SimpleNamespace(returncode=0, stdout=run.raw, stderr=b'')
        run.raw = original
        s['subprocess'] = SimpleNamespace(run=run)
        responses = []
        frame = s['diagnostic_unit_frame'](responses)
        self.assertEqual(frame['properties'],props)
        self.assertEqual(frame['properties']['StandardError'],'file')
        self.assertFalse(frame['historicalInvocationIdRecorded'])
        self.assertEqual(frame['observedInvocationId'],'b'*32)
        self.assertEqual(base64.b64decode(responses[0]['stdoutBase64']),original)
        self.assertEqual(responses[0]['stdoutSHA256'],hashlib.sha256(original).hexdigest())
        self.assertEqual(calls[0][0][:3],['/usr/bin/systemctl','show',props['Id']])
        for changed in [original+b'StandardError=append\n', original.replace(('Id='+props['Id']+'\n').encode(),b'')]:
            run.raw = changed
            rows = []
            with self.assertRaises(RuntimeError): s['diagnostic_unit_frame'](rows)
            self.assertEqual(base64.b64decode(rows[0]['stdoutBase64']),changed)
        run.raw = original.replace(b'StandardErrorFile=/controlled/original-sink\n',b'')
        rows = []
        missing = s['diagnostic_unit_frame'](rows)
        self.assertTrue(missing['complete'])
        self.assertFalse(missing['propertiesComplete'])
        self.assertEqual(missing['missingProperties'],['StandardErrorFile'])
        self.assertNotIn('StandardErrorFile',missing['properties'])
        self.assertEqual(missing['properties']['StandardError'],'file')
        self.assertEqual(base64.b64decode(rows[0]['stdoutBase64']),run.raw)


if __name__ == '__main__':
    unittest.main(verbosity=2)
