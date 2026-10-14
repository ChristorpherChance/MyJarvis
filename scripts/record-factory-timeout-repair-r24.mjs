/** Record a proven collector installation, its alternatives, and a later factual note. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const dir='artifacts/software-factory/acceptance-r24',projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const installationPath=process.argv.find(v=>v.startsWith('--installation='))?.slice(15);
if(!installationPath||!/^artifacts\/software-factory\/acceptance-r24\/timeout-collector-install-result-[a-f0-9-]{36}-[0-9]{13}\.json$/.test(installationPath))throw Error('TIMEOUT_RECORD_INSTALLATION_REQUIRED');
const bytes=await readFile(installationPath),installed=JSON.parse(bytes);
const installedAt=new Date(installed.at).toISOString();
if(installed.installed!==true||installed.verifiedInstalled!==true||installed.reconciliationRequired===true||installed.errorCode||installed.originalSourcesUnchanged!==true||installed.oldBytesPreserved!==true||installed.serviceRestarted!==false||installed.templatePolicyChanged!==false||installed.containerCapabilitiesChanged!==false||installed.modelsInvoked!==false||installed.productAccepted!==false||!/^[-a-f0-9]{36}$/.test(installed.rootBackupId)||installed.newSHA256!=='a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7'||installed.priorSHA256!=='711b6851a3074810584625b57a7a3e5a0cbfc1e6114783451644f9ff6efe11f9')throw Error('TIMEOUT_RECORD_INSTALLATION_INVALID');
const proofPath=dir+'/timeout-linux-proof-435dafbe-77ad-4e2f-a5de-43f318f96f48.json';
const compositePath=dir+'/process-timeout-linux-composite-independent-readback-r24.json';
const referencePaths=[dir+'/candidate-second-final-independent-review.json',proofPath,dir+'/timeout-linux-proof-cleanup-readback-435dafbe-77ad-4e2f-a5de-43f318f96f48.json',compositePath,installationPath];
const refs=await Promise.all(referencePaths.map(async reference=>({reference,kind:'test-report',sha256:createHash('sha256').update(await readFile(reference)).digest('hex')})));
const proof=JSON.parse(await readFile(proofPath,'utf8'));
if(proof.id!==installed.proofId||proof.passed!==false||proof.proof?.passed!==true||proof.proof?.checks.length!==5||proof.proof?.simulated!==false||proof.proof?.productExecuted||proof.proof?.modelInvoked)throw Error('TIMEOUT_RECORD_ACTUAL_PROOF_INVALID');
const journalPath='.jarvis-dev/maintenance/factory-timeout-record-'+installed.rootBackupId+'.json';let j;
try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={installationSHA256:refs.at(-1).sha256,notesIntents:{},notesReceipts:{}};}
if(j.installationSHA256!==refs.at(-1).sha256)throw Error('TIMEOUT_RECORD_JOURNAL_CHANGED');
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};
// The API parses ISO-Z dates before persistence. Preserve the rejected offset-date intent.
if(j.intent&&j.intent.context.observedAt!==installedAt){
 if(j.receipt||j.implemented||j.implementation||j.intent.context.observedAt!==installed.at||j.rejectedDateIntent)throw Error('TIMEOUT_RECORD_DATE_RECONCILIATION_REQUIRED');
 const correction={at:new Date().toISOString(),errorCode:'API_400_INVALID_INPUT',cause:'ISO-Z decision timestamp required; original Python offset timestamp preserved in installation evidence',priorCommandId:j.intent.commandId,originalObservedAt:j.intent.context.observedAt,normalizedObservedAt:installedAt,installationPath,remoteDecisionPersisted:false,modelsInvoked:false};
 await writeFile(dir+'/timeout-record-date-correction-'+installed.rootBackupId+'.json',JSON.stringify(correction,null,2)+'\n',{flag:'wx'});
 j.rejectedDateIntent=j.intent;j.intent={...j.intent,commandId:randomUUID(),context:{...j.intent.context,observedAt:installedAt}};await save();
}
const result=await withPlatform(async({api})=>{
 const profile=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(profile.revision!==20||profile.spec.objectives.length!==74||profile.verifiedObjectiveIds.length||profile.config.costPolicy!=='record-only'||profile.config.maxUSD!==null||profile.config.maxTokens!==null||profile.config.perTaskUSD!==null)throw Error('TIMEOUT_RECORD_SCOPE_CHANGED');
 const objectives=profile.spec.workPackages.find(v=>v.id==='FA-01').objectiveIds;
 const option=(id,title,advantages,disadvantages,impact,compliesWithGoals)=>({id,title,advantages,disadvantages,impact,compliesWithGoals,withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'reversible',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,changeOf:null,questionSummary:'固定验收单项超过技术时限仍不停，怎样可靠退出并保存真实失败？',context:{observedAt:installedAt,goalSpecHash:profile.goalSpecHash,sourceFingerprint:installed.sourceFingerprintsBefore[profile.config.workspace],sourceVersion:'R22候选独立源；main结果独立保存',runId:'67182e98ed3a2801d9506fbd97da2be938833d4a',taskId:'8120b229-471d-4f43-b009-aa742756dc50',machineId:profile.config.machineId,objectives,constraints:['保持无CAP_KILL、无通用DAC能力及原容器权限','原main及候选源码不改，旧cancelled/晚到签名不复活','费用只记录不限额，未知用量保留','仅升级固定collector，保留旧字节、模板、服务和历史'],situation:'selftest在原120秒界限后仍跑到721秒，UID0 collector跨UID数值PID信号无权限。原批次已精确停止并全清理。新的UID1000可信同进程组监督经实际Linux5项证明；原聚合报告因Docker不存在文本误判仍为false，后续两次精确现场只读确认容器不存在，分别保留。'},options:[option('bound-ipc','绑定通道与同UID进程组监督',['仅向所创建可信监督器发送固定停止请求','真实命令没有IPC控制通道，失败记录先保存','不扩权且旧collector可按SHA恢复'],['需要维护固定监督代码','脱离原进程组的异常仍依赖外层精确容器清理'],'停止由可信UID1000监督器限定自身进程组；5秒不能确认则保存失败并终止collector，由外层处理该attempt资源。','yes'),option('add-kill-capability','为容器增加CAP_KILL',['可发送跨UID停止信号'],['增加通用进程控制能力','数值PID重用等问题仍须处理'],'扩大容器能力，不是修复本次固定检查所需。','no')],chosenId:'bound-ipc',decisionRationale:'先按原技术边界精确停止旧批次，再用无网络、固定可信镜像做真实UID及失联测试。选最小权限的绑定监督；实际失败、原聚合误判和独立清理补证均不覆盖。空闲时CAS替换单collector，备份并确认原源码指纹不变，产品达标另行验证。',basisRefs:refs,risk:'low',affectedObjectives:objectives,rollbackPlan:{plan:`中央及101节点均空闲时，从root私有备份${installed.rootBackupId}恢复旧collector ${installed.priorSHA256}；只在当前SHA仍是${installed.newSHA256}时CAS恢复，不覆盖后来版本。`,triggers:['固定停止或失败落账出现回归','可信控制通道或进程组边界被突破','原源、模板或服务出现非预期改变'],impact:'仅恢复验收collector；保留所有历史证据。恢复旧版会重新引入超时不足，需暂停受影响批次并另行修复。',requiresNewExecutionPlan:true},actions:[],status:'selected',origin:'ai'};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${projectId}/decisions`,j.intent)).data;await save();}
 j.implementation??={commandId:randomUUID(),expectedVersion:j.receipt.revision,origin:'ai',reason:'实际Linux5项通过、精确容器清理独立补证后，已完成单collector版本化CAS安装及前后核对；产品目标仍0/74。',actions:[{summary:`单collector已安装，旧字节保存在root备份${installed.rootBackupId}；源码前后相同，服务、模板、容器能力未改。`,at:installedAt,state:'performed',evidenceRefs:refs},{summary:'对已证实main构建及候选缺口逐项定点修复、独立复验，再推进74目标。未重跑本次cancelled批次。',at:new Date().toISOString(),state:'planned',evidenceRefs:refs}]};await save();
 if(!j.implemented){j.implemented=(await api(`/api/v1/projects/${projectId}/decisions/${j.receipt.id}/implementation`,j.implementation)).data;await save();}
 const decision=(await api(`/api/v1/projects/${projectId}/decisions/${j.receipt.id}`)).data;
 if(decision.status!=='implemented'||decision.revisions.length!==2)throw Error('TIMEOUT_RECORD_DECISION_UNCONFIRMED');
 const marker='[R24 单项超时修复实测与安装 '+installed.rootBackupId+']';
 const entry=[marker,`实际Linux5项通过，原聚合报告false保留；原错误来自清理确认文本过严，后续精确现场只读核验容器不存在。独审补证和版本化安装分别留档。collector现为${installed.newSHA256}，旧版${installed.priorSHA256}保存在root备份${installed.rootBackupId}，原main/候选源码指纹前后不变，未重启服务或调整模板/容器能力。`, `平台决策${decision.id}保存问题、真实备选、依据、已实施动作及CAS回退条件。此安装操作只证明验收工具修复，未调用模型、未重跑产品或复活旧cancelled任务，74目标仍0通过；费用只记录不限额。`, `安装时main源已是${installed.sourceFingerprintsBefore['/home/superopen/All-Projects/msf']}，与19:40窄基线46abd636…不同，但安装前后相同；旧版两处TS2345保持历史绑定，新版需另做固定检查再判断。候选6单元失败及测试/原型入口缺口分别处理，合格后再做阶段关联、从零客户案例和同版24/72小时。`].join('\n');
 for(const id of [projectId,'25dcc5cf-bdfe-43f8-bbff-e79e7190161f']){
  if(j.notesReceipts[id])continue;
  const old=(await api('/api/v1/projects/'+id)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('TIMEOUT_RECORD_NOTES_OWNER_CHANGED');
  if(!j.notesIntents[id]){const notes=old.environmentInfo?.notes??'';if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('TIMEOUT_RECORD_NOTES_RECONCILE_REQUIRED');j.notesIntents[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();}
  const value=(await api('/api/v1/projects/commands/environment-info',j.notesIntents[id])).data;
  if(!value.environmentInfo.notes.includes(marker))throw Error('TIMEOUT_RECORD_NOTES_UNCONFIRMED');j.notesReceipts[id]={id:value.id,revision:value.revision};await save();
 }
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(after.revision!==profile.revision||after.goalSpecHash!==profile.goalSpecHash||after.verifiedObjectiveIds.length)throw Error('TIMEOUT_RECORD_POST_SCOPE_CHANGED');
 return {at:new Date().toISOString(),projectId,decision:{id:decision.id,revision:decision.revision,status:decision.status,historyVersions:decision.revisions.length,hash:decision.hash},projects:Object.values(j.notesReceipts),installationPath,rootBackupId:installed.rootBackupId,oldNotesPreserved:true,profileRevision:after.revision,objectivesAccepted:0,totalObjectives:74,modelsInvoked:false,productAccepted:false};
});
const output=dir+'/timeout-repair-decision-and-notes-live.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
