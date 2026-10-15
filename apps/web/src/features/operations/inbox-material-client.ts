import { v1Request, type V1Envelope, type V1Scope } from '../../v1-client';

export const MATERIAL_MAX_SIZE = 25 * 1024 * 1024;
export const MATERIAL_MAX_COUNT = 5;
export type MaterialLanguage='zh'|'en'|'ja'|'fr'|'de'|'es'|'auto';
export interface MaterialProcessInput {commandId:string;expectedVersion:number;operation:'extract'|'transcribe';cloudConsent?:boolean;language?:MaterialLanguage}
export interface MaterialProcessingState extends MaterialProcessInput {status:'running'|'complete'|'failed'|'interrupted';cloudConsent:boolean;sourceSha256:string|null;startedAt:string;completedAt?:string;error?:{code:string;message:string};retryable:boolean}
export interface MaterialExtraction {operation:'extract'|'transcribe';sourceSha256:string;text:string;textSha256:string;engine:string;language?:string;segments:{text:string;location:string;sha256:string;page?:number|null;paragraph?:number|null;start?:number;end?:number}[];warnings:string[];reviewRequired:true;processedAt:string}
export interface InboxMaterial {
  id:string; filename:string; mime:string; size:number; sha256:string;
  mediaKind:'audio'|'document'|'image'|'text'; textStatus:'extracted'|'unsupported'|'not-applicable';
  status?:'stored'|'awaiting-file'|'fetching'|'failed'; scope?:V1Scope;
  revision?:number;ownerId?:string;sourceUrl?:string;extractedText?:string;textTruncated?:boolean;
  processing?:MaterialProcessingState;extraction?:MaterialExtraction;
  textReview?:{text:string;sourceTextSha256:string;reviewedAt:string;reviewedBy:string};
}
const prefix = '/api/v1/inbox-materials/uploads';
export const materialFileUrl = (id:string) => `${prefix}/${encodeURIComponent(id)}/file`;
export function safeSourceUrl(value:unknown):string|null {
  if(typeof value!=='string'||!value.trim()||value.length>2048)return null;
  try{const url=new URL(value.trim());return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null}catch{return null}
}
export const materialStatus = (item:InboxMaterial):string => item.processing?.status==='running'?'原件已保存 · 正在处理文字':item.textReview?'原件已保存 · 校正文字已保存':item.extraction?'原件已保存 · 提取文字待核对':item.mediaKind==='audio'?'原件已保存 · 录音待转写':item.mediaKind==='image'?'原件已保存 · 图片文字待识别':item.textStatus==='extracted'?'原件已保存 · 文字可检索':'原件已保存 · 文字待解析';
export async function readInboxMaterial(id:string):Promise<InboxMaterial> {return (await v1Request<V1Envelope<InboxMaterial>>(`${prefix}/${encodeURIComponent(id)}`)).data;}
export async function uploadInboxMaterial(input:{id:string;filename:string;mime:string;blob:Blob;scope:V1Scope}):Promise<InboxMaterial> {
  const receipt=await v1Request<V1Envelope<InboxMaterial>>(prefix,{method:'POST',body:JSON.stringify({id:input.id,filename:input.filename,mime:input.mime,size:input.blob.size,scope:input.scope})});
  if(receipt.data.status==='stored')return receipt.data;
  return (await v1Request<V1Envelope<InboxMaterial>>(materialFileUrl(input.id),{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:input.blob})).data;
}
export async function processInboxMaterial(id:string,input:MaterialProcessInput):Promise<InboxMaterial> {return (await v1Request<V1Envelope<InboxMaterial>>(`${prefix}/${encodeURIComponent(id)}/process`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function reviewInboxMaterialText(id:string,input:{commandId:string;expectedVersion:number;text:string}):Promise<InboxMaterial> {return (await v1Request<V1Envelope<InboxMaterial>>(`${prefix}/${encodeURIComponent(id)}/text-review`,{method:'POST',body:JSON.stringify(input)})).data;}
export async function extractInboxLink(input:{id:string;url:string;scope:V1Scope}):Promise<InboxMaterial> {return (await v1Request<V1Envelope<InboxMaterial>>('/api/v1/inbox-materials/links/extract',{method:'POST',body:JSON.stringify(input)})).data;}
export function downloadLocalMaterial(blob:Blob,filename:string):void {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
