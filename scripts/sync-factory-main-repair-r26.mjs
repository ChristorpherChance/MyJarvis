/** Preserve prior notes and append the actual completed baseline and scoped repair dispatch. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {assertJournal,repairScope} from './run-factory-main-repair-r26.mjs';
const batch=assertJournal(JSON.parse(await readFile(repairScope.journalPath,'utf8')));
if(!batch.started)throw Error('REPAIR_NOTES_DISPATCH_REQUIRED');
const project=repairScope.projectId,construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f',dir=repairScope.artifactDirectory;
const path='.jarvis-dev/maintenance/factory-native-repair-notes-r26.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{},receipts:{}};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=path+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,path);}
const marker='[R26-4完整失败基线与原生修复派发 · 2026-10-12]';
const entry=marker+`\nR26-4运行f4b26c4c取得完整签名失败报告：47项检查32通过12失败3未执行，332项测试326通过6失败，30组原型20通过10失败，各自计数。构建、覆盖和打包通过；副本生成候选HTML触发源码一致性失败，隔离健康、前端与写入读回未执行，安装运行未验收。独立资源审计全部清理、原main151300cf及593文件/HEAD89e6af3不变，原模板已恢复。贾维斯另立独立副本，实际下发任务${batch.taskId}、运行${batch.runId}，固定gpt-6.1-sol[1m]单轮修复测试镜像契约、MinIO断言、生成文件污染并定位历史资产与超时问题，不伪造资产或降低门槛。通用计划40066986 revision5转修复复验，保留两轮测试。决策7bd2f617追加纠正备选目标合规，原bc871412及拒绝请求保留。模型执行结束后仍需核对实际改动、恢复模板、固定新指纹独立复验；当前未交付，原74目标0/74，费用与Token只记录，历史未知不抹零。新版通用计划automaticDispatch=false，单轮任务不代表24小时自动闭环。`;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const result=await withPlatform(async({api})=>{
 const before=(await api(`/api/v1/projects/${project}/autonomy`)).data;
 if(before.goalSpecHash!==repairScope.goalSHA||before.config.costPolicy!=='record-only')throw Error('REPAIR_NOTES_GOAL_CHANGED');
 for(const id of [project,construction]){
  if(j.receipts[id])continue;
  const old=(await api('/api/v1/projects/'+id)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('REPAIR_NOTES_SCOPE_CHANGED');
  if(!j.intents[id]){
   const notes=old.environmentInfo?.notes??'';
   if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('REPAIR_NOTES_RECONCILIATION_REQUIRED');
   j.before??={};j.before[id]={status:old.status,milestonesSHA:sha(old.milestones??[])};
   j.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();
  }
  const u=(await api('/api/v1/projects/commands/environment-info',j.intents[id])).data;
  if(!u.environmentInfo.notes.endsWith(entry)||u.status!==j.before[id].status||sha(u.milestones??[])!==j.before[id].milestonesSHA)throw Error('REPAIR_NOTES_READBACK_CHANGED');
  j.receipts[id]={id:u.id,revision:u.revision};await save();
 }
 if(sha((await api(`/api/v1/projects/${project}/autonomy`)).data)!==sha(before))throw Error('REPAIR_NOTES_OLD_PROFILE_CHANGED');
 return {at:new Date().toISOString(),projects:Object.values(j.receipts),oldNotesPreserved:true,oldProfileUnchanged:true,modelsInvoked:false,productAccepted:false};
});
const output=dir+'/native-repair-notes-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
