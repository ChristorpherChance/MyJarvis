import { z } from 'zod';
import { BusinessError, type BusinessRecord, type CommandContext, type DomainHandler } from './types.js';

const id = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(1).max(4000);
const longText = z.string().trim().min(1).max(20000);
const artifacts = z.array(id).max(1000);
const copySchema = z.object({
  machineId: id, path: z.string().trim().min(1).max(2000), branch: z.string().trim().min(1).max(300),
  environment: z.enum(['development', 'test', 'staging', 'production']),
}).strict();
const acceptanceSchema = z.object({
  outcome: z.enum(['pass', 'fail']), evidence: longText, tests: longText, artifacts,
}).strict();
const projectSchemas: Record<string, z.ZodType> = {
  register: z.object({ name: z.string().trim().min(1).max(300), description: reason, goal: longText,
    repo: z.string().max(4000).optional(), copies: z.array(copySchema).max(1000).optional(),
    milestones: z.array(reason).max(1000).optional() }).strict(),
  copies: z.object({ projectId: id, copies: z.array(copySchema).max(1000) }).strict(),
  update: z.object({projectId:id,name:z.string().trim().min(1).max(300),description:reason,goal:longText,repo:z.string().max(4000).optional()}).strict(),
  'environment-info':z.object({projectId:id,environmentInfo:z.object({environment:z.string().max(20000).default(''),runCommand:z.string().max(4000).default(''),verifyCommand:z.string().max(4000).default(''),notes:z.string().max(20000).default('')}).strict()}).strict(),
  milestone: z.object({ projectId: id, milestoneId: z.number().int().min(0), completed: z.boolean(), evidence: reason }).strict(),
  plan: z.object({ projectId: id, machineId: id, agent: z.string().trim().min(1).max(300),
    budget: z.number().min(1).max(10000), retryLimit: z.number().int().min(0).max(8) }).strict(),
  archive: z.object({ projectId: id, reason }).strict(),
};
const taskSchemas: Record<string, z.ZodType> = {
  create: z.object({ title: z.string().trim().min(1).max(300), projectId: id, machineId: id,
    agent: z.string().trim().min(1).max(300), mode: z.enum(['managed', 'observe']), goal: longText,
    criteria: longText, budget: z.number().min(1).max(10000), retryLimit: z.number().int().min(0).max(8),
    deadline: z.iso.datetime({ offset: true }).optional(), dependsOn: id.optional(),
    worktree: z.string().trim().min(1).max(2000).optional(), sessionId: id.optional(),
    skillIds: z.array(id).max(1000).optional() }).strict(),
  start: z.object({ taskId: id, reason: reason.optional() }).strict(),
  pause: z.object({ taskId: id, reason }).strict(),
  resume: z.object({ taskId: id, reason: reason.optional() }).strict(),
  cancel: z.object({ taskId: id, reason }).strict(),
  retry: z.object({ taskId: id, reason }).strict(),
  accept: z.object({ taskId: id, acceptance: acceptanceSchema }).strict(),
  package: z.object({ taskId: id, version: z.string().trim().min(1).max(300), criteria: reason.optional() }).strict(),
  // This records an external human declaration; it does not dispatch or attest to execution.
  report: z.object({ taskId: id, progress: z.number().min(0).max(100),
    status: z.enum(['running', 'paused', 'validating', 'failed']), artifacts, evidence: longText, source: reason }).strict(),
  limits:z.object({taskId:id,budget:z.number().min(1).max(10000),retryLimit:z.number().int().min(0).max(8),goal:longText.optional(),criteria:longText.optional(),reason,deadline:z.iso.datetime({offset:true}).nullable().optional()}).strict(),
};
const terminal = new Set(['completed', 'failed', 'cancelled']);
const startable = new Set(['queued', 'waitingQuota', 'waitingResource', 'waitingUser']);
const pausable = new Set(['queued', 'running', 'validating', 'waitingQuota', 'waitingResource', 'waitingUser', 'blocked']);

function fail(code: string, message: string, status = 409, details: Record<string, unknown> = {}): never {
  throw new BusinessError(code, message, status, details);
}
function parse(schemas: Record<string, z.ZodType>, command: string, payload: Record<string, any>) {
  const schema = schemas[command];
  if (!schema) fail('UNKNOWN_COMMAND', '不支持此命令。', 400);
  const result = schema.safeParse(payload);
  if (!result.success) fail('INVALID_INPUT', '命令字段或格式不符合要求。', 400, {
    issues: result.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })),
  });
  return result.data as Record<string, any>;
}
function createVersion(ctx: CommandContext) {
  if (ctx.expectedVersion !== 0) fail('VERSION_CONFLICT', '新记录的 expectedVersion 必须为 0。', 409);
}
function requireProject(ctx: CommandContext, projectId: string, editable = true) {
  const project = ctx.require('projects', projectId);
  if (editable && ['archived', 'delivered'].includes(project.status)) fail('INVALID_STATE', '该项目已交付或归档，不能继续创建或执行任务。');
  return project;
}
function requireMachine(ctx: CommandContext, machineId: string) {
  const machine = ctx.machine(machineId);
  if (!machine) fail('NOT_FOUND', '指定设备尚未登记。', 404);
  return machine;
}
export function assertTaskCreationEligibility(project:Record<string,any>,machine:Record<string,any>,scope:string,mode:string){
  if(['archived','delivered'].includes(project.status))fail('INVALID_STATE','该项目已交付或归档，不能继续创建或执行任务。');
  if(mode==='managed'&&(scope==='company'||observationOnly(machine)))fail('OBSERVE_ONLY','公司范围或只读设备只能登记观察任务。',403);
}
function observationOnly(machine: Record<string, any>) {
  return machine.readOnly === true || machine.readonly === true || machine.company === true || machine.scope === 'company'
    || /公司|企业|company/i.test(String(machine.role ?? ''));
}
function assertManaged(task: BusinessRecord) {
  if (task.mode !== 'managed') fail('OBSERVE_ONLY', '观察任务不允许控制外部执行器。', 403);
}
function assertDependency(ctx: CommandContext, task: BusinessRecord) {
  if (!task.dependsOn) return;
  const dependency = ctx.require('tasks', task.dependsOn);
  if (dependency.id === task.id || dependency.projectId !== task.projectId) fail('INVALID_DEPENDENCY', '前置任务必须属于同一项目，且不能引用自己。', 400);
  if (dependency.status !== 'completed' || dependency.acceptance?.outcome !== 'pass' || !dependency.artifacts?.length) {
    fail('DEPENDENCY_NOT_COMPLETE', '前置任务尚未通过独立验收。', 409, { dependsOn: dependency.id });
  }
}
function checkExecutionGates(ctx: CommandContext, task: BusinessRecord): never {
  assertManaged(task);
  if (task.scope === 'company') fail('OBSERVE_ONLY', '公司范围只能观察外部任务。', 403);
  requireProject(ctx, task.projectId);
  const emergency = (ctx as CommandContext & { emergencyStopped?: () => boolean }).emergencyStopped;
  if (emergency?.call(ctx)) fail('EMERGENCY_STOP', '平台处于急停状态。', 409);
  if (task.cost >= task.budget) fail('BUDGET_EXHAUSTED', '任务预算已耗尽，不能继续执行。', 409);
  if (task.deadline && Date.parse(task.deadline) <= Date.parse(ctx.now)) fail('DEADLINE_EXCEEDED', '任务截止时间已过。', 409);
  assertDependency(ctx, task);
  const machine = requireMachine(ctx, task.machineId);
  if (observationOnly(machine)) fail('OBSERVE_ONLY', '该设备仅允许观察任务。', 403);
  if (machine.status !== 'online') fail('RESOURCE_UNAVAILABLE', '设备没有已确认的在线状态，不能派发执行。', 409);
  const held = ctx.list('tasks').find(other => other.id !== task.id && other.projectId === task.projectId
    && other.lease && Date.parse(other.lease.expiresAt) > Date.parse(ctx.now));
  if (held) fail('LEASE_CONFLICT', '同项目已有任务占用执行租约。', 409, { taskId: held.id });
  if (!ctx.executorReady(task.agent, task.machineId)) fail('NOT_CONFIGURED', '尚未接入可执行此任务的执行器。', 409, { capability: 'task_executor' });
  // Readiness alone is not a dispatch receipt. Never manufacture running state, a lease, or work.
  fail('NOT_CONFIGURED', '执行器派发接口尚未接入。', 409, { capability: 'task_executor_dispatch' });
}
function validateCopies(ctx: CommandContext, copies: Record<string, any>[]) {
  const seen = new Set<string>();
  for (const copy of copies) {
    requireMachine(ctx, copy.machineId);
    const identity = `${copy.machineId}\0${copy.path}\0${copy.branch}\0${copy.environment}`;
    if (seen.has(identity)) fail('INVALID_INPUT', '项目副本登记重复。', 400);
    seen.add(identity);
  }
}
function fixedSkills(ctx: CommandContext, ids: string[]) {
  if (new Set(ids).size !== ids.length) fail('INVALID_INPUT', '技能引用不能重复。', 400);
  return ids.map(experienceId => {
    const experience = ctx.require('experiences', experienceId);
    if (experience.kind !== 'skill' || experience.status !== 'published' || experience.verified !== true) {
      fail('SKILL_NOT_PUBLISHED', '只能引用已经校验并发布的技能版本。', 409, { experienceId });
    }
    return { experienceId, version: experience.version, at: ctx.now };
  });
}
function taskBody(ctx: CommandContext, p: Record<string, any>) {
  const project = requireProject(ctx, p.projectId, false);
  const machine = requireMachine(ctx, p.machineId);
  assertTaskCreationEligibility(project,machine,ctx.scope,p.mode);
  if (p.dependsOn) {
    const dependency = ctx.require('tasks', p.dependsOn);
    if (dependency.projectId !== project.id) fail('INVALID_DEPENDENCY', '前置任务必须属于同一项目。', 400);
  }
  return {
    title: p.title, projectId: p.projectId, machineId: p.machineId, agent: p.agent, mode: p.mode,
    goal: p.goal, criteria: p.criteria, status: 'queued', progress: 0, budget: p.budget, cost: 0,
    retryLimit: p.retryLimit, retries: 0, deadline: p.deadline ?? null, dependsOn: p.dependsOn ?? null,
    ...(p.worktree ? { worktree: p.worktree } : {}), sessionId: p.sessionId ?? null,
    lease: null, artifacts: [], acceptance: null, resumeStatus: null, externalReports: [],
    skillRefs: fixedSkills(ctx, p.skillIds ?? []), updatedAt: ctx.now,
  };
}
function milestoneState(ctx: CommandContext, project: BusinessRecord, milestones: Record<string, any>[]) {
  const active = ctx.list('tasks').some(task => task.projectId === project.id && !terminal.has(task.status));
  if (milestones.length && milestones.every(item => item.completed) && !active) return 'delivered';
  return project.status === 'planned' && !milestones.some(item => item.taskId || item.completed) ? 'planned' : 'active';
}

const projectsHandler: DomainHandler = {
  domain: 'projects', commands: ['register', 'update', 'environment-info', 'copies', 'milestone', 'plan', 'archive'],
  execute(command, payload, ctx) {
    const p = parse(projectSchemas, command, payload);
    if (command === 'register') {
      createVersion(ctx);
      validateCopies(ctx, p.copies ?? []);
      const project = ctx.create('projects', {
        name: p.name, description: p.description, goal: p.goal, ...(p.repo !== undefined ? { repo: p.repo } : {}),
        status: 'planned', copies: p.copies ?? [],
        milestones: (p.milestones ?? []).map((title: string, index: number) => ({ id: index, title, completed: false, evidence: '' })),
      });
      ctx.emit('projects', project.id, 'project.registered', { copyCount: project.copies.length, milestoneCount: project.milestones.length });
      return project;
    }
    const project = ctx.require('projects', p.projectId);
    ctx.check(project);
    if (project.status === 'archived') fail('INVALID_STATE', '归档项目不可修改。');
    if(command==='environment-info'){
      const data=ctx.update('projects',project.id,{environmentInfo:p.environmentInfo,updatedAt:ctx.now});ctx.emit('projects',project.id,'project.environment-recorded',{commandsExecuted:false});return data;
    }
    if(command==='update'){
      if(ctx.list('tasks').some(t=>t.projectId===project.id&&['queued','running'].includes(t.executionStatus)))fail('EXECUTION_ACTIVE','请先停止项目中的活动执行再修改开发目标。');
      const data=ctx.update('projects',project.id,{name:p.name,description:p.description,goal:p.goal,...(p.repo!==undefined?{repo:p.repo}:{}),updatedAt:ctx.now});ctx.emit('projects',project.id,'project.updated');return data;
    }
    if (command === 'copies') {
      validateCopies(ctx, p.copies);
      const updated = ctx.update('projects', project.id, { copies: p.copies });
      ctx.emit('projects', project.id, 'project.copies.recorded', { count: p.copies.length, filesystemAccessed: false });
      return updated;
    }
    if (command === 'milestone') {
      const milestones = structuredClone(project.milestones) as Record<string, any>[];
      const milestone = milestones.find(item => item.id === p.milestoneId);
      if (!milestone) fail('NOT_FOUND', '未找到指定里程碑。', 404);
      if (p.completed && milestone.taskId) {
        const task = ctx.require('tasks', milestone.taskId);
        if (task.projectId !== project.id || task.status !== 'completed' || task.acceptance?.outcome !== 'pass') {
          fail('ACCEPTANCE_REQUIRED', '关联任务必须先完成独立验收。');
        }
      }
      Object.assign(milestone, { completed: p.completed, evidence: p.evidence, reviewedBy: ctx.actorId, reviewedAt: ctx.now });
      const updated = ctx.update('projects', project.id, { milestones, status: milestoneState(ctx, project, milestones) });
      ctx.emit('projects', project.id, 'project.milestone.recorded', { milestoneId: p.milestoneId, completed: p.completed, evidence: p.evidence });
      return updated;
    }
    if (command === 'archive') {
      const active = ctx.list('tasks').filter(task => task.projectId === project.id && !terminal.has(task.status));
      if (active.length) fail('ACTIVE_TASKS', '请先处理项目下的活动任务。', 409, { taskIds: active.map(task => task.id) });
      const updated = ctx.update('projects', project.id, { status: 'archived' });
      ctx.emit('projects', project.id, 'project.archived', { reason: p.reason });
      return updated;
    }
    requireProject(ctx, project.id);
    requireMachine(ctx, p.machineId);
    if (!project.milestones.length) fail('NO_MILESTONES', '请先登记至少一个里程碑，再生成任务计划。', 409);
    const milestones = structuredClone(project.milestones) as Record<string, any>[];
    const linked = milestones.map(milestone => milestone.taskId ? ctx.require('tasks', milestone.taskId) : undefined);
    for (const task of linked) if (task && task.projectId !== project.id) fail('INVALID_DEPENDENCY', '里程碑关联了其他项目的任务。', 400);
    // Validate all inputs before creating any task. The surrounding transaction is an additional safeguard.
    taskBody(ctx, { title: '计划校验', projectId: project.id, machineId: p.machineId, agent: p.agent,
      mode: 'managed', goal: project.goal, criteria: '里程碑验收', budget: p.budget, retryLimit: p.retryLimit });
    const existing = ctx.list('tasks').filter(task => task.projectId === project.id);
    const created: string[] = [], reused: string[] = [];
    let predecessor: string | null = null;
    for (let index = 0; index < milestones.length; index++) {
      const milestone = milestones[index];
      let task = linked[index];
      if (!task || task.status === 'cancelled') {
        const matches = existing.filter(candidate => candidate.status !== 'cancelled' && candidate.mode === 'managed'
          && candidate.goal === project.goal && candidate.criteria === `完成里程碑：${milestone.title}`);
        if (matches.length > 1) fail('PLAN_CONFLICT', '多个任务对应同一里程碑，请先整理关联。', 409);
        task = matches[0];
      }
      if (task) {
        if (task.mode !== 'managed') fail('PLAN_CONFLICT', '托管计划不能接管观察任务。');
        if (!terminal.has(task.status) && (task.dependsOn ?? null) !== predecessor) {
          if (task.status !== 'queued') fail('PLAN_CONFLICT', '已有活动任务的依赖与计划不同，不能自动改写。');
          task = ctx.update('tasks', task.id, { dependsOn: predecessor, updatedAt: ctx.now });
          ctx.emit('tasks', task.id, 'task.dependency_planned', { dependsOn: predecessor, executionDispatched: false });
        }
        reused.push(task.id);
      } else if (!milestone.completed) {
        const body = taskBody(ctx, { title: String(milestone.title).slice(0, 300), projectId: project.id,
          machineId: p.machineId, agent: p.agent, mode: 'managed', goal: project.goal,
          criteria: `完成里程碑：${milestone.title}`, budget: p.budget, retryLimit: p.retryLimit,
          ...(predecessor ? { dependsOn: predecessor } : {}) });
        task = ctx.create('tasks', body);
        created.push(task.id);
        ctx.emit('tasks', task.id, 'task.planned', { projectId: project.id, milestoneId: milestone.id, dependsOn: predecessor, executionDispatched: false });
      }
      if (task) { milestone.taskId = task.id; predecessor = task.id; }
    }
    const updated = ctx.update('projects', project.id, { milestones, status: milestoneState(ctx, project, milestones) });
    ctx.emit('projects', project.id, 'project.planned', { createdTaskIds: created, reusedTaskIds: reused, budgetPerTask: p.budget, executionDispatched: false });
    return updated;
  },
};

const tasksHandler: DomainHandler = {
  domain: 'tasks', commands: ['create', 'start', 'pause', 'resume', 'cancel', 'retry', 'accept', 'package', 'report', 'limits'],
  execute(command, payload, ctx) {
    const p = parse(taskSchemas, command, payload);
    if (command === 'create') {
      createVersion(ctx);
      const task = ctx.create('tasks', taskBody(ctx, p));
      ctx.emit('tasks', task.id, 'task.created', { mode: task.mode, executionDispatched: false, skillRefs: task.skillRefs });
      return task;
    }
    const task = ctx.require('tasks', p.taskId);
    ctx.check(task);
    if(command==='limits'){
      assertManaged(task);requireProject(ctx,task.projectId);
      if(['queued','running'].includes(task.executionStatus)||task.lease)fail('EXECUTION_ACTIVE','请先停止实际执行再修改边界。');
      if(['completed','cancelled'].includes(task.status))fail('INVALID_STATE','已完成或取消任务不能修改。');
      if(p.budget<=task.cost)fail('BUDGET_EXHAUSTED','预算需大于已记录实际用量费用。');
      const changed=p.goal&&p.goal!==task.goal||p.criteria&&p.criteria!==task.criteria;
      const data=ctx.update('tasks',task.id,{budget:p.budget,retryLimit:p.retryLimit,...(p.goal?{goal:p.goal}:{}),...(p.criteria?{criteria:p.criteria}:{}),...(p.deadline!==undefined?{deadline:p.deadline}:{}),...(changed?{acceptance:null,status:'paused',resumeStatus:'queued'}:{}),blockReason:p.reason,updatedAt:ctx.now});ctx.emit('tasks',task.id,'task.limits-updated',{budgetUSD:p.budget,retryLimit:p.retryLimit,acceptanceInvalidated:!!changed});return data;
    }
    if (['report', 'accept', 'package'].includes(command) && ['queued', 'running'].includes(task.executionStatus)) {
      fail('EXECUTION_ACTIVE', '受控执行仍在排队或运行，不能用人工报告改状态或提前验收、交付。', 409);
    }
    if (command === 'start') {
      assertManaged(task);
      if (!startable.has(task.status)) fail('INVALID_STATE', '只有排队或等待中的托管任务可以启动。');
      return checkExecutionGates(ctx, task);
    }
    if (command === 'resume') {
      assertManaged(task);
      if (task.status !== 'paused') fail('INVALID_STATE', '只有暂停任务可以恢复。');
      return checkExecutionGates(ctx, task);
    }
    if (command === 'retry') {
      assertManaged(task);
      if (!['failed', 'blocked'].includes(task.status)) fail('INVALID_STATE', '只有失败或阻塞任务可以重试。');
      if (task.retries >= task.retryLimit) fail('RETRY_LIMIT', '任务已达到重试上限。');
      return checkExecutionGates(ctx, task);
    }
    if (command === 'pause' || command === 'cancel') {
      assertManaged(task);
      if (command === 'pause' ? !pausable.has(task.status) : ['completed', 'cancelled'].includes(task.status)) {
        fail('INVALID_STATE', command === 'pause' ? '此状态不能暂停。' : '已完成或取消的任务不能再次取消。');
      }
      const status = command === 'pause' ? 'paused' : 'cancelled';
      const updated = ctx.update('tasks', task.id, { status, lease: null,
        resumeStatus: command === 'pause' ? task.status : null, blockReason: p.reason, updatedAt: ctx.now });
      ctx.emit('tasks', task.id, `task.${status}`, { reason: p.reason, previousStatus: task.status, controlEffect: 'record_only', leaseReleased: !!task.lease });
      return updated;
    }
    if (command === 'report') {
      if (['completed', 'cancelled', 'failed'].includes(task.status)) fail('INVALID_STATE', '该任务已终结，不能继续补报进度。');
      requireProject(ctx, task.projectId);
      if (task.lease) fail('LEASE_CONFLICT', '任务持有平台执行租约，不能用人工报告替代执行器状态。');
      if (p.progress < task.progress) fail('PROGRESS_REGRESSION', '人工补报进度不能回退；失败请保留已完成进度。', 400);
      if (['running', 'validating'].includes(p.status)) assertDependency(ctx, task);
      if ((task.externalReports?.length ?? 0) >= 1000) fail('HISTORY_LIMIT', '人工报告已达到保留上限，请建立新的任务记录。', 409);
      const report = { source: p.source, evidence: p.evidence, status: p.status, progress: p.progress,
        artifacts: [...new Set(p.artifacts)], actorId: ctx.actorId, at: ctx.now,
        verification: 'unverified_external', executionDispatched: false };
      const updated = ctx.update('tasks', task.id, { status: p.status, progress: p.progress,
        artifacts: report.artifacts, acceptance: null, lease: null,
        resumeStatus: p.status === 'paused' ? (task.status === 'paused' ? task.resumeStatus ?? null : task.status) : null,
        externalReports: [...(task.externalReports ?? []), report],
        blockReason: p.status === 'failed' ? '外部人工报告任务失败；详见报告证据。' : '外部人工报告；平台未派发执行。', updatedAt: ctx.now });
      ctx.emit('tasks', task.id, 'task.external_reported', { reportIndex: updated.externalReports.length - 1,
        reportedStatus: p.status, progress: p.progress, artifactIds: updated.artifacts, executionDispatched: false, verifiedByPlatform: false });
      return updated;
    }
    if (command === 'accept') {
      if (task.status !== 'validating') fail('INVALID_STATE', '只有待验收任务可以提交独立验收。');
      requireProject(ctx, task.projectId);
      assertDependency(ctx, task);
      const input = p.acceptance;
      if (input.outcome === 'pass' && !input.artifacts.length) fail('ARTIFACTS_REQUIRED', '验收通过必须指定产物。', 400);
      if (new Set(input.artifacts).size !== input.artifacts.length) fail('INVALID_INPUT', '验收产物不能重复。', 400);
      if (input.artifacts.some((artifact: string) => !task.artifacts.includes(artifact))) fail('UNKNOWN_ARTIFACT', '验收产物必须来自已经补报的产物清单。', 400);
      const acceptance = { ...input, reviewerId: ctx.actorId, at: ctx.now };
      const passed = input.outcome === 'pass';
      const updated = ctx.update('tasks', task.id, { acceptance, status: passed ? 'completed' : 'failed',
        progress: passed ? 100 : task.progress, artifacts: input.artifacts, lease: null, resumeStatus: null,
        blockReason: passed ? '' : '独立验收未通过。', updatedAt: ctx.now });
      ctx.emit('tasks', task.id, 'task.acceptance_recorded', { outcome: input.outcome, reviewerId: ctx.actorId,
        artifactIds: input.artifacts, verificationMode: 'human_attestation' });
      return updated;
    }
    if (task.status !== 'completed' || task.acceptance?.outcome !== 'pass' || !task.artifacts.length) {
      fail('ACCEPTANCE_REQUIRED', '只有通过独立验收且具备产物的任务可以生成交付包。');
    }
    ctx.require('projects', task.projectId);
    const sameVersion = ctx.list('releases').find(release => release.projectId === task.projectId && release.version === p.version);
    if (sameVersion) {
      if (sameVersion.taskId !== task.id || JSON.stringify(sameVersion.artifactIds) !== JSON.stringify(task.artifacts)
        || JSON.stringify(sameVersion.acceptance) !== JSON.stringify(task.acceptance)) {
        fail('RELEASE_VERSION_CONFLICT', '该项目版本已固定，不能覆盖交付包。');
      }
      return task;
    }
    const release = ctx.create('releases', { projectId: task.projectId, taskId: task.id, version: p.version,
      artifactIds: structuredClone(task.artifacts), acceptance: structuredClone(task.acceptance), createdAt: ctx.now });
    const updated = ctx.update('tasks', task.id, { updatedAt: ctx.now });
    ctx.emit('tasks', task.id, 'task.packaged', { releaseId: release.id, version: p.version,
      criteria: p.criteria ?? '', deploymentAuthorized: false });
    ctx.emit('releases', release.id, 'release.created', { projectId: task.projectId, taskId: task.id, version: p.version, immutable: true });
    return updated;
  },
};

export const workHandlers: DomainHandler[] = [projectsHandler, tasksHandler];
