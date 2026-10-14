import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {boundProcessCensusR32NativeProgram as native,boundProcessCensusR32BuildProgram as build} from './factory-bound-process-census-r32.mjs';
const python='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
test('prepared Linux fixture controlled helpers and definitions, no actual process execution',()=>{
 const program=String.raw`import ast,errno,importlib.util,json,sys,types,unittest
from unittest.mock import patch
value=json.loads(sys.stdin.read())
spec=importlib.util.spec_from_file_location('fixture','scripts/factory-bound-census-linux-fixture-r32.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Guards(unittest.TestCase):
 def test_fixed_three_native(self):
  scope,hashes=f.load_functions(value['native'].encode(),'native')
  self.assertEqual(set(hashes),set(f.FUNCTIONS));self.assertNotIn('census',scope);self.assertNotIn('unit_state',scope)
 def test_fixed_three_build(self):
  scope,hashes=f.load_functions(value['build'].encode(),'build')
  self.assertEqual(set(hashes),set(f.FUNCTIONS));self.assertNotIn('ack_state',scope)
 def test_source_rejection_before_parse(self):
  with patch.object(f.ast,'parse',side_effect=AssertionError('parse must not occur')) as parser:
   with self.assertRaisesRegex(RuntimeError,'GENERATED_SOURCE_CHANGED'):f.load_functions((value['native']+'\n').encode(),'native')
   parser.assert_not_called()
 def test_phase_rejected_before_parse(self):
  with patch.object(f.ast,'parse',side_effect=AssertionError('parse must not occur')) as parser:
   with self.assertRaisesRegex(RuntimeError,'SOURCE_ARGUMENT_INVALID'):f.load_functions(value['native'].encode(),'any-host')
   parser.assert_not_called()
 def test_root_guard_no_child(self):
  with patch.object(f.sys,'platform','linux'),patch.object(f.os,'getresuid',return_value=(0,0,0),create=True),patch.object(f.subprocess,'Popen') as child:
   with self.assertRaisesRegex(RuntimeError,'UID1000_LINUX_REQUIRED'):f.runtime_guard()
   child.assert_not_called()
 def test_fd_zero_closed_on_identity_drift(self):
  closed=[]
  with patch.object(f,'proc_identity',side_effect=[{'device':1,'inode':2},{'device':1,'inode':3}]),patch.object(f.os,'pidfd_open',return_value=0,create=True),patch.object(f.os,'close',side_effect=closed.append):
   with self.assertRaisesRegex(RuntimeError,'POST_ATTACH_IDENTITY_CHANGED'):f.attach_child(123,'boot')
  self.assertEqual(closed,[0])
 def test_natural_exit_no_signal(self):
  child=types.SimpleNamespace(wait=lambda **kw:0)
  with patch.object(f,'exact_child_alive',side_effect=AssertionError('no emergency identity read')):
   self.assertFalse(f.finish_child(child,None,'boot',{}))
 def test_emergency_uses_only_exact_pidfd(self):
  trace=[];calls=iter([f.subprocess.TimeoutExpired('fixture',3),0])
  def wait(**kw):
   v=next(calls)
   if isinstance(v,Exception):raise v
   trace.append('reaped');return v
  child=types.SimpleNamespace(pid=123,wait=wait)
  with patch.object(f,'exact_child_alive',side_effect=lambda *args:trace.append('bound')),patch.object(f.signal,'pidfd_send_signal',side_effect=lambda fd,*args:trace.append(('signal',fd)),create=True):
   self.assertTrue(f.finish_child(child,{'fd':0},'boot',{}))
  self.assertEqual(trace,['bound',('signal',0),'reaped'])
 def test_unbound_emergency_never_signals(self):
  child=types.SimpleNamespace(pid=123,wait=lambda **kw:(_ for _ in ()).throw(f.subprocess.TimeoutExpired('fixture',3)))
  with patch.object(f,'exact_child_alive',side_effect=RuntimeError('R32_FIXTURE_CHILD_IDENTITY_UNBOUND')),patch.object(f.signal,'pidfd_send_signal',create=True) as send:
   with self.assertRaisesRegex(RuntimeError,'IDENTITY_UNBOUND'):f.finish_child(child,{},'boot',{})
   send.assert_not_called()
suite=unittest.defaultTestLoader.loadTestsFromTestCase(Guards)
result=unittest.TextTestRunner(verbosity=1).run(suite)
print(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'linuxExecuted':False,'productExecuted':False}))
raise SystemExit(0 if result.wasSuccessful() else 1)
`;
 const r=spawnSync(python,['-c',program],{input:JSON.stringify({native:native(),build:build()}),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout.trim());assert.deepEqual(result,{tests:9,failures:0,errors:0,linuxExecuted:false,productExecuted:false});
});
