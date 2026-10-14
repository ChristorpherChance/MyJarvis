/** Install only the pinned VAD asset; do not restart or change the speech engine. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {primary,python,lanProfile} from './managed-server-client.mjs';
const digest='9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',file='silero_vad.onnx',folder='artifacts/resident-voice/models';
await mkdir(folder,{recursive:true});let data;
try{data=await readFile(folder+'/'+file);}catch{}
if(!data||createHash('sha256').update(data).digest('hex')!==digest){
 const metadata=await fetch('https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/asr-models');if(!metadata.ok)throw Error('VAD_METADATA_FAILED');
 const asset=(await metadata.json()).assets.find(a=>a.name===file);if(asset?.digest!=='sha256:'+digest)throw Error('VAD_RELEASE_DIGEST_MISMATCH');
 const response=await fetch(asset.url+'?download=1&ts='+Date.now(),{headers:{Accept:'application/octet-stream'},signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('VAD_DOWNLOAD_FAILED');
 data=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==digest)throw Error('VAD_ASSET_DIGEST_MISMATCH');await writeFile(folder+'/'+file,data);
}
const upload=spawnSync('sftp',['-F',lanProfile,'-b','-','jarvis-112'],{input:'put "'+resolve(folder+'/'+file).replaceAll('\\','/')+'" "/home/superopen/jarvis-silero-vad.onnx"\n',encoding:'utf8',windowsHide:true,timeout:30000});if(upload.status!==0)throw Error('VAD_UPLOAD_FAILED');
const result=JSON.parse(primary(python({digest},`import hashlib,json,os,pwd,subprocess
from pathlib import Path
source=Path('/home/superopen/jarvis-silero-vad.onnx');target=Path('/var/lib/jarvis/voice-models/silero_vad.onnx')
if hashlib.sha256(source.read_bytes()).hexdigest()!=p['digest']:raise RuntimeError('VAD upload digest mismatch')
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=p['digest']:raise RuntimeError('Refuse to overwrite a different VAD model')
source.replace(target);os.chown(target,0,pwd.getpwnam('jarvis').pw_gid);target.chmod(0o640)
print(json.dumps({'installed':True,'sha256':p['digest'],'bytes':target.stat().st_size,'serviceRestarted':False}))
`)));
await writeFile(folder+'/vad-manifest.json',JSON.stringify({file,tag:'asr-models',sha256:digest,source:'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',...result},null,2));console.log(JSON.stringify(result));
