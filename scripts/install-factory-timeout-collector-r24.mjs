/** Two-phase single-collector CAS; no service/template/product changes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState} from './run-factory-supervision-probe.mjs';
const dir='artifacts/software-factory/acceptance-r24',projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const proofPath=process.argv.find(v=>v.startsWith('--proof='))?.slice(8);
if(!proofPath||!/^artifacts\/software-factory\/acceptance-r24\/timeout-linux-proof-[a-f0-9-]{36}\.json$/.test(proofPath))throw Error('TIMEOUT_INSTALL_PROOF_REQUIRED');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(v).digest('hex');
const proofRaw=await readFile(proofPath),proof=JSON.parse(proofRaw);
const cleanupPath=dir+'/timeout-linux-proof-cleanup-readback-'+proof.id+'.json';
const cleanupRaw=await readFile(cleanupPath),cleanup=JSON.parse(cleanupRaw);
const raw=await readFile('scripts/project-autonomy-fa01-collector.mjs'),newSHA256=sha(raw),priorSHA256='711b6851a3074810584625b57a7a3e5a0cbfc1e6114783451644f9ff6efe11f9';
const imageId='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96';
if(proof.passed!==false||proof.errorCode!=='TIMEOUT_PROOF_CLEANUP_UNCONFIRMED'||proof.exitCode!==0||proof.installed||proof.network!=='none'||proof.imageId!==imageId||proof.proof?.passed!==true||proof.proof?.capEff!=='00000000000000c0'||proof.proof?.simulated!==false||proof.proof?.checks?.length!==5||!proof.sourceFingerprints?.some(v=>v.name==='project-autonomy-fa01-collector.mjs'&&v.sha256===newSHA256)||cleanup.passed!==true||cleanup.exactContainerAbsent!==true||cleanup.fixtureRerun!==false||cleanup.id!==proof.id||cleanup.priorReportSha256!==sha(proofRaw)||cleanup.imageId!==imageId||canonical(cleanup.sourceFingerprints)!==canonical(proof.sourceFingerprints))throw Error('TIMEOUT_INSTALL_COMBINED_PROOF_INVALID');
const reconcile=process.argv.find(v=>v.startsWith('--reconcile='))?.slice(12);
if(reconcile&&!/^[a-f0-9-]{36}$/.test(reconcile))throw Error('TIMEOUT_INSTALL_RECONCILE_ID_INVALID');
if(!process.argv.includes('--execute')&&!reconcile){console.log(JSON.stringify({ready:true,priorSHA256,newSHA256,proofPath,cleanupPath,installs:false}));process.exit(0);}
const id=reconcile??randomUUID(),intentPath=dir+'/timeout-collector-install-intent-'+id+'.json';
const intent={at:new Date().toISOString(),id,projectId,proofPath,proofRawSHA256:sha(proofRaw),cleanupPath,cleanupRawSHA256:sha(cleanupRaw),priorSHA256,newSHA256,
 scope:'Single trusted collector file CAS only; no model/product/service/template change.',automaticRetry:false};
if(!reconcile)await writeFile(intentPath,JSON.stringify(intent,null,2)+'\n',{flag:'wx'});
else{const saved=JSON.parse(await readFile(intentPath,'utf8'));if(saved.newSHA256!==newSHA256||saved.proofRawSHA256!==intent.proofRawSHA256||saved.cleanupRawSHA256!==intent.cleanupRawSHA256)throw Error('TIMEOUT_INSTALL_RECONCILE_INTENT_CHANGED');}
const payload={id,proofId:proof.id,proofCanonicalSHA256:sha(canonical(proof)),priorSHA256,newSHA256,raw:raw.toString('base64'),agentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c'};
const program=String.raw`import os,stat,json,base64,hashlib,subprocess,sqlite3,datetime,secrets,re
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def trusted(q,private=False):
 for x in [q,*q.parents]:
  s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'TIMEOUT_INSTALL_PATH_UNTRUSTED')
 if private:need(stat.S_IMODE(q.lstat().st_mode)==0o700,'TIMEOUT_INSTALL_PRIVATE_DIRECTORY_INVALID')
def read_regular(q):
 trusted(q.parent);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022 and s.st_nlink==1 and s.st_size<2000000,'TIMEOUT_INSTALL_FILE_UNTRUSTED')
  with os.fdopen(os.dup(fd),'rb') as f:raw=f.read(2000001)
  after=os.fstat(fd);fields=lambda v:(v.st_dev,v.st_ino,v.st_uid,v.st_gid,v.st_mode,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
  need(len(raw)==s.st_size and fields(s)==fields(after),'TIMEOUT_INSTALL_FILE_CHANGED_DURING_READ');return raw
 finally:os.close(fd)
def create(q,raw,mode):
 fd=os.open(q,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  data=memoryview(raw)
  while data:
   n=os.write(fd,data);need(n>0,'TIMEOUT_INSTALL_SHORT_WRITE');data=data[n:]
  os.fchown(fd,0,0);os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
def syncdir(q):
 fd=os.open(q,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def quiet():
 unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
 need(unit.get('ActiveState')=='active','TIMEOUT_INSTALL_NODE_NOT_ACTIVE');pid=int(unit.get('MainPID','0'));need(pid>0,'TIMEOUT_INSTALL_NODE_PID_INVALID')
 children=[]
 for q in Path('/proc').iterdir():
  if not q.name.isdigit():continue
  try:
   if int(next(x.split(':',1)[1] for x in (q/'status').read_text().splitlines() if x.startswith('PPid:')))==pid:children.append(q.name)
  except (OSError,StopIteration):pass
 need(not children,'TIMEOUT_INSTALL_NODE_NOT_IDLE')
 cfg=Path('/var/lib/jarvis-development/101/config.json');trusted(cfg.parent)
 fd=os.open(cfg,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==1000 and s.st_gid==1000 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<2000000,'TIMEOUT_INSTALL_NODE_CONFIG_METADATA_CHANGED')
  with os.fdopen(os.dup(fd),'rb') as f:config_raw=f.read(2000000)
 finally:os.close(fd)
 config=json.loads(config_raw);need(config.get('agentId')==p['agentId'],'TIMEOUT_INSTALL_AGENT_CHANGED')
 c=sqlite3.connect('file:/var/lib/jarvis-development/101/.delivery-'+p['agentId']+'/journal.sqlite?mode=ro',uri=True,timeout=10)
 try:counts=[c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],c.execute('SELECT count(*) FROM logs').fetchone()[0]]
 finally:c.close()
 need(not any(counts),'TIMEOUT_INSTALL_NODE_NOT_RECONCILED')
 fields=(Path('/proc')/str(pid)/'stat').read_text();start=fields[fields.rfind(')')+2:].split()[19]
 return {'mainPID':pid,'startTime':start,'configSHA256':sha(config_raw),'journalCounts':counts,'nativeChildren':0}
def fingerprints():
 helper=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py');trusted(helper)
 return {source:json.loads(subprocess.check_output(['/usr/bin/python3',str(helper),'fingerprint',source],text=True,timeout=20))['sha256'] for source in ['/home/superopen/All-Projects/msf','/home/superopen/All-Projects/msf-jarvis-autonomy-r22']}
def proof_check():
 q=Path('/root')/('jarvis-timeout-proof-r24-'+p['proofId'])/'result.json';value=json.loads(read_regular(q))
 need(sha(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())==p['proofCanonicalSHA256'],'TIMEOUT_INSTALL_REMOTE_PROOF_CHANGED')
 need(value.get('exitCode')==0 and value.get('proof',{}).get('passed') is True,'TIMEOUT_INSTALL_REMOTE_PROOF_NOT_PASSED')
 name='jarvis-timeout-proof-r24-'+p['proofId'].replace('-','')
 inspected=subprocess.run(['/usr/bin/docker','inspect','--type','container',name],capture_output=True,timeout=10)
 listed=subprocess.run(['/usr/bin/docker','container','ls','--all','--filter','name='+name,'--format','{{.Names}}'],capture_output=True,text=True,timeout=10)
 need(inspected.returncode!=0 and listed.returncode==0 and name not in listed.stdout.splitlines(),'TIMEOUT_INSTALL_PROOF_CONTAINER_NOT_ABSENT')
need(os.geteuid()==0 and re.fullmatch('[a-f0-9-]{36}',p['id']),'TIMEOUT_INSTALL_ROOT_OR_ID_INVALID')
base=Path('/var/lib/jarvis-control/factory-validator-upgrades-r24');trusted(base,True);backup=base/p['id']
target=Path('/opt/jarvis-development/software-factory/project-autonomy-fa01-collector.mjs');stage=target.parent/('.collector-timeout-r24-'+p['id']+'.tmp')
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':p['id'],'rootBackupId':p['id'],'proofId':p['proofId'],'phase':p['phase'],'priorSHA256':p['priorSHA256'],'newSHA256':p['newSHA256'],'installed':False,'errorCode':None,'rollbackStatus':'not-needed','serviceRestarted':False,'templatePolicyChanged':False,'containerCapabilitiesChanged':False,'modelsInvoked':False,'productAccepted':False}
swapped=False
try:
 if p['phase']=='prepare':
  proof_check();initial=quiet();old=read_regular(target);need(sha(old)==p['priorSHA256'],'TIMEOUT_INSTALL_OLD_VERSION_CHANGED');need(stat.S_IMODE(target.lstat().st_mode)==0o644 and target.lstat().st_gid==0,'TIMEOUT_INSTALL_TARGET_METADATA_CHANGED')
  new=base64.b64decode(p['raw'],validate=True);need(sha(new)==p['newSHA256'],'TIMEOUT_INSTALL_NEW_VERSION_CHANGED');before=fingerprints();need(quiet()==initial,'TIMEOUT_INSTALL_NODE_CHANGED')
  backup.mkdir(mode=0o700);trusted(backup,True);create(backup/'collector.prior.mjs',old,0o600);create(stage,new,0o644)
  need(read_regular(backup/'collector.prior.mjs')==old and read_regular(stage)==new,'TIMEOUT_INSTALL_PREPARED_BYTES_INVALID')
  prepared={'nonce':secrets.token_hex(32),'priorSHA256':p['priorSHA256'],'newSHA256':p['newSHA256'],'node':initial,'sourceFingerprintsBefore':before,'proofId':p['proofId']}
  create(backup/'prepared.json',(json.dumps(prepared,sort_keys=True)+'\n').encode(),0o600);syncdir(backup);syncdir(target.parent)
  result.update({'prepared':True,'nonce':prepared['nonce'],'sourceFingerprintsBefore':before,'nodeIdle':True})
 elif p['phase']=='commit':
  trusted(backup,True);prepared=json.loads(read_regular(backup/'prepared.json'))
  need(p.get('nonce')==prepared['nonce'] and prepared['priorSHA256']==p['priorSHA256'] and prepared['newSHA256']==p['newSHA256'] and prepared['proofId']==p['proofId'],'TIMEOUT_INSTALL_PREPARE_BINDING_CHANGED')
  proof_check();need(quiet()==prepared['node'],'TIMEOUT_INSTALL_NODE_CHANGED');need(fingerprints()==prepared['sourceFingerprintsBefore'],'TIMEOUT_INSTALL_SOURCE_CHANGED_BEFORE_COMMIT')
  need(quiet()==prepared['node'],'TIMEOUT_INSTALL_NODE_CHANGED_BEFORE_CAS')
  need(sha(read_regular(target))==p['priorSHA256'] and sha(read_regular(stage))==p['newSHA256'] and sha(read_regular(backup/'collector.prior.mjs'))==p['priorSHA256'],'TIMEOUT_INSTALL_CAS_CHANGED')
  create(backup/'commit-intent.json',(json.dumps({'at':result['at'],'priorSHA256':p['priorSHA256'],'newSHA256':p['newSHA256']})+'\n').encode(),0o600);syncdir(backup)
  os.replace(stage,target);swapped=True;syncdir(target.parent)
  need(sha(read_regular(target))==p['newSHA256'],'TIMEOUT_INSTALL_COMMIT_UNCONFIRMED');after=fingerprints();need(after==prepared['sourceFingerprintsBefore'] and quiet()==prepared['node'],'TIMEOUT_INSTALL_POST_SOURCE_OR_NODE_CHANGED')
  result.update({'installed':True,'sourceFingerprintsBefore':prepared['sourceFingerprintsBefore'],'sourceFingerprintsAfter':after,'originalSourcesUnchanged':True,'nodeIdle':True,'oldBytesPreserved':True})
 elif p['phase']=='readback':
  trusted(backup,True);prepared=json.loads(read_regular(backup/'prepared.json'));current=sha(read_regular(target))
  result.update({'installationState':'current-new' if current==p['newSHA256'] else 'current-old' if current==p['priorSHA256'] else 'unknown-version','installed':current==p['newSHA256'],'actualSHA256':current,'oldBytesPreserved':sha(read_regular(backup/'collector.prior.mjs'))==p['priorSHA256'],'sourceFingerprintsBefore':prepared['sourceFingerprintsBefore'],'sourceFingerprintsAfter':fingerprints(),'nodeIdle':quiet()==prepared['node'],'commitIntentPresent':(backup/'commit-intent.json').exists(),'readOnly':True})
  result['originalSourcesUnchanged']=result['sourceFingerprintsBefore']==result['sourceFingerprintsAfter']
  result['reconciliationRequired']=current not in [p['newSHA256'],p['priorSHA256']] or not result['oldBytesPreserved'] or not result['originalSourcesUnchanged'] or not result['nodeIdle'] or (result['installed'] and not result['commitIntentPresent'])
 else:raise RuntimeError('TIMEOUT_INSTALL_PHASE_INVALID')
except Exception as e:
 result['errorCode']=str(e) if re.fullmatch('TIMEOUT_INSTALL_[A-Z_]+',str(e)) else 'TIMEOUT_INSTALL_OPERATION_UNCONFIRMED'
 if swapped:
  try:
   need(sha(read_regular(target))==p['newSHA256'],'TIMEOUT_INSTALL_ROLLBACK_CAS_CONFLICT');create(stage,read_regular(backup/'collector.prior.mjs'),0o644);os.replace(stage,target);syncdir(target.parent);need(sha(read_regular(target))==p['priorSHA256'],'TIMEOUT_INSTALL_ROLLBACK_UNCONFIRMED');result['rollbackStatus']='verified-old';result['installed']=False
  except Exception:result['rollbackStatus']='unconfirmed';result['reconciliationRequired']=True
 if p['phase']=='prepare' and stage.exists():
  try:need(sha(read_regular(stage))==p['newSHA256'],'TIMEOUT_INSTALL_STAGE_CLEANUP_CONFLICT');stage.unlink();syncdir(target.parent)
  except Exception:result['stageCleanupUnconfirmed']=True
if p['phase']!='readback' and backup.exists():
 try:create(backup/(p['phase']+'-result.json'),(json.dumps(result,indent=2)+'\n').encode(),0o600);syncdir(backup)
 except Exception:result['privateResultSaveFailed']=True;result['reconciliationRequired']=True
print(json.dumps(result))
`;
let result,prepared;
try{result=await withPlatform(async({api})=>{
 const assertCentral=async()=>{const global=(await api('/api/v1/execution/supervision')).data,p=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
  if(global.supervised!==false||global.stopped||p.revision!==20||p.spec.objectives.length!==74||p.verifiedObjectiveIds.length||p.config.costPolicy!=='record-only'||p.config.maxUSD!==null||p.config.maxTokens!==null||p.config.perTaskUSD!==null||queueState().allActive!==0)throw Error('TIMEOUT_INSTALL_SCOPE_OR_QUEUE_CHANGED');return sha(canonical(p));};
 const phase=(name,extra={})=>JSON.parse(remote(lanProfile,'jarvis-101',python({...payload,phase:name,...extra},program),true,{timeoutMs:180000}));
 if(reconcile)return {...phase('readback'),proofPath,cleanupPath,automaticRetry:false};
 const centralSHA256=await assertCentral();prepared=phase('prepare');if(prepared.errorCode||!prepared.prepared||prepared.privateResultSaveFailed)throw Error(prepared.errorCode??'TIMEOUT_INSTALL_PREPARE_UNCONFIRMED');
 await mkdir('.jarvis-dev/maintenance',{recursive:true});await writeFile('.jarvis-dev/maintenance/timeout-install-'+id+'.json',JSON.stringify(prepared,null,2)+'\n',{flag:'wx',mode:0o600});
 if(await assertCentral()!==centralSHA256)throw Error('TIMEOUT_INSTALL_CENTRAL_CHANGED_BEFORE_COMMIT');
 await writeFile(dir+'/timeout-collector-commit-intent-'+id+'.json',JSON.stringify({...intent,at:new Date().toISOString(),prepared:true,centralSHA256},null,2)+'\n',{flag:'wx'});
 const committed=phase('commit',{nonce:prepared.nonce});const readback=phase('readback');const centralUnchanged=await assertCentral()===centralSHA256;
 return {...committed,readback,centralUnchanged,profileUnchanged:centralUnchanged,proofPath,cleanupPath,automaticRetry:false,
  verifiedInstalled:committed.installed===true&&!committed.errorCode&&!committed.privateResultSaveFailed&&!committed.reconciliationRequired&&!readback.errorCode&&!readback.reconciliationRequired&&readback.installed===true&&readback.originalSourcesUnchanged===true&&readback.nodeIdle===true&&readback.oldBytesPreserved===true&&centralUnchanged,
  reconciliationRequired:Boolean(committed.privateResultSaveFailed||committed.reconciliationRequired||readback.reconciliationRequired||!centralUnchanged||readback.errorCode)};
});}catch(error){result={at:new Date().toISOString(),id,errorCode:/TIMEOUT_INSTALL_[A-Z_]+/.exec(error?.message??'')?.[0]??'TIMEOUT_INSTALL_REMOTE_UNCONFIRMED',preparedConfirmed:prepared?.prepared===true,installed:null,reconciliationRequired:true,automaticRetry:false,
 intentPath,proofPath,cleanupPath,priorSHA256,newSHA256,modelsInvoked:false,productAccepted:false};}
const output=dir+'/timeout-collector-'+(reconcile?'readback':'install-result')+'-'+id+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));if(result.errorCode||result.reconciliationRequired||!reconcile&&!result.verifiedInstalled)process.exitCode=1;
