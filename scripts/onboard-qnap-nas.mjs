/** Two-phase QTS onboarding: pinned password bootstrap, then forced read-only SSH. */
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {primary,python,withPlatform} from './managed-server-client.mjs';
import {loadPlan} from './managed-server-plan.mjs';
import {validateEnvelope} from './cloud-node-relay.mjs';

const out='artifacts/nas-onboarding',phase=process.argv[2]??'prepare';await mkdir(out,{recursive:true});
const shellQuote=s=>"'"+String(s).replaceAll("'","'\\''")+"'";
const bootstrapPython=resolve(process.env.USERPROFILE,'.jarvis-deployment/MyJevis/cloud-tools/Scripts/python.exe');
function nas(script,elevated=false){const r=spawnSync(bootstrapPython,['scripts/connect-qnap-nas.py',script,...(elevated?['--sudo']:[])],{encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:256000});if(r.status!==0)throw Error('NAS_BOOTSTRAP_FAILED');return r.stdout.trim();}
function uuid(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('INVALID_NAS_ID');return id;}
const preflight=JSON.parse(await readFile(out+'/preflight.json','utf8'));
const privatePath=resolve('.secrets/nas-connection.json'),privateText=await readFile(privatePath,'utf8'),login=JSON.parse(privateText);
if(login.host!==preflight.host||login.sshPort!==22||login.managementUrl!==preflight.managementUrl||!/^[a-z_][a-z0-9_-]{0,31}$/.test(login.username)||!login.password)throw Error('NAS_LOGIN_CONFIGURATION_CHANGED');

if(phase==='prepare'){
 const inspection=nas('scripts/inspect-qnap-nas.sh');await writeFile(out+'/inspection.txt',inspection+'\n');
 const cpu=inspection.match(/model name\s*:\s*([^\r\n]+)/)?.[1]?.trim(),ram=Number(inspection.match(/MemTotal:\s*(\d+)/)?.[1])/1024**2;
 if(!cpu||!Number.isFinite(ram)||ram<=0||!inspection.includes('NAS9527')||!inspection.includes('Version=5.2.6'))throw Error('NAS_HARDWARE_PREFLIGHT_INVALID');
 const volumes=[...inspection.matchAll(/^\/dev\/mapper\/cachedev(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(\/share\/CACHEDEV\d+_DATA)\s*$/gm)].map(m=>({id:Number(m[1]),totalGB:Number(m[2])/1024**2,usedGB:Number(m[3])/1024**2,freeGB:Number(m[4])/1024**2,mount:m[5]}));
 if(volumes.length!==4)throw Error('NAS_DATA_VOLUMES_CHANGED');
 const total=volumes.reduce((n,v)=>n+v.totalGB,0),prior=JSON.parse(await readFile(out+'/onboarding.json','utf8').catch(()=>'{"status":"new"}'));
 await withPlatform(async({api,records,command})=>{
  const matches=(await records('machines')).filter(m=>m.address===login.host);if(matches.length>1)throw Error('DUPLICATE_NAS_MACHINE');
  const body={name:'120 · 威联通 NAS',role:'家庭资料、知识原件与备份存储；数据卷与系统资源监管',category:'storage',cpu:'4线程 '+cpu,ram:Math.round(ram*1000)/1000,disk:`4个数据卷 · ${Math.round(total/1024*100)/100} TiB 逻辑容量`,gpu:'未采样',os:'QTS 5.2.6.3195 · TS-453Dmini',address:login.host,room:'家庭存储',always:true,readOnly:false};
  let machine=matches[0];if(!machine)machine=await command('machines','register',body);else if(Object.entries(body).some(([k,v])=>machine[k]!==v))machine=await command('machines','update',{machineId:machine.id,...body},machine.revision);
  const key=primary(`import pwd,os,subprocess
from pathlib import Path
u=pwd.getpwnam('jarvis-cloud-relay');d=Path(u.pw_dir)/'.ssh';f=d/'id_ed25519_nas'
if not f.exists():subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(f),'-C','jarvis-112-readonly-nas'],check=True)
os.chown(f,u.pw_uid,u.pw_gid);os.chmod(f,0o400)
print(f.with_suffix('.pub').read_text().strip())
`);
  if(!/^ssh-ed25519 [A-Za-z0-9+/=]+ [A-Za-z0-9-]+$/.test(key))throw Error('NAS_MONITOR_PUBLIC_KEY_INVALID');
  const line='restrict,from="192.168.10.112",command="/bin/sh /etc/config/jarvis-nas/collector.sh" '+key;
  const collector=await readFile('scripts/qnap-node-collector.sh','utf8');if(collector.includes('JARVIS_COLLECTOR_EOF'))throw Error('HEREDOC_COLLISION');
  const install=`#!/bin/sh
set -eu
export LC_ALL=C
umask 077
test "$(id -u)" = 0
test "$(hostname)" = NAS9527
test "$(/sbin/getcfg System Model -f /etc/config/uLinux.conf)" = TS-X53D
d=/etc/config/jarvis-nas
test ! -L "$d"
mkdir -p "$d" "$d/tmp" "$d/backups"
chown 0:0 "$d" "$d/backups"; chmod 750 "$d"; chmod 700 "$d/backups"
uid=$(id -u ${shellQuote(login.username)})
test "$uid" != 0
chown "$uid":0 "$d/tmp"; chmod 700 "$d/tmp"
if test -f "$d/node.conf"; then
 . "$d/node.conf"
 test "$MACHINE_ID" = ${shellQuote(uuid(machine.id))}
else
 AGENT_ID=pending
fi
saved="$d/backups/$(date -u +%Y%m%d-%H%M%S)"
mkdir "$saved"; chmod 700 "$saved"
for prior in collector.sh node.conf; do if test -f "$d/$prior"; then cp "$d/$prior" "$saved/$prior"; fi; done
if test -L "$d/signing.key"; then exit 2; fi
if test ! -f "$d/signing.key"; then openssl genpkey -algorithm ED25519 -out "$d/signing.key"; fi
chown "$uid":0 "$d/signing.key"; chmod 400 "$d/signing.key"
cat > "$d/collector.sh.next" <<'JARVIS_COLLECTOR_EOF'
${collector}
JARVIS_COLLECTOR_EOF
chown 0:0 "$d/collector.sh.next"; chmod 755 "$d/collector.sh.next"; mv "$d/collector.sh.next" "$d/collector.sh"
printf "MACHINE_ID='%s'\\nAGENT_ID='%s'\\nMODEL='TS-453Dmini'\\n" ${shellQuote(machine.id)} "$AGENT_ID" > "$d/node.conf.next"
chown 0:0 "$d/node.conf.next"; chmod 644 "$d/node.conf.next"; mv "$d/node.conf.next" "$d/node.conf"
home=${shellQuote('/share/homes/'+login.username)}
test -d "$home"
test ! -L "$home/.ssh"
mkdir -p "$home/.ssh"
test ! -L "$home/.ssh/authorized_keys"
if test -f "$home/.ssh/authorized_keys"; then cp "$home/.ssh/authorized_keys" "$saved/authorized_keys"; fi
if test -f "$home/.ssh/authorized_keys" && grep -F ${shellQuote(key)} "$home/.ssh/authorized_keys" >/dev/null; then
 test "$(grep -F ${shellQuote(key)} "$home/.ssh/authorized_keys")" = ${shellQuote(line)}
else
 printf '\\n%s\\n' ${shellQuote(line)} >> "$home/.ssh/authorized_keys"
fi
chown "$uid":0 "$home/.ssh" "$home/.ssh/authorized_keys"
chmod 700 "$home/.ssh"; chmod 600 "$home/.ssh/authorized_keys"
printf 'AGENT_ID=%s\\n' "$AGENT_ID"
openssl pkey -in "$d/signing.key" -pubout
`;
  await writeFile(out+'/install-monitor.sh',install);const saved=nas(out+'/install-monitor.sh',true),publicKey=saved.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/)?.[0]+'\n',savedId=saved.match(/^AGENT_ID=([^\r\n]+)/m)?.[1];
  if(!publicKey.startsWith('-----BEGIN PUBLIC KEY-----'))throw Error('NAS_SIGNING_KEY_INVALID');
  if(prior.publicKey&&prior.publicKey!==publicKey)throw Error('NAS_SIGNING_IDENTITY_CHANGED');
  const agents=(await api('/api/v1/execution/agents')).data;let agent=agents.find(a=>a.id===savedId&&a.machineId===machine.id&&!a.revoked);
  if(!agent&&prior.agentId)agent=agents.find(a=>a.id===prior.agentId&&a.machineId===machine.id&&!a.revoked);
  if(agent&&(agent.capabilities.length!==1||agent.capabilities[0]!=='telemetry'))throw Error('NAS_AGENT_PERMISSION_CHANGED');
  if(!agent){const ticket=(await api('/api/v1/execution/tickets',{machineId:machine.id,capabilities:['telemetry'],ttlSec:300})).data;agent=(await api('/api/v1/agents/pair',{ticket:ticket.ticket,publicKey})).data;}
  const agentId=uuid(agent.id??agent.agentId);
  const report={...preflight,status:'prepared',machineId:machine.id,agentId,publicKey,monitorUser:login.username,permissions:['telemetry'],cpu,ramGB:ram,volumes,readOnlyCollector:true,preparedAt:new Date().toISOString()};await writeFile(out+'/onboarding.json',JSON.stringify(report,null,2));
  await writeFile(out+'/finish-pairing.sh',`#!/bin/sh\nset -eu\n. /etc/config/jarvis-nas/node.conf\ntest "$MACHINE_ID" = ${shellQuote(machine.id)}\nprintf "MACHINE_ID='%s'\\nAGENT_ID='%s'\\nMODEL='TS-453Dmini'\\n" ${shellQuote(machine.id)} ${shellQuote(agentId)} > /etc/config/jarvis-nas/node.conf.next\nchown 0:0 /etc/config/jarvis-nas/node.conf.next\nchmod 644 /etc/config/jarvis-nas/node.conf.next\nmv /etc/config/jarvis-nas/node.conf.next /etc/config/jarvis-nas/node.conf\nprintf 'PAIRED\\n'\n`);nas(out+'/finish-pairing.sh',true);
  const sample=JSON.parse(nas('scripts/qnap-node-collector.sh'));validateEnvelope({agentId,machineId:machine.id,publicKey},sample);await writeFile(out+'/signed-snapshot.json',JSON.stringify(sample,null,2));
  console.log(JSON.stringify({status:'prepared',machineId:machine.id,agentId,signatureValid:true,volumes:sample.body.storage.volumes.length,disks:sample.body.storage.disks.length,metrics:sample.body.metrics}));
 });
}else if(phase==='activate'){
 const saved=JSON.parse(await readFile(out+'/onboarding.json','utf8'));const plan=await loadPlan();
 const peer={id:'nas',alias:'node-nas',host:login.host,port:22,monitorType:'qnap',monitorUser:login.username,machineId:saved.machineId,agentId:saved.agentId,publicKey:saved.publicKey};
 const relay=JSON.parse(primary(python({peers:[peer],servers:[...plan.servers,{id:'nas',host:login.host,port:22,monitorUser:login.username}],known:await readFile(out+'/known_hosts','utf8'),code:await readFile('scripts/cloud-node-relay.mjs','utf8')},await readFile('scripts/install-managed-relay.py','utf8'))));
 await withPlatform(async({api})=>{
  const applications=(await api('/api/runtime/applications?machineId='+saved.machineId+'&limit=100')).items;
  let app=applications.find(a=>a.name==='QTS 管理入口');
  if(!app){const created=await api('/api/runtime/applications',{commandId:randomUUID(),expectedVersion:0,data:{name:'QTS 管理入口',description:'威联通 NAS 管理页面与登录入口',machineId:saved.machineId,url:login.managementUrl,loginUrl:login.managementUrl,notes:'入口探测确认登录页的HTTP响应；真实资源见设备详情。管理页采用NAS自签HTTPS证书。',health:{enabled:true,url:'http://192.168.10.120:8080/cgi-bin/authLogin.cgi',expectedStatus:200,intervalSec:60,timeoutSec:5}}});app=await api('/api/runtime/applications/'+created.id);}
  const changed=await api('/api/runtime/applications/'+app.id+'/credentials',{commandId:randomUUID(),expectedVersion:app.revision,username:login.username,password:login.password});
  const verified=await api('/api/runtime/applications/'+app.id+'/credentials/reveal',{});if(verified.username!==login.username||verified.password!==login.password)throw Error('NAS_ENCRYPTED_CREDENTIAL_VERIFICATION_FAILED');
  const health=await api('/api/runtime/applications/'+app.id+'/check',{});
  Object.assign(saved,{status:'activated',applicationId:app.id,relay,health,credentialsEncrypted:true,activatedAt:new Date().toISOString()});await writeFile(out+'/onboarding.json',JSON.stringify(saved,null,2));
  if(createHash('sha256').update(await readFile(privatePath,'utf8')).digest('hex')!==createHash('sha256').update(privateText).digest('hex'))throw Error('PRIVATE_FILE_CHANGED_DURING_ONBOARDING');
  await unlink(privatePath);console.log(JSON.stringify({status:'activated',machineId:saved.machineId,applicationId:app.id,relayPeers:relay.peerCount,health:health.state,credentialsEncrypted:true,temporaryCredentialRemoved:true}));
 });
}else throw Error('Use prepare or activate');
