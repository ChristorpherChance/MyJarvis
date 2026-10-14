import {BrowserMicCapture} from './browser-mic';

const aborted=()=>new DOMException('Aborted','AbortError');
const audioActivationMessage='手机已暂停收音，请回到页面并再次点击“开始交流”。';
export type MicResources={stream:MediaStream;context:AudioContext;capture:BrowserMicCapture|null};
export type MicEnvironment={
 secure:()=>boolean;createContext:()=>AudioContext;
 getUserMedia:()=>Promise<MediaStream>;
 createCapture:(context:AudioContext,stream:MediaStream)=>Promise<BrowserMicCapture>;
 recorderAvailable:()=>boolean;
 activationTimeoutMs?:number;
};

/** Acquire microphone resources transactionally; mobile audio unlock must happen in a click. */
export class BrowserMicSession{
 private generation=0;private context:AudioContext|null=null;private stream:MediaStream|null=null;
 private capture:BrowserMicCapture|null=null;private ready=false;private preparing:Promise<MicResources>|null=null;
 private unlock:Promise<void>|null=null;private cleanupListeners:(()=>void)|null=null;
 constructor(private readonly env:MicEnvironment,private readonly interrupted:(message:string)=>void=()=>{},private readonly notice:(message:string)=>void=()=>{}){}
 /** This deliberately starts resume() synchronously, before network or permission awaits. */
 primeFromGesture(){
  try{if(!this.context||this.context.state==='closed')this.context=this.env.createContext();
   if(this.context.state!=='running'){this.unlock=this.context.resume();void this.unlock.catch(()=>{});}
  }catch{ /* prepare() reports a useful error if the browser cannot create audio. */ }
 }
 async prepare(signal?:AbortSignal):Promise<MicResources>{
  signal?.throwIfAborted();if(!this.env.secure())throw new Error('麦克风需要本机localhost或HTTPS地址');
  if(this.ready&&this.context&&this.stream){
   const generation=this.generation,context=this.context,stream=this.stream;
   if(context.state==='running'&&stream.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled)){
    // Use the same brief recovery window as the mute listener, rather than ending on a transient focus change.
    if(stream.getAudioTracks().every(track=>track.muted))await this.waitForUnmute(stream,signal);
    signal?.throwIfAborted();if(generation!==this.generation)throw aborted();
    if(context.state==='running'&&stream.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted))return {stream,context,capture:this.capture};
   }
   this.release();throw new Error(audioActivationMessage);
  }
  if(this.preparing)return this.wait(this.preparing,signal);
  // Creating the context before getUserMedia also covers direct click-to-listen entry points.
  this.primeFromGesture();const generation=this.generation,context=this.context;
  if(!context)throw new Error('浏览器无法开启收音，请在手机系统浏览器中打开页面。');
  const work=this.acquire(generation,context,signal);this.preparing=work;
  try{return await work;}finally{if(this.preparing===work)this.preparing=null;}
 }
 private async acquire(generation:number,context:AudioContext,signal?:AbortSignal):Promise<MicResources>{
  let stream:MediaStream|null=null,capture:BrowserMicCapture|null=null;
  const check=()=>{signal?.throwIfAborted();if(generation!==this.generation)throw aborted();};
  try{
   stream=await this.env.getUserMedia();check();
   if(!stream.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled&&!track.muted))throw new Error('麦克风没有输入，请检查手机麦克风权限或关闭其他正在录音的应用。');
   if(context.state!=='running')await this.wait(this.unlock??context.resume(),signal,this.env.activationTimeoutMs??3500,audioActivationMessage);
   check();if(context.state!=='running')throw new Error(audioActivationMessage);
   if(context.audioWorklet){
    let retain=true;const loading=this.env.createCapture(context,stream);
    // A cancelled or timed-out worklet may still finish; it must not retain the microphone.
    void loading.then(value=>{if(!retain||generation!==this.generation)value.close();},()=>{});
    try{capture=await this.wait(loading,signal,8000,'收音组件加载超时，请检查连接后重试。');}
    catch(error){retain=false;check();if(!this.env.recorderAvailable())throw error;this.notice('已使用浏览器兼容收音模式。');}
   }
   if(!capture&&!this.env.recorderAvailable())throw new Error('当前浏览器不支持录音，请在手机系统浏览器中打开。');
   if(capture)await capture.calibrate(signal);check();if(context.state!=='running')throw new Error(audioActivationMessage);
   this.context=context;this.stream=stream;this.capture=capture;this.ready=true;
   this.watch(context,stream,generation);return {stream,context,capture};
  }catch(error){capture?.close();stream?.getTracks().forEach(track=>track.stop());if(generation===this.generation)this.release();throw error;}
 }
 private watch(context:AudioContext,stream:MediaStream,generation:number){
  const lost=()=>{if(generation!==this.generation||!this.ready)return;this.release();this.interrupted(audioActivationMessage);};
  const state=()=>{if(context.state!=='running')lost();};
  let muteTimer:ReturnType<typeof setTimeout>|undefined;
  const muted=()=>{if(muteTimer)clearTimeout(muteTimer);muteTimer=setTimeout(()=>{if(stream.getAudioTracks().every(track=>track.muted||track.readyState!=='live'))lost();},1500);};
  const unmuted=()=>{if(muteTimer)clearTimeout(muteTimer);muteTimer=undefined;};
  context.addEventListener('statechange',state);for(const track of stream.getAudioTracks()){track.addEventListener('ended',lost);track.addEventListener('mute',muted);track.addEventListener('unmute',unmuted);}
  this.cleanupListeners=()=>{unmuted();context.removeEventListener('statechange',state);for(const track of stream.getAudioTracks()){track.removeEventListener('ended',lost);track.removeEventListener('mute',muted);track.removeEventListener('unmute',unmuted);}};
 }
 private waitForUnmute(stream:MediaStream,signal?:AbortSignal){
  return new Promise<void>((resolve,reject)=>{const tracks=stream.getAudioTracks();let done=false;
   const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);for(const track of tracks){track.removeEventListener('unmute',check);track.removeEventListener('ended',check);}if(error)reject(error);else resolve();};
   const check=()=>{if(tracks.some(track=>track.readyState==='live'&&!track.muted))finish();else if(tracks.every(track=>track.readyState!=='live'))finish(new Error(audioActivationMessage));};
   const abort=()=>finish(aborted()),timer=setTimeout(()=>finish(new Error(audioActivationMessage)),1500);
   signal?.addEventListener('abort',abort,{once:true});for(const track of tracks){track.addEventListener('unmute',check);track.addEventListener('ended',check);}check();
  });
 }
 private async wait<T>(promise:Promise<T>,signal?:AbortSignal,timeoutMs?:number,message='收音暂时无法开始，请重试。'):Promise<T>{
  signal?.throwIfAborted();return new Promise<T>((resolve,reject)=>{
   let settled=false;const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value!);};
   const abort=()=>finish(aborted()),timer=timeoutMs?setTimeout(()=>finish(new Error(message)),timeoutMs):undefined;
   signal?.addEventListener('abort',abort,{once:true});promise.then(value=>finish(null,value),error=>finish(error));
  });
 }
 release(){
  ++this.generation;this.ready=false;this.cleanupListeners?.();this.cleanupListeners=null;this.preparing=null;this.unlock=null;
  const capture=this.capture,stream=this.stream,context=this.context;this.capture=null;this.stream=null;this.context=null;
  capture?.close();stream?.getTracks().forEach(track=>track.stop());if(context&&context.state!=='closed'){try{void context.close().catch(()=>{});}catch{}}
 }
}
