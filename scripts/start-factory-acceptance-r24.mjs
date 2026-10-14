/** A new fixed acceptance batch. Never resets or revives the old development plan. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform,remote,lanProfile,primary,python} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const agentId='0b5aea06-47e1-4f4b-a32e-969417915c9c';
const release='20261011-factory-acceptance-r24-1';
const dir='artifacts/software-factory/acceptance-r24';
const batchKeyArg=process.argv.find(v=>v.startsWith('--batch-key='));
const batchKey=batchKeyArg?.slice('--batch-key='.length)??'';
if(batchKey && !/^[a-z][a-z0-9-]{0,63}$/.test(batchKey))throw Error('ACCEPTANCE_BATCH_KEY_INVALID');
const suffix=batchKey?'-'+batchKey:'';
const journalPath='.jarvis-dev/maintenance/factory-acceptance-r24'+suffix+'.json';
const execute=process.argv.includes('--execute');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(x=>canonical(x??null)).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,projectId,release,batchKey};}
if(journal.projectId!==projectId||journal.release!==release||(journal.batchKey??'')!==batchKey)throw Error('ACCEPTANCE_JOURNAL_SCOPE_MISMATCH');
async function save(){await mkdir(dirname(journalPath),{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);}
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(execute&&health.build!==release)throw Error('ACCEPTANCE_RELEASE_NOT_LIVE');
 const before=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(before?.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||before.spec.objectives.length!==74||before.config.costPolicy!=='record-only'||before.config.maxUSD!==null||before.config.maxTokens!==null||before.config.perTaskUSD!==null)throw Error('ACCEPTANCE_FROZEN_SCOPE_CHANGED');
 if(!journal.intent){
  if(before.status!=='blocked'||before.reason!=='REPAIR_ATTEMPTS_EXHAUSTED'||before.revision!==20)throw Error('ACCEPTANCE_OLD_PLAN_CHANGED');
  const central=JSON.parse(primary(python({projectId,workspace:before.config.workspace,machineId:before.config.machineId},String.raw`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 allruns=[{**json.loads(row[4]),'id':row[0],'status':row[1],'machineId':row[2],'agentId':row[3]} for row in c.execute('SELECT id,status,machine_id,agent_id,json FROM execution_runs')]
 related=[r for r in allruns if r.get('projectId')==p['projectId'] and r.get('workspace')==p['workspace']]
 active=[r['id'] for r in allruns if r.get('machineId')==p['machineId'] and r.get('status') in ['queued','running']]
finally:c.close()
c=sqlite3.connect('file:/var/lib/jarvis/data/project-autonomy/autonomy.sqlite?mode=ro',uri=True,timeout=10)
try:pending=[r[0] for r in c.execute('SELECT id FROM autonomy_stops WHERE project_id=? AND confirmed=0',(p['projectId'],))]
finally:c.close()
print(json.dumps({'related':related,'active':active,'pending':pending,'fullTable':True}))
`)));
  if(central.active.length||central.pending.length)throw Error('ACCEPTANCE_QUEUE_NOT_RECONCILED');
  const terminals=central.related.map(r=>{if(['running','queued'].includes(r.status)||r.result?.source!=='signed-agent'||r.result?.lateEvidenceOnly)throw Error('ACCEPTANCE_UNSIGNED_OLD_TERMINAL');return {runId:r.id,resultSha256:sha(r.result)};});
  const node=JSON.parse(remote(lanProfile,'jarvis-101',python({agentId,workspace:before.config.workspace,terminalRunIds:terminals.map(t=>t.runId),helperSHA256:sha(await readFile('scripts/project-autonomy-evidence.py'))},String.raw`import json,sqlite3,subprocess,datetime,stat,hashlib
from pathlib import Path
cfg=json.loads(Path('/var/lib/jarvis-development/101/config.json').read_bytes())
if cfg.get('agentId')!=p['agentId']:raise RuntimeError('ACCEPTANCE_NODE_IDENTITY_CHANGED')
unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
pid=int(unit.get('MainPID','0'))
if unit.get('ActiveState')!='active' or pid<=0:raise RuntimeError('ACCEPTANCE_NODE_NOT_ACTIVE')
children=[]
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  parent=int(next(x.split(':',1)[1] for x in (q/'status').read_text().splitlines() if x.startswith('PPid:')))
  if parent==pid:children.append(int(q.name))
 except (FileNotFoundError,PermissionError,StopIteration):pass
if children:raise RuntimeError('ACCEPTANCE_NATIVE_PROCESSES_NOT_CLEAR')
db=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10)
try:
 counts={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
 if any(counts.values()) or any(c.execute('SELECT status FROM runs WHERE id=?',(r,)).fetchone()!=('acknowledged',) for r in p['terminalRunIds']):raise RuntimeError('ACCEPTANCE_NODE_JOURNAL_NOT_RECONCILED')
finally:c.close()
helper=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')
for q in [helper,*helper.parents]:
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('ACCEPTANCE_FINGERPRINT_HELPER_UNTRUSTED')
if hashlib.sha256(helper.read_bytes()).hexdigest()!=p['helperSHA256']:raise RuntimeError('ACCEPTANCE_FINGERPRINT_HELPER_CHANGED')
def fingerprint():
 v=json.loads(subprocess.check_output(['/usr/bin/python3',str(helper),'fingerprint',p['workspace']],text=True,timeout=90))
 return {k:v[k] for k in ['sha256','files','bytes']}
first=fingerprint();second=fingerprint()
if first!=second:raise RuntimeError('ACCEPTANCE_SOURCE_NOT_STABLE')
print(json.dumps({'unitActive':True,'processId':pid,'nativeChildren':0,**counts,'terminalResultsAcknowledged':True,'sourceFingerprint':first['sha256'],'sourceFiles':first['files'],'sourceBytes':first['bytes'],'readOnly':True,'privateConfigurationExported':False}))
`),true,{timeoutMs:180000}));
  const id=randomUUID();
  const evidence={schemaVersion:1,kind:'project-autonomy-baseline-reconciliation',source:'root-managed-queue-inspection',reconciliationId:id,projectId,expectedProfileRevision:before.revision,workPackage:'FA-01',workspace:before.config.workspace,machineId:before.config.machineId,agentId,goalSpecHash:before.goalSpecHash,templateHashes:before.templateHashes,sourceFingerprint:node.sourceFingerprint,observedAt:new Date().toISOString(),terminalRuns:terminals,centralActiveRunIds:[],pendingStopIds:[],node:Object.fromEntries(['unitActive','processId','nativeChildren','unresolvedRuns','unconfirmedDeliveries','pendingLogs','terminalResultsAcknowledged'].map(k=>[k,node[k]])),processCleanupVerified:true,mode:'fixed-baseline-validation',objectivesAccepted:false};
  journal.evidence=evidence;journal.evidenceSHA256=sha(JSON.stringify(evidence,null,2)+'\n');journal.nodeInspection=node;
  journal.intent={commandId:randomUUID(),expectedVersion:before.revision,goalSpecHash:before.goalSpecHash,workPackage:'FA-01',mainBaselineTaskId:'e9942a1f-d8d0-4995-8246-e284990e0dea',reason:'用户明确软件工厂基本开发完：按现有74目标先验证当前成果，固定源码与已有改动，不先重开发。首批仅执行FA01无模型固定隔离验收，产物和失败留档；缺口明确后再安排定点修复。原超时任务、尝试和费用记录保留，不修改原计划或冒认目标通过。',reconciliationId:id,reconciliationSha256:journal.evidenceSHA256};
  await save();
 }
 if(!execute)return {execute:false,ready:true,projectId,release:health.build,evidence:journal.evidence,modelsInvoked:false,oldPlanChanged:false,objectivesAccepted:false};
 if(!journal.evidenceInstalled){
  journal.evidenceInstalled=JSON.parse(primary(python({id:journal.evidence.reconciliationId,raw:JSON.stringify(journal.evidence,null,2)+'\n',expectedSHA:journal.evidenceSHA256},String.raw`import os,stat,hashlib,json
from pathlib import Path
folder=Path('/var/lib/jarvis-autonomy-reconciliations')
for q in [folder,*folder.parents]:
 s=q.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('ACCEPTANCE_EVIDENCE_PARENT_UNTRUSTED')
target=folder/(p['id']+'.json');raw=p['raw'].encode('utf-8')
if target.exists():
 s=target.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022 or s.st_nlink!=1 or target.read_bytes()!=raw:raise RuntimeError('ACCEPTANCE_EVIDENCE_FILE_CHANGED')
else:
 fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
if hashlib.sha256(target.read_bytes()).hexdigest()!=p['expectedSHA']:raise RuntimeError('ACCEPTANCE_EVIDENCE_HASH_CHANGED')
print(json.dumps({'installed':True,'rootOwned':True,'sha256':p['expectedSHA']}))
`)));await save();
 }
 if(!journal.batch){journal.batch=(await api(`/api/v1/projects/${projectId}/autonomy/baselines`,journal.intent)).data;await save();}
 const taskId=journal.batch.taskId;
 if(!taskId)throw Error('ACCEPTANCE_BATCH_TASK_MISSING');
 if(!journal.startIntent){const task=(await api(`/api/v1/tasks/${taskId}`)).data;journal.startIntent={commandId:randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId,reason:'执行新验收计划首批：无模型固定验证现有成果，保留全部实际失败及独立报告。'}};await save();}
 if(!journal.startReceipt){
  const current=(await api(`/api/v1/tasks/${taskId}`)).data;
  if(current.executionRequest?.id){
   const existing=(await api(`/api/v1/execution/runs/${current.executionRequest.id}`)).data;
   if(existing.taskId!==taskId||existing.projectId!==projectId||existing.workspace!==journal.evidence.workspace||existing.executorId!=='msf-autonomy-fa-01-validator'||existing.purpose!=='project-autonomy-validation')throw Error('ACCEPTANCE_EXISTING_EXECUTION_BINDING_CHANGED');
   journal.actualStartReadback={runId:existing.id,at:new Date().toISOString(),source:'actual-task-run-readback',commandReceiptReceived:false,taskStatus:current.status,runStatus:existing.status};await save();
  }else{journal.startReceipt=(await api('/api/v1/tasks/commands/start',journal.startIntent)).data;await save();}
 }
 const task=(await api(`/api/v1/tasks/${taskId}`)).data;
 const runId=task.executionRequest?.id;if(!runId)throw Error('ACCEPTANCE_EXECUTION_NOT_CREATED');
 const run=(await api(`/api/v1/execution/runs/${runId}`)).data;
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(canonical(before)!==canonical(after))throw Error('ACCEPTANCE_OLD_PROFILE_MUTATED');
 if((await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('ACCEPTANCE_GLOBAL_POLICY_CHANGED');
 return {at:new Date().toISOString(),execute:true,release,projectId,batchId:journal.batch.id,taskId,taskStatus:task.status,runId,runStatus:run.status,executorId:run.executorId,workspace:run.workspace,purpose:run.purpose??'project-autonomy-validation',sourceFingerprint:journal.evidence.sourceFingerprint,goalSpecHash:after.goalSpecHash,objectives:after.spec.objectives.length,verifiedObjectives:after.verifiedObjectiveIds.length,oldPlan:{revision:after.revision,status:after.status,reason:after.reason,attempt:after.stages[0].attempt,unchanged:true},startCommandReceiptReceived:!!journal.startReceipt,startProvenance:journal.actualStartReadback?.source??'command-receipt',modelsInvoked:false,globalSupervision:false,objectivesAccepted:false,reportAwaited:!run.result};
});
await mkdir(dir,{recursive:true});
const output=dir+'/'+(execute?'baseline-started':'baseline-prepared')+suffix+'.json';
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
