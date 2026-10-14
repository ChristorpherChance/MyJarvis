/** Append an actual rerun to the existing plan using a persisted, version-protected command. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const project='70ec346f-6520-46ed-abed-22cac770a3e4',plan='40066986-8253-4cc4-9876-ae6eaede9e0b';
const journal='.jarvis-dev/maintenance/factory-report-recovery-plan-r26-4.json',dir='artifacts/software-factory/acceptance-r26';
let j;try{j=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=journal+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,journal);}
const cleanStep=({id,title,goal,criteria,taskIds,runIds,nextAction})=>({id,title,goal,criteria,taskIds,runIds,nextAction});
if(j.intent&&!j.receipt&&j.intent.steps.some(s=>Object.keys(s).some(k=>!['id','title','goal','criteria','taskIds','runIds','nextAction'].includes(k)))){
 j.rejectedInput={commandId:j.intent.commandId,at:new Date().toISOString(),errorCode:'INVALID_INPUT',reason:'Client included read-only step projections; server rejected before mutation.'};
 j.intent={...j.intent,commandId:randomUUID(),steps:j.intent.steps.map(cleanStep)};await save();
}
const batch=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-acceptance-r26-4-current-main-full.json','utf8'));
if(!batch.started||!batch.taskId||!batch.runId||batch.projectId!==project)throw Error('RECOVERY_PLAN_BATCH_NOT_STARTED');
const result=await withPlatform(async({api})=>{
 const base=`/api/v1/projects/${project}/supervision-plans/${plan}`;
 const before=(await api(`/api/v1/projects/${project}/autonomy`)).data;
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 if(!j.receipt){
  const current=(await api(base)).data;
  if(current.mode!=='acceptance'||current.planId!==plan||current.currentStepId!=='tests')throw Error('RECOVERY_PLAN_SCOPE_CHANGED');
  j.intent??={commandId:randomUUID(),expectedVersion:current.revision,mode:current.mode,title:current.title,goal:current.goal,currentStepId:current.currentStepId,
   steps:current.steps.map(cleanStep).map(s=>s.id==='tests'?{...s,taskIds:[...new Set([...s.taskIds,batch.taskId])],runIds:[...new Set([...s.runIds,batch.runId])],nextAction:'首轮真实失败记录保留；修复验收报告生成后，正在复验相同主线。失败及未执行事项分别记录。'}:s),
   nextAction:'先取得完整复验报告，再按证实问题在独立副本中安排修复和复验。',reason:'验收程序误读清单导致报告缺失；使用R26-4固定入口复验。保留首轮任务、源码一致性失败和旧目标。'};await save();
  j.receipt=(await api(base+'/revisions',j.intent)).data;await save();
 }
 const view=(await api(base)).data;
 if(!view.steps.find(s=>s.id==='tests')?.runIds.includes(batch.runId)||hash((await api(`/api/v1/projects/${project}/autonomy`)).data)!==hash(before))throw Error('RECOVERY_PLAN_READBACK_CHANGED');
 return {at:new Date().toISOString(),planId:plan,revision:view.revision,taskId:batch.taskId,runId:batch.runId,view,oldAutonomyUnchanged:true,modelsInvoked:false,productAccepted:false};
});await mkdir(dir,{recursive:true});const output=dir+'/report-recovery-plan-bind-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,planId:plan,revision:result.revision,currentExecution:result.view.currentExecution,latestResult:result.view.latestResult,oldAutonomyUnchanged:true}));
