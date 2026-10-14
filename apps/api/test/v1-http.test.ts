import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {V1Repository} from '../src/v1/repository.js';
import {BusinessError,type DomainHandler,type CommandEnvelope} from '../src/v1/types.js';
import type {PiService} from '../src/pi.js';
const pi=()=>({initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService);
const envelope=(payload:Record<string,any>,expectedVersion=0,scope='personal',commandId=randomUUID())=>({commandId,expectedVersion,scope,payload});
test('V1 HTTP authentication, strict input, idempotency, concurrency, scope and persistence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-v1-http-'));let runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'absent')});
 try{
  const api=runtime.app;
  const anonymous=await api.inject({url:'/api/v1/inbox'});assert.equal(anonymous.statusCode,401);assert.equal(anonymous.json().code,'FORBIDDEN');assert.ok(anonymous.json().requestId);
  const setup=await api.inject({method:'POST',url:'/api/auth/setup',payload:{password:'V1-temporary-test-passphrase'}});const cookie=String(setup.headers['set-cookie']).split(';')[0],headers={cookie};
  const command=async(domain:string,cmd:string,body:any)=>api.inject({method:'POST',url:`/api/v1/${domain}/commands/${cmd}`,headers,payload:body});
  const payload={rawText:'请记录：部署之前先核对恢复方案。',kind:'experience',terminalId:'local',origin:'manual',title:'恢复方案'};
  const forged=await command('inbox','capture',envelope({...payload,ownerId:'wife'}));assert.equal(forged.statusCode,400);assert.equal(forged.json().code,'VALIDATION');
  const oversized=await command('projects','register',envelope({name:'大请求',description:'请求大小验收',goal:'验证传输边界',milestones:Array(100).fill('字'.repeat(600))}));assert.equal(oversized.statusCode,413,oversized.body);assert.equal(oversized.json().code,'VALIDATION');assert.match(oversized.json().message,/128 KiB/);
  const createBody=envelope(payload);const created=await command('inbox','capture',createBody);assert.equal(created.statusCode,200,created.body);const item=created.json().data;assert.equal(item.ownerId,'server-admin');assert.equal(item.scope,'personal');assert.equal(item.revision,1);
  const replay=await command('inbox','capture',createBody);assert.deepEqual(replay.json(),created.json());assert.equal((await api.inject({url:'/api/v1/inbox',headers})).json().data.items.length,1);
  const changed=await command('inbox','capture',{...createBody,payload:{...payload,rawText:'更改原始表达'}});assert.equal(changed.statusCode,409);assert.equal(changed.json().code,'CONFLICT');
  const crossScope=await command('inbox','annotate',envelope({inboxId:item.id,note:'归档前复核',tags:['部署']},1,'family'));assert.equal(crossScope.statusCode,403);
  const annotate=await command('inbox','annotate',envelope({inboxId:item.id,note:'归档前复核',tags:['部署']},1));assert.equal(annotate.statusCode,200,annotate.body);assert.equal(annotate.json().data.revision,2);
  const stale=await command('inbox','annotate',envelope({inboxId:item.id,note:'过期覆盖',tags:[]},1));assert.equal(stale.statusCode,409);assert.equal(stale.json().details.currentVersion,2);
  const before=(await api.inject({url:'/api/v1/events/history',headers})).json().data.items.length;
  const unsupported=await command('inbox','route',envelope({inboxId:item.id,target:'memory'},2));assert.equal(unsupported.statusCode,403,unsupported.body);assert.equal(unsupported.json().code,'FORBIDDEN');
  const after=(await api.inject({url:'/api/v1/events/history',headers})).json().data.items.length;assert.equal(after,before,'failed command must not publish events');assert.equal((await api.inject({url:`/api/v1/inbox/${item.id}`,headers})).json().data.revision,2);
  const routed=await command('inbox','route',envelope({inboxId:item.id,target:'experience'},2));assert.equal(routed.statusCode,200,routed.body);const experiences=(await api.inject({url:'/api/v1/experiences',headers})).json();assert.equal(experiences.data.items.length,1);assert.equal(experiences.data.items[0].content,payload.rawText);
  const caps=(await api.inject({url:'/api/v1/capabilities',headers})).json();assert.equal(caps.data.execution.development,false);assert.equal(caps.data.identity.familyAuthentication,true);assert.equal(caps.data.execution.piConfigured,false);assert.deepEqual(caps.data.domains.find((d:any)=>d.domain==='research').unavailableCommands,[]);
  const duplicateBase=(await command('inbox','capture',envelope({rawText:'同一句原话',kind:'experience',terminalId:'local',origin:'manual'}))).json().data;
  const duplicateCandidate=(await command('inbox','capture',envelope({rawText:'同一句原话',kind:'experience',terminalId:'local',origin:'manual'}))).json().data;assert.equal(duplicateCandidate.duplicateOf,duplicateBase.id);
  const independent=await command('inbox','keep-independent',envelope({inboxId:duplicateCandidate.id,reason:'两次独立实践，相同表达'},duplicateCandidate.revision));assert.equal(independent.statusCode,200,independent.body);assert.equal(independent.json().data.duplicateOf,null);assert.equal(independent.json().data.rawText,'同一句原话');
  const pagination=(await api.inject({url:'/api/v1/inbox?limit=0',headers}));assert.equal(pagination.statusCode,400);
  const badCursor=await api.inject({url:'/api/v1/inbox?cursor=wrong',headers});assert.equal(badCursor.statusCode,400);
  const hostile=await api.inject({method:'POST',url:'/api/v1/inbox/commands/capture',headers:{...headers,origin:'https://attacker.example'},payload:envelope(payload)});assert.equal(hostile.statusCode,403);
  const sessionCount=runtime.store.list('members').length;await api.close();runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'absent')});
  assert.equal(runtime.store.list('members').length,sessionCount);assert.equal((await runtime.app.inject({url:'/api/v1/experiences',headers})).json().data.items.length,1);assert.deepEqual((await runtime.app.inject({method:'POST',url:'/api/v1/inbox/commands/capture',headers,payload:createBody})).json(),created.json());
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true})}
});
test('V1 command rollback includes objects, linked records, events and command receipts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-v1-rollback-'));const runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'absent')});
 try{
  const handler:DomainHandler={domain:'inbox',commands:['capture'],execute(_cmd,p,c){const item=c.create('inbox',{rawText:p.rawText});c.emit('inbox',item.id,'captured');c.create('experiences',{content:p.rawText});throw new BusinessError('REVIEW_REQUIRED','人工复核未通过',409)}};
  const body=envelope({rawText:'不能留下一半的数据'}) as CommandEnvelope;
  assert.throws(()=>runtime.v1.execute(handler,'capture',body,'server-admin',()=>undefined),BusinessError);assert.deepEqual(runtime.v1.list('inbox','server-admin'),[]);assert.deepEqual(runtime.v1.list('experiences','server-admin'),[]);assert.deepEqual(runtime.v1.events('server-admin',0),[]);
  const good:DomainHandler={...handler,execute(_cmd,p,c){return c.create('inbox',{rawText:p.rawText,title:'隔离收件',kind:'idea',terminalId:'local',origin:'manual',status:'pending',projectId:null,target:null,annotation:'',tags:[],duplicateOf:null,createdAt:c.now,updatedAt:c.now})}};assert.equal(runtime.v1.execute(good,'capture',body,'server-admin',()=>undefined).data.revision,1);
  const other=runtime.v1.execute(good,'capture',envelope({rawText:'另一身份的私人收件'}) as CommandEnvelope,'other-admin',()=>undefined);assert.equal(runtime.v1.read('inbox',other.data.id,'server-admin'),undefined);assert.equal(runtime.v1.events('server-admin',0).length,1);assert.equal(runtime.v1.eventSequence('server-admin',other.events[0].id),undefined);
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true})}
});
test('V1 authenticated SSE replays by event ID and closes with the app',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-v1-sse-'));const runtime=await createApp({dataDir:dir,pi:pi(),webDir:join(dir,'absent')});let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;const controller=new AbortController();
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'V1-stream-test-passphrase'}});const cookie=String(setup.headers['set-cookie']).split(';')[0];
  const create=async(rawText:string)=>runtime.app.inject({method:'POST',url:'/api/v1/inbox/commands/capture',headers:{cookie},payload:envelope({rawText,kind:'idea',terminalId:'local',origin:'manual'})});
  const a=(await create('第一条事件')).json(),b=(await create('第二条事件')).json();await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();if(!address||typeof address==='string')throw Error('No address');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/v1/events`,{headers:{cookie,'Last-Event-ID':a.events.at(-1).id},signal:controller.signal});assert.equal(response.status,200);reader=response.body!.getReader();
  let content='';const deadline=Date.now()+3000;while(!content.includes(b.events[0].id)&&Date.now()<deadline){const part=await reader.read();if(part.done)break;content+=new TextDecoder().decode(part.value)}assert.ok(content.includes(b.events[0].id));assert.ok(!content.includes(`id: ${a.events[0].id}`));assert.ok(!content.includes('第二条事件'),'events exclude raw private content');
  await runtime.app.close();
 }finally{controller.abort();await reader?.cancel().catch(()=>{});await runtime.app.close();await rm(dir,{recursive:true,force:true})}
});

