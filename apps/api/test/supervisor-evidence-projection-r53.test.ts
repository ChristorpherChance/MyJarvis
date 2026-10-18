import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolveSupervisorEvidenceHistory} from '../src/runtime/supervisor-evidence-history.js';
import {resolveSupervisorEvidence} from '../src/runtime/supervisor-evidence.js';
import {boundedSupervisorModelInput,supervisorModelProjection,SUPERVISOR_PROMPT_MAX_UTF8_BYTES} from '../src/runtime/supervisor-model-input.js';

const hash=(v:any)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const keys=['sourceRunId','sourceResultHash','sourceGoalRevision','sourceSupervisorRevision','sourceTaskRevision'];
function fixture(){
 const binding={sessionId:'supervisor-fixture',ownerId:'owner',scope:'personal',projectId:'project',taskId:'task',machineId:'machine',executorId:'cc',workspace:'/fixture',nativeSessionId:'native',goalRevision:10,taskRevision:80,decisionContextRevision:0};
 const receipts=Array.from({length:31},(_,i)=>{const text=`saved original ${i}: `+'原文证据内容'.repeat(120)+(i===30?'Q'.repeat(4096):'Q'.repeat(70));return {path:`artifacts/original-${i}.txt`,sha256:hash(text),size:Buffer.byteLength(text),contentBase64:Buffer.from(text).toString('base64')};});
 const runs=new Map<string,any>();
 const add=(id:string,items:any[],prior?:any)=>{const run={id,ownerId:'owner',scope:'personal',domain:'tasks',objectId:'task',taskId:'task',projectId:'project',machineId:'machine',executorId:'cc',workspace:'/fixture',sessionId:'native',status:'succeeded',supervisor:{sessionId:binding.sessionId,goalRevision:10,supervisorRevision:prior?60:50,expectedTaskRevision:prior?70:60,consumedRunId:prior?.id??null,resultHash:prior?hash(prior.result):null},result:{source:'signed-agent',outcome:'success',exitCode:0,sessionId:'native',summary:JSON.stringify({state:'ready_for_review',summary:'saved facts',question:'',options:[],recommendedOption:null,evidence:items.map(({path,sha256})=>({path,sha256})),nextSuggestion:''}),evidenceReceipts:items}};runs.set(id,run);return run;};
 const first=add('first',receipts.slice(0,26)),last=add('last',[...receipts.slice(0,4),...receipts.slice(26)],first);
 const union=resolveSupervisorEvidenceHistory(last.id,{binding,readRun:id=>runs.get(id),ownsRun:()=>true,isAuthorized:()=>true,refsForRun:r=>JSON.parse(r.result.summary).evidence,resolveEvidence:(id,refs)=>resolveSupervisorEvidence(runs.get(id).result.evidenceReceipts,refs)});
 return {goal:'inspect existing evidence under the unchanged goal',criteria:['inspect all saved originals','keep actual source bindings','independent acceptance remains separate'],corrections:Array.from({length:3},(_,i)=>({commandId:`correction-${i}`,reason:'实际事实更正'.repeat(12),correctedFact:'保原授权与完整原件，不新增验收标准。'.repeat(16),applyTo:'future_reference'})),experienceAudit:{privateCompleteHistory:'retained'},experienceExclusions:Array.from({length:56},(_,i)=>({experienceId:`00000000-0000-4000-a000-${String(i).padStart(12,'0')}`,revision:1,hash:'f'.repeat(64),reason:'unknown-condition',content:'excluded non-authoritative text'})),experienceExclusionCount:56,experienceReferences:[],binding:{ownerId:'owner',projectId:'project',taskId:'task',goalRevision:10,runId:last.id,resultHash:hash(last.result),outcome:'success'},feedback:{...JSON.parse(last.result.summary),evidence:union.evidenceReferences},originals:union.originals,evidenceTable:union.evidenceTable,evidenceHistory:union.history};
}

test('evidence projection is lossless, source-bound, immutable and idempotent; malformed mappings fail closed',()=>{
 const frozen=fixture(),before=JSON.stringify(frozen),projected=supervisorModelProjection(frozen);
 assert.equal(frozen.originals.length,31);assert.equal(projected.input.evidenceHistory,undefined);assert.equal(projected.input.evidenceAuditHash,frozen.evidenceHistory.sha256);
 const restored=projected.input.originals.map((original:any)=>({...original,...Object.fromEntries(keys.map(k=>[k,original.sourceBindings[0][k]]))}));
 assert.deepEqual(restored,frozen.originals);assert.deepEqual(projected.input.evidenceTable,frozen.evidenceTable);assert.deepEqual(projected.input.feedback,frozen.feedback);assert.deepEqual(projected.input.corrections,frozen.corrections);assert.deepEqual(projected.input.criteria,frozen.criteria);assert.equal(JSON.stringify(frozen),before);
 const again=supervisorModelProjection(projected.input),fromJSON=supervisorModelProjection(JSON.parse(JSON.stringify(projected.input)));assert.equal(again.text,projected.text);assert.equal(fromJSON.text,projected.text);assert.deepEqual(again.diagnostic.prompt,projected.diagnostic.prompt);
 for(const mutate of [(f:any)=>{f.originals[0].sourceRunId='foreign';},(f:any)=>{f.originals[0].sourceBindings[0].sourceResultHash='0'.repeat(64);},(f:any)=>{delete f.originals[0].sourceTaskRevision;},(f:any)=>{f.originals[0].content+='changed';},(f:any)=>{f.evidenceHistory.items.pop();},(f:any)=>{f.evidenceAuditHash='0'.repeat(64);}]){const bad=structuredClone(frozen);mutate(bad);assert.throws(()=>supervisorModelProjection(bad),(e:any)=>e.code==='SUPERVISOR_EVIDENCE_PROJECTION_INVALID');}
 const legacy={goal:'unchanged legacy input',originals:[{path:'artifacts/legacy.txt',content:'legacy'}],experienceReferences:[]};assert.deepEqual(supervisorModelProjection(legacy).input.originals,legacy.originals);
});

test('31 full long originals plus corrections/56 exclusions fit without raising131072; mandatory over-limit still rejects',()=>{
 const frozen=fixture(),projected=boundedSupervisorModelInput(frozen);assert.equal(SUPERVISOR_PROMPT_MAX_UTF8_BYTES,131072);assert.ok(Buffer.byteLength(projected.text)<=131072);assert.equal(projected.input.originals.length,31);for(let i=0;i<31;i++){assert.equal(projected.input.originals[i].content,frozen.originals[i].content);assert.equal(projected.input.originals[i].sha256,frozen.originals[i].sha256);assert.deepEqual(projected.input.originals[i].sourceBindings,frozen.originals[i].sourceBindings);}
 const over=structuredClone(frozen);over.corrections.push({correctedFact:'中'.repeat(50000)});assert.throws(()=>boundedSupervisorModelInput(over),(e:any)=>e.code==='MODEL_CONTEXT_INCOMPLETE');assert.equal(over.originals[30].content,frozen.originals[30].content);assert.equal(boundedSupervisorModelInput(projected.input).text,projected.text);
});
