/** New bounded worker generation, after real signed-result, queue, process and source reconciliation. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import {withPlatform,remote,lanProfile,primary,python} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',oldTaskId='30d37bfa-6bf5-4ca7-8167-89a5df5be091',oldRunId='111ade66794ad6a5dc7de7318aceb4838449934b';
const agentId='0b5aea06-47e1-4f4b-a32e-969417915c9c',release='20261011-project-autonomy-r22-7';
const dir='artifacts/software-factory/autonomy-r22',journalPath='.jarvis-dev/maintenance/project-autonomy-r22-recovery.json';
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,projectId,oldTaskId,oldRunId};}
if(journal.projectId!==projectId||journal.oldRunId!==oldRunId||journal.oldTaskId!==oldTaskId)throw Error('RECOVERY_JOURNAL_SCOPE_MISMATCH');
const save=async()=>{await mkdir(dirname(journalPath),{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!==release)throw Error('RECOVERY_FIXED_RELEASE_NOT_LIVE');
 let p=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(!journal.intent){
  if(p.status!=='blocked'||p.reason!=='EXECUTION_NEEDS_RECONCILIATION'||p.config.costPolicy!=='record-only')throw Error('RECOVERY_NOT_EXPECTED_TECHNICAL_BLOCK');
  const stage=p.stages.find(s=>s.id==='FA-01');if(stage?.status!=='worker'||stage.taskId!==oldTaskId||stage.runId!==oldRunId||stage.attempt!==1)throw Error('RECOVERY_CURRENT_STAGE_CHANGED');
  const r=(await api(`/api/v1/execution/runs/${oldRunId}`)).data,t=(await api(`/api/v1/tasks/${oldTaskId}`)).data;
  if(r.status!=='cancelled'||r.result?.source!=='signed-agent'||r.result.stopReason?.code!=='HEARTBEAT_FAILED'||r.stopRequested||r.result.lateEvidenceOnly)throw Error('RECOVERY_SIGNED_TECHNICAL_STOP_REQUIRED');
  const node=JSON.parse(remote(lanProfile,'jarvis-101',python({agentId,oldRunId,workspace:p.config.workspace,oldPids:[1216645,1216652]},String.raw`import json,sqlite3,subprocess,datetime,stat
from pathlib import Path
cfg=json.loads(Path('/var/lib/jarvis-development/101/config.json').read_bytes())
if cfg.get('agentId')!=p['agentId']:raise RuntimeError('RECOVERY_NODE_IDENTITY_CHANGED')
unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
pid=int(unit.get('MainPID','0'))
if unit.get('ActiveState')!='active' or pid<=0:raise RuntimeError('RECOVERY_NODE_NOT_ACTIVE')
children=[]
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  parent=int(next(x.split(':',1)[1] for x in (q/'status').read_text().splitlines() if x.startswith('PPid:')))
  if parent==pid:children.append(int(q.name))
 except (FileNotFoundError,PermissionError,StopIteration):pass
if children or any(Path('/proc',str(old)).exists() for old in p['oldPids']):raise RuntimeError('RECOVERY_NATIVE_PROCESSES_NOT_CLEAR')
db=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10)
try:
 old=c.execute('SELECT status,stop_code FROM runs WHERE id=?',(p['oldRunId'],)).fetchone()
 counts={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
 if old!=('acknowledged','HEARTBEAT_FAILED') or any(counts.values()):raise RuntimeError('RECOVERY_NODE_JOURNAL_NOT_RECONCILED')
finally:c.close()
helper=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')
s=helper.lstat()
if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('RECOVERY_FINGERPRINT_HELPER_UNTRUSTED')
def fingerprint():
 v=json.loads(subprocess.check_output(['/usr/bin/python3',str(helper),'fingerprint',p['workspace']],text=True,timeout=90))
 return {k:v[k] for k in ['sha256','files','bytes']}
first=fingerprint();second=fingerprint()
if first!=second:raise RuntimeError('RECOVERY_SOURCE_NOT_STABLE')
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'unitActive':True,'processId':pid,'nativeChildren':0,**counts,'oldResultAcknowledged':True,'sourceFingerprint':first['sha256'],'sourceFiles':first['files'],'sourceBytes':first['bytes'],'readOnly':True,'privateConfigurationExported':False}))
`),true,{timeoutMs:180000}));
  const active=JSON.parse(primary(python({machineId:p.config.machineId},`import json,sqlite3,datetime
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:rows=[v[0] for v in c.execute("SELECT id FROM execution_runs WHERE machine_id=? AND status IN('queued','running')",(p['machineId'],))]
finally:c.close()
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ids':rows,'readOnly':True,'fullTable':True}))
`)));
  if(active.ids.length)throw Error('RECOVERY_CENTRAL_QUEUE_NOT_IDLE');
  const id=randomUUID();
  const evidence={schemaVersion:1,kind:'project-autonomy-worker-reconciliation',source:'root-managed-queue-inspection',reconciliationId:id,projectId,expectedProfileRevision:p.revision,workPackage:'FA-01',oldTaskId,oldTaskRevision:t.revision,oldRunId,machineId:p.config.machineId,agentId,workspace:p.config.workspace,goalSpecHash:p.goalSpecHash,templateHashes:p.templateHashes,terminalResultSha256:sha(r.result),observedAt:new Date().toISOString(),sourceFingerprint:node.sourceFingerprint,centralActiveRunIds:active.ids,node:Object.fromEntries(['unitActive','processId','nativeChildren','unresolvedRuns','unconfirmedDeliveries','pendingLogs','oldResultAcknowledged'].map(k=>[k,node[k]])),processCleanupVerified:true,recoveryMode:'new-worker-attempt',objectivesAccepted:false};
  journal.evidence=evidence;journal.nodeInspection=node;journal.centralInspection=active;
  const raw=JSON.stringify(evidence,null,2)+'\n';journal.evidenceSHA256=sha(raw);
  journal.intent={commandId:randomUUID(),expectedVersion:p.revision,reason:'发布期间一次技术心跳失败已签名中断；实际节点进程、日志回执及中央队列已对账，修复有界心跳重试后创建新的FA01任务承接现有独立副本。保留旧任务和未知费用，不原生resume、不标产品验收。',workPackage:'FA-01',oldTaskId,oldRunId,goalSpecHash:p.goalSpecHash,terminalResultSha256:evidence.terminalResultSha256,reconciliationId:id,reconciliationSha256:journal.evidenceSHA256};
  await save();
 }
 if(!process.argv.includes('--execute'))return {execute:false,ready:true,projectId,oldTaskId,oldRunId,evidence:journal.evidence,modelCalls:0,productAccepted:false};
 if(!journal.evidenceInstalled){
  journal.evidenceInstalled=JSON.parse(primary(python({id:journal.evidence.reconciliationId,raw:JSON.stringify(journal.evidence,null,2)+'\n',expectedSHA:journal.evidenceSHA256},`import os,stat,hashlib,json
from pathlib import Path
folder=Path('/var/lib/jarvis-autonomy-reconciliations')
if not folder.exists():folder.mkdir(mode=0o755)
for q in [folder,*folder.parents]:
 s=q.lstat()
 if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('RECOVERY_EVIDENCE_PARENT_UNTRUSTED')
target=folder/(p['id']+'.json');raw=p['raw'].encode('utf-8')
if target.exists():
 s=target.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022 or s.st_nlink!=1 or target.read_bytes()!=raw:raise RuntimeError('RECOVERY_EVIDENCE_FILE_ALREADY_CHANGED')
else:
 fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
if hashlib.sha256(target.read_bytes()).hexdigest()!=p['expectedSHA']:raise RuntimeError('RECOVERY_EVIDENCE_HASH_CHANGED')
print(json.dumps({'installed':True,'rootOwned':True,'sha256':p['expectedSHA']}))
`)));await save();
 }
 if(!journal.receipt){journal.receipt=(await api(`/api/v1/projects/${projectId}/autonomy/recover`,journal.intent)).data;await save();}
 p=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 const s=p.stages.find(s=>s.id==='FA-01');
 return {at:new Date().toISOString(),release,projectId,oldTaskId,oldRunId,goalSpecHash:p.goalSpecHash,terminalResultSha256:journal.evidence.terminalResultSha256,reconciliationId:journal.evidence.reconciliationId,reconciliationSHA256:journal.evidenceSHA256,sourceFingerprint:journal.evidence.sourceFingerprint,status:p.status,revision:p.revision,stage:s,verifiedObjectiveIds:p.verifiedObjectiveIds,budget:p.budget,newGeneration:true,nativeSessionResumed:false,oldTaskRevived:false,productAccepted:false,rootEvidenceInstalled:journal.evidenceInstalled.installed};
});
await writeFile(`${dir}/recovery-${process.argv.includes('--execute')?'applied':'prepared'}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,ready:result.ready,newGeneration:result.newGeneration,stage:result.stage,productAccepted:false}));
