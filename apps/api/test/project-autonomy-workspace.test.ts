import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import Fastify from 'fastify';
import {ExecutionRuntime,canonicalExecution} from '../src/runtime/execution-runtime.js';
import {ExecutionAgent,checkedAgentWorkspace} from '../src/runtime/agent-runner.js';
import {registerExecutionRoutes} from '../src/runtime/execution-routes.js';
import {executionPathWithin} from '../src/runtime/execution-paths.js';
import {isProtectedAutonomyTemplate,protectedAutonomyExactWorkspace} from '../src/runtime/project-autonomy-workspace.js';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import type {ExecutionTemplate} from '../src/runtime/execution-types.js';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const protectedTemplate=(workspace:string):ExecutionTemplate=>({id:'protected-fixture',machineId:'fixture-node',engine:'fixed',purpose:'project-autonomy-validation',program:'/usr/bin/true',args:[],workspaceRoot:workspace,maxRounds:1,timeoutSec:10,leaseSec:30,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}','FA-01',sha('goal')],timeoutSec:5}});

test('the autonomy exception accepts only exact protected wrapper and allowed native/fixed engines',()=>{
 const t=protectedTemplate('/srv/candidates/factory');assert.equal(isProtectedAutonomyTemplate(t),true);
 for(const engine of ['claude','codex'] as const)assert.equal(isProtectedAutonomyTemplate({...t,engine,purpose:undefined}),true);
 for(const edit of ['program','count','sudo-option','wrapper','workspace','run','phase','goal','fixed-purpose','fixed-program','fixed-args','fixed-rounds','fixed-supervision','pi','ordinary-fixed','native-purpose']){
  const x=structuredClone(t);if(edit==='program')x.validation!.program='/usr/local/libexec/jarvis-project-autonomy-validation';if(edit==='count')x.validation!.args.push('extra');if(edit==='sudo-option')x.validation!.args[0]='-E';if(edit==='wrapper')x.validation!.args[1]='/tmp/fake-validator';if(edit==='workspace')x.validation!.args[2]='/srv/candidates/factory';if(edit==='run')x.validation!.args[3]='legacy-run';if(edit==='phase')x.validation!.args[4]='FA-10';if(edit==='goal')x.validation!.args[5]='bad-goal';if(edit==='fixed-purpose')delete x.purpose;if(edit==='fixed-program')x.program=process.execPath;if(edit==='fixed-args')x.args=['unexpected'];if(edit==='fixed-rounds')x.maxRounds=2;if(edit==='fixed-supervision')x.supervision={billing:'record-only',maxTokens:100,maxRecoveryAttempts:0,retryDelaySec:60,repairValidation:false,fallbackExecutorIds:[]};if(edit==='pi')x.engine='pi-sdk';if(edit==='ordinary-fixed'){delete x.purpose;x.program='/usr/bin/true';}if(edit==='native-purpose')x.engine='claude';assert.equal(isProtectedAutonomyTemplate(x),false,edit);
 }
 assert.equal(isProtectedAutonomyTemplate(undefined as any),false);
});

test('exact-root exception preserves strict children, path flavor, normalization and sibling boundaries',()=>{
 for(const [root,target,expected] of [['/srv/candidates/factory','/srv/candidates/factory',true],['/srv/candidates/factory','/srv/candidates/factory/',true],['/srv/candidates/factory','/srv/candidates/other/../factory',true],['/srv/candidates/factory','/srv/candidates/factory/child',false],['/srv/candidates/factory','/srv/candidates/factory-sibling',false],['/srv/candidates/factory','/srv/candidates',false],['/srv/candidates/factory','srv/candidates/factory',false],['C:\\Candidates\\Factory','c:/candidates/factory',true],['C:\\Candidates\\Factory','C:\\Candidates\\Factory\\child',false],['C:\\Candidates\\Factory','D:\\Candidates\\Factory',false],['C:\\Candidates\\Factory','/Candidates/Factory',false],['/srv/candidates/factory','C:\\srv\\candidates\\factory',false],['candidate','candidate',false]] as const){assert.equal(protectedAutonomyExactWorkspace(protectedTemplate(root),target),expected,root+' -> '+target);}
 assert.equal(executionPathWithin('/srv/candidates/factory','/srv/candidates/factory'),false);assert.equal(executionPathWithin('/srv/candidates/factory','/srv/candidates/factory/child'),true);assert.equal(executionPathWithin('/srv/candidates/factory','/srv/candidates/factory-sibling'),false);
});

async function fixture(options:{native?:boolean;child?:boolean;authorized?:boolean;global?:boolean;ordinary?:boolean;production?:boolean}={}){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-autonomy-workspace-')),workspace=join(directory,'candidate'),child=join(workspace,'child');await mkdir(child,{recursive:true});
 const store=new Store(join(directory,'data')),repo=new V1Repository(store.databasePath),taskId=randomUUID(),projectId=randomUUID(),target=options.child?child:workspace;
 let authorized=options.authorized??true,stopped=false;
 const t=protectedTemplate(workspace);if(options.native){t.engine='claude';delete t.purpose;t.program=process.execPath;t.args=['--print','{prompt}','--output-format','stream-json','--max-budget-usd','{maxBudgetUSD}'];t.maxRounds=2;}if(options.ordinary){delete t.purpose;t.engine='fixed';t.program=process.execPath;t.args=['-e','process.exit(0)'];t.validation={program:process.execPath,args:['-e','process.exit(0)'],timeoutSec:5};}
 const runtime=new ExecutionRuntime(repo,{directory:join(directory,'execution'),machine:()=>({id:'fixture-node',status:'online'}),stopped:()=>stopped,supervised:()=>options.global??false,taskSupervised:id=>authorized&&id===taskId});
 repo.execute({domain:'projects',commands:['fixture'],execute:(_c,_p,ctx)=>{const p=ctx.create('projects',{name:'Isolated workspace fixture',status:'active',copies:[{machineId:'fixture-node',path:target,environment:options.production?'production':'test'}]},projectId);ctx.create('tasks',{title:'Workspace fixture',projectId,machineId:'fixture-node',agent:t.id,mode:'managed',goal:'Isolated fixture only',criteria:'Independent review required',status:'queued',budget:1,cost:0,retryLimit:0,retries:0,dependsOn:null,deadline:null,sessionId:null,artifacts:[],acceptance:null,skillRefs:[]},taskId);return p;}},'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',runtime.options.machine);
 runtime.configure({templates:[t]});
 const app=Fastify({logger:false});app.setErrorHandler((e:any,_req,reply)=>reply.code(e.status??e.statusCode??400).send({code:e.code??'VALIDATION',message:e.message}));registerExecutionRoutes(app,runtime,()=>true);await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address==='object');
 const agent=new ExecutionAgent({apiUrl:`http://127.0.0.1:${address.port}`,machineId:'fixture-node',pairingTicket:runtime.issueTicket('fixture-node',[t.id]).ticket,workspaceRoots:[workspace],templates:[t]});await agent.pair();await agent.heartbeat();
 const envelope=()=>({commandId:randomUUID(),expectedVersion:repo.read('tasks',taskId,'server-admin')!.revision,scope:'personal' as const,payload:{taskId}});
 return {directory,workspace,target,template:t,taskId,repo,runtime,agent,envelope,authorize(value:boolean){authorized=value},stop(){stopped=true},async close(){await agent.stop();await app.close();await runtime.close();repo.close();store.close();const safe=resolve(directory);assert.ok(safe.startsWith(resolve(tmpdir())+sep)&&safe.includes('jarvis-autonomy-workspace-'));await rm(safe,{recursive:true,force:true});}};
}

test('central exact-root dispatch requires current task authority; global supervision and generic validation never grant it',async()=>{
 for(const options of [{native:true,authorized:true},{native:true,authorized:false,global:true},{native:true,authorized:false,global:false},{ordinary:true,authorized:true},{production:true,authorized:true}]){
  const f=await fixture(options);try{if(options.native&&options.authorized)assert.ok((await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin'))!.data.executionRequest);else await assert.rejects(()=>f.runtime.dispatch('tasks','start',f.envelope(),'server-admin'),/独立子目录|非生产项目副本/);}finally{await f.close();}
 }
 const f=await fixture({ordinary:true,child:true,authorized:false,global:false});try{assert.ok((await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin'))!.data.executionRequest);}finally{await f.close();}
});

test('queued exact-root native claims lose authorization and active leases are cancelled when scoped authority is revoked',async()=>{
 const f=await fixture({native:true,global:true});try{await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin');f.authorize(false);await assert.rejects(()=>f.agent.claim(),/AGENT_HTTP_403/);assert.equal(f.runtime.listRuns()[0].status,'queued');f.authorize(true);const run=(await f.agent.claim())!;assert.equal(run.workspace,f.workspace);f.authorize(false);const heartbeat=f.runtime.heartbeat({id:f.agent.config.agentId!,machineId:'fixture-node',capabilities:[f.template.id]},{leases:[{runId:run.id,leaseToken:run.leaseToken}]});assert.deepEqual(heartbeat.stopRunIds,[run.id]);assert.deepEqual(heartbeat.supervisedRunIds,[]);assert.equal(f.runtime.getRun(run.id)!.status,'cancelled');assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.acceptance,null);}finally{await f.close();}
});

for(const action of ['pause','cancel'] as const)test(`${action} of an exact-root task never grants another claim or acceptance`,async()=>{
 const f=await fixture({native:true});try{await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin');await f.runtime.dispatch('tasks',action,{...f.envelope(),payload:{taskId:f.taskId,reason:'Local controlled stop fixture'}},'server-admin');f.authorize(false);assert.equal(await f.agent.claim(),null);assert.equal(f.runtime.listRuns()[0].status,'cancelled');assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.acceptance,null);}finally{await f.close();}
});

test('node exact-root execution signs a strict not-started receipt for missing or mismatched frozen template hash',async()=>{
 for(const hash of [undefined,sha('wrong-template')]){const f=await fixture();try{await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin');const claim=(await f.agent.claim())!;if(hash)f.agent.config.templates[0]={...f.agent.config.templates[0],timeoutSec:f.agent.config.templates[0].timeoutSec+1};else claim.templateHash=undefined;let result:any;try{result=await f.agent.execute(claim)}catch(error){console.error('NOT_STARTED_FIXTURE_REJECTION',String(error));throw error}assert.equal(result.status,'failed');const saved=f.runtime.getRun(claim.id)!.result;assert.equal(saved.outcome,'failed');assert.equal(saved.failureKind,'permission');assert.deepEqual(saved.usage,{measurementStatus:'unknown',usageComplete:false,costComplete:false});assert.equal(saved.notStarted.reason,hash?'template-hash-mismatch':'template-hash-missing');assert.equal(saved.notStarted.expectedTemplateHash,sha(canonicalExecution(f.template)));assert.equal(saved.notStarted.receivedTemplateHash,hash?sha(canonicalExecution({...f.template,timeoutSec:f.template.timeoutSec+1})):undefined);assert.equal(saved.executionMetadata,undefined);assert.equal(saved.sessionId,undefined);assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.acceptance,null);assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.executionResult.recovery,undefined);assert.equal(f.runtime.getRun(claim.id)!.status,'failed');}finally{await f.close();}}
});

test('ordinary development and deploy claims still reject any changed frozen template hash',async()=>{
 const f=await fixture({ordinary:true,child:true});try{await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin');const run=(await f.agent.claim())!;run.templateHash=sha('stale-template');await assert.rejects(()=>f.agent.execute(run),/AGENT_TEMPLATE_MISMATCH/);assert.equal(f.runtime.getRun(run.id)!.status,'running');assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.acceptance,null);}finally{await f.close();}
});

test('signed exact-root fixed claim reaches controlled local processes only with exact template hash; no model is called',async t=>{
 const f=await fixture(),validator=join(f.directory,'validator.cjs');
 const spawn=childProcess.spawn,stat=fsPromises.stat;
 t.mock.method(fsPromises,'stat',((path:any,...args:any[])=>stat(path==='/usr/bin/sudo'||path==='/usr/bin/true'?process.execPath:path,...args as [])) as any);
 t.mock.method(childProcess,'spawn',((program:string,args:string[],options:any)=>{const child=spawn(program,args,options);if(child.stdin&&args[0]?.endsWith('agent-supervisor.ts')){const end=child.stdin.end.bind(child.stdin);child.stdin.end=((body:any,...rest:any[])=>{const input=JSON.parse(String(body));if(input.program==='/usr/bin/sudo'){input.program=process.execPath;input.args=[validator];}else if(input.program==='/usr/bin/true'){input.program=process.execPath;input.args=['-e','process.exit(0)'];}return end(JSON.stringify(input),...rest as []);}) as any;}return child;}) as any);syncBuiltinESMExports();
 try{await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin');const run=(await f.agent.claim())!;assert.equal(run.templateHash,sha(canonicalExecution(f.agent.config.templates[0])));const report={schemaVersion:1,kind:'project-autonomy-validation',status:'pass',simulated:false,runId:run.id,workspace:f.workspace,goalSpecHash:sha('goal'),workPackage:'FA-01',sourceFingerprint:sha('fixture-source'),sourceStable:true,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),checks:[],artifacts:[]};await writeFile(validator,`require('node:fs').writeFileSync('fixed-ran.txt','isolated fixture');console.log(${JSON.stringify(JSON.stringify(report))});`);const result=await f.agent.execute(run);assert.equal(result.status,'succeeded');assert.equal(await readFile(join(f.workspace,'fixed-ran.txt'),'utf8'),'isolated fixture');assert.equal(f.runtime.getRun(run.id)!.result.usage.totalTokens,0);assert.equal(f.repo.read('tasks',f.taskId,'server-admin')!.acceptance,null);}finally{t.mock.restoreAll();syncBuiltinESMExports();await f.close();}
});

test('exact-root permission retains physical symlink checks and does not include siblings',async()=>{
 const f=await fixture();try{assert.equal(await checkedAgentWorkspace(f.workspace,[f.workspace],true),f.workspace);await assert.rejects(()=>checkedAgentWorkspace(f.directory,[f.workspace],true),/WORKSPACE_OUTSIDE_ALLOWLIST/);await assert.rejects(()=>checkedAgentWorkspace(f.workspace,[f.workspace]),/WORKSPACE_OUTSIDE_ALLOWLIST/);const linked=join(f.directory,'candidate-link');await fsPromises.symlink(f.workspace,linked,'junction');await assert.rejects(()=>checkedAgentWorkspace(linked,[f.workspace],true),/WORKSPACE_LINK_NOT_ALLOWED/);}finally{await f.close();}
});


test('central heartbeat returns only actual persisted renewed lease expiries and excludes invalid/revoked claims',async()=>{
 const f=await fixture({native:true});try{await f.runtime.dispatch('tasks','start',f.envelope(),'server-admin');const run=(await f.agent.claim())!,who={id:f.agent.config.agentId,machineId:'fixture-node',capabilities:[f.template.id]};const valid=f.runtime.heartbeat(who,{leases:[{runId:run.id,leaseToken:run.leaseToken}]});assert.deepEqual(valid.renewedLeases,[{runId:run.id,leaseExpiresAt:f.runtime.getRun(run.id).leaseExpiresAt}]);assert.deepEqual(valid.stopRunIds,[]);const invalid=f.runtime.heartbeat(who,{leases:[{runId:run.id,leaseToken:'invalid-fixture-lease'}]});assert.deepEqual(invalid.renewedLeases,[]);assert.deepEqual(invalid.stopRunIds,[run.id]);f.authorize(false);const revoked=f.runtime.heartbeat(who,{leases:[{runId:run.id,leaseToken:run.leaseToken}]});assert.deepEqual(revoked.renewedLeases,[]);assert.deepEqual(revoked.stopRunIds,[run.id]);assert.equal(f.runtime.getRun(run.id).status,'cancelled');}finally{await f.close();}
});
