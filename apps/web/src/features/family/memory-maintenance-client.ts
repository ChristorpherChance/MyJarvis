import {v1Request,V1Error,type V1Record} from '../../v1-client';
import {materialSessionGeneration} from '../operations/inbox-material-store';
export interface MaintainedMemory extends V1Record {kind:'memory';profileId:'me';text:string|null;category:string;source:string|null;nextReviewAt:string|null;confirmedAt:string|null;history:{at:string;event:string;actorId:string}[];mergeSources?:{id:string;revision:number}[];mergedInto?:string|null;lastReviewedAt?:string}
export interface MemoryWorkbench {actorId:string;checkedAt:string;records:MaintainedMemory[];dueIds:string[];lineages:{ids:string[];version:string}[];pairs:{leftId:string;rightId:string;reason:string;sharedFragments:string[];score:number}[];totalPairs:number;comparison:'literal-fragments';notice:string}
export interface MaintenanceIntent {actorId:string;operation:'merge'|'review'|'forget';body:{commandId:string;expectedVersion:number;scope:'private';payload:Record<string,unknown>}}
export function memoryMaintenanceIntent(actorId:string,operation:MaintenanceIntent['operation'],expectedVersion:number,payload:Record<string,unknown>):MaintenanceIntent{return {actorId,operation,body:{commandId:crypto.randomUUID(),expectedVersion,scope:'private',payload:structuredClone(payload)}}}
export async function readMemoryWorkbench(actorId:string,signal:AbortSignal){const result=await v1Request<MemoryWorkbench>('/api/runtime/memory/workbench',{signal});if(result.actorId!==actorId)throw new V1Error('登录身份已变化，请重新打开本人记忆。',403,'IDENTITY_CHANGED');return result;}
/** Retry this immutable intent after an unknown result; never create a replacement command ID. */
export async function submitMemoryMaintenance(intent:MaintenanceIntent,signal:AbortSignal){const result=await v1Request<{data:MaintainedMemory}>('/api/runtime/memory/maintenance/'+intent.operation,{method:'POST',body:JSON.stringify(intent.body),signal});if(result.data.ownerId!==intent.actorId)throw new V1Error('登录身份已变化，请重新打开本人记忆。',403,'IDENTITY_CHANGED');return result;}
export const unknownMaintenanceResult=(error:unknown)=>!(error instanceof V1Error)||error.status>=500;

const PENDING_PREFIX='jarvis-memory-maintenance-pending-v1:';
// The suffix is the shared login epoch; the numeric prefix is process-local and resets on reload.
function sharedLoginEpoch(){const marker=materialSessionGeneration(),separator=marker.indexOf(':');const epoch=marker.slice(separator+1);if(separator<0||epoch==='storage-unavailable')throw new Error('无法核对本浏览器登录会话，尚未提交。');return epoch;}
const pendingKey=(actorId:string)=>PENDING_PREFIX+encodeURIComponent(actorId);
export function clearStoredMemoryMaintenance(){let cleared=true;try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith(PENDING_PREFIX))sessionStorage.removeItem(key)}}catch{cleared=false}return cleared;}
export function readStoredMemoryMaintenance(actorId:string):MaintenanceIntent|null{
 const key=pendingKey(actorId),raw=sessionStorage.getItem(key);if(!raw)return null;
 try{const saved=JSON.parse(raw),intent=saved.intent as MaintenanceIntent;if(raw.length>20000||saved.session!==sharedLoginEpoch()||intent?.actorId!==actorId||!['merge','review','forget'].includes(intent.operation)||intent.body?.scope!=='private'||typeof intent.body.commandId!=='string'||!intent.body.commandId||!Number.isInteger(intent.body.expectedVersion)||intent.body.expectedVersion<1||!intent.body.payload||typeof intent.body.payload!=='object'||Array.isArray(intent.body.payload))throw new Error('expired pending');return structuredClone(intent)}catch{sessionStorage.removeItem(key);return null;}
}
export function storeMemoryMaintenance(intent:MaintenanceIntent){
 const previous=readStoredMemoryMaintenance(intent.actorId);if(previous&&JSON.stringify(previous)!==JSON.stringify(intent))throw new Error('请先确认上一项操作的结果。');
 const key=pendingKey(intent.actorId),value=JSON.stringify({session:sharedLoginEpoch(),intent});sessionStorage.setItem(key,value);if(sessionStorage.getItem(key)!==value)throw new Error('无法保留本次提交编号，尚未提交。');
}
export function finishStoredMemoryMaintenance(intent:MaintenanceIntent){const saved=readStoredMemoryMaintenance(intent.actorId);if(saved?.body.commandId===intent.body.commandId)sessionStorage.removeItem(pendingKey(intent.actorId));}
globalThis.window?.addEventListener('jarvis:inbox-materials-invalidated',()=>{clearStoredMemoryMaintenance()});

export function prepareMemoryMaintenance(actorId:string,operation:MaintenanceIntent['operation'],expectedVersion:number,payload:Record<string,unknown>){const intent=memoryMaintenanceIntent(actorId,operation,expectedVersion,payload);storeMemoryMaintenance(intent);return intent;}
