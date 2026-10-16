import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {V1Repository} from '../v1/repository.js';
import {BusinessError} from '../v1/types.js';

export const knowledgeReferenceInput=z.object({queryId:z.string().min(1).max(200),source:z.string().min(1).max(200),location:z.string().min(1).max(4500),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function requireReference(value:unknown,message:string,status=409):asserts value {if(!value)throw new BusinessError(status===409?'CONFLICT':'FORBIDDEN',message,status);}
function externalLink(location:string){try{const url=new URL(location);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}

/** Resolve only a server-saved search result. Never fetch a client-supplied location. */
export function resolveKnowledgeReference(repository:V1Repository,actorId:string,raw:unknown){
 const input=knowledgeReferenceInput.parse(raw),query=repository.read('sources',input.queryId,actorId);
 requireReference(query?.kind==='query'&&query.status==='complete','这次检索记录不可用，请重新检索',404);
 const result=(query.results??[]).find((item:any)=>item.source===input.source&&item.location===input.location&&item.sha256===input.sha256);
 requireReference(result,'引用不属于这次检索结果，请重新检索',404);
 const source=repository.read('sources',result.source,actorId);
 requireReference(source?.kind==='source'&&source.active&&source.authorized&&source.scope===query.scope,'这个来源已停用、撤权或不在当前范围，无法打开原文',403);
 const quote=typeof result.text==='string'?result.text:'',offset=result.offset;
 requireReference(quote.length>0&&quote.length<=2000&&Number.isSafeInteger(offset)&&offset>=0,'引用缺少可信摘录或位置，请重新检索');
 let text:string,kind:'book-page'|'stored-document'|'query-excerpt',bookId:string|undefined,page:number|undefined,version:number|string|undefined,verifiedSourceText=true;
 if(result.book){
  const book=repository.read('books',result.book,actorId);
  requireReference(book?.kind==='book'&&book.source===source.id&&book.scope===source.scope&&book.status==='published','原文已撤下或离开当前授权范围，请重新检索',403);
  requireReference(book.version===result.version,'原文版本已更新，请重新检索后打开当前出处');
  const entry=book.pageTexts?.find((item:any)=>item.page===result.page);
  requireReference(typeof entry?.text==='string'&&hash(entry.text)===input.sha256,'命中页的正文已变化，请重新检索');
  requireReference(result.location===`book://${book.id}/${book.version}/page/${entry.page}`,'书页引用位置不一致，请重新检索');
  text=entry.text;kind='book-page';bookId=book.id;page=entry.page;version=book.version;
 }else{
  const matches=(source.documents??[]).filter((item:any)=>item.location===input.location);
  const document=matches.find((item:any)=>typeof item.text==='string'&&hash(item.text)===input.sha256);
  if(document){text=document.text;kind='stored-document';version=source.version;}
  else{
   requireReference(matches.length===0,'这份资料正文已更新，请重新检索');
   requireReference(['live','hybrid'].includes(source.mode)&&result.sourceRevision===source.revision,'这份引用没有可核对的当前正文，请重新检索或同步来源');
   // Live queries retain an excerpt, not the complete source. Do not imply a fresh read.
   text=quote;kind='query-excerpt';verifiedSourceText=false;version=source.version;
  }
 }
 requireReference(!verifiedSourceText||text.slice(offset,offset+quote.length)===quote,'摘录和原文位置不一致，请重新检索');
 let contextStart=verifiedSourceText?Math.max(0,offset-800):0,end=verifiedSourceText?Math.min(text.length,offset+quote.length+800):text.length;
 if(contextStart>0&&/[\uDC00-\uDFFF]/.test(text[contextStart]))contextStart--;
 if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end++;
 const url=externalLink(input.location);
 return {sourceId:source.id,sourceName:source.name??'知识来源',sourceRevision:source.revision,title:result.title,kind,location:input.location,sha256:input.sha256,...(bookId?{bookId,page,version}:{version}),text:text.slice(contextStart,end),contextStart,quote,quoteOffset:offset,quoteStart:verifiedSourceText?offset-contextStart:0,hasEarlierText:contextStart>0,hasLaterText:end<text.length,verifiedSourceText,resolvedAt:new Date().toISOString(),notice:verifiedSourceText?'已按当前授权、原文版本和完整正文指纹核对。高亮范围为检索摘录，不一定是查询词的位置。':'只保留当时检索摘录，未保存或重新读取实时全文。来源仍获授权；查看最新正文请明确打开来源网站。',...(url?{externalUrl:url}:{})};
}
