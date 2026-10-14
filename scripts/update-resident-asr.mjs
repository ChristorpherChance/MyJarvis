/** Atomic worker update with a health check and rollback; existing unit/token/models stay in place. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {primary,python} from './managed-server-client.mjs';
const release='20261008-voice-quality-r10',worker=await readFile('apps/api/resources/voice/resident_voice.py','utf8'),sha256=createHash('sha256').update(worker).digest('hex');
const result=JSON.parse(primary(python({worker,release,sha256},`import hashlib,os,pwd,subprocess,json,time,urllib.request,py_compile
from pathlib import Path
target=Path('/opt/jarvis/resident_voice.py');backup=Path('/var/lib/jarvis-control/pre-'+p['release']);backup.mkdir(mode=0o700,exist_ok=True)
saved=backup/'resident_voice.py'
if not saved.exists():saved.write_bytes(target.read_bytes());saved.chmod(0o600)
next=target.with_suffix('.next.py');next.write_text(p['worker']);next.chmod(0o750);account=pwd.getpwnam('jarvis');os.chown(next,0,account.pw_gid)
dropin=Path('/etc/systemd/system/jarvis-voice.service.d/20-task-capacity.conf');previous_dropin=dropin.read_bytes() if dropin.exists() else None
dropin.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
if not (backup/'task-capacity.json').exists():(backup/'task-capacity.json').write_text(json.dumps({'previous':previous_dropin.decode() if previous_dropin is not None else None}));(backup/'task-capacity.json').chmod(0o600)
if hashlib.sha256(next.read_bytes()).hexdigest()!=p['sha256']:raise RuntimeError('Worker hash mismatch')
py_compile.compile(str(next),cfile=str(backup/'validated.pyc'),doraise=True)
try:
 os.replace(next,target);dropin.write_text(chr(10).join(['[Service]','TasksMax=64','']));dropin.chmod(0o644);subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','restart','jarvis-voice.service'],check=True)
 token=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
 for attempt in range(20):
  try:
   request=urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+token})
   with urllib.request.urlopen(request,timeout=2) as response:health=json.load(response)
   if not health.get('ready') or health.get('asrRevision')!=p['release'] or health.get('speechDetection')!='silero-local':raise RuntimeError('Unexpected speech worker')
   break
  except Exception:
   if attempt==19:raise
   time.sleep(1)
 print(json.dumps({'status':'passed','release':p['release'],'workerSHA256':p['sha256'],'ready':True,'languageSelection':health['languageSelection'],'recognizerCacheLimit':health['recognizerCacheLimit'],'speechDetection':health['speechDetection'],'taskLimit':64}))
except Exception:
 if previous_dropin is None:dropin.unlink(missing_ok=True)
 else:dropin.write_bytes(previous_dropin)
 target.write_bytes(saved.read_bytes());target.chmod(0o750);os.chown(target,0,account.pw_gid);subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','restart','jarvis-voice.service'],check=True);raise
`)));
await mkdir('artifacts/asr-quality',{recursive:true});await writeFile('artifacts/asr-quality/worker-deployment.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
