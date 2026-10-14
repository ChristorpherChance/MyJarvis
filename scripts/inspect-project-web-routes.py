"""Extract public routing metadata without emitting nginx configuration or secrets."""
import json
import re
import subprocess
from urllib.parse import urlsplit, urlunsplit

run = subprocess.run(['nginx', '-T'], capture_output=True, text=True, timeout=15)
servers = []
stack = []
for line in run.stdout.splitlines():
    line = line.split('#', 1)[0].strip()
    for token in re.split(r'([{};])', line):
        token = token.strip()
        if token == '{':
            header = pending
            if header == 'server':
                row = {'names': [], 'listen': [], 'routes': []}
                servers.append(row)
                stack.append(('server', row))
            else:
                stack.append((header, None))
            pending = ''
        elif token == '}':
            if stack:
                stack.pop()
            pending = ''
        elif token == ';':
            owner = next((value for kind, value in reversed(stack) if kind == 'server'), None)
            if owner is not None:
                parts = pending.split()
                if parts and parts[0] == 'server_name':
                    owner['names'].extend(parts[1:])
                if parts and parts[0] == 'listen':
                    owner['listen'].append(' '.join(parts[1:]))
                if len(parts) == 2 and parts[0] == 'proxy_pass':
                    url = urlsplit(parts[1])
                    if url.scheme in ['http', 'https'] and not url.username and not url.password:
                        owner['routes'].append({'location': next((kind for kind, _ in reversed(stack) if kind.startswith('location ')), ''), 'upstream': urlunsplit((url.scheme, url.netloc, url.path, '', ''))})
            pending = ''
        elif token:
            pending = token
print(json.dumps({'servers': servers}))
