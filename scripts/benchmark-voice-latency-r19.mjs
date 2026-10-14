/** Bounded synthetic fixtures. No personal transcript, recording or credential is retained. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {request} from 'node:https';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {spawn} from 'node:child_process';
import {primary,python,clearSyntheticVoiceMeter,lanProfile} from './managed-server-client.mjs';

const phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8)??'before',attempt=process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??'1';
assert(['before','after'].includes(phase));
assert(/^[1-9]\d?$/.test(attempt));
const directEngine=process.argv.includes('--engine-direct');
if(!process.argv.includes('--execute')){console.log(JSON.stringify({prepared:true,phase,maximumModelRequests:2,configurationWrites:0,physicalMicrophoneOrSpeaker:false}));process.exit(0);}
const output='artifacts/voice-latency-r19',startedAt=new Date().toISOString(),startedMs=Date.now()-5000,runId=randomUUID(),ids=[],samples=[],errors=[];
let cookie='',session,settings,voice,health,replyPolicy,catalog,modelRequests=0,removed=0,failure=null,revoked=false,failureStage='maintenance';
const ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt'),origin='https://192.168.10.112:3140';
function operation(code){return primary(python({code},`import subprocess
r=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True)
if r.returncode:raise RuntimeError('PRIVATE_MAINTENANCE_OPERATION_FAILED')
print(r.stdout)`));}
function api(path,body,method=body===undefined?'GET':'POST',binary=false){return new Promise((resolve,reject)=>{
 const raw=body===undefined?null:Buffer.isBuffer(body)?body:JSON.stringify(body),req=request(origin+path,{method,ca,headers:{cookie:'jarvis_session='+cookie,...raw?{'Content-Type':Buffer.isBuffer(raw)?'audio/wav':'application/json','Content-Length':Buffer.byteLength(raw)}:{}}},res=>{
  let bytes=0;const chunks=[];res.on('data',b=>{bytes+=b.length;if(bytes>10*1024*1024)return req.destroy(Error('RESPONSE_TOO_LARGE'));chunks.push(b);});res.on('error',reject);res.on('end',()=>{try{const b=Buffer.concat(chunks);if(!(res.statusCode>=200&&res.statusCode<300)){let code;try{code=JSON.parse(b.toString())?.error?.code;}catch{}throw Error('API_HTTP_'+res.statusCode+(/^[A-Z][A-Z0-9_]{1,79}$/.test(code)?' '+code:''));}resolve(binary?b:JSON.parse(b.toString()));}catch(e){reject(e);}});
 });const timer=setTimeout(()=>req.destroy(Error('API_TIMEOUT')),45000);req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end(raw);
});}
function engine(action,payload){const script=python({action,...payload},`import json,urllib.request,base64,time
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();started=time.monotonic();headers={'Authorization':'Bearer '+key};base='http://127.0.0.1:3153/v1/audio/'
if p['action']=='tts':
 data=json.dumps({'input':p['text'],'language':p['language'],'model':'matcha-resident' if p['language']=='zh' else 'piper-resident','voice':{'zh':'0','en':'en-lessac','fr':'fr-siwis','de':'de-thorsten'}[p['language']],'speed':1,'response_format':'wav'}).encode();headers['Content-Type']='application/json'
 req=urllib.request.Request(base+'speech',data=data,headers=headers)
 with urllib.request.urlopen(req,timeout=35) as response:raw=response.read()
 print(json.dumps({'ms':round((time.monotonic()-started)*1000),'audio':base64.b64encode(raw).decode(),'model':'matcha-resident' if p['language']=='zh' else 'piper-resident','language':p['language']}))
else:
 import uuid
 boundary=uuid.uuid4().hex;raw=base64.b64decode(p['audio']);data=('--'+boundary+'\\r\\nContent-Disposition: form-data; name="file"; filename="synthetic.wav"\\r\\nContent-Type: audio/wav\\r\\n\\r\\n').encode()+raw+('\\r\\n--'+boundary+'--\\r\\n').encode();data=data.replace(b'\\\\r\\\\n',b'\\r\\n');headers['Content-Type']='multipart/form-data; boundary='+boundary
 req=urllib.request.Request(base+'transcriptions',data=data,headers=headers)
 with urllib.request.urlopen(req,timeout=35) as response:result=json.load(response)
 print(json.dumps({'ms':round((time.monotonic()-started)*1000),'result':result}))`);
 return new Promise((resolve,reject)=>{const child=spawn('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-112','sudo -n python3 -'],{windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];let bytes=0;child.stdout.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024)child.kill();else chunks.push(b);});child.stderr.resume();child.once('error',()=>reject(Error('DIRECT_ENGINE_START_FAILED')));child.once('close',code=>{clearTimeout(timer);try{assert.equal(code,0,'DIRECT_ENGINE_FAILED');resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch(e){reject(e);}});const timer=setTimeout(()=>child.kill(),45000);child.stdin.end(script);});
}
async function complete(job){const until=Date.now()+45000;while(['queued','running'].includes(job.status)){assert(Date.now()<until,'VOICE_JOB_TIMEOUT');await new Promise(r=>setTimeout(r,80));job=await api('/api/runtime/voice/jobs/'+job.id);}assert.equal(job.status,'complete','VOICE_JOB_FAILED');return job;}
async function tts(text,language){const begin=performance.now();if(directEngine){const value=await engine('tts',{text,language});return {job:{result:{model:value.model,language,seconds:(Buffer.from(value.audio,'base64').length-44)/32000}},audio:Buffer.from(value.audio,'base64'),ms:Math.round(performance.now()-begin),inferenceMs:value.ms};}const job=await complete(await api('/api/runtime/voice/sessions/'+session.id+'/speech',{text,cloudConsent:true,playback:{language}}));const audio=await api(job.result.audioUrl,undefined,'GET',true);assert.equal(audio.subarray(0,4).toString(),'RIFF');return {job,audio,ms:Math.round(performance.now()-begin)};}
function stream(id,text){return new Promise((resolve,reject)=>{
 const started=performance.now(),raw=JSON.stringify({text,voiceMode:true,voiceLanguage:/[\u3400-\u9fff]/.test(text)?'zh':'en',cloudConsent:true}),record={firstDeltaMs:null,firstApprovedSentenceMs:null,firstFinalAudioReadyMs:null,doneMs:null,firstSentenceChars:null,speechMode:null,speechCount:0,transitionMs:null,route:null,toolCalls:0,status:'pending'};
 let buffer='',bytes=0,done,firstAudio,firstText,language,finalText='';const decoder=new TextDecoder();
 const schedule=(sentence)=>{if(firstAudio||!sentence.trim())return;firstText=sentence;firstAudio=tts(sentence,language??replyPolicy.replyLanguage).then(result=>{record.firstFinalAudioReadyMs=Math.round(performance.now()-started);record.firstSentenceChars=sentence.length;record.ttsModel=result.job.result.model;record.ttsLanguage=result.job.result.language;record.ttsMs=result.ms;return result;});void firstAudio.catch(()=>{});};
 const packet=(name,data)=>{const ms=Math.round(performance.now()-started);if(name==='status'&&data.responseLanguage)language=data.responseLanguage;if(name==='route'){language=data.responseLanguage??language;record.route={tier:data.tier,provider:data.provider,model:data.model,reason:data.reason};}if(name==='delta'&&data.text){record.firstDeltaMs??=ms;finalText+=data.text;}if(name==='speech'){assert(data.approved===true&&data.sequence===record.speechCount,'SPEECH_SEQUENCE_INVALID');record.speechCount++;record.firstApprovedSentenceMs??=ms;schedule(data.text);}if(name==='transition')record.transitionMs=ms;if(name==='tool'&&data.state==='running')record.toolCalls++;if(name==='error')throw Error('MODEL_STREAM_ERROR');if(name==='done'){assert.equal(data.status,'complete','MODEL_INCOMPLETE');record.doneMs=ms;record.status=data.status;record.speechMode=data.speech?.mode;finalText=data.message.content;done=true;language=data.responseLanguage??language;if(!firstAudio){const sentence=finalText.match(/^.*?[。！？!?](?:\s|$)|^.*?\.(?=\s|$)/)?.[0]??finalText.slice(0,180);schedule(sentence);}}};
 const req=request(origin+'/api/runtime/family/conversations/'+id+'/messages',{method:'POST',ca,headers:{cookie:'jarvis_session='+cookie,Accept:'text/event-stream','Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}},res=>{
  if(res.statusCode!==200||!res.headers['content-type']?.includes('text/event-stream')){res.resume();return reject(Error('SSE_HTTP_'+res.statusCode));}
  res.on('data',b=>{try{bytes+=b.length;assert(bytes<2*1024*1024,'SSE_TOO_LARGE');buffer+=decoder.decode(b,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let at;while((at=buffer.indexOf('\n\n'))>=0){const p=buffer.slice(0,at);buffer=buffer.slice(at+2);const name=p.split('\n').find(l=>l.startsWith('event:'))?.slice(6).trim(),data=p.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(name&&data)packet(name,JSON.parse(data));}}catch(e){req.destroy(e);}});
  res.once('error',reject);res.once('end',async()=>{try{assert(done,'SSE_MISSING_DONE');assert(firstAudio,'NO_FINAL_SPEECH');await firstAudio;record.answerChars=finalText.length;record.responseLanguage=language;resolve(record);}catch(e){reject(e);}});
 });const timer=setTimeout(()=>req.destroy(Error('TURN_TIMEOUT')),120000);req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end(raw);
});}
function syntheticUsage(id,title){const code=`import {Store} from './apps/api/dist/store.js';import {readFile,realpath} from 'node:fs/promises';import {join,sep} from 'node:path';const s=new Store('/var/lib/jarvis/data');try{const c=s.getConversation('server-admin',${JSON.stringify(id)});if(!c||c.title!==${JSON.stringify(title)}||!c.sessionPath)throw Error('SYNTHETIC_SCOPE_INVALID');const base=await realpath('/var/lib/jarvis/data/pi/sessions/server-admin/'+c.id),path=await realpath(c.sessionPath);if(!path.startsWith(base+sep)||!path.endsWith('.jsonl'))throw Error('SYNTHETIC_SESSION_INVALID');const raw=await readFile(path,'utf8');if(raw.length>2*1024*1024)throw Error('SYNTHETIC_SESSION_TOO_LARGE');const calls=raw.split(String.fromCharCode(10)).filter(Boolean).map(JSON.parse).filter(x=>x.type==='message'&&x.message?.role==='assistant').map(x=>({provider:x.message.provider,model:x.message.model,stopReason:x.message.stopReason,usage:x.message.usage?{input:x.message.usage.input,output:x.message.usage.output,cacheRead:x.message.usage.cacheRead,cacheWrite:x.message.usage.cacheWrite,totalTokens:x.message.usage.totalTokens}:null}));process.stdout.write(JSON.stringify(calls));}finally{s.close();}`;return JSON.parse(operation(code));}
try{
 cookie=operation("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}");assert(/^[A-Za-z0-9_-]{43}$/.test(cookie));
 failureStage='settings';health=await api('/api/health');settings=await api('/api/settings/pi');voice=await api('/api/runtime/voice/state');replyPolicy=await api('/api/runtime/family/reply-language');catalog=await api('/api/runtime/voice/catalog');
 failureStage='voice-session';
 if(!directEngine)session=await api('/api/runtime/voice/sessions',{roomId:'study'});
 for(const fixture of [{id:'zh-gravity',language:'zh',text:'简单解释一下重力，用两句短句回答。'},{id:'en-gravity',language:'en',text:'Explain gravity in two short sentences.'}]){
  failureStage=fixture.id+':fixture-tts';const synthesized=await tts(fixture.text,fixture.language),begin=performance.now();failureStage=fixture.id+':asr';const asr=directEngine?await engine('asr',{audio:synthesized.audio.toString('base64')}):await complete(await api('/api/runtime/voice/sessions/'+session.id+'/audio',synthesized.audio));
  const result={fixture:fixture.id,inputLanguage:fixture.language,asrMs:Math.round(performance.now()-begin),asrInferenceMs:asr.result.inferenceMs??null,asrModel:asr.result.model,detectedLanguage:asr.result.language,fixtureAudioSeconds:synthesized.job.result.seconds};assert.equal(result.detectedLanguage,fixture.language,'SYNTHETIC_LANGUAGE_MISMATCH');
  failureStage=fixture.id+':model';const title='R19 latency '+runId+' '+fixture.id,c=await api('/api/runtime/family/conversations',{title});ids.push(c.id);modelRequests++;assert(modelRequests<=2);Object.assign(result,await stream(c.id,fixture.text));samples.push(result);failureStage=fixture.id+':usage';result.usage=syntheticUsage(c.id,title);
 }
}catch(e){failure=/^[A-Z][A-Z0-9_ :.-]{0,160}$/.test(e.message)?e.message:'BENCHMARK_FAILED';process.exitCode=1;}
finally{
 for(const id of ids){try{await api('/api/runtime/family/conversations/'+id+'/abort',{});await api('/api/runtime/family/memory/conversations/'+id,undefined,'DELETE');removed++;}catch{errors.push('SYNTHETIC_CONVERSATION_CLEANUP_FAILED');}}
 if(session){try{await api('/api/runtime/voice/sessions/'+session.id,undefined,'DELETE');clearSyntheticVoiceMeter([session.id],startedMs);}catch{errors.push('SYNTHETIC_VOICE_CLEANUP_FAILED');}}
 if(cookie){try{operation("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin("+JSON.stringify(cookie)+");}finally{s.close();}");revoked=true;}catch{errors.push('MAINTENANCE_REVOKE_FAILED');}}
}
const report={phase,attempt,directEngine,startedAt,completedAt:new Date().toISOString(),status:failure||errors.length?'failed':'passed',build:health?.build,routing:settings?.routing?.conversation,routingRevision:settings?.routing?.revision,priceConfigured:settings?.routing?.prices?.length??0,voice:{asr:{model:voice?.asr?.model,adapter:voice?.asr?.adapter,language:voice?.asr?.language},tts:{model:voice?.tts?.model,adapter:voice?.tts?.adapter},selectedVoiceId:catalog?.selectedVoiceId??null},replyPolicy:replyPolicy?.replyLanguage,samples,maximumModelRequests:2,modelRequests,configurationWrites:0,syntheticConversationsRemoved:removed,maintenanceSessionRevoked:revoked,cleanupErrors:errors,failure,failureStage:failure?failureStage:null,physicalMicrophoneOrSpeaker:false,privateTranscriptOrAudioRetained:false,notes:['SSE timings start at the text request, after ASR. Standard API test polling uses 80 ms.','Direct engine fixtures use the private local speech service and include SSH transfer; they do not test personal quiet-hour or voice allowance guards. No personal preference was changed.','First final audio ready measures synthesis and authenticated download/SSH transfer, not phone playback or sound heard.','No wait acknowledgement is counted as a final answer. These isolated fixtures do not quantify long-context latency.','Native SDK token receipt retained; no missing token or gateway price is estimated.']};
await mkdir(output,{recursive:true});await writeFile(output+'/'+phase+(attempt==='1'?'':'-attempt'+attempt)+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
