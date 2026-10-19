export const TELEMETRY_METRIC_KEYS = [
 'diskPercent','diskFreeGB','diskTotalGB','cpuPercent','memoryPercent','memoryUsedGB','memoryTotalGB','load1','uptimeSec','gpuPercent','powerWatts','cpuPower','storage',
] as const;

export type TelemetryMetricKey = typeof TELEMETRY_METRIC_KEYS[number];
type MetricFreshness = {agentId?:unknown;observedAt?:unknown;expiresAt?:unknown;timeBasis?:unknown};
type Telemetry = Record<string,unknown> & {observedAt?:unknown;metricFreshness?:unknown};
const validTime=(value:unknown):number=>typeof value==='string'?Date.parse(value):NaN;

/** Keep only individually fresh signed-agent metric samples; old telemetry gets a conservative 60s fallback. */
export function projectFreshTelemetry<T extends Telemetry|undefined|null>(telemetry:T,now=Date.now()):T {
 if(!telemetry||typeof telemetry!=='object')return telemetry;
 const projected={...telemetry} as Record<string,unknown>;
 const freshness=telemetry.metricFreshness&&typeof telemetry.metricFreshness==='object'&&!Array.isArray(telemetry.metricFreshness)
  ?telemetry.metricFreshness as Record<string,MetricFreshness>:undefined;
 const fallbackObserved=validTime(telemetry.observedAt);
 const fallbackFresh=Number.isFinite(fallbackObserved)&&fallbackObserved<=now+10_000&&now-fallbackObserved<=60_000;
 for(const key of TELEMETRY_METRIC_KEYS){
  if(!(key in projected))continue;
  const sample=freshness?.[key];
  let fresh=false;
  if(sample&&typeof sample==='object'){
   const observed=validTime(sample.observedAt),expires=validTime(sample.expiresAt);
   fresh=(sample.timeBasis==='received'||sample.timeBasis==='measured')&&Number.isFinite(observed)&&Number.isFinite(expires)&&observed<=now+10_000&&expires>=observed&&now<=expires;
  }else fresh=fallbackFresh;
  if(!fresh)delete projected[key];
 }
 return {...projected,metricFreshness:freshness?Object.fromEntries(TELEMETRY_METRIC_KEYS.filter(k=>k in projected&&freshness[k]).map(k=>[k,freshness[k]])):undefined} as T;
}

export function metricSampleTime(telemetry:Telemetry|undefined|null,key:TelemetryMetricKey):string|undefined {
 if(!telemetry||telemetry[key]===undefined)return undefined;
 const metadata=telemetry.metricFreshness as Record<string,MetricFreshness>|undefined;
 const observed=metadata?.[key]?.observedAt;
 return typeof observed==='string'?observed:typeof telemetry.observedAt==='string'?telemetry.observedAt:undefined;
}
