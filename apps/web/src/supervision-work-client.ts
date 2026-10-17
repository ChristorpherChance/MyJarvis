import {v1Request} from './v1-client';

export type SupervisionWorkStatus='planned'|'running'|'blocked'|'completed';
export interface SupervisionEvidence {path:string;sha256:string}
export interface SupervisionWorkItem {
 id:string;projectId:string;ownerId:string;revision:number;title:string;status:SupervisionWorkStatus;
 summary:string;nextAction:string;blocker:string;stepId:string|null;taskId:string|null;runId:string|null;
 completionSummary:string;validationScope:string;evidenceRefs:SupervisionEvidence[];createdAt:string;updatedAt:string;
}
export interface SupervisionWorkOverview {
 projectId:string;revision:number;latestSequence:number;items:SupervisionWorkItem[];
 counts:{total:number;planned:number;running:number;blocked:number;completed:number};itemsTruncated:boolean;executionFactsTruncated:boolean;
 executionFacts:{taskId:string;title:string;status:string;executionStatus:string;runId:string|null;runStatus:string|null;summary:string;lastActivityAt:string|null;source:'persisted-task-and-run';independentAcceptance:false}[];
 independentProgress:{automaticAcceptance:false;statement:string};
}
export interface SupervisionWorkDetail {item:SupervisionWorkItem;history:SupervisionWorkItem[];historyTruncated:boolean;evidenceVerification:'references-only'}
export type SupervisionWorkBody=Pick<SupervisionWorkItem,'title'|'status'|'summary'|'nextAction'|'blocker'|'stepId'|'taskId'|'runId'|'completionSummary'|'validationScope'|'evidenceRefs'>;
export const supervisionWorkBase=(projectId:string)=>`/api/v1/projects/${encodeURIComponent(projectId)}/supervision-work`;
export const loadSupervisionWork=(projectId:string,signal?:AbortSignal)=>v1Request<{data:SupervisionWorkOverview}>(supervisionWorkBase(projectId)+'/overview',{signal});
export const loadSupervisionWorkDetail=(projectId:string,id:string,signal?:AbortSignal)=>v1Request<{data:SupervisionWorkDetail}>(supervisionWorkBase(projectId)+'/items/'+encodeURIComponent(id),{signal});
export const saveSupervisionWork=(projectId:string,item:SupervisionWorkItem|null,body:SupervisionWorkBody,commandId:string,signal?:AbortSignal)=>v1Request<{data:SupervisionWorkItem}>(supervisionWorkBase(projectId)+'/items'+(item?'/'+encodeURIComponent(item.id)+'/revisions':''),{method:'POST',signal,body:JSON.stringify({commandId,expectedVersion:item?.revision??0,...body})});

export interface SupervisionChange {projectId:string;sequence:number;itemId:string|null;revision:number;kind:'work-item'|'execution';status:string;at:string}
export type SupervisionStreamMessage={type:'connection';state:'connecting'|'live'|'reconnecting'|'closed'}|{type:'refresh';reason:'ready'|'change'|'disconnect';change?:SupervisionChange};
type Listener=(message:SupervisionStreamMessage)=>void;
interface Connection {source:EventSource;listeners:Set<Listener>;cursor:number;state:'connecting'|'live'|'reconnecting'|'closed'}
const connections=new Map<string,Connection>();
const validSequence=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;

/** One owner stream shared by the whole platform. Panels filter project metadata locally.
 * No private state or cursor is persisted, and project count never multiplies sockets. */
export function subscribeSupervisionWork(projectId:string|null,listener:Listener):()=>void {
 const streamKey='owner';
 const registered:Listener=message=>{if(projectId!==null&&message.type==='refresh'&&message.reason==='change'&&message.change?.projectId!==projectId)return;listener(message)};
 let connection=connections.get(streamKey);
 if(!connection){
  const source=new EventSource('/api/v1/supervision-work/events?after=0');
  connection={source,listeners:new Set(),cursor:0,state:'connecting'};connections.set(streamKey,connection);
  const own=connection;
  const emit=(message:SupervisionStreamMessage)=>{if(connections.get(streamKey)!==own)return;for(const callback of [...own.listeners])callback(message)};
  source.addEventListener('ready',event=>{
   try{const data=JSON.parse((event as MessageEvent<string>).data);if(!validSequence(data.latestSequence))return;
    own.state='live';emit({type:'connection',state:'live'});emit({type:'refresh',reason:'ready'});
   }catch{/* Invalid metadata never changes the displayed facts. */}
  });
  source.addEventListener('supervision.changed',event=>{
   try{const data=JSON.parse((event as MessageEvent<string>).data) as SupervisionChange;
    if(typeof data.projectId!=='string'||!data.projectId||!validSequence(data.sequence)||data.sequence<=own.cursor||!['work-item','execution'].includes(data.kind)||!validSequence(data.revision))return;
    own.cursor=data.sequence;emit({type:'refresh',reason:'change',change:data});
   }catch{/* A reconnect ready message triggers an authoritative read. */}
  });
  source.addEventListener('session-expired',()=>{
   if(connections.get(streamKey)!==own)return;
   clearSupervisionStreams();
   globalThis.window?.dispatchEvent(new Event('jarvis:auth-required'));
  });
  source.onerror=()=>{if(own.state==='reconnecting')return;own.state='reconnecting';emit({type:'connection',state:'reconnecting'});emit({type:'refresh',reason:'disconnect'})};
 }
 connection.listeners.add(registered);listener({type:'connection',state:connection.state});
 const own=connection;
 return()=>{own.listeners.delete(registered);if(!own.listeners.size&&connections.get(streamKey)===own){own.source.close();connections.delete(streamKey)}};
}

/** Logout and cross-window identity changes stop late events immediately. */
export function clearSupervisionStreams(){const old=[...connections.values()];connections.clear();for(const connection of old){connection.source.close();for(const listener of [...connection.listeners])listener({type:'connection',state:'closed'})}}
