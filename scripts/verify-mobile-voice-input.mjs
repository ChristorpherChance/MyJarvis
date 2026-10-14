/** Synthetic speech only. Tests deployed PCM and iPhone-style AAC input; never opens a user's mic. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,python,withPlatform} from './managed-server-client.mjs';

const expected=process.argv.find(value=>value.startsWith('--build='))?.slice(8);
const fixtures=JSON.parse(primary(python({code:`import base64,json,urllib.request,wave,io,struct,math,av,numpy as np
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
req=urllib.request.Request('http://127.0.0.1:3153/v1/audio/speech',data=json.dumps({'model':'matcha-resident','voice':'0','input':'请检查书房服务器的运行状态。'}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=20) as response:audio=response.read()
with wave.open(io.BytesIO(audio),'rb') as w:
 rate=w.getframerate();channels=w.getnchannels();width=w.getsampwidth();samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').copy()
assert channels==1 and width==2
def wav(values):
 out=io.BytesIO()
 with wave.open(out,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(np.asarray(values,dtype='<i2').tobytes())
 return out.getvalue()
def aac(values):
 out=io.BytesIO()
 with av.open(out,mode='w',format='mp4') as container:
  stream=container.add_stream('aac',rate=rate);stream.layout='mono';stream.bit_rate=64000
  frame=av.AudioFrame.from_ndarray(np.asarray(values,dtype=np.int16).reshape(1,-1),format='s16',layout='mono');frame.sample_rate=rate
  for packet in stream.encode(frame):container.mux(packet)
  for packet in stream.encode(None):container.mux(packet)
 return out.getvalue()
items=[('pcm-wav',audio,'audio/wav',True),('iphone-aac-mp4',aac(samples),'audio/mp4',True),('quiet-10-percent',wav(samples*.1),'audio/wav',True),('quiet-3-percent',wav(samples*.03),'audio/wav',False),('quiet-1-percent',wav(samples*.01),'audio/wav',False),('synthetic-silence',wav(np.zeros(rate*2)),'audio/wav',False)]
print(json.dumps([{'name':name,'audio':base64.b64encode(data).decode(),'mime':mime,'mustRecognize':required} for name,data,mime,required in items]))
`},`import subprocess
r=subprocess.run(['/opt/jarvis/voice-venv/bin/python','-c',p['code']],capture_output=True,text=True,check=True,timeout=40)
print(r.stdout)
`)));

const report=await withPlatform(async({api})=>{
 const platform=await api('/api/health');if(expected)assert.equal(platform.build,expected);
 const health=await api('/api/runtime/voice/engines/health');assert.equal(health.ready,true);
 const session=await api('/api/runtime/voice/sessions',{roomId:'study'}),samples=[];
 for(const fixture of fixtures){
  const began=Date.now();let job=await api(`/api/runtime/voice/sessions/${session.id}/audio`,Buffer.from(fixture.audio,'base64'),'POST',{contentType:fixture.mime,headers:{'X-Jarvis-Language':'zh'}});
  for(let n=0;n<300&&['queued','running'].includes(job.status);n++){await new Promise(r=>setTimeout(r,100));job=await api('/api/runtime/voice/jobs/'+job.id);}
  assert.equal(job.status,'complete',JSON.stringify({fixture:fixture.name,status:job.status,code:job.result?.code}));
  const recognized=!!job.result.text?.includes('服务器');
  if(fixture.mustRecognize)assert.equal(recognized,true,fixture.name);
  if(fixture.name==='synthetic-silence'){assert.equal(job.result.noSpeech,true);assert.equal(job.result.text,'');}
  const result={name:fixture.name,mime:fixture.mime,bytes:Buffer.from(fixture.audio,'base64').length,recognizedExpectedWords:recognized,recognizedChars:job.result.text?.length??0,noSpeech:job.result.noSpeech===true,processingMs:Date.now()-began};samples.push(result);console.log(JSON.stringify(result));
 }
 return {status:'passed',at:new Date().toISOString(),build:platform.build,workerRevision:health.asrRevision,samples,physicalMicrophones:0,physicalPhones:0,limits:'Synthetic audio validates decoding, routing and recognition; phone permissions, live microphone and background behavior need on-device verification.'};
},{syntheticVoice:true});
await mkdir('artifacts/mobile-voice-recovery',{recursive:true});
await writeFile('artifacts/mobile-voice-recovery/production-audio.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
