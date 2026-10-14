export type BaselineUsage={knownCostUSD:number|null;tokens:number|null;unknownCostCount:number};
export type MainBaselineView={taskId:string;runId:string;taskStatus:string|null;runStatus:string|null;status:string;sourceRole:'current-main';workspace:string;sourceFingerprint?:string|null;usage:BaselineUsage;validationExitCode:number|null;summary:string;projectId?:string;receiptVerified?:boolean;observedAt?:string|null};
export type BaselineCheck={id:string;required:boolean;executed:boolean;status:string;exitCode?:number|null;tests?:{total:number;passed:number;failed:number;skipped:number;unknown:number}};
export type BaselineView={id:string;projectId:string;revision:number;profileRevision:number;workPackage:string;objectiveIds:string[];totalObjectiveCount:number;goalSpecHash:string;sourceFingerprint:string;sourceRole:'frozen-candidate';executorId:string;machineId:string;workspace:string;taskId?:string;runId:string|null;createdAt:string;reason:string;status:string;taskStatus:string|null;runStatus:string|null;reportStatus:'pass'|'fail'|'unknown'|null;reportSha256:string|null;checks:BaselineCheck[];summary:string;usage:BaselineUsage;projectBudget:{spentUSD:number|null;usedTokens:number|null;unknownCostCount:number;activeRuns:string[]};objectivesAccepted:false;verifiedObjectiveIds:string[];currentMainBaseline:MainBaselineView|null};
export type BaselineList={items:BaselineView[];total:number;offset:number;nextOffset:number|null;latest:BaselineView|null;currentMainBaseline?:MainBaselineView|null};
export type BaselineSnapshot={projectId:string;latest:BaselineView|null;main:MainBaselineView|null;total:number};

/** Keep each source's actual receipt separate; a fixed check never contributes objective acceptance. */
export function baselineSnapshot(projectId:string,data:BaselineList):BaselineSnapshot{
 if(!data||!Array.isArray(data.items)||!Number.isInteger(data.total)||data.total<0)throw new Error('验收批次返回格式不完整。');
 for(const item of [...data.items,...(data.latest?[data.latest]:[])])if(item.projectId!==projectId||item.sourceRole!=='frozen-candidate'||!item.id)throw new Error('验收批次与当前项目或来源不匹配。');
 const main=data.currentMainBaseline??data.latest?.currentMainBaseline??null;
 if(main&&(main.sourceRole!=='current-main'||!main.taskId||!main.runId||main.projectId&&main.projectId!==projectId))throw new Error('主线检查与当前项目或来源不匹配。');
 return {projectId,latest:data.latest,main,total:data.total};
}
export const hasBaseline=(snapshot:BaselineSnapshot|null,projectId:string)=>!!snapshot&&snapshot.projectId===projectId&&!!(snapshot.main||snapshot.latest);

export function baselineStatus(view:Pick<BaselineView,'status'|'runStatus'|'taskStatus'|'reportStatus'>|MainBaselineView,candidate:boolean):{label:string;tone:string}{
 if(view.status==='stopped'||['paused','cancelled','interrupted','waitingUser'].includes(view.taskStatus??'')||['cancelled','interrupted'].includes(view.runStatus??''))return {label:'已暂停或停止',tone:'failed'};
 if(view.status==='blocked')return {label:'条件已变化，暂不能继续',tone:'failed'};
 if(view.status==='running'||view.runStatus==='running')return {label:'固定检查进行中',tone:''};
 if(view.status==='queued'||view.runStatus==='queued')return {label:'已安排，等待执行',tone:'queued'};
 if(['failed','timeout','error'].includes(view.runStatus??''))return {label:'检查未成功结束',tone:'failed'};
 if(view.status==='observed'){
  if(candidate&&'reportStatus' in view&&view.reportStatus==='pass')return {label:'本批固定检查通过',tone:'complete'};
  if(candidate&&'reportStatus' in view&&view.reportStatus==='fail')return {label:'本批固定检查未通过',tone:'failed'};
  return {label:candidate?'检查已结束，结果待核对':'窄检查已结束，查看结果',tone:''};
 }
 if(view.status==='registering')return {label:'正在登记检查',tone:''};
 if(view.status==='ready')return {label:'已登记，尚未运行',tone:''};
 return {label:'状态待核对',tone:''};
}

export function baselineTaskRoute(taskId:string|undefined){return taskId?'tasks/'+encodeURIComponent(taskId):null;}
