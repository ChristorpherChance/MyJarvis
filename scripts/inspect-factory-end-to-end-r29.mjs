/** Read-only current execution/service/model metadata. No task, model, test or configuration mutation. */
import {readFile,open,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withPlatform,remote,lanProfile,python} from './managed-server-client.mjs';
import {sha} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
import {readInstalledR28Host,verifyR28InstalledManifest} from './install-factory-verifier-r28.mjs';
import {settledReaders,closedLiveError} from './verify-platform-live-r28.mjs';
export const endToEndR29MetadataProgram=String.raw`
import os,stat,json,hashlib,subprocess,re,sqlite3,shutil,urllib.request,urllib.error,signal
from pathlib import Path
from urllib.parse import urlsplit
def need(v,c):
 if not v:raise RuntimeError(c)
signal.signal(signal.SIGALRM,lambda a,b:(_ for _ in ()).throw(RuntimeError('R29_METADATA_TIMEOUT')));signal.alarm(65)
ROOT=Path('/home/superopen/All-Projects/msf');envsafe={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'}
def digest(b):return hashlib.sha256(b).hexdigest()
def key(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read(q,limit=2097152,public_hardlinks=False):
 q=Path(q);fd=os.open(q,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and (public_hardlinks or s.st_nlink==1) and 0<=s.st_size<=limit,'R29_METADATA_FILE_INVALID');data=bytearray()
  while len(data)<=limit:
   part=os.read(fd,min(65536,limit+1-len(data)))
   if not part:break
   data.extend(part)
  need(key(s)==key(os.fstat(fd))==key(q.lstat()) and len(data)==s.st_size,'R29_METADATA_FILE_CHANGED');return bytes(data)
 finally:os.close(fd)
def origin(value):
 try:
  u=urlsplit(value)
  if u.scheme not in ['http','https'] or not u.hostname:return None
  return u.scheme+'://'+u.hostname+(':'+str(u.port) if u.port else '')
 except:return None
def routes(v):
 out={'origins':[],'models':[],'credentialPresent':False}
 def visit(x):
  if isinstance(x,dict):
   for k,t in x.items():
    if re.search('key|token|secret|password',k,re.I):out['credentialPresent']=out['credentialPresent'] or bool(t)
    elif isinstance(t,str) and re.search('url|endpoint|base',k,re.I):
     o=origin(t)
     if o:out['origins'].append(o)
    elif isinstance(t,str) and re.fullmatch('(?:ANTHROPIC|OPENAI)_.*MODEL.*|model|model_code|modelCode',k) and re.fullmatch(r'[A-Za-z0-9_.:/\[\]-]{1,160}',t):out['models'].append(t)
    elif isinstance(t,(dict,list)):visit(t)
  elif isinstance(x,list):
   for t in x:visit(t)
 visit(v);out['origins']=sorted(set(out['origins']));out['models']=sorted(set(out['models']));return out
cfgraw=read('/var/lib/jarvis-development/101/config.json');cfg=json.loads(cfgraw);need(cfg.get('agentId')=='0b5aea06-47e1-4f4b-a32e-969417915c9c','R29_METADATA_NODE_ID_CHANGED')
template=next(t for t in cfg['templates'] if t['id']=='msf-101-claude');args=template.get('args',[]);model=args[args.index('--model')+1] if '--model' in args else None
template_meta={'id':template['id'],'engine':template['engine'],'templateSHA256':digest(json.dumps(template,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()),'explicitModel':model if model=='gpt-6.1-sol[1m]' else 'other-or-unset','workspaceRoot':template.get('workspaceRoot'),'maxRounds':template.get('maxRounds'),'timeoutSec':template.get('timeoutSec'),'leaseSec':template.get('leaseSec'),'billing':template.get('supervision',{}).get('billing'),'nativeUSDLimitArgumentPresent':any(a=='--max-budget-usd' or a.startswith('--max-budget-usd=') for a in args),'fallbackExecutorIds':template.get('supervision',{}).get('fallbackExecutorIds',[]),'validationConfigured':bool(template.get('validation'))}
units=[]
for name in ['msf-app.service','jarvis-software-factory-development.service']:
 r=subprocess.run(['/usr/bin/systemctl','show',name,'--property=LoadState,ActiveState,SubState,User,MainPID,WorkingDirectory'],capture_output=True,text=True,timeout=8,env=envsafe);u=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x);units.append({'unit':name,**u})
processes=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:
  cwd=os.readlink(proc/'cwd');argv=(proc/'cmdline').read_bytes().split(b'\0')
  if not cwd.startswith(str(ROOT)) or not any(b'main.js' in x for x in argv):continue
  st=(proc/'stat').read_text();start=st[st.rfind(')')+2:].split()[19];env=dict(x.decode(errors='replace').split('=',1) for x in (proc/'environ').read_bytes().split(b'\0') if b'=' in x);pv=env.get('MSF_AI_PROVIDER');processes.append({'pid':int(proc.name),'startTick':start,'cwd':cwd,'startupProviderEnvironment':pv if pv in ['mock','pi'] else 'unset-or-other','initializedProviderConfirmed':False,'webDistConfigured':bool(env.get('MSF_WEB_DIST')),'portConfigured':int(env['MSF_PORT']) if env.get('MSF_PORT','').isdigit() else None,'loaderFlagsPresent':any(x in env.get('NODE_OPTIONS','') for x in ['--require','--import','--env-file','--loader']),'credentialEnvironmentPresent':any(bool(v) and re.search('(?:ANTHROPIC|OPENAI).*?(?:KEY|TOKEN)',k) for k,v in env.items())})
 except (FileNotFoundError,ProcessLookupError,PermissionError):pass
sdk=[]
for name in ['pi-ai','pi-agent-core','pi-coding-agent']:
 path=ROOT/'apps/server/node_modules/@earendil-works'/name/'package.json'
 if path.exists():
  actual=path.resolve();need(str(actual).startswith(str(ROOT)+'/'),'R29_METADATA_SDK_OUTSIDE_SOURCE');raw=read(actual,public_hardlinks=True);v=json.loads(raw);sdk.append({'package':v.get('name'),'version':v.get('version'),'packageSHA256':digest(raw),'readOnlyPublicPackageMetadata':True,'fileLinkCount':actual.stat().st_nlink})
settings=[]
for q in [Path('/home/superopen/.claude/settings.json'),ROOT/'.claude/settings.json',ROOT/'.claude/settings.local.json']:
 if q.is_file() and not q.is_symlink():
  raw=read(q);settings.append({'publicPath':str(q),'sha256':digest(raw),'routeMetadata':routes(json.loads(raw)),'bodyExported':False})
cc={'databasePresent':False,'providers':[]};q=Path('/home/superopen/.cc-switch/cc-switch.db')
if q.is_file() and not q.is_symlink():
 cc['databasePresent']=True;c=sqlite3.connect('file:'+str(q)+'?mode=ro',uri=True,timeout=5);c.row_factory=sqlite3.Row
 try:
  names=[x[0] for x in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
  if 'providers' in names:
   cols={x[1] for x in c.execute('PRAGMA table_info(providers)')}
   if {'app_type','is_current','settings_config'}<=cols:
    for row in c.execute('SELECT app_type,is_current,settings_config FROM providers LIMIT 100'):
     if row['app_type'] not in ['claude','codex']:continue
     cc['providers'].append({'appType':row['app_type'],'current':bool(row['is_current']),'routeMetadata':routes(json.loads(row['settings_config']))})
  if 'proxy_config' in names:
   cols={x[1] for x in c.execute('PRAGMA table_info(proxy_config)')};allowed=[x for x in ['app_type','proxy_enabled','auto_failover_enabled','max_retries'] if x in cols];cc['proxySettings']=[{k:v for k,v in dict(row).items() if isinstance(v,(int,float,bool)) or k=='app_type' and v in ['claude','codex']} for row in c.execute('SELECT '+','.join(allowed)+' FROM proxy_config LIMIT 20')] if allowed else []
 finally:c.close()
bins={};search='/home/superopen/.local/bin:/home/superopen/.local/share/pnpm:/home/superopen/opt/node22/bin:/opt/jarvis-development/node/bin:/usr/local/bin:/usr/bin:/bin'
for name in ['claude','codex','pi','pnpm','node']:
 path=shutil.which(name,path=search);bins[name]={'installedOnConfiguredPath':bool(path),'realPath':os.path.realpath(path) if path else None,'version':None,'versionCommandOnly':False}
 if path and name in ['claude','codex','pnpm','node']:
  rr=subprocess.run(['/usr/sbin/runuser','-u','superopen','--',path,'--version'],capture_output=True,text=True,timeout=8,env={'PATH':search,'HOME':'/home/superopen','LANG':'C','DISABLE_AUTOUPDATER':'1'});m=re.search(r'\d+\.\d+(?:\.\d+)?',rr.stdout+rr.stderr);bins[name].update({'version':m.group(0) if m else None,'versionExit':rr.returncode,'versionCommandOnly':True})
services=[]
def get_json(port,path):
 try:
  with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=4) as response:
   raw=response.read(2097153);need(len(raw)<=2097152,'R29_METADATA_HTTP_LIMIT');return {'statusCode':response.status,'json':json.loads(raw)}
 except urllib.error.HTTPError as e:return {'statusCode':e.code,'json':None}
 except Exception:return {'statusCode':None,'json':None}
for port in [18920,8080]:
 health=get_json(port,'/health');healthv=health['json'];row={'port':port,'healthStatusCode':health['statusCode'],'health':{k:healthv.get(k) for k in ['ok','db','redis','minio']} if isinstance(healthv,dict) else None};models=get_json(port,'/api/v1/ai/models');rts=get_json(port,'/api/v1/ai/routes');pr=get_json(port,'/api/projects');row['modelReadStatusCode']=models['statusCode'];row['routeReadStatusCode']=rts['statusCode'];row['projectReadStatusCode']=pr['statusCode']
 if isinstance(models['json'],list):row['modelRegistry']=[{'id':m.get('id'),'provider':m.get('provider'),'modelCode':m.get('model_code'),'enabled':m.get('enabled'),'connectionStatusSnapshot':m.get('conn_status'),'connectionCheckedAt':m.get('conn_checked_at'),'credentialHintPresent':bool(m.get('api_key_hint')),'origin':origin(m.get('base_url','')),'priceTableConfigured':bool(m.get('price_table'))} for m in models['json'] if isinstance(m,dict)]
 if isinstance(rts['json'],dict):row['purposeRoutes']={k:{'modelId':v.get('modelId')} if isinstance(v,dict) else None for k,v in rts['json'].items() if k in ['planning','generation','review','translation','chat','parsing']}
 project_list=pr['json'].get('items',[]) if isinstance(pr['json'],dict) else pr['json']
 if isinstance(project_list,list):row['internalProjects']={'count':len(project_list),'sampleIDs':[v['id'] for v in project_list[:3] if isinstance(v,dict) and re.fullmatch('[a-f0-9-]{36}',str(v.get('id','')))],'namesOrDescriptionExported':False}
 services.append(row)
entries=[]
for rel in ['apps/server/src/modules/ai/ai.module.ts','apps/server/src/modules/ai/pi-gateway.ts','apps/server/dist/modules/ai/ai.module.js','apps/server/dist/modules/ai/pi-gateway.js','apps/server/dist/main.js','package.json']:
 path=ROOT/rel
 if path.is_file() and not path.is_symlink():
  raw=read(path);entries.append({'path':rel,'sha256':digest(raw),'bytes':len(raw),'mtimeNS':path.stat().st_mtime_ns})
for row in processes:
 path=Path('/proc')/str(row['pid']);s=(path/'stat').read_text();need(s[s.rfind(')')+2:].split()[19]==row['startTick'],'R29_METADATA_FACTORY_PROCESS_CHANGED')
need(read('/var/lib/jarvis-development/101/config.json')==cfgraw,'R29_METADATA_NODE_CONFIGURATION_CHANGED')
print(json.dumps({'readOnly':True,'modelsInvoked':False,'configuredNode':{'agentId':cfg['agentId'],'machineId':cfg.get('machineId'),'configSHA256':digest(cfgraw),'templateCount':len(cfg['templates']),'target':template_meta},'units':units,'factoryProcesses':processes,'installedPiSDK':sdk,'cliVersions':bins,'claudeSettingMetadata':settings,'ccSwitchMetadata':cc,'factoryHTTP':services,'factoryDiskEntryHashes':entries,'loadedFactoryCodeIdentityProven':False,'modelConnectivityTested':False,'quotaOrProviderAvailabilityProven':False,'rawEnvironmentExported':False,'rawModelSettingsExported':False,'newRuntimeStarted':False,'taskCreated':False}))
`;
export async function inspectEndToEndR29(){
 const path='artifacts/software-factory/acceptance-r28/verifier-installation-9e678be1-c0cb-433d-9e80-726f1f6d4ed7.json',raw=await safeReadLocal(path,'utf8'),manifest=JSON.parse(raw);await verifyR28InstalledManifest(manifest);
 return withPlatform(async({api})=>{
  const routes=['/api/health','/api/runtime/software-factory','/api/runtime/software-factory/projects','/api/v1/execution/capabilities','/api/v1/execution/config','/api/v1/execution/supervision','/api/v1/projects/70ec346f-6520-46ed-abed-22cac770a3e4/autonomy','/api/v1/projects/70ec346f-6520-46ed-abed-22cac770a3e4/supervision-plans/current'];
  const rows=await settledReaders([...routes.map(path=>()=>api(path)),()=>JSON.parse(remote(lanProfile,'jarvis-101',python({},endToEndR29MetadataProgram),true,{timeoutMs:75000})),()=>readInstalledR28Host(manifest,{idle:true})]);
  const errors=rows.flatMap((r,i)=>r.status==='rejected'?[{check:routes[i]??['metadata','installedSource'][i-routes.length],errorCode:closedLiveError(r.reason)}]:[]),v=i=>rows[i].status==='fulfilled'?rows[i].value:null,config=v(4)?.data,profile=v(6)?.data,plan=v(7)?.data,host=v(9),factory=v(1),projects=v(2),cap=v(3)?.data,global=v(5)?.data;
  return {schemaVersion:1,kind:'software-factory-r29-end-to-end-read-only-current-state',at:new Date().toISOString(),readOnly:true,modelsInvoked:false,newRuntimeStarted:false,configurationChanged:false,errors,platformHealth:v(0),factoryConnector:factory?{configured:factory.configured,connected:factory.connected,sourceProjectId:factory.sourceProjectId,machineId:factory.machineId,baseURL:factory.baseURL,boundaries:factory.boundaries,capabilities:factory.capabilities}:null,internalProjects:projects?{total:projects.total,verification:projects.verification,source:projects.source,projectIDs:projects.items?.slice(0,3).map(p=>p.id)}:null,execution:{globalSupervised:global?.supervised,stopped:global?.stopped,capabilities:cap?Object.fromEntries(['available','ready','active','supervised','configuredTemplates','concurrency','maxParallel'].filter(k=>cap[k]!==undefined).map(k=>[k,k==='configuredTemplates'?cap[k].filter(t=>t.id==='msf-101-claude'):cap[k]])):null,configurationRevision:config?.revision,templates:config?.templates?.filter(t=>t.machineId==='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73').map(t=>({id:t.id,engine:t.engine,templateSHA256:sha(t),workspaceRoot:t.workspaceRoot,maxRounds:t.maxRounds,purpose:t.purpose,validationConfigured:!!t.validation,billing:t.supervision?.billing}))},originalAutonomy:{profileSHA256:profile?sha(profile):null,revision:profile?.revision,status:profile?.status,reason:profile?.reason,requiredObjectives:profile?.spec?.objectives?.filter(o=>o.required!==false).length,verifiedObjectives:profile?.verifiedObjectiveIds?.length,costPolicy:profile?.config?.costPolicy},plan:plan?{planId:plan.plan?.planId??plan.planId,revision:plan.plan?.revision??plan.revision,mode:plan.plan?.mode??plan.mode,currentStepId:plan.plan?.currentStepId??plan.currentStepId,automaticDispatch:plan.automaticDispatch,active:plan.active,independentProgress:plan.independentProgress}:null,machineMetadata:v(8),sourceBinding:host?{source:host.source,candidate:host.candidate,oldCandidate:host.oldCandidate,originSHA256:host.originSHA256,quiet:host.quiet,installed:host.installed,oldImmutableSHA256:sha(host.oldImmutable)}:null,privateValuesExported:false,rawLogsExported:false,productAccepted:false};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){let r;try{r=await inspectEndToEndR29();}catch(e){r={schemaVersion:1,kind:'software-factory-r29-end-to-end-read-only-current-state',at:new Date().toISOString(),failed:true,errorCode:closedLiveError(e),readOnly:true,modelsInvoked:false,rawErrorExported:false};}await mkdir('artifacts/software-factory/goals-r29',{recursive:true});const out='artifacts/software-factory/goals-r29/current-state-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(r,null,2)+'\n',f=await open(out,'wx',0o644);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}console.log(JSON.stringify({output:out,sha256:sha(raw),failed:r.failed===true,errors:r.errors??[],newRuntimeStarted:false,modelsInvoked:false}));if(r.failed||r.errors?.length)process.exitCode=1;}
