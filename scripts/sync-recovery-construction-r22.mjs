/** Append real recovery/decision receipts to both projects without replacing earlier notes. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const factory='70ec346f-6520-46ed-abed-22cac770a3e4',construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const dir='artifacts/software-factory/autonomy-r22';
const observed=JSON.parse(await readFile(`${dir}/observation-new-generation.json`,'utf8'));
const recovery=JSON.parse(await readFile(`${dir}/recovery-applied.json`,'utf8'));
const decision=JSON.parse(await readFile(`${dir}/recovery-decision-live.json`,'utf8'));
if(!recovery.newGeneration||decision.actualDecisionsTotal!==4||!decision.historyReadback)throw Error('RECOVERY_SYNC_EVIDENCE_REQUIRED');
const marker='[R22-7 决策追溯与技术中止新代 2026-10-11]';
const path='.jarvis-dev/maintenance/recovery-construction-sync-r22.json';let journal;
try{journal=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={intents:{},receipts:{}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!=='20261011-project-autonomy-r22-7')throw Error('RECOVERY_SYNC_BUILD_CHANGED');
 const p=(await api(`/api/v1/projects/${factory}/autonomy`)).data;
 if(p.goalSpecHash!==recovery.goalSpecHash||p.config.costPolicy!=='record-only')throw Error('RECOVERY_SYNC_GOAL_CHANGED');
 const text=[marker,`当时快照 ${observed.at}：监督 ${observed.status}，FA01新任务 ${decision.newTaskId} / 执行 ${decision.newRunId}；当时已验收 ${observed.verifiedObjectiveIds.length}/${observed.objectiveCount}。最新状态以自治监督实际接口为准。`,'旧首次执行因技术心跳失败签名取消，中央未主动停止；旧回执、已有文件和未知费用保留，不改成成功。R22-7已发布有效租约内有限重试，不为失败延长租期；认证、撤权、取消和到期仍立即停止。','经过签名结果、中央空闲队列、101进程清理和日志回执、源码指纹及目标模板版本对账，创建新的第二次有界任务。节点已有会话检查点，但本次不使用原生resume，不复活旧task/run。',`四条真实决策已留存，新增技术中止后的新代选择 ${decision.id}，选定→实际实施两版历史已读回。改选会追加版本；未实施方案改选不继承旧方案的计划动作；执行、独立验收与回退计划分别记录。`,'费用及累计Token只记录，不设消费上限；不完整历史用量仍待补。完整产品74目标、14类真实观察器、72小时同版观察及客户使用尚未验收；CLI所有问题自动采集与复杂Pi决策仍待接线。','关联资料：docs/软件工厂无人值守交付总纲.md/html；docs/贾维斯建设档案.md/html、建设日志；artifacts/software-factory/autonomy-r22/recovery-applied.json、observation-new-generation.json、recovery-decision-live.json。'].join('\n');
 for(const id of [factory,construction]){
  if(journal.receipts[id])continue;
  const old=(await api(`/api/v1/projects/${id}`)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('RECOVERY_SYNC_PROJECT_SCOPE_CHANGED');
  if(!journal.intents[id]){
   const notes=old.environmentInfo?.notes??'';if(notes.includes(marker)||notes.length+text.length+2>20000)throw Error('RECOVERY_SYNC_NOTES_RECONCILIATION_REQUIRED');
   journal.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+text}}};await save();
  }
  const r=(await api('/api/v1/projects/commands/environment-info',journal.intents[id])).data;
  journal.receipts[id]={id:r.id,revision:r.revision};await save();
 }
 return {at:new Date().toISOString(),release:health.build,projects:Object.values(journal.receipts),decisionId:decision.id,observedAt:observed.at,observedStatus:observed.status,currentStatus:p.status,verifiedObjectives:p.verifiedObjectiveIds.length,goalSpecHash:p.goalSpecHash,existingNotesPreserved:true,globalSupervisionChanged:false,projectGoalRepoCopiesChanged:false,experiencePublished:false,modelCalls:0};
});
await writeFile(`${dir}/construction-platform-recovery-sync-r22-7.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
