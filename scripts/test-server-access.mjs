import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm, access, link, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseInventory, parsePublicKey, verifiedHostKey, prepareAccess, verifyAccess, renderAuthorization, findTools, runCommand } from './server-access.mjs';

const execute = promisify(execFile);
function publicKey(comment = 'fixture') {
  const { publicKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const type = Buffer.from('ssh-ed25519');
  const prefix = Buffer.alloc(4), length = Buffer.alloc(4);
  prefix.writeUInt32BE(type.length); length.writeUInt32BE(raw.length);
  return `ssh-ed25519 ${Buffer.concat([prefix, type, length, raw]).toString('base64')} ${comment}`;
}
const hostPublic = publicKey('host');
const server = { id: 'fixture', host: '127.0.0.1', port: 2222, user: 'testuser', hostname: 'server-test', fingerprint: parsePublicKey(hostPublic).fingerprint };
const inventory = { version: 1, servers: [server] };
const makeDir = () => mkdtemp(join(tmpdir(), 'jarvis-server-access-test-'));
async function cleanup(dir) {
  const target = resolve(dir), parent = resolve(tmpdir());
  assert(target.startsWith(parent + sep) && target.includes('jarvis-server-access-test-'));
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

test('inventory rejects command injection, duplicate identities and secret fields; IPv6/nondefault ports are supported', () => {
  assert.equal(parseInventory(inventory)[0].port, 2222);
  for (const change of [{ host: '-oProxyCommand=evil' }, { host: 'host\nHost *' }, { user: 'name;command' }, { hostname: 'server\nHost *' }, { port: 70000 }, { fingerprint: 'untrusted' }, { password: 'never-store' }, { id: '../outside' }]) {
    assert.throws(() => parseInventory({ version: 1, servers: [{ ...server, ...change }] }));
  }
  assert.throws(() => parseInventory({ version: 1, servers: [server, { ...server, id: 'FIXTURE', host: 'another.example' }] }));
  assert.throws(() => parseInventory({ version: 1, servers: [server, { ...server, id: 'other' }] }));
  const ipv6 = { ...server, host: '::1' };
  assert.equal(parseInventory({ version: 1, servers: [ipv6] })[0].host, '::1');
  assert.match(verifiedHostKey(ipv6, ['scan'], () => ({ status: 0, stdout: '[::1]:2222 ' + parsePublicKey(hostPublic).material + '\n' })), /^\[::1\]:2222 ssh-ed25519 /);
});

test('public-key parsing validates SSH wire encoding and rejects multiline/private input', () => {
  const parsed = parsePublicKey(hostPublic + '\r\n');
  assert.match(parsed.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.equal(parsed.fingerprint, 'SHA256:' + createHash('sha256').update(Buffer.from(parsed.blob, 'base64')).digest('base64').replace(/=+$/, ''));
  for (const text of ['-----BEGIN OPENSSH PRIVATE KEY-----', hostPublic + '\n' + hostPublic, 'ssh-ed25519 AAAA fixture', hostPublic + '\u0000', hostPublic.replace('ssh-ed25519 ', 'ssh-rsa ')]) assert.throws(() => parsePublicKey(text));
});

test('scanner fallback handles unavailable tools, but never falls back past an actual fingerprint mismatch', () => {
  const calls = [];
  const result = verifiedHostKey(server, ['old', 'new'], program => {
    calls.push(program);
    return program === 'old' ? { status: 1, stdout: '', stderr: 'unsupported KEX' } : { status: 0, stdout: '# comment\n[127.0.0.1]:2222 ' + parsePublicKey(hostPublic).material + '\n' };
  });
  assert.deepEqual(calls, ['old', 'new']); assert.match(result, /^\[127.0.0.1\]:2222/);
  const visited = [];
  assert.throws(() => verifiedHostKey(server, ['mismatch', 'matching'], program => { visited.push(program); return { status: 0, stdout: 'host ' + parsePublicKey(publicKey()).material + '\n' }; }), /fingerprint mismatch/);
  assert.deepEqual(visited, ['mismatch']);
});

test('all host fingerprints are checked before creating any private identities', async () => {
  const dir = await makeDir();
  try {
    const inv = { version: 1, servers: [server, { ...server, id: 'second', host: '127.0.0.2' }] };
    await assert.rejects(prepareAccess({ inventory: inv, output: join(dir, 'public'), identityDir: join(dir, 'keys'), clientId: 'test', tools: { scans: ['scanner'], keygen: 'never-run' }, run: (_program, args) => ({ status: 0, stdout: 'host ' + parsePublicKey(args.at(-1) === '127.0.0.1' ? hostPublic : publicKey()).material + '\n' }) }), /fingerprint mismatch/);
    assert.equal(existsSync(join(dir, 'keys')), false);
    assert.equal(existsSync(join(dir, 'public')), false);
    await assert.rejects(prepareAccess({ inventory, output: join(dir, 'public'), identityDir: join(dir, 'public/keys'), clientId: 'test' }), /must not overlap/);
  } finally { await cleanup(dir); }
});

test('prepare creates real protected local keys, reuses their bytes, freezes public artifacts and checks login identity', async () => {
  const dir = await makeDir(), tools = { ...findTools(), scans: ['fixture-scanner'], ssh: 'fixture-ssh' };
  const argsSeen = [];
  const run = (program, args, options) => {
    if (program === 'fixture-scanner') return { status: 0, stdout: 'host ' + parsePublicKey(hostPublic).material + '\n' };
    if (program === 'fixture-ssh') { argsSeen.push(args); return { status: 0, stdout: 'testuser\nserver-test\n' }; }
    return runCommand(program, args, options);
  };
  const output = join(dir, 'public'), identityDir = join(dir, 'keys');
  try {
    const first = await prepareAccess({ inventory, output, identityDir, clientId: 'manager-one', tools, run });
    const privateFile = first.servers[0].identityFile;
    const before = await readFile(privateFile);
    const again = await prepareAccess({ inventory, output, identityDir, clientId: 'manager-one', tools, run });
    assert.deepEqual(await readFile(privateFile), before);
    assert.equal(first.servers[0].publicFingerprint, again.servers[0].publicFingerprint);
    for (const name of Object.keys(first.files)) assert(!String(await readFile(join(output, name))).includes('BEGIN OPENSSH PRIVATE KEY'));
    const config = await readFile(join(output, 'ssh-config'), 'utf8');
    assert.match(config, /StrictHostKeyChecking yes/); assert.match(config, /IdentitiesOnly yes/);
    assert(!config.includes('accept-new')); assert(!config.includes('StrictHostKeyChecking no'));
    const report = await verifyAccess({ output, tools, run });
    assert.equal(report.status, 'passed'); assert.equal(report.remoteWrites, 0);
    assert.equal(argsSeen.length, 1); assert.equal(argsSeen[0].at(-1), 'id -un; hostname'); assert(argsSeen[0].includes('BatchMode=yes'));
    const wrong = await verifyAccess({ output, tools, run: () => ({ status: 0, stdout: 'testuser\nwrong-server\n' }) });
    assert.equal(wrong.status, 'failed');
    const manifestFile = join(output, 'bundle.json'), originalManifest = await readFile(manifestFile, 'utf8');
    const unsafeConfig = config + '\nProxyCommand unwanted-command\n';
    const changedManifest = JSON.parse(originalManifest);
    changedManifest.files['ssh-config'] = createHash('sha256').update(unsafeConfig).digest('hex');
    await writeFile(join(output, 'ssh-config'), unsafeConfig);
    await writeFile(manifestFile, JSON.stringify(changedManifest));
    await assert.rejects(verifyAccess({ output, tools, run: () => { throw new Error('must not connect'); } }), /fixed connection settings/);
    await writeFile(join(output, 'ssh-config'), config);
    await writeFile(manifestFile, originalManifest);
    const knownFile = join(output, 'known_hosts'), originalKnown = await readFile(knownFile, 'utf8');
    const unsafeKnown = '[127.0.0.1]:2222 ' + parsePublicKey(publicKey()).material + '\n';
    const changedHostsManifest = JSON.parse(originalManifest);
    changedHostsManifest.files.known_hosts = createHash('sha256').update(unsafeKnown).digest('hex');
    await writeFile(knownFile, unsafeKnown);
    await writeFile(manifestFile, JSON.stringify(changedHostsManifest));
    await assert.rejects(verifyAccess({ output, tools, run: () => { throw new Error('must not connect'); } }), /Pinned host key differs/);
    await writeFile(knownFile, originalKnown);
    await writeFile(manifestFile, originalManifest);
    const script = join(output, 'authorize-fixture.sh');
    await writeFile(script, (await readFile(script, 'utf8')) + '# changed\n');
    await assert.rejects(verifyAccess({ output, tools, run: () => { throw new Error('should not connect'); } }), /Bundle file changed/);
    const oldPublic = await readFile(privateFile + '.pub', 'utf8');
    const otherPublic = publicKey(); await writeFile(privateFile + '.pub', otherPublic + '\n');
    await assert.rejects(prepareAccess({ inventory, output, identityDir, clientId: 'manager-one', tools, run }), /Public\/private key mismatch/);
    assert.equal(await readFile(privateFile + '.pub', 'utf8'), otherPublic + '\n');
    assert.deepEqual(await readFile(privateFile), before);
    await writeFile(privateFile + '.pub', oldPublic);
  } finally { await cleanup(dir); }
});

test('orphan public key cannot be replaced by a new generated identity', async () => {
  const dir = await makeDir();
  try {
    const keys = join(dir, 'keys'); await mkdir(keys);
    const publicFile = join(keys, 'id_ed25519_jarvis_fixture.pub'), original = publicKey() + '\n';
    await writeFile(publicFile, original);
    await assert.rejects(prepareAccess({ inventory, output: join(dir, 'public'), identityDir: keys, clientId: 'test', tools: { scans: ['fixture'], keygen: 'must-not-run' }, run: () => ({ status: 0, stdout: 'host ' + parsePublicKey(hostPublic).material + '\n' }) }), /Public key exists without/);
    assert.equal(await readFile(publicFile, 'utf8'), original);
    assert.equal(existsSync(publicFile.slice(0, -4)), false);
  } finally { await cleanup(dir); }
});

test('actual Bash authorization preserves old keys and restrictions, handles missing final newline and rejects wrong targets/invalid keys/hard links', async () => {
  const dir = await makeDir();
  const bash = process.platform === 'win32' ? ['D:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe'].find(existsSync) : '/bin/bash';
  assert(bash && existsSync(bash), 'Bash is required for the real script test');
  try {
    const home = join(dir, 'home'), bin = join(dir, 'bin'); await mkdir(home); await mkdir(bin);
    // Only account/hostname are fixed in this sandbox; file operations and SSH validation are real.
    await writeFile(join(bin, 'id'), '#!/bin/sh\nif [ "$1" = "-un" ]; then printf "testuser\\n"; else /usr/bin/id "$@"; fi\n', { mode: 0o755 });
    await writeFile(join(bin, 'hostname'), '#!/bin/sh\nprintf "server-test\\n"\n', { mode: 0o755 });
    const runScript = async (filename, extra = {}) => {
      const runner = 'if command -v cygpath >/dev/null; then export HOME="$(cygpath -u "$JARVIS_TEST_HOME")"; export PATH="$(cygpath -u "$JARVIS_TEST_BIN"):/usr/bin:/bin"; script="$(cygpath -u "$JARVIS_TEST_SCRIPT")"; else export HOME="$JARVIS_TEST_HOME"; export PATH="$JARVIS_TEST_BIN:/usr/bin:/bin"; script="$JARVIS_TEST_SCRIPT"; fi; bash "$script"';
      return execute(bash, ['-c', runner], { env: { ...process.env, SUDO_USER: '', JARVIS_TEST_HOME: home, JARVIS_TEST_BIN: bin, JARVIS_TEST_SCRIPT: filename, ...extra }, encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    };
    const a = publicKey('first'), b = publicKey('restricted'), c = publicKey('parallel');
    const aScript = join(dir, 'a.sh'), bScript = join(dir, 'b.sh'), cScript = join(dir, 'c.sh');
    await writeFile(aScript, await renderAuthorization(server, a));
    await writeFile(bScript, await renderAuthorization(server, b));
    await writeFile(cScript, await renderAuthorization(server, c));
    await execute(bash, ['-n', aScript], { windowsHide: true });
    const sshDir = join(home, '.ssh'); await mkdir(sshDir);
    const auth = join(sshDir, 'authorized_keys');
    const original = '# preserve this line\ncommand="echo keep me",no-port-forwarding ' + b;
    await writeFile(auth, original);
    assert.match((await runScript(aScript)).stdout, /status=added/);
    const appended = await readFile(auth, 'utf8');
    assert.equal(appended, original + '\n' + a + '\n');
    await writeFile(aScript, await renderAuthorization(server, a.replace('first', 'new-comment')));
    assert.match((await runScript(aScript)).stdout, /already-present/);
    assert.equal(await readFile(auth, 'utf8'), appended);
    assert.match((await runScript(bScript)).stdout, /already-present/);
    assert.equal(await readFile(auth, 'utf8'), appended);
    await Promise.all([runScript(cScript), runScript(cScript)]);
    const concurrent = await readFile(auth, 'utf8');
    assert.equal(concurrent.split(parsePublicKey(c).blob).length - 1, 1);
    for (const change of [{ user: 'wronguser' }, { hostname: 'wrong-host' }]) {
      const filename = join(dir, 'wrong.sh'); await writeFile(filename, await renderAuthorization({ ...server, ...change }, a));
      await assert.rejects(runScript(filename)); assert.equal(await readFile(auth, 'utf8'), concurrent);
    }
    await assert.rejects(runScript(aScript, { SUDO_USER: 'someone' }));
    const malformed = join(dir, 'malformed.sh');
    const source = await readFile(aScript, 'utf8');
    await writeFile(malformed, source.replace(parsePublicKey(a).blob, 'AAAA'));
    await assert.rejects(runScript(malformed)); assert.equal(await readFile(auth, 'utf8'), concurrent);
    await link(auth, join(dir, 'hard-linked-authorized-keys'));
    await assert.rejects(runScript(aScript)); assert.equal(await readFile(auth, 'utf8'), concurrent);
    await unlink(join(dir, 'hard-linked-authorized-keys'));
    await access(sshDir);
  } finally { await cleanup(dir); }
});
