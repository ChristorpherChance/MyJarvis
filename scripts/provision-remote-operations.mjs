/** Provision isolated fixed ops accounts; private SSH material stays on controllers. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadPlan} from './managed-server-plan.mjs';
import {remote,python,lanProfile,cloudProfile} from './managed-server-client.mjs';
const plan=await loadPlan(),onboarding=JSON.parse(await readFile('artifacts/managed-servers/onboarding.json','utf8')),out='artifacts/remote-operations';await mkdir(out,{recursive:true});
const protectedUnits=new Set(['ssh.service','nginx.service','frps.service','frpc.service','jarvis-frpc.service','jarvis-observer.service','jarvis-cloud-relay.service','jarvis-control.service','wg-quick@wg0.service','danted.service','tinyproxy.service']);
const nodes=plan.servers.map(s=>{const n=onboarding.nodes.find(n=>n.id===s.id);if(!n)throw Error('NODE_NOT_ONBOARDED');return {nodeId:s.id,machineId:n.machineId,name:s.name,address:s.host,port:s.port,alias:'ops-'+s.id,services:n.services.map(b=>({id:b.serviceId,unit:b.unit,name:s.services.find(x=>x.unit===b.unit).name,expected:b.expected,controllable:!protectedUnits.has(b.unit)}))};});
const keys=[];
for(const id of ['112','101'])keys.push(JSON.parse(remote(lanProfile,'jarvis-'+id,python({id,ids:nodes.map(n=>n.nodeId)},`import os,pwd,subprocess
from pathlib import Path
name='jarvis-control';home='/var/lib/jarvis-ops-controller'
try:u=pwd.getpwnam(name)
except KeyError:
 subprocess.run(['useradd','--system','--user-group','--home-dir',home,'--create-home','--shell','/usr/sbin/nologin',name],check=True);u=pwd.getpwnam(name)
if u.pw_uid==0 or u.pw_dir!=home:raise RuntimeError('Controller identity differs')
d=Path(home);d.mkdir(exist_ok=True);os.chown(d,u.pw_uid,u.pw_gid);os.chmod(d,0o700)
ssh=d/'.ssh';ssh.mkdir(exist_ok=True);os.chown(ssh,u.pw_uid,u.pw_gid);os.chmod(ssh,0o700)
public={}
for id in p['ids']:
 key=ssh/('id_ed25519_'+id)
 if not key.exists():subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(key),'-C','jarvis-fixed-control-'+p['id']+'-'+id],check=True)
 os.chown(key,u.pw_uid,u.pw_gid);os.chmod(key,0o400);public[id]=key.with_suffix('.pub').read_text().strip()
print(json.dumps({'controller':p['id'],'public':public}))
`),true)));
const installed=[],nodeCode=await readFile('scripts/install-remote-ops-node.py','utf8'),dispatcher=await readFile('scripts/remote-ops-dispatcher.py','utf8');
for(const s of plan.servers){const n=nodes.find(n=>n.nodeId===s.id);const r=JSON.parse(remote(s.profile,'jarvis-'+s.id,python({...n,id:s.id,hostname:s.hostname,sshPublic:keys.map(k=>k.public[s.id]),code:dispatcher},nodeCode),s.user!=='root'));installed.push(r);console.log(JSON.stringify({phase:'fixed-ops-node-installed',...r}));}
const known=[...new Set((await Promise.all(['artifacts/server-access/lenovo/known_hosts','artifacts/server-access/cloud-lenovo/known_hosts'].map(f=>readFile(f,'utf8')))).flatMap(s=>s.split(/\r?\n/)).filter(Boolean))].join('\n')+'\n';
const controllers=[],installer=await readFile('scripts/install-remote-ops-controller.py','utf8'),code=await readFile('scripts/remote-ops-controller.mjs','utf8');
for(const id of ['101','112']){const r=JSON.parse(remote(lanProfile,'jarvis-'+id,python({nodeId:id,nodes,known,code},installer),true));controllers.push(r);console.log(JSON.stringify({phase:'independent-controller-installed',...r}));}
const ingress=JSON.parse(remote(cloudProfile,'jarvis-gz',await readFile('scripts/install-remote-ops-ingress.py','utf8'),true));
const report={at:new Date().toISOString(),nodes:installed,controllers,ingress,arbitraryCommandsEnabled:false,machineStartEnabled:false};await writeFile(out+'/provisioning.json',JSON.stringify(report,null,2));console.log(JSON.stringify({phase:'independent-ops-ready',nodes:nodes.length,ingress}));
