export interface WorkbenchPlanStep {id:string;title:string;goal?:string;criteria?:string[];state?:string;nextAction?:string|null}
export interface WorkbenchPlan {projectId:string;title:string;goal:string;currentStepId:string|null;nextAction:string|null;steps:WorkbenchPlanStep[];latestResult?:{summary?:string|null}|null}
export function planWorkbenchView(plan:WorkbenchPlan|null){
 if(!plan)return null;
 const current=plan.steps.find(step=>step.id===plan.currentStepId)??null;
 const following=current?plan.steps.slice(plan.steps.indexOf(current)+1).find(step=>step.state!=='passed'&&step.state!=='execution-finished')??null:plan.steps.find(step=>step.state!=='passed'&&step.state!=='execution-finished')??null;
 const label=(state?:string)=>({'running':'执行中','queued':'等待执行','execution-finished':'执行结束，待独立验收','needs-attention':'有问题待处理','awaiting-execution':'等待执行','planned':'待安排','stopped':'已停止','unavailable':'绑定暂不可读','passed':'独立验证通过'}[state??'']??'待核对');
 return {current,following,currentLabel:current?label(current.state):'尚未指定',followingLabel:following?label(following.state):'暂无后续阶段',nextAction:current?.nextAction||plan.nextAction||following?.nextAction||'尚无登记的下一步',latestResult:plan.latestResult?.summary||null,independentAcceptance:'待验证（计划未提供当前目标的独立证据映射）'};
}
/** Group by the structure saved in the plan; identifiers and counts are never inferred. */
export function numberedPlanGroups(plan:WorkbenchPlan){return plan.steps.map((step,index)=>({number:index+1,step,criteria:step.criteria??[]}));}
