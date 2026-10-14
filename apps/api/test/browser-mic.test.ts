import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserMicCapture} from '../../web/src/features/family/browser-mic.js';

test('speech onset is reported once, with pre-roll retained; abort releases the recorder for a new utterance',async()=>{
 const previousNode=globalThis.AudioWorkletNode,previousPerformance=globalThis.performance;let now=0,port:any;
 const noop=()=>{},connectable=()=>({connect:noop,disconnect:noop});
 class Worklet{port={onmessage:null as any,close:noop};constructor(){port=this.port;}connect=noop;disconnect=noop;}
 Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 const fake={audioWorklet:{addModule:async()=>{}},createMediaStreamSource:connectable,createGain:()=>({...connectable(),gain:{value:0}}),destination:{}} as unknown as AudioContext;
 let capture:BrowserMicCapture|undefined;
 try{capture=await BrowserMicCapture.create(fake,{} as MediaStream);const chunk=(rms:number)=>{now+=100;port.onmessage({data:new Float32Array(1600).fill(rms).buffer});};for(let n=0;n<6;n++)chunk(.015);
  const onset:number[]=[],recording=capture.record(new AbortController().signal,false,undefined,()=>onset.push(now));chunk(.02);assert.deepEqual(onset,[]);chunk(.08);chunk(.08);assert.equal(onset.length,1);for(let n=0;n<3;n++)chunk(.08);for(let n=0;n<11;n++)chunk(.015);const blob=await recording;assert(blob);assert.equal(onset.length,1);const wav=new DataView(await blob.arrayBuffer());assert.equal(wav.getUint32(24,true),16000);assert(wav.getUint32(40,true)>=5*1600*2,'Words leading up to the onset threshold must not be discarded');
  const control=new AbortController(),cancelled=capture.record(control.signal);control.abort();await assert.rejects(cancelled,{name:'AbortError'});let buffered=0;chunk(.08);chunk(.08);const next=new AbortController(),started=capture.record(next.signal,true,undefined,()=>buffered++);assert.equal(buffered,1);next.abort();await assert.rejects(started,{name:'AbortError'});
 }finally{capture?.close();Object.defineProperty(globalThis,'AudioWorkletNode',{value:previousNode,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});}
});

test('missing worklet frames are reported as a paused microphone; genuine silent frames are not',async()=>{
 const previousNode=globalThis.AudioWorkletNode,previousPerformance=globalThis.performance;let now=0,port:any;
 const noop=()=>{},connectable=()=>({connect:noop,disconnect:noop});
 class Worklet{port={onmessage:null as any,close:noop};constructor(){port=this.port;}connect=noop;disconnect=noop;}
 Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 const fake={audioWorklet:{addModule:async()=>{}},createMediaStreamSource:connectable,createGain:()=>({...connectable(),gain:{value:0}}),destination:{}} as unknown as AudioContext;
 let capture:BrowserMicCapture|undefined;
 try{capture=await BrowserMicCapture.create(fake,{} as MediaStream);const paused=capture.record(new AbortController().signal);now=4000;await assert.rejects(paused,error=>(error as any).code==='MIC_UNAVAILABLE');
  const controller=new AbortController(),silent=capture.record(controller.signal);const feed=setInterval(()=>{now+=100;port.onmessage({data:new Float32Array(1600).buffer});},40);await new Promise(resolve=>setTimeout(resolve,700));clearInterval(feed);controller.abort();await assert.rejects(silent,{name:'AbortError'});
 }finally{capture?.close();Object.defineProperty(globalThis,'AudioWorkletNode',{value:previousNode,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});}
});

test('real playback handoff retains a complete short reply during slow receipts, trims TTS, and consumes the reply once',async()=>{
 const previousNode=globalThis.AudioWorkletNode,previousPerformance=globalThis.performance;let now=0,port:any;
 const noop=()=>{},link=()=>({connect:noop,disconnect:noop});
 class Worklet{port={onmessage:null as any,close:noop};constructor(){port=this.port;}connect=noop;disconnect=noop;}
 Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 const fake={get currentTime(){return now/1000;},audioWorklet:{addModule:async()=>{}},createMediaStreamSource:link,createGain:()=>({...link(),gain:{value:0}}),destination:{}} as unknown as AudioContext;
 let capture:BrowserMicCapture|undefined;
 const samples=async(blob:Blob)=>{const view=new DataView(await blob.arrayBuffer());return Array.from({length:(view.byteLength-44)/2},(_,i)=>view.getInt16(44+i*2,true));};
 try{capture=await BrowserMicCapture.create(fake,{} as MediaStream);
  const frame=(rms:number)=>{now+=100;port.onmessage({data:{samples:new Float32Array(1600).fill(rms).buffer,endTime:now/1000}});};
  for(let i=0;i<6;i++)frame(.005);capture.setOutputActive(true);for(let i=0;i<4;i++)frame(.24);
  capture.markHandoff();now+=50;const crossing=new Float32Array(1600);crossing.fill(.24,0,800);crossing.fill(.08,800);port.onmessage({data:{samples:crossing.buffer,endTime:now/1000}});frame(.08);frame(.08);
  for(let i=0;i<8;i++)frame(0);let ready=0;const reply=capture.record(new AbortController().signal,false,undefined,undefined,()=>ready++);assert.equal(ready,1);assert.equal(capture.snapshot().active,true);for(let i=0;i<4;i++)frame(0);const result=await reply;assert(result,'The short answer ends before slow playback receipts finish, and must still be submitted');
  const first=await samples(result);assert(first.includes(Math.round(.08*32767)));assert(!first.includes(Math.round(.24*32767)),'The mixed boundary frame must exclude the old TTS half');assert.equal(capture.snapshot().lastCapture?.outcome,'speech');assert.equal(capture.snapshot().active,false);
  const control=new AbortController(),repeat=capture.record(control.signal);for(let i=0;i<101;i++)frame(0);assert.equal(await repeat,null,'The consumed user reply must not be submitted again');
  capture.setOutputActive(true);frame(.24);frame(.24);capture.markHandoff();frame(.11);frame(.11);frame(.11);const second=capture.record(new AbortController().signal);for(let i=0;i<12;i++)frame(0);const secondBlob=await second;assert(secondBlob);const next=await samples(secondBlob);assert(next.includes(Math.round(.11*32767)));assert(!next.includes(Math.round(.08*32767)));assert(!next.includes(Math.round(.24*32767)));
 }finally{capture?.close();Object.defineProperty(globalThis,'AudioWorkletNode',{value:previousNode,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});}
});

test('handoff audio is bounded to five seconds and stale speech does not enter the next turn',async()=>{
 const previousNode=globalThis.AudioWorkletNode,previousPerformance=globalThis.performance;let now=0,port:any;
 const noop=()=>{},link=()=>({connect:noop,disconnect:noop});
 class Worklet{port={onmessage:null as any,close:noop};constructor(){port=this.port;}connect=noop;disconnect=noop;}
 Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 const fake={audioWorklet:{addModule:async()=>{}},createMediaStreamSource:link,createGain:()=>({...link(),gain:{value:0}}),destination:{}} as unknown as AudioContext;let capture:BrowserMicCapture|undefined;
 try{capture=await BrowserMicCapture.create(fake,{} as MediaStream);const frame=(rms:number)=>{now+=100;port.onmessage({data:new Float32Array(1600).fill(rms).buffer});};capture.markHandoff();frame(.08);frame(.08);frame(.08);for(let i=0;i<60;i++)frame(0);
  const control=new AbortController(),recording=capture.record(control.signal);assert.equal(capture.snapshot().active,true);control.abort();await assert.rejects(recording,{name:'AbortError'});assert.equal(capture.snapshot().lastCapture?.outcome,'aborted');assert(capture.snapshot().lastCapture!.frameCount<=50);
 }finally{capture?.close();Object.defineProperty(globalThis,'AudioWorkletNode',{value:previousNode,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});}
});

test('speech while waiting between turns cannot retrain the noise floor or suppress the next ordinary reply',async()=>{
 const previousNode=globalThis.AudioWorkletNode,previousPerformance=globalThis.performance;let now=0,port:any;
 const noop=()=>{},link=()=>({connect:noop,disconnect:noop});
 class Worklet{port={onmessage:null as any,close:noop};constructor(){port=this.port;}connect=noop;disconnect=noop;}
 Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 const fake={audioWorklet:{addModule:async()=>{}},createMediaStreamSource:link,createGain:()=>({...link(),gain:{value:0}}),destination:{}} as unknown as AudioContext;let capture:BrowserMicCapture|undefined;
 try{capture=await BrowserMicCapture.create(fake,{} as MediaStream);const frame=(rms:number)=>{now+=100;port.onmessage({data:new Float32Array(1600).fill(rms).buffer});};
  for(let i=0;i<6;i++)frame(.01);const first=capture.record(new AbortController().signal);for(let i=0;i<3;i++)frame(.06);for(let i=0;i<12;i++)frame(.01);assert(await first);const floor=capture.snapshot().noiseFloor;
  // A slow network/model may leave local frames arriving with no active utterance listener.
  for(let i=0;i<110;i++)frame(.12);assert.equal(capture.snapshot().noiseFloor,floor,'The prior user words are not ambient calibration');
  const next=capture.record(new AbortController().signal);for(let i=0;i<10;i++)frame(.06);for(let i=0;i<100;i++)frame(.01);const result=await next;assert(result,'Ordinary speech must remain audible after the waiting gap');const bytes=new DataView(await result.arrayBuffer());assert(Array.from({length:(bytes.byteLength-44)/2},(_,i)=>bytes.getInt16(44+i*2,true)).includes(Math.round(.06*32767)));
 }finally{capture?.close();Object.defineProperty(globalThis,'AudioWorkletNode',{value:previousNode,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});}
});

test('after the actual calibration interval, speech during initial network preparation does not become ambient noise',async()=>{
 const previousNode=globalThis.AudioWorkletNode,previousPerformance=globalThis.performance;let now=0,port:any;
 const noop=()=>{},link=()=>({connect:noop,disconnect:noop});
 class Worklet{port={onmessage:null as any,close:noop};constructor(){port=this.port;}connect=noop;disconnect=noop;}
 Object.defineProperty(globalThis,'AudioWorkletNode',{value:Worklet,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
 const fake={audioWorklet:{addModule:async()=>{}},createMediaStreamSource:link,createGain:()=>({...link(),gain:{value:0}}),destination:{}} as unknown as AudioContext;let capture:BrowserMicCapture|undefined;
 try{capture=await BrowserMicCapture.create(fake,{} as MediaStream);const frame=(rms:number)=>{now+=100;port.onmessage({data:new Float32Array(1600).fill(rms).buffer});};const calibration=capture.calibrate();for(let i=0;i<6;i++)frame(.01);await calibration;const floor=capture.snapshot().noiseFloor;assert(floor>0);
  for(let i=0;i<110;i++)frame(.12);assert.equal(capture.snapshot().noiseFloor,floor,'Completed calibration must stay closed even before the first recording starts');
  const recording=capture.record(new AbortController().signal);for(let i=0;i<3;i++)frame(.06);for(let i=0;i<100;i++)frame(.01);assert(await recording,'The first reply must not inherit an energy threshold trained on preparation-time speech');
 }finally{capture?.close();Object.defineProperty(globalThis,'AudioWorkletNode',{value:previousNode,configurable:true,writable:true});Object.defineProperty(globalThis,'performance',{value:previousPerformance,configurable:true});}
});
