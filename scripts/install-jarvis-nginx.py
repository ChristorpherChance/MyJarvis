"""Add one managed hostname; retain old sites and never emit ingress secrets."""
import base64
import json
import os
from pathlib import Path
import subprocess

domain = p['domain']
if domain != 'cc-jarvis.ikvein.com':
    raise RuntimeError('Unexpected managed domain')
directory = Path('/etc/nginx/sites-available')
file = directory / domain
link = Path('/etc/nginx/sites-enabled') / domain
backup = Path('/var/backups/jarvis-domain-access')
backup.mkdir(mode=0o700, exist_ok=True)
os.chmod(backup, 0o700)
old = file.read_bytes() if file.exists() else None
if old is not None and not old.startswith(b'# Managed Jarvis domain ingress'):
    raise RuntimeError('Refusing to overwrite an unmanaged site')
if old is not None and not (backup/'previous-site.conf').exists():
    (backup/'previous-site.conf').write_bytes(old)
    os.chmod(backup/'previous-site.conf', 0o600)
if link.exists() and (not link.is_symlink() or link.resolve() != file):
    raise RuntimeError('Existing domain link differs')
authorization = base64.b64encode((p['edgeUser']+':'+p['edgePassword']).encode()).decode()
config = '''# Managed Jarvis domain ingress; contains a private proxy credential.
map $http_upgrade $jarvis_connection_upgrade { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name cc-jarvis.ikvein.com;
    return 308 https://cc-jarvis.ikvein.com$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name cc-jarvis.ikvein.com;
    ssl_certificate /etc/nginx/ssl/ikvein.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/ikvein.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 64m;
    gzip off;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $jarvis_connection_upgrade;
        proxy_set_header Authorization "Basic AUTHORIZATION";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 10s;
    }
}
'''.replace('AUTHORIZATION', authorization)
if old is not None and b'location ^~ /control/' in old:
    control = '''    location = /control { return 308 /control/; }
    location ^~ /control/ {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host cc-jarvis-control.ikvein.com;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Authorization "Basic AUTHORIZATION";
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 32k;
        proxy_read_timeout 70s;
    }
'''.replace('AUTHORIZATION', authorization)
    config = config.replace('    location / {', control+'    location / {', 1)
temp = file.with_suffix('.next')
temp.write_text(config)
os.chmod(temp, 0o600)
os.replace(temp, file)
created = not link.is_symlink()
if created:
    link.symlink_to(file)
test = subprocess.run(['nginx', '-t'], capture_output=True, timeout=10)
if test.returncode:
    if old is not None:
        file.write_bytes(old)
        os.chmod(file, 0o600)
    else:
        if created: link.unlink()
        file.unlink()
    raise RuntimeError('Nginx configuration verification failed; site restored')
subprocess.run(['systemctl', 'reload', 'nginx.service'], check=True)
print(json.dumps({'domain': domain, 'httpsEnabled': True, 'httpRedirect': 308, 'streamBuffering': False, 'directFRPGate': True, 'existingSitesRetained': True}))
