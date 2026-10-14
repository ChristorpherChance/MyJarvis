import test from 'node:test';
import assert from 'node:assert/strict';
import {SentenceSpeechQueue,readFamilyStream,readSpokenFamilyStream} from '../../web/src/features/family/voice-stream.js';
import {PreparedSpeechStream} from '../../web/src/features/family/prepared-speech.js';

test('first sentence plays before the reply finishes; following sentences remain ordered',async()=>{
 const spoken:string[]=[];const q=new SentenceSpeechQueue(async text=>{spoken.push(text);},new AbortController().signal);
 q.push('我在。');await new Promise(r=>setImmediate(r));assert.deepEqual(spoken,['我在。']);q.push('今天可以一起学习历史。');q.push('从你感兴趣的人物开始');await q.finish();assert.deepEqual(spoken,['我在。','今天可以一起学习历史。','从你感兴趣的人物开始']);
});
test('speech cancellation prevents queued sentences and bounds the spoken length',async()=>{
 const controller=new AbortController(),spoken:string[]=[];const q=new SentenceSpeechQueue(async text=>{spoken.push(text);controller.abort();},controller.signal,10);q.push('第一句。第二句。第三句。');await assert.rejects(q.finish(),{name:'AbortError'});assert.deepEqual(spoken,['第一句。']);
 const output:string[]=[];const limited=new SentenceSpeechQueue(async text=>{output.push(text);},new AbortController().signal,8);limited.push('第一句。第二句。第三句。');await limited.finish();assert.equal(output.join('').length,8);
});
test('speech errors are surfaced even if the model is still answering',async()=>{
 const q=new SentenceSpeechQueue(async()=>{throw new Error('speaker failed');},new AbortController().signal);q.push('你好。');await new Promise(r=>setImmediate(r));assert.throws(()=>q.push('再见。'),/speaker failed/);await assert.rejects(q.finish(),/speaker failed/);
});
function response(text:string){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}),{headers:{'content-type':'text/event-stream'}});}
test('stream parser preserves split UTF-8 text and requires authoritative completion',async()=>{
 const deltas:string[]=[];const r=await readFamilyStream(response('event: delta\ndata: {"text":"你好。"}\n\nevent: done\ndata: {"message":{"content":"你好。"},"status":"complete"}\n\n'),new AbortController().signal,text=>deltas.push(text));assert.deepEqual(deltas,['你好。']);assert.equal(r.message.content,'你好。');await assert.rejects(readFamilyStream(response('event: delta\ndata: {"text":"半句话"}\n\n'),new AbortController().signal,()=>{}),/未完成/);
});

const packet=(event:string,data:unknown)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
test('only approved speech events start audio before done; deltas and thought events remain silent',async()=>{
 let channel!:ReadableStreamDefaultController<Uint8Array>;const streamed=new Response(new ReadableStream<Uint8Array>({start(controller){channel=controller;}}),{headers:{'content-type':'text/event-stream'}});
 const control=new AbortController(),visible:string[]=[],spoken:string[]=[],prepared:string[]=[];
 const q=new PreparedSpeechStream(control.signal,{prepare:async text=>{prepared.push(text);return text;},play:async(text,_signal,started)=>{spoken.push(text);started();},discard:async()=>{}});
 const reading=readFamilyStream(streamed,control.signal,text=>visible.push(text),speech=>q.push(speech.text));
 channel.enqueue(new TextEncoder().encode(packet('delta',{text:'仅供展示的文本'})+packet('thinking',{text:'推理草稿'})));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(spoken,[]);
 channel.enqueue(new TextEncoder().encode(packet('speech',{sequence:0,text:'你好。',approved:true})));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(prepared,['你好。']);assert.deepEqual(spoken,['你好。'],'The first safe sentence starts before the model reports completion');
 channel.enqueue(new TextEncoder().encode(packet('speech',{sequence:1,text:'今天想聊什么？',approved:true})+packet('done',{message:{content:'你好。今天想聊什么？'},status:'complete',speech:{mode:'incremental',segments:2,text:'你好。今天想聊什么？'}})));channel.close();const done=await reading;await q.finish();assert.equal(done.speech?.segments,2);assert.deepEqual(spoken,['你好。','今天想聊什么？']);assert.deepEqual(visible,['仅供展示的文本']);
});

test('unapproved, out-of-order, thought-tagged and mismatched final speech events fail closed',async()=>{
 const bad=[{sequence:0,text:'操作草稿。',approved:false},{sequence:1,text:'漏序。',approved:true},{sequence:0,text:'<think>内部推理</think>',approved:true}];
 for(const speech of bad){const spoken:string[]=[];await assert.rejects(readFamilyStream(response(packet('speech',speech)),new AbortController().signal,()=>{},entry=>spoken.push(entry.text)),/核对/);assert.deepEqual(spoken,[]);}
 await assert.rejects(readFamilyStream(response(packet('speech',{sequence:0,text:'批准句。',approved:true})+packet('done',{message:{content:'批准句。'},status:'complete',speech:{mode:'incremental',segments:2,text:'批准句。'}})),new AbortController().signal,()=>{},()=>{}),/不一致/);
});

test('tool/operation final mode does not expose streaming speech and error completion cannot enqueue its tail',async()=>{
 const spoken:string[]=[];const completed=await readFamilyStream(response(packet('delta',{text:'待核验的操作信息'})+packet('done',{message:{content:'请确认操作选项。'},status:'complete',speech:{mode:'final',segments:0,text:'请确认操作选项。'}})),new AbortController().signal,()=>{},speech=>spoken.push(speech.text));assert.equal(completed.speech?.mode,'final');assert.deepEqual(spoken,[]);
 await assert.rejects(readFamilyStream(response(packet('delta',{text:'失败内容'})+packet('error',{message:'工具未完成',code:'TOOL_ERROR'})+packet('speech',{sequence:0,text:'不该播报。',approved:true})),new AbortController().signal,()=>{},speech=>spoken.push(speech.text)),error=>(error as any).code==='TOOL_ERROR');assert.deepEqual(spoken,[]);
});

test('cancelling a stalled stream releases the reader promptly without waiting for more model data',async()=>{
 let cancelled=false;const stalled=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});const controller=new AbortController(),reading=readFamilyStream(stalled,controller.signal,()=>{});controller.abort();await assert.rejects(reading,{name:'AbortError'});assert.equal(cancelled,true);
});

test('the actual spoken-stream adapter never falls back to suppressed incremental final text, even with zero speech segments',async()=>{
 const prepared:string[]=[],spoken:string[]=[];const ops={prepare:async(text:string)=>{prepared.push(text);return text;},play:async(text:string,_signal:AbortSignal,started:()=>void)=>{spoken.push(text);started();},discard:async()=>{}};
 const withheld=await readSpokenFamilyStream(response(packet('done',{message:{content:'已经删除了项目。'},status:'complete',speech:{mode:'incremental',segments:0,text:''}})),new AbortController().signal,()=>{},ops);
 assert.equal(withheld.speechHandled,true,'The caller must not replay final text that the speech gate suppressed');assert.deepEqual(prepared,[]);assert.deepEqual(spoken,[]);
 const safe=await readSpokenFamilyStream(response(packet('speech',{sequence:0,text:'你好。',approved:true})+packet('done',{message:{content:'你好。'},status:'complete',speech:{mode:'incremental',segments:1,text:'你好。'}})),new AbortController().signal,()=>{},ops);assert.equal(safe.speechHandled,true);assert.deepEqual(spoken,['你好。']);
 const final=await readSpokenFamilyStream(response(packet('done',{message:{content:'请确认选项。'},status:'complete',speech:{mode:'final',segments:0,text:''}})),new AbortController().signal,()=>{},ops);assert.equal(final.speechHandled,false);assert.deepEqual(spoken,['你好。']);
});

test('a waiting reply plays before the final answer and preserves the same audio dependency chain without repetition',async()=>{
 let channel!:ReadableStreamDefaultController<Uint8Array>;const streamed=new Response(new ReadableStream<Uint8Array>({start(controller){channel=controller;}}),{headers:{'content-type':'text/event-stream'}});
 const prepared:{text:string;previous?:string}[]=[],spoken:string[]=[];const control=new AbortController();
 const result=readSpokenFamilyStream(streamed,control.signal,()=>{},{prepare:async(text,previous)=>{prepared.push({text,previous});return text;},play:async(text,_signal,started)=>{spoken.push(text);started();},discard:async()=>{}});
 const waiting='我在核对关键点，请稍等。';
 channel.enqueue(new TextEncoder().encode(packet('transition',{sequence:0,text:waiting,approved:true})));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(spoken,[waiting]);
 channel.enqueue(new TextEncoder().encode(packet('delta',{text:'正式结果。'})+packet('done',{message:{content:'正式结果。'},status:'complete',speech:{mode:'final',segments:0,text:''},transition:{segments:1,text:waiting}})));channel.close();
 assert.equal((await result).speechHandled,true);assert.deepEqual(spoken,[waiting,'正式结果。']);assert.equal(prepared[1].previous,waiting);
});

test('a transition without a matching done receipt or with duplicate events fails closed',async()=>{
 const waiting=packet('transition',{sequence:0,text:'I am checking the key points.',approved:true});
 const complete=packet('done',{message:{content:'Final answer.'},status:'complete',speech:{mode:'final',segments:0,text:''}});
 await assert.rejects(readFamilyStream(response(waiting+complete),new AbortController().signal,()=>{}),/等待回复没有/);
 await assert.rejects(readFamilyStream(response(waiting+waiting),new AbortController().signal,()=>{}),/等待回复未/);
 await assert.rejects(readFamilyStream(response(packet('transition',{sequence:0,text:'<think>wait</think>',approved:true})),new AbortController().signal,()=>{}),/等待回复未/);
});
