/** Append the independently checked interruption and source-change facts; never accept or dispatch. */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';
const args=process.argv.slice(2);if(args.some(x=>x!=='--execute')||args.length>1)throw Error('INVALID_FLAGS');
const execute=args.includes('--execute'),base='artifacts/software-factory/full-test';
const review=JSON.parse(await readFile(base+'/result-independent-review-r2-interrupted.json','utf8'));
if(review.interruptionEvidenceVerified!==true||review.fullAuditVerified!==false||review.currentSourceAccepted!==false||review.live.activeRequests!==0||review.live.globalSupervision!==false)throw Error('INDEPENDENT_INTERRUPTION_REVIEW_REQUIRED');
const projectIds=['70ec346f-6520-46ed-abed-22cac770a3e4','25dcc5cf-bdfe-43f8-bbff-e79e7190161f'];
const marker='[监督复测中止 '+review.runId+']';
const notes=[marker,`独立核对时间 ${review.at}；任务 ${review.taskId}；run ${review.runId}。同101节点签名cancelled/143，没有人为停止指令；实际触发原因尚未知。`,
 `完整复测未完成：29/40阶段，晚到root报告collectorCompleted=false，原生validation=null、usage=null；不补造零用量、不改写签名成功。固定旧快照44文件306项：${review.totals.passed}通过、${review.totals.failed}失败、${review.totals.skipped}跳过，不是当前新源码验收。`,
 `旧原型已结束阶段${review.browser.completedStages}个：${review.browser.completedPassed}通过、${review.browser.completedFailedOrBlocked}失败或阻塞，含${review.browser.timedOut.length}个120秒超时；原型套件摘要仅${review.browser.structuredSuiteRows}行，未结束部分保留未知。设计边界21项20通过1缺V1.8历史资产，不能误记产品缺陷。`,
 '本轮沙箱受AF_UNIX路径过长阻塞，真实功能未验证；真实性与存储补充探针未运行。首次完整审计与7项放行反例单独保留，产品仍NO-GO。',
 `原目录测试期间发生变化：${review.sourceBefore} → ${review.sourceAfter}；随后再次变化。已确认会话源码及测试3路径有更新，作者未知。新测试须绑定固定基线，不能借旧结果验收新设计。`,
 '中央和101原Claude模板恢复、全队列0、全局监督关闭；节点签名终结后又独立查证专属容器、网络和固定进程0。执行已停、报告已齐、资源已收尾分开记录。',
 '待补齐：取消触发原因可追溯、回执持久对账和日志补传、原生逐轮检查点、有效后备路线、按产物判断停滞。已准备的短路径及超时回收工具仍需真实Linux/业务测试，不把静态通过当现场通过。',
 '报告 D:/AI/workspaces/MyJevis/docs/101监督环境检查与首次完整测试.md/html；证据 '+base+'/result-independent-review-r2-interrupted.json。源码变动后的新任务尚未派发；不改变里程碑、任务验收或产品源码。'].join('\n');
const output=base+'/platform-interruption-sync-r2-retry1.json';let journal;
try{journal=JSON.parse(await readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={formatVersion:1,runId:review.runId,taskId:review.taskId,intents:{},receipts:{}};}
if(journal.runId!==review.runId||journal.taskId!==review.taskId)throw Error('SYNC_IDENTITY_CHANGED');
async function save(){await mkdir(dirname(output),{recursive:true});const temp=output+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,output);}
await withPlatform(async({api})=>{
 if((await api('/api/v1/execution/capabilities')).data.supervised!==false)throw Error('GLOBAL_POLICY_CHANGED');
 const projects=await Promise.all(projectIds.map(async id=>(await api('/api/v1/projects/'+id)).data));
 if(projects.some(p=>p.ownerId!=='server-admin'||p.scope!=='personal'||p.status==='archived'))throw Error('PROJECT_SCOPE_CHANGED');
 const plan={execute,projectIds,runId:review.runId,taskId:review.taskId,appendOnlyNotes:true,fullAuditVerified:false,currentSourceAccepted:false,milestonesChanged:false,tasksAccepted:false,modelsInvoked:false,sourceCodeChanged:false,globalSupervision:false};
 if(!execute){console.log(JSON.stringify(plan));return;}
 for(const p of projects){
  if(journal.receipts[p.id])continue;
  const old=p.environmentInfo?.notes??'';
  if(old.includes(marker)){if(!old.endsWith(notes))throw Error('EXISTING_NOTES_DIFFER');journal.receipts[p.id]={id:p.id,revision:p.revision,reused:true};await save();continue;}
  if(old.length+notes.length+2>20000)throw Error('PROJECT_NOTES_LIMIT');
  if(!journal.intents[p.id]){journal.intents[p.id]={commandId:randomUUID(),scope:'personal',expectedVersion:p.revision,payload:{projectId:p.id,environmentInfo:{...p.environmentInfo,notes:old+'\n\n'+notes}}};await save();}
  const r=await api('/api/v1/projects/commands/environment-info',journal.intents[p.id]);
  journal.receipts[p.id]={id:r.data.id,revision:r.data.revision,at:new Date().toISOString(),events:(r.events??[]).map(e=>({id:e.id,type:e.type}))};await save();
 }
 for(const id of projectIds){const p=(await api('/api/v1/projects/'+id)).data;if(!p.environmentInfo?.notes.endsWith(notes))throw Error('NOTES_NOT_CONFIRMED');if(id===projectIds[0]&&p.milestones.some(m=>m.completed))throw Error('PRODUCT_MILESTONE_CHANGED');}
 journal.completedAt=new Date().toISOString();journal.result={...plan,verified:true};await save();console.log(JSON.stringify(journal.result));
});
