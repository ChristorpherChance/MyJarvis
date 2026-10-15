import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {ZodError} from 'zod';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {KnowledgeRuntime,registerKnowledgeRuntime} from '../src/runtime/knowledge-runtime.js';
import {BusinessError,type DomainHandler} from '../src/v1/types.js';

const actor='server-admin',sha=(text:string)=>createHash('sha256').update(text).digest('hex');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'jarvis-reference-http-')),store=new Store(root),repo=new V1Repository(store.databasePath),session=randomUUID();
 let modelCalls=0;const runtime=new KnowledgeRuntime(repo,{health:()=>({configured:false}),run:async()=>{modelCalls++;throw Error('No model in reference tests')},abort:async()=>{}} as any,{uploadsDirectory:join(root,'uploads'),workDirectory:join(root,'work')});
 const app=Fastify();await app.register(cookie);app.setErrorHandler((e,_req,reply)=>{if(e instanceof BusinessError)return reply.code(e.status).send({code:e.code,message:e.message});if(e instanceof ZodError)return reply.code(400).send({code:'VALIDATION'});return reply.code(500).send({code:'UNKNOWN'});});registerKnowledgeRuntime(app,runtime,{authenticated:value=>value===session});await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address!=='string');
 const seed:DomainHandler={domain:'sources',commands:[],execute(_command,p,ctx){if(p.patch)return ctx.update(p.domain,p.id,p.patch);return ctx.create(p.domain,p.body,p.id);}};
 const set=(domain:'sources'|'books',id:string,body:any,patch=false)=>repo.execute(seed,'synthetic-fixture',{commandId:randomUUID(),expectedVersion:patch?repo.read(domain,id,actor)!.revision:0,scope:'family',payload:{domain,id,...(patch?{patch:body}:{body})}},actor,()=>undefined).data;
 const query=async(text:string,mode='local')=>{const receipt=await runtime.dispatch('sources','query',{commandId:randomUUID(),expectedVersion:0,scope:'family',payload:{query:text,mode}},actor);assert.ok(receipt);return receipt.data;};
 const request=async(body:unknown,authenticated=true,memberCookie?:string)=>{const res=await fetch(`http://127.0.0.1:${address.port}/api/v1/knowledge/references/resolve`,{method:'POST',headers:{'content-type':'application/json',...(authenticated?{cookie:'jarvis_session='+session+(memberCookie!==undefined?'; jarvis_member_session='+memberCookie:'')}:{})},body:JSON.stringify(body)});return {status:res.status,data:await res.json() as any,cache:res.headers.get('cache-control')};};
 const reference=(q:any,index=0)=>({queryId:q.id,source:q.results[index].source,location:q.results[index].location,sha256:q.results[index].sha256});
 return {repo,runtime,set,query,request,reference,async close(){await app.close();await runtime.close();repo.close();store.close();assert.equal(modelCalls,0);const target=resolve(root);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-reference-http-'));await rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});}};
}

test('trusted book reference rereads current authorization, exact page/hash/version and bounded context',async()=>{
 const f=await fixture();try{
  const source=randomUUID(),book=randomUUID(),text='前文'.repeat(3000)+'REFERENCE-IRIS 窗边的鸢尾花。'+'后文'.repeat(3000);
  f.set('sources',source,{kind:'source',active:true,authorized:true,mode:'local',name:'自行生成书目来源',documents:[]});f.set('books',book,{kind:'book',source,status:'published',title:'合成书目',version:2,pageTexts:[{page:7,text}]});
  const q=await f.query('REFERENCE-IRIS'),ref=f.reference(q),opened=await f.request(ref);assert.equal(opened.status,200);assert.match(opened.cache??'',/no-store/);assert.equal(opened.data.kind,'book-page');assert.equal(opened.data.page,7);assert.equal(opened.data.version,2);assert.equal(opened.data.sha256,sha(text));assert.equal(opened.data.verifiedSourceText,true);assert.equal(opened.data.text.slice(opened.data.quoteStart,opened.data.quoteStart+opened.data.quote.length),opened.data.quote);assert.equal(text.slice(opened.data.contextStart,opened.data.contextStart+opened.data.text.length),opened.data.text);assert.ok(opened.data.text.length<=3602);assert.equal(opened.data.hasEarlierText,true);assert.equal(opened.data.hasLaterText,true);
  assert.equal((await f.request(ref,false)).status,401);assert.equal((await f.request({...ref,sha256:'0'.repeat(64)})).status,404);assert.equal((await f.request({...ref,queryId:randomUUID()})).status,404);
  f.set('books',book,{version:3},true);assert.equal((await f.request(ref)).status,409);f.set('books',book,{version:2,status:'draft'},true);assert.equal((await f.request(ref)).status,403);f.set('sources',source,{authorized:false},true);const revoked=await f.request(ref);assert.equal(revoked.status,403);assert.equal(revoked.data.text,undefined);
 }finally{await f.close();}
});

test('stored source opens verified text, rejects changed bodies and never treats title match as word offset',async()=>{
 const f=await fixture();try{
  const source=randomUUID(),location='https://example.invalid/synthetic#paragraph-2',text='合成正文没有标题关键词，但依然保留原文摘录。';
  f.set('sources',source,{kind:'source',active:true,authorized:true,mode:'local',name:'合成外部资料',version:'snapshot-1',documents:[{id:'one',title:'REFERENCE-TITLE',text,location,sha256:sha(text)}]});
  const q=await f.query('REFERENCE-TITLE'),ref=f.reference(q),opened=await f.request(ref);assert.equal(opened.status,200);assert.equal(opened.data.kind,'stored-document');assert.equal(opened.data.text,text);assert.equal(opened.data.quoteOffset,0);assert.equal(opened.data.externalUrl,location);assert.equal(opened.data.verifiedSourceText,true);assert.match(opened.data.notice,/不一定是查询词/);
  f.set('sources',source,{documents:[{id:'one',title:'REFERENCE-TITLE',text:'发生变化的正文',location,sha256:sha('发生变化的正文')}]},true);assert.equal((await f.request(ref)).status,409);assert.equal((await f.request({...ref,url:'http://127.0.0.1/untrusted'})).status,400);
 }finally{await f.close();}
});

test('live reference is explicitly a retained excerpt, does not refetch, and binds the saved source revision',async()=>{
 let reads=0;const host=createServer((_req,res)=>{reads++;res.setHeader('content-type','text/plain');res.end('参考上下文 '.repeat(500)+'REFERENCE-LIVE 只用于本机来源。'+' 末尾'.repeat(500));});await new Promise<void>(done=>host.listen(0,'127.0.0.1',done));const address=host.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`,f=await fixture();
 try{
  const configuration=f.runtime.configuration();await f.runtime.configure({commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{configuration:{...configuration,allowedHttpOrigins:[origin]}}});const source=randomUUID();f.set('sources',source,{kind:'source',active:true,authorized:true,mode:'live',name:'本机实时来源',adapter:'http-text',endpoint:origin+'/source',documents:[]});
  const q=await f.query('REFERENCE-LIVE','live'),ref=f.reference(q);assert.equal(reads,1);const opened=await f.request(ref);assert.equal(opened.status,200,JSON.stringify(opened.data));assert.equal(opened.data.kind,'query-excerpt');assert.equal(opened.data.verifiedSourceText,false);assert.equal(opened.data.text,q.results[0].text);assert.equal(opened.data.quoteStart,0);assert.match(opened.data.notice,/当时检索摘录/);assert.equal(reads,1);
  f.set('sources',source,{name:'配置已修订'},true);assert.equal((await f.request(ref)).status,409);assert.equal(reads,1);f.set('sources',source,{active:false},true);assert.equal((await f.request(ref)).status,403);
 }finally{await f.close();host.closeAllConnections();await new Promise<void>(done=>host.close(()=>done()));}
});

test('source revision is frozen before a later live source await and changed configurations cannot be rebound',async()=>{
 let reached!:()=>void,release!:()=>void;const entered=new Promise<void>(done=>{reached=done}),resume=new Promise<void>(done=>{release=done});
 const host=createServer(async(req,res)=>{if(req.url==='/second'){reached();await resume;}res.setHeader('content-type','text/plain');res.end('REFERENCE-RACE 合成来源正文。');});await new Promise<void>(done=>host.listen(0,'127.0.0.1',done));const address=host.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`,f=await fixture();
 try{
  const configuration=f.runtime.configuration();await f.runtime.configure({commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{configuration:{...configuration,allowedHttpOrigins:[origin]}}});
  const first=randomUUID();for(const [id,path] of [[first,'first'],[randomUUID(),'second']])f.set('sources',id,{kind:'source',active:true,authorized:true,mode:'live',name:'合成来源',adapter:'http-text',endpoint:origin+'/'+path,documents:[]});
  const pending=f.query('REFERENCE-RACE','live');const timeout=setTimeout(()=>release(),5000);await entered;f.set('sources',first,{endpoint:origin+'/changed'},true);release();clearTimeout(timeout);
  await assert.rejects(pending,(error:any)=>error instanceof BusinessError&&error.status===409);assert.equal(f.repo.list('sources',actor).filter(record=>record.kind==='query').length,0);
 }finally{release();await f.close();host.closeAllConnections();await new Promise<void>(done=>host.close(()=>done()));}
});

test('a member cookie cannot borrow an administrator cookie to resolve an administrator citation',async()=>{
 const f=await fixture();try{
  const source=randomUUID(),text='OWNER-CITATION 合成管理员检索摘录。';f.set('sources',source,{kind:'source',active:true,authorized:true,mode:'local',name:'合成管理员来源',documents:[{id:'owner',title:'合成来源',text,location:'local://owner-doc',sha256:sha(text)}]});const q=await f.query('OWNER-CITATION'),ref=f.reference(q);
  const mixed=await f.request(ref,true,randomUUID());assert.equal(mixed.status,403);assert.equal(mixed.data.text,undefined);assert.doesNotMatch(JSON.stringify(mixed.data),/OWNER-CITATION/);assert.equal((await f.request(ref,true,'')).status,403);assert.equal((await f.request(ref)).status,200);
 }finally{await f.close();}
});
