/** Sentence speech starts while Pi is still answering. A failed stream is never retried. */
export function speechText(text:string){return text.replace(/```[\s\S]*?(?:```|$)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/^[\s#>*-]+/gm,'').replace(/[*_`]/g,'').trim();}
export class SentenceSpeechQueue {
 private buffer='';private pending=Promise.resolve();private spoken=0;private failed:unknown;private inCode=false;
 constructor(private consume:(text:string)=>Promise<void>,private signal:AbortSignal,private limit=8000){}
 push(delta:string){
  this.signal.throwIfAborted();if(this.failed)throw this.failed;
  this.buffer+=delta;
  while(this.buffer.length){const boundary=this.buffer.search(/[。！？!?\n]|[.!?](?=\s)/);if(boundary<0&&this.buffer.length<100)break;const end=boundary>=0?boundary+1:100;this.enqueue(this.buffer.slice(0,end));this.buffer=this.buffer.slice(end);}
 }
 private enqueue(raw:string){
  const text=raw.split(/(```)/).map(part=>{if(part==='```'){this.inCode=!this.inCode;return '';}return this.inCode?'':part;}).join('').replace(/https?:\/\/\S+/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^[\s#>*-]+/gm,'').replace(/[*_`]/g,'').trim();
  if(!text||this.spoken>=this.limit)return;const value=text.slice(0,this.limit-this.spoken);this.spoken+=value.length;
  this.pending=this.pending.then(async()=>{this.signal.throwIfAborted();if(this.failed)throw this.failed;await this.consume(value);});
  // Attach a handler immediately: synthesis can fail before the model finishes streaming.
  this.pending.catch(error=>{this.failed=error;});
 }
 async finish(){if(this.buffer){this.enqueue(this.buffer);this.buffer='';}await this.pending;if(this.failed)throw this.failed;this.signal.throwIfAborted();}
}

import {PreparedSpeechStream,firstSentenceSpeechSegments,type SpeechPreparation} from './prepared-speech';
import {knownSpokenLanguage,type SpokenLanguage} from './conversation-language';

export type ApprovedSpeech={sequence:number;text:string;approved:true};
export type FamilyStreamRoute={tier:string;fallback?:string;model?:string;responseLanguage?:SpokenLanguage};
export type FamilyStreamResult={message:{content:string};status:string;responseLanguage?:SpokenLanguage;speech?:{mode:'incremental'|'final';segments:number;text:string};transition?:{segments:number;text:string}};
/** Incremental metadata owns the spoken output even if the server deliberately suppressed every sentence. */
export async function readSpokenFamilyStream<T>(response:Response,signal:AbortSignal,onDelta:(text:string)=>void,ops:SpeechPreparation<T>,hooks:{firstSpeech?:()=>void;failure?:(error:unknown)=>void;transition?:(text:string)=>void;route?:(route:FamilyStreamRoute)=>void;responseLanguage?:(language:SpokenLanguage)=>void}={}):Promise<FamilyStreamResult&{speechHandled:boolean}>{
 let queue:PreparedSpeechStream<T>|undefined,streamFailure:unknown,stopping=false,hadTransition=false;
 const enqueue=(text:string)=>{const clean=speechText(text);if(!clean)return;if(!queue){hooks.firstSpeech?.();queue=new PreparedSpeechStream(signal,ops,error=>{if(!stopping&&!signal.aborted){streamFailure=error;hooks.failure?.(error);}});}for(const part of firstSentenceSpeechSegments(clean,180))queue.push(part);};
 try{const result=await readFamilyStream(response,signal,onDelta,approved=>enqueue(approved.text),transition=>{hadTransition=true;hooks.transition?.(transition.text);enqueue(transition.text);},route=>hooks.route?.(route),language=>{if(!queue)hooks.responseLanguage?.(language);});if(hadTransition&&result.speech?.mode!=='incremental')enqueue(result.message.content);if(queue)await queue.finish();return {...result,speechHandled:hadTransition||result.speech?.mode==='incremental'};
 }catch(error){stopping=true;queue?.cancel(error);throw streamFailure??error;}
}
export async function readFamilyStream(response:Response,signal:AbortSignal,onDelta:(text:string)=>void,onSpeech?:(speech:ApprovedSpeech)=>void,onTransition?:(speech:ApprovedSpeech)=>void,onRoute?:(route:FamilyStreamRoute)=>void,onLanguage?:(language:SpokenLanguage)=>void):Promise<FamilyStreamResult>{
 if(!response.ok){const data=await response.json().catch(()=>null);throw Object.assign(new Error(data?.error?.message||'对话连接未完成'),{status:response.status,code:data?.error?.code});}
 if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new Error('对话没有返回实时数据');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',total=0,done:FamilyStreamResult|undefined,speechCount=0,approvedText='',transitionText='';
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{while(true){signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();if(chunk.done)break;total+=chunk.value.length;if(total>512*1024)throw new Error('回答过长，请分次交流');buffer+=decoder.decode(chunk.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let boundary:number;while((boundary=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const event=packet.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim();const raw=packet.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!raw)continue;const data=JSON.parse(raw);
   if(event==='error')throw Object.assign(new Error(data.message||'本轮回答未完成'),{code:data.code});
   if(done&&['delta','speech','transition','done'].includes(event??''))throw new Error('回答完成后收到异常数据');
   const responseLanguage=knownSpokenLanguage(data.responseLanguage);
   if(['status','route','done'].includes(event??'')&&responseLanguage)onLanguage?.(responseLanguage);
   if(event==='route'&&['fast','advanced'].includes(data.tier))onRoute?.({tier:data.tier,fallback:typeof data.fallback==='string'?data.fallback:undefined,model:typeof data.model==='string'?data.model:undefined,...responseLanguage?{responseLanguage}:{}});
   if(event==='delta'&&typeof data.text==='string')onDelta(data.text);
   if(event==='transition'){
    if(transitionText||data.approved!==true||data.sequence!==0||typeof data.text!=='string'||!data.text.trim()||data.text.length>180||/[<>`]|https?:/i.test(data.text))throw new Error('等待回复未通过核对');
    transitionText=data.text;onTransition?.({sequence:0,text:data.text,approved:true});
   }
   if(event==='speech'){
    if(data.approved!==true||data.sequence!==speechCount||typeof data.text!=='string'||!data.text.trim()||data.text.length>4000||/<\/?(?:think|thinking|analysis|reasoning|reflection)(?:\s|>)/i.test(data.text))throw new Error('实时语音内容未通过核对');
    approvedText+=data.text;if(approvedText.length>16000)throw new Error('语音回答过长，请分次交流');speechCount++;onSpeech?.({sequence:data.sequence,text:data.text,approved:true});
   }
   if(event==='done'){
    if(data.status!=='complete'||typeof data.message?.content!=='string')throw new Error('本轮回答未完成');
    if(data.speech!==undefined){const summary=data.speech;if(!['incremental','final'].includes(summary?.mode)||!Number.isInteger(summary.segments)||summary.segments<0||typeof summary.text!=='string')throw new Error('语音完成信息异常');
     if(summary.mode==='incremental'&&(summary.segments!==speechCount||summary.text!==approvedText)||summary.mode==='final'&&speechCount)throw new Error('语音完成信息与已批准内容不一致');
    }else if(speechCount)throw new Error('本轮语音没有返回完成凭据');
    if(transitionText){if(data.transition?.segments!==1||data.transition.text!==transitionText)throw new Error('等待回复没有返回完成凭据');}else if(data.transition!==undefined&&(data.transition?.segments!==0||data.transition.text!==''))throw new Error('等待回复完成信息异常');done=data;
   }
  }if(buffer.length>128*1024)throw new Error('实时数据异常');}if(!done||done.status!=='complete')throw new Error('本轮回答未完成');return done;}
 finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
