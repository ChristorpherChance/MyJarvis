import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { BusinessError } from '../v1/types.js';

export interface KnowledgeNetworkPolicy { allowedHttpOrigins:string[]; allowedDirectoryRoots:string[]; timeoutMs:number; maxBytes:number; maxDocuments:number }
export interface KnowledgeDocument { id:string; title:string; text:string; location:string; sha256:string; metadata:Record<string,unknown> }
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const within=(root:string,target:string)=>{const part=relative(root,target);return part===''||(!part.startsWith('..'+sep)&&part!=='..'&&!isAbsolute(part));};
function reject(message:string,status=422):never {throw new BusinessError('CONNECTOR_REJECTED',message,status);}
export function permittedUrl(value:string,policy:KnowledgeNetworkPolicy):URL {
 let url:URL;try{url=new URL(value);}catch{reject('连接器地址无效');}
 if(!['https:','http:'].includes(url!.protocol)||url!.username||url!.password||url!.hash)reject('连接器仅允许不含凭据的 HTTP(S) 地址');
 if(!policy.allowedHttpOrigins.includes(url!.origin))reject('该 HTTP 来源不在管理员配置的连接器允许列表中',403);
 return url!;
}
/** No redirect following or implicit host discovery: only exact, explicitly configured origins. */
export async function fetchKnowledgeBytes(url:string,policy:KnowledgeNetworkPolicy,signal:AbortSignal,init:RequestInit={}):Promise<{bytes:Buffer;type:string}> {
 const target=permittedUrl(url,policy),timeout=AbortSignal.timeout(policy.timeoutMs),combined=AbortSignal.any([signal,timeout]);
 const response=await fetch(target,{...init,redirect:'manual',signal:combined});
 if(response.status>=300&&response.status<400)reject('连接器重定向被拒绝，请配置最终来源地址');
 if(!response.ok)throw new BusinessError('CONNECTOR_HTTP_ERROR',`资料服务返回 HTTP ${response.status}`,502);
 const declared=Number(response.headers.get('content-length')??0);if(declared>policy.maxBytes)reject('连接器响应超出资料大小上限',413);
 if(!response.body)return {bytes:Buffer.alloc(0),type:response.headers.get('content-type')??''};
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>policy.maxBytes){await reader.cancel();reject('连接器响应超出资料大小上限',413);}chunks.push(next.value);}}
 finally{reader.releaseLock();}
 return {bytes:Buffer.concat(chunks),type:response.headers.get('content-type')??''};
}
function plainHtml(text:string):string{return text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();}
export function parseKnowledgeDocuments(bytes:Buffer,type:string,location:string,maximum:number):KnowledgeDocument[] {
 let raw:string;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{reject('资料不是有效 UTF-8；请按实际编码转换后再同步');}if(raw!.includes('\u0000'))reject('资料必须为 UTF-8 文本或 JSON，不能把二进制伪装成正文');
 let entries:unknown[];
 if(/json/i.test(type)||/\.json(?:\?|$)/i.test(location)) {let parsed:any;try{parsed=JSON.parse(raw);}catch{reject('来源 JSON 无法解析');}entries=Array.isArray(parsed)?parsed:Array.isArray(parsed?.documents)?parsed.documents:[parsed];}
 else entries=[{title:location.split('/').at(-1)||'资料',text:/html/i.test(type)||/\.html?(?:\?|$)/i.test(location)?plainHtml(raw):raw}];
 if(entries.length>maximum)reject('资料文档数量超过同步上限',413);
 return entries.map((entry:any,index)=>{if(!entry||typeof entry.text!=='string'||!entry.text.trim()||entry.text.length>120000)reject('每篇资料必须包含不超过 120000 字符的非空 text');const title=typeof entry.title==='string'?entry.title.slice(0,300):`资料 ${index+1}`,text=entry.text;
  return {id:hash(location+'#'+index),title,text,location:location+'#'+(index+1),sha256:hash(text),metadata:{format:/json/i.test(type)?'json':'text',sourceDocumentIndex:index+1}};});
}
export async function readKnowledgeDirectory(endpoint:string,policy:KnowledgeNetworkPolicy,signal:AbortSignal):Promise<KnowledgeDocument[]> {
 return (await readKnowledgeDirectoryPreview(endpoint,policy,signal)).documents;
}

export interface KnowledgeDirectoryChange { path:string; id:string; title:string; sha256:string }
export interface KnowledgeDirectoryPreview {
 snapshotFingerprint:string;
 documents:KnowledgeDocument[];
 changes:{added:KnowledgeDirectoryChange[];changed:KnowledgeDirectoryChange[];unchanged:KnowledgeDirectoryChange[];deleted:KnowledgeDirectoryChange[]};
 unsupported:string[];
 skipped:string[];
}

/** Inspect only authorized, real UTF-8 text files; binary/office formats are classified by path, never read. */
export async function readKnowledgeDirectoryPreview(endpoint:string,policy:KnowledgeNetworkPolicy,signal:AbortSignal,previousDocuments:KnowledgeDocument[]=[]):Promise<KnowledgeDirectoryPreview> {
 let configured=endpoint;if(endpoint.startsWith('file:'))configured=new URL(endpoint).pathname.replace(/^\/([A-Za-z]:)/,'$1');
 const target=await realpath(resolve(decodeURIComponent(configured))),roots=await Promise.all(policy.allowedDirectoryRoots.map(async root=>realpath(resolve(root))));
 if(!roots.some(root=>within(root,target)))reject('目录不在管理员明确授权的知识目录中',403);
 if(!(await stat(target)).isDirectory())reject('目录连接器需要一个真实目录');
 const documents:KnowledgeDocument[]=[],unsupported:string[]=[],skipped:string[]=[];let bytesRead=0;
 const supported=/\.(txt|md|json|html?)$/i,knownUnsupported=/\.(pdf|docx?|odt|rtf|xlsx?|pptx?|png|jpe?g|gif|webp|bmp|tiff?|heic|mp3|wav|mp4|mov|zip)$/i;
 async function visit(directory:string,depth:number){if(signal.aborted)throw signal.reason;if(depth>4)reject('知识目录超过 4 层扫描上限');const actualDirectory=await realpath(directory);if(!within(target,actualDirectory))reject('来源子目录越出已授权目录',403);
  const entries=await readdir(actualDirectory,{withFileTypes:true});if(entries.length>10000)reject('知识目录的单层文件数量超过扫描上限',413);for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){if(signal.aborted)throw signal.reason;const path=resolve(actualDirectory,entry.name),relativePath=relative(target,path).split(sep).join('/');if(entry.isSymbolicLink()){skipped.push(relativePath);continue;}if(entry.isDirectory()){await visit(path,depth+1);continue;}if(!entry.isFile()){skipped.push(relativePath);continue;}if(knownUnsupported.test(entry.name)){unsupported.push(relativePath);continue;}if(!supported.test(entry.name)){skipped.push(relativePath);continue;}
   const actual=await realpath(path);if(!within(target,actual))reject('来源文件越出已授权目录',403);const info=await stat(actual);bytesRead+=info.size;if(bytesRead>policy.maxBytes)reject('目录同步字节数超过上限',413);const bytes=await readFile(actual);bytesRead+=bytes.length-info.size;if(bytesRead>policy.maxBytes)reject('目录同步时文件增长超过上限',413);const location=relativePath,parsed=parseKnowledgeDocuments(bytes,/\.json$/i.test(entry.name)?'application/json':/\.html?$/i.test(entry.name)?'text/html':'text/plain',location,policy.maxDocuments-documents.length);documents.push(...parsed);if(documents.length>policy.maxDocuments)reject('知识目录文档数量超过同步上限',413);
  }
 }
 await visit(target,0);
 const byId=new Map(documents.map(d=>[d.id,d])),previous=new Map(previousDocuments.map(d=>[d.id,d]));
 const describe=(d:KnowledgeDocument):KnowledgeDirectoryChange=>({path:d.location.split('#')[0],id:d.id,title:d.title,sha256:d.sha256});
 const changes={added:[] as KnowledgeDirectoryChange[],changed:[] as KnowledgeDirectoryChange[],unchanged:[] as KnowledgeDirectoryChange[],deleted:[] as KnowledgeDirectoryChange[]};
 for(const document of documents){const old=previous.get(document.id),entry=describe(document);if(!old)changes.added.push(entry);else if(old.sha256!==document.sha256)changes.changed.push(entry);else changes.unchanged.push(entry);}
 for(const document of previousDocuments)if(!byId.has(document.id))changes.deleted.push(describe(document));
 const snapshotFingerprint=hash(JSON.stringify({documents:documents.map(d=>({id:d.id,sha256:d.sha256})).sort((a,b)=>a.id.localeCompare(b.id)),unsupported:[...unsupported].sort(),skipped:[...skipped].sort()}));
 return {snapshotFingerprint,documents,changes,unsupported:unsupported.sort(),skipped:skipped.sort()};
}
export async function synchronizeKnowledgeSource(source:Record<string,any>,policy:KnowledgeNetworkPolicy,signal:AbortSignal):Promise<KnowledgeDocument[]> {
 if(!source.active||!source.authorized)throw new BusinessError('FORBIDDEN','来源已经停用或撤销授权',403);
 if(/^https?:/i.test(source.endpoint)){const result=await fetchKnowledgeBytes(source.endpoint,policy,signal,{headers:{accept:'application/json, text/plain, text/html'}});return parseKnowledgeDocuments(result.bytes,result.type,source.endpoint,policy.maxDocuments);}
 return readKnowledgeDirectory(source.endpoint,policy,signal);
}
/** Deterministic full-text ranking; each excerpt keeps an exact source quote and content hash. */
export function searchKnowledgeDocuments(documents:KnowledgeDocument[],query:string,limit=100):Array<KnowledgeDocument&{score:number;quote:string;offset:number}> {
 const rawTerms=query.toLocaleLowerCase().split(/[\s、，,。！？:：;；]+/).filter(Boolean),terms=[...new Set([...rawTerms,...rawTerms.flatMap(term=>(term.match(/[\u3400-\u9fff]{3,}/g)??[]).flatMap(run=>Array.from({length:run.length-1},(_,i)=>run.slice(i,i+2))))])].slice(0,200);return documents.map(document=>{const haystack=document.text.toLocaleLowerCase(),title=document.title.toLocaleLowerCase();let score=0,offset=-1;for(const term of terms){const at=haystack.indexOf(term);if(at>=0){score+=rawTerms.includes(term)?4:1;offset=offset<0?at:Math.min(offset,at);}if(title.includes(term))score+=rawTerms.includes(term)?6:2;}const start=Math.max(0,offset-100);return {...document,score,offset:start,quote:document.text.slice(start,start+2000)};}).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.location.localeCompare(b.location)).slice(0,limit);
}
