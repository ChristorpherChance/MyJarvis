import {primary} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const fast=process.argv.includes('--fast');const result=JSON.parse(primary(`import json,time,urllib.request,uuid
from pathlib import Path
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();base='http://127.0.0.1:3153'
def get():
 with urllib.request.urlopen(urllib.request.Request(base+'/health',headers={'Authorization':'Bearer '+key}),timeout=5) as response:return json.load(response)
for attempt in range(20):
 try:health=get();break
 except Exception:
  if attempt==19:raise
  time.sleep(.5)
results=[]
for text in ['你好，我是贾维斯。现在可以和我聊天了。','贾维斯，请告诉我今天学习什么。','今天我们一起学习历史。']:
 start=time.monotonic();payload=json.dumps({'input':text,'model':'${fast?'matcha-resident':'kokoro-resident'}','voice':'${fast?'0':'58'}','response_format':'wav','speed':1}).encode()
 with urllib.request.urlopen(urllib.request.Request(base+'/v1/audio/speech',data=payload,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}),timeout=40) as response:audio=response.read()
 tts_ms=round((time.monotonic()-start)*1000);boundary=uuid.uuid4().hex
 body=('--'+boundary+'\\r\\nContent-Disposition: form-data; name="file"; filename="sample.wav"\\r\\nContent-Type: audio/wav\\r\\n\\r\\n').encode()+audio+('\\r\\n--'+boundary+'\\r\\nContent-Disposition: form-data; name="wake_word"\\r\\n\\r\\n贾维斯\\r\\n--'+boundary+'--\\r\\n').encode()
 start=time.monotonic()
 with urllib.request.urlopen(urllib.request.Request(base+'/v1/audio/transcriptions',data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'multipart/form-data; boundary='+boundary}),timeout=40) as response:recognized=json.load(response)
 results.append({'text':text,'ttsMs':tts_ms,'asrAndWakeMs':round((time.monotonic()-start)*1000),'recognized':recognized})
print(json.dumps({'health':health,'results':results,'metrics':get()['metrics']},ensure_ascii=False))
`));
await mkdir('artifacts/resident-voice',{recursive:true});await writeFile('artifacts/resident-voice/'+(fast?'benchmark-fast':'benchmark')+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
