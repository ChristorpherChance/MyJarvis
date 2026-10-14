/** One new controlled qualification/wire group; no transport or authoritative journal is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pg4PGManifestLeafMetadataR33Scope as scope,readPG4PGManifestLeafMetadataQualificationR33 as qualify,readPG4PGManifestLeafMetadataR33 as read,createPG4PGLeafMetadataWireCaptureR33 as capture} from './read-factory-pg4-pg-manifest-leaf-metadata-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
test('default 0IO, exact reviewed local graph, timer-before-input, raw retained before invalid JSON and permanent max1',async()=>{
 let accessed=0;const poison=new Proxy({},{ownKeys(){accessed++;throw Error('dependencies must remain untouched')}});
 await assert.rejects(qualify(null,poison),/ACTIVATION_REQUIRED/);await assert.rejects(read(null,poison),/ACTIVATION_REQUIRED/);assert.equal(accessed,0);
 const self='scripts/read-factory-pg4-pg-manifest-leaf-metadata-r33.mjs',py='scripts/factory-pg4-pg-manifest-leaf-metadata-r33.py';
 const own=await readFile(self),program=await readFile(py),selfH=sha(own),programH=sha(program),store=new Map([[self,own],[py,program]]);
 const selection={path:'artifacts/software-factory/goals-r29/r33-pg4-pg-manifest-leaf-metadata-only-root-selection-1791932812521-2a216d62-7351-4b37-8bf1-45136e7a09e6.json',sha256:'8ae473ea98ab1b303059463eb1d8d1f77217a7d6f606f8736d13a32759222e71'};
 const actualFailure={path:'artifacts/software-factory/goals-r29/r33-pg4-essential-byte-actual-failed-partial-read-1791932377187-62169086-673e-4c02-a208-2c50f9bdd10e.json',sha256:'e8d65c3c2db6fd9fc0538ea6c056a5da552d3066ace93044aee14381d1f1a958'};
 const designReview={path:'artifacts/software-factory/goals-r29/r33-pg4-pg-manifest-leaf-metadata-only-design-independent-local-review-1791932942644-8137d715-a5c5-49bf-8878-d0690fa0fcda.json',sha256:'e753cbefbb47854433b9bf66389df773510251e1576f814e9e8c92e078b7121e'};
 for(const path of [selection.path,actualFailure.path,designReview.path,'scripts/managed-server-client.mjs'])store.set(path,await readFile(path));
 // These two DTOs are explicitly controlled substitutes, not actual independent reviews or activation.
 const reviewRaw=Buffer.from(JSON.stringify({kind:'r33-pg4-pg-manifest-leaf-metadata-reader-independent-local-review',callerSHA256:selfH,programSHA256:programH,scopeSHA256:sha(canonical(scope)),staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualMetadataObserved:false,sourceRefs:[]}));
 const sourceReview={path:'artifacts/software-factory/goals-r29/controlled-pg-leaf-review.json',sha256:sha(reviewRaw)};store.set(sourceReview.path,reviewRaw);
 const contractRaw=Buffer.from(JSON.stringify({schemaVersion:1,kind:'r33-pg4-pg-manifest-leaf-metadata-source-contract',id:'11111111-1111-4111-8111-111111111111',revision:1,caller:{path:self,sha256:selfH},program:{path:py,sha256:programH},scope,selection,actualFailure,designReview,sourceReview,sourceRefs:[],remoteReadAuthorized:true}));
 const sourceContract={path:'artifacts/software-factory/goals-r29/controlled-pg-leaf-contract.json',sha256:sha(contractRaw)};store.set(sourceContract.path,contractRaw);
 const activation={actualFailure,selection,sourceReview,sourceContract};let rootCalls=0,onceCalls=0,saved=0;
 const deps={readLocal:async p=>{assert.ok(store.has(p),p);return store.get(p)},rawTransport:async()=>{rootCalls++;return{status:0,signal:null,error:null,stdout:Buffer.from('{invalid-original'),stderr:Buffer.alloc(0)}},writeOnce:async(p,b)=>{onceCalls++;store.set(p,b);return{path:p,sha256:sha(b),bytes:b.length}},privateEvidence:async(v,label)=>{const b=Buffer.from(JSON.stringify(v)+'\n'),p='.jarvis-dev/maintenance/controlled-pg-leaf-'+label+'-'+(++saved)+'.json';store.set(p,b);return{path:p,sha256:sha(b),bytes:b.length}}};
 const q=await qualify(activation,deps);assert.equal(rootCalls,0);assert.equal(onceCalls,0);assert.ok(q.hostProgram.indexOf('signal.alarm(8)')<q.hostProgram.indexOf('sys.stdin.buffer.read'));assert.equal(sha(q.stdinBundle),q.stdinBundleSHA256);assert.ok(q.stdinBundle.length<=131072);
 await assert.rejects(read(activation,deps),e=>{const evidence=e.pgLeafMetadataCaptureEvidence;assert.ok(evidence.wire&&evidence.once);assert.equal(evidence.used,true);assert.equal(evidence.failed,true);const packet=JSON.parse(store.get(evidence.wire.path));assert.equal(Buffer.from(packet.stdoutBase64,'base64').toString(),'{invalid-original');assert.equal(packet.retention,'complete-original-wire');return true});assert.equal(rootCalls,1);assert.equal(onceCalls,1);
 const c=capture(q.d,q);await assert.rejects(c.read());assert.equal(rootCalls,2);await assert.rejects(c.read(),/ALREADY_USED/);assert.equal(rootCalls,2);
});
