import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {boundProcessCensusR32NativeProgram as native,boundProcessCensusR32BuildProgram as build} from './factory-bound-process-census-r32.mjs';
const python='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
test('R2 ready/release and first-error lifecycle, controlled OS only',()=>{
 const program=String.raw`import ast,contextlib,errno,importlib.util,json,sys,types,unittest
from unittest.mock import patch
value=json.loads(sys.stdin.read())
def load(path,name):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
f=load('scripts/factory-bound-census-linux-fixture-r32-r2.py','r2fixture')
old=load('scripts/factory-bound-census-linux-fixture-r32.py','oldfixture')
BOOT='328726a0-5495-4892-b0a6-2fa9de26242e'
class Guards(unittest.TestCase):
 def ready(self,chunks,selects):
  with patch.object(f.time,'monotonic',return_value=0),patch.object(f.select,'select',side_effect=selects) as select_call,patch.object(f.os,'read',side_effect=chunks) as read_call:
   return f.read_ready(10,5),select_call,read_call
 def test_original_three_definition_source_and_loader_unchanged(self):
  for phase in ('native','build'):
   new,nh=f.load_functions(value[phase].encode(),phase);previous,oh=old.load_functions(value[phase].encode(),phase)
   self.assertEqual(nh,oh);self.assertEqual(set(nh),set(f.FUNCTIONS));self.assertNotIn('census',new)
  source=open('scripts/factory-bound-census-linux-fixture-r32-r2.py',encoding='utf8').read();oldsource=open('scripts/factory-bound-census-linux-fixture-r32.py',encoding='utf8').read()
  for name in ('load_functions','runtime_guard','proc_identity','exact_child_alive'):
   segment=lambda text:next(ast.get_source_segment(text,n) for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name==name)
   self.assertEqual(segment(source),segment(oldsource))
 def test_exact_and_partial_readiness(self):
  self.assertTrue(self.ready([f.READY_TOKEN],[([10],[],[]),([],[],[])])[0])
  self.assertTrue(self.ready([f.READY_TOKEN[:4],f.READY_TOKEN[4:]],[([10],[],[]),([10],[],[]),([],[],[])])[0])
 def test_eof_wrong_and_extra_are_not_ready(self):
  for data in (b'',b'wrong',f.READY_TOKEN+b'extra'):
   with self.subTest(data_length=len(data)),self.assertRaisesRegex(RuntimeError,'READY_TOKEN_INVALID'):
    self.ready([data],[([10],[],[])])
  with self.assertRaisesRegex(RuntimeError,'READY_TOKEN_INVALID'):
   self.ready([f.READY_TOKEN],[([10],[],[]),([10],[],[])])
 def test_timeout_does_not_read(self):
  with patch.object(f.time,'monotonic',return_value=0),patch.object(f.select,'select',return_value=([],[],[])),patch.object(f.os,'read') as read:
   with self.assertRaisesRegex(RuntimeError,'READY_TIMEOUT'):f.read_ready(10,5)
   read.assert_not_called()
 def test_ready_child_has_no_sleep_or_descriptor_close_before_gate(self):
  tree=ast.parse(f.CHILD_CODE);calls=[ast.unparse(n.func) for n in ast.walk(tree) if isinstance(n,ast.Call)]
  self.assertNotIn('time.sleep',calls);self.assertNotIn('os.close',calls)
  source=f.CHILD_CODE;self.assertLess(source.index('poll.register'),source.index('os.write'));self.assertLess(source.index('os.write'),source.index('poll.poll'));self.assertLess(source.index('poll.poll'),source.index('os.read'))
  self.assertEqual(len(f.RELEASE_TOKEN)+1,22)
 def execute(self,ready_error=None,read_error=None,attach_error=None,close_error=None,dead_attach_errno=errno.ESRCH,close_verify_error=None):
  trace=[];closed=set();first_attach=True;pid=123
  def close(fd):
   trace.append(('close',fd))
   if fd==close_error:raise OSError(errno.EIO,'private-close-path')
   closed.add(fd)
  def fstat(fd):
   if fd==close_verify_error and fd in closed:raise OSError(errno.EACCES,'private-descriptor-verification')
   if fd in closed:raise OSError(errno.EBADF,'descriptor closed')
   return types.SimpleNamespace(st_dev=1,st_ino=2)
  def open_pidfd(pid,flags):
   nonlocal first_attach
   trace.append('attach')
   if first_attach:
    first_attach=False
    if attach_error:raise attach_error
    return 0
   raise OSError(dead_attach_errno,'dead-pid')
  def ready(fd,deadline):
   trace.append('ready')
   if ready_error:raise ready_error
   return True
  def record(pid,boot,a):
   trace.append('read')
   a['observedIdentity'].update(ppid=456,startTicks='7')
   if read_error:
    a['failedReadSubphase']='CMDLINE_READ';a['failedReadError']=read_error
    raise OSError(errno.ENOENT,'private-close-replaced-primary')
   return dict(pid=pid,ppid=456,startTicks='7',uid=1000,state='S')
  def wait(**kw):trace.append('wait');return 0
  child=types.SimpleNamespace(pid=pid,returncode=0,wait=wait)
  def spawn(args,**kw):
   trace.append('spawn');self.assertEqual(kw['pass_fds'],(11,12));self.assertTrue(kw['close_fds']);self.assertEqual(kw['env'],{'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'});return child
  def write(fd,body):trace.append(('release',fd));self.assertEqual(body,f.RELEASE_TOKEN);return len(body)
  scope={'process_record':record,'pidfd_poll':lambda fd:{'exitConfirmed':False},'pidfd_exit_proof':lambda *args:{'kernelProof':{'procPathAbsent':True}}}
  with contextlib.ExitStack() as stack:
   for owner,name,new in ((f,'runtime_guard',lambda:None),(f,'load_functions',lambda *args:(scope,{})),(f,'proc_identity',lambda pid:{'device':1,'inode':2}),(f,'read_ready',ready),(f,'Path',lambda path:types.SimpleNamespace(read_text=lambda:BOOT)),(f.time,'monotonic',lambda:0),(f.signal,'setitimer',lambda *args:None),(f.signal,'ITIMER_REAL',0),(f.os,'pipe',unittest.mock.Mock(side_effect=[(10,11),(12,13)])),(f.os,'close',close),(f.os,'fstat',fstat),(f.os,'pidfd_open',open_pidfd),(f.os,'getpid',lambda:456),(f.os,'write',write),(f.subprocess,'Popen',spawn)):
    stack.enter_context(patch.object(owner,name,new,create=True))
   result=f.execute_fixture(b'controlled','native')
  return result,trace,closed
 def test_full_production_order_and_natural_exit(self):
  result,trace,closed=self.execute()
  self.assertTrue(result['fixtureQualified']);self.assertTrue(result['readyHandshakeCompleted']);self.assertFalse(result['signalsSent']);self.assertTrue(result['descriptorClosed'])
  self.assertLess(trace.index('ready'),trace.index('attach'));self.assertLess(trace.index('attach'),trace.index('read'));self.assertLess(trace.index('read'),trace.index(('release',13)))
  self.assertEqual(closed,{0,10,11,12,13});self.assertEqual(result['childIdentity']['startTicks'],'7')
 def test_failed_ready_never_attaches_and_still_releases_and_closes(self):
  result,trace,closed=self.execute(ready_error=RuntimeError('R32_FIXTURE_READY_TOKEN_INVALID'))
  self.assertFalse(result['fixtureQualified']);self.assertEqual(result['fixturePhase'],'READY_HANDSHAKE');self.assertNotIn('attach',trace);self.assertNotIn('read',trace);self.assertIn(('release',13),trace);self.assertIsNone(result['childIdentity']);self.assertEqual(closed,{10,11,12,13})
 def test_ready_does_not_make_dead_attach_known(self):
  result,trace,closed=self.execute(attach_error=OSError(errno.ESRCH,'private-target'))
  self.assertFalse(result['fixtureQualified']);self.assertEqual(result['errno'],errno.ESRCH);self.assertEqual(result['firstReadSubphase'],'PIDFD_OPEN');self.assertIsNone(result['childIdentity']);self.assertNotIn('read',trace);self.assertFalse(result['signalsSent'])
 def test_read_primary_errno_and_stage_survive_close_secondary(self):
  result,trace,closed=self.execute(read_error=PermissionError(errno.EACCES,'private-file'),close_error=10)
  self.assertFalse(result['fixtureQualified']);self.assertEqual(result['errno'],errno.EACCES);self.assertEqual(result['fixturePhase'],'PROCESS_RECORD');self.assertEqual(result['firstReadSubphase'],'CMDLINE_READ');self.assertFalse(result['descriptorClosed']);self.assertIn(0,closed)
  exported=json.dumps(result);self.assertNotIn('private-',exported);self.assertEqual(result['childIdentity']['ppid'],456);self.assertGreater(len(result['secondaryFailures']),0)
 def test_dead_attach_other_errno_remains_original_failure(self):
  result,trace,closed=self.execute(dead_attach_errno=errno.EPERM)
  self.assertFalse(result['fixtureQualified']);self.assertEqual(result['errno'],errno.EPERM);self.assertEqual(result['fixturePhase'],'DEAD_ATTACH');self.assertEqual(result['errorCode'],'R32_FIXTURE_INCOMPLETE')
 def test_descriptor_verification_other_errno_is_not_erased(self):
  result,trace,closed=self.execute(close_verify_error=0)
  self.assertFalse(result['fixtureQualified']);self.assertEqual(result['errno'],errno.EACCES);self.assertEqual(result['fixturePhase'],'DESCRIPTOR_CLOSE');self.assertFalse(result['descriptorClosed']);self.assertEqual(closed,{0,10,11,12,13})
 def test_post_attach_drift_retains_fd_for_outer_cleanup(self):
  a={}
  with patch.object(f,'proc_identity',side_effect=[{'device':1,'inode':2},{'device':1,'inode':3}]),patch.object(f.os,'pidfd_open',return_value=0,create=True):
   with self.assertRaisesRegex(RuntimeError,'POST_ATTACH_IDENTITY_CHANGED'):f.attach_child(123,BOOT,a)
  self.assertEqual(a['fd'],0);self.assertFalse(a['identityBound']);self.assertIsNone(f.safe_identity(a));self.assertEqual(a['failedReadSubphase'],'POST_ATTACH_PROC_IDENTITY')
 def test_diagnostics_closed_label_and_first_error(self):
  d=f.Diagnostics('native');d.enter('PROCESS_RECORD');d.attachment={'failedReadSubphase':'/secret/path','failedReadError':OSError(errno.ENOENT,'secret')}
  d.capture(OSError(errno.EACCES,'close'),read=True);d.enter('DESCRIPTOR_CLOSE');d.capture(OSError(errno.EIO,'private-close'))
  out=d.failure();self.assertEqual(out['errno'],errno.ENOENT);self.assertEqual(out['fixturePhase'],'PROCESS_RECORD');self.assertIsNone(out['firstReadSubphase']);self.assertIsNone(out['childIdentity']);self.assertNotIn('secret',json.dumps(out))
  with self.assertRaisesRegex(RuntimeError,'DIAGNOSTIC_PHASE_INVALID'):d.enter('/private-phase')
 def test_generated_process_record_drift_never_exports_unbound_identity(self):
  scope,_=f.load_functions(value['native'].encode(),'native')
  scope['os']=types.SimpleNamespace(O_RDONLY=0,O_DIRECTORY=1,O_NOFOLLOW=2,open=lambda *args,**kw:55,fstat=lambda fd:types.SimpleNamespace(st_dev=160,st_ino=202),close=lambda fd:None)
  a={'requestedPID':11,'boot':BOOT,'listedProcIdentity':{'device':160,'inode':101},'observedIdentity':{'pid':11,'boot':BOOT,'procDevice':160,'procInode':101},'identityBound':True,'fd':0}
  self.assertIsNotNone(f.safe_identity(a))
  with self.assertRaisesRegex(RuntimeError,'PROCESS_LIST_IDENTITY_CHANGED'):scope['process_record'](11,BOOT,a)
  self.assertIsNone(f.safe_identity(a));self.assertEqual(a['failedReadSubphase'],'PROC_DIRECTORY_METADATA')
  for key,replacement in (('pid',12),('boot','00000000-0000-0000-0000-000000000000'),('procDevice',161),('procInode',202)):
   a['observedIdentity']={'pid':11,'boot':BOOT,'procDevice':160,'procInode':101};a['observedIdentity'][key]=replacement
   self.assertIsNone(f.safe_identity(a))
 def test_signal_attempt_is_not_erased_by_signal_error(self):
  child=types.SimpleNamespace(wait=lambda **kw:(_ for _ in ()).throw(f.subprocess.TimeoutExpired('child',3)))
  d=f.Diagnostics('native')
  with patch.object(f,'exact_child_alive',return_value=True),patch.object(f.signal,'pidfd_send_signal',side_effect=OSError(errno.EIO,'signal failed'),create=True),patch.object(f.signal,'SIGTERM',15,create=True):
   with self.assertRaises(OSError):f.finish_child(child,{'fd':0},BOOT,{},d)
  self.assertTrue(d.signals_sent);self.assertFalse(d.child_reaped)
suite=unittest.defaultTestLoader.loadTestsFromTestCase(Guards)
result=unittest.TextTestRunner(verbosity=1).run(suite)
print(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'linuxExecuted':False,'remoteOperations':False,'productExecuted':False}))
raise SystemExit(0 if result.wasSuccessful() else 1)
`;
 const r=spawnSync(python,['-c',program],{input:JSON.stringify({native:native(),build:build()}),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout.trim());
 assert.deepEqual(result,{tests:15,failures:0,errors:0,linuxExecuted:false,remoteOperations:false,productExecuted:false});
});
