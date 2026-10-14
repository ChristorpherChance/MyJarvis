import {RuntimeAccessError} from './identity.js';
import {publicWebUrl} from './web-fetch.js';

export function decodeWebText(bytes:Buffer,contentType=''){
 const prefix=bytes.subarray(0,200).toString('ascii'),charset=contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]??prefix.match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1]??'utf-8';
 try{return new TextDecoder(charset,{fatal:false}).decode(bytes);}catch{throw new RuntimeAccessError('WEB_CHARSET_UNSUPPORTED','网页文本编码暂不支持',415);}
}

/** Every search advances past the matched section; unclosed sections consume the remainder. */
function unwrapCdata(value:string){
 const parts:string[]=[];let cursor=0;
 while(cursor<value.length){
  const start=value.indexOf('<![CDATA[',cursor);
  if(start<0){parts.push(value.slice(cursor));break;}
  parts.push(value.slice(cursor,start));
  const end=value.indexOf(']]>',start+9);
  if(end<0){parts.push(value.slice(start));break;}
  parts.push(value.slice(start+9,end));cursor=end+3;
 }
 return parts.join('');
}

const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function decodeEntities(value:string){
 return unwrapCdata(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,v)=>{
  if(v[0]!=='#')return entities[v.toLowerCase()]??all;
  const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);
  return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
 }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
}

// Token scans only move forward, including on malformed or missing terminators.
type Markup={start:number;end:number;kind:'tag'|'comment'|'cdata'|'other';name:string;closing:boolean;selfClosing:boolean;attributesStart:number};
const space=(c:string)=>c===' '||c==='\t'||c==='\r'||c==='\n'||c==='\f';
const nameCharacter=(c:string)=>{const n=c.charCodeAt(0);return n>=65&&n<=90||n>=97&&n<=122||n>=48&&n<=57||c===':'||c==='_'||c==='-'||c==='.';};

function nextMarkup(value:string,from:number):Markup|undefined{
 const start=value.indexOf('<',from);if(start<0)return undefined;
 const token:Markup={start,end:value.length,kind:'other',name:'',closing:false,selfClosing:false,attributesStart:start};
 if(value.startsWith('<!--',start)){const end=value.indexOf('-->',start+4);token.kind='comment';token.end=end<0?value.length:end+3;return token;}
 if(value.startsWith('<![CDATA[',start)){const end=value.indexOf(']]>',start+9);token.kind='cdata';token.end=end<0?value.length:end+3;return token;}
 let cursor=start+1;if(value[cursor]==='/'){token.closing=true;cursor++;}
 const nameStart=cursor;while(cursor<value.length&&nameCharacter(value[cursor]))cursor++;
 const nameEnd=cursor,validName=nameEnd>nameStart&&(space(value[cursor])||value[cursor]==='/'||value[cursor]==='>');
 let quote='';
 for(;cursor<value.length;cursor++){
  const c=value[cursor];
  if(quote){if(c===quote)quote='';continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='>'){
   token.end=cursor+1;
   if(validName){token.kind='tag';token.name=value.slice(nameStart,nameEnd).toLowerCase();token.attributesStart=nameEnd;let at=cursor-1;while(at>nameEnd&&space(value[at]))at--;token.selfClosing=value[at]==='/';}
   return token;
  }
 }
 return token;
}

const rawTextTags=new Set(['script','style']);
function rawClosingTag(value:string,name:string,from:number):Markup|undefined{
 let cursor=from;
 while(cursor<value.length){
  const start=value.indexOf('</',cursor);if(start<0)return undefined;
  const at=start+2+name.length;
  if(value.slice(start+2,at).toLowerCase()===name&&(space(value[at])||value[at]==='>')){
   const token=nextMarkup(value,start);
   if(token?.kind==='tag'&&token.closing&&token.name===name)return token;
   cursor=token?.end??value.length;
  }else cursor=start+2;
 }
 return undefined;
}

function visitTags(value:string,visit:(token:Markup)=>boolean|void){
 let cursor=0;
 while(cursor<value.length){
  const token=nextMarkup(value,cursor);if(!token)return;cursor=token.end;
  if(token.kind==='tag'){
   if(visit(token)===false)return;
   if(!token.closing&&!token.selfClosing&&rawTextTags.has(token.name))cursor=rawClosingTag(value,token.name,cursor)?.end??value.length;
  }
 }
}

function attributes(value:string,token:Markup){
 const result=new Map<string,string>();let cursor=token.attributesStart;const end=token.end-1;
 while(cursor<end){
  while(cursor<end&&(space(value[cursor])||value[cursor]==='/'))cursor++;
  const start=cursor;while(cursor<end&&!space(value[cursor])&&value[cursor]!=='='&&value[cursor]!=='/'&&value[cursor]!=='>')cursor++;
  if(cursor===start){cursor++;continue;}
  const name=value.slice(start,cursor).toLowerCase();while(cursor<end&&space(value[cursor]))cursor++;
  if(value[cursor]!=='=')continue;
  cursor++;while(cursor<end&&space(value[cursor]))cursor++;
  const quote=value[cursor]==='"'||value[cursor]==="'"?value[cursor++]:'';const valueStart=cursor;
  if(quote){while(cursor<end&&value[cursor]!==quote)cursor++;}else{while(cursor<end&&!space(value[cursor])&&value[cursor]!=='>')cursor++;}
  if(!result.has(name))result.set(name,decodeEntities(value.slice(valueStart,cursor)));
  if(quote&&cursor<end)cursor++;
 }
 return result;
}

const hiddenTags=new Set(['script','style','noscript','iframe','svg','form','nav','footer','header','aside']);
const breakTags=new Set(['p','div','li','h1','h2','h3','h4','h5','h6','section','article']);
export function plainWebText(value:string,max=12000){
 const text=unwrapCdata(value),parts:string[]=[];let cursor=0,hidden='',depth=0;
 while(cursor<text.length){
  const token=nextMarkup(text,cursor);if(!token)break;
  if(!hidden)parts.push(text.slice(cursor,token.start));
  if(token.kind==='tag'){
   if(!token.closing&&!token.selfClosing&&rawTextTags.has(token.name)){cursor=rawClosingTag(text,token.name,token.end)?.end??text.length;if(!hidden)parts.push(' ');continue;}
   else if(hidden){if(token.name===hidden){if(token.closing){if(--depth===0)hidden='';}else if(!token.selfClosing)depth++;}}
   else if(!token.closing&&!token.selfClosing&&hiddenTags.has(token.name)){hidden=token.name;depth=1;}
   else parts.push(token.name==='br'||token.closing&&breakTags.has(token.name)?'\n':' ');
  }else if(!hidden)parts.push(' ');
  cursor=token.end;
 }
 if(!hidden)parts.push(text.slice(cursor));
 return decodeEntities(parts.join('')).replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,max);
}

function tag(value:string,name:string){
 let start=-1,result='';
 visitTags(value,token=>{
  if(token.name!==name)return;
  if(start<0){if(!token.closing&&!token.selfClosing)start=token.end;}
  else if(token.closing){result=value.slice(start,token.start);return false;}
 });
 return result;
}

export type FeedItem={title:string;url:string;summary:string;sourcePublishedAt:string|null;sourcePublishedRaw:string|null;sourceUpdatedAt:string|null};
export function parsePublicFeed(xml:string,baseUrl:string,limit=100):FeedItem[]{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new RuntimeAccessError('WEB_FEED_INVALID','来源没有返回受支持的 RSS/Atom 内容',502);
 let root='';visitTags(xml,token=>{if(!token.closing&&(token.name==='rss'||token.name==='feed')){root=token.name;return false;}});
 if(!root)throw new RuntimeAccessError('WEB_FEED_INVALID','来源没有返回受支持的 RSS/Atom 内容',502);
 const atom=root==='feed',itemName=atom?'entry':'item',items:FeedItem[]=[],seen=new Set<string>();let start=-1;
 visitTags(xml,token=>{
  if(items.length>=limit)return false;
  if(token.name!==itemName)return;
  if(start<0){if(!token.closing&&!token.selfClosing)start=token.end;return;}
  if(!token.closing)return;
  const body=xml.slice(start,token.start);start=-1;
  let link=decodeEntities(tag(body,'link').trim());
  if(atom){link='';visitTags(body,node=>{if(node.name!=='link'||node.closing)return;const attrs=attributes(body,node),rel=attrs.get('rel')?.toLowerCase();if(!rel||rel==='alternate'){link=attrs.get('href')??'';return false;}});}
  let url:string;try{url=publicWebUrl(new URL(link,baseUrl).href).href;}catch{return;}
  if(!link||seen.has(url))return;
  const title=plainWebText(tag(body,'title'),300);if(!title)return;
  seen.add(url);
  const raw=decodeEntities(tag(body,atom?'published':'pubdate').trim()||tag(body,'dc:date').trim()).slice(0,2000),updated=decodeEntities(tag(body,'updated').trim()).slice(0,2000),iso=(v:string)=>v&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
  items.push({title,url,summary:plainWebText(tag(body,atom?'summary':'description')||tag(body,'content'),700),sourcePublishedAt:iso(raw),sourcePublishedRaw:raw||null,sourceUpdatedAt:iso(updated)});
 });
 return items;
}

export function extractPublicPage(text:string,url:string,maxChars=6000){
 let html=false;visitTags(text,token=>{if(['html','body','article','main','title'].includes(token.name)){html=true;return false;}});
 const title=html?plainWebText(tag(text,'title'),300):url,main=html?(tag(text,'article')||tag(text,'main')||tag(text,'body')||text):text,all=html?plainWebText(main,100000):text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim(),content=all.slice(0,maxChars);
 if(!content)throw new RuntimeAccessError('WEB_CONTENT_EMPTY','页面没有可提取的公开正文；可能需要脚本或登录',422);
 let rawPublished:string|null=null;
 visitTags(text,token=>{if(token.name!=='meta'||token.closing)return;const attrs=attributes(text,token),kinds=[attrs.get('property'),attrs.get('name')],date=attrs.get('content');if(date&&kinds.some(kind=>kind&&['article:published_time','datepublished','pubdate'].includes(kind.toLowerCase()))){rawPublished=date;return false;}});
 const publication=rawPublished as string|null;
 return {title,url,text:content,truncated:all.length>maxChars,extraction:html?'static-html-text':'plain-text',publishedAt:publication&&Number.isFinite(Date.parse(publication))?new Date(publication).toISOString():null,publicationSource:publication?'page-metadata':null};
}
