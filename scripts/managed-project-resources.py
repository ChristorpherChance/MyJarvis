"""Root timer: aggregate disk usage for registered service directories; no contents."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
from datetime import datetime, timezone

CONFIG = Path('/etc/jarvis-cloud-agent/node.json')
OUTPUT = Path('/var/lib/jarvis-project-sampler/summary.json')


def sample():
    config = json.loads(CONFIG.read_text())
    try:
        old = json.loads(OUTPUT.read_text())
    except (OSError, ValueError):
        old = {}
    services = config['services']
    results = {key: value for key, value in old.get('services', {}).items() if any(s['serviceId'] == key for s in services)}
    offset = int(old.get('offset', 0)) % max(1, len(services))
    cache = {}
    started = time.monotonic()
    visited = 0
    for service in services[offset:] + services[:offset]:
        if visited and time.monotonic() - started > 8:
            break
        visited += 1
        unit = service['unit']
        if not re.fullmatch(r'[A-Za-z0-9_.@-]{1,180}\.service', unit):
            raise ValueError('Invalid fixed unit')
        props = subprocess.run(['/usr/bin/systemctl', 'show', unit, '--property=WorkingDirectory', '--value'], capture_output=True, text=True, timeout=2)
        raw = props.stdout.strip().removeprefix('-')
        if not raw.startswith('/'):
            continue
        directory = Path(raw).resolve()
        if str(directory) in ['/', '/home', '/root', '/etc', '/var', '/var/lib', '/opt', '/usr'] or any(str(directory) == p or str(directory).startswith(p + '/') for p in ['/proc', '/sys', '/dev']):
            continue
        previous = results.get(service['serviceId'], {})
        if previous.get('directory') == str(directory) and time.time() - datetime.fromisoformat(previous['diskObservedAt'].replace('Z', '+00:00')).timestamp() < 1800:
            continue
        if str(directory) not in cache:
            try:
                r = subprocess.run(['/usr/bin/du', '-s', '-B1', '--one-file-system', '--', str(directory)], capture_output=True, text=True, timeout=3)
                if r.returncode != 0:
                    continue
                used = int(r.stdout.split()[0])
                cache[str(directory)] = {'directory': str(directory), 'diskUsedGB': round(used / 1024**3, 5), 'diskObservedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
            except (OSError, ValueError, subprocess.TimeoutExpired):
                continue
        results[service['serviceId']] = cache[str(directory)]
        if time.monotonic() - started > 8:
            break
    OUTPUT.parent.mkdir(mode=0o755, exist_ok=True)
    temporary = OUTPUT.with_suffix('.next')
    temporary.write_text(json.dumps({'services': results, 'offset': (offset + visited) % max(1, len(services))}))
    os.chmod(temporary, 0o644)
    os.replace(temporary, OUTPUT)


if __name__ == '__main__':
    sample()
