import assert from 'node:assert/strict';
import test from 'node:test';
import {projectReportView,projectReportPlan,projectReportFixedSummary,developmentSteps,acceptanceSteps,type ProjectReportResult,type ProjectReportFixedReport} from './project-report-view.ts';
import type {BaselineSnapshot,MainBaselineView,BaselineView} from './project-baseline-view.ts';
const main:MainBaselineView={taskId:'main-task',runId:'main-run',taskStatus:'validating',runStatus:'succeeded',status:'observed',sourceRole:'current-main',workspace:'/main',usage:{knownCostUSD:0,tokens:0,unknownCostCount:1},validationExitCode:0,summary:'limited execution',receiptVerified:true,observedAt:'2026-10-11T12:16:00.000Z'};
const candidate:BaselineView={id:'old',projectId:'project',status:'stopped',runStatus:'cancelled',taskStatus:'paused',reportStatus:'fail',summary:'old failure',taskId:'old-task',projectBudget:{spentUSD:0.04,usedTokens:7000,unknownCostCount:8,activeRuns:[]},revision:1,profileRevision:20,workPackage:'FA-01',objectiveIds:['OBJ-001'],totalObjectiveCount:74,goalSpecHash:'goal',sourceFingerprint:'old-source',sourceRole:'frozen-candidate',executorId:'fixed',machineId:'101',workspace:'/old',runId:'old-run',createdAt:'2026-10-11T10:00:00.000Z',reason:'comparison',reportSha256:null,checks:[],usage:{knownCostUSD:0,tokens:0,unknownCostCount:1},objectivesAccepted:false,verifiedObjectiveIds:[],currentMainBaseline:null};
const snapshot:BaselineSnapshot={projectId:'project',main,latest:candidate,total:1};
test('新主线成功与旧候选停止分开，完整目标没有凭空完成',()=>{const report=projectReportView(snapshot,{mode:'acceptance',required:74,verifiedIds:[]});assert.equal(report.mainPassed,true);assert.equal(report.active,false);assert.equal(report.taskId,'main-task');assert.equal(report.accepted,0);assert.equal(report.complete,false);assert.match(report.title,/继续完整验收/);assert.match(report.execution,/没有检查在执行/);});
test('仅签名回执且执行和验证成功才显示限定执行成功',()=>{for(const changed of [{receiptVerified:undefined},{receiptVerified:false},{runStatus:'failed'},{taskStatus:'paused'},{validationExitCode:null}])assert.equal(projectReportView({...snapshot,main:{...main,...changed}}).mainPassed,false);});
test('旧成功报告不掩盖新的排队或运行状态',()=>{for(const status of ['running','queued']){const report=projectReportView({...snapshot,main:{...main,status,runStatus:status}});assert.equal(report.mainPassed,false);assert.equal(report.active,true);assert.equal(report.activeTaskId,'main-task');assert.match(report.title,/在执行/);}});
test('项目其他活动检查优先显示执行中，保持主线结果且不冒指旧任务',()=>{const report=projectReportView({...snapshot,latest:{...candidate,projectBudget:{...candidate.projectBudget,activeRuns:['another-run']}}});assert.equal(report.active,true);assert.equal(report.mainPassed,true);assert.equal(report.activeTaskId,undefined);assert.match(report.title,/在执行/);});
test('候选活动与最近主线结果分开导航，避免进入已结束任务',()=>{const report=projectReportView({...snapshot,latest:{...candidate,status:'running',runStatus:'running',taskStatus:'running'}});assert.equal(report.activeTaskId,'old-task');assert.equal(report.taskId,'main-task');assert.match(report.execution,/候选/);});
test('读取失败时不继续宣称当前成功，保留上次状态说明',()=>{const report=projectReportView(snapshot,{stale:true,required:74});assert.equal(report.mainPassed,false);assert.equal(report.mainFailed,false);assert.equal(report.title,'状态暂不可读');assert.match(report.result,/上次读取/);assert.match(report.next,/刷新/);});
test('失败与未报告退出码区分，不把未知判为成功',()=>{const fail=projectReportView({...snapshot,main:{...main,validationExitCode:2}});assert.equal(fail.mainFailed,true);assert.match(fail.next,/分类/);assert.equal(projectReportView({...snapshot,main:{...main,validationExitCode:null}}).mainFailed,false);});
test('已停止优先于失败，不把人工暂停引导为自动修复',()=>{const report=projectReportView({...snapshot,main:{...main,status:'stopped',taskStatus:'paused',runStatus:'failed',validationExitCode:2}});assert.equal(report.mainFailed,false);assert.match(report.title,/停止/);assert.match(report.next,/停止原因/);});
test('无运行时不生成任务或执行状态，验收完成来自目标身份去重',()=>{const blank={projectId:'project',main:null,latest:null,total:0};assert.equal(projectReportView(blank).taskId,undefined);assert.equal(projectReportView(blank).active,false);assert.equal(projectReportView(blank,{required:2,verifiedIds:['one','one']}).accepted,1);assert.equal(projectReportView(blank,{required:2,verifiedIds:['one','two']}).complete,true);});
test('缺少目标验收记录显示未知，不能冒写为零',()=>{const report=projectReportView(snapshot,{required:74,verifiedIds:null});assert.equal(report.accepted,null);assert.equal(report.complete,false);});
test('通用项目默认持续开发，未报告不能套用软件工厂目标或报告',()=>{
 const blank={projectId:'other-project',main:null,latest:null,total:0},report=projectReportView(blank);
 assert.equal(report.mode,'development');assert.equal(report.required,0);assert.equal(report.accepted,null);assert.equal(report.complete,false);assert.equal(report.active,false);assert.equal(report.result,'独立验证结果待报告');assert.match(report.next,/项目目标与依赖/);assert.equal(report.plan.steps,developmentSteps);assert.equal(report.plan.title,'开发计划');assert.equal(report.plan.href,undefined);assert.equal(report.plan.reportHref,undefined);
});
test('验收模式与工厂身份都显式提供后才显示工厂文档，通用验收有自己的默认计划',()=>{
 const common=projectReportPlan('acceptance');assert.equal(common.steps,acceptanceSteps);assert.equal(common.href,undefined);assert.equal(common.reportHref,undefined);
 const factory=projectReportPlan('acceptance',{},true);assert.equal(factory.href,'/api/v1/project-autonomy/acceptance-plan');assert.match(factory.reportHref!,/reference=/);
 const development=projectReportPlan('development',{},true);assert.equal(development.steps,developmentSteps);assert.equal(development.href,undefined);assert.equal(development.reportHref,undefined);
});
test('项目自定计划和链接按显式输入呈现，不套用工厂流程',()=>{
 const steps=[{title:'接口开发',detail:'按当前API契约'},{title:'现场运行',detail:'测试部署与验收'}],plan=projectReportPlan('development',{title:'当前迭代',intro:'按当前目标执行',steps,href:'/api/v1/project-plans/own',reportHref:'/api/v1/project-reports/own'});
 assert.equal(plan.steps,steps);assert.equal(plan.title,'当前迭代');assert.equal(plan.intro,'按当前目标执行');assert.equal(plan.href,'/api/v1/project-plans/own');assert.equal(plan.reportHref,'/api/v1/project-reports/own');assert.equal(projectReportPlan('development',{steps:[]}).steps,developmentSteps);
});
test('通用项目实际活动任务可显示并跳转，模型完成或阶段worker不制造验收结果',()=>{
 const blank={projectId:'other-project',main:null,latest:null,total:0},active=projectReportView(blank,{work:{status:'running',active:true,stageTitle:'接口开发',taskId:'own-task'},required:3,verifiedIds:[]});
 assert.equal(active.active,true);assert.equal(active.activeTaskId,'own-task');assert.equal(active.taskId,undefined);assert.match(active.execution,/接口开发/);assert.equal(active.accepted,0);assert.equal(active.complete,false);assert.equal(active.result,'独立验证结果待报告');
 for(const status of ['worker','completed']){const waiting=projectReportView(blank,{work:{status,taskId:'own-task'},required:3,verifiedIds:null});assert.equal(waiting.active,false);assert.equal(waiting.complete,false);assert.equal(waiting.result,'独立验证结果待报告');}
});
test('通用项目暂停和阻塞需先处理，不能被旧检查成功掩盖或自动启动',()=>{
 const paused=projectReportView(snapshot,{work:{status:'paused',active:false}});assert.equal(paused.mainPassed,true);assert.match(paused.title,/暂停/);assert.match(paused.next,/暂停或停止原因/);assert.equal(paused.activeTaskId,undefined);
 const blocked=projectReportView(snapshot,{work:{status:'blocked',active:false}});assert.match(blocked.title,/阻塞/);assert.match(blocked.next,/核对阻塞原因/);assert.equal(blocked.active,false);
});
test('任意项目的独立目标数量来自实际配置和身份，过期或不完整不报完成',()=>{
 const blank={projectId:'other-project',main:null,latest:null,total:0};assert.equal(projectReportView(blank,{required:3,verifiedIds:['a','b','c']}).complete,true);assert.equal(projectReportView(blank,{required:3,verifiedIds:['a','a','b']}).complete,false);assert.equal(projectReportView(blank,{required:3,verifiedIds:['a','b','c'],stale:true}).complete,false);assert.equal(projectReportView(blank,{required:-1,verifiedIds:[]}).required,0);assert.equal(projectReportView(blank,{required:2.5,verifiedIds:[]}).required,0);
});
test('新计划执行失败优先于旧基础检查成功，结果导航不回到旧任务',()=>{
 const report=projectReportView(snapshot,{mode:'acceptance',work:{status:'failed',result:{taskId:'full-test',status:'failed',outcome:'failed',signed:true,exitCode:1,validationExitCode:1,summary:'实际失败项待分类'},nextAction:'核对测试失败项并定点修复。'},required:74,verifiedIds:[]});
 assert.equal(report.mainPassed,true);assert.equal(report.latestPassed,false);assert.equal(report.latestFailed,true);assert.match(report.title,/本轮执行未成功/);assert.match(report.result,/本轮执行未成功/);assert.equal(report.taskId,'full-test');assert.equal(report.next,'核对测试失败项并定点修复。');assert.match(report.resultDetail,/实际失败项/);assert.equal(report.accepted,0);assert.equal(report.complete,false);
});
test('本轮固定验证成功只接受签名与两层退出码，不制造完整目标或用例数',()=>{
 const work={status:'completed',result:{taskId:'new-run-task',status:'succeeded',outcome:'success',signed:true,exitCode:0,validationExitCode:0,fixedReport:{kind:'project-autonomy-validation',status:'pass',reportSha256:'a'.repeat(64),sourceFingerprint:'b'.repeat(64),independentAcceptance:false as const,checks:[{id:'build',required:true,executed:true,status:'pass',exitCode:0}]}}};
 const report=projectReportView(snapshot,{work,required:3,verifiedIds:[]});assert.equal(report.latestPassed,true);assert.match(report.result,/本轮固定验证执行成功/);assert.equal(report.taskId,'new-run-task');assert.equal(report.accepted,0);assert.equal(report.complete,false);assert.equal('tests' in report,false);
 for(const patch of [{signed:false},{exitCode:null},{validationExitCode:null},{outcome:'failed'}]){const unknown=projectReportView(snapshot,{work:{...work,result:{...work.result,...patch}}});assert.equal(unknown.latestPassed,false);assert.doesNotMatch(unknown.result,/最近主线限定检查执行成功/);}
 const ended=projectReportView(snapshot,{work:{...work,result:{...work.result,validationExitCode:undefined}}});assert.match(ended.result,/独立验证待报告/);
});
test('停止或晚到的新结果不能借旧基础检查显示成功，缺本次任务不跳旧任务',()=>{
 for(const patch of [{lateEvidenceOnly:true},{stopRequested:true},{status:'cancelled'}]){const report=projectReportView(snapshot,{work:{status:'completed',result:{status:'succeeded',outcome:'success',signed:true,exitCode:0,validationExitCode:0,...patch}}});assert.equal(report.latestPassed,false);assert.equal(report.latestStopped,true);assert.match(report.result,/停止/);assert.equal(report.taskId,undefined);assert.doesNotMatch(report.title,/基础检查执行成功/);}
});
test('当前任务执行中与本轮此前失败分别显示；实际排队运行不能沿用旧成功',()=>{
 const running=projectReportView(snapshot,{work:{status:'running',active:true,taskId:'current-task',stageTitle:'缺陷复验',result:{taskId:'previous-task',status:'failed',outcome:'failed',signed:true,exitCode:1}}});assert.equal(running.active,true);assert.equal(running.activeTaskId,'current-task');assert.equal(running.taskId,'previous-task');assert.match(running.title,/在执行/);assert.match(running.result,/未成功/);
 for(const status of ['running','queued']){const pending=projectReportView(snapshot,{work:{status,result:{taskId:'current-result-task',status}}});assert.equal(pending.active,true);assert.equal(pending.latestPassed,false);assert.equal(pending.latestFailed,false);assert.equal(pending.activeTaskId,'current-result-task');assert.match(pending.result,/本轮执行中/);}
});
test('当前计划明确无结果时不借用旧基础成功或失败，未传当前计划仍兼容旧入口',()=>{
 const noReceipt=projectReportView(snapshot,{mode:'acceptance',work:{status:'planned',result:null},required:74,verifiedIds:[]});
 assert.equal(noReceipt.mainPassed,true);assert.equal(noReceipt.latestPassed,false);assert.equal(noReceipt.latestFailed,false);assert.equal(noReceipt.taskId,undefined);assert.equal(noReceipt.result,'本轮执行结果待报告');assert.match(noReceipt.title,/等待实际验收/);assert.doesNotMatch(noReceipt.resultDetail,/本次执行成功/);assert.match(noReceipt.resultDetail,/尚无实际执行回执/);
 const oldFailed=projectReportView({...snapshot,main:{...main,runStatus:'failed',validationExitCode:2}},{work:{status:'planned',result:null}});assert.equal(oldFailed.mainFailed,true);assert.equal(oldFailed.latestFailed,false);assert.doesNotMatch(oldFailed.title,/未通过/);assert.equal(oldFailed.taskId,undefined);
 const legacy=projectReportView(snapshot);assert.equal(legacy.latestPassed,true);assert.equal(legacy.taskId,'main-task');assert.match(legacy.result,/最近主线/);
});

const fixedTests={total:332,passed:326,failed:4,skipped:1,unknown:1};
const fixedReport:ProjectReportFixedReport={kind:'project-autonomy-validation',status:'fail',reportSha256:'a'.repeat(64),sourceFingerprint:'b'.repeat(64),independentAcceptance:false,checks:[
 {id:'build',required:true,executed:true,status:'pass',exitCode:0},
 {id:'unit-full',required:true,executed:true,status:'fail',exitCode:1,tests:fixedTests},
 {id:'browser',required:true,executed:false,status:'skip',exitCode:null},
 {id:'coverage',required:true,executed:true,status:'unknown',exitCode:null},
 {id:'optional',required:false,executed:true,status:'skip',exitCode:0},
]};
const fixedResult:ProjectReportResult={taskId:'full-task',status:'failed',outcome:'failed',signed:true,exitCode:1,validationExitCode:1,fixedReport};
test('R27范围内结果单列401暂缓，不计入通过或完整目标验收',()=>{
 const scoped:ProjectReportFixedReport={...fixedReport,status:'pass',checks:[{id:'build',required:true,executed:true,status:'pass',exitCode:0}],scopedValidation:true,negativeLogin401Deferred:true,productObjectivesAccepted:false,scopeExceptions:[{id:'INVALID_LOGIN_NOT_DENIED',status:'not-applicable',executed:false,countsAsPassedCheck:false}],prototypeChecks:{total:30,observed:30,passed:30,failed:0,skipped:0,unknown:0}};
 const result={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0,fixedReport:scoped},view=projectReportView(snapshot,{work:{status:'completed',result},required:74,verifiedIds:[]});
 assert.equal(view.fixedSummary?.scopeNote,'错误登录401暂缓（不计通过）');assert.equal(view.fixedSummary?.checks.total,1);assert.equal(view.fixedSummary?.checks.passed,1);assert.equal(view.fixedSummary?.prototypeChecks?.total,30);assert.match(view.title,/范围内验证通过/);assert.doesNotMatch(view.result,/完整.*成功/);assert.equal(view.complete,false);assert.equal(view.accepted,0);assert.equal(view.fixedSummary?.independentAcceptance,false);
 const falselyPassed={...scoped,scopeExceptions:[{...scoped.scopeExceptions![0],countsAsPassedCheck:true}]};assert.equal(projectReportFixedSummary({...result,fixedReport:falselyPassed}),null);
});
test('首屏固定检查与测试数量取本轮真实签名报告，失败和待验不算目标通过',()=>{
 const report=projectReportView(snapshot,{work:{status:'failed',result:fixedResult},required:74,verifiedIds:[]});
 assert.deepEqual(report.fixedSummary?.checks,{total:5,executed:4,passed:1,failed:1,skipped:1,unknown:2});
 assert.deepEqual(report.fixedSummary?.testGroups,[{checkId:'unit-full',tests:fixedTests}]);assert.deepEqual(report.fixedSummary?.testsCounts,fixedTests);
 assert.equal(report.fixedSummary?.independentAcceptance,false);assert.equal(report.accepted,0);assert.equal(report.complete,false);assert.equal(report.taskId,'full-task');assert.equal(report.latestFailed,true);
});
test('缺本轮固定报告或未知签名时不借旧基础测试数，过期停止晚到报告也不显示可信计数',()=>{
 assert.equal(projectReportFixedSummary(null),null);assert.equal(projectReportFixedSummary(undefined),null);
 for(const patch of [{signed:false},{fixedReport:null},{fixedReport:undefined},{status:'running'},{status:'queued'},{status:'cancelled'},{lateEvidenceOnly:true},{stopRequested:true}])assert.equal(projectReportFixedSummary({...fixedResult,...patch}),null);
 assert.equal(projectReportFixedSummary(fixedResult,true),null);
 assert.equal(projectReportView(snapshot).fixedSummary,null);assert.equal(projectReportView(snapshot,{work:{status:'planned',result:null}}).fixedSummary,null);
});
test('多个固定测试组分别保留自己的数量，不能叠加重跑或重叠套件',()=>{
 const duplicatedSuite={...fixedReport,checks:[...fixedReport.checks,{id:'unit-retry',required:true,executed:true,status:'fail',exitCode:1,tests:{...fixedTests}}],testsCounts:{total:664,passed:652,failed:8,skipped:2,unknown:2}};
 const summary=projectReportFixedSummary({...fixedResult,fixedReport:duplicatedSuite});
 assert.equal(summary?.testGroups.length,2);assert.deepEqual(summary?.testGroups.map(group=>group.tests.total),[332,332]);assert.equal(summary?.testsCounts,null);assert.equal(summary?.groupsOverlapUnknown,true);assert.equal(summary?.checks.total,6);
});
test('未执行的检查不生成测试组，汇总字段不能替代实际检查证据',()=>{
 const report={...fixedReport,checks:[{id:'not-run',required:true,executed:false,status:'unknown',exitCode:null,tests:fixedTests}],testGroups:[{checkId:'fake',tests:fixedTests}],testsCounts:fixedTests};
 const summary=projectReportFixedSummary({...fixedResult,fixedReport:report});assert.deepEqual(summary?.testGroups,[]);assert.equal(summary?.testsCounts,null);assert.deepEqual(summary?.checks,{total:1,executed:0,passed:0,failed:0,skipped:0,unknown:1});
});
test('计数必须完整可相加且为非负整数，不可信格式不进入首屏统计',()=>{
 for(const patch of [{total:333},{failed:-1},{passed:326.5},{unknown:Number.NaN},{total:0,passed:0,failed:0,skipped:0,unknown:0}]){
  const report={...fixedReport,checks:[{...fixedReport.checks[1],tests:{...fixedTests,...patch}}]};assert.equal(projectReportFixedSummary({...fixedResult,fixedReport:report}),null);
 }
});
test('重复检查身份或报告缺少固定来源指纹不能变成可信检查概览',()=>{
 for(const report of [{...fixedReport,checks:[fixedReport.checks[1],fixedReport.checks[1]]},{...fixedReport,reportSha256:'invalid'},{...fixedReport,sourceFingerprint:'invalid'},{...fixedReport,kind:'model-summary'},{...fixedReport,checks:[]}])assert.equal(projectReportFixedSummary({...fixedResult,fixedReport:report}),null);
});
test('签名成功回执的实际测试报告仍独立保留失败项，不由退出码冒写全部通过',()=>{
 const result={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0};const summary=projectReportFixedSummary(result);
 assert.equal(summary?.checks.failed,1);assert.equal(summary?.testGroups[0].tests.failed,4);assert.equal(summary?.testGroups[0].tests.unknown,1);assert.equal(summary?.independentAcceptance,false);
 const report=projectReportView(snapshot,{work:{status:'completed',result},required:74,verifiedIds:[]});assert.equal(report.latestPassed,false);assert.equal(report.latestFailed,true);assert.doesNotMatch(report.title,/执行成功/);assert.match(report.result,/未成功/);assert.match(report.resultDetail,/未达标/);assert.equal(report.complete,false);
});
test('可信报告即使标pass，必需检查失败、跳过、未知或未执行也阻止成功标题',()=>{
 for(const check of [{status:'fail',executed:true,exitCode:1},{status:'skip',executed:true,exitCode:0},{status:'unknown',executed:true,exitCode:null},{status:'pass',executed:false,exitCode:0},{status:'pass',executed:true,exitCode:null}]){
  const result={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0,fixedReport:{...fixedReport,status:'pass',checks:[{id:'required',required:true,...check}]}};
  const report=projectReportView(snapshot,{work:{status:'completed',result}});assert.equal(report.latestPassed,false);assert.equal(report.latestFailed,true);assert.doesNotMatch(report.title,/执行成功/);assert.match(report.result,/未成功/);
 }
 const failedStatus={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0,fixedReport:{...fixedReport,status:'fail',checks:[{id:'required',required:true,executed:true,status:'pass',exitCode:0}]}};
 const contradictory=projectReportView(snapshot,{work:{status:'completed',result:failedStatus}});assert.equal(contradictory.latestPassed,false);assert.equal(contradictory.latestFailed,true);assert.match(contradictory.result,/未成功/);
});
test('零退出码不能掩盖必需测试的失败跳过或未知，缺必需检查也不算验证通过',()=>{
 for(const tests of [{total:2,passed:1,failed:1,skipped:0,unknown:0},{total:2,passed:1,failed:0,skipped:1,unknown:0},{total:2,passed:1,failed:0,skipped:0,unknown:1}]){
  const result={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0,fixedReport:{...fixedReport,status:'pass',checks:[{id:'required-tests',required:true,executed:true,status:'pass',exitCode:0,tests}]}};
  const report=projectReportView(snapshot,{work:{status:'completed',result}});assert.equal(report.latestPassed,false);assert.equal(report.latestFailed,true);assert.match(report.result,/未成功/);
 }
 const noRequired={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0,fixedReport:{...fixedReport,status:'pass',checks:[{id:'optional',required:false,executed:true,status:'pass',exitCode:0}]}};
 assert.equal(projectReportView(snapshot,{work:{status:'completed',result:noRequired}}).latestPassed,false);
});
test('报告pass不能覆盖非零执行退出码或验证退出码，执行成功缺报告只能等待验证',()=>{
 const goodReport={...fixedReport,status:'pass',checks:[{id:'required',required:true,executed:true,status:'pass',exitCode:0}]};
 for(const patch of [{exitCode:1},{validationExitCode:1}]){
  const result={...fixedResult,status:'succeeded',outcome:'success',exitCode:0,validationExitCode:0,fixedReport:goodReport,...patch};const report=projectReportView(snapshot,{work:{status:'completed',result}});assert.equal(report.latestPassed,false);assert.equal(report.latestFailed,true);assert.match(report.result,/未成功/);
 }
 for(const fixedReport of [null,undefined]){
  const report=projectReportView(snapshot,{work:{status:'completed',result:{status:'succeeded',outcome:'success',signed:true,exitCode:0,validationExitCode:0,fixedReport}}});assert.equal(report.latestPassed,false);assert.equal(report.latestFailed,false);assert.match(report.result,/独立验证待报告/);assert.doesNotMatch(report.title,/执行成功/);assert.equal(report.fixedSummary,null);
 }
});
