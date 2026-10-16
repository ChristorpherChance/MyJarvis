import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {request} from 'node:http';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {IdentityRuntime,type RuntimePrincipal} from '../src/runtime/identity.js';
import {NotificationRuntime,registerNotificationRoutes} from '../src/runtime/notifications.js';
import {SupervisionWorkRuntime} from '../src/runtime/supervision-work-runtime.js';
import {registerSupervisionWorkRoutes} from '../src/runtime/supervision-work-routes.js';
import type {Domain,DomainHandler} from '../src/v1/types.js';

const admin={actorId:'server-admin',profileId:'me',administrator:true} as RuntimePrincipal;
const body=(extra:any={})=>({title:'合成监督事项',status:'planned',summary:'等待实际执行',commandId:randomUUID(),expectedVersion:0,...extra});
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-supervision-work-')),store=new Store(directory),repository=new V1Repository(store.databasePath);store.setPassword('isolated-supervision-password');const token=store.createLogin(),adminCookie='jarvis_session='+token,profiles=new Map<string,any>([['me',{id:'me',name:'管理者'}],['a',{id:'a',name:'合成成员'}]]),identity=new IdentityRuntime(store,{memberExists:id=>profiles.has(id),memberProfile:id=>profiles.get(id)});identity.setCredential('a','123456','pin');const member=identity.login('a','123456','fixture');
 const seed=(domain:Domain,id:string,value:any,actor=admin.actorId)=>{const handler:DomainHandler={domain,commands:['fixture'],execute:(_c,_p,c)=>c.create(domain,value,id)};return repository.execute(handler,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{}},actor,()=>undefined).data;};seed('projects','p',{title:'合成项目',status:'active'});seed('projects','other',{title:'另一项目',status:'active'});seed('projects','foreign',{title:'其他所有者项目',status:'active'},'foreign-owner');seed('tasks','t',{projectId:'p',title:'合成真实任务',status:'queued',executionStatus:'queued'});
 const patchTask=(patch:any,type='execution-result')=>{const task=repository.read('tasks','t',admin.actorId)!,handler:DomainHandler={domain:'tasks',commands:['fixture-update'],execute:(_c,_p,c)=>{const updated=c.update('tasks','t',patch);c.emit('tasks','t',type,{revision:updated.revision});return updated;}};return repository.execute(handler,'fixture-update',{commandId:randomUUID(),expectedVersion:task.revision,scope:'personal',payload:{}},admin.actorId,()=>undefined);};
 const notifications=new NotificationRuntime(store.databasePath,{identity,repository}),runs=new Map<string,any>(),options={directory:join(directory,'work'),identity,notifications,plans:{get:()=>({steps:[{id:'current-step'}]})}};let runtime=new SupervisionWorkRuntime(repository,{getRun:id=>runs.get(id)},options);
 const app=Fastify();await app.register(cookie);registerSupervisionWorkRoutes(app,runtime,identity);registerNotificationRoutes(app,notifications);await app.ready();
 return {directory,store,repository,identity,notifications,app,token,adminCookie,member,profiles,runs,patchTask,get runtime(){return runtime;},restart(){runtime.close();runtime=new SupervisionWorkRuntime(repository,{getRun:id=>runs.get(id)},options);runtime.start();},async close(){await app.close();runtime.close();await notifications.close();repository.close();identity.close();store.close();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-supervision-work-'));await rm(target,{recursive:true,force:true});}};
}

test('append-only work history persists CAS/idempotency, no-op updates and completed brief without accepting product objectives',async()=>{
 const f=await fixture();try{const input=body(),first=f.runtime.create('p',input,admin);assert.deepEqual(f.runtime.create('p',input,admin),first);assert.throws(()=>f.runtime.create('p',{...input,title:'另一个内容'},admin),/提交编号/);assert.throws(()=>f.runtime.revise('p',first.id,body({expectedVersion:1,status:'completed'}),admin),/完成简报/);
  const completed=f.runtime.revise('p',first.id,body({expectedVersion:1,status:'completed',completionSummary:'已完成合成协议核验',validationScope:'仅此合成事项；不含产品独立验收',evidenceRefs:[{path:'artifacts/r36/synthetic-check.json',sha256:'a'.repeat(64)}]}),admin);assert.equal(completed.previousHash,first.hash);assert.equal(completed.revision,2);assert.throws(()=>f.runtime.revise('p',first.id,body({expectedVersion:1}),admin),/已更新/);
  const {id,projectId,ownerId,revision,createdAt,updatedAt,previousHash,hash,...fields}=completed;const noop=f.runtime.revise('p',id,{...fields,commandId:randomUUID(),expectedVersion:2},admin);assert.equal(noop.revision,2);assert.equal(f.runtime.events('p',admin,0).length,2);f.restart();assert.equal(f.runtime.detail('p',id,admin).history.length,2);assert.equal(f.runtime.detail('p',id,admin).independentAcceptance,false);assert.equal(f.runtime.overview('p',admin).counts.completed,1);
  const db=new DatabaseSync(join(f.directory,'work','supervision-work.sqlite'));try{assert.throws(()=>db.exec('DELETE FROM supervision_work_revisions'),/immutable/);assert.throws(()=>db.exec("UPDATE supervision_work_events SET json='{}'"),/immutable/);}finally{db.close();}
 }finally{await f.close();}
});

test('owner/current-principal, public evidence and actual project task/run bindings fail closed',async()=>{
 const f=await fixture();try{assert.throws(()=>f.runtime.overview('p',f.member.principal),/管理者本人/);assert.throws(()=>f.runtime.overview('foreign',admin),/不可访问/);assert.throws(()=>f.runtime.create('p',body({status:'blocked'}),admin),/阻塞原因/);for(const path of ['artifacts/../private/report.json','artifacts/.env','artifacts/id_rsa','artifacts/token.txt','private/report.json'])assert.throws(()=>f.runtime.create('p',body({evidenceRefs:[{path,sha256:'a'.repeat(64)}]}),admin));assert.throws(()=>f.runtime.create('p',body({summary:'api_key=synthetic-secret'}),admin),/公开摘要/);assert.throws(()=>f.runtime.create('p',body({stepId:'foreign-step'}),admin),/步骤/);
  f.runs.set('foreign-run',{id:'foreign-run',domain:'tasks',taskId:'t',projectId:'other'});assert.throws(()=>f.runtime.create('p',body({runId:'foreign-run'}),admin),/运行/);const first=f.runtime.create('p',body({taskId:'t',stepId:'current-step'}),admin);assert.throws(()=>f.runtime.detail('other',first.id,admin),/不可访问/);identityExpired();function identityExpired(){const principal=f.identity.principal({cookies:{jarvis_session:f.token}} as any);f.store.deleteLogin(f.token);assert.throws(()=>f.runtime.overview('p',principal),/失效/);}
 }finally{await f.close();}
});

test('real committed execution events persist notices once, rollback emits none, and scans preserve event notices owner-only',async()=>{
 const f=await fixture();try{let pushes=0;f.runtime.subscribe(()=>pushes++);const handler:DomainHandler={domain:'tasks',commands:['fixture-fail'],execute:(_c,_p,c)=>{c.emit('tasks','t','execution-result');throw Error('synthetic rollback');}};assert.throws(()=>f.repository.execute(handler,'fixture-fail',{commandId:randomUUID(),expectedVersion:1,scope:'personal',payload:{}},admin.actorId,()=>undefined),/rollback/);assert.equal(pushes,0);assert.equal(f.runtime.events('p',admin,0).length,0);
  f.patchTask({status:'running',executionStatus:'running'},'execution-claimed');assert.equal(pushes,1);assert.equal(f.runtime.events('p',admin,0)[0].status,'execution-claimed');assert.equal(f.notifications.list(admin).items.length,1);f.notifications.scan();f.runtime.pump();assert.equal(f.notifications.list(admin).items.length,1);assert.equal(f.notifications.list(f.member.principal).items.length,0);f.patchTask({status:'completed',executionStatus:'succeeded',executionResult:{summary:'合成运行完成，不是独验'}});assert.equal(pushes,2);assert.equal(f.notifications.list(admin).items.length,2);assert.equal(f.runtime.overview('p',admin).executionFacts[0].independentAcceptance,false);
 }finally{await f.close();}
});

test('notification outbox retries after a crash boundary and business cursor catches up without duplicate history or notices',async()=>{
 const f=await fixture();try{const original=f.notifications.publishSupervision.bind(f.notifications);f.notifications.publishSupervision=()=>{throw Error('synthetic delivery failure');};const item=f.runtime.create('p',body(),admin);let db=new DatabaseSync(join(f.directory,'work','supervision-work.sqlite'));assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM supervision_work_events WHERE notified=0').get()?.n),1);db.close();f.runtime.close();f.patchTask({status:'running'},'execution-claimed');f.notifications.publishSupervision=original;f.restart();assert.equal(f.runtime.detail('p',item.id,admin).history.length,1);assert.equal(f.runtime.events('p',admin,0).length,2);assert.equal(f.notifications.list(admin).items.length,2);f.restart();assert.equal(f.notifications.list(admin).items.length,2);assert.equal(f.runtime.events('p',admin,0).length,2);
  db=new DatabaseSync(join(f.directory,'work','supervision-work.sqlite'));assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM supervision_work_events WHERE notified=0').get()?.n),0);db.close();
 }finally{await f.close();}
});

test('real HTTP routes deny stale member fallback and SSE pushes safe commit metadata, reconnects by cursor and closes on revocation',async()=>{
 const f=await fixture();const connections:{close:()=>void}[]=[];try{const base='/api/v1/projects/p/supervision-work';f.identity.logout(f.member.token);const stale=f.adminCookie+'; jarvis_member_session='+f.member.token;for(const options of [{url:base+'/overview'},{url:base+'/events'},{url:'/api/runtime/notifications'},{method:'POST' as const,url:base+'/items',payload:body()}]){const denied=await f.app.inject({...options,headers:{cookie:stale}});assert.equal(denied.statusCode,401);}assert.equal((await f.app.inject({url:base+'/overview'})).statusCode,401);
  await f.app.listen({host:'127.0.0.1',port:0});const address=f.app.server.address();assert.ok(address&&typeof address==='object');const port=address.port;
  const open=(after=0,last?:string)=>{let buffer='',status=0;const req=request({host:'127.0.0.1',port,path:base+'/events?after='+after,headers:{cookie:f.adminCookie,...(last?{'last-event-id':last}:{})}},res=>{status=res.statusCode??0;res.on('data',data=>{buffer+=String(data);});});req.on('error',()=>{});req.end();const connection={get text(){return buffer;},get status(){return status;},close:()=>req.destroy()};connections.push(connection);return connection;};
  const until=async(fn:()=>boolean)=>{const deadline=Date.now()+2500;while(!fn()){if(Date.now()>deadline)throw Error('synthetic SSE deadline');await new Promise(r=>setTimeout(r,5));}};
  const first=open();await until(()=>first.text.includes('event: ready'));assert.equal(first.status,200);const created=await f.app.inject({method:'POST',url:base+'/items',headers:{cookie:f.adminCookie},payload:body()});assert.equal(created.statusCode,200);const item=created.json().data;await until(()=>first.text.includes('event: supervision.changed'));assert.ok(!first.text.includes(item.title));const sequence=f.runtime.latest('p',admin.actorId);assert.equal(f.notifications.list(admin).items.length,1);first.close();
  const updated=f.runtime.revise('p',item.id,body({expectedVersion:1,status:'blocked',blocker:'合成边界待核'}),admin),second=open(0,String(sequence));await until(()=>second.text.includes('event: supervision.changed'));assert.ok(second.text.includes('"revision":'+updated.revision));assert.ok(!second.text.includes('"revision":1'));assert.equal((await f.app.inject({url:base+'/events?after=999999',headers:{cookie:f.adminCookie}})).statusCode,409);
  f.store.deleteLogin(f.token);f.runtime.revise('p',item.id,body({expectedVersion:2,status:'running'}),admin);await until(()=>second.text.includes('event: session-expired'));assert.ok(!second.text.includes('"revision":3'));
 }finally{for(const c of connections)c.close();await f.close();}
});

test('one owner SSE streams multiple projects with owner-bound replay and rejects foreign cursors/member sessions',async()=>{
 const f=await fixture();let connection:ReturnType<typeof request>|undefined;try{const a=f.runtime.create('p',body(),admin),first=f.runtime.latest('p',admin.actorId);f.runtime.create('other',body({title:'合成另一项目事项'}),admin);const latest=f.runtime.latestOwned(admin),page=f.runtime.eventsOwned(admin,first);assert.equal(page.items.length,1);assert.equal(page.items[0].projectId,'other');assert.throws(()=>f.runtime.eventsOwned(admin,latest+100),/位置/);assert.throws(()=>f.runtime.eventsOwned(f.member.principal,0),/管理者本人/);
  const global='/api/v1/supervision-work/events';assert.equal((await f.app.inject({url:global,headers:{cookie:'jarvis_member_session='+f.member.token}})).statusCode,403);assert.equal((await f.app.inject({url:global,headers:{cookie:f.adminCookie,'last-event-id':'not-a-number'}})).statusCode,400);
  await f.app.listen({host:'127.0.0.1',port:0});const address=f.app.server.address();assert.ok(address&&typeof address==='object');let text='';connection=request({host:'127.0.0.1',port:address.port,path:global+'?after='+first,headers:{cookie:f.adminCookie}},res=>res.on('data',chunk=>{text+=String(chunk);}));connection.on('error',()=>{});connection.end();const wait=async(predicate:()=>boolean)=>{const until=Date.now()+2500;while(!predicate()){if(Date.now()>until)throw Error('synthetic owner-stream deadline');await new Promise(r=>setTimeout(r,5));}};await wait(()=>text.includes('event: supervision.changed'));assert.ok(text.includes('"projectId":"other"'));assert.ok(!text.includes('"projectId":"p"'));assert.ok(text.includes('data: {"latestSequence":'+latest+'}'));
  f.runtime.revise('p',a.id,body({expectedVersion:1,status:'running'}),admin);await wait(()=>text.includes('"projectId":"p"'));assert.ok(!text.includes('合成另一项目事项'));assert.equal(f.notifications.list(admin).items.length,3);
 }finally{connection?.destroy();await f.close();}
});
