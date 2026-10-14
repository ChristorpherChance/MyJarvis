/** Tests the actual qualified starter and its exact five literal changes.
 * DI controls every mutation/remote dependency; no actual matrix is dispatched. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as m from './start-factory-truth-gate-matrix-r32-r3-qualified.mjs';
const self='scripts/start-factory-truth-gate-matrix-r32-r3-qualified.mjs';
const old='scripts/start-factory-truth-gate-matrix-r32-r3.mjs';
const raw=fs.readFileSync(self),sha=b=>createHash('sha256').update(b).digest('hex');
const manifestPath='artifacts/software-factory/goals-r29/r32-r3-actual-starter-fork-manifest-1791848777678-495a3fe8-8000-4bf4-93ad-d42c39df28e9.json';
function fixture(){
 const scope=m.matrixR32Scope,files=new Map([[self,raw]]);
 for(const r of [...Object.values(scope.qualification),scope.worker,scope.sourceIndex,...scope.tools])files.set(r.path,fs.readFileSync(r.path));
 files.set(m.matrixR32GatePath,Buffer.from(JSON.stringify({kind:'r32-truth-gate-reviewed-once-activation',starterSHA256:sha(raw),scope})));
 const proof=JSON.parse(fs.readFileSync('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json'));
 // Pure fixture time; never emitted as actual protection evidence.
 proof.at=new Date().toISOString();
 let locked=false,mode='normal',badSave=false,mutation=0;const events=[],reads=[];
 const attempt='a'.repeat(32),runID='b'.repeat(40),prefix='jarvis-tg-r32-'+attempt;
 const frame={schemaVersion:1,kind:'software-factory-r32-truth-gate-start',attempt,runID,workerSHA256:scope.worker.sha256,readOnly:false,dispatched:true,status:'running',modelsInvoked:false,productAccepted:false,cleanupIndependentlyVerified:false,httpSQLDenominator:34,additionalPGDenominator:4,resources:{containers:Object.fromEntries(['postgres','redis','minio','api-probe'].map(k=>[k,prefix+'-'+k])),network:prefix+'-net',volumes:Object.fromEntries(['postgres-data','redis-data','minio-data'].map(k=>[k,prefix+'-'+k]))},owner:{unit:prefix+'-owner.service',pid:42,startTicks:'100',boot:'00000000-0000-0000-0000-000000000000',controlGroup:'/system.slice/'+prefix+'-owner.service',runtimeMaxSec:1800,stopTimeoutSec:120,killMode:'control-group',restart:'no'}};
 for(const k of ['onceIntentSHA256','ownershipSHA256','activationSHA256','controlInventorySHA256','toolsInventorySHA256','actualPrivateStateSHA256'])frame[k]='c'.repeat(64);
 const d={readLocal:async p=>{reads.push(p);if(!files.has(p))throw Object.assign(Error('absent'),{code:'ENOENT'});return files.get(p)},verifyProtection:async()=>structuredClone(proof),lock:async()=>{assert.equal(locked,false);locked=true;return{}},unlock:async()=>{locked=false},nonce:()=>attempt,runID:()=>runID,writeWX:async(p,b)=>{assert.equal(files.has(p),false);files.set(p,Buffer.from(b));events.push('wx-intent')},save:async q=>{if(badSave)throw Error('QA_R32_LOCAL_DURABILITY_FAILED');files.set(m.matrixR32JournalPath,Buffer.from(JSON.stringify(q)));events.push('durable-intent')},receipt:async v=>({path:'controlled-receipt.json',sha256:sha(JSON.stringify(v))}),readRoot:async p=>{
  if(p.action==='start'){
   assert.ok(events.indexOf('durable-intent')>events.indexOf('wx-intent'));
   const q=JSON.parse(files.get(m.matrixR32JournalPath));assert.equal(q.attempt,p.attempt);assert.equal(q.runID,p.runID);assert.equal(q.starterSHA256,sha(raw));
   assert.deepEqual(p.scope,scope);
   const mapping={'review.json':'workerReview','cleanup-review.json':'cleanupReview','artifact-contract.json':'artifactContract','image-contract.json':'imageContract','build-proof.json':'buildProof'};
   for(const [n,k]of Object.entries(mapping))assert.equal(sha(Buffer.from(p.qualificationFiles[n],'base64')),scope.qualification[k].sha256);
   assert.equal(sha(Buffer.from(p.workerBase64,'base64')),scope.worker.sha256);
   for(const t of scope.tools)assert.equal(sha(Buffer.from(p.toolFiles[t.name],'base64')),t.sha256);
   assert.equal(sha(Buffer.from(p.sourceIndexBase64,'base64')),scope.sourceIndex.sha256);
   mutation++;if(mode==='lost')throw Error('QA_R32_CONTROLLED_RESPONSE_LOST');
  }
  const v=structuredClone(frame);v.readOnly=p.action==='check';if(v.readOnly){v.status='failed';v.actualPrivateStateSHA256='d'.repeat(64)}
  if(mode==='wrong-run')v.runID='e'.repeat(40);if(mode==='owner-change')v.owner.startTicks='101';return JSON.stringify(v);
 }};
 return{d,files,events,reads,getMutation:()=>mutation,locked:()=>locked,setMode:v=>mode=v,setBadSave:v=>badSave=v};
}
test('exact actual r3 fork reverses three replacements to prepared0eca byte-for-byte',()=>{
 const manifest=JSON.parse(fs.readFileSync(manifestPath));assert.equal(sha(fs.readFileSync(manifestPath)),'c6e93450f273d1c56d08c54ae38f5a3469639f4370fb1d43474d6b050b6ea157');
 assert.equal(sha(raw),manifest.starter.sha256);assert.equal(manifest.edits.length,3);let inverse=raw.toString();
 for(const d of [...manifest.edits].reverse()){assert.equal(inverse.split(d.to).length,2);inverse=inverse.replace(d.to,d.from)}
 assert.deepEqual(Buffer.from(inverse),fs.readFileSync(old));assert.equal(sha(Buffer.from(inverse)),manifest.prepared.sha256);
 for(const r of Object.values(m.matrixR32Scope.qualification))assert.equal(sha(fs.readFileSync(r.path)),r.sha256);
 assert.equal(m.matrixR32Scope.resourceCount,8);assert.equal(m.matrixR32Scope.httpSQLDenominator,34);assert.equal(m.matrixR32Scope.additionalPGDenominator,4);assert.equal(m.matrixR32Scope.nativePrerequisite.actualLoadVerified,false);
 assert.equal(m.matrixR32JournalPath,'.jarvis-dev/maintenance/factory-r32-truth-gate-matrix-r3-once.json');
});

test('actual qualified caller binds its own source and all exact payload bytes before one controlled dispatch',async()=>{
 const f=fixture(),v=await m.startMatrixR32('start',f.d);assert.equal(v.status,'running');assert.equal(f.getMutation(),1);assert.ok(f.reads.includes(self));assert.ok(!f.reads.includes(old));
 const q=JSON.parse(f.files.get(m.matrixR32JournalPath));assert.equal(q.starterSHA256,sha(raw));assert.equal(q.dispatched,true);assert.deepEqual(q.immutableScope,m.matrixR32Scope);assert.equal(f.locked(),false);
});
test('old source gate is refused before nonce journal or any controlled dispatch',async()=>{
 const f=fixture(),g=JSON.parse(f.files.get(m.matrixR32GatePath));g.starterSHA256=sha(fs.readFileSync(old));f.files.set(m.matrixR32GatePath,Buffer.from(JSON.stringify(g)));
 await assert.rejects(m.startMatrixR32('start',f.d),/REVIEWED_ACTIVATION_CHANGED/);assert.equal(f.getMutation(),0);assert.equal(f.files.has(m.matrixR32JournalPath),false);assert.equal(f.locked(),false);
});
test('artifact contract byte drift refuses before durable intent and root dispatch',async()=>{
 const f=fixture(),p=m.matrixR32Scope.qualification.artifactContract.path;f.files.set(p,Buffer.concat([f.files.get(p),Buffer.from('\n')]));
 await assert.rejects(m.startMatrixR32('start',f.d),/QUALIFICATION_CHANGED/);assert.equal(f.getMutation(),0);assert.equal(f.files.has(m.matrixR32JournalPath),false);assert.equal(f.locked(),false);
});
test('lost reply preserves one same-nonce intent and permits only readonly check reconciliation',async()=>{
 const f=fixture();f.setMode('lost');await assert.rejects(m.startMatrixR32('start',f.d),/RESPONSE_LOST/);assert.equal(f.getMutation(),1);
 await assert.rejects(m.startMatrixR32('start',f.d),/ONCE_ALREADY_INTENDED/);f.setMode('normal');const check=await m.startMatrixR32('check',f.d);assert.equal(check.status,'failed');assert.equal(check.productAccepted,false);assert.equal(f.getMutation(),1);
 const q=JSON.parse(f.files.get(m.matrixR32JournalPath));assert.equal(q.starterSHA256,sha(raw));assert.equal(q.dispatched,true);assert.equal(q.reconciledFromCheck,true);assert.equal(q.runID,'b'.repeat(40));
 f.setMode('owner-change');await assert.rejects(m.startMatrixR32('check',f.d),/FROZEN/);assert.equal(f.getMutation(),1);assert.equal(f.locked(),false);
});
test('failed durability prevents dispatch and keeps original intended nonce without retry',async()=>{
 const f=fixture();f.setBadSave(true);await assert.rejects(m.startMatrixR32('start',f.d),/DURABILITY_FAILED/);assert.equal(f.getMutation(),0);
 f.setBadSave(false);await assert.rejects(m.startMatrixR32('start',f.d),/ONCE_ALREADY_INTENDED/);assert.equal(f.getMutation(),0);assert.equal(f.locked(),false);
});
test('wrong-run readonly reply cannot overwrite uncertain frozen context',async()=>{
 const f=fixture();f.setMode('lost');await assert.rejects(m.startMatrixR32('start',f.d),/RESPONSE_LOST/);const before=f.files.get(m.matrixR32JournalPath);f.setMode('wrong-run');
 await assert.rejects(m.startMatrixR32('check',f.d),/UNKNOWN_USE_CHECK/);assert.deepEqual(f.files.get(m.matrixR32JournalPath),before);assert.equal(f.getMutation(),1);assert.equal(f.locked(),false);
});
