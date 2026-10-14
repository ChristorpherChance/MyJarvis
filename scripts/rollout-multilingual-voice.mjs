import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {lanProfile,python} from './managed-server-client.mjs';
const revision=process.argv.find(a=>a.startsWith('--revision='))?.slice(11)??'20261010-multilingual-r2',staging='/var/lib/jarvis/voice-staging-20261010-multilingual';
if(!/^20261010-multilingual-r\d+$/.test(revision))throw Error('INVALID_VOICE_REVISION');
const worker=await readFile('apps/api/resources/voice/resident_voice.py','utf8');
if(!worker.includes(revision))throw Error('WORKER_REVISION_MISMATCH');
const script=python({revision,staging,worker},String.raw`import json,subprocess,time,urllib.request,os,pwd,hashlib,shutil
from pathlib import Path
root=Path(p['staging']);venv=root/'venv/bin/python';models=root/'models';token=Path('/var/lib/jarvis/voice-runtime/service-token');live=Path('/opt/jarvis/resident_voice.py');unit=Path('/etc/systemd/system/jarvis-voice.service')
if not venv.is_file() or not models.is_dir():raise RuntimeError('MULTILINGUAL_STAGING_MISSING')
account=pwd.getpwnam('jarvis');candidate=root/'release-candidate.py';candidate.write_text(p['worker']);candidate.chmod(0o750);os.chown(candidate,0,account.pw_gid)
def health(port):
 with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(port)+'/health',headers={'Authorization':'Bearer '+token.read_text().strip()}),timeout=3) as response:return json.load(response)
def ready(port,seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:
   info=health(port)
   if info.get('ready') is True and info.get('asrRevision')==p['revision'] and set(['en','fr','de']).issubset(info.get('piperLanguages',[])) and set(['en','fr','de','auto']).issubset(info.get('asrLanguages',[])):return info
  except Exception:pass
  time.sleep(.5)
 raise RuntimeError('MULTILINGUAL_READY_TIMEOUT')
args=[str(venv),str(candidate),'--models','/var/lib/jarvis/voice-models','--multilingual-models',str(models),'--token-file',str(token),'--threads','2']
log=root/'rollout-preflight.log'
with log.open('w') as output:
 process=subprocess.Popen(['runuser','-u','jarvis','--']+args+['--port','3154'],stdout=output,stderr=output,env={**os.environ,'OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','MKL_NUM_THREADS':'2'})
 try:preflight=ready(3154,65)
 finally:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait()
backup=Path('/var/lib/jarvis-control/voice-releases')/p['revision'];backup.mkdir(parents=True,mode=0o700,exist_ok=True)
if (backup/'manifest.json').exists():raise RuntimeError('VOICE_RELEASE_ALREADY_ACTIVATED_USE_FRESH_REVISION')
shutil.copy2(live,backup/'resident_voice.py');shutil.copy2(unit,backup/'jarvis-voice.service');manifest={'revision':p['revision'],'previousWorkerSha256':hashlib.sha256(live.read_bytes()).hexdigest(),'previousUnitSha256':hashlib.sha256(unit.read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256(p['worker'].encode()).hexdigest()};(backup/'manifest.json').write_text(json.dumps(manifest))
try:
 next=live.with_suffix('.next.py');next.write_text(p['worker']);next.chmod(0o750);os.chown(next,0,account.pw_gid);os.replace(next,live)
 previous=unit.read_text();lines=previous.splitlines();lines=[('ExecStart='+str(venv)+' '+str(live)+' --models /var/lib/jarvis/voice-models --multilingual-models '+str(models)+' --token-file '+str(token)+' --threads 2') if line.startswith('ExecStart=') else 'MemoryMax=5G' if line.startswith('MemoryMax=') else 'TasksMax=64' if line.startswith('TasksMax=') else line for line in lines if not line.startswith(('Environment=OPENBLAS_NUM_THREADS=','Environment=MKL_NUM_THREADS='))]
 service=lines.index('[Service]');lines[service+1:service+1]=['Environment=OPENBLAS_NUM_THREADS=2','Environment=MKL_NUM_THREADS=2'];unit.write_text('\n'.join(lines)+'\n')
 subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','restart','jarvis-voice.service'],check=True)
 production=ready(3153,65);print(json.dumps({'installed':True,'revision':p['revision'],'staging':str(root),'backup':str(backup),'health':production,'preflightAsJarvis':True}))
except Exception:
 restored=False
 try:
  shutil.copy2(backup/'resident_voice.py',live);shutil.copy2(backup/'jarvis-voice.service',unit);subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','restart','jarvis-voice.service'],check=True)
  end=time.monotonic()+65
  while time.monotonic()<end:
   try:
    restored=health(3153).get('ready') is True and hashlib.sha256(live.read_bytes()).hexdigest()==manifest['previousWorkerSha256'] and hashlib.sha256(unit.read_bytes()).hexdigest()==manifest['previousUnitSha256']
    if restored:break
   except Exception:pass
   time.sleep(.5)
 except Exception:restored=False
 print(json.dumps({'installed':False,'rolledBack':restored,'revision':p['revision']}));raise
`);
const result=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-112','sudo -n python3 -'],{input:script,encoding:'utf8',windowsHide:true,timeout:190000,maxBuffer:1000000});
if(result.status!==0)throw Error('VOICE_ROLLOUT_FAILED '+result.stderr.slice(-1200));
console.log(result.stdout.trim());
