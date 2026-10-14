import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadPlan} from './managed-server-plan.mjs';
import {primary,remote,python,withPlatform,lanProfile} from './managed-server-client.mjs';
const plan=await loadPlan(),out='artifacts/managed-servers';
const onboarding=JSON.parse(await readFile(out+'/onboarding.json','utf8'));
const release=JSON.parse(await readFile(out+'/release.json','utf8')).release;
const machineCount=plan.servers.length,serviceCount=plan.servers.reduce((sum,s)=>sum+s.services.length,0);
const permissions=[];
for(const server of plan.servers){
 permissions.push(JSON.parse(remote(server.profile,'jarvis-'+server.id,python({id:server.id},`import subprocess,pwd,os
from pathlib import Path
u=pwd.getpwnam('jarvis-monitor');r=subprocess.run(['sudo','-l','-U',u.pw_name],capture_output=True,text=True,env=dict(os.environ,LC_ALL='C'))
denied='is not allowed to run sudo' in r.stdout+r.stderr
if not denied:raise RuntimeError('Monitor has sudo')
auth=Path('/var/lib/jarvis-cloud-agent/.ssh/authorized_keys');stat=auth.stat()
if stat.st_uid!=0 or not auth.read_text().startswith('restrict,command="/usr/bin/python3 /opt/jarvis-cloud-agent/collector.py" '):raise RuntimeError('Fixed command protection differs')
canRead=subprocess.run(['runuser','-u',u.pw_name,'--','test','-r','/var/lib/jarvis/data'],capture_output=True).returncode==0
if canRead:raise RuntimeError('Monitor can read platform data')
print(json.dumps({'id':p['id'],'sudoAllowed':False,'forcedAuthorizationRootOwned':True,'platformDataAccessible':False}))
`),server.user!=='root')));
}
const relay=JSON.parse(primary(`import subprocess,json
from pathlib import Path
c=json.loads(Path('/etc/jarvis-cloud-relay/config.json').read_text());forced=[]
for p in c['peers']:
 r=subprocess.run(['runuser','-u','jarvis-cloud-relay','--','ssh','-F',c['sshConfig'],p['alias'],'id'],capture_output=True,text=True,timeout=15,check=True)
 body=json.loads(r.stdout);forced.append({'id':p['id'],'fixedCollectorInsteadOfRequestedCommand':body['machineId']==p['machineId'] and body['path']=='/api/v1/agents/'+p['agentId']+'/heartbeat'})
status=json.loads(Path('/var/lib/jarvis-cloud-relay/status.json').read_text())
service=subprocess.run(['systemctl','is-active','jarvis-cloud-relay.service'],capture_output=True,text=True,check=True).stdout.strip()
enabled=subprocess.run(['systemctl','is-enabled','jarvis-cloud-relay.service'],capture_output=True,text=True,check=True).stdout.strip()
print(json.dumps({'forcedSSH':forced,'status':status,'service':service,'enabled':enabled}))
`));
assert.equal(relay.forcedSSH.length,machineCount);assert(relay.forcedSSH.every(p=>p.fixedCollectorInsteadOfRequestedCommand));
assert.equal(relay.status.items.length,machineCount);assert(relay.status.items.every(p=>p.connected));assert.equal(relay.enabled,'enabled');
let live;
await withPlatform(async({api,records})=>{
 const machines=await records('machines'),services=await records('services'),agents=(await api('/api/v1/execution/agents')).data;
 assert.equal(onboarding.nodes.length,machineCount);
 assert.equal(onboarding.nodes.reduce((sum,n)=>sum+n.services.length,0),serviceCount);
 for(const server of plan.servers)assert.equal(machines.filter(m=>m.address===server.host).length,1);
 for(const n of onboarding.nodes){
  const m=machines.find(m=>m.id===n.machineId),a=agents.find(a=>a.id===n.agentId);assert(m&&a&&a.status==='online');
  assert.equal(m.telemetry.source,'signed-agent');assert(m.telemetry.diskFreeGB>0);assert(Date.now()-Date.parse(m.lastSeen)<60000);
  for(const b of n.services){const s=services.find(s=>s.id===b.serviceId);assert(s&&s.processObservation);assert.equal(services.filter(v=>v.machineId===n.machineId&&v.entry===s.entry).length,1);assert.equal(s.processObservation.processStatus,b.expected);assert(Date.now()-Date.parse(s.processObservation.observedAt)<60000);}
 }
 const before=JSON.parse(await readFile(out+'/before.json','utf8'));
 assert(before.agents.every(old=>agents.some(a=>a.id===old.id&&a.machineId===old.machineId)));
 const bootstrap=await api('/api/bootstrap');const canonical=bootstrap.devices.find(d=>d.id==='local').canonicalMachineId;
 assert.equal(canonical,onboarding.nodes.find(n=>n.id==='112').machineId);
 live={machineCount,serviceCount,allPairedNodesOnline:true,realResources:true,expectedServiceStates:true,existingCloudIdentitiesPreserved:true,noDuplicateAfterRepeatedOnboarding:true,canonicalLocalMachineId:canonical,nodes:machines.filter(m=>onboarding.nodes.some(n=>n.machineId===m.id)).map(m=>({id:m.id,name:m.name,address:m.address,lastSeen:m.lastSeen,metrics:m.telemetry}))};
});
const platformNodes=[];
for(const id of ['112','101'])platformNodes.push(JSON.parse(remote(lanProfile,'jarvis-'+id,`import hashlib,json,subprocess
from pathlib import Path
base=Path('/opt/jarvis/current');files=[]
for relative in ['apps/api/dist','apps/web/dist']:
 for f in sorted((base/relative).rglob('*')):
  if f.is_symlink():raise RuntimeError('Compiled link')
  if f.is_file():files.append({'path':str(f.relative_to(base)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
manifest=json.dumps(sorted(files,key=lambda f:f['path']),sort_keys=True,separators=(',',':'));c=json.loads(Path('/etc/jarvis/node.json').read_text());services={}
for unit in ['jarvis-platform.service','jarvis-observer.service']:
 r=subprocess.run(['systemctl','show',unit,'--property=ActiveState,UnitFileState,User'],capture_output=True,text=True,check=True);services[unit]=dict(l.split('=',1) for l in r.stdout.splitlines())
print(json.dumps({'nodeId':c['nodeId'],'role':c['role'],'release':c['release'],'compiledTreeSHA256':hashlib.sha256(manifest.encode()).hexdigest(),'compiledFiles':len(files),'packageLockSHA256':hashlib.sha256((base/'package-lock.json').read_bytes()).hexdigest(),'services':services}))
`,true)));
assert.equal(platformNodes[0].compiledTreeSHA256,platformNodes[1].compiledTreeSHA256);
assert.equal(platformNodes[0].packageLockSHA256,platformNodes[1].packageLockSHA256);
assert(platformNodes.every(n=>n.release===release&&n.services['jarvis-observer.service'].ActiveState==='active'));
assert.equal(platformNodes[0].services['jarvis-platform.service'].ActiveState,'active');
assert.equal(platformNodes[1].services['jarvis-platform.service'].ActiveState,'inactive');
const ui=JSON.parse(await readFile(out+'/ui/report.json','utf8'));assert.equal(ui.status,'passed');
const entrypoints=JSON.parse(await readFile(out+'/entrypoints.json','utf8'));assert.equal(entrypoints.release,release);assert.equal(entrypoints.reports.length,2);assert(entrypoints.reports.every(n=>n.status==='passed'));
const activityHistory=JSON.parse(await readFile(out+'/activity-live.json','utf8'));assert.equal(activityHistory.status,'passed');
const backendTests=JSON.parse(await readFile(out+'/backend-tests.json','utf8'));
const projectUI=JSON.parse(await readFile(out+'/project-ui/report.json','utf8'));assert.equal(projectUI.status,'passed');assert.equal(projectUI.isolatedFixture,true);
const sampling=JSON.parse(await readFile(out+'/application-sampling.json','utf8'));assert.equal(sampling.nodes.length,5);assert(sampling.nodes.every(n=>n.units['jarvis-project-sampler.timer'].ActiveState==='active'&&n.units['jarvis-project-sampler.service'].Result==='success'));
const applicationTests=await readFile(out+'/application-tests.log','utf8');assert(/pass 2/.test(applicationTests)&&/fail 0/.test(applicationTests));
const stage=JSON.parse(await readFile(out+'/application-stage-verification.json','utf8'));assert.equal(stage.release,release);assert.equal(stage.status,'passed');
let projects;await withPlatform(async({api})=>{const r=await api('/api/runtime/applications?limit=100');assert.equal(r.total,13);assert(r.items.every(p=>onboarding.nodes.some(n=>n.machineId===p.machineId)));assert(r.items.filter(p=>p.health.enabled&&p.status==='active').every(p=>p.healthObservation?.state==='healthy'));assert(r.items.filter(p=>p.machineId===onboarding.nodes.find(n=>n.id==='101').machineId).every(p=>p.status==='paused'&&!p.health.enabled));projects={count:r.total,automaticChecks:r.items.filter(p=>p.health.enabled).length,allConfiguredChecksHealthy:true,coldStandbyChecksPaused:true};});
const report={status:'passed',verifiedAt:new Date().toISOString(),permissions,relay,live,platformNodes,ui,entrypoints,activityHistory,backendTests,source:'actual-production-verification',historicalTunnels:{CS02:'unreachable',CS03:'unreachable'},pendingI3:'not-installed'};
Object.assign(report,{applicationManagement:{backendTests:{passed:2,failed:0},projectUI,stage,projects,directorySampling:sampling.nodes.map(n=>({node:n.node,timerActive:true,lastRunSuccessful:true,sampledDirectories:Object.keys(n.directorySamples?.services||{}).length}))}});
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,machines:machineCount,services:serviceCount,permissions,platformNodes}));
