#!/usr/bin/env python3
"""Claude stdin metadata -> terminal status and a private, allowlisted summary.

No network, model call, transcript read, provider balance query, or billing claim.
"""
import datetime
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import sys
import time
import unicodedata
import uuid
try:
    import pwd
except ImportError:
    pwd = None

RESOURCE_KEYS = ('cpuPercent', 'ramUsedBytes', 'ramTotalBytes', 'diskFreeBytes', 'diskTotalBytes', 'load1m')
SESSION_KEYS = ('schemaVersion', 'observedAt', 'sessionId', 'model', 'provider', 'contextTokens', 'contextWindow',
                'currentInputTokens', 'currentOutputTokens', 'cacheReadTokens', 'cacheCreationTokens',
                'sessionCostUSD', 'billingStatus', 'rateLimitFiveHourPercent', 'rateLimitSevenDayPercent')


def number(value, maximum=None):
    return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 and (maximum is None or value <= maximum) else None


def label(value, limit=80):
    if not isinstance(value, str) or not value or len(value) > limit or any(ord(c) < 32 or ord(c) == 127 for c in value):
        return None
    if re.search(r'(?i)(?:sk-[A-Za-z0-9_-]{10,}|Bearer\s|api[_-]?key\s*[=:]|token\s*[=:]|PRIVATE KEY)', value):
        return None
    return value


def account_home():
    if sys.platform != 'linux' or pwd is None or os.getuid() == 0 or os.getuid() != os.geteuid():
        raise ValueError('ORDINARY_LINUX_ACCOUNT_REQUIRED')
    home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    if not home.is_absolute() or home.resolve(strict=True) != home or home.is_symlink() or home.stat().st_uid != os.getuid():
        raise ValueError('HOME_UNSAFE')
    return home


def private_dir(path, home, strict=True):
    path.relative_to(home)
    current = home
    for part in path.relative_to(home).parts:
        current /= part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or current.is_symlink() or getattr(current, 'is_junction', lambda: False)():
            raise ValueError('PRIVATE_DIRECTORY_UNSAFE')
        if strict and (info.st_uid != os.getuid() or info.st_mode & 0o022):
            raise ValueError('PRIVATE_DIRECTORY_OWNER_UNSAFE')
        if strict:
            os.chmod(current, 0o700)
    return path


def safe_json(path, strict=True):
    try:
        before = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > 262144 or path.is_symlink():
        raise ValueError('PRIVATE_FILE_UNSAFE')
    if strict and (before.st_uid != os.getuid() or before.st_mode & 0o077):
        raise ValueError('PRIVATE_FILE_OWNER_UNSAFE')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        raw = stream.read(262145)
        after = os.fstat(stream.fileno())
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns if os.name != 'nt' else None)
    if signature(before) != signature(opened) or signature(opened) != signature(after) or signature(after) != signature(path.lstat()):
        raise ValueError('PRIVATE_FILE_CHANGED')
    value = json.loads(raw)
    return value if isinstance(value, dict) else None


def atomic_json(path, value, strict=True):
    safe_json(path, strict)
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write((json.dumps(value, ensure_ascii=True, separators=(',', ':')) + '\n').encode())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if strict:
            os.chmod(path, 0o600)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def current_provider(home):
    explicit = label(os.environ.get('JARVIS_AI_PROVIDER_LABEL'))
    if explicit:
        return explicit
    database = home / '.cc-switch/cc-switch.db'
    try:
        parent = database.parent.lstat()
        if not stat.S_ISDIR(parent.st_mode) or database.parent.is_symlink() or parent.st_uid != os.getuid() or parent.st_mode & 0o022:
            return None
        info = database.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or database.is_symlink() or info.st_mode & 0o022:
            return None
        connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=0.2)
        try:
            rows = connection.execute("SELECT name FROM providers WHERE app_type='claude' AND is_current=1 LIMIT 2").fetchall()
            return label(rows[0][0]) if len(rows) == 1 else None
        finally:
            connection.close()
    except (OSError, sqlite3.Error, ValueError):
        return None


def summarize(data, provider=None, observed_at=None):
    data = data if isinstance(data, dict) else {}
    context = data.get('context_window') if isinstance(data.get('context_window'), dict) else {}
    usage = context.get('current_usage') if isinstance(context.get('current_usage'), dict) else {}
    model = data.get('model') if isinstance(data.get('model'), dict) else {}
    cost = data.get('cost') if isinstance(data.get('cost'), dict) else {}
    rates = data.get('rate_limits') if isinstance(data.get('rate_limits'), dict) else {}
    session = data.get('session_id')
    session = session if isinstance(session, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', session) else None
    incoming, output = number(usage.get('input_tokens')), number(usage.get('output_tokens'))
    cache_read, cache_create = number(usage.get('cache_read_input_tokens')), number(usage.get('cache_creation_input_tokens'))
    cli_cost = number(cost.get('total_cost_usd'))
    def rate(key):
        value = rates.get(key)
        return number(value.get('used_percentage'), 100) if isinstance(value, dict) else None
    return {'schemaVersion': 1, 'observedAt': observed_at or datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'sessionId': session, 'model': label(model.get('display_name')) or label(model.get('id')),
            'provider': label(provider), 'contextTokens': sum((incoming, cache_read, cache_create)) if all(v is not None for v in (incoming, cache_read, cache_create)) else None,
            'contextWindow': number(context.get('context_window_size')), 'currentInputTokens': incoming,
            'currentOutputTokens': output, 'cacheReadTokens': cache_read, 'cacheCreationTokens': cache_create,
            'sessionCostUSD': cli_cost, 'billingStatus': 'estimated' if cli_cost is not None else 'unknown',
            'rateLimitFiveHourPercent': rate('five_hour'), 'rateLimitSevenDayPercent': rate('seven_day')}


def sample_resources(home, state, proc=Path('/proc'), now=None, strict=True):
    now = time.time() if now is None else now
    cache_file = state / 'resource-cache.json'
    try:
        previous = safe_json(cache_file, strict) or {}
    except (OSError, ValueError):
        previous = {}
    sampled = number(previous.get('sampledAt'))
    if sampled is not None and 0 <= now - sampled < 15:
        return {key: number(previous.get(key), 100 if key == 'cpuPercent' else None) for key in RESOURCE_KEYS}
    resources = dict.fromkeys(RESOURCE_KEYS)
    cpu_total = cpu_idle = None
    try:
        fields = (proc / 'stat').read_text().splitlines()[0].split()
        values = [int(item) for item in fields[1:9]]
        cpu_total, cpu_idle = sum(values), values[3] + values[4]
        old_total, old_idle = number(previous.get('cpuTotal')), number(previous.get('cpuIdle'))
        if old_total is not None and old_idle is not None and cpu_total > old_total and cpu_idle >= old_idle:
            resources['cpuPercent'] = max(0, min(100, round(100 * (1 - (cpu_idle - old_idle) / (cpu_total - old_total)), 1)))
    except (OSError, ValueError, IndexError):
        pass
    try:
        mem = {}
        for line in (proc / 'meminfo').read_text().splitlines():
            fields = line.split()
            if fields[0] in ('MemTotal:', 'MemAvailable:'):
                mem[fields[0]] = int(fields[1]) * 1024
        resources['ramTotalBytes'] = number(mem.get('MemTotal:'))
        if resources['ramTotalBytes'] is not None and 'MemAvailable:' in mem:
            resources['ramUsedBytes'] = number(resources['ramTotalBytes'] - mem['MemAvailable:'])
        resources['load1m'] = number(float((proc / 'loadavg').read_text().split()[0]))
    except (OSError, ValueError, IndexError):
        pass
    try:
        disk = os.statvfs(home)
        resources.update(diskFreeBytes=disk.f_bavail * disk.f_frsize, diskTotalBytes=disk.f_blocks * disk.f_frsize)
    except (AttributeError, OSError):
        pass
    atomic_json(cache_file, {**resources, 'sampledAt': now, 'cpuTotal': cpu_total, 'cpuIdle': cpu_idle}, strict)
    return resources


def compact(value):
    return '?' if value is None else (f'{value / 1000000:.1f}M' if value >= 1000000 else f'{value / 1000:.1f}k' if value >= 1000 else str(int(value)))


def render(summary, resources, width=100):
    ctx = compact(summary['contextTokens']) + '/' + compact(summary['contextWindow'])
    recent = 'last in/out ' + compact(summary['currentInputTokens']) + '/' + compact(summary['currentOutputTokens'])
    cost = 'CLI-est $' + f"{summary['sessionCostUSD']:.4f}" if summary['sessionCostUSD'] is not None else 'CLI-est ?'
    identity = (summary['model'] or 'model ?') + ' | ' + (summary['provider'] or 'channel ?')
    cpu = '?' if resources.get('cpuPercent') is None else str(round(resources['cpuPercent'], 1)) + '%'
    gib = lambda value: '?' if value is None else f'{value / 1073741824:.1f}G'
    machine = 'CPU ' + cpu + ' | RAM ' + gib(resources.get('ramUsedBytes')) + '/' + gib(resources.get('ramTotalBytes')) + ' | disk free ' + gib(resources.get('diskFreeBytes'))
    cache = 'cache r/c ' + compact(summary['cacheReadTokens']) + '/' + compact(summary['cacheCreationTokens'])
    rate = lambda value: '?' if value is None else str(round(value, 1)) + '%'
    quota = 'native quota 5h/7d ' + rate(summary['rateLimitFiveHourPercent']) + '/' + rate(summary['rateLimitSevenDayPercent'])
    def clip(text):
        result, used = '', 0
        for character in text:
            used += 2 if unicodedata.east_asian_width(character) in ('W', 'F') else 1
            if used > max(24, width) - 1:
                return result + '…'
            result += character
        return result
    segments = [identity, 'ctx ' + ctx, recent, cost, machine, cache, quota]
    if width >= 150:
        lines = [' | '.join(segments[:4]), ' | '.join(segments[4:])]
    elif width >= 80:
        lines = [identity, ' | '.join(segments[1:4]), machine, cache + ' | ' + quota]
    else:
        lines = [(summary['model'] or 'model ?'), (summary['provider'] or 'channel ?'), 'ctx ' + ctx,
                 recent, cost, 'CPU ' + cpu, 'RAM ' + gib(resources.get('ramUsedBytes')) + '/' + gib(resources.get('ramTotalBytes')),
                 'disk free ' + gib(resources.get('diskFreeBytes')), cache,
                 'native 5h/7d ' + rate(summary['rateLimitFiveHourPercent']) + '/' + rate(summary['rateLimitSevenDayPercent'])]
    return '\n'.join(clip(line) for line in lines)


def main():
    try:
        raw = sys.stdin.buffer.read(1048577)
        if len(raw) > 1048576:
            raise ValueError('INPUT_TOO_LARGE')
        data = json.loads(raw)
        home = account_home()
        state = private_dir(home / '.local/state/jarvis-ai-development', home)
        summary = summarize(data, current_provider(home))
        resources = sample_resources(home, state)
        atomic_json(state / 'session-summary.json', {**summary, 'resources': resources})
        print(render(summary, resources, shutil.get_terminal_size((100, 24)).columns))
    except (OSError, ValueError, TypeError, sqlite3.Error):
        print('AI status unavailable | usage ? | native quota ? | CPU/RAM/disk ?')


if __name__ == '__main__':
    main()
