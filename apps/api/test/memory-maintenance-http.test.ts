import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {BusinessError} from '../src/v1/types.js';
import {assertDto} from '../src/v1/contract.js';
import {MemoryRuntime} from '../src/runtime/memory.js';
import {IdentityRuntime,RuntimeAccessError} from '../src/runtime/identity.js';
import {memoryMaintenanceHandler} from '../src/v1/memory-maintenance.js';
import type {PiService} from '../src/pi.js';

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-memory-maintenance-')),store=new Store(directory),repository=new V1Repository(store.databasePath);store.setPassword('isolated-memory-maintenance-fixture-passphrase');
 repository.setReceiptValidator((domain,receipt)=>{if(domain==='memory')assertDto('Memory',receipt.data)});
 const alice=store.create('members',{name:'维护夹具甲',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'}),bob=store.create('members',{name:'维护夹具乙',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});
 const identity=new IdentityRuntime(store,{memberExists:id=>['me',alice.id,bob.id].includes(id),memberProfile:id=>id==='me'?{id:'me',name:'本人'}:store.get('members',id)});identity.setCredential(alice.id,'123456','pin');identity.setCredential(bob.id,'234567','pin');const a=identity.login(alice.id,'123456','fixture-alice'),b=identity.login(bob.id,'234567','fixture-bob');
 let modelCalls=0;const pi={run:async()=>{modelCalls++;throw Error('Memory maintenance never invokes a model')},abort:async()=>{},isRunning:()=>false} as unknown as PiService;
 const memory=new MemoryRuntime(repository,store,pi,{principal:req=>{if(req.headers['x-jarvis-terminal']){const terminal=identity.terminal(req);return {actorId:'terminal_'+terminal.id,profileId:'public',administrator:false};}return identity.principal(req)}}),app=Fastify({logger:false});await app.register(cookie);app.setErrorHandler((error:any,_req,reply)=>reply.code(error instanceof BusinessError?error.status:error instanceof RuntimeAccessError?error.statusCode:error.name==='ZodError'?400:500).send({error:{code:error.code,message:error.message}}));memory.register(app);await app.ready();
 const admin={cookie:'jarvis_session='+store.createLogin()},member={cookie:'jarvis_member_session='+a.token};
 const command=(actor:string,name:string,payload:any,version=0)=>memory.command(name,{commandId:randomUUID(),expectedVersion:version,scope:'private',payload},actor).data;
 const candidate=(text:string,actor='server-admin',nextReviewAt:string|null=null)=>command(actor,'candidate',{text,category:'学习偏好',source:'对话来源证据：'+text,nextReviewAt});
 const active=(text:string,actor='server-admin',nextReviewAt:string|null=null)=>{const r=candidate(text,actor,nextReviewAt);return command(actor,'confirm',{memoryId:r.id,confirmed:true},r.revision)};
 const envelope=(record:any,payload:any)=>({commandId:randomUUID(),expectedVersion:record.revision,scope:'private' as const,payload});
 const send=(operation:string,body:any,headers=admin,family=false)=>app.inject({method:'POST',url:(family?'/api/runtime/family/memory':'/api/runtime/memory')+'/maintenance/'+operation,headers,payload:body});
 const workbench=(headers=admin,family=false)=>app.inject({url:(family?'/api/runtime/family/memory':'/api/runtime/memory')+'/workbench',headers});
 const merge=(left:any,right:any,text:string,headers=admin,family=false)=>send('merge',envelope(left,{memoryId:left.id,otherMemoryId:right.id,otherExpectedVersion:right.revision,text,category:'学习偏好',nextReviewAt:null,confirmed:true}),headers,family);
 return {app,store,repository,memory,identity,a,b,alice,bob,admin,member,command,candidate,active,envelope,send,workbench,merge,async close(){await app.close();await memory.close();identity.close();repository.close();store.close();assert.equal(modelCalls,0);await rm(directory,{recursive:true,force:true})}};
}

test('workbench compares all current own records and due dates are reminders without automatic expiry',async()=>{
 const f=await fixture();try{
  for(let i=0;i<50;i++)f.active('isolatedtoken'+i);
  const left=f.active('量子晨读使用纸质卡片','server-admin','2000-01-01T00:00:00.000Z'),right=f.candidate('量子晨读使用简短卡片');
  f.active('量子晨读使用纸质卡片',f.a.principal.actorId);const rejected=f.candidate('量子晨读已拒绝');f.command('server-admin','reject',{memoryId:rejected.id,reason:'本人拒绝'},rejected.revision);
  const forgotten=f.active('量子晨读已遗忘');f.command('server-admin','forget',{memoryId:forgotten.id,reason:'本人遗忘'},forgotten.revision);
  const response=await f.workbench();assert.equal(response.statusCode,200,response.body);assert.equal(response.headers['cache-control'],'private, no-store');const result=response.json();assert.equal(result.actorId,'server-admin');assert(result.dueIds.includes(left.id));assert(!result.dueIds.includes(right.id));assert(result.pairs.some((pair:any)=>[pair.leftId,pair.rightId].includes(left.id)&&[pair.leftId,pair.rightId].includes(right.id)),'第51条后的相同片段也参与比较');assert(!result.records.some((r:any)=>r.ownerId===f.a.principal.actorId||r.id===forgotten.id));assert(!result.pairs.some((p:any)=>p.leftId===rejected.id||p.rightId===rejected.id));assert.equal(f.repository.read('memory',left.id,'server-admin')!.status,'active');
  const query=await f.app.inject({method:'POST',url:'/api/runtime/memory/query',headers:f.admin,payload:{query:'纸质卡片'}});assert.equal(query.json().records[0].id,left.id);assert.equal(result.comparison,'literal-fragments');
 }finally{await f.close()}
});

test('explicit merge validates both versions atomically and durable replay creates only one confirmed replacement',async()=>{
 const f=await fixture();try{
  const left=f.active('OLD-ALPHA preference'),right=f.candidate('OLD-BETA preference'),version=f.repository.version('server-admin');
  const body=f.envelope(left,{memoryId:left.id,otherMemoryId:right.id,otherExpectedVersion:right.revision+1,text:'NEW-FINAL preference',category:'学习偏好',nextReviewAt:null,confirmed:true});
  assert.equal((await f.send('merge',body)).statusCode,409);assert.equal(f.repository.version('server-admin'),version);assert.equal(f.repository.read('memory',left.id,'server-admin')!.status,'active');assert.equal(f.repository.read('memory',right.id,'server-admin')!.status,'candidate');
  body.payload.otherExpectedVersion=right.revision;body.payload.confirmed=false;assert.equal((await f.send('merge',body)).statusCode,400);body.payload.confirmed=true;
  const [a,b]=await Promise.all([f.send('merge',body),f.send('merge',body)]);assert.equal(a.statusCode,200,a.body);assert.deepEqual(a.json(),b.json());const saved=a.json().data;assert.equal(saved.text,'NEW-FINAL preference');assert.deepEqual(saved.mergeSources,[{id:left.id,revision:left.revision},{id:right.id,revision:right.revision}]);assert.equal(f.repository.read('memory',left.id,'server-admin')!.status,'merged');assert.equal(f.repository.read('memory',right.id,'server-admin')!.source,right.source);assert.equal(f.memory.records('server-admin').filter(r=>r.status==='active').length,1);
  const reopened=new V1Repository(f.store.databasePath);try{const replay=reopened.execute(memoryMaintenanceHandler,'merge-confirmed',body,'server-admin',()=>undefined);assert.equal(replay.data.id,saved.id);assert.equal(reopened.list('memory','server-admin').length,3)}finally{reopened.close()}
  const changed={...body,payload:{...body.payload,text:'different'}};assert.equal((await f.send('merge',changed)).statusCode,409);
  for(const query of ['OLD-ALPHA','OLD-BETA'])assert.deepEqual((await f.app.inject({method:'POST',url:'/api/runtime/memory/query',headers:f.admin,payload:{query}})).json().records,[]);
  assert.equal((await f.workbench()).json().records.filter((r:any)=>r.status==='merged').length,2);
 }finally{await f.close()}
});

test('review records an explicit accurate or changed outcome and never recalls retained old source evidence',async()=>{
 const f=await fixture();try{
  const original=f.active('OLD-REVIEW-FACT','server-admin','2000-01-01T00:00:00.000Z'),future='2099-12-01T00:00:00.000Z';
  const accurate=f.envelope(original,{memoryId:original.id,outcome:'accurate',nextReviewAt:future,confirmed:true}),response=await f.send('review',accurate);assert.equal(response.statusCode,200,response.body);const unchanged=response.json().data;assert.equal(unchanged.text,original.text);assert.equal(unchanged.nextReviewAt,future);assert(unchanged.history.some((e:any)=>e.event==='review-still-accurate'));assert.deepEqual((await f.send('review',accurate)).json(),response.json());assert(!(await f.workbench()).json().dueIds.includes(original.id));
  const invalid=f.envelope(unchanged,{memoryId:original.id,outcome:'accurate',nextReviewAt:'2000-01-01T00:00:00.000Z',confirmed:true});assert.equal((await f.send('review',invalid)).statusCode,400);
  const changed=await f.send('review',f.envelope(unchanged,{memoryId:original.id,outcome:'changed',text:'CURRENT-REVIEW-FACT',nextReviewAt:null,confirmed:true}));assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().data.source,original.source);assert(changed.json().data.history.some((e:any)=>e.event==='edited-confirmed'));
  const old=await f.app.inject({method:'POST',url:'/api/runtime/memory/query',headers:f.admin,payload:{query:'OLD-REVIEW-FACT'}});assert.deepEqual(old.json().records,[]);assert.equal(changed.json().data.nextReviewAt,null);
  const candidate=f.candidate('candidate cannot be reviewed');assert.equal((await f.send('review',f.envelope(candidate,{memoryId:candidate.id,outcome:'accurate',nextReviewAt:null,confirmed:true}))).statusCode,409);
 }finally{await f.close()}
});

test('lineage forget requires the complete current component version and erases nested sources and every prior plaintext receipt',async()=>{
 const f=await fixture();try{
  const a=f.active('SENSITIVE-ALPHA'),b=f.active('SENSITIVE-BETA'),d=f.active('SENSITIVE-DELTA'),first=(await f.merge(a,b,'SENSITIVE-GAMMA')).json().data;
  const before=(await f.workbench()).json(),oldA=f.repository.read('memory',a.id,'server-admin')!,oldLineage=before.lineages.find((group:any)=>group.ids.includes(a.id));
  const second=(await f.merge(first,d,'SENSITIVE-EPSILON')).json().data;assert(second.id);
  const stale=f.envelope(oldA,{memoryId:a.id,lineageVersion:oldLineage.version,reason:'本人确认一起遗忘',confirmed:true});assert.equal((await f.send('forget',stale)).statusCode,409);assert(f.memory.records('server-admin').some(r=>r.status==='active'));
  assert.throws(()=>f.command('server-admin','forget',{memoryId:a.id,reason:'旧入口不能绕过关联确认'},oldA.revision),(error:any)=>error.code==='REVIEW_REQUIRED');
  const current=(await f.workbench()).json(),lineage=current.lineages.find((group:any)=>group.ids.includes(a.id));assert.equal(lineage.ids.length,5);const body=f.envelope(oldA,{memoryId:a.id,lineageVersion:lineage.version,reason:'本人明确一起遗忘',confirmed:true});const result=await f.send('forget',body);assert.equal(result.statusCode,200,result.body);assert.equal((await f.send('forget',body)).json().data.status,'forgotten');
  const all=f.memory.records('server-admin');assert.equal(all.length,5);for(const record of all){assert.equal(record.status,'forgotten');assert.equal(record.text,null);assert.equal(record.source,null);assert.deepEqual(record.mergeSources,[]);assert.equal(record.mergedInto,null)}assert.equal((await f.workbench()).json().records.length,0);
  const db=new DatabaseSync(f.store.databasePath);try{const persisted=JSON.stringify([...db.prepare("SELECT json FROM v1_documents WHERE domain='memory'").all(),...db.prepare('SELECT response FROM v1_commands').all()]);assert(!persisted.includes('SENSITIVE-'),'所有相关旧正文和来源不得从持久回执复活')}finally{db.close()}
 }finally{await f.close()}
});

test('maintenance reads and writes keep member priority, terminal boundaries and owner isolation under real credentials',async()=>{
 const f=await fixture();try{
  const owner=f.active('OWNER-PRIVATE'),owner2=f.active('OWNER-OTHER'),left=f.active('ALICE-PRIVATE',f.a.principal.actorId),right=f.candidate('ALICE-OTHER',f.a.principal.actorId),mixed={cookie:f.admin.cookie+'; '+f.member.cookie};
  for(const headers of [mixed,{cookie:f.admin.cookie+'; jarvis_member_session=expired'},{cookie:f.admin.cookie+'; jarvis_member_session='}]){assert.equal((await f.workbench(headers)).statusCode,403);for(const op of ['merge','review','forget']){const response=await f.send(op,{},headers);assert.equal(response.statusCode,403);assert(!response.body.includes('OWNER-PRIVATE'))}}
  for(const url of ['/api/runtime/memory','/api/runtime/memory/export']){const denied=await f.app.inject({url,headers:mixed});assert.equal(denied.statusCode,403);assert(!denied.body.includes('OWNER-PRIVATE'));}
  for(const path of ['/commands/candidate','/extract','/extract/stop','/cleanup'])assert.equal((await f.app.inject({method:'POST',url:'/api/runtime/memory'+path,headers:mixed,payload:{}})).statusCode,403);
  assert.equal((await f.app.inject({method:'DELETE',url:'/api/runtime/memory/conversations/fixture',headers:mixed})).statusCode,403);
  const memberList=await f.app.inject({url:'/api/runtime/family/memory',headers:mixed});assert.equal(memberList.statusCode,200);assert(!memberList.body.includes('OWNER-PRIVATE'));
  const family=(await f.workbench(mixed,true)).json();assert.equal(family.actorId,f.a.principal.actorId);assert(family.records.every((r:any)=>r.ownerId===f.a.principal.actorId));assert(!JSON.stringify(family).includes('OWNER-PRIVATE'));
  const forbidden=await f.merge(left,owner,'cross-owner',f.member,true);assert.equal(forbidden.statusCode,404);assert.equal(f.repository.read('memory',left.id,f.a.principal.actorId)!.status,'active');
  const merged=await f.merge(left,right,'ALICE-CURRENT',f.member,true);assert.equal(merged.statusCode,200,merged.body);assert.equal(merged.json().data.ownerId,f.a.principal.actorId);assert.equal(f.repository.read('memory',owner2.id,'server-admin')!.status,'active');
  const ticket=f.identity.issuePairing('maintenance-terminal','study',[f.alice.id]),paired=f.identity.claimPairing(ticket.pairingToken,'maintenance-terminal'),terminal={...f.admin,'x-jarvis-terminal':paired.terminalToken};assert.equal((await f.workbench(terminal)).statusCode,403);assert.equal((await f.send('merge',{},terminal)).statusCode,403);
  f.identity.disableCredential(f.alice.id);assert.equal((await f.app.inject({url:'/api/runtime/family/memory',headers:mixed})).statusCode,401);assert.equal((await f.workbench(mixed,true)).statusCode,401);assert.equal((await f.send('review',{},mixed,true)).statusCode,401);assert.equal((await f.workbench()).statusCode,200);
 }finally{await f.close()}
});
