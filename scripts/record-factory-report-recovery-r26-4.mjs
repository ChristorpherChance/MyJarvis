/** Record the evidence-based validator repair and optional actual rerun, without rewriting history. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const action=process.argv[2]??'select';
if(!['select','implemented'].includes(action))throw Error('REPORT_RECOVERY_ACTION_INVALID');
const project='70ec346f-6520-46ed-abed-22cac770a3e4',dir='artifacts/software-factory/acceptance-r26';
const journal='.jarvis-dev/maintenance/factory-report-recovery-r26-4.json';
let j;try{j=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=journal+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,journal);}
const references=[
 dir+'/main-terminal-1791734401170.json',
 dir+'/main-independent-cleanup-1791734821072-ce1c275f-4dc1-49f1-b45e-9318b0f59247.json',
 dir+'/main-baseline-restore-current-main-full-1791735014955.json',
 'scripts/factory-main-acceptance-wrapper-r26-4.py',
 'scripts/run-factory-main-acceptance-r26-4.mjs'
];
const refs=await Promise.all(references.map(async reference=>({reference,kind:'observation',sha256:createHash('sha256').update(await readFile(reference)).digest('hex')})));
const result=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${project}/autonomy`)).data;
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),before=hash(profile);
 if(profile.goalSpecHash!=='23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'||profile.config.costPolicy!=='record-only')throw Error('REPORT_RECOVERY_GOAL_CHANGED');
 const objectives=profile.spec.objectives.map(o=>o.id);
 const option=(id,title,advantages,disadvantages,impact)=>({id,title,advantages,disadvantages,impact,compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,origin:'ai',status:'selected',questionSummary:'首轮完整测试结束但验收程序未生成终态报告，如何继续取得可信失败基线并安排修复？',
 context:{observedAt:new Date().toISOString(),goalSpecHash:profile.goalSpecHash,sourceFingerprint:'151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',sourceVersion:'main 89e6af3，593个公开文件',runId:'e5ca06dfe49f0e3692b90b0fa9f0120ebc58e849',taskId:'98ee355a-6912-46c1-b551-df4ba7ac6030',machineId:profile.config.machineId,objectives,
 constraints:['用户授权以测试验收为主开始执行','费用及Token只记录，无消费限制','旧失败和缺失报告历史保留，不能回填成成功','原六份固定工具及45文件、30原型、90/80覆盖门槛不变','测试生成公开候选文件的源码一致性失败仍保留，后续在独立副本修复'],
 situation:'首轮签名failed，332测试326通过6失败，30原型20通过10失败，打包检查通过。固定coordinator诊断扫描误将applicable-tests.json数组视为Vitest对象，导致最终报告缺失。源码一致性检测也发现测试在副本生成候选文件，安装与启动未执行。独立资源回收核对通过，原main不变，原执行模板已恢复。'},
 options:[option('report-first','先修验收报告生成，再复验取得完整失败报告',['恢复实际结果与未知项目的完整汇总','不改产品源码，不降低验收门槛','新版本入口与旧记录可分别追溯'],['需重复完整固定测试，耗时较长'],'增加R26-4固定入口，仅修诊断扫描并复验；结果仍可能失败，再安排产品修复。'),
 option('product-first','先依现有部分失败信息修复产品，再补完整报告',['可先处理已定位的问题'],['目前缺乏完整终态汇总，后续复验难以确认全部变化','验收程序仍会重复中断，需要另行修复'],'保留部分证据，但产品修复与验收程序缺陷交织；本轮不优先采用。')],
 chosenId:'report-first',decisionRationale:'先让验收程序完整记录真实失败及未执行事项，再以同一来源的可信报告安排定点修复。只改变新版入口中经过原SHA校验的诊断扫描，不改旧工具、不忽略测试污染。',basisRefs:refs,risk:'medium',affectedObjectives:objectives,
 rollbackPlan:{plan:'若新版入口或测试证据异常，等待本次签名终结并核对资源清理后恢复原执行器，保留新旧报告和主线原源码，后续另立修订。',triggers:['固定工具、来源指纹或报告绑定不一致','新版报告生成仍异常','资源清理未确认'],impact:'仅停止或调整本轮后续安排，不回退业务数据，不抹去历史。',requiresNewExecutionPlan:true},
 actions:[{summary:'准备独立R26-4入口和固定报告扫描回归；下一步取得实际复验回执。',at:new Date().toISOString(),state:'planned',evidenceRefs:refs}]};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${project}/decisions`,j.intent)).data;await save();}
 if(action==='implemented'&&!j.implemented){
  const batch=JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-acceptance-r26-4-current-main-full.json','utf8'));
  if(!batch.started||!batch.taskId||!batch.runId||batch.sourceObservation.sourceFingerprint!==j.intent.context.sourceFingerprint)throw Error('REPORT_RECOVERY_RERUN_NOT_STARTED');
  j.implementation??={commandId:randomUUID(),expectedVersion:j.receipt.revision,origin:'ai',reason:'新版固定入口已安装并通过贾维斯实际下发复验；完整结果仍待运行。',actions:[{summary:`R26-4实际下发任务 ${batch.taskId}、执行 ${batch.runId}，保留首轮失败及源码一致性门，未验收产品。`,at:new Date().toISOString(),state:'performed',evidenceRefs:refs}]};await save();
  j.implemented=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}/implementation`,j.implementation)).data;await save();
 }
 const d=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}`)).data;
 if(hash((await api(`/api/v1/projects/${project}/autonomy`)).data)!==before)throw Error('REPORT_RECOVERY_OLD_PROFILE_CHANGED');
 return {at:new Date().toISOString(),decisionId:d.id,revision:d.revision,status:d.status,chosenId:d.chosenId,hash:d.hash,oldProfileUnchanged:true,independentAcceptance:d.independentAcceptance,productAccepted:false};
});await mkdir(dir,{recursive:true});const output=dir+'/report-recovery-choice-'+action+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
