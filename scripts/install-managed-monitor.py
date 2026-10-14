"""Called through authenticated administrator SSH with public provisioning inputs."""
import os
from pathlib import Path
import pwd
import subprocess
import shutil


def atomic(file, text, uid, gid, mode):
    temp = file.with_name(file.name + '.installing')
    temp.write_text(text)
    os.chown(temp, uid, gid)
    os.chmod(temp, mode)
    os.replace(temp, file)


name = 'jarvis-monitor'
home = Path('/var/lib/jarvis-cloud-agent')
try:
    user = pwd.getpwnam(name)
except KeyError:
    subprocess.run(['useradd', '--system', '--user-group', '--home-dir', str(home),
                    '--create-home', '--shell', '/bin/sh', name], check=True)
    user = pwd.getpwnam(name)
if user.pw_dir != str(home) or user.pw_uid == 0:
    raise RuntimeError('Monitoring account differs')
sudo = subprocess.run(['sudo', '-l', '-U', name], capture_output=True, text=True,
                      env={**os.environ, 'LC_ALL': 'C'})
if 'is not allowed to run sudo' not in sudo.stdout + sudo.stderr:
    raise RuntimeError('Monitoring account must have no sudo rights')
home.mkdir(exist_ok=True)
os.chown(home, 0, 0)
os.chmod(home, 0o755)
tmp = home / 'tmp'
tmp.mkdir(exist_ok=True)
os.chown(tmp, user.pw_uid, user.pw_gid)
os.chmod(tmp, 0o700)
conf = Path('/etc/jarvis-cloud-agent')
conf.mkdir(exist_ok=True)
os.chown(conf, 0, user.pw_gid)
os.chmod(conf, 0o750)
file = conf / 'node.json'
old = json.loads(file.read_text()) if file.exists() else {}
if old and old.get('machineId') != p['machineId']:
    raise RuntimeError('Existing monitoring machine differs')
ssh = home / '.ssh'
ssh.mkdir(exist_ok=True)
os.chown(ssh, 0, 0)
os.chmod(ssh, 0o755)
auth = ssh / 'authorized_keys'
line = 'restrict,command="/usr/bin/python3 /opt/jarvis-cloud-agent/collector.py" ' + p['sshPublic']
if auth.exists() and auth.read_text().strip() != line:
    raise RuntimeError('Existing monitoring SSH key differs')
code = Path('/opt/jarvis-cloud-agent')
code.mkdir(exist_ok=True)
os.chown(code, 0, 0)
os.chmod(code, 0o755)
backup = Path('/var/lib/jarvis-monitor-backups/20261007-application-console')
backup.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(backup.parent, 0o700)
os.chmod(backup, 0o700)
for prior in [code / 'collector.py', code / 'resource-sampler.py', file,
              Path('/etc/systemd/system/jarvis-project-sampler.service'),
              Path('/etc/systemd/system/jarvis-project-sampler.timer')]:
    saved = backup / prior.name
    if prior.exists() and not saved.exists():
        shutil.copy2(prior, saved)
        os.chmod(saved, 0o600)
atomic(code / 'collector.py', p['code'], 0, 0, 0o755)
if p.get('resourceCode'):
    atomic(code / 'resource-sampler.py', p['resourceCode'], 0, 0, 0o755)
    summary = Path('/var/lib/jarvis-project-sampler')
    summary.mkdir(exist_ok=True)
    os.chown(summary, 0, 0)
    os.chmod(summary, 0o755)
    unit = '''[Unit]
Description=Jarvis fixed project directory disk summary
After=local-fs.target
[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /opt/jarvis-cloud-agent/resource-sampler.py
Nice=19
IOSchedulingClass=idle
MemoryMax=96M
TimeoutStartSec=35
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=yes
PrivateNetwork=yes
ReadWritePaths=/var/lib/jarvis-project-sampler
'''
    timer = '''[Unit]
Description=Jarvis project directory disk sampling schedule
[Timer]
OnBootSec=20
OnUnitActiveSec=60
AccuracySec=5
[Install]
WantedBy=timers.target
'''
    atomic(Path('/etc/systemd/system/jarvis-project-sampler.service'), unit, 0, 0, 0o644)
    atomic(Path('/etc/systemd/system/jarvis-project-sampler.timer'), timer, 0, 0, 0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'jarvis-project-sampler.timer'], check=True, stdout=subprocess.DEVNULL)
key = home / 'signing.key'
if not key.exists():
    subprocess.run(['/usr/bin/openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(key)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
os.chown(key, user.pw_uid, user.pw_gid)
os.chmod(key, 0o400)
atomic(auth, line + '\n', 0, 0, 0o644)
atomic(file, json.dumps({'version': 1, 'machineId': p['machineId'],
                       'agentId': old.get('agentId'), 'services': p['services']}), 0, user.pw_gid, 0o640)
public = subprocess.run(['/usr/bin/openssl', 'pkey', '-in', str(key), '-pubout'],
                        capture_output=True, text=True, check=True).stdout
print(json.dumps({'publicKey': public, 'agentId': old.get('agentId')}))
