/** Presentation only: these guards never reset attempts or revive a stopped execution. */
export type AutonomyStageView={id:string;status:string;attempt:number;taskId?:string;runId?:string;reviewTaskId?:string;reviewRunId?:string;validationTaskId?:string;validationRunId?:string;checkpoint?:{repeated:number};decision?:{outcome:string}};
export type AutonomyRunView={id:string;projectId:string;taskId:string;status:string;timeoutSec?:number;stopRequested?:boolean;result?:{outcome?:string;lateEvidenceOnly?:boolean;stopReason?:{code:string};validation?:{exitCode?:number};summary?:string}};
type ProfileView={status:string;reason:string|null;stages:AutonomyStageView[];config:{maxAttempts:number;maxRepeated?:number}};
const activeStatuses=['running','active','executing','validating','reviewing'];
const terminalStatuses=['completed','cancelled','stopped'];
const executingStages=['running','worker','executing','validating','reviewing','validating-prerequisite'];
const resourceReasons=['RESOURCE_UNAVAILABLE','NOT_CONFIGURED','COST_UNKNOWN','TOKENS_UNKNOWN','USD_BOUNDARY','TOKEN_BOUNDARY','开发或评审节点暂未就绪'];

export function currentAutonomyStage(stages:AutonomyStageView[]){
 return stages.find(stage=>executingStages.includes(stage.status))??stages.find(stage=>!['passed','cancelled','completed'].includes(stage.status));
}
export function stageExecution(stage?:AutonomyStageView){
 if(!stage)return {};
 if(stage.status==='reviewing')return {taskId:stage.reviewTaskId,runId:stage.reviewRunId};
 if(stage.status==='validating-prerequisite'||stage.status==='waiting-prerequisite'&&(stage.validationTaskId||stage.validationRunId))return {taskId:stage.validationTaskId,runId:stage.validationRunId};
 return {taskId:stage.taskId,runId:stage.runId};
}
export function autonomyControls(profile:ProfileView,run:AutonomyRunView|null,receiptReady:boolean){
 const active=activeStatuses.includes(profile.status),terminal=terminalStatuses.includes(profile.status);
 const unfinished=profile.stages.filter(stage=>stage.status!=='passed');
 const current=currentAutonomyStage(profile.stages),execution=stageExecution(current);
 const waiting=current?.status==='waiting-prerequisite';
 const currentProbe=waiting&&!!current.validationRunId&&execution.runId===current.validationRunId;
 const previousExecution=unfinished.some(stage=>!!(stage.taskId||stage.runId||stage.reviewTaskId||stage.reviewRunId||stage.validationTaskId||stage.validationRunId));
 const interrupted=!!run&&(!waiting||currentProbe||['queued','running'].includes(run.status))&&(run.stopRequested===true||run.result?.lateEvidenceOnly===true||run.result?.outcome==='cancelled'||['cancelled','interrupted'].includes(run.status));
 const stalled=profile.reason==='REPEATED_SOURCE_AND_PROBLEMS'||unfinished.some(stage=>profile.config.maxRepeated!==undefined&&(stage.checkpoint?.repeated??0)>=profile.config.maxRepeated!);
 const failed=!!run&&(!['queued','running','succeeded'].includes(run.status)||run.result?.validation?.exitCode!==undefined&&run.result.validation.exitCode!==0);
 const attemptsExhausted=profile.reason==='REPAIR_ATTEMPTS_EXHAUSTED'||unfinished.some(stage=>stage.status!=='waiting-prerequisite'&&stage.attempt>=profile.config.maxAttempts&&(stage.status==='pending'||stage.decision&&stage.decision.outcome!=='pass'||stage===current&&(failed||!active&&!receiptReady)));
 const reconciliation=profile.reason==='EXECUTION_NEEDS_RECONCILIATION'||interrupted||profile.status==='paused'&&previousExecution&&!waiting;
 const receiptNeeded=(!waiting||currentProbe)&&!!execution.runId&&!receiptReady||!waiting&&previousExecution&&!execution.runId;
 const reason=reconciliation?'reconciliation':attemptsExhausted?'attempts':stalled?'stalled':receiptNeeded?'receipt':null;
 const retryResources=['waitingBudget','waitingQuota','waitingResource'].includes(profile.status)||profile.status==='blocked'&&resourceReasons.includes(profile.reason??'');
 const initiallyReady=['configured','ready','draft'].includes(profile.status),pausedStartable=profile.status==='paused'&&(!previousExecution||waiting);
 const canStart=!active&&!terminal&&!reason&&(initiallyReady||pausedStartable||retryResources);
 return {active,terminal,canStart,canPause:active,canCancel:!terminal,startLabel:retryResources?'检查条件并启动':'启动监督',reason};
}
export function stoppedExecutionText(run:AutonomyRunView|null){
 if(!run)return '';
 const stopCode=run.result?.stopReason?.code;
 if(stopCode==='PROCESS_TIMEOUT'||run.status==='timeout'){
  const seconds=run.timeoutSec,limit=typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>0?`（本次时限 ${seconds%60===0?`${seconds/60} 分钟`:`${seconds} 秒`}）`:'';
  return `最新任务超过执行时限${limit}后结束。`;
 }
 const reasons:Record<string,string>={HEARTBEAT_FAILED:'最新任务因节点通信中断而结束。',CENTRAL_STOP:'最新任务已按停止指令结束。',NODE_STOP:'最新任务因开发节点停止而结束。',NODE_PROCESS_RESTART:'最新任务因节点进程重启而结束。',LOG_DELIVERY_BLOCKED:'最新任务因执行日志无法递送而结束。',LOCAL_DURABILITY_FAILED:'最新任务因本地记录保存失败而结束。',LOCAL_CHECK_FAILED:'最新任务因本地检查失败而结束。',CLAIM_FAILED:'最新任务未成功取得执行条件。'};
 if(stopCode&&reasons[stopCode])return reasons[stopCode];
 if(['failed','interrupted','cancelled','budget-exhausted','round-limit','awaiting-cost'].includes(run.status))return '最新任务已结束，尚未通过验收。';
 return '';
}
export function stageDisplayStatus(profileStatus:string,stageStatus:string,passed:boolean,dependenciesReady:boolean){
 if(passed)return '独立验证通过';
 if(!dependenciesReady)return '前置工作包未通过';
 if(stageStatus==='passed')return '待核验证据';
 if(executingStages.includes(stageStatus)){
  if(profileStatus==='blocked')return '已停在此阶段';
  if(profileStatus==='paused')return '已暂停';
  if(['cancelled','stopped'].includes(profileStatus))return '已停止';
  if(profileStatus==='completed')return '待核验证据';
 }
 return null;
}
