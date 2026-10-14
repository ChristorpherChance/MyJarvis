import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,python,withPlatform} from './managed-server-client.mjs';
const fixtures=JSON.parse(primary(`import base64,json,urllib.request
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();samples=[]
for language,text in [('zh','贾维斯，请检查书房服务器的运行状态。')]:
 request=urllib.request.Request('http://127.0.0.1:3153/v1/audio/speech',data=json.dumps({'model':'matcha-resident','voice':'0','input':text}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=20) as response:samples.append({'language':language,'audio':base64.b64encode(response.read()).decode()})
official=Path('/var/lib/jarvis/voice-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/en.wav')
samples.append({'language':'en','source':'official-human-sample','audio':base64.b64encode(official.read_bytes()).decode()})
print(json.dumps(samples))
`));
const result=await withPlatform(async({api})=>{
 assert.equal((await api('/api/health')).build,'20261008-nas-protection-r9');const session=await api('/api/runtime/voice/sessions',{roomId:'study'}),samples=[];
 try{for(const fixture of [...fixtures,{...fixtures[0],language:'auto'}]){
  let job=await api('/api/runtime/voice/sessions/'+session.id+'/audio',Buffer.from(fixture.audio,'base64'),'POST',{contentType:'audio/wav',headers:{'X-Jarvis-Language':fixture.language}});
  for(let i=0;i<160&&['queued','running'].includes(job.status);i++){await new Promise(r=>setTimeout(r,100));job=await api('/api/runtime/voice/jobs/'+job.id);}
  assert.equal(job.status,'complete');assert.equal(job.result.language,fixture.language);const expectedPhraseMatched=fixture.language==='en'?/tribal chieftain/i.test(job.result.text)&&/pieces of gold/i.test(job.result.text):/服务器/.test(job.result.text);if(fixture.language!=='en')assert.equal(expectedPhraseMatched,true);assert(job.result.text.trim());samples.push({language:fixture.language,source:fixture.source??'synthetic-Chinese-audio',recognized:job.result.text,expectedPhraseMatched,seconds:job.result.seconds});
 }}finally{await api('/api/runtime/voice/sessions/'+session.id,undefined,'DELETE');}
 const system=JSON.parse(primary(`import json,subprocess,urllib.request
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();request=urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+key})
with urllib.request.urlopen(request,timeout=3) as response:health=json.load(response)
unit=subprocess.run(['systemctl','show','jarvis-voice.service','-p','ActiveState','-p','MemoryCurrent','-p','NRestarts'],capture_output=True,text=True,check=True).stdout
print(json.dumps({'revision':health.get('asrRevision'),'languageSelection':health.get('languageSelection'),'cacheLimit':health.get('recognizerCacheLimit'),'unit':unit}))
`));assert.equal(system.revision,'20261008-asr-quality-r1');assert.equal(system.cacheLimit,3);assert(system.unit.includes('ActiveState=active'));
 return {status:samples.every(s=>s.expectedPhraseMatched)?'passed':'runtime-checks-passed-quality-needs-improvement',at:new Date().toISOString(),build:'20261008-nas-protection-r9',fixtureSources:['synthetic-Chinese-audio','official-human-English-audio'],knownQualityIssue:'Both synthetic English and the official human English sample have word errors. See first-fixture-failure.json and official-human-sample-failure.json. No accuracy gain percentage asserted.',physicalMicrophone:false,samples,system};
},{syntheticVoice:true});
await mkdir('artifacts/asr-quality',{recursive:true});await writeFile('artifacts/asr-quality/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
