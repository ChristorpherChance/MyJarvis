import {baselineStatus,type BaselineSnapshot} from './project-baseline-view.ts';

export type ProjectReportMode='acceptance'|'development';
export type ProjectReportStep={title:string;detail:string};
export type ProjectReportPlan={title?:string;intro?:string;steps?:readonly ProjectReportStep[];href?:string;reportHref?:string};
export type ProjectReportTestCounts={total:number;passed:number;failed:number;skipped:number;unknown:number};
export type ProjectReportFixedCheck={id:string;required:boolean;executed:boolean;status:string;exitCode:number|null;tests?:ProjectReportTestCounts|null};
/** The API validates the signed report hash and its run/workspace binding before returning this projection. */
export type ProjectReportFixedReport={kind:string;status:string;reportSha256:string;sourceFingerprint:string;checks:ProjectReportFixedCheck[];testGroups?:{checkId:string;tests:ProjectReportTestCounts}[];testsCounts?:ProjectReportTestCounts|null;prototypeChecks?:(ProjectReportTestCounts&{observed:number});scopedValidation?:true;negativeLogin401Deferred?:true;productObjectivesAccepted?:false;scopeExceptions?:{id:string;status:string;executed:boolean;countsAsPassedCheck:boolean}[];independentAcceptance:false};
export type ProjectReportResult={taskId?:string;status:string;outcome?:string;signed?:boolean;lateEvidenceOnly?:boolean;stopRequested?:boolean;exitCode?:number|null;validationExitCode?:number|null;summary?:string;fixedReport?:ProjectReportFixedReport|null};
/** Supplied from the current project's actual task/profile, never inferred from a historical baseline. */
export type ProjectReportWork={status:string;active?:boolean;stageTitle?:string;taskId?:string;summary?:string;result?:ProjectReportResult|null;nextAction?:string};
export type ProjectReportOptions={stale?:boolean;required?:number;verifiedIds?:string[]|null;mode?:ProjectReportMode;factory?:boolean;plan?:ProjectReportPlan;work?:ProjectReportWork|null};

export const acceptanceSteps:readonly ProjectReportStep[]=[
 {title:'核验现状',detail:'代码、构建与运行基线'},
 {title:'全面测试',detail:'测试、问题清单与复验'},
 {title:'核对产物',detail:'需求、设计、界面与代码'},
 {title:'交付验收',detail:'从原始需求到可用产品'},
 {title:'自动运行',detail:'Agent优化与持续监督'},
];
export const developmentSteps:readonly ProjectReportStep[]=[
 {title:'明确目标',detail:'需求、验收标准与任务'},
 {title:'持续开发',detail:'Agent执行与进度留证'},
 {title:'独立验证',detail:'实际产物与运行测试'},
 {title:'问题修复',detail:'缺陷记录、修复与复验'},
 {title:'交付维护',detail:'发布、使用与后续变更'},
];

/** Keep each test group's own denominator: different checks may execute the same test suite. */
export function projectReportFixedSummary(result:ProjectReportResult|null|undefined,stale=false){
 const report=result?.fixedReport;
 if(stale||!result?.signed||result.lateEvidenceOnly||result.stopRequested||!['succeeded','failed','timeout','error','round-limit'].includes(result.status)||!report||report.independentAcceptance!==false||report.kind!=='project-autonomy-validation'||!['pass','fail'].includes(report.status)||!/^[a-f0-9]{64}$/i.test(report.reportSha256)||!/^[a-f0-9]{64}$/i.test(report.sourceFingerprint)||!Array.isArray(report.checks)||!report.checks.length||report.checks.length>1000)return null;
 const scoped=report.scopedValidation===true;
 if((scoped||report.negativeLogin401Deferred!==undefined||report.scopeExceptions!==undefined)&&(!scoped||report.negativeLogin401Deferred!==true||report.productObjectivesAccepted!==false||report.scopeExceptions?.length!==1||report.scopeExceptions[0].id!=='INVALID_LOGIN_NOT_DENIED'||report.scopeExceptions[0].status!=='not-applicable'||report.scopeExceptions[0].executed!==false||report.scopeExceptions[0].countsAsPassedCheck!==false))return null;
 const ids=new Set<string>(),checks={total:report.checks.length,executed:0,passed:0,failed:0,skipped:0,unknown:0};
 const testGroups:{checkId:string;tests:ProjectReportTestCounts}[]=[];
 for(const check of report.checks){
  if(typeof check.id!=='string'||!check.id.trim()||ids.has(check.id)||typeof check.required!=='boolean'||typeof check.executed!=='boolean'||!['pass','fail','skip','unknown'].includes(check.status))return null;
  ids.add(check.id);if(check.executed)checks.executed++;
  if(!check.executed||check.status==='unknown')checks.unknown++;
  else if(check.status==='pass')checks.passed++;
  else if(check.status==='fail')checks.failed++;
  else checks.skipped++;
  if(check.tests){
   const values=Object.values(check.tests);
   if(values.length!==5||values.some(value=>!Number.isSafeInteger(value)||value<0||value>1e9)||check.tests.total<=0||check.tests.total!==check.tests.passed+check.tests.failed+check.tests.skipped+check.tests.unknown)return null;
   if(check.executed)testGroups.push({checkId:check.id,tests:{...check.tests}});
  }
 }
 const prototypeChecks=report.prototypeChecks;
 if(prototypeChecks&&(prototypeChecks.total!==30||!Number.isSafeInteger(prototypeChecks.observed)||prototypeChecks.observed<0||prototypeChecks.observed>30||['passed','failed','skipped','unknown'].some(k=>!Number.isSafeInteger(prototypeChecks[k as keyof ProjectReportTestCounts])||prototypeChecks[k as keyof ProjectReportTestCounts]<0)||prototypeChecks.passed+prototypeChecks.failed+prototypeChecks.skipped+prototypeChecks.unknown!==30))return null;
 return {checks,testGroups,testsCounts:testGroups.length===1?testGroups[0].tests:null,prototypeChecks:prototypeChecks??null,groupsOverlapUnknown:testGroups.length>1,scopedValidation:scoped,scopeNote:scoped?'错误登录401暂缓（不计通过）':null,independentAcceptance:false as const};
}

/** Generic projects never inherit the software factory's documents by project name or goal count. */
export function projectReportPlan(mode:ProjectReportMode='development',plan:ProjectReportPlan={},factory=false){
 const isAcceptance=mode==='acceptance',isFactory=isAcceptance&&factory;
 return {
  title:plan.title??(isAcceptance?'验收计划':'开发计划'),
  intro:plan.intro??(isAcceptance?'先验收现有成果，再修复证实的问题':'按目标持续推进，验证后修复并交付'),
  steps:plan.steps?.length?plan.steps:isAcceptance?acceptanceSteps:developmentSteps,
  href:plan.href??(isFactory?'/api/v1/project-autonomy/acceptance-plan':undefined),
  reportHref:plan.reportHref??(isFactory?'/api/v1/project-autonomy/acceptance-plan?reference='+encodeURIComponent('docs/软件工厂现有成果首轮验收报告.html'):undefined),
 };
}

/** A report describes observed execution; it never infers product acceptance. */
export function projectReportView(snapshot:BaselineSnapshot,{stale=false,required=0,verifiedIds=null,mode='development',factory=false,plan,work=null}:ProjectReportOptions={}){
 const main=snapshot.main,candidate=snapshot.latest,isAcceptance=mode==='acceptance';
 const mainActive=!!main&&['running','queued'].includes(main.status),candidateActive=!!candidate&&['running','queued','registering'].includes(candidate.status);
 const workActive=work?.active===true||!!work?.result&&['running','queued'].includes(work.result.status),active=workActive||mainActive||candidateActive||!!candidate?.projectBudget.activeRuns.length;
 const activeTaskId=workActive?work?.taskId??work?.result?.taskId:mainActive?main?.taskId:candidateActive?candidate?.taskId:undefined;
 const status=main?baselineStatus(main,false):candidate?baselineStatus(candidate,true):null;
 const stopped=!!main&&(main.status==='stopped'||['paused','cancelled','interrupted','waitingUser'].includes(main.taskStatus??'')||['cancelled','interrupted'].includes(main.runStatus??''));
 const workStopped=!!work&&['paused','cancelled','interrupted','stopped'].includes(work.status),workBlocked=!!work&&['blocked','waitingUser','waitingResource','waitingQuota','waitingBudget'].includes(work.status);
 const mainPassed=!!main&&!stale&&main.receiptVerified===true&&main.status==='observed'&&main.runStatus==='succeeded'&&main.validationExitCode===0&&['paused','cancelled','interrupted','waitingUser'].every(s=>main.taskStatus!==s);
 const mainFailed=!!main&&!stale&&!stopped&&(main.status==='observed'&&typeof main.validationExitCode==='number'&&main.validationExitCode!==0||['failed','timeout','error'].includes(main.runStatus??''));
 // null means the current plan has no receipt yet; undefined keeps legacy baseline-only reporting.
 const currentResult=work?.result,hasCurrentResult=!!currentResult,hasCurrentResultContext=work?.result!==undefined;
 const fixedSummary=projectReportFixedSummary(currentResult,stale),requiredChecks=fixedSummary?currentResult!.fixedReport!.checks.filter(check=>check.required):[];
 const fixedReportFailed=!!fixedSummary&&(currentResult?.fixedReport?.status==='fail'||fixedSummary.checks.failed>0||requiredChecks.length===0||requiredChecks.some(check=>!check.executed||check.status!=='pass'||check.exitCode!==0||!!check.tests&&(check.tests.failed>0||check.tests.skipped>0||check.tests.unknown>0)));
 const resultActive=!!currentResult&&['running','queued'].includes(currentResult.status);
 const resultStopped=!!currentResult&&(currentResult.stopRequested===true||currentResult.lateEvidenceOnly===true||['cancelled','interrupted','stopped'].includes(currentResult.status));
 const latestPassed=hasCurrentResultContext?!!currentResult&&!stale&&!resultActive&&!resultStopped&&currentResult.status==='succeeded'&&currentResult.outcome==='success'&&currentResult.signed===true&&currentResult.exitCode===0&&currentResult.validationExitCode===0&&!!fixedSummary&&!fixedReportFailed:mainPassed;
 const executionEnded=!!currentResult&&!stale&&!resultActive&&!resultStopped&&currentResult.status==='succeeded'&&currentResult.outcome==='success'&&currentResult.signed===true&&currentResult.exitCode===0;
 const latestFailed=hasCurrentResultContext?!!currentResult&&!stale&&!resultActive&&!resultStopped&&(fixedReportFailed||['failed','timeout','error','round-limit'].includes(currentResult.status)||['failed','timeout','round-limit'].includes(currentResult.outcome??'')||typeof currentResult.exitCode==='number'&&currentResult.exitCode!==0||typeof currentResult.validationExitCode==='number'&&currentResult.validationExitCode!==0):mainFailed;
 const latestStopped=hasCurrentResultContext?resultStopped:stopped;
 const count=Number.isSafeInteger(required)&&required>0?required:0,accepted=verifiedIds===null?null:new Set(verifiedIds.filter(id=>typeof id==='string'&&id.length>0)).size;
 const complete=!stale&&count>0&&accepted===count,hasResult=hasCurrentResultContext?hasCurrentResult:!!(main||candidate);
 const title=stale?'状态暂不可读':active?'项目有任务在执行':workStopped?'当前项目任务已暂停或停止':latestStopped?(hasCurrentResult?'本轮执行已停止':'本次主线检查已停止'):latestFailed?(hasCurrentResult?'本轮执行未成功结束，先核对问题':'基础检查未通过，先核对问题'):workBlocked?'当前项目需要处理阻塞':latestPassed?(fixedSummary?.scopedValidation?'本轮范围内验证通过，登录401暂缓':hasCurrentResult?'本轮固定验证执行成功，继续目标验收':isAcceptance?'基础检查执行成功，继续完整验收':'最近基础检查执行成功，继续推进目标'):complete?'目标已有验收记录，核对交付结果':executionEnded?'本轮执行已结束，独立验证待报告':isAcceptance?(hasResult?'已有检查记录，等待下一批验收':'等待实际验收与结果汇报'):'等待开发任务与验证结果';
 const execution=stale?'上次结果，仅供参考':workActive?(work?.stageTitle?'正在执行 · '+work.stageTitle:'项目任务执行中'):mainActive?'主线检查已安排':candidateActive?'候选对照已安排':active?'其他项目任务执行中':workStopped?'当前任务已暂停或停止':workBlocked?'当前任务有待处理条件':isAcceptance?'当前没有检查在执行':'当前没有任务在执行';
 const currentResultLabel=!currentResult?'本轮执行结果待报告':resultActive?'本轮执行中，等待结果':resultStopped?(currentResult?.lateEvidenceOnly?'本轮已停止，晚到结果仅留作记录':'本轮执行已停止'):latestFailed?'本轮执行未成功结束':latestPassed?(fixedSummary?.scopedValidation?'本轮范围内固定验证通过':'本轮固定验证执行成功'):executionEnded?'本轮执行已结束，独立验证待报告':'本轮结果待核对';
 const result=stale?'上次读取：'+(hasCurrentResultContext?currentResultLabel:status?.label??'暂无结果'):hasCurrentResultContext?currentResultLabel:mainPassed?'最近主线限定检查执行成功':status?.label??(isAcceptance?'尚无实际检查结果':'独立验证结果待报告');
 const defaultNext=active?'查看正在执行的任务，结束后核对结果与问题。':workStopped?'核对暂停或停止原因，再安排有边界的后续任务。':latestStopped?'核对停止原因与已有结果，再安排新的检查。':latestFailed?(hasCurrentResult?'核对本轮失败证据，分类确认问题，修复后安排复验。':'分类确认基础检查失败原因，定点修复后复验。'):workBlocked?'核对阻塞原因，处理条件后安排恢复或修复。':complete?'核对交付包、运行部署与客户使用结果。':isAcceptance?'基于最新主线安排完整测试，复核历史问题，再核对各阶段产物。':'按项目目标与依赖安排下一项任务，完成后独立验证；问题修复后复验。';
 const next=stale?'刷新取得当前状态，再查看执行任务。':work?.nextAction?.trim()||defaultNext;
 const resultDetail=hasCurrentResultContext?(!currentResult?'本轮计划尚无实际执行回执。原基础检查与历史结果单独保留。':currentResult?.summary?'执行摘要：'+currentResult.summary+(fixedReportFailed?'；固定检查报告未达标，完整目标仍需独立验收。':latestPassed?'；完整目标仍需独立验收。':''):fixedReportFailed?'固定检查报告未达标；核对失败、跳过或待验项后安排复验。':latestPassed?'本轮固定验证执行成功；完整目标仍需逐项独立验收。':resultStopped?'停止或晚到回执保留，不能据此接受产品。':executionEnded?'签名执行已结束；固定验证尚未报告。':'等待本轮实际执行与验证证据。'):mainPassed?(isAcceptance?'本次执行成功，验证退出码为 0；完整测试、产物关联和交付验收仍待检查。':'最近限定执行成功，验证退出码为 0；完整目标仍需逐项独立验证。'):main?.summary??candidate?.summary??(isAcceptance?'等待实际检查回执。':'尚未收到独立验证回执，开发任务状态单独展示。');
 return {mode,plan:projectReportPlan(mode,plan,factory),title,execution,result,resultDetail,next,active,activeTaskId,mainPassed,mainFailed,latestPassed,latestFailed,latestStopped,hasCurrentResult,accepted,required:count,complete,taskId:hasCurrentResultContext?currentResult?.taskId:main?.taskId??candidate?.taskId,work,fixedSummary};
}
