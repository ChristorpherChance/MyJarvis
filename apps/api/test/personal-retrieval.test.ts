import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
import {createApp} from '../src/app.js';
import {PiService,type PiCallbacks,type PiRunInput} from '../src/pi.js';
import {V1Repository} from '../src/v1/repository.js';
import type {Domain,Scope} from '../src/v1/types.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const tools=(directory:string,callbacks:PiCallbacks)=>(new PiService(directory,callbacks) as unknown as {businessTools():ToolDefinition[]}).businessTools();
async function call(tool:ToolDefinition,parameters:Record<string,unknown>={}){
  const result=await tool.execute(randomUUID(),parameters,undefined,undefined,{} as Parameters<typeof tool.execute>[4]);
  const content=result.content.find(c=>c.type==='text');assert(content?.type==='text');return JSON.parse(content.text);
}
const empty={listProjects:()=>[],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[]};

test('only knowledge and memory gain optional queries; old list calls and explicit unavailable search stay truthful',async()=>{
  const records=Array.from({length:55},(_,i)=>({id:`old-${i+1}`,text:'List content'})),callbacks={...empty,listKnowledge:()=>records,listMemory:()=>records};
  const definitions=tools(join(tmpdir(),'jarvis-retrieval-tool-contract'),callbacks);
  for(const name of ['jarvis_knowledge','jarvis_memory']){
    const tool=definitions.find(t=>t.name===name)!;
    assert.deepEqual(Object.keys((tool.parameters as any).properties).sort(),['limit','query']);
    assert.equal((await call(tool)).records.length,20);assert.equal((await call(tool)).total,55);
    assert.equal((await call(tool,{limit:50})).records.length,50);
    const unavailable=await call(tool,{query:'Missing query support'});assert.deepEqual(unavailable.records,[]);assert.match(unavailable.notice,/尚未配置/);
  }
  assert.deepEqual(Object.keys((definitions.find(t=>t.name==='jarvis_projects')!.parameters as any).properties),['limit']);
});

class FakePi {
  calls:PiRunInput[]=[];
  async initialize(){} health(){return {configured:true};} modelIsLocal(){return true;}
  async run(input:PiRunInput){this.calls.push(input);return {text:'隔离测试回答。',status:'complete' as const};}
  async abort(){} async dispose(){}
}
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'jarvis-personal-retrieval-')),pi=new FakePi();
  const runtime=await createApp({dataDir:directory,pi:pi as unknown as PiService,webDir:join(directory,'no-web'),pythonExecutable:join(directory,'no-python')});
  // A separate real repository writes durable fixtures without changing the application's receipt validator.
  const seedRepository=new V1Repository(runtime.store.databasePath);
  const seed=(domain:Domain,values:Record<string,unknown>,scope:Scope='family',actorId='server-admin')=>seedRepository.execute({domain,commands:['fixture'],execute:(_c,_p,ctx)=>ctx.create(domain,{...values,createdAt:ctx.now,updatedAt:ctx.now})},'fixture',{commandId:randomUUID(),expectedVersion:0,scope,payload:{}},actorId,()=>undefined).data;
  const update=(domain:Domain,id:string,patch:Record<string,unknown>,actorId='server-admin')=>{const old=seedRepository.read(domain,id,actorId)!;return seedRepository.execute({domain,commands:['fixture'],execute:(_c,_p,ctx)=>ctx.update(domain,id,{...patch,updatedAt:ctx.now})},'fixture',{commandId:randomUUID(),expectedVersion:old.revision,scope:old.scope,payload:{}},actorId,()=>undefined).data;};
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Personal-retrieval-isolated-fixture-passphrase'}});assert.equal(setup.statusCode,200,setup.body);
  const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  const member=runtime.store.create('members',{name:'隔离检索成员',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});
  runtime.identity.setCredential(member.id,'123456','pin');const login=runtime.identity.login(member.id,'123456','retrieval-fixture');
  const callbacks=runtime.identity.options.callbacksForMember!(member.id,login.principal.actorId,login.principal);
  return {directory,runtime,pi,headers,member,login,callbacks,seed,update,async close(){seedRepository.close();await runtime.app.close();const target=resolve(directory);assert(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-personal-retrieval-'));await rm(target,{recursive:true,force:true});}};
}

test('real tool retrieves the 51st allowed book and complete synchronized text, with exact citations and current source/version checks',async()=>{
  const f=await fixture();try{
    const source=f.seed('sources',{kind:'source',name:'共享原件',active:true,authorized:true,version:'1',documents:[]});
    let target:any;
    for(let i=1;i<=55;i++){const text=i===51?'An ARCHIVE-NEEDLE is preserved verbatim on this page.':`Ordinary recordbase paragraph ${i}.`;const book=f.seed('books',{kind:'book',title:`卷${i}`,status:'published',source:source.id,version:'1.0',pageTexts:[{page:7,text}]});if(i===51)target=book;}
    const tool=tools(f.directory,f.callbacks).find(t=>t.name==='jarvis_knowledge')!;
    const found=await call(tool,{query:'ARCHIVE-NEEDLE',limit:1});assert.equal(found.total,1);assert.equal(found.records[0].id,target.id);
    const original=target.pageTexts[0].text;assert.equal(found.records[0].quote,original);assert.equal(found.records[0].sha256,hash(original));assert.equal(found.records[0].location,`book://${target.id}/1.0/page/7`);assert.equal(found.records[0].version,'1.0');
    assert.deepEqual((await call(tool,{query:'NONEXISTENT-ZYGOMORPHIC'})).records,[]);
    const many=await call(tool,{query:'recordbase',limit:2});assert.equal(many.total,54);assert.equal(many.records.length,2);
    const deep='x'.repeat(9100)+'\nDEEP-SYNC-NEEDLE is after the old list truncation.';
    const synchronized=f.update('sources',source.id,{documents:[{id:'deep-document',title:'深处资料',text:deep,location:'https://fixture.invalid/archive#deep',sha256:hash(deep),metadata:{}}]});
    const deepResult=(await call(tool,{query:'DEEP-SYNC-NEEDLE'})).records[0];assert(deepResult.quote.includes('DEEP-SYNC-NEEDLE'));assert.equal(deep.slice(deepResult.offset,deepResult.offset+deepResult.quote.length),deepResult.quote);assert.equal(deepResult.sha256,hash(deep));assert.equal(deepResult.sourceRevision,synchronized.revision);
    f.update('books',target.id,{status:'review',version:'1.1',pageTexts:[{page:7,text:'Replacement CURRENT-EDITION passage.'}]});assert.deepEqual((await call(tool,{query:'ARCHIVE-NEEDLE'})).records,[]);
    f.update('books',target.id,{status:'published'});const changed=(await call(tool,{query:'CURRENT-EDITION'})).records[0];assert.equal(changed.version,'1.1');assert.equal(changed.location,`book://${target.id}/1.1/page/7`);
    f.update('sources',source.id,{authorized:false});assert.deepEqual((await call(tool,{query:'CURRENT-EDITION'})).records,[]);assert.deepEqual((await call(tool,{query:'DEEP-SYNC-NEEDLE'})).records,[]);
    const privateSource=f.seed('sources',{kind:'source',name:'私人',active:true,authorized:true,documents:[{id:'private-doc',title:'私人',text:'PRIVATE-ONLY-NEEDLE',location:'https://fixture.invalid/private',metadata:{}}]},'private');
    assert(privateSource.id);assert.deepEqual((await call(tool,{query:'PRIVATE-ONLY-NEEDLE'})).records,[]);
    const owner=f.runtime.identity.options.callbacksForMember!('me','server-admin');assert.equal(owner.searchKnowledge!('PRIVATE-ONLY-NEEDLE').length,1);
  }finally{await f.close();}
});

test('51st confirmed memory and its source are searchable; candidates, forgotten, stale status, wrong profile and other owners never enter results',async()=>{
  const f=await fixture();try{
    const actor=f.login.principal.actorId;let target:any;
    for(let i=1;i<=55;i++){const memory=f.seed('memory',{kind:'memory',profileId:'me',status:'active',text:i===51?'I prefer VIOLET-QUARTZ notebooks.':`Confirmed note ${i}.`,category:'偏好',source:i===51?'Evidence: EVIDENCE-ONLY-MARKER from my confirmed statement.':'本人确认',confirmedAt:new Date().toISOString(),nextReviewAt:'2020-01-01T00:00:00.000Z'},'private',actor);if(i===51)target=memory;}
    for(const status of ['candidate','forgotten','rejected','expired'])f.seed('memory',{kind:'memory',profileId:'me',status,text:'EXCLUDED-NEEDLE',category:'偏好',source:'EXCLUDED-NEEDLE'},'private',actor);
    f.seed('memory',{kind:'memory',profileId:'someone-else',status:'active',text:'EXCLUDED-NEEDLE'},'private',actor);
    f.seed('memory',{kind:'memory',profileId:'me',status:'active',text:'EXCLUDED-NEEDLE'},'private','member_other');
    f.seed('memory',{kind:'memory',profileId:'me',status:'active',text:'EXCLUDED-NEEDLE'},'private','server-admin');
    const tool=tools(f.directory,f.callbacks).find(t=>t.name==='jarvis_memory')!;
    const found=(await call(tool,{query:'VIOLET-QUARTZ',limit:1})).records;assert.equal(found.length,1);assert.equal(found[0].id,target.id);assert.equal(found[0].quote,target.text);assert.equal(found[0].revision,1);assert.equal(found[0].location,`memory://${target.id}/revision/1/text`);
    const evidence=(await call(tool,{query:'EVIDENCE-ONLY-MARKER'})).records[0];assert.equal(evidence.matchedField,'source');assert.equal(evidence.quote,target.source);
    assert.deepEqual((await call(tool,{query:'EXCLUDED-NEEDLE'})).records,[]);assert.deepEqual((await call(tool,{query:'NONEXISTENT-ZYGOMORPHIC'})).records,[]);
    f.update('memory',target.id,{text:'I now prefer CURRENT-CORRECTION notebooks.',source:'本人明确更正',history:[{text:target.text}],previousTexts:[target.text]},actor);
    assert.deepEqual((await call(tool,{query:'VIOLET-QUARTZ'})).records,[]);const corrected=(await call(tool,{query:'CURRENT-CORRECTION'})).records[0];assert.equal(corrected.revision,2);assert.equal(corrected.text,'I now prefer CURRENT-CORRECTION notebooks.');
    f.update('memory',target.id,{status:'forgotten',text:null,source:null},actor);assert.deepEqual((await call(tool,{query:'CURRENT-CORRECTION'})).records,[]);
  }finally{await f.close();}
});

test('HTTP and voice-mode callbacks keep the authenticated member; old member and administrator callbacks reject revoked sessions',async()=>{
  const f=await fixture();try{
    const memberHeaders={cookie:'jarvis_member_session='+f.login.token};
    for(const voiceMode of [false,true]){
      const conversation=f.runtime.store.createConversation(f.login.principal.actorId,f.member.id,'本人问题',true);
      const response=await f.runtime.app.inject({method:'POST',url:`/api/runtime/family/conversations/${conversation.id}/messages`,headers:memberHeaders,payload:{text:'查我的记忆',voiceMode}});assert.equal(response.statusCode,200,response.body);
      const input=f.pi.calls.at(-1)!;assert.equal(input.actorId,f.login.principal.actorId);assert.equal(input.voiceMode,voiceMode);assert(input.businessCallbacks?.searchMemory);assert.deepEqual(input.businessCallbacks.searchMemory!('missing'),[]);
    }
    const captured=f.pi.calls.map(input=>input.businessCallbacks!);f.runtime.identity.disableCredential(f.member.id);
    for(const callbacks of captured){assert.throws(()=>callbacks.searchMemory!('missing'),(e:any)=>e.code==='IDENTITY_CHANGED');assert.throws(()=>callbacks.searchKnowledge!('missing'),(e:any)=>e.code==='IDENTITY_CHANGED');assert.throws(()=>callbacks.listMemory!(),(e:any)=>e.code==='IDENTITY_CHANGED');}
    const conversation=f.runtime.store.createConversation('server-admin','owner','管理问题',false);
    const response=await f.runtime.app.inject({method:'POST',url:`/api/chat/conversations/${conversation.id}/stream`,headers:f.headers,payload:{text:'查知识'}});assert.equal(response.statusCode,200,response.body);
    const administrator=f.pi.calls.at(-1)!.businessCallbacks!;assert(administrator.searchKnowledge);assert.deepEqual(administrator.searchMemory!('missing'),[]);
    await f.runtime.app.inject({method:'POST',url:'/api/auth/logout',headers:f.headers});
    assert.throws(()=>administrator.searchMemory!('missing'),(e:any)=>e.code==='IDENTITY_CHANGED');assert.throws(()=>administrator.searchKnowledge!('missing'),(e:any)=>e.code==='IDENTITY_CHANGED');
  }finally{await f.close();}
});

test('real memory edit preserves historical source but excludes its superseded evidence from current recall',async()=>{
  const f=await fixture();try{
    const actor=f.login.principal.actorId,original='I prefer OLD-COBALT notebooks.',source='对话 fixture-conversation；证据：'+original;
    const command=(name:string,payload:Record<string,unknown>,expectedVersion=0)=>f.runtime.memory.command(name,{commandId:randomUUID(),expectedVersion,scope:'private',payload},actor).data;
    const candidate=command('candidate',{text:original,category:'日常偏好',source});
    const confirmed=command('confirm',{memoryId:candidate.id,confirmed:true},candidate.revision);
    const tool=tools(f.directory,f.callbacks).find(t=>t.name==='jarvis_memory')!;
    assert.equal((await call(tool,{query:'OLD-COBALT'})).records[0].id,candidate.id);
    const edited=command('edit',{memoryId:candidate.id,text:'I now prefer NEW-VERMILION notebooks.',confirmed:true},confirmed.revision);
    assert.equal(edited.source,source,'正式更正不得改写旧来源证据');
    assert.deepEqual((await call(tool,{query:'OLD-COBALT'})).records,[],'旧证据仅用于历史溯源，不能召回已更正偏好');
    const current=(await call(tool,{query:'NEW-VERMILION'})).records[0];
    assert.equal(current.id,candidate.id);assert.equal(current.text,edited.text);assert.equal(current.revision,edited.revision);assert.equal(current.source,source);
    assert.equal(current.sourceEvidenceStatus,'historical-before-edit');assert.match(current.sourceEvidenceNotice,/历史证据/);assert.equal(current.matchedField,'text');
    assert.equal((await call(tool,{query:'日常偏好'})).records[0].id,candidate.id);
  }finally{await f.close();}
});

test('redacted retrieval excerpts keep source fingerprints and explicitly disable exact displayed-quote positioning',async()=>{
  const original='A public lookup phrase followed by Bearer fixture-private-credential and sk-fixture-private-key.',digest=hash(original);
  const record={id:'redacted-fixture',text:original,quote:original,originalQuote:original,sha256:digest,location:'book://fixture/1.0/page/7',offset:31};
  const callbacks={...empty,listKnowledge:()=>[record],listMemory:()=>[record],searchKnowledge:()=>[record],searchMemory:()=>[record]};
  const definitions=tools(join(tmpdir(),'jarvis-redacted-retrieval-contract'),callbacks);
  for(const name of ['jarvis_knowledge','jarvis_memory']){
    const result=await call(definitions.find(t=>t.name===name)!,{query:'public lookup phrase'}),visible=result.records[0];
    assert.doesNotMatch(visible.quote,/fixture-private-credential|sk-fixture-private-key/);assert.match(visible.quote,/\[REDACTED\]/);
    assert.equal(visible.quoteRedacted,true);assert.equal(visible.exactQuote,false);assert.equal(visible.originalQuoteRedacted,true);assert.equal(visible.originalExactQuote,false);
    assert.equal(visible.sourceSha256,digest);assert.equal(visible.sha256Scope,'complete-source-text');assert.equal(visible.offset,31);assert.equal(visible.location,record.location);assert.match(result.notice,/不能按展示长度逐字定位/);
  }
});
