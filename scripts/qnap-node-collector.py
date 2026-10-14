"""Unprivileged forced command: fixed metadata + root-owned protection cache, signed locally."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

BASE = Path('/etc/config/jarvis-nas')

def normalize(v):
    if isinstance(v, dict):return {k: normalize(x) for k, x in v.items()}
    if isinstance(v, list):return [normalize(x) for x in v]
    if isinstance(v, float) and v.is_integer():return int(v)
    return v

def run(argv):
    r = subprocess.run(argv, capture_output=True, text=True, errors='replace', timeout=6, check=True)
    return r.stdout.strip()

def cpu():
    values = list(map(int, Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    return sum(values), values[3] + values[4]

def collect():
    first = cpu();time.sleep(.2);last = cpu()
    memory = dict((line.split(':')[0], int(line.split()[1])) for line in Path('/proc/meminfo').read_text().splitlines())
    metrics = {'cpuPercent': round(max(0, min(100, (1 - (last[1]-first[1]) / max(1, last[0]-first[0]))*100)), 3), 'memoryPercent': round((1-memory['MemAvailable']/memory['MemTotal'])*100, 3), 'memoryUsedGB': round((memory['MemTotal']-memory['MemAvailable'])/1024**2, 3), 'memoryTotalGB': round(memory['MemTotal']/1024**2, 3), 'load1': float(Path('/proc/loadavg').read_text().split()[0]), 'uptimeSec': int(float(Path('/proc/uptime').read_text().split()[0]))}
    mounts = sorted(set(line.split()[1] for line in Path('/proc/mounts').read_text().splitlines() if re.fullmatch(r'/share/CACHEDEV[1-9]\d*_DATA', line.split()[1])))
    volumes = []
    for mount in mounts:
        stat = os.statvfs(mount);unit = stat.f_frsize/1024**3
        volumes.append({'id': int(re.search(r'CACHEDEV(\d+)', mount)[1]), 'mount': mount, 'totalGB': round(stat.f_blocks*unit, 3), 'usedGB': round((stat.f_blocks-stat.f_bfree)*unit, 3), 'freeGB': round(stat.f_bavail*unit, 3)})
    if not volumes:raise ValueError('NO_DATA_VOLUMES')
    disks = []
    for row in run(['/sbin/qcli_storage', '-d']).splitlines():
        fields = row.split()
        if len(fields) < 5 or fields[0] != 'NAS_HOST' or not re.fullmatch(r'/dev/sd[a-z]+', fields[2]):continue
        sys = Path('/sys/block')/fields[2].split('/')[-1]
        model = re.split(r'\s--\s+\d+\s+', row, maxsplit=1)
        model = model[1].strip() if len(model) == 2 else (sys/'device/model').read_text().strip()
        disks.append({'slot': int(fields[1]), 'type': 'ssd' if fields[3].startswith('SSD:') else 'hdd', 'model': model[:180], 'capacityGB': round(int((sys/'size').read_text())*512/1024**3, 3)})
    total, free, used = (sum(v[k] for v in volumes) for k in ('totalGB','freeGB','usedGB'))
    metrics.update(diskTotalGB=round(total,3), diskFreeGB=round(free,3), diskPercent=round(used/total*100,3))
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    storage = {'kind': 'qnap', 'model': 'TS-453Dmini', 'systemVersion': run(['/sbin/getcfg','System','Version','-f','/etc/config/uLinux.conf']), 'build': run(['/sbin/getcfg','System','Build Number','-f','/etc/config/uLinux.conf']), 'observedAt': stamp, 'volumes': volumes, 'disks': disks}
    cache = BASE/'protection.json'
    if cache.is_file() and not cache.is_symlink() and cache.stat().st_uid == 0 and cache.stat().st_size <= 100000:
        saved = json.loads(cache.read_text())
        allowed = {'protectionObservedAt','externalVolumes','externalDisks','diskHealth','backups','snapshots','ups','collectionErrors'}
        storage.update({k:v for k,v in saved.items() if k in allowed})
    else:storage['collectionErrors']=['protection-unavailable']
    return normalize({'leases': [], 'metrics': metrics, 'storage': storage}), stamp

def main():
    config = dict(re.findall(r"^([A-Z_]+)='([^']*)'$", (BASE/'node.conf').read_text(), flags=re.M))
    machine, agent = config['MACHINE_ID'], config['AGENT_ID']
    if not all(re.fullmatch(r'[0-9a-f-]{36}', v) for v in [machine,agent]):raise ValueError('NODE_BINDING_INVALID')
    body, stamp = collect();raw = json.dumps(body, separators=(',',':'), sort_keys=True, ensure_ascii=False).encode()
    path = f'/api/v1/agents/{agent}/heartbeat';nonce = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip('=')
    text = '\n'.join(['POST',path,stamp,nonce,hashlib.sha256(raw).hexdigest()]).encode()
    with tempfile.TemporaryDirectory(prefix='observe.', dir=BASE/'tmp') as work:
        input = Path(work)/'payload';output = Path(work)/'signature';input.write_bytes(text)
        subprocess.run(['/usr/bin/openssl','pkeyutl','-sign','-rawin','-inkey',str(BASE/'signing.key'),'-in',str(input),'-out',str(output)],capture_output=True,check=True)
        signature = base64.urlsafe_b64encode(output.read_bytes()).decode().rstrip('=')
    print(json.dumps({'version':1,'method':'POST','path':path,'agentId':agent,'machineId':machine,'headers':{'x-jarvis-nonce':nonce,'x-jarvis-timestamp':stamp,'x-jarvis-signature':signature},'body':body},separators=(',',':'),sort_keys=True,ensure_ascii=False))

if __name__ == '__main__':main()
