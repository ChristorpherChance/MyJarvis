import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedSpeech,speechSegments,firstSentenceSpeechSegments} from '../../web/src/features/family/prepared-speech.js';
import {companionSpeechParts} from '../../web/src/features/family/companion-speech.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('short final answers stay whole; long answers retain all text and split at sentence boundaries',()=>{
 const short='你好。今天我们学习唐朝。';assert.deepEqual(speechSegments(short),[short]);const text=('诸子百家。'.repeat(250))+'继续学习';const parts=speechSegments(text);assert.equal(parts.join(''),text);assert(parts.every(p=>p.length<=1000));assert(parts[0].endsWith('。'));
});
test('final speech prepares a short complete first sentence without truncating text, decimals or titles',()=>{
 for(const text of ['我在。下面一起学习唐朝的故事。','Gravity pulls things together. It acts between masses.','Bonjour ! Nous pouvons apprendre ensemble.','Die Erde zieht Dinge an. Das nennt man Schwerkraft.']){
  const parts=firstSentenceSpeechSegments(text);assert(parts.length>=2);assert.equal(parts.join(''),text);assert(parts.every(p=>p.length<=180));
 }
 assert.deepEqual(firstSentenceSpeechSegments('圆周率约为3.14。'),['圆周率约为3.14。']);
 assert.deepEqual(firstSentenceSpeechSegments('Dr. Smith explains gravity. Next sentence.'),['Dr. Smith explains gravity. ','Next sentence.']);
 const text='解释'.repeat(150)+'。';assert.equal(firstSentenceSpeechSegments(text).join(''),text);
 assert.throws(()=>firstSentenceSpeechSegments('x',20));
});
test('first-sentence scheduling keeps English guidance, French target and unsupported Japanese text separate',()=>{
 const guide='Let us practice. Explain your answer in one sentence.',target='Bonjour. Comment allez-vous ?';
 const result=companionSpeechParts([{text:guide,language:'en',kind:'guide'},{text:target,language:'fr',kind:'target'},{text:'こんにちは。',language:'ja',kind:'target'}],'unused','en');
 assert.deepEqual(result.parts.map(p=>p.language),['en','en','fr','fr']);assert.equal(result.parts.filter(p=>p.language==='en').map(p=>p.text).join(''),guide);assert.equal(result.parts.filter(p=>p.language==='fr').map(p=>p.text).join(''),target);assert.deepEqual(result.textOnlyLanguages,['ja']);
});
test('only one next segment is prepared while actual playback is in progress, preserving order',async()=>{
 const prepared:string[]=[],played:string[]=[],discarded:string[]=[];const ended:(()=>void)[]=[];
 const active=preparedSpeech(['甲','乙','丙'],new AbortController().signal,{prepare:async(text,previous)=>{prepared.push(text);if(previous)assert.equal(previous,played.at(-1));return text;},play:async(text,_signal,started)=>{played.push(text);started();await new Promise<void>(r=>ended.push(r));},discard:async text=>{discarded.push(text);}});
 await tick();assert.deepEqual(prepared,['甲','乙']);assert.deepEqual(played,['甲']);ended.shift()!();await tick();assert.deepEqual(prepared,['甲','乙','丙']);assert.deepEqual(played,['甲','乙']);ended.shift()!();await tick();ended.shift()!();await active;assert.deepEqual(played,['甲','乙','丙']);assert.deepEqual(discarded,[]);
});
test('a denied play does not eagerly synthesize the rest of the answer',async()=>{
 const control=new AbortController(),prepared:string[]=[],discarded:string[]=[];
 const active=preparedSpeech(['甲','乙'],control.signal,{prepare:async text=>{prepared.push(text);return text;},play:(_v,signal)=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true})),discard:async value=>{discarded.push(value);}});
 await tick();assert.deepEqual(prepared,['甲']);control.abort();await assert.rejects(active,{name:'AbortError'});assert.deepEqual(discarded,['甲']);
});
test('interrupt clears ready and late lookahead without playing stale audio',async()=>{
 const control=new AbortController(),played:string[]=[],discarded:string[]=[];let ready!:(v:string)=>void;
 const active=preparedSpeech(['甲','乙'],control.signal,{prepare:(text)=>text==='甲'?Promise.resolve(text):new Promise(r=>ready=r),play:(value,signal,started)=>{played.push(value);started();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));},discard:async value=>{discarded.push(value);}});
 await tick();control.abort();await assert.rejects(active,{name:'AbortError'});ready('乙');await tick();assert.deepEqual(played,['甲']);assert.deepEqual(discarded.sort(),['乙','甲'].sort());
});
test('a lookahead failure is surfaced after the current segment finishes without unhandled rejection',async()=>{
 let end!:()=>void;const played:string[]=[];const active=preparedSpeech(['甲','乙'],new AbortController().signal,{prepare:async text=>{if(text==='乙')throw Error('synthesis failed');return text;},play:async value=>{played.push(value);},discard:async()=>{}});
 await assert.rejects(active,/声音未开始播放/);
 const actual=preparedSpeech(['甲','乙'],new AbortController().signal,{prepare:async text=>{if(text==='乙')throw Error('synthesis failed');return text;},play:async(value,_s,started)=>{played.push(value);started();await new Promise<void>(r=>end=r);},discard:async()=>{}});await tick();end();await assert.rejects(actual,/synthesis failed/);
});
