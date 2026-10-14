"""Install a dedicated domain tunnel from authenticated maintenance input p."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess

node = json.loads(Path('/etc/jarvis/node.json').read_text())
if node['nodeId'] != p['nodeId'] or node['role'] != ('primary' if p['nodeId'] == '112' else 'standby'):
    raise RuntimeError('Node role differs; ingress not changed')
name = 'jarvis-ingress'
try:
    user = pwd.getpwnam(name)
except KeyError:
    subprocess.run(['useradd', '--system', '--user-group', '--home-dir', '/nonexistent', '--no-create-home', '--shell', '/usr/sbin/nologin', name], check=True)
    user = pwd.getpwnam(name)
if user.pw_uid == 0 or user.pw_shell != '/usr/sbin/nologin':
    raise RuntimeError('Ingress identity differs')
directory = Path('/opt/jarvis-frpc')
directory.mkdir(mode=0o755, exist_ok=True)
conf = Path('/etc/jarvis-frpc')
conf.mkdir(mode=0o750, exist_ok=True)
os.chown(conf, 0, user.pw_gid)
os.chmod(conf, 0o750)
backup = Path('/var/lib/jarvis-control/pre-domain-access')
backup.mkdir(parents=True, mode=0o700, exist_ok=True)
os.chmod(backup, 0o700)
dropdir = Path('/etc/systemd/system/jarvis-platform.service.d')
dropdir.mkdir(mode=0o755, exist_ok=True)
drop = dropdir / '30-domain-access.conf'
unitpath = Path('/etc/systemd/system/jarvis-frpc.service')
configpath = conf / 'frpc.toml'
for old in [drop, unitpath, configpath, conf / 'allowed-hosts.env']:
    saved = backup / old.name
    if old.exists() and not saved.exists():
        shutil.copy2(old, saved)
        os.chmod(saved, 0o600)
binary = Path(p['upload'])
if hashlib.sha256(binary.read_bytes()).hexdigest() != p['binarySHA256']:
    raise RuntimeError('Tunnel binary checksum differs')
installed = directory / 'frpc'
# Replace through a new inode so rerunning does not truncate an executing binary.
if not installed.exists() or hashlib.sha256(installed.read_bytes()).hexdigest() != p['binarySHA256']:
    next_binary = directory / 'frpc.next'
    shutil.copyfile(binary, next_binary)
    os.chown(next_binary, 0, 0)
    os.chmod(next_binary, 0o755)
    os.replace(next_binary, installed)
os.chown(installed, 0, 0)
os.chmod(installed, 0o755)
def quoted(value):
    return json.dumps(value, ensure_ascii=False)
contents = '# Managed Jarvis domain ingress; keep this file private.\n'
contents += 'serverAddr = '+quoted(p['serverAddr'])+'\nserverPort = '+str(p['serverPort'])+'\n'
contents += 'user = "jarvis"\nauth.method = "token"\nauth.token = '+quoted(p['token'])+'\ntransport.tls.enable = true\n'
contents += '\n[[proxies]]\nname = "platform"\ntype = "http"\nsubdomain = '+quoted(p['domain'].split('.')[0])+'\n'
contents += 'httpUser = '+quoted(p['edgeUser'])+'\nhttpPassword = '+quoted(p['edgePassword'])+'\n'
contents += '\n[proxies.plugin]\ntype = "http2https"\nlocalAddr = "127.0.0.1:3140"\n'
if Path('/etc/jarvis-control/policy.json').is_file():
    contents += '\n[[proxies]]\nname = "control"\ntype = "http"\nsubdomain = '+quoted(p['domain'].split('.')[0]+'-control')+'\n'
    contents += 'httpUser = '+quoted(p['edgeUser'])+'\nhttpPassword = '+quoted(p['edgePassword'])+'\n'
    contents += '\n[proxies.plugin]\ntype = "http2https"\nlocalAddr = "127.0.0.1:3142"\n'
temp = conf / 'frpc.next.toml'
temp.write_text(contents)
os.chown(temp, 0, user.pw_gid)
os.chmod(temp, 0o640)
verify = subprocess.run([str(directory/'frpc'), 'verify', '-c', str(temp)], capture_output=True, timeout=10)
if verify.returncode:
    temp.unlink()
    raise RuntimeError('Tunnel configuration verification failed')
os.replace(temp, configpath)
guard = directory / 'require-primary.py'
guard.write_text("import json,sys\nfrom pathlib import Path\nn=json.loads(Path('/etc/jarvis/node.json').read_text())\nif n.get('role')!='primary':sys.exit('Domain tunnel can start only on the primary node')\n")
os.chmod(guard, 0o755)
# Add the domain to existing host validation without allowing arbitrary hosts.
hosts = [p['address'], '127.0.0.1', 'localhost', p['domain']]
allowed = conf / 'allowed-hosts.env'
allowed.write_text('JARVIS_ALLOWED_HOSTS='+','.join(hosts)+'\n')
os.chown(allowed, 0, user.pw_gid)
os.chmod(allowed, 0o640)
drop.write_text('[Service]\nEnvironmentFile=/etc/jarvis-frpc/allowed-hosts.env\n')
os.chmod(drop, 0o644)
unit = '''[Unit]
Description=Jarvis dedicated domain tunnel
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=jarvis-ingress
Group=jarvis-ingress
WorkingDirectory=/opt/jarvis-frpc
ExecStartPre=+/usr/bin/python3 /opt/jarvis-frpc/require-primary.py
ExecStart=/opt/jarvis-frpc/frpc -c /etc/jarvis-frpc/frpc.toml
Restart=on-failure
RestartSec=10
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
MemoryMax=96M
TasksMax=64
UMask=0077
[Install]
WantedBy=multi-user.target
'''
unitpath.write_text(unit)
os.chmod(unitpath, 0o644)
check = subprocess.run(['systemd-analyze', 'verify', str(unitpath)], capture_output=True, timeout=15)
if check.returncode:
    raise RuntimeError('Tunnel service verification failed')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
if p['nodeId'] == '112':
    subprocess.run(['systemctl', 'restart', 'jarvis-platform.service'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'jarvis-frpc.service'], check=True, stdout=subprocess.DEVNULL)
else:
    subprocess.run(['systemctl', 'disable', '--now', 'jarvis-frpc.service'], check=True, stdout=subprocess.DEVNULL)
print(json.dumps({'node': p['nodeId'], 'domain': p['domain'], 'binarySHA256': p['binarySHA256'], 'tunnelEnabled': p['nodeId']=='112', 'standbyKeptStopped': p['nodeId']=='101', 'dedicatedAccount': name}))
