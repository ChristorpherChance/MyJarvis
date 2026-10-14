/** Versioned patch deployment, retaining the preceding release for rollback. */
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {stagedReleasePermissionFragment} from './managed-release-permission-stage.mjs';
const release=process.env.JARVIS_PATCH_RELEASE??'20261007-application-console',cfg=resolve('artifacts/server-access/lenovo/ssh-config'),archive=resolve('artifacts/managed-servers/'+release+'-code.tar.gz');
if(!/^[a-z0-9-]{1,80}$/.test(release))throw Error('Invalid release');
function run(program,args,options={}){const r=spawnSync(program,args,{encoding:'utf8',windowsHide:true,maxBuffer:1000000,timeout:120000,...options});if(r.status!==0)throw Error(program+' failed: '+r.stderr.slice(-1800));return r.stdout.trim();}
function remote(id,input){return run('ssh',['-F',cfg,'jarvis-'+id,'sudo -n python3 -'],{input});}
const phase=process.argv[2]??'stage';
if(phase==='stage'){
 async function built(dir){for(const f of await readdir(dir,{withFileTypes:true})){const source=dir+'/'+f.name;if(f.isDirectory())await built(source);else if(f.name.endsWith('.ts')&&!f.name.endsWith('.d.ts')){const output=source.replace('apps/api/src/','apps/api/dist/').replace(/\.ts$/,'.js');if((await stat(output)).mtimeMs<(await stat(source)).mtimeMs)throw Error('Compile API before staging: '+source);}}}
 await built('apps/api/src');
 if(!(await readFile('apps/api/dist/runtime/cluster-runtime.js','utf8')).includes("PLATFORM_BUILD = '"+release+"'"))throw Error('Compiled release does not match');
 const publicList=release==='20261012-supervision-r27-1'?'artifacts/software-factory/acceptance-r27/platform-release-public-files.json':['20261012-supervision-r28-1','20261012-supervision-r28-2'].includes(release)?'artifacts/software-factory/acceptance-r28/platform-release-public-files.json':null;
 const extraPublic=publicList?JSON.parse(await readFile(publicList,'utf8')).files:[];
 if(!Array.isArray(extraPublic)||extraPublic.some(p=>typeof p!=='string'||p.includes('..')||p.includes('\\')||!p.startsWith('docs/')&&!p.startsWith('artifacts/software-factory/')))throw Error('Invalid release public references');
 run('tar',['-czf',archive,...extraPublic,'docs/通用项目监管与软件工厂测试执行.md','docs/通用项目监管与软件工厂测试执行.html','docs/软件工厂现有成果首轮验收报告.md','docs/软件工厂现有成果首轮验收报告.html','artifacts/software-factory/acceptance-r24/main-baseline-independent-review-source-update-second-r24.json',...JSON.parse(await readFile('artifacts/software-factory/autonomy-r22/public-guide-files.json','utf8')).files.map(f=>f.path),'README.md','docs/软件工厂现有成果验收与修复计划.md','docs/软件工厂现有成果验收与修复计划.html','artifacts/software-factory/acceptance-r24/acceptance-first-plan.json','artifacts/software-factory/acceptance-r24/source-and-fixed-entry-readiness.json','artifacts/software-factory/acceptance-r24/fixed-entry-boundaries.json','artifacts/software-factory/acceptance-r24/main-baseline-start-1791712985295.json','artifacts/software-factory/acceptance-r24/main-baseline-independent-review.json','docs/贾维斯建设档案.md','docs/贾维斯建设档案.html','docs/贾维斯建设日志.md','docs/贾维斯建设日志.html','docs/软件工厂无人值守交付总纲.md','docs/软件工厂无人值守交付总纲.html','scripts/project-autonomy-contract.cjs','docs/软件工厂接入与用量总账.md','docs/软件工厂接入与用量总账.html','scripts/software-factory-usage-observer.mjs','scripts/install-software-factory-usage-observer.mjs','scripts/test-software-factory-usage-observer.mjs','scripts/software-factory-contract.cjs','scripts/execution-runtime-contract.cjs','scripts/usage-ledger-contract.cjs','scripts/install-software-factory-node.mjs','scripts/software-factory-validation-wrapper.py','scripts/software-factory-validation.mjs','scripts/verify-software-factory-integration.mjs','docs/语音多语言与联网使用说明.md','docs/语音多语言与联网使用说明.html','docs/联网搜索与新闻接入.md','docs/联网搜索与新闻接入.html','docs/快慢模型路由与等待回复.md','docs/快慢模型路由与等待回复.html','docs/即时语音对话与书房验收.md','docs/即时语音对话与书房验收.html','docs/NAS接入与验收.md','docs/NAS接入与验收.html','docs/手机适配与英文唤醒.md','docs/手机适配与英文唤醒.html','docs/开发监督与双机接入.md','docs/开发监督与双机接入.html','docs/execution-runtime.md','apps/agent/src','scripts/prepare-development-node.mjs','scripts/build-development-node-package.mjs','apps/api/src','apps/api/dist','apps/api/test','apps/api/resources','apps/web/src','apps/web/public','apps/web/dist','docs/openapi-v1-planned.json','scripts/node-observer.mjs','scripts/cloud-node-collector.py','scripts/qnap-node-collector.sh','scripts/qnap-node-collector.py','scripts/qnap-protection-collector.py','scripts/install-managed-relay.py','scripts/managed-project-resources.py','scripts/cloud-node-relay.mjs','scripts/test-cloud-node-relay.mjs','scripts/test-linux-entrypoint.mjs','scripts/validate-linux-node.mjs','scripts/remote-ops-dispatcher.py','scripts/remote-ops-controller.mjs','scripts/install-remote-ops-node.py','scripts/install-remote-ops-controller.py','scripts/install-remote-ops-ingress.py','scripts/test-remote-ops-dispatcher.py','scripts/local-power-sampler.py','scripts/install-local-power.mjs','scripts/connect-superopen.mjs','scripts/connect-cc-gateway.mjs','scripts/prepare-resident-voice.py']);
 const hash=createHash('sha256').update(await readFile(archive)).digest('hex'),nodes=[];
 for(const id of ['101','112']){
  const target='/home/superopen/jarvis-managed-code.tar.gz';run('sftp',['-F',cfg,'-b','-','jarvis-'+id],{input:'put "'+archive.replaceAll('\\','/')+'" "'+target+'"\n'});
  const code=`import hashlib,os,subprocess,tarfile,json,stat,uuid
from pathlib import Path
${stagedReleasePermissionFragment}
source=Path('${target}');target=Path('/opt/jarvis/releases/${release}')
if hashlib.sha256(source.read_bytes()).hexdigest()!='${hash}':raise RuntimeError('Upload hash mismatch')
for ancestor in [target.parent,*target.parent.parents]:
 s=ancestor.lstat()
 if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('Release ancestor is unsafe')
if target.is_symlink():raise RuntimeError('Release root must not be a symlink')
existing=target.exists()
if existing and target.resolve()==Path('/opt/jarvis/current').resolve():raise RuntimeError('Refusing to stage over the current release')
if not target.exists():
 os.umask(0o022);target.mkdir(mode=0o755);subprocess.run(['cp','-a','/opt/jarvis/current/.',str(target)],check=True)
target_fd=os.open(target,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
try:
 if os.fstat(target_fd).st_uid!=0:raise RuntimeError('Release owner is unsafe')
 marker_fd=os.open('.managed-release.sha256',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=target_fd)
 try:
  marker_stat=os.fstat(marker_fd)
  if not stat.S_ISREG(marker_stat.st_mode) or marker_stat.st_uid!=0 or marker_stat.st_nlink!=1 or not 0<marker_stat.st_size<=1024:raise RuntimeError('Inherited release marker is unsafe')
  prior_marker_sha=os.read(marker_fd,1025).decode().strip()
  if not re.fullmatch('[a-f0-9]{64}',prior_marker_sha) or existing and prior_marker_sha!='${hash}':raise RuntimeError('Existing release differs; refusing overwrite')
 finally:os.close(marker_fd)
finally:os.close(target_fd)
permission_before_extract=apply_staged_release_permissions('${release}',prior_marker_sha)
for relative in ['apps/api/dist','apps/web/dist']:
 import shutil
 path=target/relative
 cursor=target
 for part in ['.',*Path(relative).parts]:
  cursor=cursor/part
  if cursor.exists() or cursor.is_symlink():
   s=cursor.lstat()
   if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('Compiled destination directory is unsafe')
 if path.is_dir():shutil.rmtree(path)
def preserve_release_modes(member,destination):
 filtered=tarfile.data_filter(member,destination)
 path=Path(destination)/filtered.name
 if filtered.isreg() and (path.exists() or path.is_symlink()):
  s=path.lstat()
  if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022:raise RuntimeError('Release overlay file is unsafe')
  if filtered.mode is not None:filtered.mode &= stat.S_IMODE(s.st_mode)
 return filtered
with tarfile.open(source) as archive:
 for member in archive.getmembers():
  if member.name.startswith('/') or '..' in Path(member.name).parts or member.issym() or member.islnk():raise RuntimeError('Unsafe release archive')
  cursor=target
  for part in Path(member.name).parts:
   cursor=cursor/part
   if cursor.exists() or cursor.is_symlink():
    s=cursor.lstat()
    if not (stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode)) or s.st_uid!=0 or s.st_mode&0o022 or stat.S_ISREG(s.st_mode) and s.st_nlink!=1:raise RuntimeError('Release archive destination is unsafe')
 archive.extractall(target,filter=preserve_release_modes)
target_fd=os.open(target,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
try:
 if os.fstat(target_fd).st_uid!=0:raise RuntimeError('Release owner is unsafe')
 marker_name='.managed-release.sha256.'+str(uuid.uuid4())+'.tmp'
 marker_fd=os.open(marker_name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644,dir_fd=target_fd)
 with os.fdopen(marker_fd,'w') as marker_stream:
  marker_stream.write('${hash}\\n');marker_stream.flush();os.fsync(marker_stream.fileno())
 os.replace(marker_name,'.managed-release.sha256',src_dir_fd=target_fd,dst_dir_fd=target_fd);os.fsync(target_fd)
finally:os.close(target_fd)
subprocess.run(['chgrp','-R','--no-dereference','jarvis',str(target)],check=True)
permission_result=apply_staged_release_permissions('${release}','${hash}')
print(json.dumps({'node':'${id}','release':'${release}','codeSHA256':'${hash}','staged':True,'permissionsHardened':permission_result['verified'],'permissionChanges':len(permission_before_extract['applied'])+len(permission_result['applied']),'permissionRule':'old_mode & ~0o022'}))
`;
  nodes.push(JSON.parse(remote(id,code)));
 }
 await writeFile('artifacts/managed-servers/'+release+'-release.json',JSON.stringify({release,codeSHA256:hash,nodes},null,2));console.log(JSON.stringify({release,codeSHA256:hash,nodes}));
}else if(phase==='activate'){
 const results=[];
 for(const id of ['101','112']){
 const code=`import os,json,subprocess,time,ssl,urllib.request,shutil
from pathlib import Path
release='${release}';target=Path('/opt/jarvis/releases')/release
if not (target/'.managed-release.sha256').is_file():raise RuntimeError('Release not staged')
config=Path('/etc/jarvis/node.json');old=config.read_bytes();current=Path('/opt/jarvis/current');prior=current.resolve()
saved=Path('/var/lib/jarvis-control/pre-${release}');saved.mkdir(mode=0o700,exist_ok=True)
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
 await writeFile('artifacts/managed-servers/'+release+'-activation.json',JSON.stringify({release,at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
}else throw Error('Use stage or activate');

