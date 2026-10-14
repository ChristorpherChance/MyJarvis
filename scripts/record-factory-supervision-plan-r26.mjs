/** Idempotent project planning and live task binding; no execution is started here. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const action=process.argv[2]??'prepare';if(!['prepare','bind','readback'].includes(action))throw Error('PLAN_ACTION_INVALID');
const project='70ec346f-6520-46ed-abed-22cac770a3e4',base=`/api/v1/projects/${project}/supervision-plans`,dir='artifacts/software-factory/acceptance-r26';
const journalPath='.jarvis-dev/maintenance/factory-supervision-plan-r26.json';let j;
try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={intents:{}};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const t=journalPath+'.'+randomUUID()+'.tmp';await writeFile(t,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(t,journalPath);}
const steps=[
 {id:'tests',title:'全面测试',goal:'全量测试、原型回归与交付包运行',criteria:['绑定最新主线源码指纹、完整适用测试和实际签名回执','失败、超时、缺失、跳过与未知分别记录'],taskIds:[],runIds:[],nextAction:'先完成当前主线的全量检查，分类记录问题。'},
 {id:'artifacts',title:'核对产物',goal:'需求、设计、原型、代码与测试关联',criteria:['原始需求和74目标逐项覆盖，产物使用相同版本','每个页面及子页面具备真实可交互实现与可核对证据'],taskIds:[],runIds:[],nextAction:'依据实际产物建立遗漏及关联错误清单。'},
 {id:'repair',title:'修复复验',goal:'按证实问题定点修复并回归',criteria:['问题绑定源版本、需求、失败证据和修复任务','修复后独立复验，不能靠自报关闭'],taskIds:[],runIds:[],nextAction:'分类优先修复阻断问题，再按影响范围复验。'},
 {id:'delivery',title:'交付验收',goal:'从原始需求到产品文档与软件交付',criteria:['从零客户流程可完整运行且产物关联一致','交付包安装使用、备份恢复、升级回退和变更复验有证据'],taskIds:[],runIds:[],nextAction:'完整链路检查及独立交付验收。'},
 {id:'autonomy',title:'自动运行',goal:'Agent迭代、异常恢复与持续监督',criteria:['阶段及子Agent版本评测、晋升和回退可追溯','连续运行、异常处理与用量记录有实际长期观察证据'],taskIds:[],runIds:[],nextAction:'完成严格阶段验证后再检验无人值守连续运行。'}
];
const body={mode:'acceptance',title:'软件工厂 · 测试验收计划',goal:'检查现有成果，修复证实问题，逐项验证交付目标。',steps,currentStepId:'tests',nextAction:'完成本批检查后分类问题，安排定点修复和复验。'};
const result=await withPlatform(async({api})=>{
 const before=(await api(`/api/v1/projects/${project}/autonomy`)).data,profileHash=createHash('sha256').update(JSON.stringify(before)).digest('hex');
 if(before.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||before.config.costPolicy!=='record-only')throw Error('PLAN_GOALS_CHANGED');
 if(action==='prepare'&&!j.plan){j.intents.create??={commandId:randomUUID(),expectedVersion:0,...body};await save();j.plan=(await api(base,j.intents.create)).data;await save();}
 if(!j.plan)throw Error('PLAN_NOT_PREPARED');
 if(action==='bind'&&!j.bound){
  const batch=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-acceptance-r26-current-main-full.json','utf8'));
  if(!batch.started||!batch.taskId||!batch.runId||batch.projectId!==project||batch.source!=='/home/superopen/All-Projects/msf')throw Error('PLAN_BATCH_NOT_DISPATCHED');
  const current=(await api(base+'/'+j.plan.planId)).data;
  j.intents.bind??={commandId:randomUUID(),expectedVersion:current.revision,...body,steps:body.steps.map(s=>s.id==='tests'?{...s,taskIds:[batch.taskId],runIds:[batch.runId]}:s),reason:'绑定贾维斯下发的当前主线完整隔离测试；旧开发阻塞及目标不变。'};await save();
  j.plan=(await api(base+'/'+j.plan.planId+'/revisions',j.intents.bind)).data;j.bound=true;await save();
 }
 const view=(await api(base+'/'+j.plan.planId)).data,after=(await api(`/api/v1/projects/${project}/autonomy`)).data;
 if(createHash('sha256').update(JSON.stringify(after)).digest('hex')!==profileHash)throw Error('PLAN_OLD_AUTONOMY_CHANGED');
 return {at:new Date().toISOString(),action,projectId:project,view,oldAutonomyUnchanged:true,modelsInvoked:false,productAccepted:false};
});
await mkdir(dir,{recursive:true});const output=dir+'/supervision-plan-'+action+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,planId:result.view.planId,revision:result.view.revision,mode:result.view.mode,active:result.view.active,currentExecution:result.view.currentExecution,latestResult:result.view.latestResult,oldAutonomyUnchanged:true}));
