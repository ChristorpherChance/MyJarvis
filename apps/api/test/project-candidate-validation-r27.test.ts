import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join,resolve,sep} from 'node:path';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {ExecutionRuntime,validateExecutionTemplate,validateCandidateValidationRun,candidateValidationScope as S} from '../src/runtime/execution-runtime.js';
import {executeAgentRounds,parseAgentOutput} from '../src/runtime/agent-runner.js';
import {AgentDeliveryJournal} from '../src/runtime/agent-delivery-journal.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';
import {candidateValidationReceiptUsage,fixedValidationUsage} from '../src/runtime/execution-types.js';
import type {ExecutionTemplate,ClaimedRun} from '../src/runtime/execution-types.js';
import type {DomainHandler} from '../src/v1/types.js';

const template=():ExecutionTemplate=>({id:S.id,machineId:S.machineId,engine:'fixed',purpose:S.purpose,program:S.program,args:[S.receipt],workspaceRoot:S.workspaceRoot,maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n',S.entry,'{workspace}','{runId}'],timeoutSec:3600}});
const claimed=():ClaimedRun=>({id:'e'.repeat(40),kind:'development',machineId:S.machineId,executorId:S.id,projectId:S.projectId,workspace:S.workspace,goal:'real fixed candidate validation',criteria:'independent evidence',maxRounds:1,timeoutSec:4200,budgetUSD:0,purpose:S.purpose,leaseToken:'isolated-private-lease',leaseExpiresAt:new Date(Date.now()+60000).toISOString()});
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
async function isolated(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'jarvis-r27-protocol-'));try{await fn(root);}finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});}}

test('R27 no-model purpose accepts exactly its pinned template and rejects all program/scope/boundary substitutions',()=>{
 const t=template();assert.deepEqual(validateExecutionTemplate(t),t);
 const mutations=[(x:any)=>x.id='other',(x:any)=>x.machineId='other',(x:any)=>x.engine='pi-sdk',(x:any)=>x.program=process.execPath,(x:any)=>x.args.push('{prompt}'),(x:any)=>x.args[0]='/other/receipt.mjs',(x:any)=>x.workspaceRoot+='/other',(x:any)=>x.maxRounds=2,(x:any)=>x.timeoutSec=4199,(x:any)=>x.leaseSec=59,(x:any)=>x.validation.args[1]='/usr/local/libexec/jarvis-project-autonomy-validation',(x:any)=>x.validation.args.push('FA-01'),(x:any)=>x.validation.timeoutSec=3599,(x:any)=>x.supervision={billing:'record-only',maxTokens:1,maxRecoveryAttempts:0,retryDelaySec:1,repairValidation:false,fallbackExecutorIds:[]},(x:any)=>x.purpose='pretend-free'];
 for(const mutate of mutations){const x=structuredClone(t);mutate(x);assert.throws(()=>validateExecutionTemplate(x));}
 const legacy={...t,purpose:'project-autonomy-validation',program:'/usr/bin/true',args:[],validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}','FA-01','a'.repeat(64)],timeoutSec:3600}};
 assert.equal(validateExecutionTemplate(legacy).purpose,'project-autonomy-validation');assert.throws(()=>validateExecutionTemplate({...legacy,args:[S.receipt]}),/无模型/);
});

test('durable and node run scope require this project/source and actual zero budget before any process starts',async()=>{
 const t=template(),r=claimed();validateCandidateValidationRun(t,r);
 const mutations=[(x:any)=>x.purpose=undefined,(x:any)=>x.kind='deploy',(x:any)=>x.machineId='other',(x:any)=>x.executorId='other',(x:any)=>x.projectId='other',(x:any)=>x.workspace=S.workspaceRoot+'/other',(x:any)=>x.maxRounds=2,(x:any)=>x.timeoutSec=4199,(x:any)=>x.budgetUSD=1,(x:any)=>x.sessionId='prior-model-session',(x:any)=>x.binding={},(x:any)=>x.skillSnapshots=[{}],(x:any)=>x.validation={program:'/other'}];
 for(const mutate of mutations){const x=structuredClone(r);mutate(x);assert.throws(()=>validateCandidateValidationRun(t,x));}
 assert.throws(()=>validateCandidateValidationRun(t,r,S.workspaceRoot));
 const result=await executeAgentRounds(t,{...r,budgetUSD:1},S.workspace,new AbortController().signal,()=>{throw Error('PROCESS_OR_LOG_MUST_NOT_START');},async()=>{throw Error('SUPERVISION_MUST_NOT_BE_NEEDED');});assert.equal(result.outcome,'failed');assert.equal(result.rounds,0);assert.match(result.summary,/候选复验运行/);
});

test('original no-model receipt is normalized to the identical central/restart zero usage and any nonzero or unknown attribution is rejected',async()=>{
 const {readFile}=await import('node:fs/promises'),body=await readFile(fileURLToPath(new URL('../../../scripts/factory-no-model-receipt-r26.mjs',import.meta.url)),'utf8');
 const {runInNewContext}=await import('node:vm');let stdout='';runInNewContext(body,{process:{stdout:{write:(s:string)=>{stdout+=s;}}}});
 const parsed=parseAgentOutput('fixed',stdout.trim().split('\n'));assert.deepEqual(candidateValidationReceiptUsage(parsed.usage),fixedValidationUsage());assert.deepEqual(candidateValidationReceiptUsage(fixedValidationUsage()),fixedValidationUsage());
 for(const patch of [{inputTokens:1},{outputTokens:1},{cacheReadTokens:1},{cacheWriteTokens:1},{totalTokens:1},{costUSD:.01},{knownCostUSD:.01},{usageComplete:false},{costComplete:false},{provider:'paid-model'},{model:'gpt-6.1-sol[1m]'},{ledgerRecorded:true}])assert.throws(()=>candidateValidationReceiptUsage({...parsed.usage,...patch}),/NONZERO_OR_INVALID/);
});

async function fixture(root:string){
 const store=new Store(join(root,'data')),repo=new V1Repository(store.databasePath),governance=new GovernanceRuntime(store),taskId=randomUUID(),preflights:any[]=[],allocations:any[]=[],observations:any[]=[];let stopped=false;
 governance.updatePolicy(0,{dailyLimitUSD:.01,perRunReserveUSD:1,maxConcurrent:1});
 const runtime=new ExecutionRuntime(repo,{directory:join(root,'execution'),machine:id=>repo.read('machines',id,'server-admin'),stopped:()=>stopped,supervised:()=>false,taskSupervised:()=>false,preflight:x=>{preflights.push(x);governance.preflight(x);},beforeExecution:x=>{allocations.push(x);return governance.reserveExecution(x);},afterExecution:x=>governance.releaseExecution(x),onUsage:x=>{observations.push(x);governance.executionUsage({...x.usage,actorId:'server-admin',runId:'execution_'+x.runId,usageId:'execution_'+x.runId,provider:x.usage.provider!,model:x.usage.model!,measuredAt:x.at});}});
 const handler:DomainHandler={domain:'projects',commands:['fixture'],execute:(_c,_p,ctx)=>{ctx.create('machines',{name:'isolated101',status:'unknown',readOnly:false},S.machineId);const p=ctx.create('projects',{name:'isolated factory',status:'active',copies:[{machineId:S.machineId,path:S.workspace,environment:'test'}]},S.projectId);ctx.create('tasks',{title:'R27 manual test',projectId:S.projectId,machineId:S.machineId,agent:S.id,worktree:S.workspace,mode:'managed',goal:'fixed tests',criteria:'independent evidence',status:'queued',budget:1,cost:7,retryLimit:0,retries:0,dependsOn:null,deadline:null,sessionId:null,artifacts:[],skillRefs:[]},taskId);return p;}};
 repo.execute(handler,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',runtime.options.machine);runtime.configure({templates:[template()]});const keys=generateKeyPairSync('ed25519'),paired=runtime.pair(runtime.issueTicket(S.machineId,[S.id]).ticket,keys.publicKey.export({type:'spki',format:'pem'}).toString()),agent={id:paired.agentId,machineId:S.machineId,capabilities:[S.id]};runtime.heartbeat(agent,{});
 const start=()=>runtime.dispatch('tasks','start',{commandId:randomUUID(),expectedVersion:repo.read('tasks',taskId,'server-admin')!.revision,scope:'personal',payload:{taskId}},'server-admin');
 const patchProject=(patch:any)=>{const p=repo.read('projects',S.projectId,'server-admin')!,h:DomainHandler={domain:'projects',commands:['fixture-patch'],execute:(_c,v,ctx)=>{ctx.check(ctx.require('projects',S.projectId));return ctx.update('projects',S.projectId,v);}};repo.execute(h,'fixture-patch',{commandId:randomUUID(),expectedVersion:p.revision,scope:'personal',payload:patch},'server-admin',runtime.options.machine);};
 return {store,repo,runtime,governance,taskId,agent,preflights,allocations,observations,start,patchProject,setStopped(v:boolean){stopped=v;},async close(){await runtime.close();governance.close();repo.close();store.close();}};
}

test('manual fixed candidate dispatch/claim really bypasses spending caps and reservations while conserving signed result/report/zero ledger and no automatic acceptance',()=>isolated(async root=>{
 const f=await fixture(root);try{assert.throws(()=>f.governance.preflight(),/预算/);await f.start();const run=f.runtime.claim(f.agent)!;assert.ok(run);assert.equal(run.purpose,S.purpose);assert.equal(run.budgetUSD,0);assert.equal(run.maxRounds,1);assert.equal(f.allocations[0].budgetUSD,0);assert.equal(f.allocations[0].recordOnly,true);assert.ok(f.preflights.every(v=>v.recordOnly===true));assert.equal(f.governance.summary().reservedUSD,0);
 const report=JSON.stringify({kind:'project-autonomy-validation',runId:run.id,workspace:S.workspace,status:'fail'}),body={deliveryId:randomUUID(),runId:run.id,leaseToken:run.leaseToken,outcome:'failed',exitCode:0,rounds:1,summary:'real fixed independent report failure',artifacts:[],usage:fixedValidationUsage(),validation:{exitCode:1,autonomyReportJson:report,autonomyReportSha256:sha(report)}};
 for(const usage of [{...fixedValidationUsage(),inputTokens:1},{...fixedValidationUsage(),costUSD:.01,knownCostUSD:.01},{...fixedValidationUsage(),provider:'fixed-test',model:'no-model'}])await assert.rejects(()=>f.runtime.result(f.agent.id,{...body,usage}),/无模型/);
 assert.equal(f.runtime.getRun(run.id)!.status,'running');const result=await f.runtime.result(f.agent.id,body);await f.runtime.result(f.agent.id,body);assert.equal(result.status,'failed');assert.equal(result.result.source,'signed-agent');assert.deepEqual(result.result.usage,fixedValidationUsage());assert.equal(result.result.validation.autonomyReportJson,report);assert.equal(f.observations.length,1);assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.cost,7);assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.acceptance,undefined);const ledger=f.governance.usagePage();assert.equal(ledger.items.length,1);assert.equal(ledger.summary.totalTokens,0);assert.equal(ledger.summary.estimatedUSD,0);assert.equal(ledger.summary.unpricedCalls,0);
 }finally{await f.close();}
}));

test('pause/concurrency/emergency/project/lease/source scope remain enforced, and the new purpose never auto-starts old supervision',()=>isolated(async root=>{
 const f=await fixture(root);try{f.governance.updatePolicy(1,{paused:true});await assert.rejects(f.start,/暂停/);f.governance.updatePolicy(2,{paused:false});f.governance.reserveExecution({runId:'isolated-other',actorId:'server-admin',executorId:'fixture',budgetUSD:0,recordOnly:true});await assert.rejects(f.start,/并发/);f.governance.releaseExecution({runId:'isolated-other',actorId:'server-admin',outcome:'failed'});
 f.setStopped(true);await assert.rejects(f.start,/急停/);f.setStopped(false);f.patchProject({status:'delivered'});await assert.rejects(f.start,/不能执行/);f.patchProject({status:'active'});
 f.runtime.options.supervised=()=>true;await (f.runtime as any).scheduleManaged();assert.equal(f.runtime.listRuns().length,0);f.runtime.options.supervised=()=>false;
 await f.start();const request=f.runtime.listRuns()[0],db=(f.runtime as any).db,row=JSON.parse(db.prepare('SELECT json FROM execution_runs WHERE id=?').get(request.id).json);db.prepare('UPDATE execution_runs SET json=? WHERE id=?').run(JSON.stringify({...row,workspace:S.workspaceRoot+'/other'}),request.id);assert.throws(()=>f.runtime.claim(f.agent),/候选复验运行/);db.prepare('UPDATE execution_runs SET json=? WHERE id=?').run(JSON.stringify(row),request.id);const run=f.runtime.claim(f.agent)!;await assert.rejects(()=>f.runtime.result(f.agent.id,{runId:run.id,leaseToken:'wrong',outcome:'failed',exitCode:1,rounds:1,summary:'isolated wrong lease'}),/租约/);assert.equal(f.runtime.getRun(run.id)!.status,'running');
 }finally{await f.close();}
}));

test('the old FA purpose retains its scoped authorization and zero usage; ordinary fixed templates receive no new cost exemption',()=>isolated(async root=>{
 const f=await fixture(root);try{const t=template(),legacy:ExecutionTemplate={...t,purpose:'project-autonomy-validation',program:'/usr/bin/true',args:[],validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}','FA-01','a'.repeat(64)],timeoutSec:3600}};f.runtime.configure({templates:[legacy]});await assert.rejects(f.start,/项目级授权/);f.runtime.options.taskSupervised=()=>true;await f.start();const run=f.runtime.claim(f.agent)!;assert.equal(run.purpose,'project-autonomy-validation');assert.equal(run.budgetUSD,0);const r=await f.runtime.result(f.agent.id,{runId:run.id,leaseToken:run.leaseToken,outcome:'failed',exitCode:1,rounds:1,summary:'legacy actual fixed observation'});assert.deepEqual(r.result.usage,fixedValidationUsage());
 }finally{await f.close();}
 const g=await fixture(root+'-ordinary');try{const t=template();delete t.purpose;g.runtime.configure({templates:[t]});await assert.rejects(g.start,/预算/);assert.equal(g.preflights[0].recordOnly,false);}finally{await g.close();await rm(root+'-ordinary',{recursive:true,force:true});}
}));

test('R27 restart produces zero-usage cancellation evidence only and never resumes a process or rewrites a completed receipt',()=>isolated(async root=>{
 const j=new AgentDeliveryJournal(join(root,'spool'),'isolated-agent',S.machineId);try{const r=claimed();j.register(r);j.started(r.id);j.checkpoint(r.id,{rounds:1,usage:fixedValidationUsage()});assert.equal(j.recoverInterrupted(),1);assert.equal(j.recoverInterrupted(),0);const d=j.next()!;assert.equal(d.body.outcome,'cancelled');assert.deepEqual(d.body.usage,fixedValidationUsage());assert.equal(d.body.stopReason.code,'NODE_PROCESS_RESTART');assert.throws(()=>j.started(r.id),/NOT_STARTABLE/);}finally{j.close();}
}));
