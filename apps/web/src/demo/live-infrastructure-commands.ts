import {V1Error,v1Command,type V1CollectionDomain,type V1Record,type V1Scope} from '../v1-client';
import type {DemoData} from './types';
import {projectFreshTelemetry} from './metric-freshness';
type P=Record<string,any>;
type Operation={domain:V1CollectionDomain;command:string;body:P;scope:V1Scope;version:number};
const pending=new Map<string,{id:string;promise?:Promise<unknown>}>();
export const clearLiveInfrastructureSession=()=>pending.clear();
const stable=(v:unknown)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const pick=(p:P,keys:string[]):P=>Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
const optional=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():undefined;
const strings=(v:unknown)=>Array.isArray(v)?v.map(String):String(v||'').split(/[\n，,]/).map(s=>s.trim()).filter(Boolean);
const unavailable=(label:string):never=>{throw new V1Error(label+'尚未接入；未执行远程操作。',503,'NOT_CONFIGURED')};
export function translateInfrastructure(action:string,payload:P,data:DemoData,records:Partial<Record<V1CollectionDomain,V1Record[]>>):Operation {
 const p: P=payload.patch&&typeof payload.patch==='object'?payload.patch:payload;
 let domain:V1CollectionDomain='machines',command=String(payload.command||''),body:P={},id=String(payload.id||''),scope:V1Scope='personal',version=payload.expectedVersion??0;
 if(action==='op.device'){
  domain='machines';command=command==='create'?'register':command;
  if(['register','update'].includes(command))body={...(id?{machineId:id}:{}),name:p.name,role:p.role,category:p.category||p.kind,...pick(p,['cpu','ram','disk','gpu','os','address','room','always','readOnly'])};
  else if(['heartbeat','agent-status'].includes(command))body={machineId:id,source:'manual',...pick(p,['status','evidence','observedAt','cpuPercent','memoryPercent','gpuPercent'])};
  else if(command==='resource-rule')body={machineId:id,...pick(p,['cpuLimit','memoryReserveGB','concurrency','quiet','enabled'])};
  else if(['wake','sleep'].includes(command))body={machineId:id,...(command==='sleep'?{confirm:p.confirm===true}:{})};else unavailable('远程设备刷新或故障模拟');
 }else if(action==='op.service'){
  domain='services';command=command==='create'?'register':command;
  if(['register','update'].includes(command))body={...(id?{serviceId:id}:{}),name:p.name,description:p.description??p.desc,machineId:p.machineId??p.host,...(optional(p.projectId??p.project)?{projectId:p.projectId??p.project}:{}),...pick(p,['environment','version','method','entry','healthPath'])};
  else if(command==='health')body=p.source==='probe'||p.source==='auto'?{serviceId:id,source:p.source}:{serviceId:id,source:'manual',...pick(p,['health','evidence','observedAt'])};
  else if(command==='release')body={serviceId:id,releaseId:p.releaseId};else unavailable('网络健康探测或服务控制');
 }else if(action==='op.deployment'){
  const deployment=records.operations?.find(r=>r.id===id);
  domain='services';
  if(command==='request'){command='request-deployment';id=String(p.serviceId);body=pick(p,['serviceId','releaseId','version','environment','backupId','rollback','reason']);}
  else if(['approve','reject'].includes(command)){domain='approvals';const approval=records.approvals?.find(r=>r.id===deployment?.approvalId);if(!approval)throw new V1Error('关联审批不可访问。',404,'NOT_FOUND');id=approval.id;version=payload.approvalVersion??approval.revision;body={approvalId:id,decision:command,reason:p.reason,...(p.confirmTitle?{confirmTitle:p.confirmTitle}:{})};command='decide';}
  else if(command==='verify')body={deploymentId:id,source:'manual',outcome:payload.outcome??p.outcome,...pick(p,['executionReceipt','evidence','observedVersion','observedAt']),tests:strings(p.tests)};
  else if(command==='execute'||command==='restore')body={deploymentId:id};else unavailable('远程恢复验证');
  if(deployment&&command==='verify'){scope=deployment.scope;version=payload.expectedVersion??deployment.revision;}
 }else if(action==='op.approval'){
  domain='approvals';if(!['approve','reject','decide'].includes(command))unavailable('审批后的远程执行');body={approvalId:id,decision:command==='decide'?p.decision:command,reason:p.reason??payload.reason,...(optional(p.confirmTitle??payload.confirmTitle)?{confirmTitle:p.confirmTitle??payload.confirmTitle}:{})};command='decide';
 }else if(['op.policy','op.backup','op.metering','op.power'].includes(action)){
  domain='operations';
  if(action==='op.policy'){command=command||'resource-policy';if(command==='budget')body=pick(p,['dailyBudget','retryLimit','stopOnBudget','note']);else if(command==='resource-policy')body=pick(p,['humanReserve','voiceReserve','batchLimit','quiet','autotest','autoWake','supervise','emergency']);else unavailable('此运行策略');id=String(payload.id||records.operations?.find(r=>r.kind===command)?.id||'');}
  else if(action==='op.backup'){command=command==='create'?'backup':command==='verify'?'restore-drill':command;if(command==='backup')body={source:'manual',...pick(p,['machineId','target','snapshot','locator','checksum','evidence','observedAt'])};else if(command==='restore-drill')body={backupId:id,source:'manual',isolated:true,...pick(p,['restoreTarget','outcome','executionReceipt','evidence','observedAt']),tests:strings(p.tests)};else unavailable('自动文件备份与恢复');}
  else if(action==='op.metering'){command='metering';body={source:'manual',...pick(p,['provider','amount','currency','periodStart','periodEnd','evidence']),...(optional(p.taskId)?{taskId:p.taskId}:{})};}
  else {command='power';body={source:'manual',...pick(p,['machineId','watts','observedAt','evidence'])};}
 }else unavailable('此基础设施操作');
 const record=id?records[domain]?.find(r=>r.id===id):undefined;
 scope=(payload.recordScope??record?.scope??p.scope??scope)as V1Scope;
 if(!['personal','private','family','company'].includes(scope))throw new V1Error('记录范围无效。',400,'VALIDATION');
 if(payload.expectedVersion===undefined&&record)version=record.revision;
 if(!Number.isInteger(version)||version<0)throw new V1Error('修订版本无效，请重新打开表单。',400,'VALIDATION');
 return {domain,command,body,scope,version};
}
export async function executeLiveInfrastructure(action:string,payload:P,data:DemoData,records:Partial<Record<V1CollectionDomain,V1Record[]>>):Promise<unknown>{
 const op=translateInfrastructure(action,payload,data,records),key=stable(op);let entry=pending.get(key);if(entry?.promise)return entry.promise;if(!entry){entry={id:crypto.randomUUID()};pending.set(key,entry)}
 const id=entry.id;const promise=v1Command(op.domain,op.command,op.body,op.scope,op.version,id).then(r=>{pending.delete(key);return r}).catch(e=>{const current=pending.get(key);if(current?.id===id)current.promise=undefined;throw e});entry.promise=promise;return promise;
}

/** Compatibility projection of saved records; external reports never become agent telemetry. */
export function projectInfrastructure(records:Partial<Record<V1CollectionDomain,V1Record[]>>,_bootstrap?:unknown):{machines:P[];services:P[];deployments:P[];approvals:P[];backups:P[];records:P[];policy:P;budget:P|null;metering:P[];power:P[]}{
 const operations=(records.operations||[]) as P[];
 const machines=((records.machines||[]) as P[]).map(r=>{const now=Date.now(),heartbeat=r.lastSeen?Date.parse(String(r.lastSeen)):NaN,fresh=r.agentStatus==='connected'&&Number.isFinite(heartbeat)&&heartbeat<=now+10_000&&now-heartbeat<60_000,telemetry=projectFreshTelemetry(r.telemetry,now),hasMetrics=Object.keys(telemetry||{}).some(k=>['diskPercent','diskFreeGB','diskTotalGB','cpuPercent','memoryPercent','memoryUsedGB','memoryTotalGB','load1','uptimeSec','gpuPercent','powerWatts','cpuPower','storage'].includes(k));return {...r,telemetry,kind:r.category,status:fresh?'online':'unknown',agentStatus:fresh?'connected':r.agentStatus==='connected'?'stale':r.agentStatus,last:r.lastSeen?`${r.lastSeen} · ${fresh?'节点签名心跳':'心跳已过期'}`:r.observation?`${r.observation.observedAt} · 人工观察待核验`:'尚未连接',metricsSource:hasMetrics?'已配对节点签名遥测':r.agentStatus==='connected'?'心跳仍新鲜；指标未采样或采样已过期':r.observation?'管理员人工观察（未经 Agent 核验）':'登记资料；Agent 尚未连接',cpuUse:telemetry?.cpuPercent,ramUse:telemetry?.memoryPercent,gpuUse:undefined,watts:undefined};});
 const services=((records.services||[]) as P[]).map(r=>({...r,desc:r.description,host:r.machineId,project:r.projectId,readonly:false,health:r.healthObservation?.source==='network-probe'?r.health:'unknown',last:r.healthObservation?.source==='network-probe'?`${r.healthObservation.observedAt} · 实际网络检查`:r.healthObservation?`${r.healthObservation.observedAt} · 人工报告待核验`:'未探测',uptime:'未测量',processFresh:r.processObservation?.source==='signed-agent-systemd'&&Date.now()-Date.parse(r.processObservation.observedAt)<60000,logs:r.events||[]}));
 const backups:P[]=operations.filter(r=>r.kind==='backup').map(r=>({...r,status:'registered',time:r.observedAt,restoreTarget:r.restoration?.restoreTarget,tests:r.restoration?.tests||[],events:[r.notice||(r.verification==='hash-verified-copy'?'真实文件复制与逐项 SHA256 校验':r.verification==='sqlite-online-backup'?'数据库一致性快照与完整性校验':'仅登记外部备份凭证'),...(r.restoration?[`${r.restoration.observedAt} ${r.restoration.verification==='hash-verified-isolated-restore'?'实际哈希验证':'人工隔离演练'}：${r.restoration.outcome}`]:[])]}));
 const deployments=operations.filter(r=>r.kind==='deployment').map(r=>({...r,service:r.serviceId,release:r.releaseId,host:r.machineId,project:r.projectId,approval:r.approvalId,snapshot:backups.find(b=>b.id===r.backupId)?.snapshot||r.backupId,time:r.createdAt,tests:r.verificationRecord?.tests||[]}));
 const approvals=((records.approvals||[]) as P[]).map(r=>({...r,deployment:r.deploymentId,backup:backups.find(b=>b.id===r.backupId)?.snapshot||r.backupId,time:r.createdAt,receipt:r.decision?`${r.decision.at} ${r.decision.actorId} ${r.decision.choice}；仅限本申请，未执行远程操作。`:''}));
 return {machines,services,deployments,approvals,backups,records:operations,policy:operations.find(r=>r.kind==='resource-policy')||{},budget:operations.find(r=>r.kind==='budget')||null,metering:operations.filter(r=>r.kind==='metering'),power:operations.filter(r=>r.kind==='power')};
}
