export interface UsageTotals {
 records:number; reportedCalls:number; unknownCalls:number; localCalls:number;
 inputTokens:number; outputTokens:number; cacheReadTokens:number; cacheWriteTokens:number;
 totalTokens:number; estimatedUSD:number; unpricedCalls:number; seconds:number;
}
export interface UsageRecord {
 id:string; run_id:string; actor_id:string; provider:string; model:string; origin:string; scenario:string|null;
 input_tokens:number|null; output_tokens:number|null; cache_read:number|null; cache_write:number|null;
 total_tokens:number|null; cost_usd:number|null; cost_kind:string; measured_at:string;
 source:string; source_record_id:string|null; usage_kind:string; measurement_status:'reported'|'unknown'|'local';
 project_id:string|null; machine_id:string|null; task_id:string|null; executor_id:string|null; seconds?:number|null;
}
export interface UsageOptions {providers:string[];models:string[];origins:string[];scenarios:string[];projects:string[];machines:string[];sources:string[];actors:string[]}
export interface UsageSummary {
 totals:UsageTotals;today:UsageTotals;month:UsageTotals;lifetime:UsageTotals;
 byProvider:(UsageTotals&{key:string})[];byModel:(UsageTotals&{key:string})[];byScenario:(UsageTotals&{key:string})[];
 byProject:(UsageTotals&{key:string})[];byMachine:(UsageTotals&{key:string})[];daily:(UsageTotals&{day:string})[];
 options:UsageOptions;currency:'USD';timezone:string;period:unknown;
}
export interface UsagePage {items:UsageRecord[];total:number;page:number;pageSize:number;totalPages:number;unreported:Record<string,unknown>[]}
export type UsagePeriod='all'|'today'|'week'|'month'|'custom';
export interface UsageFilters {period:UsagePeriod;from:string;until:string;provider:string;model:string;origin:string;scenario:string;projectId:string;machineId:string;source:string;actorId:string}
export const defaultUsageFilters=():UsageFilters=>({period:'all',from:'',until:'',provider:'',model:'',origin:'',scenario:'',projectId:'',machineId:'',source:'',actorId:''});
export const tokenNumber=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('zh-CN'):'未知';
export const usageUSD=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?`USD ${n.toFixed(4)}`:'未定价';
export const usageLabels:Record<string,string>={
 'bounded-job':'受控开发','family-chat':'家庭对话','chat':'管家对话','conversation-transition':'等待回应',
 'knowledge':'知识解析','development':'项目开发','research':'深度研究','test':'连接验证',
 'provider-reported':'提供方报告','catalog-estimate':'目录估算','unavailable':'未定价',
 reported:'已报告',unknown:'用量未知',local:'本地计算',
};
export const usageLabel=(value:unknown)=>value===null||value===undefined||value===''?'未归因':usageLabels[String(value)]??String(value);
const nextDay=(day:string,offset:number)=>new Date(Date.parse(day+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
/** Convert a calendar midnight in the selected policy timezone without using the browser timezone. */
export function usageDayBoundary(day:string,timezone='Asia/Shanghai'):string {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('请填写有效日期');
 const target=Date.parse(day+'T00:00:00Z'),format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 let candidate=target;
 for(let i=0;i<3;i++){const parts=format.formatToParts(new Date(candidate)),v=(name:string)=>Number(parts.find(p=>p.type===name)?.value),local=Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'),v('second'));candidate=target-(local-candidate);}
 return new Date(candidate).toISOString();
}
export function usageQuery(filters:UsageFilters,timezone='Asia/Shanghai',at=new Date()):URLSearchParams {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at),part=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 const today=`${part('year')}-${part('month')}-${part('day')}`,query=new URLSearchParams();
 let from='',until='';
 if(filters.period==='today'){from=today;until=nextDay(today,1);}
 if(filters.period==='week'){from=nextDay(today,-6);until=nextDay(today,1);}
 if(filters.period==='month'){from=today.slice(0,8)+'01';until=nextDay(today,1);}
 if(filters.period==='custom'){if(!filters.from||!filters.until)throw Error('请选择完整日期范围');if(filters.from>filters.until)throw Error('开始日期不能晚于结束日期');from=filters.from;until=nextDay(filters.until,1);}
 if(from)query.set('from',usageDayBoundary(from,timezone));if(until)query.set('until',usageDayBoundary(until,timezone));
 for(const key of ['provider','model','origin','scenario','projectId','machineId','source','actorId'] as const)if(filters[key])query.set(key,filters[key]);
 return query;
}
const csvValue=(value:unknown)=>{const text=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';};
/** Export only observed metadata; null token counts stay blank rather than becoming zero. */
export function usagePageCSV(records:UsageRecord[]):string {
 const headers=['用量ID','时间','来源','场景','提供方','模型','计量状态','输入Token','输出Token','缓存读取','缓存写入','总Token','费用USD','金额依据','成员ID','项目ID','任务ID','设备ID','执行ID'];
 return [headers,...records.map(u=>[u.id,u.measured_at,u.source,u.scenario,u.provider,u.model,u.measurement_status,u.input_tokens,u.output_tokens,u.cache_read,u.cache_write,u.total_tokens,u.cost_usd,u.cost_kind,u.actor_id,u.project_id,u.task_id,u.machine_id,u.run_id])].map(row=>row.map(csvValue).join(',')).join('\r\n');
}
