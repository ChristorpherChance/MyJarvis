/** Append current authorized plan to project notes and an unverified reusable runbook. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const factory='70ec346f-6520-46ed-abed-22cac770a3e4',construction='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const dir='artifacts/software-factory/autonomy-r22';
const journalPath='.jarvis-dev/maintenance/construction-autonomy-r22-sync.json';
const marker='[R22 目标监督与只记账 2026-10-11]';
const sha=b=>createHash('sha256').update(b).digest('hex');
const master=await readFile('docs/软件工厂无人值守交付总纲.md');
let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,intents:{},receipts:{}};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);}
const result=await withPlatform(async({api,records})=>{
 const p=(await api('/api/v1/projects/'+factory+'/autonomy')).data;
 if(!p||p.config.costPolicy!=='record-only'||p.spec.objectives.length!==74||p.spec.workPackages.length!==9)throw Error('SYNC_AUTONOMY_NOT_STARTED');
 const snapshot={at:new Date().toISOString(),status:p.status,verifiedObjectives:p.verifiedObjectiveIds.length,objectives:74,packages:9,goalSpecHash:p.goalSpecHash,masterSHA256:sha(master)};
 async function submit(key,domain,name,payload,revision){
  if(journal.receipts[key])return journal.receipts[key];
  journal.intents[key]??={commandId:randomUUID(),scope:'personal',expectedVersion:revision,payload};await save();
  const item=(await api('/api/v1/'+domain+'/commands/'+name,journal.intents[key])).data;
  const receipt={id:item.id,revision:item.revision,status:item.status??null};journal.receipts[key]=receipt;await save();return receipt;
 }
 const text=[marker,'最新目标以《软件工厂无人值守交付总纲》R22.1及74个冻结目标、9工作包为准；替代早期资料中本期仅人工交付或暂不发布的推荐范围，旧记录保留。','用户明确费用只记录不设限制：累计金额、累计Token和单任务金额消费上限均取消；供应商未提供的真实用量/费用标待补，已知部分留账；技术时限、取消和重复无进展保护继续保留。','项目级监督先FA01真实构建、完整包及隔离部署，固定检查+新只读独立评审后按依赖推进；不以模型自述或模拟100%计进度。','冻结目标、源/运行版、需求—设计—全部页面/状态—代码—测试—缺陷—发布保持关联；真实阶段Agent/子Agent、优化与独立评估、完整客户交付及实际使用均有质量门。','本次登记事实时间：'+snapshot.at+'；项目监督状态 '+p.status+'；已验收 '+snapshot.verifiedObjectives+'/74。任务与过程以自治监督和执行回执为准。','九包固定门已安装，14类完整真实观察器仍待逐项实现；原生暂停新代恢复、72h同版观察及第二项目复用尚待验收。','总纲/HTML：docs/软件工厂无人值守交付总纲.md/html；建设档案/追加日志：docs/贾维斯建设档案.md/html、docs/贾维斯建设日志.md/html。总纲当时SHA '+snapshot.masterSHA256+'；冻结目标 '+p.goalSpecHash+'。','项目决策记录已上线，记录当时情况、真实选项、择优理由、实施证据及回退条件；改选追加关联版本。已有三条真实决定及两版本实施读回，原生CLI全部问题自动汇集仍待接线。','每次重要改动、真实失败、修复复验、上线与验收分开追加；不写凭据/私人聊天，不自动发布经验为Skill。'].join('\n');
 const projectReceipts=[];
 for(const id of [factory,construction]){
  const project=(await api('/api/v1/projects/'+id)).data;
  if(project.ownerId!=='server-admin'||project.scope!=='personal'||project.status==='archived')throw Error('SYNC_PROJECT_SCOPE_CHANGED');
  if(!journal.receipts[id]){
   const old=project.environmentInfo?.notes??'';
   if(old.includes(marker))throw Error('SYNC_EXISTING_MARKER_REQUIRES_RECONCILIATION');
   const notes=old+'\n\n'+text;if(notes.length>20000)throw Error('SYNC_PROJECT_NOTES_LIMIT');
   projectReceipts.push(await submit(id,'projects','environment-info',{projectId:id,environmentInfo:{...project.environmentInfo,notes}},project.revision));
  }else projectReceipts.push(journal.receipts[id]);
 }
 const title='项目自治监督：冻结目标、只记账与真实验收';
 const existing=(await records('experiences')).filter(e=>e.projectId===factory&&e.title===title&&e.ownerId==='server-admin');
 if(existing.length>1)throw Error('SYNC_RUNBOOK_DUPLICATE');
 let exp;
 if(existing.length){exp=existing[0];if(exp.verified||exp.status==='published')throw Error('SYNC_RUNBOOK_MUST_REMAIN_CANDIDATE');}
 else exp=await submit('runbook','experiences','capture',{projectId:factory,title,summary:'复用监督过程，按当前版本真实质量门推进；费用只记账，失败和修复保留证据。',kind:'runbook',tags:['项目监督','建设记录','只记账','质量门'],conditions:'已授权项目、非生产独立副本及固定验证器；目标/执行器已冻结。不同项目需配置自己的真实验收适配器。',content:text+'\n这是一份候选操作手册；尚未验证所有14类观察器或第二项目复用，也尚未正式发布Skill。',source:'用户目标与费用决定；docs/软件工厂无人值守交付总纲.md；R22真实安装、监督和构建记录。'},0);
 return {...snapshot,projects:projectReceipts,experienceId:exp.id,candidatePublished:false,projectGoalRepoCopiesChanged:false,globalSupervisionChanged:false};
});
await writeFile(dir+'/construction-platform-sync-r22.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
