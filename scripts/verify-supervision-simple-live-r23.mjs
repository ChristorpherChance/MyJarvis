/** Prove a protected start refusal keeps the existing blocked generation unchanged. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const release='20261011-supervision-simple-r23-1';
const path='artifacts/software-factory/autonomy-r22/simple-supervision-live-r23-1.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!==release)throw Error('BUILD_MISMATCH');
 const before=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(before?.status!=='blocked'||before.reason!=='REPAIR_ATTEMPTS_EXHAUSTED'||before.stages[0]?.attempt!==3||before.config.maxAttempts!==3)throw Error('ACTUAL_GUARD_SCOPE_CHANGED');
 if(before.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||before.spec.objectives.length!==74||before.verifiedObjectiveIds.length!==0||before.config.costPolicy!=='record-only'||[before.config.maxUSD,before.config.maxTokens,before.config.perTaskUSD].some(v=>v!==null))throw Error('GOALS_OR_BILLING_POLICY_CHANGED');
 const runs=(await api('/api/v1/execution/runs')).data;
 if(runs.some(run=>run.projectId===projectId&&['queued','running'].includes(run.status)))throw Error('PROJECT_EXECUTION_NOT_IDLE');
 let rejection;
 try{
  await api(`/api/v1/projects/${projectId}/autonomy/start`,{commandId:randomUUID(),expectedVersion:before.revision,reason:'R23核验：耗尽尝试时普通启动必须拒绝且保留原状态'});
  throw Error('PROTECTED_START_UNEXPECTEDLY_SUCCEEDED');
 }catch(e){
  const match=/^API_(\d+) (.+)$/.exec(e.message??'');if(!match)throw e;
  const body=JSON.parse(match[2]);if(match[1]!=='422'||body.error?.code!=='AUTONOMY_RECOVERY_REQUIRED')throw Error('UNEXPECTED_START_REJECTION');
  rejection={httpStatus:422,code:body.error.code,message:body.error.message};
 }
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('REFUSED_START_MUTATED_PROFILE');
 const latest=(await api(`/api/v1/execution/runs/${before.stages[0].runId}`)).data;
 const task=(await api(`/api/v1/tasks/${before.stages[0].taskId}`)).data;
 const global=(await api('/api/v1/execution/supervision')).data;
 const finalRuns=(await api('/api/v1/execution/runs')).data;
 if(finalRuns.some(run=>run.projectId===projectId&&['queued','running'].includes(run.status)))throw Error('REFUSED_START_CREATED_ACTIVE_RUN');
 return {at:new Date().toISOString(),release,health:{ok:health.ok??health.status,build:health.build},projectId,rejection,profileUnchanged:true,profileSHA256:sha(JSON.stringify(after)),revision:after.revision,status:after.status,reason:after.reason,currentStage:after.stages[0].id,attempt:after.stages[0].attempt,maxAttempts:after.config.maxAttempts,taskId:task.id,taskStatus:task.status,runId:latest.id,runStatus:latest.status,stopCode:latest.result?.stopReason?.code,timeoutSec:latest.timeoutSec,objectiveCount:after.spec.objectives.length,verifiedObjectives:after.verifiedObjectiveIds.length,goalSpecHash:after.goalSpecHash,costPolicy:after.config.costPolicy,monetaryAndCumulativeTokenCaps:[after.config.maxUSD,after.config.maxTokens,after.config.perTaskUSD],unknownCostReceiptCount:after.budget.unknownCostCount,activeProjectRuns:0,globalSupervision:global.supervised,modelCalls:0,remoteRecoveryPerformed:false,productAccepted:false,authenticatedBrowserAcceptance:false};
});
result.localSourceFiles=await Promise.all(['apps/web/src/features/operations/ProjectAutonomyPanel.tsx','apps/web/src/features/operations/ExecutionRunPanel.tsx','apps/api/src/runtime/project-autonomy-runtime.ts'].map(async reference=>({reference,sha256:sha(await readFile(reference))})));
await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
