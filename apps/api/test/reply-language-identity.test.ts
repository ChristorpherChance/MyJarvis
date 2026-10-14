import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Store} from '../src/store.js';
import {IdentityRuntime,registerIdentityRoutes,RuntimeAccessError} from '../src/runtime/identity.js';
import {memberReplyLanguage,resolveReplyLanguage} from '../src/runtime/conversation-language.js';
import type {PiService,PiRunInput} from '../src/pi.js';

test('input language and member output are independent; legacy input hints never become a fixed output',()=>{
 assert.equal(memberReplyLanguage({language:'英语'}),'auto');
 assert.equal(resolveReplyLanguage({language:'中文'},'fr','Bonjour'),'fr');
 assert.equal(resolveReplyLanguage({replyLanguage:'en'},'zh','你好，请用中文回答'),'en');
 assert.equal(resolveReplyLanguage({replyLanguage:'zh'},'en','Hello'),'zh');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto',language:'英语'},'de','Guten Tag'),'de');
 assert.equal(resolveReplyLanguage(JSON.stringify({replyLanguage:'fr'}),'en','Hello'),'fr');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto'},undefined,'Bonjour, comment allez-vous ?'),'fr');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto'},undefined,'你好'),'zh');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto'}),'zh','automatic opening has no prior speaker language');
});

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-reply-language-')),store=new Store(directory);
 store.setPassword('isolated-reply-language-password');const administrator=store.createLogin();
 const child=store.create('members',{name:'测试英语成员',role:'child',voice:'clear',wakeWord:'hello jarvis',preferences:''});
 const parent=store.create('members',{name:'测试中文成员',role:'elder',voice:'warm',wakeWord:'hello jarvis',preferences:''});
 const automatic=store.create('members',{name:'测试自动成员',role:'adult',voice:'clear',wakeWord:'hello jarvis',preferences:''});
 const profiles=new Map<string,any>([
  ['me',{id:'me',name:'测试管理员',preferences:{replyLanguage:'en',replyLanguageRevision:0,cloudPrivacy:'allowed'}}],
  [child.id,{...child,preferences:{replyLanguage:'en',replyLanguageRevision:0,cloudPrivacy:'allowed'}}],
  [parent.id,{...parent,preferences:{replyLanguage:'zh',replyLanguageRevision:0,cloudPrivacy:'allowed'}}],
  [automatic.id,{...automatic,preferences:{language:'中文',replyLanguageRevision:0,cloudPrivacy:'allowed'}}],
 ]);
 const identity=new IdentityRuntime(store,{memberExists:id=>profiles.has(id),memberProfile:id=>profiles.get(id),setReplyLanguage:(principal,input)=>{
  const profile=profiles.get(principal.profileId);
  if(profile.preferences.replyLanguageRevision!==input.expectedVersion)throw new RuntimeAccessError('CONFLICT','设置已更新',409);
  profile.preferences={...profile.preferences,replyLanguage:input.replyLanguage,replyLanguageRevision:input.expectedVersion+1};return profile;
 }});
 const calls:PiRunInput[]=[];
 const pi={health:()=>({configured:true}),modelIsLocal:async()=>true,abort:async()=>{},run:async(input:PiRunInput)=>{
  calls.push(input);const text={zh:'你好。',en:'Hello.',fr:'Bonjour.',de:'Hallo.'}[input.responseLanguage??'zh'];
  input.onEvent('delta',{text});return {text,status:'complete' as const};
 }};
 const app=Fastify({logger:false});await app.register(cookie);registerIdentityRoutes(app,identity,store,pi as unknown as PiService);await app.ready();
 function login(id:string){identity.setCredential(id,'123456','pin');const logged=identity.login(id,'123456','test-'+id);return {principal:logged.principal,headers:{cookie:'jarvis_member_session='+logged.token}};}
 return {app,identity,store,profiles,calls,administrator,child,parent,automatic,login,async close(){
  await app.close();identity.close();store.close();assert(resolve(directory).startsWith(resolve(tmpdir())+sep)&&directory.includes('jarvis-reply-language-'));await rm(directory,{recursive:true,force:true});
 }};
}

test('own member reply preference saves by version, follows identity across clients, and cannot update another member',async()=>{
 const f=await fixture();try{
  const child=f.login(f.child.id),parent=f.login(f.parent.id),endpoint='/api/runtime/family/reply-language';
  assert.equal((await f.app.inject({url:endpoint})).statusCode,401);
  const mixed={cookie:'jarvis_session='+f.administrator+'; '+parent.headers.cookie};
  assert.deepEqual((await f.app.inject({url:endpoint,headers:mixed})).json(),{replyLanguage:'zh',revision:0});
  assert.equal((await f.app.inject({method:'PUT',url:endpoint,headers:child.headers,payload:{expectedVersion:0,replyLanguage:'de',profileId:f.parent.id}})).statusCode,400);
  const saved=await f.app.inject({method:'PUT',url:endpoint,headers:child.headers,payload:{expectedVersion:0,replyLanguage:'fr'}});
  assert.equal(saved.statusCode,200);assert.deepEqual(saved.json(),{replyLanguage:'fr',revision:1});
  assert.deepEqual((await f.app.inject({url:endpoint,headers:child.headers})).json(),{replyLanguage:'fr',revision:1});
  assert.deepEqual((await f.app.inject({url:endpoint,headers:parent.headers})).json(),{replyLanguage:'zh',revision:0});
  assert.equal((await f.app.inject({method:'PUT',url:endpoint,headers:child.headers,payload:{expectedVersion:0,replyLanguage:'en'}})).statusCode,409);
  assert.equal((await f.app.inject({method:'PUT',url:endpoint,headers:child.headers,payload:{expectedVersion:1,replyLanguage:'es'}})).statusCode,400);
  f.identity.disableCredential(f.child.id);
  assert.equal((await f.app.inject({method:'PUT',url:endpoint,headers:child.headers,payload:{expectedVersion:1,replyLanguage:'en'}})).statusCode,401);
 }finally{await f.close();}
});

test('family HTTP chat freezes fixed output over contrary input and automatic output follows each detected turn',async()=>{
 const f=await fixture();try{
  const talk=async(id:string,text:string,voiceLanguage:'zh'|'en'|'fr'|'de')=>{
   const member=f.login(id),conversation=f.store.createConversation(member.principal.actorId,id,'语言测试',true);
   const response=await f.app.inject({method:'POST',url:'/api/runtime/family/conversations/'+conversation.id+'/messages',headers:member.headers,payload:{text,voiceMode:true,voiceLanguage}});
   assert.equal(response.statusCode,200);assert.equal(response.json().responseLanguage,f.calls.at(-1)?.responseLanguage);return response.json().message.content;
  };
  assert.equal(await talk(f.child.id,'你好，请用中文回答','zh'),'Hello.');
  assert.equal(await talk(f.parent.id,'Hello, please answer in English','en'),'你好。');
  assert.equal(await talk(f.automatic.id,'Bonjour','fr'),'Bonjour.');
  assert.equal(await talk(f.automatic.id,'Guten Tag','de'),'Hallo.');
  assert.deepEqual(f.calls.map(call=>call.responseLanguage),['en','zh','fr','de']);
 }finally{await f.close();}
});

test('SSE reports the frozen output language before any answer segment, even for a stale client preference',async()=>{
 const f=await fixture();try{
  const member=f.login(f.child.id),conversation=f.store.createConversation(member.principal.actorId,f.child.id,'跨设备语言',true);
  const response=await f.app.inject({method:'POST',url:'/api/runtime/family/conversations/'+conversation.id+'/messages',headers:{...member.headers,accept:'text/event-stream'},payload:{text:'Bonjour',voiceLanguage:'fr',voiceMode:true}});
  assert.equal(response.statusCode,200);
  const events=response.body.split('\n\n').map(packet=>{
   const name=packet.match(/^event: (.+)$/m)?.[1],data=packet.match(/^data: (.+)$/m)?.[1];return name&&data?{name,data:JSON.parse(data)}:null;
  }).filter((value):value is {name:string;data:any}=>value!==null);
  assert.equal(events[0].name,'status');assert.equal(events[0].data.responseLanguage,'en');
  assert.equal(events.at(-1)?.name,'done');assert.equal(events.at(-1)?.data.responseLanguage,'en');
  assert.equal(events.at(-1)?.data.message.content,'Hello.');
 }finally{await f.close();}
});
