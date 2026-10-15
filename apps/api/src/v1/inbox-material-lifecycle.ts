import {randomUUID,createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError,type BusinessRecord,type Domain,type DomainHandler} from './types.js';
import type {V1Repository,CommandReceipt} from './repository.js';
import {knowledgeBookHandler} from './knowledge-domains.js';
import {detectScanMime} from './knowledge-files.js';

const scope=z.enum(['personal','private','family','company']),date=z.iso.datetime({offset:true});
const lifecycleInput=z.object({commandId:z.uuid(),expectedVersion:z.number().int().min(1),action:z.enum(['trash','restore','retention','delete']),confirmed:z.literal(true),retainUntil:date.nullable().optional()}).strict();
const copyInput=z.object({commandId:z.uuid(),expectedVersion:z.number().int().min(1),uploadId:z.uuid()}).strict();
const domains:Domain[]=['inbox','research','projects','tasks','experiences','releases','sources','books','stories','learning','voice','family','memory','personas','machines','services','operations','approvals','settings','jobs'];
const assetKeys=new Set(['assetId','sourceAssetId','originalAssetId','inboxMaterialId','materialAssetId']);
function fail(ok:unknown,message:string,status=409):asserts ok {if(!ok)throw new BusinessError(status===403?'FORBIDDEN':status===400?'VALIDATION':'CONFLICT',message,status)}
export const materialLifecycle=(record:BusinessRecord):string=>record.lifecycle??'active';
export function assertMaterialActive(record:BusinessRecord){fail(materialLifecycle(record)==='active'&&record.deletion?.status!=='running','原件已回收或正在删除，请先恢复后再使用');}
const running=(record:BusinessRecord)=>record.processing?.status==='running'||record.lastReuse?.status==='running'||record.deletion?.status==='running';
function metadata(record:BusinessRecord):BusinessRecord {
 const fields=['kind','status','filename','mime','size','sha256','mediaKind','textStatus','createdAt','updatedAt','retainUntil','trashedAt','deletedAt'];
 return {...Object.fromEntries(fields.filter(key=>record[key]!==undefined).map(key=>[key,record[key]])),id:record.id,revision:record.revision,scope:record.scope,ownerId:record.ownerId,lifecycle:materialLifecycle(record),processing:record.processing?{status:record.processing.status,operation:record.processing.operation}:null};
}
export interface MaterialUsage {assetId:string;revision:number;lifecycle:string;references:Array<{domain:string;id:string;title:string;status:string;scope:string;historical:boolean}>;referenceCount:number;referencesTruncated:boolean;processing:boolean;deleteAllowed:boolean;deleteBlockedReasons:string[]}
/** Inspect only structural reference fields; UUIDs inside notes are not business references. */
export function inboxMaterialUsage(repository:V1Repository,record:BusinessRecord):MaterialUsage {
 const tickets=new Set(repository.list('books',record.ownerId).filter(item=>item.kind==='upload'&&item.sourceAssetId===record.id).map(item=>item.id));
 const references:MaterialUsage['references']=[];let count=0,nodes=0;
 const groups:Array<{domain:string;items:BusinessRecord[]}>=domains.map(domain=>({domain,items:repository.list(domain,record.ownerId)}));groups.push({domain:'command-history',items:repository.commandHistory(record.ownerId)});
 const seen=new Set<string>();
 for(const {domain,items}of groups)for(const item of items){
  if(domain==='command-history'&&item.kind==='upload'&&item.id===record.id)continue;
  let found=false,historical=domain==='command-history';const stack:Array<{value:any;key:string;history:boolean;depth:number}>=[{value:item,key:'',history:historical,depth:0}];
  while(stack.length){const current=stack.pop()!;if(++nodes>2_000_000||current.depth>100)throw new BusinessError('CONFLICT','引用记录过大，暂不能完成安全检查',409);
   const history=current.history||/history|revisions|origins|previous|merged|snapshot/i.test(current.key),value=current.value;
   if(assetKeys.has(current.key)&&value===record.id||current.key==='uploadId'&&tickets.has(value)){found=true;historical||=history;}
   if(Array.isArray(value)){
    if(current.key==='attachments'&&value.some(ref=>ref?.id===record.id)||current.key==='attachmentIds'&&value.includes(record.id)){found=true;historical||=history;}
    for(const child of value)if(child&&typeof child==='object')stack.push({value:child,key:current.key,history,depth:current.depth+1});
   }else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))stack.push({value:child,key,history,depth:current.depth+1});
  }
  const key=domain+':'+item.id;if(found&&!seen.has(key)){seen.add(key);count++;if(references.length<100)references.push({domain,id:item.id,title:String(item.title??item.filename??item.kind??'业务记录').slice(0,240),status:String(item.status??''),scope:item.scope,historical});}
 }
 const reasons:string[]=[];
 if(materialLifecycle(record)!=='trashed')reasons.push('请先移入回收站');
 if(count)reasons.push('仍有业务或历史引用，不能永久删除');
 if(running(record))reasons.push('原件仍在处理、复用或删除中');
 if(record.retainUntil&&Date.parse(record.retainUntil)>Date.now())reasons.push('原件仍在保留期限内');
 return {assetId:record.id,revision:record.revision,lifecycle:materialLifecycle(record),references,referenceCount:count,referencesTruncated:count>references.length,processing:running(record),deleteAllowed:reasons.length===0,deleteBlockedReasons:reasons};
}
export interface MaterialLifecycleAccess {
 read:(id:string)=>BusinessRecord;bytes:(record:BusinessRecord)=>Promise<Buffer>;
 remove:(record:BusinessRecord,beforeUnlink:()=>void)=>Promise<void>;writeBook:(id:string,bytes:Buffer)=>Promise<void>;
}
export function registerInboxMaterialLifecycle(app:FastifyInstance,repository:V1Repository,access:MaterialLifecycleAccess,authenticate:(req:any)=>Promise<void>,current:(req:any)=>boolean,actorId='server-admin'){
 const prefix='/api/v1/inbox-materials/uploads',deletions=new Map<string,Promise<CommandReceipt>>(),copies=new Map<string,Promise<CommandReceipt>>();let closing=false;
 const receipt=(data:unknown)=>({requestId:randomUUID(),version:repository.version(actorId),data,events:[]});
 const check=(req:any)=>fail(!closing&&current(req),'登录会话已失效，请重新验证',401);
 const handler:DomainHandler={domain:'inbox-assets',commands:[],execute(command,p,ctx){
  const original=ctx.require('inbox-assets',p.id);ctx.check(original);
  if(command==='finish-delete'){
   fail(original.deletion?.commandId===p.commandId&&original.deletion.status==='running','删除状态已改变');
   const saved=ctx.update('inbox-assets',original.id,{...(p.error?{}:{lifecycle:'deleted',status:'deleted',filename:'已永久删除原件',extractedText:'',extraction:null,extractionHistory:[],textReview:null,reviewHistory:[],processing:null,lastReuse:null,sourceUrl:null,title:null,deletedAt:ctx.now}),deletion:{...original.deletion,status:p.error?'failed':'complete',finishedAt:ctx.now,...(p.error?{error:p.error}:{})},updatedAt:ctx.now});
   if(!p.error)ctx.redactReceipts('inbox-assets',saved.id,saved);ctx.emit('inbox-assets',saved.id,p.error?'deletion-failed':'original-deleted');return saved;
  }
  if(command==='finish-copy'){
   fail(original.lastReuse?.commandId===p.commandId&&original.lastReuse.status==='running','原件复用状态已改变');
   const ticket=ctx.require('books',original.lastReuse.uploadId);const state=p.error?'failed':'complete';ctx.update('books',ticket.id,{copyState:state,updatedAt:ctx.now});
   const saved=ctx.update('inbox-assets',original.id,{lastReuse:{...original.lastReuse,status:state,finishedAt:ctx.now,...(p.error?{error:p.error}:{bookUpload:{...ticket,copyState:state,revision:ticket.revision+1}})},updatedAt:ctx.now});ctx.emit('inbox-assets',saved.id,p.error?'reuse-failed':'original-reused',{uploadId:ticket.id});return saved;
  }
  fail(materialLifecycle(original)!=='deleted','原件已永久删除，不能再修改');
  if(command==='begin-copy'){
   assertMaterialActive(original);fail(original.status==='stored'&&!running(original),'原件未保存或仍在处理中');
   fail(['application/pdf','image/png','image/jpeg','image/webp'].includes(original.mime),'仅已存PDF或扫描图片可复用为书页；其他原件请保留为资料候选',400);
   const ticket=ctx.require('books',p.uploadId),source=ctx.require('sources',ticket.source);
   fail(ticket.kind==='upload'&&ticket.status==='awaiting-file'&&!ticket.bookId&&!ticket.sourceAssetId&&Date.parse(ticket.expiresAt)>Date.now(),'书目上传票据已使用、被占用或已过期');
   fail(ticket.mime===original.mime&&ticket.size===original.size,'原件与书目上传票据的类型或大小不一致',400);fail(source.kind==='source'&&source.active&&source.authorized&&source.mode!=='live','知识来源未启用或未授权',403);
   ctx.update('books',ticket.id,{sourceAssetId:original.id,reuseCommandId:p.commandId,copyState:'running',updatedAt:ctx.now});
   const saved=ctx.update('inbox-assets',original.id,{lastReuse:{commandId:p.commandId,uploadId:ticket.id,status:'running',sourceSha256:original.sha256,startedAt:ctx.now},updatedAt:ctx.now});ctx.emit('inbox-assets',saved.id,'reuse-started',{uploadId:ticket.id});return saved;
  }
  fail(!running(original),'原件正在处理、复用或删除中，请先确认上次操作');
  if(command==='begin-delete'){const usage=inboxMaterialUsage(repository,original);fail(usage.deleteAllowed,usage.deleteBlockedReasons.join('；'));const saved=ctx.update('inbox-assets',original.id,{deletion:{commandId:p.commandId,status:'running',startedAt:ctx.now},updatedAt:ctx.now});ctx.emit('inbox-assets',saved.id,'deletion-started');return saved;}
  let patch:Record<string,unknown>;
  if(p.action==='trash'){fail(materialLifecycle(original)==='active','原件已在回收站');patch={lifecycle:'trashed',trashedAt:ctx.now};}
  else if(p.action==='restore'){fail(materialLifecycle(original)==='trashed','只有已回收原件可以恢复');patch={lifecycle:'active',trashedAt:null};}
  else {fail(p.action==='retention'&&p.retainUntil!==undefined,'请明确填写保留期限或选择无额外期限',400);patch={retainUntil:p.retainUntil};}
  const saved=ctx.update('inbox-assets',original.id,{...patch,updatedAt:ctx.now});ctx.emit('inbox-assets',saved.id,'lifecycle-updated',{action:p.action});return saved;
 }};
 const execute=(command:string,record:BusinessRecord,payload:Record<string,unknown>,commandId=randomUUID())=>repository.execute(handler,command,{commandId,expectedVersion:record.revision,scope:record.scope,payload:{id:record.id,...payload}},actorId,()=>undefined);
 const publicError=(error:unknown)=>({code:error instanceof BusinessError?error.code:'STORAGE_FAILED',message:error instanceof BusinessError?error.message:'原件操作未完成，请确认同一操作编号的状态；原件记录仍保留。'});
 app.get(prefix,{onRequest:authenticate},async(req,reply)=>{
  const q=z.object({scope:scope.optional(),state:z.enum(['active','trashed','all']).default('active'),search:z.string().max(240).default(''),limit:z.coerce.number().int().min(1).max(100).default(30),cursor:z.string().max(200).optional()}).strict().parse(req.query);
  const list=repository.list('inbox-assets',actorId,q.scope).filter(item=>item.kind==='upload'&&materialLifecycle(item)!=='deleted'&&(q.state==='all'||materialLifecycle(item)===q.state)&&String(item.filename).toLocaleLowerCase().includes(q.search.toLocaleLowerCase()));
  let start=0;if(q.cursor){const at=list.findIndex(item=>item.id===q.cursor);fail(at>=0,'分页位置已变化，请重新加载',400);start=at+1;}
  const items=list.slice(start,start+q.limit).map(item=>({...metadata(item),usage:inboxMaterialUsage(repository,item)}));reply.header('Cache-Control','private, no-store');return receipt({items,nextCursor:start+items.length<list.length?items.at(-1)?.id:null});
 });
 app.get<{Params:{id:string}}>(prefix+'/:id/usage',{onRequest:authenticate},async(req,reply)=>{reply.header('Cache-Control','private, no-store');return receipt(inboxMaterialUsage(repository,access.read(req.params.id)));});
 app.post('/api/v1/inbox-materials/cleanup/preview',{onRequest:authenticate},async(req,reply)=>{
  const input=z.object({scope:scope.optional(),olderThan:date,limit:z.number().int().min(1).max(100).default(100)}).strict().parse(req.body),all=repository.list('inbox-assets',actorId,input.scope).filter(item=>item.kind==='upload'&&materialLifecycle(item)!=='deleted'&&Date.parse(item.createdAt)<=Date.parse(input.olderThan));
  const candidates=all.map((item):BusinessRecord&{lifecycle:string;usage:MaterialUsage}=>({...metadata(item),lifecycle:materialLifecycle(item),usage:inboxMaterialUsage(repository,item)})).filter(item=>!item.usage.referenceCount&&!item.usage.processing&&(!item.retainUntil||Date.parse(item.retainUntil)<=Date.now()));
  reply.header('Cache-Control','private, no-store');return receipt({items:candidates.slice(0,input.limit).map(item=>({...item,suggestedAction:materialLifecycle(item)==='trashed'?'delete':'trash'})),hasMore:candidates.length>input.limit,olderThan:input.olderThan,asOf:new Date().toISOString(),notice:'仅预览未引用且保留期限已到的候选。不会自动回收或删除；永久删除仍须逐件明确确认并核对当前版本。'});
 });
 app.post<{Params:{id:string}}>(prefix+'/:id/lifecycle',{onRequest:authenticate},async req=>{
  const input=lifecycleInput.parse(req.body),original=access.read(req.params.id);check(req);fail(input.action==='retention'||input.retainUntil===undefined,'此操作不接受保留期限',400);
  const command=input.action==='delete'?'begin-delete':'lifecycle',payload={id:original.id,commandId:input.commandId,action:input.action,...(input.retainUntil===undefined?{}:{retainUntil:input.retainUntil})},envelope={commandId:input.commandId,expectedVersion:input.expectedVersion,scope:original.scope,payload};
  const previous=repository.replay('inbox-assets',command,envelope,actorId);
  if(input.action!=='delete')return previous??repository.execute(handler,command,envelope,actorId,()=>undefined);
  if(previous&&previous.data.deletion?.status!=='running')return previous;
  if(deletions.has(input.commandId))return deletions.get(input.commandId)!;
  if(!previous)repository.execute(handler,command,envelope,actorId,()=>undefined);
  const work=async()=>{let error:ReturnType<typeof publicError>|undefined;try{check(req);const currentRecord=access.read(original.id);const usage=inboxMaterialUsage(repository,currentRecord);fail(!usage.referenceCount,'删除期间新增了业务引用');try{await access.bytes(currentRecord)}catch(e){if(!(e instanceof BusinessError&&e.code==='NOT_CONFIGURED'))throw e;}check(req);await access.remove(currentRecord,()=>{check(req);fail(!inboxMaterialUsage(repository,access.read(original.id)).referenceCount,'删除期间新增了业务或历史引用');});}catch(e){error=publicError(e);}
   const result=execute('finish-delete',access.read(original.id),{commandId:input.commandId,...(error?{error}:{})});repository.completeReceipt(actorId,input.commandId,result);check(req);return result;};
  const promise=work().finally(()=>deletions.delete(input.commandId));deletions.set(input.commandId,promise);return promise;
 });
 app.post<{Params:{id:string}}>(prefix+'/:id/reuse-book',{onRequest:authenticate},async req=>{
  const input=copyInput.parse(req.body),original=access.read(req.params.id);check(req);const payload={id:original.id,commandId:input.commandId,uploadId:input.uploadId.toLowerCase()},envelope={commandId:input.commandId,expectedVersion:input.expectedVersion,scope:original.scope,payload};
  const previous=repository.replay('inbox-assets','begin-copy',envelope,actorId);if(previous&&previous.data.lastReuse?.status!=='running')return previous;if(copies.has(input.commandId))return copies.get(input.commandId)!;
  const started=previous??repository.execute(handler,'begin-copy',envelope,actorId,()=>undefined);
  const work=async()=>{let error:ReturnType<typeof publicError>|undefined;try{const bytes=await access.bytes(started.data);check(req);fail(detectScanMime(bytes)===original.mime,'原件类型与实际扫描内容不一致',400);await access.writeBook(payload.uploadId,bytes);check(req);
    const ticket=repository.read('books',payload.uploadId,actorId)!,source=repository.read('sources',ticket.source,actorId);fail(ticket.scope===original.scope&&ticket.sourceAssetId===original.id&&source?.scope===original.scope&&source.active&&source.authorized&&source.mode!=='live','复用期间知识来源或票据已改变',403);
    const digest=createHash('sha256').update(bytes).digest('hex');if(ticket.status==='stored')fail(ticket.sha256===digest,'目标票据已有不同原件');else repository.execute(knowledgeBookHandler,'complete-upload',{commandId:`material-copy-file:${input.commandId}`,expectedVersion:ticket.revision,scope:original.scope,payload:{uploadId:ticket.id,sha256:digest,size:bytes.length,mime:original.mime}},actorId,()=>undefined);
   }catch(e){error=publicError(e);}
   const result=execute('finish-copy',access.read(original.id),{commandId:input.commandId,...(error?{error}:{})});repository.completeReceipt(actorId,input.commandId,result);check(req);return result;};
  const promise=work().finally(()=>copies.delete(input.commandId));copies.set(input.commandId,promise);return promise;
 });
 app.addHook('preClose',async()=>{closing=true;await Promise.allSettled([...deletions.values(),...copies.values()]);});
}
