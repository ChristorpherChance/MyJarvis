/** Independent controlled tests of the actual generated functions. No Linux/root/Docker IO. */
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {boundProcessCensusR32NativeProgram as native,boundProcessCensusR32BuildProgram as build,boundProcessCensusR32ReadSubphases as phases} from './factory-bound-process-census-r32.mjs';
import {targetCleanupR29HostProgram as originalNative} from './verify-factory-target-cleanup-r29.mjs';import {buildCleanupR29HostProgram as originalBuild} from './verify-factory-truth-gate-build-cleanup-r29.mjs';
import {runInNewContext} from 'node:vm';import {createHash as hashFactory} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
function python(code,values){const r=spawnSync('python',['-c',code],{input:JSON.stringify(values),encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:2*1024**2});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
test('two fixed generated programs compile and original exit-proof/poll bytes remain unchanged',()=>{for(const [current,old] of [[native(),originalNative()],[build(),originalBuild()]]){const a=old.indexOf('def pidfd_poll('),z=old.indexOf('def census():',a);assert.ok(current.includes(old.slice(a,z)));const r=python('import ast,json,sys;x=json.load(sys.stdin);ast.parse(x["source"]);compile(x["source"],"independent-bound-census","exec");print(json.dumps({"compiled":True}))',{source:current});assert.equal(r.compiled,true);}for(const [path,pin] of [['scripts/verify-factory-target-cleanup-r29.mjs','d4860d172aa4b4a2949281ac5ae416d216625b8ed43e394d57e30ba9f0873dd6'],['scripts/verify-factory-truth-gate-build-cleanup-r29.mjs','48e2089fd03db8d3186486edf207550ad157e412071c10515f5a1d892be59d86'],['scripts/verify-factory-protection-contract-r29-r2.mjs','de1c75c0becd8f2375dd2b0b1005d86f8c4052736d90725743dde3cc94a4de76']])assert.equal(sha(readFileSync(path)),pin);});
const censusFixture=String.raw`
import ast,json,sys,types,copy,re,errno
x=json.load(sys.stdin);tree=ast.parse(x['source']);wanted={'pidfd_poll','pidfd_exit_proof','census'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted];assert len(nodes)==3
def need(v,c):
 if not v:raise RuntimeError(c)
boot='328726a0-5495-4892-b0a6-2fa9de26242e';unit='/system.slice/jarvis-software-factory-development.service';owner='/system.slice/controlled-owner.service'
def record(pid):return dict(pid=pid,ppid=1,startTicks=str(pid),boot=boot,procDevice=1,procInode=pid,uid=1000,state='S',cwdSHA256='a'*64,exeSHA256='b'*64,argvSHA256='c'*64,cgroups=[unit] if pid==700 else [owner],workspaceRelated=False)
class FakePath:
 def __init__(self,path):self.path=path
 def read_text(self):return boot
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self):self.closed=[];self.trace=[];self.missing=set();self.attachFail=set();self.swap=set();self.masks={};self.early=False;self.closeFail=set();self.fdZero=False
 def open(self,*_):return 10
 def fstat(self,_):return types.SimpleNamespace(st_dev=1)
 def close(self,fd):
  self.closed.append(fd)
  if fd in self.closeFail:raise OSError(errno.EBADF,'PRIVATE_FD_PATH')
 def pidfd_open(self,pid,flags):
  self.trace.append(('attach',pid))
  if pid in self.attachFail:raise ProcessLookupError(errno.ESRCH,'PRIVATE_PROCESS_PATH')
  return 0 if self.fdZero and pid==705 else pid+10000
 def stat(self,path,follow_symlinks=False):
  pid=int(str(path).rsplit('/',1)[1]);self.trace.append(('poststat',pid))
  if pid in self.missing:raise FileNotFoundError(errno.ENOENT,'PRIVATE_PROCESS_PATH')
  return types.SimpleNamespace(st_dev=1,st_ino=99999 if pid in self.swap else pid)
 def scandir(self,fd):
  os=self
  class Entries:
   def __enter__(self):return self
   def __iter__(self):
    for i,pid in enumerate([700,705]):
     if os.early and i==1:raise OSError(errno.EACCES,'PRIVATE_ENUMERATION_PATH')
     os.trace.append(('entry',pid));yield types.SimpleNamespace(name=str(pid),inode=lambda pid=pid:pid)
   def __exit__(self,*_):pass
  return Entries()
class FakeSelect:
 POLLIN=1;POLLHUP=16;POLLERR=8;POLLNVAL=32
 def poll(self):
  class Poll:
   def register(self,fd,mask):self.fd=fd
   def poll(self,_):return [(self.fd,os.masks[self.fd])] if os.masks.get(self.fd) else []
  return Poll()
def observe(pid,boot,a):
 value=record(pid);a['observedIdentity']={k:value[k] for k in ['pid','ppid','boot','startTicks','procDevice','procInode']};return value
env={'p':{'workspace':'/controlled/work'},'need':need,'re':re,'errno':errno,'select':FakeSelect(),'Path':FakePath,'CLOSED_READ_SUBPHASES':set(x['phases']),'OWNER_CGROUP':owner,'account':types.SimpleNamespace(pw_uid=1000),'unit_state':lambda:dict(pid=700,cgroup=unit),'ack_state':lambda:dict(counts=dict(runs=0,deliveries=0,logs=0))};exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-generated-census','exec'),env)
def frame(fn=observe):
 global os
 os=FakeOS();env['os']=os;env['process_record']=fn;return os
def closed(c):assert c['counts']==dict(listed=2,inspected=len(c['inspectedPIDs']),pidfdProvenExits=len(c['exitedDuringScan']),incomplete=len(c['readIncompletePIDs'])) and set(c['listedPIDs'])==set(c['inspectedPIDs'])|set(c['readIncompletePIDs'])|{e['pid'] for e in c['exitedDuringScan']}
cases=0
os=frame();c=env['census']();closed(c);assert os.trace[:6]==[('entry',700),('attach',700),('poststat',700),('entry',705),('attach',705),('poststat',705)] and set(os.closed)=={10,10700,10705};cases+=1
if x['build']:assert c['ownerCgroupProcesses']==[705] and [v['pid'] for v in c['relatedProcesses']]==[705]
os=frame();os.attachFail={705};c=env['census']();closed(c);assert c['readIncompletePIDs']==[705] and c['readIncompleteReasons'][0]['readSubphase']=='PIDFD_OPEN' and not c['exitedDuringScan'];cases+=1
for mode in ['missing','swap']:
 os=frame();setattr(os,mode,{705});c=env['census']();closed(c);assert c['readIncompletePIDs']==[705] and c['readIncompleteReasons'][0]['readSubphase']=='POST_ATTACH_PROC_IDENTITY' and 10705 in os.closed and not c['exitedDuringScan'];cases+=1
def live_enoent(pid,boot,a):
 if pid==705:
  a['failedReadSubphase']='CMDLINE_READ';a['readSubphase']='PROC_DIRECTORY_CLOSE';raise FileNotFoundError(errno.ENOENT,'PRIVATE_CMDLINE_PATH')
 return observe(pid,boot,a)
os=frame(live_enoent);c=env['census']();closed(c);assert c['readIncompletePIDs']==[705] and c['readIncompleteReasons'][0]['readSubphase']=='CMDLINE_READ' and not c['exitedDuringScan'];assert 'PRIVATE_' not in json.dumps(c);cases+=1
os=frame(live_enoent);os.masks={10705:1};c=env['census']();closed(c);assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan'];cases+=1
def reuse(pid,boot,a):
 if pid==705:os.swap.add(pid);os.masks[a['fd']]=1;raise FileNotFoundError(errno.ENOENT,'PRIVATE_REUSE_PATH')
 return observe(pid,boot,a)
os=frame(reuse);c=env['census']();closed(c);assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan'];cases+=1
def exit_now(pid,boot,a):
 if pid==705:os.missing.add(pid);os.masks[a['fd']]=1;raise FileNotFoundError(errno.ENOENT,'PRIVATE_EXIT_PATH')
 return observe(pid,boot,a)
os=frame(exit_now);c=env['census']();closed(c);assert c['readIncompletePIDs']==[] and c['counts']['pidfdProvenExits']==1 and c['exitedDuringScan'][0]['kernelProof']['identityBound'] is True;cases+=1
os=frame();os.early=True
try:env['census']()
except OSError:pass
else:raise AssertionError('incomplete enumeration returned complete')
assert set(os.closed)=={10,10700};cases+=1
os=frame();os.closeFail={10700}
try:env['census']()
except RuntimeError as e:assert str(e)=='R29_CLEANUP_PIDFD_CLOSE_INCOMPLETE'
else:raise AssertionError('close error accepted')
assert set(os.closed)=={10,10700,10705};cases+=1
os=frame();os.fdZero=True;c=env['census']();assert 0 in os.closed;closed(c);cases+=1
for mask in [8,32,9]:
 os=frame(live_enoent);os.masks={10705:mask};c=env['census']();closed(c);assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan'];cases+=1
if x.get('errorPrecedence'):
 def prior_permission_then_close_enoent(pid,boot,a):
  if pid==705:
   a['failedReadSubphase']='FD_TARGET_READLINK';a['failedReadError']=PermissionError(errno.EACCES,'PRIVATE_FIRST_PERMISSION_PATH');os.missing.add(pid);os.masks[a['fd']]=1;raise FileNotFoundError(errno.ENOENT,'PRIVATE_SECOND_CLOSE_PATH')
  return observe(pid,boot,a)
 os=frame(prior_permission_then_close_enoent);c=env['census']();closed(c)
 if x.get('legacy'):assert not c['readIncompletePIDs'] and c['counts']['pidfdProvenExits']==1
 else:
  assert c['readIncompletePIDs']==[705] and not c['exitedDuringScan'];row=c['readIncompleteReasons'][0];assert row['errno']==errno.EACCES and row['readSubphase']=='FD_TARGET_READLINK' and 'PRIVATE_' not in json.dumps(c)
 cases+=1
if x.get('badSubphase'):
 def private_subphase(pid,boot,a):
  if pid==705:a['failedReadSubphase']='/PRIVATE_UNTRUSTED_PHASE';raise FileNotFoundError(errno.ENOENT,'PRIVATE_PATH')
  return observe(pid,boot,a)
 os=frame(private_subphase)
 try:env['census']()
 except RuntimeError as e:assert str(e)=='R29_CLEANUP_READ_SUBPHASE_INVALID'
 else:raise AssertionError('unclosed private phase emitted')
 assert set(os.closed)=={10,10700,10705};cases+=1
print(json.dumps({'cases':cases,'actualLinuxIO':False,'rawPrivateDataExported':False,'buildOwnerPreserved':bool(x['build'])}))
`;
for(const [label,program,isBuild] of [['native',native,false],['old-build',build,true]])test(label+' actual census: immediate binding, closed unknown/EXIT partitions, early/close-error cleanup and FD0',()=>{const r=python(censusFixture,{source:program(),phases,build:isBuild});assert.equal(r.cases,14);assert.equal(r.actualLinuxIO,false);assert.equal(r.buildOwnerPreserved,isBuild);});
function legacy21Programs(){const src=readFileSync('artifacts/software-factory/goals-r29/bound-census-preparation-21c77a16.mjs','utf8');assert.equal(sha(src),'21c77a16377de18a2ca2a1b1c519baf4bee4728d65a79f6e36bc5db408f6dc9d');const local=src.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')+'\n({native:boundProcessCensusR32NativeProgram(),build:boundProcessCensusR32BuildProgram()})';return runInNewContext(local,{createHash:hashFactory,targetCleanupR29HostProgram:originalNative,buildCleanupR29HostProgram:originalBuild},{timeout:10000});}
test('preserved21 actual census demonstrates old permission+closeENOENT misclassification; new two programs keep unknown',()=>{const old=legacy21Programs();for(const [legacy,program,isBuild] of [[true,old.native,false],[true,old.build,true],[false,native(),false],[false,build(),true]]){const r=python(censusFixture,{source:program,phases,build:isBuild,errorPrecedence:true,legacy});assert.equal(r.cases,15);} });
const recordFixture=String.raw`
import ast,json,sys,types,hashlib,errno,re
x=json.load(sys.stdin);tree=ast.parse(x['source']);fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='process_record')
def need(v,c):
 if not v:raise RuntimeError(c)
class Path:
 def __init__(self,p):self.p=str(p)
 def __truediv__(self,n):return Path(self.p+'/'+str(n))
 def __str__(self):return self.p
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self,mode):self.mode=mode;self.next=20;self.names={};self.pos={};self.active=False
 def open(self,name,*args,dir_fd=None):
  self.next+=1;fd=self.next;self.names[fd]=str(name);self.pos[fd]=0;return fd
 def fstat(self,_):return types.SimpleNamespace(st_dev=1,st_ino=701,st_uid=1000)
 def stat(self,*args,**kwargs):return types.SimpleNamespace(st_ino=701)
 def close(self,fd):
  name=self.names[fd]
  if (self.mode in ['read-close','decode-close','limit-close'] and name=='cmdline') or (self.mode=='fd-target-close' and name=='fd'):raise FileNotFoundError(errno.ENOENT,'PRIVATE_CLOSE_PATH')
 def read(self,fd,size):
  name=self.names[fd]
  if name=='cmdline' and self.mode=='read-close':raise PermissionError(errno.EACCES,'PRIVATE_FIRST_READ_PATH')
  if name=='cmdline' and self.mode=='limit-close':return b'x'*65536
  if name=='stat':fields=['S','1']+['0']*18;fields[19]='123';raw=('701 (safe) '+' '.join(fields)).encode()
  elif name=='cmdline':raw=b'\xff' if self.mode=='decode-close' else b'node\0--cwd=/controlled/work\0'
  elif name=='cgroup':raw=b'0::/system.slice/node.service\n'
  else:raise AssertionError('unexpected fixture read')
  out=raw[self.pos[fd]:self.pos[fd]+size];self.pos[fd]+=len(out);return out
 def readlink(self,name,dir_fd=None):
  if name=='1':
   assert self.active
   if self.mode=='fd-target-close':raise PermissionError(errno.EACCES,'PRIVATE_FIRST_TARGET_PATH')
   return '/controlled/work/open (deleted)'
  return '/usr/bin/node' if name=='exe' else '/controlled/work'
 def scandir(self,fd):
  os=self
  class Entries:
   def __enter__(self):os.active=True;self.i=0;return self
   def __iter__(self):return self
   def __next__(self):
    if self.i:raise StopIteration
    self.i+=1;return types.SimpleNamespace(name='1')
   def __exit__(self,*args):
    os.active=False
    if os.mode=='scanner-close':raise PermissionError(errno.EACCES,'PRIVATE_SCANNER_CLOSE_PATH')
  return Entries()
g={'Path':Path,'need':need,'CLOSED_READ_SUBPHASES':set(x['phases']),'digest':lambda v:hashlib.sha256(v.encode() if isinstance(v,str) else v).hexdigest(),'in_workspace':lambda v:v.startswith('/controlled/work/'),'argv_workspace':lambda v:'/controlled/work' in v,'re':re};exec(compile(ast.Module(body=[fn],type_ignores=[]),'actual-process-record-subphase','exec'),g)
observed={}
for mode in ['read-close','decode-close','limit-close','fd-target-close','scanner-close']:
 os=FakeOS(mode);g['os']=os;a={'requestedPID':701,'boot':'boot','listedProcIdentity':{'device':1,'inode':701},'identityBound':True}
 try:g['process_record'](701,'boot',a)
 except (OSError,UnicodeError,RuntimeError):pass
 else:raise AssertionError('actual read failure accepted')
 e=a['failedReadError'];stage=a['failedReadSubphase'];observed[mode]={'phase':stage,'errno':getattr(e,'errno',None),'type':type(e).__name__}
 if x.get('legacy') and mode in ['read-close','decode-close','limit-close']:assert isinstance(e,FileNotFoundError) and e.errno==errno.ENOENT
 elif mode in ['read-close','fd-target-close']:assert isinstance(e,PermissionError) and e.errno==errno.EACCES
 elif mode=='decode-close':assert isinstance(e,UnicodeDecodeError)
 elif mode=='limit-close':assert isinstance(e,RuntimeError) and str(e)=='R29_CLEANUP_PROCESS_READ_LIMIT'
 if mode in ['read-close','decode-close','limit-close']:assert stage=='CMDLINE_READ'
 elif mode=='fd-target-close':assert stage=='FD_TARGET_READLINK'
 else:assert stage=='FD_SCANDIR_CLOSE'
assert 'PRIVATE_' not in json.dumps(observed);print(json.dumps({'cases':len(observed),'actualLinuxIO':False,'legacyDefectsPreserved':bool(x.get('legacy'))}))
`;
test('actual process_record preserves first read/decode/limit errors and exact scanner-close label; legacy defects remain evidence',()=>{const old=legacy21Programs();for(const [legacy,program] of [[true,old.native],[false,native()],[false,build()]]){const r=python(recordFixture,{source:program,phases,legacy});assert.equal(r.cases,5);assert.equal(r.actualLinuxIO,false);}});
test('untrusted private subphase cannot enter public incomplete rows and all held FDs still close',()=>{for(const [program,isBuild] of [[native(),false],[build(),true]]){const r=python(censusFixture,{source:program,phases,build:isBuild,badSubphase:true});assert.equal(r.cases,15);assert.equal(r.rawPrivateDataExported,false);}});
