/** Preserve prior notes and append the actual completed baseline and scoped repair dispatch. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {assertJournal,repairScope} from './run-factory-main-repair-r26.mjs';
const batch=assertJournal(JSON.parse(await readFile(repairScope.journalPath,'utf8')));
if(!batch.started||!batch.restored)throw Error('PARTIAL_NOTES_RESTORE_REQUIRED');
const project=repairScope.projectId,construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f',dir=repairScope.artifactDirectory;
const path='.jarvis-dev/maintenance/factory-native-partial-notes-r26.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{},receipts:{}};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=path+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,path);}
const marker='[R26部分修复签名终态与候选复验 · 2026-10-12]';
const entry=marker+`
原生修复5c803404签名round-limit/outcome round-limit/exit0，仍需后续工作，非产品验收。原模板恢复，ACK与队列空闲，原main593文件及元数据不变。实际605文件候选66a56a19：新增12份修复记录、仅修改prototype-commands测试文件、无删除，32034字节原用例正文一致。生成页面改临时目录并finally清理；镜像、MinIO、历史资产与超时未修复。决策b774f724选择先同标准独立复验部分候选，显式partial资格不改签名终态；新入口尚未安装/派发，实际检查被两份约133MB历史测试包超过64MiB哈希读取门挡住，正在流式校验修正，保留旧证据。本轮1021308 Token、估计2.513858美元；项目累计1252610 Token、估计2.555528美元、13未定价调用保留。缓存包含于输入、不重复计费，估计非供应商账单。费用只记录不设限。原74目标0/74，automaticDispatch=false，测试成功仍不能替代从0交付和Agent独立验收。`;
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
const output=dir+'/native-partial-notes-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
