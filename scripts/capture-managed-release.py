"""Explicit, serial managed release actions. Never starts the standby business service."""
import argparse,hashlib,json,shlex,subprocess,sys,textwrap
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('phase',choices=['stage','install','inspect','activate','health'])
parser.add_argument('--node',choices=['101','112'],required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--ssh-config',required=True)
parser.add_argument('--package')
parser.add_argument('--expected-current')
args=parser.parse_args()
import re
if not re.fullmatch('[a-z0-9][a-z0-9-]{0,79}',args.release):parser.error('Invalid release')
payload={'node':args.node,'release':args.release,'expectedCurrent':args.expected_current}
archive=None
if args.phase=='stage':
 if not args.package:parser.error('--package is required for stage')
 from zipfile import ZipFile
 path=Path(args.package).resolve();archive=path.read_bytes()
 with ZipFile(path) as zipped:
  manifest_raw=zipped.read('release-manifest.json');manifest=json.loads(manifest_raw)
  if manifest['archiveVersion']!=args.release or manifest['runtimeBuild']!=args.release:parser.error('Real release requires matching archive/runtime identity')
 payload.update(archiveSha256=hashlib.sha256(archive).hexdigest(),archiveBytes=len(archive),manifestSha256=hashlib.sha256(manifest_raw).hexdigest(),sourceCommit=manifest['sourceCommit'])
if args.phase=='activate' and not args.expected_current:parser.error('--expected-current is required for activate')

common=r'''
import os,json,hashlib,stat,subprocess,ssl,urllib.request,time,signal,sys,fcntl,uuid,shutil
from pathlib import Path
release=p['release'];base=Path('/opt/jarvis/releases')/release
class ActivationTimeout(RuntimeError): pass
class Budget:
 def __init__(self,forward_seconds=650,rollback_seconds=900,clock=time.monotonic):self.clock=clock;self.forward_seconds=forward_seconds;self.rollback_seconds=rollback_seconds;self.forward=self.clock();self.rollback=None
 def begin_rollback(self):
  if self.rollback is None:self.rollback=self.clock()
 def remaining(self,rollback=False):
  if rollback:
   self.begin_rollback();return max(0,self.rollback_seconds-(self.clock()-self.rollback))
  return max(0,self.forward_seconds-(self.clock()-self.forward))
 def timeout(self,cap,rollback=False,reserve=8):
  value=min(cap,self.remaining(rollback)-reserve)
  if value<0.05:raise ActivationTimeout('ROLLBACK_BUDGET_EXHAUSTED' if rollback else 'FORWARD_BUDGET_EXHAUSTED')
  return value
class ChildRunner:
 def __call__(self,argv,timeout,check=False,**kwargs):
  input_data=kwargs.pop('input',None)
  if input_data is not None:kwargs['stdin']=subprocess.PIPE
  if kwargs.pop('capture_output',False):kwargs.update(stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  child=subprocess.Popen(argv,start_new_session=True,**kwargs)
  try:
   try:out,err=child.communicate(input=input_data,timeout=timeout)
   except subprocess.TimeoutExpired:
    try:os.killpg(child.pid,signal.SIGTERM)
    except ProcessLookupError:pass
    try:out,err=child.communicate(timeout=3)
    except subprocess.TimeoutExpired:
     try:os.killpg(child.pid,signal.SIGKILL)
     except ProcessLookupError:pass
     try:out,err=child.communicate(timeout=3)
     except subprocess.TimeoutExpired:raise ActivationTimeout('CHILD_NOT_REAPED')
     raise ActivationTimeout('CHILD_TIMEOUT')
    raise ActivationTimeout('CHILD_TIMEOUT')
   result=subprocess.CompletedProcess(argv,child.returncode,out,err)
   if check and child.returncode:raise subprocess.CalledProcessError(child.returncode,argv,out,err)
   return result
  finally:
   if child.poll() is None:
    try:os.killpg(child.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:child.wait(timeout=3)
    except subprocess.TimeoutExpired:raise ActivationTimeout('CHILD_NOT_REAPED')
budget=Budget();runner=ChildRunner()
def run_bounded(argv,cap,rollback=False,**kwargs):
 return runner(argv,timeout=budget.timeout(cap,rollback),**kwargs)
def atomic_config_write(path,data,metadata,token):
 temp=path.with_name(path.name+'.capture-'+token)
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,stat.S_IMODE(metadata.st_mode))
 try:
  with os.fdopen(fd,'wb',closefd=False) as stream:
   stream.write(data);stream.flush();os.fchown(fd,metadata.st_uid,metadata.st_gid);os.fchmod(fd,stat.S_IMODE(metadata.st_mode));os.fsync(fd)
  os.replace(temp,path)
  dfd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(dfd)
  finally:os.close(dfd)
 finally:
  os.close(fd)
  try:temp.unlink()
  except FileNotFoundError:pass
def need(value,code):
 if not value:raise RuntimeError(code)
def regular(path):
 s=path.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==0 and not s.st_mode&0o022,'UNSAFE_FILE');return s
def safe_directory(path,private=False):
 s=path.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022 and (not private or stat.S_IMODE(s.st_mode)==0o700),'UNSAFE_DIRECTORY')
 for ancestor in path.parents:
  s=ancestor.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'UNSAFE_ANCESTOR')
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def manifest_verify():
 safe_directory(base);regular(base/'release-manifest.json');m=json.loads((base/'release-manifest.json').read_bytes());need(m['archiveVersion']==release and m['runtimeBuild']==release,'RELEASE_IDENTITY_MISMATCH')
 for row in m['files']:
  path=base/row['path'];need(path.resolve().is_relative_to(base) and '..' not in Path(row['path']).parts,'UNSAFE_MANIFEST_PATH');s=regular(path);need(s.st_size==row['size'] and digest(path)==row['sha256'],'STAGED_FILE_CHANGED')
  cursor=path.parent
  while cursor!=base:safe_directory(cursor);cursor=cursor.parent
 return m
def health_json(url,headers,rollback=False,timeout_cap=6):
 # The whole HTTP exchange runs in an owned child, so drip bodies cannot reset the deadline.
 code="import json,ssl,sys,urllib.request; p=json.load(sys.stdin); c=ssl.create_default_context(cafile=p['ca']) if p.get('ca') else None; r=urllib.request.urlopen(urllib.request.Request(p['url'],headers=p['headers']),context=c,timeout=5); b=r.read(1048577); r.close(); assert len(b)<=1048576, 'HEALTH_RESPONSE_TOO_LARGE'; v=json.loads(b); assert isinstance(v,dict), 'HEALTH_RESPONSE_INVALID'; print(json.dumps(v))"
 result=run_bounded(['python3','-I','-c',code],timeout_cap,rollback,input=json.dumps({'url':url,'headers':headers,'ca':'/etc/jarvis/tls/ca.crt'}),capture_output=True,text=True,check=True)
 return json.loads(result.stdout)
def state(rollback=False):
 def active(unit):
  r=run_bounded(['systemctl','is-active',unit],8,rollback,capture_output=True,text=True);return r.stdout.strip()
 config=json.loads(Path('/etc/jarvis/node.json').read_bytes());result={'node':p['node'],'release':config.get('release'),'role':config.get('role'),'currentRelease':Path('/opt/jarvis/current').resolve().name,'platformService':active('jarvis-platform.service'),'observerService':active('jarvis-observer.service')}
 observer=health_json('https://127.0.0.1:3141/status',{'x-jarvis-node-token':config['observerToken']},rollback)
 result['observerBuild']=observer.get('build');result['businessHealthy']=observer.get('businessHealthy')
 if p['node']=='112':
  health=health_json('https://127.0.0.1:3140/api/health',{},rollback)
  result['healthBuild']=health.get('build');result['healthStatus']=health.get('status')
 return result
'''
programs={
'stage':r'''
from zipfile import ZipFile
import io
safe_directory(base.parent);need(not base.exists() and not base.is_symlink(),'RELEASE_ALREADY_EXISTS')
data=sys.stdin.buffer.read(p['archiveBytes']+1);need(len(data)==p['archiveBytes'] and hashlib.sha256(data).hexdigest()==p['archiveSha256'],'UPLOAD_HASH_MISMATCH')
with ZipFile(io.BytesIO(data)) as zipped:
 names=zipped.namelist();need(len(names)==len(set(names)),'DUPLICATE_ZIP_PATH')
 raw=zipped.read('release-manifest.json');need(hashlib.sha256(raw).hexdigest()==p['manifestSha256'],'MANIFEST_HASH_MISMATCH');m=json.loads(raw)
 need(m['archiveVersion']==release and m['runtimeBuild']==release and m['sourceCommit']==p['sourceCommit'],'RELEASE_IDENTITY_MISMATCH')
 need(set(names)=={r['path'] for r in m['files']}|{'release-manifest.json'},'ZIP_INVENTORY_CHANGED')
 # Verify all bytes and entry types before creating a versioned destination.
 for row in m['files']:
  name=row['path'];path=Path(name);info=zipped.getinfo(name);need(not path.is_absolute() and '..' not in path.parts and '\\' not in name and stat.S_ISREG(info.external_attr>>16),'UNSAFE_ZIP_ENTRY')
  b=zipped.read(name);need(len(b)==row['size'] and hashlib.sha256(b).hexdigest()==row['sha256'],'ZIP_FILE_CHANGED')
 os.umask(0o022);base.mkdir(mode=0o755)
 for row in m['files']:
  target=base/row['path'];target.parent.mkdir(parents=True,exist_ok=True,mode=0o755);fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
  with os.fdopen(fd,'wb') as stream:stream.write(zipped.read(row['path']));stream.flush();os.fsync(stream.fileno())
  os.chmod(target,row['mode']&0o755)
 with (base/'release-manifest.json').open('xb') as stream:stream.write(raw)
 with (base/'.managed-release.sha256').open('x') as stream:stream.write(p['archiveSha256']+'\n')
m=manifest_verify();print(json.dumps({'node':p['node'],'release':release,'staged':True,'payloadFiles':len(m['files']),'manifestSha256':digest(base/'release-manifest.json'),'sourceCommit':m['sourceCommit'],'businessServiceChanged':False}))
''',
'install':r'''
m=manifest_verify();need(not (base/'.capture-install.json').exists(),'INSTALL_ALREADY_RECORDED')
log_root=Path('/var/lib/jarvis-control/capture-installs');log_root.mkdir(mode=0o700,parents=True,exist_ok=True);safe_directory(log_root,True);log=log_root/(release+'.log');fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
env=os.environ.copy();env['PATH']='/opt/jarvis/node/bin:'+env.get('PATH','');env['npm_config_audit']='false';env['npm_config_fund']='false'
with os.fdopen(fd,'wb') as stream:r=subprocess.run(['/opt/jarvis/node/bin/node','/opt/jarvis/node/lib/node_modules/npm/bin/npm-cli.js','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=base,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=300)
need(r.returncode==0,'DEPENDENCY_INSTALL_FAILED');manifest_verify()
receipt={'node':p['node'],'release':release,'lockfileSha256':digest(base/'package-lock.json'),'installed':True,'lifecycleScriptsExecuted':False,'manifestStillMatches':True,'businessServiceChanged':False}
with (base/'.capture-install.json').open('x') as stream:json.dump(receipt,stream)
print(json.dumps(receipt))
''',
'inspect':r'''
m=manifest_verify();print(json.dumps({'node':p['node'],'release':release,'verified':True,'payloadFiles':len(m['files']),'sourceCommit':m['sourceCommit'],'installed':(base/'.capture-install.json').is_file(),'manifestSha256':digest(base/'release-manifest.json'),'businessServiceChanged':False}))
''',
'health':r'''
print(json.dumps(state()))
''',
'activate':r'''
import shutil,uuid,fcntl
safe_directory(Path('/var/lib/jarvis-control'))
activation_lock=os.open('/var/lib/jarvis-control/capture-activate.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
lock_stat=os.fstat(activation_lock);need(stat.S_ISREG(lock_stat.st_mode) and lock_stat.st_uid==0 and lock_stat.st_nlink==1 and stat.S_IMODE(lock_stat.st_mode)==0o600,'UNSAFE_ACTIVATION_LOCK')
try:fcntl.flock(activation_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise RuntimeError('ACTIVATION_IN_PROGRESS')
# Kernel process exit releases it even if a transport is lost or an alarm fires.
m=manifest_verify();need((base/'.capture-install.json').is_file(),'INSTALL_REQUIRED')
config_path=Path('/etc/jarvis/node.json');s=regular(config_path);old=config_path.read_bytes();config=json.loads(old);prior=Path('/opt/jarvis/current').resolve()
need(config.get('release')==p['expectedCurrent'] and prior.name==p['expectedCurrent'],'CURRENT_RELEASE_CHANGED');need(config.get('role')==('primary' if p['node']=='112' else 'standby'),'NODE_ROLE_CHANGED')
# Inspect all actual JS/CSS files, including add-only emergency overlays not in
# the old manifest. Fail before control creation, service stop or snapshot.
asset_guard=base/'scripts/release-web-assets.py';regular(asset_guard)
asset_check=run_bounded(['python3','-I',str(asset_guard),'verify','--previous-root',str(prior),'--candidate-root',str(base)],60,capture_output=True,text=True)
need(asset_check.returncode==0,'CURRENT_WEB_ASSET_COMPATIBILITY_FAILED')
try:asset_receipt=json.loads(asset_check.stdout)
except Exception:raise RuntimeError('CURRENT_WEB_ASSET_COMPATIBILITY_RESPONSE')
need(asset_receipt.get('verified') is True and asset_receipt.get('previousRelease')==p['expectedCurrent'] and asset_receipt.get('release')==release,'CURRENT_WEB_ASSET_COMPATIBILITY_BINDING')
business_state=run_bounded(['systemctl','is-active','jarvis-platform.service'],8,capture_output=True,text=True).stdout.strip()
need(business_state==('active' if p['node']=='112' else 'inactive'),'BUSINESS_SERVICE_STATE_CHANGED')
if p['node']=='112':
 import sqlite3
 database=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=5)
 try:
  tables={r[0] for r in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
  if 'runtime_ai_runs' in tables:need(database.execute("SELECT COUNT(*) FROM runtime_ai_runs WHERE state='active'").fetchone()[0]==0,'ACTIVE_MODEL_WORK_REQUIRES_DRAIN')
  if 'runtime_voice_jobs' in tables:need(database.execute("SELECT COUNT(*) FROM runtime_voice_jobs WHERE status IN ('queued','running')").fetchone()[0]==0,'ACTIVE_VOICE_WORK_REQUIRES_DRAIN')
 finally:database.close()
control=Path('/var/lib/jarvis-control')/('capture-upgrade-'+release+'-'+p['node']);need(not control.exists(),'ACTIVATION_ALREADY_ATTEMPTED');control.mkdir(mode=0o700);safe_directory(control,True)
recovery=base/'scripts/capture-release-recovery.py';regular(recovery);recovery_hash=digest(recovery)
operation_path=control/'operation.json';opfd=os.open(operation_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(opfd,'w') as stream:json.dump({'pins':{'node':p['node'],'release':release,'recoveryPath':str(recovery)}},stream);stream.flush();os.fsync(stream.fileno())
control_fd=os.open(control,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);os.fsync(control_fd);os.close(control_fd)
for name,data in [('node-before.json',old),('previous-release.txt',str(prior).encode())]:
 fd=os.open(control/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
def switch(target):
 current=Path('/opt/jarvis/current');next=current.with_name('current.capture-next');need(not next.exists() and not next.is_symlink(),'CURRENT_NEXT_EXISTS');next.symlink_to(target);os.replace(next,current)
def services(action,rollback=False):
 if action=='stop':run_bounded(['systemctl','stop','jarvis-observer.service'],30,rollback,check=True)
 if p['node']=='112':run_bounded(['systemctl',action,'jarvis-platform.service'],40,rollback,check=True)
 if action=='start':run_bounded(['systemctl','start','jarvis-observer.service'],30,rollback,check=True)
snapshot=None
stopping_started=False
first_error=None
try:
 # Mark intent before the first stop: even a partial stop failure can require recovery.
 stopping_started=True
 services('stop')
 need(digest(recovery)==recovery_hash,'RECOVERY_SCRIPT_CHANGED');snapshot=json.loads(run_bounded(['python3',str(recovery),'snapshot','--source','/var/lib/jarvis/data','--snapshot',str(control/'data-snapshot'),'--release',release,'--scope',config['role']],180,capture_output=True,check=True).stdout)
 mh=snapshot['manifestSha256']
 restored=json.loads(run_bounded(['python3',str(recovery),'restore','--snapshot',str(control/'data-snapshot'),'--target',str(control/'restored-check'),'--expect-manifest-sha256',mh,'--release',release],360,capture_output=True,check=True).stdout)
 updated={**config,'release':release};atomic_config_write(config_path,(json.dumps(updated,separators=(',',':'))+'\n').encode(),s,'forward')
 switch(base);services('start')
 verified=None
 for attempt in range(20):
  try:
   value=state();need(value['observerBuild']==release and (p['node']=='101' and value['platformService']=='inactive' or p['node']=='112' and value.get('healthBuild')==release and value.get('healthStatus')=='ok'),'NEW_RELEASE_NOT_HEALTHY');verified=value;break
  except ActivationTimeout:raise
  except Exception as error:
   if attempt==19:raise
   time.sleep(min(1,budget.timeout(2)))
 receipt={'node':p['node'],'release':release,'previousRelease':prior.name,'active':True,'activationLockHeld':True,'dataSnapshot':snapshot,'isolatedRestore':restored,'health':verified,'productionDataRestored':False,'factoryResumed':False,'recoverySHA256':recovery_hash}
 with (control/'activation.json').open('x') as stream:json.dump(receipt,stream);stream.flush();os.fsync(stream.fileno())
 os.chmod(control/'activation.json',0o600);print(json.dumps(receipt))
except Exception as error:
 first_error={'code':str(error) if isinstance(error,RuntimeError) else type(error).__name__,'phase':'forward'}
 if stopping_started and first_error['code']=='CHILD_NOT_REAPED':
  failure={'failed':True,'firstError':first_error,'rollbackError':'NOT_ATTEMPTED_CHILD_NOT_REAPED','codeAndConfigRolledBack':False,'privateDataSnapshotRetained':snapshot is not None,'liveDataOverwritten':False,'recoverySHA256':recovery_hash,'manualRecoveryRequired':True}
  with (control/'activation-failed.json').open('x') as stream:json.dump(failure,stream);stream.flush();os.fsync(stream.fileno())
  os.chmod(control/'activation-failed.json',0o600)
 if stopping_started and first_error['code']!='CHILD_NOT_REAPED':
  budget.begin_rollback()
  try:
   services('stop',rollback=True)
   # Restore the exact original bytes through a same-directory fsynced replacement.
   atomic_config_write(config_path,old,s,'rollback')
   switch(prior);services('start',rollback=True)
   rollback_health=None
   for attempt in range(20):
    try:
     value=state(rollback=True);need(value['release']==p['expectedCurrent'] and value['currentRelease']==p['expectedCurrent'] and value['observerBuild']==p['expectedCurrent'] and (p['node']=='101' and value['platformService']=='inactive' or p['node']=='112' and value.get('healthBuild')==p['expectedCurrent'] and value.get('healthStatus')=='ok'),'ROLLBACK_NOT_HEALTHY');rollback_health=value;break
    except ActivationTimeout:raise
    except Exception:
     if attempt==19:raise
     time.sleep(min(1,budget.timeout(2,rollback=True)))
   failure={'failed':True,'firstError':first_error,'rollbackError':None,'codeAndConfigRolledBack':True,'rollbackHealth':rollback_health,'privateDataSnapshotRetained':snapshot is not None,'liveDataOverwritten':False,'recoverySHA256':recovery_hash}
  except Exception as rollback_error:
   failure={'failed':True,'firstError':first_error,'rollbackError':str(rollback_error) if isinstance(rollback_error,RuntimeError) else type(rollback_error).__name__,'codeAndConfigRolledBack':False,'privateDataSnapshotRetained':snapshot is not None,'liveDataOverwritten':False,'recoverySHA256':recovery_hash}
  with (control/'activation-failed.json').open('x') as stream:json.dump(failure,stream);stream.flush();os.fsync(stream.fileno())
  os.chmod(control/'activation-failed.json',0o600)
  if failure['rollbackError']:raise RuntimeError('ACTIVATION_FAILED_ROLLBACK_NEEDS_ATTENTION')
  raise RuntimeError('ACTIVATION_FAILED_CODE_CONFIG_ROLLED_BACK_DATA_PRESERVED')
 elif stopping_started:
  raise RuntimeError('ACTIVATION_FAILED_CHILD_NOT_REAPED_MANUAL_RECOVERY_REQUIRED')
'''}
code='p='+repr(payload)+'\n'+common+'\ntry:\n'+''.join(' '+line+'\n' for line in programs[args.phase].splitlines())+'except Exception as error:\n print(json.dumps({"ok":False,"phase":'+repr(args.phase)+',"node":p["node"],"code":str(error) if isinstance(error,RuntimeError) else type(error).__name__}));sys.exit(1)\n'
import ast
ast.parse(code)
command='sudo -n python3 -c '+shlex.quote(code)
result=subprocess.run(['ssh','-F',str(Path(args.ssh_config).resolve()),'-o','BatchMode=yes','-o','ConnectTimeout=8','jarvis-'+args.node,command],input=archive if archive is not None else b'',stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=(1600 if args.phase=='activate' else 920))
try:response=json.loads(result.stdout)
except Exception:response={'ok':False,'phase':args.phase,'node':args.node,'code':'SSH_OR_RESPONSE_FAILED','stderrBytes':len(result.stderr)}
print(json.dumps(response));sys.exit(result.returncode)
