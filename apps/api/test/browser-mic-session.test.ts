import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserMicSession,type MicEnvironment} from '../../web/src/features/family/browser-mic-session.js';
import {requiresWakeCheck} from '../../web/src/features/family/voice-conversation-mode.js';

function fixture({stalled=false,worklet=true,fallback=false}={}){
 const events:string[]=[],contexts:any[]=[],tracks:any[]=[],captures:any[]=[],messages:string[]=[];
 let acquire:()=>Promise<MediaStream>=async()=>makeStream();
 const makeStream=()=>{const track=Object.assign(new EventTarget(),{readyState:'live',enabled:true,muted:false,stop(){this.readyState='ended';events.push('track-stop');}});tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]} as unknown as MediaStream;};
 const env:MicEnvironment={secure:()=>true,activationTimeoutMs:20,recorderAvailable:()=>fallback,getUserMedia:()=>{events.push('permission-request');return acquire();},
  createContext:()=>{const ctx=Object.assign(new EventTarget(),{state:'suspended',audioWorklet:worklet?{}:undefined,resume(){events.push('resume');if(stalled)return new Promise<void>(()=>{});this.state='running';return Promise.resolve();},close(){this.state='closed';events.push('context-close');return Promise.resolve();}});contexts.push(ctx);events.push('context-create');return ctx as unknown as AudioContext;},
  createCapture:async()=>{const capture={calibrate:async()=>{},close:()=>events.push('capture-close')};captures.push(capture);return capture as any;}
 };
 const mic=new BrowserMicSession(env,message=>messages.push(message),message=>messages.push(message));
 return {mic,env,events,contexts,tracks,captures,messages,makeStream,setAcquire:(next:()=>Promise<MediaStream>)=>{acquire=next;}};
}

test('mobile audio is unlocked synchronously during the click, before network and microphone permission awaits',async()=>{
 const f=fixture();f.mic.primeFromGesture();assert.deepEqual(f.events,['context-create','resume']);await Promise.resolve();
 const ready=await f.mic.prepare();assert(f.events.indexOf('resume')<f.events.indexOf('permission-request'));assert.equal(ready.context.state,'running');assert.equal((await f.mic.prepare()).stream,ready.stream);f.mic.release();assert.equal(f.tracks[0].readyState,'ended');
});

test('blocked mobile activation fails promptly, cleans the microphone, and allows a clean subsequent attempt',async()=>{
 const f=fixture({stalled:true});await assert.rejects(f.mic.prepare(),/再次点击/);assert.equal(f.tracks[0].readyState,'ended');assert.equal(f.contexts[0].state,'closed');
 f.env.createContext=()=>{const ctx=Object.assign(new EventTarget(),{state:'running',audioWorklet:{},resume:async()=>{},close:async()=>{ctx.state='closed';}});return ctx as unknown as AudioContext;};
 assert.equal((await f.mic.prepare()).stream.getAudioTracks()[0].readyState,'live');assert.equal(f.tracks.length,2);f.mic.release();
});

test('worklet failure falls back to MediaRecorder without retaining a half-initialized capture',async()=>{
 const f=fixture({fallback:true});f.env.createCapture=async()=>{throw new Error('worklet rejected');};const ready=await f.mic.prepare();assert.equal(ready.capture,null);assert.match(f.messages[0],/兼容收音/);assert.equal(ready.context.state,'running');f.mic.release();
});

test('a worklet failure without recorder fallback releases resources and can be retried',async()=>{
 const f=fixture();let first=true;f.env.createCapture=async()=>{if(first){first=false;throw new Error('first load failed');}return {calibrate:async()=>{},close:()=>{}} as any;};
 await assert.rejects(f.mic.prepare(),/first load failed/);assert.equal(f.tracks[0].readyState,'ended');assert.equal(f.contexts[0].state,'closed');await f.mic.prepare();assert.equal(f.tracks.length,2);f.mic.release();
});

test('a microphone grant arriving after cancellation is stopped and cannot overwrite a later session',async()=>{
 const f=fixture();let grant!:(value:MediaStream)=>void;f.setAcquire(()=>new Promise(resolve=>{grant=resolve;}));const controller=new AbortController(),opening=f.mic.prepare(controller.signal);controller.abort();f.mic.release();const late=f.makeStream();grant(late);await assert.rejects(opening,{name:'AbortError'});assert.equal(late.getAudioTracks()[0].readyState,'ended');assert.equal(f.contexts[0].state,'closed');
 f.setAcquire(async()=>f.makeStream());const ready=await f.mic.prepare();assert.equal(ready.context.state,'running');assert.equal(ready.stream.getAudioTracks()[0].readyState,'live');f.mic.release();
});

test('suspended audio and ended microphone tracks pause once instead of silently recording zeros',async()=>{
 for(const reason of ['context','track']){const f=fixture();await f.mic.prepare();if(reason==='context'){f.contexts[0].state='suspended';f.contexts[0].dispatchEvent(new Event('statechange'));}else{f.tracks[0].readyState='ended';f.tracks[0].dispatchEvent(new Event('ended'));}
  assert.equal(f.messages.length,1);assert.match(f.messages[0],/暂停收音/);assert.equal(f.contexts[0].state,'closed');f.tracks[0].dispatchEvent(new Event('ended'));assert.equal(f.messages.length,1);await f.mic.prepare();assert.equal(f.tracks.length,2);f.mic.release();
 }
});

test('explicit conversations remain direct after 45 seconds; standby still requires a keyword at speech onset',()=>{
 const later=120_000;
 assert.equal(requiresWakeCheck({handsfree:true,conversationActive:true,wakeUntil:45_000,now:later}),false);
 assert.equal(requiresWakeCheck({handsfree:true,conversationActive:false,wakeUntil:45_000,now:later}),true);
 assert.equal(requiresWakeCheck({handsfree:true,conversationActive:false,wakeUntil:45_000,now:30_000}),false);
 assert.equal(requiresWakeCheck({handsfree:false,conversationActive:false,wakeUntil:0,now:later}),false);
});

test('a short track mute recovers without releasing a ready microphone or requesting permission again',async()=>{
 const f=fixture();const ready=await f.mic.prepare();f.tracks[0].muted=true;f.tracks[0].dispatchEvent(new Event('mute'));const restoring=f.mic.prepare();await new Promise(resolve=>setTimeout(resolve,20));f.tracks[0].muted=false;f.tracks[0].dispatchEvent(new Event('unmute'));const restored=await restoring;assert.equal(restored.stream,ready.stream);assert.equal(f.tracks.length,1);assert.equal(f.messages.length,0);assert.equal(restored.context.state,'running');f.mic.release();
});
