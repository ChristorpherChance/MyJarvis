import {randomUUID} from 'node:crypto';
export const MAX_PROTOCOL_LINE_BYTES=4*1024*1024;
const MAX_RETAINED_BYTES=4*1024*1024,MAX_EVENTS=100_000;
const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export type ProtocolEngine='pi-sdk'|'codex'|'claude'|'fixed';
export interface NativeProtocolResult {lines:string[];error?:string;invocationId:string;phaseCount:number;}
/** One instance belongs to exactly one trusted spawn. Session identity alone never authorizes a new phase. */
export class AgentProtocolConsumer {
 private retained:string[]=[];private bytes=0;private events=0;private error?:string;
 private finalCanonical?:string;private finalLine?:string;private provisional=false;
 private boundary=false;private activity=false;private phases=0;private initialized=false;
 readonly invocationId=randomUUID();
 constructor(private engine:ProtocolEngine,private purpose?:string){}
 private keep(line:string){const size=Buffer.byteLength(line);if(this.bytes+size>MAX_RETAINED_BYTES){this.error='AGENT_PROTOCOL_EVENT_LIMIT';return;}this.retained.push(line);this.bytes+=size;}
 private empty(e:any){return e.type==='result'&&e.is_error!==true&&(!e.result)&&(e.num_turns===0||e.num_turns===undefined)&&e.usage&&['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'].every(k=>(e.usage[k]??0)===0)&&e.total_cost_usd===0;}
 consume(line:string){if(this.error)return;if(Buffer.byteLength(line)>MAX_PROTOCOL_LINE_BYTES){this.error='AGENT_PROTOCOL_LINE_TOO_LONG';return;}if(++this.events>MAX_EVENTS){this.error='AGENT_PROTOCOL_EVENT_LIMIT';return;}let e:any;try{e=JSON.parse(line);}catch{return;}if(!e||typeof e!=='object'||Array.isArray(e))return;
 const init=this.engine==='claude'&&e.type==='system'&&e.subtype==='init'||this.engine==='codex'&&e.type==='thread.started';
 const active=this.engine==='claude'&&['assistant','user','tool_result'].includes(e.type)||this.engine==='codex'&&['item.started','item.completed','turn.started'].includes(e.type);
 if(init)this.initialized=true;
 if(init&&this.finalLine){this.boundary=true;this.activity=false;}
 if(active&&this.initialized&&this.finalLine&&this.provisional){this.finalLine=undefined;this.finalCanonical=undefined;this.provisional=false;this.activity=true;}
 if(active&&this.boundary){if(this.provisional){this.finalLine=undefined;this.finalCanonical=undefined;this.provisional=false;}this.activity=true;}
 const final=this.engine==='claude'?e.type==='result':this.engine==='codex'?e.type==='turn.completed':this.engine==='fixed'?e.type==='execution.result':false;
 if(final){const canonical=JSON.stringify(stable(e));if(this.finalCanonical!==undefined){if(this.finalCanonical===canonical)return;if(!(this.boundary&&this.activity)){this.error='AGENT_PROTOCOL_FINAL_CONFLICT';return;}this.keep(this.finalLine!);this.phases++;}
 if(this.purpose==='project-supervisor'&&this.engine==='fixed'){let feedback:any;try{feedback=JSON.parse(e.summary);}catch{this.error='AGENT_SUPERVISOR_PROTOCOL_INVALID';return;}const keys=['state','summary','question','options','recommendedOption','evidence','nextSuggestion'];if(!feedback||Object.keys(feedback).length!==keys.length||keys.some(k=>!Object.hasOwn(feedback,k))||!['progress','needs_decision','blocked','ready_for_review'].includes(feedback.state)){this.error='AGENT_SUPERVISOR_PROTOCOL_INVALID';return;}}
 this.finalCanonical=canonical;this.finalLine=JSON.stringify(e);this.provisional=this.empty(e);this.boundary=false;this.activity=false;return;}
 if(this.engine==='claude'&&e.type==='system'&&e.session_id)this.keep(JSON.stringify({type:'system',subtype:e.subtype,session_id:e.session_id,claude_code_version:e.claude_code_version??e.cli_version,model:e.model}));
 else if(this.engine==='claude'&&e.type==='assistant'&&e.message?.usage)this.keep(JSON.stringify({type:'assistant',uuid:e.uuid,message:{id:e.message.id,model:e.message.model,usage:e.message.usage}}));
 else if(this.engine==='codex'&&['thread.started','turn.started','error','turn.failed'].includes(e.type))this.keep(JSON.stringify(e));
 else if(this.engine==='codex'&&e.type==='item.completed'&&e.item?.type==='agent_message')this.keep(JSON.stringify({type:e.type,item:{type:'agent_message',text:String(e.item.text??'').slice(0,20000)}}));
 }
 finish():NativeProtocolResult{if(!this.error&&(!this.finalLine||this.boundary&&this.activity||this.provisional))this.error='AGENT_PROTOCOL_FINAL_MISSING';return {lines:this.error?this.retained:[...this.retained,this.finalLine!],...(this.error?{error:this.error}:{}),invocationId:this.invocationId,phaseCount:this.phases+(this.finalLine&&!this.provisional?1:0)};}
}
