/** One new DATA-only group: fixed old input domain, current q, and new failure retention/once. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pg4ViteSingleCreatorByteR33Scope as scope,readPG4ViteSingleCreatorByteQualificationR33 as qualify,readPG4ViteSingleCreatorBytesR33 as read} from './read-factory-pg4-vite-single-creator-bytes-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
test('exact original35MB input via64MiB cap, reverse4ref q, pre-stdin timer, final host rejection retains wire and exclusive max1',async()=>{
 let touches=0;const poison=new Proxy({},{ownKeys(){touches++;throw Error('default must reject before deps')}});
 await assert.rejects(qualify(null,poison),/ACTIVATION_REQUIRED/);await assert.rejects(read(null,poison),/ACTIVATION_REQUIRED/);assert.equal(touches,0);
 const self='scripts/read-factory-pg4-vite-single-creator-bytes-r33.mjs',py='scripts/factory-pg4-vite-single-creator-byte-reader-r33.py',selfRaw=await readFile(self),pyRaw=await readFile(py),selfH=sha(selfRaw),programH=sha(pyRaw),store=new Map([[self,selfRaw],[py,pyRaw]]),base='artifacts/software-factory/goals-r29/';
 const selection={path:base+'r33-pg4-vite-single-creator-byte-root-selection-1791934096514-b771b6d3-3a9f-45dc-a969-0503c458239d.json',sha256:'f005d712c423e7fadde4290e33cc229517416eb329da0a1ef829a8db7dfc15ec'};
 const selectedByteAudit={path:base+'r33-pg4-runtime-framework-byte-saved-evidence-independent-limited-audit-1791916650377-408f86fb-5f78-4fbf-8b2b-bfbd158054c1.json',sha256:'c3e8acb1c1b014d3d4423010ebcc3f0d03e0f7b115b6e619bd2d70692c69916e'};
 const designReview={path:base+'r33-pg4-vite-single-creator-byte-design-independent-compatibility-review-1791934229860-c8799a9d-6f4a-49d5-bee6-c8e8bc7eab1d.json',sha256:'82ae5486ba619a3da89e15909414dc080200528edc8c53c8799c4367a21944b5'};
 const oldWire='.jarvis-dev/maintenance/r33-pg4-framework-byte-inline-capture-1791916233585-239a9d16-0006-478e-a479-43ee00ff029b.json';
 for(const p of [selection.path,selectedByteAudit.path,designReview.path,oldWire,base+'r32-actual-frozen-artifact-contract-27f8687bf5678a51.json','.jarvis-dev/maintenance/r33-pg4-new-selected-original-1791932325509-eebee756-f1f3-4578-b9d0-832e2b869872-6-2b295e9da790eb9d1b02b167a4678bd9106253d97e07a75f774cd2f3b1930476.bin','scripts/managed-server-client.mjs'])store.set(p,await readFile(p));
 // These review/authorization DTOs exist only in the controlled map, not as actual independent reviews.
 const reviewRaw=Buffer.from(JSON.stringify({kind:'r33-pg4-vite-single-creator-byte-reader-independent-local-review',callerSHA256:selfH,programSHA256:programH,scopeSHA256:sha(canonical(scope)),staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualCreatorBytesRead:false,sourceRefs:[]}));
 const sourceReview={path:base+'controlled-vite-byte-review.json',sha256:sha(reviewRaw)};store.set(sourceReview.path,reviewRaw);
 const contractRaw=Buffer.from(JSON.stringify({schemaVersion:1,kind:'r33-pg4-vite-single-creator-byte-source-contract',id:'11111111-1111-4111-8111-111111111111',revision:1,caller:{path:self,sha256:selfH},program:{path:py,sha256:programH},scope,selection,selectedByteAudit,designReview,sourceReview,sourceRefs:[],remoteReadAuthorized:true}));
 const sourceContract={path:base+'controlled-vite-byte-contract.json',sha256:sha(contractRaw)};store.set(sourceContract.path,contractRaw);
 const activation={selectedByteAudit,selection,sourceReview,sourceContract};let roots=0,writes=0,saves=0,inputLimitSeen=false;
 const deps={readLocal:async(p,limit)=>{assert.ok(store.has(p),p);if(p===oldWire){assert.equal(limit,67108864);assert.equal(store.get(p).length,35219054);inputLimitSeen=true}else if(p.includes('controlled-vite-wire-'))assert.equal(limit,16777216);return store.get(p)},rawTransport:async()=>{roots++;return{status:0,signal:null,error:null,stdout:Buffer.from('{"readComplete":false}'),stderr:Buffer.alloc(0)}},writeOnce:async(p,b)=>{if(store.has(p))throw Object.assign(Error('exclusive once exists'),{code:'EEXIST'});writes++;store.set(p,b);return{path:p,sha256:sha(b),bytes:b.length}},privateEvidence:async(v,label)=>{const b=Buffer.from(JSON.stringify(v)+'\n'),p='.jarvis-dev/maintenance/controlled-vite-wire-'+(++saves)+'.json';store.set(p,b);return{path:p,sha256:sha(b),bytes:b.length}}};
 const q=await qualify(activation,deps);assert.equal(roots,0);assert.equal(writes,0);assert.ok(inputLimitSeen);assert.ok(q.hostProgram.indexOf('signal.alarm(30)')<q.hostProgram.indexOf('sys.stdin.buffer.read'));assert.ok(q.stdinBundle.length<33554432);assert.equal(Buffer.from(q.parameters.manifestRawBase64,'base64').length,18197751);
 await assert.rejects(read(activation,deps),e=>{assert.match(e.message,/SELECTED_BYTES_INCOMPLETE/);const x=e.viteCreatorCaptureEvidence;assert.ok(x.wire&&x.once&&x.sourceRefs.length>0);assert.equal(x.used,true);const packet=JSON.parse(store.get(x.wire.path));assert.equal(Buffer.from(packet.stdoutBase64,'base64').toString(),'{"readComplete":false}');return true});assert.equal(roots,1);assert.equal(writes,1);
 await assert.rejects(read(activation,deps),/exclusive once exists/);assert.equal(roots,1);assert.equal(writes,1);
});
