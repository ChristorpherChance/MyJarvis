"""Fixed root metadata collector; never scans user documents or starts device tests."""
import configparser
import datetime as dt
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import time

BASE = Path('/etc/config/jarvis-nas')
HBS = Path('/etc/config/cloudconnector/CloudConnector3/config.db')

def iso(value=None):
    return dt.datetime.fromtimestamp(time.time() if value is None else value, dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def run(argv):
    result = subprocess.run(argv, capture_output=True, text=True, errors='replace', timeout=6)
    if result.returncode:
        raise ValueError('METADATA_COMMAND_FAILED')
    return result.stdout

def setting(section, key):
    return run(['/sbin/getcfg', section, key, '-f', '/etc/config/uLinux.conf']).strip()

def smart(enclosure, slot, refresh=True):
    path = Path(f'/tmp/smart/smart_{enclosure}_{slot}.info')
    if refresh and enclosure == 0 and (not path.is_file() or time.time()-path.stat().st_mtime > 300):
        try:
            # Read native SMART attributes at most every five minutes; never start a self-test.
            run(['/sbin/get_hd_smartinfo', '-d', str(slot)])
        except Exception:
            pass
    result = {'state': 'unknown', 'source': 'qts-smart-cache', 'attributes': [], 'temperatureC': None, 'observedAt': None}
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 50000:
        return result
    rows = path.read_text(errors='replace').splitlines()
    result['observedAt'] = iso(path.stat().st_mtime)
    if len(rows) < 2:
        result['state'] = 'unsupported'
        return result
    selected = {5, 9, 12, 194, 197, 198, 199, 232, 233}
    warning = False
    for row in rows[1:]:
        fields = row.split(',')
        if len(fields) != 7 or not fields[0].isdigit():
            continue
        try:
            id, value, worst, threshold, raw, flag = int(fields[0]), int(fields[2]), int(fields[3]), int(fields[4]), int(fields[5]), int(fields[6])
            warning = warning or flag != 0 or (threshold > 0 and value <= threshold) or (id in (5, 197, 198) and raw > 0)
            if id == 194:
                temperature = raw & 255
                if 0 < temperature < 120:
                    result['temperatureC'] = temperature
            if id in selected:
                result['attributes'].append({'id': id, 'value': value, 'worst': worst, 'threshold': threshold, 'raw': str(raw), 'flag': flag})
        except (ValueError, OverflowError):
            continue
    if result['attributes']:
        # This is attribute-level assessment; it is NOT the disk's overall SMART self-test result.
        result['state'] = 'warning' if warning else 'attributes-ok'
    return result

def external():
    volumes, disks = [], []
    for line in Path('/proc/mounts').read_text().splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        match = re.fullmatch(r'/share/external/DEV(\d{2})(\d{2})_(\d+)', fields[1])
        device = re.fullmatch(r'/dev/(sd[a-z]+)(\d+)', fields[0])
        if not match or not device:
            continue
        enclosure, slot, partition = map(int, match.groups())
        block = device.group(1)
        bound = run(['/sbin/hal_app', '--pd_get_sys_name', f'enc_id={enclosure},port_id={slot}']).strip()
        if bound != '/dev/' + block:
            continue
        v = os.statvfs(fields[1])
        unit = v.f_frsize / 1024**3
        volumes.append({'id': f'external-{enclosure}-{slot}-{partition}', 'mount': fields[1], 'device': fields[0], 'filesystem': fields[2], 'enclosure': enclosure, 'slot': slot, 'totalGB': round(v.f_blocks * unit, 3), 'usedGB': round((v.f_blocks - v.f_bfree) * unit, 3), 'freeGB': round(v.f_bavail * unit, 3)})
        if any(d['device'] == bound for d in disks):
            continue
        sys = Path('/sys/block') / block
        model = ' '.join((sys / 'device' / p).read_text().strip() for p in ['vendor', 'model'])
        disks.append({'enclosure': enclosure, 'slot': slot, 'device': bound, 'type': 'hdd' if (sys / 'queue/rotational').read_text().strip() == '1' else 'ssd', 'model': model[:180], 'capacityGB': round(int((sys / 'size').read_text()) * 512 / 1024**3, 3), 'health': smart(enclosure, slot)})
    return volumes, disks

def backup_jobs(path=HBS):
    if not path.exists():
        return {'state': 'unavailable', 'source': 'hbs-config-db', 'jobs': []}
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=3)
    connection.execute('PRAGMA query_only=ON')
    jobs = []
    try:
        for key, raw in connection.execute('SELECT key,value FROM jobs LIMIT 100'):
            value = json.loads(raw)
            if not isinstance(value, dict):
                continue
            # Only allowlisted presentation fields ever leave the DB. No accounts or credentials are queried.
            name = value.get('name') or value.get('job_name') or '备份任务'
            state = value.get('status', value.get('state'))
            mapping = {'running': 'running', 'success': 'succeeded', 'succeeded': 'succeeded', 'failed': 'failed', 'error': 'failed', 'stopped': 'stopped', 'scheduled': 'scheduled'}
            jobs.append({'id': str(key)[:128], 'name': str(name)[:200], 'state': mapping.get(str(state).lower(), 'unknown'), 'enabled': value.get('enabled') if isinstance(value.get('enabled'), bool) else None})
        return {'state': 'available', 'source': 'hbs-config-db', 'jobs': jobs}
    finally:
        connection.close()

def snapshots():
    base = Path('/etc/config/qsnapshot')
    conf, schedule = configparser.ConfigParser(interpolation=None), configparser.ConfigParser(interpolation=None)
    conf.read(base / 'snapshot.conf'); schedule.read(base / 'snapshotSchedule.conf')
    count = conf.getint('Global', 'Count', fallback=-1)
    bitmap = int(schedule.get('Global', 'schedulelvBitmap', fallback='0'), 0)
    schedules = []
    for section in schedule.sections():
        if not re.fullmatch(r'Schedule\d+', section):
            continue
        volume = schedule.getint(section, 'source_lv_id', fallback=0)
        if volume <= 0:
            continue
        hour, minute = schedule.getint(section, 'Hour', fallback=-1), schedule.getint(section, 'Minute', fallback=-1)
        schedules.append({'volumeId': volume, 'enabled': bool(bitmap & (1 << volume)), 'time': f'{hour:02d}:{minute:02d}' if 0 <= hour < 24 and 0 <= minute < 60 else None})
    return {'state': 'available' if count >= 0 else 'unavailable', 'source': 'qts-snapshot-config', 'count': max(0, count), 'schedules': schedules}

def ups():
    try:
        names = run(['/sbin/upsc', '-l', 'localhost']).split()
    except Exception:
        return {'state': 'unavailable', 'source': 'nut-upsc'}
    if 'qnapups' not in names:
        return {'state': 'not-connected', 'source': 'nut-upsc'}
    try:
        fields = dict(line.split(': ', 1) for line in run(['/sbin/upsc', 'qnapups@localhost']).splitlines() if ': ' in line)
    except Exception:
        return {'state': 'unavailable', 'source': 'nut-upsc'}
    def number(key):
        try:
            value = float(fields[key])
            return value if value >= 0 else None
        except (KeyError, ValueError):
            return None
    status = fields.get('ups.status', '').split()
    mode = 'battery' if 'OB' in status else 'mains' if 'OL' in status else 'unknown'
    return {'state': 'connected', 'source': 'nut-upsc', 'model': fields.get('ups.model', 'UPS')[:180], 'manufacturer': fields.get('ups.mfr', '')[:100], 'mode': mode, 'lowBattery': 'LB' in status, 'batteryPercent': number('battery.charge'), 'runtimeSec': number('battery.runtime'), 'loadPercent': number('ups.load'), 'inputVoltage': number('input.voltage'), 'testResult': fields.get('ups.test.result', '')[:100], 'protection': {'enabled': setting('UPS', 'Enable').upper() == 'TRUE', 'mode': setting('UPS', 'Power Loss Mode'), 'delayMinutes': float(setting('UPS', 'Shutdown System In') or 0), 'networkServer': setting('UPS', 'Enable Network UPS Server').upper() == 'TRUE'}}

def collect():
    result = {'protectionObservedAt': iso()}
    errors = []
    try:
        result['externalVolumes'], result['externalDisks'] = external()
    except Exception:
        errors.append('external-unavailable')
    result['diskHealth'] = [{'enclosure': 0, 'slot': slot, **smart(0, slot)} for slot in range(1, 5)]
    for name, getter in [('backups', backup_jobs), ('snapshots', snapshots), ('ups', ups)]:
        try:
            result[name] = getter()
        except Exception:
            errors.append(name + '-unavailable')
    result['collectionErrors'] = errors
    return result

def main():
    if os.geteuid() != 0 or BASE.is_symlink():
        raise RuntimeError('FIXED_ROOT_COLLECTOR_REQUIRED')
    def normalize(v):
        if isinstance(v, dict):return {k: normalize(x) for k, x in v.items()}
        if isinstance(v, list):return [normalize(x) for x in v]
        if isinstance(v, float) and v.is_integer():return int(v)
        return v
    output = json.dumps(normalize(collect()), separators=(',', ':'), sort_keys=True, ensure_ascii=False)
    if len(output.encode()) > 100000:
        raise RuntimeError('METADATA_TOO_LARGE')
    fd, temp = tempfile.mkstemp(prefix='protection-', dir=BASE)
    try:
        os.fchmod(fd, 0o644)
        with os.fdopen(fd, 'w') as f:
            f.write(output)
        os.replace(temp, BASE / 'protection.json')
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

if __name__ == '__main__':
    main()
