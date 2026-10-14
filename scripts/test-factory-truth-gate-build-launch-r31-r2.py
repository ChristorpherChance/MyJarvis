"""Local actual AST/function guards; no Linux privilege or container execution."""
import ast,unittest,re,stat
from pathlib import Path
from types import SimpleNamespace
SOURCE=Path('scripts/factory-truth-gate-build-launch-r31-r2.py').read_text()
TREE=ast.parse(SOURCE)
NS={'re':re}
for n in TREE.body:
 if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id in ['ROOT','SOURCE','FP','IMAGE','STAGES','H'] for x in n.targets):exec(compile(ast.Module(body=[n],type_ignores=[]),'actual-launch-constants','exec'),NS)
for name in ['need','qualify']:
 node=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),'actual-launch-guard','exec'),NS)
def payload():
 h='b'*64
 return {'scope':{'source':NS['SOURCE'],'fingerprint':NS['FP'],'sourceFiles':625,'sourceBytes':18413026,'metadataSHA':h,'sourceIdentity':{'device':66306,'inode':7136362},'sourceOrigin':'/var/lib/jarvis-development/101/targets-r31-preparation-r2/'+'a'*32+'/origin.json','sourceOriginSHA256':h,'root':NS['ROOT'],'tool':'/opt/jarvis-development/software-factory/factory-truth-gate-build-r31-r2-'+h[:16]+'.py','toolSHA':h,'qaManifestSHA256':h,'sourcePreparationSHA256':h,'reviewSHA256':h,'starterSHA256':h,'rendererSHA256':h},'action':'start','attempt':'c'*32,'workerBase64':'','qaBase64':{k:'' for k in ['manifest.json','baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs']},'freshProtectionSHA256':h,'freshProtectionObservedAt':'2026-10-13T00:00:00Z'}
class Guards(unittest.TestCase):
 def test_actual_scope_before_io(self):self.assertEqual(NS['qualify'](payload())['sourceFiles'],625)
 def test_wrong_fixed_paths_and_source(self):
  for k,v in [('source','/home/superopen/All-Projects/msf-targets-r31/source'),('root','/tmp'),('sourceOrigin','/tmp/origin.json'),('fingerprint','a'*64),('sourceFiles',621),('metadataSHA',None),('tool','/usr/bin/python3')]:
   p=payload();p['scope'][k]=v
   with self.assertRaises(RuntimeError):NS['qualify'](p)
 def test_identity_boolean_or_extra_scope_refused(self):
  for k,v in [('device',True),('inode',0)]:
   p=payload();p['scope']['sourceIdentity'][k]=v
   with self.assertRaises(RuntimeError):NS['qualify'](p)
  p=payload();p['scope']['arbitrary']='x'
  with self.assertRaises(RuntimeError):NS['qualify'](p)
 def test_readonly_check_rejects_any_program_or_fresh_dispatch_body(self):
  p=payload();p['action']='check'
  with self.assertRaises(RuntimeError):NS['qualify'](p)
  for k in ['workerBase64','qaBase64','freshProtectionSHA256','freshProtectionObservedAt']:p[k]=None
  self.assertEqual(NS['qualify'](p)['source'],NS['SOURCE'])
 def test_six_names_two_label_scopes_and_285_stop_budget(self):
  self.assertEqual(len(NS['STAGES']),6);self.assertLess(6*45+15,300)
  self.assertIn("['network','ls','-q']",SOURCE);self.assertIn("['volume','ls','-q']",SOURCE)
  self.assertIn('jarvis.truthgate.r31.r2.attempt=',SOURCE);self.assertIn('jarvis.truthgate.r31.r2.kind=build',SOURCE)
 def test_actual_source_guard_no_invented_helper_api_and_root_dispatch_after_ownership(self):
  self.assertNotIn('fingerprint_entries',SOURCE);self.assertNotIn('metadata_fingerprint',SOURCE)
  main=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name=='main');text=ast.get_source_segment(SOURCE,main)
  self.assertLess(text.index('docker_absence(names'),text.index('else:put(tool'))
  self.assertLess(text.index('store(own,ownership)'),text.index("'/usr/bin/systemd-run'"))
  self.assertLess(text.index("phase':'fork-intent'"),text.index("'/usr/bin/systemd-run'"))
  self.assertIn("'--property=TimeoutStopSec=300'",text);self.assertIn("'--property=RuntimeMaxSec=1800'",text)
  self.assertIn("'--property=Environment=JARVIS_R31_R2_BUILD_OWNER_UNIT='",text)
 def test_actual_qa_closed_names_bytes_modes_and_check_readback(self):
  main=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name=='main');text=ast.get_source_segment(SOURCE,main)
  self.assertIn("set(qa_manifest['files'])=={'baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'}",text)
  self.assertIn("sha(qa_raw)==s['qaManifestSHA256']",text);self.assertIn('==0o444',text);self.assertIn('qaToolsReadbackVerified',text)
  self.assertTrue(isinstance(TREE.body[-1],ast.If));self.assertIn('main(p)',ast.get_source_segment(SOURCE,TREE.body[-1]))
if __name__=='__main__':unittest.main()
