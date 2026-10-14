/** Synthetic fixtures only; no personal speech, preference changes, or model gateway calls. */
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const code=String.raw`import io,json,time,wave,urllib.request,uuid,numpy as np
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();base='http://127.0.0.1:3153';results=[]
for model,sid in [('matcha-resident','0'),('kokoro-resident','58'),('kokoro-resident','17')]:
 for text in ['你好，我是贾维斯。','现在可以直接和我聊天。','重庆的银行今天开放吗？']:
  start=time.monotonic();request=urllib.request.Request(base+'/v1/audio/speech',data=json.dumps({'input':text,'model':model,'voice':sid,'speed':1}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=35) as r:raw=r.read()
  elapsed=round((time.monotonic()-start)*1000)
  with wave.open(io.BytesIO(raw)) as w:rate=w.getframerate();s=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
  windows=[float(np.sqrt(np.mean(s[i:i+int(rate*.02)]**2))) for i in range(0,len(s),int(rate*.02))];voiced=[i for i,v in enumerate(windows) if v>.008]
  boundary=uuid.uuid4().hex;body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="fixture.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode()+raw+('\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="language"\r\n\r\nzh\r\n--'+boundary+'--\r\n').encode()
  body=body.replace(b'\\r\\n',b'\r\n')
  with urllib.request.urlopen(urllib.request.Request(base+'/v1/audio/transcriptions',data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'multipart/form-data; boundary='+boundary}),timeout=35) as r:recognized=json.load(r)
  output=recognized.get('text','');plain=''.join(c for c in output if c.isalnum());expected=''.join(c for c in text if c.isalnum())
  results.append({'model':model,'sid':sid,'fixture':text,'ttsMs':elapsed,'audioSeconds':round(len(s)/rate,3),'leadingQuietMs':voiced[0]*20 if voiced else None,'trailingQuietMs':max(0,round(len(s)/rate*1000)-(voiced[-1]+1)*20) if voiced else None,'recognized':output,'unexpectedTailZhe':plain.endswith('这') and not expected.endswith('这')})
print(json.dumps(results,ensure_ascii=False))`;
const result=JSON.parse(primary(python({code},`import subprocess
r=subprocess.run(['/opt/jarvis/voice-venv/bin/python','-c',p['code']],capture_output=True,text=True,timeout=240)
if r.returncode:raise RuntimeError(r.stderr[-1000:])
print(r.stdout)`)));
await mkdir('artifacts/voice-response-r16',{recursive:true});
await writeFile('artifacts/voice-response-r16/tts-baseline.json',JSON.stringify(result,null,2));
for(const x of result)console.log(JSON.stringify(x));
