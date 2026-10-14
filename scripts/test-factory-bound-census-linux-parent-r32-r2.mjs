import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {startBoundCensusLinuxR32R2 as run,boundCensusLinuxR32R2Scope as S,boundCensusLinuxR32R2Journal as JP,boundCensusLinuxR32R2HostProgram as host} from './start-factory-bound-census-linux-r32-r2.mjs';
import {boundProcessCensusR32NativeProgram} from './factory-bound-process-census-r32.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const python='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
function context(){
 const inputs=new Map([S.owner.path,S.fixture.path,S.generator.path,S.transport.path,S.starterPath].map(p=>[p,readFileSync(p)]));
 const review={kind:'r32-bound-census-linux-parent-independent-local-review-r2',ownerSHA256:S.owner.sha256,starterSHA256:sha(inputs.get(S.starterPath)),staticPreparationReady:true,remainingP0P1:0,remoteOperations:false,actualLinuxQualificationPassed:false};
 const reviewRaw=Buffer.from(JSON.stringify(review));inputs.set('controlled-r2-review',reviewRaw);
 const activation={kind:'r32-bound-census-linux-reviewed-activation-r2',remoteExecutionAuthorized:true,nonce:'a'.repeat(32),starterSHA256:review.starterSHA256,review:{path:'controlled-r2-review',sha256:sha(reviewRaw)}};
 let journal=null;const trace=[],root=[];
 const frame=p=>({schemaVersion:1,kind:'r32-bound-census-linux-parent-observation-r2',nonce:p.nonce,phase:p.phase,
 ownerSHA256:p.ownerSHA256,fixtureSHA256:p.fixtureSHA256,generatedSHA256:p.generatedSHA256,activationSHA256:p.activationSHA256,onceSHA256:p.onceSHA256,
 readOnly:p.action==='check',dispatchSubmitted:true,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false,independentSubsetQualified:false,
 unit:{Id:'jarvis-bound-census-r32-r2-'+p.nonce+'.service',ActiveState:'active'},controlsStable:true,unitConfigVerified:true,unitProofSHA256:'b'.repeat(64),ownerScope:{complete:false}});
 const deps={readLocal:async p=>{trace.push(['read',p]);if(p===JP){if(!journal){let e=Error('absent');e.code='ENOENT';throw e}return Buffer.from(JSON.stringify(journal))}assert.ok(inputs.has(p),p);return inputs.get(p)},lock:async()=>{trace.push(['lock']);return{}},unlock:async()=>{trace.push(['unlock'])},writeWX:async(p,raw)=>{assert.equal(p,JP);assert.equal(journal,null);journal=JSON.parse(raw);trace.push(['wx'])},save:async q=>{journal=structuredClone(q);trace.push(['durable'])},readRoot:async(p,program)=>{root.push(p);trace.push(['root',p.action]);assert.equal(program,host());return JSON.stringify(frame(p))},receipt:async()=>({path:'controlled-r2-receipt',sha256:'c'.repeat(64)}),now:()=>1791854500000};
 return{inputs,activation,trace,root,deps,frame,get journal(){return journal},set journal(v){journal=v}};
}
test('R2 default null qualification refuses before source/journal/remote hooks',async()=>{
 const deny=()=>{throw Error('must not call')};const v=await run({action:'start'},{readLocal:deny,readRoot:deny,lock:deny,writeWX:deny,save:deny});assert.equal(v.ready,false);assert.equal(v.remoteOperations,false);
});
test('R2 activated DI path binds new base/unit/journal/source and durable intent before root',async()=>{
 const c=context();await run({action:'start',activation:c.activation},c.deps);
 assert.equal(JP,'.jarvis-dev/maintenance/factory-r32-bound-census-linux-r2-once.json');assert.equal(S.base,'/var/lib/jarvis-bound-census-linux-r32-r2');
 assert.deepEqual(c.trace.filter(v=>['wx','durable','root'].includes(v[0])).slice(0,3),[['wx'],['durable'],['root','start']]);
 assert.equal(c.journal.kind,'r32-bound-census-linux-once-r2');assert.equal(c.journal.dispatched,true);
 const p=c.root[0];assert.equal(p.fixtureSHA256,S.fixture.sha256);assert.equal(S.fixture.path,'scripts/factory-bound-census-linux-fixture-r32-r2.py');
 const decode=name=>JSON.parse(Buffer.from(p.files[name].base64,'base64'));
 assert.equal(decode('once.json').unit,'jarvis-bound-census-r32-r2-'+c.activation.nonce+'.service');assert.equal(decode('activation.json').kind,'r32-bound-census-root-activation-r2');
 for(const v of Object.values(p.files))assert.equal(sha(Buffer.from(v.base64,'base64')),v.sha256);
 assert.ok(c.trace.filter(v=>v[0]==='read').every(v=>v[1]!=='.jarvis-dev/maintenance/factory-r32-bound-census-linux-once.json'));
});
test('R2 old review/old journal reject and never dispatch',async()=>{
 const c=context();let old=JSON.parse(c.inputs.get('controlled-r2-review'));old.kind=old.kind.replace('-r2','');let b=Buffer.from(JSON.stringify(old));c.inputs.set('controlled-r2-review',b);c.activation.review.sha256=sha(b);
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/INDEPENDENT_REVIEW_REQUIRED/);assert.equal(c.journal,null);assert.equal(c.root.length,0);
 const d=context();await run({action:'start',activation:d.activation},d.deps);d.journal={...d.journal,kind:'r32-bound-census-linux-once'};
 await assert.rejects(run({action:'check',activation:d.activation},d.deps),/JOURNAL_CHANGED/);assert.equal(d.root.length,1);
});
test('R2 lost response only permits same nonce read and never retries start',async()=>{
 const c=context(),read=c.deps.readRoot;c.deps.readRoot=async p=>{c.root.push(p);throw Error('R32_BOUND_HOST_RESPONSE_INCOMPLETE_USE_CHECK')};
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/INCOMPLETE_USE_CHECK/);assert.equal(c.journal.startUncertain,true);
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/PRIOR_INTENT_ONLY_CHECK/);assert.equal(c.root.length,1);
 c.deps.readRoot=read;const value=await run({action:'check',activation:c.activation},c.deps);assert.equal(value.readOnly,true);assert.equal(c.root[1].nonce,c.root[0].nonce);assert.deepEqual(c.root[1].files,{});
});
test('R2 fixture source drift before dispatch and caller drift after reply cannot save acceptance',async()=>{
 const c=context();c.inputs.set(S.fixture.path,Buffer.from('old fixture bytes'));
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/LOCAL_SOURCES_CHANGED/);assert.equal(c.journal,null);assert.equal(c.root.length,0);
 const d=context();let receipts=0;d.deps.receipt=async()=>{receipts++;return{}};d.deps.readRoot=async p=>{d.inputs.set(S.starterPath,Buffer.from('changed'));return JSON.stringify(d.frame(p))};
 await assert.rejects(run({action:'start',activation:d.activation},d.deps),/LOCAL_SOURCE_READ_CHANGED/);assert.equal(receipts,0);assert.equal(d.journal.dispatched,false);
});
test('actual new controller rejects a claimed fixture success without ready/release provenance',async()=>{
 const c=context();c.deps.readRoot=async p=>JSON.stringify({...c.frame(p),fixture:{kind:'r32-bound-census-linux-subset-qualification-r2',phase:p.phase,fixtureQualified:true,readyHandshakeCompleted:false,releaseGateSent:false}});
 await assert.rejects(run({action:'start',activation:c.activation},c.deps),/R2_FIXTURE_SUCCESS_CHANGED/);assert.equal(c.journal.dispatched,false);
});
test('actual record/proof and safe_identity key orders are equivalent in a real R2 caller frame',async()=>{
 const program=String.raw`import errno,importlib.util,json,sys,types
spec=importlib.util.spec_from_file_location('f','scripts/factory-bound-census-linux-fixture-r32-r2.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
spec=importlib.util.spec_from_file_location('o','scripts/factory-bound-census-linux-owner-r32-r2.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
raw=sys.stdin.buffer.read();scope,hashes=f.load_functions(raw,'native');boot='328726a0-5495-4892-b0a6-2fa9de26242e'
class Scanner:
 def __enter__(self):return iter([])
 def __exit__(self,*args):return False
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self):self.fd=200;self.files={};self.exited=False
 def open(self,name,*args,**kw):
  if str(name)=='/proc/400':return 100
  if name=='fd':return 101
  self.fd+=1;fields=['S','300']+['0']*17+['77'];self.files[self.fd]=((('400 (fixture) '+' '.join(fields)) if name=='stat' else ('fixture\0' if name=='cmdline' else '0::/fixture'))).encode();return self.fd
 def read(self,fd,size):v=self.files[fd];self.files[fd]=b'';return v
 def fstat(self,fd):return types.SimpleNamespace(st_dev=160,st_ino=23,st_uid=1000)
 def stat(self,*args,**kw):
  if self.exited:raise FileNotFoundError(errno.ENOENT,'closed fixture path')
  return self.fstat(0)
 def close(self,fd):pass
 def readlink(self,name,**kw):return '/fixture' if name=='cwd' else '/usr/bin/python3'
 def scandir(self,fd):return Scanner()
class Poll:
 def register(self,fd,events):self.fd=fd
 def poll(self,timeout):return [(self.fd,17)]
os=FakeOS();scope['os']=os;scope['select']=types.SimpleNamespace(poll=Poll,POLLIN=1,POLLHUP=16)
a={'requestedPID':400,'boot':boot,'listedProcIdentity':{'device':160,'inode':23},'observedIdentity':None,'identityBound':True,'fd':0}
record=scope['process_record'](400,boot,a);identity=f.safe_identity(a);os.exited=True;proof=scope['pidfd_exit_proof'](400,a,boot)
assert list(identity)!=list(proof['processIdentity']) and identity==proof['processIdentity']
v={k:False for k in ['fullProtectionQualified','fullProcCensusExecuted','protectedInventoryRead','nodeACKRead','queueRead','productCodeExecuted','modelsInvoked','rawArgvExported','privateEnvironmentExported']}
v.update(schemaVersion=1,kind='r32-bound-census-linux-subset-qualification-r2',phase='native',fixtureQualified=True,requestedChildPID=400,childIdentity=identity,readyHandshakeCompleted=True,releaseGateSent=True,childReaped=True,descriptorClosed=True,signalsSent=False,fixturePhase='COMPLETE',firstReadSubphase=None,uid=1000,gid=1000,internalDeadlineSeconds=45,requiredParentDeadlineSeconds=90,readyProtocolSHA256=f.digest(f.CHILD_CODE),generatedSourceSHA256=f.digest(raw),functionSHA256=hashes,liveRecordRead=True,naturalChildExit=True,originalBoundExitProof=proof,alreadyDeadAttachRejected=True,alreadyDeadAttachErrno=errno.ESRCH)
o.validate_fixture_result_r2(v,'native',f.digest(raw),{'pid':300,'boot':boot});print(json.dumps(v,separators=(',',':')))`;
 const result=spawnSync(python,['-c',program],{input:boundProcessCensusR32NativeProgram(),encoding:'utf8'});assert.equal(result.status,0,result.stderr);const fixture=JSON.parse(result.stdout);
 assert.notDeepEqual(Object.keys(fixture.childIdentity),Object.keys(fixture.originalBoundExitProof.processIdentity));
 const c=context();const response=p=>{let f=structuredClone(fixture);let rawSHA=sha(Buffer.from(JSON.stringify(f)));return {...c.frame(p),fixture:f,fixtureProcess:{pid:300,boot:f.childIdentity.boot},reportSHA256:{'fixture.stdout.json':rawSHA},result:{fixtureResult:f,fixtureExitCode:0,fixturePIDFDClosed:true,fixtureEmergencyStopUsed:false,fixtureKernelExitProof:{processIdentity:{pid:300}},errorCode:null,fixtureStdoutSHA256:rawSHA}}};
 c.deps.readRoot=async p=>JSON.stringify(response(p));const v=await run({action:'start',activation:c.activation},c.deps);assert.equal(v.fixture.fixtureQualified,true);assert.equal(v.independentSubsetQualified,false);
 const oldSource=readFileSync('artifacts/software-factory/goals-r29/bound-parent-r2-cbf0c414.mjs','utf8');
 const from=oldSource.indexOf('export function assertBoundCensusLinuxR32R2Frame('),to=oldSource.indexOf('export function boundCensusLinuxR32R2HostProgram()',from);assert.ok(from>0&&to>from);
 const oldAssert=runInNewContext(oldSource.slice(from,to).replace('export function','function')+';assertBoundCensusLinuxR32R2Frame',{S,H:/^[a-f0-9]{64}$/,N:/^[a-f0-9]{32}$/,same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),need:(v,c)=>{if(!v)throw Error(c)}});
 assert.throws(()=>oldAssert(v,c.journal,false),/R2_FIXTURE_SUCCESS_CHANGED/);
 c.deps.readRoot=async p=>{let frame=response(p);frame.fixture.originalBoundExitProof.processIdentity.procInode=24;return JSON.stringify(frame)};
 await assert.rejects(run({action:'check',activation:c.activation},c.deps),/R2_FIXTURE_SUCCESS_CHANGED/);
});
test('new actual report validators agree on success/failure and reject scoped diagnostic/identity/proof mutations',()=>{
 const program=String.raw`import ast,copy,errno,importlib.util,json,re,sys
value=json.loads(sys.stdin.read());spec=importlib.util.spec_from_file_location('o','scripts/factory-bound-census-linux-owner-r32-r2.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
tree=ast.parse(value['host']);nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('r2_error_row','r2_child_identity','validate_fixture_result_r2') or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id.startswith('R2_') for t in n.targets)]
def need(v,c):
 if not v:raise RuntimeError(c)
s={'re':re,'errno':errno,'need':need};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-host-validator>','exec'),s)
source=open('scripts/factory-bound-census-linux-owner-r32-r2.py',encoding='utf8').read()
for n in ('r2_error_row','r2_child_identity','validate_fixture_result_r2'):
 segment=lambda text:next(ast.get_source_segment(text,x) for x in ast.parse(text).body if isinstance(x,ast.FunctionDef) and x.name==n)
 assert segment(source)==segment(value['host'])
boot='328726a0-5495-4892-b0a6-2fa9de26242e';fixture={'pid':300,'boot':boot};child={'pid':400,'ppid':300,'startTicks':'77','boot':boot,'procDevice':160,'procInode':23}
falsekeys=['fullProtectionQualified','fullProcCensusExecuted','protectedInventoryRead','nodeACKRead','queueRead','productCodeExecuted','modelsInvoked','rawArgvExported','privateEnvironmentExported']
good={k:False for k in falsekeys};good.update(schemaVersion=1,kind='r32-bound-census-linux-subset-qualification-r2',phase='native',fixtureQualified=True,requestedChildPID=400,childIdentity=child,readyHandshakeCompleted=True,releaseGateSent=True,childReaped=True,descriptorClosed=True,signalsSent=False,fixturePhase='COMPLETE',firstReadSubphase=None,uid=1000,gid=1000,internalDeadlineSeconds=45,requiredParentDeadlineSeconds=90,readyProtocolSHA256=o.R2_READY_PROTOCOL_SHA,generatedSourceSHA256=value['generated'],functionSHA256=o.R2_FUNCTION_SHA,liveRecordRead=True,naturalChildExit=True,alreadyDeadAttachRejected=True,alreadyDeadAttachErrno=errno.ESRCH)
good['originalBoundExitProof']={'pid':400,'boot':boot,'listedProcIdentity':{'device':160,'inode':23},'processIdentity':copy.deepcopy(child),'kernelProof':{'type':'pidfd-POLLIN','attached':True,'identityBound':True,'requestedPID':400,'exitConfirmed':True,'pollEvents':17,'procPathAbsent':True}}
bad={k:False for k in falsekeys};bad.update(schemaVersion=1,kind=good['kind'],phase='native',fixtureQualified=False,requestedChildPID=None,childIdentity=None,readyHandshakeCompleted=False,releaseGateSent=False,childReaped=False,descriptorClosed=False,signalsSent=False,fixturePhase='SOURCE_FUNCTIONS',firstReadSubphase=None,rawErrorExported=False,errorCode='R32_FIXTURE_INCOMPLETE',errno=2,secondaryFailures=[])
validators=[o.validate_fixture_result_r2,s['validate_fixture_result_r2']]
def accept(v):
 for fn in validators:assert fn(v,'native',value['generated'],fixture)==v
def reject(v):
 for fn in validators:
  try:fn(v,'native',value['generated'],fixture)
  except (RuntimeError,KeyError,TypeError):pass
  else:raise AssertionError('inconsistent protocol accepted')
accept(good);accept(bad)
partial=copy.deepcopy(bad);partial.update(requestedChildPID=400,childIdentity={**child,'ppid':None,'startTicks':None},readyHandshakeCompleted=True,fixturePhase='PROCESS_RECORD',firstReadSubphase='CMDLINE_READ');accept(partial)
for key,replacement in [('readyHandshakeCompleted',False),('releaseGateSent',False),('firstReadSubphase','CMDLINE_READ'),('signalsSent',True),('schemaVersion',True),('readyProtocolSHA256','0'*64),('generatedSourceSHA256','0'*64),('alreadyDeadAttachErrno',errno.EPERM),('requestedChildPID',401)]:
 v=copy.deepcopy(good);v[key]=replacement;reject(v)
v=copy.deepcopy(good);v['functionSHA256']['process_record']='0'*64;reject(v)
for key,replacement in [('ppid',301),('boot','00000000-0000-0000-0000-000000000000'),('startTicks',None)]:
 v=copy.deepcopy(good);v['childIdentity'][key]=replacement;reject(v)
for key,replacement in [('pollEvents',True),('procPathAbsent',False),('requestedPID',401)]:
 v=copy.deepcopy(good);v['originalBoundExitProof']['kernelProof'][key]=replacement;reject(v)
v=copy.deepcopy(good);v['originalBoundExitProof']['listedProcIdentity']['inode']=24;reject(v)
for key,replacement in [('fixturePhase','/private/path'),('firstReadSubphase','/private/path'),('errno',True),('errorCode','private payload'),('secondaryFailures',[{'raw':'private'}])]:
 v=copy.deepcopy(bad);v[key]=replacement;reject(v)
v=copy.deepcopy(partial);v['requestedChildPID']=401;reject(v)
v=copy.deepcopy(bad);v['releaseGateSent']=True;reject(v)
print(json.dumps({'positiveFixtures':3,'negativeMutations':24,'validators':2,'remoteOperations':False,'actualLinux':False}))`;
 const r=spawnSync(python,['-c',program],{input:JSON.stringify({host:host(),generated:S.generated.native}),encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).actualLinux,false);
});
test('R2 parent preserves old security/lifecycle helpers and budgets; no package or inventory execution',()=>{
 const program=String.raw`import ast,json,sys
v=json.loads(sys.stdin.read());old=open('scripts/factory-bound-census-linux-owner-r32.py',encoding='utf8').read();new=open('scripts/factory-bound-census-linux-owner-r32-r2.py',encoding='utf8').read()
for name in ('need','sha','key','root_directory','read_control','save_bytes_work','save_work','runtime','process_identity','fixture_record','bind_fixture','fixture_poll','fixture_exit_proof','finish_fixture'):
 def body(text):return next(ast.get_source_segment(text,n) for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name==name)
 assert body(old)==body(new),name
ast.parse(v['host']);assert 'User=1000' in v['host'] and 'RuntimeMaxSec=80' in v['host'] and 'TimeoutStopSec=10' in v['host'] and 'NoNewPrivileges=yes' in v['host']
assert 'exec(compile(' not in v['host'] and 'sqlite3' not in v['host'];assert 'validate_fixture_result_r2(result, activation[' in new
print(json.dumps({'retainedHelperBodies':14,'syntax':True,'remoteOperations':False}))`;
 const r=spawnSync(python,['-c',program],{input:JSON.stringify({host:host()}),encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).retainedHelperBodies,14);
 assert.equal(S.runtimeMaxSec+S.timeoutStopSec,S.hardParentBoundSeconds);assert.equal(S.uid,1000);assert.equal(S.gid,1000);
});
