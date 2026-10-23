import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';import {searchAuthorizedKnowledge} from '../src/runtime/personal-retrieval.js';
import {assertDto} from '../src/v1/contract.js';
test('real app publishes an original text document, searches exact segments, resolves current references and rejects revoked sources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'knowledge-ingestion-integration-')),pi:any={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false}),run:async()=>{throw Error('NO_MODEL')}};
 const runtime=await createApp({dataDir:dir,pi,webDir:join(dir,'none')});
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'isolated-ingestion-test-passphrase'}});assert.equal(setup.statusCode,200);const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  const req=async(url:string,payload?:any,method:any=payload===undefined?'GET':'POST')=>{const r=await runtime.app.inject({url,method,headers,payload});assert.equal(r.statusCode,200,r.body);return r.json()};
  const sourceId=randomUUID(),seed:any={domain:'sources',commands:['fixture'],execute:(_c:any,p:any,c:any)=>c.create('sources',{kind:'source',name:'私有资料',active:true,authorized:true,mode:'local',endpoint:'local://knowledge',documents:[]},sourceId)};
  const source=runtime.v1.execute(seed,'fixture',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{}},'server-admin',()=>undefined).data;
  const assetId=randomUUID(),text='本地文档的可核对正文。\n\n入库测试关键字：知行合一。',bytes=Buffer.from(text);
  await req('/api/v1/inbox-materials/uploads',{id:assetId,filename:'fixture.md',mime:'text/markdown',size:bytes.length,scope:'private'});
  const uploaded=await runtime.app.inject({method:'PUT',url:'/api/v1/inbox-materials/uploads/'+assetId+'/file',headers:{...headers,'content-type':'application/octet-stream'},payload:bytes});assert.equal(uploaded.statusCode,200,uploaded.body);
  const created=(await req('/api/v1/knowledge/documents',{commandId:randomUUID(),expectedVersion:0,scope:'private',sourceId,assetId,title:'原件闭环'})).data;assertDto('KnowledgeDocumentRecord',created);
  assert.equal(searchAuthorizedKnowledge(runtime.v1,'server-admin','知行合一').length,0);
  const reviewed=(await req('/api/v1/knowledge/documents/'+created.id+'/review',{commandId:randomUUID(),expectedVersion:created.revision,confirmed:true,evidence:'逐段与合成原件比对'})).data;
  const published=(await req('/api/v1/knowledge/documents/'+created.id+'/publish',{commandId:randomUUID(),expectedVersion:reviewed.revision,confirmed:true})).data;
  const results=searchAuthorizedKnowledge(runtime.v1,'server-admin','知行合一');assert.equal(results[0].kind,'knowledge-document');assert.equal(results[0].page,undefined);assert.equal(searchAuthorizedKnowledge(runtime.v1,'server-admin','知行合一',true).length,0);
  const query=await req('/api/v1/knowledge/sources/commands/query',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{query:'知行合一',mode:'local'}});const hit=query.data.results.find((h:any)=>h.documentId===created.id);assert(hit);
  const reference={queryId:query.data.id,source:sourceId,location:hit.location,sha256:hit.sha256};const context=await req('/api/v1/knowledge/references/resolve',reference);assert.equal(context.kind,'reviewed-document');assert(context.text.includes('知行合一'));assertDto('KnowledgeReferenceContext',context);
  const usage=await req('/api/v1/inbox-materials/uploads/'+assetId+'/usage');assert(usage.data.references.some((r:any)=>r.id===created.id));assert.equal(usage.data.deleteAllowed,false);
  const revoke:any={domain:'sources',commands:['fixture'],execute:(_c:any,_p:any,c:any)=>c.update('sources',sourceId,{authorized:false})};runtime.v1.execute(revoke,'fixture',{commandId:randomUUID(),expectedVersion:source.revision,scope:'private',payload:{}},'server-admin',()=>undefined);
  assert.equal(searchAuthorizedKnowledge(runtime.v1,'server-admin','知行合一').length,0);
  const old=await runtime.app.inject({method:'POST',url:'/api/v1/knowledge/references/resolve',headers,payload:reference});assert.equal(old.statusCode,403);
  assert.equal(published.status,'published');
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true})}
});
