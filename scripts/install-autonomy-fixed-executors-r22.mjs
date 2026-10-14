/** Prepare/add only the nine protected, no-model autonomy revalidation templates.
 * Default is read-only preflight. The parent operator executes --execute after R22-3 is live.
 * Public intent is saved before SSH mutations; private node configuration never leaves 101.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {remote,primary,lanProfile,python,withPlatform} from './managed-server-client.mjs';

const RELEASE='20261011-project-autonomy-r22-3';
const AGENT='0b5aea06-47e1-4f4b-a32e-969417915c9c';
const MACHINE='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
const UNIT='jarvis-software-factory-development.service';
const CONFIG='/var/lib/jarvis-development/101/config.json';
const DIRECTORY='artifacts/software-factory/autonomy-r22';
const execute=process.argv.includes('--execute');
const attempt=Number(process.env.JARVIS_FIXED_EXECUTOR_ATTEMPT??1);
if(!Number.isInteger(attempt)||attempt<1||attempt>20)throw Error('FIXED_EXECUTOR_ATTEMPT_INVALID');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex');
const fail=code=>{throw Error(code)};
const phases=Array.from({length:9},(_,i)=>'FA-'+String(i+1).padStart(2,'0'));
const phaseId=(phase,role)=>'msf-autonomy-'+phase.toLowerCase()+'-'+role;
const projection=c=>({templates:c.templates,probes:c.probes??[],wol:c.wol??[]});
const queue=()=>JSON.parse(primary(String.raw`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:print(json.dumps({'allActive':c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN ('queued','running')").fetchone()[0],'fullTable':True,'readOnly':True}))
finally:c.close()
`));

const nodeCode=String.raw`import os,stat,hashlib,tempfile,subprocess,time,sqlite3,pwd,re
from pathlib import Path
def need(ok,code):
 if not ok:raise RuntimeError(code)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
def safe(q,directory=False,owner=None,private=False):
 s=q.lstat()
 need(not stat.S_ISLNK(s.st_mode) and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)),'FIXED_PATH_UNSAFE')
 need(owner is None or s.st_uid==owner,'FIXED_PATH_OWNER_INVALID')
 need(not s.st_mode&(0o077 if private else 0o022),'FIXED_PATH_MODE_INVALID')
 if not directory:need(s.st_nlink==1,'FIXED_PATH_LINK_INVALID')
 return s
def parent_chain(q):
 for part in [q,*q.parents]:safe(part,True,0)
def unit():
 r=subprocess.run(['/usr/bin/systemctl','show',p['unit'],'--property=ActiveState,SubState,MainPID,User,ControlGroup'],capture_output=True,text=True,check=True,timeout=10)
 u=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
 need(u.get('User')=='superopen' and u.get('ControlGroup') in ['', '/system.slice/'+p['unit']],'FIXED_NODE_UNIT_SCOPE_CHANGED')
 return u
def process_identity(pid):
 body=Path('/proc/'+str(pid)+'/stat').read_text();parts=body[body.rfind(')')+2:].split()
 return Path('/proc/sys/kernel/random/boot_id').read_text().strip()+':'+parts[19]
def children(pid):
 count=0
 for q in Path('/proc').iterdir():
  if not q.name.isdigit():continue
  try:
   info=(q/'status').read_text();parent=int(next(x.split(':',1)[1] for x in info.splitlines() if x.startswith('PPid:')))
   if parent==pid:count+=1
  except (FileNotFoundError,PermissionError,StopIteration):pass
 return count
def journal(u,require_owner):
 safe(spool,True,account.pw_uid,True);safe(db,owner=account.pw_uid,private=True)
 c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10)
 try:
  need(c.execute('SELECT agent_id,machine_id FROM identity').fetchone()==(p['agent'],p['machine']),'FIXED_JOURNAL_IDENTITY_CHANGED')
  counts={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
  need(not any(counts.values()),'FIXED_JOURNAL_NOT_IDLE')
  owner=c.execute('SELECT pid,process_identity FROM process_owner WHERE id=1').fetchone()
  if require_owner:
   pid=int(u.get('MainPID','0'));need(u.get('ActiveState')=='active' and pid>0,'FIXED_NODE_NOT_ACTIVE')
   need(owner and owner[0]==pid and owner[1]==process_identity(pid),'FIXED_JOURNAL_OWNER_NOT_READY')
   need(children(pid)==0,'FIXED_NODE_CHILD_PROCESSES_PRESENT')
  return counts
 finally:c.close()
def check_stopped():
 u=unit();need(u.get('ActiveState') in ['inactive','failed'] and int(u.get('MainPID','0'))==0,'FIXED_NODE_NOT_STOPPED')
 cg=Path('/sys/fs/cgroup/system.slice')/p['unit']/'cgroup.procs'
 need(not cg.exists() or not cg.read_text().strip(),'FIXED_OLD_CGROUP_NOT_EMPTY')
 journal(u,False);return u
def atomic(data,uid,gid,mode):
 fd,name=tempfile.mkstemp(prefix='.fixed-validator-',dir=config.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chown(name,uid,gid);os.chmod(name,mode);os.replace(name,config)
  dfd=os.open(config.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(dfd)
  finally:os.close(dfd)
 finally:
  if os.path.exists(name):os.unlink(name)
def startup():
 subprocess.run(['/usr/bin/systemctl','start',p['unit']],check=True,capture_output=True,timeout=20)
 for n in range(20):
  try:
   u=unit();counts=journal(u,True);return {'unit':u,'journal':counts,'pidAndBootStartIdentityMatch':True}
  except RuntimeError as exc:
   if str(exc) not in ['FIXED_NODE_NOT_ACTIVE','FIXED_JOURNAL_OWNER_NOT_READY']:raise
   if n==19:raise RuntimeError('FIXED_NODE_START_UNCONFIRMED')
   time.sleep(1)
def private_backup():
 root=Path('/var/lib/jarvis-control/autonomy-r22');parent_chain(root);safe(root,True,0,True)
 folder=root/('fixed-validator-r22-3-'+p['operationId']);return folder
def read_state(folder):
 safe(folder,True,0,True);target=folder/'state.json';safe(target,owner=0,private=True)
 state=json.loads(target.read_bytes());need(state.get('operationId')==p['operationId'],'FIXED_BACKUP_OPERATION_CHANGED');return state
def write_private(path,data):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
try:
 need(os.geteuid()==0,'FIXED_ROOT_REQUIRED');account=pwd.getpwnam('superopen');config=Path(p['config']);parent_chain(config.parent)
 s=safe(config,owner=account.pw_uid,private=True);raw=config.read_bytes();cfg=json.loads(raw)
 need(cfg.get('agentId')==p['agent'] and cfg.get('machineId')==p['machine'] and cfg.get('privateKey') and cfg.get('publicKey'),'FIXED_PAIRING_IDENTITY_CHANGED')
 spool=config.parent/('.delivery-'+p['agent']);db=spool/'journal.sqlite';templates=cfg.get('templates',[])
 need(isinstance(templates,list) and len({t['id'] for t in templates})==len(templates),'FIXED_LOCAL_TEMPLATE_IDS_INVALID')
 indexed={t['id']:t for t in templates}
 for t in p['original18']:need(t['id'] in indexed and canonical(indexed[t['id']])==canonical(t),'FIXED_LOCAL_ORIGINAL18_CHANGED')
 for t in p['validators']:need(t['id'] not in indexed or canonical(indexed[t['id']])==canonical(t),'FIXED_LOCAL_VALIDATOR_CONFLICT')
 bundle=Path('/opt/jarvis-development/software-factory/jarvis-node.mjs');parent_chain(bundle.parent);safe(bundle,owner=0)
 need(hashlib.sha256(bundle.read_bytes()).hexdigest()==p['bundleSha256'],'FIXED_NODE_BUNDLE_NOT_EXPECTED_PACKAGE')
 non_templates={k:v for k,v in cfg.items() if k!='templates'}
 snapshot={'configSHA256':hashlib.sha256(raw).hexdigest(),'nonTemplateSHA256':digest(non_templates),'templateHashes':{t['id']:digest(t) for t in templates},'pairedIdentityPreserved':True,'credentialsExported':False,'unit':unit()}
 action=p['action'];folder=private_backup()
 if action=='inspect':
  snapshot['journal']=journal(snapshot['unit'],True)
  print(json.dumps({'ok':True,**snapshot}))
 elif action=='prepare-stop':
  need(snapshot['configSHA256']==p['expectedConfigSHA256'],'FIXED_CONFIG_CAS_CONFLICT')
  need(snapshot['unit']['MainPID']==p['expectedMainPID'],'FIXED_MAIN_PID_CHANGED');journal(snapshot['unit'],True)
  folder.mkdir(mode=0o700,exist_ok=False);safe(folder,True,0,True)
  write_private(folder/'config-before.json',raw)
  state={'operationId':p['operationId'],'oldSHA256':snapshot['configSHA256'],'oldNonTemplateSHA256':snapshot['nonTemplateSHA256'],'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'originalTemplateIds':[t['id'] for t in templates]}
  write_private(folder/'state.json',canonical(state).encode())
  subprocess.run(['/usr/bin/systemctl','stop',p['unit']],check=True,capture_output=True,timeout=20)
  need(config.read_bytes()==raw,'FIXED_CONFIG_CHANGED_DURING_STOP');u=check_stopped()
  print(json.dumps({'ok':True,'stopped':True,'privateBackupRemoteOnly':True,'configSHA256':snapshot['configSHA256'],'unit':u,'modelCalls':0}))
 elif action=='install':
  state=read_state(folder);check_stopped();need(snapshot['configSHA256']==state['oldSHA256']==p['expectedConfigSHA256'],'FIXED_CONFIG_CAS_CONFLICT')
  new=dict(cfg);new['templates']=templates+[t for t in p['validators'] if t['id'] not in indexed]
  data=canonical(new).encode();write_private(folder/'config-expected-after.json',data)
  atomic(data,state['uid'],state['gid'],state['mode']);need(config.read_bytes()==data,'FIXED_CONFIG_WRITE_READBACK_FAILED')
  need(digest({k:v for k,v in new.items() if k!='templates'})==state['oldNonTemplateSHA256'],'FIXED_PRIVATE_FIELDS_CHANGED')
  print(json.dumps({'ok':True,'installed':True,'configSHA256':hashlib.sha256(data).hexdigest(),'addedIds':[t['id'] for t in p['validators'] if t['id'] not in indexed],'nonTemplateSHA256':state['oldNonTemplateSHA256'],'old18Unchanged':True,'pairedIdentityPreserved':True,'nodeStillStopped':True}))
 elif action=='start-verify':
  state=read_state(folder);after=folder/'config-expected-after.json';safe(after,owner=0,private=True)
  expected=after.read_bytes();need(config.read_bytes()==expected,'FIXED_AFTER_CONFIG_CAS_CONFLICT');verified=startup()
  actual=config.read_bytes();need(digest(json.loads(actual))==digest(json.loads(expected)),'FIXED_CONFIG_CHANGED_ON_START')
  print(json.dumps({'ok':True,'started':True,'configSHA256':hashlib.sha256(actual).hexdigest(),'configSemanticSHA256':digest(json.loads(actual)),'startupSerializationChangedOnly':actual!=expected,**verified,'pairedIdentityPreserved':True,'old18Unchanged':True,'modelCalls':0}))
 elif action=='rollback':
  state=read_state(folder);before=folder/'config-before.json';safe(before,owner=0,private=True);old=before.read_bytes()
  need(hashlib.sha256(old).hexdigest()==state['oldSHA256'],'FIXED_BACKUP_HASH_MISMATCH')
  expected=folder/'config-expected-after.json';allowed=[old]
  if expected.exists():safe(expected,owner=0,private=True);allowed.append(expected.read_bytes())
  need(any(digest(cfg)==digest(json.loads(body)) for body in allowed),'FIXED_ROLLBACK_CONFIG_CAS_CONFLICT')
  u=unit()
  if u.get('ActiveState')=='active':
   journal(u,True);subprocess.run(['/usr/bin/systemctl','stop',p['unit']],check=True,capture_output=True,timeout=20)
  check_stopped();need(config.read_bytes()==raw,'FIXED_ROLLBACK_CONFIG_CHANGED_DURING_STOP');atomic(old,state['uid'],state['gid'],state['mode']);verified=startup()
  restored=config.read_bytes();need(digest(json.loads(restored))==digest(json.loads(old)),'FIXED_ROLLBACK_HASH_NOT_CONFIRMED')
  print(json.dumps({'ok':True,'configRestored':True,'configSHA256':hashlib.sha256(restored).hexdigest(),'configSemanticSHA256':digest(json.loads(restored)),'startupSerializationChangedOnly':restored!=old,**verified,'pairedIdentityPreserved':True,'modelCalls':0}))
 else:raise RuntimeError('FIXED_ACTION_INVALID')
except Exception as error:
 code=str(error) if isinstance(error,RuntimeError) and re.fullmatch('FIXED_[A-Z0-9_]+',str(error)) else 'FIXED_REMOTE_OPERATION_FAILED'
 print(json.dumps({'ok':False,'errorCode':code,'requiresReconciliation':True,'credentialsExported':False}))
`;

await mkdir(DIRECTORY,{recursive:true});
const reportPath=DIRECTORY+'/fixed-validator-executors'+(attempt===1?'':'-attempt-'+attempt)+'.json';
const report={schemaVersion:1,kind:'project-autonomy-fixed-validator-installation',at:new Date().toISOString(),release:RELEASE,execute,operationId:randomUUID(),status:'preflight',templates:[],modelCalls:0,credentialsExported:false,globalSupervisionChanged:false,pairingChanged:false,capabilityAuthorizationChanged:false,productAccepted:false,queueSnapshotNotAdmissionBarrier:true};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const persist=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
const invoke=(payload,action)=>JSON.parse(remote(lanProfile,'jarvis-101',python({...payload,action},nodeCode),true,{timeoutMs:120000}));
try{
 await withPlatform(async({api})=>{
  const health=await api('/api/health');if(health.build!==RELEASE)fail('FIXED_EXPECTED_RELEASE_MISSING');
  const supervision=(await api('/api/v1/execution/supervision')).data;if(supervision.supervised!==false)fail('FIXED_GLOBAL_SUPERVISION_NOT_DISABLED');
  const central=(await api('/api/v1/execution/config')).data;
  if(!Array.isArray(central.templates)||new Set(central.templates.map(t=>t.id)).size!==central.templates.length)fail('FIXED_CENTRAL_TEMPLATE_IDS_INVALID');
  const original18=[];
  for(const phase of phases)for(const role of ['worker','reviewer']){
   const t=central.templates.find(t=>t.id===phaseId(phase,role));
   if(!t||t.machineId!==MACHINE||t.engine!=='claude'||t.supervision?.billing!=='record-only'||!t.validation||t.args?.some(a=>a==='--max-budget-usd'||a.startsWith('--max-budget-usd=')))fail('FIXED_RECORD_ONLY_ORIGINAL18_INVALID');
   const args=t.args??[];if(args.filter(a=>a==='--model').length!==1||args[args.indexOf('--model')+1]!=='gpt-6.1-sol[1m]')fail('FIXED_ORIGINAL_STRONG_MODEL_CHANGED');
   original18.push(t);
  }
  const validators=phases.map(phase=>{
   const worker=original18.find(t=>t.id===phaseId(phase,'worker')),v=structuredClone(worker.validation),args=v.args??[];
   if(v.program!=='/usr/bin/sudo'||args.length!==6||args[0]!=='-n'||args[1]!=='/usr/local/libexec/jarvis-project-autonomy-validation'||args[2]!=='{workspace}'||args[3]!=='{runId}'||args[4]!==phase||!/^[a-f0-9]{64}$/.test(args[5])||v.timeoutSec!==3600)fail('FIXED_WORKER_VALIDATION_NOT_PROTECTED');
   if(sha(original18.find(t=>t.id===phaseId(phase,'reviewer')).validation)!==sha(v))fail('FIXED_REVIEWER_VALIDATION_MISMATCH');
   return {id:phaseId(phase,'validator'),machineId:MACHINE,engine:'fixed',purpose:'project-autonomy-validation',program:'/usr/bin/true',args:[],workspaceRoot:worker.workspaceRoot,maxRounds:1,timeoutSec:3600,leaseSec:60,budgetCurrency:'USD',validation:v};
  });
  for(const t of validators){const old=central.templates.find(o=>o.id===t.id);if(old&&sha(old)!==sha(t))fail('FIXED_CENTRAL_VALIDATOR_CONFLICT');}
  const packageManifest=JSON.parse(await readFile('artifacts/development-node/package/SHA256.json','utf8'));
  const manifestNode=packageManifest.filter(x=>x.file==='jarvis-node.mjs');if(manifestNode.length!==1)fail('FIXED_NODE_PACKAGE_MANIFEST_INVALID');
  const bundle=await readFile('artifacts/development-node/package/jarvis-node.mjs');const bundleSha256=createHash('sha256').update(bundle).digest('hex');
  if(bundleSha256!==manifestNode[0].sha256||!bundle.includes(Buffer.from('project-autonomy-validation')))fail('FIXED_NODE_PACKAGE_NOT_FIXED_CAPABLE');
  const payload={agent:AGENT,machine:MACHINE,unit:UNIT,config:CONFIG,operationId:report.operationId,original18,validators,bundleSha256};
  report.templates=validators;report.original18Hashes=original18.map(t=>({id:t.id,sha256:sha(t)}));report.centralBefore={revision:central.revision,projectionSHA256:sha(projection(central)),templateCount:central.templates.length};
  report.queueBefore=queue();if(report.queueBefore.allActive!==0)fail('FIXED_CENTRAL_QUEUE_NOT_IDLE');
  const before=invoke(payload,'inspect');report.nodeBefore=before;await persist();if(!before.ok)fail(before.errorCode);
  payload.expectedConfigSHA256=before.configSHA256;payload.expectedMainPID=before.unit.MainPID;
  const centralAddedIds=validators.filter(t=>!central.templates.some(o=>o.id===t.id)).map(t=>t.id);
  const localAddedIds=validators.filter(t=>!Object.hasOwn(before.templateHashes,t.id)).map(t=>t.id);
  if(central.templates.length+centralAddedIds.length>100)fail('FIXED_CENTRAL_TEMPLATE_LIMIT');
  const initialAgents=(await api('/api/v1/execution/agents')).data;const initialAgent=(initialAgents.items??initialAgents).find(a=>a.id===AGENT);
  if(!initialAgent||initialAgent.machineId!==MACHINE||initialAgent.revoked)fail('FIXED_PAIRED_AGENT_NOT_AVAILABLE');
  report.validatorCapabilitiesPending=validators.map(t=>t.id).filter(id=>!initialAgent.capabilities?.includes(id));
  report.plannedAddedIds={central:centralAddedIds,node:localAddedIds};
  if(!execute){report.status='ready-not-executed';report.ready=true;await persist();return;}
  if(!centralAddedIds.length&&!localAddedIds.length){report.status='already-consistent';report.configured=true;report.rollback={needed:false};await persist();return;}
  let stopAttempted=false,centralAttempted=false,centralConfirmed=false;
  const desired={templates:[...central.templates,...validators.filter(t=>centralAddedIds.includes(t.id))],probes:central.probes??[],wol:central.wol??[]};
  try{
   report.status='node-stop-intent';await persist();stopAttempted=true;
   report.nodeStop=invoke(payload,'prepare-stop');await persist();if(!report.nodeStop.ok)fail(report.nodeStop.errorCode);
   report.queueAfterStop=queue();if(report.queueAfterStop.allActive!==0)fail('FIXED_QUEUE_CHANGED_AFTER_STOP');
   const current=(await api('/api/v1/execution/config')).data;
   if(current.revision!==central.revision||sha(projection(current))!==sha(projection(central)))fail('FIXED_CENTRAL_CAS_CONFLICT');
   if((await api('/api/v1/execution/supervision')).data.supervised!==false)fail('FIXED_SUPERVISION_CHANGED_DURING_INSTALL');
   report.status='node-config-write-intent';await persist();report.nodeInstall=invoke(payload,'install');await persist();if(!report.nodeInstall.ok)fail(report.nodeInstall.errorCode);
   report.status='central-put-intent';await persist();centralAttempted=true;
   try{await api('/api/v1/execution/config',{expectedVersion:central.revision,...desired},'PUT');}
   catch{report.centralResponseLostOrRejected=true;await persist();}
   const readback=(await api('/api/v1/execution/config')).data;
   if(sha(projection(readback))!==sha(desired))fail('FIXED_CENTRAL_WRITE_NOT_CONFIRMED');
   centralConfirmed=true;report.centralAfter={revision:readback.revision,projectionSHA256:sha(projection(readback)),validatorHashes:validators.map(t=>({id:t.id,sha256:sha(readback.templates.find(o=>o.id===t.id))}))};
   report.status='node-start-intent';await persist();report.nodeStart=invoke(payload,'start-verify');await persist();if(!report.nodeStart.ok)fail(report.nodeStart.errorCode);
   const nodeReadback=invoke(payload,'inspect');report.nodeReadback=nodeReadback;await persist();if(!nodeReadback.ok)fail(nodeReadback.errorCode);
   if(nodeReadback.nonTemplateSHA256!==before.nonTemplateSHA256||original18.some(t=>nodeReadback.templateHashes[t.id]!==sha(t))||validators.some(t=>nodeReadback.templateHashes[t.id]!==sha(t)))fail('FIXED_NODE_FINAL_READBACK_CHANGED');
   for(const [id,hash] of Object.entries(before.templateHashes))if(nodeReadback.templateHashes[id]!==hash)fail('FIXED_OTHER_NODE_TEMPLATE_CHANGED');
   const final=(await api('/api/v1/execution/config')).data;if(sha(projection(final))!==sha(desired))fail('FIXED_CENTRAL_FINAL_READBACK_CHANGED');
   report.queueAfter=queue();if(report.queueAfter.allActive!==0)fail('FIXED_TASK_ARRIVED_AFTER_START');
   report.globalSupervision=(await api('/api/v1/execution/supervision')).data.supervised;if(report.globalSupervision!==false)fail('FIXED_GLOBAL_SUPERVISION_CHANGED');
   const agents=(await api('/api/v1/execution/agents')).data;const list=agents.items??agents;const agent=list.find(a=>a.id===AGENT);
   report.validatorCapabilitiesPending=validators.map(t=>t.id).filter(id=>!agent?.capabilities?.includes(id));
   report.status='verified';report.configured=true;report.rollback={needed:false};report.pairedIdentityPreserved=true;report.old18Unchanged=true;report.otherCentralConfigurationUnchanged=true;
   await persist();
  }catch(error){
   report.failureCode=/^FIXED_[A-Z0-9_]+$/.test(error.message)?error.message:'FIXED_TRANSPORT_OR_READBACK_FAILED';report.status='failed-or-uncertain';await persist();
   let centralSafe=!centralAttempted;
   try{
    const current=(await api('/api/v1/execution/config')).data;
    if(sha(projection(current))===sha(projection(central))){centralSafe=true;report.centralRollback={needed:false,originalProjectionConfirmed:true};}
    else if(centralAttempted&&centralAddedIds.every(id=>{const found=current.templates.find(t=>t.id===id);return found&&sha(found)===sha(validators.find(t=>t.id===id));})){
     if(queue().allActive!==0)fail('FIXED_ROLLBACK_QUEUE_NOT_IDLE');
     const templates=current.templates.filter(t=>!centralAddedIds.includes(t.id));
     await api('/api/v1/execution/config',{expectedVersion:current.revision,templates,probes:current.probes??[],wol:current.wol??[]},'PUT');
     const restored=(await api('/api/v1/execution/config')).data;
     centralSafe=sha(projection(restored))===sha({templates,probes:current.probes??[],wol:current.wol??[]});
     report.centralRollback={attempted:true,removedOnlyAddedIds:centralAddedIds,preservedConcurrentOtherChanges:true,verified:centralSafe};
    }else{report.centralRollback={verified:false,requiresReconciliation:true,code:'FIXED_CENTRAL_ROLLBACK_CAS_CONFLICT'};centralSafe=false;}
   }catch{report.centralRollback={verified:false,requiresReconciliation:true,code:'FIXED_CENTRAL_RECONCILIATION_UNAVAILABLE'};centralSafe=false;}
   if(stopAttempted&&centralSafe){
    try{if(queue().allActive!==0)fail('FIXED_ROLLBACK_QUEUE_NOT_IDLE');report.nodeRollback=invoke(payload,'rollback');}
    catch{report.nodeRollback={ok:false,requiresReconciliation:true,errorCode:'FIXED_NODE_RECONCILIATION_UNAVAILABLE'};}
   }else if(stopAttempted)report.nodeRollback={ok:false,requiresReconciliation:true,errorCode:'FIXED_CENTRAL_STATE_UNKNOWN_NODE_NOT_AUTO_RESTARTED'};
   report.requiresReconciliation=!centralSafe||stopAttempted&&!report.nodeRollback?.ok;report.centralCommitHadBeenConfirmed=centralConfirmed;await persist();throw Error(report.failureCode);
  }
 });
}catch(error){report.failureCode??=/^FIXED_[A-Z0-9_]+$/.test(error.message)?error.message:'FIXED_MAINTENANCE_FAILED';report.status=report.status==='preflight'?'preflight-failed':report.status;await persist();throw Error(report.failureCode);}
console.log(JSON.stringify({reportPath,execute,status:report.status,configured:report.configured??false,validators:report.templates.length,modelCalls:0,requiresReconciliation:report.requiresReconciliation??false,validatorCapabilitiesPending:report.validatorCapabilitiesPending??[]}));
