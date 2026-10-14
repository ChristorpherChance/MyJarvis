/** Default is read-only preparation. --execute performs exactly one reversible, tools-disabled handshake. */
import {mkdir,readFile,open,rename,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {remote,lanProfile,primary,python,withPlatform} from './managed-server-client.mjs';

const NODE={machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',templateId:'msf-101-claude',source:'/home/superopen/All-Projects/msf',config:'/var/lib/jarvis-development/101/config.json',unit:'jarvis-software-factory-development.service'};
const WRAPPER_SHA256='249b7757b0887d594dcebd6dd92af76a83b9f70b31a03ce28baf1b1e5ff574fd';
const terminal=new Set(['succeeded','failed','cancelled','budget-exhausted','timeout','awaiting-cost','round-limit','interrupted']);
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=code=>{throw Error(code);};
const remoteJson=(payload,code)=>JSON.parse(remote(lanProfile,'jarvis-101',python(payload,code),true));
const safeUsage=usage=>usage?Object.fromEntries(['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','provider','model','usageComplete','costUSD','costKind'].filter(key=>usage[key]!==undefined).map(key=>[key,usage[key]])):null;
const safeEvents=events=>(events??[]).map(event=>Object.fromEntries(['id','type','name','event','domain','entityId','objectId','at','createdAt'].filter(key=>event[key]!==undefined&&typeof event[key]!=='object').map(key=>[key,event[key]])));

export function expectedRunId(commandId,actorId='server-admin'){
  if(typeof commandId!=='string'||!commandId||actorId!=='server-admin')fail('INVALID_VERIFICATION_COMMAND');
  return createHash('sha256').update(actorId+':'+commandId).digest('hex').slice(0,40);
}
/** Run IDs alone are insufficient authority to stop a request after an HTTP response is lost. */
export function runBelongsToVerification(run,evidence,task){
  const start=evidence.start;
  if(!start||start.actorId!=='server-admin'||start.expectedRunId!==expectedRunId(start.commandId,start.actorId)||evidence.taskOwnerId!==start.actorId||start.taskId!==evidence.taskId||start.projectId!==NODE.projectId||start.machineId!==NODE.machineId||start.executorId!==NODE.templateId)return false;
  const matches=!!run&&run.id===start.expectedRunId&&run.domain==='tasks'&&run.kind==='development'&&run.scope==='personal'&&run.objectId===evidence.taskId&&run.taskId===evidence.taskId&&run.projectId===NODE.projectId&&run.machineId===NODE.machineId&&run.executorId===NODE.templateId&&run.workspace===NODE.source&&(!run.agentId||run.agentId===evidence.nodeAgentId);
  if(!matches)return false;
  return !task||(task.id===evidence.taskId&&task.ownerId===start.actorId&&task.scope==='personal'&&task.mode==='managed'&&task.projectId===NODE.projectId&&task.machineId===NODE.machineId&&task.agent===NODE.templateId&&task.executionRequest?.id===start.expectedRunId);
}
export function restoreAllowed(runs){return Array.isArray(runs)&&runs.every(run=>!['queued','running'].includes(run.status));}
export function isolationChecks(isolation){
  const probe=isolation?.probe;
  return {
    probeExitZero:isolation?.exitCode===0,
    probeReportedPass:probe?.ok===true,
    unprivilegedValidator:Number.isSafeInteger(probe?.uid)&&probe.uid>0,
    centralRunId:probe?.runIdShape==='central-40hex',
    kernelFilesystemIsolation:Number.isSafeInteger(probe?.landlockABI)&&probe.landlockABI>0,
    networkNamespace:probe?.networkNamespace===true,
    tcpDenied:probe?.connectDenied?.tcp===true,
    unixDenied:probe?.connectDenied?.unix===true,
    scratchReadable:probe?.filesystem?.scratchReadable===true,
    scratchWritable:probe?.filesystem?.scratchWritable===true,
    selfStatReadable:probe?.filesystem?.selfStatReadable===true,
    outsideFixtureDenied:probe?.filesystem?.outsideFixtureDenied===true,
    originalSourceDenied:probe?.filesystem?.originalSourceDenied===true,
    agentConfigDenied:probe?.filesystem?.agentConfigDenied===true,
    otherProcessStatDenied:probe?.filesystem?.otherProcessStatDenied===true,
  };
}
export function sourceInspectionChecks(report){
  const source=report?.inspection,rawGit=state=>!!state&&/^[a-f0-9]{40}$/.test(state.head??'')&&typeof state.branch==='string'&&state.branch.length<=200&&state.trackedDirtyCount===null&&state.untrackedCount===null&&state.statusInspection==='not-run'&&state.metadataMethod==='bounded-raw-ref-no-git-process';
  return {
    inspectionExitZero:report?.exitCode===0,
    reportedPass:source?.ok===true,
    fixedSource:source?.source===NODE.source,
    stablePublicContent:typeof source?.sourceFingerprint==='string'&&/^[a-f0-9]{64}$/.test(source.sourceFingerprint)&&source.sourceFingerprint===source.verificationSha256&&source.sourceStateChanged===false,
    rawReferencesOnly:rawGit(source?.gitBefore)&&rawGit(source?.gitAfter)&&same(source.gitBefore,source.gitAfter),
    boundedFiles:Number.isSafeInteger(source?.files)&&source.files>=0&&source.files<=20000,
    boundedBytes:Number.isSafeInteger(source?.bytes)&&source.bytes>=0&&source.bytes<=200*1024*1024,
    privateFilesExcluded:source?.privateEnvCopied===false,
    noModelOrTests:source?.modelCalled===false&&source?.testsRun===false,
    pinnedTrustedWrapper:report?.wrapperSHA256===WRAPPER_SHA256,
  };
}
export function connectionChecks(evidence){
  const result=evidence.result,usage=result?.usage,reported=(evidence.ledgerAfterObserver??[]).filter(row=>row.measurement_status==='reported');
  const validCount=value=>Number.isSafeInteger(value)&&value>=0;
  return {
    runSucceeded:result?.status==='succeeded'&&result?.outcome==='success',
    signedNativeReceipt:result?.source==='signed-agent',
    nativeExitZero:result?.exitCode===0,
    exactlyOneRound:result?.rounds===1,
    validatorExitZero:result?.validation?.exitCode===0,
    reportedPositiveUsage:!!usage&&usage.usageComplete===true&&validCount(usage.inputTokens)&&validCount(usage.outputTokens)&&usage.inputTokens+usage.outputTokens>0&&reported.length>0&&reported.every(row=>validCount(row.input_tokens)&&validCount(row.output_tokens)&&row.total_tokens===row.input_tokens+row.output_tokens)&&reported.reduce((total,row)=>total+row.total_tokens,0)>0,
    taskAwaitingValidation:evidence.taskStatus==='validating',
    sourceMetadataUnchanged:evidence.sourceMetadataUnchanged===true,
    sourceContentUnchanged:evidence.sourceContentUnchanged===true,
    observerDedupConfirmed:evidence.observerDedupConfirmed===true,
  };
}
export function processStopped(run){return terminal.has(run.status)&&(!run.agentId||(run.result??run.executionResult)?.source==='signed-agent');}
export function safeApiFailure(error){
 const match=/^API_(\d{3}) (.*)$/s.exec(error?.message??'');
 if(!match)return {code:/^[A-Z0-9_]+$/.test(error?.message??'')?error.message:'LOCAL_VERIFICATION_ERROR'};
 let response;try{response=JSON.parse(match[2]);}catch{}
 const business=response?.error??response,code=typeof business?.code==='string'&&/^[A-Z_]{1,80}$/.test(business.code)?business.code:'API_ERROR';
 const messages=new Set(['接口返回校验未通过，操作未提交','执行器或已签名在线节点未就绪','尚未配置任务执行器','任务状态不能执行此操作','任务预算耗尽','项目不能执行','平台处于急停','请检查必填项、范围和数据格式','记录已更新，请刷新后再提交','同一个提交编号不能用于不同操作','设备不存在','公司设备仅可观察','项目副本必须位于执行器工作根目录内的独立子目录','AI并发已满，请稍后重试','平台已暂停新的AI调用','当日AI预算不足或存在未定价用量，请调整预算后重试']);
 return {httpStatus:Number(match[1]),code,...messages.has(business?.message)?{message:business.message}:{}};
}
async function saveEvidence(target,evidence){
  await mkdir(dirname(target),{recursive:true});const temporary=target+'.'+randomUUID()+'.tmp';let handle;
  try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(evidence,null,2)+'\n');await handle.sync();await handle.close();handle=undefined;await rename(temporary,target);}
  finally{await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}

export function smokeTemplate(template){
  if(template.engine!=='claude'||template.id!==NODE.templateId||template.machineId!==NODE.machineId||template.args.some(arg=>/^(?:--tools|--disallowedTools|--max-turns)(?:=|$)/.test(arg)))fail('UNEXPECTED_BASE_TEMPLATE');
  return {...template,args:[...template.args,'--tools','','--disallowedTools','*','--max-turns','1'],maxRounds:1,timeoutSec:120,supervision:{...template.supervision,maxRecoveryAttempts:0,repairValidation:false}};
}
export function handshakePayload(){return {title:'软件工厂接管通信验证（单轮）',projectId:NODE.projectId,machineId:NODE.machineId,agent:NODE.templateId,mode:'managed',goal:'仅验证贾维斯派发与模型网关通信。不要读取项目源码、任何额外文件、环境变量或私有配置；不调用工具、不执行命令、不修改工程、不启动或停止服务，不联网搜索。立即输出单个短JSON：{"summary":"接管通信已收到，等待独立验证","needs_more_work":false,"artifacts":[]}。这不是项目功能完成或交付声明。',criteria:'仅验收中央派发、本机受控执行、原生结果与真实Token回执以及固定隔离验证器实际退出码；不得宣称完整源码审查、功能正确或正式交付。',budget:1,retryLimit:0,worktree:NODE.source,skillIds:[],deadline:new Date(Date.now()+35*60000).toISOString()};}

async function inspectNode(){
 const localSHA256=createHash('sha256').update(await readFile(resolve('scripts/software-factory-validation-wrapper.py'))).digest('hex');
 if(localSHA256!==WRAPPER_SHA256)fail('LOCAL_INSPECTION_WRAPPER_HASH_CHANGED');
 const node=remoteJson({...NODE,wrapperSHA256:localSHA256},String.raw`import os,stat,json,subprocess,hashlib
from pathlib import Path
c=Path(p['config']);s=c.lstat()
if c.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_mode & 0o077:raise RuntimeError('PRIVATE_NODE_CONFIG_INVALID')
cfg=json.loads(c.read_text())
if cfg.get('machineId')!=p['machineId'] or not cfg.get('agentId') or not cfg.get('privateKey'):raise RuntimeError('NODE_NOT_PAIRED')
t=[x for x in cfg.get('templates',[]) if x.get('id')==p['templateId']]
if len(t)!=1:raise RuntimeError('LOCAL_TEMPLATE_NOT_UNIQUE')
unit=subprocess.run(['/usr/bin/systemctl','show',p['unit'],'--property=ActiveState,SubState,MainPID'],capture_output=True,text=True,timeout=10)
wrapper=Path('/usr/local/libexec/jarvis-msf-validation')
for part in [wrapper,*wrapper.parents]:
 info=part.lstat()
 if stat.S_ISLNK(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise RuntimeError('INSPECTION_WRAPPER_TRUST_INVALID')
sha=hashlib.sha256(wrapper.read_bytes()).hexdigest()
if sha!=p['wrapperSHA256']:raise RuntimeError('INSTALLED_INSPECTION_WRAPPER_HASH_CHANGED')
inspection=subprocess.run([str(wrapper),p['source'],'1111111111111111111111111111111111111111','--inspect-state'],capture_output=True,text=True,timeout=30)
try:state=json.loads(inspection.stdout.splitlines()[-1])
except:raise RuntimeError('SOURCE_INSPECTION_RESPONSE_INVALID')
program=t[0]['program'];h=subprocess.run(['/usr/sbin/runuser','-u','superopen','--',program,'--help'],cwd='/tmp',capture_output=True,text=True,timeout=15);help=h.stdout+h.stderr
print(json.dumps({'agentId':cfg['agentId'],'template':t[0],'unit':dict(line.split('=',1) for line in unit.stdout.splitlines() if '=' in line),'privateConfigMode':oct(s.st_mode&0o777),'help':{'exitCode':h.returncode,'emptyTools':'Use "" to disable all' in help,'disallowedTools':'--disallowedTools' in help},'sourceInspection':{'exitCode':inspection.returncode,'inspection':state,'wrapperSHA256':sha},'modelCalled':False}))
`);
 if(Object.values(sourceInspectionChecks(node.sourceInspection)).some(value=>value!==true))fail('PUBLIC_SOURCE_INSPECTION_NOT_READY');
 node.source=node.sourceInspection.inspection;
 return node;
}
function fullQueueState(){return JSON.parse(primary(`import sqlite3,json,datetime
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 all_active=c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN ('queued','running')").fetchone()[0]
 factory_active=c.execute("SELECT COUNT(*) FROM execution_runs WHERE machine_id=? AND executor_id=? AND status IN ('queued','running')",('${NODE.machineId}','${NODE.templateId}')).fetchone()[0]
 print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'allActive':all_active,'factoryActive':factory_active,'fullTable':True,'readOnly':True}))
finally:c.close()
`));}

function patchLocal(expected,replacement,restart){return remoteJson({...NODE,expected,replacement,restart},`import os,json,stat,tempfile,subprocess
from pathlib import Path
c=Path(p['config']);s=c.lstat()
if c.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_mode & 0o077:raise RuntimeError('PRIVATE_NODE_CONFIG_INVALID')
cfg=json.loads(c.read_text());indices=[i for i,t in enumerate(cfg.get('templates',[])) if t.get('id')==p['templateId']]
if cfg.get('machineId')!=p['machineId'] or len(indices)!=1 or cfg['templates'][indices[0]]!=p['expected']:raise RuntimeError('LOCAL_TEMPLATE_CAS_CONFLICT')
cfg['templates'][indices[0]]=p['replacement']
fd,temp=tempfile.mkstemp(prefix='.handshake-',dir=c.parent)
try:
 with os.fdopen(fd,'w') as f:json.dump(cfg,f);f.write(chr(10));f.flush();os.fsync(f.fileno())
 os.chown(temp,s.st_uid,s.st_gid);os.chmod(temp,0o600);os.replace(temp,c)
finally:
 if os.path.exists(temp):os.unlink(temp)
if p['restart']:subprocess.run(['/usr/bin/systemctl','restart',p['unit']],capture_output=True,check=True,timeout=20)
print(json.dumps({'templateUpdated':True,'credentialsExported':False,'restarted':p['restart']}))
`);}
function restartNode(){return remoteJson(NODE,`import subprocess,json
subprocess.run(['/usr/bin/systemctl','restart',p['unit']],capture_output=True,check=True,timeout=20)
print(json.dumps({'restarted':True}))
`);}
function validatorProbe(){return remoteJson(NODE,`import subprocess,json
r=subprocess.run(['/usr/local/libexec/jarvis-msf-validation',p['source'],'1111111111111111111111111111111111111111','--probe'],capture_output=True,text=True,timeout=25)
try:probe=json.loads(r.stdout.splitlines()[-1])
except:probe={'ok':False,'error':'PROBE_RESPONSE_INVALID'}
print(json.dumps({'exitCode':r.returncode,'probe':probe,'modelCalled':False}))
`);}
function observerCheckpoint(sessionId){return remoteJson({...NODE,sessionId},`import json,stat,subprocess
from pathlib import Path
file=Path('/var/lib/jarvis-development/101/usage/receipts.json');count=0;pending=0
if file.exists():
 s=file.lstat()
 if file.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_mode & 0o077:raise RuntimeError('PRIVATE_OBSERVER_STATE_INVALID')
 state=json.loads(file.read_text())
 if state.get('projectId')!=p['projectId'] or state.get('workspace')!=p['source']:raise RuntimeError('OBSERVER_SCOPE_MISMATCH')
 prefix='cli:claude:'+p['sessionId']+':'
 count=sum(key.startswith(prefix) for key in state.get('receipts',{}));pending=sum(key.startswith(prefix) for key in state.get('pendingSnapshots',{}))
unit=subprocess.run(['/usr/bin/systemctl','show','jarvis-msf-usage.service','--property=ActiveState,SubState,Result,ExecMainStatus'],capture_output=True,text=True,timeout=10)
print(json.dumps({'checkpointedReceipts':count,'pendingReceipts':pending,'unit':dict(line.split('=',1) for line in unit.stdout.splitlines() if '=' in line),'transcriptsRead':False}))
`);}

async function setCentral(api,expected,replacement){const config=(await api('/api/v1/execution/config')).data,template=config.templates.find(t=>t.id===NODE.templateId);if(!same(template,expected))fail('CENTRAL_TEMPLATE_CAS_CONFLICT');return (await api('/api/v1/execution/config',{expectedVersion:config.revision,templates:config.templates.map(t=>t.id===NODE.templateId?replacement:t),probes:config.probes,wol:config.wol},'PUT')).data;}
async function waitRun(api,id,evidence,timeoutMs=1800000,requireStopped=false){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){const run=(await api('/api/v1/execution/runs/'+encodeURIComponent(id))).data;if(!run)fail('RUN_NOT_FOUND');if(!runBelongsToVerification(run,evidence))fail('VERIFICATION_RUN_SCOPE_MISMATCH');if(evidence.observations.at(-1)?.status!==run.status){const item={at:new Date().toISOString(),status:run.status};evidence.observations.push(item);console.log(JSON.stringify({progress:item,runId:id}));}if(terminal.has(run.status)&&(!requireStopped||processStopped(run)))return run;await delay(5000);}fail('HANDSHAKE_RUN_TIMEOUT');}
export async function startVerificationRun(api,task,evidence,save){
  if(task.ownerId!=='server-admin'||task.scope!=='personal'||task.mode!=='managed'||task.projectId!==NODE.projectId||task.machineId!==NODE.machineId||task.agent!==NODE.templateId)fail('VERIFICATION_TASK_SCOPE_MISMATCH');
  const commandId=randomUUID(),actorId=task.ownerId;
  evidence.taskId=task.id;evidence.taskOwnerId=actorId;
  evidence.start={commandId,actorId,expectedRunId:expectedRunId(commandId,actorId),taskId:task.id,projectId:NODE.projectId,machineId:NODE.machineId,executorId:NODE.templateId,requestedAt:new Date().toISOString()};
  evidence.runId=evidence.start.expectedRunId;evidence.stage='start-intent-persisted';evidence.modelMayHaveStarted=true;
  // The deterministic request identity survives lost responses and is flushed before dispatch.
  await save();
  const started=await api('/api/v1/tasks/commands/start',{commandId,scope:'personal',expectedVersion:task.revision,payload:{taskId:task.id}});
  const request=started.data.executionRequest;
  if(!runBelongsToVerification({...request,scope:started.data.scope},evidence,started.data))fail('START_RESPONSE_SCOPE_MISMATCH');
  evidence.frozenRequest={maxRounds:request.maxRounds,budgetUSD:request.budgetUSD,executorId:request.executorId};evidence.events.push(...safeEvents(started.events));evidence.stage='started';await save();
  if(request.maxRounds!==1||typeof request.budgetUSD!=='number'||request.budgetUSD<=0||request.budgetUSD>1)fail('FROZEN_REQUEST_BOUNDARY_CHANGED');
  return started;
}
export async function stopVerificationRun(api,evidence){
  const run=(await api('/api/v1/execution/runs/'+encodeURIComponent(evidence.runId))).data;
  if(!run)fail('VERIFICATION_RUN_NOT_FOUND');
  const task=(await api('/api/v1/tasks/'+encodeURIComponent(evidence.taskId))).data;
  if(!task||!runBelongsToVerification(run,evidence,task))fail('VERIFICATION_STOP_SCOPE_MISMATCH');
  if(!terminal.has(run.status))await api('/api/v1/execution/runs/'+encodeURIComponent(evidence.runId)+'/stop',{reason:'单轮接管验证异常，停止本次执行并恢复固定模板'});
  // Central cancellation is only a request; a claimed process must also return its signed result.
  return waitRun(api,evidence.runId,evidence,120000,true);
}
async function usageForRun(api,id,startedAt){const rows=[];let page=1,totalPages=1;do{const response=await api('/api/runtime/governance/usage?projectId='+NODE.projectId+'&machineId='+NODE.machineId+'&from='+encodeURIComponent(startedAt)+'&limit=500&page='+page);for(const row of response.items??[])if(row.run_id==='execution_'+id)rows.push({id:row.id,source:row.source,usage_kind:row.usage_kind,measurement_status:row.measurement_status,input_tokens:row.input_tokens,output_tokens:row.output_tokens,cache_read:row.cache_read,cache_write:row.cache_write,total_tokens:row.total_tokens,cost_usd:row.cost_usd,cost_kind:row.cost_kind,measured_at:row.measured_at});totalPages=response.totalPages??1;page++;if(page>20)fail('USAGE_PAGINATION_BOUNDARY');}while(page<=totalPages);return rows;}

async function observeConnection(api,evidence,save=async()=>{}){
 const run=await waitRun(api,evidence.runId,evidence),result=run.result??run.executionResult??{};evidence.executionFinished=processStopped(run);evidence.modelStarted=!!run.agentId;evidence.result={status:run.status,outcome:result.outcome,exitCode:result.exitCode,rounds:result.rounds,source:result.source,verification:result.verification,usage:safeUsage(result.usage),validation:result.validation?{exitCode:result.validation.exitCode,observedVersion:result.validation.observedVersion}:null};
 const current=(await api('/api/v1/tasks/'+evidence.taskId)).data;evidence.taskStatus=current.status;evidence.sourceAfter=(await inspectNode()).source;evidence.sourceMetadataUnchanged=same(evidence.sourceBefore.gitBefore,evidence.sourceAfter.gitAfter);evidence.sourceContentUnchanged=same(evidence.sourceBefore,evidence.sourceAfter);evidence.sourceComparison='bounded-public-source-double-hash-and-raw-refs-private-files-excluded';evidence.ledgerBeforeObserver=await usageForRun(api,evidence.runId,evidence.preparedAt);evidence.stage='native-result-observed';await save();
 if(current.sessionId){const deadline=Date.now()+300000;do{evidence.observer=observerCheckpoint(current.sessionId);if(evidence.observer.checkpointedReceipts>0)break;await delay(10000);}while(Date.now()<deadline);}
 evidence.ledgerAfterObserver=await usageForRun(api,evidence.runId,evidence.preparedAt);evidence.tokenTotals={before:evidence.ledgerBeforeObserver.reduce((sum,row)=>sum+(row.total_tokens??0),0),after:evidence.ledgerAfterObserver.reduce((sum,row)=>sum+(row.total_tokens??0),0)};evidence.observerDedupConfirmed=!!evidence.observer?.checkpointedReceipts&&same(evidence.ledgerBeforeObserver,evidence.ledgerAfterObserver);evidence.verificationChecks=connectionChecks(evidence);evidence.stage='connection-observed';
}

function noCommittedRunProof(evidence){return JSON.parse(primary(python({...NODE,taskId:evidence.taskId,runId:evidence.runId,ownerId:evidence.taskOwnerId,commandId:evidence.start.commandId},`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
try:
 c.execute("ATTACH DATABASE 'file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro' AS execution")
 c.execute('BEGIN')
 t=c.execute("SELECT owner_id,scope,revision,json_extract(json,'$.status') status,json_extract(json,'$.mode') mode,json_extract(json,'$.projectId') project,json_extract(json,'$.machineId') machine,json_extract(json,'$.agent') executor,json_extract(json,'$.sessionId') session,json_extract(json,'$.executionRequest') request,json_extract(json,'$.executionStatus') execution_status FROM v1_documents WHERE domain='tasks' AND id=?",(p['taskId'],)).fetchone()
 own=c.execute('SELECT COUNT(*) FROM execution.execution_runs WHERE id=? OR object_id=?',(p['runId'],p['taskId'])).fetchone()[0]
 all_active=c.execute("SELECT COUNT(*) FROM execution.execution_runs WHERE status IN ('queued','running')").fetchone()[0]
 committed=c.execute('SELECT COUNT(*) FROM v1_commands WHERE actor_id=? AND command_id=?',(p['ownerId'],p['commandId'])).fetchone()[0]
 print(json.dumps({'neverCommitted':bool(t) and t['owner_id']==p['ownerId'] and t['scope']=='personal' and t['revision']==1 and t['status']=='queued' and t['mode']=='managed' and t['project']==p['projectId'] and t['machine']==p['machineId'] and t['executor']==p['templateId'] and t['session'] is None and t['request'] is None and t['execution_status'] is None and own==0 and all_active==0 and committed==0,'ownRunRows':own,'allActive':all_active,'startReceipts':committed,'fullTable':True,'readOnly':True}))
finally:c.close()
`)));}

export function existingStartEnvelope(evidence,task){
 const trusted=handshakePayload();
 if(!same(evidence.scope,NODE)||evidence.taskOwnerId!=='server-admin'||evidence.start?.actorId!==evidence.taskOwnerId||evidence.start?.taskId!==evidence.taskId||evidence.start?.projectId!==NODE.projectId||evidence.start?.machineId!==NODE.machineId||evidence.start?.executorId!==NODE.templateId||evidence.start?.expectedRunId!==expectedRunId(evidence.start.commandId,evidence.taskOwnerId)||evidence.runId!==evidence.start.expectedRunId||task?.id!==evidence.taskId||task.ownerId!==evidence.taskOwnerId||task.scope!=='personal'||task.mode!=='managed'||task.projectId!==NODE.projectId||task.machineId!==NODE.machineId||task.agent!==NODE.templateId||task.revision!==1||task.status!=='queued'||task.executionRequest||task.executionStatus||task.sessionId||task.budget!==1||task.retryLimit!==0||task.goal!==trusted.goal||task.criteria!==trusted.criteria||task.goal!==evidence.payload?.goal||task.criteria!==evidence.payload?.criteria||task.worktree!==NODE.source||task.deadline!==evidence.payload?.deadline||!same(smokeTemplate(evidence.originalTemplate),evidence.smokeTemplate))fail('EXISTING_VERIFICATION_SCOPE_MISMATCH');
 return {commandId:evidence.start.commandId,scope:'personal',expectedVersion:1,payload:{taskId:task.id}};
}

/** Default preparation is read-only; an explicit execution resumes this same immutable start intent. */
export async function resumeExistingVerification({execute=false,evidencePath}={}){
 if(!evidencePath)fail('EXISTING_VERIFICATION_EVIDENCE_REQUIRED');const target=resolve(evidencePath),evidence=JSON.parse(await readFile(target,'utf8'));
 return withPlatform(async({api})=>{
  const task=(await api('/api/v1/tasks/'+encodeURIComponent(evidence.taskId))).data,envelope=existingStartEnvelope(evidence,task);
  const values=await Promise.all(['/api/v1/execution/config','/api/v1/execution/capabilities','/api/v1/execution/agents','/api/runtime/governance','/api/v1/execution/supervision','/api/v1/projects/'+NODE.projectId].map(path=>api(path)));
  const [config,caps,agents,budget,supervision,project]=values,node=await inspectNode(),proof=noCommittedRunProof(evidence);
  let runAbsent=false;try{const r=await api('/api/v1/execution/runs/'+evidence.runId);runAbsent=!r.data;}catch(error){if(safeApiFailure(error).httpStatus===404)runAbsent=true;else throw error;}
  const checks={sameStartIdentity:envelope.commandId===evidence.start.commandId,nodeIdentityUnchanged:node.agentId===evidence.nodeAgentId,globalSupervisionOff:caps.data.supervised===false,notStopped:supervision.data.stopped===false,governanceUnpaused:budget.policy.values.paused===false,fullQueueEmpty:proof.neverCommitted===true&&runAbsent,sourceContentUnchanged:same(node.source,evidence.sourceBefore),centralTemplateExact:same(config.data.templates.find(t=>t.id===NODE.templateId),evidence.smokeTemplate),localTemplateExact:same(node.template,evidence.smokeTemplate),agentOnline:agents.data.some(a=>a.id===evidence.nodeAgentId&&a.status==='online'&&!a.revoked),nodeUnitActive:node.unit.ActiveState==='active'&&node.unit.SubState==='running'&&Number(node.unit.MainPID)>0,templateReady:caps.data.configuredTemplates.some(t=>t.id===NODE.templateId&&t.ready),projectBound:project.data.scope==='personal'&&project.data.copies.some(copy=>copy.machineId===NODE.machineId&&copy.path===NODE.source&&copy.environment==='development'),deadlineValid:!task.deadline||Date.parse(task.deadline)>Date.now()};
  const plan={resumeExisting:true,execute,modelStarted:false,taskId:task.id,runId:evidence.runId,startCommandId:envelope.commandId,checks,noCommittedRun:proof};
  if(!execute)return plan;if(Object.values(checks).some(value=>value!==true))fail('EXISTING_VERIFICATION_PREFLIGHT_NOT_READY');
  const isolation=validatorProbe();isolation.checks=isolationChecks(isolation);if(Object.values(isolation.checks).some(value=>value!==true))fail('VALIDATOR_FILESYSTEM_ISOLATION_NOT_READY');
  evidence.previousAttempts??=[];evidence.previousAttempts.push({at:new Date().toISOString(),error:evidence.error??null,restoration:evidence.restoration,observations:evidence.observations});delete evidence.error;evidence.observations=[];evidence.stage='same-start-intent-resuming';evidence.resumption={at:new Date().toISOString(),checks,envelope,isolation,noCommittedRun:proof};evidence.restoration={central:false,local:false};evidence.completed=false;evidence.passed=false;const save=()=>saveEvidence(target,evidence);await save();
  try{
   const started=await api('/api/v1/tasks/commands/start',envelope),request=started.data.executionRequest;
   if(!runBelongsToVerification({...request,scope:started.data.scope},evidence,started.data))fail('START_RESPONSE_SCOPE_MISMATCH');
   evidence.frozenRequest={maxRounds:request.maxRounds,budgetUSD:request.budgetUSD,executorId:request.executorId};evidence.events.push(...safeEvents(started.events));evidence.stage='same-start-intent-accepted';await save();
   if(request.maxRounds!==1||typeof request.budgetUSD!=='number'||request.budgetUSD<=0||request.budgetUSD>1)fail('FROZEN_REQUEST_BOUNDARY_CHANGED');
   await observeConnection(api,evidence,save);await save();
  }catch(error){evidence.lastApiFailure=safeApiFailure(error);evidence.error=evidence.lastApiFailure.code;evidence.stage='resumed-verification-failed';await save();}
  finally{
   const errors=[];let stopped=evidence.executionFinished===true;
   if(!stopped){const never=noCommittedRunProof(evidence);evidence.restoration.noCommittedRun=never;if(never.neverCommitted&&evidence.lastApiFailure?.httpStatus>=400){stopped=true;evidence.executionFinished=true;evidence.modelMayHaveStarted=false;}else try{const run=await stopVerificationRun(api,evidence);stopped=processStopped(run);evidence.executionFinished=stopped;}catch{errors.push('RUN_STOP_NOT_CONFIRMED');}}
   try{const latest=(await api('/api/v1/execution/runs')).data;evidence.restoration.fullQueue=fullQueueState();if(!restoreAllowed(latest)||evidence.restoration.fullQueue.allActive!==0||!stopped)fail('ACTIVE_OR_UNCONFIRMED_RUN_RESTORE_DEFERRED');
    const local=(await inspectNode()).template;if(same(local,evidence.smokeTemplate))patchLocal(evidence.smokeTemplate,evidence.originalTemplate,false);else if(!same(local,evidence.originalTemplate))fail('LOCAL_TEMPLATE_CAS_CONFLICT');evidence.restoration.local=true;
    const central=(await api('/api/v1/execution/config')).data.templates.find(t=>t.id===NODE.templateId);if(same(central,evidence.smokeTemplate))await setCentral(api,evidence.smokeTemplate,evidence.originalTemplate);else if(!same(central,evidence.originalTemplate))fail('CENTRAL_TEMPLATE_CAS_CONFLICT');evidence.restoration.central=true;restartNode();
   }catch(error){errors.push(safeApiFailure(error).code);}
   evidence.restoration.errors=errors;evidence.restoration.complete=evidence.restoration.local&&evidence.restoration.central&&errors.length===0;evidence.verificationChecks=connectionChecks(evidence);evidence.failedChecks=Object.entries(evidence.verificationChecks).filter(([,passed])=>passed!==true).map(([name])=>name);evidence.passed=!evidence.error&&evidence.failedChecks.length===0&&evidence.restoration.complete;evidence.completed=evidence.passed;evidence.stage=evidence.passed?'verified':evidence.restoration.complete?'verification-failed':'restore-review-required';await save();
  }
  return {passed:evidence.passed,completed:evidence.completed,taskId:evidence.taskId,runId:evidence.runId,startCommandId:evidence.start.commandId,lastApiFailure:evidence.lastApiFailure??null,checks:evidence.verificationChecks,failedChecks:evidence.failedChecks,result:evidence.result??null,restoration:evidence.restoration,tokenTotals:evidence.tokenTotals??null,sourceContentUnchanged:evidence.sourceContentUnchanged??null,observerDedupConfirmed:evidence.observerDedupConfirmed??null,modelStarted:evidence.modelStarted,fullDeliveryAccepted:false,evidencePath:target};
 });
}

export async function verifyExecution({execute=false,evidencePath='artifacts/software-factory/node/managed-execution-verification.json'}={}){
  return withPlatform(async({api})=>{
    const paths=['/api/health','/api/v1/execution/config','/api/v1/execution/capabilities','/api/v1/execution/agents','/api/runtime/governance','/api/v1/execution/supervision','/api/v1/execution/runs','/api/v1/projects/'+NODE.projectId];
    const results=await Promise.allSettled(paths.map(path=>api(path)));for(let i=0;i<results.length;i++)if(results[i].status!=='fulfilled')fail('READ_ONLY_PREFLIGHT_FAILED');
    const values=results.map(result=>result.value),[health,configuration,capabilities,agents,budget,supervision,runs,projectResponse]=values,config=configuration.data,caps=capabilities.data,project=projectResponse.data,node=await inspectNode(),queue=fullQueueState(),template=config.templates.find(t=>t.id===NODE.templateId);
    const activeRuns=(runs.data??[]).filter(run=>['queued','running'].includes(run.status));
    const plan={preparedAt:new Date().toISOString(),execute,modelStarted:false,nodeAgentId:node.agentId,health:{build:health.build,nodeId:health.nodeId},scope:NODE,sourceBefore:node.source,fullQueue:queue,payload:handshakePayload(),boundary:{maxRounds:1,retryLimit:0,budgetUSD:1,costIsEstimateOnly:true,unknownCostsRemainUnknown:true,automaticAcceptance:false,sourceReviewPerformed:false,normalCliProjectInstructionsMayLoad:true},checks:{globalSupervisionOff:caps.supervised===false,notStopped:supervision.data.stopped===false,governanceUnpaused:budget.policy.values.paused===false,noActiveRuns:activeRuns.length===0&&queue.fullTable===true&&queue.allActive===0&&queue.factoryActive===0,noManagedTasks:(supervision.data.tasks??[]).length===0,agentOnline:agents.data.some(a=>a.id===node.agentId&&a.status==='online'&&!a.revoked),templateReady:caps.configuredTemplates.some(t=>t.id===NODE.templateId&&t.ready),sameTemplate:same(template,node.template),projectBound:project.scope==='personal'&&project.copies.some(copy=>copy.machineId===NODE.machineId&&copy.path===NODE.source&&copy.environment==='development'),toolsDisableSupported:node.help.exitCode===0&&node.help.emptyTools&&node.help.disallowedTools},budget:{dailyLimitUSD:budget.policy.values.dailyLimitUSD,blockUnpriced:budget.policy.values.blockUnpriced,unpricedCalls:budget.unpricedCalls,active:budget.active,reservedUSD:budget.reservedUSD},originalTemplate:template,smokeTemplate:smokeTemplate(template)};
    // A finished, independently validating earlier run is not executing and must
    // not prevent another explicitly authorized connection verification.
    plan.checks.noManagedTasks=(supervision.data.tasks??[]).every(task=>task.status==='validating'&&!['queued','running'].includes(task.executionStatus));
    if(!execute)return plan;
    if(Object.values(plan.checks).some(value=>value!==true))fail('EXECUTION_PREFLIGHT_NOT_READY');
    const target=resolve(evidencePath);try{await readFile(target);fail('EXISTING_EXECUTION_EVIDENCE_REQUIRES_REVIEW');}catch(error){if(error.code!=='ENOENT')throw error;}
    const isolation=validatorProbe();isolation.checks=isolationChecks(isolation);if(Object.values(isolation.checks).some(value=>value!==true))fail('VALIDATOR_FILESYSTEM_ISOLATION_NOT_READY');
    const evidence={...plan,isolation,observations:[],events:[],stage:'prepared',completed:false,passed:false,executionFinished:false,restoration:{central:false,local:false}};
    const save=()=>saveEvidence(target,evidence);await save();
    let centralChanged=false,localChanged=false;
    try{
      centralChanged=true;await setCentral(api,template,plan.smokeTemplate);evidence.stage='central-template-switched';await save();
      localChanged=true;patchLocal(node.template,plan.smokeTemplate,true);evidence.stage='both-templates-switched';await save();
      evidence.createCommandId=randomUUID();evidence.stage='create-intent-persisted';await save();
      const created=await api('/api/v1/tasks/commands/create',{commandId:evidence.createCommandId,scope:'personal',expectedVersion:0,payload:plan.payload}),task=created.data;evidence.taskId=task.id;evidence.taskOwnerId=task.ownerId;evidence.events.push(...safeEvents(created.events));evidence.stage='task-created';await save();
      await startVerificationRun(api,task,evidence,save);
      const run=await waitRun(api,evidence.runId,evidence),result=run.result??run.executionResult??{};evidence.executionFinished=processStopped(run);evidence.modelStarted=!!run.agentId;evidence.result={status:run.status,outcome:result.outcome,exitCode:result.exitCode,rounds:result.rounds,source:result.source,verification:result.verification,usage:safeUsage(result.usage),validation:result.validation?{exitCode:result.validation.exitCode,observedVersion:result.validation.observedVersion}:null};
      const current=(await api('/api/v1/tasks/'+task.id)).data;evidence.taskStatus=current.status;evidence.sourceAfter=(await inspectNode()).source;evidence.sourceMetadataUnchanged=same(evidence.sourceBefore.gitBefore,evidence.sourceAfter.gitAfter);evidence.sourceContentUnchanged=same(evidence.sourceBefore,evidence.sourceAfter);evidence.sourceComparison='bounded-public-source-double-hash-and-raw-refs-private-files-excluded';evidence.ledgerBeforeObserver=await usageForRun(api,evidence.runId,evidence.preparedAt);evidence.stage='native-result-observed';await save();
      if(current.sessionId){const deadline=Date.now()+300000;do{evidence.observer=observerCheckpoint(current.sessionId);if(evidence.observer.checkpointedReceipts>0)break;await delay(10000);}while(Date.now()<deadline);}
      evidence.ledgerAfterObserver=await usageForRun(api,evidence.runId,evidence.preparedAt);evidence.tokenTotals={before:evidence.ledgerBeforeObserver.reduce((sum,row)=>sum+(row.total_tokens??0),0),after:evidence.ledgerAfterObserver.reduce((sum,row)=>sum+(row.total_tokens??0),0)};evidence.observerDedupConfirmed=!!evidence.observer?.checkpointedReceipts&&same(evidence.ledgerBeforeObserver,evidence.ledgerAfterObserver);evidence.verificationChecks=connectionChecks(evidence);evidence.stage='connection-observed';await save();
    }catch(error){evidence.lastApiFailure=safeApiFailure(error);evidence.error=evidence.lastApiFailure.code;evidence.stage='failed';await save();throw error;}
    finally{
      const restorationErrors=[];
      if(evidence.runId&&!evidence.executionFinished){const never=noCommittedRunProof(evidence);evidence.restoration.noCommittedRun=never;if(never.neverCommitted&&evidence.lastApiFailure?.httpStatus>=400){evidence.executionFinished=true;evidence.modelMayHaveStarted=false;}else try{const stopped=await stopVerificationRun(api,evidence);evidence.executionFinished=processStopped(stopped);evidence.modelStarted=!!stopped.agentId;}catch{restorationErrors.push('RUN_STOP_NOT_CONFIRMED');}}
      try{const latest=(await api('/api/v1/execution/runs')).data;evidence.restoration.fullQueue=fullQueueState();if(!restoreAllowed(latest)||evidence.restoration.fullQueue.allActive!==0)fail('ACTIVE_RUN_RESTORE_DEFERRED');if(evidence.runId&&!evidence.executionFinished)fail('OWN_PROCESS_STOP_RESTORE_DEFERRED');
        if(localChanged){const current=(await inspectNode()).template;if(same(current,plan.smokeTemplate))patchLocal(plan.smokeTemplate,node.template,false);else if(!same(current,node.template))fail('LOCAL_TEMPLATE_CAS_CONFLICT');evidence.restoration.local=true;}
        if(centralChanged){const current=(await api('/api/v1/execution/config')).data.templates.find(t=>t.id===NODE.templateId);if(same(current,plan.smokeTemplate))await setCentral(api,plan.smokeTemplate,template);else if(!same(current,template))fail('CENTRAL_TEMPLATE_CAS_CONFLICT');evidence.restoration.central=true;}
        if(localChanged)restartNode();
      }catch(error){restorationErrors.push(/^[A-Z0-9_]+$/.test(error.message)?error.message:'TEMPLATE_RESTORE_FAILED');}
      evidence.restoration.errors=restorationErrors;evidence.restoration.complete=(!localChanged||evidence.restoration.local)&&(!centralChanged||evidence.restoration.central)&&restorationErrors.length===0;evidence.verificationChecks=connectionChecks(evidence);evidence.failedChecks=Object.entries(evidence.verificationChecks).filter(([,passed])=>passed!==true).map(([name])=>name);evidence.passed=!evidence.error&&evidence.failedChecks.length===0&&evidence.restoration.complete;evidence.completed=evidence.passed;evidence.stage=evidence.passed?'verified':evidence.restoration.complete?'verification-failed':'restore-review-required';await save();
      if(!evidence.restoration.complete)fail('HANDSHAKE_RESTORATION_REQUIRES_REVIEW');
    }
    return {passed:evidence.passed,completed:evidence.completed,checks:evidence.verificationChecks,failedChecks:evidence.failedChecks,taskId:evidence.taskId,runId:evidence.runId,result:evidence.result,taskStatus:evidence.taskStatus,sourceMetadataUnchanged:evidence.sourceMetadataUnchanged,sourceContentUnchanged:evidence.sourceContentUnchanged,sourceComparison:evidence.sourceComparison,observerDedupConfirmed:evidence.observerDedupConfirmed,tokenTotals:evidence.tokenTotals,restoration:evidence.restoration,modelStarted:evidence.modelStarted,modelMayHaveStarted:evidence.modelMayHaveStarted,fullDeliveryAccepted:false,evidencePath:target};
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const index=process.argv.indexOf('--evidence'),execute=process.argv.includes('--execute'),action=process.argv.includes('--resume-existing')?resumeExistingVerification:verifyExecution,result=await action({execute,...(index>=0?{evidencePath:process.argv[index+1]}:{})});console.log(JSON.stringify(result));if(execute&&result.passed!==true)process.exitCode=1;}catch(error){console.error(JSON.stringify({ok:false,...safeApiFailure(error),modelRunMayExist:process.argv.includes('--execute')}));process.exitCode=1;}}
