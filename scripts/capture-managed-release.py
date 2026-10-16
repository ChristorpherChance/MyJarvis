"""Explicit, serial managed release actions. Never starts the standby business service."""
import argparse,hashlib,json,shlex,subprocess,sys
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
import os,json,hashlib,stat,subprocess,ssl,urllib.request,time,signal,sys
from pathlib import Path
signal.alarm(900)
release=p['release'];base=Path('/opt/jarvis/releases')/release
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
def state():
 def active(unit):
  r=subprocess.run(['systemctl','is-active',unit],capture_output=True,text=True,timeout=8);return r.stdout.strip()
 config=json.loads(Path('/etc/jarvis/node.json').read_bytes());result={'node':p['node'],'release':config.get('release'),'role':config.get('role'),'currentRelease':Path('/opt/jarvis/current').resolve().name,'platformService':active('jarvis-platform.service'),'observerService':active('jarvis-observer.service')}
 context=ssl.create_default_context(cafile='/etc/jarvis/tls/ca.crt')
 req=urllib.request.Request('https://127.0.0.1:3141/status',headers={'x-jarvis-node-token':config['observerToken']})
 with urllib.request.urlopen(req,context=context,timeout=5) as response:observer=json.load(response)
 result['observerBuild']=observer.get('build');result['businessHealthy']=observer.get('businessHealthy')
 if p['node']=='112':
  with urllib.request.urlopen('https://127.0.0.1:3140/api/health',context=context,timeout=5) as response:health=json.load(response)
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
# This process owns the lock through old/new health verification and rollback.
# Kernel process exit releases it even if a transport is lost or an alarm fires.
m=manifest_verify();need((base/'.capture-install.json').is_file(),'INSTALL_REQUIRED')
config_path=Path('/etc/jarvis/node.json');s=regular(config_path);old=config_path.read_bytes();config=json.loads(old);prior=Path('/opt/jarvis/current').resolve()
need(config.get('release')==p['expectedCurrent'] and prior.name==p['expectedCurrent'],'CURRENT_RELEASE_CHANGED');need(config.get('role')==('primary' if p['node']=='112' else 'standby'),'NODE_ROLE_CHANGED')
business_state=subprocess.run(['systemctl','is-active','jarvis-platform.service'],capture_output=True,text=True,timeout=8).stdout.strip()
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
for name,data in [('node-before.json',old),('previous-release.txt',str(prior).encode())]:
 fd=os.open(control/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
recovery=base/'scripts/capture-release-recovery.py';regular(recovery)
def switch(target):
 current=Path('/opt/jarvis/current');next=current.with_name('current.capture-next');need(not next.exists() and not next.is_symlink(),'CURRENT_NEXT_EXISTS');next.symlink_to(target);os.replace(next,current)
def services(action):
 if action=='stop':subprocess.run(['systemctl','stop','jarvis-observer.service'],check=True,timeout=30)
 if p['node']=='112':subprocess.run(['systemctl',action,'jarvis-platform.service'],check=True,timeout=40)
 if action=='start':subprocess.run(['systemctl','start','jarvis-observer.service'],check=True,timeout=30)
snapshot=None
try:
 services('stop')
 snapshot=json.loads(subprocess.check_output(['python3',str(recovery),'snapshot','--source','/var/lib/jarvis/data','--snapshot',str(control/'data-snapshot'),'--release',release,'--scope',config['role']],timeout=180))
 mh=snapshot['manifestSha256']
 restored=json.loads(subprocess.check_output(['python3',str(recovery),'restore','--snapshot',str(control/'data-snapshot'),'--target',str(control/'restored-check'),'--expect-manifest-sha256',mh,'--release',release],timeout=180))
 updated={**config,'release':release};temp=config_path.with_name('node.capture-next.json');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,stat.S_IMODE(s.st_mode))
 with os.fdopen(fd,'w') as stream:json.dump(updated,stream);stream.flush();os.fsync(stream.fileno())
 os.chown(temp,s.st_uid,s.st_gid);os.replace(temp,config_path);switch(base);services('start')
 verified=None
 for attempt in range(20):
  try:
   value=state();need(value['observerBuild']==release and (p['node']=='101' and value['platformService']=='inactive' or p['node']=='112' and value.get('healthBuild')==release and value.get('healthStatus')=='ok'),'NEW_RELEASE_NOT_HEALTHY');verified=value;break
  except Exception:
   if attempt==19:raise
   time.sleep(1)
 receipt={'node':p['node'],'release':release,'previousRelease':prior.name,'active':True,'activationLockHeld':True,'dataSnapshot':snapshot,'isolatedRestore':restored,'health':verified,'productionDataRestored':False,'factoryResumed':False}
 with (control/'activation.json').open('x') as stream:json.dump(receipt,stream)
 os.chmod(control/'activation.json',0o600);print(json.dumps(receipt))
except Exception:
 # Never erase new user data automatically. Retain both the full snapshot and
 # isolated verified restore; restoring live data is a separate explicit action.
 try:
  services('stop');config_path.write_bytes(old);os.chmod(config_path,stat.S_IMODE(s.st_mode));switch(prior);services('start')
  rollback_health=None
  for attempt in range(20):
   try:
    value=state();need(value['release']==p['expectedCurrent'] and value['currentRelease']==p['expectedCurrent'] and value['observerBuild']==p['expectedCurrent'] and (p['node']=='101' and value['platformService']=='inactive' or p['node']=='112' and value.get('healthBuild')==p['expectedCurrent'] and value.get('healthStatus')=='ok'),'ROLLBACK_NOT_HEALTHY');rollback_health=value;break
   except Exception:
    if attempt==19:raise
    time.sleep(1)
  with (control/'activation-failed.json').open('x') as stream:json.dump({'failed':True,'codeAndConfigRolledBack':True,'rollbackHealth':rollback_health,'privateDataSnapshotRetained':snapshot is not None,'liveDataOverwritten':False},stream)
 except Exception:raise RuntimeError('ACTIVATION_FAILED_ROLLBACK_NEEDS_ATTENTION')
 raise RuntimeError('ACTIVATION_FAILED_CODE_CONFIG_ROLLED_BACK_DATA_PRESERVED')
'''}
code='p='+repr(payload)+'\n'+common+'\ntry:\n'+''.join(' '+line+'\n' for line in programs[args.phase].splitlines())+'except Exception as error:\n print(json.dumps({"ok":False,"phase":'+repr(args.phase)+',"node":p["node"],"code":str(error) if isinstance(error,RuntimeError) else type(error).__name__}));sys.exit(1)\n'
import ast
ast.parse(code)
command='sudo -n python3 -c '+shlex.quote(code)
result=subprocess.run(['ssh','-F',str(Path(args.ssh_config).resolve()),'-o','BatchMode=yes','-o','ConnectTimeout=8','jarvis-'+args.node,command],input=archive if archive is not None else b'',stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=920)
try:response=json.loads(result.stdout)
except Exception:response={'ok':False,'phase':args.phase,'node':args.node,'code':'SSH_OR_RESPONSE_FAILED','stderrBytes':len(result.stderr)}
print(json.dumps(response));sys.exit(result.returncode)
