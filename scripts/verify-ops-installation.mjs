import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPlan} from './managed-server-plan.mjs';
import {remote,python,lanProfile} from './managed-server-client.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),plan=await loadPlan(),dispatcherSHA256=sha(await readFile('scripts/remote-ops-dispatcher.py')),controllerSHA256=sha(await readFile('scripts/remote-ops-controller.mjs')),nodes=[];
const allowOffline=process.argv.includes('--allow-offline=116');
for(const node of plan.servers){try{nodes.push(JSON.parse(remote(node.profile,'jarvis-'+node.id,python({nodeId:node.id,dispatcherSHA256},`import hashlib,os,subprocess,socket
from pathlib import Path
file=Path('/opt/jarvis-ops/dispatcher.py');policy=Path('/etc/jarvis-ops/node.json');c=json.loads(policy.read_text())
assert c['hostname']==socket.gethostname() and c['nodeId']==p['nodeId']
for path in [file,policy]:assert path.stat().st_uid==0 and not path.stat().st_mode&0o022
assert hashlib.sha256(file.read_bytes()).hexdigest()==p['dispatcherSHA256']
auth=Path('/var/lib/jarvis-ops-login/.ssh/authorized_keys');assert auth.stat().st_uid==0
assert len(auth.read_text().splitlines())==2 and all(line.startswith('restrict,command="/usr/bin/sudo -n /usr/bin/python3 /opt/jarvis-ops/dispatcher.py" ') for line in auth.read_text().splitlines())
denied=subprocess.run(['runuser','-u','jarvis-ops','--','/usr/bin/sudo','-n','/usr/bin/true'],capture_output=True)
assert denied.returncode!=0
print(json.dumps({'node':p['nodeId'],'sourceMatches':True,'policyRootOwned':True,'forcedCommandKeys':2,'arbitrarySudoRejected':True,'serviceCount':len(c['services']),'machineStartSupported':False}))
`),true)));}catch(error){if(!allowOffline||node.id!=='116'||!String(error).includes('Connection timed out'))throw error;nodes.push({node:node.id,status:'offline',currentInstallationVerification:'unavailable',lastSuccessfulProvisioning:'artifacts/remote-operations/provisioning.json'});}}
const controllers=[];
for(const node of ['101','112'])controllers.push(JSON.parse(remote(lanProfile,'jarvis-'+node,python({node,controllerSHA256},`import hashlib,subprocess
from pathlib import Path
def prop(unit,key):return subprocess.run(['systemctl','show',unit,'-p',key,'--value'],capture_output=True,text=True,check=True).stdout.strip()
assert hashlib.sha256(Path('/opt/jarvis-control/controller.mjs').read_bytes()).hexdigest()==p['controllerSHA256']
assert 'ReadWritePaths=/var/lib/jarvis-ops-queue/requests' in Path('/etc/systemd/system/jarvis-platform.service.d/40-remote-operations.conf').read_text()
before=False
if p['node']=='112':
 before=0<int(prop('jarvis-control.service','ActiveEnterTimestampMonotonic'))<int(prop('jarvis-platform.service','ActiveEnterTimestampMonotonic'));assert before
else:
 assert prop('jarvis-control.service','ActiveState')=='inactive'
 assert subprocess.run(['systemctl','is-enabled','jarvis-control.service'],capture_output=True,text=True).stdout.strip()=='disabled'
print(json.dumps({'node':p['node'],'sourceMatches':True,'mainOutboxWritePermission':True,'controllerSurvivedPlatformRestart':before,'coldControllerDisabled':p['node']=='101'}))
`),true)));
const report={status:nodes.some(n=>n.status==='offline')?'partial':'passed',at:new Date().toISOString(),dispatcherSHA256,controllerSHA256,nodes,controllers};await writeFile('artifacts/remote-operations/installation-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,verifiedFixedNodes:nodes.filter(n=>n.sourceMatches).length,controllers:controllers.length}));
