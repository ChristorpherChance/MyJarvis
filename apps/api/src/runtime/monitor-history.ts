import {cpus,freemem,totalmem,uptime} from 'node:os';
import type {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';

export const monitorQuery=z.object({kind:z.enum(['machine','service']),id:z.string().trim().min(1).max(200),window:z.enum(['1h','24h','7d','90d']).default('24h'),points:z.coerce.number().int().min(20).max(240).default(120)}).strict();
type Stats={sum:number;count:number;minimum:number;maximum:number};
type Metrics=Record<string,number|undefined|null>;
const fields=['diskPercent','diskFreeGB','diskTotalGB','diskUsedGB','cpuPercent','memoryPercent','memoryUsedGB','memoryTotalGB','load1','uptimeSec','latencyMs','gpuPercent','powerWatts','cpuPackageWatts'];
const windows={'1h':3600000,'24h':86400000,'7d':7*86400000,'90d':90*86400000};
const rawDays=7,aggregateDays=90;
export class MonitorHistory {
 private previous=cpus().map(c=>({...c.times}));private lastCleanup=0;
 constructor(private db:DatabaseSync,private now:()=>number=Date.now){db.exec(`CREATE TABLE IF NOT EXISTS execution_monitor_raw(kind TEXT NOT NULL,owner_id TEXT NOT NULL,sampler TEXT NOT NULL,bucket INTEGER NOT NULL,observed_at INTEGER NOT NULL,source TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,owner_id,sampler,bucket));
 CREATE INDEX IF NOT EXISTS execution_monitor_time ON execution_monitor_raw(kind,owner_id,observed_at);
 CREATE TABLE IF NOT EXISTS execution_monitor_rollup(kind TEXT NOT NULL,owner_id TEXT NOT NULL,bucket INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,owner_id,bucket));`);this.cleanup();}
 record(kind:'machine'|'service',id:string,sampler:string,source:'local-os'|'signed-agent'|'network-probe',metrics:Metrics,health?:'healthy'|'degraded'|'down',observedAt=this.now(),hardwareAuthorized=false){
  const values:Metrics={};for(const k of fields){if((k==='gpuPercent'||k==='powerWatts'||k==='cpuPackageWatts')&&(!hardwareAuthorized||source!=='signed-agent'||kind!=='machine'))continue;const n=metrics[k];if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<10000000&&(!k.endsWith('Percent')||n<=100))values[k]=n;}
  const bucket=Math.floor(observedAt/10000)*10000,rollup=Math.floor(observedAt/900000)*900000;
  this.db.exec('BEGIN IMMEDIATE');try{
   const insert=this.db.prepare('INSERT OR IGNORE INTO execution_monitor_raw VALUES(?,?,?,?,?,?,?)').run(kind,id,sampler,bucket,observedAt,source,JSON.stringify({metrics:values,health:health??null}));
   if(insert.changes){const old=this.db.prepare('SELECT json FROM execution_monitor_rollup WHERE kind=? AND owner_id=? AND bucket=?').get(kind,id,rollup),data=old?JSON.parse(String(old.json)):{stats:{},observations:0,sourceCounts:{},healthCounts:{healthy:0,degraded:0,down:0},firstAt:observedAt,lastAt:observedAt};data.observations++;data.sourceCounts[source]=(data.sourceCounts[source]??0)+1;data.firstAt=Math.min(data.firstAt,observedAt);data.lastAt=Math.max(data.lastAt,observedAt);if(health)data.healthCounts[health]++;
    for(const[k,n]of Object.entries(values)){const previous:Stats|undefined=data.stats[k];data.stats[k]=previous?{sum:previous.sum+n!,count:previous.count+1,minimum:Math.min(previous.minimum,n!),maximum:Math.max(previous.maximum,n!)}:{sum:n,count:1,minimum:n,maximum:n};}
    this.db.prepare('INSERT INTO execution_monitor_rollup VALUES(?,?,?,?) ON CONFLICT(kind,owner_id,bucket) DO UPDATE SET json=excluded.json').run(kind,id,rollup,JSON.stringify(data));
   }this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  if(this.now()-this.lastCleanup>1800000)this.cleanup();
 }
 local(){const current=cpus().map(c=>c.times);let idle=0,total=0;for(let i=0;i<current.length;i++){const old=this.previous[i];if(!old)continue;for(const key of ['user','nice','sys','idle','irq'] as const){const delta=Math.max(0,current[i][key]-old[key]);total+=delta;if(key==='idle')idle+=delta;}}this.previous=current.map(c=>({...c}));const memoryTotal=totalmem(),memoryFree=freemem();this.record('machine','local','local','local-os',{cpuPercent:total?100*(1-idle/total):null,memoryPercent:100*(1-memoryFree/memoryTotal),memoryUsedGB:(memoryTotal-memoryFree)/1024**3,memoryTotalGB:memoryTotal/1024**3,uptimeSec:uptime()});}
 query(input:unknown){const q=monitorQuery.parse(input),until=this.now(),since=until-windows[q.window],resolution=q.window==='90d'?'15-minute-aggregate':'observed-samples',step=Math.max(q.window==='90d'?900000:10000,Math.ceil(windows[q.window]/q.points)),groups=new Map<number,any>();
  const rows=q.window==='90d'?this.db.prepare('SELECT bucket,json FROM execution_monitor_rollup WHERE kind=? AND owner_id=? AND bucket>=? AND bucket<=? ORDER BY bucket').all(q.kind,q.id,Math.floor(since/900000)*900000,until):this.db.prepare('SELECT observed_at,source,json FROM execution_monitor_raw WHERE kind=? AND owner_id=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at').all(q.kind,q.id,since,until);
  for(const row of rows){const timestamp=Number(row.observed_at??row.bucket),index=Math.min(q.points-1,Math.max(0,Math.floor((timestamp-since)/step))),data=JSON.parse(String(row.json));let group=groups.get(index);if(!group){group={at:new Date(since+index*step).toISOString(),observations:0,stats:{},sourceCounts:{},healthCounts:{healthy:0,degraded:0,down:0},firstAt:null,lastAt:null};groups.set(index,group);}const aggregate=q.window==='90d',observations=aggregate?data.observations:1;group.observations+=observations;group.firstAt=Math.min(group.firstAt??Infinity,aggregate?data.firstAt:timestamp);group.lastAt=Math.max(group.lastAt??0,aggregate?data.lastAt:timestamp);
   for(const[source,n]of Object.entries(aggregate?data.sourceCounts:{[String(row.source)]:1}))group.sourceCounts[source]=(group.sourceCounts[source]??0)+Number(n);
   for(const[state,n]of Object.entries(aggregate?data.healthCounts:data.health?{[data.health]:1}:{}))group.healthCounts[state]+=Number(n);
   for(const key of fields){const stat:Stats|undefined=aggregate?data.stats[key]:typeof data.metrics[key]==='number'?{sum:data.metrics[key],count:1,minimum:data.metrics[key],maximum:data.metrics[key]}:undefined;if(!stat)continue;const old:Stats|undefined=group.stats[key];group.stats[key]=old?{sum:old.sum+stat.sum,count:old.count+stat.count,minimum:Math.min(old.minimum,stat.minimum),maximum:Math.max(old.maximum,stat.maximum)}:stat;}
  }
  const points=Array.from({length:q.points},(_,i)=>{const group=groups.get(i);return {at:new Date(since+i*step).toISOString(),observations:group?.observations??0,firstObservedAt:group?new Date(group.firstAt).toISOString():null,lastObservedAt:group?new Date(group.lastAt).toISOString():null,values:Object.fromEntries(fields.map(key=>{const s:Stats|undefined=group?.stats[key];return [key,s?{average:s.sum/s.count,minimum:s.minimum,maximum:s.maximum,count:s.count}:null];})),healthCounts:group?.healthCounts??{healthy:0,degraded:0,down:0},sourceCounts:group?.sourceCounts??{}};});
  const healthCounts=points.reduce((total,p)=>{for(const k of ['healthy','degraded','down'])total[k]+=p.healthCounts[k];return total;},{healthy:0,degraded:0,down:0} as Record<string,number>),observedProbes=healthCounts.healthy+healthCounts.degraded+healthCounts.down;
  return {kind:q.kind,id:q.id,window:q.window,since:new Date(since).toISOString(),until:new Date(until).toISOString(),resolution,intervalSeconds:step/1000,points,totalObservations:points.reduce((n,p)=>n+p.observations,0),healthCounts,probeSuccessPercent:observedProbes?100*healthCounts.healthy/observedProbes:null,retention:{rawDays,aggregateDays},unknownMetrics:['gpuPercent','powerWatts'].filter(k=>!points.some(p=>p.values[k])),note:'空档为未观测；探测成功比例不是连续可用率。GPU及功耗仅接受已配置来源的签名读数，缺失不生成数值。'};
 }
 cleanup(){const now=this.now();this.db.prepare('DELETE FROM execution_monitor_raw WHERE observed_at<?').run(now-rawDays*86400000);this.db.prepare('DELETE FROM execution_monitor_rollup WHERE bucket<?').run(now-aggregateDays*86400000);this.lastCleanup=now;}
}
