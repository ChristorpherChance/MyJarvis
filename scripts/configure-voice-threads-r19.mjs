/** Change only the resident worker's existing CPU thread count, with a private rollback. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const execute=process.argv.includes('--execute');
const folder='artifacts/voice-latency-r19';await mkdir(folder,{recursive:true});
const expected=JSON.parse(await readFile(folder+'/thread-configuration.json','utf8'));
const program=String.raw`import os,stat,re,hashlib,tempfile,subprocess,time,sqlite3
from pathlib import Path
unit=Path('/etc/systemd/system/jarvis-voice.service')
for q in [unit.parent,*unit.parent.parents]:
 s=q.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('VOICE_UNIT_PARENT_UNTRUSTED')
s=unit.lstat()
if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022 or s.st_nlink!=1:raise RuntimeError('VOICE_UNIT_UNTRUSTED')
old=unit.read_bytes();before_sha=hashlib.sha256(old).hexdigest();text=old.decode()
matches=list(re.finditer(r'--threads([=\s]+)(\d+)(?=\s|$)',text))
if len(matches)!=1 or matches[0][2]!='2':raise RuntimeError('VOICE_THREAD_PARAMETER_CHANGED')
new=re.sub(r'--threads([=\s]+)2(?=\s|$)',lambda m:'--threads'+m[1]+'4',text).encode()
def state():
 r=subprocess.run(['systemctl','show','jarvis-voice.service','--property=ActiveState,SubState,MainPID'],capture_output=True,text=True,check=True,timeout=10)
 return dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=10)
try:active=c.execute("SELECT count(*) FROM runtime_voice_jobs WHERE status IN ('queued','running')").fetchone()[0]
finally:c.close()
if active:raise RuntimeError('VOICE_JOBS_NOT_IDLE')
if state().get('ActiveState')!='active':raise RuntimeError('VOICE_WORKER_NOT_ACTIVE')
result={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'unit':'jarvis-voice.service','beforeSHA256':before_sha,'threadsBefore':2,'threadsAfter':4,'activeVoiceJobs':active,'otherParametersUnchanged':True,'modelsCalled':0,'execute':p['execute']}
if p['execute']:
 if before_sha!=p['expectedSHA256']:raise RuntimeError('VOICE_UNIT_CAS_CONFLICT')
 backup=Path('/var/lib/jarvis-control/voice-r19-threads');backup.mkdir(mode=0o700,exist_ok=False)
 fd=os.open(backup/'jarvis-voice.service',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(old);f.flush();os.fsync(f.fileno())
 def replace(data):
  fd,temp=tempfile.mkstemp(prefix='.voice-r19-',dir=unit.parent)
  try:
   with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
   os.chmod(temp,stat.S_IMODE(s.st_mode));os.chown(temp,s.st_uid,s.st_gid);os.replace(temp,unit)
  finally:
   if os.path.exists(temp):os.unlink(temp)
 committed=False
 try:
  replace(new);subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True,timeout=15)
  subprocess.run(['systemctl','restart','jarvis-voice.service'],check=True,capture_output=True,timeout=20)
  for attempt in range(12):
   u=state();pid=int(u.get('MainPID','0'))
   if u.get('ActiveState')=='active' and pid>0:
    args=(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')
    if b'--threads' in args and args[args.index(b'--threads')+1]==b'4':break
   if attempt==11:raise RuntimeError('VOICE_NEW_THREAD_SETTING_NOT_ACTIVE')
   time.sleep(1)
  result.update({'afterSHA256':hashlib.sha256(unit.read_bytes()).hexdigest(),'actualProcessThreads':4,'privateBackupRemoteOnly':True,'unitActive':True,'memberPreferencesChanged':False,'beamSizeChanged':False,'deployed':True})
  committed=True
 finally:
  if not committed:
   replace(old);subprocess.run(['systemctl','daemon-reload'],capture_output=True,timeout=15)
   subprocess.run(['systemctl','restart','jarvis-voice.service'],capture_output=True,timeout=20)
print(json.dumps(result))
`;
// The preflight file is public metadata only. The complete systemd body remains on the server.
const preflightPath=folder+'/threads-deployment-preflight.json';
let sha;
if(execute)sha=JSON.parse(await readFile(preflightPath,'utf8')).beforeSHA256;
const result=JSON.parse(primary(python({execute,expectedSHA256:sha},program)));
await writeFile(execute?folder+'/threads-deployment.json':preflightPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
