"""Forced SSH command: local metrics and fixed systemd units only, Ed25519 signed.

Requires only Python stdlib and OpenSSL already present on Ubuntu. Ignores the
client's requested command. This account has no sudo or platform data access.
"""
import base64
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time

CONFIG = Path('/etc/jarvis-cloud-agent/node.json')
KEY = Path('/var/lib/jarvis-cloud-agent/signing.key')


def canonical(value):
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def canonical_json(value):
    """Match JS JSON.stringify for the bounded numbers in signed observations."""
    value = canonical(value)
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(key, ensure_ascii=False) + ':' + canonical_json(item) for key, item in value.items()) + '}'
    if isinstance(value, list):
        return '[' + ','.join(canonical_json(item) for item in value) + ']'
    if isinstance(value, float) and 0.000001 <= abs(value) < 1e21:
        return format(Decimal(str(value)), 'f')
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def cpu_sample():
    values = [int(value) for value in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    return sum(values), values[3] + values[4]


def collect(config):
    try:
        disk_samples = json.loads(Path('/var/lib/jarvis-project-sampler/summary.json').read_text()).get('services', {})
    except (OSError, ValueError):
        disk_samples = {}
    units = []
    for service in config['services']:
        if not re.fullmatch(r'[A-Za-z0-9_.@-]{1,180}\.service', service['unit']):
            raise ValueError('Fixed service unit is invalid')
        result = subprocess.run(['/usr/bin/systemctl', 'show', service['unit'], '--property=ActiveState,SubState,ControlGroup'], capture_output=True, text=True, timeout=3)
        props = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
        group = props.get('ControlGroup', '')
        path = Path('/sys/fs/cgroup' + group).resolve() if group.startswith('/') else None
        if path and not str(path).startswith('/sys/fs/cgroup/'):
            path = None
        def usage():
            try:
                return int(dict(line.split() for line in (path / 'cpu.stat').read_text().splitlines()).get('usage_usec', 0)) if path else None
            except (OSError, ValueError):
                return None
        units.append((service, props, path, usage(), time.monotonic()))
    total1, idle1 = cpu_sample()
    time.sleep(0.2)
    total2, idle2 = cpu_sample()
    memory = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        memory[key] = int(value.strip().split()[0]) * 1024
    available = memory.get('MemAvailable', memory['MemFree'])
    disk = shutil.disk_usage('/')
    metrics = {'memoryPercent': round(100 * (1 - available / memory['MemTotal']), 2),
               'memoryUsedGB': round((memory['MemTotal'] - available) / 1024**3, 3),
               'memoryTotalGB': round(memory['MemTotal'] / 1024**3, 3),
               'diskPercent': round(100 * disk.used / disk.total, 2),
               'diskFreeGB': round(disk.free / 1024**3, 3),
               'diskTotalGB': round(disk.total / 1024**3, 3),
               'load1': round(float(Path('/proc/loadavg').read_text().split()[0]), 3),
               'uptimeSec': int(float(Path('/proc/uptime').read_text().split()[0]))}
    if total2 > total1:
        metrics['cpuPercent'] = round(max(0, min(100, 100 * (1 - (idle2 - idle1) / (total2 - total1)))), 2)
    observations = []
    for service, props, path, first_cpu, measured in units:
        resources = {}
        if path:
            try:
                second_cpu = int(dict(line.split() for line in (path / 'cpu.stat').read_text().splitlines())['usage_usec'])
                elapsed = time.monotonic() - measured
                if first_cpu is not None and second_cpu >= first_cpu and elapsed > 0:
                    resources['cpuPercent'] = round(min(100, (second_cpu - first_cpu) / elapsed / 10000 / max(1, os.cpu_count())), 2)
            except (OSError, ValueError, KeyError):
                pass
            try:
                resources['memoryUsedGB'] = round(int((path / 'memory.current').read_text()) / 1024**3, 5)
            except (OSError, ValueError):
                pass
        sample = disk_samples.get(service['serviceId'], {})
        if sample.get('diskObservedAt'):
            stamp = datetime.fromisoformat(sample['diskObservedAt'].replace('Z', '+00:00')).timestamp()
            if 0 <= time.time() - stamp < 7100:
                resources.update({k: sample[k] for k in ['directory', 'diskUsedGB', 'diskObservedAt'] if k in sample})
        observations.append({'serviceId': service['serviceId'], 'unit': service['unit'],
                             'activeState': props.get('ActiveState', 'unknown'),
                             'subState': props.get('SubState', 'unknown'),
                             **({'resources': resources} if resources else {}),
                             'observedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')})
    body={'metrics': metrics, 'serviceProcesses': observations, 'leases': []}
    if config.get('localPowerEnabled') is True:
        try:
            sample=json.loads(Path('/var/lib/jarvis-power-sampler/summary.json').read_text())
            if sample and sample.get('source')=='intel-rapl' and 0<=time.time()-datetime.fromisoformat(sample['observedAt'].replace('Z','+00:00')).timestamp()<25:
                body['cpuPower']=sample
        except (OSError,ValueError,KeyError,TypeError):
            pass
    return canonical(body)


def envelope(config, body):
    agent_id = config['agentId']
    if not re.fullmatch(r'[a-f0-9-]{36}', agent_id):
        raise ValueError('Agent must be paired')
    path = '/api/v1/agents/' + agent_id + '/heartbeat'
    timestamp = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    nonce = secrets.token_urlsafe(24)
    raw = canonical_json(body)
    signed = '\n'.join(['POST', path, timestamp, nonce, hashlib.sha256(raw.encode()).hexdigest()]).encode()
    # Ed25519 OpenSSL requires a sized input file; it contains public readings only.
    with tempfile.NamedTemporaryFile(prefix='jarvis-sign-', dir='/var/lib/jarvis-cloud-agent/tmp') as stream:
        stream.write(signed)
        stream.flush()
        result = subprocess.run(['/usr/bin/openssl', 'pkeyutl', '-sign', '-rawin', '-inkey', str(KEY),
                                 '-in', stream.name], capture_output=True, timeout=5, check=True)
    signature = base64.urlsafe_b64encode(result.stdout).decode().rstrip('=')
    return {'version': 1, 'agentId': agent_id, 'machineId': config['machineId'], 'method': 'POST',
            'path': path, 'body': body, 'headers': {'x-jarvis-timestamp': timestamp,
            'x-jarvis-nonce': nonce, 'x-jarvis-signature': signature}}


if __name__ == '__main__':
    config = json.loads(CONFIG.read_text())
    print(json.dumps(envelope(config, collect(config)), ensure_ascii=False, separators=(',', ':')))
