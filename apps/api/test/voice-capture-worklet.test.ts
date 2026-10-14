import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../../web/public/voice-capture-worklet.js',import.meta.url),'utf8');

/** Execute the real public processor, rather than a fake implementation of its message format. */
function processor(options?:{processorOptions?:{timestamps?:boolean}}){
 const messages:{value:any;transfer:ArrayBuffer[]}[]=[];let Processor:any;
 class AudioWorkletProcessor{port={postMessage:(value:any,transfer:ArrayBuffer[])=>messages.push({value,transfer})};}
 const sandbox=createContext({AudioWorkletProcessor,Float32Array,sampleRate:48000,currentFrame:0,registerProcessor:(name:string,implementation:any)=>{assert.equal(name,'jarvis-voice-capture');Processor=implementation;}});
 runInContext(source,sandbox,{filename:'voice-capture-worklet.js'});assert(Processor);const worklet=options===undefined?new Processor():new Processor(options);
 const input=Float32Array.from({length:9600},(_,i)=>(i%257-128)/512);
 for(let start=0;start<input.length;start+=128){sandbox.currentFrame=start;assert.equal(worklet.process([[input.slice(start,start+128)]]),true);}
 return {messages,input};
}

test('old clients without processor options still receive transferable ArrayBuffer PCM frames',()=>{
 for(const options of [undefined,{processorOptions:{timestamps:false}}]){
  const {messages,input}=processor(options);assert.equal(messages.length,2);
  for(let frame=0;frame<messages.length;frame++){
   const {value,transfer}=messages[frame];assert(value instanceof ArrayBuffer,'R14 clients pass event.data directly to Float32Array');assert.equal(value.byteLength,1600*4);assert.equal(transfer.length,1);assert.equal(transfer[0],value);
   const actual=new Float32Array(value);for(const index of [0,1,799,1599]){const offset=(frame*1600+index)*3;const expected=(input[offset]+input[offset+1]+input[offset+2])/3;assert(Math.abs(actual[index]-expected)<1e-7,'Downsampled PCM remains unchanged');}
  }
 }
});

test('new clients explicitly request timestamped frames with identical PCM and the actual sample end time',()=>{
 const legacy=processor(),current=processor({processorOptions:{timestamps:true}});assert.equal(current.messages.length,legacy.messages.length);
 for(let frame=0;frame<current.messages.length;frame++){
  const {value,transfer}=current.messages[frame];assert.equal(value instanceof ArrayBuffer,false);assert(value.samples instanceof ArrayBuffer);assert.equal(value.samples.byteLength,1600*4);assert.equal(transfer.length,1);assert.equal(transfer[0],value.samples);
  assert.equal(Buffer.compare(Buffer.from(value.samples),Buffer.from(legacy.messages[frame].value)),0,'Changing the envelope must not change recorded samples');
  assert.equal(value.endTime,(frame+1)*.1,'Timestamp uses the same seconds clock as AudioContext.currentTime, including the offset inside a 128-sample block');
 }
});
