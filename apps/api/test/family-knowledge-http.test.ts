import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {V1Repository} from '../src/v1/repository.js';
import type {BusinessRecord,Domain,Scope} from '../src/v1/types.js';
import {registerFamilyKnowledgeRoutes} from '../src/runtime/family-knowledge.js';
import {parseKnowledgeDocuments,readKnowledgeDirectory} from '../src/runtime/knowledge-connectors.js';

const prefix='/api/runtime/family/knowledge',hash=(text:string)=>createHash('sha256').update(text).digest('hex');
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-family-knowledge-http-'));let models=0,runtime:Awaited<ReturnType<typeof createApp>>|undefined,seeds:V1Repository|undefined;
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},abort:async()=>{},run:async()=>{models++;throw Error('No model in family knowledge tests')}} as unknown as PiService;
 try{
  runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'no-web'),pythonExecutable:join(directory,'no-python')});
  await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  const request=async(path:string,body:unknown,cookie='',extra:Record<string,string>={})=>{
   const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}),raw=await response.text();
   return {status:response.status,body:JSON.parse(raw) as any,raw,headers:response.headers,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>value.startsWith('jarvis_member_session=')||value.startsWith('jarvis_session=')).filter(value=>!value.endsWith('=')).join('; ')};
  };
  const setup=await request('/api/auth/setup',{password:randomUUID()+'-isolated'});assert.equal(setup.status,200);const admin=setup.cookie;
  const alice=runtime.store.create('members',{name:'合成成员甲',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'}),bob=runtime.store.create('members',{name:'合成成员乙',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});
  runtime.identity.setCredential(alice.id,'123456','pin');runtime.identity.setCredential(bob.id,'234567','pin');
  const login=async(id=alice.id,pin='123456')=>{const r=await request('/api/runtime/identity/login',{profileId:id,credential:pin});assert.equal(r.status,200);assert.ok(r.cookie.startsWith('jarvis_member_session='));return r.cookie;};
  const a=await login(),b=await login(bob.id,'234567');
  // Fixture writes are isolated from the live app repository and its official receipt validator.
  seeds=new V1Repository(runtime.store.databasePath);
  const seed=(domain:Domain,values:Record<string,unknown>,scope:Scope='family',actor='server-admin')=>seeds!.execute({domain,commands:[],execute:(_c,_p,ctx)=>ctx.create(domain,{...values,createdAt:ctx.now,updatedAt:ctx.now})},'synthetic-fixture',{commandId:randomUUID(),expectedVersion:0,scope,payload:{}},actor,()=>undefined).data;
  const patch=(domain:Domain,record:BusinessRecord,values:Record<string,unknown>)=>seeds!.execute({domain,commands:[],execute:(_c,_p,ctx)=>ctx.update(domain,record.id,values)},'synthetic-update',{commandId:randomUUID(),expectedVersion:record.revision,scope:record.scope,payload:{}},record.ownerId,()=>undefined).data;
  const rawReplace=(domain:Domain,record:BusinessRecord,values:Record<string,unknown>)=>{const db=new DatabaseSync(runtime!.store.databasePath);try{db.prepare('UPDATE v1_documents SET json=? WHERE domain=? AND id=?').run(JSON.stringify({...record,...values}),domain,record.id);}finally{db.close();}};
  const query=(query:string,auth=a,limit=20)=>request(prefix+'/query',{query,limit},auth);
  const reader=(q:any,auth=a,index=0)=>request(prefix+'/references/resolve',{queryId:q.queryId,refId:q.records[index].refId},auth);
  return {runtime,directory,request,admin,alice,bob,a,b,login,seed,patch,rawReplace,query,reader,async close(){try{seeds!.close();await runtime!.app.close();}finally{const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-family-knowledge-http-'));await rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});}assert.equal(models,0);}};
 }catch(error){seeds?.close();await runtime?.app.close();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-family-knowledge-http-'));await rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function source(f:Fixture,extra:Record<string,unknown>={},scope:Scope='family',actor='server-admin'){return f.seed('sources',{kind:'source',name:'自行生成家庭来源',active:true,authorized:true,mode:'local',version:'1',endpoint:'D:/synthetic-private-directory/not-for-dto',documents:[],...extra},scope,actor);}
function book(f:Fixture,s:BusinessRecord,text='FAMILY-REFERENCE-MARKER is the published original.',extra:Record<string,unknown>={},scope:Scope='family',actor='server-admin'){return f.seed('books',{kind:'book',title:'合成共享书页',source:s.id,status:'published',version:'1.0',pageTexts:[{page:2,text}],...extra},scope,actor);}

test('member-only HTTP knowledge preserves mixed-cookie identity and rejects admin or terminal fallback',{timeout:60000},async()=>{
 const f=await fixture();try{
  const s=source(f);book(f,s);
  for(const cookie of ['',f.admin,f.admin+'; jarvis_member_session=',f.admin+'; jarvis_member_session=expired'])assert.equal((await f.query('FAMILY-REFERENCE-MARKER',cookie)).status,401);
  const ticket=f.runtime.identity.issuePairing('local','synthetic-room',[f.alice.id]),terminal=f.runtime.identity.claimPairing(ticket.pairingToken,'family-knowledge-http');
  for(const cookie of ['',f.admin])assert.equal((await f.request(prefix+'/query',{query:'FAMILY-REFERENCE-MARKER'},cookie,{'x-jarvis-terminal':terminal.terminalToken})).status,401);
  const mixed=await f.request(prefix+'/query',{query:'FAMILY-REFERENCE-MARKER'},f.admin+'; '+f.a,{'x-jarvis-terminal':terminal.terminalToken});assert.equal(mixed.status,200,mixed.raw);assert.equal(mixed.body.profileId,f.alice.id);assert.notEqual(mixed.body.actorId,'server-admin');assert.equal(mixed.body.total,1);assert.equal(mixed.headers.get('cache-control'),'private, no-store');assert.equal(mixed.headers.get('x-content-type-options'),'nosniff');
  for(const extra of [{actorId:'server-admin'},{profileId:f.bob.id},{scope:'private'},{limit:51}])assert.equal((await f.request(prefix+'/query',{query:'FAMILY-REFERENCE-MARKER',...extra},f.a)).status,400);
  f.runtime.identity.db.prepare('UPDATE runtime_member_sessions SET expires_at=? WHERE token_hash=?').run(Date.now()-1,hash(f.a.split('=')[1]));assert.equal((await f.query('FAMILY-REFERENCE-MARKER',f.admin+'; '+f.a)).status,401);
 }finally{await f.close();}
});

test('HTTP query searches all allowed saved text before kind filtering and limit, without fetching live sources',{timeout:60000},async()=>{
 const f=await fixture();let fetched=0;const live=createServer((_req,res)=>{fetched++;res.end('MUST-NOT-FETCH');});await new Promise<void>(resolve=>live.listen(0,'127.0.0.1',resolve));
 try{
  const address=live.address();assert.ok(address&&typeof address!=='string');const s=source(f);let target:BusinessRecord|undefined;
  for(let i=1;i<=55;i++){const b=book(f,s,i===51?'FIFTYFIRST-NEEDLE exact original.':`Commonbase ordinary page ${i}.`);if(i===51)target=b;}
  f.seed('stories',{kind:'story',title:'FIFTYFIRST-NEEDLE '.repeat(5),status:'published',released:true,dirty:false,book:target!.id,page:2,version:'1.0',quote:target!.pageTexts[0].text,summary:'FIFTYFIRST-NEEDLE story interpretation must not appear.'});
  const found=await f.query('FIFTYFIRST-NEEDLE',f.a,1);assert.equal(found.status,200,found.raw);assert.equal(found.body.total,1);assert.equal(found.body.records.length,1);assert.equal(found.body.records[0].kind,'book');assert.equal(found.body.records[0].page,2);assert.equal(found.body.records[0].quoteKind,'published-original');
  const many=await f.query('Commonbase',f.a,2);assert.equal(many.body.total,54);assert.equal(many.body.records.length,2);
  const text='x'.repeat(9100)+' DEEPSYNC-NEEDLE saved full text. '+ 'z'.repeat(5000);f.patch('sources',s,{documents:[{id:'deep-doc',title:'合成同步资料',text,sha256:'0'.repeat(64),location:'D:/synthetic-private-directory/original.txt'}]});
  const deep=await f.query('DEEPSYNC-NEEDLE');assert.equal(deep.body.total,1);assert.equal(deep.body.records[0].kind,'external-document');assert.equal(deep.body.records[0].quoteKind,'external-source-unreviewed');const read=await f.reader(deep.body);assert.equal(read.status,200,read.raw);assert.equal(read.body.sha256,hash(text));assert.equal(read.body.text.slice(read.body.quoteStart,read.body.quoteStart+read.body.quote.length),read.body.quote);assert.ok(read.body.text.length<=3602);assert.equal(read.body.hasEarlierText,true);assert.equal(read.body.hasLaterText,true);assert.match(read.body.notice,/不等于人工审核/);
  assert.equal(found.body.records[0].title,'合成共享书页');assert.equal(deep.body.records[0].sourceName,'自行生成家庭来源');
  const directory=join(f.directory,'documents');await mkdir(directory);await writeFile(join(directory,'saved-family.txt'),'PATHDIRECTORY-NEEDLE actual directory original.');
  const actual=await readKnowledgeDirectory(directory,{allowedHttpOrigins:[],allowedDirectoryRoots:[directory],timeoutMs:1000,maxBytes:10000,maxDocuments:10},new AbortController().signal);
  source(f,{name:directory,documents:actual});
  const pathCases=[
   {title:'C:\\Users\\SyntheticPrivate\\documents\\windows-family.txt',name:'windows-family.txt',marker:'PATHWINDOWS-NEEDLE'},
   {title:'/home/SyntheticPrivate/documents/unix-family.txt',name:'unix-family.txt',marker:'PATHUNIX-NEEDLE'},
   {title:'\\\\SyntheticPrivateHost\\share\\unc-family.txt',name:'unc-family.txt',marker:'PATHUNC-NEEDLE'},
   {title:'file:///C:/SyntheticPrivate/documents/file-family.txt',name:'file-family.txt',marker:'PATHFILE-NEEDLE'},
   {title:'file:///',name:'已保存资料',marker:'PATHEMPTY-NEEDLE'},
   {title:'自定资料 / 第一章',name:'自定资料 / 第一章',marker:'PATHCUSTOM-NEEDLE'},
  ];
  const documents=pathCases.flatMap((entry,index)=>parseKnowledgeDocuments(Buffer.from(JSON.stringify({title:entry.title,text:entry.marker+' original text stays unchanged.'})),'application/json',`/synthetic-private/doc-${index}.json`,10));
  source(f,{name:'C:\\SyntheticPrivate\\source-label',documents});source(f,{name:'D:\\',documents:parseKnowledgeDocuments(Buffer.from(JSON.stringify({title:'D:\\',text:'PATHROOT-NEEDLE preserved original.'})),'application/json','/synthetic-private/root.json',10)});
  for(const entry of [{name:'saved-family.txt',marker:'PATHDIRECTORY-NEEDLE',sourceName:'documents'},...pathCases.map(entry=>({...entry,sourceName:'source-label'})),{name:'已保存资料',marker:'PATHROOT-NEEDLE',sourceName:'家庭知识来源'}]){
   const result=await f.query(entry.marker);assert.equal(result.status,200,result.raw);assert.equal(result.body.total,1);assert.equal(result.body.records[0].title,entry.name);assert.equal(result.body.records[0].sourceName,entry.sourceName);
   const opened=await f.reader(result.body);assert.equal(opened.status,200,opened.raw);assert.equal(opened.body.title,entry.name);assert.equal(opened.body.sourceName,entry.sourceName);assert.ok(opened.body.quote.includes(entry.marker));
   for(const response of [result,opened]){assert.doesNotMatch(response.raw,/SyntheticPrivate|synthetic-private|jarvis-family-knowledge-http-|file:\/\/\/|[A-Za-z]:\\\\/);assert.ok(!response.raw.includes(directory));}
  }
  const privateSource=source(f,{},'private');book(f,privateSource,'EXCLUDED-PRIVATE-NEEDLE',{},'private');const other=source(f,{},'family','member_other');book(f,other,'EXCLUDED-PRIVATE-NEEDLE',{},'family','member_other');book(f,s,'EXCLUDED-PRIVATE-NEEDLE',{status:'review'});assert.deepEqual((await f.query('EXCLUDED-PRIVATE-NEEDLE')).body.records,[]);
  source(f,{mode:'live',endpoint:`http://127.0.0.1:${address.port}/stored-only`,documents:[]});assert.deepEqual((await f.query('MUST-NOT-FETCH')).body.records,[]);assert.equal(fetched,0);
  for(const response of [found,deep,read])assert.doesNotMatch(response.raw,/synthetic-private-directory|book:\/\/|location|endpoint|localpath/i);
  assert.equal(f.runtime.v1.list('sources','server-admin').some(r=>r.kind==='query'),false,'成员问题不能持久保存成管理员query');
 }finally{await new Promise<void>((resolve,reject)=>live.close(error=>error?reject(error):resolve()));await f.close();}
});

test('HTTP references bind canonical IDs to the exact member session and reject revoked credentials',{timeout:60000},async()=>{
 const f=await fixture();try{
  book(f,source(f));const query=(await f.query('FAMILY-REFERENCE-MARKER')).body;
  assert.equal((await f.reader(query)).status,200);assert.equal((await f.reader(query,f.b)).status,404);assert.equal((await f.reader(query,f.admin)).status,401);
  const sameMemberNewSession=await f.login();assert.equal((await f.reader(query,sameMemberNewSession)).status,404);
  for(const body of [{queryId:query.queryId,refId:randomUUID()},{queryId:randomUUID(),refId:query.records[0].refId}])assert.equal((await f.request(prefix+'/references/resolve',body,f.a)).status,404);
  const adminQuery=f.seed('sources',{kind:'query',status:'complete',query:'FAMILY-REFERENCE-MARKER',results:[]});assert.equal((await f.request(prefix+'/references/resolve',{queryId:adminQuery.id,refId:query.records[0].refId},f.a)).status,404);
  assert.equal((await f.request(prefix+'/references/resolve',{queryId:query.queryId,refId:query.records[0].refId,location:'file:///do-not-open'},f.a)).status,400);
  await f.request('/api/runtime/identity/logout',{},f.a);assert.equal((await f.reader(query,f.admin+'; '+f.a)).status,401);
  const fresh=(await f.query('FAMILY-REFERENCE-MARKER',sameMemberNewSession)).body;f.runtime.identity.disableCredential(f.alice.id);const revoked=await f.reader(fresh,sameMemberNewSession);assert.equal(revoked.status,401);assert.doesNotMatch(revoked.raw,/published original/);
 }finally{await f.close();}
});

test('HTTP reader rechecks current source, published version and actual full-text hash before returning context',{timeout:60000},async()=>{
 const f=await fixture();try{
  let s=source(f),b=book(f,s,'😀'.repeat(1600)+' BOOK-HASH-NEEDLE '+'😀'.repeat(2000));let q=(await f.query('BOOK-HASH-NEEDLE')).body;
  const first=await f.reader(q);assert.equal(first.status,200,first.raw);assert.equal(first.body.kind,'book-page');assert.equal(first.body.page,2);assert.equal(first.body.version,'1.0');assert.equal(first.body.verifiedSourceText,true);assert.equal(first.body.sha256,hash(b.pageTexts[0].text));assert.equal(first.body.text.slice(first.body.quoteStart,first.body.quoteStart+first.body.quote.length),first.body.quote);assert.doesNotMatch(first.body.text,/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  s=f.patch('sources',s,{authorized:false});let denied=await f.reader(q);assert.equal(denied.status,403);assert.doesNotMatch(denied.raw,/BOOK-HASH-NEEDLE/);assert.deepEqual((await f.query('BOOK-HASH-NEEDLE')).body.records,[]);
  s=f.patch('sources',s,{authorized:true});q=(await f.query('BOOK-HASH-NEEDLE')).body;b=f.patch('books',b,{version:'2.0'});assert.equal((await f.reader(q)).status,409);
  q=(await f.query('BOOK-HASH-NEEDLE')).body;f.rawReplace('books',b,{pageTexts:[{page:2,text:'different bytes at the same stored revision'}]});denied=await f.reader(q);assert.equal(denied.status,409);assert.doesNotMatch(denied.raw,/BOOK-HASH-NEEDLE/);
  const original='DOCUMENT-HASH-NEEDLE immutable excerpt.';s=f.patch('sources',s,{documents:[{id:'doc-hash',title:'已保存合成正文',text:original,location:'file:///synthetic-private'}]});q=(await f.query('DOCUMENT-HASH-NEEDLE')).body;f.rawReplace('sources',s,{documents:[{id:'doc-hash',title:'已保存合成正文',text:'changed body without declared revision',location:'file:///synthetic-private'}]});assert.equal((await f.reader(q)).status,409);
 }finally{await f.close();}
});

test('HTTP ephemeral reference cache enforces five minutes, ten per session and two hundred globally',{timeout:60000},async()=>{
 const f=await fixture(),app=Fastify();let now=Date.now();try{
  book(f,source(f));await app.register(cookie);registerFamilyKnowledgeRoutes(app,f.runtime.v1,f.runtime.identity,{now:()=>now});await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address!=='string');
  const request=async(path:string,body:unknown,auth=f.a)=>{const response=await fetch(`http://127.0.0.1:${address.port}`+path,{method:'POST',headers:{'content-type':'application/json',cookie:auth},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json() as any};};
  const query=(auth=f.a)=>request(prefix+'/query',{query:'FAMILY-REFERENCE-MARKER'},auth),reader=(q:any)=>request(prefix+'/references/resolve',{queryId:q.queryId,refId:q.records[0].refId});
  const first=(await query()).body;assert.equal(Date.parse(first.expiresAt)-now,300000);now+=299999;assert.equal((await reader(first)).status,200);now++;assert.equal((await reader(first)).status,410);
  const oldest=(await query()).body;for(let i=0;i<10;i++)assert.equal((await query()).status,200);assert.equal((await reader(oldest)).status,404);
  const anchors=[];for(let i=0;i<10;i++)anchors.push((await query()).body);
  for(let i=0;i<19;i++){
   const member=f.runtime.store.create('members',{name:'合成缓存成员'+i,role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});f.runtime.identity.setCredential(member.id,'123456','pin');const cookie=await f.login(member.id);
   for(let j=0;j<10;j++)assert.equal((await query(cookie)).status,200);
  }
  assert.equal((await reader(anchors[0])).status,200);
  const overflow=f.runtime.store.create('members',{name:'合成缓存边界成员',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});f.runtime.identity.setCredential(overflow.id,'123456','pin');assert.equal((await query(await f.login(overflow.id))).status,200);
  assert.equal((await reader(anchors[0])).status,404);assert.equal((await reader(anchors[1])).status,200);
 }finally{await app.close();await f.close();}
});
