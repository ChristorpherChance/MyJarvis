import { v1Request, type V1Envelope, type V1Scope } from '../../v1-client';

export const MATERIAL_MAX_SIZE = 25 * 1024 * 1024;
export const MATERIAL_MAX_COUNT = 5;
export interface InboxMaterial {
  id:string; filename:string; mime:string; size:number; sha256:string;
  mediaKind:'audio'|'document'|'image'|'text'; textStatus:'extracted'|'unsupported'|'not-applicable';
  status?:'stored'|'awaiting-file'; scope?:V1Scope;
}
const prefix = '/api/v1/inbox-materials/uploads';
export const materialFileUrl = (id:string) => `${prefix}/${encodeURIComponent(id)}/file`;
export function safeSourceUrl(value:unknown):string|null {
  if(typeof value!=='string'||!value.trim()||value.length>2048)return null;
  try{const url=new URL(value.trim());return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null}catch{return null}
}
export const materialStatus = (item:InboxMaterial):string => item.mediaKind==='audio'?'原件已保存 · 录音待转写':item.mediaKind==='image'?'原件已保存 · 图片文字待识别':item.textStatus==='extracted'?'原件已保存 · 文字可检索':'原件已保存 · 文字待解析';
export async function readInboxMaterial(id:string):Promise<InboxMaterial> {return (await v1Request<V1Envelope<InboxMaterial>>(`${prefix}/${encodeURIComponent(id)}`)).data;}
export async function uploadInboxMaterial(input:{id:string;filename:string;mime:string;blob:Blob;scope:V1Scope}):Promise<InboxMaterial> {
  const receipt=await v1Request<V1Envelope<InboxMaterial>>(prefix,{method:'POST',body:JSON.stringify({id:input.id,filename:input.filename,mime:input.mime,size:input.blob.size,scope:input.scope})});
  if(receipt.data.status==='stored')return receipt.data;
  return (await v1Request<V1Envelope<InboxMaterial>>(materialFileUrl(input.id),{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:input.blob})).data;
}
export function downloadLocalMaterial(blob:Blob,filename:string):void {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
