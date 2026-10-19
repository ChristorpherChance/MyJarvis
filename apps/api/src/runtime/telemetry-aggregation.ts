import {localPhysical} from './power-runtime.js';
import {qnapStorageReading} from './qnap-storage.js';

export const telemetryMetrics=['diskPercent','diskFreeGB','diskTotalGB','cpuPercent','memoryPercent','memoryUsedGB','memoryTotalGB','load1','uptimeSec','gpuPercent','powerWatts'] as const;
export function validTelemetryMetric(key:string,value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=0&&(key==='uptimeSec'?value<=Number.MAX_SAFE_INTEGER:value<10000000)&&(!key.endsWith('Percent')||value<=100);}
type Freshness={agentId:string;observedAt:string;expiresAt:string;timeBasis:'received'|'measured'};
/** Projection only: never feed retained readings back into measurement history. */
export function aggregateTelemetry(machine:any,agents:any[],options:{at:number;hardware:(agent:any,snapshot:any)=>boolean;power?:{version:number;profiles:any[]}}){
 const output:any={source:'signed-agent',metricSources:{},metricMeasuredAt:{},metricFreshness:{}};
 const chosen=new Map<string,{time:number;agentId:string}>();
 const offer=(key:string,value:any,agentId:string,stamp:string,ttl:number,basis:Freshness['timeBasis'])=>{const time=Date.parse(stamp),age=options.at-time,old=chosen.get(key);if(!Number.isFinite(age)||age< -10000||age>=ttl||old&&(old.time>time||old.time===time&&old.agentId.localeCompare(agentId)<=0))return false;chosen.set(key,{time,agentId});output[key]=value;output.metricFreshness[key]={agentId,observedAt:stamp,expiresAt:new Date(time+ttl).toISOString(),timeBasis:basis};return true;};
 for(const agent of agents){
  if(agent.revoked||agent.machineId!==machine.id)continue;
  const s=agent.telemetry;if(!s||s.snapshotVersion!==1||s.source!=='signed-agent')continue;
  const age=options.at-Date.parse(s.observedAt);if(!Number.isFinite(age)||age< -10000||age>=60000)continue;
  let hardwareValid=false;try{hardwareValid=options.hardware(agent,s);}catch{}
  for(const key of telemetryMetrics){const value=s.metrics?.[key];if(!validTelemetryMetric(key,value))continue;const hardware=key==='gpuPercent'||key==='powerWatts';if(hardware&&!hardwareValid)continue;
   const storageMetric=s.storage&&['diskPercent','diskFreeGB','diskTotalGB'].includes(key);
   if(offer(key,value,agent.id,hardware?s.metricMeasuredAt?.[key]:storageMetric?s.storage.observedAt:s.observedAt,hardware?30000:60000,hardware||storageMetric?'measured':'received')&&hardware){output.metricSources[key]=s.metricSources[key];output.metricMeasuredAt[key]=s.metricMeasuredAt[key];}
  }
  const p=s.cpuPower,profile=options.power?.profiles.find(p=>p.machineId===machine.id);
  if(p&&agent.capabilities?.includes('telemetry')&&options.power&&s.powerVersion===options.power.version&&profile&&localPhysical(machine)&&String(machine.cpu).includes(profile.cpuModel)&&p.source==='intel-rapl'&&typeof p.watts==='number'&&p.watts>=0&&p.watts<=1000)offer('cpuPower',p,agent.id,p.observedAt,30000,'measured');
  if(s.storage){try{const {source,capacityScope,protectionState,alerts,metrics,...raw}=s.storage;const storage=qnapStorageReading(machine,agent.capabilities??[],raw,options.at);if(storage)offer('storage',storage,agent.id,storage.observedAt,60000,'measured');}catch{}}
 }
 const times=[...chosen.values()].map(v=>v.time);if(!times.length)return undefined;
 output.observedAt=new Date(Math.max(...times)).toISOString();return output;
}
