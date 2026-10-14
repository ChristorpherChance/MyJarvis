import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readBoundCensusLinuxFailureR32 as run,boundCensusLinuxFailureR32Scope as S,assertBoundCensusFailureContextR32,assertBoundCensusFailureHostR32,projectBoundCensusFailureHostR32} from './read-factory-bound-census-linux-failure-r32.mjs';
import {boundCensusLinuxFailureHostR32Scope as HS,boundCensusLinuxFailureHostR32Program as program} from './factory-bound-census-linux-failure-host-r32.mjs';
import {boundProcessCensusR32NativeProgram} from './factory-bound-process-census-r32.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v)+'\n');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const terminal=JSON.parse(readFileSync(S.terminal.path)),q=JSON.parse(readFileSync(S.journal.path));
function reportBytes(){
 const raw={
  'control/owner.py':readFileSync(S.sources[1].path),'control/fixture.py':readFileSync(S.sources[2].path),'control/generated.py':Buffer.from(boundProcessCensusR32NativeProgram()),
  'control/activation.json':json({schemaVersion:1,kind:'r32-bound-census-root-activation',nonce:q.nonce,phase:q.phase,ownerSHA256:q.ownerSHA256,fixtureSHA256:q.scope.fixture.sha256,generatedSHA256:q.scope.generated[q.phase]}),
  'control/once.json':json({schemaVersion:1,kind:'r32-bound-census-root-once',nonce:q.nonce,phase:q.phase,unit:q.owner.unit,ownerSHA256:q.ownerSHA256,fixtureSHA256:q.scope.fixture.sha256,generatedSHA256:q.scope.generated[q.phase]}),
  'work/owner.json':json(terminal.owner),'work/fixture-process.json':json(terminal.fixtureProcess),'work/result.json':json(terminal.result),'work/stopped.json':json(terminal.stopped),'work/fixture.stdout.json':json(terminal.fixture)
 };
 raw['unit-proof.json']=json({kind:'r32-bound-census-root-unit-proof',nonce:q.nonce,unit:q.owner.unit,invocationId:q.owner.invocationId,ownerSHA256:q.ownerSHA256,activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,configuration:{uid:1000,gid:1000,noNewPrivileges:true,capabilitiesEmpty:true,privateNetwork:true,protectControlGroups:true,runtimeMaxSec:80,stopTimeoutSec:10,hardParentBoundSeconds:90,killMode:'control-group',killSignal:'SIGKILL',restart:'no',execStartSHA256:terminal.unitExecStartSHA256,execStopPostSHA256:terminal.unitExecStopPostSHA256}});
 return raw;
}
function frame(){
 const raws=reportBytes(),records={};for(const[name,pin]of Object.entries(HS.records)){const raw=raws[name];assert.ok(raw,name);assert.equal(sha(raw),pin.sha256,name+' reconstructed bytes SHA');if(pin.bytes!=null)assert.equal(raw.length,pin.bytes);records[name]={sha256:sha(raw),bytes:raw.length,base64:raw.toString('base64'),readComplete:true,metadata:[1,2,0,0,33188,1,raw.length,3,4]}}
 return{schemaVersion:1,kind:'r32-bound-census-linux-failure-scope-host-observation',scopeBinding:HS,contextSHA256:sha(canonical(HS)),failureScope:true,readOnly:true,records,recordsStable:true,namespaceStable:true,unitProofVerified:true,
 unit:{...terminal.unit,ControlGroup:''},knownProcesses:{owner:{pid:terminal.owner.pid,present:false},fixture:{pid:terminal.fixtureProcess.pid,present:false}},processScans:[0,1].map(()=>({fullProcScan:true,pidfdSupported:true,total:1,inspected:1,provenExited:0,incompleteCount:0,incomplete:[],relatedCount:0,relatedProcesses:[],listedPIDs:[1],inspectedPIDs:[1],exitedDuringScan:[],namespaceFD:{relatedCount:0,complete:true},complete:true})),
 cgroup:{absent:true,complete:true},namespaceFD:{relatedCount:0,complete:true},sockets:{count:0,complete:true},cleanupScopeComplete:true,tinyChildIdentity:null,unknownTinyChildIdentityPreserved:true,fixtureQualified:false,fullProtectionQualified:false,actualLinuxQualified:false,modelsInvoked:false,productCodeExecuted:false,signalsSent:false,resourcesRemoved:false,mutationsPerformed:false};
}
function context(){
 const paths=[...S.sources,S.journal,S.start,S.terminal].map(x=>x.path).concat([S.callerPath,S.hostPath]),inputs=new Map(paths.map(p=>[p,readFileSync(p)]));
 const review={kind:'r32-bound-census-linux-failure-reader-independent-local-review',callerSHA256:sha(inputs.get(S.callerPath)),hostSHA256:sha(inputs.get(S.hostPath)),remainingP0P1:0,staticPreparationReady:true,remoteOperations:false,actualFailureScopeRead:false};
 const ref={path:'artifacts/software-factory/goals-r29/r32-bound-census-linux-failure-reader-independent-local-review-1791856512019-11111111-1111-1111-1111-111111111111.json',sha256:sha(json(review))};inputs.set(ref.path,json(review));
 const activation={kind:'r32-bound-census-linux-failure-read-activation',remoteReadAuthorized:true,callerSHA256:review.callerSHA256,hostSHA256:review.hostSHA256,review:ref};
 const trace=[],privateRows=[],publicRows=[];
 const deps={readLocal:async p=>{trace.push(['local',p]);assert.ok(inputs.has(p),p);return inputs.get(p)},readRoot:async(p,s)=>{trace.push(['root']);assert.deepEqual(p,HS);assert.equal(s,program());return JSON.stringify(frame())},writePrivate:async v=>{privateRows.push(v);trace.push(['private']);return{path:'controlled-private',sha256:sha(JSON.stringify(v)),bytes:JSON.stringify(v).length}},writePublic:async v=>{publicRows.push(v);trace.push(['public']);return{path:'controlled-public',sha256:sha(JSON.stringify(v)),bytes:JSON.stringify(v).length}},now:()=>1791856512019};
 return{inputs,activation,trace,privateRows,publicRows,deps};
}
test('null activation makes zero local/private/public/remote calls',async()=>{
 const deny=()=>{throw Error('must not call')};const v=await run({},Object.fromEntries(['readLocal','readRoot','writePrivate','writePublic'].map(k=>[k,deny])));assert.equal(v.ready,false);assert.equal(v.fixtureQualified,false);
});
test('actual configured reader preserves failure and raw bytes through real string response',async()=>{
 const c=context(),v=await run({activation:c.activation},c.deps);assert.equal(c.trace.filter(x=>x[0]==='root').length,1);assert.equal(v.currentFailureScopeCleanupVerified,true);assert.equal(v.actualSubsetPassed,false);assert.equal(v.fixtureQualified,false);assert.equal(v.actualLinuxQualificationPassed,false);assert.equal(v.fullProtectionQualified,false);assert.equal(v.tinyChildIdentity,null);assert.equal(v.originalFixtureError.readSubphase,null);assert.equal(c.privateRows.length,1);assert.ok(c.privateRows[0].transport.stdout.includes('base64'));assert.ok(!JSON.stringify(v).includes('base64'));
});
test('fixed local source drift rejects before a root read',async()=>{
 const c=context();c.inputs.set(S.sources[3].path,Buffer.from('changed'));await assert.rejects(run({activation:c.activation},c.deps),/LOCAL_SOURCE_CHANGED/);assert.equal(c.trace.filter(x=>x[0]==='root').length,0);assert.equal(c.publicRows.length,0);
});
test('fresh unknown process read keeps strict denominator and incomplete cleanup facts',async()=>{
 const c=context(),v=frame();v.processScans[0]={...v.processScans[0],total:2,incompleteCount:1,listedPIDs:[1,22],incomplete:[{pid:22,phase:'process-read',readSubphase:'FD_TARGET_READLINK',errorCode:'PROCESS_READ_ERROR',errno:2}],complete:false};v.cleanupScopeComplete=false;c.deps.readRoot=async()=>JSON.stringify(v);const r=await run({activation:c.activation},c.deps);assert.equal(r.ready,false);assert.equal(r.currentFailureScopeIndependentlyObserved,true);assert.equal(r.host.processScans[0].incompleteCount,1);assert.equal(r.currentFailureScopeCleanupVerified,false);assert.equal(r.fixtureQualified,false);
});
test('false qualification, missing denominator and forged raw bytes cannot qualify',()=>{
 for(const mutate of [v=>{v.actualLinuxQualified=true},v=>{v.processScans[0].total++},v=>{v.records['work/fixture.stdout.json'].base64=Buffer.from('fake').toString('base64')},v=>{v.cleanupScopeComplete=false},v=>{v.tinyChildIdentity={pid:99}}]){const v=frame();mutate(v);assert.throws(()=>assertBoundCensusFailureHostR32(v,terminal),/R32_BOUND_FAILURE_/)}
});
test('public projection cannot carry extra private host fields or process targets',()=>{
 const v=frame();v.knownProcesses.owner.private='SECRET';v.sockets.targets=['SECRET'];v.cgroup.private='SECRET';v.namespaceFD.targets=['SECRET'];for(const r of Object.values(v.records))r.private='SECRET';assert.equal(JSON.stringify(projectBoundCensusFailureHostR32(v)).includes('SECRET'),false);
});
test('SSH failure preserves actual stderr privately and only anchored closed error publicly',async()=>{
 for(const[stderr,code]of [['Traceback\nRuntimeError: R32_BOUND_FAILURE_HOST_CHANGED\n','R32_BOUND_FAILURE_HOST_CHANGED'],['RuntimeError: SECRET raw environment','R32_BOUND_FAILURE_SSH_READ_INCOMPLETE']]){const c=context();c.deps.readRoot=async()=>({status:1,signal:null,stdout:'',stderr,errorCode:null});const v=await run({activation:c.activation},c.deps);assert.equal(v.errorCode,code);assert.equal(c.privateRows[0].transport.stderr,stderr);assert.equal(JSON.stringify(v).includes('SECRET'),false);assert.equal(v.currentFailureScopeIndependentlyObserved,false);assert.equal(c.trace.filter(x=>x[0]==='root').length,0);}
});
test('initial settled source reads drain pending readers after sync rejection',async()=>{
 const c=context();let drained=false;c.deps.readLocal=p=>{if(p===S.sources[0].path)throw Error('sync reject');if(p===S.sources[1].path)return new Promise(r=>setTimeout(()=>{drained=true;r(c.inputs.get(p))},30));return c.inputs.get(p)};await assert.rejects(run({activation:c.activation},c.deps),/sync reject/);assert.equal(drained,true);assert.equal(c.publicRows.length,0);
});
test('post-read source drift prevents public receipt without discarding private transport',async()=>{
 const c=context();c.deps.readRoot=async()=>{c.inputs.set(S.callerPath,Buffer.from('changed'));return JSON.stringify(frame())};await assert.rejects(run({activation:c.activation},c.deps),/LOCAL_SOURCE_READ_CHANGED/);assert.equal(c.privateRows.length,1);assert.equal(c.publicRows.length,0);
});
test('original actual scope accepts correct known identities and refuses invented child lineage',()=>{
 const start=JSON.parse(readFileSync(S.start.path));assertBoundCensusFailureContextR32(q,start,terminal);const v=structuredClone(terminal);v.fixtureProcess.ppid=123;assert.throws(()=>assertBoundCensusFailureContextR32(q,start,v),/KNOWN_IDENTITIES_CHANGED/);
});
