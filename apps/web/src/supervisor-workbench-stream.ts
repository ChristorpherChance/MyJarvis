export type SupervisorConnection='connecting'|'live'|'reconnecting'|'closed';
/** Existing project supervisor SSE, metadata only. It can request reads, never commands. */
export function subscribeWorkbenchSupervisor(projectId:string,onChange:()=>void,onState:(state:SupervisorConnection)=>void,onExpired:()=>void){
 const source=new EventSource(`/api/v1/projects/${encodeURIComponent(projectId)}/supervisor/events`,{withCredentials:true});
 let closed=false,last=-1,state:SupervisorConnection='connecting';
 const set=(next:SupervisorConnection)=>{if(!closed&&state!==next){state=next;onState(next);}};
 onState(state);
 source.addEventListener('open',()=>set('live'));
 source.addEventListener('supervisor.changed',message=>{if(closed)return;try{const value=JSON.parse((message as MessageEvent).data);if(value.projectId!==projectId||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision<=last)return;last=value.revision;set('live');onChange();}catch{/* Malformed metadata is not authority; the existing read fallback remains available. */}});
 source.onerror=()=>set(source.readyState===2?'closed':'reconnecting');
 source.addEventListener('session-expired',()=>{if(closed)return;set('closed');closed=true;source.close();onExpired();});
 return()=>{if(closed)return;closed=true;source.close();};
}
