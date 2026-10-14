/** Read-only deployed acceptance UI/API/source binding verification. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPlatform,primary,python} from './managed-server-client.mjs';
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',release='20261011-factory-acceptance-r24-1';
const dir='artifacts/software-factory/acceptance-r24';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const main=JSON.parse(await readFile(dir+'/main-baseline-independent-review.json','utf8'));
const oldFiles=JSON.parse(await readFile('artifacts/software-factory/autonomy-r22/public-guide-files.json','utf8')).files;
const planFile='docs/软件工厂现有成果验收与修复计划.html';
const planSHA=hash(await readFile(planFile));
const sourceChecks=JSON.parse(primary(python({release,oldFiles,planFile,planSHA},String.raw`from pathlib import Path
import hashlib,json
root=Path('/opt/jarvis/current').resolve()
if root.name!=p['release']:raise RuntimeError('ACCEPTANCE_RELEASE_LINK_MISMATCH')
checks=[]
for f in p['oldFiles']:
 actual=hashlib.sha256((root/f['path']).read_bytes()).hexdigest()
 expected=f.get('sha256') or f.get('sha256Before')
 if not expected or actual!=expected:raise RuntimeError('ACCEPTANCE_FROZEN_GUIDE_CHANGED:'+f['path'])
 checks.append({'path':f['path'],'sha256':actual})
if hashlib.sha256((root/p['planFile']).read_bytes()).hexdigest()!=p['planSHA']:raise RuntimeError('ACCEPTANCE_NEW_PLAN_MISMATCH')
print(json.dumps({'release':root.name,'frozenFilesVerified':len(checks),'newPlanSHA256':p['planSHA']}))
`)));
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!==release)throw Error('ACCEPTANCE_WRONG_LIVE_BUILD');
 const profile=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(profile.revision!==20||profile.status!=='blocked'||profile.reason!=='REPAIR_ATTEMPTS_EXHAUSTED'||profile.spec.objectives.length!==74||profile.verifiedObjectiveIds.length!==0||profile.config.costPolicy!=='record-only'||profile.config.maxUSD!==null||profile.config.maxTokens!==null||profile.config.perTaskUSD!==null)throw Error('ACCEPTANCE_OLD_PROFILE_OR_COST_CHANGED');
 const baselines=(await api(`/api/v1/projects/${projectId}/autonomy/baselines`)).data;
 const m=baselines.currentMainBaseline;
 if(!m||m.taskId!==main.taskId||m.runId!==main.runId||m.runStatus!=='failed'||m.sourceRole!=='current-main'||m.workspace!==main.report.source||m.validationExitCode!==1||m.sourceFingerprint!==null&&m.sourceFingerprint!==main.sourceFingerprint)throw Error('ACCEPTANCE_MAIN_SOURCE_READBACK_MISMATCH');
 const plan=await api('/api/v1/project-autonomy/acceptance-plan',undefined,'GET',{binary:true});
 if(!plan.toString('utf8').includes('18:08')||!plan.toString('utf8').includes(main.runId))throw Error('ACCEPTANCE_PLAN_CURRENT_RESULT_MISSING');
 const machinePlan=await api('/api/v1/project-autonomy/acceptance-plan?reference='+encodeURIComponent(dir+'/acceptance-first-plan.json'));
 const forbidden=[];for(const resource of ['.secrets/cc-gateway-api-key.txt','artifacts/software-factory/acceptance-r24/baseline-request-schema.json']){
  try{await api('/api/v1/project-autonomy/acceptance-plan?reference='+encodeURIComponent(resource));throw Error('ACCEPTANCE_GUIDE_SCOPE_ESCAPED');}catch(e){if(!/^API_(400|403) /.test(e.message))throw e;forbidden.push({resource,status:parseInt(e.message.slice(4,7))});}
 }
 const supervision=(await api('/api/v1/execution/supervision')).data;if(supervision.supervised!==false)throw Error('ACCEPTANCE_GLOBAL_SUPERVISION_CHANGED');
 return {at:new Date().toISOString(),release,projectId,profile:{revision:profile.revision,status:profile.status,reason:profile.reason,objectives:profile.spec.objectives.length,independentlyAccepted:0,knownCostUSD:profile.budget.spentUSD,unknownCostCount:profile.budget.unknownCostCount,goalSpecHash:profile.goalSpecHash},currentMainBaseline:m,baselineCount:baselines.total,latestBaseline:baselines.latest??null,plan:{readerLive:true,sourceSHA256:planSHA,mainFailurePresent:true,machinePlanRead:true},sourceChecks,forbiddenReferences:forbidden,globalSupervision:false,modelCalls:0,productAccepted:false,browserVisualAcceptance:false};
});
await writeFile(`${dir}/acceptance-live-readback-${Date.now()}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
