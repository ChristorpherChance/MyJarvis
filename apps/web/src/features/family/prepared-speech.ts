/** Break only final answers at natural boundaries. Ordinary short answers stay intact. */
export function speechSegments(text:string,limit=1000):string[]{
 if(!Number.isInteger(limit)||limit<100||limit>1000)throw new Error('Invalid speech segment limit');const segments:string[]=[];
 while(text.length>limit){const candidate=text.slice(0,limit);let end=0;for(const match of candidate.matchAll(/[。！？.!?；;\n]\s*/g)){const at=match.index!+match[0].length;if(at>=limit*.55)end=at;}if(!end){const space=candidate.lastIndexOf(' ');end=space>=limit*.55?space+1:limit;}segments.push(text.slice(0,end));text=text.slice(end);}
 if(text.trim())segments.push(text);return segments;
}
/** A completed answer can still begin with one short sentence. The remainder
 * keeps its exact text and one bounded lookahead; no partial streamed text is used. */
export function firstSentenceSpeechSegments(text:string,limit=180):string[]{
 if(!Number.isInteger(limit)||limit<100||limit>1000)throw new Error('Invalid speech segment limit');
 let end=0;
 for(const match of text.matchAll(/[。！？!?]\s*|\.(?:\s+|$)/g)){
  const at=match.index!+match[0].length;
  if(at>limit)break;
  const before=text.slice(0,match.index!);
  if(match[0].startsWith('.')&&/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|etc)|\b[A-Z])$/i.test(before))continue;
  end=at;break;
 }
 if(!end)return speechSegments(text,limit);
 return [text.slice(0,end),...speechSegments(text.slice(end),limit)];
}
type Outcome<T>={value:T;error?:never}|{error:unknown;value?:never};
export type SpeechPreparation<T>={prepare:(text:string,previous:T|undefined,signal:AbortSignal)=>Promise<T>;play:(value:T,signal:AbortSignal,started:()=>void)=>Promise<void>;discard:(value:T)=>Promise<void>};

/** Approved sentences can arrive during playback. Keep exactly one prepared lookahead. */
export class PreparedSpeechStream<T>{
 private control=new AbortController();private texts:string[]=[];private ended=false;private failure:unknown;
 private closed=false;private wake:(()=>void)|null=null;private unplayed=new Set<T>();private total=0;
 private previous:T|undefined;private lookahead:Promise<Outcome<T>>|undefined;private mayPrepare=false;
 private finished:Promise<void>;private relay:()=>void;
 constructor(private readonly signal:AbortSignal,private readonly ops:SpeechPreparation<T>,private readonly onFailure:(error:unknown)=>void=()=>{},private readonly limit=8000){
  this.relay=()=>this.control.abort(signal.reason);signal.addEventListener('abort',this.relay,{once:true});if(signal.aborted)this.relay();
  this.finished=this.run();void this.finished.catch(error=>{this.failure=error;this.control.abort(error);try{this.onFailure(error);}catch{}});
 }
 push(text:string){
  this.signal.throwIfAborted();this.control.signal.throwIfAborted();if(this.failure)throw this.failure;if(this.ended||this.closed)throw new Error('实时语音已经结束');
  if(!text.trim())return;this.total+=text.length;if(this.total>this.limit||this.texts.length>=64)throw new Error('语音回答过长，请分次交流');
  this.texts.push(text);this.prepareLookahead();this.notify();
 }
 async finish(){this.ended=true;this.notify();await this.finished;this.signal.throwIfAborted();}
 cancel(reason:unknown=new DOMException('Aborted','AbortError')){this.control.abort(reason);this.notify();}
 private notify(){const wake=this.wake;this.wake=null;wake?.();}
 private discard(value:T){if(this.unplayed.delete(value))void this.ops.discard(value).catch(()=>{});}
 private prepare(text:string,previous:T|undefined):Promise<Outcome<T>>{
  return Promise.resolve().then(()=>{this.control.signal.throwIfAborted();return this.ops.prepare(text,previous,this.control.signal);}).then(value=>{this.unplayed.add(value);if(this.closed||this.control.signal.aborted)this.discard(value);return {value};},error=>({error}));
 }
 private prepareLookahead(){if(this.mayPrepare&&!this.lookahead&&this.texts.length&&!this.closed&&!this.control.signal.aborted){this.lookahead=this.prepare(this.texts.shift()!,this.previous);this.notify();}}
 private async waitForInput(){
  this.control.signal.throwIfAborted();if(this.texts.length||this.lookahead||this.ended)return;
  await new Promise<void>((resolve,reject)=>{const abort=()=>{this.wake=null;reject(this.control.signal.reason??new DOMException('Aborted','AbortError'));};this.control.signal.addEventListener('abort',abort,{once:true});this.wake=()=>{this.control.signal.removeEventListener('abort',abort);resolve();};});this.control.signal.throwIfAborted();
 }
 private async run(){
  try{while(true){
   await this.waitForInput();this.control.signal.throwIfAborted();if(!this.lookahead&&!this.texts.length){if(this.ended)break;continue;}
   const pending=this.lookahead??this.prepare(this.texts.shift()!,this.previous);this.lookahead=undefined;this.mayPrepare=false;
   const prepared=await pending;if('error' in prepared)throw prepared.error;this.control.signal.throwIfAborted();const value=prepared.value!;
   let started=false;await this.ops.play(value,this.control.signal,()=>{if(this.closed||this.control.signal.aborted||started)return;started=true;this.previous=value;this.mayPrepare=true;this.prepareLookahead();});
   if(!started)throw new Error('声音未开始播放，请重试');
   this.control.signal.throwIfAborted();this.unplayed.delete(value);this.previous=value;this.mayPrepare=true;this.prepareLookahead();
  }}finally{this.closed=true;this.signal.removeEventListener('abort',this.relay);this.notify();for(const value of this.unplayed)this.discard(value);}
 }
}
/** Exactly one lookahead, after real playback starts. Late/abandoned audio is discarded. */
export async function preparedSpeech<T>(segments:string[],signal:AbortSignal,ops:SpeechPreparation<T>):Promise<void>{
 let closed=false;const unplayed=new Set<T>();
 const discard=(value:T)=>{if(unplayed.delete(value))void ops.discard(value).catch(()=>{});};
 const prepare=(index:number,previous?:T):Promise<Outcome<T>>=>Promise.resolve().then(()=>{signal.throwIfAborted();return ops.prepare(segments[index],previous,signal);}).then(value=>{unplayed.add(value);if(closed||signal.aborted)discard(value);return {value};},error=>({error}));
 try{if(!segments.length)return;let pending=prepare(0);
  for(let index=0;index<segments.length;index++){
   signal.throwIfAborted();const result=await pending;if('error' in result)throw result.error;signal.throwIfAborted();const value=result.value!;let next:Promise<Outcome<T>>|undefined;
   await ops.play(value,signal,()=>{if(!closed&&!signal.aborted&&index+1<segments.length&&!next)next=prepare(index+1,value);});signal.throwIfAborted();unplayed.delete(value);
   if(index+1<segments.length){if(!next)throw new Error('声音未开始播放，请重试');pending=next;}
  }
 }finally{closed=true;for(const value of unplayed)discard(value);}
}
