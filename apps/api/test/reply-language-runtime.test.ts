import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createApp} from '../src/app.js';
import {assertDto,validateCommand,plannedContract} from '../src/v1/contract.js';
import {familyHandlers} from '../src/v1/family-domains.js';
import type {PiService,PiRunInput} from '../src/pi.js';

const require=createRequire(import.meta.url),augment=require('../../../scripts/reply-language-contract.cjs');
const save={voiceId:'calm',language:'法语',pace:'slow',wakeWord:'你好贾维斯',address:'家人',replyStyle:'简洁温和',cloudPrivacy:'allowed',dailyVoiceMinutes:45,autoSpeak:false,start:'22:00',end:'07:00',timezone:'Asia/Shanghai'};

test('reply-language contract is strict, authenticated, optional on old saves and idempotent without altering legacy languages',()=>{
 const clone=structuredClone(plannedContract),legacy=structuredClone(clone.components.schemas.PersonasVoicePayload.properties.language);augment(clone);
 assert.deepEqual(clone.components.schemas.PersonasVoicePayload.properties.language,legacy);assert.deepEqual(augment(structuredClone(clone)),clone);
 for(const method of ['get','put'])assert.deepEqual(clone.paths['/api/runtime/family/reply-language'][method].security,[{MemberCookie:[]},{SessionCookie:[]}]);
 assertDto('RuntimeReplyLanguageInput',{expectedVersion:0,replyLanguage:'en'});assert.throws(()=>assertDto('RuntimeReplyLanguageInput',{expectedVersion:0,replyLanguage:'en',profileId:'other'}));
 validateCommand('/api/v1/personas/commands/reply-language',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{profileId:'me',replyLanguage:'auto'}});
 assert.throws(()=>validateCommand('/api/v1/personas/commands/reply-language',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{profileId:'me',replyLanguage:'ja'}}));
});

test('authenticated member and administrator edits share canonical persona revisions, preserve privacy and cannot change another profile',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-reply-language-')),calls:PiRunInput[]=[];
 const pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:true}),modelIsLocal:async()=>true,abort:async()=>{},run:async(input:PiRunInput)=>{calls.push(input);input.onEvent('route',{tier:'fast',reason:'ordinary',provider:'isolated-fixture',model:'isolated-fixture'});return {text:'isolated fixture reply',status:'complete' as const};}}as unknown as PiService;
 const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'none'),pythonExecutable:join(directory,'none'),whisperModelDirectory:join(directory,'none')});
 try{
  runtime.store.setPassword('isolated-reply-language-password');const admin={cookie:'jarvis_session='+runtime.store.createLogin()};
  const member=runtime.store.create('members',{name:'本人语言测试',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'}),other=runtime.store.create('members',{name:'另一位家人',role:'adult',preferences:'',voice:'warm',wakeWord:'贾维斯'});
  runtime.identity.setCredential(member.id,'123456','pin');const login=runtime.identity.login(member.id,'123456','isolated-fixture'),memberHeaders={cookie:'jarvis_member_session='+login.token};
  const domain=familyHandlers.find(h=>h.domain==='personas')!;
  const saved=runtime.v1!.execute(domain,'save',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{...save,profileId:member.id,replyLanguage:'en'}},'server-admin',()=>undefined,()=>false,()=>{},{member:id=>runtime.store.get('members',id)}).data;
  assert.equal((await runtime.app.inject({url:'/api/runtime/family/reply-language'})).statusCode,401);
  const initial=await runtime.app.inject({url:'/api/runtime/family/reply-language',headers:memberHeaders});assert.equal(initial.statusCode,200,initial.body);assert.deepEqual(initial.json(),{replyLanguage:'en',revision:saved.revision});
  const put=(payload:any,headers=memberHeaders)=>runtime.app.inject({method:'PUT',url:'/api/runtime/family/reply-language',headers,payload});
  const changed=await put({expectedVersion:saved.revision,replyLanguage:'zh'});assert.equal(changed.statusCode,200,changed.body);assert.deepEqual(changed.json(),{replyLanguage:'zh',revision:saved.revision+1});assertDto('RuntimeReplyLanguage',changed.json());
  const canonical=runtime.v1!.read('personas',saved.id,'server-admin')!;for(const key of ['language','voiceId','pace','cloudPrivacy','dailyVoiceMinutes','quietStart','quietEnd'])assert.equal(canonical[key],saved[key]);
  assert.equal(runtime.v1!.list('personas','server-admin').filter(p=>p.profileId===member.id).length,1);assert.equal(runtime.v1!.list('personas',login.principal.actorId).length,0);
  assert.equal((await put({expectedVersion:saved.revision,replyLanguage:'en'})).statusCode,409);
  assert.equal((await put({expectedVersion:changed.json().revision,replyLanguage:'en',profileId:other.id})).statusCode,400);
  assert.equal(runtime.v1!.list('personas','server-admin').some(p=>p.profileId===other.id),false);
  assert(runtime.store.listAudit().some(event=>event.action==='family.reply-language'&&(event.details as any).actorId===login.principal.actorId));
  assert(runtime.v1!.events('server-admin',0).some(event=>event.payload.authenticatedActorId===login.principal.actorId));
  const conversation=runtime.store.createConversation(login.principal.actorId,member.id,'cross-language',true);
  const turn=await runtime.app.inject({method:'POST',url:`/api/runtime/family/conversations/${conversation.id}/messages`,headers:memberHeaders,payload:{text:'Hello, please answer this question',voiceMode:true,voiceLanguage:'en'}});assert.equal(turn.statusCode,200,turn.body);assert.equal(calls.at(-1)!.responseLanguage,'zh');assert.equal(turn.json().responseLanguage,'zh');assertDto('RuntimeFamilyStreamDone',turn.json());
  const streaming=await runtime.app.inject({method:'POST',url:`/api/runtime/family/conversations/${conversation.id}/messages`,headers:{...memberHeaders,accept:'text/event-stream'},payload:{text:'Hello again',voiceLanguage:'en'}});assert.equal(streaming.statusCode,200,streaming.body);assert.match(String(streaming.headers['content-type']),/text\/event-stream/);const frames=streaming.body.split(/\n\n/).filter(frame=>frame.startsWith('event:')).map(frame=>{const [event,...data]=frame.split('\n');return {event:event.slice(7),data:JSON.parse(data.join('\n').slice(6))};});for(const [event,schema]of [['status','RuntimeFamilyStreamStatus'],['route','RuntimeFamilyStreamRoute'],['done','RuntimeFamilyStreamDone']]){const frame=frames.find(f=>f.event===event)!;assert(frame,event+' frame missing');assert.equal(frame.data.responseLanguage,'zh');assertDto(schema,frame.data);}
  const auto=await put({expectedVersion:changed.json().revision,replyLanguage:'auto'});assert.equal(auto.statusCode,200,auto.body);
  const following=await runtime.app.inject({method:'POST',url:`/api/runtime/family/conversations/${conversation.id}/messages`,headers:memberHeaders,payload:{text:'hello',voiceMode:true,voiceLanguage:'fr'}});assert.equal(following.statusCode,200,following.body);assert.equal(calls.at(-1)!.responseLanguage,'fr');assert.equal(following.json().responseLanguage,'fr');assertDto('RuntimeFamilyStreamDone',following.json());
  const administrator=await put({expectedVersion:0,replyLanguage:'en'},admin);assert.equal(administrator.statusCode,200,administrator.body);
  const ownerConversation=runtime.store.createConversation('server-admin','owner','owner text');
  const ownerTurn=await runtime.app.inject({method:'POST',url:`/api/chat/conversations/${ownerConversation.id}/stream`,headers:admin,payload:{text:'你好，请回答这个问题'}});assert.equal(ownerTurn.statusCode,200,ownerTurn.body);assert.equal(calls.at(-1)!.responseLanguage,'en');
  runtime.identity.disableCredential(member.id);assert.equal((await put({expectedVersion:auto.json().revision,replyLanguage:'de'})).statusCode,401);
  assert.equal(runtime.v1!.read('personas',saved.id,'server-admin')!.replyLanguage,'auto');
 }finally{await runtime.app.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
