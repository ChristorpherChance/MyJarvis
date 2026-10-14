import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import vm from 'node:vm';
import { PROFILES, permissionPlan, renderPermissionInstaller, preparePermissions, auditPermissions, classifyPrivileges, browserRendererSource, normalizePermissionServer, permissionConnectionInventory } from './server-permissions.mjs';
import { runCommand, parseInventory } from './server-access.mjs';

const server = { id: 'test', host: '127.0.0.1', port: 22, user: 'testuser', hostname: 'jarvis-permissions-fixture-host', fingerprint: 'SHA256:' + 'a'.repeat(43) };
const inventory = { version: 1, servers: [server] };
async function cleanup(dir) {
  assert(resolve(dir).startsWith(resolve(tmpdir()) + sep) && dir.includes('jarvis-permissions-test-'));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

test('five explicit profiles have bounded grants; root, shell injection and arbitrary service paths are rejected', () => {
  assert.equal(PROFILES.length, 5);
  const login = permissionPlan({ user: 'jarvis_user', profile: 'login' });
  assert.equal(Object.keys(login.wrappers).length, 0); assert(!login.sudoers.includes('ALL='));
  const diagnostic = permissionPlan({ user: 'jarvis_watch', profile: 'diagnostics' });
  assert(!diagnostic.sudoers.includes('/usr/sbin/smartctl')); assert(!diagnostic.sudoers.includes('NOPASSWD: ALL'));
  assert.match(diagnostic.sudoers, /\/diagnostics\n$/);
  const operator = permissionPlan({ user: 'jarvis_ops', profile: 'operator', unit: 'jarvis-platform.service' });
  assert.equal(Object.keys(operator.wrappers).length, 2);
  assert.match(operator.wrappers.operator, /unit='jarvis-platform.service'/);
  assert.match(operator.wrappers.operator, /\[ "\$#" = 1 \]/);
  assert.match(operator.wrappers.operator, /--no-pager/);
  assert.match(operator.wrappers.operator, /\/usr\/bin\/env -i/);
  assert.match(diagnostic.wrappers.diagnostics, /\[ "\$#" = 2 \]/);
  assert.match(diagnostic.wrappers.diagnostics, /smartctl -a "\$device"/);
  assert.match(permissionPlan({ user: 'jarvis_admin', profile: 'admin-password' }).sudoers, /PASSWD: ALL/);
  assert.match(permissionPlan({ user: 'jarvis_admin', profile: 'admin-full' }).sudoers, /NOPASSWD: ALL/);
  for (const change of [{ user: 'root' }, { user: 'user\nALL' }, { unit: '--system.service' }, { unit: '../../ssh.service' }, { unit: 'jarvis.service;reboot' }, { profile: 'unknown' }]) assert.throws(() => permissionPlan({ user: 'testuser', profile: 'operator', ...change }));
});

test('root probes alone never imply permanent unrestricted root; parsed grants and successful probe are both required', () => {
  const rootProbe = { status: 0, stdout: '0\n' };
  assert.equal(classifyPrivileges({ sudoList: { status: 0, stdout: '(ALL) NOPASSWD: ALL\n' }, rootProbe }).fullUnattendedRoot, true);
  assert.equal(classifyPrivileges({ sudoList: { status: 0, stdout: '(ALL : ALL) NOPASSWD: ALL\n' }, rootProbe }).fullUnattendedRoot, true);
  assert.equal(classifyPrivileges({ sudoList: { status: 0, stdout: '(ALL : ALL) ALL\n' }, rootProbe }).fullUnattendedRoot, false);
  assert.equal(classifyPrivileges({ sudoList: { status: 0, stdout: '(root) NOPASSWD: /usr/bin/id\n' }, rootProbe }).fullUnattendedRoot, false);
  assert.equal(classifyPrivileges({ sudoList: { status: 0, stdout: '(root) NOPASSWD: ALL, !/bin/bash\n' }, rootProbe }).fullUnattendedRoot, false);
  assert.equal(classifyPrivileges({ sudoList: { status: 0, stdout: '(root) NOPASSWD: ALL\n' }, rootProbe: { status: 1, stdout: '' } }).fullUnattendedRoot, false);
});

test('all generated installers pass actual Bash parsing, preview without root changes, and retain rollback and owner checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-permissions-test-'));
  const bash = process.platform === 'win32' ? ['D:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe'].find(existsSync) : '/bin/bash';
  assert(bash, 'Bash required');
  try {
    for (const profile of PROFILES) {
      const plan = permissionPlan({ user: 'testuser', profile: profile.id });
      const source = await renderPermissionInstaller(server, plan), file = join(dir, profile.id + '.sh');
      assert(!source.includes('@@')); assert.match(source, /apply=0/); assert.match(source, /visudo -c -f/); assert.match(source, /managed files restored/);
      assert.match(source, /safe_tree_file/); assert.match(source, /Existing permissions from other policies or groups remain unchanged/);
      await writeFile(file, source);
      assert.equal(runCommand(bash, ['-n', file]).status, 0);
      const preview = runCommand(bash, [file]);
      assert.equal(preview.status, 0); assert.match(preview.stdout, /No permissions changed/); assert(preview.stdout.includes(plan.sudoers.trim()));
      const declined = runCommand(bash, [file, '--apply']);
      assert.notEqual(declined.status, 0); // unprivileged Windows sandbox, or unmatched hostname on root CI.
      for (const [name, wrapper] of Object.entries(plan.wrappers)) {
        const wrapperFile = join(dir, profile.id + '-' + name + '.sh'); await writeFile(wrapperFile, wrapper);
        assert.equal(runCommand(bash, ['-n', wrapperFile]).status, 0);
        assert.match(wrapper, /^#!\/bin\/bash -p/);
      }
    }
  } finally { await cleanup(dir); }
});

test('offline preparation creates reviewable plans, honors explicit account/server selection and never writes a remote policy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-permissions-test-'));
  try {
    const report = await preparePermissions({ inventory, output: dir, profile: 'operator', user: 'jarvis-ops', serverId: 'test' });
    assert.equal(report.remotePermissionChanges, 0); assert.equal(report.files[0].user, 'jarvis-ops');
    const body = await readFile(join(dir, report.files[0].installer), 'utf8');
    assert.match(body, /target_user='jarvis-ops'/); assert.match(body, /expected_host='jarvis-permissions-fixture-host'/);
    await assert.rejects(preparePermissions({ inventory, output: dir, profile: 'operator', serverId: 'missing' }), /not in inventory/);
    await assert.rejects(preparePermissions({ inventory, output: dir }), /Unknown permission profile/);
  } finally { await cleanup(dir); }
});

test('permission audits are fixed read-only commands, bind remote identity and preserve unknown/denied privileges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-permissions-test-'));
  try {
    const raw = { user: 'testuser', hostname: server.hostname, groups: ['testuser'], sudoList: { status: 0, stdout: '(ALL) NOPASSWD: ALL\n' }, rootProbe: { status: 0, stdout: '0\n' } };
    const run = (_program, args) => { assert(args.includes('BatchMode=yes')); assert(args.at(-1).includes('sudo","-n","-l')); assert(!args.at(-1).includes('useradd')); return { status: 0, stdout: JSON.stringify(raw), stderr: '' }; };
    const report = await auditPermissions({ inventory, sshConfig: join(dir, 'ssh-config'), output: join(dir, 'audit.json'), run });
    assert.equal(report.serverPermissionChanges, 0); assert.equal(report.checks[0].fullUnattendedRoot, true);
    const wrong = await auditPermissions({ inventory, sshConfig: join(dir, 'ssh-config'), output: join(dir, 'wrong.json'), run: () => ({ status: 0, stdout: JSON.stringify({ ...raw, hostname: 'wrong' }), stderr: '' }) });
    assert.equal(wrong.status, 'failed');
    const denied = await auditPermissions({ inventory, sshConfig: join(dir, 'ssh-config'), output: join(dir, 'denied.json'), run: () => ({ status: 0, stdout: JSON.stringify({ ...raw, sudoList: { status: 1, stdout: '' }, rootProbe: { status: 1, stdout: '' } }), stderr: '' }) });
    assert.equal(denied.checks[0].fullUnattendedRoot, false); assert.equal(denied.checks[0].sudoRulesAvailable, false);
    const unreachable = await auditPermissions({ inventory, sshConfig: join(dir, 'ssh-config'), output: join(dir, 'unreachable.json'), run: () => { throw Error('connection timeout'); } });
    assert.equal(unreachable.status, 'failed'); assert.match(unreachable.checks[0].error, /timeout/);
  } finally { await cleanup(dir); }
});

test('browser downloads share the tested renderer and match Node installer bytes for every profile', async () => {
  const api = vm.runInNewContext(browserRendererSource() + '\n({permissionPlan,renderInstallerTemplate})', {});
  const template = await readFile(new URL('./install-server-permissions.sh', import.meta.url), 'utf8');
  for (const profile of PROFILES) {
    const options = { user: 'jarvis-ops', profile: profile.id, unit: 'jarvis-platform.service' };
    const browserPlan = api.permissionPlan(options), nodePlan = permissionPlan(options);
    assert.equal(JSON.stringify(browserPlan), JSON.stringify(nodePlan));
    assert.equal(api.renderInstallerTemplate(template, server, browserPlan), await renderPermissionInstaller(server, nodePlan));
  }
});

test('manual server fields reject malformed endpoints, shell input, secrets and missing host identity', () => {
  assert.equal(normalizePermissionServer(server).port, 22);
  for (const host of ['192.168.10.120', 'i3-backup.home', 'localhost', '2001:db8::10', '::ffff:192.168.10.120']) assert.equal(normalizePermissionServer({ ...server, host }).host, host);
  for (const change of [
    { id: '../outside' }, { host: 'http://192.168.10.120' }, { host: '192.168.10.120:2222' },
    { host: '999.10.10.10' }, { host: '192.168.010.120' }, { host: 'host..local' },
    { host: '[::1]' }, { host: ':::' }, { host: 'bad;whoami' }, { host: 'host/path' },
    { hostname: '' }, { hostname: 'host\ncommand' }, { port: 0 }, { port: 65536 },
    { port: 22.5 }, { port: '22' }, { user: 'root' }, { user: 'Windows Admin' },
    { fingerprint: 'untrusted' }, { password: 'never-save' }
  ]) assert.throws(() => normalizePermissionServer({ ...server, ...change }));
  const { fingerprint, ...noFingerprint } = server;
  assert.equal(normalizePermissionServer(noFingerprint).fingerprint, undefined);
  assert.equal(normalizePermissionServer({ ...noFingerprint, fingerprint: '' }).fingerprint, undefined);
});

test('manual SSH inventories require a trusted fingerprint and use the granted account, not the current administrator', async () => {
  const { fingerprint, ...noFingerprint } = server;
  assert.throws(() => permissionConnectionInventory(noFingerprint, 'jarvis-ops'), /主机指纹/);
  const connection = permissionConnectionInventory(server, 'jarvis-ops');
  assert.equal(parseInventory(connection)[0].user, 'jarvis-ops');
  assert.equal(server.user, 'testuser');
  const api = vm.runInNewContext(browserRendererSource() + '\n({normalizePermissionServer,permissionConnectionInventory})', { URL });
  for (const host of [server.host, '2001:db8::10']) {
    const manual = { ...server, host, port: 2222 };
    assert.equal(JSON.stringify(api.permissionConnectionInventory(manual, 'jarvis-ops')), JSON.stringify(permissionConnectionInventory(manual, 'jarvis-ops')));
  }
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-permissions-test-'));
  try {
    const report = await preparePermissions({ inventory: connection, output: dir, profile: 'operator', serverId: 'test' });
    assert.equal(report.files[0].user, 'jarvis-ops');
    assert.equal(report.remotePermissionChanges, 0);
    assert.match(await readFile(join(dir, report.files[0].installer), 'utf8'), /expected_host='jarvis-permissions-fixture-host'/);
  } finally { await cleanup(dir); }
});
