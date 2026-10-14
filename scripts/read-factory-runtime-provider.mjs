/** Read-only provider provenance: only whitelisted metadata crosses SSH. No model call. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {writeFile} from 'node:fs/promises';
const data=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`import os,re,json,hashlib,subprocess,datetime
from pathlib import Path
ROOT=Path('/home/superopen/All-Projects/msf')
def provider(v):
 return {'present':v is not None,'value':v if v in ['pi','mock'] else ('other-redacted' if v is not None else None)}
def safe_path(v):
 try:
  q=Path(v).resolve()
  return str(q) if str(q).startswith(('/home/superopen/All-Projects/msf/','/etc/systemd/','/usr/lib/systemd/','/opt/jarvis-development/')) else 'outside-public-scope'
 except:return 'unreadable'
def read_env(proc):
 return dict(x.decode(errors='replace').split('=',1) for x in (proc/'environ').read_bytes().split(b'\0') if b'=' in x)
def argv_metadata(proc):
 argv=[x.decode(errors='replace') for x in (proc/'cmdline').read_bytes().split(b'\0') if x]
 allowed=['--require','-r','--import','--env-file','--env-file-if-exists','-e','--eval','--experimental-loader','--loader']
 flags=[f for f in allowed if any(x==f or x.startswith(f+'=') for x in argv)]
 scripts=[safe_path(x if x.startswith('/') else str(Path(os.readlink(proc/'cwd'))/x)) for x in argv[1:] if not x.startswith('-') and re.search(r'\.(?:js|mjs|cjs|sh)$',x)]
 return {'executableBasename':Path(argv[0]).name if argv else None,'entryPaths':scripts,'loaderOrInlineFlags':flags}
processes=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:
  cwd=os.readlink(proc/'cwd');argv=(proc/'cmdline').read_bytes().split(b'\0')
  if not cwd.startswith(str(ROOT)) or not any(b'main.js' in x for x in argv):continue
  env=read_env(proc);opts=env.get('NODE_OPTIONS','')
  cg=(proc/'cgroup').read_text()
  units=sorted(set(re.findall(r'([A-Za-z0-9_.@-]+\.service)',cg)))
  stat=(proc/'stat').read_text();ticks=int(stat[stat.rfind(')')+2:].split()[19]);uptime=float(Path('/proc/uptime').read_text().split()[0]);hz=os.sysconf('SC_CLK_TCK');startEpoch=datetime.datetime.now(datetime.timezone.utc).timestamp()-uptime+ticks/hz
  item={'pid':int(proc.name),'cwd':cwd,'startupProviderEnvironment':provider(env.get('MSF_AI_PROVIDER')),'nodeOptionsPresent':bool(opts),'nodeOptionsLoaderFlags':sorted(set(re.findall(r'--(?:require|import|env-file(?:-if-exists)?|experimental-loader|loader)|(?<!\w)-r(?!\w)',opts))),'argvMetadata':argv_metadata(proc),'systemdUnits':units,'processStartedAt':datetime.datetime.fromtimestamp(startEpoch,datetime.timezone.utc).isoformat(),'ancestors':[]}
  parent=int(stat[stat.rfind(')')+2:].split()[1])
  for _ in range(4):
   if parent<=1:break
   q=Path('/proc')/str(parent)
   try:
    s=(q/'stat').read_text();e=read_env(q)
    item['ancestors'].append({'pid':parent,'argvMetadata':argv_metadata(q),'startupProviderEnvironment':provider(e.get('MSF_AI_PROVIDER'))});parent=int(s[s.rfind(')')+2:].split()[1])
   except:break
  processes.append(item)
 except:pass
public_files=[];provider_hits=[];loaders=[]
for rel in ['apps/server/src','apps/server/dist']:
 base=ROOT/rel
 if not base.is_dir():continue
 for path in base.rglob('*'):
  if path.is_symlink() or not path.is_file() or path.suffix not in ['.ts','.js','.mjs','.cjs'] or path.stat().st_size>500000:continue
  t=path.read_text(errors='replace');name=str(path.relative_to(ROOT))
  if 'MSF_AI_PROVIDER' in t:
   provider_hits.append({'path':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'readsProviderEqualsPi':bool(re.search(r"process\.env\.MSF_AI_PROVIDER\s*===\s*['\"]pi['\"]",t)),'providerAssignmentPresent':bool(re.search(r'process\.env(?:\.MSF_AI_PROVIDER|\[[^\]]*MSF_AI_PROVIDER[^\]]*\])\s*=(?!=)',t))})
  if re.search(r'(?<![A-Za-z])dotenv|loadEnvFile|ConfigModule\s*\.\s*forRoot|dotenv-flow|dotenv/config',t):loaders.append({'path':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for rel in ['apps/server/src/main.ts','apps/server/src/app.module.ts','apps/server/src/config.ts','apps/server/src/modules/ai/ai.module.ts','apps/server/dist/main.js','apps/server/dist/app.module.js','apps/server/dist/config.js','apps/server/dist/modules/ai/ai.module.js','package.json','apps/server/package.json']:
 path=ROOT/rel
 if path.is_file() and not path.is_symlink():
  public_files.append({'path':rel,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'modifiedAt':datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat(),'bytes':path.stat().st_size})
config_sources=[]
for name in ['.env','.env.local','.env.production','.env.development','apps/server/.env','apps/server/.env.local','apps/server/.env.production','compose.yml','compose.yaml','docker-compose.yml','docker-compose.yaml','deploy/docker-compose.yml','deploy/docker-compose.yaml']:
 path=ROOT/name
 if not path.is_file() or path.is_symlink() or path.stat().st_size>1000000:continue
 t=path.read_text(errors='replace');vals=[]
 for line in t.splitlines():
  m=re.match(r'^\s*(?:-\s*)?(?:export\s+)?MSF_AI_PROVIDER\s*(?:=|:)\s*([^#\r\n]+)',line)
  if m:vals.append(provider(m.group(1).strip().strip('"\'')))
 config_sources.append({'path':name,'providerAssignments':vals,'envFileDirectivePresent':bool(re.search(r'\benv_file\s*:',t)),'dotenvOrEnvSourceDirectivePresent':bool(re.search(r'dotenv|--env-file|(?:^|\n)\s*(?:source|\.)\s+.*\.env',t)),'contentExported':False})
units=[]
for name in sorted(set(u for x in processes for u in x['systemdUnits'])):
 r=subprocess.run(['/usr/bin/systemctl','show',name,'--property=ActiveState,SubState,MainPID,FragmentPath,DropInPaths,EnvironmentFiles,Environment,ExecStart'],capture_output=True,text=True,timeout=8)
 d=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
 e=d.get('Environment','');a=re.search(r'(?:^|\s)MSF_AI_PROVIDER=([^\s]+)',e)
 envfiles=[]
 for value,ignored in re.findall(r'(?:^|\s)(/[^\s]+)\s+\(ignore_errors=(yes|no)\)',d.get('EnvironmentFiles','')):
  q=Path(value);row={'path':safe_path(value),'ignoreErrors':ignored=='yes','providerAssignments':[],'contentExported':False}
  if q.is_file() and not q.is_symlink() and q.stat().st_size<1000000:
   row.update({'readable':True,'modifiedAt':datetime.datetime.fromtimestamp(q.stat().st_mtime,datetime.timezone.utc).isoformat()})
   for line in q.read_text(errors='replace').splitlines():
    m=re.match(r'^\s*(?:export\s+)?MSF_AI_PROVIDER\s*=\s*([^#\r\n]+)',line)
    if m:row['providerAssignments'].append(provider(m.group(1).strip().strip('"\'')))
  else:row['readable']=False
  envfiles.append(row)
 units.append({'unit':name,'activeState':d.get('ActiveState'),'subState':d.get('SubState'),'mainPid':d.get('MainPID'),'fragmentPath':safe_path(d['FragmentPath']) if d.get('FragmentPath') else None,'providerExplicitEnvironment':provider(a.group(1).strip('"\'')) if a else provider(None),'environmentFilesPresent':bool(d.get('EnvironmentFiles')),'environmentFilesParsed':envfiles,'dropInsPresent':bool(d.get('DropInPaths')),'execEnvFileOrDotenvMentioned':bool(re.search(r'--env-file|dotenv|\.env',d.get('ExecStart',''))),'execInlineProviderPiMentioned':bool(re.search(r'MSF_AI_PROVIDER\s*=\s*[\"\']?pi\b',d.get('ExecStart',''))),'privateExecOrEnvironmentExported':False})
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'modelCalls':0,'mutations':False,'privateValuesExported':False,'startupEnvironmentCaveat':'/proc/environ does not prove current JavaScript process.env or the initialized DI instance','processes':processes,'providerSourceHits':provider_hits,'applicationLoaderHits':loaders,'publicEntryAndProviderFiles':public_files,'configurationMetadata':config_sources,'systemdMetadata':units}))
`),true));
const mockInference=data.processes.length>0&&data.processes.every(x=>!x.startupProviderEnvironment.present&&!x.nodeOptionsPresent&&x.argvMetadata.loaderOrInlineFlags.length===0)&&data.applicationLoaderHits.length===0;
const report={...data,assessment:{effectiveProviderConfirmed:false,inferredProvider:mockInference?'mock':null,status:'source-and-startup-configuration-inference-only; initialized-runtime-provider-unknown',limitations:['Current disk entry/provider hashes may postdate process startup; /proc/environ is not the current JavaScript environment or initialized Nest DI instance.','No runtime provider-kind endpoint inspected; no model request, debugger attachment or restart performed.'],requiredForConfirmation:['Current initialized AI_PROVIDER kind from a read-only runtime diagnostic, or trusted startup evidence proving exact loaded entry/provider bytes and environment at DI initialization.'],scope:'Internal software-factory provider only; external Jarvis Claude executor connectivity is separate.'}};
await writeFile('artifacts/software-factory/full-test/runtime-provider-review.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({written:'artifacts/software-factory/full-test/runtime-provider-review.json',processes:report.processes.length,applicationLoaderHits:report.applicationLoaderHits.length,modelCalls:0,privateValuesExported:false}));
