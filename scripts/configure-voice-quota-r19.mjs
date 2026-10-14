/** Narrow resident voice CPU-time quota change. No model call, account preference or node policy change. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const execute=process.argv.includes('--execute');
const folder='artifacts/voice-latency-r19';await mkdir(folder,{recursive:true});
const preflightPath=folder+'/quota-adjustment-preflight.json',resultPath=folder+'/quota-adjustment.json';
const program=String.raw`import os,stat,re,hashlib,tempfile,subprocess,time,sqlite3,urllib.request
from pathlib import Path
UNIT='jarvis-voice.service';SOURCE=Path('/etc/systemd/system/jarvis-voice.service');BACKUP=Path('/var/lib/jarvis-control/voice-r19-threads/cpu-quota-r19')
def trusted(path,directory=False,private=False):
 s=path.lstat()
 if stat.S_ISLNK(s.st_mode) or (not stat.S_ISDIR(s.st_mode) if directory else not stat.S_ISREG(s.st_mode)) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('VOICE_QUOTA_PATH_UNTRUSTED')
 if private and stat.S_IMODE(s.st_mode)!=0o700:raise RuntimeError('VOICE_QUOTA_BACKUP_PARENT_NOT_PRIVATE')
 if not directory and s.st_nlink!=1:raise RuntimeError('VOICE_QUOTA_FILE_HARDLINK')
 return s
for q in [SOURCE.parent,*SOURCE.parent.parents]:trusted(q,True)
info=trusted(SOURCE)
for q in [BACKUP.parent,*BACKUP.parent.parents]:trusted(q,True)
trusted(BACKUP.parent,True,True)
old=SOURCE.read_bytes();before_sha=hashlib.sha256(old).hexdigest();text=old.decode()
directives=list(re.finditer(r'(?m)^[ \t]*CPUQuota[ \t]*=',text))
matches=list(re.finditer(r'(?m)^([ \t]*CPUQuota[ \t]*=[ \t]*)250%([ \t]*)(\r?)$',text))
if len(directives)!=1 or len(matches)!=1:raise RuntimeError('VOICE_QUOTA_EXISTING_VALUE_CHANGED')
match=matches[0];sections=re.findall(r'(?m)^[ \t]*\[([^\]]+)\][ \t]*\r?$',text[:match.start()])
if not sections or sections[-1]!='Service':raise RuntimeError('VOICE_QUOTA_SECTION_INVALID')
new=(text[:match.start()]+match[1]+'400%'+match[2]+match[3]+text[match.end():]).encode()
new_sha=hashlib.sha256(new).hexdigest()
if new.replace(b'400%',b'250%',1)!=old:raise RuntimeError('VOICE_QUOTA_UNRELATED_CHANGE')
def unit():
 r=subprocess.run(['systemctl','show',UNIT,'--property=ActiveState,SubState,MainPID,User,ControlGroup,CPUQuotaPerSecUSec,FragmentPath,DropInPaths'],capture_output=True,text=True,check=True,timeout=10)
 return dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
def source_hashes(u):
 files=[Path(u['FragmentPath']),*(Path(x) for x in u['DropInPaths'].split())]
 if Path(u['FragmentPath'])!=Path('/etc/systemd/system/jarvis-voice.service') or SOURCE not in files:raise RuntimeError('VOICE_QUOTA_UNIT_SCOPE_CHANGED')
 result={}
 for path in files:
  if path.parent not in [Path('/etc/systemd/system'),Path('/etc/systemd/system/jarvis-voice.service.d')]:raise RuntimeError('VOICE_QUOTA_SOURCE_SCOPE_CHANGED')
  for parent in [path.parent,*path.parent.parents]:trusted(parent,True)
  trusted(path);result[str(path)]=hashlib.sha256(path.read_bytes()).hexdigest()
 return result
def jobs():
 c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=10)
 try:return c.execute("SELECT count(*) FROM runtime_voice_jobs WHERE status IN ('queued','running')").fetchone()[0]
 finally:c.close()
def process_threads(u):
 pid=int(u.get('MainPID','0'))
 if pid<=0:return None
 args=(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')
 if args.count(b'--threads')!=1:return None
 return int(args[args.index(b'--threads')+1])
def cpu_limit(u):
 if u.get('ControlGroup')!='/system.slice/'+UNIT:raise RuntimeError('VOICE_QUOTA_CGROUP_SCOPE_CHANGED')
 q=Path('/sys/fs/cgroup')/u['ControlGroup'].lstrip('/')/'cpu.max'
 parts=q.read_text().strip().split()
 if len(parts)!=2 or not all(x.isdigit() for x in parts):raise RuntimeError('VOICE_QUOTA_EFFECTIVE_LIMIT_UNKNOWN')
 quota,period=map(int,parts)
 if period<=0:raise RuntimeError('VOICE_QUOTA_PERIOD_INVALID')
 return {'quota':quota,'period':period,'cpuTimeCores':quota/period}
def ready():
 key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
 req=urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+key})
 with urllib.request.urlopen(req,timeout=2) as response:health=json.load(response)
 return health.get('ready') is True
u=unit();hashes=source_hashes(u);active=jobs();limit=cpu_limit(u)
if u.get('ActiveState')!='active' or u.get('User')!='jarvis' or process_threads(u)!=4 or active or limit['cpuTimeCores']!=2.5 or u.get('CPUQuotaPerSecUSec')!='2.500000s':raise RuntimeError('VOICE_QUOTA_PREFLIGHT_STATE_INVALID')
if not ready():raise RuntimeError('VOICE_QUOTA_ENGINE_NOT_READY')
result={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'execute':p['execute'],'unit':UNIT,'sourceFile':str(SOURCE),'cpuQuotaLine':text[:match.start()].count('\n')+1,'beforeSHA256':before_sha,'expectedAfterSHA256':new_sha,'sourceHashesBefore':hashes,'mainPIDBefore':int(u['MainPID']),'quotaBeforePercent':250,'quotaAfterPercent':400,'effectiveBefore':limit,'actualWorkerThreads':4,'activeVoiceJobs':active,'backupParentRootPrivate':True,'otherParametersUnchanged':True,'userPreferencesChanged':False,'automaticInputLanguageChanged':False,'beamSizeChanged':False,'modelCalls':0,'sourceProjectsModified':False,'quotaSemantics':'Maximum CPU time per period across shared logical CPUs; no exclusive cores are reserved','voiceJobsAdmissionBarrier':False,'concurrencyLimit':'Idle checks are snapshots; a new voice request racing the controlled restart can be interrupted. This tool does not pause request admission.'}
if p['execute']:
 if before_sha!=p['expected']['beforeSHA256'] or hashes!=p['expected']['sourceHashesBefore'] or int(u['MainPID'])!=p['expected']['mainPIDBefore']:raise RuntimeError('VOICE_QUOTA_CAS_CONFLICT')
 BACKUP.mkdir(mode=0o700,exist_ok=False);trusted(BACKUP,True,True)
 fd=os.open(BACKUP/'jarvis-voice.service',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(old);f.flush();os.fsync(f.fileno())
 def replace(data):
  fd,temp=tempfile.mkstemp(prefix='.voice-quota-r19-',dir=SOURCE.parent)
  try:
   with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
   os.chmod(temp,stat.S_IMODE(info.st_mode));os.chown(temp,info.st_uid,info.st_gid);os.replace(temp,SOURCE)
  finally:
   if os.path.exists(temp):os.unlink(temp)
 def wait_ready(percent,seconds=60):
  deadline=time.monotonic()+seconds
  while time.monotonic()<deadline:
   current=unit()
   if current.get('ActiveState')=='active' and process_threads(current)==4:
    try:
     effective=cpu_limit(current)
     if effective['cpuTimeCores']==percent/100 and ready():return current,effective
    except (urllib.error.URLError,TimeoutError,ConnectionError):pass
   time.sleep(1)
  raise RuntimeError('VOICE_QUOTA_ENGINE_READY_TIMEOUT')
 changed=False;failure=None;rollback=None
 try:
  if jobs() or SOURCE.read_bytes()!=old or source_hashes(unit())!=hashes:raise RuntimeError('VOICE_QUOTA_STATE_CHANGED_BEFORE_REPLACE')
  replace(new);changed=True
  subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True,timeout=15)
  # Restart this idle resident worker only; threads, weights and ASR decoding options remain identical.
  subprocess.run(['systemctl','restart',UNIT],check=True,capture_output=True,timeout=20)
  current,effective=wait_ready(400)
  expected_hashes={**hashes,str(SOURCE):new_sha}
  if source_hashes(current)!=expected_hashes or current.get('CPUQuotaPerSecUSec') not in ['4s','4.000000s']:raise RuntimeError('VOICE_QUOTA_POST_CAS_INVALID')
  result.update({'afterSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceHashesAfter':expected_hashes,'unitActive':True,'engineReady':True,'effectiveAfter':effective,'systemdQuotaAfter':current.get('CPUQuotaPerSecUSec'),'actualProcessThreads':process_threads(current),'mainPIDAfter':int(current['MainPID']),'privateBackupRemoteOnly':True,'deployed':True})
 except Exception as error:
  failure=str(error) if isinstance(error,RuntimeError) and str(error).startswith('VOICE_QUOTA_') else 'VOICE_QUOTA_REMOTE_OPERATION_FAILED'
  if changed:
   try:
    current_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if current_hash not in [before_sha,new_sha]:raise RuntimeError('VOICE_QUOTA_ROLLBACK_CAS_CONFLICT')
    observed=source_hashes(unit());expected_current={**hashes,str(SOURCE):current_hash}
    if observed!=expected_current:raise RuntimeError('VOICE_QUOTA_ROLLBACK_SOURCE_CHANGED')
    replace(old);subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True,timeout=15)
    subprocess.run(['systemctl','restart',UNIT],check=True,capture_output=True,timeout=20)
    current,effective=wait_ready(250,30)
    rollback={'fileRestored':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==before_sha,'sourceHashesRestored':source_hashes(current)==hashes,'unitActive':current.get('ActiveState')=='active','effectiveOldQuota':effective['cpuTimeCores']==2.5,'engineReady':True,'workerThreadsPreserved':process_threads(current)==4}
    rollback['verified']=all(rollback.values())
   except Exception:rollback={'verified':False,'requiresReconciliation':True}
  result.update({'deployed':False,'failureCode':failure,'rollback':rollback,'changedBeforeFailure':changed})
print(json.dumps(result))
`;
if(!execute){
 const result=JSON.parse(remote(lanProfile,'jarvis-112',python({execute:false},program),true));
 await writeFile(preflightPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}else{
 const expected=JSON.parse(await readFile(preflightPath,'utf8'));
 const report={at:new Date().toISOString(),status:'intent-persisted',scope:{unit:'jarvis-voice.service',sourceFile:expected.sourceFile,quotaBeforePercent:250,quotaAfterPercent:400},expectedBeforeSHA256:expected.beforeSHA256,sourceHashesBefore:expected.sourceHashesBefore,modelCalls:0};
 await writeFile(resultPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 const persist=()=>writeFile(resultPath,JSON.stringify(report,null,2)+'\n');
 try{
  const result=JSON.parse(remote(lanProfile,'jarvis-112',python({execute:true,expected},program),true,{timeoutMs:180000}));
  report.result=result;report.status=result.deployed?'verified':result.rollback?.verified?'failed-restored':'failed-requires-reconciliation';await persist();
  console.log(JSON.stringify(report));if(!result.deployed)process.exitCode=1;
 }catch{
  report.status='uncertain';report.failureCode='VOICE_QUOTA_COMMUNICATION_OR_REPORT_FAILED';report.requiresReadOnlyReconciliation=true;await persist();process.exitCode=1;console.log(JSON.stringify(report));
 }
}
