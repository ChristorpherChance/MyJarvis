/** Record the R20 goal baseline; never dispatch, deploy or alter acceptance. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';

const execute=process.argv.includes('--execute');
const output='artifacts/software-factory/goals-r20/platform-goal-sync.json';
const privateJournal='.jarvis-dev/maintenance/factory-goals-r20-sync.json';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const source='docs/软件工厂端到端目标与验收标准.md';
const sourceSha=digest(await readFile(source,'utf8'));
const readiness=JSON.parse(await readFile('artifacts/software-factory/goals-r20/latest-deployment-readiness.json','utf8'));
if(!readiness.snapshot?.readOnly||!readiness.snapshot?.sourceStableDuringInspection||readiness.snapshot?.deploymentsRun!==0)throw Error('R20_READONLY_EVIDENCE_REQUIRED');
const marker='[软件工厂端到端目标 R20 · 2026-10-11]';
const notes=[marker,
 '用户明确目标：由贾维斯指挥101软件工厂最新代码的真实打包、部署和运行检查；原始需求、PRD、概要/详细设计、全部独立高保真页与整体交互原型、计划/真实代码、从零测试、统一缺陷修复复验、版本发布与后续变更完整且相互承接。',
 '推荐验收：工厂本身与其生产的客户项目分开；本期必需条款100%有承接和当前真实证据，关系含版本与语义。旧RTM/UI指标和历史报告保留，不静默改分母。源代码、候选包、实际运行版分别识别。模拟、未知、未跑和错版本不正式通过；真实单测/CI/审查/合并、所有必测、完整页面状态、数据升级/恢复及原例修复回归均有依据。',
 '10月11日只读：main/e375bd1…，581文件公开指纹8ff60a78…822f8；已跟踪源码干净，两项私有环境文件排除。18920属msf-app，8080另一实例，5173独立前端；两后端基础健康正常。源码/dist/加载进程无构建清单，对应版本未知；Dockerfile未含前端，Compose端口与既有服务冲突。',
 '下一步推荐：固定独立候选与完整包、隔离部署核验→需求/产物及双向语义追溯→真实性门禁及真实生产能力→代表性项目从零贯通与统一修复复验→发布维护和有边界持续监督。示范业务、具体性能、预算及自动放行策略仍待配置。工厂外层部署与原PRD分期的客户产品生产自动发布分开。',
 '本轮只记录目标、推荐标准和只读准备；未执行新构建/测试/模型/部署/源码任务，不修改产品NO-GO、里程碑或全局监督策略。',
 `标准 D:/AI/workspaces/MyJevis/${source} / 同名HTML；MD SHA256 ${sourceSha}。依据 artifacts/software-factory/goals-r20/latest-deployment-readiness.json 与 independent-goal-review.json；建设日志追加保存。`
].join('\n');
const noteSha=digest(notes);
let journal;
try{journal=JSON.parse(await readFile(privateJournal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,noteSha,intents:{},receipts:{},before:{}};}
if(journal.noteSha!==noteSha)throw Error('R20_FROZEN_NOTE_CHANGED');
const ids=['70ec346f-6520-46ed-abed-22cac770a3e4','25dcc5cf-bdfe-43f8-bbff-e79e7190161f'];
async function savePrivate(){await mkdir(dirname(privateJournal),{recursive:true});const temp=privateJournal+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,privateJournal);}
const result=await withPlatform(async({api})=>{
 const supervisionBefore=(await api('/api/v1/execution/supervision')).data.supervised;
 const projects=await Promise.all(ids.map(async id=>(await api('/api/v1/projects/'+id)).data));
 if(projects.some(p=>p.ownerId!=='server-admin'||p.scope!=='personal'||p.status==='archived'))throw Error('R20_PROJECT_SCOPE_CHANGED');
 if(!execute)return {ready:true,projectIds:ids,appendOnlyNotes:true,dispatch:false,acceptanceChanged:false};
 for(const p of projects){
  journal.before[p.id]??={status:p.status,milestonesHash:digest(p.milestones??[])};
  const old=p.environmentInfo?.notes??'';
  if(journal.receipts[p.id])continue;
  if(old.includes(marker)){
   if(!old.endsWith(notes))throw Error('R20_EXISTING_NOTE_DIFFERENT');
   journal.receipts[p.id]={id:p.id,revision:p.revision,reused:true};await savePrivate();continue;
  }
  if(old.length+notes.length+2>20000)throw Error('R20_PROJECT_NOTES_LIMIT');
  journal.intents[p.id]??={commandId:randomUUID(),scope:'personal',expectedVersion:p.revision,payload:{projectId:p.id,environmentInfo:{...p.environmentInfo,notes:old+'\n\n'+notes}}};
  await savePrivate();
  const receipt=(await api('/api/v1/projects/commands/environment-info',journal.intents[p.id])).data;
  journal.receipts[p.id]={id:receipt.id,revision:receipt.revision,at:new Date().toISOString()};await savePrivate();
 }
 const checks=[];
 for(const id of ids){
  const p=(await api('/api/v1/projects/'+id)).data;
  const c={projectId:id,revision:p.revision,notesPresent:p.environmentInfo?.notes.endsWith(notes)===true,statusUnchanged:p.status===journal.before[id].status,milestonesUnchanged:digest(p.milestones??[])===journal.before[id].milestonesHash};
  if(!c.notesPresent||!c.statusUnchanged||!c.milestonesUnchanged)throw Error('R20_READBACK_CHANGED');checks.push(c);
 }
 const supervisionAfter=(await api('/api/v1/execution/supervision')).data.supervised;
 if(supervisionBefore!==supervisionAfter)throw Error('R20_SUPERVISION_CHANGED_DURING_RECORD');
 return {verified:true,checks,appendOnlyNotes:true,dispatch:false,acceptanceChanged:false,supervisionUnchanged:true,globalSupervision:supervisionAfter,projectModelCalls:0,deployments:0};
});
if(execute){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({at:new Date().toISOString(),scope:'Append goal/standard/readiness notes only; no product acceptance or execution',source,sourceSha256:sourceSha,noteSha256:noteSha,...result,maintenanceLoginRevoked:true},null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify(result));
