/** Controlled 101 onboarding. No AI run is started by this installer. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';

export const FACTORY_NODE={machineId:'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',projectId:'70ec346f-6520-46ed-abed-22cac770a3e4',templateId:'msf-101-claude',source:'/home/superopen/All-Projects/msf',workspaceRoot:'/home/superopen/All-Projects',config:'/var/lib/jarvis-development/101/config.json',unit:'jarvis-software-factory-development.service',apiUrl:'https://192.168.10.112:3140'};
export function factoryTemplate(){return {id:FACTORY_NODE.templateId,machineId:FACTORY_NODE.machineId,engine:'claude',program:'/home/superopen/opt/node22/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe',args:['--print','{prompt}','--output-format','stream-json','--verbose','--max-budget-usd','{maxBudgetUSD}','--model','gpt-6.1-sol[1m]'],workspaceRoot:FACTORY_NODE.workspaceRoot,maxRounds:10,timeoutSec:1200,leaseSec:60,budgetCurrency:'USD',validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-msf-validation','{workspace}','{runId}'],timeoutSec:1300},supervision:{billing:'priced',maxTokens:500000,maxRecoveryAttempts:3,retryDelaySec:900,repairValidation:true,fallbackExecutorIds:[]}}}
const target=script=>remote(lanProfile,'jarvis-101',script,true);
const digest=b=>createHash('sha256').update(b).digest('hex');
const output=resolve('artifacts/software-factory/node');
async function evidence(name,value){await mkdir(output,{recursive:true});await writeFile(join(output,name+'.json'),JSON.stringify(value,null,2)+'\n')}
export async function installValidator(){
 const wrapper=await readFile('scripts/software-factory-validation-wrapper.py'),validator=await readFile('scripts/software-factory-validation.mjs');
 const payload={wrapper:wrapper.toString('base64'),validator:validator.toString('base64'),wrapperHash:digest(wrapper),validatorHash:digest(validator)};
 const result=JSON.parse(target(python(payload,`import os,pwd,hashlib,subprocess,json,tempfile,shutil
from pathlib import Path
a=pwd.getpwnam('superopen')
for raw in ['/opt/jarvis-development','/opt/jarvis-development/software-factory','/opt/jarvis-development/node','/opt/jarvis-development/node/bin','/usr/local/libexec','/var/lib/jarvis-development','/var/lib/jarvis-development/101']:
 q=Path(raw)
 if q.is_symlink():raise RuntimeError('INSTALL_ROOT_SYMLINK')
 q.mkdir(parents=True,exist_ok=True,mode=0o755);os.chown(q,0,0);os.chmod(q,0o755)
node=Path('/opt/jarvis-development/node/bin/node');original=Path('/opt/jarvis/node/bin/node')
if node.is_symlink():raise RuntimeError('DEVELOPMENT_NODE_SYMLINK')
def sha(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
if not node.exists() or sha(node)!=sha(original):
 fd,temp=tempfile.mkstemp(dir=node.parent);os.close(fd);shutil.copyfile(original,temp);os.chown(temp,0,0);os.chmod(temp,0o755);os.replace(temp,node)
if sha(node)!=sha(original):raise RuntimeError('DEVELOPMENT_NODE_DIGEST_MISMATCH')
version=subprocess.run(['/usr/sbin/runuser','-u','superopen','--',str(node),'--version'],capture_output=True,text=True,check=True,timeout=10).stdout.strip()
if not version.startswith('v24.'):raise RuntimeError('DEVELOPMENT_NODE24_REQUIRED')
v=Path('/var/lib/jarvis-development/101/validation');v.mkdir(exist_ok=True,mode=0o700)
if v.is_symlink():raise RuntimeError('VALIDATION_ROOT_SYMLINK')
os.chown(v,a.pw_uid,a.pw_gid);os.chmod(v,0o700)
for field,path,mode in [('wrapper','/usr/local/libexec/jarvis-msf-validation',0o755),('validator','/opt/jarvis-development/software-factory/validate-msf.mjs',0o644)]:
 data=base64.b64decode(p[field])
 if hashlib.sha256(data).hexdigest()!=p[field+'Hash']:raise RuntimeError('TRANSFER_DIGEST_MISMATCH')
 fd,temp=tempfile.mkstemp(prefix='.factory-',dir=str(Path(path).parent))
 with os.fdopen(fd,'wb') as f:f.write(data)
 os.chown(temp,0,0);os.chmod(temp,mode);os.replace(temp,path)
sudoers='superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-msf-validation'+chr(10)
fd,temp=tempfile.mkstemp(prefix='.jarvis-msf-',dir='/etc/sudoers.d')
with os.fdopen(fd,'w') as f:f.write(sudoers)
os.chmod(temp,0o440);os.chown(temp,0,0)
r=subprocess.run(['/usr/sbin/visudo','-cf',temp],capture_output=True)
if r.returncode:os.unlink(temp);raise RuntimeError('FIXED_SUDOERS_INVALID')
os.replace(temp,'/etc/sudoers.d/jarvis-msf-validation')
r=subprocess.run(['/usr/local/libexec/jarvis-msf-validation','/home/superopen/All-Projects/msf','1111111111111111111111111111111111111111','--probe'],capture_output=True,text=True,timeout=20)
if r.returncode:raise RuntimeError('ISOLATION_PROBE_FAILED')
probe=json.loads(r.stdout)
temporary=Path(probe.pop('temporaryRoot'))
if temporary.parent!=v or not temporary.name.startswith('.probe-') or temporary.is_symlink():raise RuntimeError('PROBE_CLEANUP_SCOPE_INVALID')
shutil.rmtree(temporary)
print(json.dumps({'installed':True,'nodeVersion':version,'nodePath':str(node),'nodeSha256':sha(node),'wrapperSha256':p['wrapperHash'],'validatorSha256':p['validatorHash'],'probe':probe,'modelCalled':False}))
`)));
 await evidence('validator-install',result);return result;
}
export async function baseline(runId=randomUUID()){
 if(!/^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(runId))throw Error('INVALID_BASELINE_RUN_ID');
 const result=JSON.parse(target(python({runId},`import subprocess,json
unit='jarvis-msf-baseline-'+p['runId']
r=subprocess.run(['/usr/bin/systemd-run','--collect','--unit='+unit,'--property=RuntimeMaxSec=1300','--property=Type=exec','/usr/local/libexec/jarvis-msf-validation','/home/superopen/All-Projects/msf',p['runId']],capture_output=True,text=True,timeout=15)
if r.returncode:raise RuntimeError('BASELINE_LAUNCH_FAILED')
print(json.dumps({'started':True,'runId':p['runId'],'unit':unit,'modelCalled':False,'fullDeliveryAcceptance':False}))
`)));
 await evidence('baseline-start',result);return result;
}
export async function baselineStatus(runId){
 if(!/^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(runId))throw Error('INVALID_BASELINE_RUN_ID');
 const result=JSON.parse(target(python({runId},`from pathlib import Path
import json,subprocess,re
runRoot=Path('/var/lib/jarvis-development/101/validation')/p['runId'];latest=runRoot/'latest.json'
if latest.exists():
 if latest.is_symlink() or latest.stat().st_size>1024:raise RuntimeError('BASELINE_POINTER_INVALID')
 pointer=json.loads(latest.read_text());attempt=pointer.get('attempt','')
 if not re.fullmatch('attempt-[0-9a-f]{32}',attempt):raise RuntimeError('BASELINE_ATTEMPT_INVALID')
 path=runRoot/attempt/'report.json'
else:path=runRoot/'report.json'
if path.exists():
 if path.is_symlink() or path.stat().st_size>100000:raise RuntimeError('BASELINE_REPORT_INVALID')
 report=json.loads(path.read_text())
else:report=None
r=subprocess.run(['/usr/bin/systemctl','show','jarvis-msf-baseline-'+p['runId'],'--property=ActiveState,SubState,Result,ExecMainStatus'],capture_output=True,text=True,timeout=10)
j=subprocess.run(['/usr/bin/journalctl','-u','jarvis-msf-baseline-'+p['runId'],'-n','30','--no-pager','-o','cat'],capture_output=True,text=True,timeout=10)
errors=[]
for s in j.stdout.splitlines():
 if s.startswith('{'):
  try:
   item=json.loads(s)
   if isinstance(item,dict) and isinstance(item.get('error'),str) and len(item['error'])<100:errors.append(item['error'])
  except:pass
 elif s.startswith(('Error:','RuntimeError:','FileNotFoundError:','PermissionError:','TypeError:')):errors.append(s[:300])
print(json.dumps({'runId':p['runId'],'status':dict(s.split('=',1) for s in r.stdout.splitlines() if '=' in s),'report':report,'errorCodes':errors}))
`)));
 await evidence('baseline-'+runId,result);return result;
}
export async function receiptMetadata(){
 const result=JSON.parse(target(python({},`from pathlib import Path
import json,datetime,collections
root=Path('/home/superopen/.claude/projects/-home-superopen-All-Projects-msf')
files=sorted(root.glob('*.jsonl')) if root.is_dir() and not root.is_symlink() else []
types=collections.Counter();models=collections.Counter();usageFields=collections.Counter();rows=0;cwd=0;sessions=0;latest=None
for f in files[:5000]:
 if f.is_symlink() or f.stat().st_size>50*1024*1024:continue
 latest=max(latest or 0,f.stat().st_mtime)
 with f.open() as stream:
  for line in stream:
   if len(line)>2*1024*1024:continue
   try:r=json.loads(line)
   except:continue
   if not isinstance(r,dict):continue
   rows+=1;t=r.get('type');types[t if isinstance(t,str) else 'unknown']+=1
   cwd+=r.get('cwd')=='/home/superopen/All-Projects/msf';sessions+=isinstance(r.get('sessionId'),str)
   m=r.get('message')
   if t=='assistant' and isinstance(m,dict):
    if isinstance(m.get('model'),str):models[m['model'][:200]]+=1
    if isinstance(m.get('usage'),dict):
     for k,v in m['usage'].items():
      if isinstance(v,(int,float)) and not isinstance(v,bool):usageFields[k[:100]]+=1
print(json.dumps({'exists':root.is_dir(),'files':len(files),'latestModifiedAt':datetime.datetime.fromtimestamp(latest,datetime.timezone.utc).isoformat() if latest else None,'rows':rows,'types':dict(types),'assistantModels':dict(models),'numericUsageFields':dict(usageFields),'cwdMatches':cwd,'sessionIdsPresent':sessions,'contentFieldsInspectedOrReturned':False,'metadataOnly':True}))
`)));
 await evidence('claude-receipt-metadata',result);return result;
}
export async function installNode(expectedRelease){
 if(typeof expectedRelease!=='string'||!/^20261010-[a-z0-9-]*r18[a-z0-9-]*$/i.test(expectedRelease))throw Error('EXPLICIT_ACTIVE_R18_RELEASE_REQUIRED');
 const manifest=JSON.parse(await readFile('artifacts/development-node/package/SHA256.json','utf8'));
 const allowed=['jarvis-node.mjs','agent-supervisor.js','prepare-development-node.mjs','使用说明.md','package.json'];
 const files=[];for(const entry of manifest){if(!allowed.includes(entry.file))throw Error('UNEXPECTED_BUNDLE_FILE');const data=await readFile(join('artifacts/development-node/package',entry.file));if(digest(data)!==entry.sha256)throw Error('LOCAL_BUNDLE_DIGEST_MISMATCH');files.push({name:entry.file,sha256:entry.sha256,data:data.toString('base64')})}
 if(files.length!==5)throw Error('INCOMPLETE_NODE_BUNDLE');
 const ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt'),template=factoryTemplate();
 return withPlatform(async({api})=>{
  const health=await api('/api/health');if(!JSON.stringify(health).includes(expectedRelease))throw Error('CENTRAL_EXPECTED_RELEASE_NOT_ACTIVE');
  const runs=(await api('/api/v1/execution/runs')).data;
  if(!Array.isArray(runs)||runs.some(r=>r.machineId===FACTORY_NODE.machineId&&r.executorId===template.id&&['queued','running'].includes(r.status)))throw Error('DEVELOPMENT_NODE_HAS_PENDING_OR_ACTIVE_RUN');
  const before=(await api('/api/v1/execution/config')).data;
  const existing=before.templates.find(t=>t.id===template.id);
  const templates=[...before.templates.filter(t=>t.id!==template.id),template];
  await api('/api/v1/execution/config',{expectedVersion:before.revision,templates,probes:before.probes,wol:before.wol},'PUT');
  let ticket;
  const hasConfig=JSON.parse(target(python({},`from pathlib import Path
import json
p=Path('/var/lib/jarvis-development/101/config.json');print(json.dumps({'exists':p.exists(),'safe':not p.is_symlink()}))
`)));
  if(!hasConfig.safe)throw Error('AGENT_CONFIG_SYMLINK');
  if(!hasConfig.exists)ticket=(await api('/api/v1/execution/tickets',{machineId:FACTORY_NODE.machineId,capabilities:[template.id,'telemetry'],ttlSec:600})).data.ticket;
  const config={apiUrl:FACTORY_NODE.apiUrl,machineId:FACTORY_NODE.machineId,workspaceRoots:[FACTORY_NODE.workspaceRoot],templates:[template],concurrency:1,...ticket?{pairingTicket:ticket}:{}};
  const latestRuns=(await api('/api/v1/execution/runs')).data;
  if(!Array.isArray(latestRuns)||latestRuns.some(r=>r.machineId===FACTORY_NODE.machineId&&r.executorId===template.id&&['queued','running'].includes(r.status)))throw Error('DEVELOPMENT_NODE_BECAME_BUSY');
  const result=JSON.parse(target(python({files,ca:ca.toString('base64'),config,release:expectedRelease},`from pathlib import Path
import pwd,os,hashlib,json,subprocess,tempfile
a=pwd.getpwnam('superopen');folder=Path('/opt/jarvis-development/software-factory');folder.mkdir(parents=True,exist_ok=True)
if folder.is_symlink():raise RuntimeError('BUNDLE_ROOT_SYMLINK')
subprocess.run(['/usr/bin/systemctl','stop','jarvis-software-factory-development.service'],capture_output=True,timeout=35)
os.chown(folder,0,0);os.chmod(folder,0o755)
for item in p['files']:
 data=base64.b64decode(item['data'])
 if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('BUNDLE_DIGEST_MISMATCH')
 fd,t=tempfile.mkstemp(dir=folder)
 with os.fdopen(fd,'wb') as f:f.write(data)
 os.chown(t,0,0);os.chmod(t,0o644);os.replace(t,folder/item['name'])
ca=Path('/opt/jarvis-development/software-factory/central-ca.crt')
if ca.is_symlink():raise RuntimeError('PUBLIC_CA_SYMLINK')
ca.write_bytes(base64.b64decode(p['ca']));os.chown(ca,0,0);os.chmod(ca,0o644)
c=Path('/var/lib/jarvis-development/101/config.json');c.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
if c.is_symlink():raise RuntimeError('AGENT_CONFIG_SYMLINK')
if c.exists():
 old=json.loads(c.read_text())
 if old.get('machineId')!=p['config']['machineId'] or not old.get('agentId'):raise RuntimeError('EXISTING_AGENT_CONFIG_UNEXPECTED')
 for k in ['agentId','privateKey','publicKey']:p['config'][k]=old[k]
fd,t=tempfile.mkstemp(dir=c.parent)
with os.fdopen(fd,'w') as f:json.dump(p['config'],f)
os.chown(t,a.pw_uid,a.pw_gid);os.chmod(t,0o600);os.replace(t,c)
unit='''[Unit]
Description=Jarvis controlled software factory development node
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=superopen
Group=superopen
WorkingDirectory=/home/superopen/All-Projects/msf
Environment=HOME=/home/superopen
Environment=NODE_EXTRA_CA_CERTS=/opt/jarvis-development/software-factory/central-ca.crt
Environment=PATH=/opt/jarvis-development/node/bin:/usr/bin:/bin
ExecStart=/opt/jarvis-development/node/bin/node /opt/jarvis-development/software-factory/jarvis-node.mjs --config /var/lib/jarvis-development/101/config.json
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
KillMode=control-group
UMask=0077
ProtectSystem=full
ProtectHome=false
PrivateTmp=true
LockPersonality=true
CPUQuota=100%
MemoryMax=6G
TasksMax=256
# NoNewPrivileges deliberately omitted: the exact fixed validator uses sudo,
# isolates networking, then drops uid before reading source or executing builds.
[Install]
WantedBy=multi-user.target
'''
path=Path('/etc/systemd/system/jarvis-software-factory-development.service');path.write_text(unit);os.chown(path,0,0);os.chmod(path,0o644)
subprocess.run(['/usr/bin/systemd-analyze','verify',str(path)],check=True,capture_output=True,timeout=15)
subprocess.run(['/usr/bin/systemctl','daemon-reload'],check=True,capture_output=True,timeout=15)
subprocess.run(['/usr/bin/systemctl','enable','jarvis-software-factory-development.service'],check=True,capture_output=True,timeout=20)
subprocess.run(['/usr/bin/systemctl','restart','jarvis-software-factory-development.service'],check=True,capture_output=True,timeout=20)
print(json.dumps({'installed':True,'unit':'jarvis-software-factory-development.service','configPath':str(c),'configMode':'0600','modelRunStarted':False,'release':p['release'],'bundleFiles':len(p['files'])}))
`)));
  await evidence('node-install',result);return result;
 });
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 const command=process.argv[2]??'--prepare';let result;
 if(command==='--prepare'){result={node:FACTORY_NODE,template:factoryTemplate(),noSecrets:true,aiRunStarted:false,validator:'root-owned fixed paths; network namespace; all connect denied; offline scratch build+3 named unit suites; no full integration acceptance'};await evidence('plan',result)}
 else if(command==='--install-validator')result=await installValidator();
 else if(command==='--baseline')result=await baseline(process.argv[3]);
 else if(command==='--baseline-status')result=await baselineStatus(process.argv[3]);
 else if(command==='--receipt-metadata')result=await receiptMetadata();
 else if(command==='--install-node')result=await installNode(process.argv[3]);
 else throw Error('UNKNOWN_INSTALLER_ACTION');
 console.log(JSON.stringify(result));
}
