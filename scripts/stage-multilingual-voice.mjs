/** Install only an isolated staging venv; never mutates a production unit/config/model. */
import {primary,python} from './managed-server-client.mjs';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('config/voice-multilingual-assets.json','utf8'));
const stage='/var/lib/jarvis/voice-staging-20261010-multilingual';
if(process.argv.includes('--status')){
 console.log(primary(python({stage},`from pathlib import Path
import json
r=Path(p['stage'])
s=r/'install-status.json'
print(s.read_text() if s.exists() else json.dumps({'state':'not-started'}))
`)));
}else{
const installer=`import subprocess,json,time,os
from pathlib import Path
root=Path(${JSON.stringify(stage)})
def status(**values):
 temporary=root/'install-status.partial';temporary.write_text(json.dumps(values));temporary.chmod(0o600);temporary.replace(root/'install-status.json')
status(state='running',startedAt=time.time())
try:
 with (root/'install.log').open('a') as log:
  assert str(root)=='/var/lib/jarvis/voice-staging-20261010-multilingual'
  subprocess.run(['/opt/jarvis/voice-venv/bin/python','-m','venv','--clear',str(root/'venv')],stdout=log,stderr=log,check=True)
  subprocess.run([str(root/'venv/bin/python'),'-m','pip','install','--disable-pip-version-check','--retries','5','--timeout','120','sherpa-onnx==1.13.8','numpy==2.2.6','av==19.0.0','pypinyin==0.55.0','sentencepiece==0.2.1','faster-whisper==1.2.1','ctranslate2==4.6.0'],stdout=log,stderr=log,check=True)
  subprocess.run([str(root/'venv/bin/python'),'-m','pip','check'],stdout=log,stderr=log,check=True)
 status(state='complete',exitCode=0,completedAt=time.time())
except Exception as error:status(state='failed',exitCode=getattr(error,'returncode',1),completedAt=time.time())
`;
console.log(primary(python({stage,installer,revision:manifest.revision},`from pathlib import Path
import os,pwd,subprocess,json
r=Path(p['stage']);assert str(r)=='/var/lib/jarvis/voice-staging-20261010-multilingual'
uid=pwd.getpwnam('jarvis').pw_uid;gid=pwd.getpwnam('jarvis').pw_gid
r.mkdir(mode=0o750,parents=True,exist_ok=True);os.chown(r,uid,gid)
status=r/'install-status.json'
if status.exists() and json.loads(status.read_text()).get('state') in ['running','complete']:
 print(status.read_text())
else:
 f=r/'install.py';f.write_text(p['installer']);f.chmod(0o600);os.chown(f,uid,gid)
 log=r/'install.log';log.touch(mode=0o600,exist_ok=True);os.chown(log,uid,gid)
 process=subprocess.Popen(['runuser','-u','jarvis','--','python3',str(f)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 print(json.dumps({'state':'started','revision':p['revision'],'stage':str(r),'pid':process.pid}))
`)));
}
