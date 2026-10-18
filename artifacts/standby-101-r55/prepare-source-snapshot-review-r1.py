"""Explicit new-purpose cold-standby preparation; Root runs serial phases."""
import argparse,hashlib,json,os,shlex,subprocess,time,zipfile,base64
from pathlib import Path
ROOT=Path(r'D:/AI/workspaces/MyJevis');OUT=ROOT/'artifacts/standby-101-r55';REL='20261018-ai-development-ops-r55'
PKG=ROOT/'.jarvis-dev/releases/r55-cold'/f'{REL}.zip'
SSH=['ssh','-F',str(ROOT/'artifacts/server-access/lenovo/ssh-config'),'-o','BatchMode=yes','-o','ConnectTimeout=8']
parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['fetch','stage','install','smoke','overlay','voice','snapshot']);phase=parser.parse_args().phase
receipt=OUT/(phase+'.json');intent=OUT/(phase+'-intent.json');assert not receipt.exists() and not intent.exists(),'PHASE_ALREADY_ATTEMPTED'
def h(b):return hashlib.sha256(b).hexdigest()
def runremote(node,code,stdin=b'',timeout=900):return subprocess.run(SSH+['jarvis-'+node,'sudo -n python3 -c '+shlex.quote(code)],input=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
intent.write_text(json.dumps({'phase':phase,'at':time.time(),'release':REL,'factoryTouched':False})+'\n')
started=time.monotonic()
if phase=='fetch':
 location=json.loads((OUT/'package-location.json').read_bytes())['found'];assert len(location)==1
 p=location[0];assert p['sha256']=='4927a9d264a8bb58023d4d2f55df77f065b32a2444175e8c4d44c5d106414d32' and p['bytes']==20642575
 PKG.parent.mkdir(parents=True,exist_ok=True)
 with PKG.open('xb') as f:r=subprocess.run(SSH+['jarvis-112','sudo -n cat '+shlex.quote(p['path'])],stdout=f,stderr=subprocess.PIPE,timeout=180)
 assert r.returncode==0 and PKG.stat().st_size==p['bytes'] and h(PKG.read_bytes())==p['sha256']
 value={'downloaded':True,**p,'localPackage':str(PKG),'serviceOperations':0}
elif phase in ['stage','install']:
 args=[str(ROOT/'scripts/capture-managed-release.py'),phase,'--node','101','--release',REL,'--ssh-config',str(ROOT/'artifacts/server-access/lenovo/ssh-config')]
 if phase=='stage':args+=['--package',str(PKG)]
 r=subprocess.run([os.sys.executable,*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=950)
 value=json.loads(r.stdout);assert r.returncode==0,(r.returncode,value)
elif phase=='smoke':
 script=(ROOT/'scripts/qa-capture-linux-install.ts').read_bytes();payload={'release':REL,'script':base64.b64encode(script).decode()}
 code='p='+repr(payload)+'\n'+r'''
import os,json,base64,hashlib,subprocess
from pathlib import Path
folder=Path('/var/lib/jarvis-control/standby-r55-program');folder.mkdir(mode=0o700,exist_ok=False)
script=folder/'qa-install.ts';script.write_bytes(base64.b64decode(p['script']));os.chmod(script,0o600)
report=folder/'runtime-smoke.json';base=Path('/opt/jarvis/releases')/p['release']
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','LANG','LC_ALL','TMPDIR']};env.update(JARVIS_DATA_DIR=str(folder/'unused-data'),JARVIS_NODE_CONFIG=str(folder/'nonexistent-config'))
r=subprocess.run(['/opt/jarvis/node/bin/node','--experimental-strip-types',str(script),'--compiled','--release-root='+str(base),'--expected-build='+p['release'],'--report='+str(report)],cwd=base,env=env,capture_output=True,timeout=150)
v=json.loads(report.read_bytes());assert r.returncode==0 and v['status']=='passed' and v['build']==p['release'] and v['modelCalls']==0 and v['cleanupVerified'] and not v['businessDataRead'],v.get('failure')
print(json.dumps(v))
'''
 r=runremote('101',code,timeout=200);value=json.loads(r.stdout);assert r.returncode==0,value
elif phase=='overlay':
 old=ROOT/'.jarvis-dev/releases/r54/20261018-simple-workbench-r54.zip'
 assert h(old.read_bytes())=='f9eb4c09c06e6a1c2dc09889cdfd10b6ba062907ea7660c2ad4f4f0111eb0b97'
 pre=json.loads((OUT/'preflight-101.json').read_bytes());rows=[]
 with zipfile.ZipFile(PKG) as new,zipfile.ZipFile(old) as prior:
  manifest=json.loads(new.read('release-manifest.json'));nm={r['path']:r for r in manifest['files']};union=dict(nm)
  for n in prior.namelist():
   if n.startswith('apps/web/dist/assets/') and n.endswith(('.js','.css')):
    b=prior.read(n);row={'path':n,'size':len(b),'sha256':h(b)}
    if n in nm:assert nm[n]['sha256']==row['sha256']
    else:rows.append({**row,'base64':base64.b64encode(b).decode()});union[n]=row
  assert all(r['path'] in union and all(union[r['path']][k]==r[k] for k in ['size','sha256']) for r in pre['webAssets']),'OLD_101_ASSET_MISSING'
  assert len(rows)==119
 payload={'release':REL,'rows':rows,'priorAssets':pre['webAssets'],'manifestSha256':'46c8412dcf8f5e255e8feba84f720e64e8278f6ef027221fea17636a0b8a23c8'}
 # Large approved public bytes travel on stdin; the command itself contains no payload.
 code=r'''
import sys,json,hashlib,base64,os,stat
from pathlib import Path
p=json.load(sys.stdin);base=Path('/opt/jarvis/releases')/p['release'];mf=base/'release-manifest.json'
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
assert sha(mf)==p['manifestSha256']
for row in p['rows']:
 f=base/row['path'];b=base64.b64decode(row['base64']);assert len(b)==row['size'] and hashlib.sha256(b).hexdigest()==row['sha256'] and not f.exists()
 for parent in [f.parent,*f.parents]:
  s=parent.lstat();assert stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022
for row in p['rows']:
 f=base/row['path'];fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
 with os.fdopen(fd,'wb') as o:o.write(base64.b64decode(row['base64']));o.flush();os.fsync(o.fileno())
 assert sha(f)==row['sha256']
for row in p['priorAssets']:
 f=base/row['path'];assert f.stat().st_size==row['size'] and sha(f)==row['sha256']
m=json.loads(mf.read_bytes())
for row in m['files']:
 f=base/row['path'];assert f.stat().st_size==row['size'] and sha(f)==row['sha256']
print(json.dumps({'added':len(p['rows']),'bytesAdded':sum(r['size'] for r in p['rows']),'prior101AssetsPreserved':len(p['priorAssets']),'basePayloadVerified':len(m['files']),'manifestUnchanged':sha(mf)==p['manifestSha256'],'businessServiceChanged':False}))
'''
 r=runremote('101',code,json.dumps(payload).encode(),180);value=json.loads(r.stdout);assert r.returncode==0,value
elif phase=='voice':
 code=r'''
import json,os,stat,hashlib,subprocess
from pathlib import Path
control=Path('/var/lib/jarvis-control/capture-standby-voice');raw=(control/'installed-manifest.json').read_bytes();m=json.loads(raw);installation=json.loads((control/'installation.json').read_bytes());assert hashlib.sha256(raw).hexdigest()==installation['manifestSha256']
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
count=0;total=0
for r in m['entries']:
 f=Path('/'+r['path']);s=f.lstat();assert not stat.S_ISLNK(s.st_mode)
 if r['type']=='file':
  assert stat.S_ISREG(s.st_mode) and s.st_size==r['size']
  if f!=Path('/var/lib/jarvis/voice-runtime/service-token'):assert sha(f)==r['sha256']
  count+=1;total+=s.st_size
 else:assert stat.S_ISDIR(s.st_mode)
pins={'sherpa-onnx':'1.13.8','numpy':'2.2.6','av':'19.0.0','pypinyin':'0.55.0','sentencepiece':'0.2.1','faster-whisper':'1.2.1','ctranslate2':'4.6.0'}
code="import sys,json,importlib.metadata as m;print(json.dumps({'version':'.'.join(map(str,sys.version_info[:3])),'packages':{k:m.version(k) for k in "+repr(list(pins))+"}}))"
v=json.loads(subprocess.check_output(['/var/lib/jarvis/voice-staging-20261010-multilingual/venv/bin/python','-I','-B','-c',code],timeout=30));assert v['version']=='3.12.15' and v['packages']==pins
check=subprocess.run(['/var/lib/jarvis/voice-staging-20261010-multilingual/venv/bin/python','-I','-B','-m','pip','check'],capture_output=True,timeout=60);assert check.returncode==0
assert subprocess.run(['systemctl','is-active','jarvis-voice.service'],capture_output=True,text=True).stdout.strip()=='inactive'
print(json.dumps({'status':'passed','node':'101','checkedForRelease':'20261018-ai-development-ops-r55','installedManifestSha256':hashlib.sha256(raw).hexdigest(),'actualFilesChecked':count,'actualBytesChecked':total,'pythonVersion':v['version'],'packages':v['packages'],'pipCheckPassed':True,'currentLoadPerformed':False,'historicalLoadRelease':installation['release'],'historicalResidentLoadVerified':installation.get('residentLoadHealthVerified') is True,'inferenceCalls':0,'residentInactive':True,'scope':'Current installed bytes, Python package versions and pip consistency; historical resident load remains R35 evidence, no new R55 load or audio-quality test'}))
'''
 r=runremote('101',code,timeout=180);value=json.loads(r.stdout);assert r.returncode==0,value
elif phase=='snapshot':
 recovery_h=h((ROOT/'scripts/capture-release-recovery.py').read_bytes());payload={'release':REL,'recoverySha256':recovery_h}
 code='p='+repr(payload)+'\n'+r'''
import os,json,stat,hashlib,subprocess,fcntl,time,sqlite3,ssl,urllib.request,datetime
from pathlib import Path
def need(value,code):
 if not value:raise RuntimeError(code)
def sha(b):return hashlib.sha256(b).hexdigest()
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def error(phase,e):
 allowed={'LOCK_INVALID','CURRENT_BINDING','RECOVERY_PIN','CURRENT_CHANGED','ACTIVE_MODEL_WORK','ACTIVE_VOICE_WORK','PRIMARY_NOT_ACTIVE','SNAPSHOT_INVALID','SNAPSHOT_FAILED','SNAPSHOT_TIMEOUT','PLATFORM_STOP_FAILED','PLATFORM_STOP_TIMEOUT','PLATFORM_START_FAILED','PLATFORM_START_TIMEOUT','RECOVERY_HEALTH_FAILED'}
 code=e.args[0] if isinstance(e,RuntimeError) and e.args and e.args[0] in allowed else type(e).__name__
 return {'phase':phase,'code':code}
control=None;lock=None;old=None;base=None;script=None;config=None;snapshot=None;health=None
first_error=None;recovery_error=None;children=[];evidence_write_failed=False
stop_requested=False;start_returned=None;stop_at=None;stop_clock=None;phase_name='lock';health_qualified=False
def private(name,data):
 fd=os.open(control/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
def capture(name,args,timeout):
 global evidence_write_failed
 try:
  result=subprocess.run(args,capture_output=True,timeout=timeout)
  stdout,stderr,code,timed=result.stdout,result.stderr,result.returncode,False
 except subprocess.TimeoutExpired as e:
  stdout,stderr,code,timed=e.stdout or b'',e.stderr or b'',None,True
 row={'phase':name,'returnCode':code,'timedOut':timed,'stdoutBytes':len(stdout),'stdoutSHA256':sha(stdout),'stderrBytes':len(stderr),'stderrSHA256':sha(stderr)}
 children.append(row)
 try:private(name+'.stdout',stdout);private(name+'.stderr',stderr)
 except Exception:evidence_write_failed=True
 need(not timed,name.upper().replace('-','_')+'_TIMEOUT')
 need(code==0,name.upper().replace('-','_')+'_FAILED')
 return stdout
try:
 # Read current source/configuration only while holding the shared publish lock.
 lock=os.open('/var/lib/jarvis-control/capture-activate.lock',os.O_RDWR|os.O_NOFOLLOW)
 s=os.fstat(lock);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'LOCK_INVALID')
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 phase_name='binding';cp=Path('/etc/jarvis/node.json');old=cp.read_bytes();config=json.loads(old)
 base=Path('/opt/jarvis/current').resolve()
 need(config['nodeId']=='112' and config['role']=='primary' and config['release']==p['release'] and base.name==p['release'],'CURRENT_BINDING')
 script=base/'scripts/capture-release-recovery.py';need(sha(script.read_bytes())==p['recoverySha256'],'RECOVERY_PIN')
 phase_name='quiescence';db=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=5)
 try:
  need(db.execute("SELECT COUNT(*) FROM runtime_ai_runs WHERE state='active'").fetchone()[0]==0,'ACTIVE_MODEL_WORK')
  need(db.execute("SELECT COUNT(*) FROM runtime_voice_jobs WHERE status IN ('queued','running')").fetchone()[0]==0,'ACTIVE_VOICE_WORK')
 finally:db.close()
 control=Path('/var/lib/jarvis-control/standby-r55-sync-20261019-112');control.mkdir(mode=0o700,exist_ok=False)
 phase_name='pre-stop'
 need(subprocess.check_output(['systemctl','is-active','jarvis-platform.service'],text=True,timeout=8).strip()=='active','PRIMARY_NOT_ACTIVE')
 need(cp.read_bytes()==old and Path('/opt/jarvis/current').resolve()==base and sha(script.read_bytes())==p['recoverySha256'],'CURRENT_CHANGED')
 stop_at=stamp();stop_clock=time.monotonic();stop_requested=True
 try:
  phase_name='platform-stop';capture('platform-stop',['systemctl','stop','jarvis-platform.service'],40)
  need(subprocess.run(['systemctl','is-active','jarvis-platform.service'],capture_output=True,text=True,timeout=8).stdout.strip()=='inactive','PRIMARY_NOT_ACTIVE')
  phase_name='snapshot';raw=capture('snapshot',['python3',str(script),'snapshot','--source','/var/lib/jarvis/data','--snapshot',str(control/'data-snapshot'),'--release',p['release'],'--scope','primary'],240)
  snapshot=json.loads(raw);need(snapshot.get('status')=='passed' and snapshot.get('completeTreeVerified') is True and snapshot.get('sqliteIntegrity')=='ok' and snapshot.get('operation')=='snapshot-created','SNAPSHOT_INVALID')
 except Exception as e:first_error=error(phase_name,e)
 finally:
  # A failed/timeout stop may already have stopped the unit; always request start once.
  try:capture('platform-start',['systemctl','start','jarvis-platform.service'],40);start_returned=stamp()
  except Exception as e:recovery_error=error('platform-start',e)
 # Snapshot failure must not bypass this independent restoration check.
 phase_name='recovery-health'
 for i in range(30):
  try:
   with urllib.request.urlopen('https://127.0.0.1:3140/api/health',context=ssl.create_default_context(cafile='/etc/jarvis/tls/ca.crt'),timeout=5) as response:health=json.load(response)
   active=subprocess.run(['systemctl','is-active','jarvis-platform.service'],capture_output=True,text=True,timeout=3).stdout.strip()
   if active=='active' and health.get('status')=='ok' and health.get('build')==p['release'] and cp.read_bytes()==old and Path('/opt/jarvis/current').resolve()==base:health_qualified=True;break
  except Exception:pass
  if i!=29:time.sleep(1)
 else:
  if recovery_error is None:recovery_error={'phase':'recovery-health','code':'RECOVERY_HEALTH_FAILED'}
except Exception as e:
 if first_error is None:first_error=error(phase_name,e)
restored=stop_requested and health_qualified
passed=first_error is None and recovery_error is None and snapshot is not None and restored and not evidence_write_failed
v={'status':'passed' if passed else 'failed','release':p['release'],'snapshot':snapshot,'control':str(control) if control else None,'stopRequestedAt':stop_at,'startReturnedAt':start_returned,'stopThroughHealthSeconds':time.monotonic()-stop_clock if stop_clock is not None else None,'primaryHealth':{k:health.get(k) for k in ['status','build','nodeId','role']} if isinstance(health,dict) else None,'primaryRestored':restored,'firstError':first_error,'recoveryError':recovery_error,'evidenceWriteFailed':evidence_write_failed,'childResults':children,'sourceBinding':{'configSHA256':sha(old) if old is not None else None,'releaseDirectory':base.name if base else None,'recoverySHA256':p['recoverySha256']},'observerVoiceFrpcChangedByThisControl':False,'factoryTouched':False}
if control is not None:
 try:private('snapshot-receipt.json',json.dumps(v).encode())
 except Exception:v['evidenceWriteFailed']=True;v['status']='failed';passed=False
if lock is not None:os.close(lock)
print(json.dumps(v));raise SystemExit(0 if passed else 1)
'''
 # 650s covers stop/snapshot/start plus all bounded recovery probes and evidence.
 r=None
 try:
  r=runremote('112',code,timeout=650)
  try:value=json.loads(r.stdout)
  except Exception:value={'status':'failed','firstError':{'phase':'transport','code':'NO_SAFE_RESULT'},'stdoutBytes':len(r.stdout),'stdoutSHA256':h(r.stdout),'stderrBytes':len(r.stderr),'stderrSHA256':h(r.stderr),'primaryRestored':None}
 except subprocess.TimeoutExpired as e:
  value={'status':'failed','firstError':{'phase':'transport','code':'TRANSPORT_TIMEOUT_UNCERTAIN'},'stdoutBytes':len(e.stdout or b''),'stdoutSHA256':h(e.stdout or b''),'stderrBytes':len(e.stderr or b''),'stderrSHA256':h(e.stderr or b''),'primaryRestored':None}
 if r is None or r.returncode!=0 or value.get('status')!='passed' or value.get('primaryRestored') is not True:
  failed={'at':time.time(),'phase':phase,'wallSeconds':time.monotonic()-started,'returnCode':r.returncode if r is not None else None,'result':value}
  with (OUT/'snapshot-failure.json').open('x',encoding='utf8') as f:json.dump(failed,f,indent=2);f.write('\n')
  print(json.dumps(failed));raise SystemExit(1)
 assert value.get('status')=='passed' and value.get('primaryRestored') is True
receipt.write_text(json.dumps({'at':time.time(),'phase':phase,'wallSeconds':time.monotonic()-started,'result':value},indent=2)+'\n',encoding='utf8')
print(json.dumps({'phase':phase,'wallSeconds':time.monotonic()-started,'result':value}))
