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

    def invoke(self, args):
        result = subprocess.run([str(self.cli), '-a', 'claude'] + args, capture_output=True, timeout=25,
                                env={**os.environ, 'HOME': str(self.home), 'CLAUDE_CONFIG_DIR': str(self.live.parent)}, cwd=self.home)
        require(result.returncode == 0, 'APPLY_FAILED')

    def apply(self, provider_id):
        self.live.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.invoke(['use', provider_id])
        with contextlib.closing(self.database()) as db:
            row = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone()
        require(row and row['is_current'], 'APPLY_FAILED')
        live = json.loads(self.live.read_text())
        wanted = json.loads(row['settings_config']).get('env', {})
        require(all(live.get('env', {}).get(key) == value for key, value in wanted.items()
                    if key in set(ROLES.values()) | {'ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'}), 'APPLY_FAILED')

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
        # Keep obsolete CCR takeover markers out of local settings on all hosts.
        for key in ['ANTHROPIC_API_BASE_URL', 'CLAUDE_AGENT_API_BASE_URL', 'CCR_CLAUDE_CODE_MODEL', 'CODEXL_CLAUDE_CODE_MODEL', 'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY']:
            env.pop(key, None)
        settings.pop('apiKeyHelper', None)
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
                    self.invoke(['provider', 'add', '--id', request['commandId'], '--name', value['name'], '--config-file', str(path)])
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
            self.backup(action)
            if action == 'switch':
                self.apply(provider_id)
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
                        db.execute("DELETE FROM provider_endpoints WHERE provider_id=? AND app_type='claude'", (provider_id,))
                        db.execute("INSERT INTO provider_endpoints(provider_id,app_type,url,added_at) VALUES(?,?,?,?)", (provider_id, 'claude', value['baseUrl'], int(datetime.datetime.now().timestamp()*1000)))
                db.commit()
            if action == 'update' and row['is_current']:
                try: self.apply(provider_id)
                except Rejected:
                    # Restore only our row if no concurrent editor changed it.
                    restored = False
                    with contextlib.closing(self.database()) as db:
                        latest = db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'", (provider_id,)).fetchone()
                        if latest and latest['settings_config'] == canonical(settings) and latest['name'] == value['name']:
                            db.execute("UPDATE providers SET name=?,settings_config=? WHERE id=? AND app_type='claude'", (row['name'], row['settings_config'], provider_id))
                            db.execute("DELETE FROM provider_endpoints WHERE provider_id=? AND app_type='claude'", (provider_id,))
                            for endpoint in old_endpoints:
                                db.execute('INSERT INTO provider_endpoints(provider_id,app_type,url,added_at) VALUES(?,?,?,?)', tuple(endpoint[k] for k in ['provider_id','app_type','url','added_at']))
                            db.commit();restored = True
                    require(restored, 'UNKNOWN_RESULT')
                    try: self.apply(provider_id)
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
