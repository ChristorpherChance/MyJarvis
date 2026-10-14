import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,withPlatform} from './managed-server-client.mjs';
const audio=Buffer.from(primary(`import base64,json,urllib.request
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
request=urllib.request.Request('http://127.0.0.1:3153/v1/audio/speech',data=json.dumps({'model':'matcha-resident','voice':'0','input':'今天我们一起学习历史。'}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=20) as r:print(base64.b64encode(r.read()).decode())
`),'base64');
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health'),engines=await api('/api/runtime/voice/engines'),resident=await api('/api/runtime/voice/engines/health'),models=await api('/api/settings/pi');
 assert.equal(health.build,'20261008-voice-flow-r11');assert.equal(resident.ready,true);assert.equal(engines.tts.model,'matcha-resident');assert.equal(models.routing.routes['family-chat'].model,'Kimi-Coding/kimi-for-coding-highspeed');
 const before=await api('/api/runtime/voice/state'),session=await api('/api/runtime/voice/sessions',{roomId:'study'});let job;
 try{
  job=await api(`/api/runtime/voice/sessions/${session.id}/audio`,audio,'POST',{contentType:'audio/wav',headers:{'x-jarvis-wake-check':'true'}});
  for(let attempt=0;attempt<40&&['queued','running'].includes(job.status);attempt++){await new Promise(r=>setTimeout(r,100));job=await api('/api/runtime/voice/jobs/'+job.id);}
  assert.equal(job.status,'complete');assert.equal(job.result.keywordOnly,true);assert.equal(job.result.text,'');assert.equal(job.result.dailyVoiceChargeSeconds,0);const after=await api('/api/runtime/voice/state');assert.equal(after.guard.usedSeconds,before.guard.usedSeconds);
 }finally{await api('/api/runtime/voice/sessions/'+session.id,undefined,'DELETE');}
 const system=JSON.parse(primary(`import subprocess,json,os,stat
from pathlib import Path
unit=subprocess.run(['systemctl','show','jarvis-voice.service','-p','ActiveState','-p','MemoryCurrent','-p','NRestarts'],capture_output=True,text=True,check=True).stdout
mode=oct(stat.S_IMODE(Path('/var/lib/jarvis/voice-runtime/service-token').stat().st_mode))
print(json.dumps({'unit':unit,'credentialMode':mode}))
`));assert.equal(system.credentialMode,'0o600');assert(system.unit.includes('ActiveState=active'));
 return {status:'passed',at:new Date().toISOString(),build:health.build,residentReady:true,asr:engines.asr.model,tts:engines.tts.model,familyModel:models.routing.routes['family-chat'].model,keywordOnlyWithoutTranscriptionOrConversationCharge:true,system};
},{syntheticVoice:true});
await mkdir('artifacts/resident-voice',{recursive:true});await writeFile('artifacts/resident-voice/final-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
