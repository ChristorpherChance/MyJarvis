import {readFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const worker=await readFile('apps/api/resources/voice/resident_voice.py','utf8');
console.log(primary(python({worker},`import os,pwd,subprocess,secrets,json
from pathlib import Path
account=pwd.getpwnam('jarvis');folder=Path('/var/lib/jarvis/voice-runtime');folder.mkdir(mode=0o700,exist_ok=True);os.chown(folder,account.pw_uid,account.pw_gid)
key=folder/'service-token';
if not key.exists():key.write_text(secrets.token_urlsafe(48))
key.chmod(0o600);os.chown(key,account.pw_uid,account.pw_gid)
empty=folder/'empty-keywords.txt';empty.write_text('');empty.chmod(0o600);os.chown(empty,account.pw_uid,account.pw_gid)
worker=Path('/opt/jarvis/resident_voice.py');worker.write_text(p['worker']);worker.chmod(0o750);os.chown(worker,0,account.pw_gid)
unit='''[Unit]
Description=Jarvis local resident CPU speech
After=network.target
[Service]
Type=simple
User=jarvis
Group=jarvis
ExecStart=/opt/jarvis/voice-venv/bin/python /opt/jarvis/resident_voice.py --models /var/lib/jarvis/voice-models --token-file /var/lib/jarvis/voice-runtime/service-token --threads 4
Restart=on-failure
RestartSec=3
WorkingDirectory=/var/lib/jarvis/voice-runtime
Environment=OMP_NUM_THREADS=2
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/jarvis/voice-runtime
MemoryMax=3G
CPUQuota=400%
TasksMax=64
LimitNOFILE=128
[Install]
WantedBy=multi-user.target
'''
Path('/etc/systemd/system/jarvis-voice.service').write_text(unit)
subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','jarvis-voice.service'],check=True);subprocess.run(['systemctl','restart','jarvis-voice.service'],check=True)
print(json.dumps({'installed':True,'service':'jarvis-voice','loopbackPort':3153}))
`)));
