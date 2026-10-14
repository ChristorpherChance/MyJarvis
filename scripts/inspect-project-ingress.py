"""Read only public ingress mappings from the registered frpc config."""
import configparser
import json
from pathlib import Path
import re
import subprocess
import tomllib

result = subprocess.run(['systemctl', 'show', 'frpc.service', '--property=ExecStart', '--value'], capture_output=True, text=True, timeout=5)
match = re.search(r'(?:-c|--config)[ =]+([^ ;}]+)', result.stdout)
routes = []
if match:
    file = Path(match.group(1))
    if file.suffix == '.toml':
        config = tomllib.loads(file.read_text())
        entries = config.get('proxies', [])
    elif file.suffix == '.ini':
        config = configparser.ConfigParser(interpolation=None)
        config.read(file)
        entries = [dict(config[section]) for section in config.sections() if section != 'common']
    else:
        entries = []
    for entry in entries:
        port = entry.get('localPort', entry.get('local_port'))
        domains = entry.get('customDomains', entry.get('custom_domains', []))
        if isinstance(domains, str):
            domains = domains.split(',')
        routes.append({'port': int(port) if port else None, 'type': entry.get('type'), 'domains': domains, 'subdomain': entry.get('subdomain'), 'remotePort': entry.get('remotePort', entry.get('remote_port'))})
print(json.dumps({'routes': routes}))
