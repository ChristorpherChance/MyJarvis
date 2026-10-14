import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {lanProfile,remote,python,withPlatform} from './managed-server-client.mjs';

if(!process.argv.includes('--execute'))throw Error('Use --execute to install the project-scoped receipt observer');
const projectId='70ec346f-6520-46ed-abed-22cac770a3e4',machineId='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',source=resolve('scripts/software-factory-usage-observer.mjs'),bytes=await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex');
await withPlatform(async({api})=>{const h=await api('/api/health');if(!/^20261010-factory-usage-r18(?:-1)?$/.test(h.build))throw Error('NEW_USAGE_PROTOCOL_NOT_ACTIVE');const p=await api('/api/v1/projects/'+projectId);if(!p.data?.copies?.some(c=>c.machineId===machineId&&c.path==='/home/superopen/All-Projects/msf'))throw Error('PROJECT_SOURCE_NOT_BOUND');});
const upload='/home/superopen/jarvis-msf-usage-observer.mjs';
const sftp=spawnSync('sftp',['-F',lanProfile,'-b','-','jarvis-101'],{input:`put "${source.replaceAll('\\','/')}" "${upload}"\n`,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:200000});if(sftp.status!==0)throw Error('OBSERVER_UPLOAD_FAILED');
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({sha256,projectId,machineId,upload},`import os,json,hashlib,subprocess,pwd,tempfile
from pathlib import Path
config=Path('/var/lib/jarvis-development/101/config.json')
c=json.loads(config.read_text())
if c.get('machineId')!=p['machineId'] or not c.get('agentId') or not c.get('privateKey'):raise RuntimeError('DEVELOPMENT_NODE_NOT_PAIRED')
if not any(t.get('engine')=='claude' for t in c.get('templates',[])):raise RuntimeError('CLAUDE_TEMPLATE_NOT_BOUND')
source=Path(p['upload'])
if hashlib.sha256(source.read_bytes()).hexdigest()!=p['sha256']:raise RuntimeError('OBSERVER_UPLOAD_HASH')
target=Path('/opt/jarvis-development/101/software-factory-usage-observer.mjs')
target.parent.mkdir(parents=True,exist_ok=True)
fd,temporary=tempfile.mkstemp(prefix='.usage-observer-',dir=target.parent)
try:
 with os.fdopen(fd,'wb') as out:
  out.write(source.read_bytes());out.flush();os.fsync(out.fileno())
 os.chmod(temporary,0o644);os.replace(temporary,target)
finally:
 if os.path.exists(temporary):os.unlink(temporary)
state=Path('/var/lib/jarvis-development/101/usage')
state.mkdir(mode=0o700,exist_ok=True)
user=pwd.getpwnam('superopen');os.chown(state,user.pw_uid,user.pw_gid)
service='''[Unit]
Description=Jarvis software factory project token receipt observer
After=network-online.target jarvis-software-factory-development.service
Wants=network-online.target

[Service]
Type=oneshot
User=superopen
Group=superopen
Environment=HOME=/home/superopen
Environment=NODE_EXTRA_CA_CERTS=/opt/jarvis-development/software-factory/central-ca.crt
WorkingDirectory=/home/superopen/All-Projects/msf
ExecStart=/opt/jarvis-development/node/bin/node /opt/jarvis-development/101/software-factory-usage-observer.mjs --config /var/lib/jarvis-development/101/config.json --project-id '''+p['projectId']+''' --workspace /home/superopen/All-Projects/msf --receipts /home/superopen/.claude/projects/-home-superopen-All-Projects-msf --state /var/lib/jarvis-development/101/usage/receipts.json
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/jarvis-development/101/usage
UMask=0077
CPUQuota=20%
MemoryMax=256M
TimeoutStartSec=240
'''
timer='''[Unit]
Description=Collect project-scoped actual Claude receipts every two minutes

[Timer]
OnBootSec=90s
OnUnitInactiveSec=120s
AccuracySec=10s
Unit=jarvis-msf-usage.service

[Install]
WantedBy=timers.target
'''
Path('/etc/systemd/system/jarvis-msf-usage.service').write_text(service)
Path('/etc/systemd/system/jarvis-msf-usage.timer').write_text(timer)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','jarvis-msf-usage.timer'],check=True,capture_output=True)
subprocess.run(['systemctl','start','--no-block','jarvis-msf-usage.service'],check=True,capture_output=True)
print(json.dumps({'installed':True,'projectId':p['projectId'],'machineId':p['machineId'],'sourceSHA256':p['sha256'],'timer':'jarvis-msf-usage.timer','cadenceSeconds':120,'started':True,'transcriptsUploaded':False}))
`),true));
await mkdir('artifacts/software-factory',{recursive:true});await writeFile('artifacts/software-factory/usage-observer-install.json',JSON.stringify({...result,at:new Date().toISOString()},null,2));console.log(JSON.stringify(result));
