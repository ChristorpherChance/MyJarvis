import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as settled} from 'node:timers/promises';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {ProjectSupervisorRuntime} from '../src/runtime/project-supervisor-runtime.js';
import {createProjectSupervisorModel} from '../src/runtime/project-supervisor-model.js';
import {boundedSupervisorModelInput,SUPERVISOR_PROMPT_MAX_UTF8_BYTES} from '../src/runtime/supervisor-model-input.js';
import {resolveSupervisorEvidence} from '../src/runtime/supervisor-evidence.js';
import {resolveSupervisorEvidenceHistory,assertSupervisorEvidenceHistoryCurrent,type EvidenceHistoryAccess} from '../src/runtime/supervisor-evidence-history.js';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const receipt=(path:string,text:string)=>({path,sha256:createHash('sha256').update(text).digest('hex'),size:Buffer.byteLength(text),contentBase64:Buffer.from(text).toString('base64')});
const ref=({path,sha256}:any)=>({path,sha256});
const feedback=(receipts:any[])=>({state:'ready_for_review',summary:'saved controlled evidence',question:'',options:[],recommendedOption:null,evidence:receipts.map(ref),nextSuggestion:''});
function fixture(){
 const binding={sessionId:'supervisor',ownerId:'owner',scope:'personal',projectId:'project',taskId:'task',machineId:'machine',executorId:'cc',workspace:'/fixture',nativeSessionId:'native',goalRevision:2,taskRevision:100,decisionContextRevision:0};
 const runs=new Map<string,any>();let active=true;
 const access:EvidenceHistoryAccess={binding,readRun:id=>runs.get(id),ownsRun:r=>r.ownerId===binding.ownerId,isAuthorized:()=>active,refsForRun:r=>JSON.parse(r.result.summary).evidence,resolveEvidence:(id,refs)=>resolveSupervisorEvidence(runs.get(id).result.evidenceReceipts,refs)};
 const add=(id:string,receipts:any[],previous?:any)=>{const run:any={id,ownerId:binding.ownerId,scope:binding.scope,domain:'tasks',objectId:binding.taskId,taskId:binding.taskId,projectId:binding.projectId,machineId:binding.machineId,executorId:binding.executorId,workspace:binding.workspace,sessionId:'native',agentId:'agent',status:'succeeded',supervisor:{sessionId:binding.sessionId,goalRevision:binding.goalRevision,supervisorRevision:previous?20:10,expectedTaskRevision:previous?20:10,consumedRunId:previous?.id??null,resultHash:previous?hash(previous.result):null},result:{source:'signed-agent',outcome:'success',exitCode:0,sessionId:'native',summary:JSON.stringify(feedback(receipts)),evidenceReceipts:receipts}};runs.set(id,run);return run;};
 return {access,runs,add,revoke:()=>{active=false;}};
}
function chain(){const f=fixture(),old=Array.from({length:26},(_,i)=>receipt(`artifacts/original-${i}.txt`,`original-${i}`));const first=f.add('first',old),recent=[...old.slice(0,4),...Array.from({length:5},(_,i)=>receipt(`artifacts/new-${i}.txt`,`new-${i}`))],current=f.add('current',recent,first);return {...f,first,current,old,recent};}
const code=(wanted:string)=>(e:any)=>e?.code===wanted||e?.message===wanted;

test('26 + 9 receipts form 31 verified unique originals and one strict citation whitelist; signed feedback stays unchanged',async()=>{
 const f=chain(),raw=JSON.stringify([...f.runs.values()]),union=resolveSupervisorEvidenceHistory('current',f.access);
 assert.equal(union.originals.length,31);assert.equal(union.evidenceReferences.length,31);assert.equal(union.evidenceTable.complete,true);
 assert.equal(union.originals.find(x=>x.path==='artifacts/original-0.txt').sourceBindings.length,2);
 assert.equal(union.originals.find(x=>x.path==='artifacts/original-25.txt').sourceRunId,'first');
 const input={goal:'inspect saved files',criteria:['original and followup'],binding:{ownerId:'owner',projectId:'project',taskId:'task',goalRevision:2,runId:'current',resultHash:hash(f.current.result)},experienceReferences:[],feedback:{...feedback(f.recent),evidence:union.evidenceReferences},originals:union.originals,evidenceTable:union.evidenceTable,evidenceHistory:union.history};
 const projected=boundedSupervisorModelInput(input);assert.equal(SUPERVISOR_PROMPT_MAX_UTF8_BYTES,131072);assert.ok(Buffer.byteLength(projected.text)<=131072);
 let calls=0;const model=createProjectSupervisorModel({health:()=>({configured:true}),run:async()=>{calls++;return {status:'complete',text:JSON.stringify({action:'review',directive:'',reason:'controlled evidence verified',selectedOption:null,criteria:[{criterion:input.criteria[0],met:true,evidence:[ref(f.old[25]),ref(f.recent[8])]}],experienceReferences:[]})};}} as any);
 assert.equal((await model(input)).action,'review');assert.equal(calls,1);assert.equal(JSON.stringify([...f.runs.values()]),raw);
});

test('source hash, complete identity and goal boundaries reject foreign material; legitimate prior goal is not inherited',()=>{
 const mutations=[(f:any)=>{f.current.supervisor.resultHash='0'.repeat(64);},(f:any)=>{f.first.ownerId='foreign';},(f:any)=>{f.first.scope='private';},(f:any)=>{f.first.projectId='foreign';},(f:any)=>{f.first.taskId='foreign';},(f:any)=>{f.first.workspace='/other';},(f:any)=>{f.first.machineId='other';},(f:any)=>{f.first.executorId='other';},(f:any)=>{f.first.result.sessionId='other';},(f:any)=>{f.first.supervisor.sessionId='other';},(f:any)=>{f.first.supervisor.goalRevision=3;}];
 for(const mutate of mutations){const f=chain();mutate(f);if(f.current.supervisor.resultHash!=='0'.repeat(64))f.current.supervisor.resultHash=hash(f.first.result);assert.throws(()=>resolveSupervisorEvidenceHistory('current',f.access));}
 const f=chain();f.first.supervisor.goalRevision=1;const union=resolveSupervisorEvidenceHistory('current',f.access);assert.equal(union.originals.length,9);assert.equal(union.evidenceTable.boundary.reason,'different-goal');
 const frozen=chain(),snapshot=resolveSupervisorEvidenceHistory('current',frozen.access);frozen.first.supervisor.goalRevision=1;assert.throws(()=>assertSupervisorEvidenceHistoryCurrent(snapshot.history,frozen.access),code('SUPERVISOR_EVIDENCE_HISTORY_STALE'));
 // Explicit signed native handoff remains an exclusion boundary, never a route for mixing old native evidence.
 const n=chain(),prior=n.first;prior.stopRequested=true;prior.status='cancelled';prior.result.outcome='cancelled';prior.result.sessionId='old-native';prior.sessionId='old-native';const proof={invocationId:'invocation',childExitObserved:true,stdioClosed:true,groupEmpty:true};prior.result.executionMetadata={invocationId:'invocation'};prior.result.terminationProof=proof;prior.result.stopConfirmation={source:'bound-signed-agent',runId:prior.id,agentId:prior.agentId,stopRequested:true,terminationProof:proof};n.current.supervisor.resultHash=hash(prior.result);n.current.nativeLineage={previousSessionId:'old-native',sourceRunId:prior.id,sourceHash:hash(prior.result),reason:'verified-child-termination'};assert.equal(resolveSupervisorEvidenceHistory('current',n.access).evidenceTable.boundary.reason,'verified-native-handoff');delete prior.result.terminationProof;assert.throws(()=>resolveSupervisorEvidenceHistory('current',n.access));
});

test('same path with a different hash is explicit conflict; identical bytes keep both source bindings',()=>{
 const f=fixture(),first=f.add('first',[receipt('artifacts/same.txt','first')]);f.add('current',[receipt('artifacts/same.txt','changed')],first);assert.throws(()=>resolveSupervisorEvidenceHistory('current',f.access),code('SUPERVISOR_EVIDENCE_HISTORY_CONFLICT'));
 const same=fixture(),r=receipt('artifacts/same.txt','identical'),old=same.add('first',[r]);same.add('current',[r],old);const union=resolveSupervisorEvidenceHistory('current',same.access);assert.equal(union.originals.length,1);assert.equal(union.originals[0].sourceBindings.length,2);
});

test('a missing current receipt is not repaired by an older matching receipt',()=>{
 const f=fixture(),r=receipt('artifacts/same.txt','identical'),old=f.add('first',[r]),current=f.add('current',[r],old);current.result.evidenceReceipts=[];
 const union=resolveSupervisorEvidenceHistory('current',f.access);assert.equal(union.originals.length,1);assert.equal(union.originals[0].sourceBindings.length,1);assert.equal(union.originals[0].sourceRunId,'first');assert.equal(union.evidenceTable.complete,false);assert.ok(union.evidenceTable.missing.some(x=>x.current&&x.sourceRunId==='current'&&x.path===r.path));
});

test('bounded chains, item/byte limits, frozen snapshots and revoked authority fail closed without truncation',()=>{
 const deep=fixture();let prior:any;for(let i=0;i<21;i++)prior=deep.add(`run-${i}`,[receipt(`artifacts/${i}.txt`,String(i))],prior);assert.throws(()=>resolveSupervisorEvidenceHistory(prior.id,deep.access),code('SUPERVISOR_EVIDENCE_HISTORY_LIMIT'));
 const many=fixture();prior=undefined;for(let i=0;i<5;i++)prior=many.add(`run-${i}`,Array.from({length:25},(_,j)=>receipt(`artifacts/${i}-${j}.txt`,'x')),prior);assert.throws(()=>resolveSupervisorEvidenceHistory(prior.id,many.access),code('SUPERVISOR_EVIDENCE_HISTORY_LIMIT'));
 const large=fixture();prior=undefined;for(let i=0;i<3;i++)prior=large.add(`large-${i}`,Array.from({length:4},(_,j)=>receipt(`artifacts/l-${i}-${j}.txt`,'x'.repeat(32768))),prior);assert.throws(()=>resolveSupervisorEvidenceHistory(prior.id,large.access),code('SUPERVISOR_EVIDENCE_HISTORY_LIMIT'));
 const f=chain(),snapshot=resolveSupervisorEvidenceHistory('current',f.access);f.revoke();assert.throws(()=>assertSupervisorEvidenceHistoryCurrent(snapshot.history,f.access),code('SUPERVISOR_EVIDENCE_HISTORY_STALE'));
 const changed=chain(),saved=resolveSupervisorEvidenceHistory('current',changed.access);changed.current.result.summary=JSON.stringify({...feedback(changed.recent),summary:'changed'});assert.throws(()=>assertSupervisorEvidenceHistoryCurrent(saved.history,changed.access),code('SUPERVISOR_EVIDENCE_HISTORY_STALE'));
 assert.throws(()=>boundedSupervisorModelInput({originals:[{content:'中'.repeat(50000)}]}),code('MODEL_CONTEXT_INCOMPLETE'));
});

test('real supervisor runtime carries receipts through two model intents, preserves raw events and never replays a consumed judgment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'r53-history-')),store=new Store(dir),repo=new V1Repository(store.databasePath),owner='server-admin',principal={actorId:owner,profileId:'me',administrator:true} as any;
 const write=(domain:any,id:string,body:any)=>{const old=repo.read(domain,id,owner);return repo.execute({domain,commands:['fixture'],execute:(_c:any,_p:any,c:any)=>old?c.update(domain,id,body):c.create(domain,body,id)},'fixture',{commandId:randomUUID(),expectedVersion:old?.revision??0,scope:'personal',payload:{}},owner,()=>undefined).data;};
 write('projects','project',{status:'active',copies:[{machineId:'machine',path:'/fixture',environment:'development'}]});write('tasks','task',{mode:'managed',projectId:'project',machineId:'machine',worktree:'/fixture',agent:'cc',status:'queued'});
 const saved=chain(),runs=new Map<string,any>();let dispatches=0,calls=0;
 const execution={setProjectSupervisor(){},getRun:(id:string)=>runs.get(id),runsForTask:()=>[...runs.values()],cancelRun(){},supervisorEvidence:(id:string,refs:any[])=>resolveSupervisorEvidence(runs.get(id).result.evidenceReceipts,refs),supervisorDispatch:async(input:any)=>{dispatches++;const id=dispatches===1?'first':'current',receipts=dispatches===1?saved.old:saved.recent;const run={id,scope:'personal',domain:'tasks',objectId:'task',taskId:'task',projectId:'project',machineId:'machine',executorId:'cc',workspace:'/fixture',status:'succeeded',...(dispatches>1?{sessionId:'native'}:{}),supervisor:{sessionId:input.sessionId,goalRevision:input.goalRevision,supervisorRevision:input.supervisorRevision,expectedTaskRevision:input.expectedTaskRevision,consumedRunId:input.consumedRunId??null,resultHash:input.resultHash??null},result:{source:'signed-agent',outcome:'success',exitCode:0,sessionId:'native',summary:JSON.stringify(feedback(receipts)),evidenceReceipts:receipts}};runs.set(id,run);write('tasks','task',{status:'validating',executionStatus:'succeeded',sessionId:'native',executionRequest:{id},executionResult:run.result});return {runId:id};}};
 const runtime=new ProjectSupervisorRuntime(repo,execution,{directory:join(dir,'supervisor'),identity:{isPrincipalCurrent:()=>true} as any,stopped:()=>false,modelReady:()=>true,model:async input=>{calls++;assert.equal(input.originals.length,calls===1?26:31);assert.equal(input.feedback.evidence.length,calls===1?26:31);assert.equal(input.evidenceTable.complete,true);return {action:calls===1?'continue':'review',directive:calls===1?'collect existing missing originals only':'',reason:'controlled saved evidence',selectedOption:null,criteria:[{criterion:'inspect originals',met:calls===2,evidence:[ref(saved.old[25])]}],experienceReferences:[]};}});
 try{const created=runtime.create('project',{commandId:randomUUID(),expectedVersion:0,goal:'inspect saved originals',criteria:['inspect originals'],machineId:'machine',executor:'claude-code',workspace:'/fixture',taskId:'task'},principal);runtime.command('project',{commandId:randomUUID(),expectedVersion:created.revision,action:'start',authorizeContinuous:true,maxParentTokens:1000000},principal);await settled();for(let i=0;i<5;i++){await runtime.pump();await settled();}const view=runtime.view('project',principal);assert.equal(view.session?.status,'achieved');assert.equal(calls,2);assert.equal(dispatches,2);const raw=view.events.filter((x:any)=>x.kind==='feedback');assert.equal(raw.length,2);assert.equal(raw.find((x:any)=>x.runId==='current')?.feedback.evidence.length,9);await runtime.pump();assert.equal(calls,2);assert.equal(dispatches,2);assert.equal(JSON.parse(runs.get('current').result.summary).evidence.length,9);}finally{runtime.close();repo.close();store.close();await rm(dir,{recursive:true,force:true});}
});
