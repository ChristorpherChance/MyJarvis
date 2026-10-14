import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {ProjectAutonomyRuntime,validateAutonomySpec} from '../src/runtime/project-autonomy-runtime.js';
import {canonicalExecution,type ExecutionRuntime} from '../src/runtime/execution-runtime.js';

// The run receipts below are explicitly synthetic orchestration fixtures. They
// prove state/acceptance boundaries, not physical product execution or delivery.
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const spec={schemaVersion:1,projectKey:'synthetic-independent-review-fixture',version:'test-only',workPackages:[{id:'FA-01',title:'Fixture gate',dependsOn:[],budgetScope:'fixture-scope',objectiveIds:['OBJ-1']}],objectives:[{id:'OBJ-1',title:'Fixture objective',acceptance:['Actual fixed gate and independent review required'],dependsOn:[],workPackage:'FA-01',scope:'fixture-scope'}]};
async function fixture(options:{configure?:boolean;scopeTokens?:number;scopeUSD?:number;recordOnly?:boolean;withValidator?:boolean}={}){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-autonomy-independent-')),workspace=join(directory,'candidate');await mkdir(workspace);
 const store=new Store(join(directory,'store')),repo=new V1Repository(store.databasePath),projectId=randomUUID(),machineId=randomUUID(),machine=()=>({id:machineId,status:'online'});
 repo.execute({domain:'projects',commands:['fixture-seed'],execute:(_c,_p,ctx)=>ctx.create('projects',{name:'Synthetic independent review fixture',goal:'Fixture only',repo:'fixture://isolated',status:'active',copies:[{machineId,path:workspace,environment:'test',branch:'isolated'}]},projectId)},'fixture-seed',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',machine);
 const templates=['worker','reviewer'].map(role=>({id:role,machineId,engine:'claude' as const,workspaceRoot:directory,program:process.execPath,args:role==='reviewer'?['--tools','Read,Glob,Grep','--allowedTools','Read,Glob,Grep']:[],maxRounds:2,timeoutSec:5,leaseSec:30,budgetCurrency:'USD' as const,validation:{program:process.execPath,args:[],timeoutSec:5},supervision:{billing:options.recordOnly?'record-only' as const:'priced' as const,maxTokens:100,maxRecoveryAttempts:1,retryDelaySec:60,repairValidation:false,fallbackExecutorIds:[]}}));
 if(options.withValidator){const validation={program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}','FA-01',sha(canonicalExecution(spec))],timeoutSec:5};templates.forEach(t=>t.validation=validation);templates.push({...templates[0],id:'validator',engine:'fixed',purpose:'project-autonomy-validation',program:'/usr/bin/true',args:[],maxRounds:1,supervision:undefined} as any);}
 const config={machineId,workspace,costPolicy:options.recordOnly?'record-only':'limited',maxUSD:options.recordOnly?null:10,maxTokens:options.recordOnly?null:1000,perTaskUSD:options.recordOnly?null:1,maxAttempts:3,maxRepeated:3,executors:{'FA-01':{worker:'worker',reviewer:'reviewer',...(options.withValidator?{validator:'validator'}:{}),requiredCheckIds:['tests'],budgetScope:'fixture-scope'}},scopeBudgets:{'fixture-scope':{maxUSD:options.recordOnly?null:options.scopeUSD??10,maxTokens:options.recordOnly?null:options.scopeTokens??1000}}};
 const runs=new Map<string,any>();let startGate:Promise<void>|undefined,stopFailure=0,started:()=>void=()=>{};
 const patch=(taskId:string,data:any)=>{const task=repo.read('tasks',taskId,'server-admin')!;return repo.execute({domain:'tasks',commands:['fixture-observation'],execute:(_c,_p,ctx)=>{ctx.check(ctx.require('tasks',taskId));return ctx.update('tasks',taskId,data);}},'fixture-observation',{commandId:randomUUID(),expectedVersion:task.revision,scope:'personal',payload:{}},'server-admin',machine).data;};
 const execution={options:{machine},templates:()=>templates,ready:()=>true,runsForTask:(id:string)=>[...runs.values()].filter(run=>run.taskId===id),getRun:(id:string)=>runs.get(id),cancelRun:(id:string)=>{const run=runs.get(id);if(run){run.status='cancelled';run.stopRequested=true;}},dispatch:async(_domain:any,action:any,envelope:any)=>{
  if(action!=='start'){
   if(stopFailure-->0)throw Error('SYNTHETIC_STOP_RESPONSE_LOSS');
   return repo.execute({domain:'tasks',commands:[action],execute:(_c,_p,ctx)=>{const task=ctx.require('tasks',envelope.payload.taskId);ctx.check(task);return ctx.update('tasks',task.id,{status:action==='pause'?'paused':'cancelled',executionStatus:'cancelled'});}},action,envelope,'server-admin',machine);
  }
  const previous=repo.replay('tasks','start',envelope,'server-admin');if(previous)return previous;
  const id=randomUUID(),taskId=envelope.payload.taskId;
  const receipt=repo.execute({domain:'tasks',commands:['start'],execute:(_c,_p,ctx)=>{const task=ctx.require('tasks',taskId);ctx.check(task);return ctx.update('tasks',taskId,{executionRequest:{id},status:'queued',executionStatus:'queued'});}},'start',envelope,'server-admin',machine);
  runs.set(id,{id,taskId,status:'queued'});started();if(startGate)await startGate;return receipt;
 }};
 let clockOffset=0;const runtimeOptions={directory:join(directory,'autonomy'),stopped:()=>false,now:()=>Date.now()+clockOffset};let runtime=new ProjectAutonomyRuntime(repo,execution as unknown as ExecutionRuntime,runtimeOptions);
 const configure=()=>runtime.configure(projectId,{spec,config,expectedVersion:0,commandId:randomUUID()});if(options.configure!==false)configure();
 const profile=()=>runtime.get(projectId)!,stage=()=>profile().stages[0];
 const report=(runId:string)=>({schemaVersion:1,kind:'project-autonomy-validation',status:'pass',simulated:false,runId,workspace,goalSpecHash:profile().goalSpecHash,workPackage:'FA-01',sourceFingerprint:sha('synthetic-source'),sourceStable:true,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),checks:[{id:'tests',command:'synthetic-fixture-check',required:true,executed:true,status:'pass',exitCode:0,evidenceSha256:sha('synthetic-log'),tests:{total:1,passed:1,failed:0,skipped:0,unknown:0}}],artifacts:[{path:'fixture-evidence.json',sha256:sha('synthetic-bytes'),bytes:15}]});
 const finish=(runId:string,fixed:any,fixedExit=0,summary='Synthetic worker result',usage:any={costUSD:.1,inputTokens:10,outputTokens:5,totalTokens:15,usageComplete:true})=>{
  const run=runs.get(runId),json=JSON.stringify(fixed);Object.assign(run,{status:'succeeded',result:{outcome:'success',exitCode:0,summary,usage,validation:{exitCode:fixedExit,autonomyReportJson:json,autonomyReportSha256:sha(json)}}});patch(run.taskId,{status:'validating',executionStatus:'succeeded',executionResult:run.result,artifacts:['fixture-evidence.json']});return run;
 };
 const begin=async()=>{const p=profile();await runtime.control(projectId,'start',{expectedVersion:p.revision,commandId:randomUUID(),reason:'Synthetic bounded fixture authorization'});await runtime.tick();};
 const passWorker=async()=>{await begin();const s=stage(),worker=report(s.runId!);finish(s.runId!,worker);await runtime.tick();assert.equal(stage().status,'reviewing');return {worker,workerJson:JSON.stringify(worker)};};
 return {directory,projectId,repo,templates,config,runs,configure,profile,stage,report,finish,begin,passWorker,patch,advanceClock(ms:number){clockOffset+=ms;},get runtime(){return runtime},async restart(){runtime.close();runtime=new ProjectAutonomyRuntime(repo,execution as unknown as ExecutionRuntime,runtimeOptions)},delayStart(){let release!:()=>void;startGate=new Promise<void>(r=>release=r);const entered=new Promise<void>(r=>started=r);return {entered,release};},failNextStop(){stopFailure=1;},async close(){runtime.close();repo.close();store.close();const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-autonomy-independent-'));await rm(absolute,{recursive:true,force:true});}};
}

test('synthetic worker JSON pass cannot override the actual fixed program nonzero exit',async()=>{
 const f=await fixture();try{await f.begin();const s=f.stage();f.finish(s.runId!,f.report(s.runId!),7);await f.runtime.tick();assert.equal(f.stage().status,'pending');assert.equal(f.runs.size,1);assert.deepEqual(f.profile().verifiedObjectiveIds,[]);assert.equal(f.repo.read('tasks',s.taskId!,'server-admin')!.acceptance,null);}finally{await f.close();}
});
for(const failure of ['actual-exit','failed-check','skipped-check','unknown-tests'])test(`synthetic independent model review pass cannot override reviewer fixed ${failure}`,async()=>{
 const f=await fixture();try{
  const {worker,workerJson}=await f.passWorker(),s=f.stage(),fixed:any=f.report(s.reviewRunId!);
  if(failure==='failed-check')Object.assign(fixed.checks[0],{status:'fail',exitCode:1});
  if(failure==='skipped-check')Object.assign(fixed.checks[0],{status:'skip',executed:false,exitCode:null});
  if(failure==='unknown-tests')Object.assign(fixed.checks[0].tests,{passed:0,unknown:1});
  const review={schemaVersion:1,kind:'project-autonomy-review',status:'pass',simulated:false,runId:s.reviewRunId,workspace:f.config.workspace,goalSpecHash:f.profile().goalSpecHash,workPackage:s.id,sourceFingerprint:worker.sourceFingerprint,sourceStable:true,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),validationRunId:s.runId,validationReportSha256:sha(workerJson),criteria:[{objectiveId:'OBJ-1',outcome:'pass',evidenceRefs:['artifact:fixture-evidence.json'],reason:'Synthetic model says pass; gate must still refuse.'}]};
  f.finish(s.reviewRunId!,fixed,failure==='actual-exit'?9:0,JSON.stringify({summary:'Synthetic pass assertion',needs_more_work:false,artifacts:['fixture-evidence.json'],review}));await f.runtime.tick();
  assert.equal(f.stage().status,'pending');assert.deepEqual(f.profile().verifiedObjectiveIds,[]);assert.equal(f.repo.read('tasks',s.taskId!,'server-admin')!.acceptance,null);assert.equal(f.repo.read('tasks',s.reviewTaskId!,'server-admin')!.acceptance,null);
 }finally{await f.close();}
});
test('partial known fees and tokens remain counted but prohibit another autonomous call after restart',async()=>{
 const f=await fixture();try{
  await f.begin();const s=f.stage(),run=f.runs.get(s.runId!);Object.assign(run,{status:'failed',result:{outcome:'failed',exitCode:1,summary:'Synthetic interrupted usage',usage:{costUSD:.25,inputTokens:12,outputTokens:3,totalTokens:15,usageComplete:false}}});f.patch(s.taskId!,{status:'failed',executionStatus:'failed',executionResult:run.result});
  assert.equal(f.runtime.supervisesTask(s.taskId!),false);assert.equal(f.profile().budget.spentUSD,.25);assert.equal(f.profile().budget.usedTokens,15);assert.equal(f.profile().budget.unknownCostCount,1);
  await f.runtime.tick();await f.restart();await f.runtime.tick();assert.equal(f.runs.size,1);assert.equal(f.profile().reason,'COST_UNKNOWN');assert.deepEqual(f.profile().verifiedObjectiveIds,[]);
 }finally{await f.close();}
});

test('record-only synthetic orchestration keeps unknown fee counts and partial money beyond old global limits while launching independent review',async()=>{
 const f=await fixture({recordOnly:true});try{
  await f.begin();const s=f.stage(),worker=f.report(s.runId!);f.finish(s.runId!,worker,0,'Synthetic worker with partial cost',{knownCostUSD:12,costComplete:false,inputTokens:2000001,outputTokens:10,totalTokens:2000011,usageComplete:false,costKind:'catalog-estimate'});
  assert.equal(f.profile().budget.spentUSD,12);assert.equal(f.profile().budget.usedTokens,2000011);assert.equal(f.profile().budget.unknownCostCount,1);
  await f.runtime.tick();assert.equal(f.stage().status,'reviewing');assert.equal(f.runs.size,2);assert.equal(f.runtime.supervisesTask(f.stage().reviewTaskId!),true);assert.deepEqual(f.profile().verifiedObjectiveIds,[]);
  await f.runtime.control(f.projectId,'cancel',{expectedVersion:f.profile().revision,commandId:randomUUID(),reason:'Synthetic explicit stop'});assert.equal(f.runtime.supervisesTask(f.stage().reviewTaskId!),false);await f.runtime.tick();assert.equal(f.runs.size,2);
 }finally{await f.close();}
});

test('record-only plans cannot hide spend limits or use priced execution templates',async()=>{
 const f=await fixture({configure:false,recordOnly:true});try{
  f.templates[0].supervision.billing='priced';assert.throws(()=>f.configure(),/费用策略与执行器模式/);assert.equal(f.runtime.get(f.projectId),null);
  f.templates[0].supervision.billing='record-only';assert.throws(()=>f.runtime.configure(f.projectId,{spec,config:{...f.config,maxUSD:10},expectedVersion:0,commandId:randomUUID()}),/隐藏消费限额/);assert.equal(f.runtime.get(f.projectId),null);
 }finally{await f.close();}
});
test('exhausted independent scope revokes quota continuation while the overall budget still has room',async()=>{
 const f=await fixture({scopeTokens:100});try{
  await f.begin();const s=f.stage(),run=f.runs.get(s.runId!);Object.assign(run,{status:'failed',result:{outcome:'failed',exitCode:1,summary:'Synthetic quota result',usage:{costUSD:.1,inputTokens:80,outputTokens:20,totalTokens:100,usageComplete:true},recovery:{automatic:true,retryAt:new Date(Date.now()-1000).toISOString()}}});f.patch(s.taskId!,{status:'waitingQuota',executionStatus:'failed',executionResult:run.result});
  assert.ok(f.profile().budget.usedTokens<f.config.maxTokens);assert.equal(f.runtime.supervisesTask(s.taskId!),false);await f.runtime.tick();assert.equal(f.runs.size,1);
 }finally{await f.close();}
});
test('a committed dispatch finishing after pause cannot overwrite the persisted pause or revive its run',async()=>{
 const f=await fixture();try{
  const gate=f.delayStart(),p=f.profile();await f.runtime.control(p.projectId,'start',{expectedVersion:p.revision,commandId:randomUUID(),reason:'Synthetic start'});const tick=f.runtime.tick();await gate.entered;
  const current=f.profile(),taskId=f.stage().taskId!;await f.runtime.control(current.projectId,'pause',{expectedVersion:current.revision,commandId:randomUUID(),reason:'Synthetic pause while response pending'});gate.release();await tick;
  assert.equal(f.profile().status,'paused');assert.equal(f.repo.read('tasks',taskId,'server-admin')!.status,'paused');assert.equal(f.runtime.supervisesTask(taskId),false);assert.equal(f.runs.size,1);assert.equal([...f.runs.values()][0].status,'cancelled');await f.runtime.tick();assert.equal(f.runs.size,1);
 }finally{await f.close();}
});
test('failed cancellation effects remain durable and replay while the project profile is cancelled',async()=>{
 const f=await fixture();try{await f.begin();const p=f.profile(),taskId=f.stage().taskId!;f.failNextStop();await f.runtime.control(p.projectId,'cancel',{expectedVersion:p.revision,commandId:randomUUID(),reason:'Synthetic stop loss'});assert.equal(f.profile().status,'cancelled');assert.equal(f.repo.read('tasks',taskId,'server-admin')!.status,'queued');await f.restart();await f.runtime.tick();assert.equal(f.repo.read('tasks',taskId,'server-admin')!.status,'cancelled');assert.equal(f.profile().status,'cancelled');assert.equal(f.runs.size,1);}finally{await f.close();}
});
test('close waits for an in-flight durable dispatch tick before closing its database',async()=>{
 const f=await fixture();try{
  const gate=f.delayStart(),p=f.profile();await f.runtime.control(p.projectId,'start',{expectedVersion:p.revision,commandId:randomUUID(),reason:'Synthetic close boundary'});const tick=f.runtime.tick();await gate.entered;
  let closed=false;const closing=f.runtime.close().then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);
  gate.release();await tick;await closing;assert.equal(closed,true);await f.runtime.tick();assert.equal(f.runs.size,1);
 }finally{await f.close();}
});
test('a non-converging last package and a missing cross-package dependency bridge are refused',()=>{
 const packages=[{id:'P1',title:'First',dependsOn:[],budgetScope:'fixture',objectiveIds:['O1']},{id:'P2',title:'Second',dependsOn:[],budgetScope:'fixture',objectiveIds:['O2']},{id:'P3',title:'Final',dependsOn:['P1','P2'],budgetScope:'fixture',objectiveIds:['O3']}];
 const objectives=packages.map((pack,i)=>({id:'O'+(i+1),title:'Fixture '+i,acceptance:['Fixture proof'],dependsOn:i===1?['O1']:[],workPackage:pack.id,scope:'fixture'}));
 assert.throws(()=>validateAutonomySpec({...spec,workPackages:packages,objectives}),/跨工作包/);
 assert.throws(()=>validateAutonomySpec({...spec,workPackages:packages.map(p=>p.id==='P3'?{...p,dependsOn:['P2']}:p),objectives:objectives.map(o=>({...o,dependsOn:[]}))}),/最后工作包/);
});
test('dense acyclic dependency ancestry stays finite with every package covered',{timeout:2000},()=>{
 const packages=Array.from({length:32},(_v,i)=>({id:'P'+i,title:'Fixture '+i,dependsOn:Array.from({length:i},(_w,j)=>'P'+j),budgetScope:'fixture',objectiveIds:['O'+i]}));
 const objectives=packages.map((pack,i)=>({id:'O'+i,title:'Fixture '+i,acceptance:['Fixture proof'],dependsOn:i?['O'+(i-1)]:[],workPackage:pack.id,scope:'fixture'}));
 assert.equal(validateAutonomySpec({...spec,workPackages:packages,objectives}).workPackages.length,32);
});

async function waitOnSyntheticPrerequisite(f:Awaited<ReturnType<typeof fixture>>){
 await f.begin();const s=f.stage(),report:any=f.report(s.runId!);report.status='fail';Object.assign(report.checks[0],{status:'unknown',exitCode:2,tests:{total:1,passed:0,failed:0,skipped:0,unknown:1}});
 const raw=JSON.stringify({schemaVersion:1,kind:'project-autonomy-prerequisite-status',simulated:false,runId:s.runId,attempt:'f'.repeat(32),sourceFingerprint:report.sourceFingerprint,goalSpecHash:report.goalSpecHash,workPackage:s.id,waiting:[{id:'provider',reasonCode:'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING'}],observedAt:report.startedAt,nextCheckSeconds:60,observationsAreAcceptance:false});
 Object.assign(report,{prerequisiteWaitEligible:true,prerequisiteStatusJson:raw,prerequisiteStatusSha256:sha(raw),waitingPrerequisites:[{id:'provider',checkId:'tests',objectiveIds:['OBJ-1'],errorCode:'TRUSTED_PREREQUISITE_RECEIPT_MISSING'}]});
 const run=f.finish(s.runId!,report,1,'Synthetic resource-only wait');run.status='failed';run.result.outcome='failed';run.result.exitCode=1;f.patch(s.taskId!,{status:'failed',executionStatus:'failed',executionResult:run.result});await f.runtime.tick();assert.equal(f.stage().status,'waiting-prerequisite');assert.equal(f.stage().attempt,1);assert.equal(f.runtime.supervisesTask(s.taskId!),false);return {originalTaskId:s.taskId!,originalRunId:s.runId!};
}

test('synthetic fixed retry plus new independent review binds new run and leaves the failed worker history unaccepted',async()=>{
 const f=await fixture({recordOnly:true,withValidator:true});try{
  const original=await waitOnSyntheticPrerequisite(f);await f.restart();await f.runtime.tick();assert.equal(f.runs.size,1);f.advanceClock(301000);await f.runtime.tick();const probe=f.stage();assert.equal(probe.status,'validating-prerequisite');assert.equal(f.runs.size,2);assert.equal(f.runtime.supervisesTask(probe.validationTaskId!),true);assert.equal(f.runtime.supervisesTask(original.originalTaskId),false);
  const fixed=f.report(probe.validationRunId!),json=JSON.stringify(fixed);f.finish(probe.validationRunId!,fixed,0,'Synthetic fixed-only probe',{costUSD:0,inputTokens:0,outputTokens:0,totalTokens:0,usageComplete:true,costComplete:true});await f.runtime.tick();const s=f.stage();assert.equal(s.status,'reviewing');assert.equal(f.profile().verifiedObjectiveIds.length,0);assert.equal(f.repo.read('tasks',probe.validationTaskId!,'server-admin')!.acceptance,null);assert.ok(f.repo.read('tasks',s.reviewTaskId!,'server-admin')!.goal.includes(`validationRunId:"${probe.validationRunId}"`),'review prompt must bind the new validation run');
  const review={schemaVersion:1,kind:'project-autonomy-review',status:'pass',simulated:false,runId:s.reviewRunId,workspace:f.config.workspace,goalSpecHash:f.profile().goalSpecHash,workPackage:s.id,sourceFingerprint:fixed.sourceFingerprint,sourceStable:true,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),validationRunId:probe.validationRunId,validationReportSha256:sha(json),criteria:[{objectiveId:'OBJ-1',outcome:'pass',evidenceRefs:['artifact:fixture-evidence.json'],reason:'Synthetic independent review of the new fixed report.'}]};
  f.finish(s.reviewRunId!,f.report(s.reviewRunId!),0,JSON.stringify({review}),{costUSD:.05,inputTokens:5,outputTokens:2,totalTokens:7,usageComplete:true});await f.runtime.tick();assert.equal(f.stage().status,'passed');assert.equal(f.repo.read('tasks',original.originalTaskId,'server-admin')!.status,'failed');assert.equal(f.repo.read('tasks',original.originalTaskId,'server-admin')!.acceptance,null);assert.equal(f.repo.read('tasks',probe.validationTaskId!,'server-admin')!.status,'completed');assert.equal(f.repo.read('tasks',s.reviewTaskId!,'server-admin')!.status,'completed');assert.deepEqual(f.profile().verifiedObjectiveIds,['OBJ-1']);assert.ok(Math.abs(f.profile().budget.spentUSD-.15)<1e-9);
 }finally{await f.close();}
});

test('a pause racing a synthetic fixed-probe dispatch survives restart and never revives the waiting worker',async()=>{
 const f=await fixture({recordOnly:true,withValidator:true});try{
  const original=await waitOnSyntheticPrerequisite(f);f.advanceClock(301000);const gate=f.delayStart(),tick=f.runtime.tick();await gate.entered;const p=f.profile();assert.equal(p.stages[0].status,'validating-prerequisite');await f.runtime.control(f.projectId,'pause',{expectedVersion:p.revision,commandId:randomUUID(),reason:'Synthetic fixed-probe stop race'});gate.release();await tick;assert.equal(f.profile().status,'paused');assert.equal(f.runs.size,2);assert.equal(f.runtime.supervisesTask(original.originalTaskId),false);assert.equal(f.runtime.supervisesTask(f.stage().validationTaskId!),false);await f.restart();await f.runtime.tick();assert.equal(f.profile().status,'paused');assert.deepEqual(f.profile().verifiedObjectiveIds,[]);assert.equal(f.runs.size,2);assert.equal(f.repo.read('tasks',f.stage().validationTaskId!,'server-admin')!.status,'paused');
 }finally{await f.close();}
});

test('synthetic real failures discovered while rechecking prerequisites return to bounded development without accepting pending evidence',async()=>{
 const f=await fixture({recordOnly:true,withValidator:true});try{
  await waitOnSyntheticPrerequisite(f);f.advanceClock(301000);await f.runtime.tick();const s=f.stage(),report:any=f.report(s.validationRunId!);report.status='fail';report.checks[0].status='fail';report.checks[0].exitCode=1;const run=f.finish(s.validationRunId!,report,1,'Synthetic actual product failure',{costUSD:0,inputTokens:0,outputTokens:0,totalTokens:0,usageComplete:true,costComplete:true});run.status='failed';run.result.outcome='failed';f.patch(s.validationTaskId!,{status:'failed',executionStatus:'failed',executionResult:run.result});await f.runtime.tick();assert.equal(f.stage().status,'pending');assert.equal(f.stage().attempt,1);await f.runtime.tick();assert.equal(f.stage().status,'worker');assert.equal(f.stage().attempt,2);assert.equal(f.runs.size,3);assert.deepEqual(f.profile().verifiedObjectiveIds,[]);assert.equal(f.repo.read('tasks',s.validationTaskId!,'server-admin')!.acceptance,null);
 }finally{await f.close();}
});
for(const flag of ['--tools','--allowedTools'])test(`duplicate ${flag} cannot widen the independent reviewer tool boundary`,async()=>{
 const f=await fixture({configure:false});try{f.templates[1].args.push(flag,'Read,Glob,Grep,Edit,Write,Bash');assert.throws(()=>f.configure(),/只读工具/);assert.equal(f.runtime.get(f.projectId),null);assert.equal(f.runs.size,0);}finally{await f.close();}
});


test('synthetic frozen autonomy profiles accept exact isolated root only for all protected worker/reviewer/validator templates',async()=>{
 const f=await fixture({configure:false,withValidator:true});try{f.templates.forEach(t=>t.workspaceRoot=f.config.workspace);f.configure();assert.equal(f.profile().config.workspace,f.config.workspace);assert.equal(Object.keys(f.profile().templateHashes).length,3);assert.equal(f.runs.size,0);}finally{await f.close();}
});

for(const role of ['worker','reviewer','validator'])test(`synthetic exact-root ${role} cannot freeze an arbitrary validator into a profile`,async()=>{
 const f=await fixture({configure:false,withValidator:true});try{f.templates.forEach(t=>t.workspaceRoot=f.config.workspace);f.templates.find(t=>t.id===role).validation.args[1]='/tmp/fake-validator';assert.throws(()=>f.configure(),/工作目录|无模型验证模板/);assert.equal(f.runtime.get(f.projectId),null);assert.equal(f.runs.size,0);}finally{await f.close();}
});
