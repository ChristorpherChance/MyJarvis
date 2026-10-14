import { v1Command, V1Error, type V1CollectionDomain, type V1Record, type V1Scope } from '../v1-client';
type Values=Record<string,any>;
const pending=new Map<string,{id:string;promise?:Promise<unknown>}>();
export const clearLivePlatformSession=()=>pending.clear();
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export function executeLivePlatform(action:string,p:Values,records:Partial<Record<V1CollectionDomain,V1Record[]>>):Promise<unknown>{
 let domain:V1CollectionDomain='settings',command='',body:Values={},scope:V1Scope='personal',version=0;
 if(action==='platform.policy'){const old=records.settings?.find(r=>r.kind==='policy');command='policy';version=p.expectedVersion??old?.revision??0;body=Object.fromEntries(['supervise','autoWake','emergency','dailyBudget','retryLimit'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));}
 else if(action==='platform.terminal'){command='terminal';version=p.expectedVersion??0;body=Object.fromEntries(['terminalId','operation','name','roomId','machineId','profileId','enabled'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));}
 else if(action==='pi.job'){domain='jobs';command=p.command||'create';const current=command==='cancel'?records.jobs?.find(j=>j.id===p.jobId):undefined;const source=command==='create'&&p.sourceId?records[p.kind==='knowledge'?'books':p.kind==='research'?'research':'voice']?.find(r=>r.id===p.sourceId):undefined;if(command==='create'&&p.sourceId&&!source)throw new V1Error('来源记录不存在，请刷新后重试',404,'VALIDATION');scope=(current?.scope||source?.scope||'personal') as V1Scope;version=command==='cancel'?p.expectedVersion??current?.revision??0:0;body=command==='cancel'?{jobId:p.jobId}:{kind:p.kind,title:p.title,instruction:p.instruction,...(source?{sourceId:source.id,sourceVersion:p.sourceVersion??source.revision}:{})};}
 else if(action.startsWith('voice.')){domain='voice';command=action.slice(6);const current=p.sessionId?records.voice?.find(r=>r.id===p.sessionId):undefined;scope=(current?.scope||'personal') as V1Scope;version=p.expectedVersion??current?.revision??0;body=Object.fromEntries(Object.entries(p).filter(([k])=>!['expectedVersion','scope'].includes(k)));}
 else throw new V1Error('后台操作尚未接入',503,'NOT_CONFIGURED');
 const key=stable({domain,command,body,scope,version});const existing=pending.get(key);if(existing?.promise)return existing.promise;
 const entry=existing||{id:crypto.randomUUID()};pending.set(key,entry);
 const promise=v1Command(domain,command,body,scope,version,entry.id).then(result=>{pending.delete(key);return result}).catch(error=>{entry.promise=undefined;throw error});entry.promise=promise;return promise;
}
