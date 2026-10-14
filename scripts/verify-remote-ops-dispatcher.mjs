/** Real forced-SSH service acceptance with a disposable, inert service; mock-only host power tests. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {remote,primary,python,lanProfile} from './managed-server-client.mjs';
const code=await readFile('scripts/remote-ops-dispatcher.py','utf8'),tests=await readFile('scripts/test-remote-ops-dispatcher.py','utf8');
const isolated=JSON.parse(remote(lanProfile,'jarvis-116',python({source:code,tests},`import tempfile
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='jarvis-ops-isolated-') as directory:
 source=Path(directory)/'dispatcher.py';source.write_text(p['source']);p['dispatcher']=str(source)
 exec(compile(p['tests'],'isolated-dispatcher-tests','exec'))
`),true));
const unit='jarvis-ops-acceptance-'+randomUUID().slice(0,8)+'.service';
let original;
const checks=[];
try{
 original=remote(lanProfile,'jarvis-116',python({unit},`import base64,subprocess,os
from pathlib import Path
file=Path('/etc/jarvis-ops/node.json');original=file.read_bytes();config=json.loads(original)
unit=p['unit'];path=Path('/etc/systemd/system')/unit
if path.exists():raise RuntimeError('Acceptance unit already exists')
path.write_text('[Unit]\\nDescription=Disposable Jarvis operations acceptance\\n[Service]\\nExecStart=/usr/bin/sleep infinity\\nUser=nobody\\nNoNewPrivileges=yes\\nProtectSystem=strict\\n');os.chmod(path,0o644)
config['services'][unit]={'controllable':True,'expected':'stopped'};file.write_text(json.dumps(config));os.chmod(file,0o644)
subprocess.run(['systemctl','daemon-reload'],check=True)
print(base64.b64encode(original).decode())
`),true);
 const call=(nodeId,request)=>JSON.parse(primary(python({nodeId,request},`import subprocess
args=['runuser','-u','jarvis-control','--','/usr/bin/ssh','-F','/etc/jarvis-control/ssh_config','ops-'+p['nodeId'],'fixed-operation']
r=subprocess.run(args,input=json.dumps(p['request']),capture_output=True,text=True,timeout=70)
if not r.stdout.strip():raise RuntimeError('FIXED_SSH_FAILED '+r.stderr[-600:])
v=json.loads(r.stdout);print(json.dumps(v))
`)));
 const id116='ab2acde7-b833-4d26-a2ed-292397008b11';
 const request=(action,units=[unit])=>({version:1,mode:'execute',id:randomUUID(),machineId:id116,bindingHash:'isolated-acceptance',action,units,executeBefore:new Date(Date.now()+60000).toISOString()});
 for(const action of ['start','restart','stop']){const req=request(action),first=call('116',req),again=call('116',req);if(first.status!=='succeeded'||JSON.stringify(first)!==JSON.stringify(again))throw Error('SERVICE_ACCEPTANCE_FAILED '+action);checks.push({name:'forced-ssh-'+action+'-and-replay',passed:true});}
 for(const req of [request('restart',['unregistered.service']),{...request('restart'),shell:'arbitrary'}]){const result=call('116',req);if(result.status!=='failed')throw Error('Unauthorized operation accepted');checks.push({name:result.error,passed:true});}
 const cold=call('101',{...request('start',['jarvis-platform.service']),machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73'});if(cold.error!=='STANDBY_START_PROTECTED')throw Error('Cold role guard failed');checks.push({name:'cold-platform-start-guard',passed:true});
}finally{
 if(original)remote(lanProfile,'jarvis-116',python({unit,original},`import base64,subprocess
from pathlib import Path
subprocess.run(['systemctl','stop',p['unit']],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
Path('/etc/jarvis-ops/node.json').write_bytes(base64.b64decode(p['original']))
Path('/etc/systemd/system',p['unit']).unlink(missing_ok=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
print('{"temporaryServiceRemoved":true,"nodePolicyRestored":true}')
`),true);
}
await mkdir('artifacts/remote-operations',{recursive:true});const report={at:new Date().toISOString(),isolated,checks,temporaryServiceRemoved:true,productionPowerCommandsExecuted:0};await writeFile('artifacts/remote-operations/dispatcher-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
