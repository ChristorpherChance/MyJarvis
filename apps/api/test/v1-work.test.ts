import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { workHandlers } from '../src/v1/work-domains.js';
import { BusinessError, type BusinessRecord, type CommandContext, type Domain, type DomainEvent, type Scope } from '../src/v1/types.js';

type State = { records: Partial<Record<Domain, BusinessRecord[]>>; events: DomainEvent[]; counter: number };
class Fixture {
  state: State = { records: {}, events: [], counter: 0 };
  actorId = 'owner'; scope: Scope = 'personal'; expectedVersion = 0;
  now = '2026-10-05T08:00:00.000Z'; ready = false; emergency = false;
  machines: Record<string, Record<string, any>> = {
    local: { id: 'local', role: '开发环境', status: 'online', source: 'local-system' },
    remote: { id: 'remote', role: '生产服务器', status: 'unknown', source: 'manual-registration' },
    company: { id: 'company', role: '公司电脑', status: 'online', readOnly: true },
  };
  context(): CommandContext {
    const f = this;
    const context: CommandContext & { emergencyStopped(): boolean } = {
      actorId: f.actorId, scope: f.scope, expectedVersion: f.expectedVersion, now: f.now,
      list: domain => structuredClone((f.state.records[domain] ?? []).filter(r => r.ownerId === f.actorId && r.scope === f.scope)),
      get: (domain, recordId) => {
        const r = (f.state.records[domain] ?? []).find(r => r.id === recordId && r.ownerId === f.actorId && r.scope === f.scope);
        return r ? structuredClone(r) : undefined;
      },
      require: (domain, recordId) => {
        const r = context.get(domain, recordId);
        if (!r) throw new BusinessError('NOT_FOUND', '无权访问或不存在', 404);
        return r;
      },
      create: (domain, body, recordId) => {
        const r = { ...structuredClone(body), id: recordId ?? `${domain}-${++f.state.counter}`,
          revision: 1, scope: f.scope, ownerId: f.actorId } as BusinessRecord;
        (f.state.records[domain] ??= []).push(r);
        return structuredClone(r);
      },
      update: (domain, recordId, patch) => {
        const rows = f.state.records[domain] ?? [];
        const index = rows.findIndex(r => r.id === recordId && r.ownerId === f.actorId && r.scope === f.scope);
        if (index < 0) throw new BusinessError('NOT_FOUND', '无权访问或不存在', 404);
        rows[index] = { ...rows[index], ...structuredClone(patch), revision: rows[index].revision + 1 };
        return structuredClone(rows[index]);
      },
      check: record => {
        if (record.revision !== f.expectedVersion) throw new BusinessError('VERSION_CONFLICT', '版本冲突', 409);
      },
      emit: (domain, objectId, type, payload = {}) => {
        f.state.events.push({ id: `event-${f.state.events.length + 1}`, sequence: f.state.events.length + 1,
          domain, objectId, type, payload: structuredClone(payload), actorId: f.actorId, at: f.now });
      },
      machine: machineId => f.machines[machineId] ? structuredClone(f.machines[machineId]) : undefined,
      executorReady: () => f.ready,
      emergencyStopped: () => f.emergency,
    };
    return context;
  }
  run(domain: Domain, command: string, payload: Record<string, any>, version = 0) {
    this.expectedVersion = version;
    const snapshot = structuredClone(this.state);
    try {
      const handler = workHandlers.find(h => h.domain === domain)!;
      return handler.execute(command, payload, this.context());
    } catch (error) { this.state = snapshot; throw error; }
  }
  get(domain: Domain, recordId: string) { return structuredClone(this.state.records[domain]?.find(r => r.id === recordId)!); }
  set(domain: Domain, recordId: string, patch: Record<string, any>) {
    Object.assign(this.state.records[domain]!.find(r => r.id === recordId)!, patch);
  }
}
const projectInput = { name: '家庭管家', description: '管理家庭服务', goal: '交付真实可管理的平台' };
const taskInput = (projectId: string) => ({ title: '实现家庭会话', projectId, machineId: 'local', agent: 'codex',
  mode: 'managed', goal: '实现完整家庭会话', criteria: '权限隔离与会话测试通过', budget: 50, retryLimit: 2 });
const reportInput = (taskId: string, overrides: Record<string, unknown> = {}) => ({ taskId, progress: 95,
  status: 'validating', artifacts: ['artifact-sha256-a'], evidence: '外部开发人员提交了构建和测试报告，等待人工审核',
  source: '本机人工登记 / 外部会话编号 123', ...overrides });
const acceptInput = (taskId: string, overrides: Record<string, unknown> = {}) => ({ taskId,
  acceptance: { outcome: 'pass', evidence: '人工审核记录 QA-001，核对交付内容与目标',
    tests: '人工复核已提交的隔离测试报告 TEST-001', artifacts: ['artifact-sha256-a'], ...overrides } });
function setup() {
  const f = new Fixture();
  const project = f.run('projects', 'register', projectInput);
  const task = f.run('tasks', 'create', taskInput(project.id));
  return { f, project, task };
}
function expectError(f: Fixture, code: string, work: () => unknown) {
  const snapshot = structuredClone(f.state);
  assert.throws(work, error => error instanceof BusinessError && error.code === code);
  assert.deepEqual(f.state, snapshot, '被拒绝命令必须回滚记录与事件');
}

test('真实 DTO 和命令覆盖严格遵循协议，不包含模拟字段', () => {
  const require = createRequire(import.meta.url);
  const Ajv = require('ajv');
  const spec = JSON.parse(readFileSync(new URL('../../../docs/openapi-v1-planned.json', import.meta.url), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema({ $id: 'urn:jarvis:v1:contract', components: spec.components });
  const valid = (name: string, value: unknown) => {
    const validator = ajv.compile({ $ref: `urn:jarvis:v1:contract#/components/schemas/${name}` });
    assert.equal(validator(value), true, JSON.stringify(validator.errors));
  };
  assert.deepEqual(workHandlers[0].commands, ['register', 'update', 'environment-info', 'copies', 'milestone', 'plan', 'archive']);
  assert.deepEqual(workHandlers[1].commands, ['create', 'start', 'pause', 'resume', 'cancel', 'retry', 'accept', 'package', 'report','limits']);
  const { f, project, task } = setup();
  valid('Project', project); valid('Task', task);
  const reported = f.run('tasks', 'report', reportInput(task.id), task.revision);
  valid('Task', reported);
  const accepted = f.run('tasks', 'accept', acceptInput(task.id), reported.revision);
  valid('Task', accepted);
  const packaged = f.run('tasks', 'package', { taskId: task.id, version: '1.0.0' }, accepted.revision);
  valid('Task', packaged); valid('Release', f.state.records.releases![0]);
});

test('创建绑定真实操作者与范围，拒绝额外字段、格式和错误版本', () => {
  const f = new Fixture(); f.actorId = 'wife'; f.scope = 'private';
  expectError(f, 'INVALID_INPUT', () => f.run('projects', 'register', { ...projectInput, ownerId: 'owner' }));
  expectError(f, 'INVALID_INPUT', () => f.run('projects', 'register', { ...projectInput, name: 'x'.repeat(301) }));
  expectError(f, 'VERSION_CONFLICT', () => f.run('projects', 'register', projectInput, 1));
  const project = f.run('projects', 'register', projectInput);
  assert.equal(project.ownerId, 'wife'); assert.equal(project.scope, 'private'); assert.equal(project.revision, 1);
  expectError(f, 'INVALID_INPUT', () => f.run('tasks', 'create', { ...taskInput(project.id), budget: Number.NaN }));
  expectError(f, 'INVALID_INPUT', () => f.run('tasks', 'create', { ...taskInput(project.id), deadline: 'tomorrow' }));
  expectError(f, 'INVALID_INPUT', () => f.run('tasks', 'create', { ...taskInput(project.id), autoComplete: true }));
});

test('所有目标修改先核对版本，跨操作者或范围引用不可访问', () => {
  const { f, project, task } = setup();
  expectError(f, 'VERSION_CONFLICT', () => f.run('tasks', 'report', reportInput(task.id), 0));
  expectError(f, 'VERSION_CONFLICT', () => f.run('projects', 'copies', { projectId: project.id, copies: [] }, 0));
  f.actorId = 'son';
  expectError(f, 'NOT_FOUND', () => f.run('tasks', 'create', taskInput(project.id)));
  expectError(f, 'NOT_FOUND', () => f.run('tasks', 'report', reportInput(task.id), task.revision));
  f.actorId = 'owner'; f.scope = 'family';
  expectError(f, 'NOT_FOUND', () => f.run('tasks', 'create', taskInput(project.id)));
});

test('项目副本仅登记真实设备引用，不访问路径；公司与只读节点仅观察', () => {
  const { f, project } = setup();
  expectError(f, 'NOT_FOUND', () => f.run('projects', 'copies', { projectId: project.id,
    copies: [{ machineId: 'missing', path: 'D:\\repo', branch: 'main', environment: 'development' }] }, project.revision));
  const copy = { machineId: 'local', path: 'Z:\\does-not-exist', branch: 'main', environment: 'development' };
  const updated = f.run('projects', 'copies', { projectId: project.id, copies: [copy] }, project.revision);
  assert.deepEqual(updated.copies, [copy]); assert.equal(updated.revision, 2);
  assert.equal(f.state.events.at(-1)!.payload.filesystemAccessed, false);
  expectError(f, 'INVALID_INPUT', () => f.run('projects', 'copies', { projectId: project.id, copies: [copy, copy] }, updated.revision));
  expectError(f, 'OBSERVE_ONLY', () => f.run('tasks', 'create', { ...taskInput(project.id), machineId: 'company' }));
  const observed = f.run('tasks', 'create', { ...taskInput(project.id), machineId: 'company', mode: 'observe' });
  assert.equal(observed.status, 'queued'); assert.equal(observed.lease, null);
  for (const command of ['start', 'pause', 'cancel']) expectError(f, 'OBSERVE_ONLY', () => f.run('tasks', command, { taskId: observed.id, reason: '测试' }, observed.revision));
  const report = f.run('tasks', 'report', reportInput(observed.id), observed.revision);
  assert.equal(report.status, 'validating'); assert.equal(report.lease, null);
  const other = new Fixture(); other.scope = 'company';
  const companyProject = other.run('projects', 'register', projectInput);
  expectError(other, 'OBSERVE_ONLY', () => other.run('tasks', 'create', taskInput(companyProject.id)));
});

test('无执行器绝不假运行，也不产生租约、费用、重试或伪造产物', () => {
  const { f, task } = setup();
  expectError(f, 'NOT_CONFIGURED', () => f.run('tasks', 'start', { taskId: task.id }, task.revision));
  f.ready = true;
  expectError(f, 'NOT_CONFIGURED', () => f.run('tasks', 'start', { taskId: task.id }, task.revision));
  f.ready = false;
  const paused = f.run('tasks', 'pause', { taskId: task.id, reason: '暂停排队记录' }, task.revision);
  assert.equal(paused.goal, task.goal); assert.equal(paused.progress, 0); assert.equal(paused.lease, null);
  assert.equal(paused.resumeStatus, 'queued');
  assert.equal(f.state.events.at(-1)!.payload.previousStatus, 'queued');
  assert.equal(f.state.events.at(-1)!.payload.controlEffect, 'record_only');
  expectError(f, 'NOT_CONFIGURED', () => f.run('tasks', 'resume', { taskId: task.id }, paused.revision));
  f.set('tasks', task.id, { status: 'failed' });
  expectError(f, 'NOT_CONFIGURED', () => f.run('tasks', 'retry', { taskId: task.id, reason: '重新尝试' }, paused.revision));
  const after = f.get('tasks', task.id);
  assert.equal(after.retries, 0); assert.equal(after.cost, 0); assert.deepEqual(after.artifacts, []);
});

test('启动、恢复及重试不能绕过急停、预算、期限、资源、前置交付或租约', () => {
  const { f, project, task } = setup();
  const start = () => f.run('tasks', 'start', { taskId: task.id }, task.revision);
  f.emergency = true; expectError(f, 'EMERGENCY_STOP', start); f.emergency = false;
  f.set('tasks', task.id, { cost: 50 }); expectError(f, 'BUDGET_EXHAUSTED', start);
  f.set('tasks', task.id, { cost: 0, deadline: '2026-10-05T07:59:00Z' }); expectError(f, 'DEADLINE_EXCEEDED', start);
  f.set('tasks', task.id, { deadline: null, machineId: 'remote' }); expectError(f, 'RESOURCE_UNAVAILABLE', start);
  f.set('tasks', task.id, { machineId: 'local' });
  const predecessor = f.run('tasks', 'create', { ...taskInput(project.id), title: '前置任务' });
  f.set('tasks', task.id, { dependsOn: predecessor.id }); expectError(f, 'DEPENDENCY_NOT_COMPLETE', start);
  f.set('tasks', predecessor.id, { status: 'completed', artifacts: ['artifact'], acceptance: { outcome: 'pass' } });
  f.set('tasks', task.id, { dependsOn: null });
  f.set('tasks', predecessor.id, { status: 'running', lease: { expiresAt: '2026-10-05T09:00:00Z' } });
  expectError(f, 'LEASE_CONFLICT', start);
  f.set('tasks', predecessor.id, { lease: { expiresAt: '2026-10-05T07:00:00Z' } });
  expectError(f, 'NOT_CONFIGURED', start);
  f.set('tasks', task.id, { status: 'failed', retries: 2 });
  expectError(f, 'RETRY_LIMIT', () => f.run('tasks', 'retry', { taskId: task.id, reason: '重试' }, task.revision));
});

test('任务依赖只能属于同项目，技能引用固定已发布版本', () => {
  const { f, project, task } = setup();
  const otherProject = f.run('projects', 'register', { ...projectInput, name: '另一项目' });
  expectError(f, 'INVALID_DEPENDENCY', () => f.run('tasks', 'create', { ...taskInput(otherProject.id), dependsOn: task.id }));
  const skill = f.context().create('experiences', { title: '范围隔离技能', content: '应用会话与授权核对',
    kind: 'skill', source: '人工校验', version: '1.0', verified: true, status: 'published' });
  const referenced = f.run('tasks', 'create', { ...taskInput(project.id), skillIds: [skill.id] });
  assert.deepEqual(referenced.skillRefs, [{ experienceId: skill.id, version: '1.0', at: f.now }]);
  f.set('experiences', skill.id, { version: '2.0' });
  assert.equal(f.get('tasks', referenced.id).skillRefs[0].version, '1.0');
  f.set('experiences', skill.id, { status: 'verified' });
  expectError(f, 'SKILL_NOT_PUBLISHED', () => f.run('tasks', 'create', { ...taskInput(project.id), skillIds: [skill.id] }));
  f.set('experiences', skill.id, { status: 'published', ownerId: 'son' });
  expectError(f, 'NOT_FOUND', () => f.run('tasks', 'create', { ...taskInput(project.id), skillIds: [skill.id] }));
});

test('里程碑计划生成真实排队依赖，重复规划复用，关联任务验收前不可完成里程碑', () => {
  const f = new Fixture();
  const project = f.run('projects', 'register', { ...projectInput, milestones: ['基础会话', '权限隔离', '交付审核'] });
  const planPayload = { projectId: project.id, machineId: 'local', agent: 'codex', budget: 30, retryLimit: 2 };
  const planned = f.run('projects', 'plan', planPayload, project.revision);
  const tasks = f.state.records.tasks!;
  assert.equal(tasks.length, 3); assert.deepEqual(tasks.map(t => t.status), ['queued', 'queued', 'queued']);
  assert.deepEqual(tasks.map(t => t.dependsOn), [null, tasks[0].id, tasks[1].id]);
  assert.ok(tasks.every(t => t.goal === project.goal && t.lease === null && t.cost === 0));
  assert.deepEqual(planned.milestones.map((m: any) => m.taskId), tasks.map(t => t.id));
  const replanned = f.run('projects', 'plan', planPayload, planned.revision);
  assert.equal(f.state.records.tasks!.length, 3); assert.equal(replanned.revision, 3);
  expectError(f, 'ACCEPTANCE_REQUIRED', () => f.run('projects', 'milestone', {
    projectId: project.id, milestoneId: 0, completed: true, evidence: '模型说做完了' }, replanned.revision));
  expectError(f, 'DEPENDENCY_NOT_COMPLETE', () => f.run('tasks', 'report', reportInput(tasks[1].id), tasks[1].revision));
  const reported = f.run('tasks', 'report', reportInput(tasks[0].id), tasks[0].revision);
  f.run('tasks', 'accept', acceptInput(tasks[0].id), reported.revision);
  const reviewed = f.run('projects', 'milestone', { projectId: project.id, milestoneId: 0, completed: true, evidence: '独立验收记录' }, replanned.revision);
  assert.equal(reviewed.milestones[0].reviewedBy, 'owner'); assert.equal(reviewed.status, 'active');
  const second = f.run('tasks', 'report', reportInput(tasks[1].id), tasks[1].revision);
  assert.equal(second.status, 'validating');
  expectError(f, 'ACTIVE_TASKS', () => f.run('projects', 'archive', { projectId: project.id, reason: '归档' }, reviewed.revision));
});

test('没有里程碑不能凭空生成计划，命令中途失败全事务回滚', () => {
  const f = new Fixture();
  const project = f.run('projects', 'register', projectInput);
  expectError(f, 'NO_MILESTONES', () => f.run('projects', 'plan', { projectId: project.id, machineId: 'local',
    agent: 'codex', budget: 30, retryLimit: 2 }, project.revision));
  const withMilestones = f.run('projects', 'register', { ...projectInput, milestones: ['第一项', '第二项'] });
  f.context().create('tasks', { ...taskInput(withMilestones.id), goal: withMilestones.goal, criteria: '完成里程碑：第二项', status: 'queued' });
  f.context().create('tasks', { ...taskInput(withMilestones.id), goal: withMilestones.goal, criteria: '完成里程碑：第二项', status: 'queued' });
  expectError(f, 'PLAN_CONFLICT', () => f.run('projects', 'plan', { projectId: withMilestones.id, machineId: 'local',
    agent: 'codex', budget: 30, retryLimit: 2 }, withMilestones.revision));
});

test('人工进度来源与证据保存在受权限保护的记录，审计只留元数据，不能直接完成或跳过验收', () => {
  const { f, task } = setup();
  expectError(f, 'INVALID_INPUT', () => f.run('tasks', 'report', reportInput(task.id, { status: 'completed' }), task.revision));
  expectError(f, 'INVALID_INPUT', () => f.run('tasks', 'report', reportInput(task.id, { source: ' ' }), task.revision));
  const reported = f.run('tasks', 'report', reportInput(task.id), task.revision);
  assert.equal(reported.status, 'validating'); assert.equal(reported.progress, 95); assert.equal(reported.acceptance, null);
  const event = f.state.events.at(-1)!;
  assert.equal(event.type, 'task.external_reported'); assert.equal(event.payload.executionDispatched, false);
  assert.equal(event.payload.verifiedByPlatform, false); assert.equal(event.payload.reportIndex, 0);
  assert.equal(event.payload.evidence, undefined); assert.equal(event.payload.source, undefined);
  assert.equal(reported.externalReports[0].source, reportInput(task.id).source);
  assert.equal(reported.externalReports[0].evidence, reportInput(task.id).evidence);
  assert.equal(reported.externalReports[0].verification, 'unverified_external');
  assert.equal(reported.externalReports[0].actorId, f.actorId);
  expectError(f, 'PROGRESS_REGRESSION', () => f.run('tasks', 'report', reportInput(task.id, { progress: 50 }), reported.revision));
  expectError(f, 'ACCEPTANCE_REQUIRED', () => f.run('tasks', 'package', { taskId: task.id, version: '1.0' }, reported.revision));
  expectError(f, 'UNKNOWN_ARTIFACT', () => f.run('tasks', 'accept', acceptInput(task.id, { artifacts: ['invented'] }), reported.revision));
  expectError(f, 'ARTIFACTS_REQUIRED', () => f.run('tasks', 'accept', acceptInput(task.id, { artifacts: [] }), reported.revision));
  expectError(f, 'INVALID_INPUT', () => f.run('tasks', 'accept', acceptInput(task.id, { tests: '' }), reported.revision));
  f.set('tasks', task.id, { lease: { id: 'real-lease' } });
  expectError(f, 'LEASE_CONFLICT', () => f.run('tasks', 'report', reportInput(task.id), reported.revision));
});

test('独立验收通过后生成不可覆盖的交付版本，重复包幂等且不是上线授权', () => {
  const { f, project, task } = setup();
  expectError(f, 'INVALID_STATE', () => f.run('tasks', 'accept', acceptInput(task.id), task.revision));
  const reported = f.run('tasks', 'report', reportInput(task.id), task.revision);
  const accepted = f.run('tasks', 'accept', acceptInput(task.id), reported.revision);
  assert.equal(accepted.status, 'completed'); assert.equal(accepted.progress, 100);
  assert.equal(accepted.acceptance.reviewerId, 'owner'); assert.equal(accepted.acceptance.at, f.now);
  const packaged = f.run('tasks', 'package', { taskId: task.id, version: '1.0', criteria: '发布前另行申请' }, accepted.revision);
  const release = structuredClone(f.state.records.releases![0]);
  assert.deepEqual(release.artifactIds, accepted.artifacts); assert.deepEqual(release.acceptance, accepted.acceptance);
  assert.equal(release.revision, 1); assert.equal(release.ownerId, 'owner'); assert.equal(release.scope, 'personal');
  assert.equal(f.state.events.find(e => e.type === 'task.packaged')!.payload.deploymentAuthorized, false);
  const before = structuredClone(f.state);
  const same = f.run('tasks', 'package', { taskId: task.id, version: '1.0' }, packaged.revision);
  assert.equal(same.revision, packaged.revision); assert.deepEqual(f.state, before);
  const other = f.run('tasks', 'create', { ...taskInput(project.id), title: '另一交付' });
  const report = f.run('tasks', 'report', reportInput(other.id), other.revision);
  const pass = f.run('tasks', 'accept', acceptInput(other.id), report.revision);
  expectError(f, 'RELEASE_VERSION_CONFLICT', () => f.run('tasks', 'package', { taskId: other.id, version: '1.0' }, pass.revision));
  assert.deepEqual(f.state.records.releases![0], release);
  expectError(f, 'INVALID_STATE', () => f.run('tasks', 'report', reportInput(task.id), packaged.revision));
});

test('验收不通过保留失败证据；取消释放登记租约；归档保留历史', () => {
  const { f, project, task } = setup();
  const report = f.run('tasks', 'report', reportInput(task.id), task.revision);
  const rejected = f.run('tasks', 'accept', acceptInput(task.id, { outcome: 'fail', evidence: '隔离失败', tests: 'TEST-002失败', artifacts: [] }), report.revision);
  assert.equal(rejected.status, 'failed'); assert.equal(rejected.acceptance.outcome, 'fail'); assert.equal(rejected.progress, 95);
  assert.equal(rejected.acceptance.tests, 'TEST-002失败');
  assert.equal(f.state.events.at(-1)!.payload.tests, undefined);
  expectError(f, 'ACCEPTANCE_REQUIRED', () => f.run('tasks', 'package', { taskId: task.id, version: '1.0' }, rejected.revision));
  const waiting = f.run('tasks', 'create', taskInput(project.id));
  f.set('tasks', waiting.id, { lease: { id: 'registered-lease' } });
  const cancelled = f.run('tasks', 'cancel', { taskId: waiting.id, reason: '停止托管登记' }, waiting.revision);
  assert.equal(cancelled.lease, null); assert.equal(cancelled.status, 'cancelled');
  const archived = f.run('projects', 'archive', { projectId: project.id, reason: '保留项目历史' }, project.revision);
  assert.equal(archived.status, 'archived'); assert.equal(f.state.records.tasks!.length, 2);
  expectError(f, 'INVALID_STATE', () => f.run('tasks', 'create', taskInput(project.id)));
});

test('复用已有排队任务补齐依赖，不能悄悄改写运行中的任务', () => {
  const f = new Fixture();
  const project = f.run('projects', 'register', { ...projectInput, milestones: ['第一阶段', '第二阶段'] });
  const existing = f.run('tasks', 'create', { ...taskInput(project.id), goal: project.goal, criteria: '完成里程碑：第二阶段' });
  const payload = { projectId: project.id, machineId: 'local', agent: 'codex', budget: 50, retryLimit: 2 };
  const plan = f.run('projects', 'plan', payload, project.revision);
  assert.equal(f.state.records.tasks!.length, 2);
  assert.equal(plan.milestones[1].taskId, existing.id);
  const reused = f.get('tasks', existing.id);
  assert.equal(reused.dependsOn, plan.milestones[0].taskId); assert.equal(reused.revision, 2);
  assert.equal(reused.goal, existing.goal);
  const other = new Fixture();
  const p = other.run('projects', 'register', { ...projectInput, milestones: ['第一阶段', '第二阶段'] });
  const active = other.run('tasks', 'create', { ...taskInput(p.id), goal: p.goal, criteria: '完成里程碑：第二阶段' });
  other.set('tasks', active.id, { status: 'running' });
  expectError(other, 'PLAN_CONFLICT', () => other.run('projects', 'plan', { ...payload, projectId: p.id }, p.revision));
});

test('报告保留完整来源历史、暂停前阶段及上限，里程碑不提前关闭未完成任务', () => {
  const { f, project, task } = setup();
  const running = f.run('tasks', 'report', reportInput(task.id, { status: 'running', progress: 40 }), task.revision);
  const paused = f.run('tasks', 'report', reportInput(task.id, { status: 'paused', progress: 40, source: '人工停下来排查' }), running.revision);
  assert.equal(paused.resumeStatus, 'running'); assert.equal(paused.externalReports.length, 2);
  assert.equal(paused.externalReports[0].source, reportInput(task.id).source);
  const validating = f.run('tasks', 'report', reportInput(task.id), paused.revision);
  assert.equal(validating.resumeStatus, null); assert.equal(validating.externalReports.length, 3);
  const sample = validating.externalReports[0];
  f.set('tasks', task.id, { externalReports: Array.from({ length: 1000 }, () => structuredClone(sample)) });
  expectError(f, 'HISTORY_LIMIT', () => f.run('tasks', 'report', reportInput(task.id), validating.revision));
  f.set('projects', project.id, { milestones: [{ id: 0, title: '人工登记的交付目标', completed: false }] });
  const reviewed = f.run('projects', 'milestone', { projectId: project.id, milestoneId: 0, completed: true, evidence: '目标已有单独证据，关联工作仍待验收' }, project.revision);
  assert.equal(reviewed.status, 'active');
});
