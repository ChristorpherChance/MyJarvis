import type {SupervisionWorkItem,SupervisionWorkOverview} from '../../supervision-work-client';

export const supervisionStatusLabel={planned:'待推进',running:'推进中',blocked:'需要处理',completed:'本项已完成'} as const;
const taskLabels:Record<string,string>={queued:'待执行',running:'执行中',validating:'待独立验收',completed:'任务已完成',failed:'执行未通过',blocked:'需要处理',paused:'已暂停',cancelled:'已停止',waitingUser:'等待本人处理',waitingResource:'等待节点',waitingQuota:'等待可用额度',waitingBudget:'等待费用条件',approval:'等待审批',succeeded:'执行结束',timeout:'执行超时',interrupted:'执行中断','round-limit':'达到本轮边界','budget-exhausted':'达到费用边界','awaiting-cost':'用量待核对',unknown:'状态待核对'};
export function supervisionTaskLabels(fact:{status:string;executionStatus:string;runStatus:string|null}){
 const execution=fact.runStatus||fact.executionStatus;
 return {task:taskLabels[fact.status]??'任务状态待核对',execution:fact.status==='validating'&&execution==='succeeded'?'执行结束，待独立验收':execution?taskLabels[execution]??'执行状态待核对':'尚未执行'};
}
export function supervisionWorkView(value:SupervisionWorkOverview){
 const items=[...value.items].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
 const completed=items.filter(item=>item.status==='completed');
 return {items:items.filter(item=>item.status!=='completed'),completed,total:value.counts.total,
  running:value.counts.running,blocked:value.counts.blocked,completedCount:value.counts.completed,
  independentStatement:value.independentProgress.statement};
}
export function validCompletion(item:Pick<SupervisionWorkItem,'completionSummary'|'validationScope'|'evidenceRefs'>){return !!item.completionSummary.trim()&&!!item.validationScope.trim()&&item.evidenceRefs.length>0&&item.evidenceRefs.every(ref=>!!ref.path.trim()&&/^[a-f0-9]{64}$/i.test(ref.sha256))}
export interface SupervisionSubmission {body:string;commandId:string;unknown:boolean}
/** A proxy/server failure can follow a committed write. Only explicit rejections
 * release this attempt; all uncertain replies keep its exact command and body. */
export const supervisionSubmissionUnknown=(failure:unknown)=>![400,401,403,404,409,413,415,422].includes((failure as {status?:number})?.status??0);
export function prepareSupervisionSubmission(previous:SupervisionSubmission|null,body:string,newId:()=>string):SupervisionSubmission {
 if(previous?.unknown&&previous.body!==body)throw Error('上次提交回执未确认。请保留原输入重试，或关闭后刷新核对；不能用新内容覆盖未知提交。');
 return previous?.body===body?previous:{body,commandId:newId(),unknown:false};
}
