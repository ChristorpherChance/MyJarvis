import type { DemoData } from './types';
import { V1Error, v1Command, type V1Domain, type V1Record, type V1Scope } from '../v1-client';
import { clearInboxDrafts } from '../features/operations/inbox-draft';

type Values = Record<string, any>;
type Operation = { domain: V1Domain; command: string; body: Record<string, unknown>; scope: V1Scope; version: number };
const pendingCommands = new Map<string, { id: string; promise?: Promise<unknown> }>();
const explicitCaptureCommands = new Map<string, { fingerprint: string; operation: Operation; promise?: Promise<unknown>; completed?: boolean; result?: unknown }>();
export const clearLiveOperationSession=()=>{
  pendingCommands.clear();
  explicitCaptureCommands.clear();
  // Failure to access localStorage must never prevent the authentication state from being cleared.
  try { clearInboxDrafts(); return true; } catch { return false; }
};
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const textList = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : String(value || '').split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
const optional = (value: unknown): string | undefined => value === undefined || value === null || String(value).trim() === '' ? undefined : String(value);
const fields = (input: Values, keys: string[]): Values => Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
const notConfigured = (message: string): never => { throw new V1Error(message + '；尚未接入，未修改真实记录。', 503, 'NOT_CONFIGURED'); };
const scopes = new Set(['personal', 'private', 'family', 'company']);
function copy(input: Values) { return { machineId: input.machineId || input.machine, path: input.path, branch: input.branch, environment: input.environment || 'development' }; }
export function validateCapturePolicySelection(machine:Values|undefined,project:Values|undefined,scope:unknown):void {
 if(!machine)throw new V1Error('请选择可访问的采集设备。',400,'INVALID_INPUT');
 const observationOnly=machine.readOnly===true||machine.readonly===true||machine.company===true||machine.scope==='company'||/公司|企业|company/i.test(String(machine.role??''));
 if((observationOnly||scope==='company')&&!(scope==='company'&&project?.scope==='company'))throw new V1Error('公司或只读设备须绑定明确公司项目，并选择公司范围。',403,'FORBIDDEN');
 if(project&&project.scope!==scope)throw new V1Error('指定项目与授权范围必须一致。',403,'FORBIDDEN');
}

/** Translate approved UI commands without reading or writing the demonstration reducer. */
function translate(action: string, payload: Values, data: DemoData, records: Record<V1Domain, V1Record[]>): Operation {
  const domains: Record<string, V1Domain> = { 'op.inbox': 'inbox', 'op.research': 'research', 'op.project': 'projects', 'op.task': 'tasks', 'op.experience': 'experiences' };
  const domain = domains[action];
  if (!domain) notConfigured('此管理操作');
  const p: Values = payload.patch && typeof payload.patch === 'object' ? payload.patch : {};
  const record = payload.id ? records[domain].find(r => r.id === payload.id) : undefined;
  if (payload.id && !record) throw new V1Error('记录已不可访问，请刷新后重试。', 404, 'NOT_FOUND');
  const project = domain === 'tasks' && payload.command === 'create' ? records.projects.find(r => r.id === (p.projectId || p.project)) : undefined;
  const scope = payload.recordScope ?? record?.scope ?? project?.scope ?? p.scope ?? payload.scope ?? 'personal';
  if (!scopes.has(scope)) throw new V1Error('请选择有效的可见范围。', 400, 'INVALID_INPUT');
  const version = payload.expectedVersion ?? record?.revision ?? 0;
  if (!Number.isInteger(version) || version < 0) throw new V1Error('记录修订版本无效，请重新打开表单。', 400, 'INVALID_INPUT');
  let command = String(payload.command || ''), body: Values = {};
  const id = String(payload.id || '');
  if (domain === 'inbox') {
    if (command === 'capture') {
      if (p.origin && p.origin !== 'manual') notConfigured('语音与设备自动收件');
      body = { rawText: p.rawText ?? p.text ?? '', ...(optional(p.title) ? { title: p.title } : {}), kind: p.kind, terminalId: p.terminalId ?? p.terminal, origin: 'manual', ...(optional(p.projectId ?? p.project) ? { projectId: p.projectId ?? p.project } : {}), ...(optional(p.sourceUrl)?{sourceUrl:p.sourceUrl}:{}), ...(p.attachmentIds!==undefined?{attachmentIds:p.attachmentIds}:{}) };
    } else if (command === 'update' || command === 'annotate') {
      command = 'annotate'; body = { inboxId: id, note: p.note ?? p.annotation, ...(p.title !== undefined ? { title: p.title } : {}), ...(p.kind !== undefined ? { kind: p.kind } : {}), ...(p.tags !== undefined ? { tags: textList(p.tags) } : {}) };
    } else if (command === 'route') body = { inboxId: id, target: payload.target, ...(payload.kind ? { kind: payload.kind } : {}) };
    else if (command === 'merge') body = { sourceId: id, targetId: payload.baseId, reason: payload.reason };
    else if (command === 'ignore') body = { inboxId: id, reason: payload.reason };
    else if (command === 'policy') {
      validateCapturePolicySelection(data.machines?.find(m=>m.id===(p.machineId||p.machine)),(p.projectId??p.project)?records.projects?.find(project=>project.id===(p.projectId??p.project))??data.projects?.find(project=>project.id===(p.projectId??p.project)):undefined,scope);
      command = 'capture-policy'; body = { machineId: p.machineId || p.machine, fields: textList(p.fields), consent: p.consent, enabled: p.enabled, ...(optional(p.projectId ?? p.project) ? { projectId: p.projectId ?? p.project } : {}) };
    } else if (command === 'keep-independent') body = { inboxId: id, reason: payload.reason };
    else if (command === 'passive') notConfigured('终端被动采集器');
    else notConfigured('此收件操作');
  } else if (domain === 'research') {
    if (command === 'create') body = { title: p.title, raw: p.raw, ...(optional(p.terminalId ?? p.terminal) ? { terminalId: p.terminalId ?? p.terminal } : {}) };
    else if (command === 'discuss') body = { researchId: id, ...fields(p, ['text', 'question', 'criteria']), ...(p.hypotheses !== undefined ? { hypotheses: textList(p.hypotheses) } : {}) };
    else if (command === 'evidence') body = { researchId: id, kind: p.kind ?? p.type, ...fields(p, ['title', 'summary', 'source', 'locator', 'status']) };
    else if (command === 'option') body = { researchId: id, ...fields(p, ['title', 'approach', 'risk', 'effort', 'benefit', 'recommended']), ...(p.budget !== undefined && p.budget !== '' ? { budget: Number(p.budget) } : {}) };
    else if (command === 'remove-option') body={researchId:id,optionId:payload.optionId??p.optionId,reason:payload.reason??p.reason};
    else if (command === 'start') body={researchId:id,question:p.question??record?.question,criteria:p.criteria??record?.criteria,plan:{budget:Number(p.plan?.budget??p.budget),minutes:Number(p.plan?.minutes??p.minutes),retryLimit:Number(p.plan?.retryLimit??p.retryLimit??0),machineId:p.plan?.machineId??p.plan?.machine??p.machineId??p.machine??'local'}};
    else if (command === 'pause') body={researchId:id,reason:payload.reason??p.reason};
    else if (command === 'decide') body = { researchId: id, choice: payload.choice, reason: payload.reason, ...(optional(payload.optionId) ? { optionId: payload.optionId } : {}) };
    else if (command === 'convert') body = { researchId: id, name: p.name, description: p.description ?? p.desc, goal: p.goal, repo: p.repo || '', milestones: textList(p.milestones), copies: Array.isArray(p.copies) ? p.copies.map(copy) : optional(p.path) ? [copy(p)] : [] };
    else notConfigured(command === 'start' ? '后台研究执行器' : '此后台研究控制');
  } else if (domain === 'projects') {
    if (command === 'create') {
      command = 'register'; body = { name: p.name, description: p.description ?? p.desc, goal: p.goal, ...(p.repo !== undefined ? { repo: p.repo } : {}), milestones: textList(p.milestones), ...(p.copies !== undefined ? { copies: p.copies.map(copy) } : {}) };
    } else if (command === 'update' && Array.isArray(p.copies)) {
      command = 'copies'; body = { projectId: id, copies: p.copies.map(copy) };
    } else if(command==='update'&&p.environmentInfo){command='environment-info';body={projectId:id,environmentInfo:fields(p.environmentInfo,['environment','runCommand','verifyCommand','notes'])};
    } else if(command==='environment-info'){body={projectId:id,environmentInfo:fields(p.environmentInfo??p,['environment','runCommand','verifyCommand','notes'])};
    } else if(command==='update') {body={projectId:id,name:p.name,description:p.description??p.desc,goal:p.goal,repo:p.repo??''};
    } else if (command === 'milestone') body = { projectId: id, milestoneId: Number(payload.milestoneId), completed: payload.completed, evidence: payload.evidence };
    else if (command === 'plan') body = { projectId: id, machineId: p.machineId ?? p.machine, ...fields(p, ['agent', 'budget', 'retryLimit']) };
    else if (command === 'archive') body = { projectId: id, reason: payload.reason };
    else notConfigured('项目基本资料与环境资料编辑');
  } else if (domain === 'tasks') {
    if (command === 'create') {
      if (!project) throw new V1Error('请选择已登记的项目。', 400, 'INVALID_INPUT');
      body = { title: p.title, projectId: p.projectId ?? p.project, machineId: p.machineId ?? p.machine, ...fields(p, ['agent', 'mode', 'goal', 'criteria', 'budget', 'retryLimit']), skillIds: textList(p.skillIds ?? p.skills), ...(optional(p.dependsOn) ? { dependsOn: p.dependsOn } : {}), ...(optional(p.worktree) ? { worktree: p.worktree } : {}), ...(optional(p.sessionId ?? p.session) ? { sessionId: p.sessionId ?? p.session } : {}), ...(optional(p.deadline) ? { deadline: p.deadline } : {}) };
    } else if (['start','resume','retry'].includes(command)) body={taskId:id,...(optional(payload.reason)?{reason:payload.reason}:{})};
    else if (command === 'report') body = { taskId: id, ...fields(p, ['progress', 'status', 'evidence', 'source']), artifacts: textList(p.artifacts) };
    else if (command === 'pause' || command === 'stop' || command === 'cancel') { command = command === 'stop' ? 'cancel' : command; body = { taskId: id, reason: payload.reason }; }
    else if (command === 'validate') { command = 'accept'; body = { taskId: id, acceptance: { outcome: payload.outcome, evidence: p.evidence, tests: p.tests, artifacts: textList(p.artifacts) } }; }
    else if (command === 'package') body = { taskId: id, version: p.version, ...(optional(p.criteria) ? { criteria: p.criteria } : {}) };
    else if(['limits','policy','requestBudget'].includes(command)){command='limits';body={taskId:id,budget:Number(p.budget??record?.budget),retryLimit:Number(p.retryLimit??record?.retryLimit),reason:payload.reason??p.reason,...fields(p,['goal','criteria']),...(p.deadline!==undefined?{deadline:optional(p.deadline)?new Date(p.deadline).toISOString():null}:{})};}
    else notConfigured(['start', 'resume', 'retry', 'advance'].includes(command) ? '开发执行器与自动监督' : '任务预算与停止边界编辑');
  } else if (domain === 'experiences') {
    if (command === 'create') {
      command = 'capture'; body = { title: p.title, content: p.content, kind: p.kind, source: p.source, ...fields(p,['conditions','summary']),...(p.tags!==undefined?{tags:textList(p.tags)}:{}),...(optional(p.projectId??p.project)?{projectId:p.projectId??p.project}:{}), ...(optional(p.terminalId ?? p.machine) ? { terminalId: p.terminalId ?? p.machine } : {}) };
    } else if(command==='update'){body={experienceId:id,...fields(p,['title','content','source','kind','conditions','summary']),tags:textList(p.tags),...(optional(p.projectId??p.project)?{projectId:p.projectId??p.project}:{}),...(optional(p.terminalId??p.machine)?{terminalId:p.terminalId??p.machine}:{})};
    } else if(command==='archive'){body={experienceId:id,reason:payload.reason??p.reason};
    } else if (command === 'verify') body = { experienceId: id, evidence: payload.evidence, conditions: p.conditions };
    else if (command === 'merge') body = { experienceId: id, baseId: payload.baseId, reason: payload.reason };
    else if (command === 'publish' || command === 'version') { command = command === 'publish' ? 'skill-publish' : command; body = { experienceId: id, ...fields(p, ['version', 'content', 'conditions', 'evidence']) }; }
    else if (command === 'reuse') body = { experienceId: id, version: payload.version ?? record?.version, ...(optional(payload.taskId) ? { taskId: payload.taskId } : { projectId: payload.projectId }) };
    else if (command === 'deprecate') body = { experienceId: id, reason: payload.reason };
    else notConfigured(command === 'archive' ? '私人经验移除' : '经验正文编辑');
  }
  return { domain, command, body, scope: scope as V1Scope, version };
}

/** A retry of an uncertain network outcome reuses its receipt ID and immutable input snapshot. */
export async function executeLiveOperation(action: string, payload: Record<string, unknown>, data: DemoData, records: Record<V1Domain, V1Record[]>): Promise<unknown> {
  const operation = translate(action, payload, data, records);
  const key = stable(operation);
  if (payload.commandId !== undefined) {
    if (action !== 'op.inbox' || operation.command !== 'capture' || typeof payload.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.commandId)) {
      throw new V1Error('快速记录的命令编号无效，请重新打开草稿。', 400, 'INVALID_INPUT');
    }
    const actorId = data.runtime?.capabilities?.identity?.actorId;
    if (typeof actorId !== 'string' || !actorId.trim()) throw new V1Error('登录身份尚未确认，请刷新后再保存草稿。', 400, 'INVALID_INPUT');
    const explicitKey = stable([actorId, payload.commandId]);
    let explicit = explicitCaptureCommands.get(explicitKey);
    if (explicit && explicit.fingerprint !== key) throw new V1Error('同一草稿编号不能提交不同内容，请恢复原稿或另建新稿。', 409, 'COMMAND_ID_REUSED');
    if (explicit?.completed) return explicit.result;
    if (explicit?.promise) return explicit.promise;
    if (!explicit) {
      explicit = { fingerprint: key, operation: JSON.parse(key) as Operation };
      explicitCaptureCommands.set(explicitKey, explicit);
    }
    const snapshot = explicit.operation, entry = explicit;
    const promise = v1Command(snapshot.domain, snapshot.command, snapshot.body, snapshot.scope, snapshot.version, payload.commandId)
      .then(result => { entry.completed = true; entry.result = result; entry.promise = undefined; return result; })
      .catch(error => { entry.promise = undefined; throw error; });
    entry.promise = promise;
    return promise;
  }
  let pending = pendingCommands.get(key);
  if (pending?.promise) return pending.promise;
  if (!pending) { pending = { id: crypto.randomUUID() }; pendingCommands.set(key, pending); }
  const id = pending.id;
  const promise = v1Command(operation.domain, operation.command, operation.body, operation.scope, operation.version, id)
    .then(result => { pendingCommands.delete(key); return result; })
    .catch(error => {
      const current = pendingCommands.get(key);
      if (current?.id === id) current.promise = undefined;
      throw error;
    });
  pending.promise = promise;
  return promise;
}
