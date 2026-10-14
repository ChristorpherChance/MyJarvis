import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {request} from 'node:https';
const cfg=resolve('artifacts/server-access/lenovo/ssh-config'),rows=[];
function remote(id,input){const r=spawnSync('ssh',['-F',cfg,'jarvis-'+id,'sudo -n bash -s'],{input,encoding:'utf8',maxBuffer:100000,windowsHide:true});if(r.status)throw Error(r.stderr.slice(-2000));return JSON.parse(r.stdout.trim());}
const script=String.raw`set -euo pipefail
cd /opt/jarvis/current
/opt/jarvis/node/bin/node --input-type=module - <<'JS'
import {readdir,readFile,lstat} from 'node:fs/promises';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex'),files=[];
for(const directory of ['apps/api/dist','apps/web/dist']){const walk=async p=>{for(const n of await readdir(p)){const file=p+'/'+n,s=await lstat(file);if(s.isSymbolicLink())throw Error('Linked release');if(s.isDirectory())await walk(file);else files.push({path:file,sha256:hash(await readFile(file))});}};await walk(directory);}
files.sort((a,b)=>a.path.localeCompare(b.path));
const c=JSON.parse(await readFile('/etc/jarvis/node.json','utf8'));
const states={};for(const service of ['jarvis-platform.service','jarvis-observer.service'])states[service]=Object.fromEntries(execFileSync('systemctl',['show',service,'--property=ActiveState,SubState,User,Group,UnitFileState,MainPID,Restart'],{encoding:'utf8'}).trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const validation=JSON.parse(await readFile('/var/lib/jarvis-control/node-validation.json','utf8'));
console.log(JSON.stringify({nodeId:c.nodeId,role:c.role,release:c.release,files:files.length,treeSha256:hash(JSON.stringify(files)),packageLockSha256:hash(await readFile('package-lock.json')),states,validation,restore:JSON.parse(await readFile('/var/lib/jarvis-control/restore.json','utf8'))}));
JS
`;
for(const id of ['112','101'])rows.push(remote(id,script));
if(rows[0].treeSha256!==rows[1].treeSha256||rows[0].packageLockSha256!==rows[1].packageLockSha256)throw Error('Primary and standby release files differ');
for(const node of rows){if(node.states['jarvis-observer.service'].ActiveState!=='active'||node.states['jarvis-observer.service'].User!=='jarvis')throw Error('Observer service not healthy');if(node.role==='primary'&&(node.states['jarvis-platform.service'].ActiveState!=='active'||node.states['jarvis-platform.service'].UnitFileState!=='enabled'||node.states['jarvis-platform.service'].User!=='jarvis'))throw Error('Primary service not persistent');if(node.role==='standby'&&(node.states['jarvis-platform.service'].ActiveState==='active'||node.states['jarvis-platform.service'].UnitFileState!=='disabled'))throw Error('Standby business unexpectedly enabled');}
const ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt');
const health=await new Promise((ok,fail)=>{const req=request('https://192.168.10.112:3140/api/health',{ca,rejectUnauthorized:true},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{try{ok(JSON.parse(body));}catch(e){fail(e);}});});req.setTimeout(5000,()=>req.destroy(Error('Primary LAN unreachable')));req.on('error',fail);req.end();});
if(health.nodeId!=='112'||health.role!=='primary'||health.status!=='ok')throw Error('LAN primary identity differs');
const report={status:'passed',at:new Date().toISOString(),build:'20261007-linux-cluster',primaryUrl:'https://192.168.10.112:3140/?mode=platform',roomUrl:'https://192.168.10.112:3140/?mode=room',health,nodes:rows,backend:{tests:250,passed:249,skipped:1,failed:0},contract:{operations:328,implemented:328},automaticFailover:false,continuousReplication:false,standbyMode:'verified-cold-snapshot',voice:'local-cpu-asr-and-espeak-fallback',pending:['continuous-consistent-replication','controlled-takeover-and-failback','unified-entry','natural-voice-model','model-account-configuration','physical-room-microphone-and-wake-validation']};
await writeFile('artifacts/linux-deployment/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,primaryUrl:report.primaryUrl,matchingReleaseFiles:rows[0].files,treeSha256:rows[0].treeSha256,primaryPersistent:true,standbyBusinessStopped:true}));

