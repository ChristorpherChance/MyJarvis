/** Record the implemented UI choice and append a concise project note after live checks. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const dir='artifacts/software-factory/report-r25/r2',release='20261011-project-report-r25-2',project='70ec346f-6520-46ed-abed-22cac770a3e4';
const live=JSON.parse(await readFile(dir+'/live.json','utf8')),browser=JSON.parse(await readFile(dir+'/browser.json','utf8'));
if(live.build!==release||browser.release!==release||browser.pageErrors.length||!live.main.receiptVerified||live.accepted!==0)throw Error('REPORT_IMPLEMENTATION_EVIDENCE_INVALID');
const refs=await Promise.all([dir+'/live.json',dir+'/browser.json',dir+'/local-verification.json',dir+'/build-verification.json'].map(async reference=>({reference,kind:'test-report',sha256:createHash('sha256').update(await readFile(reference)).digest('hex')})));
const journalPath='.jarvis-dev/maintenance/project-report-r25.json';let j;
try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={notes:{},noteReceipts:{}};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const temp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(temp,journalPath);};
const result=await withPlatform(async({api})=>{
 if((await api('/api/health')).build!==release)throw Error('REPORT_LIVE_BUILD_CHANGED');
 const profile=(await api(`/api/v1/projects/${project}/autonomy`)).data;
 if(profile.revision!==live.profileRevision||profile.goalSpecHash==null||profile.verifiedObjectiveIds.length)throw Error('REPORT_GOALS_CHANGED');
 const objectives=['MSF-OBJ-053','MSF-OBJ-058','MSF-OBJ-074'];
 const option=(id,title,advantages,disadvantages,impact)=>({id,title,advantages,disadvantages,impact,compliesWithGoals:'yes',withinAuthority:'yes',environmentEvidence:'available',missingEvidence:[],reversibility:'reversible',coveredObjectives:objectives,operationalImpact:1});
 j.intent??={commandId:randomUUID(),expectedVersion:0,origin:'ai',status:'selected',questionSummary:'如何让管理者简洁查看计划、进度、结果，同时保留严格监督和详细追溯？',context:{observedAt:live.at,goalSpecHash:profile.goalSpecHash,sourceFingerprint:null,sourceVersion:'R25贾维斯项目汇报发布；未运行软件工厂新产品检查',runId:live.main.runId,taskId:live.main.taskId,machineId:profile.config.machineId,objectives,constraints:['监管严格、管理者操作简便','保留74目标、历史任务、真实失败和未知费用','不根据基础执行推算产品完成率','费用只记录不限额'],situation:'原任务页以任务管理为主，验收计划和最新结果分散；旧R22开发blocked容易被误解为最新main验收状态。最新main限定执行成功、完整目标0/74、当前没有活动运行。'},options:[option('summary-details','首屏四块汇报，详情逐级展开',['现有项目链接直接看到计划进度结果与下一步','同源接口，保留历史及所有管理功能'],['高级管理需展开一次'],'改现有入口，不额外维护平行看板。'),option('separate-report','另建独立报告页面',['可独立排版和分享简报'],['现有任务入口仍复杂','需要跨页查看任务及记录'],'增加单独页面与跳转，再同步原页面显示。')],chosenId:'summary-details',decisionRationale:'用户已授权简化原设计；在同一入口显示关键事实，可减少操作与状态重复。成功依赖真实签名限定回执，未知数量与费用不写零；活动任务和最近结果分开导航，完整报告与原管理保留。',basisRefs:refs,risk:'low',affectedObjectives:objectives,rollbackPlan:{plan:'若汇报状态、入口或主题发生回归，恢复112及101此前版本20261011-factory-acceptance-r24-1；保留新旧决策、报告、用量和建设记录。',triggers:['当前事实与签名回执不一致','既有任务或项目管理无法访问','主题或手机布局不可用'],impact:'回退贾维斯展示与只读回执字段；不删除软件工厂结果、不复活旧任务。',requiresNewExecutionPlan:true},actions:[]};await save();
 if(!j.receipt){j.receipt=(await api(`/api/v1/projects/${project}/decisions`,j.intent)).data;await save();}
 j.implementation??={commandId:randomUUID(),expectedVersion:j.receipt.revision,origin:'ai',reason:'首屏简报与详细入口已发布，真实API与浏览器核验完成；不代表软件工厂交付。',actions:[{summary:'发布R25，十主题、电脑/手机布局、实际结果跳转与任务详情展开已检查，原目标/profile和未知费用保留。',at:browser.at,state:'performed',evidenceRefs:refs}]};await save();
 if(!j.implemented){j.implemented=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}/implementation`,j.implementation)).data;await save();}
 const decision=(await api(`/api/v1/projects/${project}/decisions/${j.receipt.id}`)).data;if(decision.status!=='implemented'||decision.revisions.length!==2)throw Error('REPORT_DECISION_UNCONFIRMED');
 const marker='[R25 简洁项目汇报 '+release+']';
 const entry=marker+'\n首屏统一验收计划、当前进度、最新结果及下一步；任务管理、来源证据、费用与旧监督均保留展开。主线只按真实签名限定回执显示成功，完整目标仍0/74，无活动运行；15/15详情看已有独立报告，旧失败保持原来源。十主题及电脑/手机实际浏览器检查完成。费用只记录不限额，未知费用保留。决策'+decision.id+'记录两种布局备选、实施证据及前版回退条件。';
 for(const id of [project,'25dcc5cf-bdfe-43f8-bbff-e79e7190161f']){
  if(j.noteReceipts[id])continue;const old=(await api('/api/v1/projects/'+id)).data;
  if(old.ownerId!=='server-admin'||old.scope!=='personal'||old.status==='archived')throw Error('REPORT_NOTES_SCOPE_CHANGED');
  if(!j.notes[id]){const notes=old.environmentInfo?.notes??'';if(notes.includes(marker)||notes.length+entry.length+2>20000)throw Error('REPORT_NOTES_RECONCILE_REQUIRED');j.notes[id]={commandId:randomUUID(),scope:'personal',expectedVersion:old.revision,payload:{projectId:id,environmentInfo:{...old.environmentInfo,notes:notes+'\n\n'+entry}}};await save();}
  const updated=(await api('/api/v1/projects/commands/environment-info',j.notes[id])).data;if(!updated.environmentInfo.notes.includes(marker))throw Error('REPORT_NOTES_UNCONFIRMED');j.noteReceipts[id]={id:updated.id,revision:updated.revision};await save();
 }
 const after=(await api(`/api/v1/projects/${project}/autonomy`)).data;if(after.revision!==profile.revision||after.goalSpecHash!==profile.goalSpecHash||after.verifiedObjectiveIds.length)throw Error('REPORT_POST_GOALS_CHANGED');
 return {at:new Date().toISOString(),release,decision:{id:decision.id,revision:decision.revision,status:decision.status,chosenId:decision.chosenId,hash:decision.hash,independentAcceptance:decision.independentAcceptance},projects:Object.values(j.noteReceipts),profileRevision:after.revision,oldNotesPreserved:true,modelsInvoked:false,productAccepted:false};
});
await writeFile(dir+'/decision-and-notes.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
