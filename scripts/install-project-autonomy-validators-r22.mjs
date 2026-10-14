/** Install immutable trusted validators; candidate source never supplies the oracle. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const dir='artifacts/software-factory/autonomy-r22';
const manifest=JSON.parse(await readFile(dir+'/adapter-install-manifest-r3.json','utf8'));
const previous=JSON.parse(await readFile(dir+'/validator-core-verification.json','utf8'));
const preparation=JSON.parse(await readFile(dir+'/preparation.json','utf8'));
const spec=JSON.parse(await readFile(dir+'/objectives.json','utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const goalSpecHash=sha(canonical(spec)),execute=process.argv.includes('--execute');
const files=[];
for(const file of manifest.files){const data=await readFile(file.path);if(sha(data)!==file.sha256)throw Error('AUTONOMY_MANIFEST_SOURCE_CHANGED');files.push({...file,base64:data.toString('base64'),previousSHA256:previous.files.find(p=>p.path===file.path)?.sha256??null});}
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({manifest,files,spec,goalSpecHash,previousGoalHash:preparation.goalSpecHash,execute},String.raw`import os,stat,hashlib,tempfile,subprocess,py_compile,datetime,shutil
from pathlib import Path
def safe(path,directory=False):
 s=path.lstat()
 if stat.S_ISLNK(s.st_mode) or (not stat.S_ISDIR(s.st_mode) if directory else not stat.S_ISREG(s.st_mode)):raise RuntimeError('VALIDATOR_INSTALL_PATH_UNSAFE')
 if not directory and s.st_nlink!=1:raise RuntimeError('VALIDATOR_INSTALL_HARDLINK')
 return s
def trusted(path):
 for q in [path,*path.parents]:
  s=safe(q,True)
  if s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('VALIDATOR_INSTALL_TRUST_INVALID')
backup=Path('/var/lib/jarvis-control/autonomy-r22/validator-r3');installed=[];policies=[]
base=Path('/opt/jarvis-development/software-factory');trusted(base)
for item in p['files']:
 q=Path(item['installedPath']);trusted(q.parent)
 if q.exists():
  s=safe(q);current=hashlib.sha256(q.read_bytes()).hexdigest()
  if s.st_uid!=0 or current not in [item['previousSHA256'],item['sha256']]:raise RuntimeError('VALIDATOR_INSTALL_CAS_CONFLICT')
 data=base64.b64decode(item['base64'])
 if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('VALIDATOR_INSTALL_TRANSFER_INVALID')
def replace(path,data,mode):
 fd,temp=tempfile.mkstemp(prefix='.r22-validator-',dir=path.parent)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(temp,0,0);os.chmod(temp,mode);os.replace(temp,path)
if p['execute']:
 backup.mkdir(mode=0o700,parents=True,exist_ok=True)
 for item in p['files']:
  q=Path(item['installedPath'])
  if q.exists() and not (backup/q.name).exists():shutil.copy2(q,backup/q.name);os.chmod(backup/q.name,0o600)
  replace(q,base64.b64decode(item['base64']),int(item['mode'],8))
 for item in p['manifest']['directories']:
  q=Path(item['path']);q.mkdir(mode=int(item['mode'],8),exist_ok=True);safe(q,True)
  os.chown(q,0,0);os.chmod(q,int(item['mode'],8))
 for item in p['files']:
  q=Path(item['installedPath'])
  if q.suffix=='.py' or q.name=='jarvis-project-autonomy-validation':py_compile.compile(str(q),cfile=str(backup/(q.name+'.pyc')),doraise=True)
  elif q.suffix=='.mjs':subprocess.run(['/opt/jarvis-development/node/bin/node','--check',str(q)],check=True,capture_output=True,timeout=10)
 goal=base/'objectives-r22.json';safe(goal)
 old=json.loads(goal.read_bytes())
 digest=lambda value:hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
 if digest(old) not in [p['previousGoalHash'],p['goalSpecHash']]:raise RuntimeError('VALIDATOR_GOAL_CAS_CONFLICT')
 if not (backup/'objectives-before.json').exists():shutil.copy2(goal,backup/'objectives-before.json')
 replace(goal,(json.dumps(p['spec'],ensure_ascii=False,indent=2)+'\n').encode(),0o644)
for pack in p['spec']['workPackages']:
 q=Path('/etc/jarvis-development/project-autonomy')/(pack['id']+'.json');safe(q);old=json.loads(q.read_bytes())
 if old['workspace']!=p['manifest']['policyPatch']['workspace'] or old['workPackage']!=pack['id'] or old['goalSpecHash'] not in [p['previousGoalHash'],p['goalSpecHash']]:raise RuntimeError('VALIDATOR_POLICY_CAS_CONFLICT')
 patch=p['manifest']['policyPatch'] if pack['id']=='FA-01' else p['manifest']['phasePolicyTemplates'][pack['id']]
 value={**old,**patch,'goalSpecHash':p['goalSpecHash']}
 if p['execute']:
  if not (backup/q.name).exists():shutil.copy2(q,backup/q.name)
  replace(q,(json.dumps(value,indent=2)+'\n').encode(),0o644)
 policies.append({'workPackage':pack['id'],'path':str(q),'sha256':hashlib.sha256(q.read_bytes()).hexdigest(),'expectedChecks':value['expectedChecks'],'adapterReady':pack['id']=='FA-01'})
for item in p['files']:
 q=Path(item['installedPath']);installed.append({'path':str(q),'sha256':hashlib.sha256(q.read_bytes()).hexdigest() if q.exists() else None})
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'installed':p['execute'],'workspace':p['manifest']['policyPatch']['workspace'],'goalSpecHash':p['goalSpecHash'],'files':installed,'policies':policies,'allPhaseAdaptersReady':False,'FA01Ready':p['execute'],'sourceProjectModified':False,'modelCalls':0,'productTestsRun':False}))
`),true,{timeoutMs:60000}));
await writeFile(dir+'/validator-installation'+(execute?'':'-preflight')+'.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({installed:result.installed,goalSpecHash,FA01Ready:result.FA01Ready,allPhaseAdaptersReady:result.allPhaseAdaptersReady,files:result.files.length,policies:result.policies.length}));
