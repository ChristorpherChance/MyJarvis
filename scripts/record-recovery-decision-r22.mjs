/** Append the actual technical-stop recovery choice and its separate new-generation evidence. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const dir='artifacts/software-factory/autonomy-r22',projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const recovery=JSON.parse(await readFile(`${dir}/recovery-applied.json`,'utf8'));
const observed=JSON.parse(await readFile(`${dir}/observation-new-generation.json`,'utf8'));
if(!recovery.newGeneration||recovery.oldTaskRevived||observed.status!=='running'||!observed.node.childProcesses.some(p=>p.strongModelConfirmed))throw Error('ACTUAL_NEW_GENERATION_REQUIRED');
const refs=await Promise.all(['cancellation-diagnosis-r22-5.json','recovery-applied.json','observation-new-generation.json'].map(async name=>{const reference=`${dir}/${name}`;return {reference,sha256:createHash('sha256').update(await readFile(reference)).digest('hex'),kind:'observation'};}));
const objectives=['MSF-OBJ-053','MSF-OBJ-058','MSF-OBJ-074'];
const option=(id,title,advantages,disadvantages,impact,compliesWithGoals)=>({id,title,advantages,disadvantages,impact,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'bounded',coveredObjectives:objectives,operationalImpact:1});
const body={questionSummary:'发布期技术心跳失败后，怎样继续已授权的第一阶段？',context:{observedAt:recovery.at,goalSpecHash:recovery.goalSpecHash,sourceFingerprint:recovery.sourceFingerprint,sourceVersion:'R22-7心跳有限重试与安全新代恢复',runId:recovery.oldRunId,taskId:recovery.oldTaskId,machineId:observed.stages[0].runs[0].machineId,objectives,constraints:['用户已授权持续开发，费用只记录','用户主动停止不能自动复活','旧签名回执、未知费用和既有文件必须保留'],situation:'首次任务因fetch failed观察到HEARTBEAT_FAILED并签名取消；中央没有主动停止。修复前先实际核对旧进程消失、所有节点回执已确认、中央队列空闲及现有源码指纹。已知节点存在会话检查点，但未独立验证原生session续做，选择新任务重新核验现有产物。'},options:[option('new-bounded-worker','对账后创建新任务承接现有副本',['保持冻结目标和技术边界','保留历史、未知费用和实际产物'],['新任务需要重新检查上下文','不保证原生会话连续'],'创建新task/run与第二次有界尝试，不复活旧ID。','yes'),option('revive-old-run','直接重发或复活旧执行',['表面流程较短'],['旧run已经签名终结','可能重复写入并破坏停止历史'],'复用已取消run或未经核对的会话，不符合已授权边界。','no')],chosenId:'new-bounded-worker',decisionRationale:'终止回执不能改写为成功；有真实空闲、回执及源码对账后，新任务能继续目标并保留可追溯历史。先修复心跳失败处理，再执行新代，避免同因重复中断。',basisRefs:refs,risk:'medium',affectedObjectives:objectives,rollbackPlan:{plan:'若新任务出现异常，暂停项目并确认新租约停止，保留两次执行及当前文件；重新核对差异后建立新的变更计划。需要恢复代码时按已保存版本对比，不能删除旧日志或清零费用。',triggers:['新任务出现并发写入','授权、模板或目标变化','同样心跳原因再次中断'],impact:'本项目暂时停止，已产生的产物和证据保留；原业务服务不回滚。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai',expectedVersion:0};
const path='.jarvis-dev/maintenance/recovery-decision-r22.json';let journal;try{journal=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={record:{...body,commandId:randomUUID()}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(journal,null,2)+'\n',{mode:0o600});await rename(tmp,path);};
await save();
const result=await withPlatform(async({api})=>{
 if(!journal.recordReceipt){journal.recordReceipt=(await api(`/api/v1/projects/${projectId}/decisions`,journal.record)).data;await save();}
 journal.implementation??={commandId:randomUUID(),expectedVersion:journal.recordReceipt.revision,origin:'ai',reason:'依据实际新代运行回执登记实施，不改变旧取消结果或产品验收。',actions:[{summary:'心跳修复已发布、节点更新并实际完成对账；已创建新的第二次FA01任务，指定强模型进程运行。',at:observed.at,state:'performed',evidenceRefs:refs.slice(1)}]};await save();
 if(!journal.implementationReceipt){journal.implementationReceipt=(await api(`/api/v1/projects/${projectId}/decisions/${journal.recordReceipt.id}/implementation`,journal.implementation)).data;await save();}
 const live=(await api(`/api/v1/projects/${projectId}/decisions/${journal.recordReceipt.id}`)).data;
 if(live.revisions.length!==2||live.status!=='implemented'||live.chosenId!=='new-bounded-worker')throw Error('RECOVERY_DECISION_READBACK_FAILED');
 return {at:new Date().toISOString(),projectId,id:live.id,revision:live.revision,status:live.status,hash:live.hash,previousHash:live.previousHash,oldTaskId:recovery.oldTaskId,oldRunId:recovery.oldRunId,newTaskId:observed.stages[0].taskId,newRunId:observed.stages[0].runs[0].id,actualDecisionsTotal:4,historyReadback:true,independentAcceptance:false,serverOperations:0,modelCalls:0};
});
await writeFile(`${dir}/recovery-decision-live.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
