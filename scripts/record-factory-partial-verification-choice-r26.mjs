/** Choose independent testing of the real partial candidate; preserve its round-limit outcome. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const project='70ec346f-6520-46ed-abed-22cac770a3e4',dir='artifacts/software-factory/acceptance-r26';
const action=process.argv[2]??'select';if(action!=='select')throw Error('PARTIAL_CHOICE_ACTION_INVALID');
const path='.jarvis-dev/maintenance/factory-partial-verification-choice-r26.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=path+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,path);}
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const names=[dir+'/native-repair-candidate-audit-1791737452480-24f08f01-fa08-46e0-9b13-27231cf64e91.json',dir+'/native-repair-assertion-preservation-independent-20261012.json',dir+'/main-repair-restore-1791737279469-6064a3e8-9182-4edb-b48d-3789e8bcba74.json'];
const refs=await Promise.all(names.map(async reference=>({reference,kind:'observation',sha256:hash(await readFile(reference))})));
const audit=JSON.parse(await readFile(names[0],'utf8')),preservation=JSON.parse(await readFile(names[1],'utf8'));
if(audit.terminal.status!=='round-limit'||audit.terminal.outcome!=='round-limit'||audit.terminal.exitCode!==0||!audit.executorRestored||audit.productAccepted||audit.candidate.after.sha256!==preservation.candidateSHA||!preservation.assertionBodyByteIdentical)throw Error('PARTIAL_CHOICE_ACTUAL_AUDIT_REQUIRED');
const result=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${project}/autonomy`)).data,before=hash(profile);
 if(profile.config.costPolicy!=='record-only')throw Error('PARTIAL_CHOICE_COST_POLICY_CHANGED');
 const objectives=profile.spec.objectives.map(o=>o.id),option=(id,title,advantages,disadvantages,impact)=>({id,title,advantages,disadvantages,impact,compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,origin:'ai',status:'selected',questionSummary:'单轮修复因技术轮次边界结束，如何继续验证已有部分改动并推进剩余问题？',
  context:{observedAt:new Date().toISOString(),goalSpecHash:profile.goalSpecHash,sourceFingerprint:audit.candidate.after.sha256,sourceVersion:'独立副本605个公开文件；主线593文件未变',runId:audit.runId,taskId:audit.taskId,machineId:profile.config.machineId,objectives,
   constraints:['保留真实round-limit结果，不改写为succeeded','显式允许测试部分候选仅影响测试资格，不代表产品验收','签名exit0、无停止/晚到、原模板恢复、ACK idle、source/origin/固定工具门禁保留','45必需文件、30原型、90/80门槛均不降低','费用与Token只记录，不设消费上限'],
   situation:'已独立核对12新增、1修改、0删除；唯一原文件改动为prototype-commands临时目录与清理，32034字节原用例正文一致。其余镜像、SDK、资产及超时未解决；原报告只是模型声明，当前实际候选指纹以独立helper为准。'},
  options:[option('test-partial','先独立测试部分候选，再据结果继续修复',['客观确认源码污染是否消除','可进入此前未执行的隔离安装与运行检查','分离实际修复效果和模型自报'],['仍有已知失败，不能据此直接交付','需要再跑完整测试'], '固定605文件真实指纹，显式允许这次round-limit且exit0部分候选的独立无模型复验。'),
   option('repair-more-first','补充执行上下文后先继续修复，再完整测试',['能一次处理更多已知问题'],['暂不确认当前生成文件修复效果','可能叠加改动，使归因与回退更复杂'], '另立后续修复任务与公开环境契约，保留当前候选；仍须完整独立验证。')],
  chosenId:'test-partial',decisionRationale:'测试资格不依赖模型宣称完成；现有改动已实际审阅，先通过同标准固定独立测试取得效果和新运行缺口，再提供可读取的诊断、依赖及镜像契约安排下一轮修复。',basisRefs:refs,risk:'medium',affectedObjectives:objectives,
  rollbackPlan:{plan:'若候选来源、固定工具、清理或验证资格不一致，停止后续派发并保留当前副本与记录；已开始运行须签名终态和资源核对后恢复原模板。',triggers:['候选或原main指纹漂移','签名、origin或固定标准不一致','临时资源未清理'],impact:'不合并主线、不抹去失败，不回退业务数据。',requiresNewExecutionPlan:true},
  actions:[{summary:'准备显式部分候选测试资格、固定新入口和独立派发；实际安装与执行另记回执。',at:new Date().toISOString(),state:'planned',evidenceRefs:refs}]};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${project}/decisions`,j.intent)).data;await save();}
 const d=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}`)).data;
 if(hash((await api(`/api/v1/projects/${project}/autonomy`)).data)!==before)throw Error('PARTIAL_CHOICE_OLD_PROFILE_CHANGED');
 return {at:new Date().toISOString(),decisionId:d.id,revision:d.revision,status:d.status,chosenId:d.chosenId,candidateFingerprint:audit.candidate.after.sha256,partialNative:true,oldProfileUnchanged:true,productAccepted:false};
});
const output=dir+'/partial-verification-choice-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
