import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {startBoundCensusLinuxR32 as run,boundCensusLinuxR32Scope as S,boundCensusLinuxR32Journal as JP,boundCensusLinuxR32HostProgram as host} from './start-factory-bound-census-linux-r32.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
function context(){
 const inputs=new Map([S.owner.path,S.fixture.path,S.generator.path,S.transport.path,S.starterPath].map(p=>[p,readFileSync(p)]));
 const review={kind:'r32-bound-census-linux-parent-independent-local-review',ownerSHA256:S.owner.sha256,starterSHA256:sha(inputs.get(S.starterPath)),staticPreparationReady:true,remainingP0P1:0,remoteOperations:false,actualLinuxQualificationPassed:false};
 const reviewRaw=Buffer.from(JSON.stringify(review));inputs.set('controlled-review',reviewRaw);
 const activation={kind:'r32-bound-census-linux-reviewed-activation',remoteExecutionAuthorized:true,nonce:'a'.repeat(32),starterSHA256:review.starterSHA256,review:{path:'controlled-review',sha256:sha(reviewRaw)}};
 let journal=null;const trace=[];const root=[];
 const frame=(p)=>({schemaVersion:1,kind:'r32-bound-census-linux-parent-observation',nonce:p.nonce,phase:p.phase,
  ownerSHA256:p.ownerSHA256,fixtureSHA256:p.fixtureSHA256,generatedSHA256:p.generatedSHA256,activationSHA256:p.activationSHA256,onceSHA256:p.onceSHA256,
  readOnly:p.action==='check',dispatchSubmitted:true,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false,independentSubsetQualified:false,
  unit:{Id:'jarvis-bound-census-r32-'+p.nonce+'.service',ActiveState:'active'},controlsStable:true,unitConfigVerified:true,unitProofSHA256:'b'.repeat(64),ownerScope:{complete:false}});
 const deps={readLocal:async p=>{trace.push(['read',p]);if(p===JP){if(!journal){const e=Error('absent');e.code='ENOENT';throw e}return Buffer.from(JSON.stringify(journal));}assert.ok(inputs.has(p),p);return inputs.get(p);},
  lock:async()=>{trace.push(['lock']);return{}},unlock:async()=>{trace.push(['unlock'])},writeWX:async(p,raw)=>{assert.equal(p,JP);assert.equal(journal,null);journal=JSON.parse(raw);trace.push(['wx'])},save:async q=>{journal=structuredClone(q);trace.push(['durable'])},
  readRoot:async(p,program)=>{root.push(p);trace.push(['root',p.action]);assert.equal(program,host());return JSON.stringify(frame(p))},
  receipt:async()=>({path:'controlled-receipt',sha256:'c'.repeat(64)}),now:()=>1791854500000};
 return{inputs,activation,trace,root,deps,frame,get journal(){return journal}};
}
test('null review refuses before any local, lock, journal or remote hook',async()=>{
 const deny=()=>{throw Error('must not call')};const v=await run({action:'start'},{readLocal:deny,lock:deny,writeWX:deny,save:deny,readRoot:deny});assert.equal(v.ready,false);assert.equal(v.remoteOperations,false);
});
test('actual caller durable intent precedes root start and captures fixed five files',async()=>{
 const c=context();const v=await run({action:'start',activation:c.activation},c.deps);
 assert.deepEqual(c.trace.filter(x=>['wx','durable','root'].includes(x[0])).slice(0,3),[['wx'],['durable'],['root','start']]);
 assert.deepEqual(Object.keys(c.root[0].files).sort(),['activation.json','fixture.py','generated.py','once.json','owner.py']);
 assert.equal(c.journal.dispatched,true);assert.equal(v.actualLinuxQualificationPassed,false);assert.equal(v.independentSubsetQualified,false);
 for(const body of Object.values(c.root[0].files))assert.equal(sha(Buffer.from(body.base64,'base64')),body.sha256);
});
test('source drift refuses before lock and journal/remote operations',async()=>{
 const c=context();c.inputs.set(S.fixture.path,Buffer.from('bad'));
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/LOCAL_SOURCES_CHANGED/);assert.equal(c.journal,null);assert.equal(c.root.length,0);assert.ok(!c.trace.some(x=>x[0]==='lock'));
});
test('transport source drift is rejected before journal or SSH',async()=>{
 const c=context();c.inputs.set(S.transport.path,Buffer.from('changed helper'));
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/LOCAL_SOURCES_CHANGED/);assert.equal(c.root.length,0);assert.equal(c.journal,null);assert.ok(!c.trace.some(x=>x[0]==='lock'));
});
test('failed durable save leaves intent and never starts root',async()=>{
 const c=context();c.deps.save=async()=>{throw Error('durability failed')};
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/durability failed/);assert.notEqual(c.journal,null);assert.equal(c.root.length,0);
});
test('lost start response cannot redispatch; same nonce check reconciles through real string adapter',async()=>{
 const c=context();const actualRead=c.deps.readRoot;c.deps.readRoot=async(p,program)=>{c.root.push(p);c.trace.push(['root',p.action]);throw Error('R32_BOUND_HOST_RESPONSE_INCOMPLETE_USE_CHECK')};
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/RESPONSE_INCOMPLETE/);assert.equal(c.journal.startUncertain,true);
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/PRIOR_INTENT_ONLY_CHECK/);assert.equal(c.root.length,1);
 c.deps.readRoot=actualRead;const v=await run({action:'check',activation:c.activation},c.deps);assert.equal(c.root.length,2);assert.deepEqual(c.root[1].files,{});assert.equal(c.root[1].nonce,c.root[0].nonce);assert.equal(v.readOnly,true);assert.equal(c.journal.startUncertain,false);
});
test('same intent cannot switch phase or root unit proof',async()=>{
 const c=context();await run({action:'start',activation:c.activation},c.deps);
 await assert.rejects(run({action:'check',phase:'build',activation:c.activation},c.deps),/JOURNAL_CHANGED/);assert.equal(c.root.length,1);
 c.deps.readRoot=async p=>JSON.stringify({...c.frame(p),unitProofSHA256:'d'.repeat(64)});
 await assert.rejects(run({action:'check',activation:c.activation},c.deps),/FROZEN_UNIT_PROOF_CHANGED/);
});
test('missing actual systemd configuration cannot become a successful frame',async()=>{
 const c=context();c.deps.readRoot=async p=>JSON.stringify({...c.frame(p),unitConfigVerified:false});
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/ACTUAL_FRAME_CHANGED/);assert.equal(c.journal.dispatched,false);
});
test('source mutation after root reply prevents receipt publication',async()=>{
 const c=context();let receipts=0;c.deps.receipt=async()=>{receipts++;return{path:'none',sha256:'c'.repeat(64)}};
 c.deps.readRoot=async p=>{c.inputs.set(S.starterPath,Buffer.from('changed'));return JSON.stringify(c.frame(p))};
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/LOCAL_SOURCE_READ_CHANGED/);assert.equal(receipts,0);assert.equal(c.journal.dispatched,false);
});
test('generated root controller parses; fixed UID1000 and 80+10 budgets are explicit',()=>{
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:host(),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 assert.equal(S.runtimeMaxSec+S.timeoutStopSec,S.hardParentBoundSeconds);assert.match(host(),/User=1000/);assert.match(host(),/KillSignal=SIGKILL/);assert.match(host(),/NoNewPrivileges=yes/);assert.match(host(),/PrivateNetwork=yes/);
 assert.ok(!host().includes('exec(compile('));assert.ok(!host().includes('sqlite3'));
});
test('actual generated exec parser rejects second commands, different path, ignore-errors and duplicate argv',()=>{
 const program=String.raw`import ast,json,re,sys
tree=ast.parse(sys.stdin.read())
def need(v,c):
 if not v:raise RuntimeError(c)
scope={'re':re,'need':need}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='argv_of']
assert len(nodes)==1
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-parser>','exec'),scope)
good='{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 -I /fixed/owner.py --run fixed ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }'
assert scope['argv_of'](good)==['/usr/bin/python3','-I','/fixed/owner.py','--run','fixed']
bad=[good+' ; '+good,good.replace('path=/usr/bin/python3','path=/other'),good.replace('ignore_errors=no','ignore_errors=yes'),good.replace(' ; ignore_errors=',' ; argv[]=other ; ignore_errors='),good.replace(' ; pid=0',' ; secret=data ; pid=0')]
for value in bad:
 try:scope['argv_of'](value)
 except RuntimeError as e:assert str(e)=='R32_BOUND_HOST_UNIT_COMMAND_UNKNOWN'
 else:raise AssertionError('unsafe command accepted')
`;
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',program],{input:host(),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
test('actual parent PIDFD helpers bind before reads and preserve unknown/exit/signal facts',()=>{
 const program=String.raw`import ast,errno,sys,types,subprocess
tree=ast.parse(sys.stdin.read())
names={'bind_fixture','fixture_exit_proof','finish_fixture'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert len(nodes)==3
def need(v,c):
 if not v:raise RuntimeError(c)
class P:
 def __init__(self,*args):pass
 def read_text(self):return 'boot'
trace=[]
identity={'pid':11,'ppid':10,'boot':'boot','procDevice':1,'procInode':2,'startTicks':'123'}
owner={'pid':10,'boot':'boot'}
fake=types.SimpleNamespace(stat=lambda *args,**kwargs:types.SimpleNamespace(st_dev=1,st_ino=2),pidfd_open=lambda *args:(trace.append('attach') or 0))
scope={'os':fake,'Path':P,'errno':errno,'need':need,'select':types.SimpleNamespace(POLLIN=1),'fixture_record':lambda *args:(trace.append('record') or identity),'fixture_poll':lambda fd:1,'subprocess':subprocess,'signal':types.SimpleNamespace(SIGKILL=9)}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-parent-pidfd>','exec'),scope)
held={};process=types.SimpleNamespace(pid=11)
assert scope['bind_fixture'](process,owner,[],held)==identity and held['fd']==0 and trace==['attach','record']
def absent(*args,**kwargs):raise FileNotFoundError(errno.ENOENT,'closed')
fake.stat=absent
proof=scope['fixture_exit_proof'](held,owner);assert proof['exitConfirmed'] and proof['requestedPID']==11
scope['fixture_poll']=lambda fd:0
try:scope['fixture_exit_proof'](held,owner)
except RuntimeError as e:assert str(e).endswith('EXIT_NOT_PROVED')
else:raise AssertionError('live process accepted')
scope['fixture_poll']=lambda fd:1;fake.stat=lambda *args,**kwargs:types.SimpleNamespace(st_dev=1,st_ino=2)
try:scope['fixture_exit_proof'](held,owner)
except RuntimeError as e:assert str(e).endswith('EXIT_PID_PRESENT')
else:raise AssertionError('reused/present PID accepted')
def closed(fd):raise OSError(errno.EBADF,'closed')
scope['fixture_poll']=closed
try:scope['fixture_exit_proof'](held,owner)
except OSError as e:assert e.errno==errno.EBADF
else:raise AssertionError('closed PIDFD accepted')
count=[0]
def drift(*args,**kwargs):
 count[0]+=1
 return types.SimpleNamespace(st_dev=1,st_ino=2 if count[0]==1 else 3)
fake.stat=drift;newheld={}
try:scope['bind_fixture'](process,owner,[],newheld)
except RuntimeError as e:assert str(e).endswith('ATTACH_IDENTITY_CHANGED')
else:raise AssertionError('identity drift accepted')
assert newheld['fd']==0 and 'identity' not in newheld
scope['fixture_poll']=lambda fd:0
process=types.SimpleNamespace(pid=11,poll=lambda:None,communicate=lambda **kw:(_ for _ in ()).throw(subprocess.TimeoutExpired('owned',6)))
scope['signal'].pidfd_send_signal=lambda *args:(_ for _ in ()).throw(OSError(errno.EPERM,'not sent'))
try:scope['finish_fixture'](process,held,owner,[])
except OSError:assert held['emergencyStopAttempted'] is True
else:raise AssertionError('failed emergency signal became normal exit')
`;
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',program],{input:readFileSync(S.owner.path),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
test('actual root directory creator restores exact modes despite restrictive umask',()=>{
 const program=String.raw`import ast,types,sys
from pathlib import Path
tree=ast.parse(sys.stdin.read())
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='make_root_dir'];assert len(nodes)==1
for requested in [0o711,0o755]:
 trace=[];metadata={'mode':0o700}
 def need(v,c):
  if not v:raise RuntimeError(c)
 def record(*args,**kw):return types.SimpleNamespace(st_mode=metadata['mode'],st_uid=0,st_gid=0,st_dev=1,st_ino=2)
 def chmod(fd,mode):metadata['mode']=mode;trace.append(('chmod',mode))
 fake=types.SimpleNamespace(O_RDONLY=0,O_DIRECTORY=1,O_NOFOLLOW=2,mkdir=lambda *a,**kw:trace.append(('mkdir',kw['mode'])),open=lambda *a,**kw:5,fstat=record,stat=record,fchmod=chmod,fsync=lambda fd:trace.append(('fsync',fd)),close=lambda fd:trace.append(('close',fd)))
 scope={'held':lambda path:4,'os':fake,'stat':types.SimpleNamespace(S_ISDIR=lambda mode:True,S_IMODE=lambda mode:mode),'need':need,'key':lambda v:(v.st_dev,v.st_ino,v.st_uid,v.st_gid,v.st_mode)}
 exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-root-mkdir>','exec'),scope);scope['make_root_dir'](Path('/fixed/new'),requested)
 assert metadata['mode']==requested and trace.index(('chmod',requested))<trace.index(('fsync',5)) and ('fsync',4) in trace
 assert trace.count(('close',5))==trace.count(('close',4))==1
`;
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',program],{input:host(),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
