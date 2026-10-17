import type { DemoData } from './types';
import { v1Command, V1Error, type V1CollectionDomain, type V1Record, type V1Scope } from '../v1-client';
import type { KnowledgeData } from '../features/knowledge/domain';
import {registerStoredMaterialBook} from '../features/operations/inbox-book-registration';

type Values=Record<string,any>;
type Records=Partial<Record<V1CollectionDomain,V1Record[]>>;
type Operation={domain:V1CollectionDomain;command:string;body:Values;scope:V1Scope;version:number};
const pending=new Map<string,{id:string;promise?:Promise<unknown>}>();
const uploads=new Map<string,{ticket?:V1Record;book?:unknown;promise?:Promise<unknown>}>();
let uploadIntents=new WeakMap<File,string>();
export function clearLiveKnowledgeSession():void {pending.clear();uploads.clear();uploadIntents=new WeakMap();}
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const fields=(p:Values,keys:string[]):Values=>Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
const denied=(message:string):never=>{throw new V1Error(message,503,'NOT_CONFIGURED');};
async function submit(op:Operation,intent?:string):Promise<unknown>{const key=intent?stable({op,intent}):stable(op);let entry=pending.get(key);if(entry?.promise)return entry.promise;if(!entry){entry={id:crypto.randomUUID()};pending.set(key,entry);}const id=entry.id;const promise=v1Command(op.domain,op.command,op.body,op.scope,op.version,id).then(result=>{pending.delete(key);return result;}).catch(error=>{const current=pending.get(key);if(current?.id===id)current.promise=undefined;throw error;});entry.promise=promise;return promise;}
function operation(action:string,p:Values,records:Records):Operation {
 let domain:V1CollectionDomain=action.startsWith('knowledge.source.')||action==='knowledge.query'?'sources':action.startsWith('knowledge.book.')||action.startsWith('knowledge.material.')?'books':action.startsWith('knowledge.story.')||action==='knowledge.quiz'?'stories':'learning';
 const id=String(p.id??p.bookId??p.storyId??''),record=id?records[domain]?.find(r=>r.id===id):undefined;if(id&&!record)throw new V1Error('记录已不可访问，请刷新后重试。',404,'NOT_FOUND');
 let command=action.split('.').at(-1)!,body:Values={},scope=(record?.scope??p.scope??'family') as V1Scope;
 if(!['family','personal','private','company'].includes(scope))throw new V1Error('资料访问范围无效。',400,'VALIDATION');
 const version=p.expectedVersion??record?.revision??0;
 if(action==='knowledge.query'){command='query';body={query:p.query,mode:p.mode??'all'};}
 else if(action==='knowledge.material.convert'){if(p.target!=='source')denied('请补交真实原件后登记书目，原始候选会保留。');command='material-source';body={materialId:id};}
 else if(action==='family.learning.complete'){domain='learning';command='practice';scope='family';body={profile:p.profile??'me',type:p.type,title:p.title,minutes:p.minutes,rounds:Array.isArray(p.rounds)?p.rounds.map((r:Values)=>({question:r.question,answer:r.answer})):[]};}
 else if(action==='knowledge.source.save'){command='save';body={...fields(p,['name','type','mode','endpoint','topics','rights','authorized']),...(record?{sourceId:id}:{})};}
 else if(action==='knowledge.source.toggle')body={sourceId:id,active:!record?.active};
 else if(action==='knowledge.source.sync')body={sourceId:id};
 else if(action==='knowledge.source.authorize')body={sourceId:id,...fields(p,['authorized','reason'])};
 else if(action==='knowledge.source.failure')denied('真实模式不能人为伪造连接器故障。');
 else if(action.startsWith('knowledge.book.')){
  const aliases:Values={reviewPage:'review-page',reviewAll:'review-all'};command=aliases[command]??command;body={bookId:id};
  if(command==='page')Object.assign(body,fields(p,['page','text','normalized','evidence','pagesVerified','nonTextPage','nonTextKind','nonTextConfirmed','pageDescription','textHash','scanHash']));
  else if(command==='doubt')Object.assign(body,fields(p,['page','type','critical','ocr','alternate','focus','reason']));
  else if(command==='verdict')Object.assign(body,fields(p,['doubtId','decision','text','note']));
  else if(command==='rescan')denied('请通过真实补扫上传表单补交文件，不能模拟补扫。');
  else if(command==='review-page')Object.assign(body,{page:p.page,confirmed:p.confirmed===true,evidence:p.evidence,...fields(p,['nonTextConfirmed','textHash','scanHash']),...(p.pagesVerified!==undefined?{pagesVerified:p.pagesVerified===true}:{})});
  else if(command==='publish')body.confirmed=p.confirmed===true;
  else if(command==='revision')Object.assign(body,fields(p,['page','text','reason','checked','nonTextPage','nonTextKind','nonTextConfirmed','pageDescription','textHash','scanHash']));
  else if(!['recheck','advance','review-all'].includes(command))denied('此书籍操作尚未接入。');
 }else if(action==='knowledge.story.create'){
  command='create';body={...fields(p,['title','bookId','page','chapter','version','topic','duration','level','summary','quote','sections','connections','quiz'])};scope=(records.books?.find(b=>b.id===p.bookId)?.scope??scope) as V1Scope;
 }else if(action.startsWith('knowledge.story.')||action==='knowledge.quiz'){
  command=action==='knowledge.quiz'?'quiz':command;body={storyId:id};
  if(['favorite','listen','quiz'].includes(command))Object.assign(body,{profile:p.profile??'me',...(command==='quiz'?{answer:p.answer}:{})});
  else if(['review','update'].includes(command))Object.assign(body,fields(p,['confirmed','evidence','quote','sections','page']));
  else denied('此故事操作尚未接入。');
 }else if(action==='knowledge.course.save'){command='create';body=fields(p,['profile','title','goal','structure','pace','stories']);scope=(records.stories?.find(s=>s.id===p.stories?.[0])?.scope??scope) as V1Scope;}
 else if(action.startsWith('knowledge.course.'))body={courseId:id,profile:p.profile??'me',...(command==='review'?{note:p.note}:{})};
 else if(action.startsWith('knowledge.gap.')){command='gap-'+command;body={gapId:id,...fields(p,['next','note','state'])};}
 else denied('此资料转换操作尚未接入，请保存原始收件并上传真实原件。');
 return {domain,command,body,scope,version};
}

async function uploadBook(p:Values,records:Records):Promise<unknown>{
 const file=(p.files as File[]|undefined)?.[0];if(!(file instanceof File)||p.files.length!==1)throw new V1Error('请一次选择一个真实PDF或扫描图片，不能使用内置样卷。',400,'VALIDATION');
 const target=p.bookId?records.books?.find(b=>b.id===p.bookId&&b.kind==='book'):undefined;
 const source=records.sources?.find(s=>s.id===(p.source??target?.source)&&s.kind==='source');if(!source)throw new V1Error('请选择已授权的知识源。',400,'VALIDATION');
 let intent=uploadIntents.get(file);if(!intent){intent=crypto.randomUUID();uploadIntents.set(file,intent);}
 const key=stable({...fields(p,['source','title','edition','author','pages','rights','layout','bookId','doubtId','note','expectedVersion','materialId']),file:{intent,name:file.name,size:file.size,lastModified:file.lastModified}});let entry=uploads.get(key);if(entry?.promise)return entry.promise;if(entry?.book)return entry.book;if(!entry){entry={};uploads.set(key,entry);}const current=entry;
 const promise=(async()=>{
  if(!current.ticket){const result=await submit({domain:'books',command:'create-upload',body:{sourceId:source.id,filename:file.name,size:file.size,mime:file.type||(/\.pdf$/i.test(file.name)?'application/pdf':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'image/jpeg')},scope:source.scope,version:0},key) as {data:V1Record};current.ticket=result.data;}
  const response=await fetch(`/api/v1/book-uploads/${encodeURIComponent(current.ticket.id)}/file`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:file});const receipt=await response.json().catch(()=>null);if(!response.ok)throw new V1Error(receipt?.error?.message??receipt?.message??'扫描文件未入库，请重试。',response.status,receipt?.error?.code??'UPLOAD_FAILED');
  const result=await submit(target?{domain:'books',command:'rescan',body:{uploadId:current.ticket.id,bookId:target.id,doubtId:p.doubtId,note:p.note},scope:target.scope,version:p.expectedVersion??target.revision}:{domain:'books',command:'create',body:{uploadId:current.ticket.id,...fields(p,['title','edition','author','pages','rights','layout','materialId'])},scope:source.scope,version:0});current.book=result;return result;
 })().finally(()=>{current.promise=undefined;});current.promise=promise;return promise;
}
export function executeLiveKnowledge(action:string,payload:Record<string,unknown>,_data:DemoData,records:Records):Promise<unknown>{return action==='knowledge.book.reuse'?registerStoredMaterialBook(String(_data.runtime?.capabilities?.identity?.actorId||''),String(payload.assetId||''),payload,records.sources||[]):action==='knowledge.book.upload'||action==='knowledge.book.rescan'&&Array.isArray(payload.files)?uploadBook(payload,records):submit(operation(action,payload,records));}

/** Project only persisted knowledge records. No demonstration seed or OCR substitute is read. */
export function projectLiveKnowledge(records:Records):KnowledgeData {
 const books=(records.books??[]).filter(b=>b.kind==='book').map(b=>({...b,owner:b.ownerId==='server-admin'?'me':b.ownerId})) as unknown as KnowledgeData['books'];
 const sources=(records.sources??[]).filter(s=>s.kind==='source').map(s=>{const originals=books.filter(b=>b.source===s.id&&b.status==='published');return {...s,owner:s.ownerId==='server-admin'?'me':s.ownerId,count:originals.length+Number((s.documents as unknown[]|undefined)?.length??0),health:!s.authorized?'授权已撤销':!s.active?'已停用':s.connectorStatus==='connected'?'可用':String(s.health??'尚未同步'),records:[...(Array.isArray(s.documents)?s.documents:[]),...originals.map(b=>({title:b.title,text:b.text,book:b.id}))]};}) as unknown as KnowledgeData['sources'];
 const stories=(records.stories??[]).filter(s=>s.kind==='story') as unknown as KnowledgeData['stories'],favorites:KnowledgeData['favorites']={},progress:KnowledgeData['progress']={},courses:KnowledgeData['courses']={};
 for(const raw of (records.stories??[]).filter(s=>s.kind==='story')){for(const profile of raw.favorites as string[]??[])(favorites[profile]??=[]).push(raw.id);for(const [profile,p]of Object.entries(raw.progress as Record<string,any>??{}))(progress[profile]??={})[raw.id]=p;}
 for(const course of (records.learning??[]).filter(c=>c.kind==='course'&&c.status!=='removed'))(courses[String(course.profile)]??=[]).push(course as any);
 const query=(records.sources??[]).filter(r=>r.kind==='query').at(-1);
 const queryResults=((query?.results??[]) as Values[]).filter(r=>sources.some(s=>s.id===r.source&&s.active&&s.authorized)&&(!r.book||books.some(b=>b.id===r.book&&b.status==='published'&&b.version===r.version)));
 const materials=(records.books??[]).filter(m=>m.kind==='material').map(m=>({...m,owner:m.ownerId==='server-admin'?'me':m.ownerId})) as any;
 return {sources,books,stories,gaps:(records.learning??[]).filter(g=>g.kind==='gap') as any,materials,favorites,progress,courses,query:{text:String(query?.text??''),results:queryResults as any,at:String(query?.createdAt??''),mode:String(query?.mode??'all')},events:books.flatMap(b=>b.audit??[]).sort((a,b)=>b.time.localeCompare(a.time)).slice(0,60)};
}
export function projectLiveLearning(records:Records):Record<string,any>{
 const result:Record<string,any>={};for(const record of (records.learning??[]).filter(r=>r.kind==='practice')){const profile=String(record.profile),entry=result[profile]??={minutes:0,completed:0,days:0,streak:0,events:[]};entry.minutes+=Number(record.minutes)||0;entry.completed++;entry.events.unshift({...record,day:String(record.createdAt).slice(0,10)});}
 for(const entry of Object.values(result)as any[])entry.days=new Set(entry.events.map((e:Values)=>e.day)).size;return result;
}
