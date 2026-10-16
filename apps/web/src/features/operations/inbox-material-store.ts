import type { V1Scope } from '../../v1-client';
import type { InboxMaterial } from './inbox-material-client';
import { clearMaterialIntents } from './inbox-material-intents';

export interface LocalInboxMaterial { id:string; filename:string; mime:string; size:number; scope:V1Scope; blob?:Blob; asset?:InboxMaterial }
interface MaterialDraft { key:string; actorId:string; draftId:string; items:LocalInboxMaterial[] }
const DB='jarvis-inbox-materials-v1',STORE='drafts';
const SESSION_KEY='jarvis-inbox-material-session-v1';
let generation=0;
export const materialSessionGeneration=()=>{
  try{return generation+':'+(globalThis.localStorage.getItem(SESSION_KEY)||'initial')}
  catch{return generation+':storage-unavailable'}
};
globalThis.window?.addEventListener('storage',event=>{if(event.key!==SESSION_KEY&&event.key!==null)return;generation++;window.dispatchEvent(new Event('jarvis:inbox-materials-invalidated'));});
function open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('此浏览器无法保留附件草稿'));return}
    const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('附件草稿库正被其他窗口占用'));
  });
}
function key(actorId:string,draftId:string):string {if(!actorId||!draftId)throw new Error('草稿身份尚未确认');return JSON.stringify([actorId,draftId]);}
async function transact<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>,session=materialSessionGeneration()):Promise<T> {
  const db=await open();
  if(session!==materialSessionGeneration()){db.close();throw new Error('会话已变化，附件草稿操作已停止')}
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);let result:T;
    const request=run(tx.objectStore(STORE));request.onsuccess=()=>{result=request.result};
    tx.oncomplete=()=>{db.close();resolve(result!)};tx.onerror=()=>{db.close();reject(tx.error||request.error)};tx.onabort=()=>{db.close();reject(tx.error||new Error('附件草稿未能保存'))};
  });
}
export async function getInboxMaterialDraft(actorId:string,draftId:string):Promise<LocalInboxMaterial[]> {
  const row=await transact<MaterialDraft|undefined>('readonly',store=>store.get(key(actorId,draftId)));
  if(!row)return [];
  if(row.actorId!==actorId||row.draftId!==draftId||!Array.isArray(row.items)||row.items.length>5||row.items.some(item=>!item||typeof item.id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(item.id)||typeof item.filename!=='string'||item.filename.length>500||typeof item.mime!=='string'||item.mime.length>200||!Number.isSafeInteger(item.size)||item.size<1||item.size>32*1024*1024||!['private','personal','family','company'].includes(item.scope)||(item.blob!==undefined&&!(item.blob instanceof Blob))))throw new Error('本机附件草稿格式无效，请保留已有原件后清除本站数据');
  return row.items;
}
export async function saveInboxMaterialDraft(actorId:string,draftId:string,items:LocalInboxMaterial[],session=materialSessionGeneration()):Promise<void> {
  await transact('readwrite',store=>store.put({key:key(actorId,draftId),actorId,draftId,items}),session);
}
export async function removeInboxMaterialDraft(actorId:string,draftId:string):Promise<void> {await transact('readwrite',store=>store.delete(key(actorId,draftId)));}
/** Invalidate callbacks immediately, then clear every actor's local binary draft. */
export async function clearInboxMaterialDrafts():Promise<void> {
  let sharedEpochSaved=true;
  try{globalThis.localStorage.setItem(SESSION_KEY,crypto.randomUUID())}catch{sharedEpochSaved=false}
  try{clearMaterialIntents()}catch{sharedEpochSaved=false}
  generation++;globalThis.window?.dispatchEvent(new Event('jarvis:inbox-materials-invalidated'));
  await transact('readwrite',store=>store.clear());
  if(!sharedEpochSaved)throw new Error('跨窗口附件清理状态未能保存，请清除本站数据');
}
