/** Record the real scoped repair dispatch and alternatives, without changing the old autonomy profile. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
import {assertJournal,repairScope} from './run-factory-main-repair-r26.mjs';
const action=process.argv[2]??'select';
if(!['select','implemented','correct-classification'].includes(action))throw Error('NATIVE_CHOICE_ACTION_INVALID');
const batch=assertJournal(JSON.parse(await readFile(repairScope.journalPath,'utf8')));
if(!batch.started||!batch.taskId||!batch.runId)throw Error('NATIVE_CHOICE_ACTUAL_DISPATCH_REQUIRED');
const project=repairScope.projectId,dir=repairScope.artifactDirectory,path='.jarvis-dev/maintenance/factory-native-repair-choice-r26.json';
let j;try{j=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={};}
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
async function save(){await mkdir('.jarvis-dev/maintenance',{recursive:true});const q=path+'.'+randomUUID()+'.tmp';await writeFile(q,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(q,path);}
const refs=await Promise.all([batch.diagnosis.path,batch.cleanupProof.path,'scripts/run-factory-main-repair-r26.mjs',
 dir+'/main-repair-independent-source-review-20261012.json'].map(async reference=>({reference,kind:'observation',sha256:sha(await readFile(reference))})));
if(refs[0].sha256!==batch.diagnosis.sha256||refs[1].sha256!==batch.cleanupProof.sha256)throw Error('NATIVE_CHOICE_EVIDENCE_CHANGED');
const result=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${project}/autonomy`)).data,before=sha(profile);
 if(profile.goalSpecHash!==repairScope.goalSHA||profile.config.costPolicy!=='record-only')throw Error('NATIVE_CHOICE_GOAL_CHANGED');
 const objectives=profile.spec.objectives.map(o=>o.id);
 const option=(id,title,advantages,disadvantages,impact)=>({id,title,advantages,disadvantages,impact,compliesWithGoals:id==='broader-development'?'no':'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,origin:'ai',status:'selected',questionSummary:'当前main完整验收失败后，如何推进测试为主的修复并保持旧结果可追溯？',
  context:{observedAt:new Date().toISOString(),goalSpecHash:profile.goalSpecHash,sourceFingerprint:repairScope.baselineSHA,sourceVersion:'main 89e6af3，593个公开文件',runId:batch.baseline.runId,taskId:batch.baseline.taskId,machineId:repairScope.machineId,objectives,
   constraints:['测试验收为主，保留原74目标及所有失败','费用与Token只记录，不设消费上限','原main、旧候选、业务运行和固定验收工具不修改','独立副本、单轮技术边界，模型结束不等于验收通过','缺失历史资产不得伪造，安全和覆盖门禁不得降低'],
   situation:'R26-4已取得真实签名完整失败报告，原main指纹未变；独立清理核对完成并恢复原模板。已按门禁实际下发独立副本修复，后续须固定新指纹独立复验。'},
  options:[option('scoped-repair','按真实失败分类定点修复，再独立复验',['当前源码与失败报告一致','原main和旧历史保留','修复与验收分开，能识别未知与未做'],['需要再次运行固定全量测试','历史资产缺失可能仍阻塞'], '在独立副本修复隔离镜像契约、MinIO签名断言、测试生成物污染及超时定位。'),
   option('broader-development','重新启动更广泛功能开发',['可以推进其他功能缺口'],['与软件工厂当前测试为主的目标不符','同时扩大改动使失败归因和复验更难'], '扩大任务范围；保留为后续明确缺口的另行计划，本轮不采用。')],
  chosenId:'scoped-repair',decisionRationale:'先依据同版本完整失败报告处理明确问题，保留无法证明的历史资产与运行项；在独立副本修复并通过新指纹复验后才考虑主线合并和下一阶段。',basisRefs:refs,risk:'medium',affectedObjectives:objectives,
  rollbackPlan:{plan:'若模型改动超出范围或复验失败，保留副本和回执，不合并主线；终态与队列核对后恢复原模板，追加新的处理决定。',triggers:['主线或固定工具发生变化','候选来源或原生回执不一致','未通过独立复验'],impact:'保留失败及候选，仅调整后续安排，不覆盖业务数据或历史记录。',requiresNewExecutionPlan:true},
  actions:[{summary:'为已派发的单轮独立副本修复登记具体实施回执与验收边界；未作产品验收。',at:new Date().toISOString(),state:'planned',evidenceRefs:refs}]};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${project}/decisions`,j.intent)).data;await save();}
 if(action==='implemented'&&!j.implemented){
  j.implementation??={commandId:randomUUID(),expectedVersion:j.receipt.revision,origin:'ai',reason:'独立副本已建立并由贾维斯实际下发原生修复；真实改动和独立复验尚待核对。',actions:[{summary:`原生修复任务 ${batch.taskId}、执行 ${batch.runId}；模型 ${repairScope.model}，费用仅记账，未配置独立validator，执行结束不可算验收。`,at:new Date().toISOString(),state:'performed',evidenceRefs:refs}]};await save();
  j.implemented=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}/implementation`,j.implementation)).data;await save();
 }
 if(action==='correct-classification'&&!j.corrected){
  const old=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}`)).data;
  if(old.status!=='implemented'||old.chosenId!=='scoped-repair'||old.options.find(o=>o.id==='broader-development')?.compliesWithGoals!=='yes')throw Error('NATIVE_CHOICE_CORRECTION_SCOPE_CHANGED');
  const fields=['questionSummary','context','options','chosenId','decisionRationale','basisRefs','risk','affectedObjectives','rollbackPlan','actions','status','origin'];
  j.correction??={...Object.fromEntries(fields.map(k=>[k,old[k]])),commandId:randomUUID(),expectedVersion:old.revision,
   options:old.options.map(o=>o.id==='broader-development'?{...o,compliesWithGoals:'no'}:o),
   reason:'独立审阅指出广泛开发备选与当前测试优先目标不符，补记其目标合规为no；选定方案、实际派发与原证据均保持，旧记录保留。'};await save();
  j.corrected=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}/change`,j.correction)).data;await save();
 }
 const d=(await api(`/api/v1/projects/${project}/decisions/${j.corrected?.id??j.receipt.id}`)).data;
 if(sha((await api(`/api/v1/projects/${project}/autonomy`)).data)!==before)throw Error('NATIVE_CHOICE_OLD_PROFILE_CHANGED');
 return {at:new Date().toISOString(),decisionId:d.id,revision:d.revision,status:d.status,chosenId:d.chosenId,hash:d.hash,taskId:batch.taskId,runId:batch.runId,oldProfileUnchanged:true,productAccepted:false};
});
const output=dir+'/native-repair-choice-'+action+'-'+Date.now()+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
