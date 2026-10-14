import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { BusinessError } from './types.js';
import type { V1Repository } from './repository.js';
import { knowledgeBookHandler } from './knowledge-domains.js';

const MAX_FILE_BYTES=32*1024*1024;
export function detectScanMime(bytes:Buffer):string|null {
 if(bytes.length>=5&&bytes.subarray(0,5).toString('ascii')==='%PDF-')return 'application/pdf';
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
 return null;
}
function ownedPath(root:string,id:string):string {
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new BusinessError('VALIDATION','上传编号无效',400);
 const path=resolve(root,id+'.bin');if(!path.startsWith(resolve(root)+sep))throw new BusinessError('FORBIDDEN','文件路径越界',403);return path;
}
/** This auxiliary route stores bytes. Source registration never accesses a user-supplied path or URL. */
export function registerKnowledgeFiles(app:FastifyInstance,repository:V1Repository,options:{directory:string;actorId?:string;authenticated:(cookie:string)=>boolean}):void {
 const actorId=options.actorId??'server-admin',root=resolve(options.directory);
 if(!app.hasContentTypeParser('application/octet-stream'))app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:MAX_FILE_BYTES},(_req,body,done)=>done(null,body));
 const authenticate=async(req:any)=>{if(!options.authenticated(req.cookies.jarvis_session??''))throw new BusinessError('FORBIDDEN','请登录后访问扫描原件',401);};
 const readTicket=(id:string)=>{const record=repository.read('books',id,actorId);if(!record||record.kind!=='upload')throw new BusinessError('VALIDATION','上传票据不存在',404);return record;};
 app.put<{Params:{id:string};Body:Buffer}>('/api/v1/book-uploads/:id/file',{bodyLimit:MAX_FILE_BYTES,preHandler:authenticate},async req=>{
  const ticket=readTicket(req.params.id),bytes=req.body;
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_FILE_BYTES)throw new BusinessError('VALIDATION','请选择1字节至32MB的扫描文件',400);
  const mime=detectScanMime(bytes),hash=createHash('sha256').update(bytes).digest('hex');
  if(mime!==ticket.mime||bytes.length!==ticket.size)throw new BusinessError('VALIDATION','文件实际类型或大小与上传票据不一致',400);
  if(ticket.status==='stored'&&ticket.sha256===hash)return {requestId:randomUUID(),version:ticket.revision,data:ticket,events:[]};
  if(ticket.status!=='awaiting-file'||Date.parse(ticket.expiresAt)<=Date.now())throw new BusinessError('REVIEW_REQUIRED','上传票据已使用或过期',422);
  const target=ownedPath(root,ticket.id);await mkdir(root,{recursive:true});
  try{await writeFile(target,bytes,{flag:'wx',mode:0o600});}catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   const existing=await readFile(target);if(createHash('sha256').update(existing).digest('hex')!==hash)throw new BusinessError('CONFLICT','该票据已有不同原件，不能覆盖，请重新申请上传',409);
  }
  // Metadata transition and event are committed together; a failed commit leaves an unreferenced original, never a false receipt.
  return repository.execute(knowledgeBookHandler,'complete-upload',{commandId:`upload-${ticket.id}-${hash}`,expectedVersion:ticket.revision,scope:ticket.scope,payload:{uploadId:ticket.id,sha256:hash,size:bytes.length,mime}},actorId,()=>undefined);
 });
 app.get<{Params:{id:string}}>('/api/v1/book-uploads/:id/file',{preHandler:authenticate},async(req,reply)=>{
  const ticket=readTicket(req.params.id);if(!ticket.stored)throw new BusinessError('VALIDATION','原件尚未上传',404);
  let bytes:Buffer;try{bytes=await readFile(ownedPath(root,ticket.id));}catch{throw new BusinessError('NOT_CONFIGURED','原件文件不可用，请核查存储',503);}
  if(createHash('sha256').update(bytes).digest('hex')!==ticket.sha256)throw new BusinessError('CONFLICT','原件指纹异常，停止展示并请核查',409);
  reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`inline; filename="original.${ticket.mime==='application/pdf'?'pdf':ticket.mime.split('/')[1]}"; filename*=UTF-8''${encodeURIComponent(ticket.filename)}`);
  return reply.type(ticket.mime).send(bytes);
 });
}
