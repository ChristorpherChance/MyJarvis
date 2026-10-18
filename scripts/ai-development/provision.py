#!/usr/bin/env python3
"""Fixed-profile, ordinary-user AI terminal provisioning. JSON in/out only.

Credentials are accepted on stdin and written only to private provider storage.
No arbitrary command, path, model request, quota request, or bill is accepted.
"""
import concurrent.futures
import contextlib
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shlex
import shutil
import sqlite3
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
import uuid
try:
    import fcntl
except ImportError:
    fcntl = None

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('terminal_statusline', HERE / 'terminal-statusline.py')
status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(status)
PROFILE_BYTES = (HERE / 'profile-manifest.json').read_bytes()
PROFILE = json.loads(PROFILE_BYTES)
PROFILE_HASH = hashlib.sha256(PROFILE_BYTES).hexdigest()
ENV_KEYS = frozenset(('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL',
                      'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
                      'ANTHROPIC_DEFAULT_FABLE_MODEL',
                      'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_OUTPUT_TOKENS'))
SETTINGS_KEYS = frozenset(('env', 'model', 'effortLevel'))
TOOLS = ('claude', 'cc-switch', 'ccswitch', 'node', 'npm', 'npx', 'git', 'python3', 'tmux', 'rg', 'jq', 'pidstat', 'iostat')
MAX_PRIVATE_BYTES = 16777216


class Fault(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns if os.name != 'nt' else None)


def validate_request(value):
    if not isinstance(value, dict) or set(value) - {'schemaVersion', 'action', 'profileId', 'providers'}:
        raise Fault('INPUT_SCHEMA_INVALID')
    if value.get('schemaVersion', 1) != 1 or value.get('profileId') != PROFILE['profileId']:
        raise Fault('PROFILE_UNSUPPORTED')
    if value.get('action') not in ('probe', 'configure', 'telemetry'):
        raise Fault('ACTION_UNSUPPORTED')
    providers = value.get('providers', [])
    if not isinstance(providers, list) or len(providers) > 32 or (providers and value['action'] != 'configure'):
        raise Fault('PROVIDERS_INVALID')
    ids, names = set(), set()
    for provider in providers:
        if not isinstance(provider, dict) or set(provider) != {'id', 'name', 'settingsConfig'}:
            raise Fault('PROVIDER_SCHEMA_INVALID')
        pid, name, settings = provider['id'], provider['name'], provider['settingsConfig']
        if not isinstance(pid, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', pid) or pid in ids:
            raise Fault('PROVIDER_ID_INVALID')
        if status.label(name, 128) is None or name in names:
            raise Fault('PROVIDER_NAME_INVALID')
        ids.add(pid)
        names.add(name)
        if not isinstance(settings, dict) or set(settings) - SETTINGS_KEYS:
            raise Fault('PORTABLE_SETTINGS_INVALID')
        for key in ('model', 'effortLevel'):
            if key in settings and (not isinstance(settings[key], str) or status.label(settings[key], 128) is None):
                raise Fault('PORTABLE_MODEL_INVALID')
        env = settings.get('env', {})
        if not isinstance(env, dict) or set(env) - ENV_KEYS:
            raise Fault('PORTABLE_ENV_INVALID')
        for key, item in env.items():
            if not isinstance(item, str) or not item or len(item) > 8192 or any(ord(c) < 32 or ord(c) == 127 for c in item):
                raise Fault('PORTABLE_ENV_VALUE_INVALID')
            if key == 'ANTHROPIC_BASE_URL' and (not item.startswith('https://') or '@' in item or '?' in item or '#' in item):
                raise Fault('PORTABLE_ENDPOINT_INVALID')
    return value


class Context:
    """Fixture home injection is Python-only; the stdin protocol never accepts it."""
    def __init__(self, home=None, strict=True):
        self.strict = strict
        self.home = status.account_home() if home is None else Path(home).resolve(strict=True)
        self.uid = os.getuid() if hasattr(os, 'getuid') else None
        self.state = self.home / '.local/state/jarvis-ai-development'
        self.share = self.home / '.local/share/jarvis-ai-development'
        self.bin = self.home / '.local/bin'
        self.db = self.home / '.cc-switch/cc-switch.db'
        self.settings = self.home / '.claude/settings.json'
        self.deadline = time.monotonic() + PROFILE['installationDeadlineSeconds']
        self.changed = False

    def parents(self, path, create=False):
        try:
            relative = path.relative_to(self.home)
        except ValueError:
            raise Fault('PATH_OUTSIDE_ACCOUNT')
        current = self.home
        for part in relative.parts:
            current /= part
            if create:
                try:
                    current.mkdir(mode=0o700)
                except FileExistsError:
                    pass
            info = current.lstat()
            if not stat.S_ISDIR(info.st_mode) or current.is_symlink() or getattr(current, 'is_junction', lambda: False)():
                raise Fault('DIRECTORY_UNSAFE')
            if self.strict and (info.st_uid != self.uid or info.st_mode & 0o022):
                raise Fault('DIRECTORY_OWNER_UNSAFE')
        return path

    def read(self, path, maximum=MAX_PRIVATE_BYTES):
        self.parents(path.parent)
        try:
            before = path.lstat()
        except FileNotFoundError:
            return None, None
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > maximum or path.is_symlink():
            raise Fault('FILE_UNSAFE')
        if self.strict and (before.st_uid != self.uid or before.st_mode & 0o022):
            raise Fault('FILE_OWNER_UNSAFE')
        fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        with os.fdopen(fd, 'rb') as stream:
            opened = os.fstat(stream.fileno())
            raw = stream.read(maximum + 1)
            after = os.fstat(stream.fileno())
        if len(raw) > maximum or not identity(before) == identity(opened) == identity(after) == identity(path.lstat()):
            raise Fault('FILE_CHANGED')
        return raw, identity(after)

    def unchanged(self, path, expected):
        try:
            actual = identity(path.lstat())
        except FileNotFoundError:
            actual = None
        if expected != actual:
            raise Fault('FILE_CHANGED')

    def write(self, path, raw, expected, mode=0o600):
        self.parents(path.parent, True)
        self.unchanged(path, expected)
        temporary = path.with_name('.jarvis-ai-' + uuid.uuid4().hex)
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), mode)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            self.unchanged(path, expected)
            os.replace(temporary, path)
            if self.strict:
                os.chmod(path, mode)
            self.changed = True
        finally:
            with contextlib.suppress(FileNotFoundError):
                temporary.unlink()
        return identity(path.lstat())

    def env(self):
        return {'HOME': str(self.home), 'PATH': str(self.bin) + os.pathsep + '/usr/local/bin:/usr/bin:/bin',
                'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'CI': '1', 'DISABLE_AUTOUPDATER': '1'}


def locate(ctx, name):
    return shutil.which(name, path=ctx.env()['PATH'])


def version(ctx, name):
    path = locate(ctx, name)
    if path is None:
        return {'name': name, 'version': None, 'installed': False, 'path': None, 'matchesPinned': False, 'authStatus': 'unknown'}
    result = {'name': name, 'version': None, 'installed': True, 'path': path, 'matchesPinned': False, 'authStatus': 'unknown'}
    try:
        resolved = Path(path).resolve(strict=True)
        info = resolved.stat()
        if not stat.S_ISREG(info.st_mode) or (ctx.strict and (info.st_uid not in (0, ctx.uid) or info.st_mode & 0o022)):
            raise Fault('TOOL_UNSAFE')
        if ctx.strict:
            for parent in resolved.parents:
                ancestor = parent.stat()
                if ancestor.st_uid not in (0, ctx.uid) or ancestor.st_mode & 0o022:
                    raise Fault('TOOL_PARENT_UNSAFE')
        argument = '-V' if name in ('pidstat', 'iostat') else '--version'
        command = [path, argument]
        output = subprocess.run(command, env=ctx.env(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=8, check=False)
        match = re.search(rb'(?<![0-9])v?([0-9]+\.[0-9]+(?:\.[0-9]+)?)(?![0-9])', output.stdout[:16384] + output.stderr[:16384])
        if output.returncode == 0 and match:
            result['version'] = match[1].decode('ascii')
        pin_name = 'cc-switch' if name == 'ccswitch' else name
        result['matchesPinned'] = pin_name in PROFILE['packages'] and result['version'] == PROFILE['packages'][pin_name]['version']
    except (OSError, subprocess.SubprocessError, Fault):
        pass
    return result


def read_object(raw, code):
    try:
        value = json.loads(raw) if raw else {}
    except (ValueError, UnicodeError):
        raise Fault(code)
    if not isinstance(value, dict):
        raise Fault(code)
    return value


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def status_command(ctx):
    return '/usr/bin/python3 -I -B ' + shlex.quote(str(ctx.share / 'terminal-statusline.py'))


def status_setting(ctx):
    return {'type': 'command', 'command': status_command(ctx), 'padding': 0}


def open_database(ctx, readonly=False):
    ctx.read(ctx.db, 268435456)
    for suffix in ('-wal', '-shm', '-journal'):
        path = ctx.db.with_name(ctx.db.name + suffix)
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or path.is_symlink() or (ctx.strict and (info.st_uid != ctx.uid or info.st_mode & 0o022)):
            raise Fault('DATABASE_SIDECAR_UNSAFE')
    connection = sqlite3.connect(ctx.db.as_uri() + ('?mode=ro' if readonly else '?mode=rw'), uri=True, timeout=3)
    connection.execute('PRAGMA busy_timeout=3000')
    connection.execute('PRAGMA trusted_schema=OFF')
    return connection


def provider_public(row):
    pid, name, raw, current = row
    value = read_object(raw, 'PROVIDER_JSON_INVALID')
    env = value.get('env') if isinstance(value.get('env'), dict) else {}
    model = status.label(value.get('model'), 128) or status.label(env.get('ANTHROPIC_MODEL'), 128)
    return {'id': status.label(pid, 128) or 'unknown', 'name': status.label(name, 128) or 'unknown', 'model': model,
            'credentialConfigured': any(isinstance(env.get(key), str) and bool(env[key]) for key in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN')),
            'current': bool(current)}


def safe_session(ctx):
    try:
        raw, _ = ctx.read(ctx.state / 'session-summary.json', 262144)
        value = read_object(raw, 'SESSION_JSON_INVALID')
        if not raw or value.get('schemaVersion') != 1:
            return None, None
        result = {key: None for key in status.SESSION_KEYS}
        result.update(schemaVersion=1, observedAt=status.label(value.get('observedAt'), 64))
        if result['observedAt'] is None:
            return None, None
        for key in ('sessionId', 'model', 'provider'):
            result[key] = status.label(value.get(key), 128)
        for key in status.SESSION_KEYS:
            if key not in result or key in ('schemaVersion', 'observedAt', 'sessionId', 'model', 'provider', 'billingStatus'):
                continue
            result[key] = status.number(value.get(key), 100 if key.startswith('rateLimit') else None)
        result['billingStatus'] = 'estimated' if result['sessionCostUSD'] is not None and value.get('billingStatus') == 'estimated' else 'unknown'
        resources = value.get('resources') if isinstance(value.get('resources'), dict) else {}
        resources = {key: status.number(resources.get(key), 100 if key == 'cpuPercent' else None) for key in status.RESOURCE_KEYS}
        return result, resources
    except (FileNotFoundError, Fault, OSError, ValueError):
        return None, None


def tool_signature(path):
    try:
        return list(identity(Path(path).resolve(strict=True).stat()))
    except (OSError, TypeError):
        return None


def inventory(ctx, telemetry=False):
    if telemetry:
        try:
            raw, _ = ctx.read(ctx.state / 'tool-inventory.json', 262144)
            cached = read_object(raw, 'TOOL_CACHE_INVALID').get('tools', [])
            if not isinstance(cached, list):
                cached = []
        except (OSError, Fault):
            cached = []
        tools = []
        for name in TOOLS:
            path = locate(ctx, name)
            old = next((t for t in cached if isinstance(t, dict) and t.get('name') == name), {})
            signature = tool_signature(path) if path else None
            unchanged = signature is not None and old.get('path') == path and old.get('identity') == signature
            known = status.label(old.get('version'), 32) if unchanged else None
            pin_name = 'cc-switch' if name == 'ccswitch' else name
            tools.append({'name': name, 'version': known, 'installed': path is not None, 'path': path,
                          'matchesPinned': pin_name in PROFILE['packages'] and known == PROFILE['packages'][pin_name]['version'], 'authStatus': 'unknown'})
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            tools = list(executor.map(lambda name: version(ctx, name), TOOLS))
    providers, all_provider_status = [], False
    try:
        connection = open_database(ctx, True)
        try:
            rows = connection.execute("SELECT id,name,settings_config,is_current FROM providers WHERE app_type='claude' ORDER BY id").fetchall()
            providers = [provider_public(row) for row in rows]
            common_row = connection.execute('SELECT value FROM settings WHERE key=?', ('common_config_claude',)).fetchone()
            common = read_object(common_row[0], 'COMMON_JSON_INVALID') if common_row else {}
            all_provider_status = all(read_object(row[2], 'PROVIDER_JSON_INVALID').get('statusLine') == status_setting(ctx) for row in rows)
        finally:
            connection.close()
    except (OSError, sqlite3.Error, Fault):
        common = {}
    try:
        raw, _ = ctx.read(ctx.settings)
        global_settings = read_object(raw, 'CLAUDE_JSON_INVALID')
        configured = (global_settings.get('statusLine') == status_setting(ctx) and common.get('statusLine') == status_setting(ctx) and all_provider_status)
        installed, _ = ctx.read(ctx.share / 'terminal-statusline.py')
        configured = configured and installed == (HERE / 'terminal-statusline.py').read_bytes()
    except (OSError, Fault):
        configured = False
    current_auth = next((p['credentialConfigured'] for p in providers if p['current']), None)
    for tool in tools:
        if tool['name'] == 'claude':
            tool['authStatus'] = 'configured' if current_auth else 'unknown'
    session, resources = safe_session(ctx)
    return {'observedAt': stamp(), 'tools': tools, 'providers': providers,
            'statusline': {'configured': bool(configured), 'commandSHA256': digest(status_command(ctx).encode()) if configured else None,
                           'scope': 'global-and-provider', 'resources': True},
            'resources': resources, 'sessionSummary': session}


def download(ctx, name):
    pin = PROFILE['packages'][name]
    cache = ctx.parents(ctx.home / '.cache/jarvis-ai-development', True)
    target = cache / (name + '-' + pin['version'] + '.verified')
    maximum = pin.get('bytes', pin.get('maximumBytes', 100000000))
    def verified(path):
        try:
            ctx.parents(path.parent)
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or path.is_symlink() or info.st_size > maximum:
                return False
            if ctx.strict and (info.st_uid != ctx.uid or info.st_mode & 0o077):
                return False
            h = hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1048576), b''):
                    h.update(chunk)
            return identity(path.lstat()) == identity(info) and h.hexdigest() == pin['sha256'] and ('bytes' not in pin or info.st_size == pin['bytes'])
        except OSError:
            return False
    if verified(target):
        return target
    if target.exists() or target.is_symlink():
        raise Fault('DOWNLOAD_CACHE_INVALID')
    urls = [pin['url']] + ([pin['fallbackUrl']] if pin.get('fallbackUrl') else [])
    for attempt in range(PROFILE['downloadAttempts']):
        part = cache / ('.download-' + uuid.uuid4().hex)
        try:
            if time.monotonic() >= ctx.deadline:
                raise Fault('INSTALL_DEADLINE')
            request = urllib.request.Request(urls[min(attempt, len(urls) - 1)], headers={'User-Agent': 'Jarvis-AI-Development/1'})
            fd = os.open(part, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output, urllib.request.urlopen(request, timeout=20) as source:
                if not source.geturl().startswith('https://'):
                    raise Fault('DOWNLOAD_HTTPS_REQUIRED')
                count = 0
                while True:
                    chunk = source.read(1048576)
                    if not chunk:
                        break
                    count += len(chunk)
                    if count > maximum or time.monotonic() >= ctx.deadline:
                        raise Fault('DOWNLOAD_BOUNDS_EXCEEDED')
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if not verified(part):
                raise Fault('DOWNLOAD_PIN_MISMATCH')
            if target.exists() or target.is_symlink():
                raise Fault('DOWNLOAD_CACHE_RACE')
            os.replace(part, target)
            return target
        except (OSError, Fault):
            with contextlib.suppress(FileNotFoundError):
                part.unlink()
    raise Fault('PINNED_DOWNLOAD_FAILED')


def archive_members(archive, root):
    """Validate all entries before writing any. Internal relative symlinks only."""
    members = archive.getmembers()
    if len(members) > 20000:
        raise Fault('ARCHIVE_BOUNDS_EXCEEDED')
    seen, symlinks, total = set(), set(), 0
    for member in members:
        name = PurePosixPath(member.name)
        if name.is_absolute() or not name.parts or name.parts[0] != root or any(p in ('', '.', '..') for p in name.parts) or '\\' in member.name or member.name in seen:
            raise Fault('ARCHIVE_PATH_INVALID')
        seen.add(member.name)
        if not (member.isdir() or member.isfile() or member.issym()):
            raise Fault('ARCHIVE_TYPE_INVALID')
        total += member.size
        if member.size < 0 or total > 1073741824:
            raise Fault('ARCHIVE_BOUNDS_EXCEEDED')
        if member.issym():
            if member.linkname.startswith('/') or '\\' in member.linkname:
                raise Fault('ARCHIVE_LINK_INVALID')
            parts = list(name.parent.parts)
            for part in PurePosixPath(member.linkname).parts:
                if part == '..':
                    if len(parts) <= 1:
                        raise Fault('ARCHIVE_LINK_INVALID')
                    parts.pop()
                elif part != '.':
                    parts.append(part)
            symlinks.add(name)
    if any(parent in symlinks for member in members for parent in PurePosixPath(member.name).parents):
        raise Fault('ARCHIVE_LINK_PARENT_INVALID')
    return members


def link_tool(ctx, path, target):
    ctx.parents(path.parent, True)
    if path.is_symlink():
        if path.resolve(strict=True) == target.resolve(strict=True):
            return
        raise Fault('TOOL_LINK_CONFLICT')
    if path.exists():
        raise Fault('TOOL_PATH_CONFLICT')
    temporary = path.with_name('.jarvis-link-' + uuid.uuid4().hex)
    try:
        temporary.symlink_to(target)
        if path.exists() or path.is_symlink():
            raise Fault('TOOL_PATH_CONFLICT')
        os.replace(temporary, path)
        ctx.changed = True
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


def install_tool(ctx, name):
    if version(ctx, name)['matchesPinned']:
        return
    pin = PROFILE['packages'][name]
    source = download(ctx, name)
    tools = ctx.parents(ctx.share / 'tools', True)
    destination = tools / (name + '-' + pin['version'])
    if destination.exists() or destination.is_symlink():
        raise Fault('TOOL_VERSION_DIRECTORY_CONFLICT')
    staging = tools / ('.install-' + uuid.uuid4().hex)
    staging.mkdir(mode=0o700)
    try:
        if name == 'node':
            root = 'node-v' + pin['version'] + '-linux-x64'
            with tarfile.open(source, 'r:xz') as archive:
                members = archive_members(archive, root)
                for member in members:
                    path = staging.joinpath(*PurePosixPath(member.name).parts)
                    if member.isdir():
                        path.mkdir(parents=True, exist_ok=True, mode=0o700)
                    elif member.isfile():
                        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                        with archive.extractfile(member) as incoming, path.open('xb') as outgoing:
                            shutil.copyfileobj(incoming, outgoing)
                        os.chmod(path, 0o755 if member.mode & 0o111 else 0o600)
                    else:
                        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                        path.symlink_to(member.linkname)
            os.replace(staging / root, destination)
            targets = {item: destination / 'bin' / item for item in ('node', 'npm', 'npx')}
        else:
            payload = source.read_bytes() if name == 'claude' else None
            if name == 'cc-switch':
                with tarfile.open(source, 'r:gz') as archive:
                    candidates = [m for m in archive.getmembers() if m.name in ('cc-switch', './cc-switch')]
                    if len(candidates) != 1 or not candidates[0].isfile() or candidates[0].size > 67108864:
                        raise Fault('CC_ARCHIVE_INVALID')
                    payload = archive.extractfile(candidates[0]).read(67108865)
                if digest(payload) != pin['binarySha256']:
                    raise Fault('CC_BINARY_PIN_MISMATCH')
            binary = staging / name
            binary.write_bytes(payload)
            os.chmod(binary, 0o755)
            os.replace(staging, destination)
            targets = {name: destination / name}
        for item, target in targets.items():
            link_tool(ctx, ctx.bin / item, target)
        if not version(ctx, name)['matchesPinned']:
            raise Fault('INSTALLED_VERSION_MISMATCH')
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def new_backup(ctx, db):
    parent = ctx.parents(ctx.state / 'backups', True)
    folder = parent / ('backup-' + uuid.uuid4().hex)
    folder.mkdir(mode=0o700)
    connection = sqlite3.connect(folder / 'cc-switch.db')
    try:
        deadline = min(ctx.deadline, time.monotonic() + 30)
        def progress(_status, _remaining, _total):
            if time.monotonic() >= deadline:
                raise Fault('BACKUP_DEADLINE')
        db.backup(connection, pages=256, progress=progress, sleep=0.05)
    finally:
        connection.close()
    os.chmod(folder / 'cc-switch.db', 0o600)
    return folder


def prune_backups(ctx):
    parent = ctx.parents(ctx.state / 'backups')
    folders = []
    for folder in parent.iterdir():
        if not re.fullmatch(r'backup-[a-f0-9]{32}', folder.name):
            raise Fault('BACKUP_NAMESPACE_UNEXPECTED')
        ctx.parents(folder)
        info = folder.lstat()
        for file in folder.iterdir():
            if file.name not in ('cc-switch.db', 'manifest.json') and not re.fullmatch(r'file-[0-9]+', file.name):
                raise Fault('BACKUP_CONTENT_UNEXPECTED')
            ctx.read(file, 268435456)
        folders.append((info.st_mtime_ns, folder))
    for _, folder in sorted(folders, reverse=True)[2:]:
        for file in folder.iterdir():
            file.unlink()
        folder.rmdir()


def configure_storage(ctx, providers):
    ctx.parents(ctx.settings.parent, True)
    ctx.parents(ctx.share, True)
    ctx.parents(ctx.bin, True)
    if not ctx.db.exists():
        ctx.parents(ctx.db.parent, True)
        output = subprocess.run([locate(ctx, 'cc-switch'), 'provider', 'list', '--app', 'claude'], env=ctx.env(),
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        if output.returncode != 0 or not ctx.db.exists():
            raise Fault('CC_DATABASE_INITIALIZATION_FAILED')
        os.chmod(ctx.db, 0o600)
    connection = open_database(ctx)
    backup = None
    written, manifest = [], {'schemaVersion': 1, 'profileHash': PROFILE_HASH, 'createdAt': stamp(), 'files': [], 'database': 'cc-switch.db',
                             'originUid': ctx.uid, 'originHomeSHA256': digest(str(ctx.home).encode())}
    try:
        connection.execute('BEGIN IMMEDIATE')
        rows = connection.execute("SELECT id,name,settings_config,is_current FROM providers WHERE app_type='claude' ORDER BY id").fetchall()
        existing_ids, existing_names = {r[0] for r in rows}, {r[1] for r in rows}
        modifications, additions = [], []
        setting = status_setting(ctx)
        for pid, _, raw, _ in rows:
            value = read_object(raw, 'PROVIDER_JSON_INVALID')
            if value.get('statusLine') != setting:
                modifications.append((json.dumps({**value, 'statusLine': setting}, ensure_ascii=False), pid))
        for provider in providers:
            if provider['id'] not in existing_ids and provider['name'] not in existing_names:
                additions.append((provider['id'], provider['name'], json.dumps({**provider['settingsConfig'], 'statusLine': setting}, ensure_ascii=False)))
        row = connection.execute('SELECT value FROM settings WHERE key=?', ('common_config_claude',)).fetchone()
        common = read_object(row[0], 'COMMON_JSON_INVALID') if row else {}
        new_common = json.dumps({**common, 'statusLine': setting}, ensure_ascii=False)
        common_changed = common.get('statusLine') != setting
        raw, expected = ctx.read(ctx.settings)
        live = read_object(raw, 'CLAUDE_JSON_INVALID')
        files = []
        if live.get('statusLine') != setting:
            files.append((ctx.settings, encode({**live, 'statusLine': setting}), expected, raw, 0o600))
        status_path = ctx.share / 'terminal-statusline.py'
        old, expected = ctx.read(status_path)
        desired = (HERE / 'terminal-statusline.py').read_bytes()
        if old != desired:
            files.append((status_path, desired, expected, old, 0o600))
        all_providers = [provider_public(r) for r in rows] + [provider_public((r[0], r[1], r[2], 0)) for r in additions]
        k3 = next((p for p in all_providers if 'k3' in p.get('id', '').lower() or 'kimi' in p.get('name', '').lower() or str(p.get('model', '')).lower().startswith('k3')), None)
        if k3:
            launcher = ('#!/bin/sh\nexport JARVIS_AI_PROVIDER_LABEL=' + shlex.quote(k3['name']) + '\nexec ' + shlex.quote(locate(ctx, 'cc-switch')) +
                        ' start claude ' + shlex.quote(k3['id']) + ' -- "$@"\n').encode()
            path = ctx.bin / 'claude-k3'
            old, expected = ctx.read(path)
            if old != launcher:
                files.append((path, launcher, expected, old, 0o700))
        marker = '# Jarvis AI development PATH v1'
        snippet = '\n' + marker + '\ncase ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac\n'
        for name in ('.profile', '.bashrc'):
            path = ctx.home / name
            old, expected = ctx.read(path)
            if marker.encode() not in (old or b''):
                files.append((path, (old or b'') + snippet.encode(), expected, old, 0o600))
        if not (files or modifications or additions or common_changed):
            connection.rollback()
            return
        # A second read connection snapshots committed state while BEGIN IMMEDIATE excludes writers.
        source = open_database(ctx, True)
        try:
            backup = new_backup(ctx, source)
        finally:
            source.close()
        for index, (path, desired, expected, old, mode) in enumerate(files):
            entry = {'path': str(path.relative_to(ctx.home)), 'existed': old is not None, 'backup': 'file-' + str(index),
                     'beforeSHA256': digest(old) if old is not None else None, 'afterSHA256': digest(desired)}
            if old is not None:
                (backup / entry['backup']).write_bytes(old)
                os.chmod(backup / entry['backup'], 0o600)
            manifest['files'].append(entry)
        (backup / 'manifest.json').write_bytes(encode(manifest))
        os.chmod(backup / 'manifest.json', 0o600)
        connection.executemany("UPDATE providers SET settings_config=? WHERE id=? AND app_type='claude'", modifications)
        for pid, name, settings in additions:
            connection.execute("INSERT INTO providers(id,app_type,name,settings_config,is_current) VALUES(?,'claude',?,?,0)", (pid, name, settings))
        if common_changed:
            connection.execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', ('common_config_claude', new_common))
        for path, desired, expected, old, mode in files:
            after = ctx.write(path, desired, expected, mode)
            written.append((path, after, old, mode))
        connection.commit()
        ctx.changed = True
    except Exception:
        connection.rollback()
        for path, after, old, mode in reversed(written):
            ctx.unchanged(path, after)
            if old is None:
                path.unlink()
            else:
                ctx.write(path, old, after, mode)
        raise
    finally:
        connection.close()
    if backup:
        prune_backups(ctx)


@contextlib.contextmanager
def configuration_lock(ctx):
    ctx.parents(ctx.state, True)
    path = ctx.state / 'provision.lock'
    before = path.lstat() if path.exists() or path.is_symlink() else None
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or (ctx.strict and (info.st_uid != ctx.uid or info.st_mode & 0o077)):
            raise Fault('PROVISION_LOCK_UNSAFE')
        if before is not None and identity(before) != identity(info):
            raise Fault('PROVISION_LOCK_CHANGED')
        if fcntl is None:
            if ctx.strict:
                raise Fault('LINUX_LOCK_REQUIRED')
        else:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Fault('PROVISION_BUSY')
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def run(request, ctx=None):
    request = validate_request(request)
    ctx = ctx or Context()
    if request['action'] == 'configure':
        if ctx.strict and platform.machine().lower() not in ('x86_64', 'amd64'):
            raise Fault('LINUX_X64_REQUIRED')
        with configuration_lock(ctx):
            ctx.parents(ctx.bin, True)
            for name in ('node', 'cc-switch', 'claude'):
                install_tool(ctx, name)
            alias = ctx.bin / 'ccswitch'
            if not locate(ctx, 'ccswitch'):
                link_tool(ctx, alias, Path(locate(ctx, 'cc-switch')))
            configure_storage(ctx, request.get('providers', []))
    observed = inventory(ctx, request['action'] == 'telemetry')
    if request['action'] == 'configure':
        cache_path = ctx.state / 'tool-inventory.json'
        old, expected = ctx.read(cache_path, 262144)
        cache = {'schemaVersion': 1, 'observedAt': observed['observedAt'],
                 'tools': [{**t, 'identity': tool_signature(t['path'])} for t in observed['tools']]}
        configuration_changed = ctx.changed
        ctx.write(cache_path, encode(cache), expected)
        ctx.changed = configuration_changed
    return {'schemaVersion': 1, 'profileId': PROFILE['profileId'], 'profileRevision': PROFILE['profileRevision'],
            'profileHash': PROFILE_HASH, 'action': request['action'], 'complete': True, 'changed': ctx.changed,
            'inventory': observed}


def main():
    try:
        raw = sys.stdin.buffer.read(1048577)
        if len(raw) > 1048576:
            raise Fault('INPUT_TOO_LARGE')
        result = run(json.loads(raw))
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except BaseException as error:
        code = error.code if isinstance(error, Fault) else ('INTERRUPTED' if isinstance(error, (KeyboardInterrupt, SystemExit)) else 'PROVISION_FAILED')
        print(json.dumps({'schemaVersion': 1, 'profileId': PROFILE['profileId'], 'profileRevision': PROFILE['profileRevision'],
                          'profileHash': PROFILE_HASH, 'complete': False, 'errorCode': code}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
