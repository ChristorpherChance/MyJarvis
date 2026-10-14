/** Append a verified test-audit summary to existing project records; never accept or dispatch. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';

const execute=process.argv.includes('--execute');
const args=process.argv.slice(2),attempt=args.includes('--attempt=r2-retry1')?'r2-retry1':args.includes('--attempt=r2')?'r2':'r1';
if(args.some(x=>!['--execute','--attempt=r2','--attempt=r2-retry1'].includes(x))||new Set(args).size!==args.length||args.filter(x=>x.startsWith('--attempt=')).length>1)throw Error('INVALID_ATTEMPT_FLAGS');
const base='artifacts/software-factory/full-test',projectId='70ec346f-6520-46ed-abed-22cac770a3e4',constructionId='25dcc5cf-bdfe-43f8-bbff-e79e7190161f';
const full=JSON.parse(await readFile(base+(attempt==='r1'?'/full-validation.json':'/full-validation-'+attempt+'.json'),'utf8'));
if(full.auditVerified!==true||full.restoration?.verified!==true||full.scope?.projectId!==projectId||!/^[a-f0-9]{40}$/.test(full.intents?.start?.runId??'')||!full.completedAt)throw Error('FULL_TEST_EVIDENCE_REQUIRED');
const reportPath=base+'/report-'+full.intents.start.runId+'.json';
const report=JSON.parse(await readFile(reportPath,'utf8'));
if(report.runId!==full.intents.start.runId||report.collectorCompleted!==true||report.sourceUnchanged!==true||report.cleanup?.complete!==true||report.productionDatabaseUsed!==false||report.modelsInvoked!==false||!['NO-GO','GO-CANDIDATE'].includes(report.productVerdict))throw Error('INVALID_AUDIT_REPORT');
const native=JSON.parse(await readFile(base+'/native-ai-connection.json','utf8'));
const probe=JSON.parse(await readFile(base+'/supervision-probe.json','utf8'));
if(native.passed!==true||native.restoration?.complete!==true||probe.passed!==true||probe.restoration?.verified!==true)throw Error('SUPERVISION_EVIDENCE_REQUIRED');
const packages=report.tests?.testResults??[],browser=report.tests?.browserSuites??[],risk=report.tests?.truthfulnessProbe;
const finite=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const packageText=packages.map(p=>`${p.package}: total=${finite(p.total)??'未知'}, passed=${finite(p.passed)??'未知'}, failed=${finite(p.failed)??'未知'}, pending=${finite(p.pending)??'未知'}`).join('；');
const marker='['+(attempt!=='r1'?'环境补齐后监督复测':'首次完整监督测试')+' '+report.runId+']';
const notes=[marker,`发生于 ${full.completedAt}；测试任务 ${full.taskId}；测试审计已完成并独立核对，产品结论 ${report.productVerdict}，尚未人工验收。`,
 `101 实际执行固定隔离测试：${report.stageSummary?.length??'未知'} 个阶段；${packageText||'没有可解析的实际单测报告'}。当前文件清单完整核对=${report.tests?.allTestFilesAccountedFor===true}；缺报告不推算通过率。`,
 `旧原型回归 ${browser.length} 套，尝试 ${browser.filter(x=>x.attempted).length} 套，通过 ${browser.filter(x=>x.ok).length} 套；当前 React 页面验收需另做。真实性反例 ${risk?.checks?.length??'未知'} 项，安全判定=${risk?.productSafe??'未知'}。`,
 `源码 ${report.sourceBefore} 前后一致；独立库/缓存/对象存储，未使用业务库；专属资源已清理；原 Claude 模板恢复，全局持续监督关闭。固定测试实际 0 Token、0 USD。`,
 '模型路线分三层：112贾维斯Pi、101 Claude/cc-switch、软件工厂内部Pi。当前外层实际回执 gpt-6-sol[1m]；真实连通调用2586Token，0.01575USD是目录估算，不是账单。内部provider及价格尚需核实，备用执行器未配置。',
 `101 控制实测任务 ${probe.taskId}：首轮签名取消后新run复用原检查点成功。此固定探针不证明Claude原生会话崩溃恢复。`,
 '未完成：最终回执持久对账、日志补传/完整保留、每轮原生检查点、可靠后备、产物无进展识别；完整测试不足项保留NO-GO，不按模拟100%或Token计算进度。',
 '报告 D:/AI/workspaces/MyJevis/docs/101监督环境检查与首次完整测试.md/html；固定公开证据 '+reportPath+'；本轮目标是完整测试审计，不是源码功能修复或产品交付。'].join('\n');
const output=resolve(base,attempt==='r1'?'platform-validation-sync.json':'platform-validation-sync-'+attempt+'.json');let journal;
try{journal=JSON.parse(await readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={formatVersion:1,runId:report.runId,taskId:full.taskId,intents:{},receipts:{}};}
if(journal.formatVersion!==1||journal.runId!==report.runId||journal.taskId!==full.taskId)throw Error('VALIDATION_SYNC_JOURNAL_IDENTITY_INVALID');
async function save(){await mkdir(dirname(output),{recursive:true});const temp=output+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(temp,output);}
await withPlatform(async({api})=>{
 const caps=(await api('/api/v1/execution/capabilities')).data;if(caps.supervised!==false)throw Error('GLOBAL_BOUNDARY_CHANGED');
 const projects=await Promise.all([projectId,constructionId].map(async id=>(await api('/api/v1/projects/'+id)).data));
 if(projects.some(p=>p.ownerId!=='server-admin'||p.scope!=='personal'||p.status==='archived'))throw Error('PROJECT_SCOPE_CHANGED');
 const plan={execute,projectIds:projects.map(p=>p.id),runId:report.runId,taskId:full.taskId,productVerdict:report.productVerdict,appendOnlyNotes:true,milestonesChanged:false,tasksAccepted:false,modelsInvoked:false,sourceCodeChanged:false,globalSupervision:false};
 if(!execute){console.log(JSON.stringify(plan));return;}
 for(const project of projects){
  if(journal.receipts[project.id])continue;
  const old=project.environmentInfo?.notes??'';
  if(old.includes(marker)){if(!old.endsWith(notes))throw Error('EXISTING_TEST_NOTES_DIFFER');journal.receipts[project.id]={id:project.id,revision:project.revision,reused:true};await save();continue;}
  if(old.length+notes.length+2>20000)throw Error('PROJECT_NOTES_LIMIT');
  if(!journal.intents[project.id]){journal.intents[project.id]={commandId:randomUUID(),scope:'personal',expectedVersion:project.revision,payload:{projectId:project.id,environmentInfo:{...project.environmentInfo,notes:old+'\n\n'+notes}}};await save();}
  const response=await api('/api/v1/projects/commands/environment-info',journal.intents[project.id]);
  journal.receipts[project.id]={id:response.data.id,revision:response.data.revision,at:new Date().toISOString(),events:(response.events??[]).map(e=>({type:e.type,id:e.id})),milestones:response.data.milestones.map(m=>({title:m.title??m.name,completed:m.completed}))};await save();
 }
 for(const id of [projectId,constructionId]){const p=(await api('/api/v1/projects/'+id)).data;if(!p.environmentInfo?.notes?.endsWith(notes))throw Error('PROJECT_SUMMARY_NOT_CONFIRMED');if(id===projectId&&p.milestones.some(m=>m.completed))throw Error('PRODUCT_MILESTONE_CHANGED');}
 journal.completedAt=new Date().toISOString();journal.result={...plan,verified:true};await save();console.log(JSON.stringify(journal.result));
});
