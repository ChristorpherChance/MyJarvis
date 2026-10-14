"""New provenance boundary using real root functions with controlled OS/Docker only."""
import ast,base64,copy,importlib.util,json,pathlib,types,unittest
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=load('r2_recovery','scripts/factory-redis-resource-recovery-r32-r2.py')
oldtest=load('old_controlled_recovery','scripts/test-factory-redis-resource-recovery-r32.py')
def fixture():
 v,p,events,files,pre=oldtest.fixture()
 for name in ['PROTECTION_CONSUMER_SHA256','PROTECTION_KIND','PROTECTION_ACTIVATION','BASE']:v[name]=getattr(m,name)
 for name in ['protection_provenance','main']:
  fn=getattr(m,name);v[name]=types.FunctionType(fn.__code__,v,name,fn.__defaults__)
 review=json.loads(base64.b64decode(p['reviewRawBase64']));review.update(kind='r32-failed-redis-resource-recovery-independent-local-review-r2',protectionConsumerSHA256=m.PROTECTION_CONSUMER_SHA256)
 raw=pathlib.Path('.jarvis-dev/maintenance/r32-new-bound-full-protection-raw-1791859741186-2cbda764-3047-4583-bd1d-40fc5746fe6f.json').read_bytes()
 assert m.sha(raw)=='859d7797bc83a961412b00f8e59f8758dbe2c1556cab27904c839dc00efa8368'
 protection=json.loads(raw);protection['at']=pre['at'];pre['kind']='software-factory-r32-truth-gate-redis-recovery-preflight-r2'
 for name,value in [('review',review),('protection',protection),('preflight',pre)]:
  raw=m.canonical(value);p[name+'RawBase64']=base64.b64encode(raw).decode();p[name+'SHA256']=m.sha(raw)
 return v,p,events,files,protection
def replace_proof(p,proof):
 raw=m.canonical(proof);p['protectionRawBase64']=base64.b64encode(raw).decode();p['protectionSHA256']=m.sha(raw)
class R2Provenance(unittest.TestCase):
 def test_preserved20functions_and_actual_delete_block_are_exact_original_bytes(self):
  original=pathlib.Path('scripts/factory-redis-resource-recovery-r32.py').read_text();current=pathlib.Path('scripts/factory-redis-resource-recovery-r32-r2.py').read_text()
  def parts(s):return {n.name:ast.get_source_segment(s,n) for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)}
  before=parts(original);after=parts(current);names=set(before)-{'main'};self.assertEqual(len(names),20)
  self.assertTrue(all(before[n]==after[n] for n in names));self.assertEqual(set(after)-set(before),{'protection_provenance'})
  begin="    try:\n        need(original_records(diag)==before,'R32_REDIS_RECOVERY_ORIGINAL_RECORD_CHANGED');current(True,True);"
  end='    try:original_stable=original_records(diag)==before'
  self.assertEqual(original[original.index(begin):original.index(end)],current[current.index(begin):current.index(end)])
 def test_new_source_gate_then_durable_new_intent_precedes_exact_two_nonforce_removals(self):
  v,p,e,files,proof=fixture();reply=v['main'](p);r=reply['result'];self.assertEqual(r['kind'],'r32-failed-redis-resource-recovery-result-r2');self.assertEqual(r['protectionConsumerSHA256'],m.PROTECTION_CONSUMER_SHA256);self.assertEqual(r['protectionKind'],m.PROTECTION_KIND)
  intent=m.BASE+'/'+p['recoveryNonce']+'/intent.json';self.assertEqual(json.loads(files[intent])['kind'],'r32-failed-redis-resource-recovery-intent-r2')
  calls=[x[1] for x in e if isinstance(x,tuple) and x[0]=='docker'];self.assertEqual(calls,[['container','rm',m.REDIS_ID],['volume','rm',m.name('redis-data')]])
  self.assertLess(e.index(('wx',intent)),next(i for i,x in enumerate(e) if isinstance(x,tuple) and x[0]=='docker'));self.assertTrue(r['originalCreatedRecordStillMissing']);self.assertFalse(r['originalMatrixCleanupQualified']);self.assertFalse(r['cleanupIndependentlyVerified'])
 def test_old_kind_alias_changed_source_receipts_or_wrong_typed_kernel_refs_never_mutate(self):
  changes=[lambda x:x.update(kind='software-factory-r29-new-protection-contract-observation'),lambda x:x.update(consumerSHA256='0'*64),lambda x:x['sourceReceipts'][1].update(actualProgramSHA256='0'*64),lambda x:x['activation']['actualLinuxQualification'].update(sha256='0'*64),lambda x:x.update(oldObserverExecutionClaimed=True)]
  for change in changes:
   v,p,e,files,proof=fixture();change(proof);replace_proof(p,proof)
   with self.assertRaises(RuntimeError):v['main'](p)
   self.assertFalse(e);self.assertFalse(files)
 def test_same_nonce_check_is_readonly_and_wrong_r2_provenance_is_rejected(self):
  v,p,e,files,_=fixture();r=v['main'](p);p['action']='check';before=len(e);check=v['main'](p);self.assertTrue(check['readOnly']);self.assertEqual(check['rootIntent'],r['rootIntent']);self.assertFalse(any(isinstance(x,tuple) and x[0]=='docker' for x in e[before:]))
  result_path=m.BASE+'/'+p['recoveryNonce']+'/result.json';result=json.loads(files[result_path]);result['protectionKind']='old-kind';files[result_path]=m.canonical(result)
  with self.assertRaisesRegex(RuntimeError,'RESULT_UNBOUND'):v['main'](p)
if __name__=='__main__':unittest.main()
