/** Record an actual single repair task as the current phase; retain earlier test bindings. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {assertJournal,repairScope} from './run-factory-main-repair-r26.mjs';
const project=repairScope.projectId,plan='40066986-8253-4cc4-9876-ae6eaede9e0b',dir=repairScope.artifactDirectory;
const batch=assertJournal(JSON.parse(await readFile(repairScope.journalPath,'utf8')));
if(!batch.started||!batch.taskId||!batch.runId)throw Error('NATIVE_REPAIR_PLAN_EXECUTION_REQUIRED');
const path='.jarvis-dev/maintenance/factory-native-repair-plan-r26.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=path+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,path);}
const cleanStep=({id,title,goal,criteria,taskIds,runIds,nextAction})=>({id,title,goal,criteria,taskIds,runIds,nextAction});
const result=await withPlatform(async({api})=>{
 const before=(await api(`/api/v1/projects/${project}/autonomy`)).data,sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 if(before.goalSpecHash!==repairScope.goalSHA||before.config.costPolicy!=='record-only')throw Error('NATIVE_REPAIR_PLAN_GOAL_CHANGED');
 const base=`/api/v1/projects/${project}/supervision-plans/${plan}`;
 if(!j.receipt){
  const current=(await api(base)).data;
  if(current.mode!=='acceptance'||current.planId!==plan)throw Error('NATIVE_REPAIR_PLAN_SCOPE_CHANGED');
  j.intent??={commandId:randomUUID(),expectedVersion:current.revision,mode:current.mode,title:current.title,goal:current.goal,currentStepId:'repair',
   steps:current.steps.map(cleanStep).map(s=>s.id==='repair'?{...s,taskIds:[...new Set([...s.taskIds,batch.taskId])],runIds:[...new Set([...s.runIds,batch.runId])],nextAction:'在独立副本定点修复测试准备、断言、生成文件污染并定位超时。完成后固定新指纹另做独立复验。'}:s),
   nextAction:'修复任务已下发；结束后核对实际改动，再按新版本完整复验。模型执行结束不能直接算验收通过。',reason:'完整签名失败基线与独立资源清理核对完成、原模板恢复后，实际下发单轮独立副本修复；保留两轮测试和原始目标。'};await save();
  j.receipt=(await api(base+'/revisions',j.intent)).data;await save();
 }
 const view=(await api(base)).data;
 if(view.currentStepId!=='repair'||!view.steps.find(s=>s.id==='repair')?.runIds.includes(batch.runId)||sha((await api(`/api/v1/projects/${project}/autonomy`)).data)!==sha(before))throw Error('NATIVE_REPAIR_PLAN_READBACK_CHANGED');
 return {at:new Date().toISOString(),planId:plan,revision:view.revision,currentExecution:view.currentExecution,latestResult:view.latestResult,oldAutonomyUnchanged:true,productAccepted:false,view};
});const output=dir+'/native-repair-plan-bind-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,revision:result.revision,currentExecution:result.currentExecution,oldAutonomyUnchanged:true,productAccepted:false}));
