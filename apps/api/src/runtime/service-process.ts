import {z} from 'zod';
import {BusinessError} from '../v1/types.js';

export const serviceProcessObservation=z.object({
 serviceId:z.string().min(1).max(200),
 unit:z.string().regex(/^[A-Za-z0-9_.@-]{1,180}\.service$/),
 activeState:z.enum(['active','inactive','failed','activating','deactivating','reloading','maintenance','refreshing','unknown']),
 subState:z.string().regex(/^[a-z0-9-]{1,100}$/),
 observedAt:z.string().datetime({offset:true}),
 resources:z.object({cpuPercent:z.number().min(0).max(100).optional(),memoryUsedGB:z.number().min(0).max(100000).optional(),directory:z.string().startsWith('/').max(2000).optional(),diskUsedGB:z.number().min(0).max(1000000).optional(),diskObservedAt:z.string().datetime({offset:true}).optional()}).strict().optional(),
}).strict();

/** A running system process cannot prove that its application is healthy. */
export function validateServiceProcesses(agent:{machineId:string;capabilities?:string[]},raw:unknown,
 service:(id:string)=>any,at=Date.now()){
 if(raw===undefined)return [];
 const items=z.array(serviceProcessObservation).max(32).parse(raw);
 const deny=(message:string):never=>{throw new BusinessError('FORBIDDEN',message,403);};
 if(!agent.capabilities?.includes('service-status'))deny('节点没有服务进程观察授权');
 if(new Set(items.map(s=>s.serviceId)).size!==items.length)deny('服务进程观察不能重复');
 return items.map(input=>{
  const target=service(input.serviceId),age=at-Date.parse(input.observedAt);
  if(!target||target.machineId!==agent.machineId||target.scope==='company'||target.method!=='systemd'||target.entry!==`systemd:${input.unit}`)
   deny('服务进程观察与登记设备、单元或管理范围不一致');
  if(age < -10000||age>30000)deny('服务进程观察已过期或时钟不一致');
  if(input.resources?.diskUsedGB!==undefined&&(!input.resources.directory||input.resources.directory==='/'||!input.resources.diskObservedAt||at-Date.parse(input.resources.diskObservedAt)>7200000||at-Date.parse(input.resources.diskObservedAt)<-10000))deny('项目目录占用缺少有效来源或采样时间');
  const processStatus=input.activeState==='active'?(input.subState==='exited'?'active':input.subState==='running'?'running':'unknown'):input.activeState==='failed'?'failed':input.activeState==='inactive'?'stopped':'unknown';
  return {target,observation:{...input,processStatus,source:'signed-agent-systemd' as const,verification:'node-observed-not-application-health' as const}};
 });
}
