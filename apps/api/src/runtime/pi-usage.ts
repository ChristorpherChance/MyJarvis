import type {AgentSessionEvent} from '@earendil-works/pi-coding-agent';
import type {PiRunMetadata,PiUsageRecord} from '../pi.js';

/** Native SDK reports auxiliary calls outside assistant message_end. No token estimates. */
export class NativeUsageCollector {
 private seen=new Set<string>();private objects=new WeakSet<object>();private sequence=0;
 constructor(private meta:PiRunMetadata,private priced:boolean){}
 collect(event:AgentSessionEvent):PiUsageRecord|undefined {
  if(this.objects.has(event))return;this.objects.add(event);
  let usage:any,kind='model-response',provider=this.meta.provider,model=this.meta.model,key:string|undefined,unknown=false;
  if(event.type==='message_end'&&event.message.role==='assistant'){
   usage=event.message.usage;provider=event.message.provider;model=event.message.model;key='message:'+event.message.timestamp+':'+JSON.stringify(usage);
   unknown=!usage||(['error','aborted'].includes(event.message.stopReason)&&!(usage.totalTokens>0||usage.input>0||usage.output>0||usage.cacheRead>0||usage.cacheWrite>0));
  }else if(event.type==='compaction_end'){
   usage=event.result?.usage;kind='context-compaction';unknown=!usage;
  }else if(event.type==='entry_appended'&&event.entry.type==='usage'){
   usage=event.entry.usage;kind=event.entry.kind==='cache_warm'?'cache-warm':event.entry.kind;provider=event.entry.provider;model=event.entry.model;key='entry:'+event.entry.id;unknown=!usage;
  }else return;
  if(key&&this.seen.has(key))return;if(key)this.seen.add(key);
  const n=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1e12?v:0;
  const input=n(usage?.input),output=n(usage?.output),read=n(usage?.cacheRead),write=n(usage?.cacheWrite),total=n(usage?.totalTokens??input+output+read+write);
  const cost=!unknown&&this.priced&&typeof usage?.cost?.total==='number'&&Number.isFinite(usage.cost.total)&&usage.cost.total>=0?usage.cost.total:null;
  return {...this.meta,provider,model,usageId:`${this.meta.runId}_${this.sequence++}`,usageKind:this.meta.usageKind??kind,source:'pi-sdk',inputTokens:input,outputTokens:output,cacheReadTokens:read,cacheWriteTokens:write,totalTokens:total,costUSD:cost,costKind:cost===null?'unavailable':'catalog-estimate',measurementStatus:unknown?'unknown':'reported',measuredAt:new Date().toISOString()};
 }
}
