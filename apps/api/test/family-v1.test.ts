import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { V1Repository } from '../src/v1/repository.js';
import { familyHandlers } from '../src/v1/family-domains.js';
import { BusinessError, type BusinessRecord, type CommandEnvelope, type Domain, type Scope } from '../src/v1/types.js';
import { createApp } from '../src/app.js';
import type { PiService } from '../src/pi.js';

/** Every test has a new temporary SQLite store; no network, model, room microphone or production data. */
async function fixture(work: (f: Fixture) => void | Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-family-v1-'));
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  const store = new Store(dir), repository = new V1Repository(store.databasePath);
  const f = new Fixture(repository, store.databasePath);
  try { await work(f); } finally { repository.close(); store.close(); await rm(dir, { recursive: true, force: true }); }
}
class Fixture {
  constructor(readonly repo: V1Repository, readonly path: string) {}
  members = new Map([['registered-wife', { id: 'registered-wife', name: '已登记家庭成员' }]]);
  call(domain: 'family' | 'memory' | 'personas', command: string, payload: Record<string, any>, version = 0, scope: Scope = 'private', commandId = randomUUID(), actorId = 'server-admin') {
    const handler = familyHandlers.find(h => h.domain === domain)!;
    const envelope: CommandEnvelope = { payload, expectedVersion: version, scope, commandId };
    return this.repo.execute(handler, command, envelope, actorId, () => undefined, () => false, () => {}, { member: id => { const registered = this.repo.read('personas', id, actorId); return this.members.get(id) ?? (registered?.kind === 'profile' && registered.status === 'registered' ? registered : undefined); } });
  }
  candidate(text = '本人实际偏好：晚上用温和的语气') { return this.call('memory', 'candidate', { text, category: '交流偏好', source: '当前本人手动录入' }).data; }
  denied(fn: () => unknown, code: string) { assert.throws(fn, (error: unknown) => error instanceof BusinessError && error.code === code); }
  tableText(table: 'v1_documents' | 'v1_commands' | 'v1_events') { const db = new DatabaseSync(this.path); try { return JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()); } finally { db.close(); } }
}
const savePersona = { profileId: 'me', voiceId: 'warm', language: '中文', pace: 'slow', wakeWord: '贾维斯', address: '爸爸', replyStyle: '简洁温和', cloudPrivacy: 'ask', dailyVoiceMinutes: 30, autoSpeak: false, start: '22:00', end: '07:00', timezone: 'Asia/Shanghai' };

test('单独回复语言与旧persona.save共用版本并保留声音、隐私、旧语言及其他成员设置',async()=>fixture(f=>{
 const saved=f.call('personas','save',{...savePersona,replyLanguage:'en'}).data;
 const oldClient=f.call('personas','save',{...savePersona,language:'法语',voiceId:'calm'},saved.revision).data;
 assert.equal(oldClient.replyLanguage,'en');assert.equal(oldClient.language,'法语');assert.equal(oldClient.cloudPrivacy,'ask');
 const before={...oldClient},changed=f.call('personas','reply-language',{profileId:'me',replyLanguage:'auto'},oldClient.revision).data;
 assert.equal(changed.replyLanguage,'auto');for(const key of ['voiceId','language','pace','cloudPrivacy','dailyVoiceMinutes','quietStart','quietEnd','timezone'])assert.equal(changed[key],before[key]);
 assert.equal(f.repo.list('personas','server-admin').filter(p=>p.profileId==='me').length,1);
 f.denied(()=>f.call('personas','reply-language',{profileId:'me',replyLanguage:'zh'},oldClient.revision),'CONFLICT');
 f.denied(()=>f.call('personas','reply-language',{profileId:'me',replyLanguage:'ja'},changed.revision),'VALIDATION');
 f.denied(()=>f.call('personas','reply-language',{profileId:'me',replyLanguage:'en'},changed.revision,'family'),'FORBIDDEN');
 const wife=f.call('personas','reply-language',{profileId:'registered-wife',replyLanguage:'de'}).data;
 assert.equal(wife.replyLanguage,'de');assert.equal(f.repo.read('personas',changed.id,'server-admin')!.replyLanguage,'auto');
}));

test('家庭领域不预置演示种子，候选不会因客户端status伪装而生效', async () => fixture(f => {
  for (const domain of ['family', 'memory', 'personas'] as Domain[]) assert.deepEqual(f.repo.list(domain, 'server-admin'), []);
  const candidate = f.call('memory', 'candidate', { text: '我的偏好', category: '交流', source: '本人', status: 'active', ownerId: 'forged' }).data;
  assert.equal(candidate.status, 'candidate'); assert.equal(candidate.ownerId, 'server-admin'); assert.equal(candidate.profileId, 'me'); assert.equal(candidate.confirmedAt, null);
  const events = f.repo.events('server-admin', 0); assert.ok(!JSON.stringify(events).includes('我的偏好'));
}));

test('本人确认、修订和拒绝要求正确状态、明确确认和修订版本', async () => fixture(f => {
  const candidate = f.candidate();
  f.denied(() => f.call('memory', 'confirm', { memoryId: candidate.id, confirmed: false }, 1), 'VALIDATION');
  f.denied(() => f.call('memory', 'confirm', { memoryId: candidate.id, confirmed: true }, 0), 'CONFLICT');
  const active = f.call('memory', 'confirm', { memoryId: candidate.id, confirmed: true }, 1).data; assert.equal(active.status, 'active');
  const edited = f.call('memory', 'edit', { memoryId: active.id, text: '请简洁自然地说话', confirmed: true, nextReviewAt: '2026-11-01T00:00:00Z' }, active.revision).data;
  assert.equal(edited.text, '请简洁自然地说话'); assert.equal(edited.history.at(-1).event, 'edited-confirmed'); assert.ok(!JSON.stringify(edited.history).includes(candidate.text));
  f.denied(() => f.call('memory', 'reject', { memoryId: active.id, reason: '不准确' }, edited.revision), 'REVIEW_REQUIRED');
  const other = f.candidate('另一个待确认的偏好'), rejected = f.call('memory', 'reject', { memoryId: other.id, reason: '这不是我的习惯' }, other.revision).data;
  assert.equal(rejected.status, 'rejected'); f.denied(() => f.call('memory', 'edit', { memoryId: rejected.id, text: '不能偷偷恢复', confirmed: true }, rejected.revision), 'REVIEW_REQUIRED');
}));

test('遗忘清除正文、来源、历史副本及所有旧幂等回执；重复旧提交不会复活内容', async () => fixture(f => {
  const secret = '忘记验收的唯一私人正文-94851', source = '忘记验收的私人来源-271';
  const id = randomUUID(), payload = { text: secret, category: '私人类别', source }, candidate = f.call('memory', 'candidate', payload, 0, 'private', id).data;
  const confirmId = randomUUID(), confirmPayload = { memoryId: candidate.id, confirmed: true }, active = f.call('memory', 'confirm', confirmPayload, 1, 'private', confirmId).data;
  const forgotten = f.call('memory', 'forget', { memoryId: candidate.id, reason: '本人明确要求移除' }, active.revision).data;
  assert.equal(forgotten.text, null); assert.equal(forgotten.source, null); assert.deepEqual(forgotten.previousTexts, []); assert.equal(forgotten.status, 'forgotten');
  for (const table of ['v1_documents', 'v1_commands', 'v1_events'] as const) { assert.ok(!f.tableText(table).includes(secret), table); assert.ok(!f.tableText(table).includes(source), table); }
  const replay = f.call('memory', 'candidate', payload, 0, 'private', id); assert.equal(replay.data.status, 'forgotten'); assert.equal(replay.data.text, null);
  const confirmedReplay = f.call('memory', 'confirm', confirmPayload, 1, 'private', confirmId); assert.equal(confirmedReplay.data.status, 'forgotten');
  f.denied(() => f.call('memory', 'edit', { memoryId: forgotten.id, text: secret, confirmed: true }, forgotten.revision), 'REVIEW_REQUIRED');
}));

test('私人记忆及健康备忘拒绝共享范围、未认证成员冒用和跨所有者操作', async () => fixture(f => {
  f.denied(() => f.call('memory', 'candidate', { text: '私有', category: '偏好', source: '本人' }, 0, 'family'), 'FORBIDDEN');
  f.denied(() => f.call('memory', 'candidate', { text: '冒用', category: '偏好', source: '本人', profileId: 'registered-wife' }), 'FORBIDDEN');
  f.denied(() => f.call('family', 'health-note', { operation: 'create', text: '健康描述' }, 0, 'family'), 'FORBIDDEN');
  const candidate = f.candidate(); f.denied(() => f.call('memory', 'confirm', { memoryId: candidate.id, confirmed: true }, candidate.revision, 'private', randomUUID(), 'other-admin'), 'VALIDATION');
  assert.equal(f.repo.read('memory', candidate.id, 'other-admin'), undefined);
}));

test('家庭待办可完成恢复移除；健康备忘保持私有，删除也清除旧回执正文', async () => fixture(f => {
  const todo = f.call('family', 'todo', { operation: 'create', text: '一起读书', dueAt: '2026-10-08T12:00:00Z' }, 0, 'family').data;
  const done = f.call('family', 'todo', { operation: 'complete', todoId: todo.id, completed: true }, 1, 'family').data; assert.equal(done.done, true);
  const reopened = f.call('family', 'todo', { operation: 'complete', todoId: todo.id, completed: false }, 2, 'family').data; assert.equal(reopened.done, false);
  const removed = f.call('family', 'todo', { operation: 'remove', todoId: todo.id }, 3, 'family').data; assert.equal(removed.status, 'removed'); assert.equal(removed.text, null);
  const secret = '私人健康描述验收-515', commandId = randomUUID(), body = { operation: 'create', text: secret, context: '询问记录' }, note = f.call('family', 'health-note', body, 0, 'private', commandId).data;
  assert.equal(f.repo.list('family', 'server-admin', 'family').length, 1); assert.equal(f.repo.list('family', 'server-admin', 'private')[0].kind, 'health-note');
  const edited = f.call('family', 'health-note', { operation: 'edit', noteId: note.id, text: secret + '补充', context: '更新' }, 1).data;
  const forgotten = f.call('family', 'health-note', { operation: 'forget', noteId: note.id }, edited.revision).data; assert.equal(forgotten.text, null); assert.equal(forgotten.context, '');
  assert.ok(!f.tableText('v1_commands').includes(secret)); assert.equal(f.call('family', 'health-note', body, 0, 'private', commandId).data.text, null);
}));

test('留存策略启用真实runtime清理，并保留版本冲突保护', async () => fixture(f => {
  const policy = f.call('memory', 'policy', { textRetention: 'never', audioRetention: '7', longTerm: 'auto' }).data;
  assert.deepEqual(policy.policy, { textRetention: 'never', audioRetention: '7', longTerm: 'auto' }); assert.deepEqual(policy.effective, policy.policy); assert.equal(policy.cleanupStatus, 'configured');
  f.denied(() => f.call('memory', 'policy', { textRetention: '7', audioRetention: 'never', longTerm: 'confirm' }, 0), 'CONFLICT');
  assert.equal(f.call('memory', 'policy', { textRetention: '7', audioRetention: 'never', longTerm: 'confirm' }, policy.revision).data.revision, 2);
}));

test('专属设置原子保存，可管理真实登记档案，但不能凭虚构别名冒充成员', async () => fixture(f => {
  const saved = f.call('personas', 'save', savePersona).data; assert.equal(saved.authentication, 'administrator-managed-profile'); assert.equal(saved.wakeStatus, 'runtime-managed'); assert.match(saved.note, /需要配置引擎/);
  const before = f.repo.list('personas', 'server-admin');
  f.denied(() => f.call('personas', 'save', { ...savePersona, voiceId: 'unknown' }, saved.revision), 'VALIDATION'); assert.deepEqual(f.repo.list('personas', 'server-admin'), before);
  f.denied(() => f.call('personas', 'save', { ...savePersona, profileId: 'wife' }), 'FORBIDDEN');
  const registered = f.call('personas', 'save', { ...savePersona, profileId: 'registered-wife', address: '妈妈' }).data; assert.equal(registered.profileId, 'registered-wife'); assert.equal(registered.ownerId, 'server-admin');
  const update = f.call('personas', 'wake-word', { profileId: 'registered-wife', wakeWord: '小管家' }, registered.revision).data; assert.equal(update.wakeWord, '小管家'); assert.equal(update.authentication, 'administrator-managed-profile');
}));

test('成员登记使用服务端ID和幂等回执，独立偏好存储不等于本人认证', async () => fixture(f => {
  const commandId = randomUUID(), input = { name: '家人甲', role: 'child' }, registered = f.call('personas', 'register', input, 0, 'private', commandId).data;
  assert.equal(registered.kind, 'profile'); assert.equal(registered.profileId, registered.id); assert.equal(registered.authentication, 'not-configured'); assert.notEqual(registered.id, 'son');
  assert.equal(f.call('personas', 'register', input, 0, 'private', commandId).data.id, registered.id); assert.equal(f.repo.list('personas', 'server-admin').length, 1);
  const preference = f.call('personas', 'save', { ...savePersona, profileId: registered.id, address: '孩子' }).data; assert.equal(preference.profileId, registered.id); assert.equal(preference.kind, 'persona'); assert.notEqual(preference.id, registered.id);
  f.denied(() => f.call('memory', 'candidate', { profileId: registered.id, text: '不能冒用私人记忆', category: '偏好', source: '测试' }), 'FORBIDDEN');
}));

test('记忆导出只持久化元数据，不产生忘记后仍含正文的旧导出快照', async () => fixture(f => {
  const candidate = f.candidate('导出遗忘验收私有-619'), active = f.call('memory', 'confirm', { memoryId: candidate.id, confirmed: true }, 1).data;
  const exportId = randomUUID(), body = { format: 'json', includeCandidates: true }, exported = f.call('memory', 'export', body, 0, 'private', exportId).data;
  assert.equal(exported.count, 1); assert.equal(exported.text, null); assert.equal(exported.kind, 'export-receipt'); assert.ok(!JSON.stringify(exported).includes(candidate.text));
  f.call('memory', 'forget', { memoryId: active.id, reason: '清理验收' }, active.revision);
  assert.ok(!JSON.stringify(f.call('memory', 'export', body, 0, 'private', exportId)).includes(candidate.text));
  assert.equal(f.call('memory', 'export', body).data.count, 0);
}));

test('原家庭学习入口存真实答句、忽略虚构评分、同课次不能重复记录', async () => fixture(f => {
  const payload = { title: '本人录入的真实练习', type: 'language', minutes: 5, lessonId: 'practice-lesson-1', rounds: [{ question: 'How was your day?', answer: 'I had a quiet day.' }], score: 99 };
  const learned = f.call('family', 'learning', payload).data;
  assert.equal(learned.kind, 'practice'); assert.equal(learned.lessonId, payload.lessonId); assert.equal(learned.score, null); assert.equal(learned.source, 'manual-practice'); assert.equal(learned.rounds[0].answer, payload.rounds[0].answer);
  assert.equal(f.repo.list('learning', 'server-admin').length, 1); assert.equal(f.repo.list('family', 'server-admin').length, 0);
  f.denied(() => f.call('family', 'learning', payload), 'CONFLICT'); assert.equal(f.repo.list('learning', 'server-admin').length, 1);
}));

test('家庭HTTP严格契约、管理员鉴权、完整记忆闭环和隐私查询均使用临时库', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-family-http-')); assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
  const pi = { initialize: async () => {}, health: () => ({ configured: false }), dispose: async () => {} } as unknown as PiService;
  const runtime = await createApp({ dataDir: dir, pi, webDir: join(dir, 'absent') });
  try {
    const api = runtime.app;
    assert.equal((await api.inject({ url: '/api/v1/memory' })).statusCode, 401);
    const setup = await api.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: 'temporary-family-HTTP-test-password' } });
    const headers = { cookie: String(setup.headers['set-cookie']).split(';')[0] };
    const body = (payload: Record<string, any>, version = 0, scope = 'private', commandId = randomUUID()) => ({ commandId, expectedVersion: version, scope, payload });
    const command = (domain: string, name: string, payload: any) => api.inject({ method: 'POST', url: `/api/v1/${domain}/commands/${name}`, headers, payload });
    const committed = async (domain: string, name: string, payload: any) => { const r = await command(domain, name, payload); assert.equal(r.statusCode, 200, `${domain}/${name}: ${r.body}`); return r.json(); };
    const forged = await command('memory', 'candidate', body({ text: '伪造归属', category: '偏好', source: '测试', ownerId: 'registered-wife' })); assert.equal(forged.statusCode, 400);
    const capture = body({ text: 'HTTP遗忘唯一私人正文-382', category: '交流偏好', source: '本人手工记录' }), candidate = await committed('memory', 'candidate', capture);
    const active = await committed('memory', 'confirm', body({ memoryId: candidate.data.id, confirmed: true }, candidate.version));
    const edited = await committed('memory', 'edit', body({ memoryId: active.data.id, text: 'HTTP修订唯一私人正文-412', category: '学习偏好', confirmed: true, nextReviewAt: null }, active.version));
    await committed('memory', 'policy', body({ textRetention: '7', audioRetention: 'never', longTerm: 'confirm' }));
    const exported = await committed('memory', 'export', body({ format: 'json', includeCandidates: true })); assert.equal(exported.data.kind, 'export-receipt'); assert.equal(exported.data.count, 1); assert.equal(exported.data.text, null);
    const forgotten = await committed('memory', 'forget', body({ memoryId: edited.data.id, reason: '本人请求遗忘' }, edited.version)); assert.equal(forgotten.data.text, null);
    const replay = await committed('memory', 'candidate', capture); assert.equal(replay.data.status, 'forgotten'); assert.equal(replay.data.text, null);
    const list = await api.inject({ url: '/api/v1/memory', headers }); assert.equal(list.statusCode, 200, list.body); assert.ok(!list.body.includes('HTTP修订唯一私人正文')); assert.ok(!list.body.includes('HTTP遗忘唯一私人正文'));
    const registered = await committed('personas', 'register', body({ name: '已登记家人', role: 'elder' })); assert.equal(registered.data.authentication, 'not-configured');
    const familyPersona = await committed('personas', 'save', body({ ...savePersona, profileId: registered.data.id, address: '长辈' })); assert.equal(familyPersona.data.profileId, registered.data.id);
    const persona = await committed('personas', 'save', body(savePersona)); assert.equal(persona.data.wakeStatus, 'runtime-managed');
    const savedAgain = await committed('personas', 'save', body({ ...savePersona, voiceId: 'calm' }, persona.version)); assert.equal(savedAgain.version, persona.version + 1);
    const todo = await committed('family', 'todo', body({ operation: 'create', text: '本周读书' }, 0, 'family'));
    await committed('family', 'todo', body({ operation: 'complete', todoId: todo.data.id, completed: true }, todo.version, 'family'));
    const note = await committed('family', 'health-note', body({ operation: 'create', text: '仅本人健康备忘验收-935', context: '想问的问题' }));
    const shared = await api.inject({ url: '/api/v1/family?scope=family', headers }); assert.equal(shared.statusCode, 200, shared.body); assert.ok(!shared.body.includes('仅本人健康备忘验收'));
    await committed('family', 'health-note', body({ operation: 'forget', noteId: note.data.id }, note.version));
    const lesson = await committed('family', 'learning', body({ title: '真实练习', type: 'language', minutes: 5, lessonId: 'http-lesson-1', rounds: [{ question: 'How are you?', answer: 'I am fine.' }], score: 88 })); assert.equal(lesson.data.score, null); assert.equal(lesson.data.kind, 'practice');
    const progress = await api.inject({ url: '/api/v1/learning', headers }); assert.equal(progress.statusCode, 200, progress.body); assert.equal(progress.json().data.items[0].lessonId, 'http-lesson-1');
  } finally { await runtime.app.close(); await rm(dir, { recursive: true, force: true }); }
});
