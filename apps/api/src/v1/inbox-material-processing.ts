import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError,type BusinessRecord,type CommandContext,type Domain,type DomainHandler} from './types.js';
import type {CommandReceipt,V1Repository} from './repository.js';
import {fetchKnowledgeBytes,permittedUrl,type KnowledgeNetworkPolicy} from '../runtime/knowledge-connectors.js';
import type {RuntimePrincipal} from '../runtime/identity.js';

export interface MaterialTextResult {
 text:string;engine:string;language?:string;textTruncated?:boolean;warnings?:string[];title?:string;
 segments?:Array<{text:string;location?:string;sha256?:string;page?:number|null;paragraph?:number|null;start?:number;end?:number}>;
}
export interface InboxMaterialRuntime {
 principal:(request:any)=>RuntimePrincipal;current:(principal:RuntimePrincipal)=>boolean;
 document:(bytes:Buffer,mime:string,sha256:string,signal:AbortSignal)=>Promise<MaterialTextResult>;
 transcribe:(principal:RuntimePrincipal,bytes:Buffer,mime:string,input:{cloudConsent:boolean;language?:Language;signal:AbortSignal})=>Promise<MaterialTextResult>;
 policy:()=>KnowledgeNetworkPolicy;stopped?:()=>boolean;
}
export interface InboxMaterialAccess {
 read:(id:string)=>BusinessRecord;bytes:(record:BusinessRecord)=>Promise<Buffer>;write:(id:string,bytes:Buffer)=>Promise<void>;
}
const languages=z.enum(['zh','en','ja','fr','de','es','auto']);type Language=z.infer<typeof languages>;
const processInput=z.object({commandId:z.uuid(),expectedVersion:z.number().int().min(1),operation:z.enum(['extract','transcribe']),cloudConsent:z.boolean().default(false),language:languages.optional()}).strict();
const reviewInput=z.object({commandId:z.uuid(),expectedVersion:z.number().int().min(1),text:z.string().max(120000).refine(text=>!!text.trim(),'请填写核对后的文字')}).strict();
const linkInput=z.object({id:z.uuid(),url:z.string().min(1).max(4000),scope:z.enum(['personal','private','family','company'])}).strict();
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
function requireValue(ok:unknown,message:string,status=422):asserts ok {if(!ok)throw new BusinessError(status===409?'CONFLICT':'VALIDATION',message,status);}
const bounded=(text:string)=>{let result=text.slice(0,120000);if(result.length<text.length&&/[\uD800-\uDBFF]$/.test(result))result=result.slice(0,-1);return result;};
function failure(error:unknown){
 const e=error as {code?:string;message?:string};
 const code=typeof e?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(e.code)?e.code:'PROCESSING_FAILED';
 // Native errors can contain paths, engine arguments or provider bodies. Only typed errors have public messages.
 const message=error instanceof BusinessError||error?.constructor?.name==='RuntimeAccessError'?String(e.message).slice(0,500):'文字处理未完成，请检查引擎配置或原件后重试；原件仍保留。';
 return {code,message};
}
function candidate(result:MaterialTextResult,original:BusinessRecord,operation:string){
 requireValue(result&&typeof result.text==='string'&&!!result.text.trim()&&result.text.length<=6000000,'未提取到有效文字，请检查原件或补充人工说明');
 const text=bounded(result.text),segments=result.segments??[];
 requireValue(Array.isArray(segments)&&segments.length<=2000,'处理结果段落超过限制');
 const normalized=segments.map(segment=>{
  requireValue(typeof segment.text==='string'&&segment.text.length<=120000,'处理结果段落无效');
  if(segment.start!==undefined||segment.end!==undefined)requireValue(typeof segment.start==='number'&&typeof segment.end==='number'&&Number.isFinite(segment.start)&&Number.isFinite(segment.end)&&segment.start>=0&&segment.end>=segment.start&&segment.end<=600,'识别时间定位无效');
  const location=typeof segment.location==='string'?segment.location.slice(0,4500):`inbox-original://${original.sha256}${segment.start===undefined?'':'/seconds/'+segment.start+'-'+segment.end}`;
  return {text:segment.text,location,sha256:sha(segment.text),...(Number.isInteger(segment.page)?{page:segment.page}:{}),...(Number.isInteger(segment.paragraph)?{paragraph:segment.paragraph}:{}),...(segment.start===undefined?{}:{start:segment.start,end:segment.end})};
 });
 return {operation,sourceSha256:original.sha256,text,textSha256:sha(text),engine:String(result.engine||'configured-engine').slice(0,200),...(result.language?{language:result.language}:{}),segments:normalized,warnings:(result.warnings??[]).filter(item=>typeof item==='string').slice(0,20).map(item=>item.slice(0,1000)),textTruncated:text.length<result.text.length||result.textTruncated===true,reviewRequired:true,processedAt:new Date().toISOString()};
}
function refreshMaterialIndexes(ctx:CommandContext,assetId:string){
 const refresh=(source:Record<string,any>):Record<string,any>|null=>{
  const refs=source.attachments??[];if(!refs.some((ref:any)=>ref.id===assetId))return null;
  const originals:Array<BusinessRecord|undefined>=refs.map((ref:any)=>ctx.get('inbox-assets',ref.id));
  const attachments=refs.map((ref:any,index:number)=>originals[index]?.status==='stored'?{...ref,textStatus:originals[index]!.textStatus}:ref);
  const all=originals.filter(item=>item?.status==='stored').map(item=>item!.extractedText??'').filter(Boolean).join('\n\n'),text=bounded(all);
  return {attachments,materialText:text,materialTextTruncated:text.length<all.length||originals.some(item=>item?.textTruncated===true)};
 };
 // These are derived search fields, not original notes, decisions, published text or skill versions.
 const domains:Domain[]=['inbox','research','experiences','books'];
 for(const domain of domains)for(const record of ctx.list(domain)){
  if(domain==='experiences'&&record.status!=='inbox'||domain==='books'&&(record.kind!=='material'||record.status!=='pending')||domain==='research'&&['accepted','rejected','converted'].includes(record.status))continue;
  const originsKey=domain==='inbox'?'origins':'inboxOrigins',previous=record[originsKey]??[],origins=previous.map((origin:any)=>{const changed=refresh(origin);return changed?{...origin,...changed}:origin;}),patch=refresh(record);
  if(!patch&&origins.every((origin:any,index:number)=>origin===previous[index]))continue;
  ctx.update(domain,record.id,{...patch,[originsKey]:origins,updatedAt:ctx.now});ctx.emit(domain,record.id,'material-text-updated',{assetId});
 }
}
const handler:DomainHandler={domain:'inbox-assets',commands:[],execute(command,p,ctx){
 if(command==='fetch-link'){
  requireValue(ctx.expectedVersion===0,'新网页原件需要版本0',409);
  return ctx.create('inbox-assets',{kind:'upload',filename:'网页原件.html',mime:'text/html',size:0,sha256:null,mediaKind:'text',textStatus:'unsupported',status:'fetching',sourceUrl:p.url,extractedText:'',textTruncated:false,processing:{commandId:ctx.actorId+':link:'+p.id,expectedVersion:0,operation:'extract',cloudConsent:false,status:'running',sourceSha256:null,startedAt:ctx.now,retryable:false},createdAt:ctx.now,updatedAt:ctx.now},p.id);
 }
 const original=ctx.require('inbox-assets',p.id,true);ctx.check(original);
 if(command==='store-link-original'){
  requireValue(original.status==='fetching'&&original.processing?.status==='running','网页原件状态已改变',409);
  const record=ctx.update('inbox-assets',original.id,{status:'stored',mime:p.mime,filename:p.mime==='text/plain'?'网页原件.txt':'网页原件.html',size:p.size,sha256:p.sha256,processing:{...original.processing,sourceSha256:p.sha256},updatedAt:ctx.now});
  ctx.emit('inbox-assets',record.id,'web-original-stored',{sha256:p.sha256,size:p.size});return record;
 }
 if(command==='begin-process'){
  requireValue(original.kind==='upload'&&original.status==='stored','请先完成原件保存');
  requireValue(original.processing?.status!=='running','这份原件正在处理，请先确认上次处理',409);
  requireValue(p.operation==='transcribe'?original.mediaKind==='audio':['document','image','text'].includes(original.mediaKind),'原件类型与处理方式不一致',400);
  const processing={commandId:p.commandId,expectedVersion:ctx.expectedVersion,operation:p.operation,language:p.language,cloudConsent:p.cloudConsent,status:'running',sourceSha256:original.sha256,startedAt:ctx.now,retryable:false};
  const record=ctx.update('inbox-assets',original.id,{processing,updatedAt:ctx.now});ctx.emit('inbox-assets',record.id,'processing-started',{operation:p.operation});return record;
 }
 if(command==='finish-process'){
  requireValue(original.processing?.status==='running'&&original.processing.commandId===p.commandId,'文字处理已结束或已被替代',409);
  const processing={...original.processing,status:p.error?(p.interrupted?'interrupted':'failed'):'complete',completedAt:ctx.now,retryable:!!p.error,...(p.error?{error:p.error}:{})};
  const patch=p.error?{}:{extraction:p.extraction,extractedText:p.extraction.text,textTruncated:p.extraction.textTruncated,textStatus:'extracted',textReview:null,extractionHistory:[...(original.extractionHistory??[]),...(original.extraction?[{extraction:original.extraction,textReview:original.textReview??null}]:[])].slice(-5),...(p.link?{status:'stored',mime:p.mime,filename:p.mime==='text/plain'?'网页原件.txt':'网页原件.html',size:p.size,sha256:p.sha256,title:p.title??original.filename}:{} )};
  const record=ctx.update('inbox-assets',original.id,{...patch,...(p.error&&original.status==='fetching'?{status:'failed'}:{}),processing,updatedAt:ctx.now});
  if(!p.error)refreshMaterialIndexes(ctx,record.id);
  ctx.emit('inbox-assets',record.id,p.error?'processing-failed':'text-extracted',{operation:processing.operation,errorCode:p.error?.code});return record;
 }
 if(command==='review-text'){
  requireValue(original.status==='stored'&&original.extraction?.sourceSha256===original.sha256,'请先完成当前原件的文字提取');
  requireValue(original.processing?.status!=='running','正在处理，请完成后再核对文字',409);
  const review={text:p.text,sourceTextSha256:original.extraction.textSha256,reviewedBy:ctx.actorId,reviewedAt:ctx.now};
  const record=ctx.update('inbox-assets',original.id,{textReview:review,reviewHistory:[...(original.reviewHistory??[]),...(original.textReview?[original.textReview]:[])].slice(-10),extractedText:p.text,textTruncated:false,updatedAt:ctx.now});refreshMaterialIndexes(ctx,record.id);ctx.emit('inbox-assets',record.id,'text-reviewed');return record;
 }
 throw new BusinessError('VALIDATION','原件文字操作无效',400);
}};

export function registerInboxMaterialProcessing(app:FastifyInstance,repository:V1Repository,access:InboxMaterialAccess,authenticate:(req:any)=>Promise<void>,runtime?:InboxMaterialRuntime,actorId='server-admin'){
 const prefix='/api/v1/inbox-materials/uploads',active=new Map<string,Promise<CommandReceipt>>(),controllers=new Set<AbortController>();let closed=false;
 const execute=(command:string,record:BusinessRecord,payload:Record<string,any>,commandId=randomUUID())=>repository.execute(handler,command,{commandId,expectedVersion:record.revision,scope:record.scope,payload:{id:record.id,...payload}},actorId,()=>undefined);
 const principal=(req:any)=>{requireValue(runtime,'原件文字处理尚未配置',503);const p=runtime!.principal(req);requireValue(p.actorId===actorId&&p.administrator&&runtime!.current(p),'请重新登录后处理原件',401);return p;};
 const check=(p:RuntimePrincipal)=>requireValue(!closed&&runtime?.current(p),'会话已失效，原件处理已停止',401);
 const work=async(key:string,p:RuntimePrincipal,original:BusinessRecord,commandId:string,action:(signal:AbortSignal)=>Promise<Record<string,any>>)=>{
  const abort=new AbortController();controllers.add(abort);const monitor=setInterval(()=>{if(!runtime?.current(p)||closed)abort.abort()},500);monitor.unref();
  try{
   let payload:Record<string,any>;
   try{payload=await action(abort.signal);abort.signal.throwIfAborted();check(p);}catch(error){payload={error:failure(error)};}
   const current=access.read(original.id),receipt=execute('finish-process',current,{...payload,commandId});repository.completeReceipt(actorId,commandId,receipt);check(p);return receipt;
  }finally{clearInterval(monitor);controllers.delete(abort);active.delete(key);}
 };
 // A restart never silently retries an engine or webpage request that may already have run.
 for(const record of repository.list('inbox-assets',actorId).filter(item=>item.processing?.status==='running')){
  const commandId=record.processing.commandId,receipt=execute('finish-process',record,{commandId,interrupted:true,error:{code:'PROCESSING_INTERRUPTED',message:'平台重启使上次文字处理中断；请核对后手动重新处理。'}});
  repository.completeReceipt(actorId,commandId,receipt);
 }
 app.post<{Params:{id:string}}>(prefix+'/:id/process',{onRequest:authenticate},async req=>{
  const input=processInput.parse(req.body),p=principal(req),original=access.read(req.params.id),key=actorId+':'+input.commandId;
  const payload={id:original.id,commandId:input.commandId,operation:input.operation,cloudConsent:input.cloudConsent,...(input.language?{language:input.language}:{})},envelope={commandId:input.commandId,expectedVersion:input.expectedVersion,scope:original.scope,payload};
  const previous=repository.replay('inbox-assets','begin-process',envelope,actorId);if(previous)return active.get(key)??previous;
  requireValue(!runtime?.stopped?.(),'平台已暂停处理任务',409);requireValue(active.size<2,'原件文字处理正在忙，请稍后重试',429);
  const bytes=await access.bytes(original);check(p);
  // Both original-byte reads may complete concurrently. Recheck the durable intent after that await.
  const admitted=repository.replay('inbox-assets','begin-process',envelope,actorId);if(admitted)return active.get(key)??admitted;
  requireValue(active.size<2,'原件文字处理正在忙，请稍后重试',429);
  repository.execute(handler,'begin-process',envelope,actorId,()=>undefined);
  const promise=work(key,p,original,input.commandId,async signal=>{
   const result=input.operation==='transcribe'?await runtime!.transcribe(p,bytes,original.mime,{cloudConsent:input.cloudConsent,language:input.language,signal}):original.mediaKind==='text'&&original.mime!=='text/html'?{text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),engine:'utf8-original',segments:[]}:await runtime!.document(bytes,original.mime,original.sha256,signal);
   return {extraction:candidate(result,original,input.operation)};
  });active.set(key,promise);return promise;
 });
 app.post<{Params:{id:string}}>(prefix+'/:id/text-review',{onRequest:authenticate},async req=>{
  const input=reviewInput.parse(req.body),p=principal(req),original=access.read(req.params.id);check(p);
  return repository.execute(handler,'review-text',{commandId:input.commandId,expectedVersion:input.expectedVersion,scope:original.scope,payload:{id:original.id,text:input.text}},actorId,()=>undefined);
 });
 app.post('/api/v1/inbox-materials/links/extract',{onRequest:authenticate},async req=>{
  const parsed=linkInput.parse(req.body),input={...parsed,id:parsed.id.toLowerCase()},p=principal(req);let url:URL;try{url=new URL(input.url)}catch{throw new BusinessError('VALIDATION','请输入完整HTTP(S)来源链接',400)}requireValue(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password,'请输入不含登录凭据的HTTP(S)来源链接',400);
  const originalUrl=url.href;url.hash='';const commandId=actorId+':link:'+input.id,key=commandId,payload={id:input.id,url:originalUrl},envelope={commandId,expectedVersion:0,scope:input.scope,payload};
  const previous=repository.replay('inbox-assets','fetch-link',envelope,actorId);if(previous)return active.get(key)??previous;
  const policy=()=>{const configured=runtime!.policy();return {...configured,maxBytes:Math.min(configured.maxBytes,4*1024*1024),timeoutMs:Math.min(configured.timeoutMs,30000),maxDocuments:1};};
  permittedUrl(url.href,policy());requireValue(!runtime?.stopped?.(),'平台已暂停处理任务',409);requireValue(active.size<2,'原件文字处理正在忙，请稍后重试',429);
  const start=repository.execute(handler,'fetch-link',envelope,actorId,()=>undefined),original=start.data;
  const promise=work(key,p,original,commandId,async signal=>{
   const response=await fetchKnowledgeBytes(url.href,policy(),signal,{headers:{accept:'text/html, text/plain'}});permittedUrl(url.href,policy());check(p);
   const mime=response.type.split(';')[0].trim().toLowerCase();requireValue(['text/html','text/plain'].includes(mime),'该链接不是HTML网页或纯文本，请下载原文后作为文件添加');
   requireValue(response.bytes.length>0,'网页返回空原件，请检查来源');
   const sourceSha256=sha(response.bytes);await access.write(original.id,response.bytes);check(p);
   execute('store-link-original',access.read(original.id),{sha256:sourceSha256,size:response.bytes.length,mime});
   const result=mime==='text/html'?await runtime!.document(response.bytes,'text/html',sourceSha256,signal):{text:new TextDecoder('utf-8',{fatal:true}).decode(response.bytes),engine:'utf8-web-text',segments:[]};
   const extraction=candidate(result,{...original,sha256:sourceSha256},'extract');
   return {link:true,sha256:sourceSha256,size:response.bytes.length,mime,title:result.title,extraction};
  });active.set(key,promise);return promise;
 });
 app.addHook('preClose',async()=>{closed=true;for(const control of controllers)control.abort();await Promise.allSettled([...active.values()]);});
}
