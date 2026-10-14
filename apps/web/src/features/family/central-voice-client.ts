export type CentralVoicePhase='idle'|'preparing'|'listening'|'transcribing'|'synthesizing'|'speaking';
export type VoicePlaybackOptions={language?:'zh'|'en'|'ja'|'fr'|'de'|'es'|'auto';voice?:'clear'|'warm'|'calm';pace?:'slow'|'normal'|'fast'};
export type VoiceSpeechPart={text:string;playback:VoicePlaybackOptions};
type Job={id:string;status:string;result:{text?:string;audioUrl?:string;message?:string;code?:string}};
export interface VoiceBrowser {
 fetch:typeof fetch; getUserMedia:(constraints:MediaStreamConstraints)=>Promise<MediaStream>;
 recorder:(stream:MediaStream)=>MediaRecorder; audio:(url:string)=>HTMLAudioElement;
 createUrl:(blob:Blob)=>string; revokeUrl:(url:string)=>void; secure:()=>boolean;
}
const browser=():VoiceBrowser=>({fetch:(...args)=>fetch(...args),getUserMedia:c=>navigator.mediaDevices.getUserMedia(c),recorder:stream=>{const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(v=>MediaRecorder.isTypeSupported(v));return new MediaRecorder(stream,mime?{mimeType:mime}:undefined);},audio:url=>new Audio(url),createUrl:b=>URL.createObjectURL(b),revokeUrl:u=>URL.revokeObjectURL(u),secure:()=>window.isSecureContext&&!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined'});
const aborted=()=>new DOMException('Aborted','AbortError');
/** Admin-local speech transport. It never selects an identity from a displayed family profile. */
export class CentralVoiceClient {
 private epoch=0;private control:AbortController|null=null;private session:string|null=null;private job:string|null=null;
 private stream:MediaStream|null=null;private recording:MediaRecorder|null=null;private player:HTMLAudioElement|null=null;private url='';private playing=false;
 private cleanup:Promise<void>=Promise.resolve();
 constructor(private readonly phase:(value:CentralVoicePhase)=>void=()=>{},private readonly env:VoiceBrowser=browser(),private readonly authExpired:()=>void=()=>{}){}
 private async request<T=any>(path:string,body?:unknown,signal?:AbortSignal,method?:string,acceptLateCreation=false):Promise<T>{
  const epoch=this.epoch;signal?.throwIfAborted();const response=await this.env.fetch(path,{credentials:'same-origin',method:method??(body===undefined?'GET':'POST'),...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal});const value=await response.json();if(signal?.aborted||epoch!==this.epoch){if(acceptLateCreation&&response.ok)return value;throw aborted();}
  if(!response.ok){if(response.status===401){void this.stop();this.authExpired();}throw Object.assign(new Error(value?.error?.message||value?.message||'中央语音请求未完成'),{status:response.status,code:value?.error?.code});}return value;
 }
 private check(epoch:number,signal:AbortSignal){if(signal.aborted||epoch!==this.epoch)throw aborted();}
 async stop(){
  ++this.epoch;this.control?.abort();this.control=null;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
  if(this.recording){this.recording.ondataavailable=null;this.recording.onstop=null;this.recording.onerror=null;try{if(this.recording.state==='recording')this.recording.stop();}catch{}this.recording=null;}
  if(this.player){this.player.pause();this.player.onended=null;this.player.onerror=null;this.player.src='';this.player=null;}
  if(this.url){this.env.revokeUrl(this.url);this.url='';}
  const id=this.session,job=this.job,playing=this.playing;this.session=null;this.job=null;this.playing=false;this.phase('idle');
  const prior=this.cleanup;this.cleanup=(async()=>{await prior;if(job&&playing)await this.request(`/api/runtime/voice/jobs/${job}/playback`,{state:'interrupted'}).catch(()=>{});if(job)await this.request(`/api/runtime/voice/jobs/${job}/cancel`,{}).catch(()=>{});if(id)await this.close(id);})();await this.cleanup;
 }
 private async close(id:string){await this.env.fetch(`/api/runtime/voice/sessions/${id}`,{method:'DELETE',credentials:'same-origin',keepalive:true}).catch(()=>{});}
 private async begin(kind:'asr'|'tts'){
  const cleaning=this.stop(),epoch=this.epoch;await cleaning;if(epoch!==this.epoch)throw aborted();const control=new AbortController();this.control=control;this.phase('preparing');
  try{
  const identity=await this.request('/api/runtime/identity/state',undefined,control.signal);this.check(epoch,control.signal);
  if(!identity.authenticated||!identity.administrator)throw new Error('管理页面语音需要管理员登录；家庭成员请从房间入口验证身份。');
  const state=await this.request('/api/runtime/voice/state',undefined,control.signal);this.check(epoch,control.signal);
  if(!state[kind]?.configured)throw new Error(`请在运行引擎中配置中央${kind==='asr'?'语音识别':'语音合成'}。`);
  if(state.guard?.quietHoursActive)throw new Error('当前处于本人安静时间，请继续文字交流。');if(state.guard?.remainingSeconds<=0)throw new Error('本人今日语音分钟已用完，请继续文字交流。');
  // Await a session creation even after cancellation, so a late response can be closed.
  const s=await this.request('/api/runtime/voice/sessions',{terminalId:'local',roomId:'study'},undefined,undefined,true);
  if(epoch!==this.epoch||control.signal.aborted){await this.close(s.id);throw aborted();}this.session=s.id;return {epoch,signal:control.signal,id:String(s.id)};
  }catch(error){if(epoch===this.epoch)await this.stop();throw error;}
 }
 private async poll(job:Job,epoch:number,signal:AbortSignal){this.job=job.id;while(['queued','running'].includes(job.status)){this.check(epoch,signal);await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(aborted());};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},200);signal.addEventListener('abort',abort,{once:true});});this.check(epoch,signal);job=await this.request<Job>(`/api/runtime/voice/jobs/${job.id}`,undefined,signal);}this.check(epoch,signal);if(job.status!=='complete')throw Object.assign(new Error(job.result.message||'中央语音任务未完成'),{code:job.result.code});return job;}
 private async play(job:Job,epoch:number,signal:AbortSignal){
  const path=job.result.audioUrl;if(!path||!/^\/api\/runtime\/voice\/jobs\/[0-9a-f-]+\/audio$/i.test(path))throw new Error('中央语音未返回有效音频。');
  const response=await this.env.fetch(path,{credentials:'same-origin',signal});this.check(epoch,signal);if(!response.ok){if(response.status===401)this.authExpired();throw new Error('音频已过期或登录失效，请重新朗读。');}
  const data=await response.blob();this.check(epoch,signal);const objectUrl=this.env.createUrl(data);this.url=objectUrl;const player=this.env.audio(objectUrl);this.player=player;this.playing=true;
  let abort=()=>{};const ended=new Promise<void>((resolve,reject)=>{abort=()=>{player.pause();reject(aborted());};player.onended=()=>resolve();player.onerror=()=>reject(new Error('音频播放未完成，请重新点击朗读。'));signal.addEventListener('abort',abort,{once:true});});
  // Install the rejection handler before awaiting play(), which may itself be blocked.
  void ended.catch(()=>{});
  try{await player.play();this.check(epoch,signal);this.phase('speaking');await this.request(`/api/runtime/voice/jobs/${job.id}/playback`,{state:'started'},signal);await ended;this.check(epoch,signal);await this.request(`/api/runtime/voice/jobs/${job.id}/playback`,{state:'ended'},signal);this.playing=false;}
  catch(error){if(!signal.aborted){await this.request(`/api/runtime/voice/jobs/${job.id}/playback`,{state:'blocked'}).catch(()=>{});if(epoch===this.epoch)this.playing=false;}throw error;}
  finally{signal.removeEventListener('abort',abort);player.pause();player.onended=null;player.onerror=null;if(this.player===player)this.player=null;if(this.url===objectUrl){this.env.revokeUrl(objectUrl);this.url='';}}
 }
 async speak(text:string,cloudConsent=false,playback:VoicePlaybackOptions={}){
  await this.speakSegments([{text,playback}],cloudConsent);
 }
 async speakSegments(parts:readonly VoiceSpeechPart[],cloudConsent=false){
  const frozen=parts.filter(part=>part.text.trim()).map(part=>({text:part.text,playback:{...part.playback}}));if(!frozen.length)return;let epoch:number|undefined;
  try{const op=await this.begin('tts');epoch=op.epoch;
   // Long stories are spoken completely, in ordered chunks within the server's 8000-char limit.
   for(const {text,playback} of frozen)for(let start=0;start<text.length;start+=1000){this.check(op.epoch,op.signal);this.phase('synthesizing');const job=await this.request<Job>(`/api/runtime/voice/sessions/${op.id}/speech`,{text:text.slice(start,start+1000),cloudConsent,playback},op.signal);await this.play(await this.poll(job,op.epoch,op.signal),op.epoch,op.signal);this.job=null;}
  }finally{if(epoch!==undefined&&epoch===this.epoch)await this.stop();}
 }
 finishRecording(){try{if(this.recording?.state==='recording')this.recording.stop();}catch{}}
 async listen(cloudConsent=false,_language:VoicePlaybackOptions['language']='auto'):Promise<string>{
  let epoch:number|undefined;
  try{const op=await this.begin('asr');epoch=op.epoch;if(!this.env.secure())throw new Error('麦克风需要localhost或HTTPS；也可继续输入文字。');
   const media=await this.env.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(op.epoch!==this.epoch||op.signal.aborted){media.getTracks().forEach(track=>track.stop());throw aborted();}this.stream=media;
   const rec=this.env.recorder(media);this.recording=rec;this.phase('listening');const chunks:BlobPart[]=[];
   const blob=await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>this.finishRecording(),60000);const cleanup=()=>{clearTimeout(timer);op.signal.removeEventListener('abort',abort);};const abort=()=>{cleanup();reject(aborted());};op.signal.addEventListener('abort',abort,{once:true});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>{cleanup();resolve(new Blob(chunks,{type:rec.mimeType||'audio/webm'}));};rec.onerror=()=>{cleanup();reject(new Error('录音未完成，请检查麦克风权限。'));};rec.start(250);});
   media.getTracks().forEach(track=>track.stop());if(this.stream===media)this.stream=null;this.recording=null;this.check(op.epoch,op.signal);if(!blob.size)throw new Error('未录到音频，请再试一次。');this.phase('transcribing');
   const response=await this.env.fetch(`/api/runtime/voice/sessions/${op.id}/audio`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type,'X-Jarvis-Language':'auto',...(cloudConsent?{'X-Jarvis-Cloud-Consent':'true'}:{})},body:blob,signal:op.signal});const result=await response.json();this.check(op.epoch,op.signal);if(!response.ok){if(response.status===401)this.authExpired();throw Object.assign(new Error(result?.error?.message||'中央语音识别未完成'),{code:result?.error?.code});}return (await this.poll(result,op.epoch,op.signal)).result.text||'';
  }finally{if(epoch!==undefined&&epoch===this.epoch)await this.stop();}
 }
}
