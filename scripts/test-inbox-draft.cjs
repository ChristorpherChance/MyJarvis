const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { buildSync } = require('esbuild');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-inbox-draft-'));
const output = path.join(temp, 'draft.cjs'), commandOutput = path.join(temp, 'commands.cjs');
for (const [entry, outfile] of [['apps/web/src/features/operations/inbox-draft.ts', output], ['apps/web/src/demo/live-operation-commands.ts', commandOutput]]) {
  buildSync({entryPoints: [path.resolve(entry)], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent'});
}
class MemoryStorage {
  entries = new Map();
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index] ?? null; }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, String(value)); }
  removeItem(key) { this.entries.delete(key); }
}
let backing = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => backing});
globalThis.location = {origin: 'https://capture.example.test'};
const fresh = filename => { delete require.cache[require.resolve(filename)]; return require(filename); };
let api = fresh(output);
const actor = 'actual-owner-42';
const fields = (rawText = '手机写下的原话\n保留换行') => ({rawText, title: '', kind: 'idea', scope: 'private', terminalId: '手机网页', projectId: ''});
const make = text => api.createInboxDraft(fields(text));
const key = id => api.INBOX_DRAFT_KEY_PREFIX + encodeURIComponent(id);
const code = expected => error => error.code === expected;
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }

(async () => {
  await check('reload restores all entered fields and the same durable command UUID', () => {
    const original = make();
    const persisted = api.saveInboxDraft(actor, original);
    assert.equal(persisted.revision, 1);
    assert.equal(original.revision, 0, 'saving does not mutate the caller snapshot');
    api = fresh(output);
    assert.deepEqual(api.getInboxDraft(actor), persisted);
    assert.equal(api.getInboxDraft('me'), null, 'display profile is never an actor fallback');
    const envelope = JSON.parse(backing.getItem(key(actor)));
    assert.equal(envelope.actorId, actor); assert.equal(envelope.origin, location.origin);
    assert.deepEqual(Object.keys(envelope.draft).sort(), ['id', 'kind', 'projectId', 'rawText', 'revision', 'scope', 'status', 'terminalId', 'title', 'updatedAt'].sort());
  });
  await check('actors and browser origins remain separate', () => {
    const own = api.getInboxDraft(actor);
    const family = api.saveInboxDraft('family-member', make('家庭成员输入'));
    assert.equal(api.getInboxDraft(actor).rawText, own.rawText);
    assert.equal(api.getInboxDraft('family-member').id, family.id);
    location.origin = 'https://different.example.test';
    assert.throws(() => api.getInboxDraft(actor), code('INVALID'), 'an imported envelope from another origin is rejected');
    const firstStorage = backing; backing = new MemoryStorage();
    assert.equal(api.getInboxDraft(actor), null, 'separate native origin storage starts empty');
    backing = firstStorage; location.origin = 'https://capture.example.test';
    assert.throws(() => api.getInboxDraft(''), code('INVALID'));
  });
  await check('optimistic revisions reject stale editors and a replacement draft ID', () => {
    const first = api.getInboxDraft(actor);
    const changed = api.saveInboxDraft(actor, {...first, title: '最新标题'});
    assert.equal(changed.revision, first.revision + 1);
    assert.throws(() => api.saveInboxDraft(actor, {...first, rawText: '旧标签页覆盖'}), code('CONFLICT'));
    assert.throws(() => api.saveInboxDraft(actor, make('另一张新稿')), code('CONFLICT'));
    assert.deepEqual(api.getInboxDraft(actor), changed);
    assert.equal(api.removeInboxDraft(actor, crypto.randomUUID()), false);
    assert.equal(api.getInboxDraft(actor).id, changed.id);
  });
  await check('pending drafts freeze the entire capture snapshot and never expire', () => {
    const original = api.getInboxDraft(actor);
    const pending = api.saveInboxDraft(actor, {...original, status: 'pending'});
    for (const patch of [{rawText: '改正文'}, {title: '改标题'}, {kind: 'skill'}, {scope: 'family'}, {terminalId: '电脑网页'}, {projectId: 'different-project'}, {status: 'editing'}]) {
      assert.throws(() => api.saveInboxDraft(actor, {...pending, ...patch}), code('CONFLICT'));
    }
    assert.deepEqual(api.saveInboxDraft(actor, pending), pending, 'retry does not change revision or timestamp');
    const envelope = JSON.parse(backing.getItem(key(actor))); envelope.draft.updatedAt = 1;
    backing.setItem(key(actor), JSON.stringify(envelope));
    assert.equal(fresh(output).getInboxDraft(actor).id, pending.id, 'an old uncertain command remains recoverable');
    assert.equal(api.removeInboxDraft(actor, pending.id), true);
    const replacement = api.saveInboxDraft(actor, make('新稿应被保留'));
    assert.equal(api.removeInboxDraft(actor, pending.id), false, 'a late completion cannot remove a different new draft');
    assert.equal(api.getInboxDraft(actor).id, replacement.id);
  });
  await check('corrupt and oversized data never become a renderable draft', () => {
    const corruptActor = 'corrupt';
    for (const raw of ['{bad json', 'null', JSON.stringify({schema: 1, actorId: corruptActor, origin: location.origin, draft: {rawText: '<img src=x onerror=alert(1)>'}}), 'x'.repeat(130001)]) {
      backing.setItem(key(corruptActor), raw);
      assert.throws(() => api.getInboxDraft(corruptActor), code('INVALID'));
    }
    backing.removeItem(key(corruptActor));
    assert.throws(() => make('x'.repeat(20001)), code('INVALID'));
    const foreign = JSON.parse(backing.getItem(key(actor))); foreign.actorId = 'different-actor';
    backing.setItem(key(corruptActor), JSON.stringify(foreign));
    assert.throws(() => api.getInboxDraft(corruptActor), code('INVALID'));
    const unknownFields = api.saveInboxDraft('whitelist', {...make('只存草稿'), credentials: 'must-not-persist', cookie: 'must-not-persist'});
    assert.equal('credentials' in unknownFields, false);
    assert.equal(backing.getItem(key('whitelist')).includes('must-not-persist'), false);
  });
  await check('blocked storage and quota errors are explicit without claiming persistence', () => {
    const working = backing;
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => { throw new Error('SecurityError'); }});
    assert.throws(() => api.getInboxDraft(actor), code('UNAVAILABLE'));
    assert.throws(() => api.saveInboxDraft(actor, make()), code('UNAVAILABLE'));
    assert.throws(() => api.clearInboxDrafts(), code('UNAVAILABLE'));
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => backing});
    backing = new MemoryStorage(); backing.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => api.saveInboxDraft(actor, make()), code('UNAVAILABLE'));
    assert.equal(api.getInboxDraft(actor), null);
    backing = working;
  });
  await check('unknown network outcome reload retries the same UUID and exact payload snapshot', async () => {
    api.clearInboxDrafts();
    let commands = fresh(commandOutput);
    const captureFields = {...fields('已发出但未收到回执\n原始正文'), title: '精确快照', projectId: 'project-42', terminalId: '电脑网页'};
    const pending = api.saveInboxDraft(actor, {...api.createInboxDraft(captureFields), status: 'pending'});
    const records = {inbox: [], research: [], projects: [], tasks: [], experiences: []};
    const data = {profile: 'me', runtime: {capabilities: {identity: {actorId: actor}}}};
    const intent = draft => ({command: 'capture', commandId: draft.id, expectedVersion: 0, patch: {...captureFields, rawText: draft.rawText, scope: draft.scope}});
    const calls = [];
    let uncertain = true;
    global.fetch = async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (uncertain) throw new TypeError('network disconnected');
      return new Response(JSON.stringify({requestId: 'receipt-42', version: 1, data: {id: 'inbox-42'}, events: []}), {status: 200, headers: {'Content-Type': 'application/json'}});
    };
    const mutableIntent = intent(pending);
    const failed = commands.executeLiveOperation('op.inbox', mutableIntent, data, records);
    mutableIntent.patch.rawText = '调用者随后更改';
    await assert.rejects(failed, /network disconnected/);
    assert.equal(calls[0].payload.rawText, captureFields.rawText);
    await assert.rejects(commands.executeLiveOperation('op.inbox', {...intent(pending), patch: {...captureFields, rawText: '同ID改文'}}, data, records), code('COMMAND_ID_REUSED'));
    assert.equal(calls.length, 1, 'a second payload cannot be sent with the same explicit ID');
    api = fresh(output); commands = fresh(commandOutput); uncertain = false;
    const restored = api.getInboxDraft(actor);
    await commands.executeLiveOperation('op.inbox', intent(restored), data, records);
    assert.deepEqual(calls[1], calls[0]); assert.equal(calls[1].commandId, pending.id);
    await commands.executeLiveOperation('op.inbox', intent(restored), data, records);
    assert.equal(calls.length, 2, 'a completed explicit intent retains its receipt in the session');
    await assert.rejects(commands.executeLiveOperation('op.inbox', {...intent(restored), commandId: 'not-a-uuid'}, data, records), code('INVALID_INPUT'));
    await assert.rejects(commands.executeLiveOperation('op.inbox', intent(restored), {profile: 'me'}, records), code('INVALID_INPUT'));
    assert.equal(api.removeInboxDraft(actor, pending.id), true);
  });
  await check('concurrent explicit retries share one request and identities do not share fingerprints', async () => {
    const commands = fresh(commandOutput), id = crypto.randomUUID();
    const records = {inbox: [], research: [], projects: [], tasks: [], experiences: []};
    const data = actorId => ({profile: 'me', runtime: {capabilities: {identity: {actorId}}}});
    const intent = text => ({command: 'capture', commandId: id, expectedVersion: 0, patch: fields(text)});
    let release, count = 0;
    global.fetch = async () => { count++; return new Promise(resolve => { release = () => resolve(new Response(JSON.stringify({data: {id: 'receipt'}}), {status: 200})); }); };
    const first = commands.executeLiveOperation('op.inbox', intent('同稿'), data(actor), records);
    const second = commands.executeLiveOperation('op.inbox', intent('同稿'), data(actor), records);
    assert.equal(count, 1); release(); await Promise.all([first, second]);
    global.fetch = async () => { count++; return new Response(JSON.stringify({data: {id: 'other-actor-receipt'}}), {status: 200}); };
    await commands.executeLiveOperation('op.inbox', intent('另一个真实成员自己的记录'), data('other-actor'), records);
    assert.equal(count, 2);
  });
  await check('logout clears every draft but preserves unrelated storage and reports clear failures', () => {
    const commands = fresh(commandOutput);
    api.saveInboxDraft(actor, make('退出前输入')); api.saveInboxDraft('other-actor', make('其他登录输入'));
    backing.setItem('appearance-preference', 'retain'); backing.setItem(key('bad-json'), '{bad');
    assert.equal(commands.clearLiveOperationSession(), true);
    assert.equal(api.getInboxDraft(actor), null); assert.equal(api.getInboxDraft('other-actor'), null);
    assert.equal(backing.getItem('appearance-preference'), 'retain'); assert.equal(backing.getItem(key('bad-json')), null);
    const working = backing; backing = new MemoryStorage(); backing.removeItem = () => { throw new Error('blocked'); }; backing.setItem(key(actor), '{}');
    assert.equal(commands.clearLiveOperationSession(), false);
    backing = working;
  });
  console.log(`${checks} inbox draft checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, {recursive: true, force: true}));
