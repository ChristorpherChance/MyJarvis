/** Preserve the incomplete candidate batch and register one grouped observation. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',runId='67182e98ed3a2801d9506fbd97da2be938833d4a';
const sourceFingerprint='d620178e50d9e17068cad4e41f206516f1a50bab07a62f0932dcba8b39a16234';
const reference='artifacts/software-factory/acceptance-r24/candidate-second-final-independent-review.json';
const bytes=await readFile(reference),e=JSON.parse(bytes);
if(e.run?.id!==runId||e.observed?.sourceFingerprint!==sourceFingerprint||e.productAccepted!==false)throw Error('CANDIDATE_GAPS_EVIDENCE_BINDING_INVALID');
const evidenceSHA256=createHash('sha256').update(bytes).digest('hex');
const path='.jarvis-dev/maintenance/factory-candidate-gaps-r24.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;j={projectId,runId};}
if(j.projectId!==projectId||j.runId!==runId)throw Error('CANDIDATE_GAPS_JOURNAL_BINDING_INVALID');
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
const result=await withPlatform(async({api})=>{
 const p=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(p.revision!==20||p.spec.objectives.length!==74||p.config.costPolicy!=='record-only'||p.verifiedObjectiveIds.length!==0)throw Error('CANDIDATE_GAPS_SCOPE_CHANGED');
 const run=(await api('/api/v1/execution/runs/'+runId)).data;
 if(run.projectId!==projectId||run.workspace!=='/home/superopen/All-Projects/msf-jarvis-autonomy-r22'||run.status!=='cancelled'||run.stopRequested!==true)throw Error('CANDIDATE_GAPS_STOP_BINDING_INVALID');
 j.intent??={commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{title:'F-R24-003：候选验收缺口分类与精确复验',projectId,machineId:p.config.machineId,agent:'manual-review',mode:'observe',budget:1,retryLimit:0,goal:`绑定候选源码${sourceFingerprint}、真实run${runId}。332用例中326通过、6失败；5项沙箱集成优先核对固定镜像身份清单，1项存储直链路径编码断言需独立复验。测试清单缺98文件，其中96为历史打包副本、2为监督脚本测试；先确定适用范围再补执行，不删真实必测。原型syntax入口引用不存在的V1.1初始版文件，另有git历史前提；旧入口不能替代当前高保真原型检查。selftest超120秒未终止已按原技术边界停止批次；部分结果保留，未执行项不得通过。此观察记录不派发模型或改产品源。`,criteria:`每个缺口分别关联原失败用例/文件、原因、最小改动、新源码身份和独立复验。镜像身份安全拒绝保持；直链测试覆盖真实期望与编码兼容性。历史副本与正式测试边界有清单依据，2脚本真实执行；当前原型页面和子页面无遗漏，不以旧入口删除等同通过。超时工具使用无CAP_KILL真实Linux证明、旧版本备份和精确清理；原cancelled/晚到证据不复活。完整包/运行、74目标、客户贯通及同版24/72小时仍需新独立证据。报告${reference} SHA256 ${evidenceSHA256}。费用只记录不限额，观察预算字段不启动执行。`}};await save();
 if(!j.receipt){j.receipt=(await api('/api/v1/tasks/commands/create',j.intent)).data;await save();}
 const task=(await api('/api/v1/tasks/'+j.receipt.id)).data;
 if(task.mode!=='observe'||task.executionRequest||task.projectId!==projectId)throw Error('CANDIDATE_GAPS_OBSERVATION_UNCONFIRMED');
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(after.revision!==p.revision||after.goalSpecHash!==p.goalSpecHash||after.verifiedObjectiveIds.length)throw Error('CANDIDATE_GAPS_PROFILE_CHANGED');
 return {at:new Date().toISOString(),projectId,runId,sourceFingerprint,task:{id:task.id,title:task.title,status:task.status,mode:task.mode},reference,evidenceSHA256,fixDispatched:false,modelsInvoked:false,oldPlanChanged:false,productAccepted:false};
});
const output='artifacts/software-factory/acceptance-r24/candidate-gaps-live.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
