import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {MAX_INBOX_MATERIAL_BYTES,materialReference} from '../src/v1/inbox-materials.js';
import {BusinessError,type DomainHandler} from '../src/v1/types.js';

const prefix='/api/v1/inbox-materials/uploads';
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-material-http-'));let modelCalls=0;
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},run:async()=>{modelCalls++;throw Error('No model calls in isolated material tests')}} as unknown as PiService;
 let runtime:Awaited<ReturnType<typeof createApp>>,base='';
 const start=async()=>{runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'no-web')});await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;};
 const request=async(path:string,method='GET',body?:unknown,cookie='',headers:Record<string,string>={})=>{
  const bytes=Buffer.isBuffer(body),response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':bytes?'application/octet-stream':'application/json'}),...headers},...(body===undefined?{}:{body:bytes?body:JSON.stringify(body)}),signal:AbortSignal.timeout(15_000)});
  const buffer=Buffer.from(await response.arrayBuffer());let json:any;try{json=JSON.parse(buffer.toString())}catch{}
  return {status:response.status,headers:response.headers,bytes:buffer,body:json,cookie:response.headers.getSetCookie().filter(value=>!value.startsWith('jarvis_session=;')).map(value=>value.split(';')[0]).join('; ')};
 };
 try{await start();const setup=await request('/api/auth/setup','POST',{password:randomUUID()+'-isolated'});assert.equal(setup.status,200);
  const oversized=(path:string)=>new Promise<number>((resolve,reject)=>{const req=httpRequest(base+path,{method:'PUT',headers:{cookie:setup.cookie,'content-type':'application/octet-stream','content-length':String(MAX_INBOX_MATERIAL_BYTES+1)}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode??0));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('oversize probe timeout')));req.end(Buffer.from('x'));});
  return {get runtime(){return runtime;},directory,request,oversized,cookie:setup.cookie,async restart(){await runtime.app.close();await start();},async close(){try{await runtime.app.close()}finally{const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-inbox-material-http-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});}assert.equal(modelCalls,0)}};
 }catch(error){if(runtime!)await runtime.app.close();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});throw error;}
}
async function upload(f:Awaited<ReturnType<typeof fixture>>,filename:string,mime:string,bytes:Buffer,scope='private'){
 const id=randomUUID(),prepared=await f.request(prefix,'POST',{id,filename,mime,size:bytes.length,scope},f.cookie);assert.equal(prepared.status,200,prepared.bytes.toString());
 const stored=await f.request(prefix+'/'+id+'/file','PUT',bytes,f.cookie);assert.equal(stored.status,200,stored.bytes.toString());return {id,prepared,stored};
}
function wav(){const bytes=Buffer.alloc(46);bytes.write('RIFF');bytes.writeUInt32LE(38,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(2,40);return bytes;}
function docx(){
 const files=[['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],['word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>original docx</w:t></w:r></w:p></w:body></w:document>']];
 const local:Buffer[]=[],central:Buffer[]=[];let position=0;
 const crc32=(bytes:Buffer)=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
 for(const [filename,text] of files){const name=Buffer.from(filename),body=Buffer.from(text),crc=crc32(body),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(body.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(name.length,26);local.push(header,name,body);const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(body.length,20);entry.writeUInt32LE(body.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(position,42);central.push(entry,name);position+=header.length+name.length+body.length;}
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(position,16);return Buffer.concat([...local,directory,end]);
}

test('real HTTP immutable original upload, replay, persistence and safe text extraction',{timeout:60_000},async()=>{
 const f=await fixture();try{
  const original=Buffer.from('  <script>保留原件但只作文字下载</script>\n第二行：中文、音符🎵与空白  '),id=randomUUID(),prepare={id,filename:'灵感原件.md',mime:'text/markdown; charset=utf-8',size:original.length,scope:'private'};
  const first=await f.request(prefix,'POST',prepare,f.cookie);assert.equal(first.status,200,first.bytes.toString());assert.equal(first.body.data.status,'awaiting-file');
  const repeat=await f.request(prefix,'POST',prepare,f.cookie);assert.equal(repeat.status,200);assert.deepEqual(repeat.body.data,first.body.data);
  assert.equal((await f.request(prefix,'POST',{...prepare,scope:'family'},f.cookie)).status,409);
  assert.equal((await f.request(prefix,'POST',{...prepare,filename:'另一个.md'},f.cookie)).status,409);
  assert.equal((await f.request(prefix+'/'+id+'/file','GET',undefined,f.cookie)).status,404);
  assert.equal((await f.request(prefix+'/'+id+'/file','PUT',original.subarray(1),f.cookie)).status,400);
  const saved=await f.request(prefix+'/'+id+'/file','PUT',original,f.cookie);assert.equal(saved.status,200,saved.bytes.toString());const asset=saved.body.data;
  assert.equal(asset.status,'stored');assert.equal(asset.ownerId,'server-admin');assert.equal(asset.scope,'private');assert.equal(asset.sha256,digest(original));assert.equal(asset.mime,'text/markdown');assert.equal(asset.extractedText,original.toString());assert.equal(asset.textStatus,'extracted');assert.equal(asset.textTruncated,false);
  const replay=await f.request(prefix+'/'+id+'/file','PUT',original,f.cookie);assert.equal(replay.status,200);assert.deepEqual(replay.body.data,asset);
  const changed=Buffer.from(original);changed[0]=33;assert.equal((await f.request(prefix+'/'+id+'/file','PUT',changed,f.cookie)).status,409);
  assert.deepEqual((await f.request(prefix,'POST',prepare,f.cookie)).body.data,asset);
  const storedPath=join(f.directory,'inbox-materials',id+'.bin');assert.deepEqual(await readFile(storedPath),original);
  const get=await f.request(prefix+'/'+id+'/file','GET',undefined,f.cookie);assert.equal(get.status,200);assert.deepEqual(get.bytes,original);assert.equal(get.headers.get('cache-control'),'private, no-store');assert.equal(get.headers.get('x-content-type-options'),'nosniff');assert.match(get.headers.get('content-disposition')??'',/^attachment; filename="original.md"; filename\*=UTF-8''/);assert.match(get.headers.get('content-security-policy')??'',/sandbox/);
  assert.equal((await f.request('/api/v1/knowledge/books?limit=100','GET',undefined,f.cookie)).body.data.items.length,0);assert.equal((await f.request('/api/v1/inbox?limit=100','GET',undefined,f.cookie)).body.data.items.length,0);
  await f.restart();assert.deepEqual((await f.request(prefix+'/'+id+'/file','GET',undefined,f.cookie)).bytes,original);assert.equal((await f.request(prefix+'/'+id,'GET',undefined,f.cookie)).body.data.sha256,asset.sha256);
  await writeFile(storedPath,changed);assert.equal((await f.request(prefix+'/'+id+'/file','GET',undefined,f.cookie)).status,409);assert.equal((await f.request(prefix+'/'+id+'/file','PUT',original,f.cookie)).status,409);
 }finally{await f.close();}
});

test('real HTTP supported audio and documents preserve bytes; unsupported parsing stays explicit',{timeout:60_000},async()=>{
 const f=await fixture();try{
  const webm=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('webm original fixture')]),ogg=Buffer.alloc(64);ogg.write('OggS');ogg.write('OpusHead',28);
  const m4a=Buffer.alloc(24);m4a.writeUInt32BE(24);m4a.write('ftypM4A ',4);m4a.write('isom',16);m4a.write('mp42',20);
  const samples:[string,string,Buffer,string][]=[['录音.webm','audio/webm;codecs=opus',webm,'not-applicable'],['录音.ogg','audio/ogg',ogg,'not-applicable'],['录音.wav','audio/x-wav',wav(),'not-applicable'],['录音.mp3','audio/mpeg',Buffer.from([0xff,0xfb,0x90,0x64,0,0,0,0]),'not-applicable'],['录音.m4a','audio/mp4',m4a,'not-applicable'],['文档.pdf','application/pdf',Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'),'unsupported'],['文档.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',docx(),'unsupported'],['纯文本.txt','text/plain',Buffer.from('UTF-8 原文'),'extracted'],['表格.csv','text/csv',Buffer.from('名称,内容\n灵感,原文'),'extracted'],['资料.json','application/json',Buffer.from('{"内容":"原文"}'),'extracted'],['图片.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6o1UAAAAASUVORK5CYII=','base64'),'not-applicable']];
  for(const [filename,mime,bytes,textStatus] of samples){const {id,stored}=await upload(f,filename,mime,bytes);assert.equal(stored.body.data.textStatus,textStatus);assert.equal(stored.body.data.sha256,digest(bytes));if(textStatus!=='extracted')assert.equal(stored.body.data.extractedText,'');const read=await f.request(prefix+'/'+id+'/file','GET',undefined,f.cookie);assert.deepEqual(read.bytes,bytes);assert.equal(read.headers.get('x-content-type-options'),'nosniff');assert.ok((read.headers.get('content-disposition')??'').startsWith(filename.endsWith('.png')||filename.startsWith('录音')?'inline;':'attachment;'));}
  const longText='🎵'.repeat(120001),large=await upload(f,'长原文.txt','text/plain',Buffer.from(longText));assert.equal(large.stored.body.data.extractedText.length,120000);assert.equal(Array.from(large.stored.body.data.extractedText).length,60000);assert.equal(large.stored.body.data.textTruncated,true);assert.deepEqual((await f.request(prefix+'/'+large.id+'/file','GET',undefined,f.cookie)).bytes,Buffer.from(longText));
 }finally{await f.close();}
});

test('real HTTP rejects anonymous and family credentials, unsafe paths, oversize and forged content',{timeout:60_000},async()=>{
 const f=await fixture();try{
  const bytes=wav(),prepared=await upload(f,'隔离录音.wav','audio/wav',bytes),id=prepared.id;
  const member=f.runtime.store.create('members',{name:'隔离原件权限',role:'adult',preferences:'',voice:'alloy',wakeWord:'隔离验收'});f.runtime.identity.setCredential(member.id,'246810','pin');const login=await f.request('/api/runtime/identity/login','POST',{profileId:member.id,credential:'246810'});assert.equal(login.status,200);
  for(const cookie of ['',login.cookie,'jarvis_session=invalid'])for(const [path,method,body] of [[prefix,'POST',{id:randomUUID(),filename:'原件.txt',mime:'text/plain',size:1,scope:'private'}],[prefix+'/'+id,'GET',undefined],[prefix+'/'+id+'/file','GET',undefined],[prefix+'/'+id+'/file','PUT',bytes]] as const)assert.equal((await f.request(path,method,body,cookie)).status,401);
  const base={id:randomUUID(),filename:'原件.txt',mime:'text/plain',size:1,scope:'private'};
  for(const patch of [{filename:'../原件.txt'},{filename:'D:\\private.txt'},{filename:'坏\r\n文件.txt'},{filename:'脚本.html',mime:'text/html'},{filename:'伪装.png',mime:'text/plain'},{size:MAX_INBOX_MATERIAL_BYTES+1},{id:'../../outside'},{sourceUrl:'https://user:password@example.test/'}])assert.equal((await f.request(prefix,'POST',{...base,...patch},f.cookie)).status,400);
  assert.equal((await f.request(prefix+'/%2e%2e%2foutside/file','GET',undefined,f.cookie)).status,400);
  for(const [filename,mime,body] of [['伪装.pdf','application/pdf',Buffer.from('not a pdf')],['二进制.txt','text/plain',Buffer.from([0xff,0xfe,0,1])],['坏json.json','application/json',Buffer.from('{not json}')],['伪装.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',Buffer.from('PK\x03\x04not a docx')]] as const){const invalidId=randomUUID();assert.equal((await f.request(prefix,'POST',{id:invalidId,filename,mime,size:body.length,scope:'private'},f.cookie)).status,200);assert.equal((await f.request(prefix+'/'+invalidId+'/file','PUT',body,f.cookie)).status,400);assert.equal((await f.request(prefix+'/'+invalidId,'GET',undefined,f.cookie)).body.data.status,'awaiting-file');}
  const oversizedId=randomUUID();assert.equal((await f.request(prefix,'POST',{...base,id:oversizedId},f.cookie)).status,200);assert.equal(await f.oversized(prefix+'/'+oversizedId+'/file'),413);assert.equal((await f.request(prefix+'/'+oversizedId,'GET',undefined,f.cookie)).body.data.status,'awaiting-file');
  const unsafeOrigin=await f.request(prefix,'POST',{...base,id:randomUUID()},f.cookie,{origin:'http://outside.test'});assert.equal(unsafeOrigin.status,403);
  const reference:DomainHandler={domain:'inbox',commands:['reference'],execute:(_command,p,ctx)=>{const result=materialReference(ctx,p.id);return ctx.create('inbox',{...result.metadata,originalText:result.extractedText},randomUUID())}};
  assert.throws(()=>f.runtime.v1.execute(reference,'reference',{commandId:randomUUID(),expectedVersion:0,scope:'family',payload:{id}},'server-admin',()=>undefined),e=>e instanceof BusinessError&&e.status===403);
 }finally{await f.close();}
});

test('real HTTP bounded mp4 brand inspection and well-formed filename validation',{timeout:30_000},async()=>{
 const f=await fixture();try{
  const invalidName=await f.request(prefix,'POST',{id:randomUUID(),filename:'无效\ud800.txt',mime:'text/plain',size:1,scope:'private'},f.cookie);assert.equal(invalidName.status,400);
  const malformed=Buffer.alloc(8192);malformed.writeUInt32BE(malformed.length);malformed.write('ftypM4A ',4);malformed.write('isom',malformed.length-4);
  const id=randomUUID();assert.equal((await f.request(prefix,'POST',{id,filename:'损坏品牌盒.m4a',mime:'audio/mp4',size:malformed.length,scope:'private'},f.cookie)).status,200);
  assert.equal((await f.request(prefix+'/'+id+'/file','PUT',malformed,f.cookie)).status,400);assert.equal((await f.request(prefix+'/'+id,'GET',undefined,f.cookie)).body.data.status,'awaiting-file');
  const ordinary=Buffer.alloc(24);ordinary.writeUInt32BE(24);ordinary.write('ftypM4A ',4);ordinary.write('isom',16);ordinary.write('mp42',20);const valid=await upload(f,'普通录音.m4a','audio/mp4',ordinary);assert.equal(valid.stored.body.data.status,'stored');
 }finally{await f.close();}
});
