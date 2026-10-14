"""Read public hardware, custom systemd state and listening ports, never secrets."""
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import time


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


units = {'ssh.service', 'sshd.service', 'docker.service', 'nginx.service', 'frps.service',
         'cliproxyapi.service', 'wg-quick@wg0.service', 'tinyproxy.service', 'danted.service', 'ccr.service',
         'frpc.service', 'jarvis-platform.service', 'jarvis-observer.service',
         'jarvis-cloud-relay.service'}
for file in Path('/etc/systemd/system').glob('*.service'):
    if not file.is_symlink():
        units.add(file.name)
services = []
seen = set()
for unit in sorted(units):
    if not re.fullmatch(r'[A-Za-z0-9_.@-]{1,180}\.service', unit):
        continue
    text = command(['systemctl', 'show', unit, '--property=Id,LoadState,ActiveState,SubState,User,UnitFileState,FragmentPath,WorkingDirectory,ControlGroup'])
    props = dict(line.split('=', 1) for line in (text or '').splitlines() if '=' in line)
    if props.get('LoadState') == 'loaded' and props.get('Id') not in seen:
        services.append(props)
        seen.add(props['Id'])
memory = {}
for line in Path('/proc/meminfo').read_text().splitlines():
    key, value = line.split(':', 1)
    memory[key] = int(value.strip().split()[0]) * 1024
os_release = dict(line.strip().split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
disk = shutil.disk_usage('/')
cpu = next((line.split(':', 1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines()
            if line.startswith('model name')), platform.machine())
listeners = command(['ss', '-lntpH']) or ''
ports = []
for line in listeners.splitlines():
    columns = line.split()
    if len(columns) < 5:
        continue
    entries = []
    for name, pid in re.findall(r'\("([^"]+)",pid=(\d+)', line):
        cgroup = Path('/proc/' + pid + '/cgroup')
        entries.append({'process': name, 'pid': int(pid),
                        'cgroup': cgroup.read_text().strip() if cgroup.exists() else None})
    ports.append({'address': columns[3], 'owners': entries})
containers = command(['docker', 'ps', '-a', '--format', '{{json .}}']) if shutil.which('docker') else None
container_rows = []
for line in (containers or '').splitlines():
    row = json.loads(line)
    container_rows.append({key: row.get(key) for key in ['Names', 'Image', 'Status', 'Ports']})
print(json.dumps({'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                 'hostname': platform.node(), 'os': os_release.get('PRETTY_NAME', '').strip('"'),
                 'kernel': platform.release(), 'cpu': cpu, 'cores': os.cpu_count(),
                 'ramGB': memory['MemTotal'] / 1024**3, 'diskGB': disk.total / 1024**3,
                 'diskFreeGB': disk.free / 1024**3, 'services': services,
                 'listeners': ports, 'containers': container_rows,
                 'python': platform.python_version(), 'openssl': command(['openssl', 'version']),
                 'hostKey': command(['ssh-keygen', '-lf', '/etc/ssh/ssh_host_ed25519_key.pub', '-E', 'sha256'])}, ensure_ascii=False))
