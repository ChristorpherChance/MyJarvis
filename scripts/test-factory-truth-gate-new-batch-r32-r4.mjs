/** New batch source/journal boundaries only. No nonce, journal, root, DB or product execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {startMatrixR32,assertMatrixR32QualifiedScope,matrixR32Scope as S,matrixR32JournalPath as JP,matrixR32GatePath as GP}
 from './start-factory-truth-gate-matrix-r32-r4.mjs';
import {matrixR32Scope as oldS,matrixR32JournalPath as oldJP,matrixR32GatePath as oldGP}from'./start-factory-truth-gate-matrix-r32-qualified.mjs';
import {matrixCleanupR32JournalPath as cleanupJP,verifyFactoryTruthGateMatrixCleanupR32 as cleanup}from'./verify-factory-truth-gate-matrix-cleanup-r32-r6.mjs';
import {matrixResultsR32JournalPath as resultsJP,readFactoryTruthGateMatrixResultsR32 as results,matrixResultsR32MissingPins as missingResults}from'./read-factory-truth-gate-matrix-results-r32-r4.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('prepared review-null caller rejects start/check before every dependency getter, nonce and IO',async()=>{
 let count=0;const hooks={};for(const key of ['readLocal','readRoot','verifyProtection','nonce','runID','lock','writeWX','save'])Object.defineProperty(hooks,key,{enumerable:true,get(){count++;throw Error('UNEXPECTED_IO')}});
 for(const action of ['start','check'])await assert.rejects(startMatrixR32(action,hooks),/QA_R32_ENVIRONMENT_NOT_QUALIFIED/);
 const v=await startMatrixR32('inspect',hooks);assert.deepEqual(v.missingQualification,['workerReview','cleanupReview']);assert.equal(v.remoteOperations,false);assert.equal(v.journalCreated,false);assert.equal(count,0)
});
test('new batch has one exact separate journal across caller/normal cleanup/oracle and its own gate',()=>{
 assert.equal(JP,'.jarvis-dev/maintenance/factory-r32-truth-gate-matrix-r4-once.json');assert.equal(cleanupJP,JP);assert.equal(resultsJP,JP);
 assert.notEqual(JP,oldJP);assert.notEqual(GP,oldGP);assert.equal(GP,'.jarvis-dev/maintenance/factory-r32-truth-gate-matrix-r4-reviewed-activation.json');
});
test('new worker-r4 source and installed path exactness preserve original artifact/source/runtime/image/build contracts',()=>{
 assert.equal(S.worker.path,'scripts/factory-truth-gate-matrix-worker-r32-r4.py');assert.equal(S.worker.sha256,sha(readFileSync(S.worker.path)));
 assert.equal(S.worker.installedPath,'/opt/jarvis-development/software-factory/factory-truth-gate-matrix-worker-r32-r4-'+S.worker.sha256.slice(0,16)+'.py');
 for(const k of ['sourceFingerprint','sourceIndex','runtimeRoot','PGManifestSHA256','librarySHA256','images','tools','nativePrerequisite','nativePrerequisiteSHA256','httpSQLDenominator','additionalPGDenominator','resourceCount','ownerRuntimeMaxSec','ownerStopSec','cleanupGlobalDeadlineSec'])assert.deepEqual(S[k],oldS[k]);
 for(const k of ['buildProof','artifactContract','imageContract'])assert.deepEqual(S.qualification[k],oldS.qualification[k]);
 const fake=structuredClone(S);for(const k of ['workerReview','cleanupReview'])fake.qualification[k]={path:'artifacts/software-factory/goals-r29/controlled-review.json',sha256:'a'.repeat(64)};
 assert.equal(assertMatrixR32QualifiedScope(fake),fake);fake.worker.installedPath=oldS.worker.installedPath;assert.throws(()=>assertMatrixR32QualifiedScope(fake),/NOT_QUALIFIED/)
});
test('new normal observer and results activation null refuse before reading old/new operational records',async()=>{
 let calls=0;const no=()=>{calls++;throw Error('UNEXPECTED_IO')};const c=await cleanup({},{readLocal:no,readRoot:no,verifyProtection:no,evidence:no});const r=await results({},{readLocal:no,loadCleanupModule:no});assert.equal(c.ready,false);assert.equal(r.ready,false);assert.equal(calls,0);
 const s={cleanupModule:'scripts/verify-factory-truth-gate-matrix-cleanup-r32-r3.mjs'};assert(missingResults(s).includes('cleanupModule'));
});
test('all new source deltas revert exact old bytes, normal r6 changes only prepared worker pin, installed path and journal',()=>{
 const m=JSON.parse(readFileSync('artifacts/software-factory/goals-r29/r32-matrix-r4-source-delta.json'));
 assert.equal(m.edits.filter(x=>x.file==='observer').length,3);
 for(const [key,file]of Object.entries(m.sources)){let src=String(readFileSync(file.path));for(const e of m.edits.filter(x=>x.file===key).reverse()){assert.equal(src.split(e.to).length,e.count+1);src=src.split(e.to).join(e.from)}assert.equal(sha(src),file.baseSHA256);assert.equal(sha(readFileSync(file.basePath)),file.baseSHA256)}
 assert.equal(m.newOperationalJournalCreated,false);assert.equal(m.newNonceGenerated,false)
});
