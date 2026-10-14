/** Cold migration; the old business is paused before either restored copy starts. */
import {readFile,writeFile,mkdir,rename,readdir,lstat,cp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {controlService} from './platform-service.mjs';
const root=process.cwd(),data=resolve(root,'.jarvis'),cfg=join(root,'artifacts/server-access/lenovo/ssh-config'),build='20261007-linux-cluster';
const modelReuse=process.env.JARVIS_MODEL_REUSE??'';
if(modelReuse&&!/^\/var\/lib\/jarvis-control\/failed-migration-[0-9]+\/data\/runtime\/models\/whisper-tiny$/.test(modelReuse))throw Error('Model reuse must name an exact preserved failed batch');
const batchId='migration-'+new Date().toISOString().replace(/[^0-9]/g,''),backup=resolve(root,'artifacts/backups',batchId),packed=backup+'-transfer',archive=backup+'-transfer.tar.gz',marker=join(root,'.deployment/retired-data.json'),entry=join(root,'apps/api/dist/index.js'),hold=join(root,'apps/api/dist/index.migration-hold.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function remote(id,lines){const r=spawnSync('ssh',['-F',cfg,'jarvis-'+id,'sudo -n bash -s'],{input:lines.join('\n')+'\n',encoding:'utf8',windowsHide:true,maxBuffer:2e6});if(r.status)throw Error('Node '+id+': '+r.stderr.slice(-5000));return r.stdout;}
function local(args,env={}){const r=spawnSync(args[0],args.slice(1),{cwd:root,env:{...process.env,...env},encoding:'utf8',windowsHide:true,maxBuffer:2e6});if(r.status)throw Error(r.stderr.slice(-4000));return r.stdout;}
const health=await fetch('http://127.0.0.1:3140/api/health',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
if(health.build!==build||health.status!=='ok')throw Error('Local guarded release must be healthy before migration');
if(existsSync(marker)||existsSync(hold))throw Error('Migration already exists; inspect state before continuing');
const state=await controlService(data,'status');if(!state.childPid)throw Error('Owned local service is not running');
for(const id of ['112','101'])remote(id,['set -e','[ ! -e /var/lib/jarvis-control/restore.json ]','[ -z "$(find /var/lib/jarvis/data -mindepth 1 -maxdepth 1 -print -quit)" ]','! systemctl is-active --quiet jarvis-platform.service']);
let held=false,started=false,retired=false;
try{
 await rename(entry,hold);held=true;await controlService(data,'restart');
 const start=Date.now();while(existsSync(join(data,'runtime.pid'))){if(Date.now()-start>45000)throw Error('Old business did not stop');await delay(200);}
 const snapshotAt=new Date().toISOString();console.log('Old business stopped; creating complete cold backup.');
 console.log(local([process.execPath,join(root,'scripts/backup.mjs'),backup],{JARVIS_DATA_DIR:data}).trim());
 await mkdir(packed,{mode:0o700});
 const identity=local(['whoami.exe','/user','/fo','csv','/nh']).match(/S-1-\d+(?:-\d+)+/)?.[0];if(!identity)throw Error('Cannot protect migration files');
 local(['icacls.exe',packed,'/inheritance:r','/grant:r','*'+identity+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']);
 for(const name of await readdir(backup))await cp(join(backup,name),join(packed,name),{recursive:true,errorOnExist:true,force:false,filter:path=>{const rel=relative(backup,path).replaceAll('\\','/');return rel!=='runtime/local-service'&&!rel.startsWith('runtime/local-service/')&&!/(?:-wal|-shm)$/.test(rel)&&rel!=='runtime.pid';}});
 const files=[];async function walk(dir){for(const name of await readdir(dir)){const file=join(dir,name),info=await lstat(file);if(info.isSymbolicLink())throw Error('Linked backup entry');if(info.isDirectory())await walk(file);else{const bytes=await readFile(file);files.push({path:relative(packed,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}await walk(packed);
 if(!files.some(f=>f.path==='runtime/voice-master.key')||!files.some(f=>f.path==='execution/execution.sqlite'))throw Error('Incomplete backup');
 const manifest={version:1,batchId,snapshotAt,build,originalDataDir:data,files},transferFile=backup+'-transfer.json';await writeFile(transferFile,JSON.stringify(manifest));
 local(['icacls.exe',transferFile,'/inheritance:r','/grant:r','*'+identity+':F','*S-1-5-18:F']);
 local(['tar','-czf',archive,...(modelReuse?['--exclude=./runtime/models/whisper-tiny']:[]),'-C',packed,'.']);local(['icacls.exe',archive,'/inheritance:r','/grant:r','*'+identity+':F','*S-1-5-18:F']);const archiveHash=sha(await readFile(archive));
 const restorations=[];
 for(const id of ['112','101']){
  const stage='/var/lib/jarvis-control/'+batchId;remote(id,['set -e','install -d -o root -g root -m 0700 '+stage]);
  const upload='/var/cache/jarvis-upload/'+batchId;remote(id,['set -e','install -d -o superopen -g superopen -m 0700 /var/cache/jarvis-upload','install -d -o superopen -g superopen -m 0700 '+upload]);
  for(const[file,name]of [[archive,'data.tar.gz'],[transferFile,'transfer.json']]){const r=spawnSync('scp',['-F',cfg,file,'jarvis-'+id+':'+upload+'/'+name],{encoding:'utf8',windowsHide:true,maxBuffer:50000});if(r.status)throw Error('Private backup transfer failed');remote(id,['set -e','[ ! -L '+upload+'/'+name+' ]','install -o root -g root -m 0600 '+upload+'/'+name+' '+stage+'/'+name,'rm -- '+upload+'/'+name]);}
  const reuse=modelReuse?['[ "$(realpath '+modelReuse+')" = '+modelReuse+' ]','[ -d '+modelReuse+' ]','[ ! -L '+modelReuse+' ]','install -d -o jarvis -g jarvis -m 0700 /var/lib/jarvis/data/runtime/models','cp -a '+modelReuse+' /var/lib/jarvis/data/runtime/models/whisper-tiny']:[];
  const output=remote(id,['set -euo pipefail',"printf '%s  %s\\n' '"+archiveHash+"' '"+stage+"/data.tar.gz' | sha256sum --check - >/dev/null",'[ -z "$(find /var/lib/jarvis/data -mindepth 1 -maxdepth 1 -print -quit)" ]','tar -xzf '+stage+'/data.tar.gz --no-same-owner -C /var/lib/jarvis/data',...reuse,'chown -R jarvis:jarvis /var/lib/jarvis/data','chmod -R go-rwx /var/lib/jarvis/data','install -o root -g jarvis -m 0640 '+stage+'/transfer.json /var/lib/jarvis-control/transfer.json','cd /opt/jarvis/current','runuser -u jarvis -- /opt/jarvis/node/bin/node scripts/prepare-linux-data.mjs /var/lib/jarvis/data /var/lib/jarvis-control/transfer.json']);
  const result=JSON.parse(output.trim()),snapshot=result.snapshot;restorations.push({nodeId:id,...snapshot,remappedPaths:result.remappedPaths});
  remote(id,['set -e','umask 027',"printf '%s' '"+Buffer.from(JSON.stringify(snapshot)).toString('base64')+"' | base64 -d > /var/lib/jarvis-control/restore.json",'chown root:jarvis /var/lib/jarvis-control/restore.json','chmod 0640 /var/lib/jarvis-control/restore.json']);
 }
 await mkdir(join(root,'.deployment'),{recursive:true});await writeFile(marker,JSON.stringify({version:1,retiredDataDir:data,destination:'112'}),{flag:'wx'});retired=true;
 await rename(hold,entry);held=false;
 started=true;remote('112',['set -e','systemctl enable --now jarvis-platform.service jarvis-observer.service']);
 remote('101',['set -e','systemctl enable --now jarvis-observer.service','! systemctl is-active --quiet jarvis-platform.service']);
 const verified=remote('112',['set -euo pipefail','for i in $(seq 1 30); do if curl --fail --silent --cacert /etc/jarvis/tls/ca.crt https://127.0.0.1:3140/api/health > /var/lib/jarvis-control/activation-health.json; then break; fi; sleep 1; done',"/opt/jarvis/node/bin/node --input-type=module - <<'JS'","import fs from 'node:fs';const h=JSON.parse(fs.readFileSync('/var/lib/jarvis-control/activation-health.json'));if(h.status!=='ok'||h.nodeId!=='112'||h.role!=='primary'||h.build!=='20261007-linux-cluster')throw Error('Primary identity mismatch');console.log(JSON.stringify(h));",'JS']);
 await controlService(data,'stop').catch(()=>{});
 const report={status:'passed',at:new Date().toISOString(),build,sourceBusinessStopped:true,oldDataRetired:true,primary:'112',standby:'101',automaticFailover:false,continuousReplication:false,backup,restorations,health:JSON.parse(verified.trim())};await writeFile(join(root,'artifacts/linux-deployment/migration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){
 if(started)remote('112',['set -e','systemctl disable --now jarvis-platform.service','! systemctl is-active --quiet jarvis-platform.service']);
 if(retired)await rm(marker);
 if(held){await rename(hold,entry);held=false;}
 await controlService(data,'restart').catch(()=>{});
 await writeFile(join(root,'artifacts/linux-deployment/migration-failed.json'),JSON.stringify({status:'failed',at:new Date().toISOString(),reason:error.message,backup,remoteDataPreserved:true}));
 throw error;
}
