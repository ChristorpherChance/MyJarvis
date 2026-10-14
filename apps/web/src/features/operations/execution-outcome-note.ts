type ExecutionOutcome = {status?: string; result?: {outcome?: string}};

/** A completed process is an observation, never an independent delivery verdict. */
export function executionOutcomeNote(run: ExecutionOutcome): {text: string; tone: string} {
  if (run.status === 'succeeded') return {text: '本轮执行已结束，产物仍需独立验收。', tone: ''};
  if (run.status === 'running') return {text: '节点正在执行；完成后还需验证产物。', tone: ''};
  if (run.status === 'queued') return {text: '任务已排队，尚未开始执行。', tone: ''};
  if (run.status === 'timeout') return {text: '本轮超过执行时限，已停止。已有产物和记录保留，需复验后安排续做。', tone: 'warn'};
  if (run.status === 'cancelled') return {text: '本轮已停止。停止原因和已有产物保留，尚未通过独立验收。', tone: 'warn'};
  if (run.status === 'awaiting-cost') return {text: '本轮等待用量回执核对；当前记录不能作为交付通过依据。', tone: 'warn'};
  if (run.status === 'round-limit') return {text: '本轮已到执行轮次边界，需核对进展后安排续做。', tone: 'warn'};
  if (run.status === 'budget-exhausted') return {text: '本轮触发执行器的费用边界。需核对该任务费用策略，尚未通过独立验收。', tone: 'warn'};
  if (run.status === 'failed') return {text: '本轮执行未完成。请查看原因和已有产物，修复后重新验证。', tone: 'warn'};
  return {text: '执行状态待核对，当前记录不能作为交付通过依据。', tone: 'warn'};
}
