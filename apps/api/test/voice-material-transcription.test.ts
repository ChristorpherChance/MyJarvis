import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import {Store} from '../src/store.js';
import {V1Repository} from '../src/v1/repository.js';
import {IdentityRuntime,RuntimeAccessError} from '../src/runtime/identity.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';
import {VoiceRuntime} from '../src/runtime/voice.js';
import type {PiService} from '../src/pi.js';

function wav(seconds=1){
  const size=Math.round(32000*seconds),bytes=Buffer.alloc(44+size);
  bytes.write('RIFF');bytes.writeUInt32LE(36+size,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(size,40);return bytes;
}
const code=(expected:string)=>(error:unknown)=>error instanceof RuntimeAccessError&&error.code===expected;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve};}
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'jarvis-material-transcription-')),store=new Store(directory),repository=new V1Repository(store.databasePath),governance=new GovernanceRuntime(store);
  // This fixture records usage with no spending cap; all provider values below are synthetic receipts.
  governance.updatePolicy(0,{dailyLimitUSD:0});
  const member=store.create('members',{name:'转写隔离成员',role:'adult',preferences:'',voice:'clear',wakeWord:'贾维斯'});
  const profile={...member,preferences:{cloudPrivacy:'ask',dailyVoiceMinutes:30,timezone:'Asia/Shanghai',quietStart:'',quietEnd:'',replyLanguage:'fr'}};
  const identity=new IdentityRuntime(store,{memberExists:id=>id===member.id,memberProfile:id=>id===member.id?profile:undefined});
  identity.setCredential(member.id,'246810','pin');const principal=identity.login(member.id,'246810','material-asr-fixture').principal;
  let modelCalls=0;const pi={run:async()=>{modelCalls++;throw Error('Material transcription must not invoke a model')}} as unknown as PiService;
  const voice=new VoiceRuntime(directory,identity,{store,governance,pi,defaultLocalTts:false});
  const requests:{url:string;body:string}[]=[],responses=new Set<ServerResponse>(),requestWaiters:{count:number;done:()=>void}[]=[];
  let respond=(response:ServerResponse)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({text:'仅为本地HTTP夹具文字，不是真实识别。',language:'zh'}))};
  let arrived=deferred<void>();
  const server=createServer(async(request,response)=>{const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));requests.push({url:request.url??'',body:Buffer.concat(chunks).toString('utf8')});responses.add(response);response.on('close',()=>responses.delete(response));arrived.resolve();for(const waiter of requestWaiters)if(requests.length>=waiter.count)waiter.done();respond(response)});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');const endpoint=`http://127.0.0.1:${address.port}/v1`;
  const configure=(timeoutMs=1000)=>voice.configure('asr',{adapter:'http',baseUrl:endpoint,model:'material-fixture-asr',timeoutMs});
  const counts=()=>({conversations:store.listConversations(principal.actorId).length,sessions:voice.listSessions(principal).length,jobs:Number(identity.db.prepare('SELECT COUNT(*) AS n FROM runtime_voice_jobs').get()?.n),memories:repository.list('memory',principal.actorId).length});
  return {directory,store,repository,identity,governance,voice,member,profile,principal,requests,configure,counts,
    respond(value:unknown){respond=response=>{response.setHeader('content-type','application/json');response.end(JSON.stringify(value))}},
    hold(){respond=()=>{};arrived=deferred<void>();return arrived.promise;},
    whenRequests(count:number){if(requests.length>=count)return Promise.resolve();return new Promise<void>(done=>{requestWaiters.push({count,done})})},
    release(value:unknown){for(const response of responses){response.setHeader('content-type','application/json');response.end(JSON.stringify(value))}},
    async close(){await voice.close();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));identity.close();governance.close();repository.close();store.close();assert.equal(modelCalls,0);const target=resolve(directory);assert(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-material-transcription-'));await rm(target,{recursive:true,force:true});}};
}

test('material transcription fails closed without ASR, cloud permission, current identity or available voice minutes',async()=>{
  const f=await fixture();try{
    const audio=wav();await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),code('ASR_NOT_CONFIGURED'));
    f.voice.configure('asr',{adapter:'http',baseUrl:'https://not-contacted.invalid/v1',model:'material-fixture-asr'});
    await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),code('CLOUD_CONSENT_REQUIRED'));
    f.profile.preferences.cloudPrivacy='local';await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav',{cloudConsent:true}),code('CLOUD_FORBIDDEN'));
    f.configure();f.profile.preferences.cloudPrivacy='ask';f.profile.preferences.quietStart='00:00';f.profile.preferences.quietEnd='23:59';
    await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),code('QUIET_HOURS'));
    f.profile.preferences.quietStart='';f.profile.preferences.quietEnd='';f.profile.preferences.dailyVoiceMinutes=1;
    await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(61),'audio/wav'),code('DAILY_VOICE_LIMIT'));
    f.profile.preferences.dailyVoiceMinutes=30;await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(600.01),'audio/wav'),code('AUDIO_TOO_LONG'));
    f.governance.updatePolicy(1,{paused:true});await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),(error:any)=>error.code==='REVIEW_REQUIRED');
    assert.equal(f.voice.guardState(f.principal).usedSeconds,0,'未启动识别的治理拒绝不能记作已处理语音');
    f.identity.disableCredential(f.member.id);await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),code('IDENTITY_CHANGED'));
    assert.equal(f.requests.length,0);assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});
  }finally{await f.close();}
});

test('material-only ASR accepts a measured recording beyond room duration and preserves only provider-supplied timestamps',async()=>{
  const f=await fixture();try{
    f.configure();const segments=[{id:7,start:0,end:1.25,text:'fixture first sentence'},{id:8,start:10.5,end:12,text:'fixture second sentence'}];
    f.respond({text:'fixture first sentence fixture second sentence',language:'en',model:'reported-fixture-model',segments,usage:{input_tokens:18,output_tokens:3,total_tokens:21,cost_usd:0.03}});
    const result=await f.voice.transcribeMaterial(f.principal,wav(90),'audio/wav',{language:'en'});
    assert.equal(result.text,'fixture first sentence fixture second sentence');assert.equal(result.model,'reported-fixture-model');assert.equal(result.language,'en');assert.equal(result.engine,'http');
    assert.deepEqual(result.segments,segments.map(({start,end,text})=>({start,end,text})));
    assert.equal(f.requests[0].url,'/v1/audio/transcriptions');assert.match(f.requests[0].body,/name="language"\r\n\r\nen/);assert.doesNotMatch(f.requests[0].body,/name="wake_word"/);
    assert.equal(f.voice.guardState(f.principal).usedSeconds,90);assert.equal(f.governance.summary().totalTokens,21);assert.equal(f.governance.usage()[0].cost_usd,0.03);
    f.respond({text:'fixture without timings',language:'zh'});const untimed=await f.voice.transcribeMaterial(f.principal,wav(),'audio/wav');assert.equal(Object.hasOwn(untimed,'segments'),false);
    assert.equal(f.governance.summary().unreportedRuns,1,'未报告用量保留未知，不能冒写已知零费用');assert.equal(f.governance.summary().active,0);
    assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});assert(f.requests.every(request=>request.url==='/v1/audio/transcriptions'));
  }finally{await f.close();}
});

test('invalid provider timestamps, engine timeout, caller cancellation and revoked identity cannot produce a material transcript',async()=>{
  const f=await fixture();try{
    f.configure();f.respond({text:'fixture invalid timing',language:'en',segments:[{start:2,end:1,text:'invalid'}]});
    await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('ENGINE_RESPONSE'));
    f.configure(100);f.hold();await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('ENGINE_TIMEOUT'));
    f.configure();const arrived=f.hold(),controller=new AbortController(),cancelled=assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav',{signal:controller.signal}),code('CANCELLED'));await arrived;controller.abort();await cancelled;
    const revokedRequest=f.hold(),revoked=assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('IDENTITY_CHANGED'));await revokedRequest;f.identity.disableCredential(f.member.id);f.release({text:'late fixture result must be discarded',language:'en'});await revoked;
    assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});assert.equal(f.governance.summary().active,0);
  }finally{await f.close();}
});

test('material transcription shares capacity and service shutdown cancels every pending original without creating room jobs',async()=>{
  const f=await fixture();try{
    f.configure();f.hold();const first=assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('CANCELLED')),second=assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('CANCELLED'));
    await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('VOICE_BUSY'));
    await f.whenRequests(2);await f.voice.close();await Promise.all([first,second]);assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});
    await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('SHUTTING_DOWN'));
  }finally{await f.close();}
});

test('immediate material shutdown during multipart preparation cancels without a closed-stream exception',async()=>{
  const f=await fixture();try{
    f.configure();f.hold();
    const first=assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('CANCELLED')),second=assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('CANCELLED'));
    // The rejected third request yields to both pending multipart preparations;
    // shutdown deliberately happens before either local server request is awaited.
    await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('VOICE_BUSY'));
    await f.voice.close();await Promise.all([first,second]);
    assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});assert.equal(f.governance.summary().active,0);
  }finally{await f.close();}
});

test('a provider no-speech response cannot be reported as a successful empty material transcript',async()=>{
  const f=await fixture();try{
    f.configure();const config=f.voice.getConfig('asr')!;assert.equal(config.adapter,'http');f.voice.configure('asr',{...config,model:'sensevoice-resident'});
    f.respond({text:'',noSpeech:true,language:'zh'});
    await assert.rejects(f.voice.transcribeMaterial(f.principal,wav(),'audio/wav'),code('NO_SPEECH'));
    assert.equal(f.requests.length,1);assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});
  }finally{await f.close();}
});

test('material timestamps must fit measured audio with at most 250ms tolerance and are never shortened to fit',async()=>{
  const f=await fixture();try{
    f.configure();const audio=wav(1);
    f.respond({text:'out-of-range fixture',language:'en',segments:[{start:100,end:101,text:'out-of-range fixture'}]});
    await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),code('ENGINE_RESPONSE'));
    const originalSegment={start:0.1,end:1.2,text:'within alignment tolerance'};
    f.respond({text:originalSegment.text,language:'en',segments:[originalSegment]});
    assert.deepEqual((await f.voice.transcribeMaterial(f.principal,audio,'audio/wav')).segments,[originalSegment]);
    f.respond({text:'beyond tolerance fixture',language:'en',segments:[{start:0.1,end:1.26,text:'beyond tolerance fixture'}]});
    await assert.rejects(f.voice.transcribeMaterial(f.principal,audio,'audio/wav'),code('ENGINE_RESPONSE'));
    assert.deepEqual(f.counts(),{conversations:0,sessions:0,jobs:0,memories:0});
  }finally{await f.close();}
});
