import type { V1Scope } from '../../v1-client';
import { safeSourceUrl, type MaterialProcessInput } from './inbox-material-client';

const PREFIX='jarvis-inbox-material-intent-v1:';
type ProcessIntent={kind:'process';assetId:string;input:MaterialProcessInput};
type ReviewIntent={kind:'review';assetId:string;input:{commandId:string;expectedVersion:number;text:string}};
export type LinkMaterialIntent={kind:'link';input:{id:string;url:string;scope:V1Scope}};
export type MaterialIntent=ProcessIntent|ReviewIntent|LinkMaterialIntent;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stable=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const keys=(value:object,allowed:string[])=>Object.keys(value).every(name=>allowed.includes(name));
const key=(actorId:string,name:string)=>{if(!actorId||actorId.length>256||!name||name.length>512)throw new Error('登录身份尚未确认，未发送处理请求。');return PREFIX+encodeURIComponent(actorId)+':'+encodeURIComponent(name)};
function valid(value:unknown):value is MaterialIntent {
  if(!value||typeof value!=='object')return false;
  const intent=value as MaterialIntent;
  if(intent.kind==='link')return keys(intent,['kind','input'])&&!!intent.input&&keys(intent.input,['id','url','scope'])&&uuid.test(intent.input.id)&&safeSourceUrl(intent.input.url)===intent.input.url&&['private','personal','family','company'].includes(intent.input.scope);
  if(!['process','review'].includes(intent.kind)||!('assetId' in intent)||!uuid.test(intent.assetId)||!intent.input||!uuid.test(intent.input.commandId)||!Number.isSafeInteger(intent.input.expectedVersion)||intent.input.expectedVersion<1)return false;
  if(!keys(intent,['kind','assetId','input']))return false;
  if(intent.kind==='review')return keys(intent.input,['commandId','expectedVersion','text'])&&typeof intent.input.text==='string'&&!!intent.input.text.trim()&&intent.input.text.length<=120000;
  return keys(intent.input,['commandId','expectedVersion','operation','cloudConsent','language'])&&['extract','transcribe'].includes(intent.input.operation)&&(intent.input.cloudConsent===undefined||typeof intent.input.cloudConsent==='boolean')&&(intent.input.language===undefined||['zh','en','ja','fr','de','es','auto'].includes(intent.input.language));
}
export function getMaterialIntent(actorId:string,name:string):MaterialIntent|null {
  try{const raw=localStorage.getItem(key(actorId,name));if(raw===null)return null;if(raw.length>750000)throw new Error();const envelope=JSON.parse(raw);if(envelope.actorId!==actorId||envelope.origin!==location.origin||!valid(envelope.intent))throw new Error();return envelope.intent}
  catch{throw new Error('此浏览器无法恢复上次处理编号，请保留材料，恢复本站存储后再试。')}
}
/** Persist before HTTP: an unknown cloud result must retain its exact command and consent. */
export function saveMaterialIntent(actorId:string,name:string,intent:MaterialIntent):void {
  try{if(!valid(intent))throw new Error();const existing=getMaterialIntent(actorId,name);if(existing&&stable(existing)!==stable(intent))throw new Error();localStorage.setItem(key(actorId,name),JSON.stringify({actorId,origin:location.origin,intent}));}
  catch{throw new Error('处理编号未能可靠保存在此浏览器，这次没有发送。请先恢复浏览器存储。')}
}
export function removeMaterialIntent(actorId:string,name:string,expected:MaterialIntent):void {
  const existing=getMaterialIntent(actorId,name);if(existing&&stable(existing)===stable(expected))localStorage.removeItem(key(actorId,name));
}
export function clearMaterialIntents():void {
  const keys:string[]=[];for(let index=0;index<localStorage.length;index++){const name=localStorage.key(index);if(name?.startsWith(PREFIX))keys.push(name)}for(const name of keys)localStorage.removeItem(name);
}
globalThis.window?.addEventListener('jarvis:inbox-materials-invalidated',()=>{try{clearMaterialIntents()}catch{/* The session cleanup path reports storage failure separately. */}});
