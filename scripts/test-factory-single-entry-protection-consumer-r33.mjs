import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyFactorySingleEntryProtectionContractR33,verifySingleEntryMethodQualificationEvidenceR33,createSingleEntryProtectionSerialReadersR33,assertSingleEntryProtectionSourceReviewsR33,createSingleEntryProtectionCaptureR33} from './verify-factory-single-entry-protection-contract-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('new source admission consumes actual saved finite scope; old/partial/default refuse; exact copied predicates and settled serial tail',async()=>{
 const methodPath='artifacts/software-factory/goals-r29/r33-single-entry-method-r3-independent-observation-1791896751796-edc3c6d2-369d-4953-b163-a214a72b9224.json';
 const raw=await readFile(methodPath);assert.equal(sha(raw),'3f37f556d1ec228804c999fd3af2e93beca7219a6f4d3f479a93353fd9990d7d');
 const actual=JSON.parse(raw),reads=[];
 const qualification=await verifySingleEntryMethodQualificationEvidenceR33(actual,async path=>{reads.push(path);return readFile(path)});
 assert.equal(qualification.qualified,true);assert.equal(reads.length,70);
 for(const v of [{...actual,kind:'r32-bound-census-linux-subset-independent-result-r2'},{...actual,currentOwnedScopeCleanupVerified:false}]){
  let rejectedReads=0;await assert.rejects(verifySingleEntryMethodQualificationEvidenceR33(v,async()=>{rejectedReads++;throw Error('UNEXPECTED_LOCAL_READ')}),/R33_PROTECTION_FINITE_METHOD_UNPROVEN/);assert.equal(rejectedReads,0);
 }
 let liveOrLocal=0;await assert.rejects(verifyFactorySingleEntryProtectionContractR33({}, {api:()=>{liveOrLocal++},readLocal:()=>{liveOrLocal++}}),/R33_PROTECTION_ACTIVATION_REQUIRED/);assert.equal(liveOrLocal,0);
 const reader=await readFile('scripts/verify-factory-single-entry-owned-scope-r33-r3.mjs','utf8'),consumer=await readFile('scripts/verify-factory-single-entry-protection-contract-r33.mjs','utf8');
 const chunk=reader.slice(reader.indexOf('function assertHost('),reader.indexOf('async function defaultReadRoot('));assert.equal(consumer.split(chunk).length,2);
 const old=await readFile('scripts/verify-factory-bound-protection-contract-r32-r2.mjs','utf8');
 const oldSerial=old.slice(old.indexOf('export function createBoundProtectionSerialReadersR32R2('),old.indexOf('export async function verifyFactoryBoundProtectionContractR32R2(')).trimEnd();
 const newSerial=consumer.slice(consumer.indexOf('export function createSingleEntryProtectionSerialReadersR33('),consumer.indexOf('async function privateWX(')).trimEnd();
 assert.equal(newSerial.replace('createSingleEntryProtectionSerialReadersR33','createBoundProtectionSerialReadersR32R2'),oldSerial);
 const order=[];let release;const pending=new Promise(r=>{release=r});const serial=createSingleEntryProtectionSerialReadersR33({api:async()=>{order.push('api');await pending;throw Error('CONTROLLED_PRIMARY')},readRoot:async()=>{order.push('root');return 1},readPrimary:async()=>1,nodeState:async()=>1,queueState:async()=>1});
 const first=serial.api();const caught=first.catch(e=>{assert.equal(e.message,'CONTROLLED_PRIMARY')});const second=serial.readRoot();let drained=false;const drain=serial.drain().then(()=>{drained=true});
 await Promise.resolve();assert.equal(drained,false);release();await Promise.all([caught,second,drain]);assert.deepEqual(order,['api','root']);assert.equal(drained,true);
});
test('actual frozen adapter review schema is consumed exactly; capture failures remain closed and preserve primary',async()=>{
 const path='artifacts/software-factory/goals-r29/r33-single-entry-protection-adapter-independent-local-review-1791898240303-b65e8f68-536e-4ad8-a2af-5f53a6ae4040.json';
 const raw=await readFile(path);assert.equal(sha(raw),'367d02614178a3065c246adb2f6a8a28280f16662504382578e88798dbf8b92a');const adapter=JSON.parse(raw);
 const consumerH=sha(await readFile('scripts/verify-factory-single-entry-protection-contract-r33.mjs'));
 const candidate={kind:'r33-single-entry-protection-consumer-independent-local-review',consumerSHA256:consumerH,adapterSHA256:adapter.adapterSHA256,staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualFullProtectionQualified:false,generatorSHA256:adapter.generatorSHA256,moduleSHA256:adapter.moduleSHA256};
 assertSingleEntryProtectionSourceReviewsR33([candidate,adapter],{consumerH,adapterH:adapter.adapterSHA256});
 assert.throws(()=>assertSingleEntryProtectionSourceReviewsR33([candidate,{...adapter,actualFullProtectionQualified:undefined,actualNewFullProtectionQualified:false}],{consumerH,adapterH:adapter.adapterSHA256}),/SOURCE_REVIEWS_REQUIRED/);
 assert.throws(()=>assertSingleEntryProtectionSourceReviewsR33([candidate,{...adapter,remainingP0P1:1}],{consumerH,adapterH:adapter.adapterSHA256}),/SOURCE_REVIEWS_REQUIRED/);
 const primary=Error('CONTROLLED_PRIMARY'),writer=Error('CONTROLLED_WRITER');let calls=0;
 const capture=createSingleEntryProtectionCaptureR33({api:async()=>{calls++;throw primary},privateEvidence:async()=>{throw writer}});
 await assert.rejects(capture.api('/controlled'),e=>e===primary);assert.equal(capture.evidence().captureComplete,false);
 assert.deepEqual(capture.evidence().secondaryFailures,['R33_PROTECTION_FAILURE_CAPTURE_SAVE_INCOMPLETE']);
 await assert.rejects(capture.api('/controlled'),/CAPTURE_ALREADY_FAILED/);assert.equal(calls,1);
 const goodApi=createSingleEntryProtectionCaptureR33({api:async()=>({ok:true}),privateEvidence:async()=>{throw writer}});
 await assert.rejects(goodApi.api('/controlled'),e=>e===writer);assert.equal(goodApi.evidence().captureComplete,false);
 await assert.rejects(goodApi.api('/controlled'),/CAPTURE_ALREADY_FAILED/);
});
