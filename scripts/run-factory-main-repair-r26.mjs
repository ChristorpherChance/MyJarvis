/** Explicit single-round native repair. Importing performs no IO; R22 remains frozen. */
import {readFile,mkdir,open,rename,unlink,lstat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {withPlatform,remote,primary,lanProfile,python} from './managed-server-client.mjs';
import {nodeState,queueState,patchNode,putCentral} from './run-factory-supervision-probe.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
export const repairScope=Object.freeze({
 projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',templateId:'msf-101-claude',ownerId:'server-admin',
 source:'/home/superopen/All-Projects/msf',parent:'/home/superopen/All-Projects/msf-main-repair-r26',workspace:'/home/superopen/All-Projects/msf-main-repair-r26/source',
 baselineSHA:'151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',head:'89e6af3ac64f707c3ba6fc09e9e09fe4a4174171',files:593,
 goalSHA:'23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42',helperSHA:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
 model:'gpt-6.1-sol[1m]',costPolicy:'record-only',artifactDirectory:'artifacts/software-factory/acceptance-r26',
 batchPath:'.jarvis-dev/maintenance/factory-main-acceptance-r26-current-main-full.json',journalPath:'.jarvis-dev/maintenance/factory-main-repair-r26.json'
});
const S=repairScope,H=/^[a-f0-9]{64}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,terminal=new Set(['succeeded','failed','cancelled','timeout','round-limit','budget-exhausted','awaiting-cost','interrupted']);
export const approvedBaselines=Object.freeze({
 'r26':Object.freeze({journalPath:S.batchPath,entry:'/usr/local/libexec/jarvis-msf-main-acceptance-r26'}),
 'r26-4':Object.freeze({journalPath:'.jarvis-dev/maintenance/factory-main-acceptance-r26-4-current-main-full.json',entry:'/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'})
});
export function cleanupPathAllowed(path,baselineVersion='r26'){
 if(!Object.hasOwn(approvedBaselines,baselineVersion))return false;
 const prefix=baselineVersion==='r26-4'?'main-independent-cleanup-r26-4-':'main-independent-cleanup-';
 return new RegExp('^artifacts/software-factory/acceptance-r26/'+prefix+'\\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.json$').test(path??'');
}
const need=(value,code)=>{if(!value)throw Error(code);};
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b),iso=d=>new Date(d.now()).toISOString();
export function nativeRepairTemplate(original){
 need(original?.id===S.templateId&&original.machineId===S.machineId&&original.engine==='claude'&&typeof original.program==='string'&&original.program.startsWith('/'),'MAIN_REPAIR_ORIGINAL_TEMPLATE_INVALID');
 return {id:S.templateId,machineId:S.machineId,engine:'claude',program:original.program,args:['--print','{prompt}','--output-format','stream-json','--verbose','--model',S.model,'--allowedTools','Read,Glob,Grep,Edit,Write,Bash'],workspaceRoot:S.parent,maxRounds:1,timeoutSec:1800,leaseSec:60,budgetCurrency:'USD',supervision:{billing:'record-only',maxTokens:200000,maxRecoveryAttempts:1,retryDelaySec:120,repairValidation:false,fallbackExecutorIds:[]}};
}
export function assertBaselineRun(run,batch,{baselineVersion='r26'}={}){
 need(Object.hasOwn(approvedBaselines,baselineVersion),'MAIN_REPAIR_BASELINE_VERSION_INVALID');
 need(batch?.version===1&&batch.projectId===S.projectId&&batch.machineId===S.machineId&&batch.source===S.source&&batch.batchKey==='current-main-full'&&batch.restored===true&&batch.runId===expectedRunId(batch.intents?.start?.commandId)&&batch.taskId,'MAIN_REPAIR_BASELINE_JOURNAL_INVALID');
 need(run?.id===batch.runId&&run.projectId===S.projectId&&run.taskId===batch.taskId&&run.objectId===batch.taskId&&run.domain==='tasks'&&run.kind==='development'&&run.scope==='personal'&&run.workspace===S.source&&run.machineId===S.machineId&&run.executorId===S.templateId&&run.agentId===batch.nodeAgentId,'MAIN_REPAIR_BASELINE_SCOPE_CHANGED');
 need(batch.fixedTemplate?.id===S.templateId&&batch.fixedTemplate.machineId===S.machineId&&batch.fixedTemplate.engine==='fixed'&&batch.fixedTemplate.maxRounds===1&&batch.fixedTemplate.validation&&batch.originalTemplate?.engine==='claude','MAIN_REPAIR_BASELINE_TEMPLATE_INVALID');
 need(batch.fixedTemplate.validation.program==='/usr/bin/sudo'&&same(batch.fixedTemplate.validation.args,['-n',approvedBaselines[baselineVersion].entry,'{workspace}','{runId}'])&&batch.fixedTemplate.validation.timeoutSec===3600,'MAIN_REPAIR_BASELINE_ENTRY_CHANGED');
 if(run.template!==undefined)need(same(run.template,batch.fixedTemplate),'MAIN_REPAIR_BASELINE_TEMPLATE_CHANGED');
 need(['succeeded','failed'].includes(run.status)&&run.stopRequested!==true&&run.result?.source==='signed-agent'&&run.result.lateEvidenceOnly!==true,'MAIN_REPAIR_BASELINE_NOT_CLOSED');
 const validation=run.result.validation,raw=validation?.autonomyReportJson,digest=validation?.autonomyReportSha256;
 need(typeof raw==='string'&&Buffer.byteLength(raw)<=2*1024*1024&&H.test(digest??''),'MAIN_REPAIR_TRUSTED_TERMINAL_REPORT_REQUIRED');
 need(sha(raw)===digest,'MAIN_REPAIR_TERMINAL_REPORT_HASH_MISMATCH');
 let report;try{report=JSON.parse(raw);}catch{throw Error('MAIN_REPAIR_TERMINAL_REPORT_INVALID');}
 need(report.schemaVersion===1&&report.kind==='project-autonomy-validation'&&['pass','fail'].includes(report.status)&&report.simulated===false&&report.runId===run.id&&report.workspace===S.source&&report.goalSpecHash===S.goalSHA&&report.workPackage==='FA-01'&&report.sourceFingerprint===S.baselineSHA&&report.sourceStable===true,'MAIN_REPAIR_TERMINAL_REPORT_BINDING_MISMATCH');
 need(Number.isFinite(Date.parse(report.startedAt))&&Number.isFinite(Date.parse(report.finishedAt))&&Date.parse(report.finishedAt)>=Date.parse(report.startedAt)&&Array.isArray(report.checks)&&report.checks.length>0&&report.checks.length<=1000&&Array.isArray(report.artifacts)&&report.artifacts.length>0&&report.artifacts.length<=1000,'MAIN_REPAIR_TERMINAL_REPORT_INVALID');
 const ids=new Set();for(const c of report.checks){
  need(typeof c.id==='string'&&/^[a-zA-Z0-9._-]{1,150}$/.test(c.id)&&!ids.has(c.id)&&typeof c.command==='string'&&typeof c.required==='boolean'&&typeof c.executed==='boolean'&&['pass','fail','skip','unknown'].includes(c.status)&&(c.exitCode===null||Number.isInteger(c.exitCode))&&H.test(c.evidenceSha256??''),'MAIN_REPAIR_TERMINAL_CHECK_INVALID');ids.add(c.id);
  if(c.tests)need(['total','passed','failed','skipped','unknown'].every(k=>Number.isSafeInteger(c.tests[k])&&c.tests[k]>=0)&&c.tests.total>0&&c.tests.total===c.tests.passed+c.tests.failed+c.tests.skipped+c.tests.unknown,'MAIN_REPAIR_TERMINAL_TEST_COUNTS_INVALID');
 }
 for(const a of report.artifacts)need(typeof a.path==='string'&&a.path&&!a.path.startsWith('/')&&!a.path.startsWith('\\')&&!a.path.split(/[\\/]/).includes('..')&&H.test(a.sha256??'')&&Number.isSafeInteger(a.bytes)&&a.bytes>=0,'MAIN_REPAIR_TERMINAL_ARTIFACT_INVALID');
 return report;
}
export function assertCleanupProof(c,batch,run,{now=Date.now(),fresh=true}={}){
 const h=c?.host,t=c?.terminal;
 need(c?.schemaVersion===1&&c.kind==='software-factory-current-main-independent-cleanup-audit'&&c.projectId===S.projectId&&c.runId===batch.runId&&/^[a-f0-9]{32}$/.test(c.attempt??'')&&c.expectedSourceFingerprint===S.baselineSHA&&c.cleanupIndependentlyVerified===true&&c.status==='complete'&&c.productAccepted===false&&c.modelsInvoked===false&&c.businessServicesModified===false,'MAIN_REPAIR_CLEANUP_NOT_CONFIRMED');
 need(t?.runId===run.id&&t.taskId===run.taskId&&t.status===run.status&&t.terminal===true&&t.ingestedSignedAgentReceipt===true&&t.resultSource==='signed-agent'&&t.outcome===run.result.outcome&&t.executionExitCode===run.result.exitCode&&t.validationExitCode===run.result.validation?.exitCode&&H.test(t.storedRecordSHA256??'')&&t.rawResultExported===false,'MAIN_REPAIR_CLEANUP_TERMINAL_MISMATCH');
 need(h?.runId===run.id&&h.attempt===c.attempt&&h.lifecycleVerified===true&&h.resourcesActuallyAbsent===true&&h.processesActuallyGone===true&&h.source?.unchanged===true&&h.source.currentSHA256===S.baselineSHA&&h.source.expectedSHA256===S.baselineSHA&&h.source.files===S.files&&h.source.head===S.head&&Array.isArray(h.relatedLiveProcesses)&&!h.relatedLiveProcesses.length&&Array.isArray(h.errorCodes)&&!h.errorCodes.length&&h.rawLogsExported===false&&h.privateEnvironmentExported===false&&h.mutationsPerformed===false,'MAIN_REPAIR_CLEANUP_HOST_MISMATCH');
 for(const k of ['mainLabelScope','brokerLabelScope'])need(Array.isArray(h[k]?.containers)&&!h[k].containers.length&&Array.isArray(h[k].networks)&&!h[k].networks.length&&Array.isArray(h[k].exactNamedResources)&&h[k].exactNamedResources.length>0&&h[k].exactNamedResources.every(r=>r.present===false),'MAIN_REPAIR_CLEANUP_RESOURCES_UNCONFIRMED');
 need(h.broker?.status==='stopped'&&h.broker.cleanupClaimsComplete===true&&h.broker.unresolvedCreateIntents===0&&h.broker.expectedProcessIdentityAlive===false&&h.broker.socket?.present===false&&h.broker.runtimeDirectory?.present===false&&h.coordinator?.cleanupClaimsComplete===true&&h.coordinator.expectedProcessIdentityAlive===false&&h.finalPrivateReport?.present===true&&h.finalPrivateReport.sourceStable===true&&H.test(h.finalPrivateReport.sha256??''),'MAIN_REPAIR_CLEANUP_REPORT_OR_PROCESS_UNCONFIRMED');
 need([c.observedAt,t.observedAt,h.observedAt].every(v=>Number.isFinite(Date.parse(v))),'MAIN_REPAIR_CLEANUP_TIMESTAMP_INVALID');
 if(fresh)need([c.observedAt,t.observedAt,h.observedAt].every(v=>now-Date.parse(v)>=-30000&&now-Date.parse(v)<=15*60000),'MAIN_REPAIR_CLEANUP_PROOF_STALE');return c;
}
function diagnosisView(raw,path,batch){
 need(/^artifacts\/software-factory\/acceptance-r26\/main-failures-readonly-diagnosis-r26(?:-4)?(?:-supplement)?-\d{8}\.json$/.test(path),'MAIN_REPAIR_DIAGNOSIS_PATH_INVALID');
 let v;try{v=JSON.parse(raw);}catch{throw Error('MAIN_REPAIR_DIAGNOSIS_INVALID');}
 need(v.schemaVersion===1&&['software-factory-current-main-readonly-failure-diagnosis','software-factory-current-main-readonly-failure-diagnosis-supplement'].includes(v.kind)&&v.projectId===S.projectId&&v.taskId===batch.taskId&&v.runId===batch.runId&&v.source?.workspace===S.source&&v.source.sha256===S.baselineSHA&&v.source.head===S.head&&v.source.publicFiles===S.files&&v.scope?.readOnly===true&&v.scope.sourceModified===false&&v.scope.modelsInvoked===false&&v.scope.rawLogsExported===false,'MAIN_REPAIR_DIAGNOSIS_BINDING_MISMATCH');
 const sourceFiles=(v.evidence??[]).filter(e=>e.publicSourcePath).map(e=>({path:e.publicSourcePath,sha256:e.sha256}));
 need(sourceFiles.length>0&&sourceFiles.every(e=>/^(?:apps|packages|doc)\/[a-zA-Z0-9_./-]+$/.test(e.path)&&!e.path.split('/').includes('..')&&H.test(e.sha256??'')),'MAIN_REPAIR_DIAGNOSIS_SOURCE_HASH_REQUIRED');
 return {path,sha256:sha(raw),runId:v.runId,attempt:v.attempt,sourceFiles,partialDiagnosis:v.scope.finalReportReviewed!==true};
}
export function assertJournal(j){
 need(j?.version===2&&same(j.scope,S)&&/^[a-f0-9]{32}$/.test(j.job??'')&&U.test(j.nodeAgentId??'')&&H.test(j.initialProfileSHA??'')&&j.originalTemplateSHA===sha(j.originalTemplate)&&same(j.template,nativeRepairTemplate(j.originalTemplate))&&j.templateSHA===sha(j.template)&&j.baseline?.runId&&H.test(j.baseline.reportSHA??'')&&H.test(j.baseline.resultSHA??'')&&H.test(j.cleanupProof?.sha256??'')&&H.test(j.diagnosis?.sha256??'')&&j.diagnosis.runId===j.baseline.runId&&Array.isArray(j.diagnosis.sourceFiles)&&typeof j.intents==='object','MAIN_REPAIR_JOURNAL_SCOPE_INVALID');
 need(Object.hasOwn(approvedBaselines,j.baseline.version??'r26')&&cleanupPathAllowed(j.cleanupProof.path,j.baseline.version??'r26')&&['prepared','dispatch-attempted','started','restored'].includes(j.phase),'MAIN_REPAIR_JOURNAL_SCOPE_INVALID');
 if(j.intents.create)need(U.test(j.intents.create.commandId??'')&&j.intents.create.scope==='personal'&&j.intents.create.expectedVersion===0&&same(j.intents.create.payload,j.taskPayload)&&j.taskPayload.projectId===S.projectId&&j.taskPayload.machineId===S.machineId&&j.taskPayload.agent===S.templateId&&j.taskPayload.worktree===S.workspace&&j.taskPayload.mode==='managed'&&j.taskPayload.budget===1&&j.taskPayload.retryLimit===0&&same(j.taskPayload.skillIds,[])&&j.taskPayloadSHA===sha(j.taskPayload),'MAIN_REPAIR_CREATE_INTENT_CHANGED');
 if(j.intents.copy)need(U.test(j.intents.copy.commandId??'')&&j.intents.copy.scope==='personal'&&Number.isSafeInteger(j.intents.copy.expectedVersion)&&j.intents.copy.payload.projectId===S.projectId&&Array.isArray(j.intents.copy.payload.copies)&&j.intents.copy.payload.copies.filter(c=>c.machineId===S.machineId&&c.path===S.workspace&&c.branch==='main-snapshot-r26'&&c.environment==='development').length===1,'MAIN_REPAIR_COPY_INTENT_CHANGED');
 if(j.intents.start)need(U.test(j.intents.start.commandId??'')&&j.intents.start.scope==='personal'&&Number.isSafeInteger(j.intents.start.expectedVersion)&&j.intents.start.payload.taskId===j.taskId&&j.runId===expectedRunId(j.intents.start.commandId),'MAIN_REPAIR_START_INTENT_CHANGED');
 if(j.intents.cancel)need(U.test(j.intents.cancel.commandId??'')&&j.intents.cancel.scope==='personal'&&Number.isSafeInteger(j.intents.cancel.expectedVersion)&&j.intents.cancel.payload.taskId===j.taskId,'MAIN_REPAIR_CANCEL_INTENT_CHANGED');
 if(j.started)need(j.dispatchAttemptedAt&&j.intents.start&&j.taskId&&j.runId,'MAIN_REPAIR_DISPATCH_INTENT_MISSING');
 if(j.dispatchAttemptedAt)need(j.intents.start&&j.taskId&&j.runId&&Number.isFinite(Date.parse(j.dispatchAttemptedAt)),'MAIN_REPAIR_DISPATCH_INTENT_MISSING');return j;
}
function assertTask(task,j,{dispatched=false}={}){
 need(task?.id===j.taskId&&task.ownerId===S.ownerId&&task.scope==='personal'&&task.mode==='managed'&&task.projectId===S.projectId&&task.machineId===S.machineId&&task.agent===S.templateId&&task.worktree===S.workspace&&task.budget===1&&task.retryLimit===0&&same(task.skillIds??[],[])&&task.goal===j.taskPayload.goal&&task.criteria===j.taskPayload.criteria&&task.title===j.taskPayload.title,'MAIN_REPAIR_TASK_SCOPE_CHANGED');
 need(dispatched?task.executionRequest?.id===j.runId:!task.executionRequest,'MAIN_REPAIR_TASK_RUN_CHANGED');return task;
}
export function assertActualRun(run,task,j){
 assertJournal(j);assertTask(task,j,{dispatched:true});
 need(run?.id===j.runId&&run.domain==='tasks'&&run.kind==='development'&&run.scope==='personal'&&run.objectId===j.taskId&&run.taskId===j.taskId&&run.projectId===S.projectId&&run.machineId===S.machineId&&run.executorId===S.templateId&&run.workspace===S.workspace&&(!run.agentId||run.agentId===j.nodeAgentId)&&run.goal===j.taskPayload.goal&&run.criteria===j.taskPayload.criteria&&run.maxRounds===1&&run.timeoutSec===j.template.timeoutSec&&run.budgetUSD===1&&!run.purpose,'MAIN_REPAIR_ACTUAL_RUN_CHANGED');
 if(run.template!==undefined)need(same(run.template,j.template),'MAIN_REPAIR_FROZEN_RUN_TEMPLATE_CHANGED');return run;
}
export function safeFailureCode(error){
 const m=String(error?.message??'');if(/^MAIN_REPAIR_[A-Z0-9_]{1,100}$/.test(m))return m;
 if(/^API_\d{3} /.test(m))return 'MAIN_REPAIR_API_'+m.slice(4,7);if(m==='API_TIMEOUT')return 'MAIN_REPAIR_API_TIMEOUT';if(m.startsWith('SSH_OPERATION_FAILED '))return 'MAIN_REPAIR_REMOTE_OPERATION_FAILED';return 'MAIN_REPAIR_OPERATION_FAILED';
}
export function failureReceipt(error,action,j){return {at:new Date().toISOString(),action,errorCode:safeFailureCode(error),failed:true,projectId:S.projectId,taskId:j?.taskId??null,runId:j?.runId??null,dispatchAttempted:!!j?.dispatchAttemptedAt,dispatchReconciliationRequired:!!j?.dispatchAttemptedAt&&!j?.started,privateJournalExported:false,automaticRetry:false,productAccepted:false,rawErrorExported:false};}

// Executed only via explicit default dependencies; product files are read, never imported.
export const repairHostProgram=String.raw`
import os,sys,stat,pwd,json,hashlib,subprocess,sqlite3,fcntl,signal
from pathlib import Path
from types import ModuleType
sys.dont_write_bytecode=True
def need(v,c):
 if not v:raise RuntimeError(c)
def deadline(signum,frame):raise RuntimeError('MAIN_REPAIR_HOST_OBSERVATION_TIMEOUT')
signal.signal(signal.SIGALRM,deadline);signal.alarm(150)
# Preserve the approved helper's snapshot semantics while refusing an impossible zero-byte write.
original_write=os.write
def checked_write(fd,data):
 n=original_write(fd,data);need(not data or n>0,'MAIN_REPAIR_SNAPSHOT_SHORT_WRITE');return n
os.write=checked_write
def trusted(q):
 q=Path(q)
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'MAIN_REPAIR_ROOT_CHAIN_UNTRUSTED')
 return q
def private_read(q,limit=2097152):
 q=trusted(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=limit,'MAIN_REPAIR_PRIVATE_FILE_INVALID')
  data=b''
  while len(data)<=limit:
   piece=os.read(fd,min(65536,limit+1-len(data)))
   if not piece:break
   data+=piece
  a=os.fstat(fd);need((s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(a.st_dev,a.st_ino,a.st_uid,a.st_gid,a.st_mode,a.st_nlink,a.st_size,a.st_mtime_ns,a.st_ctime_ns) and len(data)==s.st_size,'MAIN_REPAIR_PRIVATE_FILE_CHANGED')
  return data
 finally:os.close(fd)
tool=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py');body=private_read(tool)
need(hashlib.sha256(body).hexdigest()==p['helperSHA'],'MAIN_REPAIR_COPY_TOOL_CHANGED')
h=ModuleType('repair_public_source');exec(compile(body,str(tool),'exec'),h.__dict__)
def identity(fd):
 s=os.fstat(fd);return {'device':s.st_dev,'inode':s.st_ino}
def source_state(path):
 first=h.fingerprint(path);root=h.open_directory(path)
 try:
  meta=[]
  for e in first['manifest']:
   fd=h.open_relative(root,e['path'])
   try:
    s=os.fstat(fd);meta.append([e['path'],s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns])
   finally:os.close(fd)
  inode=identity(root)
 finally:os.close(root)
 second=h.fingerprint(path);need(first==second,'MAIN_REPAIR_SOURCE_READ_CHANGED')
 return {'sha256':first['sha256'],'files':first['files'],'bytes':first['bytes'],'metadataSHA':hashlib.sha256(json.dumps(meta,separators=(',',':')).encode()).hexdigest(),'stable':True,'identity':inode},first
before,manifest=source_state(p['source']);need(before['sha256']==p['baselineSHA'] and before['files']==p['files'],'MAIN_REPAIR_MAIN_BASELINE_CHANGED')
def quiet():
 unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
 pid=int(unit.get('MainPID',0));need(pid>1 and unit.get('ActiveState')=='active','MAIN_REPAIR_NODE_NOT_ACTIVE')
 def proc(q):
  text=(q/'stat').read_text();v=text[text.rfind(')')+2:].split();return int(v[1]),v[19]
 initial=proc(Path('/proc')/str(pid));children=[]
 for q in Path('/proc').iterdir():
  if not q.name.isdigit():continue
  try:
   if proc(q)[0]==pid:children.append(int(q.name))
  except (FileNotFoundError,PermissionError,ProcessLookupError):pass
 journal=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
 for q in [journal,*journal.parents]:need(not q.is_symlink(),'MAIN_REPAIR_JOURNAL_PATH_UNTRUSTED')
 need(stat.S_ISREG(journal.lstat().st_mode) and journal.lstat().st_nlink==1,'MAIN_REPAIR_JOURNAL_PATH_UNTRUSTED')
 c=sqlite3.connect('file:'+str(journal)+'?mode=ro',uri=True,timeout=10)
 try:counts={'runs':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'deliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'logs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
 finally:c.close()
 need(initial==proc(Path('/proc')/str(pid)),'MAIN_REPAIR_NODE_PROCESS_CHANGED')
 return {'active':True,'pid':pid,'start':initial[1],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'children':sorted(children),'counts':counts}
node=quiet();account=pwd.getpwnam('superopen');prep=Path('/var/lib/jarvis-development/101/main-repair-r26-preparation');origin=None
if os.path.lexists(prep):trusted(prep)
if p['mode']=='prepare':
 need(not node['children'] and not any(node['counts'].values()),'MAIN_REPAIR_COPY_NODE_NOT_IDLE')
 if not os.path.lexists(prep):prep.mkdir(mode=0o700)
 trusted(prep);need(prep.lstat().st_mode&0o077==0,'MAIN_REPAIR_PREPARATION_MODE_INVALID')
 lock=os.open(prep/'lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
 ls=os.fstat(lock);need(stat.S_ISREG(ls.st_mode) and ls.st_uid==0 and ls.st_nlink==1 and ls.st_mode&0o077==0,'MAIN_REPAIR_PREPARATION_LOCK_UNTRUSTED')
 try:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  def store(v):
   temporary=prep/('origin-'+p['job']+'.tmp');fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   try:
    data=json.dumps(v,separators=(',',':')).encode();view=memoryview(data)
    while view:
     n=os.write(fd,view);need(n>0,'MAIN_REPAIR_ORIGIN_SHORT_WRITE');view=view[n:]
    os.fsync(fd)
   finally:os.close(fd)
   os.replace(temporary,prep/'origin.json');directory=os.open(prep,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
   try:os.fsync(directory)
   finally:os.close(directory)
  if os.path.lexists(prep/'origin.json'):origin=json.loads(private_read(prep/'origin.json'))
  else:
   need(not os.path.lexists(p['parent']) and not os.path.lexists(prep/'snapshot'),'MAIN_REPAIR_COPY_EXCLUSIVE_REQUIRED')
   origin={'version':1,'job':p['job'],'workspace':p['workspace'],'parent':p['parent'],'baselineSHA':p['baselineSHA'],'phase':'snapshot-intent'};store(origin)
   snap=h.snapshot(p['source'],str(prep/'snapshot'));need(snap['sha256']==p['baselineSHA'] and snap['files']==p['files'],'MAIN_REPAIR_SNAPSHOT_CHANGED')
   origin['phase']='snapshot-ready';store(origin)
  need(origin.get('version')==1 and origin.get('job')==p['job'] and origin.get('workspace')==p['workspace'] and origin.get('parent')==p['parent'] and origin.get('baselineSHA')==p['baselineSHA'],'MAIN_REPAIR_ORIGIN_SCOPE_CONFLICT')
  need(origin['phase'] in ['snapshot-ready','handoff-intent','ready'],'MAIN_REPAIR_PARTIAL_COPY_RECONCILIATION_REQUIRED')
  if origin['phase']=='snapshot-ready':
   snap=h.fingerprint(str(prep/'snapshot'));need(snap['sha256']==p['baselineSHA'] and snap['files']==p['files'],'MAIN_REPAIR_SNAPSHOT_CHANGED')
   host=h.open_directory(str(Path(p['parent']).parent));target=None
   try:
    need(not os.path.lexists(p['parent']),'MAIN_REPAIR_COPY_EXCLUSIVE_REQUIRED')
    os.mkdir(Path(p['parent']).name,0o700,dir_fd=host);target=os.open(Path(p['parent']).name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=host)
    origin['parentIdentity']=identity(target);origin['phase']='handoff-intent';store(origin)
    os.rename(str(prep/'snapshot'),'source',dst_dir_fd=target)
    q=h.open_directory(p['workspace'])
    try:origin['identity']=identity(q)
    finally:os.close(q)
    store(origin)
   finally:
    if target is not None:os.close(target)
    os.close(host)
  if origin['phase']=='handoff-intent':
   target=h.open_directory(p['parent'])
   try:
    need(identity(target)==origin.get('parentIdentity'),'MAIN_REPAIR_PARENT_REPLACED')
    if not origin.get('identity'):
     need(os.fstat(target).st_uid==0,'MAIN_REPAIR_HANDOFF_RECONCILIATION_REQUIRED')
     if not os.path.lexists(p['workspace']):os.rename(str(prep/'snapshot'),'source',dst_dir_fd=target)
     q=h.open_directory(p['workspace'])
     try:origin['identity']=identity(q)
     finally:os.close(q)
     store(origin)
    q=h.open_directory(p['workspace'])
    def handoff(fd):
     for name in os.listdir(fd):
      s=os.stat(name,dir_fd=fd,follow_symlinks=False)
      if stat.S_ISDIR(s.st_mode):
       child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
       try:handoff(child)
       finally:os.close(child)
      elif stat.S_ISREG(s.st_mode):
       child=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
       try:
        x=os.fstat(child);need(x.st_nlink==1 and (x.st_dev,x.st_ino)==(s.st_dev,s.st_ino),'MAIN_REPAIR_COPY_ENTRY_CHANGED');os.fchown(child,account.pw_uid,account.pw_gid)
       finally:os.close(child)
      else:raise RuntimeError('MAIN_REPAIR_COPY_UNSAFE_ENTRY')
     os.fchown(fd,account.pw_uid,account.pw_gid)
    try:
     need(identity(q)==origin['identity'],'MAIN_REPAIR_COPY_REPLACED');copied=h.fingerprint(p['workspace']);need(copied['sha256']==p['baselineSHA'] and copied['files']==p['files'],'MAIN_REPAIR_COPY_CHANGED')
     handoff(q)
    finally:os.close(q)
    os.fchown(target,account.pw_uid,account.pw_gid)
    actual=h.open_directory(p['parent'])
    try:need(identity(actual)==origin['parentIdentity'],'MAIN_REPAIR_PARENT_REPLACED')
    finally:os.close(actual)
    origin['phase']='ready';store(origin)
   finally:os.close(target)
 finally:os.close(lock)
if origin is None and os.path.lexists(prep/'origin.json'):origin=json.loads(private_read(prep/'origin.json'))
candidate=None;bound=False
if os.path.lexists(p['workspace']):
 candidate,_=source_state(p['workspace'])
 if origin and p.get('job'):
  parentfd=h.open_directory(p['parent'])
  try:
   s=os.fstat(parentfd);bound=origin.get('version')==1 and origin.get('phase')=='ready' and origin.get('job')==p['job'] and origin.get('workspace')==p['workspace'] and origin.get('baselineSHA')==p['baselineSHA'] and identity(parentfd)==origin.get('parentIdentity') and candidate['identity']==origin.get('identity') and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and s.st_mode&0o077==0
  finally:os.close(parentfd)
after,_=source_state(p['source']);need(before==after,'MAIN_REPAIR_MAIN_CHANGED_DURING_COPY')
selected={e['path']:e['sha256'] for e in manifest['manifest'] if e['path'] in p.get('sourcePaths',[])}
print(json.dumps({'helperVerified':True,'source':after,'candidate':candidate,'originBound':bound,'quiet':node,'sourceFiles':selected,'privateFilesCopied':False,'gitHistoryCopied':False}))
`;

function taskPayload(j,report){
 const groups=report.checks.filter(c=>c.tests).map(c=>({id:c.id,status:c.status,tests:c.tests}));
 const failed=report.checks.filter(c=>c.required&&c.status!=='pass').map(c=>({id:c.id,status:c.status,executed:c.executed,exitCode:c.exitCode,evidenceSha256:c.evidenceSha256}));
 const refs=j.diagnosis.sourceFiles.map(e=>e.path+' @ '+e.sha256).join('\n');
 const sourcePollution=j.diagnosis.sourceFiles.some(e=>e.path==='doc/tests/prototype-commands.cjs')?'最新公开诊断还绑定prototype-commands.cjs：该测试在公开副本的.superpowers/sdd/原型写事务重设计/candidates生成候选HTML，导致TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE。仅在本次真实报告/诊断证实后，将测试生成物迁到独立临时目录/隔离fixture并真实清理，保留该测试全部断言。禁止扩大忽略规则、删测试或减弱严格source consistency；修后必须证明公开源码前后不变。':'';
 return {title:'AT-02 · 测试准备修复与超时定位',projectId:S.projectId,machineId:S.machineId,agent:S.templateId,mode:'managed',worktree:S.workspace,budget:1,retryLimit:0,skillIds:[],
 goal:'仅在独立公开源码副本 '+S.workspace+' 工作；禁止读写原main '+S.source+'。原指纹 '+S.baselineSHA+'，真实终态run '+j.baseline.runId+'，独立报告SHA '+j.baseline.reportSHA+'，报告状态 '+report.status+'。各真实测试组 '+JSON.stringify(groups)+'；必需未通过检查 '+JSON.stringify(failed)+'。受控诊断 '+j.diagnosis.path+' @ '+j.diagnosis.sha256+'（'+(j.diagnosis.partialDiagnosis?'运行中部分诊断，不能当作完整结论':'诊断')+'）；公开源码绑定：\n'+refs+'\n本批只处理证实的测试准备、fixture/断言问题并定位超时：核对sandbox镜像pin与批准环境契约，保留固定非空digest和安全拒绝、网络、只读、超时、配额断言；核对对象存储SDK路径编码、签名/key与代理断言，未证实下载继续待验；缺V1.1/V1.8或旧git资产仅在真实可追溯来源存在时恢复自包含fixture，禁止虚构历史/当前页面冒充旧版；原型超时只做停点/前置依赖定位与证实后的最小修复。'+sourcePollution+'不能把环境失败直接判产品逻辑失败或为绿灯改正确断言。不得删除适用测试、skip、改变45必需文件/30套原型分母或90/80覆盖门。禁止访问私有env/凭据、修改原main/R22/平台配置/验证器/权限/模型路由/业务服务/生产数据，不启宿主Docker，不访问生产接口。依赖只在本副本离线准备，不拉远端源码。没有独立验证器，本批签名结果只证明模型执行。费用详细记录不限制金额；单轮1800秒/200000token是技术边界。',
 criteria:'形成doc/repair/r26-report.md：来源run/check/原公开文件SHA→真实变更→实际命令结果→复验安排映射。分列已执行、未执行、未知、缺失资产及恢复步骤、超时停点；保留原标准和全部未解决项。模型声明不得作为独立验收。完成后固定新指纹，另行固定隔离复验和审阅，再决定是否合并。Token及已知/未知费用分开记账，不把未知费用写零。'};
}
export async function runFactoryMainRepair(options,deps){
 const d={now:Date.now,randomUUID,randomBytes,delay:ms=>new Promise(r=>setTimeout(r,ms)),...deps},action=options.action??'inspect';
 need(['inspect','start','check','restore'].includes(action),'MAIN_REPAIR_ACTION_INVALID');
 let j;try{j=JSON.parse(await d.readFile(S.journalPath,'utf8'));assertJournal(j);}catch(e){if(e.code!=='ENOENT')throw e;}
 const save=async()=>{assertJournal(j);await d.saveJournal(j);},api=d.api,get=async path=>(await api(path)).data;
 const globalProfile=async()=>{
  const profile=await get('/api/v1/projects/'+S.projectId+'/autonomy'),global=await get('/api/v1/execution/supervision');
  need(profile.goalSpecHash===S.goalSHA&&profile.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false,'MAIN_REPAIR_AUTHORIZED_SCOPE_CHANGED');
  if(j)need(sha(profile)===j.initialProfileSHA,'MAIN_REPAIR_OLD_PROFILE_CHANGED');return profile;
 };
 const baselineVersion=options.baselineVersion??j?.baseline.version??'r26';
 need(Object.hasOwn(approvedBaselines,baselineVersion)&&(!j||baselineVersion===(j.baseline.version??'r26')),'MAIN_REPAIR_BASELINE_VERSION_INVALID');
 const profile=await globalProfile(),batch=JSON.parse(await d.readFile(approvedBaselines[baselineVersion].journalPath,'utf8')),base=await get('/api/v1/execution/runs/'+batch.runId);
 let report;try{report=assertBaselineRun(base,batch,{baselineVersion});}catch(e){
  if(action==='inspect')return {at:iso(d),action,ready:false,errorCode:safeFailureCode(e),baselineRunId:batch.runId??null,workspace:S.workspace,model:S.model,costPolicy:S.costPolicy,dispatch:false,productAccepted:false};
  throw e;
 }
 if(j)need(j.baseline.runId===base.id&&j.baseline.taskId===base.taskId&&j.baseline.reportSHA===base.result.validation.autonomyReportSha256&&j.baseline.resultSHA===sha(base.result),'MAIN_REPAIR_FROZEN_BASELINE_CHANGED');
 need(await d.runTemplateSHA(base.id,{workspace:S.source,taskId:batch.taskId})===sha(batch.fixedTemplate),'MAIN_REPAIR_BASELINE_TEMPLATE_CHANGED');
 const readRun=async()=>{if(!j?.runId)return null;try{return await get('/api/v1/execution/runs/'+j.runId);}catch(e){if(/^API_404 /.test(e.message))return null;throw e;}};
 const verifyRun=async run=>{const task=await get('/api/v1/tasks/'+j.taskId);assertActualRun(run,task,j);need(await d.runTemplateSHA(j.runId)===j.templateSHA,'MAIN_REPAIR_FROZEN_RUN_TEMPLATE_CHANGED');return {run,task};};
 const host=async(mode='inspect')=>{
  const v=await d.hostState(mode,j);need(v.source?.sha256===S.baselineSHA&&v.source.files===S.files&&v.source.stable===true&&H.test(v.source.metadataSHA??'')&&v.helperVerified===true&&v.privateFilesCopied===false&&v.gitHistoryCopied===false,'MAIN_REPAIR_MAIN_BASELINE_CHANGED');return v;
 };
 const quiet=async expected=>{
  await globalProfile();const queue=await d.queueState();need(queue.fullTable===true&&queue.readOnly===true&&queue.allActive===0,'MAIN_REPAIR_QUEUE_NOT_IDLE');
  const node=await d.nodeState();need(node.unit?.ActiveState==='active'&&node.agentId===(j?.nodeAgentId??batch.nodeAgentId),'MAIN_REPAIR_NODE_IDENTITY_CHANGED');
  if(expected)need(same(node.template,expected)&&same((await get('/api/v1/execution/config')).templates.find(t=>t.id===S.templateId),expected),'MAIN_REPAIR_TEMPLATE_CAS_CONFLICT');
  const h=await host();need(h.quiet?.active===true&&Array.isArray(h.quiet.children)&&!h.quiet.children.length&&['runs','deliveries','logs'].every(k=>h.quiet.counts?.[k]===0),'MAIN_REPAIR_NODE_NOT_RECONCILED');
  return {node,host:h};
 };
 if(action==='inspect'){
  const state=await quiet(batch.originalTemplate);
  return {at:iso(d),action,ready:true,baselineRunId:base.id,terminalReportSHA:base.result.validation.autonomyReportSha256,sourceFingerprint:state.host.source.sha256,sourceMetadataSHA:state.host.source.metadataSHA,workspace:S.workspace,model:S.model,costPolicy:S.costPolicy,dispatch:false,cleanupProofStillRequired:true,validation:'post-repair fixed fingerprint validation required',productAccepted:false};
 }
 need(j||action==='start','MAIN_REPAIR_NOT_PREPARED');
 if(action==='start'&&!j){
  need(cleanupPathAllowed(options.cleanupPath,baselineVersion),'MAIN_REPAIR_CLEANUP_PROOF_REQUIRED');
  const cleanupRaw=await d.readFile(options.cleanupPath,'utf8'),cleanup=assertCleanupProof(JSON.parse(cleanupRaw),batch,base,{now:d.now()});
  const diagnosisRaw=await d.readFile(options.diagnosisPath??'','utf8'),diagnosis=diagnosisView(diagnosisRaw,options.diagnosisPath??'',batch);
  need(diagnosis.attempt===cleanup.attempt,'MAIN_REPAIR_DIAGNOSIS_ATTEMPT_CHANGED');
  const state=await quiet(batch.originalTemplate),original=state.node.template;
  need(original.engine==='claude'&&!profile.templateHashes?.[S.templateId]&&same(original,batch.originalTemplate),'MAIN_REPAIR_TEMPLATE_NOT_IDLE_NATIVE');
  j={version:2,scope:S,job:d.randomBytes(16).toString('hex'),createdAt:iso(d),initialProfileSHA:sha(profile),originalTemplate:original,originalTemplateSHA:sha(original),template:nativeRepairTemplate(original),nodeAgentId:state.node.agentId,baseline:{version:baselineVersion,runId:base.id,taskId:base.taskId,reportSHA:base.result.validation.autonomyReportSha256,resultSHA:sha(base.result)},cleanupProof:{path:options.cleanupPath,sha256:sha(cleanupRaw)},diagnosis,intents:{},phase:'prepared',sourceBefore:state.host.source};
  j.templateSHA=sha(j.template);await save();
 }
 if(action==='start'&&!j.started){
  need(j.restored!==true,'MAIN_REPAIR_BATCH_ALREADY_RESTORED');
  const existing=await readRun();
  if(existing){await verifyRun(existing);j.started=true;j.startReconciledAt=iso(d);await save();}
  else need(!j.dispatchAttemptedAt,'MAIN_REPAIR_DISPATCH_RECONCILIATION_REQUIRED');
  if(!j.started){
   need(sha(await d.readFile(j.cleanupProof.path,'utf8'))===j.cleanupProof.sha256&&sha(await d.readFile(j.diagnosis.path,'utf8'))===j.diagnosis.sha256,'MAIN_REPAIR_FROZEN_EVIDENCE_CHANGED');
   assertCleanupProof(JSON.parse(await d.readFile(j.cleanupProof.path,'utf8')),batch,base,{now:d.now()});
   const state=await quiet();
   need([j.originalTemplateSHA,j.templateSHA].includes(sha(state.node.template))&&[j.originalTemplateSHA,j.templateSHA].includes(sha((await get('/api/v1/execution/config')).templates.find(t=>t.id===S.templateId))),'MAIN_REPAIR_PREPARATION_TEMPLATE_CONFLICT');
   need(same(state.host.source,j.sourceBefore),'MAIN_REPAIR_SOURCE_METADATA_CHANGED');
   j.copyIntentAt??=iso(d);await save();j.copy=await host('prepare');
   need(j.copy.candidate?.sha256===S.baselineSHA&&j.copy.candidate.files===S.files&&j.copy.originBound===true&&same(j.copy.source,j.sourceBefore),'MAIN_REPAIR_COPY_NOT_IDENTICAL');await save();
   const project=await get('/api/v1/projects/'+S.projectId);need(project.scope==='personal'&&project.ownerId===S.ownerId&&Array.isArray(project.copies),'MAIN_REPAIR_PROJECT_SCOPE_CHANGED');
   const matches=project.copies.filter(c=>c.machineId===S.machineId&&c.path===S.workspace);
   if(matches.length)need(matches.length===1&&matches[0].branch==='main-snapshot-r26'&&matches[0].environment==='development'&&(!j.intents.copy||same(project.copies,j.intents.copy.payload.copies)),'MAIN_REPAIR_REGISTERED_COPY_CONFLICT');
   else{
    j.intents.copy??={commandId:d.randomUUID(),expectedVersion:project.revision,scope:'personal',payload:{projectId:S.projectId,copies:[...project.copies,{machineId:S.machineId,path:S.workspace,branch:'main-snapshot-r26',environment:'development'}]}};await save();
    await api('/api/v1/projects/commands/copies',j.intents.copy);
    need(same((await get('/api/v1/projects/'+S.projectId)).copies,j.intents.copy.payload.copies),'MAIN_REPAIR_COPY_REGISTRATION_UNCONFIRMED');
   }
   await quiet();j.templateChangeAttemptedAt??=iso(d);await save();await d.putCentral(api,j.originalTemplate,j.template);
   const node=await d.nodeState();if(same(node.template,j.originalTemplate))await d.patchNode(j.originalTemplate,j.template,j.job);else need(same(node.template,j.template),'MAIN_REPAIR_NODE_CONFIG_CONFLICT');
   const until=d.now()+45000;let available=false;
   for(let tries=0;tries<24&&d.now()<until;tries++){
    const caps=await get('/api/v1/execution/capabilities');
    if(caps.configuredTemplates.some(t=>t.id===S.templateId&&t.ready)&&same((await d.nodeState()).template,j.template)){available=true;break;}
    await d.delay(2000);
   }
   need(available,'MAIN_REPAIR_EXECUTOR_NOT_READY');
   j.taskPayload??=taskPayload(j,report);j.taskPayloadSHA=sha(j.taskPayload);
   j.intents.create??={commandId:d.randomUUID(),scope:'personal',expectedVersion:0,payload:j.taskPayload};await save();
   if(!j.taskId){const task=(await api('/api/v1/tasks/commands/create',j.intents.create)).data;j.taskId=task.id;assertTask(task,j);await save();}
   const task=assertTask(await get('/api/v1/tasks/'+j.taskId),j);
   need(['queued','waitingQuota','waitingResource','waitingUser'].includes(task.status),'MAIN_REPAIR_PREPARED_TASK_NOT_STARTABLE');
   if(!j.intents.start){j.intents.start={commandId:d.randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId:j.taskId,reason:'真实终态报告、独立清理及原模板恢复后：新公开副本单轮定点修复；费用只记账，独立复验另行执行。'}};j.runId=expectedRunId(j.intents.start.commandId);await save();}
   const before=await quiet(j.template);
   need(before.host.originBound===true&&before.host.candidate?.sha256===S.baselineSHA&&before.host.candidate.files===S.files&&same(before.host.source,j.copy.source),'MAIN_REPAIR_PRE_DISPATCH_SOURCE_CHANGED');
   need(j.diagnosis.sourceFiles.every(e=>before.host.sourceFiles?.[e.path]===e.sha256),'MAIN_REPAIR_DIAGNOSIS_SOURCE_CHANGED');
   j.dispatchAttemptedAt=iso(d);j.phase='dispatch-attempted';await save();
   const receipt=(await api('/api/v1/tasks/commands/start',j.intents.start)).data;need(receipt.executionRequest?.id===j.runId,'MAIN_REPAIR_RUN_ID_MISMATCH');
   const actual=await readRun();need(actual,'MAIN_REPAIR_DISPATCH_RECONCILIATION_REQUIRED');await verifyRun(actual);j.started=true;j.phase='started';await save();
  }
 }
 const run=await readRun();if(run)await verifyRun(run);else need(!j.dispatchAttemptedAt,'MAIN_REPAIR_DISPATCH_RECONCILIATION_REQUIRED');
 if(action==='restore'){
  // A signed late cancellation can justify restoring an idle executor, never acceptance or success.
  if(run)need(terminal.has(run.status)&&run.result?.source==='signed-agent'&&(run.result.lateEvidenceOnly!==true||run.status==='cancelled'),'MAIN_REPAIR_TERMINAL_REQUIRED');
  await quiet();
  if(!run&&j.taskId){
   const task=assertTask(await get('/api/v1/tasks/'+j.taskId),j);
   if(task.status!=='cancelled'){
    j.intents.cancel??={commandId:d.randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId:j.taskId,reason:'本批尚未派发：取消本次准备任务，恢复原模板并保留准备记录。'}};await save();
    await api('/api/v1/tasks/commands/cancel',j.intents.cancel);
    need((await get('/api/v1/tasks/'+j.taskId)).status==='cancelled','MAIN_REPAIR_PREPARED_TASK_CANCEL_UNCONFIRMED');
   }
  }
  j.restoreAttemptedAt??=iso(d);await save();await d.putCentral(api,j.template,j.originalTemplate);
  const node=await d.nodeState();if(same(node.template,j.template))await d.patchNode(j.template,j.originalTemplate,j.job);else need(same(node.template,j.originalTemplate),'MAIN_REPAIR_RESTORE_CONFLICT');
  const state=await quiet(j.originalTemplate);j.restored=true;j.phase='restored';j.sourceAfter=state.host.source;j.restoredAt=iso(d);await save();
 }
 await globalProfile();const observed=await host();
 return {at:iso(d),action,projectId:S.projectId,taskId:j.taskId??null,runId:j.runId??null,workspace:S.workspace,baselineRunId:j.baseline.runId,baselineSHA:S.baselineSHA,terminalReportSHA:j.baseline.reportSHA,model:S.model,costPolicy:S.costPolicy,status:run?.status??'prepared',signed:run?.result?.source==='signed-agent',outcome:run?.result?.outcome??null,lateEvidenceOnly:run?.result?.lateEvidenceOnly===true,stopRequested:run?.stopRequested===true,usage:safeUsage(run?.result?.usage),restored:j.restored===true,validationConfigured:false,productAccepted:false,oldProfileUnchanged:true,sourceMainObservedUnchanged:observed.source.sha256===S.baselineSHA,sourceMainMetadataUnchanged:same(observed.source,j.sourceBefore),candidateFingerprint:observed.candidate?.sha256??null,modelExecutionOnly:true};
}
function safeUsage(v){if(!v)return null;return Object.fromEntries(['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','usageComplete','costUSD','knownCostUSD','costKind','costComplete'].filter(k=>typeof v[k]==='number'||typeof v[k]==='boolean'||['provider-reported','catalog-estimate'].includes(v[k])).map(k=>[k,v[k]]));}
async function saveJournal(j){
 await mkdir(dirname(S.journalPath),{recursive:true});const tmp=S.journalPath+'.'+randomUUID()+'.tmp';let handle;
 try{handle=await open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(j,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(tmp,S.journalPath);}finally{await handle?.close();await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function safeReadFile(path,encoding){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=4*1024*1024,'MAIN_REPAIR_LOCAL_FILE_INVALID');return readFile(path,encoding);}
const defaultHostState=(mode,j)=>JSON.parse(remote(lanProfile,'jarvis-101',python({...S,mode,job:j?.job??null,agentId:j?.nodeAgentId??null,sourcePaths:j?.diagnosis?.sourceFiles.map(e=>e.path)??[]},repairHostProgram),true,{timeoutMs:180000}));
const runTemplateProgram=String.raw`
import sqlite3,json,hashlib
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 row=c.execute('SELECT json FROM execution_runs WHERE id=?',(p['runId'],)).fetchone()
 if row is None:raise RuntimeError('MAIN_REPAIR_RUN_MISSING')
 v=json.loads(row[0])
 if v.get('id')!=p['runId'] or v.get('projectId')!=p['projectId'] or v.get('machineId')!=p['machineId'] or v.get('workspace')!=p['workspace'] or p.get('taskId') is not None and v.get('taskId')!=p['taskId']:raise RuntimeError('MAIN_REPAIR_RUN_ROW_SCOPE_CHANGED')
 print(json.dumps({'sha256':hashlib.sha256(json.dumps(v['template'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()}))
finally:c.close()
`;
 const defaultRunTemplateSHA=(runId,{workspace=S.workspace,taskId}={})=>{
  need([S.source,S.workspace].includes(workspace)&&/^[a-f0-9]{40}$/.test(runId),'MAIN_REPAIR_RUN_ROW_SCOPE_CHANGED');
  return JSON.parse(primary(python({runId,projectId:S.projectId,machineId:S.machineId,workspace,taskId},runTemplateProgram))).sha256;
 };
export function parseRepairArguments(args){
 const action=args[0]??'inspect';need(['inspect','start','check','restore'].includes(action),'MAIN_REPAIR_ACTION_INVALID');const options={action};
 for(const arg of args.slice(1)){const m=/^--(cleanup-proof|diagnosis|baseline-version)=([^=]+)$/.exec(arg),key=m&&({'cleanup-proof':'cleanupPath',diagnosis:'diagnosisPath','baseline-version':'baselineVersion'})[m[1]];need(m&&!Object.hasOwn(options,key),'MAIN_REPAIR_ARGUMENT_INVALID');options[key]=m[2];}
 if(options.baselineVersion)need(Object.hasOwn(approvedBaselines,options.baselineVersion),'MAIN_REPAIR_BASELINE_VERSION_INVALID');
 need(action==='start'||(!options.cleanupPath&&!options.diagnosisPath),'MAIN_REPAIR_ARGUMENT_INVALID');return options;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let lock,options,j,result;try{
  options=parseRepairArguments(process.argv.slice(2));await mkdir(dirname(S.journalPath),{recursive:true});
  lock=await open(S.journalPath+'.lock','wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));await lock.sync();
  try{const value=JSON.parse(await safeReadFile(S.journalPath,'utf8'));assertJournal(value);j=value;}catch(e){if(e.code!=='ENOENT')throw e;}
  result=await withPlatform(({api})=>runFactoryMainRepair(options,{api,readFile:safeReadFile,saveJournal:async value=>{j=value;await saveJournal(value);},hostState:async(mode,value)=>defaultHostState(mode,{...value,nodeAgentId:value?.nodeAgentId??(await nodeState()).agentId}),nodeState,queueState,patchNode,putCentral,runTemplateSHA:defaultRunTemplateSHA}));
 }catch(error){result=failureReceipt(error,options?.action??'invalid',j);process.exitCode=1;}
 finally{if(lock){await lock.close();await unlink(S.journalPath+'.lock');}}
 await mkdir(S.artifactDirectory,{recursive:true});const output=S.artifactDirectory+'/main-repair-'+(options?.action??'invalid')+'-'+Date.now()+'-'+randomUUID()+'.json';const handle=await open(output,'wx',0o644);
 try{await handle.writeFile(JSON.stringify(result,null,2)+'\n');await handle.sync();}finally{await handle.close();}
 console.log(JSON.stringify({output,...result}));
}
