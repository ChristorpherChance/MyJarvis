/** Versioned patch deployment, retaining the preceding release for rollback. */
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const release='20261007-cloud-monitoring',cfg=resolve('artifacts/server-access/lenovo/ssh-config'),archive=resolve('artifacts/cloud-nodes/code.tar.gz');
function run(program,args,options={}){const r=spawnSync(program,args,{encoding:'utf8',windowsHide:true,maxBuffer:1000000,timeout:120000,...options});if(r.status!==0)throw Error(program+' failed: '+r.stderr.slice(-1800));return r.stdout.trim();}
function remote(id,input){return run('ssh',['-F',cfg,'jarvis-'+id,'sudo -n python3 -'],{input});}
const phase=process.argv[2]??'stage';
if(phase==='stage'){
 run('tar',['-czf',archive,'apps/api/src','apps/api/dist','apps/api/test','apps/web/src','apps/web/dist','docs/openapi-v1-planned.json','scripts/node-observer.mjs','scripts/cloud-node-collector.py','scripts/cloud-node-relay.mjs','scripts/test-cloud-node-relay.mjs','scripts/test-linux-entrypoint.mjs','scripts/validate-linux-node.mjs']);
 const hash=createHash('sha256').update(await readFile(archive)).digest('hex'),nodes=[];
 for(const id of ['101','112']){
  const target='/home/superopen/jarvis-cloud-code.tar.gz';run('sftp',['-F',cfg,'-b','-','jarvis-'+id],{input:'put "'+archive.replaceAll('\\','/')+'" "'+target+'"\n'});
  const code=`import hashlib,os,subprocess,tarfile,json
from pathlib import Path
source=Path('${target}');target=Path('/opt/jarvis/releases/${release}')
if hashlib.sha256(source.read_bytes()).hexdigest()!='${hash}':raise RuntimeError('Upload hash mismatch')
if not target.exists():
 target.mkdir();subprocess.run(['cp','-a','/opt/jarvis/current/.',str(target)],check=True)
else:
 marker=target/'.cloud-release.sha256'
 if not marker.exists() or marker.read_text().strip()!='${hash}':raise RuntimeError('Existing release differs; refusing overwrite')
for relative in ['apps/api/dist','apps/web/dist']:
 import shutil
 path=target/relative
 if str(path).startswith(str(target)+'/') and path.is_dir() and not path.is_symlink():shutil.rmtree(path)
with tarfile.open(source) as archive:
 for member in archive.getmembers():
  if member.name.startswith('/') or '..' in Path(member.name).parts or member.issym() or member.islnk():raise RuntimeError('Unsafe release archive')
 archive.extractall(target,filter='data')
(target/'.cloud-release.sha256').write_text('${hash}\\n')
subprocess.run(['chgrp','-R','jarvis',str(target)],check=True);subprocess.run(['chmod','-R','g+rX',str(target)],check=True)
print(json.dumps({'node':'${id}','release':'${release}','codeSHA256':'${hash}','staged':True}))
`;
  nodes.push(JSON.parse(remote(id,code)));
 }
 await writeFile('artifacts/cloud-nodes/release.json',JSON.stringify({release,codeSHA256:hash,nodes},null,2));console.log(JSON.stringify({release,codeSHA256:hash,nodes}));
}else if(phase==='activate'){
 const results=[];
 for(const id of ['101','112']){
 const code=`import os,json,subprocess,time,ssl,urllib.request,shutil
from pathlib import Path
release='${release}';target=Path('/opt/jarvis/releases')/release
if not (target/'.cloud-release.sha256').is_file():raise RuntimeError('Release not staged')
config=Path('/etc/jarvis/node.json');old=config.read_bytes();current=Path('/opt/jarvis/current');prior=current.resolve()
saved=Path('/var/lib/jarvis-control/pre-cloud-monitoring');saved.mkdir(mode=0o700,exist_ok=True)
if not (saved/'node.json').exists():(saved/'node.json').write_bytes(old)
(saved/'previous-release.txt').write_text(str(prior))
try:
 subprocess.run(['systemctl','stop','jarvis-observer.service'],check=True)
 if '${id}'=='112':subprocess.run(['systemctl','stop','jarvis-platform.service'],check=True)
 if not (saved/'data').exists():shutil.copytree('/var/lib/jarvis/data',saved/'data',symlinks=True)
 value=json.loads(old);value['release']=release
 temp=config.with_suffix('.next');temp.write_text(json.dumps(value));os.chown(temp,config.stat().st_uid,config.stat().st_gid);os.chmod(temp,0o640);os.replace(temp,config)
 next=current.with_name('current.next')
 if next.is_symlink():next.unlink()
 next.symlink_to(target);os.replace(next,current)
 subprocess.run(['systemctl','start','jarvis-observer.service'],check=True)
 if '${id}'=='112':subprocess.run(['systemctl','start','jarvis-platform.service'],check=True)
 context=ssl.create_default_context(cafile='/etc/jarvis/tls/ca.crt')
 for attempt in range(20):
  try:
   if '${id}'=='112':
    with urllib.request.urlopen('https://127.0.0.1:3140/api/health',context=context,timeout=5) as r:health=json.load(r)
    if health.get('build')!=release:raise RuntimeError('Unexpected business build')
   req=urllib.request.Request('https://127.0.0.1:3141/status',headers={'x-jarvis-node-token':value['observerToken']})
   with urllib.request.urlopen(req,context=context,timeout=5) as r:observer=json.load(r)
   if observer['build']!=release:raise RuntimeError('Unexpected observer build')
   break
  except Exception:
   if attempt==19:raise
   time.sleep(1)
 print(json.dumps({'node':'${id}','release':release,'previousRelease':str(prior),'active':True,'businessHealthy':observer['businessHealthy']}))
except Exception:
 subprocess.run(['systemctl','stop','jarvis-platform.service','jarvis-observer.service'])
 config.write_bytes(old);os.chmod(config,0o640)
 next=current.with_name('current.next')
 if next.is_symlink():next.unlink()
 next.symlink_to(prior);os.replace(next,current)
 subprocess.run(['systemctl','start','jarvis-observer.service'])
 if '${id}'=='112':subprocess.run(['systemctl','start','jarvis-platform.service'])
 raise
`;
  results.push(JSON.parse(remote(id,code)));
 }
 await writeFile('artifacts/cloud-nodes/activation.json',JSON.stringify({release,at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
}else throw Error('Use stage or activate');
