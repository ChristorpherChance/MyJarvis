/** Fixed-target, read-only deployment metadata. No models, builds, tests or service writes. */
import { remote, lanProfile, python } from './managed-server-client.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const reportPath = 'artifacts/software-factory/goals-r20/latest-deployment-readiness.json';
const snapshot = JSON.parse(remote(lanProfile, 'jarvis-101', python({}, String.raw`
import os,json,stat,hashlib,subprocess,datetime,re,urllib.request,urllib.error
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf')
if root.is_symlink() or not root.is_dir():raise RuntimeError('SOURCE_ROOT_INVALID')
env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0';env['HOME']='/home/superopen'
def command(args,limit=25):
 r=subprocess.run(args,capture_output=True,timeout=limit,env=env)
 return r.returncode,r.stdout
def git(args):
 rc,out=command(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',str(root),*args])
 if rc!=0:raise RuntimeError('READONLY_GIT_FAILED')
 return out
def sha(raw):return hashlib.sha256(raw).hexdigest()
def excluded(name):
 parts=Path(name).parts
 if any(x in ['.git','node_modules','.pnpm-store','.claude','.codex','.cc-switch','.secrets','data','logs','coverage','dist','build','.next','.turbo','uploads','recordings','sessions','conversations','test-results','playwright-report'] for x in parts):return True
 base=parts[-1].lower() if parts else ''
 if base.startswith('.env') or base.endswith('.env') or '.env.' in base or re.search(r'(?:secret|credential|password|private[-_]?key|api[-_]?key|chat[-_]?history)',base):return True
 return Path(base).suffix in ['.db','.sqlite','.sqlite3','.pem','.key','.p12','.mp3','.wav','.ogg','.mp4','.log']
def status():
 raw=git(['status','--porcelain=v1','-z','--untracked-files=all']);items=raw.split(b'\0');rows=[];i=0;private=0
 while i<len(items):
  item=items[i];i+=1
  if not item:continue
  state=item[:2].decode('ascii');name=item[3:].decode('utf-8','replace');old=None
  if 'R' in state or 'C' in state:
   old=items[i].decode('utf-8','replace');i+=1
  if excluded(name) or old and excluded(old):private+=1;continue
  rows.append({'path':name,'status':state,**({'renamedFrom':old} if old else {})})
 return {'rawStatusSha256':sha(raw),'totalEntries':len(rows)+private,'publicEntries':rows,'excludedPrivateOrGeneratedEntries':private,'trackedDirtyPublicCount':sum(x['status']!='??' for x in rows),'untrackedPublicCount':sum(x['status']=='??' for x in rows)}
def manifest():
 names=git(['ls-files','-z','--cached','--others','--exclude-standard']).split(b'\0');rows=[];ex=0;missing=0;links=0
 for item in sorted(set(names)):
  if not item:continue
  name=item.decode('utf-8','replace')
  if excluded(name):ex+=1;continue
  q=root/name
  try:st=q.lstat()
  except FileNotFoundError:missing+=1;continue
  if not stat.S_ISREG(st.st_mode) or q.is_symlink():links+=1;continue
  if st.st_size>8*1024*1024:ex+=1;continue
  raw=q.read_bytes();rows.append({'path':name,'bytes':len(raw),'sha256':sha(raw)})
 canonical=json.dumps(rows,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
 return {'method':'git-index-and-nonignored-untracked-public-source-v1','canonicalManifestSha256':sha(canonical),'files':len(rows),'bytes':sum(x['bytes'] for x in rows),'excludedCount':ex,'missingCount':missing,'nonRegularOrSymlinkCount':links,'manifest':rows}
before={'head':git(['rev-parse','HEAD']).decode().strip(),'branch':git(['branch','--show-current']).decode().strip(),'status':status()}
historicalHead='4bf99d304bca0340967a3e3ac7a8f661cae74672'
historicalComparison={'referenceHead':historicalHead,'currentHead':before['head'],'doesNotEstablishDateOrAuthor':True,'fingerprintScopeDifferentFromHistoricalAudit':True}
try:
 raw=git(['diff','--name-status','-z',historicalHead,before['head']]);items=raw.split(b'\0');rows=[];i=0;excludedChanges=0
 while i<len(items) and items[i]:
  change=items[i].decode();i+=1;name=items[i].decode('utf-8','replace');i+=1;old=None
  if change.startswith(('R','C')):old=name;name=items[i].decode('utf-8','replace');i+=1
  if excluded(name) or old and excluded(old):excludedChanges+=1;continue
  rows.append({'path':name,'status':change,**({'renamedFrom':old} if old else {})})
 historicalComparison.update({'publicChangedFiles':rows,'publicChangedFileCount':len(rows),'excludedChangeCount':excludedChanges})
except:historicalComparison['comparisonStatus']='unavailable'
source=manifest()
packages=[]
for q in sorted(root.rglob('package.json')):
 name=str(q.relative_to(root))
 if excluded(name):continue
 if len(q.relative_to(root).parts)>5 or q.is_symlink() or q.stat().st_size>1024*1024:continue
 try:d=json.loads(q.read_text())
 except:continue
 scripts={}
 for k,v in d.get('scripts',{}).items():
  if not isinstance(v,str):continue
  scripts[k]={'commandSha256':sha(v.encode()),'kind':next((x for x in ['tsc','vite','vitest','playwright','pnpm','node','docker','tsx','turbo'] if re.search(r'(^|[ /])'+x+r'([ .:/-]|$)',v)),'other')}
  if re.fullmatch(r'[A-Za-z0-9_./:@=,*+ -]{1,300}',v) and not re.search(r'password|secret|token|api.?key|https?://|bearer',v,re.I):scripts[k]['publicCommand']=v
 packages.append({'path':name,'name':d.get('name'),'version':d.get('version'),'packageManager':d.get('packageManager'),'engines':d.get('engines'),'scripts':scripts,'dependencies':sorted(d.get('dependencies',{})),'devDependencies':sorted(d.get('devDependencies',{}))})
entries=[]
for row in source['manifest']:
 name=row['path'];base=Path(name).name
 if name.startswith('deploy/') or re.search(r'(?:deploy|package|docker|compose|install|release|start|health|nginx|caddy)',base,re.I) or base in ['pnpm-workspace.yaml','pnpm-lock.yaml','tsconfig.json','vite.config.ts']:
  entries.append(row)
units=[]
rc,raw=command(['/usr/bin/systemctl','list-unit-files','--type=service','--no-legend','--no-pager'])
for line in raw.decode(errors='replace').splitlines():
 unit=line.split()[0] if line.split() else ''
 if not re.fullmatch(r'[A-Za-z0-9_.@-]+\.service',unit) or not re.search(r'msf|software.factory',unit,re.I):continue
 rc,out=command(['/usr/bin/systemctl','show',unit,'--property=LoadState,ActiveState,SubState,MainPID,User,Group,WorkingDirectory,FragmentPath,ExecMainStatus,NRestarts'])
 units.append({'unit':unit,**dict(x.split('=',1) for x in out.decode(errors='replace').splitlines() if '=' in x)})
processes=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:
  cwd=os.readlink(proc/'cwd');comm=(proc/'comm').read_text().strip()
  if cwd!=str(root) and not cwd.startswith(str(root)+'/'):continue
  argv=(proc/'cmdline').read_bytes().split(b'\0');known=[]
  for arg in argv:
   value=arg.decode(errors='replace')
   if re.fullmatch(r'(?:\./)?(?:dist|src)/[A-Za-z0-9_./-]+',value):known.append(value)
   elif value.startswith(str(root)+'/') and not excluded(value[len(str(root))+1:]) and re.fullmatch(r'[A-Za-z0-9_./@+-]+',value):known.append(value)
  statfields=(proc/'stat').read_text().rsplit(')',1)[1].split()
  processes.append({'pid':int(proc.name),'parentPid':int(statfields[1]),'startTimeTicks':int(statfields[19]),'name':comm,'cwd':cwd,'executable':os.readlink(proc/'exe'),'publicEntrypointPaths':known,'containsWatchFlag':any(x in [b'--watch',b'--watchPath'] for x in argv),'loadedSourceAndBuildIdentity':'UNKNOWN_NO_RUNTIME_BUILD_MANIFEST'})
 except OSError:pass
docker={'available':False,'containers':[]}
try:
 rc,out=command(['/usr/bin/docker','ps','-a','--format','{{json .}}'])
 if rc==0:
  docker['available']=True
  for line in out.decode().splitlines():
   d=json.loads(line);name=d.get('Names','')
   if not re.search(r'msf|software.factory',name,re.I):continue
   item={k:d.get(k) for k in ['ID','Names','Image','Ports','State','Status']}
   template='{"workingDir":{{json .Config.WorkingDir}},"running":{{json .State.Running}},"healthStatus":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"restartPolicy":{{json .HostConfig.RestartPolicy.Name}},"mounts":{{json .Mounts}},"portBindings":{{json .HostConfig.PortBindings}}}'
   rc,meta=command(['/usr/bin/docker','inspect','--format',template,d['ID']])
   if rc==0:
    m=json.loads(meta);m['mounts']=[{k:x.get(k) for k in ['Type','Name','Source','Destination','RW']} for x in m['mounts']];item.update(m)
   docker['containers'].append(item)
except FileNotFoundError:pass
rc,out=command(['/usr/bin/ss','-H','-lntp'])
ports=[]
for line in out.decode(errors='replace').splitlines():
 fields=line.split()
 if len(fields)<4:continue
 local=fields[3];port=local.rsplit(':',1)[-1]
 if not port.isdigit():continue
 matches=re.findall(r'\("([A-Za-z0-9_.-]+)",pid=(\d+)',line)
 ports.append({'bind':local,'port':int(port),'processes':[{'name':n,'pid':int(pid)} for n,pid in matches]})
health={}
for origin,path in [('http://127.0.0.1:8080','/health'),('http://127.0.0.1:18920','/health')]:
 try:
  req=urllib.request.Request(origin+path,method='GET')
  with urllib.request.urlopen(req,timeout=4) as response:
   raw=response.read(65537)
   health[origin+path]={'httpStatus':response.status,'bytes':len(raw),'responseSha256':sha(raw),'jsonShape':None}
   if len(raw)<=65536:
    try:d=json.loads(raw);health[origin+path]['jsonShape']={'keys':sorted(d) if isinstance(d,dict) else [],'status':d.get('status') if isinstance(d,dict) and d.get('status') in ['ok','healthy','error','degraded'] else None,'booleanChecks':{k:v for k,v in d.items() if k in ['ok','db','redis','minio'] and isinstance(v,bool)} if isinstance(d,dict) else {}}
    except:pass
 except urllib.error.HTTPError as error:health[origin+path]={'httpStatus':error.code}
 except:health[origin+path]={'reachable':False,'reason':'HEALTH_GET_UNAVAILABLE'}
artifacts=[]
for folder in ['apps/server/dist','apps/web/dist','packages/shared/dist','dist','build']:
 q=root/folder
 if not q.is_dir() or q.is_symlink():continue
 rows=[]
 for f in sorted(q.rglob('*')):
  if f.is_symlink() or not f.is_file():continue
  st=f.stat();rows.append({'path':str(f.relative_to(root)),'bytes':st.st_size,'mtimeNs':st.st_mtime_ns,'sha256':sha(f.read_bytes())})
 content=[{'path':x['path'],'bytes':x['bytes'],'sha256':x['sha256']} for x in rows]
 artifacts.append({'path':folder,'files':len(rows),'bytes':sum(x['bytes'] for x in rows),'metadataFingerprint':sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()),'contentManifestSha256':sha(json.dumps(content,sort_keys=True,separators=(',',':')).encode()),'publicEntryFiles':[x for x in rows if Path(x['path']).name in ['main.js','index.html','migrate.js']],'latestMtimeNs':max((x['mtimeNs'] for x in rows),default=None),'sourceCorrelationVerified':False,'loadedProcessCorrelationVerified':False})
deployment={}
compose=root/'docker-compose.yml'
if compose.is_file() and not compose.is_symlink():
 try:
  import yaml
  d=yaml.safe_load(compose.read_text());services=[]
  for name,v in (d.get('services') or {}).items():
   if not isinstance(v,dict):continue
   build=v.get('build');build={'context':build.get('context'),'dockerfile':build.get('dockerfile')} if isinstance(build,dict) else build
   services.append({'name':name,'image':v.get('image'),'containerName':v.get('container_name'),'build':build,'ports':v.get('ports',[]),'volumes':v.get('volumes',[]),'dependsOn':sorted(v.get('depends_on',{})),'restart':v.get('restart'),'healthcheckConfigured':bool(v.get('healthcheck')),'environmentValuesExported':False})
  deployment['compose']={'path':'docker-compose.yml','parseStatus':'parsed-whitelist-only','services':services,'namedVolumes':sorted(d.get('volumes',{})),'networks':sorted(d.get('networks',{}))}
 except ImportError:deployment['compose']={'path':'docker-compose.yml','parseStatus':'yaml-unavailable-not-executed'}
 except:deployment['compose']={'path':'docker-compose.yml','parseStatus':'parse-failed-no-raw-output'}
for name in ['apps/server/Dockerfile','deploy/101/msf-app.service','deploy/116/msf-app.service','/etc/systemd/system/msf-app.service']:
 q=Path(name) if name.startswith('/') else root/name
 if not q.is_file() or q.is_symlink():continue
 raw=q.read_bytes();directives=[]
 for i,line in enumerate(raw.decode(errors='replace').splitlines(),1):
  s=line.strip()
  if name.endswith('Dockerfile'):
   m=re.match(r'^(FROM|WORKDIR|COPY|EXPOSE|CMD|ENTRYPOINT)\s+(.+)',s)
   if m and not re.search(r'password|secret|token|api.?key|https?://|bearer',m[2],re.I):directives.append({'line':i,'name':m[1],'value':m[2]})
   elif re.match(r'^RUN\s+',s):directives.append({'line':i,'name':'RUN','valueSha256':sha(s.encode()),'usesPnpm':bool(re.search(r'\bpnpm\b',s)),'usesBuild':bool(re.search(r'\bbuild\b',s))})
  else:
   m=re.match(r'^(User|Group|WorkingDirectory|ExecStart|EnvironmentFile|Restart|RestartSec|After|Requires|WantedBy|ProtectSystem|ReadWritePaths)=(.*)',s)
   if m and not re.search(r'password|secret|token|api.?key|https?://|bearer',m[2],re.I):directives.append({'line':i,'name':m[1],'value':m[2]})
 deployment[name]={'sha256':sha(raw),'bytes':len(raw),'directives':directives}
readme=[]
for name in ['README.md','deploy/101/README.md','deploy/116/README.md']:
 q=root/name
 if not q.is_file() or q.is_symlink():continue
 steps=[]
 for i,line in enumerate(q.read_text().splitlines(),1):
  s=line.strip().removeprefix('$ ')
  if re.match(r'^(?:pnpm|corepack|node|docker compose|systemctl|sudo systemctl|git clone|git checkout)\b',s) and not re.search(r'password|secret|token|api.?key|https?://|bearer|\.env',s,re.I):steps.append({'line':i,'publicCommand':s})
 readme.append({'path':name,'documentedCommands':steps,'commandsExecuted':False})
deployment['readmeEntryReferences']=readme
deployment['staticConfig']={}
for name in ['apps/server/src/main.ts','apps/web/vite.config.ts','apps/server/src/modules/platform/health.controller.ts']:
 q=root/name
 if not q.is_file() or q.is_symlink():continue
 raw=q.read_text();info={'sha256':sha(raw.encode())}
 if name.endswith('main.ts'):
  info['portEnvironmentVariableUsed']=bool(re.search(r'process\.env\.PORT',raw));info['portDefaults']=re.findall(r'(?:env\.PORT\s*(?:\|\||\?\?)\s*|get\([^)]*[\"\']PORT[\"\'][^)]*\)\s*(?:\|\||\?\?)\s*)(\d{2,5})',raw);info['staticServeConfigured']=bool(re.search(r'\b(useStaticAssets|ServeStaticModule|serveStatic)\b',raw));info['localOnlyHostLiteral']=bool(re.search(r'127\.0\.0\.1',raw))
 if name.endswith('vite.config.ts'):info['configuredPorts']=re.findall(r'\bport\s*:\s*(\d{2,5})',raw);info['proxyTargetOrigins']=re.findall(r'target\s*:\s*[\"\'](https?://(?:127\.0\.0\.1|localhost):\d+)',raw)
 if name.endswith('health.controller.ts'):info['healthRouteLiterals']=re.findall(r'@(Controller|Get)\([\"\']([^\"\']*)',raw)
 deployment['staticConfig'][name]=info
after={'head':git(['rev-parse','HEAD']).decode().strip(),'branch':git(['branch','--show-current']).decode().strip(),'status':status()}
afterSource=manifest()
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'sourceRoot':str(root),'gitBefore':before,'gitAfter':after,'source':source,'sourceFingerprintAfter':afterSource['canonicalManifestSha256'],'sourceStableDuringInspection':before==after and source['canonicalManifestSha256']==afterSource['canonicalManifestSha256'],'historicalSourceComparison':historicalComparison,'packages':packages,'entryFiles':entries,'deploymentEntries':deployment,'systemdUnits':units,'sourceProcesses':processes,'docker':docker,'listeningPorts':ports,'health':health,'existingBuildArtifactMetadata':artifacts,'dependenciesPresent':{'rootNodeModules':(root/'node_modules').is_dir(),'serverNodeModules':(root/'apps/server/node_modules').is_dir(),'webNodeModules':(root/'apps/web/node_modules').is_dir()},'modelCalls':0,'buildsRun':0,'testsRun':0,'deploymentsRun':0,'restartsRun':0,'directDatabaseReads':0,'privateFileContentsOrChatExported':False,'privateEnvFilesExcludedFromManifest':True},ensure_ascii=False))
`), true, { timeoutMs: 180000 }));

const implementationSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const listeners = snapshot.listeningPorts.filter(x => [8080,18920,5173].includes(x.port));
const appService = snapshot.systemdUnits.find(x => x.unit === 'msf-app.service');
const report = {
  at: new Date().toISOString(),
  scope: '101 existing software-factory source and runtime read-only packaging/deployment discovery',
  implementation: { path: 'scripts/read-101-deployment-readiness-r20.mjs', sha256: implementationSha256 },
  snapshot,
  assessment: {
    currentVersionBuildOrTestVerified: false,
    independentCandidateDeploymentVerified: false,
    packageInstallHealthRollbackVerified: false,
    overallReadiness: 'READ_ONLY_DISCOVERY_ONLY_NOT_RELEASE_ACCEPTANCE',
    sourceSnapshotIsFreeze: false,
    existingArtifactPresenceDoesNotProveCurrentSourceRunnable: true,
    identities: {
      currentSource: { head: snapshot.gitAfter.head, publicSourceManifestSha256: snapshot.source.canonicalManifestSha256, trackedDirtyPublicCount: snapshot.gitAfter.status.trackedDirtyPublicCount, privateUntrackedEnvCount: snapshot.gitAfter.status.excludedPrivateOrGeneratedEntries, stableDuringInspection: snapshot.sourceStableDuringInspection },
      existingBuildsOnDisk: snapshot.existingBuildArtifactMetadata,
      actualListeningProcesses: listeners.map(x=>({ ...x, owners:x.processes.map(p=>snapshot.sourceProcesses.find(v=>v.pid===p.pid)??{pid:p.pid,metadataUnavailable:true}), systemdAppMainPidMatch:x.processes.some(p=>String(p.pid)===appService?.MainPID), healthGet:snapshot.health['http://127.0.0.1:'+x.port+'/health']??null })),
      currentSourceMatchesExistingDiskBuilds: 'UNKNOWN_NO_BUILD_MANIFEST',
      existingDiskBuildsMatchLoadedProcesses: 'UNKNOWN_JAVASCRIPT_LOADING_NOT_ATTESTED',
    },
    entryReadiness: {
      rootBuildEntry: 'pnpm -r run build exists; not executed for this source fingerprint',
      backendBuildAndRuntime: 'Nest build + node dist/main.js entries and multi-stage Dockerfile exist; presence only',
      frontendBuild: 'Vite/TypeScript build entry and dist exist; current-source build correlation unknown',
      existingSystemdUnitMatchesRepositoryUnit: snapshot.deploymentEntries['/etc/systemd/system/msf-app.service']?.sha256===snapshot.deploymentEntries['deploy/101/msf-app.service']?.sha256,
      dockerFrontendPackaging: 'No frontend COPY in current backend Dockerfile; complete UI packaging/serving requires separate validation and possibly package adjustment',
      composeCollision: 'Current compose reserves live ports; requires candidate override before a concurrent deployment',
      independentCandidate: 'CAN_PREPARE_ISOLATED_CANDIDATE_FROM_PUBLIC_SOURCE_BUT_NOT_VERIFIED_DEPLOYABLE',
      blockers: ['no current-source successful build/test evidence in this inspection', 'no immutable complete frontend/backend delivery artifact', 'no build-to-source and loaded-runtime provenance', 'no separate candidate environment, migration and dependency namespaces verified', 'no candidate install/health/rollback acceptance'],
    },
    existingInstanceBoundaries: {
      source: '/home/superopen/All-Projects/msf is in use by development processes and systemd app; do not replace dist, install dependencies, checkout, migrate or restart it for candidate validation',
      services: 'msf-app.service and jarvis-software-factory-development.service are different roles; preserve both',
      reservedPorts: [8080, 18920, 5173, 5432, 6379, 9000, 9001, 3141],
      data: 'PostgreSQL/Redis/MinIO live bind mounts /home/superopen/msf-data/* must not be reused or cleared by candidate tests',
      requiredIsolation: ['new immutable source copy and fingerprint', 'separate app/frontend ports', 'new service/container names and compose project name', 'separate PostgreSQL/Redis/MinIO instances or explicitly isolated data and credentials', 'separate persistent paths, test accounts, environment and migration target', 'candidate-only egress/model limits', 'candidate health/build/install/package/rollback evidence before choosing any cutover'],
    },
  },
};
await mkdir('artifacts/software-factory/goals-r20', { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ written: reportPath, head: snapshot.gitAfter.head, dirty: snapshot.gitAfter.status.totalEntries, sourceStable: snapshot.sourceStableDuringInspection, packages: snapshot.packages.map(p=>p.path), entryFiles: snapshot.entryFiles.map(p=>p.path), units: snapshot.systemdUnits, sourceProcesses: snapshot.sourceProcesses, docker: snapshot.docker, health: snapshot.health, models: 0, builds: 0, tests: 0 }));
