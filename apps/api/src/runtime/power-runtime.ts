import type {DatabaseSync} from 'node:sqlite';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {defineTool,type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import {BusinessError} from '../v1/types.js';

const profile=z.object({machineId:z.string().uuid(),cpuModel:z.string().min(1).max(100),tdpWatts:z.number().min(5).max(500),dimmCount:z.number().int().min(1).max(32),ssdCount:z.number().int().min(0).max(32),hddCount:z.number().int().min(0).max(32),evidence:z.string().min(1).max(1000)}).strict();
export type PowerProfile=z.infer<typeof profile>;
const initial:PowerProfile[]=[
 {machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',cpuModel:'i5-7400',tdpWatts:65,dimmCount:4,ssdCount:1,hddCount:0,evidence:'2026-10-08 SSH 核验：4×8GB DDR4、Micron NVMe、HD630核显'},
 {machineId:'fd4b32f6-2fc7-409e-a8d3-3774035181e6',cpuModel:'i7-7700',tdpWatts:65,dimmCount:4,ssdCount:1,hddCount:0,evidence:'2026-10-08 SSH 核验：8+16+8+16GB DDR4、KINGBANK SATA SSD、HD630核显'},
 {machineId:'ab2acde7-b833-4d26-a2ed-292397008b11',cpuModel:'i5-6400',tdpWatts:65,dimmCount:1,ssdCount:1,hddCount:0,evidence:'2026-10-08 SSH 核验：1×16GB DDR4、KINGBANK SATA SSD、HD530核显'},
];
const round=(n:number)=>Math.round(n*10)/10;
export const cpuPowerSample=z.object({source:z.literal('intel-rapl'),watts:z.number().min(0).max(1000),observedAt:z.string().datetime({offset:true}),windowSeconds:z.number().min(1).max(60)}).strict();
export type CpuPowerSample=z.infer<typeof cpuPowerSample>;
export function localPhysical(machine:any){const address=String(machine?.address??'');return machine?.scope==='personal'&&!machine.readOnly&&!/云|cloud/i.test(String(machine.room??'')+' '+String(machine.name??''))&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);}
export function estimatePower(machine:any,hardware:PowerProfile|undefined,now=Date.now()){
 const base={machineId:machine.id,name:machine.name,scope:'whole-computer-estimate',includes:'主机机箱及电源损耗；不含显示器、交换机与外接设备',profile:hardware??null};
 if(!localPhysical(machine))return {...base,status:'excluded',reason:'云服务器或非本地个人设备',estimate:null,cpuPackage:null};
 if(!hardware||!String(machine.cpu).includes(hardware.cpuModel))return {...base,status:'unconfigured',reason:'硬件清单待核实',estimate:null,cpuPackage:null};
 const metrics=machine.telemetry??{},age=now-Date.parse(metrics.observedAt??machine.lastSeen);
 if(machine.agentStatus!=='connected'||metrics.source!=='signed-agent'||!Number.isFinite(age)||age< -10000||age>=60000)return {...base,status:'unknown',reason:'节点读数已过期；不能当作零功耗',estimate:null,cpuPackage:null};
 const cpuAge=now-Date.parse(metrics.cpuPower?.observedAt),raw=metrics.cpuPower?.watts;
 const measured=typeof raw==='number'&&Number.isFinite(raw)&&raw>=0&&raw<=1000&&cpuAge>= -10000&&cpuAge<30000&&metrics.cpuPower?.source==='intel-rapl';
 const load=metrics.cpuPercent;
 if(!measured&&!(typeof load==='number'&&Number.isFinite(load)&&load>=0&&load<=100))return {...base,status:'unknown',reason:'CPU采样缺失',estimate:null,cpuPackage:null};
 // Conservative engineering assumptions, not HP specifications or a wall meter.
 // Package/core counters overlap: only the package total is used, never their sum.
 const cpuLow=measured?raw*.8:3+hardware.tdpWatts*.5*load/100,cpuHigh=measured?raw*1.2:8+hardware.tdpWatts*1.1*load/100;
 const minimum=round((cpuLow+8+hardware.dimmCount*1.5+hardware.ssdCount*.5+hardware.hddCount*3)/.9);
 const maximum=round((cpuHigh+18+hardware.dimmCount*3.5+hardware.ssdCount*4+hardware.hddCount*8)/.72);
 return {...base,status:'estimated',reason:'未接插座电表，整机值为粗估范围',cpuPackage:measured?{watts:raw,observedAt:metrics.cpuPower.observedAt,windowSeconds:metrics.cpuPower.windowSeconds,source:'intel-rapl',scope:'cpu-package-only'}:null,
 estimate:{minimumWatts:minimum,maximumWatts:maximum,indicativeWatts:round((minimum+maximum)/2),method:measured?'rapl-plus-components':'cpu-load-plus-components',confidence:'low',observedAt:metrics.observedAt,assumptions:{boardAndFansWatts:[8,18],dimmWatts:[1.5,3.5],ssdWatts:[.5,4],hddWatts:[3,8],psuEfficiency:[.72,.9]},projection30Days:{minimumKWh:round(minimum*.72),maximumKWh:round(maximum*.72),assumption:'连续30天、每天24小时，且维持当前负载；并非实际累计电量'}}};
}
export class PowerRuntime{
 constructor(private db:DatabaseSync,private machines:()=>any[]){db.exec('CREATE TABLE IF NOT EXISTS runtime_power_config(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,json TEXT NOT NULL)');if(!db.prepare('SELECT id FROM runtime_power_config').get())db.prepare('INSERT INTO runtime_power_config VALUES(1,0,?)').run(JSON.stringify(initial.filter(p=>machines().some(m=>m.id===p.machineId))));}
 configuration(){const row=this.db.prepare('SELECT version,json FROM runtime_power_config WHERE id=1').get()!;return {version:Number(row.version),profiles:JSON.parse(String(row.json)) as PowerProfile[]};}
 accept(agent:{machineId:string;capabilities?:string[]},raw:unknown):CpuPowerSample|undefined{if(raw===undefined)return;const sample=cpuPowerSample.parse(raw),machine=this.machines().find(m=>m.id===agent.machineId),p=this.configuration().profiles.find(p=>p.machineId===agent.machineId);if(!machine||!localPhysical(machine)||!p||!String(machine.cpu).includes(p.cpuModel))return;const age=Date.now()-Date.parse(sample.observedAt);if(!agent.capabilities?.includes('telemetry')||age< -10000||age>30000)throw new BusinessError('VALIDATION','CPU能耗来源未授权或采样已过期',400);return sample;}
 configure(raw:unknown){const value=z.object({expectedVersion:z.number().int().min(0),profiles:z.array(profile).max(100)}).strict().parse(raw);if(new Set(value.profiles.map(p=>p.machineId)).size!==value.profiles.length)throw new BusinessError('VALIDATION','设备配置重复',400);for(const p of value.profiles){const m=this.machines().find(m=>m.id===p.machineId);if(!m||!localPhysical(m)||!String(m.cpu).includes(p.cpuModel))throw new BusinessError('VALIDATION','仅配置已核实的本地物理服务器，CPU型号须一致',400);}const result=this.db.prepare('UPDATE runtime_power_config SET json=?,version=version+1 WHERE id=1 AND version=?').run(JSON.stringify(value.profiles),value.expectedVersion);if(!result.changes)throw new BusinessError('CONFLICT','功耗清单已变化，请刷新',409);return this.configuration();}
 summary(){const config=this.configuration(),nodes=this.machines().map(m=>estimatePower(m,config.profiles.find(p=>p.machineId===m.id))),eligible=nodes.filter(n=>n.status!=='excluded'),ready=eligible.filter(n=>n.status==='estimated');return {at:new Date().toISOString(),nodes,total:ready.length===eligible.length&&ready.length?{minimumWatts:round(ready.reduce((s,n)=>s+n.estimate!.minimumWatts,0)),maximumWatts:round(ready.reduce((s,n)=>s+n.estimate!.maximumWatts,0)),projection30Days:{minimumKWh:round(ready.reduce((s,n)=>s+n.estimate!.minimumWatts,0)*.72),maximumKWh:round(ready.reduce((s,n)=>s+n.estimate!.maximumWatts,0)*.72)}}:null,estimatedNodes:ready.length,localNodes:eligible.length,excludedNodes:nodes.length-eligible.length,note:'整机为估算，CPU为芯片能耗计数器推算。电量按当前负载连续运行推演，非累计实测；离线不按零计。'};}
}
export function registerPowerRoutes(app:FastifyInstance,power:PowerRuntime){app.get('/api/runtime/power',async()=>power.summary());app.get('/api/runtime/power/profiles',async()=>power.configuration());app.put('/api/runtime/power/profiles',async req=>power.configure(req.body));}
export function createPowerTool(power:PowerRuntime,authorized:()=>boolean):ToolDefinition{return defineTool({name:'jarvis_power',label:'本地功耗',description:'查询本地物理服务器整机估算范围、CPU芯片能耗及当前负载30天电量推演；云服务器排除。估算不能当作插座实测或累计电量。',parameters:Type.Object({},{additionalProperties:false}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},execute:async()=>{if(!authorized())throw new BusinessError('FORBIDDEN','仅管理员本人可查询',403);return {content:[{type:'text',text:JSON.stringify(power.summary())}],details:{readOnly:true}};}});}
