/** Real deployed speech, synthetic/official samples, no physical microphone claim. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,withPlatform} from './managed-server-client.mjs';
const build='20261008-voice-flow-r11';
const fixtures=JSON.parse(primary(`import base64,json,urllib.request,wave,io,math
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
req=urllib.request.Request('http://127.0.0.1:3153/v1/audio/speech',data=json.dumps({'model':'matcha-resident','voice':'0','input':'请检查书房服务器的运行状态。'}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=20) as response:chinese=response.read()
def encode(samples):
 import struct
 buffer=io.BytesIO()
 with wave.open(buffer,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(struct.pack('<'+'h'*len(samples),*samples))
 return base64.b64encode(buffer.getvalue()).decode()
with wave.open(io.BytesIO(chinese),'rb') as w:
 import struct
 frames=w.readframes(w.getnframes());samples=struct.unpack('<'+'h'*(len(frames)//2),frames)
official=Path('/var/lib/jarvis/voice-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/en.wav').read_bytes()
print(json.dumps([{'name':'Chinese','language':'zh','audio':base64.b64encode(chinese).decode()},{'name':'quiet-Chinese','language':'zh','audio':encode([int(x*.1) for x in samples])},{'name':'synthetic-fan','language':'zh','audio':encode([int(600*math.sin(x*2*math.pi*100/16000)) for x in range(32000)])},{'name':'official-human-English','language':'en','audio':base64.b64encode(official).decode()}]))
`));
const result=await withPlatform(async({api})=>{
 assert.equal((await api('/api/health')).build,build);const health=await api('/api/runtime/voice/engines/health');assert.equal(health.ready,true);assert.equal(health.speechDetection,'silero-local');
 const session=await api('/api/runtime/voice/sessions',{roomId:'study'}),path='/api/runtime/voice/sessions/'+session.id,samples=[],checks=[];
 async function poll(job){for(let n=0;n<240&&['queued','running'].includes(job.status);n++){await new Promise(r=>setTimeout(r,100));job=await api('/api/runtime/voice/jobs/'+job.id);}assert.equal(job.status,'complete',JSON.stringify(job.result));return job;}
 for(const fixture of fixtures){console.log(JSON.stringify({checking:fixture.name}));const before=Date.now();const job=await poll(await api(path+'/audio',Buffer.from(fixture.audio,'base64'),'POST',{contentType:'audio/wav',headers:{'X-Jarvis-Language':fixture.language}}));if(fixture.name==='synthetic-fan'){assert.equal(job.result.noSpeech,true);assert.equal(job.result.text,'');}else{assert(job.result.text.trim());if(fixture.language==='zh')assert(job.result.text.includes('服务器'));}samples.push({name:fixture.name,language:job.result.language,recognized:job.result.text,noSpeech:job.result.noSpeech===true,processingMs:Date.now()-before});}
 checks.push('real-local-vad-chinese-quiet-speech-noise-and-official-English');
 const first=await poll(await api(path+'/speech',{text:'这里是第一段测试声音。我会在播放这段声音时，提前准备下一段。'}));await api('/api/runtime/voice/jobs/'+first.id+'/playback',{state:'started'});
 const second=await poll(await api(path+'/speech',{text:'这里是第二段。它与上一段属于同一轮回答，只有上一段播完后才能接着播放。',afterJobId:first.id}));assert.equal(second.turn,first.turn);await assert.rejects(api('/api/runtime/voice/jobs/'+second.id+'/playback',{state:'started'}),/PLAYBACK_ORDER/);
 await api('/api/runtime/voice/jobs/'+first.id+'/playback',{state:'ended'});await api('/api/runtime/voice/jobs/'+second.id+'/playback',{state:'started'});const third=await poll(await api(path+'/speech',{text:'这段预备声音应在打断时清除，随后不再播放。',afterJobId:second.id}));
 await api(path+'/interrupt',{});await assert.rejects(api('/api/runtime/voice/jobs/'+third.id+'/playback',{state:'started'}),/STALE_PLAYBACK/);checks.push('same-turn-one-lookahead-playback-order-and-interrupt');
 const metrics=JSON.parse(primary(`import json,subprocess,urllib.request
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();req=urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+key})
with urllib.request.urlopen(req,timeout=3) as r:health=json.load(r)
unit=subprocess.run(['systemctl','show','jarvis-voice','-p','ActiveState','-p','MemoryCurrent','-p','NRestarts'],capture_output=True,text=True,check=True).stdout
print(json.dumps({'revision':health['asrRevision'],'speechDetection':health['speechDetection'],'inputPreparation':health['inputPreparation'],'metrics':health['metrics'],'unit':unit}))
`));assert.equal(metrics.revision,'20261008-voice-quality-r10');assert(metrics.unit.includes('ActiveState=active'));
 return {status:'passed',at:new Date().toISOString(),build,checks,samples,metrics,physicalMicrophones:0,physicalSpeakers:0,playbackReceipts:'simulated-for-sequence-validation',accuracyClaim:false,knownLimitation:'Recognition errors remain possible; official English is inspected for word errors separately. These fixtures do not establish room accuracy.'};
},{syntheticVoice:true});
await mkdir('artifacts/voice-quality',{recursive:true});await writeFile('artifacts/voice-quality/production-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
