import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, totalmem, cpus, hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Store, StoreAccessError, StoreConflictError, StoreNotFoundError } from '../src/store.ts';

function fixture(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'jarvis-store-'));
  const stores: Store[] = [];
  const open = (path = directory) => { const opened = new Store(path); stores.push(opened); return opened; };
  const store = open();
  t.after(() => {
    for (const opened of stores.reverse()) opened.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('jarvis-store-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, store, open };
}

test('new installation registers only the owner and actual local host; edits survive reopening', t => {
  const { directory, store, open } = fixture(t);
  assert.deepEqual(store.list('members').map(member => member.id), ['owner']);
  assert.deepEqual(store.list('devices').map(device => device.id), ['local']);
  const device = store.get('devices', 'local')!;
  assert.equal(device.host, hostname());
  assert.equal(device.memoryBytes, totalmem());
  assert.equal(device.cores, cpus().length);
  assert.equal(device.status, 'online');
  assert.equal(store.list('tasks').length, 0);
  assert.equal(store.list('experiences').length, 0);
  const project = store.create('projects', { name: '真实项目', deviceId: 'local', repository: 'D:/projects/example' });
  const task = store.create('tasks', { projectId: project.id, title: '整理接口', status: 'queued', acceptance: '验收说明' });
  const experience = store.create('experiences', { projectId: project.id, title: '接口排查', content: '实际处理步骤', scope: 'private' });
  store.update('tasks', task.id, { status: 'blocked', reason: '等待真实执行器' });
  store.update('projects', project.id, { id: 'spoofed', createdAt: 'changed', name: '修订项目' });
  store.setSetting('model', { provider: 'configured-provider', model: 'configured-model' });
  store.close();
  const reopened = open(directory);
  assert.equal(reopened.get('projects', project.id)?.name, '修订项目');
  assert.equal(reopened.get('projects', project.id)?.createdAt, project.createdAt);
  assert.equal(reopened.get('projects', 'spoofed'), undefined);
  assert.equal(reopened.get('tasks', task.id)?.status, 'blocked');
  assert.equal(reopened.get('experiences', experience.id)?.content, '实际处理步骤');
  assert.deepEqual(reopened.getSetting('model'), { provider: 'configured-provider', model: 'configured-model' });
  assert.throws(() => reopened.update('tasks', 'absent', { status: 'complete' }), StoreNotFoundError);
  assert.throws(() => reopened.list('arbitrary-table'), TypeError);
});

test('management setup is one-time, credentials are hashed, and login can be revoked after restart', t => {
  const { directory, store, open } = fixture(t);
  const password = 'Strong initial password 2026!';
  assert.equal(store.hasAccount(), false);
  assert.equal(store.verifyPassword(password), false);
  assert.throws(() => store.createLogin(), StoreConflictError);
  store.setPassword(password);
  assert.equal(store.verifyPassword(password), true);
  assert.equal(store.verifyPassword('wrong-password'), false);
  assert.throws(() => store.setPassword('Replacement password!'), StoreConflictError);
  const token = store.createLogin();
  assert.equal(store.validateLogin(token), true);
  assert.equal(store.validateLogin('unissued-token'), false);
  const inspection = new DatabaseSync(store.databasePath, { readOnly: true });
  try {
    const auth = inspection.prepare('SELECT * FROM auth').get()!;
    assert.equal(String(auth.passwordHash).includes(password), false);
    assert.ok(String(auth.salt).length >= 32);
    const login = inspection.prepare('SELECT * FROM logins').get()!;
    assert.notEqual(login.tokenHash, token);
    assert.equal(String(login.tokenHash).length, 64);
    assert.ok(Number(login.expiresAt) > Date.now() + 7 * 60 * 60 * 1000);
  } finally { inspection.close(); }
  store.close();
  const reopened = open(directory);
  assert.equal(reopened.hasAccount(), true);
  assert.equal(reopened.verifyPassword(password), true);
  assert.equal(reopened.validateLogin(token), true);
  reopened.deleteLogin(token);
  assert.equal(reopened.validateLogin(token), false);
});

test('conversation access is enforced for reads, writes, session paths and actor-filtered lists', t => {
  const { directory, store, open } = fixture(t);
  const member = store.create('members', { name: '成员 B', role: 'member', voice: '默认', wakeWord: '你好', preferences: '' });
  const first = store.createConversation('actor-a', 'owner', '个人对话 A');
  const second = store.createConversation('actor-b', member.id, '个人对话 B');
  store.addMessage('actor-a', first.id, { role: 'user', content: '仅 A 可见', status: 'complete' });
  store.addMessage('actor-a', first.id, { role: 'assistant', content: 'A 的回答', status: 'interrupted' });
  store.setSessionPath('actor-a', first.id, join(directory, 'pi', 'session-a.jsonl'));
  assert.deepEqual(store.listConversations('actor-a').map(item => item.id), [first.id]);
  assert.deepEqual(store.listConversations('actor-a', member.id), []);
  assert.deepEqual(store.messages('actor-b', second.id), []);
  assert.throws(() => store.getConversation('actor-b', first.id), StoreAccessError);
  assert.throws(() => store.messages('actor-b', first.id), StoreAccessError);
  assert.throws(() => store.setSessionPath('actor-b', first.id, 'cross-person.jsonl'), StoreAccessError);
  assert.throws(() => store.addMessage('actor-b', first.id, { role: 'user', content: '跨人写入', status: 'complete' }), StoreAccessError);
  assert.throws(() => store.createConversation('actor-a', 'unknown-member', '无效'), StoreNotFoundError);
  assert.throws(() => store.messages('actor-a', 'unknown-conversation'), StoreNotFoundError);
  store.close();
  const reopened = open(directory);
  assert.equal(reopened.getConversation('actor-a', first.id)?.sessionPath, join(directory, 'pi', 'session-a.jsonl'));
  assert.deepEqual(reopened.messages('actor-a', first.id).map(item => [item.content, item.status]), [
    ['仅 A 可见', 'complete'], ['A 的回答', 'interrupted'],
  ]);
  assert.throws(() => reopened.messages('actor-b', first.id), StoreAccessError);
});

test('backup restores accounts, relationships, conversations and settings as a consistent independent database', t => {
  const { directory, store, open } = fixture(t);
  store.setPassword('Backup password 2026!');
  const token = store.createLogin();
  const project = store.create('projects', { name: '备份项目', deviceId: 'local' });
  const task = store.create('tasks', { projectId: project.id, status: 'blocked', title: '等待验证' });
  const conversation = store.createConversation('server-admin', 'owner', '恢复验证');
  store.addMessage('server-admin', conversation.id, { role: 'user', content: '恢复后保留', status: 'complete' });
  store.setSetting('provider', 'configured-provider');
  const restoredDirectory = join(directory, "restore 'quoted' directory");
  store.backup(join(restoredDirectory, 'jarvis.db'));
  store.update('tasks', task.id, { status: 'manual-complete' });
  const restored = open(restoredDirectory);
  assert.equal(restored.verifyPassword('Backup password 2026!'), true);
  assert.equal(restored.validateLogin(token), true);
  assert.equal(restored.get('tasks', task.id)?.projectId, project.id);
  assert.equal(restored.get('tasks', task.id)?.status, 'blocked');
  assert.equal(restored.get('projects', project.id)?.deviceId, 'local');
  assert.equal(restored.messages('server-admin', conversation.id)[0]?.content, '恢复后保留');
  assert.equal(restored.getSetting('provider'), 'configured-provider');
  assert.throws(() => store.backup(store.databasePath), TypeError);
});

test('nonsecret settings and compact audit metadata do not become a credential or chat archive', t => {
  const { store } = fixture(t);
  assert.throws(() => store.setSetting('apiKey', 'secret'), TypeError);
  assert.throws(() => store.setSetting('provider', { nested: { accessToken: 'secret' } }), TypeError);
  store.audit('conversation.finish', 'conversation-id', {
    model: 'configured-model', status: 'interrupted', tokens: 27,
    content: '完整私人聊天不应进入审计', authorization: 'Bearer secret', nested: { password: 'password-secret' },
  });
  const audit = store.listAudit()[0]!;
  const encoded = JSON.stringify(audit);
  assert.equal(encoded.includes('完整私人聊天'), false);
  assert.equal(encoded.includes('password-secret'), false);
  assert.equal(encoded.includes('Bearer secret'), false);
  assert.ok(encoded.includes('configured-model'));
  assert.ok(encoded.includes('interrupted'));
  for (let index = 0; index < 60; index++) store.audit('task.update', `task-${index}`, { state: 'blocked' });
  assert.equal(store.listAudit().length, 50);
  assert.equal(store.listAudit()[0]?.subjectId, 'task-59');
});
