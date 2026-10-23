import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
const pythonExecutable=process.env.JARVIS_KNOWLEDGE_PYTHON??process.env.JARVIS_PYTHON??'python3';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import type {BusinessRecord,Domain,Scope} from '../src/v1/types.js';
import {parseInboxDocument} from '../src/runtime/inbox-document-parser.js';

const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
async function hasDocumentStdlibPython(python=pythonExecutable){try{await execFileAsync(python,['-I','-c','import zipfile, xml.etree.ElementTree, html.parser'],{timeout:10000});return true;}catch{return false;}}
const docxMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function fixture(python=pythonExecutable){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-ingestion-boundaries-'));let modelCalls=0;
 const pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false}),run:async()=>{modelCalls++;throw Error('Fake model must not be called');},abort:async()=>{}} as unknown as PiService;
 const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'no-web'),pythonExecutable:python});
 try{
  await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  const request=async(path:string,body?:unknown,auth='',method=body===undefined?'GET':'POST',headers:Record<string,string>={})=>{const response=await fetch(base+path,{method,headers:{...(auth?{cookie:auth}:{}),...(body===undefined||Buffer.isBuffer(body)?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});const bytes=Buffer.from(await response.arrayBuffer());let data:any;try{data=JSON.parse(bytes.toString('utf8'))}catch{}return {status:response.status,data,bytes,raw:bytes.toString('utf8'),headers:response.headers};};
  const setup=await request('/api/auth/setup',{password:randomUUID()+'-isolated'});assert.equal(setup.status,200,setup.raw);const admin=setup.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('jarvis_session='));assert.ok(admin);
  const alice=runtime.store.create('members',{name:'边界合成成员甲',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'}),bob=runtime.store.create('members',{name:'边界合成成员乙',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});runtime.identity.setCredential(alice.id,'123456','pin');runtime.identity.setCredential(bob.id,'234567','pin');
  const login=async(id=alice.id,pin='123456')=>{const result=await request('/api/runtime/identity/login',{profileId:id,credential:pin});assert.equal(result.status,200,result.raw);const cookie=result.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('jarvis_member_session='));assert.ok(cookie);return cookie;};
  const seeds=runtime.v1;
  const seed=(domain:Domain,values:Record<string,unknown>,scope:Scope='family',actor='server-admin')=>seeds.execute({domain,commands:[],execute:(_c,_p,ctx)=>ctx.create(domain,{...values,createdAt:ctx.now,updatedAt:ctx.now})},'synthetic-fixture',{commandId:randomUUID(),expectedVersion:0,scope,payload:{}},actor,()=>undefined).data;
  const mutate=(domain:Domain,record:BusinessRecord,values:Record<string,unknown>)=>seeds.execute({domain,commands:[],execute:(_c,_p,ctx)=>ctx.update(domain,record.id,values)},'synthetic-update',{commandId:randomUUID(),expectedVersion:record.revision,scope:record.scope,payload:{}},record.ownerId,()=>undefined).data;
  const post=(path:string,body:unknown,auth=admin!)=>request(path,body,auth);
  return {directory,runtime,request,post,admin:admin!,alice,bob,login,seed,mutate,get modelCalls(){return modelCalls;},async close(){try{await runtime.app.close();}finally{const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-ingestion-boundaries-'));await rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});}assert.equal(modelCalls,0,'fake model invocation is forbidden');}};
 }catch(error){await runtime.app.close();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-ingestion-boundaries-'));await rm(target,{recursive:true,force:true});throw error;}
}

async function uploaded(f:Awaited<ReturnType<typeof fixture>>,bytes:Buffer,filename:string,mime:string,scope:Scope='family'){
 const id=randomUUID(),prepared=await f.post('/api/v1/inbox-materials/uploads',{id,filename,mime,size:bytes.length,scope});assert.equal(prepared.status,200,prepared.raw);
 const put=await f.request(`/api/v1/inbox-materials/uploads/${id}/file`,bytes,f.admin,'PUT',{'content-type':'application/octet-stream'});assert.equal(put.status,200,put.raw);return {id,record:put.data.data};
}
async function createReviewPublish(f:Awaited<ReturnType<typeof fixture>>,sourceId:string,assetId:string,scope:Scope,title:string){
 const created=await f.post('/api/v1/knowledge/documents',{commandId:randomUUID(),expectedVersion:0,scope,sourceId,assetId,title});assert.equal(created.status,200,created.raw);const draft=created.data.data;
 const reviewed=await f.post(`/api/v1/knowledge/documents/${draft.id}/review`,{commandId:randomUUID(),expectedVersion:draft.revision,confirmed:true,evidence:'人工逐段对照隔离测试实际原件'});assert.equal(reviewed.status,200,reviewed.raw);
 const published=await f.post(`/api/v1/knowledge/documents/${draft.id}/publish`,{commandId:randomUUID(),expectedVersion:reviewed.data.data.revision,confirmed:true});assert.equal(published.status,200,published.raw);return published.data.data;
}

test('family shared document publish is retrievable and revocation fails closed across HTTP references',{timeout:90000},async()=>{
 const f=await fixture();try{
  const source=f.seed('sources',{kind:'source',name:'合成家庭共享来源',active:true,authorized:true,mode:'local',endpoint:'local://family-fixture',documents:[]});
  const body='家庭共享原件正文。家庭检索边界标记：同源同范围共享。';const asset=await uploaded(f,Buffer.from(body),'family-source.txt','text/plain');
  const published=await createReviewPublish(f,source.id,asset.id,'family','家庭共享已审文档');assert.equal(published.status,'published');assert.equal(published.scope,'family');
  const alice=await f.login(),bob=await f.login(f.bob.id,'234567');
  const query=await f.request('/api/runtime/family/knowledge/query',{query:'同源同范围共享'},alice);assert.equal(query.status,200,query.raw);const found=query.data.records.find((r:any)=>r.kind==='knowledge-document');assert.ok(found,query.raw);assert.equal(found.quoteKind,'reviewed-document');assert.equal(found.title,'家庭共享已审文档');
  const resolved=await f.request('/api/runtime/family/knowledge/references/resolve',{queryId:query.data.queryId,refId:found.refId},alice);assert.equal(resolved.status,200,resolved.raw);assert.equal(resolved.data.kind,'reviewed-document');assert.equal(resolved.data.quoteKind,'reviewed-document');assert.equal(resolved.data.sha256,published.segments[0].sha256);assert.equal(resolved.data.text.slice(resolved.data.quoteStart,resolved.data.quoteStart+resolved.data.quote.length),resolved.data.quote);assert.match(resolved.data.text,/同源同范围共享/);
  const bobQuery=await f.request('/api/runtime/family/knowledge/query',{query:'同源同范围共享'},bob);assert.equal(bobQuery.status,200,bobQuery.raw);assert.equal(bobQuery.data.records[0]?.kind,'knowledge-document','family-scope publication is shared with authorized family members');
  const privateSource=f.seed('sources',{kind:'source',name:'私有来源不得共享',active:true,authorized:true,mode:'local',endpoint:'local://private-fixture',documents:[]},'private');const privateAsset=await uploaded(f,Buffer.from('PRIVATE_ONLY_BOUNDARY_TOKEN no family visibility.'),'private-source.txt','text/plain','private');await createReviewPublish(f,privateSource.id,privateAsset.id,'private','私有已审文档');
  assert.deepEqual((await f.request('/api/runtime/family/knowledge/query',{query:'PRIVATE_ONLY_BOUNDARY_TOKEN'},alice)).data.records,[],'private source/document must remain invisible');
  f.mutate('sources',source,{authorized:false});assert.deepEqual((await f.request('/api/runtime/family/knowledge/query',{query:'同源同范围共享'},alice)).data.records,[]);const denied=await f.request('/api/runtime/family/knowledge/references/resolve',{queryId:query.data.queryId,refId:found.refId},alice);assert.equal(denied.status,403,denied.raw);assert.doesNotMatch(denied.raw,/家庭共享原件正文|同源同范围共享/);
 }finally{await f.close();}
});

test('allowlisted local webpage retains raw HTTP bytes through extraction, review, publish and hash-bound reference',{timeout:90000},async(t)=>{
 if(!await hasDocumentStdlibPython()){t.skip(`Python stdlib runtime unavailable: ${pythonExecutable}`);return;}
 const f=await fixture();let fetches=0;const raw=Buffer.from('<!doctype html><html><head><title>Local ingestion fixture</title></head><body><article><p>网页原件第一段定位。</p><p>网页原件第二段检索标记：真实HTML引用。</p></article></body></html>','utf8');
 const server=createServer((_req,res)=>{fetches++;res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(raw);});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 try{
  const denied=await f.post('/api/v1/inbox-materials/links/extract',{id:randomUUID(),url:origin+'/page',scope:'family'});assert.equal(denied.status,403);assert.equal(fetches,0);
  const config={engine:'rapidocr',rounds:2,language:'chi_sim+eng',endpoint:'',maxPages:5,lowConfidence:0.9,timeoutMs:30000,allowedHttpOrigins:[origin],allowedDirectoryRoots:[],maxBytes:8*1024*1024,maxDocuments:10};const configured=await f.post('/api/v1/knowledge/runtime/configure',{commandId:randomUUID(),expectedVersion:0,scope:'personal',payload:{configuration:config}});assert.equal(configured.status,200,configured.raw);
  const linkId=randomUUID(),url=origin+'/page#part',extracted=await f.post('/api/v1/inbox-materials/links/extract',{id:linkId,url,scope:'family'});assert.equal(extracted.status,200,extracted.raw);assert.equal(fetches,1);const asset=extracted.data.data;assert.equal(asset.status,'stored');assert.equal(asset.sha256,digest(raw));assert.equal(asset.extraction.engine,'python-stdlib-html');assert.deepEqual(asset.extraction.segments.map((s:any)=>s.paragraph),[1,2]);assert.match(asset.extraction.text,/网页原件第二段检索标记/);
  const original=await f.request(`/api/v1/inbox-materials/uploads/${linkId}/file`,undefined,f.admin);assert.equal(original.status,200,original.raw);assert.deepEqual(original.bytes,raw);
  const source=f.seed('sources',{kind:'source',name:'合成网页来源',active:true,authorized:true,mode:'local',endpoint:'local://web-fixture',documents:[]});const published=await createReviewPublish(f,source.id,linkId,'family','网页已审文档');assert.equal(published.materialSha256,digest(raw));assert.equal(published.sourceTextSha256,digest(asset.extraction.text));assert.deepEqual(published.segments.map((s:any)=>s.location),[1,2].map(n=>'inbox-original://'+digest(raw)+'/paragraph/'+n));
  const member=await f.login(),query=await f.request('/api/runtime/family/knowledge/query',{query:'网页原件第二段检索标记'},member);assert.equal(query.status,200,query.raw);const ref=query.data.records.find((r:any)=>r.kind==='knowledge-document');assert.ok(ref,query.raw);const resolved=await f.request('/api/runtime/family/knowledge/references/resolve',{queryId:query.data.queryId,refId:ref.refId},member);assert.equal(resolved.status,200,resolved.raw);assert.equal(resolved.data.sha256,published.segments[1].sha256);assert.equal(resolved.data.segment,1);assert.equal(resolved.data.originalLocation,'inbox-original://'+digest(raw)+'/paragraph/2');assert.match(resolved.data.quote,/网页原件第二段检索标记/);assert.equal(fetches,1,'query/resolve must use saved text, not fetch again');assert.equal(f.modelCalls,0);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.close();}
});

test('trash invalidates published citations and structural document references block permanent original deletion',{timeout:120000},async()=>{
 const f=await fixture();try{
  const source=f.seed('sources',{kind:'source',name:'原件回收失效来源',active:true,authorized:true,mode:'local',endpoint:'local://trash-invalidation',documents:[]},'family');
  const asset=await uploaded(f,Buffer.from('回收前可检索原文：TRASH-REFERENCE-MARKER。'),'trash-reference.txt','text/plain');
  const extracted=await f.post(`/api/v1/inbox-materials/uploads/${asset.id}/process`,{commandId:randomUUID(),expectedVersion:asset.record.revision,operation:'extract'});assert.equal(extracted.status,200,extracted.raw);
  const published=await createReviewPublish(f,source.id,asset.id,'family','回收失效文档');
  const query=await f.post('/api/v1/knowledge/sources/commands/query',{commandId:randomUUID(),expectedVersion:0,scope:'family',payload:{query:'TRASH-REFERENCE-MARKER',mode:'local'}});assert.equal(query.status,200,query.raw);
  const hit=query.data.data.results[0],input={queryId:query.data.data.id,source:source.id,location:hit.location,sha256:hit.sha256};assert.equal((await f.post('/api/v1/knowledge/references/resolve',input)).status,200);
  const trashed=await f.post(`/api/v1/inbox-materials/uploads/${asset.id}/lifecycle`,{commandId:randomUUID(),expectedVersion:extracted.data.data.revision,action:'trash',confirmed:true});assert.equal(trashed.status,200,trashed.raw);
  const invalid=await f.post('/api/v1/knowledge/references/resolve',input);assert.equal(invalid.status,409,invalid.raw);assert.doesNotMatch(invalid.raw,/TRASH-REFERENCE-MARKER/);
  const next=await f.post('/api/v1/knowledge/sources/commands/query',{commandId:randomUUID(),expectedVersion:0,scope:'family',payload:{query:'TRASH-REFERENCE-MARKER',mode:'local'}});assert.equal(next.status,200,next.raw);assert.equal(next.data.data.results.some((row:any)=>row.documentId===published.id),false);
  const deletion=await f.post(`/api/v1/inbox-materials/uploads/${asset.id}/lifecycle`,{commandId:randomUUID(),expectedVersion:trashed.data.data.revision,action:'delete',confirmed:true});assert.equal(deletion.status,409,deletion.raw);
 }finally{await f.close();}
});

test('real administrator session matrix protects all document management routes while authorized admin succeeds',{timeout:120000},async()=>{
 const f=await fixture();try{
  const source=f.seed('sources',{kind:'source',name:'真实管理员矩阵来源',active:true,authorized:true,mode:'local',endpoint:'local://admin-matrix',documents:[]},'family');
  const asset=await uploaded(f,Buffer.from('ADMIN-MATRIX-ORIGINAL exact source text.'),'admin-matrix.txt','text/plain','family');
  const createBody={commandId:randomUUID(),expectedVersion:0,scope:'family',sourceId:source.id,assetId:asset.id,title:'真实管理员权限矩阵'};
  const created=await f.post('/api/v1/knowledge/documents',createBody);assert.equal(created.status,200,created.raw);const id=created.data.data.id,rev=created.data.data.revision;
  assert.equal((await f.request('/api/v1/knowledge/documents',undefined,f.admin)).status,200);
  assert.equal((await f.request(`/api/v1/knowledge/documents/${id}`,undefined,f.admin)).status,200);
  const reviewed=await f.post(`/api/v1/knowledge/documents/${id}/review`,{commandId:randomUUID(),expectedVersion:rev,confirmed:true,evidence:'真实管理员正例逐字复核'});assert.equal(reviewed.status,200,reviewed.raw);
  const published=await f.post(`/api/v1/knowledge/documents/${id}/publish`,{commandId:randomUUID(),expectedVersion:reviewed.data.data.revision,confirmed:true});assert.equal(published.status,200,published.raw);
  assert.equal((await f.request(`/api/v1/knowledge/documents/${id}/original`,undefined,f.admin)).status,200);
  const revised=await f.post(`/api/v1/knowledge/documents/${id}/revise`,{commandId:randomUUID(),expectedVersion:published.data.data.revision});assert.equal(revised.status,200,revised.raw);
  const member=await f.login();
  const routes:Array<{name:string;method:string;path:string;body?:unknown}>=[
   {name:'list',method:'GET',path:'/api/v1/knowledge/documents'},
   {name:'detail',method:'GET',path:`/api/v1/knowledge/documents/${id}`},
   {name:'create',method:'POST',path:'/api/v1/knowledge/documents',body:{...createBody,commandId:randomUUID(),sourceId:source.id,assetId:asset.id}},
   {name:'review',method:'POST',path:`/api/v1/knowledge/documents/${id}/review`,body:{commandId:randomUUID(),expectedVersion:revised.data.data.revision,confirmed:true,evidence:'拒绝路径'}},
   {name:'publish',method:'POST',path:`/api/v1/knowledge/documents/${id}/publish`,body:{commandId:randomUUID(),expectedVersion:revised.data.data.revision,confirmed:true}},
   {name:'revise',method:'POST',path:`/api/v1/knowledge/documents/${id}/revise`,body:{commandId:randomUUID(),expectedVersion:revised.data.data.revision}},
   {name:'original download',method:'GET',path:`/api/v1/knowledge/documents/${id}/original`},
  ];
  const invoke=async(route:any,auth='',headers:Record<string,string>={})=>f.request(route.path,route.body,auth,route.method,headers);
  for(const route of routes){
   for(const [identity,auth,status] of [['anonymous','',401],['member only',member,401],['admin plus member',`${f.admin}; ${member}`,403]] as Array<[string,string,number]>){
    const denied=await invoke(route,auth);assert.equal(denied.status,status,`${route.name}/${identity}: ${denied.raw}`);assert.doesNotMatch(denied.raw,/ADMIN-MATRIX-ORIGINAL|真实管理员权限矩阵/);
   }
   for(const terminalHeaders of [{'authorization':'Bearer untrusted-terminal'},{'x-jarvis-terminal-id':'untrusted-terminal'},{'x-terminal-session':'untrusted-terminal'}]){
    const denied=await invoke(route,f.admin,terminalHeaders);assert.equal(denied.status,403,`${route.name}/terminal: ${denied.raw}`);assert.doesNotMatch(denied.raw,/ADMIN-MATRIX-ORIGINAL/);
   }
  }
  const logout=await f.request('/api/auth/logout',undefined,f.admin,'POST');assert.equal(logout.status,200,logout.raw);
  for(const route of routes){const denied=await invoke(route,f.admin);assert.equal(denied.status,401,`${route.name}/revoked-admin: ${denied.raw}`);assert.doesNotMatch(denied.raw,/ADMIN-MATRIX-ORIGINAL|真实管理员权限矩阵/);}
 }finally{await f.close();}
});

test('actual multi-paragraph DOCX extraction binds each retained original location through publication and retrieval',{timeout:120000},async(t)=>{
 let probe:{stdout:string};try{probe=await execFileAsync(pythonExecutable,['-I','-c',"import zipfile, xml.etree.ElementTree, sys; print(sys.version_info[:2])"],{timeout:10000});}catch{t.skip(`Python stdlib runtime unavailable: ${pythonExecutable}`);return;}
 assert.match(probe.stdout,/\(3,\s*\d+\)/);
 const f=await fixture();try{
  const root=join(f.directory,'docx-fixture');await mkdir(root);const docxPath=join(root,'actual-fixture.docx');
  const xml=`<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>真实DOCX第一段原文定位。</w:t></w:r></w:p><w:p><w:r><w:t>真实DOCX第二段检索标记：段落精确引用。</w:t></w:r></w:p></w:body></w:document>`;
  const generator=`import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'); z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'); z.writestr('word/document.xml',sys.argv[2]); z.close()`;
  await execFileAsync(pythonExecutable,['-I','-c',generator,docxPath,xml],{timeout:15000});const bytes=await (await import('node:fs/promises')).readFile(docxPath);assert(bytes.length>0);
  const parsed=await parseInboxDocument({bytes,mime:docxMime,sha256:digest(bytes),pythonExecutable,timeoutMs:30000});assert.equal(parsed.engine,'python-stdlib-docx-body');assert.equal(parsed.pageCount,null);assert.equal(parsed.segments[0].page,null);assert.equal(parsed.segments.length,2);assert.deepEqual(parsed.segments.map((s:any)=>s.paragraph),[1,2]);assert.match(parsed.text,/真实DOCX第二段检索标记/);assert.equal(parsed.reviewRequired,true);
  const asset=await uploaded(f,bytes,'actual-fixture.docx',docxMime);const processed=await f.post(`/api/v1/inbox-materials/uploads/${asset.id}/process`,{commandId:randomUUID(),expectedVersion:asset.record.revision,operation:'extract'});assert.equal(processed.status,200,processed.raw);const extracted=processed.data.data;assert.equal(extracted.extraction.engine,'python-stdlib-docx-body');assert.equal(extracted.extraction.pageCount,undefined);assert.equal(extracted.extraction.segments[0].page,undefined);assert.deepEqual(extracted.extraction.segments.map((s:any)=>s.paragraph),[1,2]);assert.match(extracted.extraction.text,/真实DOCX第二段检索标记/);
  const original=await f.request(`/api/v1/inbox-materials/uploads/${asset.id}/file`,undefined,f.admin);assert.equal(original.status,200,original.raw);assert.deepEqual(original.bytes,bytes);
  const source=f.seed('sources',{kind:'source',name:'合成DOCX来源',active:true,authorized:true,mode:'local',endpoint:'local://docx-fixture',documents:[]});const created=await f.post('/api/v1/knowledge/documents',{commandId:randomUUID(),expectedVersion:0,scope:'family',sourceId:source.id,assetId:asset.id,title:'实际DOCX原件文档'});assert.equal(created.status,200,created.raw);assert.equal(created.data.data.text,parsed.text);assert.equal(created.data.data.segments.map((s:any)=>s.text).join(''),parsed.text);assert.deepEqual(created.data.data.segments.map((s:any)=>s.location),[1,2].map(n=>'inbox-original://'+digest(bytes)+'/paragraph/'+n));assert.equal(created.data.data.segments.map((s:any)=>s.sha256).join(','),created.data.data.segments.map((s:any)=>digest(s.text)).join(','));
  assert.equal((await f.post(`/api/v1/knowledge/documents/${created.data.data.id}/publish`,{commandId:randomUUID(),expectedVersion:created.data.data.revision,confirmed:true})).status,409,'unreviewed extraction cannot publish');const reviewed=await f.post(`/api/v1/knowledge/documents/${created.data.data.id}/review`,{commandId:randomUUID(),expectedVersion:created.data.data.revision,confirmed:true,evidence:'真实DOCX实际原件人工逐段核对'});assert.equal(reviewed.status,200,reviewed.raw);const published=await f.post(`/api/v1/knowledge/documents/${created.data.data.id}/publish`,{commandId:randomUUID(),expectedVersion:reviewed.data.data.revision,confirmed:true});assert.equal(published.status,200,published.raw);assert.equal(published.data.data.status,'published');assert.equal(published.data.data.materialSha256,digest(bytes));
  const member=await f.login(),query=await f.request('/api/runtime/family/knowledge/query',{query:'真实DOCX第二段检索标记'},member);assert.equal(query.status,200,query.raw);const ref=query.data.records.find((r:any)=>r.kind==='knowledge-document');assert.ok(ref,query.raw);assert.equal(ref.segment,1);const resolved=await f.request('/api/runtime/family/knowledge/references/resolve',{queryId:query.data.queryId,refId:ref.refId},member);assert.equal(resolved.status,200,resolved.raw);assert.equal(resolved.data.originalLocation,'inbox-original://'+digest(bytes)+'/paragraph/2');assert.match(resolved.data.quote,/真实DOCX第二段检索标记/);
  const adminQuery=await f.post('/api/v1/knowledge/sources/commands/query',{commandId:randomUUID(),expectedVersion:0,scope:'family',payload:{query:'真实DOCX第二段检索标记',mode:'local'}});assert.equal(adminQuery.status,200,adminQuery.raw);const adminHit=adminQuery.data.data.results.find((r:any)=>r.documentId===created.data.data.id);assert.ok(adminHit,adminQuery.raw);const adminRef=await f.post('/api/v1/knowledge/references/resolve',{queryId:adminQuery.data.data.id,source:source.id,location:adminHit.location,sha256:adminHit.sha256});assert.equal(adminRef.status,200,adminRef.raw);assert.equal(adminRef.data.originalLocation,'inbox-original://'+digest(bytes)+'/paragraph/2');assert.equal(adminRef.data.segment,1);
 }finally{await f.close();}
});
