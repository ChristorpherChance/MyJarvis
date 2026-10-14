/** Apply the frozen prerequisite observer and coordinator waiting protocol. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const dir='artifacts/software-factory/autonomy-r22',execute=process.argv.includes('--execute');
const manifest=JSON.parse(await readFile(dir+'/adapter-install-manifest-r5.json','utf8'));
const prior=JSON.parse(await readFile(dir+'/adapter-install-manifest-r4.json','utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(await readFile(dir+'/adapter-install-manifest-r4.json'))!==manifest.previousManifestSHA256)throw Error('CORRECTION_PREVIOUS_MANIFEST_CHANGED');
const files=[];
for(const file of manifest.files){const data=await readFile(file.path);if(sha(data)!==file.sha256)throw Error('CORRECTION_SOURCE_CHANGED');const old=prior.files.find(f=>f.path===file.path);if(!old&&!file.path.endsWith('project-autonomy-prerequisite-observer.py'))throw Error('CORRECTION_UNEXPECTED_FILE');files.push({...file,previousSHA256:old?.sha256??null,base64:data.toString('base64')});}
const changed=files.filter(f=>f.sha256!==f.previousSHA256);
if(changed.length!==2||changed.find(f=>f.path.endsWith('project-autonomy-fa01-coordinator.py'))?.previousSHA256!==manifest.casPreviousCoordinatorSHA256||!changed.some(f=>f.path.endsWith('project-autonomy-prerequisite-observer.py')))throw Error('CORRECTION_SCOPE_CHANGED');
const report=JSON.parse(remote(lanProfile,'jarvis-101',python({files,execute},String.raw`import os,stat,hashlib,tempfile,subprocess,shutil,datetime
from pathlib import Path
backup=Path('/var/lib/jarvis-control/autonomy-r22/validator-r5')
for item in p['files']:
 q=Path(item['installedPath'])
 for parent in q.parents:
  s=parent.lstat()
  if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('CORRECTION_PARENT_UNTRUSTED')
 if not q.exists():
  if item['previousSHA256'] is not None:raise RuntimeError('CORRECTION_OLD_FILE_MISSING')
  continue
 s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022:raise RuntimeError('CORRECTION_FILE_UNTRUSTED')
 if hashlib.sha256(q.read_bytes()).hexdigest() not in [item['previousSHA256'],item['sha256']]:raise RuntimeError('CORRECTION_CAS_CONFLICT')
 if hashlib.sha256(base64.b64decode(item['base64'])).hexdigest()!=item['sha256']:raise RuntimeError('CORRECTION_TRANSFER_MISMATCH')
if p['execute']:
 backup.mkdir(mode=0o700,exist_ok=True)
 for item in p['files']:
  if item['previousSHA256']==item['sha256']:continue
  q=Path(item['installedPath']);old=q.read_bytes() if q.exists() else None
  if q.exists() and not (backup/q.name).exists():shutil.copy2(q,backup/q.name);os.chmod(backup/q.name,0o600)
  fd,temp=tempfile.mkstemp(prefix='.r4-exit-',dir=q.parent)
  try:
   with os.fdopen(fd,'wb') as f:f.write(base64.b64decode(item['base64']));f.flush();os.fsync(f.fileno())
   os.chown(temp,0,0);os.chmod(temp,0o644)
   subprocess.run(['python3','-c','import ast,sys;ast.parse(open(sys.argv[1]).read())',temp],check=True,capture_output=True,timeout=10)
   os.replace(temp,q)
  finally:
   if os.path.exists(temp):os.unlink(temp)
rows=[{'path':i['installedPath'],'sha256':hashlib.sha256(Path(i['installedPath']).read_bytes()).hexdigest()} for i in p['files']]
if p['execute'] and any(r['sha256']!=i['sha256'] for r,i in zip(rows,p['files'])):raise RuntimeError('CORRECTION_READBACK_MISMATCH')
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'installed':p['execute'],'files':rows,'changedFiles':2,'sourceProjectModified':False,'modelCalls':0,'productTestsRun':False,'correction':'ROOT_PREREQUISITE_WAITING_PROTOCOL'}))
`),true,{timeoutMs:60000}));
await writeFile(dir+'/validator-r5-installation'+(execute?'':'-preflight')+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({installed:report.installed,changedFiles:2,files:report.files.length,correction:report.correction}));
