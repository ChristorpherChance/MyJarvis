/** Energy-based endpointing. This is not a neural speech detector or ASR confidence. */
export type CaptureSettings={pauseMs:800|1100|1600;sensitivity:'normal'|'soft'|'noisy';language:'profile'|'zh'|'en'|'fr'|'de'|'auto';bargeIn:boolean};
export const defaultCaptureSettings:CaptureSettings={pauseMs:1100,sensitivity:'normal',language:'profile',bargeIn:true};
export function parseCaptureSettings(value:unknown):CaptureSettings{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {pauseMs:[800,1100,1600].includes(Number(v.pauseMs))?Number(v.pauseMs) as CaptureSettings['pauseMs']:1100,sensitivity:['normal','soft','noisy'].includes(String(v.sensitivity))?v.sensitivity as CaptureSettings['sensitivity']:'normal',language:['profile','zh','en','fr','de','auto'].includes(String(v.language))?v.language as CaptureSettings['language']:'profile',bargeIn:v.bargeIn!==false};
}
/** Reject short bursts and the initial output transient before accepting barge-in. */
export class BargeSpeechGate{
 private speechSince:number|null=null;
 constructor(private started=Date.now()){}
 accept(rms:number,now=Date.now()){
  if(now-this.started<900||!Number.isFinite(rms)||rms<=.05){this.speechSince=null;return false;}
  this.speechSince??=now;return now-this.speechSince>=450;
 }
}
export class SpeechEndpoint{
 private start:number;private lastSpeech:number;private voicedMs=0;private lastFrame:number;private noise:number;
 sawSpeech=false;
 private readonly minimum:number;
 constructor(readonly settings:CaptureSettings=defaultCaptureSettings,now=performance.now(),preRollSpeech=false,noiseFloor=0){this.start=now;this.lastSpeech=now;this.lastFrame=now;this.sawSpeech=preRollSpeech;this.minimum={normal:.009,soft:.0045,noisy:.025}[settings.sensitivity];this.noise=Number.isFinite(noiseFloor)?Math.max(0,Math.min(.15,noiseFloor)):0;}
 get threshold(){return Math.max(this.minimum,Math.min(.25,this.noise*{normal:2.4,soft:1.8,noisy:3.2}[this.settings.sensitivity]));}
 accept(rms:number,now=performance.now()){
  const elapsed=Math.min(100,Math.max(0,now-this.lastFrame));this.lastFrame=now;
  if(Number.isFinite(rms)&&rms>this.threshold){this.voicedMs+=elapsed;this.lastSpeech=now;if(this.voicedMs>=120)this.sawSpeech=true;}
  else{if(!this.sawSpeech)this.voicedMs=Math.max(0,this.voicedMs-elapsed);if(Number.isFinite(rms)&&rms>=0)this.noise=this.noise*.95+Math.min(rms,this.threshold)*.05;}
  return now-this.start>=45000||this.sawSpeech&&now-this.lastSpeech>=this.settings.pauseMs&&now-this.start>=800||!this.sawSpeech&&now-this.start>=10000;
 }
}
