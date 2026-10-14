import {SpeechEndpoint,defaultCaptureSettings,type CaptureSettings} from './speech-endpoint';
import type {CaptureSnapshot} from './capture-diagnostics';
/** 16 kHz PCM recording with a short pre-roll so barge-in retains the first words. */
export function pcmWav(chunks:Float32Array[]):Blob{
 const count=chunks.reduce((n,c)=>n+c.length,0),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
 const ascii=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 ascii(0,'RIFF');view.setUint32(4,36+count*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,count*2,true);
 let offset=44;for(const chunk of chunks)for(const sample of chunk){view.setInt16(offset,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);offset+=2;}return new Blob([buffer],{type:'audio/wav'});
}
export class BrowserMicCapture{
 private recent:{samples:Float32Array;startAt:number;endAt:number}[]=[];private levels:number[]=[];
 private lastFrameAt=performance.now();private frameCount=0;private rms=0;private peak=0;
 private outputActive=false;private calibrating=true;private handoffAt:number|null=null;private activeDetector:SpeechEndpoint|null=null;private lastThreshold:number|null=null;
 private lastCapture:CaptureSnapshot['lastCapture']=null;private listener:((chunk:Float32Array,rms:number,at:number)=>void)|null=null;private source:MediaStreamAudioSourceNode;private node:AudioWorkletNode;private sink:GainNode;
 private constructor(context:AudioContext,stream:MediaStream,onLevel?:(rms:number,peak:number)=>void){
  this.source=context.createMediaStreamSource(stream);this.node=new AudioWorkletNode(context,'jarvis-voice-capture',{processorOptions:{timestamps:true}});this.sink=context.createGain();this.sink.gain.value=0;this.source.connect(this.node);this.node.connect(this.sink);this.sink.connect(context.destination);
  this.node.port.onmessage=event=>{const receivedAt=performance.now(),payload=event.data,chunk=new Float32Array(payload?.samples??payload);
   if(!chunk.length)return;const clock=Number(context.currentTime),sampleEnd=Number(payload?.endTime);
   const endAt=Number.isFinite(sampleEnd)&&Number.isFinite(clock)?Math.min(receivedAt,receivedAt+(sampleEnd-clock)*1000):receivedAt;
   this.lastFrameAt=receivedAt;this.frameCount++;this.rms=Math.sqrt(chunk.reduce((n,x)=>n+x*x,0)/chunk.length);this.peak=chunk.reduce((peak,x)=>Math.max(peak,Math.abs(x)),0);
   this.recent.push({samples:chunk,startAt:endAt-chunk.length/16,endAt});this.prune(receivedAt);
   // An armed handoff belongs to the next user turn, rather than ambient calibration.
   if(this.calibrating&&!this.listener&&!this.outputActive&&this.handoffAt===null)this.ambient(this.rms);
   onLevel?.(this.rms,this.peak);this.listener?.(chunk,this.rms,endAt);
  };
 }
 static async create(context:AudioContext,stream:MediaStream,onLevel?:(rms:number,peak:number)=>void){await context.audioWorklet.addModule('/voice-capture-worklet.js?rev=voice-handoff-r15');return new BrowserMicCapture(context,stream,onLevel);}
 /** Initial ambient sample occurs before the greeting, never over the user's utterance. */
 async calibrate(signal?:AbortSignal){this.calibrating=true;try{signal?.throwIfAborted();await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},600);signal?.addEventListener('abort',abort,{once:true});});signal?.throwIfAborted();}finally{this.calibrating=false;}}
 setOutputActive(active:boolean){this.outputActive=active;if(active){this.recent=[];this.handoffAt=null;}}
 /** Arm a bounded next-turn buffer at real playback end, before network playback receipts. */
 markHandoff(lookbackMs=0){this.outputActive=false;this.handoffAt=performance.now()-Math.max(0,Math.min(1400,lookbackMs));this.prune(performance.now());}
 private prune(now:number){while(this.recent.length&&(this.recent[0].endAt<now-5000||this.recent.length>50))this.recent.shift();}
 private ambient(rms:number){this.levels.push(rms);if(this.levels.length>100)this.levels.shift();}
 snapshot():CaptureSnapshot{return {frameCount:this.frameCount,lastFrameAgeMs:this.frameCount?Math.max(0,performance.now()-this.lastFrameAt):null,rms:Math.min(1,this.rms),peak:Math.min(1,this.peak),noiseFloor:ambientNoiseFloor(this.levels),threshold:this.activeDetector?.threshold??this.lastThreshold,active:!!this.listener,lastCapture:this.lastCapture?{...this.lastCapture}:null};}
 record(signal:AbortSignal,preRoll=false,settings:CaptureSettings=defaultCaptureSettings,onSpeechStarted?:()=>void,onReady?:()=>void):Promise<Blob|null>{
  signal.throwIfAborted();if(this.listener)throw new Error('麦克风正在使用');this.calibrating=false;const now=performance.now();this.prune(now);
  const boundary=Math.max(now-5000,this.handoffAt??(preRoll?now-1400:now));
  const buffered=this.recent.filter(frame=>frame.endAt>boundary).map(frame=>({samples:frame.samples.slice(Math.max(0,Math.ceil((boundary-frame.startAt)*16))),endAt:frame.endAt})).filter(frame=>frame.samples.length);
  // Consume once. A later round cannot upload the previous user's words a second time.
  this.handoffAt=null;this.recent=[];const chunks:Float32Array[]=buffered.map(frame=>frame.samples);
  const detector=new SpeechEndpoint(settings,buffered.length?buffered[0].endAt-buffered[0].samples.length/16:now,false,ambientNoiseFloor(this.levels));
  for(const frame of buffered){const rms=Math.sqrt(frame.samples.reduce((n,x)=>n+x*x,0)/frame.samples.length);detector.accept(rms,frame.endAt);}
  this.activeDetector=detector;
  return new Promise((resolve,reject)=>{let done=false,reported=detector.sawSpeech,capturedFrames=buffered.length;if(reported)onSpeechStarted?.();const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(inputWatch);this.listener=null;this.lastThreshold=detector.threshold;this.activeDetector=null;this.recent=[];signal.removeEventListener('abort',abort);this.lastCapture={outcome:error?(error.name==='AbortError'?'aborted':'unavailable'):detector.sawSpeech?'speech':'silence',durationMs:Math.max(0,performance.now()-now),frameCount:capturedFrames};if(error)reject(error);else resolve(detector.sawSpeech?pcmWav(chunks):null);};const abort=()=>finish(new DOMException('Aborted','AbortError'));const timer=setTimeout(()=>finish(),45000);const inputWatch=setInterval(()=>{if(performance.now()-this.lastFrameAt>=3000)finish(Object.assign(new Error('收音已暂停，请重新点击“开始交流”并检查麦克风权限。'),{code:'MIC_UNAVAILABLE'}));},500);signal.addEventListener('abort',abort,{once:true});this.listener=(chunk,rms,at)=>{capturedFrames++;chunks.push(chunk);if(!this.outputActive&&rms<=detector.threshold)this.ambient(rms);const ended=detector.accept(rms,at);if(detector.sawSpeech&&!reported){reported=true;onSpeechStarted?.();}if(!detector.sawSpeech&&chunks.length>5)chunks.splice(0,chunks.length-5);if(ended)finish();};onReady?.();});
 }
 close(){this.listener=null;this.activeDetector=null;this.handoffAt=null;this.node.port.onmessage=null;this.node.port.close();this.source.disconnect();this.node.disconnect();this.sink.disconnect();this.recent=[];this.levels=[];}
}
/** Lower quartile avoids calibrating against the user's current words or brief output echo. */
export function ambientNoiseFloor(levels:number[]):number{const valid=levels.filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);return valid.length>=5?Math.min(.15,valid[Math.floor((valid.length-1)*.25)]):0;}
