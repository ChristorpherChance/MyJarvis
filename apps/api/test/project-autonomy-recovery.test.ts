import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,chmod,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {canonicalExecution,type ExecutionRuntime} from '../src/runtime/execution-runtime.js';
import {ProjectAutonomyRuntime} from '../src/runtime/project-autonomy-runtime.js';

process.env.NODE_ENV='test';
const digest=(input:unknown)=>createHash('sha256').update(typeof input==='string'?input:canonicalExecution(input)).digest('hex');
async function fixture(recordOnly=true){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-autonomy-recover-')),store=new Store(join(directory,'store')),repo=new V1Repository(store.databasePath),workspace=join(directory,'workspace'),receipts=join(directory,'trusted-recovery');await mkdir(receipts,{mode:0o755});
 const machine=()=>({id:'node',status:'online'});
 repo.execute({domain:'projects',commands:['seed'],execute:(_c,_p,ctx)=>ctx.create('projects',{name:'Recovery fixture',goal:'Actual fixture only',repo:'fixture',status:'active',copies:[{machineId:'node',path:workspace,environment:'test',branch:'fixture'}]},'project')},'seed',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',machine);
 const spec={schemaVersion:1,projectKey:'fixture',version:'r1',workPackages:[{id:'FA-01',title:'Fixture worker',dependsOn:[],budgetScope:'factory',objectiveIds:['O1']}],objectives:[{id:'O1',title:'Actual fixture acceptance',acceptance:['Fixed evidence and new independent review'],dependsOn:[],workPackage:'FA-01',scope:'factory'}]};
 const templates=['worker','reviewer'].map(id=>({id,machineId:'node',engine:'claude',workspaceRoot:directory,program:process.execPath,args:id==='reviewer'?['--tools','Read,Glob,Grep','--allowedTools','Read,Glob,Grep']:[],maxRounds:2,timeoutSec:5,leaseSec:30,budgetCurrency:'USD',validation:{program:process.execPath,args:[],timeoutSec:5},supervision:{billing:recordOnly?'record-only':'priced',maxTokens:100,maxRecoveryAttempts:0,retryDelaySec:60,repairValidation:false,fallbackExecutorIds:[]}}));
 const runs=new Map<string,any>(),agent={id:'agent',machineId:'node',lastSeen:new Date().toISOString(),status:'online',revoked:false};
 const update=(id:string,patch:any)=>{const task=repo.read('tasks',id,'server-admin')!;return repo.execute({domain:'tasks',commands:['fixture-update'],execute:(_c,_p,ctx)=>ctx.update('tasks',id,patch)},'fixture-update',{commandId:randomUUID(),expectedVersion:task.revision,scope:'personal',payload:{}},'server-admin',machine);};
 const execution={options:{machine},templates:()=>templates,agents:()=>[agent],ready:()=>agent.status==='online',getRun:(id:string)=>runs.get(id),runsForTask:(id:string)=>[...runs.values()].filter(r=>r.taskId===id),cancelRun:(id:string)=>{runs.get(id).status='cancelled';},dispatch:async(_domain:any,action:any,envelope:any)=>{
  if(action!=='start')return update(envelope.payload.taskId,{status:action==='pause'?'paused':'cancelled',executionStatus:'cancelled'});
  const replay=repo.replay('tasks','start',envelope,'server-admin');if(replay)return replay;
  const task=repo.read('tasks',envelope.payload.taskId,'server-admin')!,id=randomUUID();
  const receipt=repo.execute({domain:'tasks',commands:['start'],execute:(_c,_p,ctx)=>ctx.update('tasks',task.id,{executionRequest:{id},executionStatus:'queued',status:'queued'})},'start',envelope,'server-admin',machine);
  runs.set(id,{id,taskId:task.id,projectId:'project',machineId:'node',executorId:task.agent,workspace,status:'queued',agentId:agent.id});return receipt;
 }};
 const config={machineId:'node',workspace,costPolicy:recordOnly?'record-only':'limited',maxUSD:recordOnly?null:100,maxTokens:recordOnly?null:100000,perTaskUSD:recordOnly?null:1,maxAttempts:3,executors:{'FA-01':{worker:'worker',reviewer:'reviewer',requiredCheckIds:['tests'],budgetScope:'factory'}},scopeBudgets:{factory:{maxUSD:recordOnly?null:100,maxTokens:recordOnly?null:100000}}};
 const options={directory:join(directory,'autonomy'),stopped:()=>false,reconciliationDirectory:receipts,reconciliationTrustForTests:{controlledRoot:directory,ownerUid:process.getuid?.()??0}};
 let runtime=new ProjectAutonomyRuntime(repo,execution as unknown as ExecutionRuntime,options);runtime.configure('project',{spec,config,expectedVersion:0,commandId:randomUUID()});
 const configured=runtime.get('project')!;await runtime.control('project','start',{expectedVersion:configured.revision,commandId:randomUUID(),reason:'Fixture start'});await runtime.tick();
 const first=runtime.get('project')!,stage=first.stages[0],oldRunId=stage.runId!,oldTaskId=stage.taskId!,run=runs.get(oldRunId);
 run.status='cancelled';run.result={source:'signed-agent',outcome:'cancelled',exitCode:143,at:new Date().toISOString(),stopReason:{code:'HEARTBEAT_FAILED',at:new Date().toISOString()},usage:{inputTokens:7,outputTokens:3,totalTokens:10,knownCostUSD:2.25,costComplete:false,usageComplete:false}};
 update(oldTaskId,{status:'cancelled',executionStatus:'cancelled'});agent.lastSeen=new Date(Date.now()+1).toISOString();await runtime.tick();
 const input=async(patch:any={},receiptPatch:any={})=>{
  const p=runtime.get('project')!,id=randomUUID(),record={schemaVersion:1,kind:'project-autonomy-worker-reconciliation',source:'root-managed-queue-inspection',reconciliationId:id,projectId:'project',expectedProfileRevision:p.revision,workPackage:'FA-01',oldTaskId,oldTaskRevision:repo.read('tasks',oldTaskId,'server-admin')!.revision,oldRunId,machineId:'node',agentId:agent.id,workspace,goalSpecHash:p.goalSpecHash,templateHashes:p.templateHashes,terminalResultSha256:digest(run.result),observedAt:new Date().toISOString(),sourceFingerprint:'d'.repeat(64),centralActiveRunIds:[],node:{unitActive:true,processId:123,nativeChildren:0,unresolvedRuns:0,unconfirmedDeliveries:0,pendingLogs:0,oldResultAcknowledged:true},processCleanupVerified:true,recoveryMode:'new-worker-attempt',objectivesAccepted:false,...receiptPatch};
  const bytes=JSON.stringify(record),file=join(receipts,id+'.json');await writeFile(file,bytes,{mode:0o644});await chmod(file,0o644);
  return {commandId:randomUUID(),expectedVersion:p.revision,reason:'Recorded signed cancellation and fresh root queue inspection; open a new bounded worker attempt.',workPackage:'FA-01',oldTaskId,oldRunId,goalSpecHash:p.goalSpecHash,terminalResultSha256:digest(run.result),reconciliationId:id,reconciliationSha256:digest(bytes),...patch};
 };
 return {repo,runs,templates,agent,options,directory,receipts,run,oldRunId,oldTaskId,input,get runtime(){return runtime},async restart(){await runtime.close();runtime=new ProjectAutonomyRuntime(repo,execution as unknown as ExecutionRuntime,options)},async close(){await runtime.close();repo.close();store.close();await rm(directory,{recursive:true,force:true});}};
}

test('signed terminal recovery opens a new bounded worker task, preserves the old run, fees and all acceptance state',async()=>{
 const f=await fixture();try{
  const old=f.runtime.get('project')!,input=await f.input(),result=f.runtime.recover('project',input);assert.equal(old.reason,'EXECUTION_NEEDS_RECONCILIATION');assert.equal(result.status,'running');assert.equal(result.stages[0].status,'pending');assert.equal(result.stages[0].history[0].runId,f.oldRunId);assert.equal(result.stages[0].attempt,1);
  assert.equal(result.budget.spentUSD,2.25);assert.equal(result.budget.unknownCostCount,1);assert.equal(result.budget.usedTokens,10);assert.deepEqual(result.verifiedObjectiveIds,[]);
  await f.restart();await f.runtime.tick();const next=f.runtime.get('project')!,stage=next.stages[0];assert.equal(stage.attempt,2);assert.notEqual(stage.taskId,f.oldTaskId);assert.notEqual(stage.runId,f.oldRunId);assert.equal(f.run.status,'cancelled');assert.equal(f.repo.read('tasks',f.oldTaskId,'server-admin')!.status,'cancelled');assert.equal(f.runtime.supervisesTask(f.oldTaskId),false);assert.equal(f.runtime.supervisesTask(stage.taskId!),true);assert.equal(next.budget.spentUSD,2.25);assert.deepEqual(next.verifiedObjectiveIds,[]);
  assert.equal(f.runtime.recover('project',input).revision,result.revision);assert.equal(f.runs.size,2);
  const event=next.events.find(e=>e.kind==='worker-recovery-planned');assert.equal(event?.data.nativeSessionResumed,false);assert.equal(event?.data.acceptanceChanged,false);
 }finally{await f.close();}
});
test('wrong old role or run, stale revision, goal hash or receipt binding fail without opening a new task',async()=>{
 const f=await fixture();try{
  const input=await f.input();
  for(const patch of [{expectedVersion:input.expectedVersion-1},{workPackage:'FA-02'},{oldRunId:'another-run'},{oldTaskId:'another-task'},{goalSpecHash:'e'.repeat(64)},{terminalResultSha256:'e'.repeat(64)}])assert.throws(()=>f.runtime.recover('project',{...input,...patch}));
  const wrong=await f.input({}, {agentId:'another-agent'});assert.throws(()=>f.runtime.recover('project',wrong),/当前冻结执行/);
  assert.equal(f.runs.size,1);assert.equal(f.runtime.get('project')!.status,'blocked');
 }finally{await f.close();}
});
test('active old runs, unsigned terminal reports, stale original-agent heartbeat and changed templates are refused',async()=>{
 const f=await fixture();try{
  const input=await f.input();f.runs.set('another-running',{id:'another-running',taskId:f.oldTaskId,status:'running'});assert.throws(()=>f.runtime.recover('project',input),/旧执行活动/);f.runs.delete('another-running');
  const prior=f.run.result.source;f.run.result.source='model-self-report';assert.throws(()=>f.runtime.recover('project',input),/签名终止/);f.run.result.source=prior;
  f.agent.lastSeen=new Date(Date.now()-120000).toISOString();assert.throws(()=>f.runtime.recover('project',input),/新鲜心跳/);f.agent.lastSeen=new Date(Date.now()+1).toISOString();
  f.templates[0].maxRounds++;assert.throws(()=>f.runtime.recover('project',input),/执行器配置已变化/);assert.equal(f.runs.size,1);
 }finally{await f.close();}
});
test('trusted file freshness, byte fingerprint, queue values and hardlink identity cannot be asserted by the client',async()=>{
 const f=await fixture();try{
  const stale=await f.input({}, {observedAt:new Date(Date.now()-360000).toISOString()});assert.throws(()=>f.runtime.recover('project',stale),/五分钟/);
  const fresh=await f.input();assert.throws(()=>f.runtime.recover('project',{...fresh,reconciliationSha256:'e'.repeat(64)}),/文件指纹/);
  const busy=await f.input({}, {node:{unitActive:true,processId:123,nativeChildren:1,unresolvedRuns:0,unconfirmedDeliveries:0,pendingLogs:0,oldResultAcknowledged:true}});assert.throws(()=>f.runtime.recover('project',busy));
  await link(join(f.receipts,fresh.reconciliationId+'.json'),join(f.receipts,'untrusted-link.json'));assert.throws(()=>f.runtime.recover('project',fresh),/单一常规文件/);assert.equal(f.runs.size,1);
 }finally{await f.close();}
});
test('limited-mode unknown historical fees still block a new generation, while record-only history is retained',async()=>{
 const f=await fixture(false);
 try{const input=await f.input();assert.throws(()=>f.runtime.recover('project',input),/原预算边界/);assert.equal(f.runs.size,1);assert.equal(f.runtime.get('project')!.budget.unknownCostCount,1);}finally{await f.close();}
});
test('a user or central stop, unknown technical cause or revoked signer never revives the old work',async()=>{
 const f=await fixture();try{
  f.run.stopRequested=true;let input=await f.input();assert.throws(()=>f.runtime.recover('project',input),/用户停止/);delete f.run.stopRequested;
  f.run.stopReason='Administrator asked to pause';input=await f.input();assert.throws(()=>f.runtime.recover('project',input),/用户停止/);delete f.run.stopReason;
  for(const code of ['CENTRAL_STOP','SUPERVISION_STOPPED','NODE_STOP','CLAIM_FAILED','UNKNOWN']){f.run.result.stopReason.code=code;input=await f.input();assert.throws(()=>f.runtime.recover('project',input),/未知原因/);}
  f.run.result.stopReason.code='HEARTBEAT_FAILED';f.agent.revoked=true;input=await f.input();assert.throws(()=>f.runtime.recover('project',input),/原签名节点/);assert.equal(f.runs.size,1);assert.equal(f.run.status,'cancelled');
 }finally{await f.close();}
});
