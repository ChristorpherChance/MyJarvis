import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {z} from 'zod';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {registerInboxMaterials} from '../src/v1/inbox-materials.js';
import type {InboxMaterialRuntime,MaterialTextResult} from '../src/v1/inbox-material-processing.js';
import {BusinessError,type DomainHandler} from '../src/v1/types.js';
import {captureHandlers} from '../src/v1/capture-domains.js';

const prefix='/api/v1/inbox-materials/uploads',hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function deferred<T>(){let done!:(value:T)=>void;const promise=new Promise<T>(resolve=>{done=resolve});return {promise,done};}
async function until(condition:()=>boolean){const end=Date.now()+15000;while(!condition()){assert.ok(Date.now()<end,'bounded synthetic operation did not arrive');await new Promise(done=>setTimeout(done,10));}}
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-material-process-http-')),store=new Store(directory),repository=new V1Repository(store.databasePath),session=randomUUID();let app:ReturnType<typeof Fastify>,base='',current=true,recognitions=0;
 let recognition=async():Promise<MaterialTextResult>=>({text:'Synthetic callback transcript, not actual speech recognition.',engine:'fixture-asr',segments:[]});
 const policy={allowedHttpOrigins:[] as string[],allowedDirectoryRoots:[],timeoutMs:1000,maxBytes:1024*1024,maxDocuments:1};
 const runtime:InboxMaterialRuntime={principal:()=>({actorId:'server-admin',profileId:'me',administrator:true}),current:()=>current,policy:()=>policy,document:async(_bytes,_mime,sha256)=>({text:'Synthetic parsed webpage text.',engine:'fixture-document',segments:[{text:'Synthetic parsed webpage text.',location:`inbox-original://${sha256}/paragraph/1`,paragraph:1,page:null}]}),transcribe:async()=>{recognitions++;return recognition()}};
 const start=async()=>{app=Fastify();await app.register(cookie);app.setErrorHandler((error,req,reply)=>{if(error instanceof BusinessError)return reply.code(error.status).send({code:error.code,message:error.message});if(error instanceof z.ZodError)return reply.code(400).send({code:'VALIDATION'});return reply.code(500).send({code:'UNEXPECTED_TEST_ERROR',name:error.name});});registerInboxMaterials(app,repository,{directory:join(directory,'originals'),authenticated:value=>value===session,runtime});await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;};
 await start();
 const request=async(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const result=await fetch(base+path,{method,headers:{cookie:'jarvis_session='+session,...(body===undefined?{}:{'content-type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'})},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const bytes=Buffer.from(await result.arrayBuffer());let data:any;try{data=JSON.parse(bytes.toString())}catch{}return {status:result.status,body:data,bytes,headers:result.headers};};
 const upload=async(filename:string,mime:string,bytes:Buffer)=>{const id=randomUUID();assert.equal((await request(prefix,{id,filename,mime,size:bytes.length,scope:'private'})).status,200);const result=await request(`${prefix}/${id}/file`,bytes,'PUT');assert.equal(result.status,200);return result.body.data;};
 return {repository,request,upload,policy,get recognitions(){return recognitions},respond(fn:()=>Promise<MaterialTextResult>){recognition=fn},revoke(){current=false},async restart(){await app.close();await start()},async close(){await app.close();repository.close();store.close();const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-material-process-http-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});}};
}
function audio(){const b=Buffer.alloc(46);b.write('RIFF');b.writeUInt32LE(38,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(2,40);return b;}

test('real HTTP processing and review retain original evidence and refresh only derived unapproved indexes',async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('Original source wording, before manual correction.'),asset=await f.upload('source.txt','text/plain',bytes);
  const call=(domain:'inbox'|'research',command:string,payload:Record<string,any>,version=0)=>f.repository.execute(captureHandlers.find(h=>h.domain===domain)!,command,{commandId:randomUUID(),expectedVersion:version,scope:'private',payload},'server-admin',()=>undefined).data;
  const inbox=call('inbox','capture',{attachmentIds:[asset.id],kind:'idea',terminalId:'Synthetic original',origin:'manual'}),routed=call('inbox','route',{inboxId:inbox.id,target:'research'},inbox.revision),research=f.repository.read('research',routed.target.id,'server-admin')!;
  const input={commandId:randomUUID(),expectedVersion:asset.revision,operation:'extract'};const first=await f.request(`${prefix}/${asset.id}/process`,input);assert.equal(first.status,200,first.bytes.toString());const extracted=first.body.data;assert.equal(extracted.processing.status,'complete');assert.equal(extracted.extraction.text,bytes.toString());assert.equal(extracted.extraction.sourceSha256,hash(bytes));
  assert.deepEqual((await f.request(`${prefix}/${asset.id}/process`,input)).body,first.body);assert.equal((await f.request(`${prefix}/${asset.id}/process`,{...input,operation:'transcribe'})).status,409);
  const corrected='Verified corrected wording supplied by the reviewer.';const reviewed=await f.request(`${prefix}/${asset.id}/text-review`,{commandId:randomUUID(),expectedVersion:extracted.revision,text:corrected});assert.equal(reviewed.status,200);assert.equal(reviewed.body.data.extractedText,corrected);assert.equal(reviewed.body.data.extraction.text,bytes.toString());assert.equal(reviewed.body.data.textReview.sourceTextSha256,extracted.extraction.textSha256);
  assert.equal(f.repository.read('inbox',inbox.id,'server-admin')!.materialText,corrected);const indexed=f.repository.read('research',research.id,'server-admin')!;assert.equal(indexed.materialText,corrected);assert.equal(indexed.raw,research.raw,'review must not replace the original note or source description');
  const again=await f.request(`${prefix}/${asset.id}/process`,{commandId:randomUUID(),expectedVersion:reviewed.body.data.revision,operation:'extract'});assert.equal(again.status,200);assert.equal(again.body.data.extraction.text,bytes.toString(),'re-extraction must decode original bytes, never the editable search text');assert.equal(again.body.data.textReview,null);assert.equal(again.body.data.extractionHistory.at(-1).textReview.text,corrected);assert.deepEqual((await f.request(`${prefix}/${asset.id}/file`)).bytes,bytes);
 }finally{await f.close();}
});

test('concurrent same-id confirmation dispatches once and a third distinct request cannot persist a stuck running intent',async()=>{
 const f=await fixture();try{
  const assets=await Promise.all([0,1,2].map(i=>f.upload(`synthetic-${i}.wav`,'audio/wav',audio()))),gate=deferred<MaterialTextResult>();f.respond(()=>gate.promise);
  const body=(i:number)=>({commandId:randomUUID(),expectedVersion:assets[i].revision,operation:'transcribe',cloudConsent:false});const first=body(0),second=body(1),third=body(2);
  const a=f.request(`${prefix}/${assets[0].id}/process`,first),duplicate=f.request(`${prefix}/${assets[0].id}/process`,first),b=f.request(`${prefix}/${assets[1].id}/process`,second);await until(()=>f.recognitions===2);
  const rejected=await f.request(`${prefix}/${assets[2].id}/process`,third);assert.equal(rejected.status,429);assert.equal((await f.request(`${prefix}/${assets[2].id}`)).body.data.processing,undefined);
  gate.done({text:'Synthetic held ASR result.',engine:'fixture-asr'});const [aa,dd,bb]=await Promise.all([a,duplicate,b]);assert.equal(aa.status,200);assert.deepEqual(dd.body,aa.body);assert.equal(bb.status,200);assert.equal(f.recognitions,2);
  f.respond(async()=>({text:'Synthetic explicit third retry.',engine:'fixture-asr'}));const admitted=await f.request(`${prefix}/${assets[2].id}/process`,third);assert.equal(admitted.status,200);assert.equal(admitted.body.data.processing.status,'complete');assert.equal(f.recognitions,3);
 }finally{await f.close();}
});

test('failed engine outcome is durable; only an explicit new id starts another attempt',async()=>{
 const f=await fixture();try{
  const bytes=audio(),asset=await f.upload('fixture.wav','audio/wav',bytes),input={commandId:randomUUID(),expectedVersion:asset.revision,operation:'transcribe'};f.respond(async()=>{throw new BusinessError('ASR_NOT_CONFIGURED','本地识别尚未配置',503)});
  const failed=await f.request(`${prefix}/${asset.id}/process`,input);assert.equal(failed.status,200);assert.equal(failed.body.data.processing.status,'failed');assert.equal(failed.body.data.processing.error.code,'ASR_NOT_CONFIGURED');assert.deepEqual((await f.request(`${prefix}/${asset.id}/process`,input)).body,failed.body);assert.equal(f.recognitions,1);
  f.respond(async()=>({text:'Synthetic retry result.',engine:'fixture-asr'}));const retried=await f.request(`${prefix}/${asset.id}/process`,{...input,commandId:randomUUID(),expectedVersion:failed.body.data.revision});assert.equal(retried.body.data.processing.status,'complete');assert.equal(f.recognitions,2);assert.deepEqual((await f.request(`${prefix}/${asset.id}/file`)).bytes,bytes);
 }finally{await f.close();}
});

test('restart marks a persisted unfinished intent interrupted without retrying recognition',async()=>{
 const f=await fixture();try{
  const asset=await f.upload('restart.wav','audio/wav',audio()),commandId=randomUUID(),payload={id:asset.id,commandId,operation:'transcribe',cloudConsent:false};
  const seed:DomainHandler={domain:'inbox-assets',commands:[],execute:(_command,_payload,ctx)=>{const old=ctx.require('inbox-assets',asset.id);ctx.check(old);return ctx.update('inbox-assets',asset.id,{processing:{...payload,status:'running',sourceSha256:old.sha256,expectedVersion:asset.revision,startedAt:new Date().toISOString()}})}};
  f.repository.execute(seed,'begin-process',{commandId,expectedVersion:asset.revision,scope:'private',payload},'server-admin',()=>undefined);await f.restart();
  const record=(await f.request(`${prefix}/${asset.id}`)).body.data;assert.equal(record.processing.status,'interrupted');const replay=await f.request(`${prefix}/${asset.id}/process`,{commandId,expectedVersion:asset.revision,operation:'transcribe'});assert.equal(replay.status,200);assert.equal(replay.body.data.processing.status,'interrupted');assert.equal(f.recognitions,0);
 }finally{await f.close();}
});

test('explicit webpage extraction uses configured origins and saves immutable original bytes with the source',async()=>{
 const f=await fixture();let requests=0;const html=Buffer.from('<html><head><title>Synthetic page</title></head><body><article><p>Synthetic parsed webpage text.</p></article></body></html>');
 const server=createServer((req,res)=>{requests++;if(req.url==='/redirect'){res.writeHead(302,{location:'https://never-contacted.invalid/private'});res.end();return}if(req.url==='/large'){res.writeHead(200,{'content-type':'text/html','content-length':5*1024*1024});res.end();return}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html)});await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 try{
  const input={id:randomUUID().toUpperCase(),url:origin+'/page#paragraph',scope:'private'};assert.equal((await f.request('/api/v1/inbox-materials/links/extract',input)).status,403);assert.equal(requests,0);f.policy.allowedHttpOrigins.push(origin);
  const extracted=await f.request('/api/v1/inbox-materials/links/extract',input);assert.equal(extracted.status,200,extracted.bytes.toString());const asset=extracted.body.data;assert.equal(asset.id,input.id.toLowerCase());assert.equal(asset.status,'stored');assert.equal(asset.sha256,hash(html));assert.equal(asset.sourceUrl,input.url);assert.equal(asset.extraction.sourceSha256,hash(html));assert.equal(asset.mime,'text/html');assert.deepEqual((await f.request(`${prefix}/${asset.id}/file`)).bytes,html);assert.match((await f.request(`${prefix}/${asset.id}/file`)).headers.get('content-disposition')??'',/^attachment/);
  assert.deepEqual((await f.request('/api/v1/inbox-materials/links/extract',input)).body,extracted.body);assert.equal(requests,1);assert.equal((await f.request('/api/v1/inbox-materials/links/extract',{...input,url:origin+'/changed'})).status,409);
  const redirect=await f.request('/api/v1/inbox-materials/links/extract',{...input,id:randomUUID(),url:origin+'/redirect'});assert.equal(redirect.body.data.processing.status,'failed');assert.equal(redirect.body.data.processing.error.code,'CONNECTOR_REJECTED');assert.equal(requests,2);
  const large=await f.request('/api/v1/inbox-materials/links/extract',{...input,id:randomUUID(),url:origin+'/large'});assert.equal(large.body.data.processing.status,'failed');assert.equal(large.body.data.processing.error.code,'CONNECTOR_REJECTED');
  assert.equal((await f.request('/api/v1/inbox-materials/links/extract',{...input,id:randomUUID(),url:'not-a-url'})).status,400);
 }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));await f.close();}
});

test('saved webpage original survives text parsing failures without fetching again on confirmation',async()=>{
 const f=await fixture();let requests=0;const original=Buffer.from([0xff,0xfe,0,0x61]),server=createServer((_req,res)=>{requests++;res.writeHead(200,{'content-type':'text/plain'});res.end(original)});await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;f.policy.allowedHttpOrigins.push(origin);
 try{
  const input={id:randomUUID(),url:origin+'/invalid-utf8',scope:'private'},result=await f.request('/api/v1/inbox-materials/links/extract',input);assert.equal(result.status,200);const asset=result.body.data;
  assert.equal(asset.status,'stored','downloaded original remains available even though text parsing fails');assert.equal(asset.processing.status,'failed');assert.equal(asset.sha256,hash(original));assert.equal(asset.size,original.length);assert.equal(asset.extractedText,'');assert.equal(asset.sourceUrl,input.url);assert.deepEqual((await f.request(`${prefix}/${asset.id}/file`)).bytes,original);
  assert.deepEqual((await f.request('/api/v1/inbox-materials/links/extract',input)).body,result.body);assert.equal(requests,1);
 }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));await f.close();}
});
