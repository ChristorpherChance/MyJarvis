/** Append the actual incident and rerun to both project records, preserving prior notes. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const project='70ec346f-6520-46ed-abed-22cac770a3e4',construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const journal='.jarvis-dev/maintenance/factory-report-retry-notes-r26-4.json',dir='artifacts/software-factory/acceptance-r26';
let j;try{j=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{},receipts:{}};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=journal+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,journal);}
const marker='[R26-3汇报上线及R26-4验收复验 · 2026-10-12]';
const entry=marker+'\n软件工厂采用测试验收计划，其他项目可持续开发。首轮e5ca06df签名失败：332项单元/集成测试326通过6失败，30组原型20通过10失败，打包检查通过；验收程序误读47项清单导致最终报告缺失，副本测试生成候选文件也触发源码一致性失败，安装/启动未执行。实际清理审计确认临时资源全部回收、main151300cf/593文件不变，原native模板已恢复。R26-3第一屏计划/进度/结果/下一步正式上线，电脑和手机实页验证通过。R26-4仅修报告诊断扫描，原6工具、45必需文件、30原型及90/80覆盖门保留，28本地用例通过；实际复验bf43cd17/f4b26c4c已在101运行，计划revision4保留首轮。决策baf7a2b6记录择优原因与回退，建设事件JARVIS-R26-3-REPORT-AND-R26-4-ACCEPTANCE-RETRY已追加。完整产品/74目标未验收，通用计划automaticDispatch=false，不代表24小时自动修复闭环。费用和Token只记录，固定测试无模型，历史未知继续单列。';
const result=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${project}/autonomy`)).data,sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 for(const id of [project,construction]){
  if(j.receipts[id])continue;
  const old=(await api('/api/v1/projects/'+id)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('RETRY_NOTES_SCOPE_CHANGED');
  if(!j.intents[id]){
   const notes=old.environmentInfo?.notes??'';
   if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('RETRY_NOTES_RECONCILIATION_REQUIRED');
   j.before??={};j.before[id]={notesSha:sha(notes),status:old.status,milestonesSha:sha(old.milestones??[])};
   j.intents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();
  }
  const updated=(await api('/api/v1/projects/commands/environment-info',j.intents[id])).data;
  if(!updated.environmentInfo.notes.endsWith(entry)||updated.status!==j.before[id].status||sha(updated.milestones??[])!==j.before[id].milestonesSha)throw Error('RETRY_NOTES_READBACK_CHANGED');
  j.receipts[id]={id:updated.id,revision:updated.revision};await save();
 }
 if(sha((await api(`/api/v1/projects/${project}/autonomy`)).data)!==sha(profile))throw Error('RETRY_NOTES_OLD_PROFILE_CHANGED');
 return {at:new Date().toISOString(),projects:Object.values(j.receipts),oldNotesPreserved:true,oldProfileUnchanged:true,modelsInvoked:false,productAccepted:false};
});await mkdir(dir,{recursive:true});const output=dir+'/report-retry-notes-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
