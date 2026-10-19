#!/usr/bin/python3
"""Forced-command CC Switch adapter. Runs as the configuration's ordinary owner."""
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.parse
import uuid

MAX_INPUT = 65536
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$')
ROLES = {'opus': 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'sonnet': 'ANTHROPIC_DEFAULT_SONNET_MODEL',
         'haiku': 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'fable': 'ANTHROPIC_DEFAULT_FABLE_MODEL',
         'subagent': 'CLAUDE_CODE_SUBAGENT_MODEL'}
STATUS = {'INVALID_INPUT': 400, 'NOT_FOUND': 404, 'CONFLICT': 409, 'ACTIVE_PROVIDER': 409,
          'UNAVAILABLE': 503, 'APPLY_FAILED': 503, 'UNKNOWN_RESULT': 503}

class Rejected(Exception):
    def __init__(self, code): self.code = code

def require(ok, code='INVALID_INPUT'):
    if not ok: raise Rejected(code)

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)

def text(value, maximum, empty=False):
    require(isinstance(value, str) and len(value) <= maximum and (empty or bool(value.strip()))
            and not any(ord(c) < 32 or ord(c) == 127 for c in value))
    return value.strip()

def identifier(value):
    require(isinstance(value, str) and ID.fullmatch(value))
    return value

def validated_provider(value, create=False):
    require(isinstance(value, dict) and not set(value) - {'name', 'baseUrl', 'model', 'models', 'authType', 'apiKey'})
    out = {key: text(value.get(key), maximum) for key, maximum in [('name', 200), ('baseUrl', 2000), ('model', 300)]}
    url = urllib.parse.urlsplit(out['baseUrl'])
    require(url.scheme in ['https', 'http'] and url.hostname and not url.username and not url.password
            and not url.query and not url.fragment)
    require(value.get('authType') in ['auth-token', 'api-key'])
    out['authType'] = value['authType']
    models = value.get('models', {})
    require(isinstance(models, dict) and not set(models) - set(ROLES))
    out['models'] = {key: text(models.get(key, ''), 300, True) or out['model'] for key in ROLES}
    key = text(value.get('apiKey', ''), 8192, True)
    require(not create or bool(key))
    if key: out['apiKey'] = key
    return out

class Manager:
    def __init__(self, home, machine_id, host, cli=None):
        self.home = Path(home)
        self.machine_id, self.host = machine_id, host
        self.dbpath = self.home / '.cc-switch/cc-switch.db'
        self.live = self.home / '.claude/settings.json'
        self.settings = self.home / '.cc-switch/settings.json'
        self.cli = Path(cli) if cli else self.home / '.local/bin/cc-switch'
        self.state = self.home / '.local/state/aimodel'

    def database(self):
        require(self.dbpath.is_file() and not self.dbpath.is_symlink() and self.cli.is_file(), 'UNAVAILABLE')
        db = sqlite3.connect(self.dbpath, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def rows(self, db):
        return [dict(r) for r in db.execute("SELECT * FROM providers WHERE app_type='claude' ORDER BY coalesce(sort_index,2147483647),coalesce(created_at,0),id")]

    def revision(self, row):
        return hashlib.sha256(canonical(row).encode()).hexdigest()

    def public(self, row):
        raw = json.loads(row['settings_config'])
        env = raw.get('env', {})
        main = env.get('ANTHROPIC_MODEL') or raw.get('model') or ''
        return {'id': row['id'], 'name': row['name'], 'baseUrl': env.get('ANTHROPIC_BASE_URL', ''),
                'model': main, 'models': {key: env.get(field, main) for key, field in ROLES.items()},
                'authType': 'api-key' if env.get('ANTHROPIC_API_KEY') and not env.get('ANTHROPIC_AUTH_TOKEN') else 'auth-token',
                'credentialConfigured': bool(env.get('ANTHROPIC_AUTH_TOKEN') or env.get('ANTHROPIC_API_KEY')),
                'isCurrent': bool(row['is_current']), 'revision': self.revision(row)}

    def snapshot(self):
        with contextlib.closing(self.database()) as db:
            rows = self.rows(db)
        return {'machineId': self.machine_id, 'host': self.host, 'application': 'claude',
                'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'currentProviderId': next((r['id'] for r in rows if r['is_current']), None),
                'providers': [self.public(r) for r in rows]}

    @contextlib.contextmanager
    def locked(self):
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = self.state / 'switch.lock'
        fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally: os.close(fd)

    def backup(self, action):
        folder = self.state / 'platform-backups' / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '-' + uuid.uuid4().hex)
        folder.mkdir(parents=True, mode=0o700)
        folder.parent.chmod(0o700)
        with contextlib.closing(self.database()) as source, contextlib.closing(sqlite3.connect(folder / 'cc-switch.db')) as target:
            source.backup(target)
        (folder / 'cc-switch.db').chmod(0o600)
        for name, path in [('claude-settings.json', self.live), ('cc-switch-settings.json', self.settings)]:
            if path.is_file():
                shutil.copyfile(path, folder / name)
                (folder / name).chmod(0o600)
        (folder / 'operation.json').write_text(canonical({'action': action, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}) + '\n')
        (folder / 'operation.json').chmod(0o600)
        return folder

    def invoke(self, args, timeout=25):
        try:
            result = subprocess.run([str(self.cli), '-a', 'claude'] + args, capture_output=True, timeout=timeout,
                                    env={**os.environ, 'HOME': str(self.home), 'CLAUDE_CONFIG_DIR': str(self.live.parent)}, cwd=self.home)
        except (OSError, subprocess.TimeoutExpired):
            raise Rejected('APPLY_FAILED')
        require(result.returncode == 0, 'APPLY_FAILED')

    def equivalent(self, left, right):
        if set(left) != set(right): return False
        return all((json.loads(left[k]) == json.loads(right[k]) if k in ['meta', 'settings_config'] and left[k] and right[k]
                    else left[k] == right[k]) for k in left)

    def same_rows(self, left, right):
        a, b = {r['id']: r for r in left}, {r['id']: r for r in right}
        return a.keys() == b.keys() and all(self.equivalent(a[key], b[key]) for key in a)

    def predicted_command(self, args, before):
        # Let the installed CLI predict its own serialization in an isolated HOME.
        # This lets us preserve unknown metadata without overwriting real edits.
        with tempfile.TemporaryDirectory(prefix='cc-switch-apply-', dir=self.state) as folder:
            home = Path(folder);(home / '.cc-switch').mkdir(mode=0o700);(home / '.claude').mkdir(mode=0o700)
            with contextlib.closing(self.database()) as source, contextlib.closing(sqlite3.connect(home / '.cc-switch/cc-switch.db')) as target:
                source.backup(target)
            for path, relative in [(self.live, '.claude/settings.json'), (self.settings, '.cc-switch/settings.json'),
                                   (self.home / '.claude.json', '.claude.json')]:
                if path.is_file(): shutil.copyfile(path, home / relative)
            child = Manager(home, self.machine_id, self.host, self.cli)
            with contextlib.closing(child.database()) as db:
                require(self.same_rows(child.rows(db), before), 'CONFLICT')
            # Set all HOME-derived paths; inherited XDG settings must not escape.
            env = {**os.environ, 'HOME': str(home), 'CLAUDE_CONFIG_DIR': str(home / '.claude'),
                   'XDG_CONFIG_HOME': str(home / '.config'), 'XDG_DATA_HOME': str(home / '.local/share'),
                   'XDG_STATE_HOME': str(home / '.local/state')}
            try:
                result = subprocess.run([str(self.cli), '-a', 'claude'] + args, capture_output=True,
                                        timeout=5, env=env, cwd=home)
            except (OSError, subprocess.TimeoutExpired): raise Rejected('APPLY_FAILED')
            require(result.returncode == 0, 'APPLY_FAILED')
            with contextlib.closing(child.database()) as db: return child.rows(db)

    def reconcile_use(self, before, predicted, created_id=None):
        with contextlib.closing(self.database()) as db:
            db.execute('BEGIN IMMEDIATE')
            latest = self.rows(db)
            comparison = [dict(row) for row in latest]
            if created_id:
                wanted = next((row for row in predicted if row['id'] == created_id), None)
                for row in comparison:
                    if row['id'] == created_id and wanted: row['created_at'] = wanted['created_at']
            expected = self.same_rows(comparison, predicted)
            require(self.same_rows(latest, before) or expected, 'UNKNOWN_RESULT')
            if expected:
                by_id = {row['id']: row for row in latest}
                for row in before:
                    after = by_id[row['id']]
                    settings = row['settings_config'] if json.loads(after['settings_config']) == json.loads(row['settings_config']) else after['settings_config']
                    db.execute("UPDATE providers SET meta=?,settings_config=? WHERE id=? AND app_type='claude'", (row['meta'], settings, row['id']))
            db.commit()

    def apply(self, provider_id, expected_row=None):
        self.live.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with contextlib.closing(self.database()) as db:
            before = self.rows(db)
        row = next((r for r in before if r['id'] == provider_id), None)
        require(row is not None and (expected_row is None or self.revision(row) == self.revision(expected_row)), 'CONFLICT')
        predicted = self.predicted_command(['use', provider_id], before)
        with contextlib.closing(self.database()) as db:
            require(self.same_rows(self.rows(db), before), 'CONFLICT')
        try: self.invoke(['use', provider_id])
        except Rejected:
            self.reconcile_use(before, predicted)
            raise
        self.reconcile_use(before, predicted)
        with contextlib.closing(self.database()) as db:
            current = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone()
        require(current and current['is_current'], 'UNKNOWN_RESULT')
        raw_live = None
        try:
            raw_live = self.live.read_bytes()
            live = json.loads(raw_live).get('env', {})
            wanted = json.loads(row['settings_config']).get('env', {})
            fields = set(ROLES.values()) | {'ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'}
            require(all(live.get(key) == wanted.get(key) for key in fields), 'APPLY_FAILED')
        except (OSError, ValueError, TypeError, AttributeError):
            error = Rejected('APPLY_FAILED')
            if raw_live is not None: error.invalid_live = raw_live
            raise error

    def merge(self, row, provider):
        settings = json.loads(row['settings_config'])
        env = settings.setdefault('env', {})
        previous_key = env.get('ANTHROPIC_AUTH_TOKEN') or env.get('ANTHROPIC_API_KEY')
        new_key = provider.get('apiKey') or previous_key
        env.pop('ANTHROPIC_AUTH_TOKEN', None)
        env.pop('ANTHROPIC_API_KEY', None)
        if new_key: env['ANTHROPIC_AUTH_TOKEN' if provider['authType'] == 'auth-token' else 'ANTHROPIC_API_KEY'] = new_key
        env.update({'ANTHROPIC_BASE_URL': provider['baseUrl'], 'ANTHROPIC_MODEL': provider['model']})
        for key, field in ROLES.items(): env[field] = provider['models'][key]
        if 'model' in settings: settings['model'] = provider['model']
        # A deliberately supplied key replaces dynamic authentication. Ordinary
        # edits with a blank key preserve custom helpers and unrelated settings.
        if provider.get('apiKey'): settings.pop('apiKeyHelper', None)
        for key, field in ROLES.items():
            label = field + '_NAME'
            if label in env: env[label] = provider['models'][key].removesuffix('[1M]').removesuffix('[1m]')
        return settings

    def execute(self, request):
        require(isinstance(request, dict) and not set(request) - {'action', 'machineId', 'providerId', 'expectedRevision', 'commandId', 'provider'})
        action = request.get('action')
        require(action in ['list', 'create', 'update', 'switch', 'delete'])
        require(request.get('machineId') == self.machine_id)
        if action == 'list': return self.snapshot()
        with self.locked():
            if action == 'create':
                identifier(request.get('commandId'))
                require(str(uuid.UUID(request['commandId'])) == request['commandId'])
                value = validated_provider(request.get('provider'), True)
                with contextlib.closing(self.database()) as db:
                    found = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (request['commandId'],)).fetchone()
                if found:
                    # A retry of an identical create is safe; a reused ID cannot overwrite it.
                    proposed = self.merge(dict(found), value)
                    require(found['name'] == value['name'] and json.loads(found['settings_config']) == proposed, 'CONFLICT')
                    return self.snapshot()
                self.backup(action)
                settings = self.merge({'settings_config': '{}'}, value)
                with tempfile.TemporaryDirectory(prefix='cc-switch-input-', dir=self.state) as folder:
                    path = Path(folder) / 'settings.json'
                    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, 'w') as out: out.write(canonical(settings))
                    args = ['provider', 'add', '--id', request['commandId'], '--name', value['name'], '--config-file', str(path)]
                    with contextlib.closing(self.database()) as db: before = self.rows(db)
                    predicted = self.predicted_command(args, before)
                    with contextlib.closing(self.database()) as db:
                        require(self.same_rows(self.rows(db), before), 'CONFLICT')
                    try: self.invoke(args)
                    except Rejected:
                        self.reconcile_use(before, predicted, request['commandId'])
                        raise Rejected('UNKNOWN_RESULT')
                    self.reconcile_use(before, predicted, request['commandId'])
                return self.snapshot()
            provider_id = identifier(request.get('providerId'))
            with contextlib.closing(self.database()) as db:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone()
                require(row is not None, 'NOT_FOUND')
                row = dict(row)
                require(request.get('expectedRevision') == self.revision(row), 'CONFLICT')
                require(action != 'delete' or not row['is_current'], 'ACTIVE_PROVIDER')
                # Release the transaction before SQLite backup, then recheck before mutation.
                db.rollback()
            backup = self.backup(action)
            if action == 'switch':
                try: self.apply(provider_id, row)
                except Rejected as error:
                    if error.code == 'APPLY_FAILED': raise Rejected('UNKNOWN_RESULT')
                    raise
                return self.snapshot()
            with contextlib.closing(self.database()) as db:
                db.execute('BEGIN IMMEDIATE')
                current = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone()
                require(current is not None and self.revision(dict(current)) == request['expectedRevision'], 'CONFLICT')
                if action == 'delete':
                    db.execute("DELETE FROM providers WHERE id=? AND app_type='claude'", (provider_id,))
                else:
                    old_endpoints = [dict(e) for e in db.execute("SELECT * FROM provider_endpoints WHERE provider_id=? AND app_type='claude'", (provider_id,))]
                    value = validated_provider(request.get('provider'))
                    settings = self.merge(row, value)
                    db.execute("UPDATE providers SET name=?,settings_config=? WHERE id=? AND app_type='claude'", (value['name'], canonical(settings), provider_id))
                    old_url = json.loads(row['settings_config']).get('env', {}).get('ANTHROPIC_BASE_URL')
                    if old_url != value['baseUrl']:
                        existing = [endpoint for endpoint in old_endpoints if endpoint['url'] == value['baseUrl']]
                        if existing:
                            db.execute("DELETE FROM provider_endpoints WHERE provider_id=? AND app_type='claude' AND url=?", (provider_id, old_url))
                        else:
                            changed = db.execute("UPDATE provider_endpoints SET url=? WHERE provider_id=? AND app_type='claude' AND url=?", (value['baseUrl'], provider_id, old_url)).rowcount
                            if not changed:
                                db.execute("INSERT INTO provider_endpoints(provider_id,app_type,url,added_at) VALUES(?,?,?,?)", (provider_id, 'claude', value['baseUrl'], int(datetime.datetime.now().timestamp()*1000)))
                    written_row = dict(db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone())
                    written_endpoints = [dict(e) for e in db.execute("SELECT * FROM provider_endpoints WHERE provider_id=? AND app_type='claude' ORDER BY id", (provider_id,))]
                db.commit()
            if action == 'update' and row['is_current']:
                try: self.apply(provider_id, written_row)
                except Rejected as error:
                    # Restore only our row if no concurrent editor changed it.
                    require(error.code == 'APPLY_FAILED', 'UNKNOWN_RESULT')
                    restored = False
                    with contextlib.closing(self.database()) as db:
                        db.execute('BEGIN IMMEDIATE')
                        latest = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone()
                        endpoints = [dict(e) for e in db.execute("SELECT * FROM provider_endpoints WHERE provider_id=? AND app_type='claude' ORDER BY id", (provider_id,))]
                        if latest and self.revision(dict(latest)) == self.revision(written_row) and endpoints == written_endpoints:
                            db.execute("UPDATE providers SET name=?,settings_config=? WHERE id=? AND app_type='claude'", (row['name'], row['settings_config'], provider_id))
                            db.execute("DELETE FROM provider_endpoints WHERE provider_id=? AND app_type='claude'", (provider_id,))
                            for endpoint in old_endpoints:
                                db.execute('INSERT INTO provider_endpoints(id,provider_id,app_type,url,added_at) VALUES(?,?,?,?,?)', tuple(endpoint[k] for k in ['id','provider_id','app_type','url','added_at']))
                            db.commit();restored = True
                    require(restored, 'UNKNOWN_RESULT')
                    if hasattr(error, 'invalid_live'):
                        # The CLI cannot re-apply against corrupt JSON. Restore
                        # our exact backup only while that failed file is intact.
                        previous_live = backup / 'claude-settings.json'
                        require(previous_live.is_file() and self.live.read_bytes() == error.invalid_live, 'UNKNOWN_RESULT')
                        fd, temporary = tempfile.mkstemp(prefix='.jarvis-restore-', dir=self.live.parent)
                        try:
                            with os.fdopen(fd, 'wb') as out:
                                out.write(previous_live.read_bytes());out.flush();os.fsync(out.fileno())
                            require(self.live.read_bytes() == error.invalid_live, 'UNKNOWN_RESULT')
                            os.replace(temporary, self.live)
                        finally:
                            if os.path.exists(temporary): os.unlink(temporary)
                    try: self.apply(provider_id, row)
                    except Exception: raise Rejected('UNKNOWN_RESULT')
                    raise Rejected('APPLY_FAILED')
            return self.snapshot()

def main():
    require(os.getuid() != 0, 'UNAVAILABLE')
    require(os.environ.get('SSH_ORIGINAL_COMMAND', '') in ['', 'cc-switch-manage'], 'INVALID_INPUT')
    config = json.loads(Path('/etc/jarvis-cc-switch/node.json').read_text())
    import pwd, socket
    account = pwd.getpwuid(os.getuid())
    require(account.pw_name == config['targetUser'] and socket.gethostname() == config['hostname'], 'UNAVAILABLE')
    raw = sys.stdin.buffer.read(MAX_INPUT+1)
    require(len(raw) <= MAX_INPUT)
    value = Manager(account.pw_dir, config['machineId'], config['host']).execute(json.loads(raw))
    print(canonical({'ok': True, 'value': value}))

if __name__ == '__main__':
    try: main()
    except Rejected as error:
        print(canonical({'ok': False, 'code': error.code, 'status': STATUS.get(error.code, 503)}))
        sys.exit(1)
    except Exception:
        print(canonical({'ok': False, 'code': 'UNAVAILABLE', 'status': 503}))
        sys.exit(1)
