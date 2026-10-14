/** Controlled independent PG cleanup tests. No host/Docker/PG/product/model execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {independentPGCleanupR29Scope as S,assertIndependentPGCleanupContext,assertIndependentPGCleanupHost,independentPGCleanupR29RootProgram,verifyFactoryIndependentPGCleanupR29,independentPGCleanupFailure} from './verify-factory-independent-pg-cleanup-r29.mjs';
import {targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
const clone=v=>JSON.parse(JSON.stringify(v)),H='a'.repeat(64),attempt='a'.repeat(32),now=Date.now();
const original=JSON.parse(await readFile('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json','utf8'));
const path='artifacts/software-factory/goals-r29/independent-pg-runtime-start-1791830000000-11111111-1111-1111-1111-111111111111.json',jp='.jarvis-dev/maintenance/factory-r29-pg-runtime-once.json';
const controlNames=['activation.json','factory-freeze-independent-pg-runtime-r29.py','r29-qa-pg-build-review.json','r29-qa-pg-cache-contract.json','r29-qa-pg-cache-readback.json','r29-qa-pg-inputs/package.json','r29-qa-pg-inputs/pnpm-lock.yaml','r29-qa-pg-protection-proof.json'];
const files=Object.fromEntries(controlNames.map(n=>[n,H])),inventory=sha(canonical(files));
const owner={unit:'jarvis-qa-pg-r29-'+attempt+'-owner.service',pid:1700000,startTicks:'28000000',boot:original.node.boot,controlGroup:'/system.slice/jarvis-qa-pg-r29-'+attempt+'-owner.service',runtimeMaxSec:900,stopTimeoutSec:120,restart:'no',killMode:'control-group'};
function context(){
 const start={schemaVersion:1,kind:'software-factory-r29-independent-pg-runtime-start',attempt,dispatched:true,workerSHA256:S.workerSHA256,sourceScope:clone(S.immutableScope.candidate),ownerUnit:owner.unit,owner:clone(owner),activationSHA256:H,onceIntentSHA256:H,controlInventorySHA256:inventory};
 const raw=JSON.stringify(start),q={schemaVersion:1,kind:'r29-independent-pg-runtime-once-journal',attempt,immutableScope:clone(S.immutableScope),dispatched:true,startIntentAt:new Date(now).toISOString(),owner:clone(owner),activationSHA256:H,onceIntentSHA256:H,controlInventorySHA256:inventory,receipts:{start:{path,sha256:sha(raw)}}};
 return {start,raw,q,B:assertIndependentPGCleanupContext(q,start)};
}
function host(B){
 const h=clone(original.observations.oldBuild);h.attempt=attempt;h.observedAt=new Date(now).toISOString();h.workerSHA256=B.toolSHA;h.activationSHA256=H;h.onceIntentSHA256=H;h.controlInventorySHA256=inventory;h.stateSHA256=H;h.installStatus='installed';
 h.node.state='R';for(const s of h.scans)s.node=clone(h.node);
 const dir=(uid,ino,entries)=>({uid,mode:448,identity:{device:66306,inode:ino},metadataSHA256:H,entries,nofollow:true,stable:true});
 h.attemptDirectory=dir(0,100,12);h.control={...dir(0,101,9),files:clone(files),activationBound:true,requiredFilesBound:true};h.work=dir(1000,102,2);
 h.mountPolicy={creationIntentBound:true,expectedDestinations:['/work','/corepack-runtime','/corepack-cache','/pnpm-store'],productSourceMounted:false,hostDockerSocketMounted:false,actualContainerMountsObserved:false};
 h.packageJavaScriptExecuted=false;h.procScope.includesInstallerOwnerCgroup=true;h.procScope.workspace=S.rootBase+'/'+attempt;
 const name='jarvis-qa-pg-r29-'+attempt+'-install';h.docker.exactNames=[name];h.docker.absentNames=[name];h.docker.labelScopes[0].filters=['label=jarvis.qa.pg.r29.attempt='+attempt];h.docker.labelScopes[1].filters=['label=jarvis.qa.pg.r29.attempt='+attempt,'label=jarvis.qa.pg.r29.kind=independent-runtime'];
 h.owner.identity={pid:owner.pid,startTicks:owner.startTicks,boot:owner.boot};h.owner.unit.Id=owner.unit;h.owner.cgroupPath=owner.controlGroup;Object.assign(h.owner,{originalOwnerContractVerified:true,runtimeMaxSec:900,stopTimeoutSec:120,exactExecStopPostConfigured:true});return h;
}
function harness(edit={}){
 const c=context();edit.q?.(c.q);edit.start?.(c.start);const raw=JSON.stringify(c.q),startRaw=edit.startRaw??JSON.stringify(c.start),h=host(c.B);edit.host?.(h);let roots=0,proofs=0,reads=[];
 return {q:c.q,h,B:c.B,roots:()=>roots,reads,run:()=>verifyFactoryIndependentPGCleanupR29({attempt}, {now:()=>now,readLocal:async p=>{reads.push(p);if(p===jp)return raw;if(p===path)return startRaw;throw Error('UNEXPECTED_LOCAL_READ')},readRoot:async(p,code)=>{roots++;assert.equal(p.attempt,attempt);assert.ok(code.includes("p={**p,'workspace':str(private)}"));return edit.rawRoot===undefined?h:edit.rawRoot(h)},verifyProtection:async()=>{const p=clone(original);p.at=new Date(now).toISOString();edit.protection?.(p,++proofs);return p}})};
}

test('default missing nonce and unfrozen source perform no remote or platform reads',async()=>{
 let calls=0;const forbidden=()=>{calls++;throw Error('FORBIDDEN')};
 const r=await verifyFactoryIndependentPGCleanupR29({}, {readLocal:async()=>{throw Object.assign(Error('absent'),{code:'ENOENT'})},readRoot:forbidden,verifyProtection:forbidden});assert.equal(r.ready,false);assert.equal(r.remoteReadPerformed,false);assert.equal(calls,0);
 const u=await verifyFactoryIndependentPGCleanupR29({}, {fixedScope:{...S,workerSHA256:null},readLocal:forbidden,readRoot:forbidden,verifyProtection:forbidden});assert.equal(u.reason,'QA_PG_CLEANUP_SCOPE_NOT_FROZEN');assert.equal(calls,0);
});
test('controlled complete installed/failed census remains PG/runtime/product unaccepted',async()=>{
 for(const status of ['installed','failed']){const f=harness({host:h=>{h.installStatus=status;h.cleanupClaimsComplete=false}}),r=await f.run();assert.equal(r.ready,true);assert.equal(r.cleanupIndependentlyVerified,true);assert.equal(r.installStatus,status);for(const k of ['productCodeExecuted','pgRuntimeAccepted','runtimeFrozen','runtimeReady','productAccepted','modelsInvoked','remoteMutationsPerformed','workerCleanupClaimsUsedAsProof'])assert.equal(r[k],false);assert.equal(f.roots(),1);}
});
test('actual default stdout string adapts to a host object; malformed and array frames cannot pass',async()=>{
 assert.equal((await harness({rawRoot:h=>JSON.stringify(h)}).run()).ready,true);
 for(const raw of ['private API/template body','[]','null','1']){const f=harness({rawRoot:()=>raw});await assert.rejects(f.run(),/HOST_RESULT_INVALID/);}
});
test('undispatched intent refuses host without inventing receipt',async()=>{const f=harness({q:q=>{q.dispatched=false}}),r=await f.run();assert.equal(r.ready,false);assert.equal(f.roots(),0);assert.deepEqual(f.reads,[jp]);});
test('wrong scope/receipt/control path are refused before any host operation',async()=>{
 for(const change of [q=>{q.immutableScope.root+='/other'},q=>{q.receipts.start.path='.jarvis-dev/private-env.json'},q=>{q.activationSHA256='b'.repeat(64)},q=>{q.owner.pid++}]){const f=harness({q:change});await assert.rejects(f.run(),/QA_PG_CLEANUP_/);assert.equal(f.roots(),0);assert.ok(!f.reads.includes('.jarvis-dev/private-env.json'));}
 const f=harness({startRaw:context().raw+' '});await assert.rejects(f.run(),/START_RECEIPT_CHANGED/);assert.equal(f.roots(),0);
});
test('unknown whole-proc read and forged aggregate flags remain rejected',async()=>{
 const f=harness({host:h=>{const s=h.scans[0],pid=s.inspectedPIDs.find(p=>p!==h.node.pid);s.inspectedPIDs=s.inspectedPIDs.filter(p=>p!==pid);s.readIncompletePIDs=[pid];s.counts.inspected--;s.counts.incomplete++;h.nativeProcessAndSocketCleanupVerified=false;h.cleanupClaimsComplete=true}});assert.equal((await f.run()).ready,false);
 const bad=host(context().B);bad.scans[0].counts.listed++;assert.throws(()=>assertIndependentPGCleanupHost(bad,context().B),/COUNTS_NOT_CLOSED/);
});
for(const [name,change]of [
 ['single install container still present',h=>{h.docker.absentNames=[];h.docker.present=[{name:h.docker.exactNames[0]}];h.docker.complete=false}],
 ['first label network survives',h=>{h.docker.labelScopes[0].networks=['retained'];h.docker.complete=false}],
 ['second label volume survives',h=>{h.docker.labelScopes[1].volumes=['retained'];h.docker.complete=false}],
 ['owner live or PID reused',h=>{h.owner.pidAbsent=false;h.owner.complete=false}],
 ['detached owner-cgroup process',h=>{h.scans[0].ownerCgroupProcesses=[1800000];h.scans[0].relatedProcesses=[1800000];h.nativeProcessAndSocketCleanupVerified=false}],
 ['filesystem socket',h=>{h.workspaceSockets.filesystem=['retained.sock'];h.nativeProcessAndSocketCleanupVerified=false}],
 ['node ACK pending',h=>{h.nodeACK.counts.runs=1;for(const s of h.scans)s.ack=clone(h.nodeACK);h.nativeProcessAndSocketCleanupVerified=false}]
])test('actual scope refuses '+name,()=>{const c=context(),h=host(c.B);change(h);assert.equal(assertIndependentPGCleanupHost(h,c.B).cleanupIndependentlyVerified,false);});
test('pidfd exit requires identityBound and exact enumerated identity',()=>{
 const c=context(),h=host(c.B),s=h.scans[0],pid=s.inspectedPIDs.find(p=>p!==h.node.pid);s.inspectedPIDs=s.inspectedPIDs.filter(p=>p!==pid);s.counts.inspected--;s.counts.pidfdProvenExits++;
 const e={pid,boot:h.node.boot,listedProcIdentity:{device:24,inode:123456},processIdentity:{pid,boot:h.node.boot,procDevice:24,procInode:123456},kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:pid,exitConfirmed:true,procPathAbsent:true,pollEvents:1}};s.exitedDuringScan=[e];assert.equal(assertIndependentPGCleanupHost(h,c.B).cleanupIndependentlyVerified,true);
 for(const change of [e=>{e.kernelProof.identityBound=false},e=>{e.kernelProof.procPathAbsent=false},e=>{e.kernelProof.pollEvents=8},e=>{e.processIdentity.procInode++}]){const bad=clone(h);change(bad.scans[0].exitedDuringScan[0]);assert.throws(()=>assertIndependentPGCleanupHost(bad,c.B),/PIDFD_IDENTITY_UNPROVEN/);}
});
test('activation/control inventory, directory identity and mount scope are mandatory',()=>{
 const c=context();for(const change of [h=>{delete h.work.identity},h=>{h.control.files['activation.json']='b'.repeat(64)},h=>{h.control.activationBound=false},h=>{h.mountPolicy.hostDockerSocketMounted=true},h=>{h.owner.stopTimeoutSec=300}]){const h=host(c.B);change(h);assert.throws(()=>assertIndependentPGCleanupHost(h,c.B),/QA_PG_CLEANUP_/);}
});
test('fresh protection retains full identity/ACK/config while harmless R/S state is ignored',async()=>{
 assert.equal((await harness().run()).ready,true);
 for(const change of [p=>{p.node.startTicks+='1'},p=>{p.node.procInode++},p=>{p.observations.nativeSource.nodeACK.identity.inode++},p=>{p.nodeConfigSHA256='b'.repeat(64)},p=>{p.sources.main.metadataSHA='b'.repeat(64)}]){const f=harness({protection:(p,n)=>{if(n===2)change(p)}});await assert.rejects(f.run(),/PROTECTION_OR_ACK_CHANGED/);}
 const f=harness({host:h=>{h.observedAt=new Date(now-300001).toISOString()}});await assert.rejects(f.run(),/CONTEXT_OR_AGE_CHANGED/);
});
test('actual assembled Python is syntactically valid, no worker or package code is loaded, original pidfd reader preserved',()=>{
 const c=context(),p=independentPGCleanupR29RootProgram(c.B),n=targetCleanupR29HostProgram();const r=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.read());print("AST_OK")'],{input:p,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'AST_OK');
 const a=n.indexOf('def process_record('),z=n.indexOf('def census():');assert.ok(a>0&&z>a);assert.ok(p.includes(n.slice(a,z)));assert.ok(p.includes("p={**p,'workspace':str(private)}"));assert.ok(p.indexOf('work_before=directory_state')<p.indexOf('scan_before=census()'));assert.ok(p.includes("signal.alarm(150)"));
 assert.ok(!p.includes('importlib'));assert.ok(!p.includes('--reconcile-cleanup'));assert.ok(!p.includes("['rm'"));assert.ok(!p.includes('docker.sock'));assert.ok(p.includes("private_read(Path(p['tool']),100000)"));
});
test('public failure receipt contains only closed code and no arbitrary private error text',()=>{const secret='private-api-body template private-journal';const r=independentPGCleanupFailure(Error(secret));assert.equal(JSON.stringify(r).includes(secret),false);assert.equal(r.rawErrorExported,false);assert.equal(r.ready,false);assert.equal(independentPGCleanupFailure(Error('QA_PG_CLEANUP_COUNTS_NOT_CLOSED')).errorCode,'QA_PG_CLEANUP_COUNTS_NOT_CLOSED');});
