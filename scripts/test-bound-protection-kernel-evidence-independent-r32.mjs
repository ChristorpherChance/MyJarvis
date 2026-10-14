/** New kernel-evidence raw-reference guards. All alleged Linux facts below are controlled in-memory data. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {sha} from './run-factory-main-repair-r26.mjs';
import {boundCensusLinuxR32HostProgram} from './start-factory-bound-census-linux-r32.mjs';
import {boundProtectionContractR32Scope as S,boundProtectionSharedFunctionSHA256R32,assertBoundProtectionKernelQualificationR32,verifyBoundProtectionKernelEvidenceR32,verifyFactoryBoundProtectionContractR32} from './verify-factory-bound-protection-contract-r32.mjs';
const json=v=>Buffer.from(JSON.stringify(v)+'\n'),ref=(path,raw)=>({path,sha256:sha(raw)});
function controlled(){
 const nonce='a'.repeat(32),boot='00000000-0000-0000-0000-000000000001',unit='jarvis-bound-census-r32-'+nonce+'.service';
 const owner={pid:100,startTicks:'1000',boot,procDevice:17,procInode:11,unit,cgroup:'/system.slice/'+unit,invocationId:'b'.repeat(32),uid:1000,gid:1000,noNewPrivileges:true,effectiveCapabilities:0,runtimeMaxSec:80,stopTimeoutSec:10,hardParentBoundSeconds:90,killMode:'control-group',restart:'no',initialKillSignal:'SIGKILL',execStartSHA256:'c'.repeat(64)};
 const fixtureProcessIdentity={pid:200,ppid:100,startTicks:'2000',boot,procDevice:17,procInode:22,uid:1000,controlGroup:owner.cgroup,argvSHA256:'d'.repeat(64)};
 const originalBoundExitProof={pid:300,boot,listedProcIdentity:{device:17,inode:33},processIdentity:{pid:300,ppid:200,startTicks:'3000',boot,procDevice:17,procInode:33},kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:300,exitConfirmed:true,pollEvents:1,procPathAbsent:true}};
 const v={schemaVersion:1,kind:'r32-bound-census-linux-subset-independent-result',ready:true,fixtureQualified:true,actualLinuxProcessReads:true,fullProtectionQualified:false,fullProcCensusExecuted:false,productCodeExecuted:false,modelsInvoked:false,productAccepted:false,generatorSHA256:S.generatorSHA256,fixtureSHA256:S.fixtureSHA256,bothGeneratedSHA256:{native:S.nativeSHA256,build:S.buildSHA256},sharedThreeFunctionSHA256:boundProtectionSharedFunctionSHA256R32(),actualPhase:'native',executedGeneratedSHA256:S.nativeSHA256,otherWholeProgramExecuted:false,nonce,owner,fixtureProcessIdentity,originalBoundExitProof,independentCleanupVerified:true,ownerGone:true,ownerCgroupEmpty:true,knownChildGone:true,descriptorClosed:true,naturalChildExit:true,signalsUsedByFixture:false,deadAttachErrno:3};
 const raws=new Map(),install=(path,raw)=>{raws.set(path,raw);return ref(path,raw)};
 v.sourceRefs={owner:install('scripts/factory-bound-census-linux-owner-r32.py',readFileSync('scripts/factory-bound-census-linux-owner-r32.py')),starter:install('scripts/start-factory-bound-census-linux-r32.mjs',readFileSync('scripts/start-factory-bound-census-linux-r32.mjs')),hostProgram:install('scripts/controlled-bound-census-host.py',Buffer.from(boundCensusLinuxR32HostProgram()))};
 const sourceReview={kind:'r32-bound-census-linux-parent-independent-local-review',staticPreparationReady:true,remainingP0P1:0,ownerSHA256:v.sourceRefs.owner.sha256,starterSHA256:v.sourceRefs.starter.sha256,hostProgramSHA256:v.sourceRefs.hostProgram.sha256};
 v.sourceRefs.sourceReview=install('artifacts/software-factory/goals-r29/controlled-source-review.json',json(sourceReview));
 const stdout={schemaVersion:1,kind:'r32-bound-census-linux-subset-qualification',fixtureQualified:true,phase:v.actualPhase,generatedSourceSHA256:v.executedGeneratedSHA256,functionSHA256:v.sharedThreeFunctionSHA256,originalBoundExitProof,alreadyDeadAttachErrno:3,naturalChildExit:true,descriptorClosed:true,childReaped:true,signalsSent:false,fullProtectionQualified:false,fullProcCensusExecuted:false,productCodeExecuted:false,modelsInvoked:false};
 const start={schemaVersion:1,kind:'r32-bound-census-linux-parent-observation',nonce,phase:v.actualPhase,dispatchSubmitted:true,owner:{...owner,controlGroup:owner.cgroup},unit:{Id:unit},ownerSHA256:v.sourceRefs.owner.sha256,generatedSHA256:v.executedGeneratedSHA256,fixtureSHA256:S.fixtureSHA256};
 const cleanup={schemaVersion:1,kind:'r32-bound-census-linux-subset-independent-cleanup',nonce,ready:true,independent:true,owner,fixtureProcessIdentity,knownChildIdentity:originalBoundExitProof.processIdentity,ownerGone:true,fixtureGone:true,knownChildGone:true,ownerCgroupEmpty:true,processFDAndSocketScopeComplete:true,sourceBytesVerified:true,productCodeExecuted:false,fullProtectionQualified:false};
 v.evidence={stdout:install('.jarvis-dev/maintenance/controlled-fixture-stdout.json',json(stdout)),start:install('artifacts/software-factory/goals-r29/controlled-fixture-start.json',json(start)),cleanup:install('artifacts/software-factory/goals-r29/controlled-fixture-cleanup.json',json(cleanup))};
 v.stdoutSHA256=v.evidence.stdout.sha256;v.startReceiptSHA256=v.evidence.start.sha256;v.cleanupProofSHA256=v.evidence.cleanup.sha256;
 const update=(kind,mutate)=>{const r=kind==='sourceReview'?v.sourceRefs.sourceReview:v.evidence[kind];const value=JSON.parse(raws.get(r.path));mutate(value);const raw=json(value);raws.set(r.path,raw);r.sha256=sha(raw);if(kind==='stdout')v.stdoutSHA256=r.sha256;if(kind==='start')v.startReceiptSHA256=r.sha256;if(kind==='cleanup')v.cleanupProofSHA256=r.sha256;};
 let reads=0;return{v,raws,update,readLocal:async path=>{reads++;assert.ok(raws.has(path),path);return raws.get(path)},get reads(){return reads}};
}
test('configured actual exported kernel-evidence verifier joins controlled original raw sources, start/stdout/cleanup and stable rereads',async()=>{
 const c=controlled();assert.equal(assertBoundProtectionKernelQualificationR32(c.v),c.v);assert.equal(await verifyBoundProtectionKernelEvidenceR32(c.v,c.readLocal),c.v);assert.equal(c.reads,14);
});
test('owner/fixture/child identity, EXIT mask and subset scope reject before evidence reads',async()=>{
 const changes=[v=>v.owner.pid=0,v=>v.owner.boot='bad',v=>v.fixtureProcessIdentity.ppid=999,v=>v.originalBoundExitProof.processIdentity.ppid=999,v=>v.originalBoundExitProof.kernelProof.identityBound=false,v=>v.originalBoundExitProof.kernelProof.pollEvents=9,v=>v.originalBoundExitProof.listedProcIdentity.inode++,v=>v.otherWholeProgramExecuted=true,v=>v.fullProcCensusExecuted=true,v=>v.owner.hardParentBoundSeconds=180,v=>v.evidence.start.path='../outside.json'];
 for(const change of changes){const c=controlled();change(c.v);await assert.rejects(verifyBoundProtectionKernelEvidenceR32(c.v,c.readLocal));assert.equal(c.reads,0);}
});
test('raw byte drift and repinned but mismatched stdout/start/cleanup/source review cannot qualify',async()=>{
 for(const mode of ['byte-drift','stdout-proof','start-owner','cleanup-child','cleanup-scope','review-source']){
  const c=controlled();
  if(mode==='byte-drift')c.raws.set(c.v.evidence.stdout.path,Buffer.from('different raw bytes'));
  else if(mode==='stdout-proof')c.update('stdout',v=>v.originalBoundExitProof.processIdentity.ppid=999);
  else if(mode==='start-owner')c.update('start',v=>v.owner.procInode++);
  else if(mode==='cleanup-child')c.update('cleanup',v=>v.knownChildIdentity.startTicks='new-start');
  else if(mode==='cleanup-scope')c.update('cleanup',v=>v.processFDAndSocketScopeComplete=false);
  else c.update('sourceReview',v=>v.starterSHA256='f'.repeat(64));
  await assert.rejects(verifyBoundProtectionKernelEvidenceR32(c.v,c.readLocal));assert.ok(c.reads>=7);
 }
});
test('all raw reads settle on rejection; final reread catches evidence mutation rather than accepting old hashes',async()=>{
 let pending=0,completed=0;const c=controlled();const path=c.v.evidence.start.path;
 await assert.rejects(verifyBoundProtectionKernelEvidenceR32(c.v,async p=>{pending++;await Promise.resolve();pending--;completed++;if(p===path)throw Error('controlled read failure');return c.raws.get(p)}),/controlled read failure/);assert.equal(pending,0);assert.equal(completed,7);
 const d=controlled(),counts=new Map();await assert.rejects(verifyBoundProtectionKernelEvidenceR32(d.v,async p=>{const count=(counts.get(p)??0)+1;counts.set(p,count);return count===2&&p===d.v.sourceRefs.owner.path?Buffer.from('changed after'):d.raws.get(p)}),/EVIDENCE_CHANGED_AFTER/);assert.equal([...counts.values()].filter(v=>v===2).length,7);
});
test('new consumer rejects a critical authority-source hash change before API, SQL, or root transport',async()=>{
 const path='artifacts/software-factory/goals-r29/r32-bound-census-linux-subset-independent-result-1791850000000-00000000-0000-0000-0000-000000000001.json',reviewPath='artifacts/software-factory/goals-r29/r32-bound-protection-consumer-independent-local-review-1791850000000-00000000-0000-0000-0000-000000000002.json';
 for(const critical of ['scripts/read-factory-truth-gate-build-scope-r29.mjs','scripts/run-factory-target-repair-r29.mjs']){
  let remote=0;const deny=async()=>{remote++;throw Error('must not call')};const activation={actualLinuxQualification:ref(path,Buffer.from('{}')),consumerIndependentReview:ref(reviewPath,Buffer.from('{}'))};
  await assert.rejects(verifyFactoryBoundProtectionContractR32(activation,{api:deny,readRoot:deny,readPrimary:deny,nodeState:deny,queueState:deny,readLocal:async p=>{if(p===path||p===reviewPath)return Buffer.from('{}');const raw=readFileSync(p);return p===critical?Buffer.concat([raw,Buffer.from('changed')]):raw}}),/CONTEXT_SOURCE_CHANGED/);assert.equal(remote,0);
 }
});
