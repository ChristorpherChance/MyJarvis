/** Actual caller with in-memory operational adapters. No remote or removal. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as m from './reconcile-factory-redis-resources-r32.mjs';
import {canonical} from './run-factory-main-repair-r26.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const S=m.matrixRedisFailureRecoveryR32Scope;
function fixture(){
 const paths=[S.caller,S.program,S.diagnostic.path,S.publicDiagnostic.path,S.oldManifest.path,m.matrixRedisFailureRecoveryR32PreflightSource],files=new Map(paths.map(p=>[p,readFileSync(p)]));
 const reviewPath='controlled-recovery-review.json',reviewRaw=Buffer.from(JSON.stringify({kind:'r32-failed-redis-resource-recovery-independent-local-review',programSHA256:sha(files.get(S.program)),callerSHA256:sha(files.get(S.caller)),preflightReaderSHA256:sha(files.get(m.matrixRedisFailureRecoveryR32PreflightSource)),staticPreparationReady:true,remainingP0P1:0,remoteOperations:false})),review={path:reviewPath,sha256:sha(reviewRaw)};files.set(reviewPath,reviewRaw);
 const now=Date.now(),proof=JSON.parse(readFileSync('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json'));proof.at=new Date(now).toISOString();
 const pre={kind:'software-factory-r32-truth-gate-redis-recovery-preflight',at:new Date(now).toISOString(),attempt:S.originalAttempt,runID:S.originalRunID,...Object.fromEntries(['ready','currentProcessScopeClean','currentResourcesRemain','originalRecordsUnchanged','unknownOriginalCreationIdentityPreserved'].map(k=>[k,true])),...Object.fromEntries(['originalMatrixCleanupQualified','cleanupIndependentlyVerified','modelsInvoked','resourcesRemoved','remoteMutations'].map(k=>[k,false])),evidence:Object.fromEntries(['host','protectionBefore','protectionAfter'].map(k=>[k,{path:'controlled-'+k+'.json',sha256:'c'.repeat(64)}]))};
 const original=JSON.parse(JSON.parse(files.get(S.diagnostic.path)).stdout),pg=JSON.parse(Buffer.from(original.exact.redis.stdoutBase64,'base64'))[0],vol=JSON.parse(Buffer.from(original.exact['redis-data'].stdoutBase64,'base64'))[0];
 const resources={redis:{id:pg.Id,name:pg.Name.slice(1),createdAt:pg.Created,imageID:pg.Image,configSHA256:sha(canonical(pg.Config)),hostConfigSHA256:sha(canonical(pg.HostConfig))},redisVolume:{name:vol.Name,createdAt:vol.CreatedAt,inspectionSHA256:sha(canonical(vol))}};
 let count=0,mode='normal',locked=false,serial=0,badSave=false,preCalls=0,last;
 const events=[],d={readLocal:async p=>{if(!files.has(p))throw Object.assign(Error('absent'),{code:'ENOENT'});return files.get(p)},verifyProtection:async()=>structuredClone(proof),preflight:async()=>{preCalls++;return structuredClone(pre)},now:()=>now,nonce:()=> 'f'.repeat(32),lock:async()=>{assert.equal(locked,false);locked=true;return{}},unlock:async()=>{locked=false},writeWX:async(p,b)=>{assert.equal(files.has(p),false);files.set(p,Buffer.from(b));events.push('wx-intent')},save:async q=>{if(badSave)throw Error('R32_REDIS_RECOVERY_LOCAL_DURABILITY_FAILED');files.set(m.matrixRedisFailureRecoveryR32Journal,Buffer.from(JSON.stringify(q)));events.push('durable-intent')},evidenceWX:async v=>{const path='controlled-evidence-'+serial+++'.json',raw=Buffer.from(JSON.stringify(v,null,2)+'\n');files.set(path,raw);return{path,sha256:sha(raw)}},privateWX:async v=>{const path='controlled-private-'+serial+++'.json',raw=Buffer.from(JSON.stringify(v));files.set(path,raw);return{path,sha256:sha(raw)}},readRoot:async(p,program)=>{
  assert.equal(sha(program),sha(files.get(S.program)));assert.equal(p.originalAttempt,S.originalAttempt);assert.equal(p.originalRunID,S.originalRunID);assert.equal(sha(Buffer.from(p.diagnosticRawBase64,'base64')),S.diagnostic.sha256);assert.equal(sha(Buffer.from(p.preflightRawBase64,'base64')),p.preflightSHA256);
  if(p.action==='inspect')return{readyForExactRecovery:true,unknownOriginalCreationIdentityPreserved:true,originalMatrixCleanupQualified:false,readOnly:true};
  if(p.action==='execute'){count++;assert.ok(events.indexOf('durable-intent')>events.indexOf('wx-intent'));assert.equal(JSON.parse(files.get(m.matrixRedisFailureRecoveryR32Journal)).recoveryNonce,p.recoveryNonce);if(mode==='lost')throw Error('R32_REDIS_RECOVERY_CONTROLLED_RESPONSE_LOST')}
  const ns=S.base+'/'+p.recoveryNonce,r={schemaVersion:1,kind:'r32-failed-redis-resource-recovery-result',originalAttempt:S.originalAttempt,originalRunID:S.originalRunID,recoveryNonce:p.recoveryNonce,programSHA256:p.programSHA256,callerSHA256:p.callerSHA256,diagnosticSHA256:S.diagnostic.sha256,reviewSHA256:p.reviewSHA256,preflightSHA256:p.preflightSHA256,intentSHA256:'a'.repeat(64),resources,removedRoles:['redis','redis-data'],status:'removed',errorCodes:[],originalRecordsUnchanged:true,unknownOriginalCreationIdentityPreserved:true,originalCreatedRecordStillMissing:true,originalMatrixCleanupQualified:false,cleanupIndependentlyVerified:false,modelsInvoked:false,productCodeExecutedByRecovery:false,productAccepted:false};
  if(mode==='wrong-id')r.resources={...resources,redis:{...resources.redis,id:'b'.repeat(64)}};
  last={namespace:ns,rootIntent:{path:ns+'/intent.json',sha256:r.intentSHA256},rootResult:{path:ns+'/result.json',sha256:sha(canonical(r))},result:r,readOnly:p.action==='check'};return last;
 }};return{d,files,review,proof,pre,events,mutations:()=>count,preCalls:()=>preCalls,locked:()=>locked,setMode:v=>mode=v,setBadSave:v=>badSave=v,last:()=>last};
}
test('default review null refuses before any operational or receipt IO',async()=>{
 let io=0;const nope=()=>{io++;throw Error('unexpected IO')};const v=await m.reconcileFactoryRedisResourcesR32('execute',{},Object.fromEntries(['readLocal','readRoot','preflight','verifyProtection','evidenceWX','privateWX','writeWX','save','lock'].map(k=>[k,nope])));assert.equal(io,0);assert.equal(v.ready,false);assert.equal(v.remoteMutations,false);
});
test('actual caller binds exact bytes and independent current preflight before durable one operation',async()=>{
 const f=fixture(),v=await m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d);assert.equal(v.ready,true);assert.equal(f.mutations(),1);assert.equal(f.preCalls(),1);assert.equal(v.cleanupIndependentlyVerified,false);assert.equal(v.originalMatrixCleanupQualified,false);assert.equal(v.unknownOriginalCreationIdentityPreserved,true);assert.equal(v.result,undefined);assert.equal(v.resources,undefined);assert.equal(f.locked(),false);
 const q=JSON.parse(f.files.get(m.matrixRedisFailureRecoveryR32Journal));assert.equal(q.executeResponseConfirmed,true);assert.ok(q.preflightRef);assert.deepEqual(v.rootIntent,f.last().rootIntent);
});
test('independent current process incomplete or stale denies before any execute intent',async()=>{
 for(const k of ['currentProcessScopeClean','currentResourcesRemain','originalRecordsUnchanged']){const f=fixture();f.pre[k]=false;await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/PROCESS_SCOPE_UNPROVEN/);assert.equal(f.mutations(),0);assert.equal(f.files.has(m.matrixRedisFailureRecoveryR32Journal),false);assert.equal(f.locked(),false)}
 const f=fixture();f.pre.at='2020-01-01T00:00:00Z';await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/PREFLIGHT_STALE/);assert.equal(f.mutations(),0);
});
test('local failed durability keeps exclusive intent and blocks automatic repeated operation',async()=>{
 const f=fixture();f.setBadSave(true);await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/DURABILITY_FAILED/);assert.equal(f.mutations(),0);f.setBadSave(false);await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/ONCE_ALREADY_INTENDED/);assert.equal(f.mutations(),0);
});
test('ambiguous execute response permits only same-nonce readonly check, never replay',async()=>{
 const f=fixture();f.setMode('lost');await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/RESPONSE_LOST/);assert.equal(f.mutations(),1);const q=JSON.parse(f.files.get(m.matrixRedisFailureRecoveryR32Journal));assert.equal(q.executeUncertain,true);
 await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/ONCE_ALREADY_INTENDED/);f.setMode('normal');const v=await m.reconcileFactoryRedisResourcesR32('check',{review:f.review},f.d);assert.equal(v.readOnly,true);assert.equal(f.mutations(),1);assert.equal(f.preCalls(),1);assert.equal(v.originalMatrixCleanupQualified,false);
});
test('current ID changed or forged complete-history claim cannot become recovered',async()=>{
 const f=fixture();f.setMode('wrong-id');await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/RESULT_UNBOUND/);assert.equal(f.mutations(),1);const good=fixture();await m.reconcileFactoryRedisResourcesR32('execute',{review:good.review},good.d);const q=JSON.parse(good.files.get(m.matrixRedisFailureRecoveryR32Journal)),v=structuredClone(good.last());v.result.unknownOriginalCreationIdentityPreserved=false;assert.throws(()=>m.assertMatrixRedisFailureRecoveryR32Result(v,q),/RESULT_UNBOUND/);
});
test('source or preflight-reader hash drift is refused before lock or independent read',async()=>{
 const f=fixture();f.files.set(m.matrixRedisFailureRecoveryR32PreflightSource,Buffer.from('changed'));await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/REVIEW_OR_INPUT_CHANGED/);assert.equal(f.preCalls(),0);assert.equal(f.mutations(),0);assert.equal(f.locked(),false);
});
test('lazy all-settled initial reads finish pending evidence before a synchronous read failure',async()=>{
 const f=fixture();let pendingDone=false;const read=f.d.readLocal;f.d.readLocal=p=>p===S.caller?new Promise(resolve=>setTimeout(()=>{pendingDone=true;resolve(f.files.get(p))},20)):p===S.program?(()=>{throw Error('controlled sync failure')})():read(p);await assert.rejects(m.reconcileFactoryRedisResourcesR32('execute',{review:f.review},f.d),/controlled sync failure/);assert.equal(pendingDone,true);assert.equal(f.mutations(),0);
});
