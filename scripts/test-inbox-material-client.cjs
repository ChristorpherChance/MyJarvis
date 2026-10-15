const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildSync}=require('esbuild');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-material-client-'));
function bundle(entry,name){const file=path.join(temp,name+'.cjs');buildSync({entryPoints:[path.resolve(entry)],bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'});return require(file)}
const client=bundle('apps/web/src/features/operations/inbox-material-client.ts','client');
const drafts=bundle('apps/web/src/features/operations/inbox-draft.ts','drafts');
const search=bundle('apps/web/src/features/operations/inbox-search.ts','search');
const commands=bundle('apps/web/src/demo/live-operation-commands.ts','commands');
class MemoryStorage{entries=new Map();get length(){return this.entries.size}key(i){return [...this.entries.keys()][i]??null}getItem(k){return this.entries.get(k)??null}setItem(k,v){this.entries.set(k,String(v))}removeItem(k){this.entries.delete(k)}}
global.localStorage=new MemoryStorage();global.location={origin:'https://capture.test'};
const response=data=>new Response(JSON.stringify({requestId:'qa',version:1,data,events:[]}),{status:200,headers:{'Content-Type':'application/json'}});
let checks=0;
async function check(label,fn){await fn();checks++;console.log('PASS '+label)}
(async()=>{
 await check('source links permit only credential-free HTTP(S), including historical rendering inputs',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,hello','file:///secret','https://name:password@example.com/','https://name@example.com/','not a link',''])assert.equal(client.safeSourceUrl(value),null,value);
  assert.equal(client.safeSourceUrl(' https://example.com/book?q=中 '),'https://example.com/book?q=%E4%B8%AD');
  assert.equal(client.safeSourceUrl('http://example.com/path'),'http://example.com/path');
 });
 await check('a binary upload prepares its fixed UUID and sends exact bytes as octet-stream',async()=>{
  const id=crypto.randomUUID(),blob=new Blob(['原件内容'],{type:'text/plain'}),calls=[];
  global.fetch=async(url,init)=>{calls.push({url,init});return response(calls.length===1?{id,status:'awaiting-file'}:{id,status:'stored',sha256:'f'.repeat(64)})};
  const result=await client.uploadInboxMaterial({id,blob,filename:'原件.txt',mime:'text/plain',scope:'private'});
  assert.equal(result.status,'stored');assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(calls[0].init.body),{id,filename:'原件.txt',mime:'text/plain',size:blob.size,scope:'private'});
  assert.equal(calls[1].url,client.materialFileUrl(id));assert.equal(calls[1].init.method,'PUT');assert.equal(calls[1].init.headers['Content-Type'],'application/octet-stream');assert.equal(calls[1].init.credentials,'same-origin');assert.equal(await calls[1].init.body.text(),'原件内容');
 });
 await check('unknown upload outcome can confirm the same immutable asset without resending a stored original',async()=>{
  const id=crypto.randomUUID(),blob=new Blob(['same original']),ids=[];let stored=false,calls=0;
  global.fetch=async(_url,init)=>{calls++;if(init.method==='POST'){ids.push(JSON.parse(init.body).id);return response({id,status:stored?'stored':'awaiting-file',sha256:stored?'a'.repeat(64):null})}stored=true;throw new TypeError('reply lost')};
  const input={id,blob,filename:'原件.txt',mime:'text/plain',scope:'private'};
  await assert.rejects(client.uploadInboxMaterial(input),/reply lost/);const confirmed=await client.uploadInboxMaterial(input);
  assert.equal(confirmed.id,id);assert.deepEqual(ids,[id,id]);assert.equal(calls,3);
 });
 await check('new source and attachment fields survive reload and are frozen in an uncertain submission',()=>{
  const asset=crypto.randomUUID(),actor='owner',initial=drafts.createInboxDraft({rawText:'',title:'',kind:'idea',scope:'private',terminalId:'手机网页',projectId:'',sourceUrl:'https://example.com/original',attachmentIds:[asset],materialRevision:1});
  const pending=drafts.saveInboxDraft(actor,{...initial,status:'pending'});assert.deepEqual(drafts.getInboxDraft(actor),pending);
  for(const patch of [{sourceUrl:'https://example.com/changed'},{attachmentIds:[]},{attachmentIds:[crypto.randomUUID()]},{materialRevision:2},{scope:'family'}])assert.throws(()=>drafts.saveInboxDraft(actor,{...pending,...patch}),e=>e.code==='CONFLICT');
  assert.throws(()=>drafts.createInboxDraft({...initial,attachmentIds:Array(6).fill(asset)}),e=>e.code==='INVALID');
  const editable=drafts.createInboxDraft({...initial,attachmentIds:[asset]});initial.attachmentIds.length=0;assert.deepEqual(editable.attachmentIds,[asset]);
 });
 await check('capture sends references without inventing a transcript or filling rawText with a filename',async()=>{
  const id=crypto.randomUUID(),asset=crypto.randomUUID();let sent;
  global.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return response({id:'captured'})};
  await commands.executeLiveOperation('op.inbox',{command:'capture',commandId:id,expectedVersion:0,patch:{rawText:'',kind:'idea',scope:'private',terminalId:'手机网页',sourceUrl:'https://example.com/original',attachmentIds:[asset]}},{runtime:{capabilities:{identity:{actorId:'owner'}}}},{inbox:[],research:[],projects:[],tasks:[],experiences:[]});
  assert.equal(sent.commandId,id);assert.equal(sent.payload.rawText,'');assert.deepEqual(sent.payload.attachmentIds,[asset]);assert.equal(sent.payload.sourceUrl,'https://example.com/original');
  assert.match(client.materialStatus({mediaKind:'audio',textStatus:'not-applicable'}),/录音待转写/);assert.match(client.materialStatus({mediaKind:'document',textStatus:'unsupported'}),/文字待解析/);
 });
 await check('search includes extracted text, filenames and merged source links without changing original words',()=>{
  const record={rawText:'原话',sourceUrl:'https://example.com/direct',attachments:[{filename:'长篇研究.pdf'}],materialText:'提取关键词',origins:[{sourceUrl:'https://example.com/merged',attachments:[{filename:'录音.webm'}],materialText:'合并提取'}]};
  for(const term of ['研究.pdf','提取关键词','merged','录音.webm','合并提取'])assert.equal(search.matchesInboxQuery(record,term),true,term);
  assert.equal(search.matchesInboxQuery(record,'does-not-exist'),false);assert.equal(record.rawText,'原话');
 });
 console.log(checks+' inbox material client checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
