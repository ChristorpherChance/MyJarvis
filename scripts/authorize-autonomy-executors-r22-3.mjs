/** Narrow capability grant to the existing signed 101 node. Default preflight only.
 * Installed fixed gates are required; pending complete acceptance producers do not
 * manufacture a pass and do not prevent bounded work packages from being started.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const dir='artifacts/software-factory/autonomy-r22',release='20261011-project-autonomy-r22-3';
const agentId='0b5aea06-47e1-4f4b-a32e-969417915c9c',machineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
const execute=process.argv.includes('--execute');
const attempt=Number(process.env.JARVIS_EXECUTOR_AUTH_ATTEMPT??1);if(!Number.isInteger(attempt)||attempt<1||attempt>20)throw Error('AUTHORIZATION_ATTEMPT_INVALID');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(canonical(v)).digest('hex');
const bytesSha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error(code)};
const phases=Array.from({length:9},(_,i)=>'FA-'+String(i+1).padStart(2,'0'));
const ids=phases.flatMap(phase=>['worker','reviewer','validator'].map(role=>'msf-autonomy-'+phase.toLowerCase()+'-'+role));
const old4=['msf-101-claude','telemetry','msf-autonomy-fa-01-worker','msf-autonomy-fa-01-reviewer'];
const readinessBytes=await readFile(dir+'/execution-readiness-r22-3.json'),readiness=JSON.parse(readinessBytes);
const intentBytes=await readFile(dir+'/fixed-validator-executors.json'),intent=JSON.parse(intentBytes);
let proof=intent,proofPath=dir+'/fixed-validator-executors.json',proofBytes=intentBytes;
if(intent.status!=='verified'||intent.configured!==true){
 proofPath=dir+'/fixed-validator-executors-reconciliation.json';proofBytes=await readFile(proofPath);proof=JSON.parse(proofBytes);
 if(!proof.sourceEvidence?.some(e=>e.path===dir+'/fixed-validator-executors.json'&&e.sha256===bytesSha(intentBytes)))fail('AUTHORIZATION_RECONCILIATION_NOT_BOUND_TO_INTENT');
}
if(readiness.release!==release||readiness.allPhaseFixedChecksReady!==true||typeof readiness.completePhaseAcceptanceProducersReady!=='boolean'||readiness.globalSupervision!==false||readiness.costPolicy!=='record-only'||!/^[a-f0-9]{64}$/.test(readiness.goalSpecHash))fail('AUTHORIZATION_FIXED_CHECK_READINESS_MISSING');
if(proof.release!==release||proof.status!=='verified'||proof.configured!==true||proof.templates?.length!==9||proof.modelCalls!==0)fail('AUTHORIZATION_FIXED_TEMPLATE_INSTALL_NOT_VERIFIED');
if(!Array.isArray(readiness.policies)||readiness.policies.length!==9||new Set(readiness.policies.map(p=>p.workPackage)).size!==9||phases.some(phase=>!readiness.policies.some(p=>p.workPackage===phase)))fail('AUTHORIZATION_PHASE_POLICY_DENOMINATOR_INVALID');
for(const p of readiness.policies)if(!/^[a-f0-9]{64}$/.test(p.sha256)||!Array.isArray(p.expectedChecks)||!p.expectedChecks.length||new Set(p.expectedChecks).size!==p.expectedChecks.length||p.expectedChecks.some(id=>typeof id!=='string'||!id))fail('AUTHORIZATION_PHASE_POLICY_IDENTITY_INVALID');
const expectedHashes=readiness.central?.templates;
if(!Array.isArray(expectedHashes)||expectedHashes.length!==27||new Set(expectedHashes.map(t=>t.id)).size!==27||ids.some(id=>!expectedHashes.some(t=>t.id===id&&/^[a-f0-9]{64}$/.test(t.sha256))))fail('AUTHORIZATION_FROZEN_TEMPLATE_DENOMINATOR_INVALID');
if(!readiness.node?.pairedIdentityPreserved||!Array.isArray(readiness.node.templateHashes)||expectedHashes.some(t=>!readiness.node.templateHashes.some(n=>n.id===t.id&&n.sha256===t.sha256)))fail('AUTHORIZATION_NODE_CENTRAL_TEMPLATE_MISMATCH');
for(const t of proof.templates)if(!expectedHashes.some(h=>h.id===t.id&&h.sha256===sha(t)))fail('AUTHORIZATION_INSTALL_READINESS_MISMATCH');

const code=String.raw`import sqlite3,os,stat,hashlib,datetime,re
from pathlib import Path
def need(ok,code):
 if not ok:raise RuntimeError(code)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
def trusted(q,directory=False,private=False):
 s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)) and s.st_uid==0 and not s.st_mode&(0o077 if private else 0o022),'AUTHORIZATION_PRIVATE_PATH_UNSAFE')
 if not directory:need(s.st_nlink==1,'AUTHORIZATION_PRIVATE_FILE_LINK_UNSAFE')
def read_config(c,key,default):
 row=c.execute('SELECT json FROM execution_config WHERE key=?',(key,)).fetchone();return json.loads(row[0]) if row else default
c=None
try:
 need(os.geteuid()==0,'AUTHORIZATION_ROOT_REQUIRED')
 db='/var/lib/jarvis/data/execution/execution.sqlite'
 c=sqlite3.connect(db if p['execute'] else 'file:'+db+'?mode=ro',uri=not p['execute'],timeout=10);c.row_factory=sqlite3.Row
 c.execute('BEGIN IMMEDIATE' if p['execute'] else 'BEGIN')
 need(read_config(c,'revision',0)==p['expectedRevision'],'AUTHORIZATION_CONFIG_REVISION_CAS_CONFLICT')
 config={'templates':read_config(c,'templates',[]),'probes':read_config(c,'probes',[]),'wol':read_config(c,'wol',[])}
 need(digest(config)==p['expectedConfigSHA256'],'AUTHORIZATION_CONFIG_HASH_CAS_CONFLICT')
 need(c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN('queued','running')").fetchone()[0]==0,'AUTHORIZATION_QUEUE_NOT_IDLE')
 row=c.execute('SELECT * FROM execution_agents WHERE id=?',(p['agentId'],)).fetchone()
 need(row and row['machine_id']==p['machineId'] and not row['revoked'],'AUTHORIZATION_AGENT_IDENTITY_CHANGED')
 old=json.loads(row['capabilities']);need(isinstance(old,list) and len(set(old))==len(old),'AUTHORIZATION_OLD_CAPABILITIES_INVALID')
 need(all(i in old for i in p['old4']) and all(i in p['allowed'] for i in old),'AUTHORIZATION_OLD_SCOPE_CHANGED')
 need(set(old)==set(p['expectedCapabilities']),'AUTHORIZATION_CAPABILITIES_CAS_CONFLICT')
 added=[i for i in p['ids'] if i not in old];new=old+added
 need(len(new)==29 and set(new)==set(p['allowed']),'AUTHORIZATION_NEW_SCOPE_INVALID')
 pair_hash=hashlib.sha256((row['machine_id']+'\n'+row['public_key']+'\n'+row['paired_at']).encode()).hexdigest()
 if p['execute'] and added:
  root=Path('/var/lib/jarvis-control/autonomy-r22')
  for q in [root,*root.parents]:trusted(q,True,private=q==root)
  target=root/'capabilities-before-r22-3-all.json'
  backup={'schemaVersion':1,'release':p['release'],'agentId':p['agentId'],'machineId':p['machineId'],'before':old,'after':new,'pairingSHA256':pair_hash,'configRevision':p['expectedRevision'],'configSHA256':p['expectedConfigSHA256'],'readinessSHA256':p['readinessSHA256']}
  if target.exists() or target.is_symlink():
   trusted(target,private=True);need(json.loads(target.read_bytes())==backup,'AUTHORIZATION_EXISTING_BACKUP_CONFLICT')
  else:
   fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb') as f:f.write(canonical(backup).encode());f.flush();os.fsync(f.fileno())
  updated=c.execute('UPDATE execution_agents SET capabilities=? WHERE id=? AND machine_id=? AND public_key=? AND paired_at=? AND capabilities=? AND revoked=0',(json.dumps(new),p['agentId'],p['machineId'],row['public_key'],row['paired_at'],row['capabilities']))
  need(updated.rowcount==1,'AUTHORIZATION_UPDATE_CAS_FAILED')
 after=c.execute('SELECT machine_id,public_key,paired_at,capabilities,revoked FROM execution_agents WHERE id=?',(p['agentId'],)).fetchone()
 need(after['machine_id']==row['machine_id'] and after['public_key']==row['public_key'] and after['paired_at']==row['paired_at'] and after['revoked']==row['revoked'],'AUTHORIZATION_PAIRING_CHANGED')
 c.commit()
 print(json.dumps({'ok':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'execute':p['execute'],'agentId':p['agentId'],'machineId':p['machineId'],'added':added,'beforeCapabilities':old,'capabilities':new if p['execute'] else old,'plannedCapabilities':new,'pairedIdentityPreserved':True,'privateKeyChanged':False,'globalSupervisionChanged':False,'configUnchanged':True,'privateBackupRemoteOnly':bool(p['execute'] and added),'modelCalls':0}))
except Exception as error:
 if c:c.rollback()
 code=str(error) if isinstance(error,RuntimeError) and re.fullmatch('AUTHORIZATION_[A-Z0-9_]+',str(error)) else 'AUTHORIZATION_REMOTE_OPERATION_FAILED'
 print(json.dumps({'ok':False,'errorCode':code,'requiresReconciliation':True,'credentialsExported':False}))
finally:
 if c:c.close()
`;
const reportPath=dir+'/executor-authorization-r22-3-all'+(execute?'':'-preflight')+(attempt===1?'':'-attempt-'+attempt)+'.json';
const report={schemaVersion:1,kind:'project-autonomy-executor-authorization',at:new Date().toISOString(),release,execute,status:'preflight',agentId,machineId,ids,old4,sourceEvidence:[{path:dir+'/execution-readiness-r22-3.json',sha256:bytesSha(readinessBytes)},{path:dir+'/fixed-validator-executors.json',sha256:bytesSha(intentBytes)},{path:proofPath,sha256:bytesSha(proofBytes)}],allPhaseFixedChecksReady:true,completePhaseAcceptanceProducersReady:readiness.completePhaseAcceptanceProducersReady,modelCalls:0,productAccepted:false,globalSupervisionChanged:false,pairingChanged:false};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});const save=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
try{await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release||(await api('/api/v1/execution/supervision')).data.supervised!==false)fail('AUTHORIZATION_PLATFORM_STATE_CHANGED');
 const central=(await api('/api/v1/execution/config')).data;
 if(central.revision!==readiness.central.revision)fail('AUTHORIZATION_READINESS_CONFIG_REVISION_CHANGED');
 for(const phase of phases){
  const ts=['worker','reviewer','validator'].map(role=>central.templates.find(t=>t.id==='msf-autonomy-'+phase.toLowerCase()+'-'+role));
  if(ts.some(t=>!t||t.machineId!==machineId||!expectedHashes.some(h=>h.id===t.id&&h.sha256===sha(t))))fail('AUTHORIZATION_LIVE_TEMPLATE_HASH_CHANGED');
  const [worker,reviewer,validator]=ts,v=worker.validation,args=v?.args??[];
  if(v?.program!=='/usr/bin/sudo'||sha(args)!==sha(['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}',phase,readiness.goalSpecHash])||v.timeoutSec!==3600||sha(reviewer.validation)!==sha(v)||sha(validator.validation)!==sha(v))fail('AUTHORIZATION_PROTECTED_FIXED_GATE_CHANGED');
  if(validator.engine!=='fixed'||validator.purpose!=='project-autonomy-validation'||validator.program!=='/usr/bin/true'||validator.args?.length!==0||validator.maxRounds!==1||validator.timeoutSec!==3600||validator.leaseSec!==60||validator.budgetCurrency!=='USD'||validator.supervision)fail('AUTHORIZATION_VALIDATOR_NOT_FIXED_ONLY');
  for(const t of [worker,reviewer]){const args=t.args??[];if(t.engine!=='claude'||t.supervision?.billing!=='record-only'||args.filter(a=>a==='--model').length!==1||args[args.indexOf('--model')+1]!=='gpt-6.1-sol[1m]'||args.some(a=>a==='--max-budget-usd'||a.startsWith('--max-budget-usd=')))fail('AUTHORIZATION_STRONG_RECORD_ONLY_TEMPLATE_CHANGED');}
  const r=reviewer.args??[];if(r.filter(a=>a==='--tools').length!==1||r.filter(a=>a==='--allowedTools').length!==1||r[r.indexOf('--tools')+1]!=='Read,Glob,Grep'||r[r.indexOf('--allowedTools')+1]!=='Read,Glob,Grep'||r.some(a=>a.startsWith('--tools=')||a.startsWith('--allowedTools=')))fail('AUTHORIZATION_REVIEWER_NOT_READ_ONLY');
 }
 const agents=(await api('/api/v1/execution/agents')).data;const paired=(agents.items??agents).find(a=>a.id===agentId);
 if(!paired||paired.machineId!==machineId||paired.revoked||paired.status!=='online')fail('AUTHORIZATION_PAIRED_NODE_NOT_ONLINE');
 const allowed=[...new Set([...old4,...ids])];if(old4.some(id=>!paired.capabilities.includes(id))||paired.capabilities.some(id=>!allowed.includes(id)))fail('AUTHORIZATION_PAIRED_CAPABILITY_SCOPE_CHANGED');
 const payload={release,execute,ids,old4,allowed,agentId,machineId,expectedCapabilities:paired.capabilities,expectedRevision:central.revision,expectedConfigSHA256:sha({templates:central.templates,probes:central.probes??[],wol:central.wol??[]}),readinessSHA256:bytesSha(readinessBytes)};
 report.centralBefore={revision:central.revision,configurationSHA256:payload.expectedConfigSHA256};report.beforeCapabilities=paired.capabilities;report.status=execute?'capability-grant-intent':'preflight-inspect';await save();
 try{report.remote=JSON.parse(remote(lanProfile,'jarvis-112',python(payload,code),true));}
 catch{report.transportUncertain=true;report.status='unconfirmed-remote-result';await save();}
 if(report.remote&&!report.remote.ok)fail(report.remote.errorCode);
 if(!execute){report.status='ready-not-executed';report.ready=report.remote?.ok===true;await save();return;}
 const readAgents=(await api('/api/v1/execution/agents')).data;const readback=(readAgents.items??readAgents).find(a=>a.id===agentId);
 if(!readback||readback.machineId!==machineId||readback.revoked||readback.status!=='online'||readback.capabilities.length!==29||allowed.some(id=>!readback.capabilities.includes(id)))fail('AUTHORIZATION_CAPABILITY_READBACK_FAILED');
 const caps=(await api('/api/v1/execution/capabilities')).data;const ready=caps.configuredTemplates.filter(t=>ids.includes(t.id));
 if(ready.length!==27||new Set(ready.map(t=>t.id)).size!==27||ready.some(t=>t.machineId!==machineId||!t.ready))fail('AUTHORIZATION_TEMPLATE_READBACK_NOT_READY');
 const final=(await api('/api/v1/execution/config')).data;if(final.revision!==central.revision||sha({templates:final.templates,probes:final.probes??[],wol:final.wol??[]})!==payload.expectedConfigSHA256)fail('AUTHORIZATION_CONFIG_CHANGED_AFTER_GRANT');
 if((await api('/api/v1/execution/supervision')).data.supervised!==false)fail('AUTHORIZATION_GLOBAL_SUPERVISION_CHANGED');
 report.status='verified';report.authorized=true;report.added=ids.filter(id=>!paired.capabilities.includes(id));report.capabilities=readback.capabilities;report.readback=ready;report.pairedIdentityPreserved=true;report.configUnchanged=true;report.signedNodeOnline=readback.status==='online';await save();
});}catch(error){report.failureCode=/^AUTHORIZATION_[A-Z0-9_]+$/.test(error.message)?error.message:'AUTHORIZATION_MAINTENANCE_OR_READBACK_FAILED';report.status='failed-or-uncertain';report.requiresReconciliation=execute;await save();throw Error(report.failureCode);}
console.log(JSON.stringify({reportPath,execute,status:report.status,authorized:report.authorized??false,templates:27,capabilities:report.capabilities?.length??null,modelCalls:0,completePhaseAcceptanceProducersReady:report.completePhaseAcceptanceProducersReady,productAccepted:false}));
