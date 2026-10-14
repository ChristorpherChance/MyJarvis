import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomAudioPlayer} from '../../web/src/features/family/room-audio-player.js';

class Media extends EventTarget {
 src='';muted=true;volume=0;playbackRate=1;preload='';paused=true;calls:string[]=[];
 reject:unknown=null;pending:Promise<void>|null=null;
 play(){this.calls.push(this.src);if(this.reject)return Promise.reject(this.reject);if(this.pending)return this.pending;this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();}
 pause(){this.paused=true;}
 load(){}
 removeAttribute(key:string){if(key==='src')this.src='';}
 setAttribute(){}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){const media=new Media(),states:boolean[]=[],revoked:string[]=[],receipts:string[]=[];let created=0;
 const output=new RoomAudioPlayer(media as unknown as HTMLAudioElement,b=>states.push(b),{create:()=>`blob:voice-${++created}`,revoke:url=>revoked.push(url)});
 const callbacks={started:async()=>{receipts.push('started');},blocked:async()=>{receipts.push('blocked');}};
 return {media,states,revoked,receipts,output,callbacks,stats:()=>({created})};}
const audio=new Blob(['PCM'],{type:'audio/wav'});

test('blocked sound waits for a real resume without resynthesis or a false started receipt',async()=>{
 const f=fixture();f.media.reject=new DOMException('gesture needed','NotAllowedError');let done=false;
 const playback=f.output.play(audio,new AbortController().signal,f.callbacks).then(()=>done=true);await tick();
 assert.equal(done,false);assert.deepEqual(f.receipts,['blocked']);assert.equal(f.states.at(-1),true);const source=f.media.src;
 f.media.reject=null;f.output.resumeFromGesture();assert.equal(f.media.calls.length,2);assert.equal(f.media.src,source);await tick();assert.deepEqual(f.receipts,['blocked','started']);
 f.media.dispatchEvent(new Event('ended'));await playback;assert.equal(done,true);assert.equal(f.stats().created,1);assert.deepEqual(f.revoked,[source]);
});
test('same media element plays every sentence in order and preserves volume',async()=>{
 const f=fixture();for(let i=0;i<2;i++){const p=f.output.play(audio,new AbortController().signal,f.callbacks);await tick();f.media.dispatchEvent(new Event('ended'));await p;}
 assert.deepEqual(f.media.calls,['blob:voice-1','blob:voice-2']);assert.deepEqual(f.receipts,['started','started']);assert.equal(f.media.muted,false);assert.equal(f.media.volume,1);assert.equal(f.revoked.length,2);
});
test('gesture priming and manual retry invoke play synchronously',async()=>{
 const f=fixture();f.output.primeFromGesture();assert.equal(f.media.calls.length,1);f.media.reject=new DOMException('blocked','NotAllowedError');
 const controller=new AbortController(),p=f.output.play(audio,controller.signal,f.callbacks);await tick();const before=f.media.calls.length;f.output.resumeFromGesture();assert.equal(f.media.calls.length,before+1);controller.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(f.output.active,false);
});
test('native audio controls can recover a denied play exactly once',async()=>{
 const f=fixture();f.media.reject=new DOMException('blocked','NotAllowedError');const p=f.output.play(audio,new AbortController().signal,f.callbacks);await tick();
 f.media.dispatchEvent(new Event('playing'));f.media.dispatchEvent(new Event('playing'));await tick();f.media.dispatchEvent(new Event('ended'));await p;assert.deepEqual(f.receipts,['blocked','started']);
});
test('mute, identity change or page close cancels blocked audio and removes its source',async()=>{
 const f=fixture();f.media.reject=new DOMException('blocked','NotAllowedError');const controller=new AbortController(),p=f.output.play(audio,controller.signal,f.callbacks);await tick();controller.abort();await assert.rejects(p,{name:'AbortError'});
 const before=f.media.calls.length;f.output.resumeFromGesture();assert.equal(f.media.calls.length,before);assert.equal(f.media.src,'');assert.equal(f.states.at(-1),false);assert.deepEqual(f.receipts,['blocked']);assert.equal(f.revoked.length,1);
});
test('late policy rejection after cancellation cannot restore a blocked prompt or old sound',async()=>{
 const f=fixture();let reject!:(error:unknown)=>void;f.media.pending=new Promise<void>((_,r)=>reject=r);
 const controller=new AbortController(),p=f.output.play(audio,controller.signal,f.callbacks);controller.abort();await assert.rejects(p,{name:'AbortError'});reject(new DOMException('late','NotAllowedError'));await tick();assert.equal(f.states.at(-1),false);assert.deepEqual(f.receipts,[]);assert.equal(f.media.src,'');
});
test('unsupported audio fails instead of waiting forever for an activation click',async()=>{
 const f=fixture();f.media.reject=new DOMException('codec unavailable','NotSupportedError');await assert.rejects(f.output.play(audio,new AbortController().signal,f.callbacks),{name:'NotSupportedError'});assert.deepEqual(f.receipts,[]);assert(!f.states.includes(true));assert.equal(f.revoked.length,1);
});
test('blocked receipt settles before a manual started receipt, even with a slow connection',async()=>{
 const f=fixture();let release!:()=>void;const blocked=new Promise<void>(r=>release=r);f.media.reject=new DOMException('blocked','NotAllowedError');
 const p=f.output.play(audio,new AbortController().signal,{blocked:async()=>{f.receipts.push('blocked');await blocked;},started:f.callbacks.started});await tick();f.media.reject=null;f.output.resumeFromGesture();await tick();assert.deepEqual(f.receipts,['blocked']);release();await tick();assert.deepEqual(f.receipts,['blocked','started']);f.media.dispatchEvent(new Event('ended'));await p;
});
test('receipt failure stops playback and releases audio rather than claiming delivery',async()=>{
 const f=fixture();await assert.rejects(f.output.play(audio,new AbortController().signal,{blocked:async()=>{},started:async()=>{throw new Error('identity expired');}}),/identity expired/);assert.equal(f.media.paused,true);assert.equal(f.media.src,'');assert.equal(f.revoked.length,1);
});

test('real playing and ended hooks run synchronously before slow receipts, each exactly once',async()=>{
 const f=fixture();let release!:()=>void;const receipt=new Promise<void>(resolve=>{release=resolve;});const events:string[]=[];
 const p=f.output.play(audio,new AbortController().signal,{playing:()=>events.push('playing'),ended:()=>events.push('handoff'),started:async()=>{events.push('started-receipt');await receipt;},blocked:async()=>{}});
 assert.deepEqual(events,['playing']);await tick();assert.deepEqual(events,['playing','started-receipt']);f.media.dispatchEvent(new Event('ended'));f.media.dispatchEvent(new Event('ended'));assert.deepEqual(events,['playing','started-receipt','handoff']);assert.equal(f.output.active,true,'Delivery receipt remains pending while local microphone handoff is already armed');release();await p;assert.equal(f.output.active,false);
});

test('a synchronous playback hook failure rejects and cleans up instead of hanging the media promise',async()=>{
 const f=fixture();await assert.rejects(f.output.play(audio,new AbortController().signal,{...f.callbacks,playing:()=>{throw new Error('capture interrupted');}}),/capture interrupted/);assert.equal(f.media.src,'');assert.equal(f.output.active,false);
});
