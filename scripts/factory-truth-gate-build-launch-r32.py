"""Exact R32 launcher. Root runs trusted byte IO and Docker control only."""
import os,json,stat,hashlib,base64,subprocess,time,re,uuid,signal,datetime
from pathlib import Path
from types import ModuleType

ROOT='/var/lib/jarvis-development/101/truth-gate-r32-build'
SOURCE='/var/lib/jarvis-development/101/targets-r32-candidate/source'
FP='f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2'
HELPER='/opt/jarvis-development/software-factory/project-autonomy-evidence.py'
HELPER_SHA='57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2'
IMAGE='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
STAGES=['mount-proof','offline-install','build','typecheck','truth-unit','targeted-pure']
ENV={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'}
H=re.compile('[a-f0-9]{64}')

def need(v,c):
 if not v:raise RuntimeError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def identity(s):return {'device':s.st_dev,'inode':s.st_ino}
def stamp(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)

def qualify(p):
 need(isinstance(p,dict) and set(p)=={'scope','action','attempt','workerBase64','qaBase64','freshProtectionSHA256','freshProtectionObservedAt'},'R32_START_SCOPE_INVALID')
 s=p['scope'];need(isinstance(s,dict) and set(s)=={'source','fingerprint','sourceFiles','sourceBytes','metadataSHA','sourceIdentity','sourceOrigin','sourceOriginSHA256','root','tool','toolSHA','qaManifestSHA256','sourcePreparationSHA256','reviewSHA256','starterSHA256','rendererSHA256'},'R32_START_SCOPE_INVALID')
 need(s['source']==SOURCE and s['root']==ROOT and s['fingerprint']==FP and s['sourceFiles']==625 and s['sourceBytes']==18413560,'R32_START_SOURCE_SCOPE_INVALID')
 need(all(isinstance(s[k],str) and H.fullmatch(s[k]) for k in ['metadataSHA','sourceOriginSHA256','toolSHA','qaManifestSHA256','sourcePreparationSHA256','reviewSHA256','starterSHA256','rendererSHA256']),'R32_START_FROZEN_HASH_INVALID')
 need(isinstance(s['sourceIdentity'],dict) and set(s['sourceIdentity'])=={'device','inode'} and all(type(v)==int and v>0 for v in s['sourceIdentity'].values()),'R32_START_SOURCE_IDENTITY_INVALID')
 need(isinstance(s['sourceOrigin'],str) and re.fullmatch('/var/lib/jarvis-development/101/targets-r32-preparation/[a-f0-9]{32}/origin.json',s['sourceOrigin']) and s['tool']=='/opt/jarvis-development/software-factory/factory-truth-gate-build-r32-'+s['toolSHA'][:16]+'.py','R32_START_PATH_INVALID')
 need(p['action'] in ['start','check'] and isinstance(p['attempt'],str) and re.fullmatch('[a-f0-9]{32}',p['attempt']),'R32_START_ARGUMENTS_INVALID')
 if p['action']=='start':
  need(isinstance(p['workerBase64'],str) and isinstance(p['qaBase64'],dict) and set(p['qaBase64'])=={'manifest.json','baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'},'R32_START_BYTES_INVALID')
  need(isinstance(p['freshProtectionSHA256'],str) and H.fullmatch(p['freshProtectionSHA256']) and isinstance(p['freshProtectionObservedAt'],str),'R32_START_FRESH_PROTECTION_INVALID')
 else:need(p['workerBase64'] is None and p['qaBase64'] is None and p['freshProtectionSHA256'] is None and p['freshProtectionObservedAt'] is None,'R32_START_READONLY_INPUT_INVALID')
 return s

def trusted(path):
 for x in [path,*path.parents]:
  s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==s.st_gid==0 and not s.st_mode&0o022,'R32_START_ROOT_CHAIN_INVALID')
def read(path,limit=2000000):
 trusted(path);f=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(f);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'R32_START_FILE_INVALID');raw=b''
  while len(raw)<=limit:
   b=os.read(f,min(65536,limit+1-len(raw)))
   if not b:break
   raw+=b
  need(len(raw)==s.st_size and stamp(s)==stamp(os.fstat(f))==stamp(path.lstat()),'R32_START_FILE_CHANGED');return raw
 finally:os.close(f)
def fsyncdir(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(path,raw,mode):
 trusted(path.parent);need(not os.path.lexists(path),'R32_START_FILE_CONFLICT');fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  v=memoryview(raw)
  while v:
   n=os.write(fd,v);need(n>0,'R32_START_SHORT_WRITE');v=v[n:]
  os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
 fsyncdir(path.parent);need(read(path)==raw,'R32_START_FILE_READBACK_CHANGED')
def store(path,v):
 raw=(json.dumps(v,separators=(',',':'))+'\n').encode();tmp=path.parent/(path.name+'.'+uuid.uuid4().hex+'.tmp');put(tmp,raw,0o600);os.replace(tmp,path);fsyncdir(path.parent)
def folder(path,mode):
 trusted(path.parent)
 if not os.path.lexists(path):path.mkdir(mode=mode);fsyncdir(path.parent)
 trusted(path);s=path.lstat();need(stat.S_ISDIR(s.st_mode) and stat.S_IMODE(s.st_mode)==mode,'R32_START_DIRECTORY_INVALID')
def cli(args,timeout=15):return subprocess.run(args,capture_output=True,timeout=timeout,env=ENV)
def docker_absence(names,attempt):
 for name in names:
  r=cli(['/usr/bin/docker','container','inspect',name])
  try:empty=json.loads(r.stdout)==[]
  except (ValueError,UnicodeError):empty=False
  need(r.returncode==1 and empty and r.stderr.decode('utf-8','replace').strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'R32_START_EXACT_RESOURCE_NOT_EMPTY')
 for filters in [['label=jarvis.truthgate.r32.attempt='+attempt],['label=jarvis.truthgate.r32.attempt='+attempt,'label=jarvis.truthgate.r32.kind=build']]:
  for command in [['ps','-aq'],['network','ls','-q'],['volume','ls','-q']]:
   args=['/usr/bin/docker',*command]
   for v in filters:args+=['--filter',v]
   r=cli(args);need(r.returncode==0 and not r.stdout.strip(),'R32_START_LABEL_SCOPE_NOT_EMPTY')
def source_state(helper,path):
    before=helper.fingerprint(path);root=helper.open_directory(path);meta=[]
    try:
        info=os.fstat(root);identity={'device':info.st_dev,'inode':info.st_ino}
        for e in before['manifest']:
            fd=helper.open_relative(root,e['path'])
            try:
                s=os.fstat(fd);meta.append([e['path'],s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns])
            finally:os.close(fd)
    finally:os.close(root)
    need(before==helper.fingerprint(path),'R32_BUILD_SOURCE_READ_CHANGED')
    return {'sha256':before['sha256'],'files':before['files'],'bytes':before['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'identity':identity}

def main(p):
 s=qualify(p);need(os.geteuid()==os.getegid()==0,'R32_START_ROOT_REQUIRED')
 signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(RuntimeError('R32_START_HOST_TIMEOUT')));signal.alarm(170)
 root=Path(ROOT);tool=Path(s['tool']);origin=Path(s['sourceOrigin']);launch=root/'launches'/(p['attempt']+'.json');own=root/'ownership'/(p['attempt']+'.json');statepath=root/p['attempt']/'state.json';qa=root/'qa-tools'
 expected={'sha256':FP,'files':625,'bytes':18413560,'metadataSHA':s['metadataSHA'],'identity':s['sourceIdentity']}
 body=read(Path(HELPER));need(sha(body)==HELPER_SHA,'R32_START_HELPER_CHANGED');h=ModuleType('r32_trusted_source');exec(compile(body,HELPER,'exec'),h.__dict__)
 need(sha(read(origin))==s['sourceOriginSHA256'],'R32_START_ORIGIN_CHANGED');before=source_state(h,SOURCE);need(before==expected,'R32_START_SOURCE_BINDING_CHANGED')
 if p['action']=='start':
  try:at=datetime.datetime.fromisoformat(p['freshProtectionObservedAt'].replace('Z','+00:00')).timestamp()
  except (ValueError,TypeError):raise RuntimeError('R32_START_FRESH_PROTECTION_INVALID')
  need(-30<=time.time()-at<300,'R32_START_FRESH_PROTECTION_STALE')
  worker=base64.b64decode(p['workerBase64'],validate=True);need(len(worker)<=100000 and sha(worker)==s['toolSHA'],'R32_START_WORKER_BYTES_CHANGED')
  files={k:base64.b64decode(v,validate=True) for k,v in p['qaBase64'].items()};need(all(len(v)<=1000000 for v in files.values()) and sha(files['manifest.json'])==s['qaManifestSHA256'],'R32_START_QA_MANIFEST_CHANGED')
  manifest=json.loads(files['manifest.json']);need(set(manifest)=={'schemaVersion','kind','files'} and manifest['schemaVersion']==1 and manifest['kind']=='r32-bounded-qa-tools' and set(manifest['files'])==set(files)-{'manifest.json'},'R32_START_QA_SCOPE_CHANGED')
  for name,entry in manifest['files'].items():need(set(entry)=={'sha256','bytes'} and type(entry['bytes'])==int and entry['bytes']>0 and entry['bytes']==len(files[name]) and sha(files[name])==entry['sha256'],'R32_START_QA_BYTES_CHANGED')
  names=['jarvis-tg-r32-'+p['attempt']+'-'+x for x in STAGES];labels={'jarvis.truthgate.r32.attempt':p['attempt'],'jarvis.truthgate.r32.kind':'build'}
  # Nothing mutable is created until current source and all exact Docker scopes pass.
  docker_absence(names,p['attempt']);need(source_state(h,SOURCE)==before and sha(read(origin))==s['sourceOriginSHA256'],'R32_START_SOURCE_CHANGED_PREINSTALL')
  trusted(tool.parent)
  if os.path.lexists(tool):need(read(tool)==worker and stat.S_IMODE(tool.lstat().st_mode)==0o755,'R32_START_TOOL_CONFLICT')
  else:put(tool,worker,0o755)
  folder(root,0o700);folder(root/'launches',0o700);folder(root/'ownership',0o700)
  need(not os.path.lexists(launch) and not os.path.lexists(own) and not os.path.lexists(root/p['attempt']),'R32_START_EXCLUSIVE_ATTEMPT_REQUIRED')
  if os.path.lexists(qa):
   trusted(qa);need(stat.S_IMODE(qa.lstat().st_mode)==0o555 and set(os.listdir(qa))==set(files),'R32_START_QA_EXISTING_SCOPE_CHANGED')
   for name,raw in files.items():need(read(qa/name)==raw and stat.S_IMODE((qa/name).lstat().st_mode)==0o444,'R32_START_QA_CONFLICT')
  else:
   folder(qa,0o700)
   for name,raw in files.items():put(qa/name,raw,0o444)
   os.chmod(qa,0o555);fsyncdir(qa);fsyncdir(root)
  ownership={'schemaVersion':1,'attempt':p['attempt'],'toolSHA256':s['toolSHA'],'sourceFingerprint':FP,'containers':names,'labels':labels,'imageID':IMAGE,'emptyResourceScopeVerified':True,'freshProtectionSHA256':p['freshProtectionSHA256'],'freshProtectionObservedAt':p['freshProtectionObservedAt'],'sourcePreparationSHA256':s['sourcePreparationSHA256'],'qaManifestSHA256':s['qaManifestSHA256']};store(own,ownership)
  value={'schemaVersion':1,'kind':'r32-build-once-launch','attempt':p['attempt'],'toolSHA256':s['toolSHA'],'sourceFingerprint':FP,'source':before,'scope':s,'phase':'fork-intent','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};store(launch,value)
  put(root/'launches'/(p['attempt']+'.out'),b'',0o600);put(root/'launches'/(p['attempt']+'.err'),b'',0o600)
  need(-30<=time.time()-at<300 and source_state(h,SOURCE)==before and sha(read(origin))==s['sourceOriginSHA256'],'R32_START_SOURCE_OR_FRESHNESS_CHANGED_PREDISPATCH')
  unit='jarvis-tg-r32-'+p['attempt']+'-owner.service'
  args=['/usr/bin/systemd-run','--unit='+unit,'--collect','--no-block','--property=User=root','--property=Type=simple','--property=KillMode=control-group','--property=RuntimeMaxSec=1800','--property=TimeoutStopSec=300','--property=Restart=no','--property=WorkingDirectory=/','--property=Environment=JARVIS_R32_BUILD_OWNER_UNIT='+unit,'--property=StandardOutput=append:'+str(root/'launches'/(p['attempt']+'.out')),'--property=StandardError=append:'+str(root/'launches'/(p['attempt']+'.err')),'--property=ExecStopPost=/usr/bin/python3 '+str(tool)+' --reconcile-cleanup '+p['attempt'],'/usr/bin/python3',str(tool),'--run',p['attempt']]
  result=cli(args,20);need(result.returncode==0,'R32_START_OWNER_DISPATCH_UNCERTAIN')
  r=cli(['/usr/bin/systemctl','show',unit,'--property=MainPID'],10);need(r.returncode==0,'R32_START_OWNER_IDENTITY_READ_FAILED');v=dict(x.split('=',1) for x in r.stdout.decode().splitlines() if '=' in x);pid=int(v.get('MainPID','0'))
  value.update(ownerUnit=unit,runtimeMaxSec=1800,stopTimeoutSec=300,fixedExecStopPostConfigured=True,phase='dispatched')
  try:
   need(pid>1,'R32_START_OWNER_NOT_RUNNING');parts=Path('/proc',str(pid),'stat').read_text();parts=parts[parts.rfind(')')+2:].split();value['processIdentity']={'pid':pid,'startTicks':parts[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
  except (FileNotFoundError,RuntimeError):value.update(processIdentity={'pid':pid if pid>1 else None,'startTicks':None,'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()},identityReadComplete=False)
  store(launch,value)
 value=json.loads(read(launch));need(value['attempt']==p['attempt'] and value['scope']==s and value['toolSHA256']==s['toolSHA'] and sha(read(tool))==s['toolSHA'],'R32_START_LAUNCH_BINDING_CHANGED')
 trusted(qa);need(stat.S_ISDIR(qa.lstat().st_mode) and stat.S_IMODE(qa.lstat().st_mode)==0o555,'R32_START_QA_EXISTING_SCOPE_CHANGED')
 qa_raw=read(qa/'manifest.json');need(sha(qa_raw)==s['qaManifestSHA256'],'R32_START_QA_MANIFEST_CHANGED');qa_manifest=json.loads(qa_raw)
 need(set(qa_manifest)=={'schemaVersion','kind','files'} and qa_manifest['schemaVersion']==1 and qa_manifest['kind']=='r32-bounded-qa-tools' and set(qa_manifest['files'])=={'baseline-r29-t8.ts','baseline-r30-truth.ts','targeted-pure.mjs'} and set(os.listdir(qa))==set(qa_manifest['files'])|{'manifest.json'},'R32_START_QA_SCOPE_CHANGED')
 for name,entry in qa_manifest['files'].items():
  b=read(qa/name);need(set(entry)=={'sha256','bytes'} and len(b)==entry['bytes'] and sha(b)==entry['sha256'] and stat.S_IMODE((qa/name).lstat().st_mode)==0o444,'R32_START_QA_BYTES_CHANGED')
 state=json.loads(read(statepath)) if os.path.lexists(statepath) else None
 if state is not None:need(state['attempt']==p['attempt'] and state['source']==expected,'R32_START_STATE_BINDING_CHANGED')
 need(source_state(h,SOURCE)==before and sha(read(origin))==s['sourceOriginSHA256'],'R32_START_FINAL_SOURCE_CHANGED')
 fields=['normalBindBootstrap','imageID','snapshotFingerprint','candidateUID','candidateNetwork','hostDockerSocketMounted','productionDatabaseUsed','modelsInvoked','status','owner','startedAt','finishedAt','source','sourceAfter','sourceUnchanged','sourceReadComplete','sourceReadErrorCode','cacheReuse','qaTools','checks','resources','cleanupClaimsComplete','cleanupUnresolvedNames','labelScopeActuallyEmpty','noRecordedResultStages','noRecordedResultExecutionState','errorCode','independentDBAPIValidation','productAccepted','cleanupIndependentlyVerified']
 return {'schemaVersion':1,'kind':'software-factory-r32-once-build-observation','attempt':p['attempt'],'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'launchPhase':value['phase'],'ownerUnit':value.get('ownerUnit'),'processIdentity':value.get('processIdentity'),'scope':s,'source':before,'sourceDoubleRead':True,'qaToolsReadbackVerified':True,'state':{k:state[k] for k in fields if k in state} if state else None,'installedToolSHA256':s['toolSHA'],'modelsInvoked':False,'productAccepted':False,'rawLogsExported':False,'privateEnvironmentExported':False,'readOnly':p['action']=='check','automaticRedispatch':False}

if __name__=='__main__':print(json.dumps(main(p)))
