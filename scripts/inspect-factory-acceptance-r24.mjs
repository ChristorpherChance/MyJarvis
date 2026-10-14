/** Fixed target, read-only source/runtime readiness. No tests, models or remote writes. */
import { remote, lanProfile, python } from './managed-server-client.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const target = 'artifacts/software-factory/acceptance-r24/source-and-fixed-entry-readiness.json';
const localPairs = [
 ['scripts/project-autonomy-validation-wrapper.py','/usr/local/libexec/jarvis-project-autonomy-validation'],
 ['scripts/project-autonomy-validator.mjs','/opt/jarvis-development/software-factory/project-autonomy-validator.mjs'],
 ['scripts/project-autonomy-evidence.py','/opt/jarvis-development/software-factory/project-autonomy-evidence.py'],
 ['scripts/project-autonomy-fa01-coordinator.py','/opt/jarvis-development/software-factory/project-autonomy-fa01-coordinator.py'],
 ['scripts/project-autonomy-fa01-collector.mjs','/opt/jarvis-development/software-factory/project-autonomy-fa01-collector.mjs'],
 ['scripts/project-autonomy-fa01-browser.mjs','/opt/jarvis-development/software-factory/project-autonomy-fa01-browser.mjs'],
 ['scripts/software-factory-validation-wrapper.py','/usr/local/libexec/jarvis-msf-validation'],
 ['scripts/software-factory-validation.mjs','/opt/jarvis-development/software-factory/validate-msf.mjs'],
 ['scripts/factory-full-test-runner.py','/usr/local/libexec/jarvis-msf-full-validation'],
 ['scripts/factory-full-test-entry.mjs','/opt/jarvis-development/software-factory/factory-full-test-entry.mjs'],
];
const expected = [];
for (const [local, installed] of localPairs) {
 try { const raw = await readFile(local); expected.push({local, installed, sha256:createHash('sha256').update(raw).digest('hex')}); }
 catch { expected.push({local, installed, sha256:null}); }
}
const snapshot = JSON.parse(remote(lanProfile,'jarvis-101',python({expected},String.raw`
import os,json,stat,hashlib,subprocess,datetime,re,urllib.request,urllib.error,sqlite3
from pathlib import Path
ROOTS=['/home/superopen/All-Projects/msf','/home/superopen/All-Projects/msf-jarvis-autonomy-r22']
env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0';env['HOME']='/home/superopen'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def cmd(args,timeout=20):
 try:
  r=subprocess.run(args,capture_output=True,timeout=timeout,env=env);return r.returncode,r.stdout
 except (OSError,subprocess.TimeoutExpired):return -1,b''
def git(root,args):
 rc,out=cmd(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',root,*args])
 if rc:raise RuntimeError('READONLY_GIT_FAILED')
 return out
def excluded(name):
 parts=Path(name).parts;v=parts[-1].lower() if parts else ''
 if any(x in ['.git','node_modules','.pnpm-store','.claude','.codex','.cc-switch','.secrets','data','logs','coverage','dist','build','.next','.turbo','uploads','recordings','sessions','conversations','test-results','playwright-report','artifacts','reports'] for x in parts):return True
 return (v.startswith('.env') or v.endswith('.env') or '.env.' in v or bool(re.search(r'secret|credential|password|private[-_]?key|api[-_]?key|chat[-_]?history',v)) or Path(v).suffix in ['.db','.sqlite','.sqlite3','.pem','.key','.p12','.mp3','.wav','.ogg','.mp4','.log'])
def publicname(name):return bool(re.fullmatch(r'[A-Za-z0-9_./@+ -]+',name)) and not excluded(name)
def state(root):
 raw=git(root,['status','--porcelain=v1','-z','--untracked-files=all']);items=raw.split(b'\0');rows=[];i=0;private=0
 while i<len(items):
  item=items[i];i+=1
  if not item:continue
  s=item[:2].decode();name=item[3:].decode('utf-8','replace');old=None
  if 'R' in s or 'C' in s:old=items[i].decode('utf-8','replace');i+=1
  if excluded(name) or old and excluded(old):private+=1;continue
  rows.append({'path':name,'status':s,**({'renamedFrom':old} if old else {})})
 return {'head':git(root,['rev-parse','HEAD']).decode().strip(),'branch':git(root,['branch','--show-current']).decode().strip(),'statusSha256':sha(raw),'publicChanges':rows,'publicTrackedChanges':sum(x['status']!='??' for x in rows),'publicUntrackedFiles':sum(x['status']=='??' for x in rows),'excludedPrivateOrGeneratedChanges':private}
def manifest(root):
 rows=[];excluded_count=0;missing=0;nonregular=0
 for raw in sorted(set(git(root,['ls-files','-z','--cached','--others','--exclude-standard']).split(b'\0'))):
  if not raw:continue
  name=raw.decode('utf-8','replace')
  if excluded(name):excluded_count+=1;continue
  q=Path(root)/name
  try:s=q.lstat()
  except FileNotFoundError:missing+=1;continue
  if q.is_symlink() or not stat.S_ISREG(s.st_mode):nonregular+=1;continue
  if s.st_size>8*1024*1024:excluded_count+=1;continue
  b=q.read_bytes();rows.append({'path':name,'bytes':len(b),'sha256':sha(b)})
 return {'method':'git-index-nonignored-untracked-public-source-v2-excludes-generated-evidence','sha256':sha(json.dumps(rows,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()),'files':len(rows),'bytes':sum(x['bytes'] for x in rows),'excluded':excluded_count,'missing':missing,'nonRegular':nonregular,'manifest':rows}
sources=[]
for root in ROOTS:
 if Path(root).is_symlink() or not Path(root).is_dir():raise RuntimeError('SOURCE_ROOT_INVALID')
 a=state(root);m=manifest(root);packages=[];entries=[];testfiles=[];evidence=[]
 for row in m['manifest']:
  name=row['path'];q=Path(root)/name;basename=q.name
  if basename=='package.json':
   try:
    d=json.loads(q.read_bytes());scripts={}
    for k,v in d.get('scripts',{}).items():
     if not isinstance(v,str):continue
     scripts[k]={'sha256':sha(v.encode())}
     if re.fullmatch(r'[A-Za-z0-9_./:@=,*+ -]{1,300}',v) and not re.search(r'password|secret|token|api.?key|https?://|bearer',v,re.I):scripts[k]['publicCommand']=v
    packages.append({'path':name,'name':d.get('name'),'version':d.get('version'),'packageManager':d.get('packageManager'),'scripts':scripts})
   except (ValueError,OSError):pass
  if re.search(r'\.(?:test|spec)\.(?:ts|js|mjs|tsx)$',name):testfiles.append(row)
  if name.startswith('scripts/jarvis-autonomy/') or name.startswith('docs/') and re.search(r'fa-01|jarvis-decisions|deliver|accept|test|deploy',basename,re.I):evidence.append(row)
  if name.startswith('deploy/') or re.search(r'docker|compose|package|install|release|start|health|vitest|playwright',basename,re.I):entries.append(row)
 builds=[]
 for folder in ['apps/server/dist','apps/web/dist','packages/shared/dist']:
  q=Path(root)/folder
  if not q.is_dir() or q.is_symlink():continue
  rs=[]
  for f in sorted(q.rglob('*')):
   if f.is_symlink() or not f.is_file():continue
   st=f.stat()
   if st.st_size>8*1024*1024:continue
   rs.append({'path':str(f.relative_to(Path(root))),'bytes':st.st_size,'sha256':sha(f.read_bytes()),'mtimeNs':st.st_mtime_ns})
  builds.append({'path':folder,'files':len(rs),'bytes':sum(x['bytes'] for x in rs),'contentManifestSha256':sha(json.dumps([{k:v for k,v in x.items() if k!='mtimeNs'} for x in rs],sort_keys=True,separators=(',',':')).encode()),'entryFiles':[x for x in rs if Path(x['path']).name in ['main.js','index.html']],'sourceCorrelation':'UNKNOWN_NO_BUILD_MANIFEST','loadedProcessCorrelation':'UNKNOWN_NOT_ATTESTED'})
 b=state(root);n=manifest(root)
 sources.append({'workspace':root,'gitBefore':a,'gitAfter':b,'publicSource':m,'publicSourceFingerprintAfter':n['sha256'],'stableDuringRead':a==b and m['sha256']==n['sha256'],'packages':packages,'testFileMetadata':testfiles,'publicAccomplishmentFileMetadata':evidence,'entryFileMetadata':entries,'diskBuilds':builds,'dependenciesPresent':{'root':(Path(root)/'node_modules').is_dir(),'server':(Path(root)/'apps/server/node_modules').is_dir(),'web':(Path(root)/'apps/web/node_modules').is_dir()},'buildOrTestRun':False})
old={r['path']:r for r in sources[0]['publicSource']['manifest']};new={r['path']:r for r in sources[1]['publicSource']['manifest']}
comparison={'sameHead':sources[0]['gitAfter']['head']==sources[1]['gitAfter']['head'],'samePublicContent':sources[0]['publicSource']['sha256']==sources[1]['publicSource']['sha256'],'sameFingerprintMethod':True,'onlyOriginal':sorted(set(old)-set(new)),'onlyCandidate':sorted(set(new)-set(old)),'differentContent':[{'path':x,'originalSha256':old[x]['sha256'],'candidateSha256':new[x]['sha256']} for x in sorted(set(old)&set(new)) if old[x]['sha256']!=new[x]['sha256']]}
def trustedmetadata(path):
 q=Path(path);out={'path':path}
 try:
  s=q.lstat();out.update({'exists':True,'uid':s.st_uid,'mode':oct(stat.S_IMODE(s.st_mode)),'bytes':s.st_size,'regular':stat.S_ISREG(s.st_mode),'symlink':stat.S_ISLNK(s.st_mode),'nlink':s.st_nlink})
  parents=[q,*q.parents];out['trustedRootParentChain']=all(v.lstat().st_uid==0 and not v.lstat().st_mode&0o022 and not v.is_symlink() for v in parents)
  if stat.S_ISREG(s.st_mode) and not q.is_symlink() and s.st_size<8*1024*1024:out['sha256']=sha(q.read_bytes())
 except (OSError,ValueError):out['exists']=False
 return out
tools=[]
for item in p['expected']:
 meta=trustedmetadata(item['installed']);meta.update({'localPath':item['local'],'localSha256':item['sha256'],'matchesLocal':item['sha256'] is not None and meta.get('sha256')==item['sha256']});tools.append(meta)
policies=[]
for phase in ['FA-%02d'%i for i in range(1,10)]:
 file='/etc/jarvis-development/project-autonomy/'+phase+'.json';meta=trustedmetadata(file)
 if meta.get('exists'):
  try:
   d=json.loads(Path(file).read_bytes());meta.update({k:d.get(k) for k in ['schemaVersion','workPackage','goalSpecHash','workspace','workspaceRoot','mode','runAsUser','maxTotalSec','expectedChecks']})
  except (OSError,ValueError):meta['parseFailed']=True
 policies.append(meta)
baseline=trustedmetadata('/etc/jarvis-development/project-autonomy/baseline.json')
images=[]
for image in ['jarvis-msf-test:20261010-r2','postgres:16','redis:7','quay.io/minio/minio']:
 rc,out=cmd(['/usr/bin/docker','image','inspect','--format','{{.Id}}',image]);value=out.decode().strip();images.append({'reference':image,'present':rc==0,'imageId':value if re.fullmatch(r'sha256:[a-f0-9]{64}',value) else None})
rc,raw=cmd(['/usr/bin/ss','-H','-lntp']);listeners=[]
for line in raw.decode(errors='replace').splitlines():
 f=line.split()
 if len(f)<4:continue
 addr=f[3];port=addr.rsplit(':',1)[-1]
 if not port.isdigit():continue
 pidrows=[{'processName':name,'pid':int(pid)} for name,pid in re.findall(r'\("([A-Za-z0-9_.-]+)",pid=(\d+)',line)]
 if int(port) in [8080,18920,5173,5432,6379,9000,9001] or any(Path('/proc/'+str(x['pid'])+'/cwd').exists() and any(str(Path('/proc/'+str(x['pid'])+'/cwd').resolve()).startswith(root) for root in ROOTS) for x in pidrows):listeners.append({'bind':addr,'port':int(port),'processes':pidrows})
processes=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:
  cwd=os.readlink(proc/'cwd');owner=next((root for root in ROOTS if cwd==root or cwd.startswith(root+'/')),None)
  if not owner:continue
  argv=(proc/'cmdline').read_bytes().split(b'\0');entries=[]
  for a in argv:
   v=a.decode(errors='replace')
   if re.fullmatch(r'(?:\./)?(?:dist|src)/[A-Za-z0-9_./-]+',v):entries.append(v)
   elif v.startswith(owner+'/') and publicname(v[len(owner)+1:]):entries.append(v)
  fields=(proc/'stat').read_text().rsplit(')',1)[1].split();processes.append({'pid':int(proc.name),'parentPid':int(fields[1]),'startTimeTicks':int(fields[19]),'name':(proc/'comm').read_text().strip(),'workspace':owner,'cwd':cwd,'publicEntryPaths':entries,'watchMode':any(x in [b'--watch',b'--watchPath'] for x in argv),'loadedBuildIdentity':'UNKNOWN_NO_BUILD_MANIFEST'})
 except OSError:pass
health=[]
for port,path in [(8080,'/health'),(18920,'/health'),(5173,'/')]:
 record={'url':'http://127.0.0.1:'+str(port)+path}
 try:
  with urllib.request.urlopen(record['url'],timeout=4) as response:
   raw=response.read(65537);record.update({'httpStatus':response.status,'bytes':len(raw),'sha256':sha(raw)})
   try:
    d=json.loads(raw)
    if isinstance(d,dict):record.update({'jsonKeys':sorted(d),'booleanChecks':{k:v for k,v in d.items() if k in ['ok','db','redis','minio'] and isinstance(v,bool)},'publicVersion':{k:v for k,v in d.items() if k in ['version','commit','commitHash','buildId'] and isinstance(v,str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,80}',v)}})
   except ValueError:pass
 except urllib.error.HTTPError as e:record['httpStatus']=e.code
 except (OSError,ValueError):record.update({'reachable':False,'reason':'HEALTH_GET_UNAVAILABLE'})
 health.append(record)
units=[]
for unit in ['msf-app.service','jarvis-software-factory-development.service']:
 rc,out=cmd(['/usr/bin/systemctl','show',unit,'--property=LoadState,ActiveState,SubState,MainPID,User,Group,WorkingDirectory,FragmentPath,ExecMainStatus,NRestarts']);units.append({'unit':unit,'readStatus':rc,**dict(x.split('=',1) for x in out.decode(errors='replace').splitlines() if '=' in x)})
cfg=Path('/var/lib/jarvis-development/101/config.json');node={}
try:
 d=json.loads(cfg.read_bytes());templates=d.get('templates',[])
 if isinstance(templates,dict):templates=list(templates.values())
 if not templates:templates=d.get('executors',[])
 # Signed node config public frozen execution templates only; no pairing/auth/env export.
 node['publicTemplates']=[]
 for t in templates:
  if not isinstance(t,dict) or not str(t.get('id','')).startswith('msf-autonomy-'):continue
  safe={k:t.get(k) for k in ['id','engine','purpose','program','args','workspaceRoot','maxRounds','timeoutSec','leaseSec','billing','validation']}
  if 'env' in (safe.get('validation') or {}):safe['validation']={k:v for k,v in safe['validation'].items() if k!='env'}
  safe['fullTemplateSha256']=sha(json.dumps(t,sort_keys=True,separators=(',',':')).encode());node['publicTemplates'].append(safe)
 node['privateConfigKeys']=sorted(d)
except (ValueError,OSError):node['configReadStatus']='UNAVAILABLE'
agent='0b5aea06-47e1-4f4b-a32e-969417915c9c';j=Path('/var/lib/jarvis-development/101/.delivery-'+agent+'/journal.sqlite');node['journal']={'exists':j.is_file(),'path':str(j)}
if j.is_file():
 try:
  c=sqlite3.connect('file:'+str(j)+'?mode=ro',uri=True);names=[x[0] for x in c.execute("select name from sqlite_master where type='table'")];node['journal']['tables']=names
  counts={}
  for name in ['deliveries','attempts']:
   if name in names:
    fields=[x[1] for x in c.execute('pragma table_info('+name+')')]
    counts[name]={'rows':c.execute('select count(*) from '+name).fetchone()[0]}
    if 'state' in fields:counts[name]['states']=dict(c.execute('select state,count(*) from '+name+' group by state'))
  node['journal']['counts']=counts;c.close()
 except sqlite3.Error:node['journal']['readStatus']='READONLY_UNAVAILABLE'
resources={}
for folder in ROOTS+['/var/lib/jarvis-development/101/autonomy-evidence','/var/lib/jarvis-development/101/validation']:
 q=Path(folder);r={'path':folder,'exists':q.exists()}
 if q.exists():
  v=os.statvfs(q);r.update({'freeBytes':v.f_bavail*v.f_frsize,'totalBytes':v.f_blocks*v.f_frsize,'mode':oct(stat.S_IMODE(q.lstat().st_mode)),'uid':q.lstat().st_uid,'symlink':q.is_symlink()})
 resources[folder]=r
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'sources':sources,'comparison':comparison,'installedFixedPrograms':tools,'phasePolicies':policies,'baselinePolicyMetadata':baseline,'fixedDockerImages':images,'listeners':listeners,'sourceProcesses':processes,'health':health,'systemdUnits':units,'node':node,'resources':resources,'privateContentExported':False,'modelCalls':0,'buildsRun':0,'testsRun':0,'deploymentsRun':0,'restartsRun':0},ensure_ascii=False))
`),true,{timeoutMs:180000}));
const report = {schemaVersion:1,kind:'software-factory-acceptance-readiness',at:new Date().toISOString(),implementation:{path:'scripts/inspect-factory-acceptance-r24.mjs',sha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')},snapshot,limitations:['Read-only metadata does not certify product acceptance.','Current source, disk dist and loaded listening processes are distinct identities.','Historical collector pass/fail reports are not replayed and do not establish acceptance of either current tree.','Private environment, credentials and original model/chat log contents are excluded.']};
await mkdir('artifacts/software-factory/acceptance-r24',{recursive:true});
await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:target,sha256:createHash('sha256').update(await readFile(target)).digest('hex'),sources:snapshot.sources.map(s=>({workspace:s.workspace,head:s.gitAfter.head,stable:s.stableDuringRead,tracked:s.gitAfter.publicTrackedChanges,untracked:s.gitAfter.publicUntrackedFiles,fingerprint:s.publicSource.sha256})),comparison:{sameHead:snapshot.comparison.sameHead,samePublicContent:snapshot.comparison.samePublicContent,onlyOriginal:snapshot.comparison.onlyOriginal.length,onlyCandidate:snapshot.comparison.onlyCandidate.length,different:snapshot.comparison.differentContent.length},fixedPrograms:snapshot.installedFixedPrograms.map(x=>({path:x.path,exists:x.exists,match:x.matchesLocal,sha256:x.sha256,trusted:x.trustedRootParentChain})),health:snapshot.health,templates:snapshot.node.publicTemplates?.map(x=>x.id)}));
