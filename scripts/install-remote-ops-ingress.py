"""Add the independent /control entry to the existing managed Jarvis host."""
import os
import json
from pathlib import Path
import re
import subprocess

file=Path('/etc/nginx/sites-available/cc-jarvis.ikvein.com');old=file.read_text()
if not old.startswith('# Managed Jarvis domain ingress'):raise RuntimeError('Unmanaged domain config')
if 'location ^~ /control/' not in old:
    auth=re.search(r'        proxy_set_header Authorization "Basic [^"]+";',old)
    if not auth:raise RuntimeError('Existing fixed edge gate absent')
    block='''    location ^~ /control/ {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host cc-jarvis-control.ikvein.com;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
AUTH
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 70s;
        client_max_body_size 32k;
    }
'''.replace('AUTH',auth.group(0))
    updated=old.replace('    location / {',block+'    location / {',1)
    backup=Path('/var/backups/jarvis-domain-access/pre-independent-control.conf')
    if not backup.exists():backup.write_text(old);os.chmod(backup,0o600)
    temp=file.with_suffix('.next');temp.write_text(updated);os.chmod(temp,0o600);os.replace(temp,file)
    if subprocess.run(['nginx','-t'],capture_output=True).returncode:
        file.write_text(old);os.chmod(file,0o600);raise RuntimeError('Nginx test failed; restored site')
    subprocess.run(['systemctl','reload','nginx.service'],check=True)
print(json.dumps({'path':'/control/','independentUpstream':True,'https':True,'normalPlatformRouteRetained':True}))
