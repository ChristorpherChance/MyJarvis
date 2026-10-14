import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import type {Scope} from '../src/v1/types.js';

test('实际应用的成员 Pi 知识工具读取授权家庭动态来源；私有来源隔离且旧工具实时撤权', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-knowledge-family-test-'));
  const familyRoot = join(directory, 'family'), privateRoot = join(directory, 'private');
  await mkdir(familyRoot); await mkdir(privateRoot);
  await writeFile(join(familyRoot, 'family.md'), '家庭授权知识：司马迁著史记。', 'utf8');
  await writeFile(join(privateRoot, 'private.md'), 'PRIVATE-KNOWLEDGE-MUST-NOT-REACH-FAMILY', 'utf8');
  let piCalls = 0;
  const pi = {initialize: async () => {}, health: () => ({configured: false}),
    run: async () => {piCalls++; throw Error('This connector fixture must not invoke a model');},
    abort: async () => {}, dispose: async () => {}} as unknown as PiService;
  const runtime = await createApp({dataDir: directory, pi, webDir: join(directory, 'no-web'),
    pythonExecutable: join(directory, 'no-ocr-engine')});
  try {
    const setup = await runtime.app.inject({method: 'POST', url: '/api/auth/setup',
      payload: {password: 'Knowledge-family-integration-fixture-passphrase'}});
    assert.equal(setup.statusCode, 200, setup.body);
    const headers = {cookie: String(setup.headers['set-cookie']).split(';')[0]};
    const send = async (domain: string, command: string, payload: unknown, version = 0, scope: Scope = 'family') => {
      const prefix = ['sources', 'books', 'stories'].includes(domain) ? 'knowledge/' : '';
      const response = await runtime.app.inject({method: 'POST', url: `/api/v1/${prefix}${domain}/commands/${command}`,
        headers, payload: {commandId: randomUUID(), expectedVersion: version, scope, payload}});
      assert.equal(response.statusCode, 200, response.body);
      return response.json().data;
    };
    const configuration = await runtime.app.inject({method: 'POST', url: '/api/v1/knowledge/runtime/configure', headers,
      payload: {commandId: randomUUID(), expectedVersion: 0, scope: 'personal', payload: {configuration:
        {...runtime.knowledge.configuration(), allowedDirectoryRoots: [familyRoot, privateRoot]}}}});
    assert.equal(configuration.statusCode, 200, configuration.body);
    const createSource = (root: string, scope: Scope, name: string) => send('sources', 'save',
      {name, type: '目录文本', mode: 'local', endpoint: root, topics: '临时隔离资料',
        rights: '测试自行编写的临时资料', authorized: true}, 0, scope);
    const family = await createSource(familyRoot, 'family', '家庭动态来源');
    const privateSource = await createSource(privateRoot, 'private', '私人动态来源');
    for (const source of [family, privateSource]) {
      await send('sources', 'sync', {sourceId: source.id}, source.revision, source.scope);
      const execution = runtime.v1.list('operations', 'server-admin').find(record => record.kind === 'knowledge-execution' && record.sourceId === source.id)!;
      assert(execution, '实际同步命令必须创建持久作业');
      let job: any;
      for (let round = 0; round < 100; round++) {
        job = runtime.v1.read('operations', execution.id, 'server-admin');
        if (job && !['queued', 'running'].includes(job.status)) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(job?.status, 'completed', job?.error);
    }
    const callbacks = runtime.identity.options.callbacksForMember!('wife', 'member_fixture');
    const ownerCallbacks = runtime.identity.options.callbacksForMember!('me', 'server-admin');
    const entries = callbacks.listKnowledge!() as any[];
    assert.equal(entries.length, 1);
    assert.equal(entries[0].sourceId, family.id);
    assert.equal(entries[0].text, '家庭授权知识：司马迁著史记。');
    assert.equal(ownerCallbacks.listKnowledge!().length, 2);
    assert(!JSON.stringify(entries).includes('PRIVATE-KNOWLEDGE'));
    const current = runtime.v1.read('sources', family.id, 'server-admin')!;
    await send('sources', 'authorize', {sourceId: family.id, authorized: false, reason: '测试实时撤销家庭共享'}, current.revision);
    assert.deepEqual(callbacks.listKnowledge!(), [], '早先创建的成员工具必须重新读取授权，不能保留旧快照');
    assert.equal(ownerCallbacks.listKnowledge!().length, 1);
    assert.equal((ownerCallbacks.listKnowledge!() as any[])[0].sourceId, privateSource.id);
    assert.equal(piCalls, 0);
  } finally {
    await runtime.app.close();
    const target = resolve(directory);
    assert(target.startsWith(resolve(tmpdir()) + sep) && target.includes('jarvis-knowledge-family-test-'));
    await rm(target, {recursive: true, force: true});
  }
});
