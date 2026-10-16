import assert from 'node:assert/strict';
import test from 'node:test';
import {searchFamilyKnowledge,resolveFamilyKnowledge,type FamilyKnowledgeContext} from '../../web/src/features/family/family-knowledge-client.js';
import {memberSessionSnapshot,advanceMemberSession,createMemberSessionEpoch,MEMBER_SESSION_KEY,runMemberLoginTransition} from '../../web/src/features/family/member-session.js';
import {V1Error} from '../../web/src/v1-client.js';

const queryResult=(profileId='alice')=>({actorId:'member_'+profileId,profileId,queryId:'q1',expiresAt:'2099-01-01T00:00:00.000Z',query:'私人问题不得在URL',total:1,records:[{refId:'r1',kind:'book',title:'家庭书页',quote:'准确摘录',sourceName:'已授权家庭来源',page:7,version:2,quoteKind:'published-original',notice:'已发布原文'}],retrieval:'literal-fragments',notice:'字词匹配'});
const context=(profileId='alice'):FamilyKnowledgeContext=>({profileId,session:memberSessionSnapshot(),signal:new AbortController().signal,current:()=>true});
const referenceResult=()=>({actorId:'member_alice',profileId:'alice',queryId:'q1',refId:'r1',expiresAt:'2099-01-01T00:00:00.000Z',kind:'book-page',title:'家庭书页',sourceName:'已授权家庭来源',sourceRevision:3,version:2,page:7,text:'前文😀准确摘录后文',quote:'准确摘录',quoteStart:4,contextStart:20,hasEarlierText:true,hasLaterText:true,sha256:'a'.repeat(64),verifiedSourceText:true,quoteKind:'published-original',resolvedAt:'2026-10-15T00:00:00.000Z',notice:'高亮仅为摘录'});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('member knowledge sends only two Cookie JSON requests and preserves the exact source excerpt range',async()=>{
 const original=globalThis.fetch,calls:{url:string;init:RequestInit}[]=[];globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init:init!});return response(String(input).endsWith('/query')?queryResult():referenceResult())};
 try{const scope=context(),query=await searchFamilyKnowledge('私人问题不得在URL',scope),reference=await resolveFamilyKnowledge(query.queryId,query.records[0].refId,{...scope,actorId:query.actorId});assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.url),['/api/runtime/family/knowledge/query','/api/runtime/family/knowledge/references/resolve']);assert.deepEqual(JSON.parse(String(calls[0].init.body)),{query:'私人问题不得在URL',limit:20});assert.deepEqual(JSON.parse(String(calls[1].init.body)),{queryId:'q1',refId:'r1'});for(const call of calls){assert.equal(call.init.method,'POST');assert.equal(call.init.credentials,'same-origin');assert.deepEqual(call.init.headers,{'Content-Type':'application/json'});assert.equal(call.init.signal,scope.signal);assert(!call.url.includes('私人问题'));assert(Object.keys(JSON.parse(String(call.init.body))).every(key=>!['actorId','profileId','location','path','url','scope'].includes(key)))}assert.equal(reference.text.slice(reference.quoteStart,reference.quoteStart+reference.quote.length),reference.quote);assert.equal(reference.page,7);assert.equal(reference.verifiedSourceText,true)}finally{globalThis.fetch=original}
});

test('a late old 401 body is discarded after a shared member switch and cannot invalidate a new successful query',async()=>{
 const original=globalThis.fetch;let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{entered=resolve});let call=0;
 globalThis.fetch=async()=>{if(call++===0)return {ok:false,status:401,json:async()=>{entered();await held;return {error:{code:'LOGIN_REQUIRED',message:'old session'}}}} as Response;return response(queryResult('bob'))};
 try{const old=searchFamilyKnowledge('old private question',context());await ready;advanceMemberSession();const fresh=await searchFamilyKnowledge('new question',context('bob'));assert.equal(fresh.profileId,'bob');release();await assert.rejects(old,(error:any)=>error.name==='AbortError'&&!(error instanceof V1Error));assert.equal(call,2)}finally{release();globalThis.fetch=original}
});

test('member knowledge rejects mismatched identity or a forged excerpt instead of displaying stale or unverified text',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>response(queryResult('another-member'));await assert.rejects(searchFamilyKnowledge('question',context()),(error:any)=>error instanceof V1Error&&error.code==='IDENTITY_CHANGED');globalThis.fetch=async()=>response({...referenceResult(),quoteStart:1});await assert.rejects(resolveFamilyKnowledge('q1','r1',context()),(error:any)=>error instanceof V1Error&&error.code==='INVALID_RESPONSE');globalThis.fetch=async()=>response({...referenceResult(),verifiedSourceText:false});await assert.rejects(resolveFamilyKnowledge('q1','r1',context()),(error:any)=>error instanceof V1Error&&error.code==='INVALID_RESPONSE');globalThis.fetch=async()=>response({error:{message:'reference expired'}},410);await assert.rejects(resolveFamilyKnowledge('q1','r1',context()),(error:any)=>error instanceof V1Error&&error.status===410)}finally{globalThis.fetch=original}
});

test('member epochs invalidate other tabs without rebroadcast, never contain private data, and fail honestly when storage is unavailable',()=>{
 let stored:string|null=null,writes=0;const queued:(()=>void)[]=[],listeners=new Map<string,(key:string|null)=>void>();let counter=0;
 const create=(name:string,fail=false)=>createMemberSessionEpoch({read:()=>stored,write:value=>{if(fail)throw Error('storage disabled');assert.match(value,/^00000000-0000-4000-8000-\d{12}$/);stored=value;writes++;for(const [tab,listener]of listeners)if(tab!==name)queued.push(()=>listener(MEMBER_SESSION_KEY))},nonce:()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`,subscribe:listener=>{listeners.set(name,listener);return()=>{listeners.delete(name)}}});
 const a=create('a'),b=create('b');let stoppedA=0,stoppedB=0;a.subscribe(()=>stoppedA++);b.subscribe(()=>stoppedB++);const initial=a.snapshot();const opened=create('new-tab');assert.equal(stoppedA,0,'打开已登录的新标签不能冒一次退出/换成员');assert.equal(b.advance(),true);assert.equal(a.current(initial),false,'storage事件交付前也必须拒绝旧轮次');assert.equal(stoppedB,1);assert.equal(stoppedA,0);while(queued.length)queued.shift()!();assert.equal(stoppedA,1);assert.equal(writes,1,'接收端不再写回造成广播循环');const unavailable=create('blocked',true);let localCleared=false;unavailable.subscribe(()=>{localCleared=true});assert.equal(unavailable.advance(),false);assert.equal(localCleared,true);assert.equal(writes,1);for(const channel of [a,b,opened,unavailable])channel.close();assert.equal(listeners.size,0);
});


test('a delayed old session close or logout cannot adopt another tab epoch and submit stale identity mutations',async()=>{
 for(const stage of ['closing','logout']){
  let current=true,release!:()=>void,entered!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{entered=resolve});let logoutCalls=0,loginCalls=0;
  const operation=runMemberLoginTransition({current:()=>current,closing:stage==='closing'?hold:Promise.resolve(),logout:async()=>{logoutCalls++;entered();if(stage==='logout')await hold;},login:async()=>{loginCalls++}});
  if(stage==='logout')await ready;current=false;release();await assert.rejects(operation,(error:any)=>error.name==='AbortError');assert.equal(loginCalls,0,'旧selectedProfile/secret绝不能在新成员会话中重提');assert.equal(logoutCalls,stage==='closing'?0:1,'closing等待后不得登出另一个标签的新成员');
 }
});
