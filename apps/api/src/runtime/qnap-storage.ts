import {z} from 'zod';
import {BusinessError} from '../v1/types.js';

const capacity=z.number().finite().min(0).max(100_000_000);
const volume=z.object({id:z.number().int().min(1).max(128),mount:z.string().regex(/^\/share\/CACHEDEV[1-9][0-9]*_DATA$/),totalGB:capacity.positive(),usedGB:capacity,freeGB:capacity}).strict().superRefine((v,c)=>{if(v.usedGB+v.freeGB>v.totalGB+.02)c.addIssue({code:'custom',message:'卷容量不一致'});if(v.mount!==`/share/CACHEDEV${v.id}_DATA`)c.addIssue({code:'custom',message:'卷编号与挂载路径不一致'});});
const disk=z.object({slot:z.number().int().min(1).max(128),model:z.string().trim().min(1).max(180),type:z.enum(['ssd','hdd']),capacityGB:capacity.positive()}).strict();
const enclosure=z.number().int().min(0).max(255),slot=z.number().int().min(1).max(128),time=z.string().datetime({offset:true});
const smart=z.object({state:z.enum(['attributes-ok','warning','unsupported','unknown']),source:z.literal('qts-smart-cache'),temperatureC:z.number().min(0).max(120).nullable(),observedAt:time.nullable(),attributes:z.array(z.object({id:z.number().int().min(1).max(255),value:z.number().int().min(0).max(255),worst:z.number().int().min(0).max(255),threshold:z.number().int().min(0).max(255),raw:z.string().regex(/^\d{1,20}$/),flag:z.number().int().min(0).max(255)}).strict()).max(64)}).strict();
const externalVolume=z.object({id:z.string().min(1).max(128),mount:z.string().regex(/^\/share\/external\/DEV\d{4}_\d+$/),device:z.string().regex(/^\/dev\/sd[a-z]+\d+$/),filesystem:z.string().min(1).max(32),enclosure,slot,totalGB:capacity.positive(),usedGB:capacity,freeGB:capacity}).strict().superRefine((v,c)=>{if(v.usedGB+v.freeGB>v.totalGB+.02)c.addIssue({code:'custom',message:'扩展卷容量不一致'});const match=v.mount.match(/DEV(\d{2})(\d{2})_(\d+)$/);if(!match||v.enclosure!==Number(match[1])||v.slot!==Number(match[2])||v.id!==`external-${v.enclosure}-${v.slot}-${match[3]}`)c.addIssue({code:'custom',message:'扩展卷绑定不一致'});});
const externalDisk=disk.extend({enclosure,device:z.string().regex(/^\/dev\/sd[a-z]+$/),health:smart}).strict();
const diskHealth=smart.extend({enclosure,slot}).strict();
const backups=z.object({state:z.enum(['available','unavailable']),source:z.literal('hbs-config-db'),jobs:z.array(z.object({id:z.string().min(1).max(128),name:z.string().min(1).max(200),state:z.enum(['running','succeeded','failed','stopped','scheduled','unknown']),enabled:z.boolean().nullable()}).strict()).max(100)}).strict();
const snapshots=z.object({state:z.enum(['available','unavailable']),source:z.literal('qts-snapshot-config'),count:z.number().int().min(0).max(1000000),schedules:z.array(z.object({volumeId:z.number().int().min(1).max(128),enabled:z.boolean(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()}).strict()).max(128)}).strict();
const nullableNumber=(max:number)=>z.number().min(0).max(max).nullable();
const ups=z.object({state:z.enum(['connected','not-connected','unavailable']),source:z.literal('nut-upsc'),model:z.string().max(180).optional(),manufacturer:z.string().max(100).optional(),mode:z.enum(['mains','battery','unknown']).optional(),lowBattery:z.boolean().optional(),batteryPercent:nullableNumber(100).optional(),runtimeSec:nullableNumber(1000000).optional(),loadPercent:nullableNumber(200).optional(),inputVoltage:nullableNumber(1000).optional(),testResult:z.string().max(100).optional(),protection:z.object({enabled:z.boolean(),mode:z.string().max(40),delayMinutes:z.number().min(0).max(10080),networkServer:z.boolean()}).strict().optional()}).strict().superRefine((u,c)=>{if(u.state==='connected'&&(!u.mode||!u.model||!u.protection))c.addIssue({code:'custom',message:'UPS连接信息不完整'});});
export const qnapStorageSample=z.object({kind:z.literal('qnap'),model:z.string().min(1).max(100),systemVersion:z.string().regex(/^\d+\.\d+\.\d+(?:\.\d+)?$/),build:z.string().regex(/^\d{8}$/),volumes:z.array(volume).min(1).max(32),disks:z.array(disk).max(32),observedAt:time,protectionObservedAt:time.optional(),externalVolumes:z.array(externalVolume).max(32).optional(),externalDisks:z.array(externalDisk).max(32).optional(),diskHealth:z.array(diskHealth).max(32).optional(),backups:backups.optional(),snapshots:snapshots.optional(),ups:ups.optional(),collectionErrors:z.array(z.enum(['external-unavailable','backups-unavailable','snapshots-unavailable','ups-unavailable','protection-unavailable'])).max(5).optional()}).strict().superRefine((s,c)=>{
 const duplicate=<T>(items:T[],key:(v:T)=>string|number)=>new Set(items.map(key)).size!==items.length;
 if(duplicate(s.volumes,v=>v.id)||duplicate(s.disks,d=>d.slot)||duplicate(s.externalVolumes??[],v=>v.id)||duplicate(s.externalDisks??[],d=>`${d.enclosure}-${d.slot}`)||duplicate(s.diskHealth??[],d=>`${d.enclosure}-${d.slot}`)||duplicate(s.backups?.jobs??[],j=>j.id)||duplicate(s.snapshots?.schedules??[],j=>j.volumeId))c.addIssue({code:'custom',message:'存储编号重复'});
 if(s.externalVolumes?.some(v=>!s.externalDisks?.some(d=>d.enclosure===v.enclosure&&d.slot===v.slot&&v.device.startsWith(d.device)&&/^\d+$/.test(v.device.slice(d.device.length)))))c.addIssue({code:'custom',message:'扩展卷未绑定真实磁盘'});
 if(s.diskHealth?.some(h=>h.enclosure!==0||!s.disks.some(d=>d.slot===h.slot)))c.addIssue({code:'custom',message:'SMART未绑定内置磁盘'});
});
/** NAS capacity uses only data volumes, never QTS RAM/system/overlay filesystems. */
export function qnapStorageReading(machine:Record<string,any>|undefined,capabilities:string[],raw:unknown,time=Date.now()){
 if(raw===undefined)return undefined;
 const deny=(message:string):never=>{throw new BusinessError('VALIDATION',message,400);};
 if(machine?.category!=='storage'||!capabilities.includes('telemetry'))deny('NAS读数需要绑定存储设备的遥测权限');
 const value=qnapStorageSample.parse(raw),measured=Date.parse(value.observedAt);
 if(Math.abs(time-measured)>60_000)deny('NAS存储读数已过期');
 const total=value.volumes.reduce((n,v)=>n+v.totalGB,0),free=value.volumes.reduce((n,v)=>n+v.freeGB,0),used=value.volumes.reduce((n,v)=>n+v.usedGB,0);
 const round=(n:number)=>Math.round(n*1000)/1000;
 const age=value.protectionObservedAt?time-Date.parse(value.protectionObservedAt):Infinity;
 if(age< -10000)deny('NAS保护读数时间异常');
 const protectionState=Number.isFinite(age)?age<=180000?'fresh':'stale':'unavailable';
 const alerts:{code:string;severity:'warning'|'critical';target:string;message:string}[]=[];
 for(const v of [...value.volumes,...(protectionState==='fresh'?value.externalVolumes??[]:[])]){const percent=v.usedGB/v.totalGB*100;if(percent>=85)alerts.push({code:'volume-capacity',severity:percent>=95?'critical':'warning',target:v.mount,message:`${v.mount.includes('/external/')?'扩展盘':'数据卷'}已用 ${round(percent)}%，可用 ${round(v.freeGB)} GiB`});}
 if(protectionState==='fresh'){
  for(const h of value.diskHealth??[]){if(!h.observedAt||Math.abs(time-Date.parse(h.observedAt))>1800000)continue;if(h.state==='warning')alerts.push({code:'smart-attributes',severity:'warning',target:`internal-${h.slot}`,message:`内置盘 ${h.slot} 出现 SMART 属性告警`});if(h.temperatureC!==null&&h.temperatureC>=60)alerts.push({code:'disk-temperature',severity:h.temperatureC>=65?'critical':'warning',target:`internal-${h.slot}`,message:`内置盘 ${h.slot} 温度 ${h.temperatureC}℃`});}
  if(value.ups?.state==='connected'&&(value.ups.mode==='battery'||value.ups.lowBattery))alerts.push({code:'ups-power',severity:value.ups.lowBattery?'critical':'warning',target:'ups',message:value.ups.lowBattery?'UPS 电池电量不足':'UPS 正在使用电池供电'});
  for(const j of value.backups?.jobs??[])if(j.state==='failed')alerts.push({code:'backup-job',severity:'warning',target:j.id,message:`备份任务 ${j.name} 失败`});
 }
 // Display precision must not turn a valid positive capacity into an invalid zero.
 // The accepted filesystem rounding tolerance may slightly exceed total; clamp only
 // the derived percentage, retaining every original signed used/free measurement.
 return {...value,source:'signed-agent-qnap',capacityScope:'data-volumes',protectionState,alerts,metrics:{diskTotalGB:round(total)||total,diskFreeGB:round(free),diskPercent:round(Math.min(100,used/total*100))}};
}
