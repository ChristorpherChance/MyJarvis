"""Verifier regressions: an audit may report NO-GO, but evidence cannot be forged."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest

# These tests exercise evidence integrity only; Linux account/privilege checks are
# validated on the real node, not simulated as passed by this Windows test.
if os.name=='nt':sys.modules.setdefault('pwd',types.ModuleType('pwd'))

spec=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('factory-full-test-runner.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

class AuditEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.run='1'*40;self.work=self.root/self.run;self.work.mkdir();self.evidence=self.work/'evidence';self.evidence.mkdir()
        self.old=(runner.ROOT,runner.trusted,runner.load_helper,runner.source_fingerprint,runner.EXPECTED_SOURCE_SHA256)
        runner.ROOT=str(self.root);runner.trusted=lambda _:None;runner.load_helper=lambda:None;runner.source_fingerprint=lambda _: 'a'*64
        runner.EXPECTED_SOURCE_SHA256='a'*64
        self.tool=self.root/'trusted-tool';self.tool.write_bytes(b'trusted')
        stages=[]
        for name in runner.STAGES:
            log=self.evidence/(name+'.log');log.write_bytes(b'failed assertion evidence')
            stages.append({'name':name,'exitCode':1,'ok':False,'log':{'path':log.name,'sha256':runner.digest(log),'bytes':log.stat().st_size}})
        self.container={'runId':self.run,'collectorCompleted':True,'productVerdict':'NO-GO','sourceFingerprint':'a'*64,'stages':stages,'browserSuiteManifest':[],'blocks':[{'code':'DOCUMENTED_BROWSER_MANIFEST_MISSING_OR_INVALID'}],'testManifest':[{'path':'apps/server/a.test.ts','sha256':'b'*64}]}
        self.report={'runId':self.run,'collectorCompleted':True,'productVerdict':'NO-GO','sourceBefore':'a'*64,'sourceAfter':'a'*64,'cleanup':{'complete':True},'sandboxFixture':{'requested':True,'ready':False,'blockedCode':'REAL_PIN_IMAGE_REQUIRED'}}
        self.store('copy.json',{'sha256':'a'*64,'manifest':[{'path':'apps/server/a.test.ts','sha256':'b'*64}]});self.store('tools.json',{str(self.tool):runner.digest(self.tool)})
        self.flush()
    def tearDown(self):
        runner.ROOT,runner.trusted,runner.load_helper,runner.source_fingerprint,runner.EXPECTED_SOURCE_SHA256=self.old;self.tmp.cleanup()
    def store(self,name,obj):
        (self.work/name).write_text(json.dumps(obj))
    def flush(self):
        self.report['tests']={k:self.container.get(k) for k in runner.SUMMARY_FIELDS}
        self.report['stageSummary']=[{k:row.get(k) for k in ['name','ok','exitCode','timeout','durationMs']} for row in self.container.get('stages',[])]
        (self.evidence/'container-report.json').write_text(json.dumps(self.container));self.report['containerReportSHA256']=runner.digest(self.evidence/'container-report.json');self.store('report.json',self.report)
    def verify(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):code=runner.verify(self.run)
        return code,json.loads(out.getvalue())
    def test_completed_no_go_is_not_product_pass(self):
        code,reply=self.verify();self.assertEqual(code,0);self.assertTrue(reply['ok']);self.assertEqual(reply['productVerdict'],'NO-GO')
    def test_tampered_report_cannot_become_product_go(self):
        self.report['productVerdict']='GO-CANDIDATE';self.store('report.json',self.report);self.assertEqual(self.verify()[0],2)
        self.container['productVerdict']='GO-CANDIDATE';self.flush();self.assertEqual(self.verify()[0],2)
    def test_log_tampering_rejected(self):
        (self.evidence/'build.log').write_bytes(b'invented pass');self.assertEqual(self.verify()[0],2)
    def test_public_count_or_stage_summary_forgery_rejected(self):
        self.report['tests']['testResults']=[{'passed':306,'failed':0}];self.store('report.json',self.report);self.assertEqual(self.verify()[0],2)
        self.flush();self.report['stageSummary'][0]['ok']=True;self.store('report.json',self.report);self.assertEqual(self.verify()[0],2)
    def test_omitted_stage_rejected(self):
        self.container['stages']=[s for s in self.container['stages'] if s['name']!='lint'];self.flush();self.assertEqual(self.verify()[0],2)
    def test_tool_changed_rejected(self):
        self.tool.write_bytes(b'replacement');self.assertEqual(self.verify()[0],2)
    def test_missing_test_file_or_changed_source_rejected(self):
        self.container['testManifest']=[];self.flush();self.assertEqual(self.verify()[0],2)
        self.container['testManifest']=[{'path':'apps/server/a.test.ts','sha256':'b'*64}];self.flush();runner.source_fingerprint=lambda _:'c'*64;self.assertEqual(self.verify()[0],2)
    def test_failed_cleanup_rejected(self):
        self.report['cleanup']['complete']=False;self.store('report.json',self.report);self.assertEqual(self.verify()[0],2)
    def test_ready_fixture_requires_matching_identity_and_cleanup(self):
        self.report['sandboxFixture'].update({'ready':True,'readyEvidence':{'runId':self.run,'sourceFingerprint':'a'*64},'cleanup':{'ok':True,'networkRemoved':True}})
        self.flush();self.assertEqual(self.verify()[0],0)
        self.report['sandboxFixture']['cleanup']['networkRemoved']=False;self.flush();self.assertEqual(self.verify()[0],2)
        self.report['sandboxFixture']['cleanup']['networkRemoved']=True;self.report['sandboxFixture']['readyEvidence']['runId']='2'*40;self.flush();self.assertEqual(self.verify()[0],2)

if __name__=='__main__':unittest.main()
