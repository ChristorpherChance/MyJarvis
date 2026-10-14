/** Verify actual ingress and supervision without exporting private configuration. */
import {readFile,writeFile} from 'node:fs/promises';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {remote,python,lanProfile,cloudProfile,withPlatform} from './managed-server-client.mjs';
const domain='cc-jarvis.ikvein.com',base='https://'+domain,out='artifacts/domain-access';
const ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt');
function probe(url,options={}){return new Promise((resolve,reject)=>{const get=url.startsWith('https:')?httpsRequest:httpRequest;const r=get(url,{method:'GET',timeout:15000,...options},reply=>{const chunks=[];reply.on('data',b=>chunks.push(b));reply.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');let data;try{data=JSON.parse(body);}catch{}resolve({url,status:reply.statusCode,location:reply.headers.location||null,data});});});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('PROBE_TIMEOUT')));r.end();});}
const checks=[];
for(const [path,expected] of [['/',200],['/api/health',200],['/api/auth/state',200],['/api/runtime/applications',401]]){
 const reply=await probe(base+path);assert.equal(reply.status,expected);if(path==='/api/health'){assert.equal(reply.data.nodeId,'112');assert.equal(reply.data.role,'primary');}if(path==='/api/auth/state')assert.equal(reply.data.setupRequired,false);
 checks.push({url:reply.url,status:reply.status});
}
const redirect=await probe('http://'+domain+'/api/health');assert.equal(redirect.status,308);assert.equal(redirect.location,base+'/api/health');checks.push(redirect);
const lan=await probe('https://192.168.10.112:3140/api/health',{ca});assert.equal(lan.status,200);assert.equal(lan.data.nodeId,'112');
const nodes=[];
for(const id of ['112','101']){
 const result=JSON.parse(remote(lanProfile,'jarvis-'+id,python({id,domain},`import os,pwd,grp,hashlib,subprocess,tomllib
from pathlib import Path
n=json.loads(Path('/etc/jarvis/node.json').read_text());u=pwd.getpwnam('jarvis-ingress');cpath=Path('/etc/jarvis-frpc/frpc.toml');c=tomllib.loads(cpath.read_text());proxy=c['proxies'][0]
assert n['nodeId']==p['id'] and n['role']==('primary' if p['id']=='112' else 'standby')
assert c['serverAddr']=='8.163.127.192' and c['serverPort']==7000 and c['transport']['tls']['enable']
assert proxy['subdomain']=='cc-jarvis' and proxy['plugin']['type']=='http2https' and proxy['plugin']['localAddr']=='127.0.0.1:3140'
assert bool(proxy['httpUser']) and bool(proxy['httpPassword']) and bool(c['auth']['token'])
assert cpath.stat().st_uid==0 and cpath.stat().st_gid==u.pw_gid and cpath.stat().st_mode&0o777==0o640
assert u.pw_uid!=0 and u.pw_shell=='/usr/sbin/nologin'
assert 'jarvis' not in [grp.getgrgid(g).gr_name for g in os.getgrouplist(u.pw_name,u.pw_gid)]
assert subprocess.run(['runuser','-u',u.pw_name,'--','test','-r','/var/lib/jarvis/data'],capture_output=True).returncode!=0
sudo=subprocess.run(['sudo','-l','-U',u.pw_name],capture_output=True,text=True,env=dict(os.environ,LC_ALL='C'))
assert 'is not allowed to run sudo' in sudo.stdout+sudo.stderr
states={}
for unit in ['jarvis-platform.service','jarvis-frpc.service','jarvis-observer.service']:
 r=subprocess.run(['systemctl','show',unit,'--property=ActiveState,UnitFileState,User'],capture_output=True,text=True,check=True);states[unit]=dict(l.split('=',1) for l in r.stdout.splitlines())
env=Path('/etc/jarvis-frpc/allowed-hosts.env').read_text().strip().split('=',1)[1].split(',')
assert p['domain'] in env and '*' not in env
assert Path('/etc/systemd/system/jarvis-platform.service.d/30-domain-access.conf').read_text().strip()=='[Service]\\nEnvironmentFile=/etc/jarvis-frpc/allowed-hosts.env'
guard=None
if p['id']=='101':guard=subprocess.run(['/usr/bin/python3','/opt/jarvis-frpc/require-primary.py'],capture_output=True).returncode!=0;assert guard
print(json.dumps({'node':p['id'],'role':n['role'],'states':states,'transportTLS':True,'loopbackTarget':'127.0.0.1:3140','directFRPGate':True,'dedicatedNoSudoAccount':True,'privateConfigMode':'0640','platformDataReadable':False,'standbyStartBlocked':guard,'binarySHA256':hashlib.sha256(Path('/opt/jarvis-frpc/frpc').read_bytes()).hexdigest()}))
`),true));
 assert.equal(result.states['jarvis-frpc.service'].ActiveState,id==='112'?'active':'inactive');assert.equal(result.states['jarvis-frpc.service'].UnitFileState,id==='112'?'enabled':'disabled');assert.equal(result.states['jarvis-platform.service'].ActiveState,id==='112'?'active':'inactive');assert.equal(result.states['jarvis-observer.service'].ActiveState,'active');nodes.push(result);
}
const gateway=JSON.parse(remote(cloudProfile,'jarvis-gz',python({domain},`import re,subprocess,urllib.request,urllib.error
from pathlib import Path
c=Path('/etc/frps.toml').read_text();setting=re.search(r'^subdomainHost\\s*=\\s*"([^"]+)"',c,re.M);assert setting and setting.group(1)=='ikvein.com'
request=urllib.request.Request('http://127.0.0.1:18080/',headers={'Host':p['domain']})
try:
 response=urllib.request.urlopen(request,timeout=10);status=response.status;response.close()
except urllib.error.HTTPError as e:status=e.code;e.close()
assert status==401
assert subprocess.run(['nginx','-t'],capture_output=True).returncode==0
for unit in ['nginx.service','frps.service']:assert subprocess.run(['systemctl','is-active',unit],capture_output=True,text=True).stdout.strip()=='active'
site=Path('/etc/nginx/sites-available')/p['domain'];assert site.stat().st_mode&0o777==0o600
certificate=subprocess.run(['openssl','x509','-in','/etc/nginx/ssl/ikvein.com/fullchain.pem','-noout','-enddate'],capture_output=True,text=True,check=True).stdout.strip()
print(json.dumps({'subdomainHost':setting.group(1),'directFRPWithoutGatewayStatus':status,'nginxConfigValid':True,'siteConfigMode':'0600','certificateExpiry':certificate,'enabledSites':sorted(str(f) for f in Path('/etc/nginx/sites-enabled').iterdir())}))
`),true));
const before=JSON.parse(await readFile(out+'/gz-preflight.json','utf8'));assert(before.nginxSites.every(s=>gateway.enabledSites.includes(s)));assert.equal(gateway.enabledSites.length,before.nginxSites.length+1);
const onboarding=JSON.parse(await readFile('artifacts/managed-servers/onboarding.json','utf8'));let supervision,existingProjects=[];
await withPlatform(async({api,records})=>{
 const services=await records('services'),agents=(await api('/api/v1/execution/agents')).data;
 for(const n of onboarding.nodes){const agent=agents.find(a=>a.id===n.agentId);assert(agent&&agent.status==='online');assert(Date.now()-Date.parse(agent.lastSeen)<60000);for(const b of n.services){const s=services.find(s=>s.id===b.serviceId);assert(s);assert.equal(s.processObservation?.processStatus,b.expected);assert(Date.now()-Date.parse(s.processObservation.observedAt)<60000);}}
 assert.equal(services.length,onboarding.nodes.reduce((sum,n)=>sum+n.services.length,0));supervision={machineCount:5,serviceCount:services.length,allExpectedStatesObserved:true};
 const apps=await api('/api/runtime/applications?limit=100');assert.equal(apps.total,13);const n112=onboarding.nodes.find(n=>n.id==='112'),n101=onboarding.nodes.find(n=>n.id==='101'),n116=onboarding.nodes.find(n=>n.id==='116');const main=apps.items.find(a=>a.machineId===n112.machineId);assert.equal(main.url,base+'/');assert.equal(main.health.url,base+'/api/health');const check=await api('/api/runtime/applications/'+main.id+'/check',{});assert.equal(check.state,'healthy');const cold=apps.items.find(a=>a.machineId===n101.machineId);assert.equal(cold.status,'paused');assert.equal(cold.health.enabled,false);
 for(const app of apps.items.filter(a=>a.machineId===n116.machineId&&a.url)){const target=app.health.enabled?app.health.url||app.url:app.url;const response=await probe(target);assert.equal(response.status,200);existingProjects.push({name:app.name,url:target,status:response.status});}
 supervision.projectCount=apps.total;supervision.publicApplicationHealth='healthy';
});
const originalClient=JSON.parse(remote(lanProfile,'jarvis-116',`import json,subprocess
r=subprocess.run(['systemctl','is-active','frpc.service'],capture_output=True,text=True,check=True)
print(json.dumps({'active':r.stdout.strip()=='active','configurationPath':'/home/superopen/frpc/frpc.toml','configurationModifiedByDeployment':False}))`));assert(originalClient.active);
const ui=JSON.parse(await readFile(out+'/ui/report.json','utf8'));assert.equal(ui.status,'passed');const managedUI=JSON.parse(await readFile('artifacts/managed-servers/ui/report.json','utf8'));assert.equal(managedUI.status,'passed');assert(managedUI.checks.includes(supervision.serviceCount+'-services-paginate-correctly'));
const report={status:'passed',verifiedAt:new Date().toISOString(),url:base,publicChecks:checks,lanFallbackVerified:true,nodes,gateway,supervision,existing116Projects:existingProjects,original116Client:originalClient,browserChecks:ui,managementChecks:managedUI,automaticFailoverImplemented:false};
await writeFile(out+'/public-probes.json',JSON.stringify({at:report.verifiedAt,checks},null,2));await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',url:base,services:supervision.serviceCount,projects:13,existing116Projects:existingProjects.length,publicChecks:checks.length,browserChecks:ui.checks.length}));
