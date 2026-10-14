import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/store.js';
import { V1Repository } from '../src/v1/repository.js';
import { MemoryRuntime } from '../src/runtime/memory.js';
import { GovernanceRuntime } from '../src/runtime/governance.js';
import type { PiService, PiRunInput, PiUsageRecord } from '../src/pi.js';
import { BusinessError } from '../src/v1/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function fixture(work: (f: { store: Store; repository: V1Repository; ledger: GovernanceRuntime }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-memory-privacy-'));
  const store = new Store(directory), repository = new V1Repository(store.databasePath), ledger = new GovernanceRuntime(store);
  try { await work({ store, repository, ledger }); }
  finally { ledger.close(); repository.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
}
const actor = 'member_fixture';
const policy = (memory: MemoryRuntime, longTerm: 'confirm' | 'explicit' | 'auto', expectedVersion = 0) => memory.command('policy', {
  commandId: randomUUID(), expectedVersion, scope: 'private', payload: { textRetention: 'forever', audioRetention: 'never', longTerm },
}, actor);
function source(store: Store, content: string) {
  const conversation = store.createConversation(actor, 'fixture-profile', '隔离验收', true);
  store.addMessage(actor, conversation.id, { role: 'user', content, status: 'complete' });
  return conversation.id;
}
type ModelResult = { status: string; text: string };
const output = (items: Array<{ text: string; category: string; evidenceQuote: string }>): ModelResult => ({ status: 'complete', text: JSON.stringify({ items }) });
function fakePi(run: (input: PiRunInput) => Promise<ModelResult>, abort = async () => {}) {
  return { health: () => ({ configured: true }), run, abort, isRunning: () => false, removeConversationSession: async () => {} } as unknown as PiService;
}
const errorCode = (code: string) => (error: unknown) => error instanceof BusinessError && error.code === code;

test('analysis authorization is separate from a per-request cloud authorization', async () => fixture(async f => {
  const conversationId = source(f.store, '我喜欢历史。');
  const consent: boolean[] = [], calls: PiRunInput[] = [];
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async input => { calls.push(input); return output([]); }), {
    cloudAllowed: async (_actor, cloudConsent) => { consent.push(cloudConsent); return cloudConsent; },
    requireLocalModel: (_actor, cloudConsent) => !cloudConsent,
  });
  try {
    await assert.rejects(memory.extract(actor, conversationId, true), errorCode('FORBIDDEN'));
    assert.equal(calls.length, 0);
    assert.equal((await memory.extract(actor, conversationId, true, true)).status, 'completed');
    await assert.rejects(memory.extract(actor, conversationId, true), errorCode('FORBIDDEN'));
    assert.deepEqual(consent, [false, true, false]);
    assert.equal(calls.length, 1); assert.equal(calls[0].requireLocalModel, false);
  } finally { await memory.close(); }
}));

test('automatic candidate extraction defaults to local and an explicit-only policy requires analysis opt-in', async () => fixture(async f => {
  const conversationId = source(f.store, '我喜欢历史。');
  const grants: boolean[] = [], calls: PiRunInput[] = [];
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async input => { calls.push(input); return output([]); }), {
    cloudAllowed: async (_actor, cloudConsent) => { grants.push(cloudConsent); return true; },
    requireLocalModel: () => true,
  });
  try {
    const saved = policy(memory, 'explicit');
    await assert.rejects(memory.extract(actor, conversationId), errorCode('REVIEW_REQUIRED'));
    assert.equal(calls.length, 0);
    policy(memory, 'confirm', saved.data.revision);
    assert.equal((await memory.extract(actor, conversationId)).status, 'completed');
    assert.deepEqual(grants, [false, false]); assert.equal(calls[0].requireLocalModel, true);
  } finally { await memory.close(); }
}));

test('the identity lock is rechecked after an asynchronous cloud decision', async () => fixture(async f => {
  const conversationId = source(f.store, '我喜欢历史。');
  const gate = deferred<boolean>(), result = deferred<ModelResult>(), started = deferred<void>(); let calls = 0;
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async () => { calls++; started.resolve(); return result.promise; }), {
    cloudAllowed: () => gate.promise,
  });
  try {
    const first = memory.extract(actor, conversationId, true), second = memory.extract(actor, conversationId, true);
    const conflict = assert.rejects(second, errorCode('CONFLICT'));
    gate.resolve(true); await started.promise; result.resolve(output([]));
    await first; await conflict; assert.equal(calls, 1);
  } finally { result.resolve(output([])); await memory.close(); }
}));

test('a cancelled extraction discards a late successful model response', async () => fixture(async f => {
  const conversationId = source(f.store, '我喜欢历史。');
  const result = deferred<ModelResult>(), started = deferred<void>(); let aborts = 0;
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async () => { started.resolve(); return result.promise; }, async () => { aborts++; }));
  try {
    const run = memory.extract(actor, conversationId, true); await started.promise;
    const stopped = memory.stop(actor);
    result.resolve(output([{ text: '喜欢历史', category: '学习偏好', evidenceQuote: '我喜欢历史' }]));
    assert.equal((await run).status, 'cancelled'); assert.deepEqual(await stopped, { stopped: true });
    assert.equal(aborts, 1); assert.equal(memory.records(actor).filter(r => r.kind === 'memory').length, 0);
    assert.deepEqual(await memory.stop(actor), { stopped: false });
  } finally { result.resolve(output([])); await memory.close(); }
}));

test('withdrawing automatic consent before completion prevents new memories', async () => fixture(async f => {
  const conversationId = source(f.store, '我喜欢历史。');
  const result = deferred<ModelResult>(), started = deferred<void>();
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async () => { started.resolve(); return result.promise; }));
  try {
    const saved = policy(memory, 'auto');
    const run = memory.extract(actor, conversationId); await started.promise;
    policy(memory, 'explicit', saved.data.revision);
    result.resolve(output([{ text: '喜欢历史', category: '学习偏好', evidenceQuote: '我喜欢历史' }]));
    assert.equal((await run).status, 'cancelled'); assert.equal(memory.records(actor).filter(r => r.kind === 'memory').length, 0);
  } finally { result.resolve(output([])); await memory.close(); }
}));

test('automatic memory confirmation is limited to low-sensitive preference categories', async () => fixture(async f => {
  const conversationId = source(f.store, '我喜欢历史。我希望学习古代建筑。我的银行账户是123456。');
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async () => output([
    { text: '喜欢历史', category: '学习偏好', evidenceQuote: '我喜欢历史' },
    { text: '希望学习古代建筑', category: '目标', evidenceQuote: '我希望学习古代建筑' },
    { text: '银行账户123456', category: '偏好', evidenceQuote: '我的银行账户是123456' },
  ])));
  try {
    policy(memory, 'auto'); await memory.extract(actor, conversationId);
    const records = memory.records(actor).filter(r => r.kind === 'memory');
    assert.deepEqual(records.map(r => r.status), ['active', 'candidate', 'candidate']);
    assert.equal(memory.records('member_other').length, 0);
  } finally { await memory.close(); }
}));

test('sensitive evidence cannot be silently auto-confirmed as an innocuous preference', async () => fixture(async f => {
  const conversationId = source(f.store, '我因糖尿病而喜欢清淡饮食。I prefer short replies because of my medical diagnosis.');
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async () => output([
    { text: '喜欢清淡饮食', category: '偏好', evidenceQuote: '我因糖尿病而喜欢清淡饮食' },
    { text: 'Prefers short replies', category: '交流风格', evidenceQuote: 'I prefer short replies because of my medical diagnosis.' },
  ])));
  try {
    policy(memory, 'auto'); await memory.extract(actor, conversationId);
    assert.deepEqual(memory.records(actor).filter(r => r.kind === 'memory').map(r => r.status), ['candidate', 'candidate']);
  } finally { await memory.close(); }
}));

test('a forgotten memory stays redacted when its original idempotent command is replayed', async () => fixture(async f => {
  const memory = new MemoryRuntime(f.repository, f.store, fakePi(async () => output([])));
  try {
    const original = { commandId: randomUUID(), expectedVersion: 0, scope: 'private' as const, payload: { text: '本人验收文本', category: '学习', source: '人工记录' } };
    const created = memory.command('candidate', original, actor);
    memory.command('forget', { commandId: randomUUID(), expectedVersion: created.data.revision, scope: 'private', payload: { memoryId: created.data.id, reason: '本人删除' } }, actor);
    const replay = memory.command('candidate', original, actor);
    assert.equal(replay.data.text, null); assert.equal(replay.data.source, null); assert.equal(replay.data.status, 'forgotten');
    assert.equal(JSON.stringify(replay).includes('本人验收文本'), false);
    assert.equal(memory.records('member_other').length, 0);
  } finally { await memory.close(); }
}));

test('repeated signed CLI usage and a repeated cancellation settle only once', async () => fixture(async f => {
  const runId = 'cli-offline-fixture';
  f.ledger.reserveExecution({ runId, actorId: actor, executorId: 'codex-fixture', budgetUSD: 0.5 });
  const receipt = { runId: 'execution_' + runId, actorId: actor, provider: 'codex-fixture', model: 'reported', inputTokens: 13, outputTokens: 7, costUSD: 0.02, usageId: 'execution_' + runId };
  f.ledger.executionUsage(receipt); f.ledger.executionUsage(receipt);
  f.ledger.releaseExecution({ runId, actorId: actor, outcome: 'cancelled' });
  f.ledger.releaseExecution({ runId, actorId: actor, outcome: 'cancelled' });
  assert.equal(f.ledger.summary().calls, 1); assert.equal(f.ledger.summary().totalTokens, 20);
  assert.equal(f.ledger.summary().estimatedUSD, 0.02); assert.equal(f.ledger.summary().unreportedRuns, 0);
  assert.equal(f.ledger.summary().active, 0); assert.equal(f.ledger.summary().reservedUSD, 0);
}));

test('a CLI receipt without cost remains unknown after execution ends', async () => fixture(async f => {
  f.ledger.updatePolicy(0, { dailyLimitUSD: 2 });
  const runId = 'cli-no-price';
  f.ledger.reserveExecution({ runId, actorId: actor, executorId: 'codex-fixture', budgetUSD: 0.5 });
  const receipt = { runId: 'execution_' + runId, actorId: actor, provider: 'fixture', model: 'fixture', inputTokens: 1, outputTokens: 2, usageId: 'execution_' + runId };
  // Already consumed usage must be acknowledged, including a replay, without authorizing new work.
  assert.doesNotThrow(() => f.ledger.executionUsage(receipt));
  assert.doesNotThrow(() => f.ledger.executionUsage(receipt));
  f.ledger.releaseExecution({ runId, actorId: actor, outcome: 'completed' });
  assert.equal(f.ledger.usage(actor)[0].cost_usd, null); assert.equal(f.ledger.summary().unreportedRuns, 0);
  assert.equal(f.ledger.summary().unpricedCalls, 1); assert.equal(f.ledger.summary().totalTokens, 3); assert.equal(f.ledger.summary().calls, 1);
  assert.equal(f.ledger.summary().reservedUSD, 0); assert.throws(() => f.ledger.preflight(), errorCode('BUDGET_EXHAUSTED'));
  assert.throws(() => f.ledger.reserveExecution({ runId: 'cli-next-price-unknown', actorId: actor, executorId: 'codex-fixture', budgetUSD: 0.5 }), errorCode('BUDGET_EXHAUSTED'));
  assert.equal(f.ledger.summary().active, 0); assert.equal(f.ledger.summary().reservedUSD, 0);
}));

test('process recovery preserves unknown fees for interrupted chat and SDK work and releases their reservations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-fee-recovery-')), store = new Store(directory);
  let ledger = new GovernanceRuntime(store);
  try {
    const meta = (runId: string, origin: 'chat' | 'bounded-job') => ({ runId, actorId: actor, conversationId: runId, provider: 'offline-fixture', model: 'fixture', origin });
    const chat = meta('interrupted_chat', 'chat'), sdk = meta('interrupted_sdk', 'bounded-job'), reported = meta('reported_sdk', 'bounded-job');
    ledger.beforeRun(chat); ledger.beforeRun(sdk); ledger.beforeRun(reported);
    const usage: PiUsageRecord = { ...reported, usageId: 'reported_sdk_0', inputTokens: 4, outputTokens: 2, totalTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0, costUSD: 0.03, costKind: 'catalog-estimate', measuredAt: new Date().toISOString() };
    ledger.recordUsage(usage); ledger.close(); ledger = new GovernanceRuntime(store);
    assert.equal(ledger.summary().active, 0); assert.equal(ledger.summary().reservedUSD, 0);
    assert.equal(ledger.summary().unreportedRuns, 2); assert.equal(ledger.summary().unpricedCalls, 2);
    assert.deepEqual(ledger.unreported().map(r => r.run_id).sort(), [chat.runId, sdk.runId].sort());
    assert.equal(ledger.summary().estimatedUSD, 0.03); assert.equal(ledger.summary().totalTokens, 6);
    const late: PiUsageRecord = { ...usage, ...chat, usageId: 'interrupted_chat_0', costUSD: 0.01 };
    ledger.recordUsage(late); ledger.recordUsage(late);
    assert.equal(ledger.summary().unreportedRuns, 1); assert.equal(ledger.summary().calls, 2);
    assert.equal(ledger.summary().estimatedUSD, 0.04); assert.equal(ledger.summary().reservedUSD, 0);
  } finally { ledger.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});
