/** Prepare only the explicitly authorized software-factory copy and pinned templates. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const execute=process.argv.includes('--execute');
const spec=JSON.parse(await readFile('artifacts/software-factory/autonomy-r22/objectives.json','utf8'));
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const goalSpecHash=sha(canonical(spec)),workspace='/home/superopen/All-Projects/msf-jarvis-autonomy-r22';
const sourceFiles=['project-autonomy-validator.mjs','project-autonomy-evidence.py','project-autonomy-validation-wrapper.py'];
const files=await Promise.all(sourceFiles.map(async name=>{const bytes=await readFile('scripts/'+name);return {name,base64:bytes.toString('base64'),sha256:sha(bytes)};}));
const inspection=JSON.parse(await readFile('artifacts/software-factory/autonomy-r22/bootstrap-inspection.json','utf8'));
const templates=spec.workPackages.flatMap(pack=>['worker','reviewer'].map(role=>({...inspection.template,id:`msf-autonomy-${pack.id.toLowerCase()}-${role}`,workspaceRoot:workspace,maxRounds:role==='worker'?4:1,timeoutSec:role==='worker'?1200:600,validation:{program:'/usr/bin/sudo',args:['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}',pack.id,goalSpecHash],timeoutSec:3600},args:[...inspection.template.args,...(role==='reviewer'?['--tools','Read,Glob,Grep','--allowedTools','Read,Glob,Grep']:['--allowedTools','Read,Glob,Grep,Edit,Write,Bash'])],supervision:{...inspection.template.supervision,maxTokens:role==='worker'?200000:100000,maxRecoveryAttempts:3,retryDelaySec:120,repairValidation:role==='worker',fallbackExecutorIds:[]}})));
const required=['source-stability','build','typecheck','tests','package','isolated-health','frontend','write-readback'];
const config={machineId:inspection.template.machineId,workspace,maxUSD:10,maxTokens:2000000,perTaskUSD:1,maxAttempts:3,maxRepeated:3,maxEvidenceAgeMs:86400000,executors:Object.fromEntries(spec.workPackages.map(pack=>[pack.id,{worker:`msf-autonomy-${pack.id.toLowerCase()}-worker`,reviewer:`msf-autonomy-${pack.id.toLowerCase()}-reviewer`,requiredCheckIds:required,budgetScope:pack.budgetScope}])),scopeBudgets:{'factory-system':{maxUSD:6,maxTokens:1200000},'customer-product':{maxUSD:2,maxTokens:400000},'agent-improvement':{maxUSD:2,maxTokens:400000}}};
const report={at:new Date().toISOString(),goalSpecHash,workspace,config,templates,executed:execute};
if(execute){
 report.node=JSON.parse(remote(lanProfile,'jarvis-101',python({workspace,goalSpecHash,spec,templates,files},String.raw`import os,stat,hashlib,subprocess,pwd,tempfile,shutil
from pathlib import Path
base=Path('/opt/jarvis-development/software-factory');cfgpath=Path('/var/lib/jarvis-development/101/config.json');source=Path('/home/superopen/All-Projects/msf');target=Path(p['workspace']);account=pwd.getpwnam('superopen')
def safe(q,directory=False):
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or (not stat.S_ISDIR(s.st_mode) if directory else not stat.S_ISREG(s.st_mode)):raise RuntimeError('AUTONOMY_PATH_UNSAFE')
 return s
for q in [base,*base.parents]:
 s=safe(q,True)
 if s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('AUTONOMY_TRUST_ROOT_INVALID')
if target.exists():raise RuntimeError('AUTONOMY_COPY_ALREADY_EXISTS_USE_EXISTING_RECEIPT')
raw=cfgpath.read_bytes();cfg=json.loads(raw)
if cfg.get('machineId')!=p['templates'][0]['machineId'] or cfg.get('agentId')!='0b5aea06-47e1-4f4b-a32e-969417915c9c':raise RuntimeError('AUTONOMY_NODE_IDENTITY_CHANGED')
def git(args):return subprocess.check_output(['/usr/sbin/runuser','-u','superopen','--','/usr/bin/git','-C',str(source),*args],timeout=30)
head=git(['rev-parse','HEAD']).decode().strip();names=git(['ls-files','-z']).decode().split('\0');names=[n for n in names if n and not any(x.startswith('.env') or x in ['.npmrc','.secrets','.claude','.codex','node_modules','data','uploads'] for x in Path(n).parts)]
target.mkdir(mode=0o700);os.chown(target,account.pw_uid,account.pw_gid);manifest=[]
for name in names:
 q=source/name
 if '..' in Path(name).parts or Path(name).is_absolute() or q.resolve()!=q:raise RuntimeError('AUTONOMY_SOURCE_PATH_UNSAFE')
 s=safe(q)
 if s.st_nlink!=1 or s.st_size>20*1024*1024:raise RuntimeError('AUTONOMY_SOURCE_FILE_UNSAFE')
 data=q.read_bytes();dest=target/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);os.chmod(dest,0o755 if s.st_mode&0o111 else 0o644);manifest.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
for name in names:
 if hashlib.sha256((source/name).read_bytes()).hexdigest()!=next(m['sha256'] for m in manifest if m['path']==name):raise RuntimeError('AUTONOMY_SOURCE_CHANGED_DURING_COPY')
if git(['rev-parse','HEAD']).decode().strip()!=head:raise RuntimeError('AUTONOMY_SOURCE_HEAD_CHANGED')
for root,dirs,children in os.walk(target):
 os.chown(root,account.pw_uid,account.pw_gid)
 for name in children:os.chown(Path(root)/name,account.pw_uid,account.pw_gid)
# New git metadata has no inherited hooks or credentials.
for argv in [['init','-b','jarvis-autonomy-r22'],['add','.'],['-c','user.name=Jarvis','-c','user.email=jarvis@localhost','commit','-m','Isolated public baseline '+head]]:
 subprocess.run(['/usr/sbin/runuser','-u','superopen','--','/usr/bin/git','-C',str(target),*argv],capture_output=True,check=True,timeout=30)
backup=Path('/var/lib/jarvis-control/autonomy-r22');backup.mkdir(mode=0o700,exist_ok=False);(backup/'node-config.before.json').write_bytes(raw);os.chmod(backup/'node-config.before.json',0o600)
def install(path,data,mode):
 if path.exists():raise RuntimeError('AUTONOMY_INSTALL_ALREADY_EXISTS')
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
 os.chown(path,0,0);os.chmod(path,mode)
for item in p['files']:
 data=base64.b64decode(item['base64'])
 if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('AUTONOMY_TRANSFER_HASH_MISMATCH')
 install(Path('/usr/local/libexec/jarvis-project-autonomy-validation') if item['name'].endswith('wrapper.py') else base/item['name'],data,0o755 if item['name'].endswith('.py') else 0o644)
install(base/'objectives-r22.json',(json.dumps(p['spec'],ensure_ascii=False,indent=2)+'\n').encode(),0o644)
policyDir=Path('/etc/jarvis-development/project-autonomy');policyDir.mkdir(mode=0o755,parents=True,exist_ok=True)
root=Path('/var/lib/jarvis-development/101/autonomy-evidence');root.mkdir(mode=0o700);os.chmod(root,0o700)
# Each policy has a full denominator. Missing runtime adapters are explicitly unknown.
for pack in p['spec']['workPackages']:
 checks=[{'id':'build','required':True,'program':'/opt/jarvis-development/node/bin/node','args':['/home/superopen/opt/node22/lib/node_modules/corepack/dist/pnpm.js','-r','--no-bail','run','build'],'timeoutSec':420},{'id':'typecheck','required':True,'program':'/opt/jarvis-development/node/bin/node','args':['/home/superopen/opt/node22/lib/node_modules/corepack/dist/pnpm.js','-r','--no-bail','run','typecheck'],'timeoutSec':420}]
 policy={'schemaVersion':1,'kind':'project-autonomy-policy','workspace':p['workspace'],'workPackage':pack['id'],'goalSpecHash':p['goalSpecHash'],'runAsUser':'superopen','evidenceRoot':str(root),'expectedChecks':['source-stability','build','typecheck','tests','package','isolated-health','frontend','write-readback'],'checks':checks,'artifacts':['package.json','pnpm-lock.yaml'],'env':{'PATH':'/opt/jarvis-development/node/bin:/home/superopen/opt/node22/bin:/usr/bin:/bin','HOME':'/home/superopen','CI':'1','COREPACK_ENABLE_NETWORK':'0'}}
 install(policyDir/(pack['id']+'.json'),(json.dumps(policy,indent=2)+'\n').encode(),0o644)
install(Path('/etc/sudoers.d/jarvis-project-autonomy'),b'superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-project-autonomy-validation *\n',0o440)
subprocess.run(['/usr/sbin/visudo','-cf','/etc/sudoers.d/jarvis-project-autonomy'],capture_output=True,check=True,timeout=10)
cfg['templates']=[*cfg['templates'],*p['templates']]
fd,temp=tempfile.mkstemp(prefix='.autonomy-r22-',dir=cfgpath.parent)
with os.fdopen(fd,'w') as stream:json.dump(cfg,stream);stream.flush();os.fsync(stream.fileno())
os.chown(temp,account.pw_uid,account.pw_gid);os.chmod(temp,0o600);os.replace(temp,cfgpath)
print(json.dumps({'workspace':str(target),'sourceHead':head,'copiedFiles':len(manifest),'publicBaselineHash':hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'privateEnvCopied':False,'templatesAdded':len(p['templates']),'originalSourceChanged':False,'nodeRestarted':False,'validatorsInstalled':True,'missingRuntimeAdaptersRemainExplicit':True}))
`),true,{timeoutMs:90000}));
 await writeFile('artifacts/software-factory/autonomy-r22/preparation.json',JSON.stringify(report,null,2)+'\n');
 await withPlatform(async({api,command})=>{
  const old=(await api('/api/v1/execution/config')).data;
  report.central=(await api('/api/v1/execution/config',{expectedVersion:old.revision,templates:[...old.templates,...templates],probes:old.probes??[],wol:old.wol??[]},'PUT')).data;
  const project=(await api('/api/v1/projects/70ec346f-6520-46ed-abed-22cac770a3e4')).data;
  report.copy=await command('projects','copies',{projectId:project.id,copies:[...project.copies,{machineId:config.machineId,path:workspace,branch:'jarvis-autonomy-r22',environment:'development'}]},project.revision);
 });
}
await writeFile('artifacts/software-factory/autonomy-r22/preparation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({executed:execute,goalSpecHash,workspace,templates:templates.length,node:report.node}));
