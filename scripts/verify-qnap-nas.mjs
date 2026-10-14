import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {primary,remote,lanProfile,withPlatform} from './managed-server-client.mjs';
import {validateEnvelope} from './cloud-node-relay.mjs';

const nas=JSON.parse(await readFile('artifacts/nas-onboarding/onboarding.json','utf8'));
const old=JSON.parse(await readFile('artifacts/managed-servers/onboarding.json','utf8'));
const release=JSON.parse(await readFile('artifacts/managed-servers/release.json','utf8')).release;
const checks=[];
const state=JSON.parse(primary(`from pathlib import Path
import json,subprocess,stat
c=json.loads(Path('/etc/jarvis-cloud-relay/config.json').read_text())
peers=[{'id':p['id'],'machineId':p['machineId'],'agentId':p['agentId']} for p in c['peers']]
r=subprocess.run(['runuser','-u','jarvis-cloud-relay','--','ssh','-F','/etc/jarvis-cloud-relay/ssh_config','node-nas','id'],capture_output=True,text=True,check=True,timeout=15)
print(json.dumps({'peers':peers,'forcedCommandOutput':r.stdout,'active':subprocess.run(['systemctl','is-active','--quiet','jarvis-cloud-relay.service']).returncode==0,'enabled':subprocess.run(['systemctl','is-enabled','--quiet','jarvis-cloud-relay.service']).returncode==0,'transportKeyMode':oct(stat.S_IMODE(Path('/var/lib/jarvis-cloud-relay/.ssh/id_ed25519_nas').stat().st_mode))}))
`));
assert.equal(state.peers.length,6);assert(state.active&&state.enabled);assert.equal(state.transportKeyMode,'0o400');
for(const n of old.nodes)assert(state.peers.some(p=>p.id===n.id&&p.machineId===n.machineId&&p.agentId===n.agentId));
const envelope=JSON.parse(state.forcedCommandOutput);validateEnvelope(nas,envelope);
assert.equal(envelope.body.storage.volumes.length,4);assert.equal(envelope.body.storage.disks.length,4);
checks.push('six-peer-identities-preserved','resident-primary-relay','ssh-command-is-forced-readonly-collector','nas-signature-valid');
const standby=JSON.parse(remote(lanProfile,'jarvis-101',`from pathlib import Path
import subprocess,json
print(json.dumps({'release':Path('/opt/jarvis/current').resolve().name,'observer':subprocess.run(['systemctl','is-active','--quiet','jarvis-observer.service']).returncode==0,'business':subprocess.run(['systemctl','is-active','--quiet','jarvis-platform.service']).returncode==0}))`,true));
assert.equal(standby.release,release);assert.equal(standby.business,false);assert.equal(standby.observer,true);checks.push('101-release-matches-and-remains-cold-standby');
const result=await withPlatform(async({api,records})=>{
 const health=await api('/api/health');assert.equal(health.build,release);assert.equal(health.role,'primary');
 const machines=await records('machines'),matches=machines.filter(m=>m.address===nas.host);assert.equal(matches.length,1);
 const first=(await api('/api/v1/execution/agents')).data;const agent=first.find(a=>a.id===nas.agentId);assert(agent);assert.equal(agent.status,'online');assert.deepEqual(agent.capabilities,['telemetry']);
 const m=matches[0],s=m.telemetry?.storage;assert.equal(m.status,'online');assert.equal(s?.source,'signed-agent-qnap');assert.equal(s.capacityScope,'data-volumes');assert.equal(s.volumes.length,4);assert.equal(s.disks.length,4);assert(m.telemetry.diskTotalGB>15000&&m.telemetry.diskTotalGB<16000);assert(m.telemetry.diskFreeGB>0);assert(Math.abs(s.volumes.reduce((n,v)=>n+v.totalGB,0)-m.telemetry.diskTotalGB)<.01);assert(s.disks.every(d=>d.capacityGB>900&&d.model.length>10));
 assert.equal(s.externalVolumes.length,3);assert.equal(s.externalDisks.length,3);assert.equal(s.protectionState,'fresh');assert.equal(s.diskHealth.length,4);assert(s.diskHealth.every(h=>h.temperatureC>0));assert.equal(s.ups.model,'Back-UPS BK650M2-CH');assert.equal(s.ups.protection.delayMinutes,8);assert.equal(s.ups.protection.enabled,true);assert.equal(s.backups.state,'available');assert.equal(s.snapshots.state,'available');assert(s.alerts.some(a=>a.code==='volume-capacity'&&a.severity==='critical'));checks.push('three-real-external-disks','real-smart-temperature-ups-and-task-status','critical-external-capacity-alert');
 checks.push('unique-online-nas','signed-four-data-volumes-and-four-physical-disks','data-capacity-excludes-qts-ram-root');
 const app=await api('/api/runtime/applications/'+nas.applicationId);assert(app.credentialConfigured);assert.equal(app.loginUrl,'https://192.168.10.120:5001');assert.equal(app.healthObservation.state,'healthy');assert.equal(app.healthObservation.statusCode,200);assert(app.host.online);assert.equal(app.host.metrics.storage.kind,'qnap');checks.push('encrypted-login-and-healthy-management-portal');
 const resident=await api('/api/runtime/voice/engines/health');assert.equal(resident.ready,true);checks.push('existing-resident-voice-remains-ready');
 let current;
 for(let attempt=0;attempt<5;attempt++){
  await new Promise(r=>setTimeout(r,5000));current=(await api('/api/v1/execution/agents')).data.find(a=>a.id===nas.agentId);
  if(Date.parse(current.lastSeen)>Date.parse(agent.lastSeen))break;
 }
 assert(Date.parse(current.lastSeen)>Date.parse(agent.lastSeen));const updated=(await api('/api/v1/machines/'+nas.machineId)).data;assert(Date.parse(updated.lastSeen)>Date.parse(m.lastSeen));
 const history=(await api('/api/v1/execution/monitoring?kind=machine&id='+nas.machineId+'&window=1h&points=120')).data;assert(history.totalObservations>=2);checks.push('subsequent-live-heartbeat-persisted','real-monitor-history-recorded');
 const agents=(await api('/api/v1/execution/agents')).data;
 return {release,nas:{machineId:nas.machineId,agentId:nas.agentId,applicationId:nas.applicationId,lastSeen:updated.lastSeen,metrics:updated.telemetry,health:app.healthObservation},peers:old.nodes.map(n=>({id:n.id,agentId:n.agentId,status:agents.find(a=>a.id===n.agentId)?.status??'missing',lastSeen:agents.find(a=>a.id===n.agentId)?.lastSeen})),standby};
});
assert.equal(await access('.secrets/nas-connection.json').then(()=>true,()=>false),false);checks.push('temporary-plaintext-credential-removed');
const report={status:'passed',at:new Date().toISOString(),checks,...result};await writeFile('artifacts/nas-onboarding/verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,release,checks,peers:report.peers}));
