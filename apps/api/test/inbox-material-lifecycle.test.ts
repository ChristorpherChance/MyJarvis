import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,access,unlink} from 'node:fs/promises';
import Fastify from 'fastify';
import cookiePlugin from '@fastify/cookie';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import type {BusinessRecord,Domain,DomainHandler} from '../src/v1/types.js';
import {BusinessError} from '../src/v1/types.js';
import {registerInboxMaterialLifecycle} from '../src/v1/inbox-material-lifecycle.js';
import {registerInboxMaterials} from '../src/v1/inbox-materials.js';

const prefix='/api/v1/inbox-materials/uploads',hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6o1UAAAAASUVORK5CYII=','base64');
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-material-lifecycle-'));let runtime:Awaited<ReturnType<typeof createApp>>|undefined,base='',cookie='',models=0;
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},abort:async()=>{},run:async()=>{models++;throw Error('No model in lifecycle tests')}} as unknown as PiService;
 const start=async()=>{runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'no-web')});await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;};
 const request=async(path:string,method='GET',body?:unknown,auth=cookie,extra:Record<string,string>={})=>{
  const bytes=Buffer.isBuffer(body),res=await fetch(base+path,{method,headers:{...(auth?{cookie:auth}:{}),...(body===undefined?{}:{'content-type':bytes?'application/octet-stream':'application/json'}),...extra},...(body===undefined?{}:{body:bytes?body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)}),buffer=Buffer.from(await res.arrayBuffer());let data:any;try{data=JSON.parse(buffer.toString())}catch{}
  return {status:res.status,body:data,bytes:buffer,cookie:res.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),headers:res.headers};
 };
 try{await start();const setup=await request('/api/auth/setup','POST',{password:randomUUID()+'-isolated'},'');assert.equal(setup.status,200);cookie=setup.cookie;
  const seed=(domain:Domain,body:Record<string,unknown>,recordScope:'private'|'family'='private',actor='server-admin')=>runtime!.v1.execute({domain,commands:[],execute:(_command,_p,ctx)=>ctx.create(domain,{...body,createdAt:ctx.now,updatedAt:ctx.now})},'owned-fixture',{commandId:randomUUID(),expectedVersion:0,scope:recordScope,payload:{}},actor,()=>undefined).data;
  const patch=(domain:Domain,record:BusinessRecord,values:Record<string,unknown>)=>runtime!.v1.execute({domain,commands:[],execute:(_command,_p,ctx)=>ctx.update(domain,record.id,values)},'owned-fixture-patch',{commandId:randomUUID(),expectedVersion:record.revision,scope:record.scope,payload:{}},record.ownerId,()=>undefined).data;
  return {directory,request,seed,patch,get runtime(){return runtime!},get cookie(){return cookie},async restart(){await runtime!.app.close();await start()},async close(){try{await runtime!.app.close()}finally{const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-material-lifecycle-'));await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});}assert.equal(models,0)}};
 }catch(error){if(runtime)await runtime.app.close();const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-material-lifecycle-'));await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function upload(f:Fixture,bytes:Buffer=Buffer.from('SELF-OWNED lifecycle original.'),filename='原件.txt',mime='text/plain'){
 const id=randomUUID(),prepared=await f.request(prefix,'POST',{id,filename,mime,size:bytes.length,scope:'private'});assert.equal(prepared.status,200);const stored=await f.request(prefix+'/'+id+'/file','PUT',bytes);assert.equal(stored.status,200,stored.bytes.toString());return stored.body.data as BusinessRecord;
}
async function life(f:Fixture,record:BusinessRecord,action:string,extra:Record<string,unknown>={}){return f.request(prefix+'/'+record.id+'/lifecycle','POST',{commandId:randomUUID(),expectedVersion:record.revision,action,confirmed:true,...extra});}
async function command(f:Fixture,domain:'sources'|'books',name:string,payload:Record<string,unknown>,version=0){return f.request(`/api/v1/knowledge/${domain}/commands/${name}`,'POST',{commandId:randomUUID(),expectedVersion:version,scope:'private',payload});}
async function source(f:Fixture){const r=await command(f,'sources','save',{name:'自行生成知识来源',type:'本地原件',mode:'local',endpoint:'inbox://owned-lifecycle-fixture',topics:'隔离验收',rights:'自行生成资料',authorized:true});assert.equal(r.status,200,r.bytes.toString());return r.body.data as BusinessRecord;}
async function ticket(f:Fixture,src:BusinessRecord,bytes=png){const r=await command(f,'books','create-upload',{sourceId:src.id,filename:'扫描原件.png',size:bytes.length,mime:'image/png'});assert.equal(r.status,200);return r.body.data as BusinessRecord;}
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve});return {promise,release};}
async function waitGate(promise:Promise<void>){let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([promise,new Promise<never>((_r,reject)=>{timer=setTimeout(()=>reject(Error('Owned gate was not reached')),8000)})])}finally{clearTimeout(timer)}}
/** Same real app/repository/receipt validator, with controlled filesystem await boundaries. */
async function boundaryProbe(f:Fixture,mode:'delete'|'copy',arrived:ReturnType<typeof gate>,release:ReturnType<typeof gate>){
 const app=Fastify();await app.register(cookiePlugin);app.setErrorHandler((error,_request,reply)=>{if(error instanceof BusinessError)return reply.code(error.status).send({code:error.code,message:error.message});return reply.code(500).send({code:'UNEXPECTED'});});
 const auth=async(req:any)=>{if(!f.runtime.store.validateLogin(req.cookies.jarvis_session??''))throw new BusinessError('FORBIDDEN','请重新登录',401)};
 registerInboxMaterialLifecycle(app,f.runtime.v1,{read:id=>{const r=f.runtime.v1.read('inbox-assets',id,'server-admin');assert.ok(r);return r},bytes:async record=>{const bytes=await readFile(join(f.directory,'inbox-materials',record.id+'.bin'));assert.equal(hash(bytes),record.sha256);return bytes},remove:async(record,beforeUnlink)=>{assert.equal(mode,'delete');arrived.release();await release.promise;beforeUnlink();await unlink(join(f.directory,'inbox-materials',record.id+'.bin'))},writeBook:async(id,bytes)=>{assert.equal(mode,'copy');arrived.release();await release.promise;await mkdir(join(f.directory,'knowledge-uploads'),{recursive:true});await writeFile(join(f.directory,'knowledge-uploads',id+'.bin'),bytes,{flag:'wx'})}},auth,req=>f.runtime.store.validateLogin(req.cookies.jarvis_session??''));
 await app.listen({host:'127.0.0.1',port:0});const address=app.server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 return {app,async request(path:string,body:unknown){const response=await fetch(origin+path,{method:'POST',headers:{cookie:f.cookie,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json() as any}}};
}

test('real HTTP inventory, explicit retention/trash/restore and immutable delete receipt',{timeout:60000},async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('OWNED-DELETE-PRIVATE-TEXT'),original=await upload(f,bytes);let record=original;
  const list=await f.request(prefix+'?state=active&scope=private&search='+encodeURIComponent('原件'));assert.equal(list.status,200);assert.equal(list.body.data.items[0].usage.referenceCount,0);assert.equal(list.bytes.includes(bytes),false);assert.match(list.headers.get('cache-control')??'',/no-store/);
  assert.equal((await f.request(prefix,'GET',undefined,'')).status,401);
  for(const suffix of ['jarvis_member_session=','jarvis_member_session=expired','jarvis_terminal_session=untrusted'])assert.equal((await f.request(prefix,'GET',undefined,f.cookie+'; '+suffix)).status,403);
  assert.equal((await f.request(prefix,'GET',undefined,f.cookie,{'x-jarvis-terminal-id':'owned-room'})).status,403);
  assert.equal((await life(f,record,'delete')).status,409);assert.equal((await life(f,record,'retention',{retainUntil:'not-a-date'})).status,400);
  record=(await life(f,record,'retention',{retainUntil:'2099-01-01T00:00:00.000Z'})).body.data;record=(await life(f,record,'trash')).body.data;assert.equal(record.lifecycle,'trashed');assert.deepEqual((await f.request(prefix+'/'+record.id+'/file')).bytes,bytes);assert.equal((await life(f,record,'delete')).status,409);
  const retained=await f.request('/api/v1/inbox-materials/cleanup/preview','POST',{olderThan:'2099-01-01T00:00:00.000Z'});assert.equal(retained.body.data.items.length,0);
  record=(await life(f,record,'restore')).body.data;record=(await life(f,record,'retention',{retainUntil:null})).body.data;record=(await life(f,record,'trash')).body.data;
  const preview=await f.request('/api/v1/inbox-materials/cleanup/preview','POST',{olderThan:'2099-01-01T00:00:00.000Z'});assert.equal(preview.body.data.items[0].suggestedAction,'delete');assert.equal(preview.body.data.items[0].revision,record.revision);assert.equal(preview.bytes.includes(bytes),false);await access(join(f.directory,'inbox-materials',record.id+'.bin'));
  const intent={commandId:randomUUID(),expectedVersion:record.revision,action:'delete',confirmed:true};const deleted=await Promise.all([f.request(prefix+'/'+record.id+'/lifecycle','POST',intent),f.request(prefix+'/'+record.id+'/lifecycle','POST',intent)]);for(const reply of deleted){assert.equal(reply.status,200,reply.bytes.toString());assert.equal(reply.body.data.lifecycle,'deleted');assert.equal(reply.body.data.deletion.status,'complete');assert.equal(reply.body.data.extractedText,'');assert.equal(reply.body.data.processing,null);}
  assert.equal((await f.request(prefix+'/'+record.id+'/file')).status,410);await assert.rejects(access(join(f.directory,'inbox-materials',record.id+'.bin')));assert.equal((await f.request(prefix+'/'+record.id+'/lifecycle','POST',intent)).body.data.deletion.status,'complete');assert.equal((await life(f,deleted[0].body.data,'restore')).status,409);
  assert.equal(f.runtime.v1.commandHistory('server-admin').filter(item=>item.id===record.id).some(item=>JSON.stringify(item).includes(bytes.toString())),false);
 }finally{await f.close()}
});

test('real HTTP current and nested archived provenance protect originals without leaking other owners',{timeout:60000},async()=>{
 const f=await fixture();try{
  const original=await upload(f),capture=await f.request('/api/v1/inbox/commands/capture','POST',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{kind:'book',rawText:'本人核对的资料标题。'+'自建正文'.repeat(70)+'BODY-NOT-IN-USAGE-MARKER',origin:'manual',terminalId:'local',attachmentIds:[original.id]}});assert.equal(capture.status,200,capture.bytes.toString());
  f.seed('books',{kind:'material',title:'已归档历史出处',status:'archived',inboxOrigins:[{history:[{attachments:[{id:original.id}]}]}]});
  const foreign=f.seed('inbox-assets',{kind:'upload',filename:'OTHER-OWNER-PRIVATE.txt',mime:'text/plain',mediaKind:'text',size:1,status:'stored',sha256:hash('x')},'private','member_owned_other');assert.equal((await f.request(prefix+'/'+foreign.id)).status,404);assert.equal((await f.request(prefix+'?state=all')).bytes.includes(Buffer.from('OTHER-OWNER-PRIVATE')),false);
  let record=(await life(f,original,'trash')).body.data;const usage=await f.request(prefix+'/'+record.id+'/usage');assert.ok(usage.body.data.referenceCount>=2);assert.ok(usage.body.data.references.some((item:any)=>item.domain==='books'&&item.historical));assert.equal(usage.bytes.includes(Buffer.from('BODY-NOT-IN-USAGE-MARKER')),false);assert.equal((await life(f,record,'delete')).status,409);
  record=(await life(f,record,'restore')).body.data;assert.equal(record.lifecycle,'active');assert.equal((await f.request(prefix+'?scope=family')).body.data.items.length,0);
 }finally{await f.close()}
});

test('real HTTP receipt-only historical attachment remains a deletion blocker',{timeout:60000},async()=>{
 const f=await fixture();try{
  const original=await upload(f),business=f.seed('books',{kind:'material',title:'历史资料摘要',text:'HISTORICAL-BODY-NOT-IN-USAGE',attachments:[{id:original.id}],status:'accepted'});f.patch('books',business,{attachments:[],status:'archived'});
  const record=(await life(f,original,'trash')).body.data,usage=await f.request(prefix+'/'+original.id+'/usage');assert.equal(usage.status,200);assert.ok(usage.body.data.references.some((ref:any)=>ref.domain==='command-history'&&ref.id===business.id&&ref.historical));assert.equal(usage.bytes.includes(Buffer.from('HISTORICAL-BODY-NOT-IN-USAGE')),false);assert.equal((await life(f,record,'delete')).status,409);await access(join(f.directory,'inbox-materials',original.id+'.bin'));
 }finally{await f.close()}
});

test('real HTTP scan reuse copies exact bytes once, keeps provenance and survives lost receipt/restart',{timeout:60000},async()=>{
 const f=await fixture();try{
  const src=await source(f),original=await upload(f,png,'原件.png','image/png'),target=await ticket(f,src),intent={commandId:randomUUID(),expectedVersion:original.revision,uploadId:target.id};
  const replies=await Promise.all([f.request(prefix+'/'+original.id+'/reuse-book','POST',intent),f.request(prefix+'/'+original.id+'/reuse-book','POST',intent)]);for(const reply of replies){assert.equal(reply.status,200,reply.bytes.toString());assert.equal(reply.body.data.lastReuse.status,'complete');assert.equal(reply.body.data.lastReuse.bookUpload.sha256,hash(png));assert.equal(reply.body.data.lastReuse.bookUpload.sourceAssetId,original.id);}
  assert.deepEqual(await readFile(join(f.directory,'knowledge-uploads',target.id+'.bin')),png);assert.deepEqual((await f.request(prefix+'/'+original.id+'/file')).bytes,png);assert.equal((await f.request('/api/v1/book-uploads/'+target.id+'/file')).status,200);
  const registered=await command(f,'books','create',{uploadId:target.id,title:'复用原件后的正常书目',edition:'自建',pages:1,rights:'自行生成'});assert.equal(registered.status,200,registered.bytes.toString());assert.equal(registered.body.data.stage,0);assert.deepEqual(registered.body.data.pageTexts,[]);
  await f.restart();const replay=await f.request(prefix+'/'+original.id+'/reuse-book','POST',intent);assert.equal(replay.status,200);assert.equal(replay.body.data.lastReuse.status,'complete');assert.equal(f.runtime.v1.list('books','server-admin').filter(item=>item.kind==='book').length,1);
  const asset=(await f.request(prefix+'/'+original.id)).body.data;assert.ok((await f.request(prefix+'/'+original.id+'/usage')).body.data.references.some((ref:any)=>ref.domain==='books'&&ref.id===registered.body.data.id));assert.equal((await life(f,(await life(f,asset,'trash')).body.data,'delete')).status,409);
  const text=await upload(f);assert.equal((await f.request(prefix+'/'+text.id+'/reuse-book','POST',{commandId:randomUUID(),expectedVersion:text.revision,uploadId:target.id})).status,400);
 }finally{await f.close()}
});

test('durable pending copy after restart locks legacy writers and resumes only the fixed explicit intent',{timeout:60000},async()=>{
 const f=await fixture();try{
  const src=await source(f),original=await upload(f,png,'待确认.png','image/png'),target=await ticket(f,src),commandId=randomUUID(),intent={commandId,expectedVersion:original.revision,uploadId:target.id},payload={id:original.id,commandId,uploadId:target.id};
  // Durable fixture represents a crash after target bytes/receipt were stored but
  // before finishing the asset. The restart below is an actual application restart.
  await mkdir(join(f.directory,'knowledge-uploads'),{recursive:true});await writeFile(join(f.directory,'knowledge-uploads',target.id+'.bin'),png);
  const pending:DomainHandler={domain:'inbox-assets',commands:[],execute:(_c,_p,ctx)=>{ctx.update('books',target.id,{status:'stored',stored:true,sha256:hash(png),sourceAssetId:original.id,reuseCommandId:commandId,copyState:'running'});return ctx.update('inbox-assets',original.id,{lastReuse:{commandId,uploadId:target.id,status:'running',sourceSha256:original.sha256}})}};
  f.runtime.v1.execute(pending,'begin-copy',{commandId,expectedVersion:original.revision,scope:'private',payload},'server-admin',()=>undefined);await f.restart();let asset=(await f.request(prefix+'/'+original.id)).body.data;assert.equal(asset.lastReuse.status,'running');
  assert.equal((await f.request('/api/v1/book-uploads/'+target.id+'/file','PUT',png)).status,409);assert.equal((await command(f,'books','create',{uploadId:target.id,title:'不得半完成登记',edition:'自建',pages:1,rights:'自建'})).status,422);assert.equal((await life(f,asset,'trash')).status,409);assert.equal((await f.request(prefix+'/'+asset.id+'/process','POST',{commandId:randomUUID(),expectedVersion:asset.revision,operation:'extract',cloudConsent:false})).status,409);
  const resumed=await f.request(prefix+'/'+original.id+'/reuse-book','POST',intent);assert.equal(resumed.status,200,resumed.bytes.toString());assert.equal(resumed.body.data.lastReuse.status,'complete');assert.deepEqual(await readFile(join(f.directory,'knowledge-uploads',target.id+'.bin')),png);
  const another=await upload(f,png,'撤权前原件.png','image/png'),deniedTicket=await ticket(f,src);const current=f.runtime.v1.read('sources',src.id,'server-admin')!;assert.equal((await command(f,'sources','authorize',{sourceId:src.id,authorized:false,reason:'合成撤权'},current.revision)).status,200);assert.equal((await f.request(prefix+'/'+another.id+'/reuse-book','POST',{commandId:randomUUID(),expectedVersion:another.revision,uploadId:deniedTicket.id})).status,403);assert.equal(f.runtime.v1.read('books',deniedTicket.id,'server-admin')!.stored,false);
 }finally{await f.close()}
});

test('durable delete intent waits for explicit retry; changed bytes fail closed without restoring active',{timeout:60000},async()=>{
 const f=await fixture();try{
  const original=await upload(f),trashed=(await life(f,original,'trash')).body.data,commandId=randomUUID(),intent={commandId,expectedVersion:trashed.revision,action:'delete',confirmed:true},payload={id:original.id,commandId,action:'delete'};
  const pending:DomainHandler={domain:'inbox-assets',commands:[],execute:(_c,_p,ctx)=>ctx.update('inbox-assets',original.id,{deletion:{commandId,status:'running'}})};f.runtime.v1.execute(pending,'begin-delete',{commandId,expectedVersion:trashed.revision,scope:'private',payload},'server-admin',()=>undefined);await f.restart();await access(join(f.directory,'inbox-materials',original.id+'.bin'));assert.equal((await f.request(prefix+'/'+original.id)).body.data.deletion.status,'running');
  const resumed=await f.request(prefix+'/'+original.id+'/lifecycle','POST',intent);assert.equal(resumed.status,200,resumed.bytes.toString());assert.equal(resumed.body.data.lifecycle,'deleted');
  const corrupt=await upload(f),recycled=(await life(f,corrupt,'trash')).body.data,path=join(f.directory,'inbox-materials',corrupt.id+'.bin');await writeFile(path,Buffer.from('changed bytes owned by this fixture'));const failed=await life(f,recycled,'delete');assert.equal(failed.status,200);assert.equal(failed.body.data.deletion.status,'failed');assert.equal(failed.body.data.lifecycle,'trashed');await access(path);
 }finally{await f.close()}
});

test('new book-byte identity guards and running-copy create/rescan locks reject bypasses',{timeout:60000},async()=>{
 const f=await fixture();try{
  const src=await source(f),original=await upload(f,png,'保护扫描.png','image/png'),target=await ticket(f,src),path='/api/v1/book-uploads/'+target.id+'/file';assert.equal((await f.request(path,'PUT',png)).status,200);assert.deepEqual((await f.request(path)).bytes,png);
  for(const suffix of ['jarvis_member_session=','jarvis_member_session=expired','jarvis_terminal_session=untrusted'])for(const method of ['GET','PUT'])assert.equal((await f.request(path,method,method==='PUT'?png:undefined,f.cookie+'; '+suffix)).status,403);
  for(const extra of [{authorization:'Bearer owned-terminal-fixture'},{'x-jarvis-terminal-token':'owned-terminal-fixture'}])for(const method of ['GET','PUT'])assert.equal((await f.request(path,method,method==='PUT'?png:undefined,f.cookie,extra)).status,403);
  const stored=f.runtime.v1.read('books',target.id,'server-admin')!;f.patch('books',stored,{copyState:'running',sourceAssetId:original.id,reuseCommandId:randomUUID()});assert.equal((await f.request(path,'PUT',png)).status,409);assert.equal((await command(f,'books','create',{uploadId:target.id,title:'半完成不登记',edition:'自建',pages:1,rights:'自建'})).status,422);
  const oldTicket=await ticket(f,src);assert.equal((await f.request('/api/v1/book-uploads/'+oldTicket.id+'/file','PUT',png)).status,200);const book=await command(f,'books','create',{uploadId:oldTicket.id,title:'合成待补扫书目',edition:'自建',pages:1,rights:'自建'});assert.equal(book.status,200);const doubt=await command(f,'books','doubt',{bookId:book.body.data.id,page:1,type:'自建疑点',ocr:'pixel',reason:'仅核对补扫票据锁'},book.body.data.revision);assert.equal(doubt.status,200);const rescan=await command(f,'books','rescan',{bookId:book.body.data.id,doubtId:doubt.body.data.doubts[0].id,uploadId:target.id,note:'半完成复制不可补扫'},doubt.body.data.revision);assert.equal(rescan.status,422);assert.match(rescan.body.error?.message??rescan.body.message,/完成已存原件复用/);assert.equal(f.runtime.v1.read('books',book.body.data.id,'server-admin')!.doubts[0].rescanEvidence,undefined);
 }finally{await f.close()}
});

test('real HTTP logout at final deletion boundary preserves the file and failed trash intent',{timeout:60000},async()=>{
 const f=await fixture(),arrived=gate(),release=gate();let probe:Awaited<ReturnType<typeof boundaryProbe>>|undefined;
 try{const original=await upload(f),trashed=(await life(f,original,'trash')).body.data;probe=await boundaryProbe(f,'delete',arrived,release);const pending=probe.request(prefix+'/'+original.id+'/lifecycle',{commandId:randomUUID(),expectedVersion:trashed.revision,action:'delete',confirmed:true});await waitGate(arrived.promise);assert.equal((await f.request('/api/auth/logout','POST',{})).status,200);release.release();const result=await pending;assert.equal(result.status,401);const record=f.runtime.v1.read('inbox-assets',original.id,'server-admin')!;assert.equal(record.lifecycle,'trashed');assert.equal(record.deletion.status,'failed');await access(join(f.directory,'inbox-materials',original.id+'.bin'));
 }finally{release.release();if(probe)await probe.app.close();await f.close()}
});

test('real HTTP source withdrawal during copy await cannot complete a book ticket',{timeout:60000},async()=>{
 const f=await fixture(),arrived=gate(),release=gate();let probe:Awaited<ReturnType<typeof boundaryProbe>>|undefined;
 try{const src=await source(f),original=await upload(f,png,'中途撤权.png','image/png'),target=await ticket(f,src);probe=await boundaryProbe(f,'copy',arrived,release);const pending=probe.request(prefix+'/'+original.id+'/reuse-book',{commandId:randomUUID(),expectedVersion:original.revision,uploadId:target.id});await waitGate(arrived.promise);const current=f.runtime.v1.read('sources',src.id,'server-admin')!;assert.equal((await command(f,'sources','authorize',{sourceId:src.id,authorized:false,reason:'copy await期间撤权'},current.revision)).status,200);release.release();const result=await pending;assert.equal(result.status,200);assert.equal(result.body.data.lastReuse.status,'failed');const targetState=f.runtime.v1.read('books',target.id,'server-admin')!;assert.equal(targetState.status,'awaiting-file');assert.equal(targetState.stored,false);assert.equal(targetState.copyState,'failed');assert.deepEqual((await f.request(prefix+'/'+original.id+'/file')).bytes,png);
 }finally{release.release();if(probe)await probe.app.close();await f.close()}
});

test('real HTTP late original read is rejected after a concurrent permanent deletion',{timeout:60000},async()=>{
 const f=await fixture(),arrived=gate(),release=gate(),probe=Fastify();let calls=0;
 try{const bytes=Buffer.from('LATE-READ-ORIGINAL-PRIVATE'),original=await upload(f,bytes);await probe.register(cookiePlugin);probe.setErrorHandler((error,_req,reply)=>error instanceof BusinessError?reply.code(error.status).send({code:error.code,message:error.message}):reply.code(500).send({code:'UNEXPECTED'}));
  registerInboxMaterials(probe,f.runtime.v1,{directory:join(f.directory,'inbox-materials'),authenticated:token=>f.runtime.store.validateLogin(token),authorize:async req=>{if(req.method==='GET'&&req.url===prefix+'/'+original.id+'/file'&&++calls===2){arrived.release();await release.promise;}}});await probe.listen({host:'127.0.0.1',port:0});const address=probe.server.address();assert.ok(address&&typeof address!=='string');const pending=fetch(`http://127.0.0.1:${address.port}`+prefix+'/'+original.id+'/file',{headers:{cookie:f.cookie},signal:AbortSignal.timeout(15000)});await waitGate(arrived.promise);
  const trashed=(await life(f,original,'trash')).body.data,deleted=await life(f,trashed,'delete');assert.equal(deleted.status,200);assert.equal(deleted.body.data.lifecycle,'deleted');release.release();const response=await pending,body=Buffer.from(await response.arrayBuffer());assert.equal(response.status,410);assert.equal(body.includes(bytes),false);await assert.rejects(access(join(f.directory,'inbox-materials',original.id+'.bin')));
 }finally{release.release();await probe.close();await f.close()}
});
