import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {request} from 'node:https';
import {withPlatform,primary,python,remote,lanProfile} from './managed-server-client.mjs';
const out='artifacts/remote-operations',onboarding=JSON.parse(await readFile('artifacts/managed-servers/onboarding.json','utf8')),base='https://cc-jarvis.ikvein.com',checks=[];
const allowOffline=process.argv.includes('--allow-offline=116');
const pass=name=>checks.push({name,passed:true});
function portal(path,cookie='',body,origin=base){return new Promise((resolve,reject)=>{const raw=body===undefined?null:JSON.stringify(body);const req=request(base+'/control/'+path,{method:raw?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(raw?{'content-type':'application/json',origin}: {})},timeout:20000},r=>{let content='';r.on('data',chunk=>content+=chunk);r.on('end',()=>{let data;try{data=JSON.parse(content);}catch{data={html:content.includes('贾维斯 · 独立运维')}}resolve({status:r.statusCode,data});});});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('PORTAL_TIMEOUT')));req.end(raw);});}
const reports=[];
await withPlatform(async({api})=>{
 const caps=await api('/api/runtime/remote-ops/capabilities');assert(caps.configured&&caps.controllerOnline);assert.equal(caps.nodes.length,5);assert.equal(caps.machineStartSupported,false);pass('five-fixed-nodes-and-independent-controller-online');
 const applications=(await api('/api/runtime/applications?limit=100')).items;
 const plans=[];
 for(const node of onboarding.nodes){const plan=await api('/api/runtime/remote-ops/prepare',{requestId:randomUUID(),target:{kind:'machine',id:node.machineId},action:'diagnose'});assert.equal(plan.requiresConfirmation,false);await api('/api/runtime/remote-ops/jobs/'+plan.id+'/execute',{expectedVersion:plan.revision,confirmed:false});plans.push({node,plan});}
 const myFamily=applications.find(a=>a.name==='MyFamily'),main=applications.find(a=>a.machineId===onboarding.nodes.find(n=>n.id==='112').machineId);
 for(const application of [myFamily,main]){assert(application);const plan=await api('/api/runtime/remote-ops/prepare',{requestId:randomUUID(),target:{kind:'application',id:application.id},action:'diagnose'});await api('/api/runtime/remote-ops/jobs/'+plan.id+'/execute',{expectedVersion:plan.revision,confirmed:false});plans.push({node:{id:application.name},plan});}
 const finish=Date.now()+220000;
 for(const {node,plan} of plans){let job;do{job=await api('/api/runtime/remote-ops/jobs/'+plan.id);if(['succeeded','failed'].includes(job.status)||allowOffline&&plan.nodeId==='116'&&job.status==='unknown')break;await new Promise(resolve=>setTimeout(resolve,2000));}while(Date.now()<finish);if(allowOffline&&plan.nodeId==='116'&&job.status==='unknown'){assert(!job.result?.receipt?.diagnostic);reports.push({node:node.id,jobId:job.id,status:'unknown',currentDiagnostic:'unavailable',summary:job.result?.summary});continue;}assert.equal(job.status,'succeeded',node.id+' diagnostic result is '+job.status);const d=job.result.receipt.diagnostic;assert(d.logicalCPUs>0&&d.memory.MemTotal>0&&d.filesystems.length>0);assert(!d.filesystems.some(f=>['squashfs','iso9660','erofs'].includes(f.type)||f.mount.startsWith('/snap/')));assert.equal(job.result.receipt.machineId,plan.machineId);if(plan.target.kind==='application')assert.equal(job.result.applicationHealth.state,'healthy');reports.push({node:node.id,jobId:job.id,status:job.status,hostname:d.hostname,logicalCPUs:d.logicalCPUs,cpuPercent:d.cpuPercent,memoryGiB:Math.round(d.memory.MemTotal/2**30),filesystems:d.filesystems.map(f=>({mount:f.mount,usedPercent:f.usedPercent})),networkInterfaceCount:d.networkInterfaces.length,SMARTDevices:d.diskHealth.length,failedServices:d.failedSystemServices,findings:d.findings,applicationHealth:job.result.applicationHealth??null});}
 pass(reports.some(r=>r.status==='unknown')?'four-real-machine-and-main-project-diagnostics-offline-116-stays-unconfirmed':'five-real-machine-diagnostics-and-two-project-health-diagnostics');
 for(const action of ['reboot','poweroff']){const plan=await api('/api/runtime/remote-ops/prepare',{requestId:randomUUID(),target:{kind:'machine',id:main.machineId},action});assert(plan.requiresConfirmation&&plan.affectedProjects.includes(main.name));await api('/api/runtime/remote-ops/jobs/'+plan.id+'/cancel',{});assert.equal((await api('/api/runtime/remote-ops/jobs/'+plan.id)).status,'cancelled');}pass('production-power-plans-reviewed-and-cancelled-without-execution');
 const voice=await api('/api/runtime/voice/sessions',{terminalId:'local',roomId:'study'});
 try{for(const phrase of ['贾维斯，诊断一一六服务器','重启112服务器','关闭广州服务器','重启116上的MyFamily项目']){const result=await api('/api/runtime/voice/sessions/'+voice.id+'/intent',{text:phrase});assert.equal(result.mode,'proposal');assert.equal(result.proposal.alternatives[0].action,'remote.operation');const jobId=result.proposal.alternatives[0].remoteJobId;await api('/api/runtime/voice/intents/'+result.proposal.id+'/cancel',{});assert.equal((await api('/api/runtime/remote-ops/jobs/'+jobId)).status,'cancelled');}pass('real-registry-voice-targets-frozen-and-cancelled-without-power-or-model-call');}
 finally{await api('/api/runtime/voice/sessions/'+voice.id,undefined,'DELETE');}
});
assert.equal((await portal('')).status,200);assert.equal((await portal('api/status')).status,401);pass('public-recovery-page-and-anonymous-control-api-protected');
let cookie='jarvis_control_session='+primary(`import base64,hashlib,hmac,json,time,uuid
from pathlib import Path
key=Path('/etc/jarvis-control/cookie.key').read_bytes()
def enc(v):return base64.urlsafe_b64encode(v).decode().rstrip('=')
body=enc(json.dumps({'expires':int(time.time()*1000)+900000,'nonce':str(uuid.uuid4()),'authorizationHash':'acceptance-owner'}).encode())
print(body+'.'+enc(hmac.new(key,body.encode(),hashlib.sha256).digest()))
`);
try{
 const status=await portal('api/status',cookie);assert.equal(status.status,200);assert.equal(status.data.nodes.length,5);
 const machine=onboarding.nodes.find(n=>n.id===(allowOffline?'112':'116')),plan=await portal('api/prepare',cookie,{machineId:machine.machineId,unit:'',action:'diagnose'});assert.equal(plan.status,200);
 assert.equal((await portal('api/execute',cookie,{id:plan.data.id,confirmTitle:'另一台服务器'})).status,409);
 assert.equal((await portal('api/execute',cookie,{id:plan.data.id,confirmTitle:plan.data.title},'https://untrusted.invalid')).status,403);
 assert.equal((await portal('api/execute',cookie,{id:plan.data.id,confirmTitle:plan.data.title})).status,200);
 let result;for(let i=0;i<30;i++){result=(await portal('api/status',cookie)).data.jobs.find(j=>j.job.id===plan.data.id);if(result?.status==='succeeded')break;await new Promise(resolve=>setTimeout(resolve,1000));}assert.equal(result.status,'succeeded');
 await withPlatform(async({api})=>{const imported=await api('/api/runtime/remote-ops/jobs/'+plan.data.id);assert.equal(imported.source,'independent-control');assert.equal(imported.status,'succeeded');});pass('independent-portal-confirmation-origin-guard-real-diagnosis-and-imported-receipt');
 const cold=onboarding.nodes.find(n=>n.id==='101');assert.equal((await portal('api/prepare',cookie,{machineId:cold.machineId,unit:'jarvis-platform.service',action:'start'})).status,409);pass('independent-portal-keeps-cold-platform-protected');
 assert.equal((await portal('api/logout',cookie,{})).status,200);assert.equal((await portal('api/status',cookie)).status,401);pass('independent-session-logout-invalidates-cookie-replay');
}finally{await portal('api/logout',cookie,{}).catch(()=>{});cookie='';}
const topology=[];
for(const id of ['101','112'])topology.push(JSON.parse(remote(lanProfile,'jarvis-'+id,python({id},`import subprocess,os,pwd
from pathlib import Path
def state(unit):return subprocess.run(['systemctl','is-active',unit],capture_output=True,text=True).stdout.strip()
text=Path('/etc/systemd/system/jarvis-control.service').read_text();frpc=Path('/etc/systemd/system/jarvis-frpc.service').read_text()
assert 'BindsTo=jarvis-platform' not in text+frpc and 'PartOf=jarvis-platform' not in text+frpc
user=pwd.getpwnam('jarvis-control');assert Path('/var/lib/jarvis/data/jarvis.db').is_file();test=subprocess.run(['runuser','-u','jarvis-control','--','test','-r','/var/lib/jarvis/data/jarvis.db'],capture_output=True)
assert test.returncode!=0
assert state('jarvis-platform.service')==('active' if p['id']=='112' else 'inactive')
assert state('jarvis-control.service')==('active' if p['id']=='112' else 'inactive')
print(json.dumps({'node':p['id'],'platform':state('jarvis-platform.service'),'controller':state('jarvis-control.service'),'domainTunnel':state('jarvis-frpc.service'),'noPlatformDataPermission':True,'noPlatformDependency':True}))
`),true)));
pass('primary-independent-control-and-cold-controller-kept-stopped');
const report={status:reports.some(r=>r.status==='unknown')?'partial':'passed',release:JSON.parse(await readFile('artifacts/managed-servers/release.json','utf8')).release,at:new Date().toISOString(),checks,diagnostics:reports,topology,machineStartSupported:false,productionPowerCommandsExecuted:0};await writeFile(out+'/live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,realDiagnostics:reports.filter(r=>r.hostname).length,unavailableDiagnostics:reports.filter(r=>r.status==='unknown').length,productionPowerCommandsExecuted:0}));
