import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import type {AssistantMessage} from '@earendil-works/pi-ai';
import {Store} from '../src/store.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';
import {PiDevelopmentService,PiDevelopmentFailure} from '../src/runtime/pi-development.js';
import type {PiService} from '../src/pi.js';

test('actual native Pi SDK tools write a temporary project, reject credential/escape paths and preserve independent usage',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-pi-development-')),workspace=join(directory,'project'),data=join(directory,'data');await mkdir(workspace);await mkdir(data);
 const store=new Store(data),governance=new GovernanceRuntime(store);const originalFetch=globalThis.fetch;let requests=0,calls=0;
 globalThis.fetch=async()=>{requests++;throw Error('Network disabled for native SDK fixture');};
 const runtime=await ModelRuntime.create({authPath:join(directory,'fixture-auth.json'),modelsPath:null,refreshOnCreate:false});
 const actions=[{name:'project_read',arguments:{path:'.env'}},{name:'project_write',arguments:{path:'../escape.txt',content:'escape'}},{name:'project_write',arguments:{path:'nested/result.txt',content:'first'}},{name:'project_edit',arguments:{path:'nested/result.txt',oldText:'first',newText:'verified fixture'}}];
 runtime.registerProvider('isolated-sdk-fixture',{baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only-key',api:'isolated-sdk-fixture',models:[{id:'fixture',name:'offline fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:16000,maxTokens:1000}],streamSimple:()=>{
  const stream=createAssistantMessageEventStream(),action=actions[calls++],message:AssistantMessage={role:'assistant',api:'isolated-sdk-fixture',provider:'isolated-sdk-fixture',model:'fixture',content:action?[{type:'toolCall',id:'tool_'+calls,...action}]:[{type:'text',text:'临时项目已修改；等待独立验收。'}],stopReason:action?'toolUse':'stop',timestamp:Date.now(),usage:{input:10,output:5,cacheRead:0,cacheWrite:0,totalTokens:15,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};queueMicrotask(()=>{stream.push({type:'start',partial:message});stream.push({type:'done',reason:action?'toolUse':'stop',message});stream.end();});return stream;
 }});
 const model=runtime.getModel('isolated-sdk-fixture','fixture')!;assert(model);
 const pi={developmentContext:async()=>({modelRuntime:runtime,model,agentDir:join(directory,'agent')})}as unknown as PiService;
 const service=new PiDevelopmentService(pi,governance,data);
 try{
  await writeFile(join(workspace,'.env'),'PRIVATE_FIXTURE_CREDENTIAL');const logs:string[]=[];
  const result=await service.run({workspace,actorId:'server-admin',runId:'sdk_fixture',prompt:'验证项目工具边界',signal:new AbortController().signal,onLog:t=>logs.push(t),maxBudgetUSD:1,timeoutSec:15});
  assert.equal(await readFile(join(workspace,'nested/result.txt'),'utf8'),'verified fixture');await assert.rejects(access(join(directory,'escape.txt')));assert.deepEqual(result.artifacts,[join('nested','result.txt')]);
  assert.equal(result.usage?.ledgerRecorded,true);assert.equal(result.usage?.inputTokens,50);assert.equal(governance.summary().totalTokens,75);assert.equal(governance.summary().active,0);assert.equal(governance.summary().invoicesConnected,false);assert.equal(requests,0);assert.equal(logs.join('').includes('PRIVATE_FIXTURE_CREDENTIAL'),false);
  const transcript=await readFile(result.sessionId!,'utf8');assert.match(transcript,/FORBIDDEN|文件必须位于项目目录/);assert(!transcript.includes('PRIVATE_FIXTURE_CREDENTIAL'));
  const other=join(directory,'other');await mkdir(other);await assert.rejects(service.run({workspace:other,actorId:'server-admin',runId:'cross_project',prompt:'不能读取旧项目',signal:new AbortController().signal,onLog:()=>{},sessionId:result.sessionId,maxBudgetUSD:1,timeoutSec:15}));assert.equal(governance.summary().active,0);
 }finally{globalThis.fetch=originalFetch;governance.close();store.close();await rm(directory,{recursive:true,force:true});}
});

test('native SDK failure preserves already charged usage and releases its reservation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-pi-partial-')),workspace=join(directory,'project'),data=join(directory,'data');await mkdir(workspace);await mkdir(data);
 const store=new Store(data),governance=new GovernanceRuntime(store);const originalFetch=globalThis.fetch;let calls=0,requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('Network disabled for partial SDK fixture');};
 const runtime=await ModelRuntime.create({authPath:join(directory,'fixture-auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('isolated-partial-fixture',{baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only',api:'isolated-partial-fixture',models:[{id:'fixture',name:'offline fixture',reasoning:false,input:['text'],cost:{input:1,output:1,cacheRead:0,cacheWrite:0},contextWindow:16000,maxTokens:1000}],streamSimple:()=>{
  const stream=createAssistantMessageEventStream(),first=calls++===0,message:AssistantMessage={role:'assistant',api:'isolated-partial-fixture',provider:'isolated-partial-fixture',model:'fixture',content:first?[{type:'toolCall',id:'partial_write',name:'project_write',arguments:{path:'partial.txt',content:'actual partial artifact'}}]:[],stopReason:first?'toolUse':'error',errorMessage:first?undefined:'fixture failure after charged output',timestamp:Date.now(),usage:{input:first?10:0,output:first?5:0,cacheRead:0,cacheWrite:0,totalTokens:first?15:0,cost:{input:first?.01:0,output:0,cacheRead:0,cacheWrite:0,total:first?.01:0}}};
  queueMicrotask(()=>{stream.push({type:'start',partial:message});if(first)stream.push({type:'done',reason:'toolUse',message});else stream.push({type:'error',reason:'error',error:message});stream.end();});return stream;
 }});
 const pi={developmentContext:async()=>({modelRuntime:runtime,model:runtime.getModel('isolated-partial-fixture','fixture')!,agentDir:join(directory,'agent')})}as unknown as PiService;
 try{
  await assert.rejects(new PiDevelopmentService(pi,governance,data).run({workspace,actorId:'server-admin',runId:'sdk_partial',prompt:'fixture',signal:new AbortController().signal,onLog:()=>{},maxBudgetUSD:1,timeoutSec:15}),(error:unknown)=>{
   assert(error instanceof PiDevelopmentFailure);assert.equal(error.partialUsage.ledgerRecorded,true);assert.equal(error.partialUsage.inputTokens,10);assert.equal(error.partialUsage.outputTokens,5);assert.equal(error.partialUsage.costUSD,.01);return true;
  });
  assert.equal(await readFile(join(workspace,'partial.txt'),'utf8'),'actual partial artifact');assert.equal(governance.summary().totalTokens,15);assert.equal(governance.summary().active,0);assert.equal(requests,0);
 }finally{globalThis.fetch=originalFetch;governance.close();store.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
