import {primary} from './managed-server-client.mjs';
console.log(primary(`import json,os,shutil,subprocess
print(json.dumps({'cpu':os.cpu_count(),'diskFreeGB':round(shutil.disk_usage('/var/lib/jarvis').free/1e9,1),'python':subprocess.run(['/opt/jarvis/venv/bin/python','-c','import sys;print(sys.version)'],capture_output=True,text=True).stdout.strip(),'models':os.listdir('/var/lib/jarvis/data/runtime/models')},ensure_ascii=False))
`));
for(const tag of ['asr-models','tts-models','kws-models','v1.13.8']){
 const response=await fetch('https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/'+tag);
 if(!response.ok){console.log({tag,status:response.status});continue;}
 const body=await response.json();console.log({tag,assets:body.assets.filter(a=>/sense-voice.*2025-09|kokoro-int8.*v1_1|kws.*2025-12|wasm/.test(a.name)).map(({name,size,digest,browser_download_url})=>({name,size,digest,url:browser_download_url}))});
}
