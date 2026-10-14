/** Record the changed strategy and an evidence-bound defect; never start a writer. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const dir='artifacts/software-factory/acceptance-r24';
const journalPath='.jarvis-dev/maintenance/factory-acceptance-decisions-r24.json';
const report=JSON.parse(await readFile(`${dir}/main-baseline-independent-review.json`,'utf8'));
if(report.projectId!==projectId||report.signedRunStatus!=='failed'||report.report.error!=='BUILD_FAILED'||!report.sourceStableBeforeDuringAndAfter||report.buildDiagnostics.length!==2||report.modelsInvoked||!report.restored)throw Error('ACCEPTANCE_DECISION_EVIDENCE_MISMATCH');
const reference=async(path,kind)=>({reference:path,kind,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
const evidence=await reference(`${dir}/main-baseline-independent-review.json`,'test-report');
let j;try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={projectId};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};
const result=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(profile.revision!==20||profile.spec.objectives.length!==74||profile.config.costPolicy!=='record-only'||profile.config.maxUSD!==null)throw Error('ACCEPTANCE_FROZEN_GOALS_CHANGED');
 const objectives=profile.spec.objectives.map(o=>o.id);
 const option=(id,title,advantages,disadvantages,impact,compliesWithGoals)=>({id,title,advantages,disadvantages,impact,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
 j.decision??={commandId:randomUUID(),expectedVersion:0,changeOf:'3f2feb6d-af45-4243-99cc-f6a1903c7edd',questionSummary:'软件工厂已基本开发完成，应先测试现有成果还是继续整包开发？',context:{observedAt:report.at,goalSpecHash:profile.goalSpecHash,sourceFingerprint:report.sourceFingerprint,sourceVersion:report.report.copy.gitBefore.head,runId:report.runId,taskId:report.taskId,machineId:profile.config.machineId,objectives,constraints:['用户明确先按全部既定目标验收现有成果','74目标、旧失败与产物、未知费用保留；费用只记录不限额','主项目与R22候选版本不同，各自报告不得互相冒用','独立副本修复，固定验证，不能以计划或模型自报计验收'],situation:'旧整包开发因技术尝试保护停止；实际主项目首个固定隔离检查已执行，离线安装通过、构建出现两处TS2345，后续类型与共享单测未执行。现存代码应作为首要验收对象。'},options:[option('accept-existing','按现有成果逐项验收，缺陷驱动小修复',['承接已有功能和产物','实际失败可定位与复验，避免无证据重写'],['仍需全量、界面、语义、实际客户贯通和长期自动运行的独立证据'],'A00–A19分批核对现有版本；缺口明确后修复受影响范围并回归。','yes'),option('repeat-development','提高旧次数继续整包开发',['可以继续增加代码'],['现有功能未先核对','再次扩大范围可能重复超时且不能证明达标'],'没有先回答现有成果是否满足74目标，不选择。','no')],chosenId:'accept-existing',decisionRationale:'遵从最新目标。先把主项目身份、已有成果和真实失败固定，再逐阶段检验与修复；将基本开发完成与独立验收通过明确分开。',basisRefs:[evidence,await reference('docs/软件工厂现有成果验收与修复计划.md','requirement')],risk:'medium',affectedObjectives:objectives,rollbackPlan:{plan:'出现来源绑定错误、并发写者或错误放行时停止新验收批次，保留报告和用量；重新固定源后重计划，旧监督历史不覆盖。代码修复需独立提交与可回退副本，不直接改原主项目。',triggers:['源码或模板身份不匹配','新证据与目标无对应','出现并发源修改或误判通过'],impact:'暂停受影响后续批次，历史计划、报告和消费继续保留。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai'};
 j.decision.context.observedAt=new Date(j.decision.context.observedAt).toISOString();await save();
 if(!j.changeBody){const previous=(await api(`/api/v1/projects/${projectId}/decisions/${j.decision.changeOf}`)).data;
  const {changeOf,...body}=j.decision;j.changeBody={...body,expectedVersion:previous.revision,reason:'用户最新明确现有成果已基本完成，承接旧小批任务收敛原则，改变主优先级为现有成果逐目标验收；历史选择与动作保留。'};await save();}
 if(!j.decisionReceipt){j.decisionReceipt=(await api(`/api/v1/projects/${projectId}/decisions/${j.decision.changeOf}/change`,j.changeBody)).data;await save();}
 j.implementation??={commandId:randomUUID(),expectedVersion:j.decisionReceipt.revision,origin:'ai',reason:'验收优先策略已有实际主项目固定检查；记录已经执行的狭窄范围，不代表全目标通过。',actions:[{summary:'平台向101实际派发现有main固定离线安装/构建/类型检查/3共享测试检查；签名失败后独立读回报告、源前中后稳定与模板恢复；发现两处构建缺陷，其余未执行。',at:report.at,state:'performed',evidenceRefs:[evidence]},{summary:'后续完整74目标、部署、语义关联、界面和客户贯通按A00–A19推进；修复只能以实证缺陷和独立副本为依据。',at:new Date().toISOString(),state:'planned',evidenceRefs:[evidence]}]};await save();
 j.implementation.actions=j.implementation.actions.map(action=>({...action,at:new Date(action.at).toISOString()}));await save();
 if(!j.implementationReceipt){j.implementationReceipt=(await api(`/api/v1/projects/${projectId}/decisions/${j.decisionReceipt.id}/implementation`,j.implementation)).data;await save();}
 j.defect??={commandId:randomUUID(),scope:'personal',expectedVersion:0,payload:{title:'F-R24-001：主项目模板刷新两处TS2345构建缺陷',projectId,machineId:profile.config.machineId,agent:'manual-review',mode:'observe',budget:1,retryLimit:0,goal:`来源main ${report.report.copy.gitBefore.head}，公开源码指纹${report.sourceFingerprint}。固定检查${report.runId}：apps/server/src/modules/platform/template-refresh.service.ts:47/67中的template_refresh.start与.stop未被CommandType承接。建立独立修复副本，核对命令定义/路由/校验/执行全链，只修确认缺陷，保留原主项目和旧R22候选。此记录是待修复观察任务，尚未派发代码修改。`,criteria:`独立提交和差异审阅，固定离线安装/构建/完整类型检查通过；命令实际注册、输入校验、权限、start/stop行为回归，原共享单测与受影响测试通过。新源指纹、运行/测试报告、成本及回退依据关联本缺陷与74目标；零用例或未执行不能算通过。证据：${evidence.reference} SHA256 ${evidence.sha256}。费用只记录、不限额；该观察任务预算字段不产生执行或费用限制。`}};await save();
 if(!j.defectReceipt){j.defectReceipt=(await api('/api/v1/tasks/commands/create',j.defect)).data;await save();}
 const decision=(await api(`/api/v1/projects/${projectId}/decisions/${j.decisionReceipt.id}`)).data;
 const task=(await api(`/api/v1/tasks/${j.defectReceipt.id}`)).data;
 if(decision.status!=='implemented'||decision.revisions.length!==2||task.mode!=='observe'||task.executionRequest)throw Error('ACCEPTANCE_RECORD_READBACK_MISMATCH');
 return {at:new Date().toISOString(),projectId,decision:{id:decision.id,revision:decision.revision,status:decision.status,hash:decision.hash,changeOf:decision.changeOf,historyVersions:decision.revisions.length},defect:{id:task.id,title:task.title,status:task.status,mode:task.mode,sourceFingerprint:report.sourceFingerprint,fixDispatched:false},mainBaselineTaskId:report.taskId,mainBaselineRunId:report.runId,acceptedObjectives:profile.verifiedObjectiveIds.length,totalObjectives:74,modelsInvoked:false,oldPlanChanged:false,costPolicy:'record-only',productAccepted:false};
});
await writeFile(`${dir}/decisions-and-defect-live.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
