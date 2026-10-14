/** Add known servers to actual supervision; preserve existing identities and peers. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {remote,primary,python,withPlatform} from './managed-server-client.mjs';
import {loadPlan,verifyInspection} from './managed-server-plan.mjs';

const plan=await loadPlan();
const only=process.argv.find(v=>v.startsWith('--only='))?.slice(7).split(',');
if(only?.some(id=>!plan.servers.some(s=>s.id===id)))throw Error('UNKNOWN_MANAGED_SERVER');
const targets=plan.servers.filter(s=>!only||only.includes(s.id));
const out='artifacts/managed-servers';await mkdir(out,{recursive:true});
const inspectionCode=await readFile('scripts/inspect-managed-server.py','utf8');
const inspection=new Map();
// Inspect every requested host and every fixed unit before modifying any server.
for(const server of targets){
 const hardware=verifyInspection(server,JSON.parse(remote(resolve(server.profile),'jarvis-'+server.id,inspectionCode,server.user!=='root')));
 inspection.set(server.id,hardware);
 await writeFile(out+'/'+server.id+'-inspection.json',JSON.stringify(hardware,null,2));
 console.log(JSON.stringify({phase:'preflight',id:server.id,identityVerified:true,fixedUnits:server.services.length}));
}
if(process.argv.includes('--check'))process.exit(0);
const previous=JSON.parse(await readFile(out+'/onboarding.json','utf8').catch(()=>'{"nodes":[]}'));
const report={version:1,at:new Date().toISOString(),requestedNodes:targets.map(s=>s.id),nodes:previous.nodes.filter(n=>plan.servers.some(s=>s.id===n.id)&&!targets.some(s=>s.id===n.id)),newPublicPorts:[],permissions:['telemetry','service-status'],executionAuthorized:false};
await withPlatform(async({api,records,command})=>{
 const relayPublic=JSON.parse(primary(python({ids:targets.map(s=>s.id)},`import os,pwd,subprocess
from pathlib import Path
name='jarvis-cloud-relay'
try:u=pwd.getpwnam(name)
except KeyError:
 subprocess.run(['useradd','--system','--user-group','--home-dir','/var/lib/jarvis-cloud-relay','--create-home','--shell','/usr/sbin/nologin',name],check=True);u=pwd.getpwnam(name)
if u.pw_dir!='/var/lib/jarvis-cloud-relay' or u.pw_uid==0:raise RuntimeError('Relay account mismatch')
d=Path(u.pw_dir)/'.ssh';d.mkdir(mode=0o700,exist_ok=True);os.chown(d,u.pw_uid,u.pw_gid);os.chmod(d,0o700)
out={}
for id in p['ids']:
 key=d/('id_ed25519_'+id)
 if not key.exists():subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(key),'-C','jarvis-112-readonly-'+id],check=True)
 os.chown(key,u.pw_uid,u.pw_gid);os.chmod(key,0o400);out[id]=key.with_suffix('.pub').read_text().strip()
print(json.dumps(out))
`)));
 const machines=await records('machines'),services=await records('services');
 const agents=(await api('/api/v1/execution/agents')).data,peers=[];
 const collector=await readFile('scripts/cloud-node-collector.py','utf8');
 const install=await readFile('scripts/install-managed-monitor.py','utf8');
 async function update(domain,item,body,idKey){
  if(Object.entries(body).every(([key,value])=>item[key]===value))return item;
  for(let i=0;i<3;i++){
   try{return await command(domain,'update',{[idKey]:item.id,...body},item.revision);}
   catch(error){if(!error.message.startsWith('API_409')||i===2)throw error;item=(await api('/api/v1/'+domain+'/'+item.id)).data;}
  }
 }
 for(const server of targets){
  const hardware=inspection.get(server.id);
  const body={name:server.name,role:server.role,category:'server',cpu:hardware.cores+'线程 '+hardware.cpu,
   ram:Math.round(hardware.ramGB*1000)/1000,disk:Math.round(hardware.diskGB)+'GB',
   gpu:['101','112'].includes(server.id)?'Intel HD Graphics 630':server.id==='116'?'Intel HD Graphics 530':'无独立GPU',
   os:hardware.os,address:server.host,room:server.room,always:true,readOnly:false};
  let machine=machines.find(m=>m.address===server.host);
  if(machine)machine=await update('machines',machine,body,'machineId');
  else {machine=await command('machines','register',body);machines.push(machine);}
  const bindings=[];
  for(const configured of server.services){
   const entry='systemd:'+configured.unit;
   const serviceBody={name:configured.name,description:configured.expected==='stopped'?'冷备停机待命是预期状态；持续监测实际状态。':'采集实际进程状态；应用可用性以独立健康检查为准。',
    machineId:machine.id,environment:configured.environment,version:configured.expected==='stopped'?'冷备待命 · 预期停止':'现有版本 · 未独立核验',method:'systemd',entry,healthPath:''};
   let item=services.find(s=>s.machineId===machine.id&&s.entry===entry);
   if(item){
    // Preserve existing app health URLs and project associations.
    item=await update('services',item,{...serviceBody,healthPath:item.healthPath||'',...(item.projectId?{projectId:item.projectId}:{})},'serviceId');
   }else {item=await command('services','register',serviceBody);services.push(item);}
   bindings.push({serviceId:item.id,unit:configured.unit,expected:configured.expected});
  }
  const saved=JSON.parse(remote(resolve(server.profile),'jarvis-'+server.id,python({code:collector,resourceCode:await readFile('scripts/managed-project-resources.py','utf8'),sshPublic:relayPublic[server.id],machineId:machine.id,services:bindings},install),server.user!=='root'));
  let agent=agents.find(a=>a.id===saved.agentId&&!a.revoked&&a.machineId===machine.id);
  if(agent&&!(['telemetry','service-status'].every(c=>agent.capabilities.includes(c))&&agent.capabilities.every(c=>['telemetry','service-status'].includes(c))))throw Error('EXISTING_MONITOR_CAPABILITIES_DIFFER '+server.id);
  if(!agent){
   const ticket=(await api('/api/v1/execution/tickets',{machineId:machine.id,capabilities:['telemetry','service-status'],ttlSec:300})).data;
   agent=(await api('/api/v1/agents/pair',{ticket:ticket.ticket,publicKey:saved.publicKey})).data;
  }
  const agentId=agent.agentId??agent.id;
  remote(resolve(server.profile),'jarvis-'+server.id,python({agentId},`import os
from pathlib import Path
f=Path('/etc/jarvis-cloud-agent/node.json');c=json.loads(f.read_text());c['agentId']=p['agentId'];st=f.stat();temp=f.with_name('node.json.paired');temp.write_text(json.dumps(c));os.chown(temp,st.st_uid,st.st_gid);os.chmod(temp,0o640);os.replace(temp,f);print('PAIRED')
`),server.user!=='root');
  peers.push({id:server.id,alias:'node-'+server.id,host:server.host,machineId:machine.id,agentId,publicKey:saved.publicKey});
  report.nodes.push({id:server.id,name:server.name,host:server.host,hostname:hardware.hostname,machineId:machine.id,agentId,services:bindings,hostFingerprint:server.fingerprint});
  await writeFile(out+'/onboarding.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({phase:'paired',id:server.id,services:bindings.length,reusedAgent:!!saved.agentId}));
 }
 const profiles=[...new Set(plan.servers.map(s=>s.profile))];
 const known=(await Promise.all(profiles.map(file=>readFile(resolve(dirname(file),'known_hosts'),'utf8')))).join('\n');
 report.relay=JSON.parse(primary(python({peers,servers:plan.servers,known,code:await readFile('scripts/cloud-node-relay.mjs','utf8')},await readFile('scripts/install-managed-relay.py','utf8'))));
 await writeFile(out+'/onboarding.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({phase:'supervision-started',nodes:report.nodes.length,totalPeers:report.relay.peerCount}));
});
