/** One trusted dummy Linux lifetime proof. Never runs product source or models. */
import {open,readFile,rename,mkdir} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {sha} from './run-factory-main-repair-r26.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},toolSHA='04c8716edf4397195cbda696d62f527997a37ce2aff1300c67333caee2f34798',review=null,reviewSHA=null,jp='.jarvis-dev/maintenance/factory-r29-owner-normal-bind-r3-fixture.json';
const program=String.raw`
import os,stat,json,base64,hashlib,subprocess,time,re,uuid
from types import ModuleType
from pathlib import Path
need=lambda v,c: None if v else (_ for _ in ()).throw(RuntimeError(c))
need(os.geteuid()==0 and set(p)=={'attempt','foreignAttempt','toolBase64'} and re.fullmatch('[a-f0-9]{32}',p['attempt']) and re.fullmatch('[a-f0-9]{32}',p['foreignAttempt']) and p['attempt']!=p['foreignAttempt'],'R29_OWNER_FIXTURE_SCOPE_INVALID')
attempt=p['attempt'];foreign_attempt=p['foreignAttempt'];toolSHA='${toolSHA}';root=Path('/var/lib/jarvis-development/101/truth-gate-r29-build');tool=Path('/opt/jarvis-development/software-factory/factory-truth-gate-build-r29-'+toolSHA[:16]+'.py');image='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96';docker_env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8','DOCKER_API_VERSION':'1.49'}
def trusted(path):
 for x in [path,*path.parents]:
  s=x.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'R29_OWNER_FIXTURE_ROOT_UNTRUSTED')
def read(path):
 trusted(path);f=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(f);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=2000000,'R29_OWNER_FIXTURE_FILE_INVALID');raw=os.read(f,2000001);a=os.fstat(f);need(len(raw)==s.st_size and (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns),'R29_OWNER_FIXTURE_FILE_CHANGED');return raw
 finally:os.close(f)
def store(path,value):
 raw=(json.dumps(value,separators=(',',':'))+'\n').encode();f=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  view=memoryview(raw)
  while view:
   n=os.write(f,view);need(n>0,'R29_OWNER_FIXTURE_SHORT_WRITE');view=view[n:]
  os.fsync(f)
 finally:os.close(f)
 d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(d)
 finally:os.close(d)
def docker(args):return subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=15,env=docker_env)
def inspect(name):
 r=docker(['container','inspect',name])
 if r.returncode==0:
  v=json.loads(r.stdout);need(len(v)==1,'R29_OWNER_FIXTURE_INSPECT_FORMAT');return v[0]
 try:empty=json.loads(r.stdout)==[]
 except ValueError:empty=False
 need(r.returncode==1 and empty and r.stderr.decode().strip() in ['Error response from daemon: No such container: '+name,'Error: No such container: '+name,'Error: No such object: '+name],'R29_OWNER_FIXTURE_ABSENCE_NOT_PROVEN');return None
def process_identity(pid):
 text=Path('/proc',str(pid),'stat').read_text();fields=text[text.rfind(')')+2:].split();return {'pid':pid,'startTicks':fields[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
def alive(identity):
 try:return process_identity(identity['pid'])==identity
 except FileNotFoundError:return False
body=base64.b64decode(p['toolBase64'],validate=True);need(hashlib.sha256(body).hexdigest()==toolSHA,'R29_OWNER_FIXTURE_TOOL_CHANGED');trusted(tool.parent)
if os.path.lexists(tool):need(read(tool)==body,'R29_OWNER_FIXTURE_INSTALLED_TOOL_CHANGED')
else:
 f=os.open(tool,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o755)
 try:
  view=memoryview(body)
  while view:
   n=os.write(f,view);need(n>0,'R29_OWNER_FIXTURE_SHORT_WRITE');view=view[n:]
  os.fchmod(f,0o755);os.fsync(f)
 finally:os.close(f)
trusted(root.parent)
if not os.path.lexists(root):root.mkdir(mode=0o700)
trusted(root);need(stat.S_ISDIR(root.lstat().st_mode) and root.lstat().st_mode&0o077==0,'R29_OWNER_FIXTURE_ROOT_MODE')
ownership=root/'ownership'
if not os.path.lexists(ownership):ownership.mkdir(mode=0o700)
trusted(ownership);private=root/attempt;private.mkdir(mode=0o700)
names=['jarvis-tg-r29-'+attempt+'-'+stage for stage in ['offline-install','build','typecheck','truth-unit']];labels={'jarvis.truthgate.r29.attempt':attempt,'jarvis.truthgate.r29.kind':'build'};own=names[-1];foreign='jarvis-tg-r29-'+foreign_attempt+'-foreign';foreign_labels={'jarvis.truthgate.r29.attempt':foreign_attempt,'jarvis.truthgate.r29.kind':'foreign-owner-fixture'};unit='jarvis-tg-r29-'+attempt+'-owner.service'
for name in [*names,foreign]:need(inspect(name) is None,'R29_OWNER_FIXTURE_RESOURCE_EXISTS')
r=docker(['ps','-aq','--filter','label=jarvis.truthgate.r29.attempt='+attempt]);need(r.returncode==0 and not r.stdout.strip(),'R29_OWNER_FIXTURE_SCOPE_EXISTS')
r=docker(['image','inspect',image]);need(r.returncode==0,'R29_OWNER_FIXTURE_IMAGE_READ_FAILED');images=json.loads(r.stdout);need(len(images)==1 and images[0]['Id']==image and images[0]['Os']=='linux' and images[0]['Architecture']=='amd64' and isinstance(images[0].get('Config'),dict) and not images[0]['Config'].get('Volumes'),'R29_OWNER_FIXTURE_IMAGE_OR_VOLUMES_INVALID')
store(ownership/(attempt+'.json'),{'schemaVersion':1,'attempt':attempt,'toolSHA256':toolSHA,'sourceFingerprint':'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493','containers':names,'labels':labels,'imageID':image,'emptyResourceScopeVerified':True,'fixtureOnly':True})

# These controlled tiny inputs contain no product source or real package cache.
helper=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py');helper_body=read(helper);need(hashlib.sha256(helper_body).hexdigest()=='57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2','R29_OWNER_FIXTURE_HELPER_CHANGED')
h=ModuleType('fixture_evidence');exec(compile(helper_body,str(helper),'exec'),h.__dict__)
w=ModuleType('fixture_worker');w.__file__=str(tool);exec(compile(body,str(tool),'exec'),w.__dict__)
work=private/'work';work.mkdir(mode=0o700);os.chown(work,1000,1000);inputs=private/'fixture-inputs';inputs.mkdir(mode=0o700);caches=private/'caches';caches.mkdir(mode=0o700);copies=[]
for name in ['corepack-runtime','corepack-cache','pnpm-store']:
 source=inputs/name;source.mkdir(mode=0o700);seed=source/'exec.bin';fd=os.open(seed,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o755)
 try:os.write(fd,b'trusted-fixture-seed');os.fchmod(fd,0o755);os.fsync(fd)
 finally:os.close(fd)
 os.link(seed,source/'second.bin');(source/'data.txt').write_text('trusted-fixture-data');os.chmod(source/'data.txt',0o644);copy=w.stage_cache(h,str(source),caches/name);need(copy['files']==3 and copy['sharedHardlinks'] is False and copy['executableFilesPreservedReadOnly'] and copy['outputFullClosureDoubleRead'],'R29_OWNER_FIXTURE_COPY_INVALID');copies.append(copy)
mounts=[{'source':str(work),'destination':'/work','rw':True}]+[{'source':str(caches/name),'destination':'/'+name,'rw':False} for name in ['corepack-runtime','corepack-cache','pnpm-store']]
held=[]
for value in mounts:
 fd=h.open_directory(value['source']);held.append(fd);info=os.fstat(fd);value.update({'fd':fd,'device':info.st_dev,'inode':info.st_ino});w.assert_mount_root(value)
store(private/'state.json',{'schemaVersion':1,'kind':'root-control-nonproduct-owner-fixture','attempt':attempt,'resources':{'containers':names,'labels':labels},'creationIntent':{'name':own,'stage':'truth-unit'},'checks':[],'productSourceRead':False,'productCodeExecuted':False,'modelsInvoked':False})
def create_sleep(name,tags):
 args=['run','--rm','-d','--pull=never','--init','--name',name,'--network','none','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--memory','96m','--cpus','0.25','--pids-limit','32','--entrypoint','/usr/local/bin/node']
 if name==own:
  for mount in mounts:args+=['--mount','type=bind,src='+mount['source']+',dst='+mount['destination']+('' if mount['rw'] else ',readonly')]
 for k,v in tags.items():args+=['--label',k+'='+v]
 fixture_code="const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(process.getuid(),1000);const rows=fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\\n').map(x=>x.split(' '));const errors=[];for(const name of ['corepack-runtime','corepack-cache','pnpm-store']){const root='/'+name;assert(rows.filter(x=>x[4]===root).length===1);assert(rows.find(x=>x[4]===root)[5].split(',').includes('ro'));assert.equal(fs.readFileSync(root+'/data.txt','utf8'),'trusted-fixture-data');for(const file of ['exec.bin','second.bin']){const s=fs.statSync(root+'/'+file);assert.equal(s.uid,0);assert.equal(s.gid,0);assert.equal(s.nlink,1);assert.equal(s.mode&511,365);}assert.notEqual(fs.statSync(root+'/exec.bin').ino,fs.statSync(root+'/second.bin').ino);let rejected=false;try{fs.writeFileSync(root+'/new.txt','forbidden')}catch(e){assert(['EROFS','EACCES'].includes(e.code));errors.push(e.code);rejected=true}assert(rejected)}assert(rows.find(x=>x[4]==='/work')[5].split(',').includes('rw'));fs.writeFileSync('/work/fixture-output.json',JSON.stringify({uid:process.getuid(),cacheMutationErrors:errors,normalBind:true,readOnlyMounts:true,executableModePreserved:true,independentInodes:true}));setInterval(()=>{},1000);setTimeout(()=>process.exit(0),60000)"
 args+=[image,'-e',fixture_code if name==own else 'setInterval(()=>{},1000);setTimeout(()=>process.exit(0),60000)'];r=docker(args);need(r.returncode==0,'R29_OWNER_FIXTURE_CONTAINER_CREATE_FAILED');v=inspect(name);need(v is not None and v['Id']==r.stdout.decode().strip() and v['Image']==image and v['Config']['Labels'].items()>=tags.items() and v['Config']['User']=='1000:1000' and v['HostConfig']['NetworkMode']=='none' and v['HostConfig']['ReadonlyRootfs'] and v['HostConfig']['AutoRemove'] is True and v['HostConfig']['CapDrop']==['ALL'] and (len(v['Mounts'])==4 if name==own else not v['Mounts']),'R29_OWNER_FIXTURE_CONTAINER_SCOPE_CHANGED')
 if name==own:
  for expected in mounts:
   matched=[x for x in v['Mounts'] if x['Destination']==expected['destination']];need(len(matched)==1 and matched[0]['Type']=='bind' and matched[0]['Source']==expected['source'] and matched[0]['RW'] is expected['rw'],'R29_OWNER_FIXTURE_NORMAL_BIND_CHANGED');w.assert_mount_root(expected)
 return v
foreign_value=None;own_value=None;report={'schemaVersion':1,'kind':'software-factory-r29-nonproduct-systemd-owner-lifetime-proof','attempt':attempt,'toolSHA256':toolSHA,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productSourceMounted':False,'productCodeExecuted':False,'modelsInvoked':False,'hostDockerSocketMounted':False,'fixtureOnly':True,'productAccepted':False,'scopeUnknown':True}
try:
 own_value=create_sleep(own,labels);own_identity=process_identity(own_value['State']['Pid']);foreign_value=create_sleep(foreign,foreign_labels);foreign_identity=process_identity(foreign_value['State']['Pid']);store(private/'fixture-created.json',{'ownID':own_value['Id'],'ownIdentity':own_identity,'foreignID':foreign_value['Id'],'foreignIdentity':foreign_identity})
 wait_output=time.monotonic()+10
 while not os.path.lexists(work/'fixture-output.json') and time.monotonic()<wait_output:time.sleep(0.05)
 rootfd=h.open_directory(str(work))
 try:
  leaf=h.open_relative(rootfd,'fixture-output.json')
  try:output_info=os.fstat(leaf);need(output_info.st_uid==1000 and output_info.st_gid==1000,'R29_OWNER_FIXTURE_OUTPUT_OWNER_CHANGED');normal=json.loads(h.read_fd(leaf,2000))
  finally:os.close(leaf)
 finally:os.close(rootfd)
 need(normal['uid']==1000 and normal['normalBind'] and normal['readOnlyMounts'] and normal['executableModePreserved'] and normal['independentInodes'] and len(normal['cacheMutationErrors'])==3,'R29_OWNER_FIXTURE_NORMAL_PROOF_FAILED')
 for value in mounts:w.assert_mount_root(value)
 child_program="import subprocess,time,json,pathlib;child=subprocess.Popen(['/usr/bin/sleep','30']);pathlib.Path("+repr(str(private/'owner-child.json'))+").write_text(json.dumps({'pid':child.pid}));time.sleep(30)"
 args=['/usr/bin/systemd-run','--unit='+unit,'--property=Type=simple','--property=User=root','--property=RuntimeMaxSec=2','--property=TimeoutStopSec=300','--property=KillMode=control-group','--property=Restart=no','--property=ExecStopPost=/usr/bin/python3 '+str(tool)+' --reconcile-cleanup '+attempt,'/usr/bin/python3','-c',child_program];r=subprocess.run(args,capture_output=True,timeout=15);need(r.returncode==0,'R29_OWNER_FIXTURE_UNIT_START_FAILED')
 shown=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=MainPID,RuntimeMaxUSec,TimeoutStopUSec,ControlGroup,KillMode,ExecStopPost,Restart'],capture_output=True,text=True,timeout=10);values=dict(x.split('=',1) for x in shown.stdout.splitlines() if '=' in x)
 post=values.get('ExecStopPost','');match=re.fullmatch(r'\{\s*path=([^;{}]+?)\s*;\s*argv\[\]=(.*?)\s*;\s*ignore_errors=(yes|no)\s*;[^{}]*\}',post);need(match is not None and match.group(1)=='/usr/bin/python3' and match.group(2).split()==['/usr/bin/python3',str(tool),'--reconcile-cleanup',attempt] and match.group(3)=='no','R29_OWNER_FIXTURE_STOPPOST_NOT_EXACT')
 need(int(values.get('MainPID','0'))>1 and values.get('RuntimeMaxUSec')=='2s' and values.get('TimeoutStopUSec')=='5min' and values.get('ControlGroup')=='/system.slice/'+unit and values.get('KillMode')=='control-group' and values.get('Restart')=='no','R29_OWNER_FIXTURE_UNIT_PROPERTIES_FAILED');owner_identity=process_identity(int(values['MainPID']));closed_properties={k:values[k] for k in ['MainPID','RuntimeMaxUSec','TimeoutStopUSec','ControlGroup','KillMode','Restart']};closed_properties['exactExecStopPostVerified']=True
 wait_child=time.monotonic()+1
 while not os.path.lexists(private/'owner-child.json') and time.monotonic()<wait_child:time.sleep(0.02)
 child_record=json.loads(read(private/'owner-child.json'));child_identity=process_identity(child_record['pid']);child_groups=[x.split(':',2)[2] for x in Path('/proc',str(child_record['pid']),'cgroup').read_text().splitlines()];need(values['ControlGroup'] in child_groups,'R29_OWNER_FIXTURE_CHILD_CGROUP_MISMATCH');deadline=time.monotonic()+35
 while time.monotonic()<deadline:
  shown=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=ActiveState,SubState,Result,ExecStopPost'],capture_output=True,text=True,timeout=10);values=dict(x.split('=',1) for x in shown.stdout.splitlines() if '=' in x)
  if values.get('ActiveState') in ['inactive','failed']:break
  time.sleep(0.5)
 need(values.get('Result')=='timeout' and values.get('ActiveState') in ['inactive','failed'] and not alive(owner_identity) and not alive(child_identity),'R29_OWNER_FIXTURE_TIMEOUT_NOT_PROVEN')
 need(all(inspect(name) is None for name in names) and not alive(own_identity),'R29_OWNER_FIXTURE_OWN_RESOURCE_NOT_CLEANED');r=docker(['ps','-aq','--filter','label=jarvis.truthgate.r29.attempt='+attempt]);need(r.returncode==0 and not r.stdout.strip(),'R29_OWNER_FIXTURE_LABEL_NOT_EMPTY')
 still=inspect(foreign);need(still is not None and still['Id']==foreign_value['Id'] and still['State']['Running'] and alive(foreign_identity),'R29_OWNER_FIXTURE_FOREIGN_NOT_PRESERVED')
 reports=list((root/'reconciliations').glob(attempt+'-*.json'));need(len(reports)==1,'R29_OWNER_FIXTURE_STOPPOST_RECEIPT_MISSING');post=json.loads(read(reports[0]));need(post['exactResourceScopeObservedAbsent'] and post['attemptLabelScopeEmpty'] and not post['scopeErrors'],'R29_OWNER_FIXTURE_STOPPOST_RECEIPT_FAILED')
 report.update({'scopeUnknown':False,'ownerIdentity':owner_identity,'ownerChildIdentity':child_identity,'actualOwnerProperties':closed_properties,'ownerTimeoutObserved':True,'ownerProcessGone':True,'ownerChildGone':True,'ownContainerIdentity':own_identity,'ownContainerGone':True,'exactFourNamesAbsent':True,'attemptLabelScopeEmpty':True,'foreignWasPreserved':True,'actualProductionStopPostFunctionUsed':True,'stopPostReportSHA256':hashlib.sha256(read(reports[0])).hexdigest(),'status':'pass','normalPathBindsActuallyVerified':True,'cacheReadOnlyMountsInProcActuallyVerified':True,'cacheMutationRejected':True,'candidateUID1000Observed':True,'independentByteCopiesPreservedExec':True,'normalBindCacheCopies':copies,'cacheMutationErrors':normal['cacheMutationErrors']})
except BaseException as e:report['status']='fail';report['errorCode']=str(e) if re.fullmatch('R29_OWNER_FIXTURE_[A-Z0-9_]+',str(e)) else 'R29_OWNER_FIXTURE_OPERATION_FAILED'
finally:
 for name,tags in [(own,labels),(foreign,foreign_labels)]:
  try:
   value=inspect(name)
   if value is not None:need(value['Image']==image and value['Config']['Labels'].items()>=tags.items(),'R29_OWNER_FIXTURE_FINAL_CLEANUP_SCOPE');need(docker(['rm','-f',value['Id']]).returncode==0,'R29_OWNER_FIXTURE_FINAL_CLEANUP_FAILED')
   need(inspect(name) is None,'R29_OWNER_FIXTURE_FINAL_RESOURCE_PRESENT')
  except BaseException:report['status']='fail';report['scopeUnknown']=True;report['finalResourceCleanupUnconfirmed']=True
 for fd in held:os.close(fd)
 report['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());store(private/'fixture-final.json',report)
print(json.dumps(report))
`;
need(process.argv.length<=3&&['inspect','run'].includes(process.argv[2]??'inspect'),'R29_OWNER_FIXTURE_ARGUMENTS_INVALID');if(!review||!reviewSHA){console.log(JSON.stringify({ready:false,reason:'R29_R3_NORMAL_BIND_FIXTURE_NOT_FROZEN',productCodeExecuted:false,modelsInvoked:false}));process.exit(0)}need(sha(await readFile('scripts/factory-truth-gate-build-r29-r3.py'))===toolSHA&&sha(await readFile(review))===reviewSHA,'R29_OWNER_FIXTURE_FROZEN_TOOL_CHANGED');
if((process.argv[2]??'inspect')==='inspect'){console.log(JSON.stringify({ready:false,finiteNonproductDummyOnly:true,modelsInvoked:false,productAccepted:false}));}else{
 let q;try{q=JSON.parse(await readFile(jp,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}need(!q,'R29_OWNER_FIXTURE_ALREADY_ATTEMPTED_READ_ONLY_RECONCILE_REQUIRED');q={version:1,attempt:randomBytes(16).toString('hex'),foreignAttempt:randomBytes(16).toString('hex'),toolSHA256:toolSHA,reviewSHA256:reviewSHA,attemptedAt:new Date().toISOString()};const f=await open(jp,'wx',0o600);try{await f.writeFile(JSON.stringify(q,null,2)+'\n');await f.sync()}finally{await f.close()}
 let result;try{result=JSON.parse(remote(lanProfile,'jarvis-101',python({attempt:q.attempt,foreignAttempt:q.foreignAttempt,toolBase64:(await readFile('scripts/factory-truth-gate-build-r29-r3.py')).toString('base64')},program),true,{timeoutMs:180000}))}catch{result={schemaVersion:1,kind:'software-factory-r29-nonproduct-systemd-owner-lifetime-proof',attempt:q.attempt,status:'fail',scopeUnknown:true,errorCode:'R29_OWNER_FIXTURE_REMOTE_RESULT_UNCONFIRMED',automaticRetry:false,rawErrorExported:false,modelsInvoked:false,productAccepted:false}}
 await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const output='artifacts/software-factory/goals-r29/build-owner-lifetime-proof-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(result,null,2)+'\n',out=await open(output,'wx',0o644);try{await out.writeFile(raw);await out.sync()}finally{await out.close()}console.log(JSON.stringify({output,sha256:sha(raw),...result}));
}
