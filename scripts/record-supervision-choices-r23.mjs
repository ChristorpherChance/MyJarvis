/** Keep user simplicity and the still-pending long-task plan as separate real decisions. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',release='20261011-supervision-simple-r23-1';
const dir='artifacts/software-factory/autonomy-r22';
const diagnostic=JSON.parse(await readFile(`${dir}/fa01-timeout-diagnosis-and-continuation-r22-7.json`,'utf8'));
const live=JSON.parse(await readFile(`${dir}/simple-supervision-live-r23-1.json`,'utf8'));
if(live.release!==release||!live.profileUnchanged||live.remoteRecoveryPerformed||diagnostic.actions.remoteMutations)throw Error('DECISION_EVIDENCE_MISMATCH');
const ref=async(reference,kind)=>({reference,kind,sha256:createHash('sha256').update(await readFile(reference)).digest('hex')});
const diagnosticRef=await ref(`${dir}/fa01-timeout-diagnosis-and-continuation-r22-7.json`,'observation');
const implementationRefs=await Promise.all([ref(`${dir}/simple-supervision-live-r23-1.json`,'test-report'),ref(`${dir}/simple-supervision-verification-r23-1.json`,'test-report'),ref(`artifacts/managed-servers/${release}-activation.json`,'observation')]);
const objectives=['MSF-OBJ-053','MSF-OBJ-058','MSF-OBJ-074'];
const option=(id,title,advantages,disadvantages,impact,compliesWithGoals)=>({id,title,advantages,disadvantages,impact,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
const context={observedAt:diagnostic.at,goalSpecHash:live.goalSpecHash,sourceFingerprint:null,sourceVersion:'R22-7实际超时产物诊断，R23状态与操作改进；未完成当前源码固定验收',runId:live.runId,taskId:live.taskId,machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',objectives,constraints:['监管严格，管理者使用简便','用户已授权持续开发，费用只记录不限额','旧任务、产物、停因、尝试保护和未知用量必须保留','状态切换不能伪装成真实续做或产品验收'],situation:'FA01累计一次心跳中止和两轮1200秒超时后达到3次技术尝试保护。两轮超时前仍有工具执行和文件/测试产物；目前节点正常、无遗留执行与待确认回执。当前PROCESS_TIMEOUT和耗尽次数不属于已实现的HEARTBEAT_FAILED恢复入口。'};
const base={context,basisRefs:[diagnosticRef],risk:'medium',affectedObjectives:objectives,origin:'ai',expectedVersion:0,status:'selected'};
const decisions=[{
 key:'simple-controls',body:{...base,questionSummary:'怎样让监督严格、页面简便，且不以按钮切状态伪装真实恢复？',options:[option('truthful-controls','首屏讲清现状与下一步，保护不合法启动',['用户可直接了解停在哪里及原因','保留严格验证与追溯记录'],['技术恢复能力仍须继续实施'],'简化展示，详细记录折叠；普通启动拒绝耗尽或停止旧执行。','yes'),option('toggle-running','保留直接继续按钮，只把状态切到运行',['表面操作短'],['超时旧执行并不会复活','随下一次调度又阻塞，造成误导'],'仅切状态不能处理当前终止或恢复实际工作。','no')],chosenId:'truthful-controls',decisionRationale:'实际检查确认旧按钮不会完成超时恢复；先把可执行操作和状态表达做正确，展示简洁原因与下一步，保留全部独立验收标准。',rollbackPlan:{plan:'页面或启动守卫出现回归时恢复前一发布版本，并保留本次诊断和决策；恢复旧显示不能视为旧按钮已经能安全续做。',triggers:['合法首次启动或等待条件恢复受阻','页面与真实回执不一致'],impact:'回退展示与控制代码，不删除项目历史、产物或用量。',requiresNewExecutionPlan:true},actions:[]}
},{
 key:'long-task-continuation',body:{...base,questionSummary:'有实际进展的大工作包被20分钟硬截止中止后，怎样承接已有成果？',options:[option('checkpointed-batches','承接已有成果，拆小任务并提前保存交接',['减少重复整阶段与重复修改','保持中间成果、来源和严格验证'],['需要补齐细任务依赖和安全续做机制'],'先核对现存文件，建立小批任务与结构化交接；源码稳定时优先固定复验。此方案尚未执行续派。','yes'),option('increase-and-repeat','直接提高尝试上限并重跑完整工作包',['立即再次派发'],['可能再次持续扩展直到超时','没有新的收敛与交接边界'],'仅增加次数无法解决长工作包收敛问题，不作为本次选择。','no')],chosenId:'checkpointed-batches',decisionRationale:'节点与实际日志表明任务持续工作，已有成果应承接；重复全包不能解决收敛和交接问题。选择小批任务、软截止交接、分开基础设施中止与产品修复，并保留硬停止及固定独立验收。当前仅完成诊断和方案选择，未恢复超时执行。',rollbackPlan:{plan:'新任务计划实施前固定现有文件身份与产物快照；实施后若出现并发写入、上下文绑定或用量对账不符，停止新任务并保留新旧回执，按快照比对后再安排。',triggers:['新计划覆盖旧成果或出现并发写入','源码、会话、执行器或账务身份不匹配','软截止未能产生可核对交接'],impact:'暂停后续派发；已有产物和历史记录继续保留，不能清零费用或宣布验收。',requiresNewExecutionPlan:true},actions:[{summary:'核对已有产物并设计小批任务、结构化交接与固定-only复验；后续再实施安全续做。',at:live.at,state:'planned',evidenceRefs:[diagnosticRef]}]}
}];
const journalPath='.jarvis-dev/maintenance/supervision-choices-r23.json';let journal;
try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={records:Object.fromEntries(decisions.map(v=>[v.key,{body:{...v.body,commandId:randomUUID()}}]))};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};await save();
const result=await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release)throw Error('DECISION_BUILD_MISMATCH');
 for(const {key}of decisions){const entry=journal.records[key];if(!entry.receipt){entry.receipt=(await api(`/api/v1/projects/${projectId}/decisions`,entry.body)).data;await save();}}
 const ui=journal.records['simple-controls'];
 ui.implementation??={commandId:randomUUID(),expectedVersion:ui.receipt.revision,origin:'ai',reason:'按已发布版本及实际422拒绝回执记录页面与启动守卫实施；不代表软件工厂交付或超时恢复。',actions:[{summary:'R23页面与启动守卫已发布；耗尽尝试普通启动实际返回422，监督完整状态与历史保持不变；执行失败不再无条件显示成功。',at:live.at,state:'performed',evidenceRefs:implementationRefs}]};await save();
 if(!ui.implementationReceipt){ui.implementationReceipt=(await api(`/api/v1/projects/${projectId}/decisions/${ui.receipt.id}/implementation`,ui.implementation)).data;await save();}
 const receipts=[];
 for(const {key}of decisions){const entry=journal.records[key],record=(await api(`/api/v1/projects/${projectId}/decisions/${entry.receipt.id}`)).data;
  if(record.status!==(key==='simple-controls'?'implemented':'selected')||record.revisions.length!==(key==='simple-controls'?2:1))throw Error('DECISION_STATUS_READBACK_FAILED');
  receipts.push({key,id:record.id,revision:record.revision,status:record.status,chosenId:record.chosenId,hash:record.hash,historyVersions:record.revisions.length,independentAcceptance:record.independentAcceptance});}
 return {at:new Date().toISOString(),projectId,release,decisions:receipts,longTaskContinuationImplemented:false,oldRunRevived:false,modelCalls:0,productAccepted:false};
});
await writeFile(`${dir}/supervision-choices-live-r23-1.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
