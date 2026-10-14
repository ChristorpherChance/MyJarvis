"""Read-only hardware and service inventory. Never reads service credentials."""
import json
import os
import platform
import shutil
import subprocess
import time


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=10)
    return result.stdout.strip() if result.returncode == 0 else None


memory = {}
with open('/proc/meminfo') as stream:
    for line in stream:
        key, value = line.split(':', 1)
        memory[key] = int(value.strip().split()[0]) * 1024
disk = shutil.disk_usage('/')
os_release = {}
with open('/etc/os-release') as stream:
    for line in stream:
        if '=' in line:
            key, value = line.strip().split('=', 1)
            os_release[key] = value.strip('"')
services = []
for unit in ['nginx.service', 'frps.service', 'cliproxyapi.service',
             'wg-quick@wg0.service', 'tinyproxy.service', 'danted.service',
             'ccr.service', 'docker.service', 'ssh.service']:
    text = command(['systemctl', 'show', unit, '--property=Id,LoadState,ActiveState,SubState,User'])
    properties = dict(line.split('=', 1) for line in (text or '').splitlines() if '=' in line)
    if properties.get('LoadState') == 'loaded':
        services.append(properties)
cpu = next((line.split(':', 1)[1].strip() for line in open('/proc/cpuinfo')
            if line.startswith('model name')), platform.machine())
print(json.dumps({
    'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'hostname': platform.node(), 'architecture': platform.machine(),
    'os': os_release.get('PRETTY_NAME'), 'kernel': platform.release(),
    'cpu': cpu, 'cores': os.cpu_count(), 'ramGB': memory['MemTotal'] / 1024**3,
    'availableGB': memory.get('MemAvailable', memory['MemFree']) / 1024**3,
    'diskGB': disk.total / 1024**3, 'diskFreeGB': disk.free / 1024**3,
    'load': os.getloadavg(), 'services': services,
    'listeners': command(['ss', '-lntH']),
    'node': command(['node', '--version']) if shutil.which('node') else None,
    'python': platform.python_version(), 'openssl': command(['openssl', 'version']),
    'hostKey': command(['ssh-keygen', '-lf', '/etc/ssh/ssh_host_ed25519_key.pub', '-E', 'sha256']),
    'timeSynchronized': command(['timedatectl', 'show', '--property=NTPSynchronized', '--value']),
}, ensure_ascii=False))
