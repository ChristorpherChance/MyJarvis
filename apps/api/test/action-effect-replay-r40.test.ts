import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {registerV1} from '../src/v1/routes.js';
import type {DomainHandler,CommandEnvelope} from '../src/v1/types.js';
import {ExecutionRuntime} from '../src/runtime/execution-runtime.js';
import {KnowledgeRuntime} from '../src/runtime/knowledge-runtime.js';

const actor='server-admin';
const envelope=(payload:Record<string,unknown>,expectedVersion=0):CommandEnvelope=>({commandId:randomUUID(),expectedVersion,scope:'personal',payload});
async function fixture(root:string,allowedHttpOrigins:string[]=[]){
 const store=new Store(join(root,'data')),repo=new V1Repository(store.databasePath);if(!store.hasAccount())store.setPassword('synthetic-r40-isolated-password');
 const machine=(id:string)=>repo.read('machines',id,actor),execution=new ExecutionRuntime(repo,{directory:join(root,'execution'),machine,stopped:()=>false});
 const pi={health:()=>({configured:false}),abort:async()=>{},run:async()=>{throw Error('MODEL_MUST_NOT_RUN');}};
 const knowledge=new KnowledgeRuntime(repo,pi as any,{uploadsDirectory:join(root,'uploads'),workDirectory:join(root,'ocr'),pythonExecutable:'unused',allowedHttpOrigins});
 const app=Fastify({logger:false});await app.register(cookie);
 app.addHook('onRequest',async(req,reply)=>{if(!store.validateLogin(req.cookies.jarvis_session??''))return reply.code(401).send({code:'FORBIDDEN'});});
 app.setErrorHandler((e:any,_req,reply)=>reply.code(e.status??500).send({code:e.code??'ISOLATED_FAILURE',message:e.message}));
 registerV1(app,store,pi as any,{repository:repo,dispatchers:[knowledge,execution],sanitizeRead:(d,r,a)=>knowledge.sanitizeRead(d,r,a)});
 const token=store.createLogin(),headers={cookie:'jarvis_session='+token};
 await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert(address&&typeof address==='object');
 const url='http://127.0.0.1:'+address.port;
 const post=async(path:string,payload:unknown)=>{const r=await fetch(url+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,body:await r.json() as any};};
 const get=async(path:string)=>{const r=await fetch(url+path,{headers});return {status:r.status,body:await r.json() as any};};
 return {store,repo,execution,knowledge,app,post,get,async close(){await knowledge.close();await execution.close();await app.close();store.close();}};
}
async function owned(){const path=await mkdtemp(join(tmpdir(),'jarvis-r40-effects-'));return {path,async remove(){const absolute=resolve(path);assert(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-r40-effects-'));await rm(absolute,{recursive:true,force:true});}};}

test('R40 direct deployment replays the exact public command after restart without a second run',async()=>{
 const temp=await owned();let f:Awaited<ReturnType<typeof fixture>>|undefined;
 try{
  f=await fixture(temp.path);const machineId=randomUUID(),projectId=randomUUID(),serviceId=randomUUID(),deploymentId=randomUUID(),approvalId=randomUUID(),backupId=randomUUID(),releaseId=randomUUID();
  const root=join(temp.path,'workspace'),workspace=join(root,'app');await mkdir(workspace,{recursive:true});
  const seed:DomainHandler={domain:'operations',commands:['fixture'],execute:(_c,_p,ctx)=>{
   const meta=(kind:string)=>({kind,status:'registered',source:'manual',verification:'unverified_external',executionDispatched:false,createdAt:ctx.now,updatedAt:ctx.now});
   ctx.create('machines',{...meta('machine'),name:'synthetic remote node',readOnly:false,ram:64},machineId);
   ctx.create('projects',{name:'synthetic project',status:'active',copies:[{machineId,path:workspace,environment:'production'}]},projectId);
   ctx.create('services',{...meta('service'),name:'synthetic service',machineId,projectId,environment:'production',version:'1.0'},serviceId);
   ctx.create('releases',{projectId,version:'2.0'},releaseId);ctx.create('operations',{...meta('backup'),machineId,locator:'synthetic-fixed-backup',checksum:'sha256:'+'a'.repeat(64)},backupId);
   ctx.create('approvals',{...meta('deployment'),deploymentId,backupId,status:'approved',decision:{choice:'approve',reason:'synthetic fixed approval',actorId:actor,at:ctx.now,authorizedDeploymentId:deploymentId,executionDispatched:false}},approvalId);
   return ctx.create('operations',{...meta('deployment'),status:'approved',serviceId,releaseId,backupId,approvalId,machineId,projectId,environment:'production',version:'2.0',previousVersion:'1.0'},deploymentId);
  }};
  // Seed only synthetic records; no execution program or agent process is started.
  f.repo.setReceiptValidator(()=>{});f.repo.execute(seed,'fixture',envelope({}),actor,()=>undefined);
  f.execution.configure({templates:[{id:'deploy:'+serviceId,machineId,engine:'fixed',program:process.execPath,args:['--version'],workspaceRoot:root,maxRounds:1,timeoutSec:10,leaseSec:10,budgetCurrency:'USD',validation:{program:process.execPath,args:['--version'],timeoutSec:10}}]});
  const keys=generateKeyPairSync('ed25519'),agent=f.execution.pair(f.execution.issueTicket(machineId,['deploy:'+serviceId]).ticket,keys.publicKey.export({format:'pem',type:'spki'}).toString());
  f.execution.heartbeat({id:agent.agentId,machineId,capabilities:agent.capabilities},{metrics:{}});
  const command=envelope({deploymentId},1),path='/api/v1/services/commands/execute';
  const first=await f.post(path,command);assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(f.execution.listRuns().length,1);const runId=f.execution.listRuns()[0].id;
  assert.equal(f.repo.read('operations',deploymentId,actor)!.status,'execution-queued');
  assert(f.repo.replay('services','execute',command,actor));
  await f.close();f=await fixture(temp.path);
  const recovered=await f.post(path,command);assert.equal(recovered.status,200,JSON.stringify(recovered.body));assert.equal(recovered.body.data.id,deploymentId);
  assert.equal(f.execution.listRuns().length,1);assert.equal(f.execution.listRuns()[0].id,runId);assert.equal(f.execution.listRuns()[0].status,'queued');
  const read=await f.get('/api/v1/approvals/'+approvalId);assert.equal(read.status,200);assert.equal(read.body.data.revision,1);
  const replay=await f.post(path,command);assert.equal(replay.status,200);assert.deepEqual(replay.body,recovered.body);
  const changed=await f.post(path,{...command,payload:{deploymentId:randomUUID()}});assert.equal(changed.status,409);assert.equal(f.execution.listRuns().length,1);
  assert.equal(Object.hasOwn(f.execution.listRuns()[0],'result'),false); // Dispatch is not execution or acceptance.
 }finally{await f?.close();await temp.remove();}
});

test('R40 committed live query replays before connector IO and still filters current revoked access',async()=>{
 const temp=await owned();let calls=0;const upstream=createServer((_req,res)=>{calls++;res.setHeader('content-type','text/plain');res.end('Synthetic replayable source text');});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));const addr=upstream.address();assert(addr&&typeof addr==='object');const origin='http://127.0.0.1:'+addr.port;
 let f:Awaited<ReturnType<typeof fixture>>|undefined;
 try{
  f=await fixture(temp.path,[origin]);const saved=await f.post('/api/v1/knowledge/sources/commands/save',envelope({name:'Synthetic source',type:'http-text',mode:'live',endpoint:origin+'/text',topics:'replay',rights:'synthetic public test content',authorized:true}));
  assert.equal(saved.status,200,JSON.stringify(saved.body));const source=saved.body.data;
  const command=envelope({query:'replayable',mode:'live'}),path='/api/v1/knowledge/sources/commands/query';
  const first=await f.post(path,command);assert.equal(first.status,200);assert.equal(first.body.data.results.length,1);assert.equal(calls,1);
  upstream.closeAllConnections();await new Promise<void>((r,j)=>upstream.close(e=>e?j(e):r()));
  const replay=await f.post(path,command);assert.equal(replay.status,200,JSON.stringify(replay.body));assert.deepEqual(replay.body,first.body);assert.equal(calls,1);
  const changed=await f.post(path,{...command,payload:{query:'changed',mode:'live'}});assert.equal(changed.status,409);assert.equal(calls,1);
  const revoked=await f.post('/api/v1/knowledge/sources/commands/authorize',envelope({sourceId:source.id,authorized:false,reason:'synthetic access revoked'},source.revision));assert.equal(revoked.status,200);
  const filtered=await f.post(path,command);assert.equal(filtered.status,200);assert.equal(filtered.body.data.id,first.body.data.id);assert.deepEqual(filtered.body.data.results,[]);
  const read=await f.get('/api/v1/knowledge/sources/'+first.body.data.id);assert.equal(read.status,200);assert.deepEqual(read.body.data.results,[]);assert.equal(calls,1);
 }finally{if(upstream.listening){upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));}await f?.close();await temp.remove();}
});
