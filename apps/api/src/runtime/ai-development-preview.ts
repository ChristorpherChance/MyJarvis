import type {AiDevelopmentProfile,AiDevelopmentInventory} from './ai-development.js';

export type PreviewMode='supplement'|'reconcile';
type PreviewStatus='match'|'missing'|'different'|'unknown'|'invalid'|'unreadable'|'not-applicable'|'unmanaged';
export type PreviewItem={category:'tool'|'provider'|'statusline';key:string;status:PreviewStatus;reason:string;intent:'none'|'supplement'|'adjust'|'verify'|'preserve';expected:string|null;observed:string|null};
const toolName=(name:string)=>name==='ccswitch'?'cc-switch':name;

/** Public observations only: absence from an incomplete inventory never proves absence on disk. */
export function compareAiDevelopment(profile:AiDevelopmentProfile,inventory:AiDevelopmentInventory|null,mode:PreviewMode,current:boolean):PreviewItem[]{
 const items:PreviewItem[]=[];
 const add=(category:PreviewItem['category'],key:string,status:PreviewStatus,reason:string,expected:string|null=null,observed:string|null=null)=>{
  if(!current&&status!=='unmanaged'){status='unknown';reason='OBSERVATION_NOT_CURRENT';}
  const intent:PreviewItem['intent']=status==='unmanaged'?'preserve':status==='missing'?'supplement':status==='different'?(mode==='reconcile'?'adjust':'preserve'):['unknown','invalid','unreadable'].includes(status)?'verify':'none';
  items.push({category,key,status,reason,intent,expected,observed});
 };
 for(const pin of profile.tools){
  const matches=inventory?.tools.filter(t=>toolName(t.name)===toolName(pin.name))??[];
  if(profile.tools.filter(t=>toolName(t.name)===toolName(pin.name)).length!==1){add('tool',pin.name,'unknown','AMBIGUOUS_TOOL',pin.version);continue;}
  const aliasesAgree=matches.length===2&&new Set(matches.map(t=>t.name)).size===2&&matches.every(t=>toolName(t.name)==='cc-switch'&&t.installed===matches[0].installed&&t.version===matches[0].version);
  if(matches.length!==1&&!aliasesAgree){add('tool',pin.name,'unknown',matches.length?'AMBIGUOUS_TOOL':'TOOL_NOT_OBSERVED',pin.version);continue;}
  const actual=matches[0];
  if(!actual.installed)add('tool',pin.name,'missing','TOOL_NOT_INSTALLED',pin.version);
  else if(!actual.version)add('tool',pin.name,'unknown','TOOL_VERSION_UNKNOWN',pin.version);
  else add('tool',pin.name,actual.version===pin.version?'match':'different',actual.version===pin.version?'TOOL_VERSION_MATCH':'TOOL_VERSION_DIFFERENT',pin.version,actual.version);
 }
 for(const t of inventory?.tools??[])if(!profile.tools.some(p=>toolName(p.name)===toolName(t.name)))add('tool',t.name,'unmanaged','EXTRA_TOOL_PRESERVED');
 for(const pin of profile.providers){
  const matches=inventory?.providers.filter(p=>p.id===pin.id)??[];
  const nameConflict=inventory?.providers.some(p=>p.name===pin.name&&p.id!==pin.id);
  const templateConflict=profile.providers.filter(p=>p.id===pin.id||p.name===pin.name).length!==1;
  if(matches.length!==1||nameConflict||templateConflict){add('provider',pin.id,'unknown',matches.length>1||nameConflict||templateConflict?'PROVIDER_ID_NAME_CONFLICT':'PROVIDER_NOT_OBSERVED',pin.model);continue;}
  const actual=matches[0];
  if(pin.model===null||actual.model===null)add('provider',pin.id,'unknown','PROVIDER_MODEL_UNKNOWN',pin.model,actual.model);
  else add('provider',pin.id,pin.model===actual.model?'match':'different',pin.model===actual.model?'PROVIDER_MODEL_MATCH':'PROVIDER_MODEL_DIFFERENT',pin.model,actual.model);
 }
 for(const p of inventory?.providers??[])if(!profile.providers.some(pin=>pin.id===p.id))add('provider',p.id,'unmanaged','EXTRA_PROVIDER_PRESERVED');
 const s=inventory?.statusline;
 for(const layer of ['script','global','common','currentProvider'] as const){
  const state=s?.diagnosticsVersion===1?s.layers?.[layer]:undefined;
  add('statusline',layer,state??'unknown',state?'STATUSLINE_LAYER_'+state.toUpperCase().replaceAll('-','_'):'STATUSLINE_NOT_OBSERVED');
 }
 // Aggregate counts do not identify individual provider settings or prove terminal rendering.
 const counts=s?.diagnosticsVersion===1?s.providers:undefined;
 const aggregate:PreviewStatus=!counts||counts.total===0||counts.unknown>0?'unknown':counts.invalid>0?'invalid':counts.missing>0?'missing':counts.different>0?'different':'match';
 add('statusline','providers',aggregate,!counts?'STATUSLINE_NOT_OBSERVED':counts.total===0?'STATUSLINE_ZERO_PROVIDERS':'STATUSLINE_PROVIDER_AGGREGATE',null,counts?`${counts.matched}/${counts.total}`:null);
 return items;
}
