export function workbenchBlockerSummary(value:unknown){return typeof value==='string'&&value.includes('MODEL_CONTEXT_INCOMPLETE')?'报告资料超过本轮审阅容量，待调整':value;}
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
export function currentGoalEvents(events:any[],session:any){
 const ordered=[...events].sort((a,b)=>(b.sequence??0)-(a.sequence??0));
 const bound=(event:any)=>!!session&&event.goalRevision===session.goalRevision&&!!event.runId&&[session.runId,session.consumedRunId].filter(Boolean).includes(event.runId);
 return {decision:ordered.find(e=>bound(e)&&(e.kind==='decision'||e.kind==='review')),previousDecision:ordered.find(e=>!bound(e)&&(e.kind==='decision'||e.kind==='review')),instruction:ordered.find(e=>e.goalRevision===session?.goalRevision&&e.kind==='instruction'),feedback:ordered.find(e=>bound(e)&&e.feedback)?.feedback};
}
/** Parse only explicit numbered source lines; unknown text is retained, never invented. */
export function planGoalGroups(goal:string){
 const groups:{title:string;lines:string[]}[]=[{title:'软件工厂能力',lines:[]},{title:'监管要求',lines:[]},{title:'其他目标原文',lines:[]}];
 for(const line of goal.split(/\r?\n/).filter(x=>x.trim())){const code=line.trim().replace(/^[-*]\s*/, '');groups[/^F\d{2}\b/.test(code)?0:/^S\d{2}\b/.test(code)?1:2].lines.push(line);}
 return groups.filter(g=>g.lines.length);
}
export function planStageGroups(plan:WorkbenchPlan){return [{title:'当前阶段',steps:plan.steps.filter(s=>/^C[1-6]$/.test(s.id))},{title:'后续阶段',steps:plan.steps.filter(s=>/^N[1-6]$/.test(s.id))},{title:'其他阶段原文',steps:plan.steps.filter(s=>!/^([CN])[1-6]$/.test(s.id))}].filter(g=>g.steps.length);}

/** The server binds current facts; manually maintained project items remain historical context. */
export function workbenchLoopView(context:any,planView:ReturnType<typeof planWorkbenchView>){
 const s=context?.supervisor?.session,loop=context?.currentLoopBrief;
 return {loop:loop??null,blocker:loop?loop.blocker:s?s.blocker:context?.brief?.unresolved?.reason,
  nextAction:loop?.nextAction||s?.nextAction||planView?.nextAction||'本轮下一步待核',
  ownerQuestion:loop?loop.ownerQuestion:s?.status==='waiting_user'?'请核对本轮本人待办':null,
  ownerActionRequired:loop?.ownerActionRequired??s?.status==='waiting_user',
  judgmentLabel:loop?.judgment&&!loop.judgment.currentResult?'最近主管判断（上一回包）':'最近主管判断'};
}

export type WorkbenchTaskGroup='active'|'planned'|'attention'|'ended';
export type WorkbenchInteraction={id:string;role:'jarvis'|'executor'|'owner';status:string;at:string|null;summary:string;detail?:string;sourceRef?:Record<string,unknown>};
/** Activity is optional on older servers. A heartbeat is never task completion. */
export function workbenchActivity(context:any){
 const session=context?.supervisor?.session,activity=context?.currentActivity;
 return activity?.bindingVerified===true&&activity.runId===session?.runId&&activity.taskId===session?.taskId?activity:null;
}
export function workbenchInteractions(context:any):WorkbenchInteraction[]{
 const activity=workbenchActivity(context);
 if(activity&&Array.isArray(activity.items))return activity.items.filter((item:any)=>item&&typeof item.id==='string'&&['jarvis','executor','owner'].includes(item.role)&&typeof item.summary==='string'&&item.summary.trim()).slice(-12);
 const session=context?.supervisor?.session,loop=context?.currentLoopBrief;
 if(!session||loop?.bindingVerified!==true)return [];
 const events=(context.supervisor.events??[]).filter((e:any)=>e.goalRevision===session.goalRevision&&e.taskId===session.taskId).sort((a:any,b:any)=>(a.sequence??0)-(b.sequence??0));
 const items:WorkbenchInteraction[]=[];
 for(const e of events){
  const current=e.runId===session.runId;
  if(e.kind==='instruction'&&e.dispatchedRunId===session.runId&&typeof e.directive==='string')items.push({id:e.eventId,role:'jarvis',status:'requested',at:e.at??e.createdAt??null,summary:e.directive,sourceRef:{kind:'supervisor-event',eventId:e.eventId,runId:e.dispatchedRunId}});
  else if(e.kind==='feedback'&&current&&typeof loop.feedbackSummary==='string')items.push({id:e.eventId,role:'executor',status:'reported',at:e.at??e.createdAt??null,summary:loop.feedbackSummary,sourceRef:{kind:'supervisor-event',eventId:e.eventId,runId:e.runId,resultHash:e.resultHash}});
  else if(loop.judgment?.eventId===e.eventId)items.push({id:e.eventId,role:'jarvis',status:'judged',at:e.at??e.createdAt??null,summary:loop.judgment.reason,detail:loop.judgment.currentResult?'本次回包的判断':'上次回包的判断，供当前后继参考',sourceRef:{kind:'supervisor-event',eventId:e.eventId,runId:e.runId,resultHash:e.resultHash}});
 }
 return items.slice(-12);
}
export function workbenchTasks(context:any){
 const groups:Record<WorkbenchTaskGroup,any[]>={active:[],planned:[],attention:[],ended:[]};
 for(const task of context?.tasks??[]){
  const actual=task.bindingVerified!==false&&!!task.runId&&['running','queued'].includes(task.runStatus);
  const group:WorkbenchTaskGroup=actual?(task.runStatus==='running'?'active':'planned'):task.activityState==='attention'||['blocked','failed','paused','waitingUser','approval','waitingResource','waitingQuota'].includes(task.status)?'attention':task.activityState==='ended'||['completed','cancelled'].includes(task.status)?'ended':'planned';
  const label=actual?(task.runStatus==='running'?'正在执行':'已提交，等待领取'):group==='planned'?'待安排':group==='ended'?'已结束记录':task.activityLabel||'需要处理';
  groups[group].push({...task,activityLabel:label});
 }
 return groups;
}
export function workbenchPrimaryAction(context:any){
 const session=context?.supervisor?.session;
 if(context?.pending?.length)return {kind:'compose',label:'继续核对原请求'};
 if(!session)return {kind:'compose',label:'安排目标并开始'};
 if(['running','judging','dispatching','review_pending'].includes(session.status))return {kind:'pause',label:'暂停推进'};
 if(session.status==='draft')return {kind:'compose',label:'开始这个目标'};
 if(session.status==='paused')return {kind:'compose',label:'补充指令并继续'};
 if(session.status==='waiting_user'&&context?.currentLoopBrief?.ownerActionRequired===true)return {kind:'compose',label:'回答本轮问题'};
 if(['achieved','stopped','human_control'].includes(session.status))return {kind:'revise',label:'安排下一目标'};
 return {kind:'review',label:'处理当前阻塞'};
}
export function workbenchReadFreshness(readAt:string|null,now:number){
 const stamp=readAt?Date.parse(readAt):NaN;
 return {known:Number.isFinite(stamp),stale:Number.isFinite(stamp)&&now-stamp>45000};
}
/** Saving a revised goal never adds start/authorizeContinuous. */
export function workbenchRevisionBody(session:any,goal:string,criteria:string[],commandId:string){
 if(!session||!goal.trim()||!criteria.length||criteria.some(value=>!value.trim())||new Set(criteria).size!==criteria.length)throw Error('请填写目标和不重复的验收标准');
 return {commandId,expectedVersion:session.revision,action:'revise',goal:goal.trim(),criteria};
}

export function workbenchDetailRoute(route:string,target?:string){const parts=(target??'').split('?')[0].split('/');return route==='projects'&&parts[0]==='projects'&&parts.length===2&&!!parts[1]&&parts[1]!=='new';}
