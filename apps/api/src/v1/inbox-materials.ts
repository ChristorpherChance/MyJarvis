import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { z } from 'zod';
import { BusinessError, type BusinessRecord, type CommandContext, type DomainHandler } from './types.js';
import type { V1Repository } from './repository.js';
import {registerInboxMaterialProcessing,type InboxMaterialRuntime} from './inbox-material-processing.js';

export const MAX_INBOX_MATERIAL_BYTES=32*1024*1024;
export const MAX_INBOX_MATERIAL_TEXT=120000;
type MediaKind='audio'|'document'|'image'|'text';
type TextStatus='extracted'|'unsupported'|'not-applicable';
export interface InboxMaterialMetadata {id:string;filename:string;mime:string;size:number;sha256:string;mediaKind:MediaKind;textStatus:TextStatus}
const uuid=z.uuid();
const scope=z.enum(['personal','private','family','company']);
const MIME_ALIASES:Record<string,string>={'audio/x-wav':'audio/wav','audio/wave':'audio/wav','audio/mp3':'audio/mpeg','audio/x-m4a':'audio/mp4','text/x-markdown':'text/markdown','text/md':'text/markdown'};
const FORMATS:Record<string,{extensions:string[];kind:MediaKind}>={
 'audio/webm':{extensions:['webm'],kind:'audio'},'audio/ogg':{extensions:['ogg','oga'],kind:'audio'},'audio/wav':{extensions:['wav'],kind:'audio'},'audio/mpeg':{extensions:['mp3'],kind:'audio'},'audio/mp4':{extensions:['mp4','m4a'],kind:'audio'},
 'application/pdf':{extensions:['pdf'],kind:'document'},'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{extensions:['docx'],kind:'document'},
 'text/plain':{extensions:['txt'],kind:'text'},'text/markdown':{extensions:['md','markdown'],kind:'text'},'text/csv':{extensions:['csv'],kind:'text'},'application/json':{extensions:['json'],kind:'text'},
 'image/png':{extensions:['png'],kind:'image'},'image/jpeg':{extensions:['jpg','jpeg'],kind:'image'},'image/webp':{extensions:['webp'],kind:'image'},
};
const prepareInput=z.object({id:uuid,filename:z.string().trim().min(1).max(240),mime:z.string().trim().min(1).max(200),size:z.number().int().min(1).max(MAX_INBOX_MATERIAL_BYTES),scope}).strict();
function fail(message:string,status=400):never {throw new BusinessError(status===409?'CONFLICT':'VALIDATION',message,status)}
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function canonicalMime(value:string):string {
 const mime=value.split(';',1)[0].trim().toLowerCase();return MIME_ALIASES[mime]??mime;
}
function checkedPreparation(value:unknown) {
 const input=prepareInput.parse(value),mime=canonicalMime(input.mime),format=FORMATS[mime];
 if(!format)fail('暂不支持此文件类型，请选择录音、PDF、DOCX、UTF-8文字或图片');
 // The filename is display metadata, never a filesystem path or a response header verbatim.
 if(/[\\/\x00-\x1f\x7f<>:"|?*]/.test(input.filename)||/[. ]$/.test(input.filename)||input.filename==='.'||input.filename==='..')fail('文件名包含路径或不安全字符');
 if(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input.filename))fail('文件名含无效的Unicode字符');
 const extension=input.filename.split('.').at(-1)?.toLowerCase();
 if(!extension||!format.extensions.includes(extension))fail('文件扩展名与声明类型不一致');
 return {...input,id:input.id.toLowerCase(),mime,mediaKind:format.kind};
}
function ownedPath(root:string,id:string):string {
 const parsed=uuid.safeParse(id);if(!parsed.success)fail('上传编号无效');
 const target=resolve(root,parsed.data.toLowerCase()+'.bin');
 if(!target.startsWith(root+sep))throw new BusinessError('FORBIDDEN','原件路径越界',403);
 return target;
}
/** Inspect the ZIP directory and a bounded content-types entry, without extracting user paths. */
function isDocx(bytes:Buffer):boolean {
 if(bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)return false;
 let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--){if(bytes.readUInt32LE(at)===0x06054b50&&at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break;}}
 if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)return false;
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(count<2||count>10000||count!==bytes.readUInt16LE(end+8)||start+size!==end)return false;
 let at=start,document=false,types=false;const names=new Set<string>();
 try{
  for(let index=0;index<count;index++){
   if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)return false;
   const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),compressed=bytes.readUInt32LE(at+20),expanded=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),local=bytes.readUInt32LE(at+42);
   if(flags&1||at+46+nameLength+extra+comment>end)return false;
   const name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');
   if(names.has(name)||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||/vbaProject\.bin$/i.test(name))return false;
   names.add(name);document ||= name==='word/document.xml';
   if(local+30>start||bytes.readUInt32LE(local)!==0x04034b50)return false;
   const body=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
   if(body+compressed>start)return false;
   if(name==='[Content_Types].xml'){
    if(expanded>1024*1024||compressed>1024*1024)return false;
    const content=bytes.subarray(body,body+compressed),xml=method===0?content:method===8?inflateRawSync(content,{maxOutputLength:1024*1024}):null;
    types=!!xml&&xml.length===expanded&&xml.toString('utf8').includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
   }
   at+=46+nameLength+extra+comment;
  }
 }catch{return false;}
 return at===end&&document&&types;
}
function mp3Frame(bytes:Buffer,offset:number):boolean {
 return bytes.length>=offset+4&&bytes[offset]===0xff&&(bytes[offset+1]&0xe0)===0xe0&&(bytes[offset+1]&0x18)!==8&&(bytes[offset+1]&6)!==0&&(bytes[offset+2]>>4)!==0&&(bytes[offset+2]>>4)!==15&&(bytes[offset+2]&12)!==12;
}
function isMp3(bytes:Buffer):boolean {
 if(mp3Frame(bytes,0))return true;
 if(bytes.length<14||bytes.subarray(0,3).toString('ascii')!=='ID3'||![2,3,4].includes(bytes[3])||bytes.subarray(6,10).some(v=>v>127))return false;
 const size=(bytes[6]<<21)+(bytes[7]<<14)+(bytes[8]<<7)+bytes[9],offset=10+size+((bytes[3]===4&&(bytes[5]&0x10))?10:0);
 return mp3Frame(bytes,offset);
}
function isMp4(bytes:Buffer):boolean {
 if(bytes.length<16||bytes.subarray(4,8).toString('ascii')!=='ftyp')return false;
 const size=bytes.readUInt32BE(0);
 // A media brand box is tiny; bound inspection independently of the 32MiB original.
 if(size<16||size>4096||size>bytes.length||size%4!==0)return false;
 const brands=['M4A ','M4B ','isom','iso2','mp41','mp42','qt  '];
 for(let at=8;at<size;at+=4){if(at===12)continue;if(brands.includes(bytes.subarray(at,at+4).toString('ascii')))return true;}
 return false;
}
function inspectedText(bytes:Buffer,mime:string):{extractedText:string;textTruncated:boolean} {
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('文字文件必须为有效的UTF-8编码');}
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text!))fail('文字文件含二进制控制字节');
 if(mime==='application/json')try{JSON.parse(text!)}catch{fail('JSON文件内容无效');}
 let extractedText=text!.slice(0,MAX_INBOX_MATERIAL_TEXT);
 // The search excerpt stays bounded in UTF-16 without cutting an emoji in half.
 if(extractedText.length<text!.length&&/[\uD800-\uDBFF]$/.test(extractedText))extractedText=extractedText.slice(0,-1);
 return {extractedText,textTruncated:extractedText.length<text!.length};
}
function inspect(bytes:Buffer,ticket:BusinessRecord):{extractedText:string;textTruncated:boolean;textStatus:TextStatus} {
 if(bytes.length!==ticket.size)fail('文件实际大小与上传准备信息不一致');
 if(ticket.mediaKind==='text')return {...inspectedText(bytes,ticket.mime),textStatus:'extracted'};
 const ascii=(start:number,end:number)=>bytes.subarray(start,end).toString('ascii');let valid=false;
 switch(ticket.mime){
  case 'application/pdf':valid=bytes.length>=5&&ascii(0,5)==='%PDF-';break;
  case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':valid=isDocx(bytes);break;
  case 'image/png':valid=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));break;
  case 'image/jpeg':valid=bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;break;
  case 'image/webp':valid=bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';break;
  case 'audio/wav':valid=bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE';break;
  case 'audio/ogg':valid=bytes.length>=32&&ascii(0,4)==='OggS'&&bytes[4]===0&&(bytes.subarray(0,65536).includes(Buffer.from('OpusHead'))||bytes.subarray(0,65536).includes(Buffer.from('vorbis')));break;
  case 'audio/webm':valid=bytes.length>=8&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&bytes.subarray(0,4096).includes(Buffer.from('webm'));break;
  case 'audio/mpeg':valid=isMp3(bytes);break;
  case 'audio/mp4':valid=isMp4(bytes);break;
 }
 if(!valid)fail('文件实际内容与声明类型不一致或文件损坏');
 return {extractedText:'',textTruncated:false,textStatus:ticket.mediaKind==='document'?'unsupported':'not-applicable'};
}
const handler:DomainHandler={domain:'inbox-assets',commands:[],execute(command,p,ctx){
 if(command==='prepare'){
  const input=checkedPreparation(p),record=ctx.create('inbox-assets',{kind:'upload',filename:input.filename,mime:input.mime,size:input.size,mediaKind:input.mediaKind,status:'awaiting-file',sha256:null,textStatus:input.mediaKind==='document'?'unsupported':'not-applicable',extractedText:'',textTruncated:false,createdAt:ctx.now,updatedAt:ctx.now},input.id);
  ctx.emit('inbox-assets',record.id,'upload-prepared',{mime:record.mime,size:record.size});return record;
 }
 if(command==='store'){
  const record=ctx.require('inbox-assets',p.id,true);ctx.check(record);
  if(record.status!=='awaiting-file')fail('原件已保存，不能覆盖',409);
  if(typeof p.sha256!=='string'||!/^[a-f0-9]{64}$/.test(p.sha256))fail('原件指纹无效');
  const stored=ctx.update('inbox-assets',record.id,{status:'stored',sha256:p.sha256,extractedText:p.extractedText,textTruncated:p.textTruncated,textStatus:p.textStatus,updatedAt:ctx.now});
  ctx.emit('inbox-assets',record.id,'file-stored',{mime:record.mime,size:record.size,sha256:p.sha256});return stored;
 }
 fail('不支持的原件操作');
}};
/** Only stored originals owned by the command actor and scope can become inbox references. */
export function materialReference(ctx:CommandContext,id:string):{metadata:InboxMaterialMetadata;extractedText:string;textTruncated:boolean} {
 const parsed=uuid.parse(id).toLowerCase(),record=ctx.require('inbox-assets',parsed);
 if(record.ownerId!==ctx.actorId||record.scope!==ctx.scope)throw new BusinessError('FORBIDDEN','不能关联其他身份或范围的原件',403);
 if(record.kind!=='upload'||record.status!=='stored'||typeof record.sha256!=='string'||!/^[a-f0-9]{64}$/.test(record.sha256))throw new BusinessError('DEPENDENCY_PENDING','请先完成原件上传',422);
 return {metadata:{id:record.id,filename:record.filename,mime:record.mime,size:record.size,sha256:record.sha256,mediaKind:record.mediaKind,textStatus:record.textStatus},extractedText:record.extractedText??'',textTruncated:record.textTruncated===true};
}
/** Save and expose original bytes locally. Never fetch an URL or interpret a client pathname. */
export function registerInboxMaterials(app:FastifyInstance,repository:V1Repository,options:{directory:string;actorId?:string;authenticated:(cookie:string)=>boolean;runtime?:InboxMaterialRuntime}):void {
 const actorId=options.actorId??'server-admin',root=resolve(options.directory),prefix='/api/v1/inbox-materials/uploads';
 if(!app.hasContentTypeParser('application/octet-stream'))app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:MAX_INBOX_MATERIAL_BYTES},(_req,body,done)=>done(null,body));
 const authenticate=async(req:any)=>{if(!options.authenticated(req.cookies.jarvis_session??''))throw new BusinessError('FORBIDDEN','请登录后访问收件原件',401);};
 const response=(record:BusinessRecord)=>({requestId:randomUUID(),version:record.revision,data:record,events:[]});
 const readTicket=(id:string)=>{const parsed=uuid.parse(id).toLowerCase(),record=repository.read('inbox-assets',parsed,actorId);if(!record||record.kind!=='upload')throw new BusinessError('VALIDATION','原件上传不存在或不可访问',404);return record;};
 const readVerified=async(record:BusinessRecord)=>{let bytes:Buffer;try{bytes=await readFile(ownedPath(root,record.id))}catch{throw new BusinessError('NOT_CONFIGURED','原件暂不可用，请核查存储',503)}if(bytes.length!==record.size||hash(bytes)!==record.sha256)fail('原件指纹异常，请核查存储',409);return bytes;};
 const saveOriginal=async(id:string,bytes:Buffer)=>{
  await mkdir(root,{recursive:true,mode:0o700});
  const target=ownedPath(root,id),temporary=resolve(root,`.pending-${randomUUID()}`);
  try{
   const file=await open(temporary,'wx',0o600);try{await file.writeFile(bytes);await file.sync()}finally{await file.close()}
   try{await link(temporary,target)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const previous=await readFile(target);if(previous.length!==bytes.length||hash(previous)!==hash(bytes))fail('此上传编号已有不同原件，不能覆盖',409);}
  }finally{await unlink(temporary).catch(()=>{});}
 };
 app.post(prefix,{onRequest:authenticate},async req=>{
  const input=checkedPreparation(req.body),existing=repository.read('inbox-assets',input.id,actorId);
  if(existing){if(existing.kind!=='upload'||existing.scope!==input.scope||existing.filename!==input.filename||existing.mime!==input.mime||existing.size!==input.size)fail('同一上传编号不能用于不同原件或范围',409);return response(existing);}
  const {id,filename,mime,size,scope:uploadScope}=input;
  return repository.execute(handler,'prepare',{commandId:`inbox-material-prepare:${input.id}`,expectedVersion:0,scope:input.scope,payload:{id,filename,mime,size,scope:uploadScope}},actorId,()=>undefined);
 });
 app.get<{Params:{id:string}}>(prefix+'/:id',{onRequest:authenticate},async(req,reply)=>{reply.header('Cache-Control','private, no-store');return response(readTicket(req.params.id));});
 app.put<{Params:{id:string};Body:Buffer}>(prefix+'/:id/file',{bodyLimit:MAX_INBOX_MATERIAL_BYTES,onRequest:authenticate},async req=>{
  const record=readTicket(req.params.id),bytes=req.body;
  if(canonicalMime(String(req.headers['content-type']??''))!=='application/octet-stream'||!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_INBOX_MATERIAL_BYTES)fail('请以原始字节上传1字节至32MiB原件');
  const extracted=inspect(bytes,record),sha256=hash(bytes);
  if(record.status==='stored'){if(record.sha256!==sha256)fail('同一上传编号已有不同原件，不能覆盖',409);await readVerified(record);return response(record);}
  if(record.status!=='awaiting-file')fail('上传状态不可用',409);
  // Link a fully synced temporary file into place atomically. Parallel writes cannot see a partial original.
  await saveOriginal(record.id,bytes);
  // A metadata failure leaves the immutable original recoverable by retrying this same id and bytes.
  return repository.execute(handler,'store',{commandId:`inbox-material-store:${record.id}:${sha256}`,expectedVersion:record.revision,scope:record.scope,payload:{id:record.id,sha256,...extracted}},actorId,()=>undefined);
 });
 app.get<{Params:{id:string}}>(prefix+'/:id/file',{onRequest:authenticate},async(req,reply)=>{
  const record=readTicket(req.params.id);if(record.status!=='stored')throw new BusinessError('VALIDATION','原件尚未上传',404);
  const bytes=await readVerified(record),extension=FORMATS[record.mime]?.extensions[0]??'bin',disposition=['audio','image'].includes(record.mediaKind)?'inline':'attachment';
  const encoded=encodeURIComponent(record.filename).replace(/[!'()*]/g,value=>'%'+value.charCodeAt(0).toString(16).toUpperCase());
  reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Content-Disposition',`${disposition}; filename="original.${extension}"; filename*=UTF-8''${encoded}`);
  return reply.type(record.mime).send(bytes);
 });
 registerInboxMaterialProcessing(app,repository,{read:readTicket,bytes:readVerified,write:saveOriginal},authenticate,options.runtime,actorId);
}
