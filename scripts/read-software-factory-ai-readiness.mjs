/** Read-only metadata inventory; private settings never leave 101. No model call or test. */
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonical} from './software-factory-usage-observer.mjs';

const unit='jarvis-software-factory-development.service';
const inventory=JSON.parse(remote(lanProfile,'jarvis-101',python({unit},String.raw`import os,json,stat,subprocess,sqlite3,re,datetime,hashlib,shutil,urllib.request
from pathlib import Path
from urllib.parse import urlsplit
def origin(value):
 try:
  u=urlsplit(value)
  if u.scheme not in ['http','https'] or not u.hostname:return None
  host='['+u.hostname+']' if ':' in u.hostname else u.hostname
  return u.scheme+'://'+host+(':'+str(u.port) if u.port else '')
 except:return None
def routes(value):
 out={'origins':[],'models':[],'credentialPresent':False,'fields':{}}
 def walk(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if re.search('key|token|secret|password',k,re.I):out['credentialPresent']|=bool(x)
    elif isinstance(x,str) and re.search('url|endpoint|base',k,re.I):
     o=origin(x)
     if o:
      out['origins'].append(o)
      if re.fullmatch(r'(?:ANTHROPIC|OPENAI)_\w+|baseUrl|base_url|apiBase',k):out['fields'][k]=o
    elif isinstance(x,str) and re.fullmatch(r'(?:ANTHROPIC|OPENAI)_\w*MODEL\w*|model|model_code|modelCode',k) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_.:/-]{0,159}',x):
     out['models'].append(x);out['fields'][k]=x
    elif isinstance(x,(dict,list)):walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 walk(value);out['origins']=sorted(set(out['origins']));out['models']=sorted(set(out['models']));return out
cfgpath=Path('/var/lib/jarvis-development/101/config.json');st=cfgpath.lstat()
if cfgpath.is_symlink() or not stat.S_ISREG(st.st_mode) or st.st_mode&0o077:raise RuntimeError('PRIVATE_CONFIG_PERMISSION_INVALID')
cfg=json.loads(cfgpath.read_text());templates=[]
for t in cfg.get('templates',[]):
 templates.append({k:t.get(k) for k in ['id','machineId','engine','program','args','workspaceRoot','maxRounds','timeoutSec','leaseSec','budgetCurrency','validation','supervision']})
r=subprocess.run(['/usr/bin/systemctl','show',p['unit'],'--property=User,Group,ActiveState,SubState,MainPID,Restart,RestartUSec,NRestarts,ExecMainCode,ExecMainStatus,WorkingDirectory'],capture_output=True,text=True,timeout=10)
unitstate=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
pid=unitstate.get('MainPID','0');process={}
if pid.isdigit() and int(pid)>0:
 try:
  raw=(Path('/proc')/pid/'environ').read_bytes().split(b'\0');env=dict(x.decode(errors='replace').split('=',1) for x in raw if b'=' in x)
  process={'home':env.get('HOME'),'configDir':env.get('CLAUDE_CONFIG_DIR'),'endpointOrigins':sorted(set(filter(None,[origin(v) for k,v in env.items() if re.search('(?:ANTHROPIC|OPENAI|MODEL|PI).*?(?:URL|ENDPOINT|BASE)',k,re.I)]))),'modelOverrides':{k:v for k,v in env.items() if re.fullmatch(r'(?:ANTHROPIC|OPENAI|CLAUDE)_\w*MODEL\w*',k) and re.fullmatch(r'[A-Za-z0-9_.:/-]{1,160}',v)},'credentialEnvironmentPresent':any(bool(v) and re.search('(?:ANTHROPIC|OPENAI).*?(?:KEY|TOKEN)',k) for k,v in env.items()),'cwd':os.readlink('/proc/'+pid+'/cwd')}
 except:process={'readable':False}
home=Path(process.get('home') or '/home/superopen');settings=[]
for path in [home/'.claude/settings.json',Path('/home/superopen/All-Projects/msf/.claude/settings.json'),Path('/home/superopen/All-Projects/msf/.claude/settings.local.json')]:
 if path.is_file() and not path.is_symlink() and path.stat().st_size<1048576:
  try:settings.append({'path':str(path),'ownerUid':path.stat().st_uid,'mode':oct(path.stat().st_mode&0o777),'routeMetadata':routes(json.loads(path.read_text()))})
  except:settings.append({'path':str(path),'parseable':False})
switch={'databasePresent':False,'providers':[],'tables':[]}
db=home/'.cc-switch/cc-switch.db'
if db.is_file() and not db.is_symlink():
 switch['databasePresent']=True
 c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
 try:
  tables=[x[0] for x in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
  switch['tables']=[x for x in tables if re.fullmatch('[A-Za-z0-9_]{1,100}',x)]
  if 'providers' in tables:
   cols=[x[1] for x in c.execute('PRAGMA table_info(providers)')]
   needed=[x for x in ['id','app_type','is_current','settings_config'] if x in cols]
   if needed:
    for row in c.execute('SELECT '+','.join(needed)+' FROM providers LIMIT 100'):
     item={'appType':row['app_type'] if 'app_type' in needed and row['app_type'] in ['claude','codex','gemini','opencode','openclaw'] else 'other','current':bool(row['is_current']) if 'is_current' in needed else None}
     if 'id' in needed:item['providerIdFingerprint']=hashlib.sha256(str(row['id']).encode()).hexdigest()[:16]
     if 'settings_config' in needed:
      try:item['routeMetadata']=routes(json.loads(row['settings_config']))
      except:item['routeMetadata']={'parseable':False}
     switch['providers'].append(item)
  if 'proxy_config' in tables:
   cols=[x[1] for x in c.execute('PRAGMA table_info(proxy_config)')]
   safe=[x for x in ['app_type','enabled','proxy_enabled','auto_failover_enabled','failover_enabled','max_retries','request_timeout','request_timeout_secs','non_streaming_timeout','streaming_first_byte_timeout','streaming_idle_timeout','circuit_failure_threshold','circuit_success_threshold','circuit_timeout_seconds'] if x in cols]
   switch['proxyConfigColumns']=cols
   switch['proxyConfiguration']=[]
   if safe:
    for row in c.execute('SELECT '+','.join(safe)+' FROM proxy_config LIMIT 20'):
     switch['proxyConfiguration'].append({k:v for k,v in dict(row).items() if isinstance(v,(int,float,bool)) or k=='app_type' and v in ['claude','codex','gemini']})
 finally:c.close()
bins={}
search='/home/superopen/.local/bin:/home/superopen/.local/share/pnpm:/home/superopen/opt/node22/bin:/opt/jarvis-development/node/bin:/usr/local/bin:/usr/bin:/bin'
versionenv=dict(os.environ);versionenv['PATH']=search;versionenv['HOME']='/home/superopen'
for name in ['claude','codex','pi','cc-switch','node','pnpm']:
 path=shutil.which(name,path=search);bins[name]={'installedOnConfiguredSearchPath':bool(path),'path':str(Path(path).resolve()) if path else None}
 if path and name in ['claude','codex','node','pnpm']:
  rr=subprocess.run(['/usr/sbin/runuser','-u','superopen','--',path,'--version'],capture_output=True,text=True,timeout=10,env=versionenv)
  match=re.search(r'\d+\.\d+(?:\.\d+)?',rr.stdout+rr.stderr);bins[name].update({'version':match.group(0) if match else None,'versionExit':rr.returncode})
files={}
for path in ['/opt/jarvis-development/software-factory/jarvis-node.mjs','/opt/jarvis-development/software-factory/agent-supervisor.js','/opt/jarvis-development/software-factory/package.json','/usr/local/libexec/jarvis-msf-validation','/opt/jarvis-development/software-factory/validate-msf.mjs']:
 q=Path(path)
 if q.is_file():files[path]={'sha256':hashlib.sha256(q.read_bytes()).hexdigest(),'bytes':q.stat().st_size}
df=shutil.disk_usage('/home/superopen/All-Projects/msf');mem={}
for line in Path('/proc/meminfo').read_text().splitlines():
 k,*v=line.split()
 if k in ['MemTotal:','MemAvailable:']:mem[k[:-1]]=int(v[0])*1024
observer={}
for name in ['jarvis-msf-usage.service','jarvis-msf-usage.timer']:
 rr=subprocess.run(['/usr/bin/systemctl','show',name,'--property=LoadState,ActiveState,SubState,Result,ExecMainStatus'],capture_output=True,text=True,timeout=5)
 observer[name]=dict(line.split('=',1) for line in rr.stdout.splitlines() if '=' in line)
factory={'processes':[],'piSdk':[],'modelRoutes':None,'registeredModels':None}
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:
  cwd=os.readlink(proc/'cwd');comm=(proc/'comm').read_text().strip()
  if not cwd.startswith('/home/superopen/All-Projects/msf') or comm not in ['node','MainThread']:continue
  argv=(proc/'cmdline').read_bytes().split(b'\0')
  if not any(b'main.js' in arg for arg in argv):continue
  raw=(proc/'environ').read_bytes().split(b'\0');env=dict(x.decode(errors='replace').split('=',1) for x in raw if b'=' in x)
  v=env.get('MSF_AI_PROVIDER');factory['processes'].append({'pid':int(proc.name),'cwd':cwd,'providerEnvironment':v if v in ['mock','pi'] else 'unset-or-other','effectiveProviderBySource': 'pi' if v=='pi' else 'mock'})
 except:pass
for name in ['pi-ai','pi-agent-core','pi-coding-agent']:
 q=Path('/home/superopen/All-Projects/msf/apps/server/node_modules/@earendil-works')/name/'package.json'
 if q.is_file():
  d=json.loads(q.read_text());factory['piSdk'].append({'package':d.get('name'),'version':d.get('version')})
for endpoint,field in [('routes','modelRoutes'),('models','registeredModels')]:
 try:
  with urllib.request.urlopen('http://127.0.0.1:8080/api/v1/ai/'+endpoint,timeout=5) as response:d=json.load(response)
  if field=='modelRoutes' and isinstance(d,dict):factory[field]={k:{'modelId':v.get('modelId')} if isinstance(v,dict) else None for k,v in d.items() if re.fullmatch('[a-z-]{1,80}',k)}
  if field=='registeredModels' and isinstance(d,list):factory[field]=[{'id':x.get('id'),'provider':x.get('provider'),'origin':origin(x.get('base_url','')),'model':x.get('model_code'),'enabled':x.get('enabled'),'connectionStatus':x.get('conn_status'),'routes':x.get('routes',[]),'priceConfigured':bool(x.get('price_table'))} for x in d if isinstance(x,dict)]
 except:factory[field+'ReadStatus']='unavailable'
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'modelCalls':0,'remoteTestsRun':False,'config':{'machineId':cfg.get('machineId'),'agentId':cfg.get('agentId'),'apiOrigin':origin(cfg.get('apiUrl','')),'signedIdentityPresent':bool(cfg.get('privateKey') and cfg.get('publicKey')),'configMode':oct(st.st_mode&0o777),'workspaceRoots':cfg.get('workspaceRoots'),'concurrency':cfg.get('concurrency'),'journalsCount':len(cfg.get('journals',[])),'serviceLogsCount':len(cfg.get('serviceLogs',[])),'templates':templates},'unit':unitstate,'process':process,'claudeSettings':settings,'ccSwitch':switch,'binaries':bins,'installedPublicFiles':files,'usageObserverUnits':observer,'softwareFactoryInternalAI':factory,'resources':{'diskTotalBytes':df.total,'diskFreeBytes':df.free,**mem}}))
`),true));
const central=await withPlatform(async({api})=>{
 const paths=['/api/v1/execution/config','/api/v1/execution/capabilities','/api/v1/execution/agents','/api/v1/execution/supervision'];
 const values=await Promise.all(paths.map(p=>api(p)));
 const config=values[0].data, capabilities=values[1].data, agents=values[2].data, supervision=values[3].data;
 const templates=config.templates.filter(t=>t.machineId===inventory.config.machineId);
 return {observedAt:new Date().toISOString(),revision:config.revision,templates,configuredTemplates:capabilities.configuredTemplates.filter(t=>t.machineId===inventory.config.machineId),supervised:capabilities.supervised,stopped:supervision.stopped,agents:agents.filter(a=>a.machineId===inventory.config.machineId).map(a=>Object.fromEntries(['id','machineId','status','revoked','lastSeen','last_seen','capabilities'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]))),tasks:supervision.tasks.filter(t=>t.machineId===inventory.config.machineId).map(t=>Object.fromEntries(['taskId','projectId','executorId','engine','runs','ready','status','executionStatus','tokensUsed','tokenLimit','billing','policyConfigured','recovery','runId','lastActivityAt'].filter(k=>t[k]!==undefined).map(k=>[k,t[k]])))};
});
const report={inventory,central,templatesEqual:canonical(inventory.config.templates)===canonical(central.templates),sensitiveValuesExported:false,credentialsStored:false};
await mkdir('artifacts/software-factory/full-test',{recursive:true});
await writeFile('artifacts/software-factory/full-test/ai-readiness-inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({written:'artifacts/software-factory/full-test/ai-readiness-inventory.json',readOnly:true,modelCalls:0,remoteTestsRun:false,centralSupervised:central.supervised,templatesEqual:report.templatesEqual,inventorySha256:createHash('sha256').update(JSON.stringify(report)).digest('hex')}));
