/** Append the factual new source/batch snapshot; preserve prior project notes. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',constructionId='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const dir='artifacts/software-factory/acceptance-r24',release='20261011-factory-acceptance-r24-1';
const marker='[R24 首轮真实验收结果 2026-10-11 19:40]';
const main=JSON.parse(await readFile(dir+'/main-baseline-independent-review-source-update-r24.json','utf8'));
const gaps=JSON.parse(await readFile(dir+'/candidate-gaps-live.json','utf8'));
if(!main.restored||!main.sourceStableBeforeDuringAndAfter||main.buildDiagnostics.length!==2||main.productAccepted!==false||gaps.fixDispatched)throw Error('ACCEPTANCE_RESULTS_PROOF_INVALID');
const path='.jarvis-dev/maintenance/factory-acceptance-results-sync-r24.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{},receipts:{}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
const out=await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release)throw Error('ACCEPTANCE_RESULTS_RELEASE_CHANGED');
 const profile=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(profile.revision!==20||profile.spec.objectives.length!==74||profile.verifiedObjectiveIds.length||profile.config.costPolicy!=='record-only'||profile.config.maxUSD!==null||profile.config.maxTokens!==null||profile.config.perTaskUSD!==null)throw Error('ACCEPTANCE_RESULTS_SCOPE_CHANGED');
 const batches=(await api(`/api/v1/projects/${projectId}/autonomy/baselines`)).data;
 const current=batches.currentMainBaseline,latest=batches.latest;
 if(current?.taskId!==main.taskId||current.runId!==main.runId||current.runStatus!=='failed'||latest?.runId!==gaps.runId||latest.runStatus!=='cancelled')throw Error('ACCEPTANCE_RESULTS_ACTUAL_READBACK_CHANGED');
 const b=latest.projectBudget;
 const entry=[marker,
 '现有成果优先验收，74目标按A00–A19保留；独立完整验收仍0/74。先固定版本、打包运行，再核对阶段产物关联、UI一致、从零客户流程、Agent迭代与同版24/72小时。',
 `最新main源${main.sourceFingerprint}，task${main.taskId}/run${main.runId}：离线安装通过，构建两处模板刷新TS2345再次真实证实，typecheck及3个shared测试文件未执行；源前/快照/后一致，原执行模板已恢复。首次18:04旧源结果单独保留。`,
 `候选run${gaps.runId}：构建/类型/lint通过，单元326/332通过、6失败；保留25项部分检查。沙箱固定镜像身份、直链编码、98测试文件清单缺口、原型旧入口ENOENT及design-boundary失败分别核对。selftest超120秒技术界限未终止，19:29:30精确pause，cancelled和签名晚到证据保留，不能改成功。`,
 `F-R24-003观察任务${gaps.task.id}集中关联缺口与精确复验要求，尚未派发产品源码修复。本attempt临时容器/网络/broker/socket全清、node递送全ack/native0；原源码不变。`,
 '可信验收器副本访问权限已通过实际Linux21项证明并安装，保留旧字节；单项超时回收仍需证明与修复。全局监督关闭，旧profile20与历史尝试保留。',
 `全项目当时已知费用${b.spentUSD}美元、已记录${b.usedTokens}Token、${b.unknownCostCount}笔费用未知；费用只记录不限额。候选本run完整0回执与main未知用量分别记录。`,
 '详细结果保存在本项目docs/软件工厂现有成果首轮验收报告.md/html；建设档案、追加建设日志及artifacts/software-factory/acceptance-r24保留版本、决策和报告。平台自治监督首卡显示新main真实任务及停止候选，旧开发过程作为历史保留。'].join('\n');
 for(const id of [projectId,constructionId]){
  if(j.receipts[id])continue;
  const old=(await api('/api/v1/projects/'+id)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('ACCEPTANCE_RESULTS_OWNER_CHANGED');
  if(!j.intents[id]){const notes=old.environmentInfo?.notes??'';if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('ACCEPTANCE_RESULTS_NOTES_RECONCILE_REQUIRED');j.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();}
  const value=(await api('/api/v1/projects/commands/environment-info',j.intents[id])).data;
  if(!value.environmentInfo.notes.includes(marker))throw Error('ACCEPTANCE_RESULTS_RECEIPT_MISSING');j.receipts[id]={id:value.id,revision:value.revision};await save();
 }
 return {at:new Date().toISOString(),release,projects:Object.values(j.receipts),main:current,candidate:{batchId:latest.id,taskId:latest.taskId,runId:latest.runId,status:latest.status,runStatus:latest.runStatus,reportStatus:latest.reportStatus},projectBudget:b,oldNotesPreserved:true,profileRevision:profile.revision,objectivesAccepted:0,totalObjectives:74,productAccepted:false,modelsInvoked:false};
});
const output=dir+'/project-results-notes-sync.json';await writeFile(output,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...out}));
