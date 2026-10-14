/** Append actual R23 facts to both projects using their existing revision protection. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const factory='70ec346f-6520-46ed-abed-22cac770a3e4',construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const dir='artifacts/software-factory/autonomy-r22',release='20261011-supervision-simple-r23-1';
const observed=JSON.parse(await readFile(`${dir}/simple-supervision-live-r23-1.json`,'utf8'));
const decisions=JSON.parse(await readFile(`${dir}/supervision-choices-live-r23-1.json`,'utf8'));
const marker='[R23 简便监督与长任务诊断 2026-10-11]';
const entry=[marker,`当时快照 ${observed.at}：FA01监督仍blocked、独立验收0/74，第三次尝试超时后达到3次技术保护；费用只记录不限额，三笔用量不完整。`,
 '只读深入诊断确认两轮20分钟硬截止前均持续修改、检查和生成产物。已有成果保留，未发现明确待人工许可、429或watch等待证据；当前问题是大工作包收敛与结构化交接不足。',
 'R23已发布：首屏显示阶段、停因、下一步和查看记录入口，技术内容折叠；无效继续与阻塞时暂停不再显示。线上普通启动实际422拒绝，原监督状态/修订/历史保持不变，超时任务不再显示无条件成功。',
 `新增决策：页面/守卫 ${decisions.decisions.find(v=>v.key==='simple-controls').id} 已实施；长任务承接 ${decisions.decisions.find(v=>v.key==='long-task-continuation').id} 仅选定。承接现有成果、拆小任务和软截止交接尚未实施续派或恢复旧执行。`,
 '后端29、前端状态11、执行结果4项分别通过；全量web/API构建成功。这些检查不是软件工厂产品验收。登录态访问树确认新页面，截图/手机渲染未确认。',
 '建设日志新增至60条；详尽记录：docs/贾维斯建设档案.md/html、docs/贾维斯建设日志.md/html；诊断与线上回执保存在artifacts/software-factory/autonomy-r22。全部74目标、真实阶段产物、Agent迭代、客户安装使用与同版72小时仍未完成。'].join('\n');
const path='.jarvis-dev/maintenance/simple-supervision-sync-r23.json';let journal;
try{journal=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={intents:{},receipts:{}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
const result=await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release)throw Error('SYNC_BUILD_MISMATCH');
 const autonomy=(await api(`/api/v1/projects/${factory}/autonomy`)).data;
 if(autonomy.goalSpecHash!==observed.goalSpecHash||autonomy.status!=='blocked'||autonomy.config.costPolicy!=='record-only')throw Error('SYNC_SCOPE_CHANGED');
 for(const id of [factory,construction]){
  if(journal.receipts[id])continue;
  const old=(await api(`/api/v1/projects/${id}`)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('SYNC_PROJECT_SCOPE_CHANGED');
  if(!journal.intents[id]){
   const notes=old.environmentInfo?.notes??'';
   if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('SYNC_NOTES_NEED_RECONCILIATION');
   journal.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();
  }
  const record=(await api('/api/v1/projects/commands/environment-info',journal.intents[id])).data;
  if(!record.environmentInfo.notes.includes(marker))throw Error('SYNC_RECEIPT_MISMATCH');
  journal.receipts[id]={id:record.id,revision:record.revision};await save();
 }
 const after=(await api(`/api/v1/projects/${factory}/autonomy`)).data;
 if(after.revision!==autonomy.revision||after.reason!==autonomy.reason)throw Error('SYNC_CHANGED_AUTONOMY');
 return {at:new Date().toISOString(),release,projects:Object.values(journal.receipts),originalNotesPreserved:true,autonomyRevision:after.revision,status:after.status,verifiedObjectives:after.verifiedObjectiveIds.length,goalSpecHash:after.goalSpecHash,modelCalls:0,newTaskDispatched:false,experiencePublished:false};
});
await writeFile(`${dir}/construction-platform-simple-sync-r23-1.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
