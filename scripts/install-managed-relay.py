"""Atomic additive relay configuration. Credentials stay on the primary."""
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import time

user = pwd.getpwnam('jarvis-cloud-relay')
conf = Path('/etc/jarvis-cloud-relay')
conf.mkdir(exist_ok=True)
os.chown(conf, 0, user.pw_gid)
os.chmod(conf, 0o750)
backup = Path('/var/lib/jarvis-control/monitoring-backups') / time.strftime('%Y%m%d-%H%M%S')
backup.mkdir(parents=True, mode=0o700)
for name in ['config.json', 'known_hosts', 'ssh_config']:
    file = conf / name
    if file.exists():
        shutil.copy2(file, backup / name)
        os.chmod(backup / name, 0o600)


def write(name, text, mode=0o640):
    temp = conf / (name + '.installing')
    temp.write_text(text)
    os.chown(temp, 0, user.pw_gid)
    os.chmod(temp, mode)
    os.replace(temp, conf / name)


existing = json.loads((conf / 'config.json').read_text()) if (conf / 'config.json').exists() else {}
peers = {peer['id']: peer for peer in existing.get('peers', [])}
for peer in p['peers']:
    old = peers.get(peer['id'])
    if old and (old['machineId'] != peer['machineId'] or old['agentId'] != peer['agentId'] or old['publicKey'] != peer['publicKey']):
        raise RuntimeError('Existing relay identity differs; explicit repair required')
    peers[peer['id']] = peer
servers = {s['id']: s for s in p['servers']}
for id, peer in peers.items():
    if id not in servers:
        if peer.get('monitorType') != 'qnap' or not peer.get('monitorUser') or not peer.get('host') or peer.get('port') != 22:
            raise RuntimeError('Plan must preserve existing monitored servers')
        # Retain separately provisioned NAS peers during ordinary server onboarding.
        servers[id] = {**peer, 'monitorUser': peer['monitorUser']}
known = set((conf / 'known_hosts').read_text().splitlines()) if (conf / 'known_hosts').exists() else set()
known.update(p['known'].splitlines())
write('known_hosts', '\n'.join(sorted(known)) + '\n')
shutil.copyfile('/etc/jarvis/tls/ca.crt', conf / 'ca.crt')
os.chmod(conf / 'ca.crt', 0o644)
lines = []
for id, peer in peers.items():
    server = servers[id]
    lines.extend(['Host ' + peer['alias'], ' HostName ' + server['host'], ' User ' + server.get('monitorUser', 'jarvis-monitor'),
                  ' Port ' + str(server['port']),
                  ' IdentityFile /var/lib/jarvis-cloud-relay/.ssh/id_ed25519_' + id,
                  ' IdentitiesOnly yes', ' StrictHostKeyChecking yes',
                  ' UserKnownHostsFile /etc/jarvis-cloud-relay/known_hosts', ' GlobalKnownHostsFile none',
                  ' UpdateHostKeys no', ' HostKeyAlgorithms ssh-ed25519', ' ConnectTimeout 5',
                  ' ConnectionAttempts 1', ' ServerAliveInterval 5', ' ServerAliveCountMax 1', ''])
write('ssh_config', '\n'.join(lines))
write('config.json', json.dumps({'version': 1, 'apiUrl': 'https://127.0.0.1:3140/',
                               'caPath': str(conf / 'ca.crt'), 'sshConfig': str(conf / 'ssh_config'),
                               'peers': list(peers.values())}))
code = Path('/opt/jarvis-cloud-relay')
code.mkdir(exist_ok=True)
os.chown(code, 0, 0)
os.chmod(code, 0o755)
if not (code / 'node').exists():
    shutil.copy2('/opt/jarvis/node/bin/node', code / 'node')
os.chown(code / 'node', 0, 0)
os.chmod(code / 'node', 0o755)
file = code / 'relay.mjs'
file.write_text(p['code'])
os.chown(file, 0, 0)
os.chmod(file, 0o755)
unit = Path('/etc/systemd/system/jarvis-cloud-relay.service')
unit.write_text('''[Unit]
Description=Jarvis read-only signed server monitoring
After=network-online.target jarvis-platform.service
Wants=network-online.target
[Service]
Type=simple
User=jarvis-cloud-relay
Group=jarvis-cloud-relay
ExecStart=/opt/jarvis-cloud-relay/node /opt/jarvis-cloud-relay/relay.mjs --config /etc/jarvis-cloud-relay/config.json
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/jarvis-cloud-relay
MemoryMax=128M
UMask=0077
[Install]
WantedBy=multi-user.target
''')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'jarvis-cloud-relay.service'], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(['systemctl', 'restart', 'jarvis-cloud-relay.service'], check=True)
print(json.dumps({'relay': 'started', 'peerCount': len(peers), 'backup': str(backup)}))
