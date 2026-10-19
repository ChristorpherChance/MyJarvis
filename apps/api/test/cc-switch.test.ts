import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Store} from '../src/store.js';
import {IdentityRuntime,RuntimeAccessError} from '../src/runtime/identity.js';
import {registerCcSwitchRoutes,createCcSwitchSocketTransport,type CcSwitchRequest,type CcSwitchTransport} from '../src/runtime/cc-switch.js';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

const machineIds=['e1000000-0000-4000-8000-000000000101','e1000000-0000-4000-8000-000000000112','e1000000-0000-4000-8000-000000000116'];
const providerId='a1000000-0000-4000-8000-000000000001';
const revision='a'.repeat(64),secret='private-fixture-key-do-not-return';
const roles={opus:'main',sonnet:'small',haiku:'fast',fable:'main',subagent:'small'};
const input={name:'Test provider',baseUrl:'https://model.example.test',model:'main',models:roles,authType:'auth-token' as const};
const knownMachines=machineIds.map((id,index)=>({id,host:['101','112','116'][index],name:'Server '+['101','112','116'][index],address:'192.168.10.'+['101','112','116'][index]}));
function snapshot(machineId=machineIds[0]){
 return {machineId,host:knownMachines.find(m=>m.id===machineId)!.host,application:'claude',observedAt:new Date().toISOString(),currentProviderId:providerId,providers:[{id:providerId,...input,credentialConfigured:true,isCurrent:true,revision,apiKey:secret,settings_config:{env:{ANTHROPIC_AUTH_TOKEN:secret}},models:{...roles,extraSecret:secret}}],apiKey:secret};
}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'jarvis-cc-switch-')),store=new Store(dir);store.setPassword('isolated-model-management-password');
 const administrator=store.createLogin(),identity=new IdentityRuntime(store,{memberExists:id=>id==='me'||id==='child',memberProfile:id=>({id,name:id})});
 identity.setCredential('child','123456','pin');const member=identity.login('child','123456','test').token;
 const machines=new Map(knownMachines.map(m=>[m.id,{...m,kind:'machine',ownerId:'server-admin',scope:'personal',readOnly:false} as Record<string,any>]));
 const calls:CcSwitchRequest[]=[];let handler:(r:CcSwitchRequest)=>Promise<unknown>=async r=>({ok:true,value:r.action==='machines'?{machines:knownMachines,configured:true}:snapshot(r.machineId)});
 const transport:CcSwitchTransport=async r=>{calls.push(structuredClone(r));return handler(r);};
 const app=Fastify({logger:false});await app.register(cookie);
 app.setErrorHandler((error,_req,reply)=>{if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});return reply.code((error as any).statusCode??500).send({error:{code:'INVALID_INPUT',message:'请求格式无效'}});});
 registerCcSwitchRoutes(app,identity,{read:(_domain,id,_actor)=>machines.get(id) as any},{transport});await app.ready();
 const headers={cookie:'jarvis_session='+administrator};
 return {app,store,identity,machines,calls,headers,member,setHandler(fn:typeof handler){handler=fn;},async close(){await app.close();identity.close();store.close();await rm(dir,{recursive:true,force:true});}};
}
const route='/api/runtime/cc-switch/machines';
const providers=route+'/'+machineIds[0]+'/providers';
test('CC Switch authentication rejects anonymous, member and stale mixed cookies before contacting nodes',async()=>{
 const f=await fixture();try{
  assert.equal((await f.app.inject({url:route})).statusCode,401);
  assert.equal((await f.app.inject({url:route,headers:{cookie:'jarvis_member_session='+f.member}})).statusCode,403);
  assert.equal((await f.app.inject({url:route,headers:{cookie:f.headers.cookie+'; jarvis_member_session='+f.member}})).statusCode,403);
  assert.equal((await f.app.inject({url:route,headers:{cookie:f.headers.cookie+'; jarvis_member_session=invalid'}})).statusCode,401);
  assert.equal(f.calls.length,0);
  f.store.db.prepare('DELETE FROM logins').run();
  assert.equal((await f.app.inject({url:route,headers:f.headers})).statusCode,401);
 }finally{await f.close();}
});
test('CC Switch machine list permits only owner records at exact fixed addresses and hides protected nodes',async()=>{
 const f=await fixture();try{
  const initial=await f.app.inject({url:route,headers:f.headers});assert.equal(initial.statusCode,200);assert.equal(initial.json().machines.length,3);assert.match(initial.headers['cache-control'] as string,/no-store/);
  f.machines.get(machineIds[1])!.ownerId='another-owner';f.machines.get(machineIds[2])!.scope='company';
  assert.deepEqual((await f.app.inject({url:route,headers:f.headers})).json().machines.map((m:any)=>m.id),[machineIds[0]]);
  f.machines.get(machineIds[0])!.readOnly=true;
  const denied=await f.app.inject({url:providers,headers:f.headers});assert.equal(denied.statusCode,404);assert.equal(f.calls.filter(c=>c.action==='list').length,0);
  f.machines.get(machineIds[0])!.readOnly=false;f.machines.get(machineIds[0])!.address='192.168.10.200';
  assert.equal((await f.app.inject({url:providers,headers:f.headers})).statusCode,404);
 }finally{await f.close();}
});
test('CC Switch rejects machine configuration outside the fixed host allowlist and duplicate node mapping',async()=>{
 const f=await fixture();try{
  f.setHandler(async()=>({ok:true,value:{configured:true,machines:[{...knownMachines[0],host:'200'}]}}));
  assert.equal((await f.app.inject({url:route,headers:f.headers})).statusCode,503);
  f.setHandler(async()=>({ok:true,value:{configured:true,machines:[knownMachines[0],knownMachines[0]]}}));
  assert.equal((await f.app.inject({url:route,headers:f.headers})).statusCode,503);
 }finally{await f.close();}
});
test('CC Switch read projection strips credentials and unknown nested fields',async()=>{
 const f=await fixture();try{
  const response=await f.app.inject({url:providers,headers:f.headers});assert.equal(response.statusCode,200);
  assert.ok(!response.body.includes(secret));assert.ok(!response.body.includes('apiKey'));assert.ok(!response.body.includes('settings_config'));
  assert.deepEqual(response.json().providers[0].models,roles);assert.equal(response.json().providers[0].credentialConfigured,true);
 }finally{await f.close();}
});
test('CC Switch reads and manages native slug providers and empty official configuration',async()=>{
 const f=await fixture();try{
  const slug='official-native_2026.10';
  f.setHandler(async r=>({ok:true,value:r.action==='machines'?{configured:true,machines:knownMachines}:{...snapshot(),currentProviderId:slug,providers:[{...snapshot().providers[0],id:slug,name:'N'.repeat(250),baseUrl:'',model:'',models:{opus:'',sonnet:'',haiku:'',fable:'',subagent:''},credentialConfigured:false}]}}));
  const response=await f.app.inject({url:providers,headers:f.headers});assert.equal(response.statusCode,200);assert.equal(response.json().providers[0].id,slug);assert.equal(response.json().providers[0].baseUrl,'');assert.equal(response.json().providers[0].model,'');
  assert.equal((await f.app.inject({method:'POST',url:providers+'/'+slug+'/switch',headers:f.headers,payload:{expectedRevision:revision}})).statusCode,200);assert.equal(f.calls.at(-1)!.providerId,slug);
  assert.equal((await f.app.inject({method:'PATCH',url:providers+'/'+slug,headers:f.headers,payload:{expectedRevision:revision,provider:{...input,baseUrl:''}}})).statusCode,400);
 }finally{await f.close();}
});
test('CC Switch CRUD uses explicit worker actions and opaque version checks; audits contain identifiers only',async()=>{
 const f=await fixture();try{
  const commandId=randomUUID();
  const create=await f.app.inject({method:'POST',url:providers,headers:f.headers,payload:{commandId,provider:{...input,apiKey:secret}}});assert.equal(create.statusCode,200);assert.ok(!create.body.includes(secret));
  assert.deepEqual(f.calls.at(-1),{action:'create',machineId:machineIds[0],commandId,provider:{...input,apiKey:secret}});
  const update=await f.app.inject({method:'PATCH',url:providers+'/'+providerId,headers:f.headers,payload:{expectedRevision:revision,provider:{...input,name:'Renamed',apiKey:''}}});assert.equal(update.statusCode,200);
  assert.equal(f.calls.at(-1)!.action,'update');assert.equal(f.calls.at(-1)!.expectedRevision,revision);assert.ok(!Object.hasOwn(f.calls.at(-1)!.provider!,'apiKey'));
  const switchResult=await f.app.inject({method:'POST',url:providers+'/'+providerId+'/switch',headers:f.headers,payload:{expectedRevision:revision}});assert.equal(switchResult.statusCode,200);assert.equal(f.calls.at(-1)!.action,'switch');
  const deleted=await f.app.inject({method:'DELETE',url:providers+'/'+providerId,headers:f.headers,payload:{expectedRevision:revision}});assert.equal(deleted.statusCode,200);assert.equal(f.calls.at(-1)!.action,'delete');
  const rows=f.store.db.prepare("SELECT action,subjectId,details FROM audit WHERE action LIKE 'cc-switch.%'").all();assert.equal(rows.length,4);
  const audit=JSON.stringify(rows);assert.ok(!audit.includes(secret));assert.ok(!audit.includes(input.name));assert.ok(!audit.includes(input.baseUrl));assert.ok(!audit.includes('Renamed'));
  for(const row of rows)assert.deepEqual(JSON.parse(String(row.details)),{machineId:machineIds[0]});
 }finally{await f.close();}
});
test('CC Switch validates new key, update key preservation, version and provider body whitelist before mutations',async()=>{
 const f=await fixture();try{
  const bad=[
   {method:'POST' as const,url:providers,payload:{commandId:randomUUID(),provider:input}},
   {method:'POST' as const,url:providers,payload:{commandId:randomUUID(),provider:{...input,apiKey:'   '}}},
   {method:'POST' as const,url:providers,payload:{commandId:randomUUID(),provider:{...input,apiKey:secret,env:{MALICIOUS:'value'}}}},
   {method:'PATCH' as const,url:providers+'/'+providerId,payload:{expectedRevision:'stale',provider:input}},
   {method:'POST' as const,url:providers+'/'+providerId+'/switch',payload:{expectedRevision:revision,apiKey:secret}},
   {method:'DELETE' as const,url:providers+'/'+providerId,payload:{}},
   {method:'POST' as const,url:providers,payload:{commandId:randomUUID(),provider:{...input,apiKey:secret,baseUrl:'https://user:password@example.test'}}},
  ];
  for(const request of bad){const response=await f.app.inject({...request,headers:f.headers});assert.equal(response.statusCode,400);assert.ok(!response.body.includes(secret));}
  assert.equal(f.calls.length,0);
  assert.equal((await f.app.inject({method:'PATCH',url:providers+'/'+providerId,headers:f.headers,payload:{expectedRevision:revision,provider:input}})).statusCode,200);
  assert.ok(!Object.hasOwn(f.calls.at(-1)!.provider!,'apiKey'));
  assert.equal((await f.app.inject({method:'PATCH',url:providers+'/'+providerId,headers:f.headers,payload:{expectedRevision:revision,provider:{...input,apiKey:'rotated-test-key'}}})).statusCode,200);
  assert.equal(f.calls.at(-1)!.provider!.apiKey,'rotated-test-key');
 }finally{await f.close();}
});
test('CC Switch translates conflict, active deletion, uncertain result and unexpected worker errors without echoing secrets',async()=>{
 const f=await fixture();try{
  for(const [code,status] of [['CONFLICT',409],['ACTIVE_PROVIDER',409],['NOT_FOUND',404],['INVALID_INPUT',400],['APPLY_FAILED',503],['UNKNOWN_RESULT',503],['SOMETHING_PRIVATE',503]] as const){
   f.setHandler(async r=>r.action==='machines'?{ok:true,value:{configured:true,machines:knownMachines}}:{ok:false,code,status:500,message:secret});
   const response=await f.app.inject({method:'DELETE',url:providers+'/'+providerId,headers:f.headers,payload:{expectedRevision:revision}});
   assert.equal(response.statusCode,status);assert.ok(!response.body.includes(secret));if(code==='UNKNOWN_RESULT')assert.match(response.json().error.message,/刷新核实/);
  }
  f.setHandler(async()=>{throw new Error(secret);});const response=await f.app.inject({url:route,headers:f.headers});assert.equal(response.statusCode,503);assert.ok(!response.body.includes(secret));
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'cc-switch.%'").get()!.n,0);
 }finally{await f.close();}
});
test('CC Switch rejects a node snapshot for another machine and stale identity during transport',async()=>{
 const f=await fixture();try{
  f.setHandler(async r=>({ok:true,value:r.action==='machines'?{configured:true,machines:knownMachines}:snapshot(machineIds[1])}));
  assert.equal((await f.app.inject({url:providers,headers:f.headers})).statusCode,503);
  f.setHandler(async r=>{if(r.action==='list')f.store.db.prepare('DELETE FROM logins').run();return {ok:true,value:r.action==='machines'?{configured:true,machines:knownMachines}:snapshot()};});
  assert.equal((await f.app.inject({url:providers,headers:f.headers})).statusCode,401);
 }finally{await f.close();}
});
test('CC Switch request bodies are capped at 64 KiB without returning oversized secrets',async()=>{
 const f=await fixture();try{
  const response=await f.app.inject({method:'POST',url:providers,headers:f.headers,payload:{commandId:randomUUID(),provider:{...input,apiKey:secret+'x'.repeat(65536)}}});
  assert.equal(response.statusCode,413);assert.ok(!response.body.includes(secret));assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('CC Switch Unix transport accepts one fragmented newline envelope and rejects malformed or oversized output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-cc-socket-')),path=join(dir,'control.sock');let mode='ok',request:any;
 const server=createServer(socket=>{let data='';socket.on('error',()=>{});socket.on('data',chunk=>{data+=chunk.toString();if(!data.includes('\n'))return;request=JSON.parse(data.split('\n')[0]);if(mode==='ok'){socket.write('{"ok":true,');socket.end('"value":{"configured":true,"machines":[]}}\n');}else if(mode==='invalid')socket.end(secret+'\n');else if(mode==='dropped')socket.end();else socket.end('x'.repeat(1024*1024+1));});});
 await new Promise<void>(resolve=>server.listen(path,resolve));const transport=createCcSwitchSocketTransport(path);
 try{
  assert.deepEqual(await transport({action:'machines'}),{ok:true,value:{configured:true,machines:[]}});assert.deepEqual(request,{action:'machines'});
  for(mode of ['invalid','oversized'])await assert.rejects(transport({action:'machines'}),error=>error instanceof RuntimeAccessError&&error.code==='UNAVAILABLE'&&!error.message.includes(secret));
  mode='dropped';await assert.rejects(transport({action:'switch',machineId:machineIds[0],providerId,expectedRevision:revision}),error=>error instanceof RuntimeAccessError&&error.code==='UNKNOWN_RESULT'&&/刷新核实/.test(error.message));
  await assert.rejects(transport({action:'machines'}),error=>error instanceof RuntimeAccessError&&error.code==='UNAVAILABLE');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
test('createApp exposes CC Switch injection through the existing authenticated platform boundary',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-cc-app-'));const pi={initialize:async()=>{},health:()=>({configured:false,provider:'',model:'',activeRuns:0}),getSettings:async()=>({configured:false,provider:'',model:'',providers:[]}),configure:async()=>{},run:async()=>{throw Error('PI_NOT_CONFIGURED');},abort:async()=>{},dispose:async()=>{}} as unknown as PiService;
 let called=0;const instance=await createApp({dataDir:dir,pi,webDir:join(dir,'no-web'),ccSwitch:{transport:async()=>{called++;return {ok:true,value:{machines:[],configured:true}};}}});
 try{
  assert.equal((await instance.app.inject({url:route})).statusCode,401);assert.equal(called,0);
  const setup=await instance.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'cc-switch-platform-test-password'}}),headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  assert.equal((await instance.app.inject({url:route,headers})).statusCode,200);assert.equal(called,1);
  const mixed=await instance.app.inject({url:route,headers:{cookie:headers.cookie+'; jarvis_member_session=invalid'}});
  assert.equal(mixed.statusCode,401);assert.equal(called,1);
 }finally{await instance.app.close();await rm(dir,{recursive:true,force:true});}
});

