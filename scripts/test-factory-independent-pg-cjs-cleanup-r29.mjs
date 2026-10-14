/** Controlled independent CJS cleanup tests. No host/Docker/PG/product/model execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {independentPGCjsCleanupR29Scope as S,assertIndependentPGCjsCleanupContext,assertIndependentPGCjsCleanupHost,independentPGCjsCleanupR29RootProgram,verifyFactoryIndependentPGCjsCleanupR29,independentPGCjsCleanupFailure,independentPGCjsEvidenceReaders} from './verify-factory-independent-pg-cjs-cleanup-r29.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
const clone=v=>JSON.parse(JSON.stringify(v)),H='a'.repeat(64),attempt='a'.repeat(32),now=Date.now();
const original=JSON.parse(await readFile('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json','utf8'));
const path='artifacts/software-factory/goals-r29/independent-pg-cjs-start-1791830000000-11111111-1111-1111-1111-111111111111.json',jp='.jarvis-dev/maintenance/factory-r29-pg-cjs-once.json';
const controlNames=['activation.json','protection.json','review.json','tools-contract.json'];
const files=Object.fromEntries(controlNames.map(n=>[n,H])),inventory=sha(canonical(files));
const owner={unit:'jarvis-qa-pg-cjs-r29-'+attempt+'-owner.service',pid:1700000,startTicks:'28000000',boot:original.node.boot,controlGroup:'/system.slice/jarvis-qa-pg-cjs-r29-'+attempt+'-owner.service',runtimeMaxSec:300,stopTimeoutSec:120,restart:'no',killMode:'control-group'};
function context(){
 const start={schemaVersion:1,kind:'software-factory-r29-independent-pg-cjs-start',attempt,dispatched:true,workerSHA256:S.workerSHA256,runtimeRoot:S.immutableScope.runtimeRoot,manifestSHA256:S.immutableScope.manifestSHA256,ownerUnit:owner.unit,owner:clone(owner),activationSHA256:H,onceIntentSHA256:H,controlInventorySHA256:inventory,controlFiles:files,toolsFiles:Object.fromEntries([...S.immutableScope.tools.map(t=>[t.name,t.sha256]),['r29-qa-runtime-manifest.json',S.immutableScope.manifestSHA256]]),toolsInventorySHA256:sha(canonical(Object.fromEntries([...S.immutableScope.tools.map(t=>[t.name,t.sha256]),['r29-qa-runtime-manifest.json',S.immutableScope.manifestSHA256]])))};
 const raw=JSON.stringify(start),q={schemaVersion:1,kind:'r29-independent-pg-cjs-once-journal',attempt,immutableScope:clone(S.immutableScope),starterSHA256:S.starterSHA256,automaticRetry:false,dispatched:true,startIntentAt:new Date(now).toISOString(),owner:clone(owner),activationSHA256:H,onceIntentSHA256:H,controlInventorySHA256:inventory,toolsInventorySHA256:start.toolsInventorySHA256,receipts:{start:{path,sha256:sha(raw)}}};
 return {start,raw,q,B:assertIndependentPGCjsCleanupContext(q,start)};
}
function host(B){
 const h=clone(original.observations.oldBuild);h.attempt=attempt;h.observedAt=new Date(now).toISOString();h.workerSHA256=B.toolSHA;h.activationSHA256=H;h.onceIntentSHA256=H;h.controlInventorySHA256=inventory;h.stateSHA256=H;h.qualificationStatus='qualified';
 h.node.state='R';for(const s of h.scans)s.node=clone(h.node);
 const dir=(uid,ino,entries)=>({uid,mode:448,identity:{device:66306,inode:ino},metadataSHA256:H,entries,nofollow:true,stable:true});
 h.attemptDirectory=dir(0,100,12);h.control={...dir(0,101,9),files:clone(files),activationBound:true,requiredFilesBound:true};h.tools={...dir(0,102,4),mode:365,files:clone(B.toolsFiles)};h.toolsInventorySHA256=B.toolsInventorySHA256;h.runtimeClosure={uid:0,mode:365,stable:true,nofollow:true,manifestSHA256:B.manifestSHA256,metadataRawSHA256:B.runtimeMetadataSHA256,treeSHA256:H};h.librarySHA256=B.librarySHA256;h.qualificationEvidenceComplete=true;
 h.mountPolicy={creationIntentBound:true,expectedDestinations:['/qa-runtime','/tools'],productSourceMounted:false,hostDockerSocketMounted:false,actualContainerMountsObserved:false};
 h.packageJavaScriptExecuted=false;h.procScope.includesInstallerOwnerCgroup=true;h.procScope.includesOwnedContainerCgroup=true;h.procScope.workspace=S.rootBase+'/'+attempt;for(const s of h.scans)s.containerCgroupProcesses=[];
 const name='jarvis-qa-pg-cjs-r29-'+attempt+'-qualify';h.docker.exactNames=[name];h.docker.absentNames=[name];h.docker.labelScopes[0].filters=['label=jarvis.qa.pg.cjs.r29.attempt='+attempt];h.docker.labelScopes[1].filters=['label=jarvis.qa.pg.cjs.r29.attempt='+attempt,'label=jarvis.qa.pg.cjs.r29.kind=cjs-qualification'];
 h.owner.identity={pid:owner.pid,startTicks:owner.startTicks,boot:owner.boot};h.owner.unit.Id=owner.unit;h.owner.cgroupPath=owner.controlGroup;Object.assign(h.owner,{originalOwnerContractVerified:true,runtimeMaxSec:300,stopTimeoutSec:120,exactExecStopPostConfigured:true});return h;
}
function harness(edit={}){
 const c=context();edit.q?.(c.q);edit.start?.(c.start);const raw=JSON.stringify(c.q),startRaw=edit.startRaw??JSON.stringify(c.start),h=host(c.B);edit.host?.(h);let roots=0,proofs=0,reads=[];
 return {q:c.q,h,B:c.B,roots:()=>roots,reads,run:()=>verifyFactoryIndependentPGCjsCleanupR29({attempt}, {now:()=>now,readLocal:async p=>{reads.push(p);if(p===jp)return raw;if(p===path)return startRaw;throw Error('UNEXPECTED_LOCAL_READ')},readRoot:async(p,code)=>{roots++;assert.equal(p.attempt,attempt);assert.ok(code.includes("p={**p,'workspace':str(private)}"));return edit.rawRoot===undefined?h:edit.rawRoot(h)},verifyProtection:async()=>{const p=clone(original);p.at=new Date(now).toISOString();edit.protection?.(p,++proofs);return p}})};
}

test('default missing nonce and unfrozen source perform no remote or platform reads',async()=>{
 let calls=0;const forbidden=()=>{calls++;throw Error('FORBIDDEN')};
 const r=await verifyFactoryIndependentPGCjsCleanupR29({}, {readLocal:async()=>{throw Object.assign(Error('absent'),{code:'ENOENT'})},readRoot:forbidden,verifyProtection:forbidden});assert.equal(r.ready,false);assert.equal(r.remoteReadPerformed,false);assert.equal(calls,0);
 const u=await verifyFactoryIndependentPGCjsCleanupR29({}, {fixedScope:{...S,workerSHA256:null},readLocal:forbidden,readRoot:forbidden,verifyProtection:forbidden});assert.equal(u.reason,'QA_CJS_CLEANUP_SCOPE_NOT_FROZEN');assert.equal(calls,0);
});
test('controlled complete qualified/failed census remains runtime/product unaccepted',async()=>{
 for(const status of ['qualified','failed']){const f=harness({host:h=>{h.qualificationStatus=status;h.qualificationEvidenceComplete=status==='qualified';h.cleanupClaimsComplete=false}}),r=await f.run();assert.equal(r.ready,true);assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.qualificationStatus,status);assert.equal(r.actualCJSQualified,status==='qualified');for(const k of ['productCodeExecuted','runtimeReady','productAccepted','modelsInvoked','remoteMutationsPerformed','workerCleanupClaimsUsedAsProof'])assert.equal(r[k],false);assert.equal(f.roots(),1);}
});
test('actual default stdout string adapts to a host object; malformed and array frames cannot pass',async()=>{
 assert.equal((await harness({rawRoot:h=>JSON.stringify(h)}).run()).ready,true);
 for(const raw of ['private API/template body','[]','null','1']){const f=harness({rawRoot:()=>raw});await assert.rejects(f.run(),/HOST_RESULT_INVALID/);}
});
test('undispatched intent refuses host without inventing receipt',async()=>{const f=harness({q:q=>{q.dispatched=false}}),r=await f.run();assert.equal(r.ready,false);assert.equal(f.roots(),0);assert.deepEqual(f.reads,[jp]);});
test('wrong scope/receipt/control path are refused before any host operation',async()=>{
 for(const change of [q=>{q.immutableScope.root+='/other'},q=>{q.receipts.start.path='.jarvis-dev/private-env.json'},q=>{q.activationSHA256='b'.repeat(64)},q=>{q.owner.pid++}]){const f=harness({q:change});await assert.rejects(f.run(),/QA_CJS_CLEANUP_/);assert.equal(f.roots(),0);assert.ok(!f.reads.includes('.jarvis-dev/private-env.json'));}
 const f=harness({startRaw:context().raw+' '});await assert.rejects(f.run(),/START_RECEIPT_CHANGED/);assert.equal(f.roots(),0);
});
test('unknown whole-proc read and forged aggregate flags remain rejected',async()=>{
 const f=harness({host:h=>{const s=h.scans[0],pid=s.inspectedPIDs.find(p=>p!==h.node.pid);s.inspectedPIDs=s.inspectedPIDs.filter(p=>p!==pid);s.readIncompletePIDs=[pid];s.counts.inspected--;s.counts.incomplete++;h.nativeProcessAndSocketCleanupVerified=false;h.cleanupClaimsComplete=true}});assert.equal((await f.run()).ready,false);
 const bad=host(context().B);bad.scans[0].counts.listed++;assert.throws(()=>assertIndependentPGCjsCleanupHost(bad,context().B),/COUNTS_NOT_CLOSED/);
});
for(const [name,change]of [
 ['single qualification container still present',h=>{h.docker.absentNames=[];h.docker.present=[{name:h.docker.exactNames[0]}];h.docker.complete=false}],
 ['first label network survives',h=>{h.docker.labelScopes[0].networks=['retained'];h.docker.complete=false}],
 ['second label volume survives',h=>{h.docker.labelScopes[1].volumes=['retained'];h.docker.complete=false}],
 ['owner live or PID reused',h=>{h.owner.pidAbsent=false;h.owner.complete=false}],
 ['detached owner-cgroup process',h=>{h.scans[0].ownerCgroupProcesses=[1800000];h.scans[0].relatedProcesses=[1800000];h.nativeProcessAndSocketCleanupVerified=false}],
 ['owned Docker cgroup process outside owner/workspace',h=>{h.scans[0].containerCgroupProcesses=[1800000];h.scans[0].relatedProcesses=[1800000];h.nativeProcessAndSocketCleanupVerified=false}],
 ['filesystem socket',h=>{h.workspaceSockets.filesystem=['retained.sock'];h.nativeProcessAndSocketCleanupVerified=false}],
 ['node ACK pending',h=>{h.nodeACK.counts.runs=1;for(const s of h.scans)s.ack=clone(h.nodeACK);h.nativeProcessAndSocketCleanupVerified=false}]
])test('actual scope refuses '+name,()=>{const c=context(),h=host(c.B);change(h);assert.equal(assertIndependentPGCjsCleanupHost(h,c.B).cleanupIndependentlyVerified,false);});
test('pidfd exit requires identityBound and exact enumerated identity',()=>{
 const c=context(),h=host(c.B),s=h.scans[0],pid=s.inspectedPIDs.find(p=>p!==h.node.pid);s.inspectedPIDs=s.inspectedPIDs.filter(p=>p!==pid);s.counts.inspected--;s.counts.pidfdProvenExits++;
 const e={pid,boot:h.node.boot,listedProcIdentity:{device:24,inode:123456},processIdentity:{pid,boot:h.node.boot,procDevice:24,procInode:123456},kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:pid,exitConfirmed:true,procPathAbsent:true,pollEvents:1}};s.exitedDuringScan=[e];assert.equal(assertIndependentPGCjsCleanupHost(h,c.B).cleanupIndependentlyVerified,true);
 for(const change of [e=>{e.kernelProof.identityBound=false},e=>{e.kernelProof.procPathAbsent=false},e=>{e.kernelProof.pollEvents=8},e=>{e.processIdentity.procInode++}]){const bad=clone(h);change(bad.scans[0].exitedDuringScan[0]);assert.throws(()=>assertIndependentPGCjsCleanupHost(bad,c.B),/PIDFD_IDENTITY_UNPROVEN/);}
});
test('activation/control inventory, directory identity and mount scope are mandatory',()=>{
 const c=context();for(const change of [h=>{delete h.tools.identity},h=>{h.control.files['activation.json']='b'.repeat(64)},h=>{h.control.activationBound=false},h=>{h.mountPolicy.hostDockerSocketMounted=true},h=>{h.owner.stopTimeoutSec=300}]){const h=host(c.B);change(h);assert.throws(()=>assertIndependentPGCjsCleanupHost(h,c.B),/QA_CJS_CLEANUP_/);}
});
test('fresh protection retains full identity/ACK/config while harmless R/S state is ignored',async()=>{
 assert.equal((await harness().run()).ready,true);
 for(const change of [p=>{p.node.startTicks+='1'},p=>{p.node.procInode++},p=>{p.observations.nativeSource.nodeACK.identity.inode++},p=>{p.nodeConfigSHA256='b'.repeat(64)},p=>{p.sources.main.metadataSHA='b'.repeat(64)}]){const f=harness({protection:(p,n)=>{if(n===2)change(p)}});await assert.rejects(f.run(),/(?:PROTECTION_OR_ACK_CHANGED|R29_BUILD_START_[A-Z_]+|R29_CLEANUP_[A-Z_]+)/);}
 const f=harness({host:h=>{h.observedAt=new Date(now-300001).toISOString()}});await assert.rejects(f.run(),/CONTEXT_OR_AGE_CHANGED/);
});
test('actual assembled Python is syntactically valid, no worker or package code is loaded, original pidfd reader preserved',()=>{
 const c=context(),p=independentPGCjsCleanupR29RootProgram(c.B),n=targetCleanupR29HostProgram();const r=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.read());print("AST_OK")'],{input:p,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'AST_OK');
 const a=n.indexOf('def process_record('),z=n.indexOf('def census():');assert.ok(a>0&&z>a);assert.ok(p.includes(n.slice(a,z)));assert.ok(p.includes("p={**p,'workspace':str(private)}"));assert.ok(p.indexOf('tools_before=tools_state()')<p.indexOf('scan_before=census()'));assert.ok(p.includes("signal.alarm(150)"));
 assert.ok(!p.includes('importlib'));assert.ok(!p.includes('--reconcile-cleanup'));assert.ok(!p.includes("['rm'"));assert.ok(!p.includes('docker.sock'));assert.ok(p.includes("private_read(Path(p['tool']),100000)"));
});
test('public failure receipt contains only closed code and no arbitrary private error text',()=>{const secret='private-api-body template private-journal';const r=independentPGCjsCleanupFailure(Error(secret));assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(r.rawErrorExported,false);assert.equal(r.ready,false);assert.equal(independentPGCjsCleanupFailure(Error('QA_CJS_CLEANUP_COUNTS_NOT_CLOSED')).errorCode,'QA_CJS_CLEANUP_COUNTS_NOT_CLOSED');});

function pythonGuard(code){const r=spawnSync('python',['-c',code],{input:JSON.stringify({source:independentPGCjsCleanupR29RootProgram(context().B),B:context().B}),encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
test('actual generated qualification and execution guards require exact 16 actual log checks and real recorded container',()=>{
 assert.equal(pythonGuard(String.raw`
import ast,sys,json,hashlib,copy
x=json.loads(sys.stdin.buffer.read().decode('utf8'));t=ast.parse(x['source']);p=x['B'];selected=[]
for s in t.body:
 if isinstance(s,ast.Assign) and any(isinstance(k,ast.Name) and k.id in ['EXPECTED_CHECKS','qualification_complete'] for k in s.targets):selected.append(s)
 if isinstance(s,ast.If) and any(isinstance(c,ast.Constant) and c.value in ['QA_CJS_CLEANUP_QUALIFIED_WITHOUT_EXECUTION','QA_CJS_CLEANUP_QUALIFICATION_REPORT_UNPROVEN'] for c in ast.walk(s)):selected.append(s)
assert len(selected)==4
program=compile(ast.Module(body=selected,type_ignores=[]),'actual-qualification-guards','exec')
ids=next(s.value for s in selected if isinstance(s,ast.Assign) and s.targets[0].id=='EXPECTED_CHECKS');ids=ast.literal_eval(ids)
report={'schemaVersion':1,'kind':'r29-independent-pg-cjs-qualification','status':'pass','denominator':16,'passed':16,'failed':0,'manifestSHA256':p['manifestSHA256'],'checks':[{'id':i,'status':'pass'} for i in ids],'networkCalls':0,'queriesIssued':0,'databaseConnected':False,'productionDBAccessed':False,'actualPGRequired':True,'actualPoolConstructed':True,'actualClientConstructed':True}
def need(ok,code):
 if not ok:raise RuntimeError(code)
def run(change=None):
 r=copy.deepcopy(report);state={'status':'qualified','containerStopped':True,'containerExitCode':0,'cliExitCode':0,'boundedStop':False,'actualCJSQualified':True};cid='a'*64
 if change:cid=change(r,state,cid)
 raw=json.dumps(r).encode();state['qualification']=copy.deepcopy(r);state['privateLogSHA256']=hashlib.sha256(raw).hexdigest();state['privateLogBytes']=len(raw)
 env={'p':p,'state':state,'report':r,'log_raw':raw,'CONTAINER_ID':cid,'need':need,'digest':lambda b:hashlib.sha256(b).hexdigest()};exec(program,env);return env['qualification_complete']
assert run() is True # real producer has no containerStarted field
changes=[lambda r,s,c:(r['checks'].pop(),c)[1],lambda r,s,c:(r['checks'].__setitem__(1,r['checks'][0]),c)[1],lambda r,s,c:(r['checks'][0].__setitem__('status','fail'),c)[1],lambda r,s,c:(r.__setitem__('denominator',True),c)[1],lambda r,s,c:(r.__setitem__('networkCalls',1),c)[1],lambda r,s,c:(r.__setitem__('databaseConnected',True),c)[1],lambda r,s,c:(r.__setitem__('actualClientConstructed',False),c)[1],lambda r,s,c:None,lambda r,s,c:(s.__setitem__('containerStopped',False),c)[1],lambda r,s,c:(s.__setitem__('cliExitCode',True),c)[1]]
for change in changes:
 try:run(change)
 except RuntimeError as e:assert str(e) in ['QA_CJS_CLEANUP_QUALIFICATION_REPORT_UNPROVEN','QA_CJS_CLEANUP_QUALIFIED_WITHOUT_EXECUTION']
 else:raise AssertionError('invalid qualified evidence accepted')
print('QUALIFICATION_11_CLOSED')
`),'QUALIFICATION_11_CLOSED');
});
test('actual generated Docker census queries both full label scopes and rejects wrong present bind',()=>{
 assert.equal(pythonGuard(String.raw`
import ast,sys,json,re,hashlib
from pathlib import Path
from types import SimpleNamespace
x=json.loads(sys.stdin.buffer.read().decode('utf8'));t=ast.parse(x['source']);p=x['B'];fn=next(s for s in t.body if isinstance(s,ast.FunctionDef) and s.name=='docker_census');program=compile(ast.Module(body=[fn],type_ignores=[]),'actual-docker-census','exec');name='jarvis-qa-pg-cjs-r29-'+p['attempt']+'-qualify';tools=Path(p['root'])/p['attempt']/'tools';labels={'jarvis.qa.pg.cjs.r29.attempt':p['attempt'],'jarvis.qa.pg.cjs.r29.kind':'cjs-qualification'};calls=[];present=None
def need(ok,code):
 if not ok:raise RuntimeError(code)
def docker(args):
 calls.append(args)
 if args==['container','inspect',name]:
  if present is None:return SimpleNamespace(returncode=1,stdout=b'[]',stderr=('Error: No such container: '+name).encode())
  return SimpleNamespace(returncode=0,stdout=json.dumps([present]).encode(),stderr=b'')
 return SimpleNamespace(returncode=0,stdout=b'',stderr=b'')
env={'p':p,'tools':tools,'labels':labels,'name':name,'need':need,'docker':docker,'json':json,'re':re,'hashv':lambda v:hashlib.sha256(json.dumps(v,sort_keys=True).encode()).hexdigest()};exec(program,env);result=env['docker_census']();assert result['complete'] is True and len(calls)==7
for i,filters in enumerate([['label=jarvis.qa.pg.cjs.r29.attempt='+p['attempt']],['label=jarvis.qa.pg.cjs.r29.attempt='+p['attempt'],'label=jarvis.qa.pg.cjs.r29.kind=cjs-qualification']]):
 for j,head in enumerate([['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]):assert calls[1+i*3+j]==head+sum([['--filter',f] for f in filters],[])
present={'Name':'/'+name,'Id':'a'*64,'Image':p['image'],'Config':{'User':'1000:1000','Labels':labels},'Mounts':[{'Type':'bind','Source':p['runtimeRoot'],'Destination':'/qa-runtime','RW':False},{'Type':'bind','Source':str(tools),'Destination':'/tools','RW':False}]};assert env['docker_census']()['complete'] is False
present['Mounts'][1]['RW']=True
try:env['docker_census']()
except RuntimeError as e:assert str(e)=='QA_CJS_CLEANUP_PRESENT_CONTAINER_MOUNT_CHANGED'
else:raise AssertionError('writable tools accepted')
print('DOCKER_SCOPE_3_CLOSED')
`),'DOCKER_SCOPE_3_CLOSED');
});
test('actual container-cgroup expression matches only exact owned container tokens',()=>{
 assert.equal(pythonGuard(String.raw`
import ast,sys,json
x=json.loads(sys.stdin.buffer.read().decode('utf8'));t=ast.parse(x['source']);fn=next(s for s in t.body if isinstance(s,ast.FunctionDef) and s.name=='census');stmt=next(s for s in ast.walk(fn) if isinstance(s,ast.Assign) and any(isinstance(k,ast.Name) and k.id=='container_group' for k in s.targets));program=compile(ast.Module(body=[stmt],type_ignores=[]),'actual-container-cgroup','exec');cid='a'*64
records={1:{'cgroups':['/system.slice/docker-'+cid+'.scope']},2:{'cgroups':['/docker/'+cid]},3:{'cgroups':['/docker/'+cid+'b']},4:{'cgroups':['/unrelated']}}
env={'records':records,'CONTAINER_ID':cid};exec(program,env);assert env['container_group']=={1,2};env['CONTAINER_ID']=None;exec(program,env);assert env['container_group']==set();print('EXACT_CONTAINER_SCOPE')
`),'EXACT_CONTAINER_SCOPE');
});
test('production evidence wrapper saves full false and incomplete observations before any qualification',async()=>{
 const saved=[],refs={protection:[],host:[]},p=clone(original);p.ready=false;p.observations.nativeSource.scans[0].readIncompletePIDs=[123456];const h=host(context().B);h.scans[0].readIncompletePIDs=[123456];
 const d=independentPGCjsEvidenceReaders({verifyProtection:async()=>p,readRoot:async()=>JSON.stringify(h),saveEvidence:async(v,prefix)=>{saved.push({value:clone(v),prefix});return {path:prefix,sha256:sha(canonical(v))}}},refs);
 assert.equal((await d.verifyProtection()).ready,false);assert.deepEqual((await d.readRoot({},'')).scans[0].readIncompletePIDs,[123456]);assert.equal(refs.protection.length,1);assert.equal(refs.host.length,1);assert.deepEqual(saved[0].value.observations.nativeSource.scans[0].readIncompletePIDs,[123456]);
 const unsafe=independentPGCjsEvidenceReaders({readRoot:async()=>JSON.stringify({...h,rawLogsExported:true}),saveEvidence:async()=>{throw Error('MUST_NOT_SAVE_UNSAFE')}});await assert.rejects(unsafe.readRoot({},''),/HOST_EVIDENCE_UNSAFE/);
});
