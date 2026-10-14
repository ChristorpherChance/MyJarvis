import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {BusinessError} from '../src/v1/types.js';
import {ProjectAutonomyRuntime} from '../src/runtime/project-autonomy-runtime.js';
import type {ExecutionRuntime} from '../src/runtime/execution-runtime.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(maxAttempts=3,maxRepeated=3){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-autonomy-start-')),store=new Store(join(directory,'store')),repo=new V1Repository(store.databasePath),workspace=join(directory,'workspace');
 const machine=()=>({id:'node',status:'online'});let ready=true,failAfterDispatch=false;
 repo.execute({domain:'projects',commands:['seed'],execute:(_c,_p,ctx)=>ctx.create('projects',{name:'Start guard fixture',goal:'Actual bounded fixture only',repo:'fixture',status:'active',copies:[{machineId:'node',path:workspace,environment:'test',branch:'fixture'}]},'project')},'seed',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',machine);
 const spec={schemaVersion:1,projectKey:'fixture',version:'r1',workPackages:[{id:'FA-01',title:'Fixture worker',dependsOn:[],budgetScope:'factory',objectiveIds:['O1']}],objectives:[{id:'O1',title:'Actual fixture acceptance',acceptance:['Fixed evidence and independent review'],dependsOn:[],workPackage:'FA-01',scope:'factory'}]};
 const templates=['worker','reviewer'].map(id=>({id,machineId:'node',engine:'claude',workspaceRoot:directory,program:process.execPath,args:id==='reviewer'?['--tools','Read,Glob,Grep','--allowedTools','Read,Glob,Grep']:[],maxRounds:2,timeoutSec:5,leaseSec:30,budgetCurrency:'USD',validation:{program:process.execPath,args:[],timeoutSec:5},supervision:{billing:'record-only',maxTokens:100,maxRecoveryAttempts:0,retryDelaySec:60,repairValidation:false,fallbackExecutorIds:[]}}));
 const runs=new Map<string,any>();
 const update=(id:string,patch:any)=>{const task=repo.read('tasks',id,'server-admin')!;return repo.execute({domain:'tasks',commands:['fixture-update'],execute:(_c,_p,ctx)=>ctx.update('tasks',id,patch)},'fixture-update',{commandId:randomUUID(),expectedVersion:task.revision,scope:'personal',payload:{}},'server-admin',machine);};
 const execution={options:{machine},templates:()=>templates,ready:()=>ready,getRun:(id:string)=>runs.get(id),runsForTask:(id:string)=>[...runs.values()].filter(run=>run.taskId===id),cancelRun:(id:string)=>{Object.assign(runs.get(id),{status:'cancelled',stopRequested:true});},dispatch:async(_domain:any,action:any,envelope:any)=>{
  if(action!=='start')return update(envelope.payload.taskId,{status:action==='pause'?'paused':'cancelled',executionStatus:'cancelled'});
  const replay=repo.replay('tasks','start',envelope,'server-admin');if(replay)return replay;
  const id=randomUUID(),task=repo.read('tasks',envelope.payload.taskId,'server-admin')!;
  const response=repo.execute({domain:'tasks',commands:['start'],execute:(_c,_p,ctx)=>ctx.update('tasks',task.id,{executionRequest:{id},executionStatus:'queued',status:'queued'})},'start',envelope,'server-admin',machine);
  runs.set(id,{id,taskId:task.id,status:'queued'});if(failAfterDispatch){failAfterDispatch=false;throw Error('Fixture lost the response after committing dispatch');}return response;
 }};
 const config={machineId:'node',workspace,costPolicy:'record-only',maxUSD:null,maxTokens:null,perTaskUSD:null,maxAttempts,maxRepeated,executors:{'FA-01':{worker:'worker',reviewer:'reviewer',requiredCheckIds:['tests'],budgetScope:'factory'}},scopeBudgets:{factory:{maxUSD:null,maxTokens:null}}};
 const options={directory:join(directory,'autonomy'),stopped:()=>false};let runtime=new ProjectAutonomyRuntime(repo,execution as unknown as ExecutionRuntime,options);
 runtime.configure('project',{spec,config,expectedVersion:0,commandId:randomUUID()});
 return {runs,repo,update,ready(value:boolean){ready=value;},failAfterNextDispatch(){failAfterDispatch=true;},get runtime(){return runtime;},command(reason='Fixture start'){const p=runtime.get('project')!;return {expectedVersion:p.revision,commandId:randomUUID(),reason};},async restart(){await runtime.close();runtime=new ProjectAutonomyRuntime(repo,execution as unknown as ExecutionRuntime,options);},async close(){await runtime.close();repo.close();store.close();await rm(directory,{recursive:true,force:true});}};
}
const recoveryRequired=(error:unknown)=>error instanceof BusinessError&&error.code==='AUTONOMY_RECOVERY_REQUIRED'&&error.status===422;
async function failCurrent(f:Awaited<ReturnType<typeof fixture>>,stableSource=false){
 const p=f.runtime.get('project')!,s=p.stages[0],run=f.runs.get(s.runId!);
 Object.assign(run,{status:'timeout',result:{source:'signed-agent',outcome:'timeout',exitCode:143,summary:'Fixture PROCESS_TIMEOUT',stopReason:{code:'PROCESS_TIMEOUT',at:new Date().toISOString()},usage:null,...(stableSource?{validation:{autonomyReportJson:JSON.stringify({sourceFingerprint:hash('same-fixture-source')})}}:{})}});
 f.update(s.taskId!,{status:'failed',executionStatus:'timeout'});await f.runtime.tick();
}

test('exhausted attempts reject start without changing blocked history, goal, templates, CAS or unknown usage',async()=>{
 const f=await fixture();try{
  await f.runtime.control('project','start',f.command());
  for(let attempt=1;attempt<=3;attempt++){await f.runtime.tick();assert.equal(f.runtime.get('project')!.stages[0].attempt,attempt);await failCurrent(f);}
  const before=f.runtime.get('project')!,events=f.runtime.events('project'),runs=structuredClone([...f.runs.values()]);
  assert.equal(before.status,'blocked');assert.equal(before.reason,'REPAIR_ATTEMPTS_EXHAUSTED');assert.equal(before.budget.unknownCostCount,3);assert.equal(before.config.costPolicy,'record-only');assert.equal(before.config.maxUSD,null);assert.equal(before.stages[0].history.length,2);
  await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);
  await assert.rejects(f.runtime.control('project','start',{...f.command(),expectedVersion:before.revision-1}),(error:unknown)=>error instanceof BusinessError&&error.code==='CONFLICT'&&error.status===409);
  await f.runtime.tick();assert.deepEqual(f.runtime.get('project'),before);assert.deepEqual(f.runtime.events('project'),events);assert.deepEqual([...f.runs.values()],runs);assert.equal(f.runs.size,3);
  await f.runtime.control('project','pause',f.command('Pause does not reset the exhausted attempts'));const paused=f.runtime.get('project')!;await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),paused);
 }finally{await f.close();}
});

test('stalled source and problem protection rejects start below the attempt ceiling and survives a pause',async()=>{
 const f=await fixture(5,2);try{
  await f.runtime.control('project','start',f.command());for(let attempt=1;attempt<=2;attempt++){await f.runtime.tick();await failCurrent(f,true);}
  const before=f.runtime.get('project')!;assert.equal(before.reason,'REPEATED_SOURCE_AND_PROBLEMS');assert.equal(before.stages[0].attempt,2);assert.equal(before.stages[0].checkpoint.repeated,2);
  await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),before);
  await f.runtime.control('project','pause',f.command('Keep paused while diagnosing'));const paused=f.runtime.get('project')!;
  await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),paused);assert.equal(f.runs.size,2);
 }finally{await f.close();}
});

test('reconciliation-required signed termination cannot be cleared by an ordinary start',async()=>{
 const f=await fixture();try{
  await f.runtime.control('project','start',f.command());await f.runtime.tick();const s=f.runtime.get('project')!.stages[0];
  Object.assign(f.runs.get(s.runId!),{status:'cancelled',result:{source:'signed-agent',outcome:'cancelled',exitCode:143,stopReason:{code:'HEARTBEAT_FAILED',at:new Date().toISOString()},usage:null}});f.update(s.taskId!,{status:'cancelled',executionStatus:'cancelled'});await f.runtime.tick();
  const before=f.runtime.get('project')!;assert.equal(before.reason,'EXECUTION_NEEDS_RECONCILIATION');await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),before);assert.equal(f.runs.size,1);
 }finally{await f.close();}
});

test('paused execution cannot be revived by start, including after runtime restart',async()=>{
 const f=await fixture();try{
  await f.runtime.control('project','start',f.command());await f.runtime.tick();await f.runtime.control('project','pause',f.command('Explicit user pause'));await f.restart();
  const before=f.runtime.get('project')!,run=structuredClone([...f.runs.values()][0]);assert.equal(before.status,'paused');assert.equal(run.stopRequested,true);
  await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),before);assert.deepEqual([...f.runs.values()][0],run);assert.equal(f.runs.size,1);
 }finally{await f.close();}
});

test('run cancellation or stop flags refuse revival even when the task record has not caught up',async()=>{
 for(const patch of [{status:'cancelled'},{status:'interrupted'},{status:'running',stopRequested:true},{status:'succeeded',result:{outcome:'cancelled'}},{status:'succeeded',result:{lateEvidenceOnly:true}}]){
  const f=await fixture();try{
   await f.runtime.control('project','start',f.command());await f.runtime.tick();const s=f.runtime.get('project')!.stages[0];Object.assign(f.runs.get(s.runId!),patch);
   const before=f.runtime.get('project')!;assert.equal(f.repo.read('tasks',s.taskId!,'server-admin')!.status,'queued');await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),before);assert.equal(f.runs.size,1);
  }finally{await f.close();}
 }
});

test('a stopped committed dispatch is checked through the task even before the stage saves its run ID',async()=>{
 const f=await fixture();try{
  await f.runtime.control('project','start',f.command());f.failAfterNextDispatch();await f.runtime.tick();const before=f.runtime.get('project')!,s=before.stages[0],task=f.repo.read('tasks',s.taskId!,'server-admin')!;
  assert.equal(before.status,'blocked');assert.equal(s.runId,undefined);assert.ok(task.executionRequest?.id);f.runs.get(task.executionRequest.id).status='cancelled';
  const stopped=f.runtime.get('project')!;await assert.rejects(f.runtime.control('project','start',f.command()),recoveryRequired);assert.deepEqual(f.runtime.get('project'),stopped);assert.equal(f.runs.size,1);
 }finally{await f.close();}
});

test('an unexecuted plan can start normally, replay its command, and resume a pause before any execution',async()=>{
 const f=await fixture();try{
  await f.runtime.control('project','pause',f.command('Pause before first execution'));const input=f.command(),started=await f.runtime.control('project','start',input),replay=await f.runtime.control('project','start',input);
  assert.equal(started.status,'running');assert.equal(started.stages[0].attempt,0);assert.equal(replay!.revision,started!.revision);assert.equal(f.runs.size,0);await f.runtime.tick();assert.equal(f.runs.size,1);assert.equal(f.runtime.get('project')!.stages[0].attempt,1);
 }finally{await f.close();}
});

test('corrected resource readiness permits a genuine first start without resetting protection',async()=>{
 const f=await fixture();try{
  await f.runtime.control('project','start',f.command());f.ready(false);await f.runtime.tick();const waiting=f.runtime.get('project')!;assert.equal(waiting.status,'running');assert.match(waiting.reason!,/节点暂未就绪/);assert.equal(waiting.stages[0].attempt,0);assert.equal(f.runs.size,0);
  f.ready(true);await f.runtime.control('project','start',f.command());await f.runtime.tick();const after=f.runtime.get('project')!;assert.equal(after.status,'running');assert.equal(after.stages[0].attempt,1);assert.equal(after.goalSpecHash,waiting.goalSpecHash);assert.deepEqual(after.templateHashes,waiting.templateHashes);assert.equal(f.runs.size,1);
 }finally{await f.close();}
});

test('a final allowed attempt with successful fixed evidence may continue to its reviewer after resources recover',async()=>{
 const f=await fixture(1);try{
  await f.runtime.control('project','start',f.command());await f.runtime.tick();const p=f.runtime.get('project')!,s=p.stages[0],now=new Date().toISOString();
  const report=JSON.stringify({schemaVersion:1,kind:'project-autonomy-validation',status:'pass',simulated:false,runId:s.runId,workspace:p.config.workspace,goalSpecHash:p.goalSpecHash,workPackage:s.id,sourceFingerprint:hash('fixture-source'),sourceStable:true,startedAt:now,finishedAt:now,checks:[{id:'tests',command:'synthetic-unit-check',required:true,executed:true,status:'pass',exitCode:0,evidenceSha256:hash('fixture-log'),tests:{total:1,passed:1,failed:0,skipped:0,unknown:0}}],artifacts:[{path:'evidence.json',sha256:hash('fixture-bytes'),bytes:13}]});
  Object.assign(f.runs.get(s.runId!),{status:'succeeded',result:{outcome:'success',exitCode:0,summary:'Fixture evidence',usage:null,validation:{exitCode:0,autonomyReportJson:report,autonomyReportSha256:hash(report)}}});f.update(s.taskId!,{status:'validating',artifacts:['evidence.json']});
  f.ready(false);await f.runtime.tick();assert.equal(f.runtime.get('project')!.status,'running');assert.match(f.runtime.get('project')!.reason!,/节点暂未就绪/);f.ready(true);await f.runtime.control('project','start',f.command());await f.runtime.tick();
  const after=f.runtime.get('project')!;assert.equal(after.status,'running');assert.equal(after.stages[0].status,'reviewing');assert.equal(after.stages[0].attempt,1);assert.equal(f.runs.size,2);assert.deepEqual(after.verifiedObjectiveIds,[]);
 }finally{await f.close();}
});
