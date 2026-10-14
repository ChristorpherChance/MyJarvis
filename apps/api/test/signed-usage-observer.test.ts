import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Fastify from 'fastify';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {ExecutionRuntime,signedExecutionText} from '../src/runtime/execution-runtime.js';
import {registerExecutionRoutes,isExecutionProtocolPath} from '../src/runtime/execution-routes.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';

test('signed usage binds the real node and project, rejects telemetry-only/replays and reconciles controlled observations without losing or duplicating tokens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-signed-usage-')),store=new Store(dir),repo=new V1Repository(store.databasePath),ledger=new GovernanceRuntime(store),machine=(id:string)=>['node-101','other-node'].includes(id)?{id,scope:'personal'}:undefined;
 const runtime=new ExecutionRuntime(repo,{directory:join(dir,'execution'),machine,stopped:()=>false,onExternalUsage:u=>ledger.importUsage(u)}),app=Fastify();app.setErrorHandler((error:any,_req,reply)=>reply.code(error.status??400).send({error:error.code??'fixture'}));registerExecutionRoutes(app,runtime);
 const project=repo.execute({domain:'projects',commands:['fixture'],execute:(_c,_p,ctx)=>ctx.create('projects',{name:'msf',copies:[{machineId:'node-101',environment:'development',path:join(dir,'msf')}]})},'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},'server-admin',machine).data;
 runtime.configure({templates:[{id:'claude-msf',machineId:'node-101',engine:'claude',program:process.execPath,args:['--print','{prompt}','--output-format','stream-json','--max-budget-usd','{maxBudgetUSD}'],workspaceRoot:dir,maxRounds:2,timeoutSec:30,leaseSec:60,budgetCurrency:'USD'}]});
 const makeAgent=(caps:string[])=>{const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString(),paired=runtime.pair(runtime.issueTicket('node-101',caps).ticket,publicKey);return {id:paired.agentId,privateKey:keys.privateKey};},authorized=makeAgent(['claude-msf']),telemetry=makeAgent(['telemetry']);
 const item={source:'external-cli',sourceRecordId:'cli:claude:session:message',sessionId:'session',provider:'claude-cli',model:'observed',measuredAt:'2026-01-01T12:00:00Z',projectId:project.id,machineId:'node-101',inputTokens:12,outputTokens:3,cacheReadTokens:2,totalTokens:15};
 const request=(agent:ReturnType<typeof makeAgent>,body:any,nonce=randomUUID())=>{const path='/api/v1/agents/'+agent.id+'/usage',timestamp=new Date().toISOString(),headers={'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':sign(null,Buffer.from(signedExecutionText('POST',path,timestamp,nonce,body)),agent.privateKey).toString('base64url')};return {method:'POST' as const,url:path,headers,payload:body};};
 try{
  assert.equal(isExecutionProtocolPath('POST','/api/v1/agents/'+authorized.id+'/usage'),true);
  assert.equal((await app.inject(request(telemetry,{items:[item]}))).statusCode,403);
  assert.equal((await app.inject(request(authorized,{items:[{...item,machineId:'other-node'}]}))).statusCode,403);
  assert.equal((await app.inject(request(authorized,{items:[{...item,projectId:'unregistered'}]}))).statusCode,403);
  const req=request(authorized,{items:[{...item,controlledRunId:'invented-run'}]});assert.equal((await app.inject(req)).statusCode,200);assert.equal((await app.inject(req)).statusCode,403);
  assert.equal(ledger.usageSummary().totals.totalTokens,15);assert.equal(ledger.usagePage().items[0].run_id.startsWith('source_'),true,'node-supplied control run must not suppress a real receipt');
  const changed=await app.inject(request(authorized,{items:[{...item,inputTokens:50,totalTokens:53}]}));assert.equal(changed.statusCode,409);assert.equal(ledger.usageSummary().totals.totalTokens,15);
  assert.equal((await app.inject(request(authorized,{items:Array.from({length:101},()=>item)}))).statusCode,400);
 }finally{await app.close();await runtime.close();ledger.close();repo.close();store.close();await rm(dir,{recursive:true,force:true});}
});
