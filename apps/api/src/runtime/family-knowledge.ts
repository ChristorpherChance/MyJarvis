import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {V1Repository} from '../v1/repository.js';
import {IdentityRuntime,RuntimeAccessError,runtimeHandler,type RuntimePrincipal} from './identity.js';
import {searchAuthorizedKnowledge} from './personal-retrieval.js';
import {resolvePublishedKnowledgeDocument} from './knowledge-documents.js';

export const familyKnowledgeQueryInput=z.object({query:z.string().trim().min(1).max(1000),limit:z.number().int().min(1).max(50).default(20)}).strict();
export const familyKnowledgeReferenceInput=z.object({queryId:z.uuid(),refId:z.uuid()}).strict();
const matchInput=z.object({id:z.string().min(1),kind:z.enum(['book','external-document','knowledge-document']),source:z.string().min(1),segment:z.number().int().nonnegative().optional(),sourceRevision:z.number().int().optional(),revision:z.number().int().optional(),page:z.number().int().positive().optional(),version:z.union([z.string(),z.number()]).optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/),offset:z.number().int().nonnegative(),quote:z.string().min(1).max(2000),title:z.string()});
const TTL=5*60_000,SESSION_LIMIT=10,GLOBAL_LIMIT=200,OWNER='server-admin';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
type Version=number|string;
type Reference={refId:string;kind:'book'|'external-document'|'knowledge-document';segment?:number;sourceId:string;sourceRevision:number;id:string;bookRevision?:number;page?:number;version?:Version;sha256:string;offset:number;quote:string;title:string;sourceName:string};
type CachedQuery={binding:string;expiresAt:number;references:Map<string,Reference>};
function requireValue(value:unknown,code:string,message:string,status:number):asserts value {if(!value)throw new RuntimeAccessError(code,message,status);}
function version(value:unknown):Version|undefined {return typeof value==='string'||typeof value==='number'?value:undefined;}
function binding(p:RuntimePrincipal){return JSON.stringify([p.actorId,p.profileId,p.credentialId,p.authorizationHash]);}
/** Directory connectors can derive a title from a local path. Show its final name only to members. */
function displayName(value:unknown,fallback:string):string {
 const label=typeof value==='string'?value.trim():'';if(!label)return fallback;
 let path=label;
 if(/^file:/i.test(label)){try{path=decodeURIComponent(new URL(label).pathname);}catch{return fallback;}}
 else if(!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(label))return label;
 if(/[\\/]$/.test(path))return fallback;
 const name=path.split(/[\\/]/).at(-1)??'';
 return name&&name!=='.'&&name!=='..'&&!/^[A-Za-z]:$/.test(name)?name:fallback;
}
function boundaries(text:string,start:number,end:number){
 if(start>0&&/[\uDC00-\uDFFF]/.test(text[start]))start--;
 if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end++;
 return {start,end};
}
const quoteKind=(r:Reference)=>r.kind==='book'?'published-original' as const:r.kind==='knowledge-document'?'reviewed-document' as const:'external-source-unreviewed' as const;

/** Member-only, deterministic reads of already saved family knowledge. No network or model work. */
export function registerFamilyKnowledgeRoutes(app:FastifyInstance,repository:V1Repository,identity:IdentityRuntime,options:{now?:()=>number}={}):void {
 const queries=new Map<string,CachedQuery>();
 const now=options.now??Date.now;
 app.addHook('onClose',async()=>{queries.clear();});
 const principal=(req:FastifyRequest)=>{
  const p=identity.principal(req,false);
  requireValue(!p.administrator&&p.credentialId&&p.authorizationHash&&identity.isPrincipalCurrent(p),'SESSION_EXPIRED','成员会话已失效，请重新验证',401);
  return p;
 };
 const current=(p:RuntimePrincipal)=>requireValue(identity.isPrincipalCurrent(p),'SESSION_EXPIRED','成员会话已失效，请重新验证',401);
 const source=(id:string)=>{
  const record=repository.read('sources',id,OWNER);
  requireValue(record?.kind==='source'&&record.ownerId===OWNER&&record.scope==='family'&&record.active&&record.authorized,'SOURCE_FORBIDDEN','这个来源已停用、撤权或离开家庭共享范围，请重新查询',403);
  return record;
 };
 const original=(r:Reference)=>{
  const s=source(r.sourceId);
  requireValue(s.revision===r.sourceRevision,'REFERENCE_CHANGED','来源已更新，请重新查询后打开当前出处',409);
  let text:string;
  if(r.kind==='knowledge-document'){
   const resolved=resolvePublishedKnowledgeDocument(repository,OWNER,r.id,Number(r.version),r.segment!,r.sha256,'family');
   requireValue(resolved&&resolved.document.sourceId===s.id&&resolved.document.revision===r.bookRevision,'REFERENCE_CHANGED','文档审核或原件绑定已变化，请重新查询',409);text=resolved.segment.text;
  }else if(r.kind==='book'){
   const book=repository.read('books',r.id,OWNER);
   requireValue(book?.kind==='book'&&book.ownerId===OWNER&&book.scope==='family'&&book.source===s.id&&book.status==='published','SOURCE_FORBIDDEN','原文已撤下或离开家庭共享范围，请重新查询',403);
   requireValue(book.version===r.version&&book.revision===r.bookRevision,'REFERENCE_CHANGED','书页版本已更新，请重新查询后打开当前出处',409);
   const pages=(book.pageTexts??[]).filter((page:any)=>page.page===r.page);
   requireValue(pages.length===1&&typeof pages[0].text==='string','REFERENCE_CHANGED','命中页已变化，请重新查询',409);
   text=pages[0].text;
  }else{
   const documents=(s.documents??[]).filter((document:any)=>document.id===r.id);
   requireValue(documents.length===1&&typeof documents[0].text==='string','REFERENCE_CHANGED','这份资料已更新，请重新查询',409);
   text=documents[0].text;
  }
  requireValue(hash(text)===r.sha256&&text.slice(r.offset,r.offset+r.quote.length)===r.quote,'REFERENCE_CHANGED','正文或摘录位置已变化，请重新查询',409);
  return text;
 };
 const headers=(reply:any)=>reply.header('Cache-Control','private, no-store').header('Pragma','no-cache').header('X-Content-Type-Options','nosniff');
 app.post('/api/runtime/family/knowledge/query',runtimeHandler((req,reply)=>{
  headers(reply);const p=principal(req),input=familyKnowledgeQueryInput.parse(req.body),key=binding(p),time=now();
  for(const [id,query] of queries)if(query.expiresAt<=time)queries.delete(id);
  // Filter supported kinds before counting/limiting. Stories remain available only through their existing tools.
  const sourceRevisions=new Map(repository.list('sources',OWNER,'family').filter(s=>s.kind==='source'&&s.active&&s.authorized).map(s=>[s.id,s.revision]));
  // The shared retrieval helper's dynamic metadata is validated here before it becomes a reference.
  const matches=(searchAuthorizedKnowledge(repository,OWNER,input.query,true) as Array<Record<string,unknown>>).filter(r=>r.kind==='book'||r.kind==='external-document'||r.kind==='knowledge-document');
  const references:Reference[]=matches.slice(0,input.limit).map(raw=>{
   const result=matchInput.parse(raw);
   const s=source(result.source),sourceRevision=sourceRevisions.get(s.id);
   requireValue(sourceRevision===s.revision&&(result.kind==='book'||result.sourceRevision===sourceRevision),'REFERENCE_CHANGED','来源在检索期间已更新，请重新查询',409);
   const base={refId:randomUUID(),sourceId:s.id,sourceRevision,id:String(result.id),sha256:result.sha256,offset:result.offset,quote:result.quote,title:displayName(result.title,result.kind==='book'?'家庭共享书页':'已保存资料'),sourceName:displayName(s.name,'家庭知识来源'),version:version(result.version)};
   requireValue(typeof base.sha256==='string'&&/^[a-f0-9]{64}$/.test(base.sha256)&&Number.isSafeInteger(base.offset)&&base.offset>=0&&typeof base.quote==='string'&&base.quote.length>0&&base.quote.length<=2000,'REFERENCE_CHANGED','检索资料已变化，请重新查询',409);
   const r:Reference=result.kind==='knowledge-document'?{...base,kind:'knowledge-document',bookRevision:result.revision,segment:result.segment}:result.kind==='book'?{...base,kind:'book',bookRevision:result.revision,page:result.page}:{...base,kind:'external-document'};
   const text=original(r),range=boundaries(text,r.offset,r.offset+r.quote.length);r.offset=range.start;r.quote=text.slice(range.start,range.end);
   return r;
  });
  current(p);
  while([...queries.values()].filter(query=>query.binding===key).length>=SESSION_LIMIT){const oldest=[...queries].find(([,query])=>query.binding===key);if(oldest)queries.delete(oldest[0]);}
  while(queries.size>=GLOBAL_LIMIT)queries.delete(queries.keys().next().value!);
  const queryId=randomUUID(),expiresAt=time+TTL;queries.set(queryId,{binding:key,expiresAt,references:new Map(references.map(r=>[r.refId,r]))});
  return {actorId:p.actorId,profileId:p.profileId,queryId,expiresAt:new Date(expiresAt).toISOString(),query:input.query,total:matches.length,records:references.map(r=>({refId:r.refId,kind:r.kind,title:r.title,quote:r.quote,sourceName:r.sourceName,...(r.page!==undefined?{page:r.page}:{}),...(r.segment!==undefined?{segment:r.segment,location:`document://${encodeURIComponent(r.id)}/${r.version}/segment/${r.segment}`}:{ }),...(r.version!==undefined?{version:r.version}:{}),quoteKind:quoteKind(r),...(r.kind==='external-document'?{notice:'来自当前保存的来源正文；正文指纹核对不等于人工审核。'}:{})})),retrieval:'literal-fragments',notice:'按当前家庭共享授权查询已保存正文，不调用模型或实时抓取。引用五分钟内有效，请及时打开出处。'};
 }));
 app.post('/api/runtime/family/knowledge/references/resolve',runtimeHandler((req,reply)=>{
  headers(reply);const p=principal(req),input=familyKnowledgeReferenceInput.parse(req.body),query=queries.get(input.queryId);
  requireValue(query&&query.binding===binding(p),'REFERENCE_NOT_FOUND','这次引用不属于当前成员会话，请重新查询',404);
  if(query.expiresAt<=now()){queries.delete(input.queryId);throw new RuntimeAccessError('REFERENCE_EXPIRED','这次引用已过期，请重新查询',410);}
  const r=query.references.get(input.refId);requireValue(r,'REFERENCE_NOT_FOUND','引用不属于这次查询，请重新查询',404);
  const text=original(r),range=boundaries(text,Math.max(0,r.offset-800),Math.min(text.length,r.offset+r.quote.length+800));
  current(p);
  return {actorId:p.actorId,profileId:p.profileId,queryId:input.queryId,refId:r.refId,expiresAt:new Date(query.expiresAt).toISOString(),kind:r.kind==='book'?'book-page':r.kind==='knowledge-document'?'reviewed-document':'stored-document',title:r.title,sourceName:r.sourceName,sourceRevision:r.sourceRevision,...(r.version!==undefined?{version:r.version}:{}),...(r.page!==undefined?{page:r.page}:{}),...(r.kind==='knowledge-document'?{segment:r.segment,location:`document://${encodeURIComponent(r.id)}/${r.version}/segment/${r.segment}`,originalLocation:repository.read('books',r.id,OWNER)?.segments?.find((part:any)=>part.index===r.segment)?.location??null}:{}),text:text.slice(range.start,range.end),quote:r.quote,quoteStart:r.offset-range.start,contextStart:range.start,hasEarlierText:range.start>0,hasLaterText:range.end<text.length,sha256:r.sha256,verifiedSourceText:true,quoteKind:quoteKind(r),resolvedAt:new Date().toISOString(),notice:r.kind==='book'?'已按当前家庭共享授权、已发布书页版本和完整正文指纹核对。高亮范围为检索摘录，不一定是查询词的位置。':r.kind==='knowledge-document'?'已核对当前家庭授权、人工审核文档版本、原件绑定和段落指纹；不是扫描书籍逐页精校。':'已按当前家庭共享授权和保存正文的完整指纹核对，未重新抓取来源，亦不等于人工审核。高亮范围为检索摘录，不一定是查询词的位置。'};
 }));
}
