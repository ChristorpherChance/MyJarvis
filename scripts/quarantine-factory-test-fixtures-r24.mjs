/** Reversible quarantine of identified generated test fixtures. No source or guard rewrite. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState} from './run-factory-supervision-probe.mjs';
const dir='artifacts/software-factory/acceptance-r24',projectId='70ec346f-6520-46ed-abed-22cac770a3e4';
const diagnosis=JSON.parse(await readFile(dir+'/candidate-source-link-diagnosis.json','utf8'));
const fixtureDirs=[...new Set(diagnosis.symlinks.map(link=>link.path.split('/').slice(0,3).join('/')))];
if(!fixtureDirs.length||fixtureDirs.some(path=>!/^artifacts\/fa-01\/(package|snapshot)-contract-[A-Za-z0-9]{6,12}$/.test(path)))throw Error('FIXTURE_SCOPE_NOT_PROVEN');
const journalPath='.jarvis-dev/maintenance/factory-fixture-quarantine-r24.json';let j;
try{j=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;j={projectId,id:randomUUID(),workspace:diagnosis.workspace,fixtureDirs};}
const save=async()=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const tmp=journalPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(j,null,2)+'\n',{mode:0o600});await rename(tmp,journalPath);};await save();
const result=await withPlatform(async({api})=>{
 const p=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(p.revision!==20||p.config.workspace!==j.workspace||p.spec.objectives.length!==74||queueState().allActive!==0)throw Error('FIXTURE_QUIET_SCOPE_CHANGED');
 if(!j.receipt){j.receipt=JSON.parse(remote(lanProfile,'jarvis-101',python({...j,helperSHA256:createHash('sha256').update(await readFile('scripts/project-autonomy-evidence.py')).digest('hex')},String.raw`import os,stat,json,hashlib,datetime,subprocess,sqlite3,importlib.util
from pathlib import Path
workspace=Path(p['workspace']);parent=workspace/'artifacts'/'fa-01'
for q in [workspace,*workspace.parents,parent,parent.parent]:
 if q.is_symlink() or not q.is_dir():raise RuntimeError('FIXTURE_SOURCE_PATH_REDIRECTED')
cfg=json.loads(Path('/var/lib/jarvis-development/101/config.json').read_bytes())
unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
pid=int(unit.get('MainPID','0'))
if unit.get('ActiveState')!='active' or not pid:raise RuntimeError('FIXTURE_NODE_NOT_READY')
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  if int(next(x.split(':',1)[1] for x in (q/'status').read_text().splitlines() if x.startswith('PPid:')))==pid:raise RuntimeError('FIXTURE_NODE_CHILD_ACTIVE')
 except (FileNotFoundError,PermissionError,StopIteration):pass
c=sqlite3.connect('file:/var/lib/jarvis-development/101/.delivery-'+cfg['agentId']+'/journal.sqlite?mode=ro',uri=True,timeout=10)
try:
 if c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0] or c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0] or c.execute('SELECT count(*) FROM logs').fetchone()[0]:raise RuntimeError('FIXTURE_JOURNAL_NOT_QUIET')
finally:c.close()
helper=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')
for q in [helper,*helper.parents]:
 s=q.lstat()
 if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('FIXTURE_HELPER_UNTRUSTED')
if hashlib.sha256(helper.read_bytes()).hexdigest()!=p['helperSHA256']:raise RuntimeError('FIXTURE_HELPER_CHANGED')
spec=importlib.util.spec_from_file_location('fixed_evidence',str(helper));helperModule=importlib.util.module_from_spec(spec);spec.loader.exec_module(helperModule)
# Temporary in-memory exclusion only computes the remaining source identity before moving.
# The installed helper file/production policy remains unchanged.
originalIgnore=helperModule.IGNORE_DIRS.copy()
helperModule.IGNORE_DIRS.update(Path(x).name for x in p['fixtureDirs'])
before=helperModule.fingerprint(str(workspace))
helperModule.IGNORE_DIRS=originalIgnore
base=Path('/var/lib/jarvis-control/factory-acceptance-quarantine-r24')
for q in [base.parent,*base.parent.parents]:
 s=q.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('FIXTURE_BACKUP_PARENT_UNTRUSTED')
base.mkdir(mode=0o700,exist_ok=True)
s=base.lstat()
if s.st_uid!=0 or s.st_mode&0o077 or base.is_symlink():raise RuntimeError('FIXTURE_BACKUP_UNTRUSTED')
backup=base/p['id'];backup.mkdir(mode=0o700,exist_ok=True)
ledger=backup/'receipt.json'
if ledger.exists():
 receipt=json.loads(ledger.read_bytes())
 if receipt['id']!=p['id'] or receipt['fixtureDirs']!=p['fixtureDirs']:raise RuntimeError('FIXTURE_BACKUP_SCOPE_CHANGED')
 print(json.dumps(receipt));raise SystemExit(0)
rows=[]
def identity(path):
 manifest=[]
 for root,dirs,files in os.walk(path,followlinks=False):
  for n in sorted(dirs+files):
   q=Path(root)/n;s=q.lstat();rel=str(q.relative_to(path))
   if stat.S_ISLNK(s.st_mode):kind='link';sha=hashlib.sha256(os.readlink(q).encode()).hexdigest()
   elif stat.S_ISREG(s.st_mode):kind='file';sha=hashlib.sha256(q.read_bytes()).hexdigest()
   elif stat.S_ISDIR(s.st_mode):kind='directory';sha=None
   else:raise RuntimeError('FIXTURE_SPECIAL_FILE_REFUSED')
   manifest.append({'path':rel,'kind':kind,'sha256':sha,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size})
 return hashlib.sha256(json.dumps(sorted(manifest,key=lambda x:x['path']),sort_keys=True,separators=(',',':')).encode()).hexdigest()
for relative in p['fixtureDirs']:
 source=workspace/relative;dest=backup/source.name
 if source.is_symlink() or source.parent!=parent or not source.is_dir() or dest.exists() or source.stat().st_dev!=backup.stat().st_dev:raise RuntimeError('FIXTURE_MOVE_SCOPE_CHANGED')
 beforeHash=identity(source);os.rename(source,dest)
 if identity(dest)!=beforeHash:raise RuntimeError('FIXTURE_BACKUP_IDENTITY_CHANGED')
 rows.append({'path':relative,'preservedTreeSHA256':beforeHash})
after=helperModule.fingerprint(str(workspace))
if before['sha256']!=after['sha256']:raise RuntimeError('FIXTURE_NONFIXTURE_SOURCE_CHANGED')
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':p['id'],'workspace':str(workspace),'fixtureDirs':p['fixtureDirs'],'preserved':rows,'sourceFingerprint':after['sha256'],'files':after['files'],'bytes':after['bytes'],'allRemainingPublicSourceUnchanged':True,'helperPolicyChanged':False,'sourceCodeChanged':False,'originalFixturesDeleted':False,'restorable':True,'modelsInvoked':False}
fd=os.open(ledger,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as f:json.dump(receipt,f,indent=2);f.flush();os.fsync(f.fileno())
print(json.dumps(receipt))
`),true,{timeoutMs:180000}));await save();}
 const after=(await api(`/api/v1/projects/${projectId}/autonomy`)).data;
 if(after.revision!==20||after.goalSpecHash!==p.goalSpecHash)throw Error('FIXTURE_PROFILE_CHANGED');
 return {...j.receipt,projectId,oldProfileUnchanged:true,scope:'Only generated package-contract/snapshot-contract fixture trees; preserved outside the source, symlinks not followed',restoreInstruction:'Use the root-private receipt and preserved trees; restore each original relative path only if absent, node idle, and preservedTreeSHA256 matches. Do not overwrite a new source or recreate links merely to force a failed acceptance to pass.'};
});
await writeFile(dir+'/candidate-generated-fixtures-quarantined.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({quarantineId:result.id,fixtures:result.fixtureDirs.length,sourceFingerprint:result.sourceFingerprint,sourceCodeChanged:false,restorable:true,oldProfileUnchanged:true}));
