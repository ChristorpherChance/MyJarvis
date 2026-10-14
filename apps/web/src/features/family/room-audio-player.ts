type PlaybackCallbacks={started:()=>Promise<void>;blocked:()=>Promise<void>;playing?:()=>void;ended?:()=>void};
type PlaybackTask={signal:AbortSignal;resolve:()=>void;reject:(error:unknown)=>void;callbacks:PlaybackCallbacks;started:boolean;ended:boolean;attempting:boolean;blocked:boolean;receipts:Promise<void>;cleanup:()=>void};
const aborted=()=>new DOMException('Aborted','AbortError');
const policyBlocked=(error:unknown)=>['NotAllowedError','SecurityError'].includes((error as Error)?.name);

/** One mounted media element retains its user activation across spoken sentences.
 * A denied play stays pending until a real click/native control resumes it. */
export class RoomAudioPlayer {
 private task:PlaybackTask|null=null;
 private url='';
 private primeCleanup:(()=>void)|null=null;
 constructor(private media:HTMLAudioElement,private blockedChanged:(blocked:boolean)=>void,
  private urls={create:(blob:Blob)=>URL.createObjectURL(blob),revoke:(url:string)=>URL.revokeObjectURL(url)}){}
 get active(){return this.task!==null;}

 /** Call synchronously inside the initiating click, before network/mic awaits. */
 primeFromGesture(){
  if(this.task)return;
  this.clearSource();this.prepare(tone(false));
  const cleanup=()=>{if(this.primeCleanup!==cleanup)return;this.primeCleanup=null;this.media.removeEventListener('ended',cleanup);this.media.removeEventListener('error',cleanup);this.clearSource();};
  this.primeCleanup=cleanup;this.media.addEventListener('ended',cleanup);this.media.addEventListener('error',cleanup);
  try{void this.media.play().catch(cleanup);}catch{cleanup();}
 }
 testFromGesture(){return this.play(tone(true),new AbortController().signal,{started:async()=>{},blocked:async()=>{}});}

 play(blob:Blob,signal:AbortSignal,callbacks:PlaybackCallbacks):Promise<void>{
  signal.throwIfAborted();this.stop();this.prepare(blob);
  return new Promise<void>((resolve,reject)=>{
   const task:PlaybackTask={signal,resolve,reject,callbacks,started:false,ended:false,attempting:false,blocked:false,receipts:Promise.resolve(),cleanup:()=>{}};
   const playing=()=>this.started(task);
   const ended=()=>{if(this.task!==task||task.ended)return;this.started(task);if(this.task!==task)return;task.ended=true;try{task.callbacks.ended?.();}catch(error){this.finish(task,error);return;}void task.receipts.then(()=>this.finish(task),error=>this.finish(task,error));};
   const error=()=>this.finish(task,new Error('音频无法播放，请在系统浏览器中重试。'));
   const abort=()=>this.finish(task,aborted());
   task.cleanup=()=>{this.media.removeEventListener('playing',playing);this.media.removeEventListener('ended',ended);this.media.removeEventListener('error',error);signal.removeEventListener('abort',abort);};
   this.task=task;this.media.addEventListener('playing',playing);this.media.addEventListener('ended',ended);this.media.addEventListener('error',error);signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted){abort();return;}this.attempt(task);
  });
 }
 /** No await before play(): this method must keep the button's user gesture. */
 resumeFromGesture(){if(this.task?.blocked)this.attempt(this.task);}
 stop(){if(this.task)this.finish(this.task,aborted());else this.clearSource();}

 private prepare(blob:Blob){this.url=this.urls.create(blob);this.media.src=this.url;this.media.muted=false;this.media.volume=1;this.media.playbackRate=1;this.media.preload='auto';this.media.setAttribute('playsinline','');}
 private attempt(task:PlaybackTask){
  if(this.task!==task||task.signal.aborted||task.attempting)return;task.attempting=true;
  const failed=(error:unknown)=>{
   if(this.task!==task)return;task.attempting=false;
   if(task.signal.aborted){this.finish(task,aborted());return;}
   if(!policyBlocked(error)){this.finish(task,error);return;}
   task.blocked=true;this.blockedChanged(true);
   this.receipt(task,task.callbacks.blocked);
  };
  try{void this.media.play().then(()=>{if(this.task!==task)return;task.attempting=false;this.started(task);},failed);}catch(error){failed(error);}
 }
 private started(task:PlaybackTask){
  if(this.task!==task||task.signal.aborted||task.started)return;task.started=true;task.blocked=false;this.blockedChanged(false);try{task.callbacks.playing?.();}catch(error){this.finish(task,error);return;}this.receipt(task,task.callbacks.started);
 }
 private receipt(task:PlaybackTask,action:()=>Promise<void>){
  task.receipts=task.receipts.then(async()=>{if(this.task!==task||task.signal.aborted)throw aborted();await action();});
  void task.receipts.catch(error=>this.finish(task,error));
 }
 private finish(task:PlaybackTask,error?:unknown){
  if(this.task!==task)return;this.task=null;task.cleanup();this.blockedChanged(false);this.clearSource();if(error)task.reject(error);else task.resolve();
 }
 private clearSource(){
  if(this.primeCleanup){const cleanup=this.primeCleanup;this.primeCleanup=null;this.media.removeEventListener('ended',cleanup);this.media.removeEventListener('error',cleanup);}
  this.media.pause();this.media.removeAttribute('src');this.media.load();if(this.url){this.urls.revoke(this.url);this.url='';}
 }
}

/** Local PCM only: the audible test never uses a model or records a microphone. */
function tone(audible:boolean){
 const rate=16000,count=Math.round(rate*(audible?.24:.04)),bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer);
 const tag=(at:number,text:string)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};
 tag(0,'RIFF');view.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,count*2,true);
 if(audible)for(let i=0;i<count;i++){const envelope=Math.min(i/(rate*.02),(count-i)/(rate*.05),1);view.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*660*i/rate)*.16*envelope*32767),true);}
 return new Blob([bytes],{type:'audio/wav'});
}
