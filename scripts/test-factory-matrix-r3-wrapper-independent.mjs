/** Local data-only wrapper admission checks. No packet/gate/journal or remote creation. */
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createHash}from'node:crypto';
import{activateMatrixR3,assertApprovedMatrixR3Inputs as qualify,matrixR3WrapperRefs as refs,approvedInputsPath}from'../.jarvis-dev/maintenance/activate-r32-r3-qualified-matrix.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),wrapperPath='.jarvis-dev/maintenance/activate-r32-r3-qualified-matrix.mjs',selfSHA=sha(fs.readFileSync(wrapperPath));
function fixture(){
 const oldBytes=Buffer.from('controlled old failure journal bytes, not actual run evidence');
 const packet={kind:'r32-r3-matrix-approved-inputs',wrapperSHA256:selfSHA,starterSHA256:refs[0].sha256,oldAttempt:'393a2f452c36993061f271475f2bffda',oldJournalSHA256:sha(oldBytes),sourceRefs:refs};
 const review={staticPreparationReady:true,remainingP0P1:0,starterSHA256:refs[0].sha256,wrapperSHA256:selfSHA,workerSHA256:refs[5].sha256,cleanupReaderSHA256:refs[6].sha256,resultsReaderSHA256:refs[7].sha256,actualHTTPValidationAccepted:false,remoteOperations:false};
 const recovery={kind:'software-factory-r32-truth-gate-recovery-independent-cleanup',failureRecoveryScope:true,attempt:packet.oldAttempt,runID:'d0c9e0b4b9c40d1be04b0307fd57dda56d8b38b1',ready:true,cleanupIndependentlyVerified:true,recoveredResourceScopeVerified:true,fullProcessCensusVerified:true,nativeProcessAndSocketCleanupVerified:true,ownerVerifiedGone:true,nodeACKIdle:true,artifactIndependentlyRead:true,protectedInventoryFullyVerified:true,fullQueueSQLVerified:true,originalMatrixCleanupQualified:false,unknownOriginalCreationIdentityPreserved:true,originalCreatedRecordStillMissing:true,productAccepted:false,modelsInvoked:false};
 const rr=Buffer.from(JSON.stringify(review)),cr=Buffer.from(JSON.stringify(recovery));packet.entryReview={path:'artifacts/software-factory/goals-r29/controlled-new-entry-review.json',sha256:sha(rr)};packet.recoveryProof={path:'artifacts/software-factory/goals-r29/controlled-new-recovery-proof.json',sha256:sha(cr)};
 const files=new Map(refs.map(r=>[r.path,fs.readFileSync(r.path)]));files.set(packet.entryReview.path,rr);files.set(packet.recoveryProof.path,cr);files.set('.jarvis-dev/maintenance/factory-r32-truth-gate-matrix-once.json',oldBytes);files.set(approvedInputsPath,Buffer.from(JSON.stringify(packet)));files.set(wrapperPath,fs.readFileSync(wrapperPath));
 let reads=0;const d={readLocal:async p=>{reads++;p=p.replaceAll('\\','/');if(p.endsWith('/'+wrapperPath))p=wrapperPath;assert(files.has(p),'unexpected read '+p);return files.get(p)}};
 return{packet,review,recovery,files,d,getReads:()=>reads};
}
test('actual wrapper missing approved packet returns bounded notready after exactly one controlled read',async()=>{
 let reads=0;const r=await activateMatrixR3('start',{readLocal:async p=>{reads++;assert.equal(p,approvedInputsPath);throw Object.assign(Error('absent'),{code:'ENOENT'})}});
 assert.equal(reads,1);assert.equal(r.ready,false);assert.equal(r.remoteOperations,false);assert.equal(r.newNonceGenerated,false);assert.equal(r.journalCreated,false)
});
test('actual pure admission requires exact new five source identities and preserves original unknown-created record',()=>{
 const f=fixture();assert.equal(qualify(f.packet,f.review,f.recovery,selfSHA),true);
 for(const change of [f=>f.packet.oldAttempt='a'.repeat(32),f=>f.packet.wrapperSHA256='a'.repeat(64),f=>f.packet.sourceRefs=[...refs].reverse(),f=>f.review.starterSHA256=refs[1].sha256,f=>f.review.cleanupReaderSHA256='a'.repeat(64),f=>f.recovery.runID='a'.repeat(40),f=>f.recovery.originalMatrixCleanupQualified=true,f=>f.recovery.originalCreatedRecordStillMissing=false,f=>f.recovery.unknownOriginalCreationIdentityPreserved=false]){
  const v=fixture();change(v);assert.throws(()=>qualify(v.packet,v.review,v.recovery,selfSHA),/QA_R32_R3_/)
 }
});
test('each real resource/process/artifact/queue recovery flag must be true, not fake green or unknown',()=>{
 for(const key of ['ready','failureRecoveryScope','cleanupIndependentlyVerified','recoveredResourceScopeVerified','fullProcessCensusVerified','nativeProcessAndSocketCleanupVerified','ownerVerifiedGone','nodeACKIdle','artifactIndependentlyRead','protectedInventoryFullyVerified','fullQueueSQLVerified'])for(const value of [false,null,1]){
  const f=fixture();f.recovery[key]=value;assert.throws(()=>qualify(f.packet,f.review,f.recovery,selfSHA),/ACTUAL_FAILURE_RECOVERY_REQUIRED/)
 }
});
test('actual wrapper inspect reads fixed source bytes/inverse literal manifest and performs no gate or operational calls',async()=>{
 const f=fixture(),r=await activateMatrixR3('inspect',f.d);assert.equal(r.readyForNewFiniteAttempt,true);assert.equal(r.actualStarterSHA256,refs[0].sha256);assert.equal(r.actualWrapperSHA256,selfSHA);assert.equal(r.remoteOperations,false);assert.equal(r.newNonceGenerated,false);assert.equal(r.journalCreated,false);assert.equal(f.getReads(),13)
});
test('actual wrapper refuses changed evidence/source hash and wrong packet reference before operational import',async()=>{
 for(const key of [refs[0].path,refs[5].path,refs[6].path,refs[7].path]){const f=fixture();f.files.set(key,Buffer.from('changed'));await assert.rejects(activateMatrixR3('inspect',f.d),/INITIAL_SOURCE_CHANGED/)}
 const f=fixture();f.packet.recoveryProof.sha256='a'.repeat(64);f.files.set(approvedInputsPath,Buffer.from(JSON.stringify(f.packet)));await assert.rejects(activateMatrixR3('inspect',f.d),/INITIAL_SOURCE_CHANGED/)
 const g=fixture();g.packet.recoveryProof.path='../../../outside.json';g.files.set(approvedInputsPath,Buffer.from(JSON.stringify(g.packet)));await assert.rejects(activateMatrixR3('inspect',g.d),/REQUIRED_REFS_MISSING/)
});
