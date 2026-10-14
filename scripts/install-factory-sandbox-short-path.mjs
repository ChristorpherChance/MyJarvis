/** Fixed short-socket repair and Linux bind-only smoke. No business tests or Docker request. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {queueState,nodeState} from './run-factory-supervision-probe.mjs';
const args=process.argv.slice(2);if(args.length>1||args.some(a=>a!=='--execute'))throw Error('FIXED_SHORT_PATH_INSTALL_ARGUMENTS_REQUIRED');
const runId='c7371ba5ca53fa324aaafdf7ce78ad20e109fa38',source='25ae0ce3523832bedac7d0838d0061f6a57a5af4a112f2d25e8551a980f4f4bf';
const definitions=[['factory-sandbox-broker.py','d4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954','67c395f44314650b650608a121191c314d353b23489cc07b734a2471a7fee3dc'],['factory-sandbox-broker-control.py','43afea4244f741bbaa3b4d347304c51e6886b8533aceb04967a439de0a4d3dbd','36cc0c61996328a233c246601bf2972069e0df6af316934f10c69d58e2a69472']];
const files=await Promise.all(definitions.map(async([name,sha,before])=>{const bytes=await readFile('scripts/'+name);if(bytes.includes(13)||createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('SHORT_SOCKET_REVIEWED_LOCAL_HASH_CHANGED');return {name,sha,before,base64:bytes.toString('base64')};}));
const q=queueState(),n=nodeState();if(q.allActive!==0||n.template.engine!=='claude'||n.unit.ActiveState!=='active'||n.unit.SubState!=='running')throw Error('SHORT_SOCKET_INSTALL_REQUIRES_IDLE_RESTORED_NODE');
const execute=args.includes('--execute');
const report=await withPlatform(async({api})=>{
 const caps=(await api('/api/v1/execution/capabilities')).data;if(caps.supervised!==false)throw Error('SHORT_SOCKET_INSTALL_REQUIRES_GLOBAL_SUPERVISION_OFF');
 return JSON.parse(remote(lanProfile,'jarvis-101',python({files,execute,runId,source},String.raw`import base64,hashlib,os,stat,subprocess
from pathlib import Path
folder=Path('/opt/jarvis-development/software-factory');audit=Path('/var/lib/jarvis-development/101/sandbox-short-path-install-r1')
def trusted(path):
 for q in [path,*path.parents]:
  s=q.lstat()
  if s.st_uid!=0 or stat.S_ISLNK(s.st_mode) or s.st_mode&0o022:raise RuntimeError('SHORT_SOCKET_INSTALL_TRUSTED_PATH_REQUIRED')
trusted(folder)
copy=Path('/var/lib/jarvis-development/101/full-validation')/p['runId']/'copy.json';trusted(copy)
if json.loads(copy.read_text()).get('sha256')!=p['source']:raise RuntimeError('OLD_FIXED_COPY_IDENTITY_REQUIRED')
owned=subprocess.run(['/usr/bin/docker','ps','-a','--filter','label=jarvis.validation.runId='+p['runId'],'--format','{{.Names}}'],capture_output=True,text=True,timeout=10)
if owned.returncode or owned.stdout.strip():raise RuntimeError('OLD_RUN_CONTAINER_STILL_PRESENT')
installed=[]
for file in p['files']:
 dest=folder/file['name'];trusted(dest);blob=base64.b64decode(file['base64']);before=hashlib.sha256(dest.read_bytes()).hexdigest()
 if b'\r' in blob or hashlib.sha256(blob).hexdigest()!=file['sha'] or before!=file['before']:raise RuntimeError('SHORT_SOCKET_INSTALL_HASH_CAS_FAILED')
 compile(blob,str(dest),'exec');installed.append({'file':str(dest),'sourceSHA256':file['sha'],'beforeSHA256':before,'installedSHA256':None})
if not p['execute']:print(json.dumps({'prepared':True,'files':installed,'businessTestsRun':False,'executeRequested':False}));raise SystemExit(0)
audit.mkdir(mode=0o700);trusted(audit)
for file,row in zip(p['files'],installed):
 dest=folder/file['name'];backup=audit/(file['name']+'.before');fd=os.open(backup,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as out:out.write(dest.read_bytes())
 temp=folder/(file['name']+'.short-path-new');fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o644)
 with os.fdopen(fd,'wb') as out:out.write(base64.b64decode(file['base64']))
 os.chmod(temp,0o644);os.replace(temp,dest);row['installedSHA256']=hashlib.sha256(dest.read_bytes()).hexdigest()
 if row['installedSHA256']!=file['sha']:raise RuntimeError('SHORT_SOCKET_INSTALLED_HASH_CHANGED')
log=audit/'bind-smoke.log';fd=os.open(log,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb') as out:r=subprocess.run(['/usr/bin/python3',str(folder/'factory-sandbox-broker-control.py'),'--check-bind',p['runId'],p['source']],stdout=out,stderr=out,timeout=30)
smoke=None
for line in log.read_text().splitlines():
 try:row=json.loads(line)
 except ValueError:continue
 if isinstance(row,dict) and type(row.get('ok')) is bool:smoke=row
if r.returncode!=0 or not smoke or smoke.get('ok') is not True or smoke.get('daemonActions')!=0:raise RuntimeError('ACTUAL_LINUX_SHORT_SOCKET_BIND_FAILED')
print(json.dumps({'installed':True,'files':installed,'bindSmoke':smoke,'bindSmokeExitCode':r.returncode,'bindPrivateLogSHA256':hashlib.sha256(log.read_bytes()).hexdigest(),'rawLogsExported':False,'businessTestsRun':False,'modelsInvoked':False,'currentSourceValidated':False,'copySourceFingerprint':p['source']}))
`),true));
});
const name=execute?'tool-install-and-linux-bind-smoke.json':'tool-prepare.json';
await writeFile('artifacts/software-factory/full-test/sandbox-short-path-r1/'+name,JSON.stringify({at:new Date().toISOString(),queue:q,globalSupervision:false,...report},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
