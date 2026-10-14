import test from 'node:test';
import assert from 'node:assert/strict';
import {PreparedSpeechStream} from '../../web/src/features/family/prepared-speech.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('approved sentences play before stream completion and later sentences prepare during real playback with one lookahead',async()=>{
 const control=new AbortController(),prepared:string[]=[],played:string[]=[],discarded:string[]=[],ends:(()=>void)[]=[];
 const q=new PreparedSpeechStream(control.signal,{prepare:async(text,previous)=>{prepared.push(text);if(previous)assert.equal(previous,played.at(-1));return text;},play:async(text,_signal,started)=>{played.push(text);started();await new Promise<void>(resolve=>ends.push(resolve));},discard:async text=>{discarded.push(text);}});
 q.push('我在。');await tick();assert.deepEqual(played,['我在。']);q.push('我们可以一起学历史。');q.push('从唐朝开始。');await tick();assert.deepEqual(prepared,['我在。','我们可以一起学历史。']);assert.deepEqual(played,['我在。']);
 ends.shift()!();await tick();assert.deepEqual(played,['我在。','我们可以一起学历史。']);assert.deepEqual(prepared,['我在。','我们可以一起学历史。','从唐朝开始。']);let complete=false;const closing=q.finish().then(()=>{complete=true;});await tick();assert.equal(complete,false);ends.shift()!();await tick();ends.shift()!();await closing;assert.deepEqual(played,['我在。','我们可以一起学历史。','从唐朝开始。']);assert.deepEqual(discarded,[]);
});

test('a sentence arriving after an earlier sentence ended still uses the exact predecessor dependency',async()=>{
 const dependencies:[string,string|undefined][]=[],spoken:string[]=[];
 const q=new PreparedSpeechStream(new AbortController().signal,{prepare:async(text,previous)=>{dependencies.push([text,previous]);return text;},play:async(text,_signal,started)=>{spoken.push(text);started();},discard:async()=>{}});
 q.push('第一句。');await tick();assert.deepEqual(spoken,['第一句。']);q.push('后续一句。');await tick();await q.finish();assert.deepEqual(dependencies,[['第一句。',undefined],['后续一句。','第一句。']]);
});

test('blocked media does not synthesize later sentences until playback is actually acknowledged',async()=>{
 const controller=new AbortController(),prepared:string[]=[],discarded:string[]=[];
 const q=new PreparedSpeechStream(controller.signal,{prepare:async text=>{prepared.push(text);return text;},play:(_value,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})),discard:async value=>{discarded.push(value);}});
 q.push('第一句。');q.push('第二句。');await tick();assert.deepEqual(prepared,['第一句。']);controller.abort();await assert.rejects(q.finish(),{name:'AbortError'});assert.deepEqual(discarded,['第一句。']);
});

test('stream cancellation discards a late lookahead and never plays another sentence',async()=>{
 const control=new AbortController(),spoken:string[]=[],discarded:string[]=[];let resolveNext!:(value:string)=>void;
 const q=new PreparedSpeechStream(control.signal,{prepare:text=>text==='第一句。'?Promise.resolve(text):new Promise(resolve=>{resolveNext=resolve;}),play:(text,signal,started)=>{spoken.push(text);started();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));},discard:async text=>{discarded.push(text);}});
 q.push('第一句。');q.push('第二句。');await tick();q.cancel();await assert.rejects(q.finish(),{name:'AbortError'});resolveNext('第二句。');await tick();assert.deepEqual(spoken,['第一句。']);assert.deepEqual(discarded.sort(),['第一句。','第二句。'].sort());
});

test('a synthesis failure is surfaced without an unhandled rejection or replay of the first sentence',async()=>{
 const failures:unknown[]=[],played:string[]=[];
 const q=new PreparedSpeechStream(new AbortController().signal,{prepare:async text=>{if(text==='第二句。')throw Error('synthesis failed');return text;},play:async(text,_signal,started)=>{played.push(text);started();},discard:async()=>{}},error=>failures.push(error));
 q.push('第一句。');q.push('第二句。');await assert.rejects(q.finish(),/synthesis failed/);assert.deepEqual(played,['第一句。']);assert.equal(failures.length,1);
});
