/** Precisely version and independently prove the fixed disposable-copy adapter.
 * No model, project source, executor policy, business service or database writes.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform,remote,lanProfile,primary,python} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',agentId='0b5aea06-47e1-4f4b-a32e-969417915c9c';
const dir='artifacts/software-factory/acceptance-r24';
const execute=process.argv.includes('--execute');
const sha=v=>createHash('sha256').update(v).digest('hex');
const names=['project-autonomy-fa01-coordinator.py','project-autonomy-fa01-collector.mjs','test-project-autonomy-copy-permissions-r24.py'];
const source=await Promise.all(names.map(async name=>{const bytes=await readFile('scripts/'+name);return {name,sha256:sha(bytes),base64:bytes.toString('base64')};}));
const frozenNew={
 'project-autonomy-fa01-coordinator.py':'f60c3e88056515e41bd0486285809b2342d783f21e225f9ffc64c3d96477740b',
 'project-autonomy-fa01-collector.mjs':'711b6851a3074810584625b57a7a3e5a0cbfc1e6114783451644f9ff6efe11f9',
 'test-project-autonomy-copy-permissions-r24.py':'d2e0262dbe69548760ebaf2dac27a304b88569db0d335020e383b622abd89b3d'
};
if(source.some(v=>frozenNew[v.name]!==v.sha256))throw Error('VALIDATOR_FROZEN_NEW_SOURCE_CHANGED');
const prior=JSON.parse(await readFile(dir+'/candidate-collector-cause-independent-review.json','utf8'));
const oldHashes=Object.fromEntries(prior.sourceHashes.map(v=>[v.path.split('/').at(-1),v.sha256]));
if(names.slice(0,2).some(name=>!oldHashes[name]))throw Error('VALIDATOR_PRIOR_HASH_MISSING');
const readiness=JSON.parse(await readFile(dir+'/source-and-fixed-entry-readiness.json','utf8'));
const approvedRuntime=readiness.snapshot.fixedDockerImages.find(v=>v.reference==='jarvis-msf-test:20261010-r2');
if(!approvedRuntime?.present||!/^sha256:[0-9a-f]{64}$/.test(approvedRuntime.imageId))throw Error('VALIDATOR_APPROVED_RUNTIME_MISSING');
const id=randomUUID();
const outcome=await withPlatform(async({api})=>{
 const before=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(before.revision!==20||before.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||before.config.costPolicy!=='record-only'||before.config.maxUSD!==null||before.config.maxTokens!==null||before.config.perTaskUSD!==null||before.verifiedObjectiveIds.length!==0)throw Error('VALIDATOR_FROZEN_PROFILE_CHANGED');
 if((await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('VALIDATOR_GLOBAL_SUPERVISION_ACTIVE');
 const checkCentral=()=>JSON.parse(primary(python({projectId,machineId:before.config.machineId},String.raw`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:active=[r[0] for r in c.execute("SELECT id FROM execution_runs WHERE machine_id=? AND status IN('queued','running')",(p['machineId'],))]
finally:c.close()
c=sqlite3.connect('file:/var/lib/jarvis/data/project-autonomy/autonomy.sqlite?mode=ro',uri=True,timeout=10)
try:pending=[r[0] for r in c.execute('SELECT id FROM autonomy_stops WHERE project_id=? AND confirmed=0',(p['projectId'],))]
finally:c.close()
print(json.dumps({'active':active,'pendingStops':pending}))
`)));
 const central=checkCentral();
 if(central.active.length||central.pendingStops.length)throw Error('VALIDATOR_NODE_QUEUE_NOT_IDLE');
 const operation=payload=>JSON.parse(remote(lanProfile,'jarvis-101',python(payload,String.raw`import os,stat,json,hashlib,base64,subprocess,sqlite3,datetime,tarfile,io
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(b):return hashlib.sha256(b).hexdigest()
def trusted(path,private=False):
 for q in [path,*path.parents]:
  s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'VALIDATOR_PATH_UNTRUSTED')
 s=path.lstat()
 if private:need(stat.S_ISDIR(s.st_mode) and stat.S_IMODE(s.st_mode)==0o700,'VALIDATOR_PRIVATE_PATH_UNTRUSTED')
cfg=json.loads(Path('/var/lib/jarvis-development/101/config.json').read_bytes());need(cfg.get('agentId')==p['agentId'],'VALIDATOR_NODE_IDENTITY_CHANGED')
unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
pid=int(unit.get('MainPID','0'));need(unit.get('ActiveState')=='active' and pid>0,'VALIDATOR_NODE_NOT_ACTIVE')
children=[]
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  parent=int(next(x.split(':',1)[1] for x in (q/'status').read_text().splitlines() if x.startswith('PPid:')))
  if parent==pid:children.append(int(q.name))
 except (FileNotFoundError,PermissionError,StopIteration):pass
need(not children,'VALIDATOR_NATIVE_CHILDREN_ACTIVE')
db=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10)
try:
 counts={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
finally:c.close()
need(not any(counts.values()),'VALIDATOR_NODE_JOURNAL_NOT_IDLE')
tools=Path('/opt/jarvis-development/software-factory');trusted(tools)
old=[]
for name,expected in p['oldHashes'].items():
 target=tools/name;trusted(target);s=target.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'VALIDATOR_OLD_FILE_UNTRUSTED')
 raw=target.read_bytes();need(digest(raw)==expected,'VALIDATOR_OLD_VERSION_CHANGED')
 old.append({'name':name,'sha256':expected,'mode':stat.S_IMODE(s.st_mode),'raw':raw})
helper=tools/'project-autonomy-evidence.py';trusted(helper)
def fingerprints():
 return {workspace:json.loads(subprocess.check_output(['/usr/bin/python3',str(helper),'fingerprint',workspace],text=True,timeout=90))['sha256'] for workspace in [p['workspace'],'/home/superopen/All-Projects/msf']}
before=fingerprints()
parent=Path('/var/lib/jarvis-control');trusted(parent)
store=parent/'factory-validator-upgrades-r24'
store.mkdir(mode=0o700,exist_ok=True);trusted(store,True)
def fixed_write(path,body,mode):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:f.write(body);f.flush();os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
need(p['phase'] in ['proof','commit'],'VALIDATOR_INSTALL_PHASE_INVALID')
backup=store/p['id']
if p['phase']=='proof':
 backup.mkdir(mode=0o700);trusted(backup,True)
 proofdir=backup/'proof';proofdir.mkdir(mode=0o700)
 for item in p['source']:
  raw=base64.b64decode(item['base64']);need(digest(raw)==item['sha256'],'VALIDATOR_NEW_SOURCE_HASH_CHANGED');fixed_write(proofdir/item['name'],raw,0o600)
 test=proofdir/'test-project-autonomy-copy-permissions-r24.py'
 # Export just the regular Node binary from the frozen approved offline image.
 # The temporary container is never started and receives no mounts or network.
 docker='/usr/bin/docker';trusted(Path(docker))
 image=subprocess.check_output([docker,'image','inspect','--format','{{.Id}}',p['approvedRuntime']['reference']],text=True,timeout=15).strip()
 need(image==p['approvedRuntime']['imageId'],'VALIDATOR_APPROVED_RUNTIME_CHANGED')
 container='jarvis-r24-proof-runtime-'+p['id']
 created=False;create_attempted=False;binary=None;binary_source=None
 try:
  existing=subprocess.run([docker,'container','inspect',container],capture_output=True,timeout=10)
  need(existing.returncode!=0,'VALIDATOR_PROOF_CONTAINER_ALREADY_EXISTS')
  create_attempted=True
  result=subprocess.run([docker,'create','--pull=never','--name',container,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--label','jarvis.validation.role=r24-runtime-export','--label','jarvis.validation.attempt='+p['id'],image,'/bin/false'],capture_output=True,timeout=30)
  need(result.returncode==0,'VALIDATOR_PROOF_RUNTIME_CREATE_FAILED');created=True
  for node_source in ['/usr/local/bin/node','/usr/bin/node']:
   exported=subprocess.run([docker,'cp',container+':'+node_source,'-'],capture_output=True,timeout=45)
   if exported.returncode!=0:continue
   need(len(exported.stdout)<=160*1024*1024,'VALIDATOR_PROOF_RUNTIME_TOO_LARGE')
   with tarfile.open(fileobj=io.BytesIO(exported.stdout),mode='r:*') as archive:
    files=[v for v in archive.getmembers() if not v.isdir()]
    if len(files)!=1 or not files[0].isfile() or files[0].issym() or files[0].islnk() or Path(files[0].name).name!='node':continue
    need(0<files[0].size<=128*1024*1024,'VALIDATOR_PROOF_BINARY_INVALID')
    stream=archive.extractfile(files[0]);binary=stream.read();need(len(binary)==files[0].size,'VALIDATOR_PROOF_BINARY_TRUNCATED');binary_source=node_source;break
  need(binary is not None,'VALIDATOR_PROOF_NODE_BINARY_NOT_FOUND')
 finally:
  if create_attempted:
   inspected=subprocess.run([docker,'container','inspect',container],capture_output=True,text=True,timeout=15)
   if inspected.returncode==0:
    values=json.loads(inspected.stdout);need(len(values)==1,'VALIDATOR_PROOF_CLEANUP_IDENTITY_INVALID');value=values[0]
    need(value.get('Config',{}).get('Labels',{}).get('jarvis.validation.attempt')==p['id'] and value.get('Image')==image and value.get('State',{}).get('Running') is False and not value.get('Mounts'),'VALIDATOR_PROOF_CLEANUP_IDENTITY_INVALID')
    removed=subprocess.run([docker,'rm','--force','--volumes',container],capture_output=True,timeout=30)
    need(removed.returncode==0,'VALIDATOR_PROOF_RUNTIME_CLEANUP_FAILED')
   else:
    need('No such object' in inspected.stderr or 'No such container' in inspected.stderr,'VALIDATOR_PROOF_RUNTIME_CLEANUP_UNCONFIRMED')
 node=proofdir/'node';fixed_write(node,binary,0o755);trusted(node)
 runtime={'imageReference':p['approvedRuntime']['reference'],'imageId':image,'binarySource':binary_source,'binarySHA256':digest(binary),'containerCreated':True,'containerStarted':False,'containerRemoved':True,'hostMounts':False,'externalNetwork':False,'existingPlatformRuntimeChanged':False}
 r=subprocess.run(['/usr/bin/python3',str(test),'--linux-proof',str(node)],cwd=str(proofdir),capture_output=True,text=True,timeout=90,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','PYTHONDONTWRITEBYTECODE':'1'})
 fixed_write(backup/'linux-proof.stdout',r.stdout.encode(),0o600);fixed_write(backup/'linux-proof.stderr',r.stderr.encode(),0o600)
 need(r.returncode==0,'VALIDATOR_LINUX_PROOF_FAILED')
 proof=json.loads(r.stdout);need(proof.get('kind')=='project-autonomy-copy-linux-permission-proof' and proof.get('simulated') is False and proof.get('productAcceptance') is False,'VALIDATOR_LINUX_PROOF_IDENTITY_INVALID')
 for item in old:fixed_write(backup/(item['name']+'.prior'),item['raw'],0o600)
else:
 trusted(backup,True);saved=backup/'proof-result.json';trusted(saved)
 proof_raw=saved.read_bytes();need(digest(proof_raw)==p['proofSHA256'],'VALIDATOR_PROOF_RECEIPT_CHANGED')
 prior_proof=json.loads(proof_raw);need(not prior_proof['installed'] and prior_proof['sourceFingerprintsAfter']==before,'VALIDATOR_SOURCE_CHANGED_SINCE_PROOF')
 proof=prior_proof['proof']
 runtime=prior_proof['runtime']
 saved=backup/'proof'/'node';trusted(saved);need(digest(saved.read_bytes())==runtime['binarySHA256'],'VALIDATOR_PROOF_RUNTIME_RECEIPT_CHANGED')
 for item in old:
  saved=backup/(item['name']+'.prior');trusted(saved);need(saved.read_bytes()==item['raw'],'VALIDATOR_PRIOR_BACKUP_CHANGED')
 for item in p['source']:
  need(digest(base64.b64decode(item['base64']))==item['sha256'],'VALIDATOR_NEW_SOURCE_HASH_CHANGED')
  saved=backup/'proof'/item['name'];trusted(saved);need(digest(saved.read_bytes())==item['sha256'],'VALIDATOR_NEW_SOURCE_CHANGED_SINCE_PROOF')
versions=[]
for item in p['source'][:2]:
 mode=next(v['mode'] for v in old if v['name']==item['name']);versions.append({'name':item['name'],'priorSHA256':p['oldHashes'][item['name']],'newSHA256':item['sha256'],'mode':mode})
record={'id':p['id'],'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nodeIdle':True,'versions':versions,'proof':proof,'runtime':runtime,'sourceFingerprintsBefore':before,'execute':p['execute']}
fixed_write(backup/(p['phase']+'-intent.json'),(json.dumps(record,indent=2)+'\n').encode(),0o600)
changed=[]
try:
 if p['execute']:
  for item in p['source'][:2]:
   target=tools/item['name'];need(digest(target.read_bytes())==p['oldHashes'][item['name']],'VALIDATOR_INSTALL_CAS_CHANGED')
   staged=tools/('.r24-'+p['id']+'-'+item['name']);mode=next(v['mode'] for v in old if v['name']==item['name'])
   fixed_write(staged,base64.b64decode(item['base64']),mode);os.replace(staged,target);changed.append(item['name'])
  for item in p['source'][:2]:trusted(tools/item['name']);need(digest((tools/item['name']).read_bytes())==item['sha256'],'VALIDATOR_INSTALL_READBACK_FAILED')
 after=fingerprints();need(before==after,'VALIDATOR_ORIGINAL_SOURCE_CHANGED')
except:
 for name in reversed(changed):
  prior=next(v for v in old if v['name']==name);staged=tools/('.r24-rollback-'+p['id']+'-'+name);fixed_write(staged,prior['raw'],prior['mode']);os.replace(staged,tools/name)
 raise
record.update({'installed':p['execute'],'sourceFingerprintsAfter':after,'originalSourcesUnchanged':before==after,'templatePolicyChanged':False,'containerCapabilitiesChanged':False,'businessServicesRestarted':False,'businessDataTouched':False,'modelCalls':0,'rootBackupId':p['id'],'oldBytesPreserved':True,'privateConfigurationExported':False})
raw_result=(json.dumps(record,indent=2)+'\n').encode()
fixed_write(backup/('result.json' if p['execute'] else 'proof-result.json'),raw_result,0o600)
record['resultSHA256']=digest(raw_result)
print(json.dumps(record))
`),true,{timeoutMs:180000}));
 const payload={id,agentId,source,oldHashes,approvedRuntime,workspace:before.config.workspace};
 const proof=operation({...payload,phase:'proof',execute:false});
 let installed=proof;
 if(execute){
  const fresh=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
  if(JSON.stringify(before)!==JSON.stringify(fresh)||(await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('VALIDATOR_SCOPE_CHANGED_BEFORE_COMMIT');
  const freshCentral=checkCentral();
  if(freshCentral.active.length||freshCentral.pendingStops.length)throw Error('VALIDATOR_QUEUE_CHANGED_BEFORE_COMMIT');
  installed=operation({...payload,phase:'commit',execute:true,proofSHA256:proof.resultSHA256});
 }
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(JSON.stringify(before)!==JSON.stringify(after)||(await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('VALIDATOR_PLATFORM_SCOPE_CHANGED');
 return {...installed,profileRevision:after.revision,independentlyAcceptedObjectives:after.verifiedObjectiveIds.length,totalObjectives:after.spec.objectives.length,centralQueueIdle:true,globalSupervision:false,productAccepted:false};
});
await mkdir(dir,{recursive:true});
const output=dir+'/validator-copy-permissions-'+(execute?'installed':'proof')+'-'+id+'.json';
await writeFile(output,JSON.stringify(outcome,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,...outcome}));
