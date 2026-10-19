#!/usr/bin/python3
"""Private local IPC to a fixed, host-pinned SSH model adapter. No credential storage."""
import grp
import json
import os
from pathlib import Path
import pwd
import re
import socket
import socketserver
import struct
import subprocess
import sys

MAX_INPUT = 65536
CODES = {'INVALID_INPUT': 400, 'NOT_FOUND': 404, 'CONFLICT': 409, 'ACTIVE_PROVIDER': 409,
         'UNAVAILABLE': 503, 'APPLY_FAILED': 503, 'UNKNOWN_RESULT': 503}

def error(code='UNAVAILABLE'):
    return {'ok': False, 'code': code, 'status': CODES.get(code, 503)}

def exact(value, keys):
    return isinstance(value, dict) and not set(value) - set(keys)

def public_snapshot(value, node):
    # Re-project even trusted node output: credentials cannot enter HTTP responses.
    if not isinstance(value, dict) or value.get('machineId') != node['id'] or value.get('host') != node['host']:
        raise ValueError('NODE_IDENTITY_DIFFERS')
    providers = value.get('providers')
    if not isinstance(providers, list) or len(providers) > 200: raise ValueError('INVALID_INVENTORY')
    rows = []
    for p in providers:
        if not isinstance(p, dict) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', p.get('id', '')):
            raise ValueError('INVALID_PROVIDER')
        fields = {key: p.get(key, '') for key in ['id', 'name', 'baseUrl', 'model', 'authType', 'revision']}
        if not all(isinstance(x, str) and len(x) <= 2000 and not any(ord(c) < 32 for c in x) for x in fields.values()):
            raise ValueError('INVALID_PROVIDER')
        if not re.fullmatch(r'[a-f0-9]{64}', fields['revision']) or fields['authType'] not in ['auth-token', 'api-key']:
            raise ValueError('INVALID_PROVIDER')
        models = p.get('models', {})
        if not isinstance(models, dict): raise ValueError('INVALID_MODELS')
        fields['models'] = {key: str(models.get(key, ''))[:300] for key in ['opus', 'sonnet', 'haiku', 'fable', 'subagent']}
        fields.update({'isCurrent': p.get('isCurrent') is True, 'credentialConfigured': p.get('credentialConfigured') is True})
        rows.append(fields)
    return {'machineId': node['id'], 'host': node['host'], 'application': 'claude',
            'observedAt': value['observedAt'], 'currentProviderId': value.get('currentProviderId'), 'providers': rows}

def dispatch(request, config):
    if not exact(request, ['action', 'machineId', 'providerId', 'expectedRevision', 'commandId', 'provider']):
        return error('INVALID_INPUT')
    action = request.get('action')
    if action == 'machines':
        return {'ok': True, 'value': {'configured': True, 'machines': [{key: n[key] for key in ['id', 'name', 'address', 'host']} for n in config['nodes']]}}
    if action not in ['list', 'create', 'update', 'switch', 'delete']: return error('INVALID_INPUT')
    node = next((n for n in config['nodes'] if n['id'] == request.get('machineId')), None)
    if not node: return error('NOT_FOUND')
    raw = json.dumps(request, ensure_ascii=False, separators=(',', ':')).encode()
    if len(raw) > MAX_INPUT: return error('INVALID_INPUT')
    try:
        result = subprocess.run(['/usr/bin/ssh', '-F', config['sshConfig'], '-o', 'BatchMode=yes',
                                 '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
                                 node['alias'], 'cc-switch-manage'], input=raw,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=75)
        if len(result.stdout) > 1024*1024: return error()
        reply = json.loads(result.stdout)
        if reply.get('ok') is not True:
            return error(reply.get('code') if reply.get('code') in CODES else 'UNAVAILABLE')
        if result.returncode: return error()
        return {'ok': True, 'value': public_snapshot(reply.get('value'), node)}
    except Exception: return error()

class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(90)
        try:
            _, uid, _ = struct.unpack('3i', self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid not in self.server.allowed_uids: return
            raw = self.rfile.readline(MAX_INPUT+1)
            if len(raw) > MAX_INPUT: result = error('INVALID_INPUT')
            else: result = dispatch(json.loads(raw), self.server.config)
            self.wfile.write((json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n').encode())
        except Exception:
            try: self.wfile.write((json.dumps(error()) + '\n').encode())
            except OSError: pass

class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True
    request_queue_size = 16

def main():
    config = json.loads(Path('/etc/jarvis-cc-switch/controller.json').read_text())
    path = Path(config['socket'])
    if path.exists():
        if not path.is_socket(): raise ValueError('UNSAFE_SOCKET_PATH')
        path.unlink()
    with Server(str(path), Handler) as server:
        server.config = config
        server.allowed_uids = {pwd.getpwnam('jarvis').pw_uid, 0}
        os.chmod(path, 0o660)
        os.chown(path, -1, grp.getgrnam('jarvis').gr_gid)
        server.serve_forever(poll_interval=0.5)

if __name__ == '__main__':
    try: main()
    except Exception:
        sys.stderr.write('CC_SWITCH_CONTROLLER_FAILED\n')
        sys.exit(1)
