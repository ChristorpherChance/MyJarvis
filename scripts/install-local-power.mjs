import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {createHash} from 'node:crypto';
const sampler=await readFile('scripts/local-power-sampler.py','utf8'),collector=await readFile('scripts/cloud-node-collector.py','utf8');
const results=[];
for(const id of ['101','112','116']){
 const result=JSON.parse(remote(lanProfile,'jarvis-'+id,python({sampler,collector},`import json,os,subprocess,time
from pathlib import Path
base=Path('/opt/jarvis-power');base.mkdir(mode=0o755,exist_ok=True)
target=base/'sampler.py';target.write_text(p['sampler']);os.chmod(target,0o644)
config=Path('/etc/jarvis-cloud-agent/node.json');value=json.loads(config.read_text());value['localPowerEnabled']=True
temp=config.with_suffix('.tmp');temp.write_text(json.dumps(value));os.chown(temp,config.stat().st_uid,config.stat().st_gid);os.chmod(temp,config.stat().st_mode&0o777);os.replace(temp,config)
# Preserve the collector's existing owner and its forced-command boundary.
collector=Path('/opt/jarvis-cloud-agent/collector.py')
if not collector.exists():raise RuntimeError('Collector installation path differs')
previous=collector.stat();temp=collector.with_suffix('.next');temp.write_text(p['collector']);os.chown(temp,previous.st_uid,previous.st_gid);os.chmod(temp,previous.st_mode&0o777);os.replace(temp,collector)
service='''[Unit]
Description=Jarvis read-only local CPU energy sampler
[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /opt/jarvis-power/sampler.py
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/jarvis-power-sampler
TimeoutStartSec=15
'''
directory=Path('/var/lib/jarvis-power-sampler');directory.mkdir(mode=0o755,exist_ok=True)
Path('/etc/systemd/system/jarvis-power-sampler.service').write_text(service)
Path('/etc/systemd/system/jarvis-power-sampler.timer').write_text('[Unit]\\nDescription=Jarvis CPU energy sampling\\n[Timer]\\nOnBootSec=15s\\nOnUnitActiveSec=10s\\nAccuracySec=1s\\n[Install]\\nWantedBy=timers.target\\n')
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','jarvis-power-sampler.timer'],check=True,capture_output=True)
subprocess.run(['systemctl','start','jarvis-power-sampler.service'],check=True)
print(json.dumps({'sample':json.loads((directory/'summary.json').read_text()),'timerActive':subprocess.run(['systemctl','is-active','--quiet','jarvis-power-sampler.timer']).returncode==0,'permissionsUnchanged':True}))
`),true));results.push({node:id,...result});
}
await mkdir('artifacts/power-gateway',{recursive:true});await writeFile('artifacts/power-gateway/installation.json',JSON.stringify({at:new Date().toISOString(),samplerSHA256:createHash('sha256').update(sampler).digest('hex'),results},null,2));console.log(JSON.stringify({installed:results.length,results}));
