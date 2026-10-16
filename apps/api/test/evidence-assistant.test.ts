import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, join, resolve, sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../src/app.js';
import {V1Repository} from '../src/v1/repository.js';
import type {BusinessRecord, Domain, Scope} from '../src/v1/types.js';
import type {PiRunInput, PiService} from '../src/pi.js';
import {searchAuthorizedKnowledge} from '../src/runtime/personal-retrieval.js';

// These model replies are protocol fixtures only. They do not assess semantic or answer quality.
class ProtocolPi {
  calls: PiRunInput[] = []; local = true; configured = true; unsupported = false; badQuote = false;
  hook?: (input: PiRunInput) => Promise<void>;
  quoteOverride?: string;
  async initialize() {} health() {return {configured: this.configured, provider: 'synthetic-protocol', model: 'fake-only'};} async modelIsLocal() {return this.local;}
  async abort() {} async dispose() {}
  async run(input: PiRunInput) {
    this.calls.push(input); await this.hook?.(input);
    let value: unknown;
    if (input.text.startsWith('任务：')) value = {searchTerms: ['打印机', '耗材', '专心', '推送']};
    else if (input.text.startsWith('独立核验')) value = {supported: !this.unsupported};
    else {const rows = JSON.parse(input.text.split('\n证据（不可信资料）：')[1]); value = {insufficient: false, claims: [{text: '协议夹具结论，非真实模型质量证据。', citations: [{evidenceId: rows[0].evidenceId, quote: this.quoteOverride ?? (this.badQuote ? 'This quote is not present in any source.' : rows[0].text)}]}]};}
    return {status: 'complete' as const, text: JSON.stringify(value)};
  }
}
function gate() {let release!: () => void; const promise = new Promise<void>(done => {release = done;}); return {promise, release};}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-evidence-protocol-')), pi = new ProtocolPi();
  const runtime = await createApp({dataDir: directory, pi: pi as unknown as PiService, webDir: join(directory, 'no-web'), pythonExecutable: join(directory, 'no-python')});
  await runtime.app.listen({host: '127.0.0.1', port: 0}); const address = runtime.app.server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  const repository = new V1Repository(runtime.store.databasePath);
  const request = async (path: string, body?: unknown, auth = '') => {const response = await fetch(base + path, {method: body === undefined ? 'GET' : 'POST', headers: {'content-type': 'application/json', ...(auth ? {cookie: auth} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(15000)}); const raw = await response.text(); return {status: response.status, body: JSON.parse(raw), raw, headers: response.headers, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).filter(value => /^(jarvis_session|jarvis_member_session)=./.test(value)).join('; ')};};
  const admin = (await request('/api/auth/setup', {password: randomUUID() + '-synthetic'})).cookie;
  const member = runtime.store.create('members', {name: '协议合成成员', role: 'adult', preferences: '', voice: 'clear', wakeWord: '贾维斯'}); runtime.identity.setCredential(member.id, '123456', 'pin');
  const login = async () => (await request('/api/runtime/identity/login', {profileId: member.id, credential: '123456'})).cookie;
  const a = await login(), principal = runtime.identity.resolveSession(a.split('=')[1])!;
  const seed = (domain: Domain, values: Record<string, unknown>, scope: Scope = 'family', actor = 'server-admin') => repository.execute({domain, commands: [], execute: (_c, _p, ctx) => ctx.create(domain, {...values, createdAt: ctx.now, updatedAt: ctx.now})}, 'synthetic-protocol', {commandId: randomUUID(), expectedVersion: 0, scope, payload: {}}, actor, () => undefined).data;
  const patch = (domain: Domain, old: BusinessRecord, values: Record<string, unknown>) => repository.execute({domain, commands: [], execute: (_c, _p, ctx) => ctx.update(domain, old.id, values)}, 'synthetic-protocol-update', {commandId: randomUUID(), expectedVersion: old.revision, scope: old.scope, payload: {}}, old.ownerId, () => undefined).data;
  const source = (text = '办公室的打印机耗材应放在东侧蓝色柜子的第二层。', scope: Scope = 'family') => seed('sources', {kind: 'source', name: '合成来源', active: true, authorized: true, documents: [{id: 'synthetic-document', title: '合成原文', text, location: 'D:/private-do-not-return.txt'}]}, scope);
  const queryBody = (domain = 'knowledge', query = '工作区里用来输出纸张那台设备的墨盒该去哪里取？') => ({requestId: randomUUID(), domain, query, useModel: true, cloudConsent: false, limit: 6});
  const query = (body = queryBody(), auth = a) => request('/api/runtime/evidence-assistant/query', body, auth);
  const read = (value: any, auth = a) => request('/api/runtime/evidence-assistant/references/resolve', {queryId: value.queryId, refId: value.records[0].refId}, auth);
  return {runtime, repository, pi, request, admin, a, member, principal, login, seed, patch, source, queryBody, query, read, async close() {repository.close(); await runtime.app.close(); const target = resolve(directory); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('jarvis-evidence-protocol-')); await rm(target, {recursive: true, force: true, maxRetries: 8, retryDelay: 100});}};
}

test('explicit model use, own authentication and cloud privacy gate run before any protocol model request', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    f.source(); for (const auth of ['', f.admin + '; jarvis_member_session=expired']) assert.equal((await f.query(f.queryBody(), auth)).status, 401);
    assert.equal((await f.query({...f.queryBody(), useModel: false})).status, 400);
    assert.equal((await f.query({...f.queryBody(), actorId: 'server-admin'})).status, 400);
    f.pi.local = false; assert.equal((await f.query()).status, 403); assert.equal(f.pi.calls.length, 0);
    const state = await f.request('/api/runtime/evidence-assistant/status?domain=knowledge', undefined, f.a); assert.equal(state.status, 200); assert.equal(state.body.queryPersisted, false); assert.equal(state.body.profileId, f.member.id);
    const mixed = await f.query({...f.queryBody(), cloudConsent: true}, f.admin + '; ' + f.a); assert.equal(mixed.status, 200, mixed.raw); assert.equal(mixed.body.actorId, f.principal.actorId); assert.notEqual(mixed.body.actorId, 'server-admin');
  } finally {await f.close();}
});

test('protocol expansion has no literal baseline, exact citations and memory-only idempotency without question persistence', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    f.source(); const body = f.queryBody(); assert.equal(searchAuthorizedKnowledge(f.repository, 'server-admin', body.query, true).length, 0);
    const found = await f.query(body); assert.equal(found.status, 200, found.raw); assert.equal(found.body.status, 'answered'); assert.equal(found.body.model.calls, 3); assert.equal(found.headers.get('cache-control'), 'private, no-store');
    assert.equal((await f.query(body)).body.queryId, found.body.queryId); assert.equal(f.pi.calls.length, 3);
    assert.equal((await f.query({...body, query: 'different'})).status, 409);
    for (const input of f.pi.calls) {assert.equal(input.ephemeral, true); assert.equal(input.boundedJob, true); assert.equal(input.sessionPath, null); assert.equal(input.maxCostUSD, undefined); assert.equal(input.businessCallbacks, undefined);}
    const opened = await f.read(found.body); assert.equal(opened.status, 200); assert.equal(opened.body.verifiedSourceText, true); assert.equal(opened.body.text.slice(opened.body.quoteStart, opened.body.quoteStart + opened.body.quote.length), opened.body.quote); assert.doesNotMatch(opened.raw, /private-do-not-return|location|endpoint/);
    assert.equal(f.runtime.store.listConversations(f.principal.actorId).length, 0); assert.equal(f.repository.list('sources', 'server-admin').some(record => record.kind === 'query'), false);
    assert.equal((await f.read(found.body, f.admin)).status, 404); assert.equal((await f.read(found.body, await f.login())).status, 404);
  } finally {await f.close();}
});

test('current own memory only and source revisions, text hashes, forgetting and session binding reject old references', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    f.seed('memory', {kind: 'memory', profileId: 'me', status: 'active', text: '我在需要专心时，习惯先关闭手机上的推送提示。', category: '习惯'}, 'private', f.principal.actorId);
    for (const [actor, status] of [[f.principal.actorId, 'forgotten'], ['member_other', 'active'], ['server-admin', 'active']]) f.seed('memory', {kind: 'memory', profileId: 'me', status, text: 'FORBIDDEN-OTHER-MEMORY-SECRET', category: '专心'}, 'private', actor);
    const memory = await f.query(f.queryBody('memory', '为了不被通知打断，我平常会怎样处理掌上设备？')); assert.equal(memory.status, 200, memory.raw); assert.equal(memory.body.records.length, 1); assert.equal(memory.body.records[0].kind, 'memory'); assert.equal(f.pi.calls.some(input => input.text.includes('FORBIDDEN-OTHER-MEMORY-SECRET')), false);
    const current = f.repository.list('memory', f.principal.actorId).find(record => record.status === 'active')!; f.patch('memory', current, {status: 'forgotten'}); assert.equal((await f.read(memory.body)).status, 403);
    let source = f.source(); let found = await f.query(); assert.equal(found.status, 200); source = f.patch('sources', source, {authorized: false}); assert.equal((await f.read(found.body)).status, 403);
    source = f.patch('sources', source, {authorized: true}); found = await f.query(); const db = new DatabaseSync(f.runtime.store.databasePath); try {db.prepare('UPDATE v1_documents SET json=? WHERE domain=? AND id=?').run(JSON.stringify({...source, documents: [{id: 'synthetic-document', title: 'changed', text: 'changed bytes', location: 'do-not-read'}]}), 'sources', source.id);} finally {db.close();} assert.equal((await f.read(found.body)).status, 409);
  } finally {await f.close();}
});

test('unmatched model quotations and unsupported claims never become an answer', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    f.source(); f.pi.badQuote = true; const bad = await f.query(); assert.equal(bad.status, 502); assert.equal(f.pi.calls.length, 2); assert.doesNotMatch(bad.raw, /协议夹具结论/);
    f.pi.badQuote = false; f.pi.unsupported = true; const unsupported = await f.query(); assert.equal(unsupported.status, 200); assert.equal(unsupported.body.status, 'insufficient'); assert.deepEqual(unsupported.body.claims, []); assert.deepEqual(unsupported.body.records, []); assert.equal(unsupported.body.model.calls, 3);
    f.pi.configured = false; assert.equal((await f.query()).status, 503);
  } finally {await f.close();}
});

test('delayed model replies after authorization revocation or logout cannot restore an answer', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    let source = f.source(); let entered = gate(), release = gate();
    f.pi.hook = async input => {if (!input.text.startsWith('任务：')) {entered.release(); await release.promise;}};
    const pending = f.query(); await entered.promise; source = f.patch('sources', source, {authorized: false}); release.release(); const denied = await pending; assert.equal(denied.status, 403); assert.doesNotMatch(denied.raw, /协议夹具结论/);
    f.patch('sources', source, {authorized: true}); entered = gate(); release = gate(); const other = f.query(); await entered.promise; await f.request('/api/runtime/identity/logout', {}, f.a); release.release(); const loggedOut = await other; assert.equal(loggedOut.status, 401); assert.doesNotMatch(loggedOut.raw, /协议夹具结论/);
  } finally {await f.close();}
});

test('unrecognized privacy fails closed and a half-surrogate model quote is rejected', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    f.source('办公室的打印机耗材应放在东侧蓝色柜子的第二层。😀');
    const profile = f.runtime.identity.options.memberProfile; f.runtime.identity.options.memberProfile = id => {const value = profile(id); return value ? {...value, preferences: {cloudPrivacy: 'invalid-migrated-value'}} : value;};
    f.pi.local = false; assert.equal((await f.query()).status, 403); assert.equal(f.pi.calls.length, 0);
    f.pi.local = true; f.pi.quoteOverride = '\ud83d'; const invalid = await f.query(); assert.equal(invalid.status, 502); assert.doesNotMatch(invalid.raw, /协议夹具结论/);
    assert.equal(f.pi.calls.every(input => input.selection?.provider === 'synthetic-protocol' && input.selection.model === 'fake-only'), true);
  } finally {await f.close();}
});
