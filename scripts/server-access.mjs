#!/usr/bin/env node
// Reusable public-key onboarding. Private keys stay on the management computer.
import { readFile, writeFile, mkdir, lstat, chmod, mkdtemp, rename, unlink, rmdir, open, link, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { homedir, hostname as localHostname } from 'node:os';
import { isIP } from 'node:net';
import { dirname, resolve, join, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const slug = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const fingerprintPattern = /^SHA256:[A-Za-z0-9+/]{43}$/;
const inside = (target, parent) => {
  if (process.platform === 'win32') { target = target.toLowerCase(); parent = parent.toLowerCase(); }
  return target === parent || target.startsWith(parent + sep);
};
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const sshPath = value => value.replaceAll('\\', '/');

export function runCommand(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024, ...options });
  if (result.error) throw new Error(`${program}: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function parsePublicKey(text) {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid public key size');
  const line = text.replace(/\r?\n$/, '');
  if (/[\x00-\x1f\x7f]/.test(line)) throw new Error('Expected one public key line');
  const match = line.match(/^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})(?: ([^\r\n]*))?$/);
  if (!match) throw new Error('Expected an Ed25519 public key');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length !== 51 || bytes.readUInt32BE(0) !== 11 || bytes.subarray(4, 15).toString() !== 'ssh-ed25519' || bytes.readUInt32BE(15) !== 32 || bytes.toString('base64') !== match[1]) throw new Error('Invalid Ed25519 key encoding');
  return { blob: match[1], material: `ssh-ed25519 ${match[1]}`, fingerprint: 'SHA256:' + createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '') };
}

export function parseInventory(value) {
  if (!value || Object.keys(value).some(key => !['version', 'servers'].includes(key)) || value.version !== 1 || !Array.isArray(value.servers) || !value.servers.length || value.servers.length > 100) throw new Error('Expected version=1 and 1–100 servers; no other inventory fields');
  const ids = new Set(), endpoints = new Set();
  return value.servers.map(row => {
    if (!row || Object.keys(row).some(key => !['id', 'host', 'port', 'user', 'hostname', 'fingerprint'].includes(key))) throw new Error('Unknown server field; never put passwords or private keys in inventory');
    if (typeof row.id !== 'string' || !slug.test(row.id) || ids.has(row.id.toLowerCase())) throw new Error('Invalid or duplicate server id');
    ids.add(row.id.toLowerCase());
    const host = row.host;
    if (typeof host !== 'string' || host.length > 253 || (!isIP(host) && !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) || host.startsWith('-')) throw new Error('Invalid server host');
    const port = row.port ?? 22;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
    if (typeof row.user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(row.user)) throw new Error('Invalid SSH user');
    if (row.hostname !== undefined && (typeof row.hostname !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(row.hostname))) throw new Error('Invalid expected hostname');
    if (typeof row.fingerprint !== 'string' || !fingerprintPattern.test(row.fingerprint)) throw new Error('A trusted Ed25519 SHA256 fingerprint is required');
    const endpoint = `${host.toLowerCase()}:${port}`;
    if (endpoints.has(endpoint)) throw new Error('Duplicate server address and port');
    endpoints.add(endpoint);
    return { id: row.id, host, port, user: row.user, ...(row.hostname ? { hostname: row.hostname } : {}), fingerprint: row.fingerprint };
  });
}

export function findTools() {
  const gitBins = process.platform === 'win32' ? [
    'D:/Program Files/Git/usr/bin',
    join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/usr/bin'),
    join(process.env.LOCALAPPDATA ?? homedir(), 'Programs/Git/usr/bin')
  ] : [];
  if (process.platform === 'win32') {
    try {
      const found = runCommand('where.exe', ['git']);
      for (const filename of found.stdout.trim().split(/\r?\n/).filter(Boolean)) {
        let parent = dirname(filename);
        for (let depth = 0; depth < 3; depth++, parent = dirname(parent)) gitBins.push(join(parent, 'usr/bin'));
      }
    } catch { /* Git is optional; the system OpenSSH tools are still attempted. */ }
  }
  const gitTool = name => gitBins.map(dir => join(dir, name + '.exe')).find(existsSync);
  return { ssh: 'ssh', keygen: gitTool('ssh-keygen') ?? 'ssh-keygen', scans: [...new Set([gitTool('ssh-keyscan'), 'ssh-keyscan'].filter(Boolean))] };
}

export function verifiedHostKey(server, scans, run = runCommand) {
  for (const scanner of scans) {
    let result;
    try { result = run(scanner, ['-T', '5', '-t', 'ed25519', '-p', String(server.port), server.host]); }
    catch { continue; }
    if (result.status !== 0) continue;
    const keys = result.stdout.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 3 || fields[1] !== 'ssh-ed25519') throw new Error(`Unexpected host-key scan for ${server.id}`);
      return parsePublicKey(`${fields[1]} ${fields[2]}`);
    });
    if (!keys.length) continue;
    if (keys.some(key => key.fingerprint !== server.fingerprint)) throw new Error(`Host fingerprint mismatch for ${server.id}; inventory and server must be checked before proceeding`);
    return `${server.port === 22 ? server.host : `[${server.host}]:${server.port}`} ${keys[0].material}`;
  }
  throw new Error(`Cannot scan Ed25519 host key for ${server.id}; check its address, SSH service and scanner`);
}

async function regularFile(filename) {
  try {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Expected an unlinked regular file: ${filename}`);
    return true;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function secureIdentity(target, directory = false) {
  const stat = await lstat(target);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : (!stat.isFile() || stat.nlink !== 1))) throw new Error('Unsafe identity path');
  if (process.platform !== 'win32') {
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('Identity owner mismatch');
    await chmod(target, directory ? 0o700 : 0o600);
    return;
  }
  // Scope ACL repair to this key or newly created private directory, not ~/.ssh.
  const code = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$target=[IO.Path]::GetFullPath($env:JARVIS_SSH_IDENTITY_PATH)
$item=Get-Item -LiteralPath $target -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Identity path is a reparse point' }
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Read-IdentityAcl {
  if ($item.PSIsContainer) { return [IO.Directory]::GetAccessControl($target) }
  return [IO.File]::GetAccessControl($target)
}
$acl=Read-IdentityAcl
$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
if ($owner -ne $sid) { throw 'Identity owner mismatch; check the selected path' }
$allowed=@($sid,'S-1-5-18')
& icacls.exe $target '/inheritance:r' '/grant:r' "*$($sid):(F)" '*S-1-5-18:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect identity ACL' }
$acl=Read-IdentityAcl
foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
  $ruleSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if ($ruleSid -notin $allowed) {
    & icacls.exe $target '/remove' "*$ruleSid" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not remove an unrelated ACL' }
  }
}
foreach ($allowedSid in $allowed) {
  & icacls.exe $target '/remove:d' "*$allowedSid" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not remove a denied identity ACL' }
}
$acl=Read-IdentityAcl
$rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
foreach ($rule in $rules) {
  $ruleSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if ($rule.IsInherited -or $ruleSid -notin $allowed -or $rule.AccessControlType -ne 'Allow') { throw 'Identity ACL validation failed' }
}
foreach ($allowedSid in $allowed) {
  if (-not ($rules | Where-Object { $_.IdentityReference.Value -eq $allowedSid })) { throw 'Required identity ACL is absent' }
}
`;
  const result = runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { env: { ...process.env, JARVIS_SSH_IDENTITY_PATH: target } });
  if (result.status !== 0) throw new Error('Private identity ACL could not be secured: ' + result.stderr.trim().slice(0, 1500));
}

async function ensureIdentity(identityFile, comment, tools, run) {
  const lockFile = identityFile + '.jarvis-lock';
  const lock = await open(lockFile, 'wx', 0o600).catch(error => { throw new Error('Identity is being prepared, or a previous lock needs checking: ' + lockFile, { cause: error }); });
  let staging;
  try {
    const hasPrivate = await regularFile(identityFile), hasPublic = await regularFile(identityFile + '.pub');
    if (!hasPrivate && hasPublic) throw new Error('Public key exists without its private key; refusing to replace this identity');
    if (!hasPrivate) {
      staging = await mkdtemp(join(dirname(identityFile), '.jarvis-new-key-'));
      await secureIdentity(staging, true);
      const stagedKey = join(staging, 'identity');
      const result = run(tools.keygen, ['-q', '-t', 'ed25519', '-f', stagedKey, '-C', comment, '-N', '']);
      if (result.status !== 0) throw new Error('ssh-keygen could not generate the management identity');
      await secureIdentity(stagedKey);
      // Exclusive link preserves the protected key ACL and never overwrites a file.
      await link(stagedKey, identityFile);
      await unlink(stagedKey);
      await link(stagedKey + '.pub', identityFile + '.pub');
      await unlink(stagedKey + '.pub');
    }
    await secureIdentity(identityFile);
    const result = run(tools.keygen, ['-y', '-P', '', '-f', identityFile]);
    if (result.status !== 0) throw new Error('Cannot read the dedicated identity; do not provide a passphrase to this tool');
    const derived = parsePublicKey(result.stdout.trim());
    if (await regularFile(identityFile + '.pub')) {
      if (parsePublicKey(await readFile(identityFile + '.pub', 'utf8')).blob !== derived.blob) throw new Error('Public/private key mismatch; original files preserved');
    } else await writeFile(identityFile + '.pub', derived.material + ' ' + comment + '\n', { flag: 'wx', mode: 0o644 });
    return { ...derived, line: derived.material + ' ' + comment, identityFile };
  } finally {
    await lock.close();
    await unlink(lockFile);
    if (staging) {
      for (const name of ['identity', 'identity.pub']) await unlink(join(staging, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await rmdir(staging);
    }
  }
}

export async function renderAuthorization(server, publicKey) {
  parseInventory({ version: 1, servers: [server] });
  const key = parsePublicKey(publicKey);
  const template = await readFile(join(scriptDir, 'authorize-ssh-key.sh'), 'utf8');
  return template.replace("default_user=''", 'default_user=' + shellQuote(server.user))
    .replace("default_host=''", 'default_host=' + shellQuote(server.hostname ?? ''))
    .replace("default_key=''", 'default_key=' + shellQuote(publicKey.trim()))
    .replace('# Authorize one public key', `# Target ${server.id} (${server.host}:${server.port}); key ${key.fingerprint}\n# Authorize one public key`);
}

function quotedConfigPath(filename) {
  const value = sshPath(filename);
  if (/[\r\n\x00"%]/.test(value)) throw new Error('SSH configuration path contains unsupported characters');
  return '"' + value + '"';
}

function connectionConfig(entries, knownHosts) {
  return '# Generated local management profile; private keys are not in this bundle.\n\n' + entries.map(entry => [
    `Host ${entry.alias}`, `    HostName ${entry.host}`, `    User ${entry.user}`, `    Port ${entry.port}`,
    `    IdentityFile ${quotedConfigPath(entry.identityFile)}`, '    IdentitiesOnly yes', '    StrictHostKeyChecking yes',
    `    UserKnownHostsFile ${quotedConfigPath(knownHosts)}`, '    GlobalKnownHostsFile none', '    UpdateHostKeys no', '    HostKeyAlgorithms ssh-ed25519',
    '    KexAlgorithms curve25519-sha256', '    ConnectTimeout 5', '    ConnectionAttempts 1',
    '    ServerAliveInterval 30', '    ServerAliveCountMax 3', ''
  ].join('\n')).join('\n');
}

async function atomicWrite(filename, value) {
  const temp = filename + '.' + randomUUID() + '.tmp';
  await writeFile(temp, value, { flag: 'wx', mode: 0o600 });
  try { await rename(temp, filename); }
  finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function prepareAccess({ inventory, output, identityDir = join(homedir(), '.ssh/jarvis'), clientId = localHostname(), tools = findTools(), run = runCommand, onProgress = () => {} }) {
  const servers = parseInventory(inventory);
  if (!slug.test(clientId)) throw new Error('Use --client-id with 1–64 letters, digits, underscores or hyphens');
  output = resolve(output); identityDir = resolve(identityDir);
  if (inside(identityDir, projectDir)) throw new Error('Private identities must be outside the project');
  if (inside(identityDir, output) || inside(output, identityDir)) throw new Error('Public output and private identity directories must not overlap');
  quotedConfigPath(output); quotedConfigPath(identityDir);
  // Check every fingerprint first. A mismatch creates no new local identities.
  const hostKeys = servers.map(server => { onProgress(`Checking host fingerprint: ${server.id}`); return verifiedHostKey(server, tools.scans, run); });
  if (!existsSync(identityDir)) { await mkdir(identityDir, { recursive: true, mode: 0o700 }); await secureIdentity(identityDir, true); }
  if ((await lstat(identityDir)).isSymbolicLink()) throw new Error('Identity directory must not be a symbolic link');
  identityDir = await realpath(identityDir);
  if (inside(identityDir, await realpath(projectDir))) throw new Error('Private identities resolve inside the project');
  await mkdir(output, { recursive: true, mode: 0o700 });
  if (!(await lstat(output)).isDirectory() || (await lstat(output)).isSymbolicLink()) throw new Error('Output must be a regular directory');
  output = await realpath(output);
  if (inside(identityDir, output) || inside(output, identityDir)) throw new Error('Public output resolves to a private identity directory');
  const outputLock = await open(join(output, '.prepare-lock'), 'wx', 0o600).catch(error => { throw new Error('Output bundle is being prepared or an old lock needs checking', { cause: error }); });
  try {
    const entries = [], files = {};
    const knownHosts = join(output, 'known_hosts');
    for (const server of servers) {
      onProgress(`Preparing management identity: ${server.id}`);
      const identity = await ensureIdentity(join(identityDir, `id_ed25519_jarvis_${server.id}`), `jarvis-${clientId}-${server.id}`, tools, run);
      const publicFile = `jarvis-${server.id}.pub`, scriptFile = `authorize-${server.id}.sh`;
      files[publicFile] = identity.line + '\n';
      files[scriptFile] = await renderAuthorization(server, identity.line);
      entries.push({ ...server, alias: `jarvis-${server.id}`, identityFile: identity.identityFile, publicFile, scriptFile, publicFingerprint: identity.fingerprint });
    }
    files.known_hosts = hostKeys.join('\n') + '\n';
    files['ssh-config'] = connectionConfig(entries, knownHosts);
    const manifest = { version: 1, clientId, at: new Date().toISOString(), privateKeysIncluded: false, servers: entries, files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, digest(value)])) };
    for (const [name, value] of Object.entries(files)) await atomicWrite(join(output, name), value);
    // Manifest last: a partially written bundle cannot pass verification.
    await atomicWrite(join(output, 'bundle.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally { await outputLock.close(); await unlink(join(output, '.prepare-lock')); }
}

export async function verifyAccess({ output, tools = findTools(), run = runCommand, onProgress = () => {} }) {
  output = await realpath(resolve(output));
  if (existsSync(join(output, '.prepare-lock'))) throw new Error('Bundle preparation is still running or its lock needs checking');
  const bundle = JSON.parse(await readFile(join(output, 'bundle.json'), 'utf8'));
  if (bundle.version !== 1 || bundle.privateKeysIncluded !== false || !Array.isArray(bundle.servers) || !bundle.files) throw new Error('Invalid access bundle');
  const servers = parseInventory({ version: 1, servers: bundle.servers.map(({ id, host, port, user, hostname, fingerprint }) => ({ id, host, port, user, ...(hostname ? { hostname } : {}), fingerprint })) });
  const expectedFiles = ['known_hosts', 'ssh-config', ...servers.flatMap(server => [`jarvis-${server.id}.pub`, `authorize-${server.id}.sh`])];
  if (Object.keys(bundle.files).length !== expectedFiles.length || expectedFiles.some(name => !Object.hasOwn(bundle.files, name))) throw new Error('Access bundle is incomplete');
  for (const [name, hash] of Object.entries(bundle.files)) {
    if (!/^(?:known_hosts|ssh-config|(?:jarvis-[a-zA-Z0-9_-]+\.pub)|(?:authorize-[a-zA-Z0-9_-]+\.sh))$/.test(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid bundle file entry');
    if (!await regularFile(join(output, name))) throw new Error('Bundle file is missing: ' + name);
    if (digest(await readFile(join(output, name))) !== hash) throw new Error('Bundle file changed; run prepare again: ' + name);
  }
  const config = join(output, 'ssh-config'), checks = [];
  const hostLines = (await readFile(join(output, 'known_hosts'), 'utf8')).trim().split(/\r?\n/);
  if (hostLines.length !== servers.length) throw new Error('Unexpected pinned host-key count');
  for (const [index, server] of servers.entries()) {
    const entry = bundle.servers[index];
    if (entry.alias !== `jarvis-${server.id}` || typeof entry.identityFile !== 'string' || !isAbsolute(entry.identityFile) || inside(resolve(entry.identityFile), projectDir) || entry.publicFile !== `jarvis-${server.id}.pub` || entry.scriptFile !== `authorize-${server.id}.sh`) throw new Error('Invalid management identity metadata');
    const fields = hostLines[index].split(' ');
    if (fields.length !== 3 || fields[0] !== (server.port === 22 ? server.host : `[${server.host}]:${server.port}`) || parsePublicKey(fields.slice(1).join(' ')).fingerprint !== server.fingerprint) throw new Error('Pinned host key differs from inventory');
    const publicText = await readFile(join(output, entry.publicFile), 'utf8');
    if (parsePublicKey(publicText).fingerprint !== entry.publicFingerprint) throw new Error('Public-key fingerprint mismatch');
    if (await renderAuthorization(server, publicText.trim()) !== await readFile(join(output, entry.scriptFile), 'utf8')) throw new Error('Authorization script differs from the current trusted template; prepare again');
  }
  if (await readFile(config, 'utf8') !== connectionConfig(bundle.servers, join(output, 'known_hosts'))) throw new Error('SSH profile differs from the fixed connection settings');
  for (const server of servers) {
    onProgress(`Verifying login: ${server.id}`);
    let result;
    try { result = run(tools.ssh, ['-F', config, '-o', 'BatchMode=yes', serverAlias(server), 'id -un; hostname']); }
    catch (error) { result = { status: -1, stdout: '', stderr: error.message }; }
    const lines = result.stdout.trim().split(/\r?\n/);
    const ok = result.status === 0 && lines.length === 2 && lines[0] === server.user && (!server.hostname || lines[1] === server.hostname);
    checks.push({ id: server.id, host: server.host, ok, ...(ok ? { user: lines[0], hostname: lines[1] } : { error: result.status === 0 ? 'Remote identity mismatch' : result.stderr.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(0, 1500) }) });
  }
  const report = { status: checks.every(row => row.ok) ? 'passed' : 'failed', at: new Date().toISOString(), checks, remoteWrites: 0 };
  await atomicWrite(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

const serverAlias = server => `jarvis-${server.id}`;
function parseOptions(args, allowed) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!allowed.includes(name) || !args[i + 1] || args[i + 1].startsWith('--') || options[name]) throw new Error('Invalid or repeated option: ' + name);
    options[name] = args[i + 1];
  }
  return options;
}
function expandHome(value) { return value === '~' ? homedir() : /^~[\\/]/.test(value) ? join(homedir(), value.slice(2)) : resolve(value); }
export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help') {
    console.log('Prepare: node scripts/server-access.mjs prepare --inventory config/servers.example.json --output artifacts/server-access/CLIENT [--client-id CLIENT] [--identity-dir ~/.ssh/jarvis]');
    console.log('Verify:  node scripts/server-access.mjs verify --output artifacts/server-access/CLIENT');
    console.log('Run generated authorize-ID.sh as the configured account on each Linux server; private keys stay on this computer.');
    return;
  }
  const progress = text => console.error(text);
  if (command === 'prepare') {
    const options = parseOptions(rest, ['--inventory', '--output', '--client-id', '--identity-dir']);
    if (!options['--inventory'] || !options['--output']) throw new Error('--inventory and --output are required');
    const manifest = await prepareAccess({ inventory: JSON.parse(await readFile(expandHome(options['--inventory']), 'utf8')), output: expandHome(options['--output']), ...(options['--client-id'] ? { clientId: options['--client-id'] } : {}), ...(options['--identity-dir'] ? { identityDir: expandHome(options['--identity-dir']) } : {}), onProgress: progress });
    console.log(JSON.stringify({ status: 'prepared', servers: manifest.servers.map(row => ({ id: row.id, alias: row.alias, publicFingerprint: row.publicFingerprint })), output: expandHome(options['--output']), remoteWrites: 0 }, null, 2));
  } else if (command === 'verify') {
    const options = parseOptions(rest, ['--output']);
    if (!options['--output']) throw new Error('--output is required');
    const report = await verifyAccess({ output: expandHome(options['--output']), onProgress: progress });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  } else throw new Error('Unknown command; use help');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error('ERROR: ' + error.message); process.exitCode = 1; });
