/** Install public fixed contracts and verify the existing nine stage policies. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const dir='artifacts/software-factory/autonomy-r22',execute=process.argv.includes('--execute');
const manifest=JSON.parse(await readFile(dir+'/phase-install-manifest.json','utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex'),files=[];
for(const item of manifest.files){const data=await readFile(item.path);if(sha(data)!==item.sha256)throw Error('PHASE_CONTRACT_SOURCE_CHANGED');files.push({...item,base64:data.toString('base64')});}
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({manifest,files,execute},String.raw`import os,stat,hashlib,tempfile,subprocess,datetime
from pathlib import Path
def trusted_dir(q):
 for parent in [q,*q.parents]:
  s=parent.lstat()
  if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('PHASE_CONTRACT_DIRECTORY_UNTRUSTED')
for item in p['files']:
 q=Path(item['installedPath']);trusted_dir(q.parent)
 if q.exists():
  s=q.lstat()
  if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022 or hashlib.sha256(q.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('PHASE_CONTRACT_CAS_CONFLICT')
 if hashlib.sha256(base64.b64decode(item['base64'])).hexdigest()!=item['sha256']:raise RuntimeError('PHASE_CONTRACT_TRANSFER_INVALID')
policies=[]
for phase,policy in p['manifest']['phasePolicies'].items():
 q=Path(policy['installedPolicyPath']);trusted_dir(q.parent);s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022:raise RuntimeError('PHASE_POLICY_UNTRUSTED')
 raw=q.read_bytes();value=json.loads(raw)
 if hashlib.sha256(raw).hexdigest()!=policy['expectedOldPolicySha256'] or value['goalSpecHash']!=p['manifest']['goalSpecHash'] or value['workPackage']!=phase or value['expectedChecks']!=policy['expectedChecks']:raise RuntimeError('PHASE_POLICY_CAS_CHANGED')
 policies.append({'workPackage':phase,'sha256':hashlib.sha256(raw).hexdigest(),'expectedChecks':value['expectedChecks']})
if p['execute']:
 for item in p['files']:
  q=Path(item['installedPath'])
  if q.exists():continue
  fd,temp=tempfile.mkstemp(prefix='.phase-r22-',dir=q.parent)
  try:
   with os.fdopen(fd,'wb') as f:f.write(base64.b64decode(item['base64']));f.flush();os.fsync(f.fileno())
   os.chown(temp,0,0);os.chmod(temp,0o644)
   if q.suffix=='.py':subprocess.run(['python3','-c','import ast,sys;ast.parse(open(sys.argv[1]).read())',temp],check=True,capture_output=True,timeout=10)
   else:json.loads(Path(temp).read_bytes())
   os.replace(temp,q)
  finally:
   if os.path.exists(temp):os.unlink(temp)
rows=[{'path':i['installedPath'],'sha256':hashlib.sha256(Path(i['installedPath']).read_bytes()).hexdigest() if Path(i['installedPath']).exists() else None} for i in p['files']]
if p['execute'] and any(r['sha256']!=i['sha256'] for r,i in zip(rows,p['files'])):raise RuntimeError('PHASE_CONTRACT_READBACK_MISMATCH')
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'installed':p['execute'],'goalSpecHash':p['manifest']['goalSpecHash'],'files':rows,'policies':policies,'phaseHelperReady':p['execute'],'allPhaseAdaptersReady':False,'observerPending':True,'sourceProjectModified':False,'modelCalls':0,'productAccepted':False}))
`),true,{timeoutMs:60000}));
await writeFile(dir+'/phase-installation'+(execute?'':'-preflight')+'.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({installed:result.installed,files:result.files.length,policies:result.policies.length,allPhaseAdaptersReady:false,modelCalls:0}));
