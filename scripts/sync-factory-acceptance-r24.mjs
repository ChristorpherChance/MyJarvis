/** Preserve existing project notes and append the new real acceptance snapshot. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const factory='70ec346f-6520-46ed-abed-22cac770a3e4',construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const release='20261011-factory-acceptance-r24-1',dir='artifacts/software-factory/acceptance-r24';
const marker='[R24 现有成果验收优先 2026-10-11]';
const path='.jarvis-dev/maintenance/factory-acceptance-sync-r24.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{},receipts:{}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
const main=JSON.parse(await readFile(dir+'/main-baseline-independent-review.json','utf8'));
const choices=JSON.parse(await readFile(dir+'/decisions-and-defect-live.json','utf8'));
const result=await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release)throw Error('ACCEPTANCE_SYNC_RELEASE_MISMATCH');
 const profile=(await api(`/api/v1/projects/${factory}/autonomy`)).data;
 if(profile.revision!==20||profile.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||profile.spec.objectives.length!==74)throw Error('ACCEPTANCE_SYNC_FROZEN_PROFILE_CHANGED');
 const batches=(await api(`/api/v1/projects/${factory}/autonomy/baselines`)).data;
 const latest=batches.latest;
 const snapshotAt=new Date().toISOString();
 const entry=[marker,`当时快照${snapshotAt}：用户明确软件工厂基本开发完成，现改现有成果逐目标验收与缺陷驱动修复；74目标、九原工作包和历史失败不删减，独立验收仍0/74。`,
  '新计划docs/软件工厂现有成果验收与修复计划.md/html按A00–A19组织完整包、部署身份、基础与全量测试、阶段产物语义/需求关联、原型页面/UI一致、真实客户全流程、Agent迭代、异常/变更/恢复与同版24/72小时；计划不等于完成。',
  `main固定主验任务${main.taskId}/run${main.runId}：离线安装通过，构建两处template_refresh.start/stop TS2345，typecheck/三个shared测试未执行。源前中后指纹${main.sourceFingerprint}相同，signed失败已独立读回，原模板恢复。`,
  latest?`R22候选对照另登记batch${latest.id}，task${latest.taskId}/run${latest.runId??'尚未创建'}，状态${latest.runStatus??latest.status}，reportStatus${latest.reportStatus??'尚无报告'}；冻结候选结果不能替代main主验或74目标独立评审。`:'当前尚无候选对照批次。',
  `策略改选${choices.decision.id}已保存选定→实施两版，并关联旧选择。F-R24-001待修观察任务${choices.defect.id}，尚未派发代码修复；需独立副本和精确回归。`,
  'R24新验收页与固定候选登记已上线，入口项目管理→软件工厂→自治监督；主验与候选各自查看真实任务，旧开发监督记录折叠。费用只记录不限额，已知费用、未知回执与Token分别保留；未开启全局监督。',
  '独立受控候选登记不会重置旧profile20、尝试/失败或派发模型；main窄基线与候选固定检查均不能宣称完整交付。真实缺陷修复、全量产品证据及无人值守24/72小时继续待完成。',
  '证据：artifacts/software-factory/acceptance-r24/main-baseline-independent-review.json、decisions-and-defect-live.json、baseline-started.json及独立计划/UI/后端验证报告。建设档案和追加建设日志记录当时范围与限制。'].join('\n');
 for(const id of [factory,construction]){
  if(j.receipts[id])continue;
  const old=(await api(`/api/v1/projects/${id}`)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('ACCEPTANCE_SYNC_OWNER_CHANGED');
  if(!j.intents[id]){const notes=old.environmentInfo?.notes??'';if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('ACCEPTANCE_SYNC_NOTES_RECONCILE');j.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();}
  const updated=(await api('/api/v1/projects/commands/environment-info',j.intents[id])).data;
  if(!updated.environmentInfo.notes.includes(marker))throw Error('ACCEPTANCE_SYNC_RECEIPT_MISMATCH');j.receipts[id]={id:updated.id,revision:updated.revision};await save();
 }
 const after=(await api(`/api/v1/projects/${factory}/autonomy`)).data;if(after.revision!==profile.revision||after.goalSpecHash!==profile.goalSpecHash||after.verifiedObjectiveIds.length)throw Error('ACCEPTANCE_SYNC_PROFILE_MUTATED');
 return {at:snapshotAt,release,projects:Object.values(j.receipts),originalNotesPreserved:true,profileRevision:after.revision,independentlyAcceptedObjectives:0,totalObjectives:74,latestBaseline:latest?{id:latest.id,taskId:latest.taskId,runId:latest.runId,status:latest.status,runStatus:latest.runStatus,reportStatus:latest.reportStatus}:null,modelCalls:0,codeFixDispatched:false,productAccepted:false};
});
await writeFile(dir+'/project-notes-sync.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
