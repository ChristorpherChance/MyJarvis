/** Independent, local-only production-module checks. All control/host dependencies are in-memory. */
import {readFile,open,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {targetCopyR29Scope as S} from './prepare-factory-target-copy-r29.mjs';
import {canonical,nativeRepairTemplate,sha as realSHA} from './run-factory-main-repair-r26.mjs';
import {expectedRunId} from './verify-software-factory-execution.mjs';
import {acceptanceStoredRunProgram} from './run-factory-repair-acceptance-r26.mjs';

const target='scripts/run-factory-target-repair-r29.mjs';
const baseSHA='9c6fd214eb3fb55020089270ff074f9217f99519f098a0ab8c05eab3ac2b5172';
const profileSHA='367749621fe0cb5aa4f0c441a9524463042f8d33d2d863d960eaae366fef12b9';
const jp='.jarvis-dev/maintenance/factory-target-repair-r29.json';
const copyPath='.jarvis-dev/maintenance/factory-target-copy-r29.json';
const need=(v,c)=>{if(!v)throw Error(c);};
const clone=v=>JSON.parse(JSON.stringify(v));

async function load(source,{q=null,wrongRun=false,stopped=false,cleanup=null,invalidProject=false}={}){
 const fakeOriginal={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/controlled/claude',fixtureOriginal:true};
 const profile={fixtureProfile:true};
 const sha=v=>v?.fixtureOriginal===true?baseSHA:v?.fixtureProfile===true?profileSHA:realSHA(v);
 const copy={version:1,scope:S,job:'a'.repeat(32),prepared:true};
 const state={files:new Map(),tasks:new Map(),runs:new Map(),central:fakeOriginal,node:fakeOriginal,mutations:[],calls:[],q:null};
 const sourceState={sha256:S.baselineSHA,metadataSHA:S.baselineMetadataSHA,files:608,stable:true,identity:{device:1,inode:2}};
 const host={helperVerified:true,originBound:true,source:sourceState,candidate:{...sourceState,identity:{device:1,inode:3}},quiet:{children:[],counts:{runs:0,deliveries:0,logs:0}}};
 copy.lastObservation=clone(host);state.files.set(copyPath,JSON.stringify(copy));
 state.files.set('artifacts/software-factory/acceptance-r28/verifier-installation-9e678be1-c0cb-433d-9e80-726f1f6d4ed7.json','{}');
 const protectedHost={source:{sha256:'main'},oldCandidate:{sha256:'oldCandidate'},candidate:sourceState,oldImmutable:{tool:'immutable'},installed:{wrapper:'immutable'},originSHA256:'origin',nodeTemplates:{otherTemplatesSHA256:'otherNode'}};
 const protectedInventory={source:protectedHost.source,oldCandidate:protectedHost.oldCandidate,candidate:protectedHost.candidate,oldImmutable:protectedHost.oldImmutable,installed:protectedHost.installed,originSHA256:protectedHost.originSHA256,otherNodeTemplatesSHA256:protectedHost.nodeTemplates.otherTemplatesSHA256};
 const others=Array.from({length:27},(_,i)=>({id:'other-'+i,machineId:'other',fixture:true}));
 const stat=()=>({isFile:()=>true,isSymbolicLink:()=>false,dev:1,ino:4});
 const fs={readFile:async path=>{if(!state.files.has(path)){const e=Error('controlled absent');e.code='ENOENT';throw e;}return state.files.get(path);},open:async(path,flags)=>{if(flags==='wx'&&state.files.has(path)){const e=Error('controlled exists');e.code='EEXIST';throw e;}if(flags==='wx')state.files.set(path,'');return {writeFile:async raw=>state.files.set(path,String(raw)),sync:async()=>{},close:async()=>{},stat:async()=>stat()};},lstat:async()=>stat(),rename:async(from,to)=>{state.files.set(to,state.files.get(from));state.files.delete(from);},mkdir:async()=>{},unlink:async path=>state.files.delete(path)};
 const api=async(path,envelope)=>{
  state.calls.push(path);
  if(path.endsWith('/autonomy'))return {data:profile};
  if(path==='/api/v1/projects/'+S.projectId)return {data:{id:S.projectId,ownerId:invalidProject?'different-owner':'server-admin',scope:'personal',status:'active',copies:[{machineId:S.machineId,path:S.workspace,environment:'development',branch:'snapshot:9b07a511-r29'}]}};
  if(path==='/api/v1/execution/supervision')return {data:{supervised:false,stopped:false}};
  if(path==='/api/v1/execution/config')return {data:{templates:[state.central,...others],revision:1}};
  if(path==='/api/v1/execution/capabilities')return {data:{configuredTemplates:[{id:S.templateId,machineId:S.machineId,engine:'claude',ready:true}]}};
  if(path.startsWith('/api/v1/execution/runs/'))return {data:clone(state.runs.get(path.split('/').at(-1)))};
  if(path.startsWith('/api/v1/tasks/')&&!path.includes('/commands/'))return {data:clone(state.tasks.get(path.split('/').at(-1)))};
  if(path.endsWith('/commands/create')){
   const t={...clone(envelope.payload),id:randomUUID(),ownerId:'server-admin',scope:'personal',revision:1,status:'queued'};
   state.tasks.set(t.id,t);state.mutations.push('create');return {data:clone(t)};
  }
  if(path.endsWith('/commands/start')){
   const t=state.tasks.get(envelope.payload.taskId),rid=expectedRunId(envelope.commandId);
   const r={id:rid,taskId:t.id,objectId:t.id,projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,workspace:S.workspace,scope:'personal',kind:'development',domain:'tasks',agentId:S.agentId,status:'running',goal:t.goal,criteria:t.criteria,maxRounds:1,timeoutSec:1800,budgetUSD:1};
   t.executionRequest={id:rid};state.runs.set(rid,r);state.mutations.push('start');return {data:clone(t)};
  }
  throw Error('CONTROLLED_API_UNEXPECTED');
 };
 const defaults={
  'node:fs/promises':fs,
  'node:crypto':{randomUUID},
  'node:path':{resolve},
  'node:url':{pathToFileURL},
  'node:child_process':{spawnSync:()=>({status:0})},
  './managed-server-client.mjs':{withPlatform:async fn=>fn({api}),remote:()=>JSON.stringify(host),lanProfile:{fixture:true},python:()=>''},
  './run-factory-main-repair-r26.mjs':{sha,canonical,nativeRepairTemplate},
  './run-factory-supervision-probe.mjs':{nodeState:()=>({agentId:S.agentId,template:state.node,unit:{ActiveState:'active',MainPID:'1'}}),queueState:()=>({readOnly:true,fullTable:true,allActive:0}),patchNode:(_old,replacement)=>{state.node=clone(replacement);state.mutations.push('node-template');},putCentral:async(_api,_old,replacement)=>{state.central=clone(replacement);state.mutations.push('central-template');}},
  './verify-software-factory-execution.mjs':{expectedRunId},
  './prepare-factory-target-copy-r29.mjs':{targetCopyR29Scope:S,targetCopyR29Program:()=>''},
  './run-factory-repair-acceptance-r26.mjs':{acceptanceStoredRunProgram},
  './install-factory-verifier-r28.mjs':{readInstalledR28Host:async()=>clone(protectedHost),verifyR28InstalledManifest:async()=>{}},
  './install-factory-repair-verifier-r26.mjs':{defaultReadPrimary:params=>{const r=state.runs.get(params.runId);return {readOnly:true,status:r.status,result:clone(r.result??null),agentId:S.agentId,frozenTemplateSHA256:sha(state.q.template),storedRecordSHA256:'f'.repeat(64)};}}
 };
 const context=createContext({process:{argv:[],platform:'linux'},Buffer,Date,JSON,console:{log:()=>{},error:()=>{}},setTimeout,clearTimeout});
 const m=new SourceTextModule(source,{context,identifier:'file:///controlled/driver.mjs',initializeImportMeta:meta=>{meta.url='file:///controlled/driver.mjs';}});
 await m.link(async spec=>{need(defaults[spec],'CONTROLLED_IMPORT_UNEXPECTED');const value=defaults[spec],sm=new SyntheticModule(Object.keys(value),function(){for(const [k,v]of Object.entries(value))this.setExport(k,v);},{context});return sm;});
 await m.evaluate();
 const template=m.namespace.targetRepairR29Template(fakeOriginal),payload=m.namespace.targetRepairR29Payload('2099-10-12T00:00:00.000Z');
 const initial={version:1,scope:S,copyJob:copy.job,originalTemplate:fakeOriginal,template,templateSHA:sha(template),payload,createIntent:{commandId:randomUUID(),scope:'personal',expectedVersion:0,payload},attempts:{},receipts:{},otherTemplatesSHA:sha(others),sourceBefore:sourceState,candidateBefore:host.candidate,protectedInventory};
 state.q=clone(q??initial);
 if(q!==null||wrongRun||stopped||cleanup){
  const saved=state.q;saved.taskId=randomUUID();saved.startIntent={commandId:randomUUID(),scope:'personal',expectedVersion:1,payload:{taskId:saved.taskId,reason:'controlled'}};saved.runId=expectedRunId(saved.startIntent.commandId);saved.attempts.start='controlled';saved.started=true;if(cleanup)saved.cleanupProof=cleanup;
  const t={...clone(saved.payload),id:saved.taskId,ownerId:'server-admin',scope:'personal',revision:2,executionRequest:{id:saved.runId}};
  const r={id:saved.runId,taskId:t.id,objectId:t.id,projectId:S.projectId,machineId:S.machineId,executorId:S.templateId,workspace:S.workspace,scope:'personal',kind:'development',domain:'tasks',agentId:S.agentId,status:cleanup?'succeeded':'running',goal:wrongRun?'different frozen goal':t.goal,criteria:t.criteria,maxRounds:wrongRun?99:1,timeoutSec:wrongRun?9999:1800,budgetUSD:wrongRun?987:1,purpose:wrongRun?'different-purpose':undefined,stopRequested:stopped,result:cleanup?{source:'signed-agent',lateEvidenceOnly:false,outcome:'success',exitCode:0}:undefined};
  state.files.set(jp,JSON.stringify(saved));state.tasks.set(t.id,t);state.runs.set(r.id,r);state.central=template;state.node=template;
 }
 return {m,state};
}

export async function independentTargetRepairChecks(source){
 const checks=[];
 const m=await load(source);const template=m.state.q.template;
 checks.push({id:'native-template-technical-and-cost-bounds',passed:template.maxRounds===1&&template.timeoutSec===1800&&template.supervision.billing==='record-only'&&template.supervision.maxTokens===200000&&template.supervision.maxRecoveryAttempts===0&&template.supervision.fallbackExecutorIds.length===0&&template.args.includes('gpt-6.1-sol[1m]')&&!template.args.some(x=>String(x).includes('max-budget'))&&!template.validation});
 const bad=await load(source,{wrongRun:true});let rejected=false,errorCode=null;try{await bad.m.namespace.runFactoryTargetRepairR29('check');}catch(e){rejected=true;errorCode=/^R29_TASK_[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROLLED_REJECTION';}
 checks.push({id:'actual-frozen-run-different-goal-bounds-purpose-rejected',passed:rejected,observedRejected:rejected,errorCode,mutations:bad.state.mutations.length});
 const stale=await load(source,{cleanup:{independentlyVerified:true,taskId:'unrelated',runId:'0'.repeat(40)}});let restoreRejected=false,restoreError=null;try{await stale.m.namespace.runFactoryTargetRepairR29('restore');}catch(e){restoreRejected=true;restoreError=/^R29_TASK_[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROLLED_REJECTION';}
 checks.push({id:'unrelated-boolean-cleanup-proof-rejected-before-restore',passed:restoreRejected&&stale.state.mutations.length===0,observedRejected:restoreRejected,errorCode:restoreError,mutations:stale.state.mutations});
 const parallel=await load(source);const both=await Promise.allSettled([parallel.m.namespace.runFactoryTargetRepairR29('start'),parallel.m.namespace.runFactoryTargetRepairR29('start')]);
 checks.push({id:'concurrent-starts-have-one-create-and-one-start',passed:both.filter(r=>r.status==='fulfilled').length===1&&both.some(r=>r.status==='rejected'&&r.reason.message==='R29_TASK_EXCLUSIVE_LOCK_HELD_READ_ONLY_RECONCILE_REQUIRED')&&parallel.state.mutations.filter(v=>v==='create').length===1&&parallel.state.mutations.filter(v=>v==='start').length===1,outcomes:both.map(r=>r.status==='fulfilled'?'fulfilled':/^R29_TASK_[A-Z0-9_]+$/.test(r.reason.message)?r.reason.message:'CONTROLLED_REJECTION'),created:parallel.state.mutations.filter(v=>v==='create').length,started:parallel.state.mutations.filter(v=>v==='start').length});
 const deniedProject=await load(source,{invalidProject:true});let projectRejected=false,projectError=null;try{await deniedProject.m.namespace.runFactoryTargetRepairR29('start');}catch(e){projectRejected=true;projectError=/^R29_TASK_[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROLLED_REJECTION';}checks.push({id:'wrong-project-owner-rejected-before-template-or-dispatch',passed:projectRejected&&deniedProject.state.mutations.length===0,observedRejected:projectRejected,errorCode:projectError,mutations:deniedProject.state.mutations});
 const program=m.m.namespace.targetRepairR29StoredRunProgram();
 const sqlFixture=String.raw`import json,sys,sqlite3,tempfile,os,io,contextlib
from copy import deepcopy
x=json.loads(sys.stdin.read());program=x['program'];expected=x['expected'];fd,path=tempfile.mkstemp(prefix='r29-independent-stored-');os.close(fd)
try:
 c=sqlite3.connect(path);c.execute('CREATE TABLE execution_runs (id TEXT,json TEXT,status TEXT,agent_id TEXT)');c.commit()
 anchor='file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro';assert program.count(anchor)==1
 program=program.replace(anchor,'file:'+path.replace(chr(92),'/')+'?mode=ro');compile(program,'<actual-new-r29-stored-read>','exec')
 rows=[]
 cases=[('legitimate',None,None),('goal','goal','other-goal'),('criteria','criteria','other-criteria'),('rounds','maxRounds',9),('timeout','timeoutSec',9999),('task-budget-compat','budgetUSD',99),('purpose','purpose','project-candidate-validation'),('validation','validation',True)]
 for name,key,value in cases:
  v=deepcopy(expected);v['template']={'engine':'claude'}
  if key=='validation':v['template']['validation']={'program':'forbidden'}
  elif key is not None:v[key]=value
  c.execute('DELETE FROM execution_runs');c.execute('INSERT INTO execution_runs VALUES(?,?,?,?)',(expected['id'],json.dumps(v),'running',x['agentId']));c.commit()
  rejected=False;code=None
  try:
   with contextlib.redirect_stdout(io.StringIO()):exec(program,{'p':{'runId':expected['id'],'nodeAgentId':x['agentId'],'expected':expected}})
  except RuntimeError as e:rejected=True;code=str(e)
  rows.append({'case':name,'passed':not rejected if name=='legitimate' else rejected,'observedRejected':rejected,'errorCode':code})
 print(json.dumps(rows))
finally:
 try:c.close()
 finally:os.unlink(path)
`;
 const expected={id:'b'.repeat(40),taskId:'controlled-task',objectId:'controlled-task',projectId:S.projectId,machineId:S.machineId,workspace:S.workspace,executorId:S.templateId,scope:'personal',domain:'tasks',kind:'development',goal:'controlled goal',criteria:'controlled criteria',maxRounds:1,timeoutSec:1800,budgetUSD:1};
 const sql=spawnSync('python',['-c',sqlFixture],{input:JSON.stringify({program,expected,agentId:S.agentId}),encoding:'utf8',windowsHide:true,timeout:15000});need(sql.status===0&&!sql.error,'CONTROLLED_SQL_FIXTURE_FAILED');const rows=JSON.parse(sql.stdout);checks.push({id:'actual-new-SQL-read-only-program-positive-and-seven-negative',passed:rows.length===8&&rows.every(r=>r.passed),sourceProgramSHA256:realSHA(program),cases:rows,fixtureAdaptation:'Only the fixed database URI is replaced by an exclusively created temporary SQLite file; production SQL/guards unchanged.',actualLinuxPermissionsVerified:false});
 return checks;
}
export async function cli(){const source=await readFile(target,'utf8'),checks=await independentTargetRepairChecks(source),r={schemaVersion:1,kind:'software-factory-r29-target-driver-independent-local-checks',at:new Date().toISOString(),source:{path:target,sha256:createHash('sha256').update(source).digest('hex')},scope:'production driver evaluated with wholly in-memory API/SQL/host/filesystem adapters',checks,passed:checks.every(c=>c.passed),remoteActions:false,modelsInvoked:false,productCodeExecuted:false,actualPermissionsVerified:false,productAccepted:false,rawLogsExported:false};await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const output='artifacts/software-factory/goals-r29/target-driver-independent-local-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(output,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close();}return {output,sha256:realSHA(raw),...r};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await cli()));
