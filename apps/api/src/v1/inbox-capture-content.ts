import { BusinessError, type BusinessRecord, type CommandContext } from './types.js';
import { materialReference, type InboxMaterialMetadata } from './inbox-materials.js';

const MAX_MATERIAL_TEXT=120000;
export interface InboxContent {
  rawText:string; sourceUrl:string|null; attachments:InboxMaterialMetadata[];
  materialText:string; materialTextTruncated:boolean;
}
export function captureContent(payload:Record<string,any>,ctx:CommandContext):InboxContent {
  const raw=payload.rawText??'';
  if(typeof raw!=='string'||raw.length>20000)throw new BusinessError('VALIDATION','原话格式无效或超过20000字',400);
  let sourceUrl:string|null=null;
  if(payload.sourceUrl!==undefined&&payload.sourceUrl!==null&&payload.sourceUrl!=='') {
    if(typeof payload.sourceUrl!=='string'||payload.sourceUrl.length>4000)throw new BusinessError('VALIDATION','来源链接格式无效',400);
    sourceUrl=payload.sourceUrl.trim();let url:URL;
    try {url=new URL(sourceUrl);} catch {throw new BusinessError('VALIDATION','请填写完整的 http 或 https 链接',400);}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new BusinessError('VALIDATION','来源只接受不含登录凭据的 http 或 https 链接',400);
  }
  const ids=payload.attachmentIds??[];
  if(!Array.isArray(ids)||ids.length>5||ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)
    throw new BusinessError('VALIDATION','每条最多关联5个不同的已上传原件',400);
  const refs=ids.map(id=>materialReference(ctx,id));
  if(!raw.trim()&&!sourceUrl&&!refs.length)throw new BusinessError('VALIDATION','请写下想法、添加链接，或保存一份录音或文档',400);
  const allText=refs.map(ref=>ref.extractedText).filter(Boolean).join('\n\n');
  let materialText=allText.slice(0,MAX_MATERIAL_TEXT);
  if(materialText.length<allText.length&&/[\uD800-\uDBFF]$/.test(materialText))materialText=materialText.slice(0,-1);
  return {rawText:raw.trim()?raw:'',sourceUrl,attachments:refs.map(ref=>ref.metadata),materialText,materialTextTruncated:materialText.length<allText.length||refs.some(ref=>ref.textTruncated)};
}
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\s，。！？、,.!?;；:："'“”‘’]/g,'');
/** Keep attachment-only records distinct; compare original content, not upload UUIDs. */
export function inboxContentKey(item:Partial<InboxContent>|BusinessRecord):string {
  return JSON.stringify([normalize(String(item.rawText??'')),item.sourceUrl??null,[...new Set((item.attachments??[]).map((ref:InboxMaterialMetadata)=>ref.sha256))].sort()]);
}
export function inboxTitle(content:InboxContent):string {
  return (content.rawText.trim().replace(/\s+/g,' ')||content.sourceUrl||content.attachments[0]?.filename||'收件').slice(0,80);
}
export function materialProvenance(source:BusinessRecord):Record<string,unknown> {
  return {sourceUrl:source.sourceUrl??null,attachments:source.attachments??[],materialText:source.materialText??'',materialTextTruncated:source.materialTextTruncated===true,inboxOrigins:source.inboxOrigins??source.origins??[]};
}
/** A source description is not a transcript or a reviewed knowledge body. */
export function routedBody(source:BusinessRecord):string {
  if(typeof source.rawText==='string'&&source.rawText.trim())return source.rawText;
  const description=[source.sourceUrl?`来源链接：${source.sourceUrl}`:'',...(source.attachments??[]).map((ref:InboxMaterialMetadata)=>`原件：${ref.filename}`)].filter(Boolean);
  return [...description,'（以上为来源说明，原件内容尚未整理为正文。）'].join('\n');
}
