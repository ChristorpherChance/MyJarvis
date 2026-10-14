/** Append a narrow scope clarification; preserve the earlier immutable sync report. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const args=process.argv.slice(2);
if(args.length>1||args.some(x=>x!=='--execute'))throw Error('INVALID_FLAGS');
const execute=args.includes('--execute'),base='artifacts/software-factory/full-test';
const smoke=JSON.parse(await readFile(base+'/sandbox-short-path-r1/tool-install-and-linux-bind-smoke.json','utf8'));
const b=smoke.bindSmoke;
if(smoke.installed!==true||smoke.bindSmokeExitCode!==0||b.actualLinuxAFUnixBind!==true||b.socketPathBytes!==75||b.daemonActions!==0||b.modelCalls!==0||b.productSixCasesRun!==false||b.socketRemoved!==true||b.runtimeDirectoryRemoved!==true)throw Error('ACTUAL_BIND_EVIDENCE_REQUIRED');
const projectIds=['70ec346f-6520-46ed-abed-22cac770a3e4','25dcc5cf-bdfe-43f8-bbff-e79e7190161f'];
const marker='[短路径验证范围补录 '+b.runId+']';
const notes=[marker,`范围补录依据 ${smoke.at} 的实际Linux检查：短socket为75字节，bind、权限及专属socket/目录精确清理已通过；原附注所写“仍需真实Linux测试”应按此细分。`,
 '本次仅基础条件检查，0 Docker动作、0模型调用；原沙箱六项、真实镜像六项、Chromium超时回收及产品专项均未运行。',
 '专项入口和运行器仅在本机准备。当前测试镜像缺Python3，依赖镜像未构建；前置条件失败时8阶段均不运行。当前源码基线和取消原因尚未明确，不派发新的源码或全套复测任务。',
 '中止回执usage=null、整轮审计未完成、产品NO-GO及当前源码未验收保持不变。仅追加项目资料，不改变任务验收、里程碑或全局派发。',
 '证据 '+base+'/sandbox-short-path-r1/tool-install-and-linux-bind-smoke.json；'+base+'/supplemental-environment-plan-r3.json。'].join('\n');
const output=base+'/platform-short-path-scope-sync.json';
let journal;
try{journal=JSON.parse(await readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={formatVersion:1,runId:b.runId,intents:{},receipts:{}};}
if(journal.runId!==b.runId)throw Error('SYNC_IDENTITY_CHANGED');
async function save(){const tmp=output+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,output);}
await withPlatform(async({api})=>{
 if((await api('/api/v1/execution/capabilities')).data.supervised!==false)throw Error('GLOBAL_POLICY_CHANGED');
 const projects=await Promise.all(projectIds.map(async id=>(await api('/api/v1/projects/'+id)).data));
 if(projects.some(p=>p.ownerId!=='server-admin'||p.scope!=='personal'||p.status==='archived'))throw Error('PROJECT_SCOPE_CHANGED');
 const plan={execute,projectIds,runId:b.runId,appendOnlyNotes:true,businessTestsRun:false,modelsInvoked:false,currentSourceAccepted:false,milestonesChanged:false,tasksAccepted:false,globalSupervision:false};
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
