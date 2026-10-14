/** Repair the proven serialization-only R22-3 installation interruption.
 * Node configuration, pairing, service and data are read-only. Only the exact nine
 * central templates from the preserved install intent may be re-added.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,primary,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const directory='artifacts/software-factory/autonomy-r22',release='20261011-project-autonomy-r22-3';
const execute=process.argv.includes('--execute');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(canonical(v)).digest('hex');
const fileSha=b=>createHash('sha256').update(b).digest('hex');
const projection=c=>({templates:c.templates,probes:c.probes??[],wol:c.wol??[]});
const fail=code=>{throw Error(code)};
const installBytes=await readFile(directory+'/fixed-validator-executors.json'),install=JSON.parse(installBytes);
const diagnosisBytes=await readFile(directory+'/fixed-validator-normalization-diagnosis.json'),diagnosis=JSON.parse(diagnosisBytes);
if(install.release!==release||install.failureCode!=='FIXED_CONFIG_CHANGED_ON_START'||!install.centralRollback?.verified||!diagnosis.rawSerializationChangedOnly||!diagnosis.actualAndExpectedSemanticallyEqual||diagnosis.actualVsExpectedChangedPaths.length||!diagnosis.validatorHashesMatch||!diagnosis.pairingAndAPIFieldsPreserved)fail('FIXED_RECONCILE_SCOPE_NOT_PROVEN');
const validators=install.templates,ids=Array.from({length:9},(_,i)=>'msf-autonomy-fa-'+String(i+1).padStart(2,'0')+'-validator');
if(validators.length!==9||new Set(validators.map(t=>t.id)).size!==9||ids.some(id=>!validators.some(t=>t.id===id))||sha([...install.plannedAddedIds.central].sort())!==sha([...ids].sort()))fail('FIXED_RECONCILE_TEMPLATE_SCOPE_INVALID');
const queue=()=>JSON.parse(primary(String.raw`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:print(json.dumps({'allActive':c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN ('queued','running')").fetchone()[0],'fullTable':True}))
finally:c.close()
`));
const nodeProof=()=>JSON.parse(remote(lanProfile,'jarvis-101',python({operationId:install.operationId,expectedSemantic:diagnosis.hashes.actual.semanticSHA256,expectedNonTemplate:diagnosis.hashes.actual.nonTemplateSHA256,expectedMainPID:diagnosis.unit.MainPID,validators,original18:install.original18Hashes},String.raw`import os,stat,hashlib,subprocess,sqlite3,pwd,re
from pathlib import Path
def need(ok,code):
 if not ok:raise RuntimeError(code)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
def safe(q,directory=False,owner=0,private=False):
 s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)) and s.st_uid==owner and not s.st_mode&(0o077 if private else 0o022),'FIXED_RECONCILE_PATH_UNSAFE')
 if not directory:need(s.st_nlink==1,'FIXED_RECONCILE_LINK_UNSAFE')
try:
 need(os.geteuid()==0,'FIXED_RECONCILE_ROOT_REQUIRED');uid=pwd.getpwnam('superopen').pw_uid;config=Path('/var/lib/jarvis-development/101/config.json')
 for q in [config.parent,*config.parent.parents]:safe(q,True)
 safe(config,owner=uid,private=True);raw=config.read_bytes();cfg=json.loads(raw)
 need(cfg.get('agentId')=='0b5aea06-47e1-4f4b-a32e-969417915c9c' and cfg.get('machineId')=='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73','FIXED_RECONCILE_IDENTITY_CHANGED')
 folder=Path('/var/lib/jarvis-control/autonomy-r22')/('fixed-validator-r22-3-'+p['operationId'])
 for q in [folder,*folder.parents]:safe(q,True,private=q==folder)
 expectedPath=folder/'config-expected-after.json';safe(expectedPath,private=True);expected=json.loads(expectedPath.read_bytes())
 need(sha(cfg)==sha(expected)==p['expectedSemantic'],'FIXED_RECONCILE_SEMANTIC_CONFIG_CHANGED')
 need(sha({k:v for k,v in cfg.items() if k!='templates'})==p['expectedNonTemplate'],'FIXED_RECONCILE_PRIVATE_FIELDS_CHANGED')
 ts=cfg['templates'];need(len({t['id'] for t in ts})==len(ts),'FIXED_RECONCILE_DUPLICATE_TEMPLATES');hashes={t['id']:sha(t) for t in ts}
 need(all(hashes.get(t['id'])==sha(t) for t in p['validators']) and all(hashes.get(t['id'])==t['sha256'] for t in p['original18']),'FIXED_RECONCILE_TEMPLATE_CHANGED')
 u=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,MainPID,User,ControlGroup'],text=True,timeout=10).splitlines() if '=' in x)
 need(u.get('ActiveState')=='active' and u.get('MainPID')==p['expectedMainPID'] and u.get('User')=='superopen','FIXED_RECONCILE_NODE_NOT_SAME_ACTIVE_PROCESS')
 spool=config.parent/('.delivery-'+cfg['agentId']);safe(spool,True,uid,True);db=spool/'journal.sqlite';safe(db,owner=uid,private=True)
 c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10)
 try:
  need(c.execute('SELECT agent_id,machine_id FROM identity').fetchone()==(cfg['agentId'],cfg['machineId']),'FIXED_RECONCILE_JOURNAL_IDENTITY_CHANGED')
  owner=c.execute('SELECT pid,process_identity FROM process_owner WHERE id=1').fetchone();pid=int(u['MainPID']);body=Path('/proc/'+str(pid)+'/stat').read_text();identity=Path('/proc/sys/kernel/random/boot_id').read_text().strip()+':'+body[body.rfind(')')+2:].split()[19]
  need(owner and owner[0]==pid and owner[1]==identity,'FIXED_RECONCILE_JOURNAL_PROCESS_MISMATCH')
  counts={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]};need(not any(counts.values()),'FIXED_RECONCILE_NODE_NOT_IDLE')
 finally:c.close()
 print(json.dumps({'ok':True,'readOnly':True,'unit':u,'configSHA256':hashlib.sha256(raw).hexdigest(),'configSemanticSHA256':sha(cfg),'nonTemplateSHA256':p['expectedNonTemplate'],'validatorHashes':[{ 'id':t['id'],'sha256':hashes[t['id']]} for t in p['validators']],'old18Unchanged':True,'pairedIdentityPreserved':True,'journal':counts,'nodeRestarted':False,'nodeConfigModified':False,'modelCalls':0,'credentialsExported':False}))
except Exception as error:
 code=str(error) if isinstance(error,RuntimeError) and re.fullmatch('FIXED_[A-Z0-9_]+',str(error)) else 'FIXED_RECONCILE_READBACK_UNAVAILABLE'
 print(json.dumps({'ok':False,'errorCode':code,'readOnly':True,'credentialsExported':False}))
`),true));
const output=directory+'/fixed-validator-executors-reconciliation'+(execute?'':'-preflight')+'.json';
const report={schemaVersion:1,kind:'project-autonomy-fixed-validator-installation-reconciliation',at:new Date().toISOString(),release,execute,status:'preflight',sourceEvidence:[{path:directory+'/fixed-validator-executors.json',sha256:fileSha(installBytes)},{path:directory+'/fixed-validator-normalization-diagnosis.json',sha256:fileSha(diagnosisBytes)}],templates:validators,original18Hashes:install.original18Hashes,nodeRestarted:false,nodeConfigModified:false,pairingChanged:false,globalSupervisionChanged:false,modelCalls:0,credentialsExported:false,productAccepted:false};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
try{await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release||(await api('/api/v1/execution/supervision')).data.supervised!==false)fail('FIXED_RECONCILE_PLATFORM_STATE_CHANGED');
 const current=(await api('/api/v1/execution/config')).data;
 const without={...projection(current),templates:current.templates.filter(t=>!ids.includes(t.id))};
 if(sha(without)!==install.centralBefore.projectionSHA256||install.original18Hashes.some(h=>{const t=current.templates.find(t=>t.id===h.id);return !t||sha(t)!==h.sha256}))fail('FIXED_RECONCILE_CENTRAL_NON_TARGET_CHANGED');
 for(const t of validators){const old=current.templates.find(x=>x.id===t.id);if(old&&sha(old)!==sha(t))fail('FIXED_RECONCILE_CENTRAL_VALIDATOR_CONFLICT');}
 const add=validators.filter(t=>!current.templates.some(x=>x.id===t.id));const desired={...projection(current),templates:[...current.templates,...add]};
 report.centralBefore={revision:current.revision,projectionSHA256:sha(projection(current))};report.queueBefore=queue();if(report.queueBefore.allActive!==0)fail('FIXED_RECONCILE_QUEUE_NOT_IDLE');
 report.nodeBefore=nodeProof();if(!report.nodeBefore.ok)fail(report.nodeBefore.errorCode);report.plannedAddedIds=add.map(t=>t.id);await save();
 if(!execute){report.status='ready-not-executed';report.ready=true;await save();return;}
 let writeAttempted=false;
 try{
  report.status='central-only-write-intent';await save();if(queue().allActive!==0)fail('FIXED_RECONCILE_QUEUE_CHANGED');
  if(add.length){writeAttempted=true;try{await api('/api/v1/execution/config',{expectedVersion:current.revision,...desired},'PUT');}catch{report.responseLostOrRejected=true;await save();}}
  const after=(await api('/api/v1/execution/config')).data;if(sha(projection(after))!==sha(desired))fail('FIXED_RECONCILE_CENTRAL_WRITE_NOT_CONFIRMED');
  report.centralAfter={revision:after.revision,projectionSHA256:sha(projection(after)),validatorHashes:validators.map(t=>({id:t.id,sha256:sha(after.templates.find(x=>x.id===t.id))}))};
  report.nodeAfter=nodeProof();if(!report.nodeAfter.ok)fail(report.nodeAfter.errorCode);
  report.queueAfter=queue();if(report.queueAfter.allActive!==0||(await api('/api/v1/execution/supervision')).data.supervised!==false)fail('FIXED_RECONCILE_POST_STATE_CHANGED');
  report.status='verified';report.configured=true;report.rollback={needed:false};report.serializationOnlyConfirmed=true;await save();
 }catch(error){
  report.failureCode=/^FIXED_[A-Z0-9_]+$/.test(error.message)?error.message:'FIXED_RECONCILE_TRANSPORT_OR_READBACK_FAILED';report.status='failed-or-uncertain';await save();
  if(writeAttempted)try{
   const latest=(await api('/api/v1/execution/config')).data;
   if(sha(projection(latest))===sha(projection(current)))report.rollback={needed:false,originalCentralConfirmed:true};
   else if(sha(projection(latest))===sha(desired)&&queue().allActive===0){await api('/api/v1/execution/config',{expectedVersion:latest.revision,...projection(current)},'PUT');const restored=(await api('/api/v1/execution/config')).data;report.rollback={attempted:true,removedOnlyAddedIds:add.map(t=>t.id),verified:sha(projection(restored))===sha(projection(current))};}
   else report.rollback={verified:false,requiresReconciliation:true,code:'FIXED_RECONCILE_ROLLBACK_CAS_CONFLICT'};
  }catch{report.rollback={verified:false,requiresReconciliation:true,code:'FIXED_RECONCILE_ROLLBACK_UNAVAILABLE'};}
  report.requiresReconciliation=writeAttempted&&!report.rollback?.verified&&!report.rollback?.originalCentralConfirmed;await save();throw Error(report.failureCode);
 }
});}catch(error){report.failureCode??=/^FIXED_[A-Z0-9_]+$/.test(error.message)?error.message:'FIXED_RECONCILE_MAINTENANCE_FAILED';if(report.status==='preflight')report.status='preflight-failed';await save();throw Error(report.failureCode);}
console.log(JSON.stringify({output,execute,status:report.status,configured:report.configured??false,nodeRestarted:false,nodeConfigModified:false,modelCalls:0}));
