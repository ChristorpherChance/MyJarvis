import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {ExecutionRuntime,validateExecutionTemplate} from '../src/runtime/execution-runtime.js';
import {executeAgentRounds} from '../src/runtime/agent-runner.js';
import {AgentDeliveryJournal} from '../src/runtime/agent-delivery-journal.js';
import {validateCliSupervision,roundCliUsage} from '../src/runtime/cli-supervision.js';
import type {ExecutionTemplate,ClaimedRun} from '../src/runtime/execution-types.js';

const policy={billing:'record-only' as const,maxTokens:1000,maxRecoveryAttempts:1,retryDelaySec:60,repairValidation:true,fallbackExecutorIds:[]};
const template=(root:string,script:string):ExecutionTemplate=>({id:'record-only',machineId:'fixture-node',engine:'claude',program:process.execPath,args:[script,'--print','{prompt}','--output-format','stream-json'],workspaceRoot:root,maxRounds:3,timeoutSec:10,leaseSec:30,budgetCurrency:'USD',supervision:policy});
async function isolated(fn:(root:string,workspace:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'jarvis-record-only-')),workspace=join(root,'candidate');await mkdir(workspace);try{await fn(root,workspace);}finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});}}
const run=(workspace:string):ClaimedRun=>({id:'synthetic-native-contract-run',kind:'development',machineId:'fixture-node',executorId:'record-only',workspace,goal:'isolated fixture only',criteria:'fixed independent validation',maxRounds:3,timeoutSec:10,budgetUSD:0,remainingTokens:1000,leaseToken:'fixture-private',leaseExpiresAt:new Date(Date.now()+60000).toISOString()});

test('record-only templates forbid native budget flags while normal priced templates still require them',()=>{
 const t=template(resolve('artifacts'),resolve('fixture.cjs'));assert.equal(validateCliSupervision(policy).billing,'record-only');assert.equal(validateExecutionTemplate(t).supervision!.billing,'record-only');
 for(const args of [[...t.args!,'--max-budget-usd','1'],[...t.args!,'--max-budget-usd=1'],[...t.args!,'{maxBudgetUSD}']])assert.throws(()=>validateExecutionTemplate({...t,args}),/原生 USD 预算/);
 assert.throws(()=>validateExecutionTemplate({...t,supervision:{...policy,billing:'priced'}}),/预算参数/);
 assert.equal(validateExecutionTemplate({...t,args:[...t.args!,'--max-budget-usd','{maxBudgetUSD}'],supervision:{...policy,billing:'priced'}}).supervision!.billing,'priced');
});

test('real native-format fixture keeps partial known fees, skips fee stops and never receives max-budget argv',async()=>isolated(async(root,workspace)=>{
 const script=join(root,'cli.cjs');await writeFile(script,`const fs=require('node:fs');const a=process.argv.slice(2);if(a.some(x=>x.startsWith('--max-budget-usd')))process.exit(42);const n=fs.existsSync('rounds.txt')?Number(fs.readFileSync('rounds.txt'))+1:1;fs.writeFileSync('rounds.txt',String(n));console.log(JSON.stringify({type:'system',subtype:'init',session_id:'known-partial-session',claude_code_version:'2.1.277'}));console.log(JSON.stringify({type:'result',session_id:'known-partial-session',usage:{input_tokens:10,output_tokens:5},...(n===1?{total_cost_usd:12}:n===3?{total_cost_usd:13}:{}),result:JSON.stringify({summary:'fixture '+n,needs_more_work:n<3})}));`);
 const result=await executeAgentRounds(template(root,script),run(workspace),workspace,new AbortController().signal,()=>{},async()=>true);
 assert.equal(result.outcome,'success');assert.equal(result.rounds,3);assert.equal(result.usage!.costUSD,undefined);assert.equal(result.usage!.knownCostUSD,13);assert.equal(result.usage!.costComplete,false);assert.equal(result.usage!.usageComplete,true);assert.equal(result.usage!.totalTokens,45);assert.equal(await readFile(join(workspace,'rounds.txt'),'utf8'),'3');
}));

test('missing fees are unknown, owner prices are estimates, and token/cancel bounds remain effective',async()=>isolated(async(root,workspace)=>{
 const script=join(root,'cli.cjs');await writeFile(script,`console.log(JSON.stringify({type:'result',session_id:'unpriced-session',usage:{input_tokens:500,output_tokens:100},result:JSON.stringify({summary:'fixture more',needs_more_work:true})}));`);
 const result=await executeAgentRounds(template(root,script),run(workspace),workspace,new AbortController().signal,()=>{},async()=>true);
 assert.equal(result.outcome,'round-limit');assert.equal(result.rounds,2);assert.equal(result.usage!.costUSD,undefined);assert.equal(result.usage!.knownCostUSD,undefined);assert.equal(result.usage!.costComplete,false);assert.equal(result.usage!.totalTokens,1200);
 const cancelled=new AbortController();cancelled.abort();const stopped=await executeAgentRounds(template(root,script),run(workspace),workspace,cancelled.signal,()=>{},async()=>true);assert.equal(stopped.outcome,'cancelled');assert.equal(stopped.rounds,0);
 const priced=roundCliUsage('claude',{inputTokens:10,outputTokens:20,usageComplete:true},'priced-session',undefined,undefined,{...policy,inputUSDPerMillion:2,outputUSDPerMillion:4});assert.equal(priced.usage!.costUSD,.0001);assert.equal(priced.usage!.costKind,'catalog-estimate');
}));

test('central record-only bypasses task spend but preserves per-task tokens and bounded quota recovery',async()=>isolated(async(root,workspace)=>{
 const store=new Store(join(root,'data')),repo=new V1Repository(store.databasePath),projectId=randomUUID(),taskId=randomUUID(),t=template(root,process.execPath),preflights:any[]=[],allocations:any[]=[],observations:any[]=[];
 const runtime=new ExecutionRuntime(repo,{directory:join(root,'execution'),machine:()=>({id:t.machineId,status:'online'}),stopped:()=>false,taskSupervised:()=>true,preflight:x=>{preflights.push(x);if(!x?.recordOnly)throw Error('FEE_LIMIT_FIXTURE');},beforeExecution:x=>{allocations.push(x);},onUsage:x=>{observations.push(x);}});
 try{
  repo.execute({domain:'projects',commands:['fixture'],execute:(_c,_p,ctx)=>{const p=ctx.create('projects',{name:'fixture',status:'active',copies:[{machineId:t.machineId,path:workspace,environment:'test'}]},projectId);ctx.create('tasks',{title:'fixture',projectId,machineId:t.machineId,agent:t.id,mode:'managed',goal:'fixture',criteria:'fixture',status:'queued',budget:1,cost:12,retryLimit:1,retries:0,dependsOn:null,deadline:null,sessionId:null,artifacts:[],skillRefs:[]},taskId);return p;}},'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',runtime.options.machine);
  runtime.configure({templates:[t]});const keys=generateKeyPairSync('ed25519'),paired=runtime.pair(runtime.issueTicket(t.machineId,[t.id]).ticket,keys.publicKey.export({type:'spki',format:'pem'}).toString());const agent={id:paired.agentId,machineId:t.machineId,capabilities:[t.id]};runtime.heartbeat(agent,{});
  await runtime.dispatch('tasks','start',{commandId:randomUUID(),expectedVersion:repo.read('tasks',taskId,'server-admin')!.revision,scope:'personal',payload:{taskId}},'server-admin');const claimed=runtime.claim(agent)!;assert.equal(claimed.budgetUSD,0);assert.equal(allocations[0].recordOnly,true);assert.ok(preflights.every(p=>p.recordOnly===true));
  const body={deliveryId:randomUUID(),runId:claimed.id,leaseToken:claimed.leaseToken,outcome:'failed',exitCode:1,rounds:1,summary:'fixture quota',artifacts:[],failureKind:'quota',usage:{inputTokens:2,outputTokens:1,costComplete:false,knownCostUSD:.25,costKind:'catalog-estimate'}};
  for(const usage of [{...body.usage,costUSD:.25},{inputTokens:2,outputTokens:1,costComplete:true},{...body.usage,knownCostUSD:-1}])await assert.rejects(()=>runtime.result(agent.id,{...body,usage}),/费用|金额/);
  assert.equal(runtime.getRun(claimed.id)!.status,'running');await runtime.result(agent.id,body);await runtime.result(agent.id,body);const task=repo.read('tasks',taskId,'server-admin')!;assert.equal(task.executionResult.recovery.automatic,true);assert.equal(task.cost,12.25);assert.equal(observations.length,1);assert.equal(observations[0].usage.knownCostUSD,.25);assert.equal(observations[0].usage.costUSD,undefined);
  const history=runtime.runsForTask(taskId);assert.equal(history[0].result.usage.costUSD,undefined);assert.equal(history[0].result.usage.costComplete,false);
  const recovery=(runtime as any).recoveryFor({id:'next',executorId:t.id,machineId:t.machineId},task,'quota',{inputTokens:1,outputTokens:1});assert.equal(recovery.automatic,false);assert.equal(recovery.attempts,2);
 }finally{await runtime.close();repo.close();store.close();}
}));

test('node restart retains checkpoint known fee while explicitly leaving final cost unknown',async()=>isolated(async(root,workspace)=>{
 const journal=new AgentDeliveryJournal(join(root,'spool'),'fixture-agent','fixture-node');try{const claimed=run(workspace);journal.register(claimed);journal.started(claimed.id);const sessionBilling={engine:'claude',sessionId:'same-native-session',costUSD:12};journal.checkpoint(claimed.id,{rounds:1,sessionId:'same-native-session',sessionBilling,usage:{inputTokens:10,outputTokens:5,totalTokens:15,costUSD:12,costKind:'provider-reported',usageComplete:true}});journal.recoverInterrupted();const delivery=journal.next();assert.ok(delivery);const usage=(delivery!.body as any).usage;assert.equal(usage.costUSD,undefined);assert.equal(usage.knownCostUSD,12);assert.equal(usage.costComplete,false);assert.equal(usage.usageComplete,false);assert.deepEqual(delivery!.body.sessionBilling,sessionBilling);}finally{journal.close();}
}));
