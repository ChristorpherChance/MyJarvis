"""Independent queue worker and HTTPS recovery entry; no platform DB access granted."""
import grp
import hashlib
import hmac
import os
from pathlib import Path
import pwd
import shutil
import subprocess

node=json.loads(Path('/etc/jarvis/node.json').read_text())
if node['nodeId']!=p['nodeId'] or node['role']!=('primary' if p['nodeId']=='112' else 'standby'):raise RuntimeError('Controller node role differs')
user=pwd.getpwnam('jarvis-control');app=pwd.getpwnam('jarvis')
try:read_group=grp.getgrnam('jarvis-ops-read')
except KeyError:subprocess.run(['groupadd','--system','jarvis-ops-read'],check=True);read_group=grp.getgrnam('jarvis-ops-read')
subprocess.run(['usermod','-aG','jarvis-ops-read','jarvis'],check=True)
if 'jarvis' in [grp.getgrgid(g).gr_name for g in os.getgrouplist(user.pw_name,user.pw_gid)]:raise RuntimeError('Controller must not join platform group')
queue=Path('/var/lib/jarvis-ops-queue');queue.mkdir(exist_ok=True);os.chown(queue,0,0);os.chmod(queue,0o755)
for name,uid,gid in [('requests',app.pw_uid,user.pw_gid),('results',user.pw_uid,read_group.gr_gid)]:
    d=queue/name;d.mkdir(exist_ok=True);os.chown(d,uid,gid);os.chmod(d,0o2750)
conf=Path('/etc/jarvis-control');conf.mkdir(exist_ok=True);os.chown(conf,0,0);os.chmod(conf,0o755)
code=Path('/opt/jarvis-control');code.mkdir(exist_ok=True);os.chown(code,0,0);os.chmod(code,0o755)
backup=Path('/var/lib/jarvis-control')/'before-remote-operations';backup.mkdir(mode=0o700,exist_ok=True)
def put(path,text,mode=0o640):
    path=Path(path);saved=backup/path.name
    if path.exists() and not saved.exists():shutil.copy2(path,saved);os.chmod(saved,0o600)
    temp=path.with_name(path.name+'.next');temp.write_text(text);os.chown(temp,0,user.pw_gid);os.chmod(temp,mode);os.replace(temp,path)
master=Path('/var/lib/jarvis/data/runtime/voice-master.key').read_bytes()
if len(master)!=32:raise RuntimeError('Existing platform master key differs')
derived=hmac.new(master,b'jarvis-control-cookie-v1',hashlib.sha256).digest()
key=conf/'cookie.key';key.write_bytes(derived);os.chown(key,0,user.pw_gid);os.chmod(key,0o640)
for source,target,mode in [('/etc/jarvis/tls/server.key','server.key',0o640),('/etc/jarvis/tls/server.crt','server.crt',0o644),('/etc/jarvis/tls/ca.crt','ca.crt',0o644)]:
    shutil.copyfile(source,conf/target);os.chown(conf/target,0,user.pw_gid);os.chmod(conf/target,mode)
public_policy={'version':1,'nodes':[{k:n[k] for k in ['nodeId','machineId','name','address','services']} for n in p['nodes']]}
put(conf/'policy.json',json.dumps(public_policy),0o644)
put(conf/'known_hosts',p['known'])
lines=[]
for n in p['nodes']:
    lines.extend(['Host '+n['alias'],' HostName '+n['address'],' User jarvis-ops',' Port '+str(n['port']),' IdentityFile /var/lib/jarvis-ops-controller/.ssh/id_ed25519_'+n['nodeId'],' IdentitiesOnly yes',' StrictHostKeyChecking yes',' UserKnownHostsFile /etc/jarvis-control/known_hosts',' GlobalKnownHostsFile none',' UpdateHostKeys no',' HostKeyAlgorithms ssh-ed25519',' ConnectTimeout 5',' ConnectionAttempts 1',' ServerAliveInterval 5',' ServerAliveCountMax 1',''])
put(conf/'ssh_config','\n'.join(lines))
put(conf/'config.json',json.dumps({'version':1,'nodeId':p['nodeId'],'queue':str(queue),'state':'/var/lib/jarvis-ops-controller/jobs','sshConfig':str(conf/'ssh_config'),'cookieKey':str(key),'caPath':str(conf/'ca.crt'),'tlsKey':str(conf/'server.key'),'tlsCert':str(conf/'server.crt'),'port':3142,'listenHost':'0.0.0.0','allowedHosts':['127.0.0.1','localhost','192.168.10.'+p['nodeId'],'cc-jarvis.ikvein.com','cc-jarvis-control.ikvein.com'],'allowedOrigins':['https://cc-jarvis.ikvein.com','https://192.168.10.'+p['nodeId']+':3142','https://192.168.10.'+p['nodeId']+':3140'],'nodes':p['nodes'],'policyHash':hashlib.sha256(json.dumps(public_policy,sort_keys=True).encode()).hexdigest()}))
put(code/'controller.mjs',p['code'],0o755)
put(code/'require-primary.py',"import json,sys\nfrom pathlib import Path\nif json.loads(Path('/etc/jarvis/node.json').read_text()).get('role')!='primary':sys.exit('Independent controller only runs on the primary')\n",0o755)
if not (code/'node').exists():shutil.copyfile('/opt/jarvis/node/bin/node',code/'node');os.chmod(code/'node',0o755)
drop=Path('/etc/systemd/system/jarvis-platform.service.d/40-remote-operations.conf')
put(drop,'[Service]\nEnvironment="JARVIS_OPS_QUEUE=/var/lib/jarvis-ops-queue"\nEnvironment="JARVIS_OPS_CONFIG=/etc/jarvis-control/policy.json"\nReadWritePaths=/var/lib/jarvis-ops-queue/requests\n',0o644)
unit='''[Unit]
Description=Jarvis independent fixed remote operations
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=jarvis-control
Group=jarvis-control
ExecStartPre=+/usr/bin/python3 /opt/jarvis-control/require-primary.py
ExecStart=/opt/jarvis-control/node /opt/jarvis-control/controller.mjs --config /etc/jarvis-control/config.json
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/jarvis-ops-controller /var/lib/jarvis-ops-queue/results
MemoryMax=192M
TasksMax=64
UMask=0077
[Install]
WantedBy=multi-user.target
'''
put('/etc/systemd/system/jarvis-control.service',unit,0o644)
# FRPC also serves the recovery entry, so it must survive a stopped main platform.
frpc=Path('/etc/systemd/system/jarvis-frpc.service');text=frpc.read_text()
text='\n'.join(line for line in text.splitlines() if not line.startswith(('BindsTo=jarvis-platform','PartOf=jarvis-platform')))+'\n'
put(frpc,text,0o644)
import tomllib
frp=Path('/etc/jarvis-frpc/frpc.toml');c=tomllib.loads(frp.read_text());main=c['proxies'][0]
if not any(r.get('subdomain')=='cc-jarvis-control' for r in c['proxies']):
    added='\n[[proxies]]\nname="control"\ntype="http"\nsubdomain="cc-jarvis-control"\nhttpUser='+json.dumps(main['httpUser'])+'\nhttpPassword='+json.dumps(main['httpPassword'])+'\n[proxies.plugin]\ntype="http2https"\nlocalAddr="127.0.0.1:3142"\n'
    put(frp,frp.read_text()+added);ingress=pwd.getpwnam('jarvis-ingress');os.chown(frp,0,ingress.pw_gid)
if subprocess.run(['/opt/jarvis-frpc/frpc','verify','-c',str(frp)],capture_output=True).returncode:raise RuntimeError('Recovery tunnel config invalid')
subprocess.run(['systemctl','daemon-reload'],check=True)
if p['nodeId']=='112':
    subprocess.run(['systemctl','enable','--now','jarvis-control.service'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['systemctl','restart','jarvis-control.service','jarvis-frpc.service'],check=True)
else:subprocess.run(['systemctl','disable','--now','jarvis-control.service'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'node':p['nodeId'],'independentController':p['nodeId']=='112','coldControllerStopped':p['nodeId']=='101','port':3142,'fixedPeers':len(p['nodes']),'platformDataPermissionGranted':False}))
