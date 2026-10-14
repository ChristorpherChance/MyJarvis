/** Versioned current-main full acceptance batch R26-4, dispatched and recorded through Jarvis. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {withPlatform,remote,primary,lanProfile,python} from './managed-server-client.mjs';
import {nodeState,queueState,patchNode,putCentral} from './run-factory-supervision-probe.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',machineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
const templateId='msf-101-claude',source='/home/superopen/All-Projects/msf';
const batchKey=process.argv.find(v=>v.startsWith('--batch-key='))?.slice('--batch-key='.length)??'';
if(batchKey&&!/^[a-z][a-z0-9-]{0,63}$/.test(batchKey))throw Error('MAIN_BASELINE_BATCH_KEY_INVALID');
const suffix=batchKey?'-'+batchKey:'';
const journalPath='.jarvis-dev/maintenance/factory-main-acceptance-r26-4'+suffix+'.json',dir='artifacts/software-factory/acceptance-r26';
const action=process.argv[2]??'inspect';
if(!['inspect','start','check','restore'].includes(action))throw Error('MAIN_BASELINE_ACTION_INVALID');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const same=(a,b)=>canonical(a)===canonical(b),sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');

const trustedTools=JSON.parse(remote(lanProfile,'jarvis-101',python({files:[['/usr/local/libexec/jarvis-msf-main-acceptance-r26-4',sha(await readFile('scripts/factory-main-acceptance-wrapper-r26-4.py'))],['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs',sha(await readFile('scripts/factory-no-model-receipt-r26.mjs'))]]},String.raw`import json,stat,hashlib
from pathlib import Path
for name,expected in p['files']:
 q=Path(name)
 for part in [q,*q.parents]:
  s=part.lstat()
  if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('MAIN_ACCEPTANCE_TOOL_UNTRUSTED')
 if not stat.S_ISREG(q.lstat().st_mode) or q.lstat().st_nlink!=1 or hashlib.sha256(q.read_bytes()).hexdigest()!=expected:raise RuntimeError('MAIN_ACCEPTANCE_TOOL_CHANGED')
print(json.dumps({'verified':True,'files':[{'path':v[0],'sha256':v[1]} for v in p['files']]}))
`),true));
let j;try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function save(){await mkdir(dirname(journalPath),{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);}
let result;
try{result=await withPlatform(async({api})=>{
 async function readRun(){if(!j?.runId)return null;try{return (await api('/api/v1/execution/runs/'+j.runId)).data;}catch(e){if(/^API_404 /.test(e.message))return null;throw e;}}
 function assertRun(run){
  if(!run||run.projectId!==projectId||run.workspace!==source||run.taskId!==j.taskId||run.executorId!==templateId||run.machineId!==machineId||run.agentId&&run.agentId!==j.nodeAgentId||run.id!==expectedRunId(j.intents.start.commandId))throw Error('MAIN_BASELINE_ACTUAL_RUN_SCOPE_MISMATCH');
  const actual=JSON.parse(primary(python({runId:j.runId},String.raw`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10)
try:
 row=c.execute('SELECT json FROM execution_runs WHERE id=?',(p['runId'],)).fetchone()
 if row is None:raise RuntimeError('MAIN_BASELINE_RUN_MISSING')
 print(json.dumps({'template':json.loads(row[0])['template']}))
finally:c.close()
`)));
  if(!same(actual.template,j.fixedTemplate))throw Error('MAIN_BASELINE_FROZEN_RUN_TEMPLATE_CHANGED');
 }
 function assertNodeQuiet(){
  const proof=JSON.parse(remote(lanProfile,'jarvis-101',python({agentId:j.nodeAgentId},String.raw`import sqlite3,json,subprocess
from pathlib import Path
unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True).splitlines() if '=' in x)
pid=int(unit.get('MainPID',0));children=[]
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  if int(next(v.split(':',1)[1] for v in (q/'status').read_text().splitlines() if v.startswith('PPid:')))==pid:children.append(q.name)
 except (FileNotFoundError,PermissionError,StopIteration):pass
c=sqlite3.connect('file:/var/lib/jarvis-development/101/.delivery-'+p['agentId']+'/journal.sqlite?mode=ro',uri=True,timeout=10)
try:counts={'runs':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'deliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'logs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
finally:c.close()
print(json.dumps({'active':unit.get('ActiveState')=='active','children':children,'counts':counts}))
`),true));
  if(!proof.active||proof.children.length||Object.values(proof.counts).some(Boolean))throw Error('MAIN_BASELINE_NODE_NOT_RECONCILED');
  return proof;
 }
 const global=(await api('/api/v1/execution/supervision')).data;
 if(global.supervised!==false||global.stopped)throw Error('MAIN_BASELINE_GLOBAL_SCOPE_CHANGED');
 const profile=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(profile.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||profile.config.costPolicy!=='record-only')throw Error('MAIN_BASELINE_GOALS_CHANGED');
 const config=(await api('/api/v1/execution/config')).data;
 const central=config.templates.find(t=>t.id===templateId),node=nodeState();
 if(!j){
  if(action==='check'||action==='restore')throw Error('MAIN_BASELINE_JOURNAL_MISSING');
  if(!same(central,node.template)||central?.engine!=='claude'||node.unit.ActiveState!=='active'||queueState().allActive!==0)throw Error('MAIN_BASELINE_NODE_NOT_IDLE');
  const actual=JSON.parse(remote(lanProfile,'jarvis-101',python({source,runId:randomUUID(),wrapperSHA256:sha(await readFile('scripts/software-factory-validation-wrapper.py')),validatorSHA256:sha(await readFile('scripts/software-factory-validation.mjs'))},String.raw`import hashlib,stat,subprocess,json
from pathlib import Path
for path,expected in [('/usr/local/libexec/jarvis-msf-validation',p['wrapperSHA256']),('/opt/jarvis-development/software-factory/validate-msf.mjs',p['validatorSHA256'])]:
 q=Path(path)
 for part in [q,*q.parents]:
  s=part.lstat()
  if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('MAIN_BASELINE_TOOL_UNTRUSTED')
 if hashlib.sha256(q.read_bytes()).hexdigest()!=expected:raise RuntimeError('MAIN_BASELINE_TOOL_CHANGED')
r=subprocess.run(['/usr/local/libexec/jarvis-msf-validation',p['source'],p['runId'],'--inspect-state'],capture_output=True,text=True,timeout=90)
if r.returncode!=0:raise RuntimeError('MAIN_BASELINE_SOURCE_INSPECTION_FAILED')
v=json.loads(r.stdout)
if not v.get('ok') or v.get('sourceStateChanged'):raise RuntimeError('MAIN_BASELINE_SOURCE_NOT_STABLE')
print(json.dumps(v))
`),true,{timeoutMs:120000}));
  if(actual.sourceFingerprint!=='151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea')throw Error('MAIN_ACCEPTANCE_SOURCE_CHANGED_BEFORE_PREPARATION');
  const fixed={id:templateId,machineId,engine:'fixed',program:'/opt/jarvis-development/node/bin/node',args:['/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs'],workspaceRoot:central.workspaceRoot,maxRounds:1,timeoutSec:4200,leaseSec:60,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-msf-main-acceptance-r26-4','{workspace}','{runId}'],timeoutSec:3600}};
  if(action==='inspect')return {at:new Date().toISOString(),source,sourceFingerprint:actual.sourceFingerprint,sourceHead:actual.gitBefore?.head??null,files:actual.files,ready:true,modelsInvoked:false,scope:'isolated current-main full existing test suite, prototypes, package and runtime; independent product acceptance remains pending',trustedTools,fixedTemplate:fixed};
  j={version:1,projectId,machineId,source,batchKey,job:randomBytes(16).toString('hex'),originalTemplate:central,fixedTemplate:fixed,nodeAgentId:node.agentId,initialProfileSHA256:sha(profile),profileRevision:profile.revision,sourceObservation:actual,intents:{},createdAt:new Date().toISOString()};await save();
 }
 if(j.projectId!==projectId||j.source!==source||j.machineId!==machineId||(j.batchKey??'')!==batchKey)throw Error('MAIN_BASELINE_JOURNAL_SCOPE_MISMATCH');
 if(action==='start'){
  if(j.runId&&!j.started){const existing=await readRun();if(existing){assertRun(existing);j.started=true;j.startResponseReconciled=true;await save();}}
  // Freeze and read back the no-model executor BEFORE a managed task exists.
  // A scheduler can never observe this new task against the native template.
  if(!j.started){
   if(queueState().allActive!==0)throw Error('MAIN_BASELINE_QUEUE_NOT_IDLE');
   j.nodeQuietBefore=assertNodeQuiet();j.fixedPreparationIntent={at:new Date().toISOString(),expectedOriginalSHA256:sha(j.originalTemplate),fixedSHA256:sha(j.fixedTemplate)};await save();
   j.centralChange=await putCentral(api,j.originalTemplate,j.fixedTemplate);await save();
   const currentNode=nodeState();if(same(currentNode.template,j.originalTemplate)){j.nodeChange=patchNode(j.originalTemplate,j.fixedTemplate,j.job);await save();}else if(!same(currentNode.template,j.fixedTemplate))throw Error('MAIN_BASELINE_NODE_CONFIG_CONFLICT');
   const until=Date.now()+45000;let ready=false;while(Date.now()<until){const caps=(await api('/api/v1/execution/capabilities')).data;const centralRead=(await api('/api/v1/execution/config')).data.templates.find(t=>t.id===templateId);const nodeRead=nodeState();if(same(centralRead,j.fixedTemplate)&&same(nodeRead.template,j.fixedTemplate)&&nodeRead.agentId===j.nodeAgentId&&nodeRead.unit.ActiveState==='active'&&caps.configuredTemplates.some(t=>t.id===templateId&&t.ready)){ready=true;break;}await new Promise(r=>setTimeout(r,2000));}if(!ready)throw Error('MAIN_BASELINE_EXECUTOR_NOT_READY');
   j.fixedReadyAt=new Date().toISOString();j.fixedTemplateReadbackSHA256=sha(j.fixedTemplate);await save();
  }
  if(!j.intents.create){j.intents.create={commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{title:'AT-01R · 当前主线：报告修复后完整复验',projectId,machineId,agent:templateId,mode:'managed',worktree:source,budget:1,retryLimit:0,deadline:new Date(Date.now()+60*60000).toISOString(),skillIds:[],goal:'本轮仅修复验收程序错误读取测试清单导致最终报告缺失的问题；保留旧失败记录及源码一致性门，不忽略测试生成文件。以现有成果测试验收为主，固定当前main公开源码独立快照，运行完整现有shared/server单测和集成测试、覆盖率、30组原型回归、构建、类型检查、打包解包、新库运行健康和接口回读。使用本轮独立PostgreSQL/Redis/MinIO与有限沙箱代理，禁止模型及公网出站、生产数据和服务操作，原源码不修改。保留失败、超时、未测和未知，并按证据安排后续修复；旧R22候选历史独立保留。',criteria:'签名真实回执绑定runId和当前main同一源码指纹；全部适用测试文件与suite分母保留，逐项真实执行/退出码/数量、交付包和隔离安装启动证据、按runId清理私有资源。非零、缺失、跳过、未知均不得验收通过。执行完成、产品达标与74原目标独立验收分别记录。费用与Token详细记录，不设费用上限。'}};await save();}
  if(!j.taskId){if(!j.fixedReadyAt)throw Error('MAIN_BASELINE_FIXED_READY_REQUIRED_BEFORE_TASK');j.taskId=(await api('/api/v1/tasks/commands/create',j.intents.create)).data.id;await save();}
  if(!j.intents.start){const task=(await api('/api/v1/tasks/'+j.taskId)).data;j.intents.start={commandId:randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId:j.taskId,reason:'验收程序报告生成修复后重新开始现有main完整测试验收批次；固定无模型隔离执行，保留旧目标与开发记录。'}};j.runId=expectedRunId(j.intents.start.commandId);await save();}
  if(!j.started){
   const existing=await readRun();
   if(existing){assertRun(existing);j.started=true;j.startResponseReconciled=true;await save();}
  }
  if(!j.started){
   if(queueState().allActive!==0)throw Error('MAIN_BASELINE_QUEUE_NOT_IDLE');
   j.nodeQuietBeforeDispatch=assertNodeQuiet();await save();
   if(!same((await api('/api/v1/execution/config')).data.templates.find(t=>t.id===templateId),j.fixedTemplate)||!same(nodeState().template,j.fixedTemplate))throw Error('MAIN_BASELINE_FIXED_CHANGED_BEFORE_DISPATCH');
   if(j.startDispatchAttemptedAt)throw Error('MAIN_BASELINE_DISPATCH_RECONCILIATION_REQUIRED');
   j.startDispatchAttemptedAt=new Date().toISOString();await save();
   j.startReceipt=(await api('/api/v1/tasks/commands/start',j.intents.start)).data;j.started=true;await save();
  }
 }
 const run=await readRun();if(run)assertRun(run);
 if(action==='restore'){
  if(queueState().allActive!==0||run&&(!run.result||run.result.source!=='signed-agent'||['queued','running'].includes(run.status)))throw Error('MAIN_BASELINE_TERMINAL_REQUIRED_BEFORE_RESTORE');
  if(!run&&j.taskId){const task=(await api('/api/v1/tasks/'+j.taskId)).data;if(task.executionRequest||j.started)throw Error('MAIN_BASELINE_DISPATCH_AMBIGUOUS');}
  j.nodeQuietBeforeRestore=assertNodeQuiet();await save();
  j.restorationCentral=await putCentral(api,j.fixedTemplate,j.originalTemplate);await save();
  const currentNode=nodeState();if(same(currentNode.template,j.fixedTemplate)){j.restorationNode=patchNode(j.fixedTemplate,j.originalTemplate,j.job);await save();}else if(!same(currentNode.template,j.originalTemplate))throw Error('MAIN_BASELINE_RESTORE_CONFLICT');
  const after=(await api('/api/v1/execution/config')).data;j.restored=same(after.templates.find(t=>t.id===templateId),j.originalTemplate)&&same(nodeState().template,j.originalTemplate);await save();if(!j.restored)throw Error('MAIN_BASELINE_RESTORE_UNCONFIRMED');
 }
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(sha(after)!==j.initialProfileSHA256)throw Error('MAIN_BASELINE_OLD_PROFILE_CHANGED');
 const finalConfig=(await api('/api/v1/execution/config')).data;
 const frozenTemplatesPreserved=Object.entries(profile.templateHashes).every(([id,hash])=>sha(finalConfig.templates.find(t=>t.id===id))===hash);
 if(!frozenTemplatesPreserved)throw Error('MAIN_BASELINE_OTHER_FROZEN_TEMPLATES_CHANGED');
 return {at:new Date().toISOString(),projectId,action,taskId:j.taskId,runId:j.runId,source,sourceRole:'current-main',sourceFingerprintObservedBefore:j.sourceObservation.sourceFingerprint,runStatus:run?.status??null,signed:run?.result?.source==='signed-agent',result:run?.result?{outcome:run.result.outcome,exitCode:run.result.exitCode,usage:run.result.usage,validation:run.result.validation,artifacts:run.result.artifacts}:null,oldProfileUnchanged:true,frozenTemplatesPreserved,modelsInvoked:false,objectivesAccepted:false,restored:j.restored??false,scope:'isolated current-main full existing test suite, prototypes, package and runtime; independent product acceptance remains pending'};
});}catch(error){
 const failure={at:new Date().toISOString(),projectId,action,batchKey,source,sourceRole:'current-main',taskId:j?.taskId??null,runId:j?.runId??null,
  errorCode:/^(?:MAIN_BASELINE_[A-Z_]+|API_\d{3})/.exec(error?.message??'')?.[0]??'MAIN_BASELINE_OPERATION_UNCONFIRMED',
  intentPersisted:!!j?.intents?.start,startDispatchAttempted:!!j?.startDispatchAttemptedAt,startedConfirmed:j?.started===true,restored:j?.restored===true,
  modelsInvoked:false,productAccepted:false,automaticRetry:false,privateJournalExported:false};
 await mkdir(dir,{recursive:true});const output=dir+'/main-baseline-r26-4-'+action+'-failure'+suffix+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(failure,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...failure}));throw Error(failure.errorCode);
}
await mkdir(dir,{recursive:true});
const output=dir+'/main-baseline-r26-4-'+action+suffix+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
