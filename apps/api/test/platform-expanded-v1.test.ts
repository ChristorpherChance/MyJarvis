import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import type { PiService } from '../src/pi.js';

type RunResult = { text: string; status: 'complete' | 'failed' | 'cancelled' };
class FakePi {
  configured = true;
  hold = false;
  deliverAfterAbort = false;
  calls: any[] = [];
  aborts: string[] = [];
  answer = '隔离测试智能分析：这是未验证草稿，需人工复核。';
  private waiting = new Map<string, (result: RunResult) => void>();
  async initialize() {}
  health() { return { configured: this.configured }; }
  async dispose() { for (const finish of this.waiting.values()) finish({ text: '', status: 'cancelled' }); this.waiting.clear(); }
  async run(input: any): Promise<RunResult> {
    this.calls.push(input);
    if (this.hold) return new Promise(resolve => this.waiting.set(input.conversationId, resolve));
    return { text: this.answer, status: 'complete' };
  }
  async abort(conversationId: string, _actorId: string) {
    this.aborts.push(conversationId); const finish = this.waiting.get(conversationId);
    if (finish && !this.deliverAfterAbort) { this.waiting.delete(conversationId); finish({ text: '', status: 'cancelled' }); }
    return true;
  }
  finish(conversationId: string, result: RunResult = { text: this.answer, status: 'complete' }) {
    const done = this.waiting.get(conversationId); assert.ok(done, '待处理的fake Pi调用应存在'); this.waiting.delete(conversationId); done(result);
  }
}
async function fixture(pi = new FakePi()) {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-expanded-http-'));
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  let runtime = await createApp({ dataDir: dir, pi: pi as unknown as PiService, webDir: join(dir, 'absent') });
  const setup = await runtime.app.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: 'temporary-expanded-platform-test-passphrase' } });
  assert.equal(setup.statusCode, 200, setup.body);
  const headers = { cookie: String(setup.headers['set-cookie']).split(';')[0] };
  return {
    dir, pi, headers, get runtime() { return runtime; },
    body(payload: Record<string, any>, version = 0, scope = 'private', commandId = randomUUID()) { return { commandId, expectedVersion: version, scope, payload }; },
    async command(domain: string, command: string, payload: Record<string, any>, version = 0, scope = 'private', commandId = randomUUID()) { return runtime.app.inject({ method: 'POST', url: `/api/v1/${domain}/commands/${command}`, headers, payload: { commandId, expectedVersion: version, scope, payload } }); },
    async read(domain: string, id: string) { const response = await runtime.app.inject({ url: `/api/v1/${domain}/${id}`, headers }); assert.equal(response.statusCode, 200, response.body); return response.json().data; },
    async list(domain: string) { const response = await runtime.app.inject({ url: `/api/v1/${domain}?limit=100`, headers }); assert.equal(response.statusCode, 200, response.body); return response.json().data.items; },
    async restart() { await runtime.app.close(); runtime = await createApp({ dataDir: dir, pi: pi as unknown as PiService, webDir: join(dir, 'absent') }); },
    async close() { await runtime.app.close(); const absolute = resolve(dir); assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && absolute.includes('jarvis-expanded-http-')); await rm(absolute, { recursive: true, force: true }); }
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const committed = (response: any) => { assert.equal(response.statusCode, 200, response.body); return response.json().data; };
async function waitFor<T>(read: () => T | undefined, accept: (value: T) => boolean, label: string): Promise<T> {
  const end = Date.now() + 7000;
  while (Date.now() < end) { const value = read(); if (value && accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 30)); }
  assert.fail('超时：' + label);
}
const current = (f: Fixture, domain: any, id: string) => f.runtime.v1.read(domain, id, 'server-admin');
async function voiceSession(f: Fixture, text = '帮我记录一个新的读书灵感') {
  const session = committed(await f.command('voice', 'session', { terminalId: 'local', roomId: 'study', profileId: 'me' }));
  const transcribed = committed(await f.command('voice', 'transcript', { sessionId: session.id, text, final: true, origin: 'manual', language: '中文' }, session.revision));
  return { session, transcribed };
}

test('Pi作业鉴权、无配置503、严格DTO和内部状态转换不可被HTTP客户端伪造', async () => {
  const pi = new FakePi(); pi.configured = false; const f = await fixture(pi);
  try {
    assert.equal((await f.runtime.app.inject({ url: '/api/v1/jobs' })).statusCode, 401);
    const payload = { kind: 'research', title: '隔离研究', instruction: '比较两条人工方案，并说明未知' };
    const anonymous = await f.runtime.app.inject({ method: 'POST', url: '/api/v1/jobs/commands/create', payload: f.body(payload) }); assert.equal(anonymous.statusCode, 401);
    const unavailable = await f.command('jobs', 'create', payload); assert.equal(unavailable.statusCode, 503, unavailable.body); assert.equal(unavailable.json().code, 'NOT_CONFIGURED');
    assert.equal((await f.list('jobs')).length, 0); assert.equal(pi.calls.length, 0);
    const forged = await f.command('jobs', 'create', { ...payload, ownerId: 'another-member' }); assert.equal(forged.statusCode, 400, forged.body);
    const unsafe = await f.command('jobs', 'running', { jobId: 'invented' }); assert.equal(unsafe.statusCode, 404, unsafe.body);
    const settle = await f.command('jobs', 'settle', { jobId: 'invented', status: 'completed', result: '伪造完成' }); assert.equal(settle.statusCode, 404, settle.body);
  } finally { await f.close(); }
});

test('真实来源修订/范围与幂等绑定；Pi草稿不改研究证据，取消有真实abort回执', async () => {
  const pi = new FakePi(); pi.hold = true; const f = await fixture(pi);
  try {
    const research = committed(await f.command('research', 'create', { title: '需要核对来源的研究', raw: '人工原始想法' }));
    const input = { kind: 'research', title: '比较方案', instruction: '给出待审核分析', sourceId: research.id, sourceVersion: research.revision };
    const stale = await f.command('jobs', 'create', { ...input, sourceVersion: research.revision + 1 }); assert.equal(stale.statusCode, 409, stale.body);
    const cross = await f.command('jobs', 'create', input, 0, 'family'); assert.equal(cross.statusCode, 403, cross.body);
    assert.equal((await f.list('jobs')).length, 0);
    const commandId = randomUUID(), created = await f.command('jobs', 'create', input, 0, 'private', commandId), job = committed(created);
    const replay = await f.command('jobs', 'create', input, 0, 'private', commandId); assert.deepEqual(replay.json(), created.json()); assert.equal((await f.list('jobs')).length, 1);
    await waitFor(() => current(f, 'jobs', job.id), value => value.status === 'running', '作业真实进入运行'); assert.equal(pi.calls.length, 1);
    const concurrent = await f.command('jobs', 'create', input); assert.equal(concurrent.statusCode, 409, concurrent.body);
    const discussed = committed(await f.command('research', 'discuss', { researchId: research.id, text: '人工补充了判断依据' }, research.revision));
    pi.finish('job-' + job.id);
    const completed = await waitFor(() => current(f, 'jobs', job.id), value => value.status === 'completed', '来源变化后的Pi草稿结束');
    assert.equal(completed.sourceStale, true); assert.equal(completed.sourceSnapshot.raw, research.raw); assert.equal(completed.execution.externalExecution, false); assert.equal(completed.execution.toolsEnabled, false); assert.equal(completed.execution.promptRunsLimit, 1); assert.equal(pi.calls[0].boundedJob, true);
    const unchanged = await f.read('research', research.id); assert.equal(unchanged.revision, discussed.revision); assert.equal(unchanged.evidence.length, 0);
    const second = committed(await f.command('jobs', 'create', { ...input, sourceVersion: discussed.revision }));
    const running = await waitFor(() => current(f, 'jobs', second.id), value => value.status === 'running', '可取消的Pi作业进入运行');
    const wrongScope = await f.command('jobs', 'cancel', { jobId: second.id }, running.revision, 'family'); assert.equal(wrongScope.statusCode, 403, wrongScope.body);
    const cancelled = committed(await f.command('jobs', 'cancel', { jobId: second.id }, running.revision)); assert.equal(cancelled.status, 'cancelled'); assert.ok(pi.aborts.includes('job-' + second.id));
    const after = await f.read('jobs', second.id); assert.equal(after.status, 'cancelled'); assert.equal(after.result, null);
    assert.equal(pi.calls.length, 2); assert.equal((await f.list('inbox')).length, 0);
  } finally { await f.close(); }
});

test('书房手工字幕→fake Pi意图→明确确认，确认前无业务记录，重放只生成一条收件', async () => {
  const pi = new FakePi(); pi.answer = JSON.stringify({ alternatives: [{ title: '保存读书灵感', command: 'inbox.capture', effect: '把原话放入收件待整理' }, { title: '建立研究问题', command: 'research.create', effect: '记录成待讨论研究' }] });
  const f = await fixture(pi);
  try {
    const { session, transcribed } = await voiceSession(f);
    const asr = await f.command('voice', 'transcript', { sessionId: session.id, text: '不能伪称识别', final: true, origin: 'asr' }, transcribed.revision); assert.equal(asr.statusCode, 503, asr.body);
    const forged = await f.command('voice', 'intent-result', { sessionId: session.id, alternatives: [{ command: 'services.restart' }] }, transcribed.revision); assert.equal(forged.statusCode, 404, forged.body);
    const analyzing = committed(await f.command('voice', 'intent', { sessionId: session.id, transcriptId: transcribed.transcripts.at(-1).id }, transcribed.revision)); assert.equal(analyzing.status, 'analyzing');
    const proposed = await waitFor(() => current(f, 'voice', session.id), value => value.status === 'proposed', 'Pi返回仅待确认的方案');
    assert.equal((await f.list('inbox')).length, 0); assert.equal((await f.list('research')).length, 0); assert.equal(pi.calls.length, 1);
    const intent = proposed.intents.at(-1), alternative = intent.alternatives.find((value: any) => value.command === 'inbox.capture'); assert.equal(alternative.requiresConfirmation, true);
    const payload = { sessionId: session.id, intentId: intent.id, alternativeId: alternative.id, targetVersion: 0, confirmed: true };
    const invalid = await f.command('voice', 'confirm', { ...payload, targetVersion: 1 }, proposed.revision); assert.equal(invalid.statusCode, 409, invalid.body); assert.equal((await f.list('inbox')).length, 0);
    const commandId = randomUUID(), confirmation = await f.command('voice', 'confirm', payload, proposed.revision, 'private', commandId), confirmed = committed(confirmation);
    assert.equal(confirmed.status, 'confirmed'); assert.equal(confirmed.lastReceipt.executed, true); assert.equal(confirmed.lastReceipt.targetDomain, 'inbox');
    const replay = await f.command('voice', 'confirm', payload, proposed.revision, 'private', commandId); assert.deepEqual(replay.json(), confirmation.json());
    const twice = await f.command('voice', 'confirm', payload, confirmed.revision); assert.equal(twice.statusCode, 409, twice.body);
    const inbox = await f.list('inbox'); assert.equal(inbox.length, 1); assert.equal(inbox[0].rawText, transcribed.transcripts.at(-1).text); assert.equal(inbox[0].origin, 'manual'); assert.equal((await f.list('research')).length, 0);
    const tts = await f.command('voice', 'tts', { sessionId: session.id, text: '朗读', voiceId: 'clear' }, confirmed.revision); assert.equal(tts.statusCode,process.platform==='win32'?200:503,tts.body);if(tts.statusCode===200){assert.equal(tts.json().data.speech.playback,'not-started');assert.ok(tts.json().data.speech.jobId);}
  } finally { await f.close(); }
});

test('模型输出恶意控制命令只会使意图失败，不能进入确认或操纵服务', async () => {
  const pi = new FakePi(); pi.answer = JSON.stringify({ alternatives: [{ title: '危险动作', command: 'services.restart', effect: '绕过确认重启' }] });
  const f = await fixture(pi);
  try {
    const { session, transcribed } = await voiceSession(f, '测试危险意图的拒绝流程');
    const analyzing = committed(await f.command('voice', 'intent', { sessionId: session.id, transcriptId: transcribed.transcripts.at(-1).id }, transcribed.revision));
    const job = await waitFor(() => current(f, 'jobs', analyzing.jobId), value => value.status === 'failed', '不在白名单的模型意图必须失败'); assert.equal(job.result, null);
    const voice = await waitFor(() => current(f, 'voice', session.id), value => value.status === 'failed', '语音会话显示失败并停止等待');
    assert.equal(voice.intents.length, 0); assert.ok(voice.error); assert.equal((await f.list('inbox')).length, 0); assert.equal((await f.list('research')).length, 0); assert.equal((await f.list('services')).length, 0); assert.equal((await f.list('approvals')).length, 0);
  } finally { await f.close(); }
});

test('打断正在分析的语音会话会取消Pi作业，旧方案不能再形成业务记录', async () => {
  const pi = new FakePi(); pi.hold = true; const f = await fixture(pi);
  try {
    const { session, transcribed } = await voiceSession(f);
    const analyzing = committed(await f.command('voice', 'intent', { sessionId: session.id, transcriptId: transcribed.transcripts.at(-1).id }, transcribed.revision));
    await waitFor(() => current(f, 'jobs', analyzing.jobId), value => value.status === 'running', '等待可取消的意图分析');
    const interrupted = committed(await f.command('voice', 'interrupt', { sessionId: session.id }, current(f, 'voice', session.id)!.revision)); assert.equal(interrupted.status, 'idle');
    assert.ok(pi.aborts.includes('job-' + analyzing.jobId)); assert.equal((await f.read('jobs', analyzing.jobId)).status, 'cancelled');
    const voice = await f.read('voice', session.id); assert.equal(voice.intents.length, 0); assert.equal((await f.list('inbox')).length, 0);
    const impostor = await f.command('voice', 'session', { terminalId: 'local', roomId: 'study', profileId: 'wife' }); assert.equal(impostor.statusCode, 403, impostor.body);
  } finally { await f.close(); }
});

test('平台策略与书房终端配置真实持久化，配置不伪造已连接房间或独立身份', async () => {
  const f = await fixture();
  try {
    const policy = committed(await f.command('settings', 'policy', { dailyBudget: 20, retryLimit: 0, supervise: false, autoWake: false, emergency: false }, 0, 'personal'));
    assert.equal(policy.supervise, false); assert.equal(policy.autoWake, false); assert.ok(String(policy.enforcement).includes('pi'));
    const enabling = await f.command('settings', 'policy', { supervise: true }, policy.revision, 'personal'); assert.equal(enabling.statusCode,200,enabling.body);assert.equal(enabling.json().data.supervise,true);assert.equal((await f.list('tasks')).length,0);
    const terminal = committed(await f.command('settings', 'terminal', { operation: 'configure', name: '书房联想浏览器', machineId: 'local', roomId: 'study', profileId: 'public', enabled: true }, 0, 'personal'));
    assert.equal(terminal.componentConnected, false); assert.equal(terminal.status, 'not-connected'); assert.equal(terminal.identityBinding, 'configuration-hint-only');
    const stale = await f.command('settings', 'terminal', { operation: 'configure', terminalId: terminal.id, name: '不应覆盖', machineId: 'local', roomId: 'study', profileId: 'me', enabled: true }, 0, 'personal'); assert.equal(stale.statusCode, 409, stale.body);
    await f.restart();
    const persistedPolicy = await f.read('settings', policy.id), persistedTerminal = await f.read('settings', terminal.id); assert.equal(persistedPolicy.dailyBudget, 20); assert.equal(persistedTerminal.name, '书房联想浏览器'); assert.equal(persistedTerminal.componentConnected, false);
    const disabled = committed(await f.command('settings', 'terminal', { operation: 'remove', terminalId: terminal.id }, persistedTerminal.revision, 'personal')); assert.equal(disabled.enabled, false); assert.equal(disabled.status, 'disabled');
  } finally { await f.close(); }
});

test('私有收件可转真实记忆候选，共享内容拒绝；资料候选不会伪造上传、OCR或发布', async () => {
  const f = await fixture();
  try {
    const source = committed(await f.command('inbox', 'capture', { rawText: '我的实际交流偏好：回答尽量简洁', kind: 'memory', terminalId: 'local', origin: 'manual' }));
    const routed = committed(await f.command('inbox', 'route', { inboxId: source.id, target: 'memory' }, source.revision));
    assert.equal(routed.status, 'routed'); assert.equal(routed.target.domain, 'memory');
    const candidate = await f.read('memory', routed.target.id); assert.equal(candidate.status, 'candidate'); assert.equal(candidate.profileId, 'me'); assert.equal(candidate.scope, 'private'); assert.equal(candidate.text, source.rawText); assert.equal(candidate.confirmedAt, null);
    const shared = committed(await f.command('inbox', 'capture', { rawText: '大家共同想看的内容', kind: 'memory', terminalId: 'local', origin: 'manual' }, 0, 'family'));
    const denied = await f.command('inbox', 'route', { inboxId: shared.id, target: 'memory' }, shared.revision, 'family'); assert.equal(denied.statusCode, 403, denied.body); assert.equal((await f.read('inbox', shared.id)).status, 'pending');
    const oversized = committed(await f.command('inbox', 'capture', { rawText: '长'.repeat(1201), kind: 'memory', terminalId: 'local', origin: 'manual' }));
    const tooLong = await f.command('inbox', 'route', { inboxId: oversized.id, target: 'memory' }, oversized.revision); assert.equal(tooLong.statusCode, 422, tooLong.body); assert.equal((await f.read('inbox', oversized.id)).rawText.length, 1201);
    const description = committed(await f.command('inbox', 'capture', { rawText: '以后上传这本经典的扫描件，这是资料描述', kind: 'book', terminalId: 'local', origin: 'manual' }));
    const materialRoute = committed(await f.command('inbox', 'route', { inboxId: description.id, target: 'material' }, description.revision)); assert.equal(materialRoute.target.domain, 'books');
    const material = await f.read('knowledge/books', materialRoute.target.id); assert.equal(material.kind, 'material'); assert.equal(material.status, 'pending'); assert.equal(material.text, description.rawText); assert.equal(material.sourceInboxId, description.id); assert.ok(!material.fileId); assert.ok(!material.pageTexts?.length); assert.ok(!material.publishedAt);
    const removed = committed(await f.command('memory', 'forget', { memoryId: candidate.id, reason: '遗忘这条长期偏好' }, candidate.revision)); assert.equal(removed.text, null); assert.equal((await f.read('inbox', source.id)).rawText, source.rawText, '独立原始收件应保持原话，记忆遗忘不偷偷删除源库');
  } finally { await f.close(); }
});

test('直接取消意图Pi作业同步结束voice等待，取消后的晚模型结果不能恢复方案', async () => {
  const pi = new FakePi(); pi.hold = true; pi.deliverAfterAbort = true;
  const f = await fixture(pi);
  try {
    const { session, transcribed } = await voiceSession(f, '取消与晚结果的隔离验证');
    const analyzing = committed(await f.command('voice', 'intent', { sessionId: session.id, transcriptId: transcribed.transcripts.at(-1).id }, transcribed.revision));
    const running = await waitFor(() => current(f, 'jobs', analyzing.jobId), value => value.status === 'running', '等待直接取消的意图作业');
    const cancelled = committed(await f.command('jobs', 'cancel', { jobId: running.id }, running.revision)); assert.equal(cancelled.status, 'cancelled');
    const idle = await f.read('voice', session.id); assert.equal(idle.status, 'idle'); assert.deepEqual(idle.intents, []); assert.ok(pi.aborts.includes('job-' + running.id));
    // Model delivery may race with cancellation; durable cancelled state must win.
    pi.finish('job-' + running.id, { status: 'complete', text: JSON.stringify({ alternatives: [{ title: '过期收件建议', command: 'inbox.capture', effect: '不应恢复的方案' }] }) });
    await new Promise<void>(resolve => setImmediate(resolve));
    const after = await f.read('voice', session.id); assert.equal(after.status, 'idle'); assert.deepEqual(after.intents, []);
    const job = await f.read('jobs', running.id); assert.equal(job.status, 'cancelled'); assert.equal(job.result, null); assert.equal((await f.list('inbox')).length, 0); assert.equal((await f.list('research')).length, 0);
  } finally { await pi.dispose(); await f.close(); }
});

test('暂停新作业后仅修改预算保留暂停和重试设置，只有明确false解除暂停', async () => {
  const f = await fixture();
  try {
    const initial = committed(await f.command('settings', 'policy', { supervise: false, autoWake: false, emergency: true, dailyBudget: 20, retryLimit: 3 }, 0, 'personal'));
    assert.equal(initial.emergency, true); assert.equal(initial.retryLimit, 3);
    const budgetOnly = committed(await f.command('settings', 'policy', { dailyBudget: 45 }, initial.revision, 'personal'));
    assert.equal(budgetOnly.emergency, true); assert.equal(budgetOnly.retryLimit, 3); assert.equal(budgetOnly.dailyBudget, 45); assert.equal(budgetOnly.enforcement, 'controlled-execution-and-pi-jobs');
    const blocked = await f.command('jobs', 'create', { kind: 'research', title: '暂停期间的请求', instruction: '这项请求不应发给模型' }); assert.equal(blocked.statusCode, 422, blocked.body); assert.equal(f.pi.calls.length, 0); assert.equal((await f.list('jobs')).length, 0);
    const resumed = committed(await f.command('settings', 'policy', { emergency: false }, budgetOnly.revision, 'personal'));
    assert.equal(resumed.emergency, false); assert.equal(resumed.dailyBudget, 45); assert.equal(resumed.retryLimit, 3);
  } finally { await f.close(); }
});
