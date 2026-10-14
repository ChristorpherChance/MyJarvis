#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseInventory, runCommand } from './server-access.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const PROFILES = [
  { id: 'login', name: '普通登录', scope: '仅账号已有权限，不新增sudo授权' },
  { id: 'diagnostics', name: '硬件巡检', scope: '固定SMART读取与内存信息命令' },
  { id: 'operator', name: '应用运维', scope: '硬件巡检，以及指定非root服务的状态、日志、启停和重启' },
  { id: 'admin-password', name: '完整管理·需密码', scope: '全部sudo命令，要求密码认证；受现有规则和认证缓存影响' },
  { id: 'admin-full', name: '完整管理·免密码', scope: '全部sudo命令免密码，可取得root权限' }
];
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const wrapperPreamble = user => `#!/bin/bash -p\n# Jarvis managed permission wrapper v1; account=${user}\nset -euo pipefail\n[ "$(/usr/bin/id -u)" = 0 ] || { printf 'Use sudo for this operation.\\n' >&2; exit 1; }\nexport PATH=/usr/sbin:/usr/bin:/sbin:/bin\n`;

// Local form validation only: generating permissions does not connect over SSH.
// An SSH inventory still requires a trusted host fingerprint before it is exported.
export function normalizePermissionServer(input) {
  if (!input || Object.keys(input).some(key => !['id', 'host', 'port', 'user', 'hostname', 'fingerprint'].includes(key))) throw new Error('服务器信息只填写连接字段，不填写密码或私钥。');
  const { id, host, user, hostname } = input;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) throw new Error('服务器编号需为1–64位字母、数字、短横线或下划线，且以字母或数字开头。');
  let hostValid = false;
  if (typeof host === 'string' && host.length <= 253) {
    if (host.includes(':') && /^[0-9a-fA-F:.]+$/.test(host)) {
      try { hostValid = Boolean(new URL('http://[' + host + ']/').hostname); } catch { /* Invalid IPv6. */ }
    } else if (/^[0-9.]+$/.test(host)) {
      const parts = host.split('.');
      hostValid = parts.length === 4 && parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
    } else hostValid = host.split('.').every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part));
  }
  if (!hostValid) throw new Error('服务器地址填写有效IP或域名，不加http://、端口、路径或方括号。');
  const port = input.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH端口需为1–65535之间的整数，通常填22。');
  if (typeof user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(user) || user === 'root') throw new Error('现有管理账号填服务器上的普通Linux账号，如superopen，不填root。');
  if (typeof hostname !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(hostname)) throw new Error('主机名需填写服务器执行hostname得到的完整结果，不填IP地址。');
  const fingerprint = input.fingerprint;
  if (fingerprint !== undefined && fingerprint !== '' && (typeof fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint))) throw new Error('主机指纹填写真实ED25519的SHA256指纹；只生成权限脚本时可暂时留空。');
  return { id, host, port, user, hostname, ...(fingerprint ? { fingerprint } : {}) };
}

export function permissionConnectionInventory(server, user) {
  const normalized = normalizePermissionServer({ ...server, user });
  if (!normalized.fingerprint) throw new Error('下载SSH连接清单前，请从服务器本机取得可信的ED25519主机指纹。');
  return { version: 1, servers: [normalized] };
}

export function permissionPlan({ user, profile, unit = 'jarvis-platform.service' }) {
  if (typeof user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(user) || user === 'root') throw new Error('Choose an ordinary Linux account, not root');
  if (!PROFILES.some(row => row.id === profile)) throw new Error('Unknown permission profile');
  if (typeof unit !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]{0,120}\.service$/.test(unit)) throw new Error('Invalid systemd service unit');
  const wrapperDir = `/usr/local/libexec/jarvis-permissions/${user}`;
  const marker = `# Jarvis managed sudo grant v1; account=${user}`;
  let rule = '';
  const wrappers = {};
  if (['diagnostics', 'operator'].includes(profile)) {
    wrappers.diagnostics = wrapperPreamble(user) + `case "\${1:-}" in
  memory)
    [ "$#" = 1 ] || exit 2
    exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/sbin/dmidecode --type memory ;;
  smart)
    [ "$#" = 2 ] || exit 2
    device="$2"
    [[ "$device" =~ ^/dev/(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$ ]] || exit 2
    [ -b "$device" ] && [ ! -L "$device" ] || exit 2
    exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/sbin/smartctl -a "$device" ;;
  *) printf 'Allowed: memory | smart /dev/DISK\\n' >&2; exit 2 ;;
esac
`;
    rule = `${user} ALL=(root) NOPASSWD: ${wrapperDir}/diagnostics`;
    if (profile === 'operator') {
      wrappers.operator = wrapperPreamble(user) + 'unit=' + shellQuote(unit) + `
[ "$#" = 1 ] || exit 2
case "$1" in
  status) exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/systemctl --no-pager --full status "$unit" ;;
  start|stop|restart) exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/systemctl "$1" "$unit" ;;
  logs) exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/journalctl --no-pager --unit="$unit" --lines=200 ;;
  *) printf 'Allowed: status | start | stop | restart | logs\\n' >&2; exit 2 ;;
esac
`;
      rule += `, ${wrapperDir}/operator`;
    }
  } else if (profile === 'admin-password') rule = `${user} ALL=(ALL:ALL) PASSWD: ALL`;
  else if (profile === 'admin-full') rule = `${user} ALL=(ALL:ALL) NOPASSWD: ALL`;
  return { user, profile, unit, wrapperDir, marker, policyPath: `/etc/sudoers.d/80-jarvis-access-${user}`, sudoers: marker + '\n' + (rule ? rule + '\n' : '# No additional sudo grant.\n'), wrappers };
}

export function renderInstallerTemplate(template, server, plan) {
  const values = { USER: plan.user, PROFILE: plan.profile, UNIT: plan.unit, HOSTNAME: server.hostname ?? '', MARKER: plan.marker };
  let rendered = template;
  for (const [name, value] of Object.entries(values)) rendered = rendered.replace(`@@${name}@@`, shellQuote(value));
  rendered = rendered.replace('@@POLICY@@', plan.sudoers.trimEnd());
  for (const name of ['diagnostics', 'operator']) rendered = rendered.replace(`@@${name.toUpperCase()}@@`, (plan.wrappers[name] ?? '# Not used for this profile.\n').trimEnd());
  return rendered;
}

export async function renderPermissionInstaller(server, plan) {
  return renderInstallerTemplate(await readFile(join(scriptDir, 'install-server-permissions.sh'), 'utf8'), server, plan);
}

export function browserRendererSource() {
  return `const PROFILES=${JSON.stringify(PROFILES)};\nconst shellQuote=${shellQuote.toString()};\nconst wrapperPreamble=${wrapperPreamble.toString()};\n${normalizePermissionServer.toString()}\n${permissionConnectionInventory.toString()}\n${permissionPlan.toString()}\n${renderInstallerTemplate.toString()}\n`;
}

export async function preparePermissions({ inventory, output, profile, user, unit, serverId }) {
  let servers = parseInventory(inventory);
  if (serverId) {
    servers = servers.filter(row => row.id === serverId);
    if (!servers.length) throw new Error('Server id is not in inventory');
  }
  const plans = servers.map(server => ({ server, plan: permissionPlan({ user: user ?? server.user, profile, unit }) }));
  output = resolve(output); await mkdir(output, { recursive: true });
  const files = [];
  for (const { server, plan } of plans) {
    const name = `permissions-${server.id}-${plan.user}-${profile}.sh`, body = await renderPermissionInstaller(server, plan);
    await writeFile(join(output, name), body, { mode: 0o600 });
    await writeFile(join(output, `permissions-${server.id}-${plan.user}-${profile}.sudoers`), plan.sudoers, { mode: 0o600 });
    files.push({ serverId: server.id, host: server.host, user: plan.user, profile, unit: plan.unit, installer: name, sha256: createHash('sha256').update(body).digest('hex'), sudoers: plan.sudoers });
  }
  const report = { status: 'prepared', at: new Date().toISOString(), remotePermissionChanges: 0, appliesTo: 'Linux account, not individual SSH keys', files };
  await writeFile(join(output, 'permissions-plan.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

export const AUDIT_COMMAND = `python3 -c 'import os,pwd,grp,socket,subprocess,json
def cmd(args):
 try:
  p=subprocess.run(args,capture_output=True,text=True,timeout=8)
  return {"status":p.returncode,"stdout":p.stdout[:20000],"stderr":p.stderr[:3000]}
 except Exception as e: return {"status":-1,"stdout":"","stderr":str(e)}
print(json.dumps({"user":pwd.getpwuid(os.getuid()).pw_name,"hostname":socket.gethostname(),"groups":[grp.getgrgid(g).gr_name for g in os.getgroups()],"sudoVersion":cmd(["sudo","--version"]),"sudoList":cmd(["sudo","-n","-l"]),"rootProbe":cmd(["sudo","-n","/usr/bin/id","-u"])}))'`;

export function classifyPrivileges(raw) {
  const rules = raw.sudoList?.stdout ?? '';
  const allRootWithoutPassword = /^\s*\((?:ALL(?:\s*:\s*ALL)?|root)\)\s*NOPASSWD:\s*ALL\s*$/m.test(rules);
  const rootProbePassed = raw.rootProbe?.status === 0 && raw.rootProbe.stdout.trim() === '0';
  return { fullUnattendedRoot: allRootWithoutPassword && rootProbePassed, rootProbePassed, allRootWithoutPassword, sudoRulesAvailable: raw.sudoList?.status === 0 };
}

export async function auditPermissions({ inventory, sshConfig, output, run = runCommand }) {
  const servers = parseInventory(inventory), checks = [];
  for (const server of servers) {
    let result;
    try { result = run('ssh', ['-F', resolve(sshConfig), '-o', 'BatchMode=yes', `jarvis-${server.id}`, AUDIT_COMMAND]); }
    catch (error) { result = { status: -1, stdout: '', stderr: error.message }; }
    let raw;
    try { raw = JSON.parse(result.stdout); } catch { checks.push({ id: server.id, ok: false, error: result.stderr.trim().slice(0, 1500) || 'Invalid audit response' }); continue; }
    const ok = result.status === 0 && raw.user === server.user && (!server.hostname || raw.hostname === server.hostname);
    checks.push({ id: server.id, host: server.host, ok, ...raw, ...classifyPrivileges(raw) });
  }
  const report = { status: checks.every(row => row.ok) ? 'passed' : 'failed', at: new Date().toISOString(), serverPermissionChanges: 0, checks };
  output = resolve(output); await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  return report;
}

function options(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || result[args[i]]) throw new Error('Invalid or repeated option: ' + args[i]);
    result[args[i]] = args[i + 1];
  }
  return result;
}
export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (!command || ['help', '--help'].includes(command)) {
    console.log('Profiles: node scripts/server-permissions.mjs profiles');
    console.log('Prepare:  node scripts/server-permissions.mjs prepare --inventory config/servers.example.json --output artifacts/server-permissions/operator --profile operator [--user jarvis-ops] [--server 112] [--unit jarvis-platform.service]');
    console.log('Audit:    node scripts/server-permissions.mjs audit --inventory config/servers.example.json --ssh-config artifacts/server-access/lenovo/ssh-config --output artifacts/server-permissions-qa/permissions.json');
    return;
  }
  if (command === 'profiles') { if (rest.length) throw new Error('profiles takes no arguments'); console.log(JSON.stringify(PROFILES, null, 2)); return; }
  if (command === 'prepare') {
    const opts = options(rest, ['--inventory', '--output', '--profile', '--user', '--server', '--unit']);
    if (!opts['--inventory'] || !opts['--output'] || !opts['--profile']) throw new Error('--inventory, --output and --profile are required');
    const report = await preparePermissions({ inventory: JSON.parse(await readFile(resolve(opts['--inventory']), 'utf8')), output: opts['--output'], profile: opts['--profile'], user: opts['--user'], serverId: opts['--server'], unit: opts['--unit'] });
    console.log(JSON.stringify(report, null, 2));
  } else if (command === 'audit') {
    const opts = options(rest, ['--inventory', '--ssh-config', '--output']);
    if (!opts['--inventory'] || !opts['--ssh-config'] || !opts['--output']) throw new Error('--inventory, --ssh-config and --output are required');
    const report = await auditPermissions({ inventory: JSON.parse(await readFile(resolve(opts['--inventory']), 'utf8')), sshConfig: opts['--ssh-config'], output: opts['--output'] });
    console.log(JSON.stringify({ status: report.status, serverPermissionChanges: 0, checks: report.checks.map(({ id, ok, fullUnattendedRoot, user, hostname }) => ({ id, ok, user, hostname, fullUnattendedRoot })) }, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  } else throw new Error('Unknown command; use help');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error('ERROR: ' + error.message); process.exitCode = 1; });
