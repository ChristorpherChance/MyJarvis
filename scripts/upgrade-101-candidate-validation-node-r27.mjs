/** Narrow, idle-only bundle upgrade. Paired identity, credentials and execution policy stay private and unchanged. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState} from './run-factory-supervision-probe.mjs';
const RELEASE='20261012-candidate-validation-r27-1';
const PLATFORM_RELEASE='20261012-supervision-r27-1';
const ATTEMPT=Number(process.env.JARVIS_NODE_UPGRADE_ATTEMPT??1);
if(!Number.isInteger(ATTEMPT)||ATTEMPT<1||ATTEMPT>10)throw Error('UPGRADE_ATTEMPT_INVALID');
const AGENT='0b5aea06-47e1-4f4b-a32e-969417915c9c';
const MACHINE='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73';
const FILES=['jarvis-node.mjs','agent-supervisor.js','prepare-development-node.mjs','使用说明.md','package.json'];
const BASE='/opt/jarvis-development/software-factory';
const CONFIG='/var/lib/jarvis-development/101/config.json';
const UNIT='jarvis-software-factory-development.service';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reportDirectory='artifacts/software-factory/acceptance-r27';
const execute=process.argv.includes('--execute');
const inspect=String.raw`import os,stat,hashlib,subprocess,pwd
from pathlib import Path
def safe(q,directory=False,root=False):
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or (not stat.S_ISDIR(s.st_mode) if directory else not stat.S_ISREG(s.st_mode)):raise RuntimeError('UPGRADE_PATH_UNSAFE')
 if root and (s.st_uid!=0 or s.st_mode&0o022):raise RuntimeError('UPGRADE_ROOT_PATH_UNTRUSTED')
 return s
base=Path(p['base']);config=Path(p['config'])
for q in [base,*base.parents]:safe(q,True,True)
s=safe(config)
if s.st_mode&0o077:raise RuntimeError('UPGRADE_CONFIG_NOT_PRIVATE')
raw=config.read_bytes();cfg=json.loads(raw)
if cfg.get('agentId')!=p['agent'] or cfg.get('machineId')!=p['machine'] or not cfg.get('privateKey'):raise RuntimeError('UPGRADE_IDENTITY_CHANGED')
ts=[t for t in cfg.get('templates',[]) if t.get('id')=='msf-101-claude']
if len(ts)!=1 or ts[0].get('engine')!='claude':raise RuntimeError('UPGRADE_TEMPLATE_INVALID')
argv=ts[0].get('args',[])
if argv.count('--model')!=1 or argv[argv.index('--model')+1]!='gpt-6.1-sol[1m]':raise RuntimeError('UPGRADE_STRONG_ROUTE_NOT_PINNED')
def unit():
 r=subprocess.run(['systemctl','show',p['unit'],'--property=ActiveState,SubState,MainPID,User,ControlGroup'],capture_output=True,text=True,check=True,timeout=10)
 return dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
u=unit()
if u.get('User')!='superopen':raise RuntimeError('UPGRADE_NODE_ACCOUNT_CHANGED')
if p.get('expectStopped'):
 if u.get('ActiveState') not in ['inactive','failed'] or int(u.get('MainPID','0'))!=0:raise RuntimeError('UPGRADE_NODE_NOT_STOPPED')
elif u.get('ActiveState')!='active' or int(u.get('MainPID','0'))<=0:raise RuntimeError('UPGRADE_NODE_NOT_RUNNING')
main=int(u['MainPID']);children=[]
for entry in (Path('/proc').iterdir() if main>0 else []):
 if not entry.name.isdigit():continue
 try:
  info=(entry/'status').read_text();ppid=int(next(x.split(':',1)[1] for x in info.splitlines() if x.startswith('PPid:')))
  if ppid==main:children.append(int(entry.name))
 except (FileNotFoundError,PermissionError,StopIteration):pass
if children:raise RuntimeError('UPGRADE_NODE_HAS_CHILD_PROCESSES')
if p.get('expectStopped'):
 group=p.get('expectedControlGroup')
 if group!='/system.slice/'+p['unit']:raise RuntimeError('UPGRADE_CGROUP_SCOPE_INVALID')
 cg=Path('/sys/fs/cgroup')/group.lstrip('/')/'cgroup.procs'
 if cg.exists() and cg.read_text().strip():raise RuntimeError('UPGRADE_OLD_CGROUP_NOT_EMPTY')
installed={}
for name in p['names']:
 q=base/name;fs=safe(q,root=True)
 if fs.st_nlink!=1:raise RuntimeError('UPGRADE_BUNDLE_HARDLINK')
 installed[name]=hashlib.sha256(q.read_bytes()).hexdigest()
config_semantic=hashlib.sha256(json.dumps(cfg,sort_keys=True,separators=(',',':')).encode()).hexdigest()
summary={'agentId':cfg['agentId'],'machineId':cfg['machineId'],'configSHA256':hashlib.sha256(raw).hexdigest(),'configSemanticSHA256':config_semantic,'templateSHA256':hashlib.sha256(json.dumps(ts[0],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'strongModel':'gpt-6.1-sol[1m]','unit':u,'childProcesses':len(children),'files':installed,'credentialsExported':False}
`;
const mutate=String.raw`
import tempfile,shutil,time,sqlite3
if summary['configSHA256']!=p['expectedConfigSHA256']:raise RuntimeError('UPGRADE_CONFIG_CAS_CONFLICT')
account=pwd.getpwnam('superopen');spool=config.parent/('.delivery-'+p['agent'])
for q in [config.parent,*config.parent.parents]:safe(q,True,True)
if spool.exists() or spool.is_symlink():
 ss=safe(spool,True)
 if ss.st_uid!=account.pw_uid or ss.st_mode&0o077:raise RuntimeError('UPGRADE_SPOOL_PERMISSION_INVALID')
 db=spool/'journal.sqlite'
 if db.exists():
  ds=safe(db)
  if ds.st_uid!=account.pw_uid or ds.st_mode&0o077 or ds.st_nlink!=1:raise RuntimeError('UPGRADE_JOURNAL_PERMISSION_INVALID')
  c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True)
  try:
   if c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0] or c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0]:raise RuntimeError('UPGRADE_JOURNAL_UNRESOLVED')
  finally:c.close()
else:spool.mkdir(mode=0o700);os.chown(spool,account.pw_uid,account.pw_gid)
backup=Path('/var/lib/jarvis-control')/('development-node-'+p['release']+('-attempt-'+str(p['attempt']) if p['attempt']>1 else ''))
safe(backup.parent,True,True)
backup.mkdir(mode=0o700,exist_ok=False);safe(backup,True,True)
for name in p['names']:shutil.copy2(base/name,backup/name)
(backup/'pre-upgrade-hashes.json').write_text(json.dumps(installed,sort_keys=True));os.chmod(backup/'pre-upgrade-hashes.json',0o600)
prepared=[];activated=False;stopped=True;failure=None;rollback=None
def replace(name,data):
 fd,temp=tempfile.mkstemp(prefix='.r19-node-',dir=base)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chown(temp,0,0);os.chmod(temp,0o644);os.replace(temp,base/name)
 finally:
  if os.path.exists(temp):os.unlink(temp)
try:
 for item in p['files']:
  data=base64.b64decode(item['base64'])
  if item['name'] not in p['names'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('UPGRADE_TRANSFER_HASH_INVALID')
  prepared.append((item['name'],data))
 if len(prepared)!=len(p['names']) or len(set(x[0] for x in prepared))!=len(p['names']):raise RuntimeError('UPGRADE_MANIFEST_INVALID')
 if unit().get('ActiveState') not in ['inactive','failed']:raise RuntimeError('UPGRADE_OLD_UNIT_STILL_RUNNING')
 if config.read_bytes()!=raw:raise RuntimeError('UPGRADE_CONFIG_CHANGED_WHILE_STOPPING')
 for name,data in prepared:replace(name,data)
 subprocess.run(['systemctl','start',p['unit']],check=True,capture_output=True,timeout=20)
 for attempt in range(15):
  u=unit();db=spool/'journal.sqlite'
  if u.get('ActiveState')=='active' and db.exists():
   ds=safe(db)
   if ds.st_uid!=account.pw_uid or ds.st_mode&0o077 or ds.st_nlink!=1:raise RuntimeError('UPGRADE_JOURNAL_NOT_PRIVATE')
   c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True)
   try:
    identity=c.execute('SELECT agent_id,machine_id FROM identity').fetchone()
    owner=c.execute('SELECT pid FROM process_owner WHERE id=1').fetchone()
    if identity!=(p['agent'],p['machine']):raise RuntimeError('UPGRADE_JOURNAL_IDENTITY_INVALID')
    # systemd can report active before the new node acquires its journal owner.
    # A stale owner is allowed only during this bounded startup wait.
    if not owner or owner[0]!=int(u['MainPID']):
     if attempt==14:raise RuntimeError('UPGRADE_JOURNAL_OWNER_NOT_READY')
     time.sleep(1)
     continue
    counts={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0]}
    if any(counts.values()):raise RuntimeError('UPGRADE_NODE_NOT_IDLE')
   finally:c.close()
   break
  if attempt==14:raise RuntimeError('UPGRADE_NEW_UNIT_UNHEALTHY')
  time.sleep(1)
 after_config=json.loads(config.read_bytes())
 if hashlib.sha256(json.dumps(after_config,sort_keys=True,separators=(',',':')).encode()).hexdigest()!=config_semantic:raise RuntimeError('UPGRADE_PRIVATE_CONFIG_CHANGED')
 result={**summary,'release':p['release'],'unit':u,'configUnchanged':True,'strongTemplateUnchanged':True,'bundleSHA256':{n:hashlib.sha256((base/n).read_bytes()).hexdigest() for n in p['names']},'journal':{'identityMatches':True,'directoryMode':oct(stat.S_IMODE(spool.stat().st_mode)),'databaseMode':oct(stat.S_IMODE(db.stat().st_mode)),**counts},'privateBackupRemoteOnly':True,'sourceProjectsModified':False,'modelCalls':0,'deployed':True}
 activated=True
except Exception as error:
 failure=str(error) if isinstance(error,RuntimeError) and str(error).startswith('UPGRADE_') else 'UPGRADE_REMOTE_OPERATION_FAILED'
finally:
 if not activated and stopped:
  try:
   subprocess.run(['systemctl','stop',p['unit']],check=True,capture_output=True,timeout=20)
   for name in p['names']:replace(name,(backup/name).read_bytes())
   subprocess.run(['systemctl','start',p['unit']],check=True,capture_output=True,timeout=20)
   rollback={'bundleRestored':all(hashlib.sha256((base/n).read_bytes()).hexdigest()==installed[n] for n in p['names']),'unitActive':unit().get('ActiveState')=='active'}
   if not all(rollback.values()):raise RuntimeError('UPGRADE_ROLLBACK_NOT_CONFIRMED')
  except Exception:rollback={'verified':False,'requiresReconciliation':True}
if not activated:result={'deployed':False,'failureCode':failure,'rollback':rollback,'credentialsExported':False}
print(json.dumps(result))
`;
await mkdir(reportDirectory,{recursive:true});
await withPlatform(async({api})=>{
 const health=await api('/api/health'),supervision=(await api('/api/v1/execution/supervision')).data;
 if(execute&&(health.build!==PLATFORM_RELEASE||supervision.supervised!==false))throw Error('UPGRADE_EXPECTED_BUILD_OR_SUPERVISION_STATE_INVALID');
 const queue=queueState();if(queue.allActive!==0)throw Error('UPGRADE_QUEUE_NOT_IDLE');
 const payload={release:RELEASE,attempt:ATTEMPT,agent:AGENT,machine:MACHINE,base:BASE,config:CONFIG,unit:UNIT,names:FILES};
 const before=JSON.parse(remote(lanProfile,'jarvis-101',python(payload,inspect+'\nprint(json.dumps(summary))'),true));
 if(!execute){await writeFile(reportDirectory+'/node-upgrade-preflight.json',JSON.stringify({at:new Date().toISOString(),queue,before,execute:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ready:true,nodeIdle:true,strongModel:before.strongModel,execute:false}));return;}
 const manifest=JSON.parse(await readFile('artifacts/development-node/package/SHA256.json','utf8'));
 if(manifest.length!==FILES.length||FILES.some(n=>manifest.filter(x=>x.file===n).length!==1))throw Error('UPGRADE_PACKAGE_MANIFEST_INVALID');
 payload.files=[];
 for(const name of FILES){const bytes=await readFile('artifacts/development-node/package/'+name),sha256=hash(bytes);if(manifest.find(x=>x.file===name).sha256!==sha256)throw Error('UPGRADE_PACKAGE_HASH_INVALID');if(name==='jarvis-node.mjs'&&!['one_result_per_run','AGENT_DELIVERY_CONFIRMATION_MISMATCH','NODE_PROCESS_RESTART','project-candidate-validation'].every(marker=>bytes.includes(Buffer.from(marker))))throw Error('UPGRADE_DURABLE_CODE_NOT_PACKAGED');payload.files.push({name,sha256,base64:bytes.toString('base64')});}
 payload.expectedConfigSHA256=before.configSHA256;
 if(queueState().allActive!==0)throw Error('UPGRADE_QUEUE_CHANGED');
 const report={at:new Date().toISOString(),before,status:'stopping-idle-node',pairedIdentityPreserved:null};
 const resultPath=reportDirectory+'/'+RELEASE+'-node-upgrade'+(ATTEMPT===1?'':'-attempt-'+ATTEMPT)+'.json';
 await writeFile(resultPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 let stopAttempted=false;
 const persist=()=>writeFile(resultPath,JSON.stringify(report,null,2)+'\n');
 try{
  stopAttempted=true;
  const stopped=JSON.parse(remote(lanProfile,'jarvis-101',python(payload,inspect+String.raw`
failure=None
try:subprocess.run(['systemctl','stop',p['unit']],check=True,capture_output=True,timeout=20)
except Exception:failure='UPGRADE_STOP_UNCONFIRMED'
u=unit();print(json.dumps({'stopped':u.get('ActiveState') in ['inactive','failed'] and int(u.get('MainPID','0'))==0,'failureCode':failure,'unit':u}))
`),true,{timeoutMs:90000}));
  report.stop=stopped;await persist();
  if(!stopped.stopped)throw Error('UPGRADE_STOP_UNCONFIRMED');
  // The stopped unit is the claim barrier. Check the complete central queue again before installing.
  report.queueAfterStop=queueState();await persist();
  if(report.queueAfterStop.allActive!==0)throw Error('UPGRADE_TASK_ARRIVED_DURING_STOP');
  payload.expectStopped=true;
  payload.expectedControlGroup=before.unit.ControlGroup;
  const result=JSON.parse(remote(lanProfile,'jarvis-101',python(payload,inspect+mutate),true,{timeoutMs:180000}));
  report.result=result;report.status=result.deployed?'bundle-live':'remote-upgrade-failed';await persist();
  if(!result.deployed)throw Error('UPGRADE_REMOTE_FAILED');
  report.afterQueue=queueState();
  const agents=(await api('/api/v1/execution/agents')).data;
  report.pairedIdentityPreserved=result.agentId===AGENT;report.agentListCount=agents.items?.length??agents.length??null;
  if(report.afterQueue.allActive!==0||!result.configUnchanged)throw Error('UPGRADE_POST_STATE_INVALID');
  report.status='verified';await persist();
  console.log(JSON.stringify({deployed:true,release:RELEASE,journal:result.journal,privateConfigUnchanged:true,modelCalls:0}));
 }catch(error){
  report.failureCode=/^UPGRADE_[A-Z_]+$/.test(error.message)?error.message:'UPGRADE_TRANSPORT_OR_READBACK_FAILED';
  report.status=report.result?.deployed?'live-readback-incomplete':'failed-or-uncertain';
  await persist();
  if(stopAttempted&&!report.result){
   // Never restart an unverified mixed bundle. Restore service availability only when every old hash still matches.
   try{report.reconciliation=JSON.parse(remote(lanProfile,'jarvis-101',python({...payload,expectedFiles:before.files},String.raw`import subprocess,hashlib
from pathlib import Path
same=all(hashlib.sha256((Path(p['base'])/name).read_bytes()).hexdigest()==sha for name,sha in p['expectedFiles'].items())
r=subprocess.run(['systemctl','is-active',p['unit']],capture_output=True,text=True,timeout=10)
active=r.stdout.strip()=='active'
if same and not active:
 subprocess.run(['systemctl','start',p['unit']],check=True,capture_output=True,timeout=20)
 active=subprocess.run(['systemctl','is-active',p['unit']],capture_output=True,text=True,timeout=10).stdout.strip()=='active'
print(json.dumps({'oldBundleUnchanged':same,'unitActive':active,'automaticRerun':False,'requiresReconciliation':not same or not active}))
`),true,{timeoutMs:90000}));}catch{report.reconciliation={verified:false,requiresReconciliation:true,code:'UPGRADE_RECONCILIATION_UNAVAILABLE'};}
  }
  await persist();throw Error(report.failureCode);
 }
});

