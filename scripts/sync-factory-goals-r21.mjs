/** Append the R21 user goals and source audit summary; no execution or acceptance writes. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const execute=process.argv.includes('--execute');
const output='artifacts/software-factory/goals-r21/platform-goal-sync.json';
const journalPath='.jarvis-dev/maintenance/factory-goals-r21-sync.json';
const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const source='docs/软件工厂Agent迭代与全自动交付方案.md';
const sourceSha=digest(await readFile(source,'utf8'));
const reports=await Promise.all(['agent-capability-audit','autonomy-gap-audit','delivery-completeness-audit'].map(async n=>JSON.parse(await readFile('artifacts/software-factory/goals-r21/'+n+'.json','utf8'))));
if(reports[0].identity?.finalHead!=='266104923b7f49b259dc8a7b827d599c5220ad16'||!reports[0].identity?.allCapturedFilesMatchAtAuditClose||reports[2].head!==reports[0].identity.finalHead||reports[1].scope?.auditedHead!==reports[0].identity.finalHead||!reports[1].scope?.inspectedFilesStableAtFinalFingerprint)throw Error('R21_EVIDENCE_SCOPE_CHANGED');
const marker='[软件工厂 Agent 迭代与全自动最终目标 R21 · 2026-10-11]';
const note=[marker,
 '用户新增明确最终目标：各阶段Agent及子Agent持续迭代优化；各阶段流程走通后，从客户原始需求开始，自动完成全部适用产品文档、真实软件、测试修复、交付安装及实际使用。常规流程不逐关要求人工点击，既有人工点只是当前模式事实，不能否定最终目标。本轮没有开启自动模式或降低质量门。',
 '客户只需提交原始需求/资料；工厂从来源自动整理项目范围、验收和计划，复用平台预设配置；重要业务歧义才提出具体澄清。阶段/子Agent运行闭环与能力优化闭环分开：实际生效prompt/skill/tool/model/template快照，父子委派/预算/取消恢复/汇合，独立评估→候选比较→按规则提升/回滚，记录真实用量。',
 'R21只读源码main/2661049…，不同于R20 e375历史快照。当前六阶段主要同助手切角色；提示词登记与实际注入、委派adapter/工作区预算/取消、实际模型绑定有缺口。开发/CI/评审/自动测试仍有静态mock路径；七关auto策略基础不等于可求值质量门，局部autopilot仍待转测试，非七关动作亦有human硬约束。',
 '交付深审：扫描OCR/长文截断及完整上下文；模板语言格式版本；原型占位/标记检查与真实高保真交互；已有四格式文档导出，但报告/决定JSON及逻辑备份不是客户完整包。需全部文档/页面/软件/证据实际字节、统一清单哈希、独立下载解包、安装/升级恢复、目标角色业务使用与运维接管。',
 '共同基线仍主要PRD/HLD/整体原型，HLD非必需且七册LLD未完整纳入；新目标覆盖全部适用工件依赖/内容版本及下游失效。贾维斯工厂读取适配与外层CLI调度分别存在，要接通内部业务命令及工作流；复用可靠回执和技能冻结，不把外层任务成功当客户软件交付。',
 '路线FA01—09：最新完整包及隔离部署→输入/上下文/产物追溯→真实能力版本和子任务→真实生产及独立质量→Agent优化→持久全流程自动质量门/返工→完整交付使用→正常及异常/变更/稳定运行证明。正常无人值守与异常恢复分别验收，客户业务签收不得伪造。',
 '本轮仅公开设计/静态源码审阅及文档/资料同步；新源码未运行验收，历史NO-GO保留；未调用项目模型、运行新产品测试/构建/部署，未派发源码任务，不改变里程碑/验收或全局监督。',
 '方案 D:/AI/workspaces/MyJevis/'+source+' / 同名HTML，MD SHA256 '+sourceSha+'；端到端标准R21及首项目计划1.5联动。依据 artifacts/software-factory/goals-r21 三份专项审计；建设日志追加保存。'
].join('\n');
const noteSha=digest(note);
let journal;try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={version:1,noteSha,intents:{},receipts:{},before:{}};}
if(journal.noteSha!==noteSha)throw Error('R21_FROZEN_NOTE_CHANGED');
async function save(){await mkdir(dirname(journalPath),{recursive:true});const temp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,journalPath);}
const ids=['70ec346f-6520-46ed-abed-22cac770a3e4','25dcc5cf-bdfe-43f8-bbff-e79e7190161f'];
const result=await withPlatform(async({api})=>{
 const supervision=(await api('/api/v1/execution/supervision')).data.supervised;
 const projects=await Promise.all(ids.map(async id=>(await api('/api/v1/projects/'+id)).data));
 if(projects.some(p=>p.ownerId!=='server-admin'||p.scope!=='personal'||p.status==='archived'))throw Error('R21_PROJECT_SCOPE_CHANGED');
 if(!execute)return {ready:true,appendOnlyNotes:true,projectIds:ids,dispatch:false,acceptanceChanged:false};
 for(const p of projects){
  journal.before[p.id]??={status:p.status,milestonesHash:digest(p.milestones??[])};
  if(journal.receipts[p.id])continue;
  const old=p.environmentInfo?.notes??'';
  if(old.includes(marker)){if(!old.endsWith(note))throw Error('R21_EXISTING_NOTE_DIFFERENT');journal.receipts[p.id]={id:p.id,revision:p.revision,reused:true};await save();continue;}
  if(old.length+note.length+2>20000)throw Error('R21_PROJECT_NOTES_LIMIT');
  journal.intents[p.id]??={commandId:randomUUID(),scope:'personal',expectedVersion:p.revision,payload:{projectId:p.id,environmentInfo:{...p.environmentInfo,notes:old+'\n\n'+note}}};
  await save();const p2=(await api('/api/v1/projects/commands/environment-info',journal.intents[p.id])).data;
  journal.receipts[p.id]={id:p2.id,revision:p2.revision,at:new Date().toISOString()};await save();
 }
 const checks=[];
 for(const id of ids){const p=(await api('/api/v1/projects/'+id)).data;const c={projectId:id,revision:p.revision,notesPresent:p.environmentInfo?.notes.endsWith(note)===true,statusUnchanged:p.status===journal.before[id].status,milestonesUnchanged:digest(p.milestones??[])===journal.before[id].milestonesHash};if(!c.notesPresent||!c.statusUnchanged||!c.milestonesUnchanged)throw Error('R21_READBACK_CHANGED');checks.push(c);}
 const after=(await api('/api/v1/execution/supervision')).data.supervised;if(after!==supervision)throw Error('R21_SUPERVISION_CHANGED_DURING_RECORD');
 return {verified:true,checks,appendOnlyNotes:true,dispatch:false,acceptanceChanged:false,supervisionUnchanged:true,globalSupervision:after,projectModelCalls:0,deployments:0};
});
if(execute){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({at:new Date().toISOString(),scope:'Append clarified goals and static audit notes only',source,sourceSha256:sourceSha,noteSha256:noteSha,...result,maintenanceLoginRevoked:true},null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify(result));
