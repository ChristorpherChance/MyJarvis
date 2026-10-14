/** A bounded real Jarvis pause/resume test. Default only inspects readiness. */
import {mkdir,readFile,open,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withPlatform,remote,primary,lanProfile,python} from './managed-server-client.mjs';
import {expectedRunId,safeApiFailure,processStopped} from './verify-software-factory-execution.mjs';

const SCOPE=Object.freeze({machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',templateId:'msf-101-claude',workspace:'/home/superopen/All-Projects/msf-supervised-tests',workspaceRoot:'/home/superopen/All-Projects',config:'/var/lib/jarvis-development/101/config.json',unit:'jarvis-software-factory-development.service',probe:'/opt/jarvis-development/software-factory/full-test/probe.py'});
export const supervisionScope=SCOPE;
const JOURNAL=resolve('artifacts/software-factory/full-test/supervision-probe.json');
const TERMINAL=new Set(['succeeded','failed','cancelled','timeout','interrupted','round-limit','budget-exhausted','awaiting-cost']);
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b);
const fail=code=>{throw Error(code)};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const remoteJson=(payload,code)=>JSON.parse(remote(lanProfile,'jarvis-101',python({...SCOPE,...payload},code),true));
const cleanEvents=events=>(events??[]).map(e=>Object.fromEntries(['id','type','name','event','domain','entityId','objectId','at','createdAt'].filter(k=>typeof e[k]==='string'||typeof e[k]==='number').map(k=>[k,e[k]])));

export function probeTemplate(job,original){
 if(!/^[a-f0-9]{32}$/.test(job)||original?.id!==SCOPE.templateId||original.machineId!==SCOPE.machineId||original.workspaceRoot!==SCOPE.workspaceRoot)fail('PROBE_TEMPLATE_SCOPE_INVALID');
 return {id:SCOPE.templateId,machineId:SCOPE.machineId,engine:'fixed',program:'/usr/bin/python3',args:[SCOPE.probe,'--job',job,'{workspace}','{runId}'],workspaceRoot:SCOPE.workspaceRoot,maxRounds:1,timeoutSec:180,leaseSec:60,budgetCurrency:'USD'};
}
export function probeTaskPayload(deadline){return {title:'101 监督控制实测：暂停与检查点续做',projectId:SCOPE.projectId,machineId:SCOPE.machineId,agent:SCOPE.templateId,mode:'managed',worktree:SCOPE.workspace,budget:1,retryLimit:0,deadline,skillIds:[],goal:'固定无模型探针验证真实任务派发、签名执行、暂停进程和同一检查点续做。只写独立测试副本中的 probe 目录，不运行产品测试、不修改工厂源码、不重启业务服务。',criteria:'第一轮确实运行并创建检查点；暂停后有同一已配对节点签名 cancelled 回执；同任务恢复产生不同 runId，复用原检查点并签名成功。独立核对 root-owned 程序指纹、固定目录、检查点、报告、零模型用量与原模板恢复。此结果不证明 Claude 原生会话续接、无限监督或软件工厂产品通过。'};}
export function probeRunMatches(run,journal,intent,task){
 if(!run||!intent?.envelope?.commandId||typeof intent.runId!=='string'||!journal?.taskId)return false;
 return run.id===intent.runId&&intent.runId===expectedRunId(intent.envelope.commandId)&&run.domain==='tasks'&&run.kind==='development'&&run.scope==='personal'&&run.taskId===journal.taskId&&run.objectId===journal.taskId&&run.projectId===SCOPE.projectId&&run.machineId===SCOPE.machineId&&run.executorId===SCOPE.templateId&&run.workspace===SCOPE.workspace&&(!run.agentId||run.agentId===journal.nodeAgentId)&&(!task||task.id===journal.taskId&&task.ownerId==='server-admin'&&task.scope==='personal'&&task.mode==='managed'&&task.projectId===SCOPE.projectId&&task.machineId===SCOPE.machineId&&task.agent===SCOPE.templateId&&task.worktree===SCOPE.workspace&&task.executionRequest?.id===run.id);
}
export function zeroProbeUsage(usage){return !!usage&&['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','costUSD'].every(k=>usage[k]===0)&&usage.usageComplete===true&&usage.provider==='fixed-supervision-probe'&&usage.model==='no-model'&&usage.costKind==='provider-reported';}
function safeRun(run){const r=run.result??run.executionResult;return {id:run.id,status:run.status,agentId:run.agentId??null,taskId:run.taskId,objectId:run.objectId,machineId:run.machineId,executorId:run.executorId,projectId:run.projectId,workspace:run.workspace,updatedAt:run.updatedAt,result:r?Object.fromEntries(['outcome','exitCode','rounds','source','verification','usage','artifacts','at'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])):null};}
async function save(journal){await mkdir(dirname(JOURNAL),{recursive:true});const temporary=JOURNAL+'.'+randomUUID()+'.tmp';let handle;try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(journal,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(temporary,JOURNAL);}finally{await handle?.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e})}}

export function queueState(){return JSON.parse(primary(`import sqlite3,json,datetime
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 print(json.dumps({'allActive':c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN ('queued','running')").fetchone()[0],'fullTable':True,'readOnly':True,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
finally:c.close()
`));}
export function nodeState(){return remoteJson({},String.raw`import os,json,stat,subprocess
from pathlib import Path
c=Path(p['config']);s=c.lstat()
if c.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_mode&0o077:raise RuntimeError('PRIVATE_NODE_CONFIG_INVALID')
cfg=json.loads(c.read_text());ts=[x for x in cfg.get('templates',[]) if x.get('id')==p['templateId']]
if cfg.get('machineId')!=p['machineId'] or not cfg.get('agentId') or not cfg.get('privateKey') or len(ts)!=1:raise RuntimeError('NODE_SCOPE_INVALID')
r=subprocess.run(['/usr/bin/systemctl','show',p['unit'],'--property=ActiveState,SubState,MainPID'],capture_output=True,text=True,check=True,timeout=10)
print(json.dumps({'agentId':cfg['agentId'],'template':ts[0],'workspaceRoots':cfg.get('workspaceRoots',[]),'unit':dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x),'credentialsExported':False}))
`);}
function deployProbe(job,bytes){return remoteJson({job,bytes:bytes.toString('base64'),sha256:hash(bytes)},String.raw`import os,pwd,stat,hashlib,tempfile
from pathlib import Path
a=pwd.getpwnam('superopen')
def check(q,owner=None):
 for part in [q,*q.parents]:
  s=part.lstat()
  if stat.S_ISLNK(s.st_mode) or not stat.S_ISDIR(s.st_mode):raise RuntimeError('INSTALL_ANCESTOR_INVALID')
  if owner==0 and (s.st_uid!=0 or s.st_mode&0o022):raise RuntimeError('INSTALL_ROOT_ANCESTOR_UNTRUSTED')
 if owner is not None and q.stat().st_uid!=owner:raise RuntimeError('INSTALL_OWNER_INVALID')
parent=Path(p['probe']).parent
check(parent.parent,0)
try:parent.mkdir(mode=0o755)
except FileExistsError:pass
check(parent,0)
if parent.stat().st_mode&0o022:raise RuntimeError('INSTALL_ROOT_WRITABLE')
q=Path(p['probe'])
if q.exists() or q.is_symlink():
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022:raise RuntimeError('PROBE_INSTALLED_FILE_INVALID')
data=base64.b64decode(p['bytes'])
if hashlib.sha256(data).hexdigest()!=p['sha256']:raise RuntimeError('PROBE_TRANSFER_HASH_INVALID')
fd,temp=tempfile.mkstemp(prefix='.probe-',dir=parent)
try:
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chown(temp,0,0);os.chmod(temp,0o644);os.replace(temp,q)
finally:
 if os.path.exists(temp):os.unlink(temp)
workspace=Path(p['workspace']);check(workspace.parent,a.pw_uid)
try:workspace.mkdir(mode=0o700);os.chown(workspace,a.pw_uid,a.pw_gid)
except FileExistsError:pass
check(workspace,a.pw_uid)
if workspace.stat().st_mode&0o077:raise RuntimeError('PROBE_WORKSPACE_MODE_INVALID')
if hashlib.sha256(q.read_bytes()).hexdigest()!=p['sha256']:raise RuntimeError('PROBE_INSTALLED_HASH_INVALID')
print(json.dumps({'installedSHA256':p['sha256'],'script':str(q),'workspace':str(workspace),'rootOwnedScript':True,'workspaceOwner':'superopen','existingParentsChanged':False,'credentialsExported':False}))
`);}
export function patchNode(expected,replacement,job){if(!/^[a-f0-9]{32}$/.test(job)||expected?.id!==SCOPE.templateId||replacement?.id!==SCOPE.templateId||expected?.machineId!==SCOPE.machineId||replacement?.machineId!==SCOPE.machineId)fail('LOCAL_TEMPLATE_PATCH_SCOPE_INVALID');return remoteJson({expected,replacement,job},String.raw`import os,json,stat,tempfile,subprocess
from pathlib import Path
c=Path(p['config']);s=c.lstat()
if c.is_symlink() or not stat.S_ISREG(s.st_mode) or s.st_mode&0o077:raise RuntimeError('PRIVATE_NODE_CONFIG_INVALID')
cfg=json.loads(c.read_text());indices=[i for i,t in enumerate(cfg.get('templates',[])) if t.get('id')==p['templateId']]
if cfg.get('machineId')!=p['machineId'] or len(indices)!=1 or cfg['templates'][indices[0]]!=p['expected']:raise RuntimeError('LOCAL_TEMPLATE_CAS_CONFLICT')
backup=c.parent/('probe-'+p['job']+'-private-backup.json')
if not backup.exists():
 fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(c.read_bytes());f.flush();os.fsync(f.fileno())
 os.chown(backup,s.st_uid,s.st_gid)
else:
 bs=backup.lstat()
 if backup.is_symlink() or not stat.S_ISREG(bs.st_mode) or bs.st_mode&0o077 or bs.st_nlink!=1 or bs.st_uid!=s.st_uid:raise RuntimeError('PRIVATE_BACKUP_INVALID')
cfg['templates'][indices[0]]=p['replacement']
fd,temp=tempfile.mkstemp(prefix='.control-probe-',dir=c.parent)
try:
 with os.fdopen(fd,'w') as f:json.dump(cfg,f);f.write(chr(10));f.flush();os.fsync(f.fileno())
 os.chown(temp,s.st_uid,s.st_gid);os.chmod(temp,0o600);os.replace(temp,c)
finally:
 if os.path.exists(temp):os.unlink(temp)
subprocess.run(['/usr/bin/systemctl','restart',p['unit']],capture_output=True,check=True,timeout=20)
print(json.dumps({'templateUpdated':True,'nodeRestarted':True,'privateBackupRemoteOnly':True,'credentialsExported':False}))
`);}
function inspectArtifacts(job,expectedSHA256,runIds=[]){return remoteJson({job,expectedSHA256,runIds},String.raw`import os,stat,hashlib,pwd
from pathlib import Path
import re
q=Path(p['probe'])
for part in [q,*q.parents]:
 s=part.lstat()
 if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('PROBE_PROGRAM_TRUST_INVALID')
if hashlib.sha256(q.read_bytes()).hexdigest()!=p['expectedSHA256']:raise RuntimeError('PROBE_PROGRAM_CHANGED')
base=Path(p['workspace'])/('probe-'+p['job'])
for part in [base,*base.parents]:
 if not part.exists():print(json.dumps({'present':False,'scriptSHA256':p['expectedSHA256']}));raise SystemExit(0)
 s=part.lstat()
 if stat.S_ISLNK(s.st_mode) or not stat.S_ISDIR(s.st_mode):raise RuntimeError('PROBE_ARTIFACT_ANCESTOR_INVALID')
uid=base.stat().st_uid
if uid!=pwd.getpwnam('superopen').pw_uid or base.stat().st_mode&0o077:raise RuntimeError('PROBE_ARTIFACT_DIRECTORY_INVALID')
allowed={'formatVersion','job','workspace','firstRunId','runs','stage','createdAt','updatedAt','elapsedSec'}
def read(name,keys=None):
 f=base/name
 if not f.exists():return None
 s=f.lstat()
 if stat.S_ISLNK(s.st_mode) or not stat.S_ISREG(s.st_mode) or s.st_uid!=uid or s.st_nlink!=1 or s.st_size>65536:raise RuntimeError('PROBE_ARTIFACT_FILE_INVALID')
 raw=f.read_bytes();v=json.loads(raw)
 if not isinstance(v,dict) or keys is not None and set(v)!=keys:raise RuntimeError('PROBE_ARTIFACT_SHAPE_INVALID')
 return {'relativePath':str(f.relative_to(Path(p['workspace']))),'sha256':hashlib.sha256(raw).hexdigest(),'canonicalSHA256':hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'bytes':len(raw),'data':v}
checkpoint=read('checkpoint.json',allowed)
if checkpoint:
 v=checkpoint['data']
 if v.get('job')!=p['job'] or v.get('workspace')!=p['workspace'] or not re.fullmatch('[0-9a-f]{40}',v.get('firstRunId','')) or not isinstance(v.get('runs'),list) or len(v['runs'])>20:raise RuntimeError('CHECKPOINT_IDENTITY_INVALID')
 for r in v['runs']:
  if set(r)!={'runId','startedAt','mode'} or not re.fullmatch('[0-9a-f]{40}',r.get('runId','')) or r.get('mode') not in ['initial','checkpoint-reuse']:raise RuntimeError('CHECKPOINT_RUN_SHAPE_INVALID')
reports=[]
keys={'formatVersion','job','runId','workspace','firstRunId','previousRunId','mode','checkpointBeforeSHA256','checkpointAfterSHA256','checkpointReused','remoteStopVerifiedByProbe','modelCalled','sourceModified','productTestsRun','finishedAt','usage'}
for rid in p['runIds']:
 if not re.fullmatch('[0-9a-f]{40}',rid):raise RuntimeError('PROBE_RUN_ID_INVALID')
 report=read('report-'+rid+'.json',keys)
 if report is not None:
  v=report['data']
  if v.get('job')!=p['job'] or v.get('runId')!=rid or v.get('workspace')!=p['workspace']:raise RuntimeError('PROBE_REPORT_IDENTITY_INVALID')
  reports.append(report)
print(json.dumps({'present':checkpoint is not None,'scriptSHA256':p['expectedSHA256'],'checkpoint':checkpoint,'reports':reports,'credentialsExported':False}))
`);}

export async function putCentral(api,expected,replacement){if(expected?.id!==SCOPE.templateId||replacement?.id!==SCOPE.templateId||expected?.machineId!==SCOPE.machineId||replacement?.machineId!==SCOPE.machineId)fail('CENTRAL_TEMPLATE_PATCH_SCOPE_INVALID');const config=(await api('/api/v1/execution/config')).data,current=config.templates.find(t=>t.id===SCOPE.templateId);if(same(current,replacement))return {revision:config.revision,reused:true};if(!same(current,expected))fail('CENTRAL_TEMPLATE_CAS_CONFLICT');const response=await api('/api/v1/execution/config',{expectedVersion:config.revision,templates:config.templates.map(t=>t.id===SCOPE.templateId?replacement:t),probes:config.probes,wol:config.wol},'PUT');return {revision:response.data.revision,reused:false};}
async function snapshot(api){const [config,caps,supervision,agents,project,budget]=await Promise.all(['/api/v1/execution/config','/api/v1/execution/capabilities','/api/v1/execution/supervision','/api/v1/execution/agents','/api/v1/projects/'+SCOPE.projectId,'/api/runtime/governance'].map(p=>api(p)));const node=nodeState(),queue=queueState();return {config:config.data,caps:caps.data,supervision:supervision.data,agents:agents.data,project:project.data,budget:budget.policy??budget.data?.policy,node,queue};}
function assertScope(journal){
 if(journal.formatVersion!==1||!same(journal.scope,SCOPE)||!/^[a-f0-9]{32}$/.test(journal.job)||journal.taskOwnerId!=='server-admin'||!same(journal.probeTemplate,probeTemplate(journal.job,journal.originalTemplate))||!same(journal.taskPayload,probeTaskPayload(journal.taskPayload?.deadline))||!/^\d{4}-\d{2}-\d{2}T/.test(journal.taskPayload.deadline??'')||!Number.isFinite(Date.parse(journal.taskPayload.deadline)))fail('PROBE_JOURNAL_SCOPE_INVALID');
 const paths={copies:'/api/v1/projects/commands/copies',create:'/api/v1/tasks/commands/create',start:'/api/v1/tasks/commands/start',pause:'/api/v1/tasks/commands/pause',resume:'/api/v1/tasks/commands/resume',cleanupCancel:'/api/v1/tasks/commands/cancel'};
 for(const [key,intent] of Object.entries(journal.intents??{})){
  const envelope=intent.envelope,payload=envelope?.payload;
  if(intent.path!==paths[key]||envelope?.scope!=='personal'||!/^[a-f0-9-]{36}$/.test(envelope?.commandId??'')||!Number.isSafeInteger(envelope.expectedVersion)||envelope.expectedVersion<0)fail('PROBE_JOURNAL_INTENT_INVALID');
  if(key==='create'&&!same(payload,journal.taskPayload)||key==='copies'&&(payload?.projectId!==SCOPE.projectId||!Array.isArray(payload?.copies))||['start','pause','resume','cleanupCancel'].includes(key)&&(payload?.taskId!==journal.taskId||Object.keys(payload).some(k=>!['taskId','reason'].includes(k))))fail('PROBE_JOURNAL_INTENT_SCOPE_INVALID');
  if(['start','resume'].includes(key)&&intent.runId!==expectedRunId(envelope.commandId))fail('PROBE_JOURNAL_RUN_ID_INVALID');
 }
}
function assertTask(task,journal){if(task.id!==journal.taskId||task.ownerId!=='server-admin'||task.scope!=='personal'||task.mode!=='managed'||task.projectId!==SCOPE.projectId||task.machineId!==SCOPE.machineId||task.agent!==SCOPE.templateId||task.worktree!==SCOPE.workspace||task.budget!==1||task.retryLimit!==0||task.goal!==journal.taskPayload.goal||task.criteria!==journal.taskPayload.criteria||task.deadline!==journal.taskPayload.deadline)fail('PROBE_TASK_SCOPE_CHANGED');}
async function recordCommand(api,journal,key,domain,name,payload,revision){
 if(!journal.intents[key]){journal.intents[key]={path:`/api/v1/${domain}/commands/${name}`,envelope:{commandId:randomUUID(),scope:'personal',expectedVersion:revision,payload}};if(domain==='tasks'&&['start','resume'].includes(name))journal.intents[key].runId=expectedRunId(journal.intents[key].envelope.commandId);await save(journal);}
 const intent=journal.intents[key];if(intent.receipt)return intent.receipt;
 const response=await api(intent.path,intent.envelope);const receipt={id:response.data.id,revision:response.data.revision,status:response.data.status,executionRequestId:response.data.executionRequest?.id??null,events:cleanEvents(response.events)};
 intent.receipt=receipt;journal.events.push(...receipt.events);await save(journal);return receipt;
}
async function runRead(api,journal,intent){let response;try{response=await api('/api/v1/execution/runs/'+intent.runId)}catch(error){if(safeApiFailure(error).httpStatus===404)return null;throw error;}const run=response.data;if(!probeRunMatches(run,journal,intent))fail('PROBE_RUN_SCOPE_CHANGED');return run;}
async function waitRun(api,journal,intent,predicate,timeoutMs=120000){const expires=Date.now()+timeoutMs;let prior;while(Date.now()<expires){const run=await runRead(api,journal,intent);if(run&&run.status!==prior){prior=run.status;journal.observations.push({at:new Date().toISOString(),runId:run.id,status:run.status,signedReceipt:run.result?.source==='signed-agent'});await save(journal);console.log(JSON.stringify({phase:'control-probe',runId:run.id,status:run.status}));}if(run&&await predicate(run))return run;await delay(1000);}fail('PROBE_RUN_WAIT_TIMEOUT');}
async function ready(api,journal){const expires=Date.now()+40000;while(Date.now()<expires){const state=await snapshot(api),template=state.config.templates.find(t=>t.id===SCOPE.templateId);if(state.caps.supervised!==false||state.supervision.stopped===true)fail('PROBE_GLOBAL_BOUNDARY_CHANGED');if(same(template,journal.probeTemplate)&&same(state.node.template,journal.probeTemplate)&&state.node.agentId===journal.nodeAgentId&&state.agents.some(a=>a.id===journal.nodeAgentId&&a.status==='online'&&!a.revoked)&&state.caps.configuredTemplates.some(t=>t.id===SCOPE.templateId&&t.ready))return;await delay(2000);}fail('PROBE_NODE_NOT_READY');}
async function stopOwnRuns(api,journal){for(const name of ['resume','start']){const intent=journal.intents[name];if(!intent?.runId)continue;const run=await runRead(api,journal,intent);if(!run||processStopped(run))continue;const task=(await api('/api/v1/tasks/'+journal.taskId)).data;assertTask(task,journal);if(!probeRunMatches(run,journal,intent,task))fail('PROBE_STOP_SCOPE_CHANGED');if(['running','queued'].includes(run.status))await api('/api/v1/execution/runs/'+run.id+'/stop',{reason:'停止本轮固定监督探针；保留检查点和真实签名结果'});await waitRun(api,journal,intent,run=>processStopped(run),120000);}}
async function restore(api,journal){
 const caps=(await api('/api/v1/execution/capabilities')).data;
 if(caps.supervised!==false){journal.restoration.deferred=true;journal.restoration.reason='全局监督策略已改变；不改动新的策略或恢复活动执行器';await save(journal);return false;}
 const queue=queueState();journal.restoreQueue=queue;
 if(queue.allActive!==0){journal.restoration.deferred=true;journal.restoration.reason='其他或本次任务仍有排队/运行请求；不停止其他任务、不恢复模板';await save(journal);return false;}
 for(const name of ['start','resume'])if(journal.intents[name]?.runId){const run=await runRead(api,journal,journal.intents[name]);if(run&&!processStopped(run)){journal.restoration.deferred=true;journal.restoration.reason='本次已认领执行尚无签名终结回执';await save(journal);return false;}}
 journal.restoration.central=await putCentral(api,journal.probeTemplate,journal.originalTemplate);await save(journal);
 const node=nodeState();if(same(node.template,journal.probeTemplate))journal.restoration.local=patchNode(journal.probeTemplate,journal.originalTemplate,journal.job);else if(same(node.template,journal.originalTemplate))journal.restoration.local={reused:true};else fail('LOCAL_TEMPLATE_CAS_CONFLICT');
 journal.restoration.deferred=false;await save(journal);const after=await snapshot(api);journal.restoration.verified=same(after.config.templates.find(t=>t.id===SCOPE.templateId),journal.originalTemplate)&&same(after.node.template,journal.originalTemplate)&&after.node.agentId===journal.nodeAgentId&&after.caps.supervised===false&&after.queue.allActive===0;
 journal.restoration.verified&&=after.node.unit.ActiveState==='active'&&after.node.unit.SubState==='running';
 await save(journal);if(!journal.restoration.verified)fail('PROBE_RESTORE_NOT_VERIFIED');return true;
}

export async function runProbe(execute=false){
 const script=await readFile('scripts/factory-supervision-probe.py'),driver=await readFile('scripts/run-factory-supervision-probe.mjs');
 return withPlatform(async({api})=>{
  if(!execute){const state=await snapshot(api),original=state.config.templates.find(t=>t.id===SCOPE.templateId);return {preparedAt:new Date().toISOString(),scope:SCOPE,scriptSHA256:hash(script),originalTemplate:original,nodeAgentId:state.node.agentId,nodeUnit:state.node.unit,queue:state.queue,globalSupervision:state.caps.supervised,stopped:state.supervision.stopped,templatesMatch:same(original,state.node.template),projectScope:state.project.scope,registeredTestCopy:state.project.copies.some(c=>c.machineId===SCOPE.machineId&&c.path===SCOPE.workspace&&c.environment==='test'),executeRequested:false,modelCalled:false};}
  let journal;try{journal=JSON.parse(await readFile(JOURNAL,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;}
  if(journal){assertScope(journal);if(journal.scriptSHA256!==hash(script)||journal.driverSHA256!==hash(driver))fail('PROBE_TOOL_CHANGED_RESUME_REQUIRES_REVIEW');if(journal.completedAt&&journal.passed)return journal;}
  else{
   const state=await snapshot(api),original=state.config.templates.find(t=>t.id===SCOPE.templateId);
   if(state.caps.supervised!==false||state.supervision.stopped===true||state.queue.allActive!==0||state.project.scope!=='personal'||state.project.ownerId!=='server-admin'||state.project.status==='archived'||state.project.status==='delivered'||!same(original,state.node.template)||state.node.unit.ActiveState!=='active'||state.node.unit.SubState!=='running'||!state.agents.some(a=>a.id===state.node.agentId&&a.status==='online'&&!a.revoked))fail('PROBE_PREFLIGHT_NOT_READY');
   const job=randomBytes(16).toString('hex');journal={formatVersion:1,scope:SCOPE,job,preparedAt:new Date().toISOString(),scriptSHA256:hash(script),driverSHA256:hash(driver),taskOwnerId:'server-admin',nodeAgentId:state.node.agentId,originalTemplate:original,probeTemplate:probeTemplate(job,original),taskPayload:probeTaskPayload(new Date(Date.now()+10*60000).toISOString()),intents:{},events:[],observations:[],restoration:{},modelCalled:false,productTestsRun:false};await save(journal);
  }
  let primaryError;
  try{
   // Every mutation has a durable job and original public template before it happens.
   if(!journal.installation){if(queueState().allActive!==0)fail('PROBE_QUEUE_BUSY');journal.installation=deployProbe(journal.job,script);await save(journal);}
   if(!journal.intents.copies?.receipt){const project=(await api('/api/v1/projects/'+SCOPE.projectId)).data;if(project.scope!=='personal'||project.ownerId!=='server-admin')fail('PROBE_PROJECT_SCOPE_CHANGED');const collision=project.copies.find(c=>c.machineId===SCOPE.machineId&&c.path===SCOPE.workspace);if(collision&&collision.environment!=='test')fail('PROBE_COPY_CONFLICT');const copies=collision?project.copies:[...project.copies,{machineId:SCOPE.machineId,path:SCOPE.workspace,branch:'test-control-probe',environment:'test'}];await recordCommand(api,journal,'copies','projects','copies',{projectId:SCOPE.projectId,copies},project.revision);}
   if(!journal.taskId){if((await api('/api/v1/execution/capabilities')).data.supervised!==false)fail('PROBE_GLOBAL_BOUNDARY_CHANGED');const receipt=await recordCommand(api,journal,'create','tasks','create',journal.taskPayload,0);journal.taskId=receipt.id;await save(journal);}
   let task=(await api('/api/v1/tasks/'+journal.taskId)).data;assertTask(task,journal);
   if(!journal.intents.start?.receipt){if(Date.parse(task.deadline)<=Date.now())fail('PROBE_APPROVED_DEADLINE_EXPIRED');if(queueState().allActive!==0)fail('PROBE_QUEUE_BUSY');journal.centralChange=await putCentral(api,journal.originalTemplate,journal.probeTemplate);await save(journal);const node=nodeState();if(same(node.template,journal.originalTemplate))journal.localChange=patchNode(journal.originalTemplate,journal.probeTemplate,journal.job);else if(!same(node.template,journal.probeTemplate))fail('LOCAL_TEMPLATE_CAS_CONFLICT');await save(journal);await ready(api,journal);await recordCommand(api,journal,'start','tasks','start',{taskId:journal.taskId,reason:'用户授权本轮真实暂停和检查点续做实测；固定无模型探针'},task.revision);}
   const first=journal.intents.start;
   if(!journal.intents.pause?.receipt){await waitRun(api,journal,first,async run=>{if(TERMINAL.has(run.status))fail('PROBE_FINISHED_BEFORE_PAUSE');if(run.status!=='running')return false;const evidence=inspectArtifacts(journal.job,journal.scriptSHA256);if(!evidence.present||evidence.checkpoint.data.firstRunId!==first.runId)return false;const logs=(await api('/api/v1/execution/runs/'+run.id+'/logs?after=0')).data.items;if(!logs.some(x=>/execution\.(?:result|progress)/.test(x.text)))return false;journal.startedEvidence={checkpoint:evidence.checkpoint,observedRun:safeRun(run),logEntries:logs.length};await save(journal);return true;},60000);task=(await api('/api/v1/tasks/'+journal.taskId)).data;assertTask(task,journal);if(task.executionRequest?.id!==first.runId)fail('PROBE_PAUSE_TARGET_CHANGED');await recordCommand(api,journal,'pause','tasks','pause',{taskId:journal.taskId,reason:'监督控制实测：停止当前固定探针，等待真实签名取消回执后再续做'},task.revision);}
   const stopped=await waitRun(api,journal,first,run=>run.status==='cancelled'&&run.result?.source==='signed-agent'&&run.result?.outcome==='cancelled',120000);
   journal.cancelledRun=safeRun(stopped);if(!zeroProbeUsage(stopped.result.usage))fail('PROBE_CANCEL_USAGE_NOT_ZERO');
   if(!journal.beforeResume){journal.beforeResume=inspectArtifacts(journal.job,journal.scriptSHA256);await save(journal);}
   if(!journal.intents.resume?.receipt){if((await api('/api/v1/execution/capabilities')).data.supervised!==false)fail('PROBE_GLOBAL_BOUNDARY_CHANGED');task=(await api('/api/v1/tasks/'+journal.taskId)).data;assertTask(task,journal);if(task.status!=='paused'||task.executionRequest?.id!==first.runId||Date.parse(task.deadline)<=Date.now())fail('PROBE_RESUME_BOUNDARY_CHANGED');await recordCommand(api,journal,'resume','tasks','resume',{taskId:journal.taskId,reason:'已核对上轮签名停止，按同一明确固定 job 的检查点续做'},task.revision);}
   const resumed=await waitRun(api,journal,journal.intents.resume,run=>{if(!TERMINAL.has(run.status)||!processStopped(run))return false;if(run.status!=='succeeded'||run.result?.source!=='signed-agent'||run.result?.outcome!=='success'||run.result.exitCode!==0||run.result.rounds!==1)fail('PROBE_RESUME_FAILED');return true;},120000);
   journal.resumedRun=safeRun(resumed);journal.finalEvidence=inspectArtifacts(journal.job,journal.scriptSHA256,[journal.intents.resume.runId]);const cp=journal.finalEvidence.checkpoint?.data,report=journal.finalEvidence.reports.find(r=>r.data.runId===resumed.id)?.data;
   journal.checks={twoDifferentRuns:first.runId!==resumed.id,signedRealCancellation:stopped.agentId===journal.nodeAgentId&&stopped.result.source==='signed-agent'&&stopped.result.outcome==='cancelled',signedResume:resumed.agentId===journal.nodeAgentId&&resumed.result.source==='signed-agent'&&resumed.result.outcome==='success',onlyTwoCheckpointRuns:cp?.runs?.length===2&&cp.runs[0].runId===first.runId&&cp.runs[1].runId===resumed.id,checkpointIdentity:cp?.firstRunId===first.runId&&cp?.job===journal.job&&cp?.workspace===SCOPE.workspace,resumeBoundToPriorCheckpoint:report?.checkpointBeforeSHA256===journal.beforeResume.checkpoint?.canonicalSHA256&&report?.checkpointAfterSHA256===journal.finalEvidence.checkpoint?.canonicalSHA256,reportTruthful:report?.checkpointReused===true&&report?.previousRunId===first.runId&&report?.remoteStopVerifiedByProbe===false&&report?.modelCalled===false&&report?.sourceModified===false&&report?.productTestsRun===false,zeroUsage:zeroProbeUsage(stopped.result.usage)&&zeroProbeUsage(resumed.result.usage)&&zeroProbeUsage(report?.usage),taskValidating:(await api('/api/v1/tasks/'+journal.taskId)).data.status==='validating'};
   if(Object.values(journal.checks).some(v=>v!==true))fail('PROBE_INDEPENDENT_CHECKS_FAILED');journal.stage='control-checks-passed';await save(journal);
  }catch(error){primaryError=error;journal.failure=safeApiFailure(error);journal.stage='failed';await save(journal);}
  finally{
   try{await stopOwnRuns(api,journal);journal.stoppedOwnRuns=true;}catch(error){journal.cleanupFailure=safeApiFailure(error);}
   if(primaryError&&journal.taskId)try{const ownTask=(await api('/api/v1/tasks/'+journal.taskId)).data;assertTask(ownTask,journal);if(!ownTask.executionRequest&&ownTask.status==='queued')await recordCommand(api,journal,'cleanupCancel','tasks','cancel',{taskId:journal.taskId,reason:'探针准备失败，取消尚未派发的本次任务，防止后续误启动'},ownTask.revision);}catch(error){journal.cleanupFailure=safeApiFailure(error);}
   try{await restore(api,journal);}catch(error){journal.restoration.failure=safeApiFailure(error);journal.restoration.deferred=true;}
   journal.passed=!primaryError&&!journal.cleanupFailure&&Object.values(journal.checks??{}).length>0&&Object.values(journal.checks).every(v=>v===true)&&journal.restoration.verified===true;journal.finishedAt=new Date().toISOString();if(journal.passed)journal.completedAt=journal.finishedAt;await save(journal);
  }
  if(!journal.passed)throw Error('PROBE_DID_NOT_PASS_SEE_PUBLIC_JOURNAL');return journal;
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.some(a=>a!=='--execute')||args.length>1)throw Error('ONLY_EXECUTE_FLAG_ALLOWED');
 let lock;try{if(args.includes('--execute')){await mkdir(dirname(JOURNAL),{recursive:true});lock=await open(JOURNAL+'.lock','wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));await lock.sync();}const result=await runProbe(args.includes('--execute'));console.log(JSON.stringify(result));}catch(error){console.error(JSON.stringify({failed:true,...safeApiFailure(error)}));process.exitCode=1;}finally{if(lock){await lock.close();await unlink(JOURNAL+'.lock')}}
}
