/** R28 retains the already frozen R27 candidate; only the verifier contract changes. */
import {r27MetadataScope} from './sync-factory-repair-plan-r27.mjs';
import {cleanPlanStep,assertPlanLineage} from './sync-factory-repair-verification-r26.mjs';
export const r28MetadataScope=Object.freeze({...r27MetadataScope,journalPath:'.jarvis-dev/maintenance/factory-repair-plan-r28.json',artifactDirectory:'artifacts/software-factory/acceptance-r28'});
export function r28PlanPayload(plan,commandId,{taskId,runId}={}){
 assertPlanLineage(plan);if(plan.revision<11)throw Error('R28_METADATA_SCOPE_PLAN_REQUIRED');
 return {commandId,expectedVersion:plan.revision,mode:plan.mode,title:plan.title,goal:plan.goal,currentStepId:'repair',steps:plan.steps.map(cleanPlanStep).map(s=>s.id==='repair'?{...s,taskIds:taskId?[...new Set([...s.taskIds,taskId])]:s.taskIds,runIds:runId?[...new Set([...s.runIds,runId])]:s.runIds,nextAction:'R28固定复验已实际派发；保留608文件候选及原分母，核对签名结果、真实清理和原模板恢复。'}:s),nextAction:'R28固定复验已实际派发；修正测试请求与有限代理契约，历史原型缺失仍如实记录。',reason:'追加本次已实际派发的R28固定验证task/run；候选仍为冻结R27的608/9b源码，更新验证契约，不改变原标准或旧失败。'};
}
