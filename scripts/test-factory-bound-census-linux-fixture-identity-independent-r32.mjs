/** New fixture-process identity tests. Actual production AST, controlled OS; no kernel, signals or services. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const H=b=>createHash('sha256').update(b).digest('hex');
const OWNER='5983b2ab79a647582a7081d4401931e6c3adbaeeed85bd2f6d1b84eecf91da90',STARTER='6f5906f3073c2a24e65caad441ba1e5c01c54d730e082d249c5358261be51b5a';
function source(){const raw=readFileSync('scripts/factory-bound-census-linux-owner-r32.py');assert.equal(H(raw),OWNER);assert.equal(H(readFileSync('scripts/start-factory-bound-census-linux-r32.mjs')),STARTER);return raw.toString();}
function python(code,data){const r=spawnSync('python',['-c',code],{input:JSON.stringify(data),encoding:'utf8',timeout:12000,windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
const setup=String.raw`
import ast,json,sys,stat,types,errno,hashlib,subprocess,re
select=types.SimpleNamespace(POLLIN=1,POLLHUP=16,POLLERR=8,POLLNVAL=32);signal=types.SimpleNamespace(SIGKILL=9)
from pathlib import PurePosixPath
x=json.load(sys.stdin);tree=ast.parse(x['source'])
names={'need','sha','fixture_record','bind_fixture','fixture_poll','fixture_exit_proof','finish_fixture'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==7
class P(PurePosixPath):
 def read_text(self):return g['boot']+'\n'
owner={'pid':100,'boot':'boot-fixed','controlGroup':'/system.slice/fixed.service'}
command=['/usr/bin/python3','-I','/root/control/fixture.py','--phase=native']
def s(ino=200,uid=1000):return types.SimpleNamespace(st_dev=7,st_ino=ino,st_uid=uid)
def st(ppid=100,start='700'):
 fields=['S',str(ppid)]+['0']*17+[start];return '200 (fixture) '+' '.join(fields)
class OS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self):self.fds={};self.closed=[];self.next=10;self.stats=0;self.uid=1000;self.drift=False;self.disappearAfterAttach=False;self.attachFailure=False;self.attached=False;self.statChange=False;self.statReads=0;self.readFailure=None;self.present=False;self.absenceError=None;self.files={'stat':st().encode(),'cmdline':('\0'.join(command)+'\0').encode(),'cgroup':b'0::/system.slice/fixed.service\n'}
 def open(self,n,flags,dir_fd=None):
  assert flags&self.O_NOFOLLOW;self.next+=1;self.fds[self.next]=['directory' if dir_fd is None else str(n),0];return self.next
 def fstat(self,f):return s(uid=self.uid)
 def stat(self,p,follow_symlinks=False):
  assert follow_symlinks is False;self.stats+=1
  if self.absenceError is not None:raise self.absenceError
  if self.attached and self.disappearAfterAttach:raise FileNotFoundError(errno.ENOENT,'gone after attach')
  if self.drift and self.stats>1:return s(ino=201)
  if self.present:return s()
  return s()
 def read(self,f,n):
  name,pos=self.fds[f]
  if self.readFailure==name:raise PermissionError(errno.EACCES,'private fixture read error')
  raw=self.files[name]
  if name=='stat' and pos==0:
   self.statReads+=1
   if self.statChange and self.statReads>1:raw=st(start='701').encode()
  b=raw[pos:pos+n];self.fds[f][1]+=len(b);return b
 def close(self,f):self.closed.append(f)
 def pidfd_open(self,pid,flags):
  assert pid==200 and flags==0
  if self.attachFailure:raise ProcessLookupError(errno.ESRCH,'attach failed')
  self.attached=True;return 0
g={'Path':P,'os':None,'json':json,'hashlib':hashlib,'errno':errno,'select':select,'signal':signal,'subprocess':subprocess,'boot':'boot-fixed'}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-fixture-process-helpers','exec'),g)
def frame():o=OS();g['os']=o;g['boot']='boot-fixed';return o
`;
test('actual fixture record binds argv, UID, parent, boot, cgroup and held proc identity; all read failures close descriptors',()=>{const code=setup+String.raw`
o=frame();v=g['fixture_record'](200,owner,command);assert v['pid']==200 and v['ppid']==100 and v['startTicks']=='700' and v['procInode']==200 and v['uid']==1000 and v['argvSHA256']==hashlib.sha256(o.files['cmdline']).hexdigest();assert set(o.closed)==set(o.fds);cases=1
for change in ['uid','parent','argv-near-match','cgroup','boot','inode','start-ticks','read-error','short-stat']:
 o=frame()
 if change=='uid':o.uid=0
 elif change=='parent':o.files['stat']=st(ppid=999).encode()
 elif change=='argv-near-match':o.files['cmdline']=('\0'.join(command+['other'])+'\0').encode()
 elif change=='cgroup':o.files['cgroup']=b'0::/system.slice/fixed.service-other\n'
 elif change=='boot':g['boot']='other-boot'
 elif change=='inode':o.drift=True;o.stats=1
 elif change=='start-ticks':o.statChange=True
 elif change=='read-error':o.readFailure='cmdline'
 else:o.files['stat']=b'200 (fixture) S 100'
 try:g['fixture_record'](200,owner,command)
 except (RuntimeError,OSError):pass
 else:raise AssertionError('unknown or replaced fixture identity accepted')
 assert set(o.closed)==set(o.fds);cases+=1
print(json.dumps({'cases':cases,'actualLinuxProcessReads':False,'rawPrivateErrorExported':False}))
`;const r=python(code,{source:source()});assert.equal(r.cases,10);assert.equal(r.actualLinuxProcessReads,false);});
test('actual attach and kernel-proof functions require bound identity, exact EXIT and absence; FD0 remains registered on partial failure',()=>{const code=setup+String.raw`
o=frame();held={};v=g['bind_fixture'](types.SimpleNamespace(pid=200),owner,command,held);assert held['fd']==0 and held['identity']==v and set(o.closed)==set(o.fds);cases=1
for mode in ['attach-failure','post-attach-disappearance','post-attach-reuse','record-error']:
 o=frame();held={}
 if mode=='attach-failure':o.attachFailure=True
 elif mode=='post-attach-disappearance':o.disappearAfterAttach=True
 elif mode=='post-attach-reuse':o.drift=True
 else:o.readFailure='cgroup'
 try:g['bind_fixture'](types.SimpleNamespace(pid=200),owner,command,held)
 except (RuntimeError,OSError):pass
 else:raise AssertionError('unbound PIDFD accepted')
 assert 'identity' not in held
 if mode!='attach-failure':assert held['fd']==0
 assert set(o.closed)==set(o.fds);cases+=1
identity={'pid':200,'ppid':100,'boot':'boot-fixed','procDevice':7,'procInode':200};held={'fd':0,'identity':identity}
class Poll:
 def register(self,f,events):assert f==0 and events==select.POLLIN
 def poll(self,timeout):return g['events']
g['select']=types.SimpleNamespace(poll=Poll,POLLIN=select.POLLIN,POLLHUP=select.POLLHUP)
o=frame();o.absenceError=FileNotFoundError(errno.ENOENT,'gone');g['events']=[(0,select.POLLIN)];v=g['fixture_exit_proof'](held,owner);assert v['identityBound'] and v['requestedPID']==200 and v['procPathAbsent'];cases+=1
for mode in ['alive','error-mask','pid-present-reused','absence-read-error','identity-unbound']:
 o=frame();o.absenceError=FileNotFoundError(errno.ENOENT,'gone');g['events']=[(0,select.POLLIN)];h=dict(held)
 if mode=='alive':g['events']=[]
 elif mode=='error-mask':g['events']=[(0,select.POLLIN|select.POLLERR)]
 elif mode=='pid-present-reused':o.absenceError=None;o.present=True
 elif mode=='absence-read-error':o.absenceError=PermissionError(errno.EACCES,'unknown')
 else:h['identity']=None
 try:g['fixture_exit_proof'](h,owner)
 except (RuntimeError,OSError):pass
 else:raise AssertionError('unknown fixture exit accepted')
 cases+=1
print(json.dumps({'cases':cases,'actualKernelPIDFDProof':False,'signalsSent':False}))
`;const r=python(code,{source:source()});assert.equal(r.cases,11);assert.equal(r.actualKernelPIDFDProof,false);});
test('actual emergency cleanup cannot signal an unbound or changed process and preserves an attempted signal even when it fails',()=>{const code=setup+String.raw`
identity={'pid':200,'ppid':100,'boot':'boot-fixed','procDevice':7,'procInode':200}
g['fixture_record']=lambda *args:dict(identity);g['fixture_poll']=lambda _:0
class Process:
 pid=200
 def __init__(self):self.calls=0;self.done=False
 def poll(self):return 0 if self.done else None
 def communicate(self,timeout):
  self.calls+=1
  if self.calls==1:raise subprocess.TimeoutExpired(command,timeout)
  self.done=True;return b'',b''
sent=[]
def send(fd,sig,info,flags):sent.append((fd,sig,flags));raise PermissionError(errno.EPERM,'private signal error')
g['signal']=types.SimpleNamespace(pidfd_send_signal=send,SIGKILL=signal.SIGKILL)
held={'fd':0,'identity':identity}
try:g['finish_fixture'](Process(),held,owner,command)
except PermissionError:pass
else:raise AssertionError('signal failure concealed')
assert held['emergencyStopAttempted']is True and sent==[(0,signal.SIGKILL,0)];cases=1
for mode in ['unbound','identity-change','already-exit']:
 sent.clear();h={'fd':0,'identity':dict(identity)};g['fixture_record']=lambda *args:dict(identity);g['fixture_poll']=lambda _:0
 if mode=='unbound':h['identity']=None
 elif mode=='identity-change':g['fixture_record']=lambda *args:{**identity,'procInode':999}
 else:g['fixture_poll']=lambda _:select.POLLIN
 try:g['finish_fixture'](Process(),h,owner,command)
 except RuntimeError:pass
 else:raise AssertionError('unbound emergency action accepted')
 assert not sent and not h.get('emergencyStopAttempted');cases+=1
main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main');body=ast.unparse(main)
assert "fixture_emergency = fixture_emergency or held_fixture.get('emergencyStopAttempted', False)" in body
assert "result['originalBoundExitProof']['processIdentity']['ppid'] == fixture_identity['pid']" in body
assert "fixture_closed and (not fixture_emergency) and (error_code is None)" in body
old=ast.parse(x['old']);preserved=['root_directory','read_control','save_bytes_work','runtime','context','process_identity']
for name in preserved:
 a=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name);b=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name==name);assert ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
print(json.dumps({'cases':cases,'signalsSent':False,'actualLinuxProcessReads':False,'oldPermissionFunctionsASTUnchanged':True}))
`;const old=readFileSync('artifacts/software-factory/goals-r29/bound-census-owner-preparation-367e5358.py');assert.equal(H(old),'367e5358cbb0a6e63f2edbcb726db6f147dece552ccb0e357f67666cfdc754fc');const r=python(code,{source:source(),old:old.toString()});assert.equal(r.cases,4);assert.equal(r.signalsSent,false);});
