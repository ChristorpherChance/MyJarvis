import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateLiveFamily, executeLiveFamily, readCurrentMemoryExport } from '../apps/web/src/demo/live-family-commands.ts';
import type { DemoData } from '../apps/web/src/demo/types.ts';
import type { V1Record } from '../apps/web/src/v1-client.ts';

const data = { profile: 'me' } as DemoData;
const record = (patch: Record<string, unknown>) => ({ id: 'record-1', revision: 3, scope: 'private', ownerId: 'server-admin', status: 'candidate', ...patch } as V1Record);

test('memory.add只向服务端提交候选，不能通过active或ownerId绕过本人确认', () => {
  const op = translateLiveFamily('memory.add', { text: '我的习惯', category: '偏好', source: '本人', status: 'active', ownerId: 'wife', expires: '2026-11-01' }, data, {});
  assert.equal(op.command, 'candidate'); assert.equal(op.scope, 'private'); assert.equal(op.version, 0); assert.ok(!('status' in op.body)); assert.ok(!('ownerId' in op.body)); assert.equal(op.body.nextReviewAt, '2026-11-01T00:00:00.000Z');
});

test('家庭安排绑定family范围，完成与冻结版本不被后续刷新静默覆盖', () => {
  const op = translateLiveFamily('family.todo.toggle', { id: 'record-1', completed: false, expectedVersion: 1 }, data, { family: [record({ kind: 'todo', done: true, scope: 'family' })] });
  assert.deepEqual(op, { domain: 'family', command: 'todo', body: { operation: 'complete', todoId: 'record-1', completed: false }, scope: 'family', version: 1 });
});

test('真实设置按已登记profile提交原子save，但私人memory/health拒绝管理档案冒用', () => {
  const member = { ...data, profile: 'registered-wife' } as DemoData;
  const op = translateLiveFamily('persona.save', { profile: 'registered-wife', voice: 'warm', language: '中文', pace: '较慢', wakeword: '小管家', address: '妈妈', replyStyle: '简洁温和', privacy: 'ask', dailyVoice: 30, autoSpeak: true, quietStart: '22:00', quietEnd: '07:00', expectedVersion: 0 }, member, {});
  assert.equal(op.command, 'save'); assert.equal(op.body.profileId, 'registered-wife'); assert.equal(op.body.pace, 'slow'); assert.equal(op.body.dailyVoiceMinutes, 30);
  assert.throws(() => translateLiveFamily('memory.add', { text: '私有', category: '偏好' }, member, {}), /不能通过档案切换冒用/);
  assert.throws(() => translateLiveFamily('family.health.add', { text: '私有' }, member, {}), /不能通过档案切换冒用/);
});

test('策略取得自身记录修订版本，转成严格DTO，不发送组件额外状态', () => {
  const op = translateLiveFamily('memory.policy', { text: '7', audio: 'never', longterm: 'confirm', configured: true, note: '显示字段' }, data, { memory: [record({ kind: 'policy', profileId: 'me', status: 'policy', revision: 8 })] });
  assert.equal(op.version, 8); assert.deepEqual(op.body, { textRetention: '7', audioRetention: 'never', longTerm: 'confirm' });
});

test('登记家人只提交姓名和角色，不从UI预制认证ID或管理员权限', () => {
  const op = translateLiveFamily('family.member.register', { name: '家人甲', role: 'child', profileId: 'son', admin: true }, data, {});
  assert.equal(op.domain, 'personas'); assert.equal(op.command, 'register'); assert.equal(op.version, 0); assert.deepEqual(op.body, { name: '家人甲', role: 'child' });
});

test('不确定的网络结果重试沿用同commandId，同一个待提交仅发一次', async () => {
  const original = globalThis.fetch; const calls: any[] = []; let fail = true;
  globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(String(init?.body))); if (fail) { fail = false; throw Error('临时网络中断'); } return new Response(JSON.stringify({ requestId: 'receipt', version: 1, data: { id: 'new', revision: 1, ownerId: 'server-admin', scope: 'family' }, events: [] }), { status: 200 }); };
  try {
    const payload = { text: '网络重试验收-874', dueAt: '' };
    await assert.rejects(executeLiveFamily('family.todo.add', payload, data, {}), /临时网络中断/);
    await Promise.all([executeLiveFamily('family.todo.add', payload, data, {}), executeLiveFamily('family.todo.add', payload, data, {})]);
    assert.equal(calls.length, 2); assert.equal(calls[0].commandId, calls[1].commandId); assert.deepEqual(calls[0].payload, calls[1].payload);
  } finally { globalThis.fetch = original; }
});

test('导出重新鉴权读取当前private me记忆，排除遗忘正文、拒绝候选和元数据', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { assert.equal(init?.credentials, 'same-origin'); return new Response(JSON.stringify({ requestId: 'export-read', version: 1, data: { items: [record({ id: 'active', kind: 'memory', profileId: 'me', status: 'active', text: '当前偏好' }), record({ id: 'forgotten', kind: 'memory', profileId: 'me', status: 'forgotten', text: null }), record({ id: 'other', kind: 'memory', profileId: 'other', status: 'active', text: '其他人的私有内容' }), record({ id: 'policy', kind: 'policy', profileId: 'me', status: 'policy', text: null })], nextCursor: null, snapshotVersion: 1 }, events: [] }), { status: 200 }); };
  try { const exported = await readCurrentMemoryExport() as any; assert.equal(exported.memories.length, 1); assert.equal(exported.memories[0].text, '当前偏好'); assert.ok(!JSON.stringify(exported).includes('其他人的私有内容')); } finally { globalThis.fetch = original; }
});
