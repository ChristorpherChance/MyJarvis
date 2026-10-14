/** Read only original snapshot and fixed environment metadata. Never run verification. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const snapshot=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`
import subprocess,json,hashlib,os,stat,sqlite3,re,datetime
from pathlib import Path
def sha(b):return hashlib.sha256(b).hexdigest()
def meta(path):
 q=Path(path);out={'path':path}
 try:
  s=q.lstat();out.update({'exists':True,'uid':s.st_uid,'permissions':oct(stat.S_IMODE(s.st_mode)),'bytes':s.st_size,'regular':stat.S_ISREG(s.st_mode),'symlink':q.is_symlink(),'trustedRootChain':all(x.lstat().st_uid==0 and not x.lstat().st_mode&0o022 and not x.is_symlink() for x in [q,*q.parents])})
  if stat.S_ISREG(s.st_mode) and not q.is_symlink() and s.st_size<8*1024*1024:out['sha256']=sha(q.read_bytes())
 except OSError:out['exists']=False
 return out
wrapper='/usr/local/libexec/jarvis-msf-validation';full='/usr/local/libexec/jarvis-msf-full-validation'
# --inspect-state branches before any mkdir/write; only reads public source twice after setuid.
current=meta(wrapper)
if not current.get('trustedRootChain') or current.get('sha256')!='249b7757b0887d594dcebd6dd92af76a83b9f70b31a03ce28baf1b1e5ff574fd':raise RuntimeError('FIXED_INSPECTION_TOOL_CHANGED')
result=subprocess.run([wrapper,'/home/superopen/All-Projects/msf','0000000000000000000000000000000000000024','--inspect-state'],capture_output=True,timeout=90)
try:value=json.loads(result.stdout)
except (ValueError,UnicodeDecodeError):value={'reason':'NO_VALID_READONLY_METADATA'}
safe={k:value.get(k) for k in ['ok','source','sourceFingerprint','verificationSha256','sourceStateChanged','files','bytes','privateEnvCopied','modelCalled','testsRun']}
fullmeta=meta(full);raw=Path(full).read_text() if fullmeta.get('trustedRootChain') else '';match=re.search(r"EXPECTED_SOURCE_SHA256\s*=\s*'([a-f0-9]{64})'",raw)
fullmeta.update({'expectedSourceFingerprint':match[1] if match else None,'currentSourceMatchesPinnedFingerprint':bool(match and match[1]==safe.get('sourceFingerprint')),'fingerprintMethod':'root-secure-copy-v1; distinct from git public manifest','testsOrBuildsExecuted':False})
helperPaths=['/opt/jarvis-development/software-factory/factory-risk-probe.mjs','/opt/jarvis-development/software-factory/factory-storage-probe.mjs','/opt/jarvis-development/software-factory/factory-sandbox-broker.py','/opt/jarvis-development/software-factory/factory-sandbox-broker-control.py','/opt/jarvis-development/software-factory/factory-sandbox-probe.mjs','/opt/jarvis-development/software-factory/project-autonomy-phase-contract.py','/opt/jarvis-development/software-factory/project-autonomy-prerequisite-observer.py']
helpers=[meta(path) for path in helperPaths]
policyPath='/etc/jarvis-development/project-autonomy/FA-01.json';policy=json.loads(Path(policyPath).read_bytes());policyMeta=meta(policyPath)
policyMeta['publicFields']={k:policy.get(k) for k in ['schemaVersion','workPackage','goalSpecHash','workspace','workspaceRoot','runAsUser','mode','maxDurationSec','expectedChecks','imageIds']}
nodePath='/var/lib/jarvis-development/101/config.json';d=json.loads(Path(nodePath).read_bytes());templates=d.get('templates',d.get('executors',[]))
if isinstance(templates,dict):templates=list(templates.values())
fixed=[{k:t.get(k) for k in ['id','engine','purpose','program','args','workspaceRoot','maxRounds','timeoutSec','leaseSec','validation']} for t in templates if isinstance(t,dict) and t.get('id')=='msf-autonomy-fa-01-validator']
agent='0b5aea06-47e1-4f4b-a32e-969417915c9c';j='/var/lib/jarvis-development/101/.delivery-'+agent+'/journal.sqlite';journal={'path':j,'readOnly':True}
try:
 c=sqlite3.connect('file:'+j+'?mode=ro',uri=True);tables=[x[0] for x in c.execute("select name from sqlite_master where type='table'")]
 for table in ['runs','deliveries','process_owner']:
  if table not in tables:continue
  fields=[x[1] for x in c.execute('pragma table_info('+table+')')];item={'columns':fields,'rows':c.execute('select count(*) from '+table).fetchone()[0]}
  for field in ['status','state','ack_state','delivery_state']:
   if field in fields:item[field+'Counts']=dict(c.execute('select '+field+',count(*) from '+table+' group by '+field))
  journal[table]=item
 c.close()
except sqlite3.Error:journal['readStatus']='READONLY_QUERY_FAILED'
containers=[]
r=subprocess.run(['/usr/bin/docker','ps','--format','{{json .}}'],capture_output=True,timeout=15)
if r.returncode==0:
 for line in r.stdout.decode().splitlines():
  row=json.loads(line);name=row.get('Names','')
  if re.fullmatch(r'(?:jarvis-(?:ft|pa|autonomy)[A-Za-z0-9_.-]*|msf[A-Za-z0-9_.-]*)',name):containers.append({k:row.get(k) for k in ['ID','Names','Image','State','Status','Ports']})
mem={}
for line in Path('/proc/meminfo').read_text().splitlines():
 name,rest=line.split(':',1)
 if name in ['MemTotal','MemAvailable','SwapTotal','SwapFree']:mem[name+'Bytes']=int(rest.strip().split()[0])*1024
isolationDirs=[]
for path in ['/home/superopen/opt/node22/lib/node_modules/corepack/dist/pnpm.js','/home/superopen/.local/share/pnpm/store','/home/superopen/.cache/node/corepack','/var/lib/jarvis-development/101/validation','/var/lib/jarvis-development/101/autonomy-evidence','/var/lib/jarvis-development/101/autonomy-public','/home/superopen/All-Projects/msf-supervised-tests']:
 q=Path(path);item={'path':path,'exists':q.exists(),'symlink':q.is_symlink()}
 if q.exists():
  s=q.lstat();item.update({'uid':s.st_uid,'permissions':oct(stat.S_IMODE(s.st_mode)),'directory':q.is_dir(),'regular':q.is_file()});v=os.statvfs(q);item['freeBytes']=v.f_bavail*v.f_frsize
 isolationDirs.append(item)
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'originalSecureSnapshotInspection':{'program':wrapper,'mode':'--inspect-state','exitCode':result.returncode,'data':safe},'originalFullValidatorPin':fullmeta,'phasePolicy':policyMeta,'fixedValidatorTemplate':fixed,'otherControlledHelpers':helpers,'journal':journal,'knownContainers':containers,'availableMemory':mem,'isolationEnvironment':isolationDirs,'remoteWrites':0,'testsRun':0,'buildsRun':0,'modelCalls':0,'restartsRun':0,'privateContentsExported':False}))
`),true,{timeoutMs:120000}));
const path='artifacts/software-factory/acceptance-r24/fixed-entry-boundaries.json';
const report={schemaVersion:1,kind:'software-factory-fixed-entry-boundaries',at:new Date().toISOString(),implementation:{path:'scripts/inspect-factory-baseline-boundaries-r24.mjs',sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')},snapshot};
await mkdir('artifacts/software-factory/acceptance-r24',{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),originalSnapshot:snapshot.originalSecureSnapshotInspection,fullPin:snapshot.originalFullValidatorPin,policy:snapshot.phasePolicy,journal:snapshot.journal,containers:snapshot.knownContainers,memory:snapshot.availableMemory}));
