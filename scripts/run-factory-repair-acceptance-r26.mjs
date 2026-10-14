/** Fixed candidate validation. Importing does no IO; only explicit start dispatches. */
import {readFile,mkdir,open,rename,unlink,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {nodeState,queueState,patchNode,putCentral} from './run-factory-supervision-probe.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
import {repairScope as S,assertActualRun as assertNativeRun,canonical,sha} from './run-factory-main-repair-r26.mjs';
import {verifierScope as V,fixedToolSHA,prepareRepairVerifier,repairVerifierHostReadProgram} from './prepare-factory-repair-verifier-r26.mjs';
import {installScope,assertInstallJournal,collectRepairVerifierEvidence,storedNativeReadProgram,defaultReadRoot,defaultReadPrimary} from './install-factory-repair-verifier-r26.mjs';

export const acceptanceScope=Object.freeze({projectId:S.projectId,machineId:S.machineId,templateId:S.templateId,ownerId:S.ownerId,source:S.source,workspace:S.workspace,parent:S.parent,entry:V.entry,configRoot:V.configRoot,evidenceRoot:V.evidenceRoot,sudoRule:V.sudoRule,nativeRunId:installScope.nativeRunId,nativeTaskId:installScope.nativeTaskId,journalPath:'.jarvis-dev/maintenance/factory-repair-acceptance-r26.json',artifactDirectory:S.artifactDirectory});
// This observed candidate was independently audited and explicitly selected for partial testing.
// A later candidate needs a new reviewed entry, rather than being silently blessed by freshness.
export const reviewedCandidate=Object.freeze({fingerprint:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',metadataSHA256:'627d3db589bc56dbbdd1fc2510cc738f78297551d8ecc12648a80fd081bdc1d0',files:605,originSHA256:'c7acc5bcdd5b9f3453ff5879bcd26d39177fa58084a0c665456d43d064788632',auditPath:'artifacts/software-factory/acceptance-r26/native-repair-candidate-audit-1791737452480-24f08f01-fa08-46e0-9b13-27231cf64e91.json',auditSHA256:'ba3c887c1244217bab8f9a6662ccb077cf0dda27d5974ee5a0c0b81f095c8950'});
export const originalPrototypeSuites=Object.freeze(['syntax','logic','task-data','design-catalog','customer-prototype','customer-authority-boundary','customer-state-kernel','customer-route-matrix','customer-privacy-projection','prototype-commands','prototype-effects-integration','design-baseline','design-boundary','prototype-content','ui-scoring','selftest','selftest-boundary','build-artifact','merge-basis','contract-hardening','main-integration-boundary','attention-auto','autopilot-boundary','review-cases','boundary','failure-matrix','workflow','regression','visual','design-visual']);
const A=acceptanceScope,H=/^[a-f0-9]{64}$/,U=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TERMINAL=new Set(['succeeded','failed','cancelled','timeout','interrupted','round-limit','budget-exhausted','awaiting-cost']);
const same=(a,b)=>canonical(a)===canonical(b),need=(v,c)=>{if(!v)throw Error(c);},iso=d=>new Date(d.now()).toISOString();
// Active SQL lease/updatedAt projections change during normal heartbeats. Terminal records stay exact.
export function runObservationSHA(run){return TERMINAL.has(run?.status)?sha(run):sha(Object.fromEntries(['id','domain','kind','scope','objectId','taskId','projectId','machineId','executorId','workspace','agentId','goal','criteria','maxRounds','timeoutSec','budgetUSD','purpose','template','status','stopRequested','result'].map(k=>[k,run?.[k]])));}
export function installationPathAllowed(path){return /^artifacts\/software-factory\/acceptance-r26\/repair-fixed-verifier-installation-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/.test(path??'');}
export function fixedRepairTemplate(){return {id:S.templateId,machineId:S.machineId,engine:'fixed',program:'/opt/jarvis-development/node/bin/node',args:['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs'],workspaceRoot:S.parent,maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n',V.entry,'{workspace}','{runId}'],timeoutSec:3600}};}
export function assertInstalledReceipt(m,native,{allowPartialTerminal=false}={}){
 assertInstallJournal(native);const b=m?.binding,r=m?.rootReadback;
 need(m?.schemaVersion===1&&m.kind==='software-factory-repair-fixed-verifier-installation'&&m.execute===true&&m.installed===true&&m.installerImplemented===true&&m.projectId===S.projectId&&m.nativeRunId===native.runId&&m.nativeTaskId===native.taskId&&m.productAccepted===false&&m.modelsInvoked===false&&m.validationDispatched===false&&m.fullValidationExecuted===false,'REPAIR_ACCEPTANCE_ACTUAL_INSTALLATION_REQUIRED');
 need(same(m.scope,{source:S.source,workspace:S.workspace,job:native.job,entry:V.entry,configRoot:V.configRoot,evidenceRoot:V.evidenceRoot,sudoRule:V.sudoRule})&&same(m.fixedTools,fixedToolSHA)&&same(m.coordinatorPatch,{version:'r26-4-summary-scan',originalSHA256:fixedToolSHA['project-autonomy-fa01-coordinator.py']}),'REPAIR_ACCEPTANCE_INSTALLATION_SCOPE_CHANGED');
 need(b?.journalSHA256===sha(native)&&b.runId===native.runId&&b.taskId===native.taskId&&[b.resultSHA256,b.runRecordSHA256,b.candidateFingerprint,b.candidateMetadataSHA256,b.originSHA256,m.wrapperSHA256].every(v=>H.test(v??''))&&b.candidateFingerprint!==S.baselineSHA&&b.productAccepted===false&&b.modelExecutionOnly===true,'REPAIR_ACCEPTANCE_INSTALLATION_BINDING_CHANGED');
 need(b.candidateFingerprint===reviewedCandidate.fingerprint&&b.candidateMetadataSHA256===reviewedCandidate.metadataSHA256&&b.originSHA256===reviewedCandidate.originSHA256,'REPAIR_ACCEPTANCE_CANDIDATE_NOT_REVIEWED');
 need(typeof b.partialNative==='boolean'&&m.partialNative===b.partialNative&&m.nativeStatus===b.nativeStatus&&m.nativeOutcome===b.nativeOutcome,'REPAIR_ACCEPTANCE_NATIVE_PARTIAL_BINDING_CHANGED');
 if(b.partialNative)need(allowPartialTerminal===true&&m.allowPartialTerminal===true&&b.nativeStatus==='round-limit'&&b.nativeOutcome==='round-limit','REPAIR_ACCEPTANCE_PARTIAL_OPT_IN_REQUIRED');
 else need(b.nativeStatus==='succeeded'&&b.nativeOutcome==='success','REPAIR_ACCEPTANCE_NATIVE_SUCCESS_REQUIRED');
 need(r?.installed===true&&r.entry===V.entry&&r.configRoot===V.configRoot&&r.evidenceRoot===V.evidenceRoot&&r.sudoRule===V.sudoRule&&r.wrapperSHA256===m.wrapperSHA256&&r.sourceFingerprint===b.candidateFingerprint&&r.sourceMetadataSHA256===b.candidateMetadataSHA256&&r.originSHA256===b.originSHA256&&r.partialNative===b.partialNative&&r.nativeStatus===b.nativeStatus&&r.nativeOutcome===b.nativeOutcome&&r.oldFilesUnchanged===true&&r.mainSourceUnchanged===true&&r.nodeACKIdle===true&&r.nodeTemplateRestored===true&&r.visudoVerified===true&&r.productAccepted===false&&r.modelsInvoked===false&&r.validationDispatched===false,'REPAIR_ACCEPTANCE_INSTALLATION_READBACK_CHANGED');
 return m;
}
export function assertAcceptanceJournal(j){
 need(j?.version===1&&same(j.scope,A)&&/^[a-f0-9]{32}$/.test(j.job??'')&&/^[a-f0-9]{32}$/.test(j.nativeJob??'')&&U.test(j.nodeAgentId??'')&&installationPathAllowed(j.installation?.path)&&H.test(j.installation.sha256??'')&&H.test(j.nativeJournalSHA256??'')&&H.test(j.initialProfileSHA256??'')&&j.originalTemplate?.id===S.templateId&&j.originalTemplate.engine==='claude'&&j.originalTemplateSHA256===sha(j.originalTemplate)&&same(j.fixedTemplate,fixedRepairTemplate())&&j.fixedTemplateSHA256===sha(j.fixedTemplate)&&['prepared','dispatch-attempted','started','restored'].includes(j.phase)&&j.intents&&H.test(j.otherCentralTemplatesSHA256??'')&&H.test(j.otherNodeTemplatesSHA256??'')&&j.mainBefore?.sha256===S.baselineSHA&&j.mainBefore.files===S.files&&H.test(j.mainBefore.metadataSHA??'')&&H.test(j.candidateBefore?.sha256??'')&&H.test(j.candidateBefore.metadataSHA??'')&&j.expectedInstalled&&Object.values(j.expectedInstalled).every(v=>H.test(v))&&j.oldImmutable&&Object.values(j.oldImmutable).every(v=>H.test(v)),'REPAIR_ACCEPTANCE_JOURNAL_INVALID');
 need(j.nativeBinding?.runId===A.nativeRunId&&j.nativeBinding.taskId===A.nativeTaskId&&j.nativeBinding.candidateFingerprint===j.candidateBefore.sha256&&j.candidateBefore.sha256===reviewedCandidate.fingerprint&&j.nativeBinding.candidateMetadataSHA256===j.candidateBefore.metadataSHA&&j.candidateBefore.metadataSHA===reviewedCandidate.metadataSHA256&&j.candidateBefore.files===reviewedCandidate.files&&j.nativeBinding.journalSHA256===j.nativeJournalSHA256&&typeof j.allowPartialTerminal==='boolean','REPAIR_ACCEPTANCE_JOURNAL_NATIVE_BINDING_CHANGED');
 if(j.nativeBinding.partialNative)need(j.allowPartialTerminal===true,'REPAIR_ACCEPTANCE_PARTIAL_OPT_IN_REQUIRED');
 if(j.intents.create)need(U.test(j.intents.create.commandId??'')&&j.intents.create.scope==='personal'&&j.intents.create.expectedVersion===0&&same(j.intents.create.payload,j.taskPayload)&&j.taskPayloadSHA256===sha(j.taskPayload)&&j.taskPayload.projectId===S.projectId&&j.taskPayload.machineId===S.machineId&&j.taskPayload.agent===S.templateId&&j.taskPayload.worktree===S.workspace&&j.taskPayload.mode==='managed'&&j.taskPayload.budget===1&&j.taskPayload.retryLimit===0&&same(j.taskPayload.skillIds,[]),'REPAIR_ACCEPTANCE_CREATE_INTENT_CHANGED');
 for(const kind of ['start','cancel'])if(j.intents[kind])need(U.test(j.intents[kind].commandId??'')&&j.intents[kind].scope==='personal'&&Number.isSafeInteger(j.intents[kind].expectedVersion)&&j.intents[kind].payload.taskId===j.taskId,'REPAIR_ACCEPTANCE_COMMAND_INTENT_CHANGED');
 if(j.intents.start)need(j.runId===expectedRunId(j.intents.start.commandId),'REPAIR_ACCEPTANCE_RUN_ID_CHANGED');
 if(j.dispatchAttemptedAt)need(j.taskId&&j.intents.start&&Number.isFinite(Date.parse(j.dispatchAttemptedAt)),'REPAIR_ACCEPTANCE_DISPATCH_INTENT_MISSING');
 if(j.started)need(j.dispatchAttemptedAt&&j.taskId&&j.runId,'REPAIR_ACCEPTANCE_DISPATCH_INTENT_MISSING');
 if(j.restored)need(j.phase==='restored'&&Number.isFinite(Date.parse(j.restoredAt))&&same(j.sourceAfter,j.mainBefore)&&same(j.candidateAfter,j.candidateBefore),'REPAIR_ACCEPTANCE_RESTORE_UNCONFIRMED');
 return j;
}
export function acceptanceTaskPayload(d){return {title:'AT-01R · R26 定点修复候选独立完整复验',projectId:S.projectId,machineId:S.machineId,agent:S.templateId,mode:'managed',worktree:S.workspace,budget:1,retryLimit:0,deadline:new Date(d.now()+75*60000).toISOString(),skillIds:[],goal:'对本次真实单轮原生修复的独立公开副本执行固定无模型完整复验。部分原生轮次终态仅作为明确选择的候选来源，不构成修复成功或产品通过。使用实际安装的 r26-repair 入口、固定候选源码指纹和独立快照，执行原有45测试文件、30原型suite、90%行/80%分支覆盖率、类型检查、构建、交付包及隔离运行回读。保留失败、超时、未执行及未知；原main、旧R22及所有既有模板/报告保持。费用与Token按实际记账，不设置消费上限，本入口禁止模型且预期实际费用/Token为零。',criteria:'实际任务/runId、已配对节点签名终态、SQL冻结模板及固定候选指纹一致；原45/30/90/80标准不降低，不把测试/检查/suite分母互加。逐项真实结果、独立资源清理和源码前后不变需另行核对。模型声明和执行结束不得替代验收；本工具不自动验收产品、不发布、不启动全局持续监督。'};}
export function assertAcceptanceTask(task,j,{dispatched=false}={}){
 need(task?.id===j.taskId&&task.ownerId===S.ownerId&&task.scope==='personal'&&task.projectId===S.projectId&&task.machineId===S.machineId&&task.agent===S.templateId&&task.worktree===S.workspace&&task.mode==='managed'&&task.budget===1&&task.retryLimit===0&&same(task.skillIds??[],[])&&task.goal===j.taskPayload.goal&&task.criteria===j.taskPayload.criteria&&task.title===j.taskPayload.title&&task.deadline===j.taskPayload.deadline,'REPAIR_ACCEPTANCE_TASK_SCOPE_CHANGED');
 need(dispatched?task.executionRequest?.id===j.runId:!task.executionRequest,'REPAIR_ACCEPTANCE_TASK_RUN_CHANGED');return task;
}
export function assertAcceptanceRun(run,task,j){
 assertAcceptanceJournal(j);assertAcceptanceTask(task,j,{dispatched:true});
 need(run?.id===j.runId&&run.domain==='tasks'&&run.kind==='development'&&run.scope==='personal'&&run.objectId===j.taskId&&run.taskId===j.taskId&&run.projectId===S.projectId&&run.machineId===S.machineId&&run.executorId===S.templateId&&run.workspace===S.workspace&&(!run.agentId||run.agentId===j.nodeAgentId)&&run.goal===j.taskPayload.goal&&run.criteria===j.taskPayload.criteria&&run.maxRounds===1&&run.timeoutSec===j.fixedTemplate.timeoutSec&&run.budgetUSD===1&&!run.purpose,'REPAIR_ACCEPTANCE_ACTUAL_RUN_CHANGED');
 if(run.template!==undefined)need(same(run.template,j.fixedTemplate),'REPAIR_ACCEPTANCE_FROZEN_RUN_TEMPLATE_CHANGED');return run;
}
export function zeroFixedUsage(v){return !!v&&['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','costUSD'].every(k=>v[k]===0)&&v.usageComplete===true&&v.provider==='fixed-test'&&v.model==='no-model'&&v.costKind==='provider-reported'&&(v.knownCostUSD===undefined||v.knownCostUSD===0);}
export function validationMetadata(run,j){
 const v=run?.result?.validation;
 if(!v?.autonomyReportJson)return {present:false,validationExitCode:Number.isInteger(v?.exitCode)?v.exitCode:null,fullValidationConfirmed:false};
 const raw=v.autonomyReportJson,digest=v.autonomyReportSha256;
 need(typeof raw==='string'&&Buffer.byteLength(raw)<=2*1024*1024&&H.test(digest??'')&&sha(raw)===digest,'REPAIR_ACCEPTANCE_TERMINAL_REPORT_HASH_INVALID');
 let report;try{report=JSON.parse(raw);}catch{throw Error('REPAIR_ACCEPTANCE_TERMINAL_REPORT_INVALID');}
 need(report.schemaVersion===1&&report.kind==='project-autonomy-validation'&&report.runId===j.runId&&report.workspace===S.workspace&&report.workPackage==='FA-01'&&report.goalSpecHash===S.goalSHA&&report.sourceFingerprint===j.candidateBefore.sha256&&report.simulated===false&&['pass','fail'].includes(report.status)&&typeof report.sourceStable==='boolean'&&Array.isArray(report.checks)&&report.checks.length>0&&report.checks.length<=1000&&Array.isArray(report.artifacts)&&report.artifacts.length<=1000,'REPAIR_ACCEPTANCE_TERMINAL_REPORT_BINDING_CHANGED');
 const ids=new Set(),counts={total:report.checks.length,passed:0,failed:0,skipped:0,unknown:0},tests=[],prototypes=[],prototypeGuards=[],additionalPrototypes=[],suiteIds=new Set(originalPrototypeSuites.map(s=>'prototype-'+s));
 for(const c of report.checks){
  need(typeof c.id==='string'&&/^[A-Za-z0-9._-]{1,150}$/.test(c.id)&&!ids.has(c.id)&&['pass','fail','skip','unknown'].includes(c.status)&&typeof c.executed==='boolean'&&typeof c.required==='boolean'&&(c.exitCode===null||Number.isInteger(c.exitCode))&&H.test(c.evidenceSha256??''),'REPAIR_ACCEPTANCE_TERMINAL_CHECK_INVALID');ids.add(c.id);counts[{pass:'passed',fail:'failed',skip:'skipped',unknown:'unknown'}[c.status]]++;
  if(c.tests){need(['total','passed','failed','skipped','unknown'].every(k=>Number.isSafeInteger(c.tests[k])&&c.tests[k]>=0)&&c.tests.total>0&&c.tests.total===c.tests.passed+c.tests.failed+c.tests.skipped+c.tests.unknown,'REPAIR_ACCEPTANCE_TEST_COUNTS_INVALID');tests.push({checkId:c.id,...Object.fromEntries(['total','passed','failed','skipped','unknown'].map(k=>[k,c.tests[k]]))});}
  if(suiteIds.has(c.id))prototypes.push({id:c.id,status:c.status,executed:c.executed});
  else if(c.id==='prototype-baseline')prototypeGuards.push({id:c.id,status:c.status,executed:c.executed});
  else if(c.id.startsWith('prototype-'))additionalPrototypes.push({id:c.id,status:c.status,executed:c.executed});
 }
 for(const a of report.artifacts)need(typeof a.path==='string'&&a.path.length<=2048&&!/^[\\/]|[\x00-\x1f\\]/.test(a.path)&&!a.path.split('/').includes('..')&&H.test(a.sha256??'')&&Number.isSafeInteger(a.bytes)&&a.bytes>=0,'REPAIR_ACCEPTANCE_REPORT_ARTIFACT_INVALID');
 return {present:true,sha256:digest,bytes:Buffer.byteLength(raw),status:report.status,sourceFingerprint:report.sourceFingerprint,sourceStable:report.sourceStable,validationExitCode:Number.isInteger(v.exitCode)?v.exitCode:null,checks:counts,testGroups:tests,prototypeChecks:{total:originalPrototypeSuites.length,observed:prototypes.length,passed:prototypes.filter(c=>c.status==='pass').length,failed:prototypes.filter(c=>c.status==='fail').length,skipped:prototypes.filter(c=>c.status==='skip').length,unknown:originalPrototypeSuites.length-prototypes.length+prototypes.filter(c=>c.status==='unknown').length,missing:originalPrototypeSuites.length-prototypes.length},prototypeGuardChecks:prototypeGuards,additionalPrototypeChecks:additionalPrototypes,artifactCount:report.artifacts.length,fullValidationConfirmed:report.sourceStable===true,rawReportExported:false};
}

/** Root read only: trusted helper reads public files; installed programs are hashed, never run. */
export function acceptanceHostReadProgram(){
 const source=repairVerifierHostReadProgram(),at=source.lastIndexOf('print(json.dumps(');need(at>0,'REPAIR_ACCEPTANCE_HOST_TEMPLATE_CHANGED');
 return source.slice(0,at)+String.raw`
def installed():
 paths=[(p['entry'],0o755),(p['configRoot']+'/baseline.json',0o600),(p['configRoot']+'/policy.json',0o600),(p['sudoRule'],0o440)]
 bodies=[]
 for name,mode in paths:
  q=trusted(Path(name));s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_mode&0o777==mode,'REPAIR_ACCEPTANCE_INSTALLED_FILE_UNTRUSTED');bodies.append(private_read(q))
 baseline=json.loads(bodies[1]);policy=json.loads(bodies[2])
 need(baseline['workspace']==p['workspace'] and baseline['sourceFingerprintObserved']==p['candidateFingerprint'] and policy['workspace']==p['workspace'] and policy['sourceFingerprint']==p['candidateFingerprint'] and policy['evidenceRoot']==p['evidenceRoot'],'REPAIR_ACCEPTANCE_INSTALLED_SOURCE_CHANGED')
 need(len(baseline['requiredTestFiles'])==45 and len(baseline['requiredPrototypeSuites'])==30 and baseline['minimumCoverage']['lines']>=90 and baseline['minimumCoverage']['branches']>=80,'REPAIR_ACCEPTANCE_DENOMINATOR_CHANGED')
 need(bodies[3]==b'superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-msf-main-acceptance-r26-repair *\n','REPAIR_ACCEPTANCE_SUDO_RULE_CHANGED')
 return dict(zip(['wrapperSHA256','baselineSHA256','policySHA256','sudoRuleSHA256'],[hashlib.sha256(b).hexdigest() for b in bodies]))
def node_templates():
 q=Path('/var/lib/jarvis-development/101/config.json');trusted(q.parent)
 fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid in [0,account.pw_uid] and s.st_mode&0o077==0 and 0<s.st_size<=2097152,'REPAIR_ACCEPTANCE_NODE_CONFIG_UNTRUSTED')
  data=b''
  while len(data)<=2097152:
   part=os.read(fd,min(65536,2097153-len(data)))
   if not part:break
   data+=part
  z=os.fstat(fd);fields=lambda v:(v.st_dev,v.st_ino,v.st_uid,v.st_gid,v.st_mode,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
  need(fields(s)==fields(z) and len(data)==s.st_size and fields(z)==fields(q.lstat()),'REPAIR_ACCEPTANCE_NODE_CONFIG_READ_CHANGED')
 finally:os.close(fd)
 cfg=json.loads(data);need(cfg.get('machineId')==p['machineId'] and cfg.get('agentId')==p['agentId'] and isinstance(cfg.get('templates'),list),'REPAIR_ACCEPTANCE_NODE_IDENTITY_CHANGED')
 matches=[v for v in cfg['templates'] if v.get('id')==p['templateId']];need(len(matches)==1,'REPAIR_ACCEPTANCE_NODE_TEMPLATE_INVALID')
 hashv=lambda v:hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
 other=[v for v in cfg['templates'] if v.get('id')!=p['templateId']];need(len({v['id'] for v in other})==len(other),'REPAIR_ACCEPTANCE_OTHER_NODE_TEMPLATES_INVALID')
 return {'targetSHA256':hashv(matches[0]),'otherTemplatesSHA256':hashv(sorted(other,key=lambda v:v['id'])),'otherTemplateHashes':{v['id']:hashv(v) for v in other}}
installed_before=installed();node_templates_before=node_templates()
candidate_fd=h.open_directory(p['workspace'])
try:
 s=os.fstat(candidate_fd);need(identity(candidate_fd)==origin['identity'] and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and s.st_mode&0o077==0,'REPAIR_ACCEPTANCE_CANDIDATE_ROOT_CHANGED')
finally:os.close(candidate_fd)
source_final,_=source_state(p['source']);candidate_final,_=source_state(p['workspace'])
need(source_final==main_after and candidate_final==candidate_after,'REPAIR_ACCEPTANCE_SOURCE_READ_CHANGED')
installed_after=installed();node_templates_after=node_templates();node_final=quiet()
need(installed_before==installed_after and node_templates_before==node_templates_after and node_after==node_final,'REPAIR_ACCEPTANCE_INSTALLED_OR_NODE_READ_CHANGED')
need(private_read(prep/'origin.json')==origin_bytes and immutable()==immutable_after and {name:hashlib.sha256(private_read(tools_dir/name)).hexdigest() for name in p['fixedTools']}==tools,'REPAIR_ACCEPTANCE_IMMUTABLE_READ_CHANGED')
candidate_fd=h.open_directory(p['workspace'])
try:
 s=os.fstat(candidate_fd);need(identity(candidate_fd)==origin['identity'] and s.st_uid==account.pw_uid and s.st_gid==account.pw_gid and s.st_mode&0o077==0,'REPAIR_ACCEPTANCE_CANDIDATE_ROOT_CHANGED')
finally:os.close(candidate_fd)
print(json.dumps({'observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'helperVerified':True,'source':source_final,'candidate':candidate_final,'candidateBefore':candidate_before,'candidateAfter':candidate_final,'originBound':bound,'origin':{**origin,'rootOwned':True,'sha256':hashlib.sha256(origin_bytes).hexdigest()},'quiet':node_final,'tools':tools,'toolsAfter':tools,'oldBaselineSHA':immutable_after['/etc/jarvis-development/project-autonomy/baseline.json'],'oldPolicySHA':immutable_after['/etc/jarvis-development/project-autonomy/FA-01.json'],'oldWrapperSHA':immutable_after['/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'],'receiptSHA':immutable_after[str(tools_dir/'factory-no-model-receipt-r26.mjs')],'immutableBefore':immutable_before,'immutableAfter':immutable_after,'coordinatorPatch':{'version':'r26-4-summary-scan','originalSHA256':tools['project-autonomy-fa01-coordinator.py']},'installed':installed_after,'nodeTemplates':node_templates_after,'mutationsPerformed':False,'rawLogsExported':False}))
`;
}
export const acceptanceStoredRunProgram=String.raw`
import sqlite3,json,hashlib,datetime
def need(v,c):
 if not v:raise RuntimeError(c)
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 row=c.execute('SELECT json,status,agent_id FROM execution_runs WHERE id=?',(p['runId'],)).fetchone();need(row is not None,'REPAIR_ACCEPTANCE_STORED_RUN_MISSING');v=json.loads(row[0])
 for key in ['id','taskId','objectId','projectId','machineId','workspace','executorId','scope','domain','kind']:
  need(v.get(key)==p['expected'][key],'REPAIR_ACCEPTANCE_STORED_RUN_SCOPE_CHANGED')
 need(not row[2] or row[2]==p['nodeAgentId'],'REPAIR_ACCEPTANCE_STORED_RUN_AGENT_CHANGED')
 print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':row[1],'agentId':row[2],'result':v.get('result'),'frozenTemplateSHA256':hashlib.sha256(json.dumps(v['template'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'storedRecordSHA256':hashlib.sha256(row[0].encode()).hexdigest(),'readOnly':True}))
finally:c.close()
`;
export function assertAcceptanceHost(h,j,native,{idle=false}={}){
 need(h?.helperVerified===true&&h.mutationsPerformed===false&&h.rawLogsExported===false&&same(h.source,j.mainBefore)&&same(h.source,native.sourceBefore)&&same(h.source,native.sourceAfter)&&same(h.candidate,j.candidateBefore)&&same(h.candidate,h.candidateBefore)&&same(h.candidate,h.candidateAfter)&&h.source.stable===true&&h.candidate.stable===true,'REPAIR_ACCEPTANCE_SOURCE_METADATA_CHANGED');
 need(h.originBound===true&&h.origin?.rootOwned===true&&h.origin.version===1&&h.origin.sha256===j.nativeBinding.originSHA256&&h.origin.job===j.nativeJob&&h.origin.phase==='ready'&&h.origin.workspace===S.workspace&&h.origin.parent===S.parent&&h.origin.baselineSHA===S.baselineSHA&&same(h.origin.identity,h.candidate.identity)&&same(h.origin.identity,native.copy.candidate.identity)&&same(h.origin.parentIdentity,native.copy.origin?.parentIdentity??h.origin.parentIdentity),'REPAIR_ACCEPTANCE_ORIGIN_CHANGED');
 need(same(h.tools,fixedToolSHA)&&same(h.tools,h.toolsAfter)&&same(h.immutableBefore,h.immutableAfter)&&same(h.immutableAfter,j.oldImmutable)&&h.oldBaselineSHA===V.oldBaselineSHA&&h.oldPolicySHA===V.oldPolicySHA&&h.oldWrapperSHA===V.templateSHA&&h.receiptSHA===V.receiptSHA&&same(h.installed,j.expectedInstalled)&&h.nodeTemplates?.otherTemplatesSHA256===j.otherNodeTemplatesSHA256,'REPAIR_ACCEPTANCE_TOOLS_OR_OTHER_TEMPLATES_CHANGED');
 need(h.quiet?.active===true&&Array.isArray(h.quiet.children)&&h.quiet.counts&&['runs','deliveries','logs'].every(k=>Number.isSafeInteger(h.quiet.counts[k])&&h.quiet.counts[k]>=0),'REPAIR_ACCEPTANCE_NODE_STATE_INVALID');
 if(idle)need(!h.quiet.children.length&&same(h.quiet.counts,{runs:0,deliveries:0,logs:0}),'REPAIR_ACCEPTANCE_NODE_NOT_ACK_IDLE');return h;
}

/** Dependencies are injected in tests. Never import or execute candidate product files. */
export async function runFactoryRepairAcceptance(options={},deps){
 const d={now:()=>Date.now(),randomUUID,randomBytes,delay:ms=>new Promise(r=>setTimeout(r,ms)),...deps},action=options.action??'inspect';need(['inspect','start','check','restore'].includes(action),'REPAIR_ACCEPTANCE_ACTION_INVALID');
 const get=async path=>(await d.api(path)).data;let j=null;
 try{j=assertAcceptanceJournal(JSON.parse(await d.readLocal(A.journalPath,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
 const native=assertInstallJournal(JSON.parse(await d.readLocal(S.journalPath,'utf8'))),path=options.installationPath??j?.installation.path;
 need(installationPathAllowed(path),'REPAIR_ACCEPTANCE_INSTALLATION_PATH_REQUIRED');
 const allowPartialTerminal=options.allowPartialTerminal===true;
 if(j)need(j.installation.path===path&&j.nativeJob===native.job&&j.nativeJournalSHA256===sha(native)&&j.allowPartialTerminal===allowPartialTerminal,'REPAIR_ACCEPTANCE_FROZEN_INPUT_CHANGED');
 const manifestRaw=await d.readLocal(path,'utf8'),manifest=assertInstalledReceipt(JSON.parse(manifestRaw),native,{allowPartialTerminal});
 if(j)need(j.installation.sha256===sha(manifestRaw)&&same(j.nativeBinding,manifest.binding),'REPAIR_ACCEPTANCE_FROZEN_INSTALLATION_CHANGED');
 const save=async()=>{assertAcceptanceJournal(j);await d.saveJournal(j);};
 const centralTemplatesHash=config=>sha(config.templates.filter(t=>t.id!==S.templateId).sort((a,b)=>a.id.localeCompare(b.id)));
 const profileCheck=async()=>{const p=await get('/api/v1/projects/'+S.projectId+'/autonomy'),global=await get('/api/v1/execution/supervision');need(p.goalSpecHash===S.goalSHA&&p.config?.costPolicy==='record-only'&&global.supervised===false&&global.stopped===false&&!p.templateHashes?.[S.templateId]&&sha(p)===(j?.initialProfileSHA256??native.initialProfileSHA),'REPAIR_ACCEPTANCE_AUTHORIZED_SCOPE_CHANGED');return p;};
 const configCheck=async expected=>{const profile=await profileCheck(),config=await get('/api/v1/execution/config'),matches=config.templates?.filter(t=>t.id===S.templateId);need(matches?.length===1,'REPAIR_ACCEPTANCE_CENTRAL_TEMPLATE_INVALID');for(const [id,digest] of Object.entries(profile.templateHashes??{})){const entries=config.templates.filter(t=>t.id===id);need(entries.length===1&&sha(entries[0])===digest,'REPAIR_ACCEPTANCE_FROZEN_OTHER_TEMPLATE_CHANGED');}if(j)need(centralTemplatesHash(config)===j.otherCentralTemplatesSHA256,'REPAIR_ACCEPTANCE_OTHER_CENTRAL_TEMPLATES_CHANGED');const node=await d.nodeState();need(node.agentId===native.nodeAgentId&&node.unit?.ActiveState==='active'&&Number(node.unit.MainPID)>1,'REPAIR_ACCEPTANCE_NODE_IDENTITY_CHANGED');if(expected)need(same(matches[0],expected)&&same(node.template,expected),'REPAIR_ACCEPTANCE_TEMPLATE_CAS_CONFLICT');return {config,central:matches[0],node,profile};};
 const nativeCheck=async()=>{const run=await get('/api/v1/execution/runs/'+native.runId),task=await get('/api/v1/tasks/'+native.taskId);assertNativeRun(run,task,native);need(sha(run)===manifest.binding.runRecordSHA256&&sha(run.result)===manifest.binding.resultSHA256&&run.result.source==='signed-agent'&&run.agentId===native.nodeAgentId&&run.stopRequested!==true&&run.result.lateEvidenceOnly!==true&&run.result.exitCode===0&&run.result.validation==null,'REPAIR_ACCEPTANCE_NATIVE_TERMINAL_CHANGED');const stored=await d.readPrimary({runId:native.runId,taskId:native.taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,templateId:S.templateId,nodeAgentId:native.nodeAgentId,allowPartialTerminal},storedNativeReadProgram);need(stored.status===run.status&&stored.ingestedSignedAgentReceipt===true&&same(stored.result,run.result)&&sha(stored.frozenTemplate)===native.templateSHA,'REPAIR_ACCEPTANCE_NATIVE_STORED_BINDING_CHANGED');};
 const host=async idle=>{const h=await d.readRoot({...S,mode:'inspect',job:native.job,agentId:native.nodeAgentId,sourcePaths:[],fixedTools:fixedToolSHA,...V,candidateFingerprint:manifest.binding.candidateFingerprint},acceptanceHostReadProgram());return assertAcceptanceHost(h,j,native,{idle});};
 const verifyFrozenNode=(h,profile,config)=>{for(const [id,digest] of Object.entries(profile.templateHashes??{})){const t=config.templates.find(t=>t.id===id);if(t.machineId===S.machineId)need(h.nodeTemplates.otherTemplateHashes?.[id]===digest,'REPAIR_ACCEPTANCE_FROZEN_OTHER_NODE_TEMPLATE_CHANGED');}};
 const quiet=async expected=>{const c=await configCheck(expected),queue=await d.queueState();need(queue.fullTable===true&&queue.readOnly===true&&queue.allActive===0,'REPAIR_ACCEPTANCE_QUEUE_NOT_IDLE');const h=await host(true);need(h.nodeTemplates.targetSHA256===sha(c.node.template),'REPAIR_ACCEPTANCE_NODE_TEMPLATE_READ_CHANGED');verifyFrozenNode(h,c.profile,c.config);return {...c,host:h};};
 if(!j){
  need(['inspect','start'].includes(action),'REPAIR_ACCEPTANCE_JOURNAL_MISSING');
  const collected=await collectRepairVerifierEvidence(native,d,{allowPartialTerminal}),originalBytes=await d.readLocal('scripts/factory-main-acceptance-wrapper-r26-4.py'),prepared=prepareRepairVerifier(collected.e,originalBytes,collected.baseline,collected.policy,{now:d.now(),allowPartialTerminal});
  need(same(collected.binding,manifest.binding)&&prepared.manifest.wrapperSHA256===manifest.wrapperSHA256,'REPAIR_ACCEPTANCE_DEPLOYED_WRAPPER_NOT_APPROVED');
  const c=await configCheck(native.originalTemplate);
  const expectedInstalled={wrapperSHA256:manifest.wrapperSHA256,baselineSHA256:sha(JSON.stringify(prepared.config.baseline,null,2)+'\n'),policySHA256:sha(JSON.stringify(prepared.config.policy,null,2)+'\n'),sudoRuleSHA256:sha('superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-msf-main-acceptance-r26-repair *\n')};
  j={version:1,scope:A,job:d.randomBytes(16).toString('hex'),nativeJob:native.job,nodeAgentId:native.nodeAgentId,nativeJournalSHA256:sha(native),nativeBinding:manifest.binding,allowPartialTerminal,installation:{path,sha256:sha(manifestRaw)},initialProfileSHA256:sha(collected.e.profile??await profileCheck()),originalTemplate:native.originalTemplate,originalTemplateSHA256:native.originalTemplateSHA,fixedTemplate:fixedRepairTemplate(),fixedTemplateSHA256:sha(fixedRepairTemplate()),otherCentralTemplatesSHA256:centralTemplatesHash(c.config),otherNodeTemplatesSHA256:'0'.repeat(64),mainBefore:collected.e.host.source,candidateBefore:collected.e.host.candidate,expectedInstalled,oldImmutable:collected.e.host.immutableAfter,intents:{},createdAt:iso(d),phase:'prepared'};
  // The root readback independently observes all other node templates before freezing them.
  const h=await d.readRoot({...S,mode:'inspect',job:native.job,agentId:native.nodeAgentId,sourcePaths:[],fixedTools:fixedToolSHA,...V,candidateFingerprint:manifest.binding.candidateFingerprint},acceptanceHostReadProgram());j.otherNodeTemplatesSHA256=h.nodeTemplates?.otherTemplatesSHA256;assertAcceptanceJournal(j);assertAcceptanceHost(h,j,native,{idle:true});need(h.nodeTemplates.targetSHA256===j.originalTemplateSHA256,'REPAIR_ACCEPTANCE_TEMPLATE_RESTORE_UNCONFIRMED');
  await quiet(j.originalTemplate);await nativeCheck();
  if(action==='inspect')return {schemaVersion:1,kind:'software-factory-repair-fixed-validation-receipt',at:iso(d),action,ready:true,dispatch:false,workspace:S.workspace,entry:V.entry,installationSHA256:j.installation.sha256,candidateFingerprint:j.candidateBefore.sha256,candidateMetadataSHA256:j.candidateBefore.metadataSHA,mainUnchanged:true,partialNative:manifest.binding.partialNative,nativeStatus:manifest.binding.nativeStatus,nativeOutcome:manifest.binding.nativeOutcome,allowPartialTerminal,expectedCostUSD:0,modelsInvoked:false,productAccepted:false,independentCleanupAuditRequired:true,rawLogsExported:false,privateJournalExported:false};
  await save();
 }
 await nativeCheck();
 const readRun=async()=>{if(!j.runId)return null;try{return await get('/api/v1/execution/runs/'+j.runId);}catch(e){if(/^API_404 /.test(e.message??''))return null;throw e;}};
 const verifyRun=async run=>{const task=await get('/api/v1/tasks/'+j.taskId);assertAcceptanceRun(run,task,j);const stored=await d.readPrimary({runId:j.runId,nodeAgentId:j.nodeAgentId,expected:{id:j.runId,taskId:j.taskId,objectId:j.taskId,projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,executorId:S.templateId,scope:'personal',domain:'tasks',kind:'development'}},acceptanceStoredRunProgram);need(stored.readOnly===true&&stored.status===run.status&&(stored.agentId??undefined)===(run.agentId??undefined)&&same(stored.result??null,run.result??null)&&stored.frozenTemplateSHA256===j.fixedTemplateSHA256&&H.test(stored.storedRecordSHA256??''),'REPAIR_ACCEPTANCE_FROZEN_STORED_RUN_CHANGED');return stored;};
 if(action==='start'&&!j.started){
  need(!j.restored,'REPAIR_ACCEPTANCE_ALREADY_RESTORED');const existing=await readRun();
  if(existing){await verifyRun(existing);j.started=true;j.phase='started';j.startReconciledAt=iso(d);await save();}
  else need(!j.dispatchAttemptedAt,'REPAIR_ACCEPTANCE_DISPATCH_RECONCILIATION_REQUIRED');
  if(!j.started){
   const state=await quiet();need([j.originalTemplateSHA256,j.fixedTemplateSHA256].includes(sha(state.central))&&[j.originalTemplateSHA256,j.fixedTemplateSHA256].includes(sha(state.node.template)),'REPAIR_ACCEPTANCE_PREPARATION_TEMPLATE_CONFLICT');
   const project=await get('/api/v1/projects/'+S.projectId);need(project.scope==='personal'&&project.ownerId===S.ownerId&&project.copies?.filter(c=>c.machineId===S.machineId&&c.path===S.workspace&&c.branch==='main-snapshot-r26'&&c.environment==='development').length===1,'REPAIR_ACCEPTANCE_REGISTERED_COPY_CHANGED');
   j.templateChangeAttemptedAt??=iso(d);await save();await d.putCentral(d.api,j.originalTemplate,j.fixedTemplate);
   const node=await d.nodeState();if(same(node.template,j.originalTemplate))await d.patchNode(j.originalTemplate,j.fixedTemplate,j.job);else need(same(node.template,j.fixedTemplate),'REPAIR_ACCEPTANCE_NODE_CONFIG_CONFLICT');
   let available=false;const until=d.now()+45000;
   for(let tries=0;tries<24&&d.now()<until;tries++){const caps=await get('/api/v1/execution/capabilities');if(caps.configuredTemplates?.some(t=>t.id===S.templateId&&t.machineId===S.machineId&&t.engine==='fixed'&&t.ready===true)){await quiet(j.fixedTemplate);available=true;break;}await d.delay(2000);}
   need(available,'REPAIR_ACCEPTANCE_EXECUTOR_NOT_READY');
   j.taskPayload??=acceptanceTaskPayload(d);j.taskPayloadSHA256=sha(j.taskPayload);j.intents.create??={commandId:d.randomUUID(),scope:'personal',expectedVersion:0,payload:j.taskPayload};await save();
   if(!j.taskId){const task=(await d.api('/api/v1/tasks/commands/create',j.intents.create)).data;j.taskId=task.id;assertAcceptanceTask(task,j);await save();}
   const task=assertAcceptanceTask(await get('/api/v1/tasks/'+j.taskId),j);need(['queued','waitingQuota','waitingResource','waitingUser'].includes(task.status),'REPAIR_ACCEPTANCE_PREPARED_TASK_NOT_STARTABLE');
   if(!j.intents.start){j.intents.start={commandId:d.randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId:j.taskId,reason:'明确选择的R26部分修复候选：使用实际安装且指纹固定的r26-repair入口独立无模型全量复验，保留所有原标准，不自动验收产品。'}};j.runId=expectedRunId(j.intents.start.commandId);await save();}
   await quiet(j.fixedTemplate);await nativeCheck();need(sha(JSON.parse(await d.readLocal(S.journalPath,'utf8')))===j.nativeJournalSHA256&&sha(await d.readLocal(path,'utf8'))===j.installation.sha256,'REPAIR_ACCEPTANCE_PRE_DISPATCH_INPUT_CHANGED');
   j.dispatchAttemptedAt=iso(d);j.phase='dispatch-attempted';await save();
   const receipt=(await d.api('/api/v1/tasks/commands/start',j.intents.start)).data;need(receipt.executionRequest?.id===j.runId,'REPAIR_ACCEPTANCE_RUN_ID_MISMATCH');const actual=await readRun();need(actual,'REPAIR_ACCEPTANCE_DISPATCH_RECONCILIATION_REQUIRED');await verifyRun(actual);j.started=true;j.phase='started';await save();
  }
 }
 let run=await readRun(),stored=null;if(run)stored=await verifyRun(run);else need(!j.dispatchAttemptedAt,'REPAIR_ACCEPTANCE_DISPATCH_RECONCILIATION_REQUIRED');
 if(action==='restore'&&!j.restored){
  if(run){need(TERMINAL.has(run.status)&&run.agentId===j.nodeAgentId&&run.result?.source==='signed-agent'&&run.result.lateEvidenceOnly!==true&&run.stopRequested!==true,'REPAIR_ACCEPTANCE_SIGNED_NONLATE_TERMINAL_REQUIRED');need(zeroFixedUsage(run.result.usage),'REPAIR_ACCEPTANCE_ZERO_MODEL_USAGE_UNCONFIRMED');}
  const state=await quiet();need([j.originalTemplateSHA256,j.fixedTemplateSHA256].includes(sha(state.central))&&[j.originalTemplateSHA256,j.fixedTemplateSHA256].includes(sha(state.node.template)),'REPAIR_ACCEPTANCE_RESTORE_CONFLICT');
  if(!run&&j.taskId){const task=assertAcceptanceTask(await get('/api/v1/tasks/'+j.taskId),j);if(task.status!=='cancelled'){j.intents.cancel??={commandId:d.randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId:j.taskId,reason:'本次固定复验尚未派发，取消准备任务并恢复原模板；保留全部准备证据。'}};await save();await d.api('/api/v1/tasks/commands/cancel',j.intents.cancel);need((await get('/api/v1/tasks/'+j.taskId)).status==='cancelled','REPAIR_ACCEPTANCE_PREPARED_CANCEL_UNCONFIRMED');}}
  if(run){const again=await readRun();await verifyRun(again);need(sha(again)===sha(run),'REPAIR_ACCEPTANCE_TERMINAL_CHANGED_BEFORE_RESTORE');}
  j.restoreAttemptedAt??=iso(d);await save();await d.putCentral(d.api,j.fixedTemplate,j.originalTemplate);
  const node=await d.nodeState();if(same(node.template,j.fixedTemplate))await d.patchNode(j.fixedTemplate,j.originalTemplate,j.job);else need(same(node.template,j.originalTemplate),'REPAIR_ACCEPTANCE_NODE_RESTORE_CONFLICT');
  const after=await quiet(j.originalTemplate);j.sourceAfter=after.host.source;j.candidateAfter=after.host.candidate;j.restored=true;j.phase='restored';j.restoredAt=iso(d);await save();
 }
 const observed=await (j.restored?quiet(j.originalTemplate):configCheck(j.started?j.fixedTemplate:undefined));
 if(!j.started&&!j.restored)need([j.originalTemplateSHA256,j.fixedTemplateSHA256].includes(sha(observed.central))&&[j.originalTemplateSHA256,j.fixedTemplateSHA256].includes(sha(observed.node.template)),'REPAIR_ACCEPTANCE_PREPARATION_TEMPLATE_CONFLICT');
 const h=j.restored?observed.host:await host(false);need(h.nodeTemplates.targetSHA256===sha(observed.node.template),'REPAIR_ACCEPTANCE_NODE_TEMPLATE_READ_CHANGED');verifyFrozenNode(h,observed.profile,observed.config);
 if(run){const after=await readRun(),afterStored=await verifyRun(after);need(runObservationSHA(after)===runObservationSHA(run)&&(!TERMINAL.has(run.status)||afterStored.storedRecordSHA256===stored.storedRecordSHA256),'REPAIR_ACCEPTANCE_RUN_CHANGED_DURING_OBSERVATION');run=after;stored=afterStored;}
 const validation=validationMetadata(run,j),signedTerminal=!!run&&TERMINAL.has(run.status)&&run.agentId===j.nodeAgentId&&run.result?.source==='signed-agent'&&run.stopRequested!==true&&run.result.lateEvidenceOnly!==true;
 return {schemaVersion:1,kind:'software-factory-repair-fixed-validation-receipt',at:iso(d),action,projectId:S.projectId,taskId:j.taskId??null,runId:j.runId??null,status:run?.status??'prepared',signed:run?.result?.source==='signed-agent',outcome:run?.result?.outcome??null,executionExitCode:run?.result?.exitCode??null,stopRequested:run?.stopRequested===true,lateEvidenceOnly:run?.result?.lateEvidenceOnly===true,storedRecordSHA256:stored?.storedRecordSHA256??null,frozenTemplateSHA256:j.fixedTemplateSHA256,workspace:S.workspace,entry:V.entry,installationSHA256:j.installation.sha256,candidateFingerprint:h.candidate.sha256,candidateMetadataSHA256:h.candidate.metadataSHA,mainUnchanged:true,mainMetadataUnchanged:true,candidateUnchanged:true,oldProfileUnchanged:true,otherTemplatesUnchanged:true,oldEvidenceUnchanged:true,partialNative:j.nativeBinding.partialNative,nativeStatus:j.nativeBinding.nativeStatus,nativeOutcome:j.nativeBinding.nativeOutcome,allowPartialTerminal,expectedCostUSD:0,zeroModelUsageConfirmed:signedTerminal&&zeroFixedUsage(run.result.usage),actualCostUSD:signedTerminal&&zeroFixedUsage(run.result.usage)?0:null,validation,restored:j.restored===true,modelsInvoked:false,productAccepted:false,objectivesAccepted:false,independentCleanupAuditRequired:true,rawLogsExported:false,rawSummaryExported:false,privateJournalExported:false};
}

export function parseAcceptanceArguments(args){const action=args[0]??'inspect';need(['inspect','start','check','restore'].includes(action),'REPAIR_ACCEPTANCE_ACTION_INVALID');const result={action,allowPartialTerminal:false};for(const arg of args.slice(1)){if(arg==='--allow-partial-terminal'){need(!result.allowPartialTerminal,'REPAIR_ACCEPTANCE_ARGUMENT_INVALID');result.allowPartialTerminal=true;}else {const m=/^--installation=(.+)$/.exec(arg);need(m&&!result.installationPath&&installationPathAllowed(m[1]),'REPAIR_ACCEPTANCE_ARGUMENT_INVALID');result.installationPath=m[1];}}return result;}
export function acceptanceFailure(error,action,j){const msg=String(error?.message??'');return {schemaVersion:1,kind:'software-factory-repair-fixed-validation-receipt',at:new Date().toISOString(),action,failed:true,errorCode:/^(?:REPAIR_ACCEPTANCE|REPAIR_INSTALL|REPAIR_VERIFIER|MAIN_REPAIR)_[A-Z0-9_]{1,120}$/.test(msg)?msg:'REPAIR_ACCEPTANCE_OPERATION_FAILED',taskId:j?.taskId??null,runId:j?.runId??null,dispatchAttempted:!!j?.dispatchAttemptedAt,dispatchReconciliationRequired:!!j?.dispatchAttemptedAt&&!j?.started,automaticRetry:false,rawErrorExported:false,rawLogsExported:false,privateJournalExported:false,modelsInvoked:false,productAccepted:false};}
async function safeReadLocal(path,encoding){
 const before=await lstat(path);need(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=4*1024*1024,'REPAIR_ACCEPTANCE_LOCAL_FILE_INVALID');const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const s=await f.stat();need(s.isFile()&&s.nlink===1&&s.dev===before.dev&&s.ino===before.ino&&s.size===before.size,'REPAIR_ACCEPTANCE_LOCAL_FILE_CHANGED');const data=await f.readFile();const after=await f.stat(),linked=await lstat(path);need(['dev','ino','size','mtimeMs','ctimeMs'].every(k=>s[k]===after[k]&&s[k]===linked[k]),'REPAIR_ACCEPTANCE_LOCAL_FILE_CHANGED');return encoding?data.toString(encoding):data;}finally{await f.close();}
}
async function saveLocalJournal(j){await mkdir(dirname(A.journalPath),{recursive:true});const tmp=A.journalPath+'.'+randomUUID()+'.tmp';let f;try{f=await open(tmp,'wx',0o600);await f.writeFile(JSON.stringify(j,null,2)+'\n');await f.sync();await f.close();f=null;await rename(tmp,A.journalPath);}finally{await f?.close();await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let options,j,lock,result;
 try{options=parseAcceptanceArguments(process.argv.slice(2));
  // Inspection/check are read only. Mutations use one private exclusive local lock.
  if(['start','restore'].includes(options.action)){await mkdir(dirname(A.journalPath),{recursive:true});lock=await open(A.journalPath+'.lock','wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));await lock.sync();}
  result=await withPlatform(({api})=>runFactoryRepairAcceptance(options,{api,readLocal:safeReadLocal,saveJournal:async value=>{j=value;await saveLocalJournal(value);},nodeState,queueState,patchNode,putCentral,readRoot:defaultReadRoot,readPrimary:defaultReadPrimary}));
 }catch(error){result=acceptanceFailure(error,options?.action??'invalid',j);process.exitCode=1;}
 finally{if(lock){await lock.close();await unlink(A.journalPath+'.lock');}}
 await mkdir(A.artifactDirectory,{recursive:true});const output=A.artifactDirectory+'/repair-fixed-validation-'+(options?.action??'invalid')+'-'+Date.now()+'-'+randomUUID()+'.json',f=await open(output,'wx',0o644);try{await f.writeFile(JSON.stringify(result,null,2)+'\n');await f.sync();}finally{await f.close();}console.log(JSON.stringify({output,...result}));
}
