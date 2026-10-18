import type {SupervisionConsole} from '../../supervision-work-client';
const reasons:Record<string,string>={REPAIR_ATTEMPTS_EXHAUSTED:'旧执行包已用完尝试次数，需要核清问题并安排新的执行计划。',RESOURCE_UNAVAILABLE:'执行节点尚未就绪。',DEPENDENCIES_NOT_READY:'前置工作还没有通过。',AI_REVIEW_EXECUTOR_REQUIRED:'真实评审执行条件尚未齐备。'};
export function supervisionConsoleView(value:SupervisionConsole){
 const r=value.runtime;
 const state=r.running>0?{code:'running',label:'平台记录正在执行',detail:`${r.running} 项运行中${r.queued?`，${r.queued} 项已排队`:''}`}:
  r.queued>0?{code:'queued',label:'已排队，尚未执行',detail:`${r.queued} 项等待执行回执。`}:
  r.unavailable?{code:'unknown',label:'运行状态暂不可确认',detail:'部分运行依据未能读取，请刷新后再判断。'}:
  r.autonomyStatus==='blocked'?{code:'blocked',label:'自动执行已阻塞',detail:reasons[r.reason]||'当前没有平台受控运行，需要核对阻塞后再安排。'}:
  r.autonomyStatus==='paused'?{code:'paused',label:'自动执行已暂停',detail:'当前没有平台受控运行。'}:
  {code:'idle',label:'当前没有平台受控运行',detail:'监管事项的“推进中”是工作记录，不代表执行器正在运行。'};
 const work=[...value.items].filter(x=>x.status!=='completed').sort((a,b)=>Number(!!b.blocker)-Number(!!a.blocker)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 const done=[...value.items].filter(x=>x.status==='completed').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 return {state,focus:work[0]??null,work,done,acceptance:value.acceptance.pending?'待验证':value.acceptance.available?`${value.acceptance.accepted} / ${value.acceptance.total}`:'尚未建立',recordedCompletion:value.counts.completed,
  focusState:work[0]?.blocker?'存在阻塞':state.code==='running'&&work[0]?.runId&&r.runningRunIds.includes(work[0].runId)?'关联执行中':work[0]?.status==='planned'?'待安排':'待接续'};
}
