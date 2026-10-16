import {v1Request,V1Error} from '../../v1-client';

export interface MemoryQueryMatch {
  id:string;kind:'memory';text:string;category:string;source:string;revision:number;
  sourceEvidenceStatus:'current-confirmation'|'historical-before-edit';sourceEvidenceNotice?:string;
  confirmedAt?:string;nextReviewAt?:string|null;matchedField:string;quote:string;location:string;sha256:string;offset:number;score:number;
}
export interface MemoryQueryResult {actorId:string;query:string;total:number;records:MemoryQueryMatch[];retrieval:'literal-fragments';notice:string}

/** Identity comes from authentication; no actor/profile selector is sent to the server. */
export async function queryCurrentMemory(query:string,actorId:string,signal:AbortSignal):Promise<MemoryQueryResult>{
  const result=await v1Request<MemoryQueryResult>('/api/runtime/memory/query',{method:'POST',body:JSON.stringify({query,limit:50}),signal});
  if(result.actorId!==actorId)throw new V1Error('登录身份已变化，请重新打开本人的记忆。',403,'IDENTITY_CHANGED');
  return result;
}
