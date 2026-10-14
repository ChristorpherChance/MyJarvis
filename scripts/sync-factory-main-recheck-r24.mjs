/** Append the independently observed current-main narrow result, preserving earlier snapshots. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const dir='artifacts/software-factory/acceptance-r24',projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const reference=dir+'/main-baseline-independent-review-source-update-second-r24.json';
const main=JSON.parse(await readFile(reference,'utf8'));
if(!main.restored||!main.sourceStableBeforeDuringAndAfter||main.signedRunStatus!=='succeeded'||main.productAccepted!==false||main.sourceFingerprint!=='151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea'||main.report.copy.gitBefore.head!=='89e6af3ac64f707c3ba6fc09e9e09fe4a4174171'||main.report.stages.length!==4||main.report.stages.some(v=>v.code!==0||v.signal||v.timeout)||main.actualTests?.numTotalTests!==15||main.actualTests.numPassedTests!==15||main.actualTests.numFailedTests!==0||main.actualTests.numPendingTests!==0||main.usage!==null)throw Error('MAIN_RECHECK_FACT_BINDING_INVALID');
const journalPath='.jarvis-dev/maintenance/factory-main-recheck-results-r24.json';let j;
try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{},receipts:{}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};
const out=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(profile.revision!==20||profile.spec.objectives.length!==74||profile.verifiedObjectiveIds.length||profile.config.costPolicy!=='record-only'||profile.config.maxUSD!==null||profile.config.maxTokens!==null||profile.config.perTaskUSD!==null)throw Error('MAIN_RECHECK_SCOPE_CHANGED');
 const selection=(await api(`/api/v1/projects/${projectId}/autonomy/baselines`)).data;
 if(selection.currentMainBaseline?.taskId!==main.taskId||selection.currentMainBaseline.runId!==main.runId||selection.currentMainBaseline.runStatus!=='succeeded')throw Error('MAIN_RECHECK_SELECTED_RUN_CHANGED');
 const budget=selection.latest.projectBudget;
 const marker='[R24 新提交基础复验 '+main.runId+']';
 const entry=[marker,`最新已检查main提交${main.report.copy.gitBefore.head}、593公开文件、源码指纹${main.sourceFingerprint}，task${main.taskId}/run${main.runId}：离线安装、构建、类型检查成功，3个shared文件真实15/15用例通过。前/快照/后身份相同，签名succeeded，原模板及27冻结策略已恢复，原profile20与历史记录保留。`, '19:40版本46abd636…的两处TS2345仍保留历史证据，在本次新版本构建中未出现；不推断新提交作者或把旧错误套于新版本。候选d620178e…的326/332结果同样独立保留，6失败须在新主线定向复验，不能直接视为最新主线失败。', '本次只验基础范围，未执行全量server单元/集成测试、完整交付包与部署运行、页面/子页面交互及UI一致性、需求与阶段语义关联、从零客户贯通和同版24/72小时。74目标仍0独立完整验收，全局持续监督关闭；下一步固定新主线做完整打包和隔离运行检查。', `模型执行器未调用，但用量回执null仍记未知；费用只记录不限额。当时全项目已知费用${budget.spentUSD}美元、已记录${budget.usedTokens}Token、${budget.unknownCostCount}笔费用未知。`, `证据${reference}、main-baseline-restoration-readback-source-update-second-r24.json；本地首轮报告和建设档案追加新复验，不覆盖旧JSON结果。`].join('\n');
 for(const id of [projectId,'25dcc5cf-bdfe-43f8-bbff-e79e7190161f']){
  if(j.receipts[id])continue;
  const old=(await api('/api/v1/projects/'+id)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('MAIN_RECHECK_NOTES_OWNER_CHANGED');
  if(!j.intents[id]){const notes=old.environmentInfo?.notes??'';if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('MAIN_RECHECK_NOTES_RECONCILE_REQUIRED');j.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();}
  const value=(await api('/api/v1/projects/commands/environment-info',j.intents[id])).data;
  if(!value.environmentInfo.notes.includes(marker))throw Error('MAIN_RECHECK_NOTES_UNCONFIRMED');j.receipts[id]={id:value.id,revision:value.revision};await save();
 }
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(after.revision!==profile.revision||after.goalSpecHash!==profile.goalSpecHash||after.verifiedObjectiveIds.length)throw Error('MAIN_RECHECK_POST_SCOPE_CHANGED');
 return {at:new Date().toISOString(),reference,taskId:main.taskId,runId:main.runId,sourceFingerprint:main.sourceFingerprint,signedRunStatus:main.signedRunStatus,actualTests:main.actualTests,projects:Object.values(j.receipts),oldNotesPreserved:true,projectBudget:budget,profileRevision:after.revision,objectivesAccepted:0,totalObjectives:74,usageUnknown:true,modelsInvoked:false,productAccepted:false};
});
const output=dir+'/main-recheck-results-notes-sync.json';await writeFile(output,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...out}));
