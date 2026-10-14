/** Actual generated functions with controlled fixtures only. No remote/container/product execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {buildEvidenceHostProgramR32 as program,assertBuildEvidenceHostR32 as qualify,buildEvidenceR32Pins as P,buildEvidenceR32Stages as stages} from './factory-build-evidence-host-r32.mjs';
import {buildCleanupR29Scope as old} from './verify-factory-truth-gate-build-cleanup-r29.mjs';import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
const clone=v=>JSON.parse(JSON.stringify(v)),H='a'.repeat(64),attempt='a'.repeat(32),original=JSON.parse(await readFile('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json','utf8'));
export const fixtureB={...old,...P,attempt};fixtureB.startScope={...Object.fromEntries(['source','fingerprint','sourceFiles','sourceBytes','metadataSHA','sourceIdentity','sourceOrigin','sourceOriginSHA256','root','tool','toolSHA','qaManifestSHA256','sourcePreparationSHA256'].map(k=>[k,fixtureB[k]])),reviewSHA256:H,starterSHA256:H,rendererSHA256:H};
const counts=n=>({tests:n,pass:n,fail:0,cancelled:0,skipped:0,todo:0});
function host(){
 const h=clone(original.observations.oldBuild);h.attempt=attempt;h.source={sha256:P.fingerprint,files:625,bytes:P.sourceBytes,metadataSHA:P.metadataSHA,identity:clone(P.sourceIdentity),stable:true};h.installedToolSHA256=P.toolSHA;h.work.entries=625;
 const unit='jarvis-tg-r32-'+attempt+'-owner.service';h.owner.unit.Id=unit;h.owner.cgroupPath='/system.slice/'+unit;h.procScope.includesOwnedContainerCgroups=true;h.procScope.workspace=P.root+'/'+attempt;for(const s of h.scans)s.containerCgroupProcesses=[];
 const names=stages.map(n=>'jarvis-tg-r32-'+attempt+'-'+n);h.docker.exactNames=names;h.docker.absentNames=names;h.docker.labelScopes[0].filters=['label=jarvis.truthgate.r32.attempt='+attempt];h.docker.labelScopes[1].filters=['label=jarvis.truthgate.r32.attempt='+attempt,'label=jarvis.truthgate.r32.kind=build'];
 Object.assign(h,{sourceOriginSHA256:P.sourceOriginSHA256,sourcePreparationSHA256:P.sourcePreparationSHA256,qaTools:{identity:{device:66306,inode:234567},manifestSHA256:P.qaManifestSHA256,files:Object.fromEntries(['baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'].map(n=>[n,{sha256:H,bytes:42}])),uid:0,mode:365,entries:4,nofollow:true,stable:true},buildResultStatus:'pass',noRecordedResultStages:[],noRecordedResultExecutionState:'unknown',logEvidenceDoubleRead:true,unrecordedStageLogs:[],creationIntentStage:'targeted-pure',executionIdentityUnknownStage:null,containerCgroupIdentityComplete:true});
 h.stageResults=stages.map((id,i)=>({id,executed:true,candidateCodeExecuted:id!=='mount-proof',status:'pass',exitCode:0,timeout:false,logLimitExceeded:false,containerID:String(i+1).repeat(64),logSHA256:H,logBytes:100,rawLogsExported:false,mountsAndSandboxFlagsActuallyVerified:true,independentLogVerified:true,compilerDiagnosticCodes:[],tests:null,...(['truth-unit','targeted-pure'].includes(id)?{tests:counts(id==='truth-unit'?16:26),actualTAPCounts:counts(id==='truth-unit'?16:26),expectedTests:id==='truth-unit'?16:26,testCountsComplete:true}:{})}));
 h.bootstrapExpected=['/corepack-runtime','/corepack-cache','/pnpm-store','/qa-tools'].map((root,i)=>({root,device:66306,inode:i===3?234567:100+i,path:i===3?'targeted-pure.mjs':'package.json',sha256:H,bytes:42,mode:292}));h.normalBindBootstrap={schemaVersion:1,kind:'r32-normal-bind-bootstrap',uid:1000,gid:1000,caches:h.bootstrapExpected.map(e=>({...e,readOnlyMount:true,mutationRejected:true,bytesVerified:true})),workWritable:true,candidateCodeExecuted:false};return h;
}
function py(code,payload={}){const r=spawnSync('python',['-c',code],{input:JSON.stringify({source:program(fixtureB),B:fixtureB,...payload}),encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
test('fixed source/namespace/tool/QA/origin and actual owner are checked before generation',()=>{
 for(const edit of [b=>{b.source+='/other'},b=>{b.metadataSHA=H},b=>{b.sourceIdentity.inode++},b=>{b.toolSHA=H},b=>{b.sourceOriginSHA256=H},b=>{b.qaManifestSHA256=H},b=>{b.ownerPID=null},b=>{b.ownerStartTicks=null},b=>{b.startScope.source+='/other'}]){const b=clone(fixtureB);edit(b);assert.throws(()=>program(b),/^Error: R32_EVIDENCE_/);}
});

test('full six-stage controlled evidence can pass while product acceptance is not asserted',()=>{const f=qualify(host(),fixtureB);assert.equal(f.buildResourcesIndependentlyClean,true);assert.equal(f.buildStagePass,true);assert.equal(f.stageEvidenceValidated,true);assert.equal(f.sourceValidated,true);assert.equal(f.productAccepted,undefined);});

test('actual build failure and independent resource cleanup are separate results',()=>{const h=host();h.buildResultStatus='fail';h.stageResults[2].status='fail';h.stageResults[2].exitCode=2;const f=qualify(h,fixtureB);assert.equal(f.buildStagePass,false);assert.equal(f.buildResourcesIndependentlyClean,true);});

test('creation intent without recorded container identity stays unknown even with six absent names',()=>{const h=host();h.buildResultStatus='fail';h.stageResults.pop();h.noRecordedResultStages=['targeted-pure'];h.executionIdentityUnknownStage='targeted-pure';h.containerCgroupIdentityComplete=false;h.nativeProcessAndSocketCleanupVerified=false;h.unrecordedStageLogs=[{id:'targeted-pure',sha256:H,bytes:120}];const f=qualify(h,fixtureB);assert.equal(f.buildResourcesIndependentlyClean,false);assert.equal(f.executionIdentityUnknownStage,'targeted-pure');h.containerCgroupIdentityComplete=true;assert.throws(()=>qualify(h,fixtureB),/CONTAINER_IDENTITY_FLAG_CHANGED/);});

test('identity-bound pidfd exit keeps whole-proc count closed; unbound/reused/POLLERR reject',()=>{const h=host(),s=h.scans[0],pid=s.inspectedPIDs.find(n=>n!==h.node.pid);s.inspectedPIDs=s.inspectedPIDs.filter(n=>n!==pid);s.counts.inspected--;s.counts.pidfdProvenExits++;s.exitedDuringScan=[{pid,boot:h.node.boot,listedProcIdentity:{device:24,inode:123},processIdentity:{pid,boot:h.node.boot,procDevice:24,procInode:123},kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:pid,exitConfirmed:true,procPathAbsent:true,pollEvents:1}}];assert.equal(qualify(h,fixtureB).buildResourcesIndependentlyClean,true);for(const edit of [e=>{e.kernelProof.identityBound=false},e=>{e.kernelProof.procPathAbsent=false},e=>{e.kernelProof.pollEvents=8},e=>{e.processIdentity.procInode++}]){const bad=clone(h);edit(bad.scans[0].exitedDuringScan[0]);assert.throws(()=>qualify(bad,fixtureB),/PIDFD_PROOF_INVALID/);}});

test('assembled production Python parses and keeps original process_record/exit proof bytes',()=>{
 const p=program(fixtureB),native=targetCleanupR29HostProgram(),a=native.indexOf('def process_record('),z=native.indexOf('def census():');assert.ok(p.includes(native.slice(a,z)));assert.ok(p.includes('signal.alarm(150)'));assert.ok(p.indexOf('TERMINAL_NOT_READY')<p.indexOf('scan_before=census()'));assert.ok(p.indexOf('qa_before=read_qa()')<p.indexOf('scan_before=census()'));assert.ok(p.indexOf('qa_after=read_qa()')>p.indexOf('scan_after=census()'));assert.ok(p.includes('container_identity_complete and not scan_before'));assert.ok(!p.includes('--reconcile-cleanup'));assert.ok(!p.includes('importlib'));assert.ok(!p.includes("['rm'"));assert.equal(py('import ast,sys,json;x=json.loads(sys.stdin.buffer.read().decode("utf8"));ast.parse(x["source"]);print("AST_OK")'),'AST_OK');
});

test('actual generated stage/log/TAP/strict-bootstrap guards qualify safe fixtures and reject stale/duplicate/partial fake pass',()=>{
 assert.equal(py(String.raw`
import ast,sys,json,re,hashlib,copy
from pathlib import Path
x=json.loads(sys.stdin.buffer.read().decode('utf8'));p=x['B'];tree=ast.parse(x['source']);a=next(i for i,s in enumerate(tree.body) if isinstance(s,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='stages' for t in s.targets));z=next(i for i,s in enumerate(tree.body) if isinstance(s,ast.FunctionDef) and s.name=='work_state');defs=[s for s in tree.body if isinstance(s,ast.FunctionDef) and s.name in ['strict_json','typed_equal']];code=compile(ast.Module(body=defs+tree.body[a:z],type_ignores=[]),'actual-stage-log-guards','exec')
def need(ok,code):
 if not ok:raise RuntimeError(code)
base=x['host'];expected=base['bootstrapExpected'];checks=base['stageResults'];raws={};root=Path('/bounded/fake-attempt')
for c in checks:
 raw=json.dumps(base['normalBindBootstrap']).encode() if c['id']=='mount-proof' else (('\n'.join('# '+k+' '+str(v) for k,v in c['tests'].items())+'\n').encode() if c['tests'] is not None else b'bounded compile log\n');raws[c['id']]=raw;c['logSHA256']=hashlib.sha256(raw).hexdigest();c['logBytes']=len(raw)
def run(change=None):
 state={'status':'pass','checks':copy.deepcopy(checks),'noRecordedResultStages':[],'noRecordedResultExecutionState':'unknown','normalBindBootstrap':copy.deepcopy(base['normalBindBootstrap']),'creationIntent':{'stage':'targeted-pure','name':'jarvis-tg-r32-'+p['attempt']+'-targeted-pure'}};logs=copy.deepcopy(raws)
 if change:change(state,logs)
 env={'p':p,'state':state,'bootstrap_expected':expected,'attempt_root':root,'need':need,'re':re,'json':json,'digest':lambda b:hashlib.sha256(b).hexdigest(),'private_read':lambda path,limit:logs[path.stem],'os':type('OS',(),{'path':type('PATH',(),{'lexists':lambda path:path.stem in logs})})};exec(code,env);return env
assert len(run()['stage_results'])==6
def changed_log(state,logs):logs['build']+=b'drift'
def zero(state,logs):
 logs['targeted-pure']=b'# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';c=state['checks'][5];c.update(logSHA256=hashlib.sha256(logs['targeted-pure']).hexdigest(),logBytes=len(logs['targeted-pure']),tests=None)
def duplicate(state,logs):
 logs['mount-proof']=logs['mount-proof'].replace(b'"uid": 1000',b'"uid": 1000,"uid":1000');c=state['checks'][0];c.update(logSHA256=hashlib.sha256(logs['mount-proof']).hexdigest(),logBytes=len(logs['mount-proof']))
def partial_pass(state,logs):
 logs['targeted-pure']=b'not a TAP summary';c=state['checks'][5];c.update(logSHA256=hashlib.sha256(logs['targeted-pure']).hexdigest(),logBytes=len(logs['targeted-pure']),tests=None)
for change in [changed_log,zero,duplicate,partial_pass]:
 try:run(change)
 except RuntimeError as e:assert str(e).startswith('R32_EVIDENCE_')
 else:raise AssertionError('invalid stage passed')
def partial_fail(state,logs):partial_pass(state,logs);state['status']='fail';state['checks'][5].update(status='fail',exitCode=1)
r=run(partial_fail);assert r['stage_results'][5]['tests'] is None and r['stage_results'][5]['testCountsComplete'] is False
print('ACTUAL_LOG_GUARDS_6_CLOSED')
`,{host:host()}),'ACTUAL_LOG_GUARDS_6_CLOSED');
});

test('actual six-container Docker census issues exactly twelve readonly queries and keeps label-volume survivors',()=>{
 assert.equal(py(String.raw`
import ast,sys,json,re
from types import SimpleNamespace
x=json.loads(sys.stdin.buffer.read().decode('utf8'));p=x['B'];tree=ast.parse(x['source']);fn=next(s for s in tree.body if isinstance(s,ast.FunctionDef) and s.name=='docker_census');names=['jarvis-tg-r32-'+p['attempt']+'-'+n for n in ['mount-proof','offline-install','build','typecheck','truth-unit','targeted-pure']];calls=[];survive=False
def need(ok,code):
 if not ok:raise RuntimeError(code)
def docker(args):
 calls.append(args)
 if args[:2]==['container','inspect']:return SimpleNamespace(returncode=1,stdout=b'[]',stderr=('Error: No such container: '+args[2]).encode())
 return SimpleNamespace(returncode=0,stdout=b'pending\n' if survive and args[:3]==['volume','ls','-q'] else b'',stderr=b'')
env={'p':p,'names':names,'need':need,'docker':docker,'re':re,'json':json};exec(compile(ast.Module(body=[fn],type_ignores=[]),'actual-docker-census','exec'),env);result=env['docker_census']();assert result['complete'] is True and result['absentNames']==names and len(calls)==12
for i,n in enumerate(names):assert calls[i]==['container','inspect',n]
for i,filters in enumerate([['label=jarvis.truthgate.r32.attempt='+p['attempt']],['label=jarvis.truthgate.r32.attempt='+p['attempt'],'label=jarvis.truthgate.r32.kind=build']]):
 for j,head in enumerate([['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]):assert calls[6+i*3+j]==head+sum([['--filter',v] for v in filters],[])
survive=True;assert env['docker_census']()['complete'] is False;print('TWELVE_READONLY_QUERIES')
`),'TWELVE_READONLY_QUERIES');
});

test('actual QA reader closes both directory handles and rejects links/writable/multi-link/drift before returning proof',()=>{
 assert.equal(py(String.raw`
import ast,sys,json,hashlib,stat,copy
from pathlib import Path
from types import SimpleNamespace
x=json.loads(sys.stdin.buffer.read().decode('utf8'));p=x['B'];tree=ast.parse(x['source']);defs=[s for s in tree.body if isinstance(s,ast.FunctionDef) and s.name in ['strict_json','read_qa']];code=compile(ast.Module(body=defs,type_ignores=[]),'actual-qa-fd-reader','exec');b=b'bounded-public-byte-fixture';names=['baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'];manifest={'schemaVersion':1,'kind':'r32-bounded-qa-tools','files':{n:{'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)} for n in names}};manifest_raw=json.dumps(manifest).encode();p['qaManifestSHA256']=hashlib.sha256(manifest_raw).hexdigest();bodies={n:b for n in names};bodies['manifest.json']=manifest_raw
def need(ok,code):
 if not ok:raise RuntimeError(code)
def run(kind=None):
  held=set();nextfd=10
  def info(name=None):
   mode=stat.S_IFDIR|0o555 if name is None else stat.S_IFREG|0o444
   if kind=='link' and name=='targeted-pure.mjs':mode=stat.S_IFLNK|0o777
   if kind=='write' and name=='targeted-pure.mjs':mode=stat.S_IFREG|0o644
   return SimpleNamespace(st_dev=66306,st_ino=100 if name is None else 101+sorted(bodies).index(name),st_uid=0,st_gid=0,st_mode=mode,st_nlink=2 if kind=='hardlink' and name=='targeted-pure.mjs' else 1,st_size=0 if name is None else len(bodies[name]),st_mtime_ns=1,st_ctime_ns=1)
  def open_dir(_):
   nonlocal nextfd
   nextfd+=1;held.add(nextfd);return nextfd
  def close(fd):held.remove(fd)
  def stamp(s):return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
  def read(path):return bodies[path.name]+(b'drift' if kind=='drift' and path.name=='targeted-pure.mjs' else b'')
  os=SimpleNamespace(fstat=lambda fd:info(),listdir=lambda fd:sorted(bodies),stat=lambda n,**kw:info(n),close=close)
  env={'p':p,'root':Path('/bounded/root'),'need':need,'h':SimpleNamespace(open_directory=open_dir),'os':os,'stat':stat,'stat_key':stamp,'private_read':read,'digest':lambda raw:hashlib.sha256(raw).hexdigest(),'identity':lambda fd:{'device':66306,'inode':100},'json':json};exec(code,env)
  try:result=env['read_qa']();assert not held;return result
  except RuntimeError:assert not held;raise
assert run()['entries']==4
for kind in ['link','write','hardlink','drift']:
 try:run(kind)
 except RuntimeError as e:assert str(e).startswith('R32_EVIDENCE_QA_')
 else:raise AssertionError('unsafe QA source accepted')
print('HELD_QA_FD_5_CLOSED')
`),'HELD_QA_FD_5_CLOSED');
});
