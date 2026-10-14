/** Save why this run tests current main; all alternatives/history remain reviewable. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const action=process.argv[2]??'select';if(!['select','implemented'].includes(action))throw Error('CHOICE_ACTION_INVALID');
const project='70ec346f-6520-46ed-abed-22cac770a3e4',dir='artifacts/software-factory/acceptance-r26',path='.jarvis-dev/maintenance/factory-execution-choice-r26.json';let j;
try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const t=path+'.'+randomUUID()+'.tmp';await writeFile(t,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(t,path);}
const refs=await Promise.all(['artifacts/software-factory/acceptance-r24/main-source-identity-readback-execution-r26.json',dir+'/main-verifier-installed-72cb5d77-5799-4a9c-bc08-f1c742067f7b.json',dir+'/local-verification.json','docs/通用项目监管与软件工厂测试执行.md'].map(async reference=>({reference,kind:'observation',sha256:createHash('sha256').update(await readFile(reference)).digest('hex')})));
const result=await withPlatform(async({api})=>{
 const p=(await api(`/api/v1/projects/${project}/autonomy`)).data,objectives=p.spec.objectives.map(o=>o.id);
 const option=(id,title,advantages,disadvantages,impact)=>({id,title,advantages,disadvantages,impact,compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,origin:'ai',status:'selected',questionSummary:'软件工厂已有主要成果，如何开始测试验收，同时让其他项目支持持续开发？',context:{observedAt:new Date().toISOString(),goalSpecHash:p.goalSpecHash,sourceFingerprint:'151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',sourceVersion:'main 89e6af3ac64f707c3ba6fc09e9e09fe4a4174171，593个公开文件',runId:null,taskId:null,machineId:p.config.machineId,objectives,constraints:['用户已授权开始现有成果测试验收','其他项目仍可持续开发，不套用软件工厂专用目标','全部74原目标及旧阻塞和失败记录保留','费用与Token只记录，不设消费限制','仅在隔离快照运行固定测试，不用业务库、私有配置或外部模型'],situation:'当前main构建与15项基础测试通过，但完整适用测试和打包运行尚未取得本版本证据；旧R22候选有真实历史问题，不能替代当前main。通用计划读取真实任务状态并保留版本。'},options:[option('current-main-test','新计划隔离测试当前main',['测试真正准备交付的当前代码','不重置旧计划，可保留来源和失败追溯','通用计划分别支持开发和验收'],['完整测试会暴露测试资产及环境等额外缺口'],'新增main固定入口及计划，按真实结果安排修复；原74目标独立验收不变。'),option('candidate-first','先继续旧候选，再同步main核对',['已有旧验证链和失败报告可复用'],['候选与main来源不同，可能重复修复已变更的问题','原候选尝试已耗尽，需要先核对新计划边界'],'最终仍需回到当前main进行完整验收；本次优先级较低。')],chosenId:'current-main-test',decisionRationale:'用户明确大部分开发已完成。优先取得当前main完整测试和交付包证据，分类修复实际问题；其他项目通过独立可修订计划继续开发。保留技术时限和签名租约，不扩大模型或财务限制。',basisRefs:refs,risk:'medium',affectedObjectives:objectives,rollbackPlan:{plan:'保留旧R22目标、计划及配置。需要调整时先核对本轮签名终结和资源清理，再恢复原执行器，并新建或修订后续计划；不删除失败报告，不回退实际业务数据。',triggers:['本轮主线源码变化','固定工具或隔离环境身份不一致','需要调整测试或修复范围'],impact:'仅影响此项目后续任务安排，保留所有运行及计划版本。',requiresNewExecutionPlan:true},actions:[{summary:'固定当前main版本，准备完整适用测试与打包运行，通用计划和汇报区分持续开发及测试验收。',at:new Date().toISOString(),state:'planned',evidenceRefs:refs}]};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${project}/decisions`,j.intent)).data;await save();}
 if(action==='implemented'&&!j.implemented){
  const batch=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-acceptance-r26-current-main-full.json','utf8'));
  if(!batch.started||!batch.taskId||!batch.runId)throw Error('CHOICE_EXECUTION_NOT_STARTED');
  j.implementation??={commandId:randomUUID(),expectedVersion:j.receipt.revision,origin:'ai',reason:'新测试验收计划已绑定由贾维斯下发的真实101主线测试运行，产品结果等待实际报告。',actions:[{summary:`实际下发任务 ${batch.taskId}，执行 ${batch.runId}，固定无模型入口和独立main验证；旧目标与旧blocked计划未修改。`,at:new Date().toISOString(),state:'performed',evidenceRefs:refs}]};await save();
  j.implemented=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}/implementation`,j.implementation)).data;await save();
 }
 const d=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}`)).data;
 return {at:new Date().toISOString(),decisionId:d.id,revision:d.revision,status:d.status,chosenId:d.chosenId,hash:d.hash,independentAcceptance:d.independentAcceptance,productAccepted:false};
});await mkdir(dir,{recursive:true});const output=dir+'/execution-choice-'+action+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
