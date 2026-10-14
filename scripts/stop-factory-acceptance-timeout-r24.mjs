/** Exact technical-timeout stop; no restart and no source modification. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const taskId='8120b229-471d-4f43-b009-aa742756dc50',runId='67182e98ed3a2801d9506fbd97da2be938833d4a';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',workspace='/home/superopen/All-Projects/msf-jarvis-autonomy-r22';
const path='.jarvis-dev/maintenance/factory-candidate-timeout-stop-r24.json';
let j;try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={taskId,runId};}
if(j.taskId!==taskId||j.runId!==runId)throw Error('CANDIDATE_STOP_JOURNAL_SCOPE_CHANGED');
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
const out=await withPlatform(async({api})=>{
 const task=(await api('/api/v1/tasks/'+taskId)).data,run=(await api('/api/v1/execution/runs/'+runId)).data;
 if(task.projectId!==projectId||task.executionRequest?.id!==runId||task.worktree!==workspace||run.taskId!==taskId||run.projectId!==projectId||run.workspace!==workspace||run.executorId!=='msf-autonomy-fa-01-validator'||run.purpose!=='project-autonomy-validation')throw Error('CANDIDATE_STOP_BINDING_CHANGED');
 if(!j.intent){
  if(!['queued','running'].includes(run.status)||!['queued','running'].includes(task.status))throw Error('CANDIDATE_STOP_ALREADY_TERMINAL');
  j.intent={commandId:randomUUID(),scope:'personal',expectedVersion:task.revision,payload:{taskId,reason:'固定验收doc/tests/selftest.cjs已超过原单项120秒界限，可信collector未正确终止候选进程组。停止本批次保留部分实际检查；先修复超时回收工具，不重启原任务、不把晚到报告改为通过。'}};await save();
 }
 if(!j.receipt){j.receipt=(await api('/api/v1/tasks/commands/pause',j.intent)).data;await save();}
 const after=(await api('/api/v1/execution/runs/'+runId)).data;
 return {at:new Date().toISOString(),taskId,runId,stopRequested:after.stopRequested===true,runStatus:after.status,signed:after.result?.source==='signed-agent',cleanupConfirmed:false,automaticRetry:false,productAccepted:false,modelsInvoked:false};
});
const output='artifacts/software-factory/acceptance-r24/candidate-second-timeout-stop-requested.json';await writeFile(output,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...out}));
