import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const runs=['e5fa0b814c994194896e292d1d2297ff06274608','d37133ca872bc9f0a33263584e3019e7dd5a3ed5'];
const workspace='/home/superopen/All-Projects/msf-jarvis-autonomy-r22';
const central=JSON.parse(remote(lanProfile,'jarvis-112',python({runs},String.raw`import sqlite3,json,hashlib,datetime,re,collections
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
out=[]
def h(v):return hashlib.sha256(v.encode()).hexdigest()
def categories(cmd):
 patterns={'test':['npm test','npm run test','pnpm test','vitest','node --test','tsx --test'],'watch':['--watch',' watch',' tail -f',' dev','vite --host','npm run start'],'build':['npm run build','pnpm build','tsc '],'typecheck':['typecheck','tsc --noEmit'],'package':['tar ','zip ','pack '],'read':['cat ','sed ','rg ','grep ','ls ','find ','head ','tail '],'git':['git '],'write':['apply_patch','python','mkdir ','cp ','write']}
 return [k for k,v in patterns.items() if any(x in cmd for x in v)] or ['other']
def visit(value,at,stats,tools):
 if isinstance(value,dict):
  typ=value.get('type')
  if isinstance(typ,str) and re.fullmatch('[a-zA-Z0-9_-]{1,50}',typ):stats[typ]+=1
  if typ in ('tool_use','tool_call'):
   name=value.get('name','unknown');name=name if name in ['Bash','Read','Write','Edit','MultiEdit','Glob','Grep','Task','TodoWrite','WebSearch','WebFetch','Agent','mcp__pi__tool'] else 'other'
   inp=value.get('input') or {};command=inp.get('command') if isinstance(inp,dict) else None
   tools.append({'at':at,'name':name,'commandCategories':categories(command) if isinstance(command,str) else [],'commandSha256':h(command) if isinstance(command,str) else None})
  for v in value.values():visit(v,at,stats,tools)
 elif isinstance(value,list):
  for v in value:visit(v,at,stats,tools)
try:
 for rid in p['runs']:
  row=c.execute('SELECT * FROM execution_runs WHERE id=?',(rid,)).fetchone()
  if row is None:raise RuntimeError('FIXED_DIAGNOSTIC_RUN_MISSING')
  data=json.loads(row['json']);result=data.get('result') or {};logs=c.execute('SELECT id,at,channel,text FROM execution_logs WHERE run_id=? ORDER BY id',(rid,)).fetchall();stats=collections.Counter();tools=[];parsed=0;patterns=collections.Counter();digest=hashlib.sha256()
  for log in logs:
   text=log['text'];digest.update((str(log['id'])+'\0'+log['at']+'\0'+text+'\n').encode())
   for code,pattern in {'interactive_permission':r'permission|approve|approval|confirm','test_failure':r'FAIL|AssertionError|test failed','process_running':r'Running|background|Process running|session ID','dependency_error':r'Cannot find module|module not found|ERR_MODULE_NOT_FOUND','rate_limit':r'429|rate.?limit|quota','timeout':r'timeout|timed out','model_end':r'"type"\s*:\s*"result"','tool_error':r'"is_error"\s*:\s*true','thinking':r'"type"\s*:\s*"thinking"'}.items():
    if re.search(pattern,text,re.I):patterns[code]+=1
   try:v=json.loads(text);parsed+=1;visit(v,log['at'],stats,tools)
   except (ValueError,TypeError):pass
  out.append({'runId':rid,'taskId':row['object_id'],'status':row['status'],'createdAt':row['created_at'],'updatedAt':row['updated_at'],'timeoutSec':data.get('timeoutSec'),'workspace':data.get('workspace'),'sessionIdPresent':bool(result.get('sessionId') or data.get('sessionId')),'sessionIdSha256':h(result.get('sessionId') or data.get('sessionId')) if result.get('sessionId') or data.get('sessionId') else None,'result':{'outcome':result.get('outcome'),'exitCode':result.get('exitCode'),'rounds':result.get('rounds'),'stopReason':result.get('stopReason'),'usageComplete':(result.get('usage') or {}).get('usageComplete'),'costComplete':(result.get('usage') or {}).get('costComplete'),'validationPresent':bool(result.get('validation'))},'logEvidence':{'count':len(logs),'parsedJsonRows':parsed,'firstAt':logs[0]['at'] if logs else None,'lastAt':logs[-1]['at'] if logs else None,'sha256':digest.hexdigest(),'eventTypeCounts':dict(stats),'keywordRowCountsNotCausalProof':dict(patterns),'toolEvents':tools}})
 print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':out,'activeRuns':c.execute("SELECT count(*) FROM execution_runs WHERE status IN ('running','queued')").fetchone()[0]}))
finally:c.close()
`),true));
const node=JSON.parse(remote(lanProfile,'jarvis-101',python({runs,workspace},String.raw`import json,sqlite3,hashlib,datetime,subprocess,os,re,collections
from pathlib import Path
root=Path(p['workspace']);cfgPath=Path('/var/lib/jarvis-development/101/config.json');cfg=json.loads(cfgPath.read_bytes());agent=cfg['agentId']
if agent!='0b5aea06-47e1-4f4b-a32e-969417915c9c':raise RuntimeError('DIAG_NODE_IDENTITY_CHANGED')
if root.resolve()!=root or not root.is_dir():raise RuntimeError('DIAG_WORKSPACE_IDENTITY_INVALID')
def h(b):return hashlib.sha256(b).hexdigest()
def git(args):return subprocess.check_output(['/usr/bin/git','-C',str(root),*args],timeout=15)
def public(path):
 return not any(x.startswith('.env') or x.lower() in ['.npmrc','.secrets','.claude','.codex','node_modules','data','uploads','.git','.pi','private','logs'] or any(y in x.lower() for y in ['password','credential','secret','cookie']) for x in Path(path).parts)
head=git(['rev-parse','HEAD']).decode().strip();status=git(['status','--porcelain=v1','-z']).decode().split(chr(0));status=[s for s in status if s];tracked=[s for s in git(['ls-files','-z']).decode().split(chr(0)) if s and public(s)];changes=[];excluded=0
for s in status:
 path=s[3:]
 if not public(path):excluded+=1;continue
 f=root/path
 if f.is_symlink() or not f.is_file():continue
 if f.stat().st_size>16*1024*1024:continue
 b=f.read_bytes();changes.append({'path':path,'gitCode':s[:2],'bytes':len(b),'sha256':h(b),'mtime':datetime.datetime.fromtimestamp(f.stat().st_mtime,datetime.timezone.utc).isoformat()})
files=[]
for base in ['doc','docs','reports','artifacts','dist','apps/server/dist','apps/web/dist']:
 folder=root/base
 if not folder.is_dir():continue
 for f in folder.rglob('*'):
  rel=f.relative_to(root).as_posix()
  if not public(rel) or f.is_symlink() or not f.is_file() or f.stat().st_size>16*1024*1024:continue
  if len(files)>=1200:break
  b=f.read_bytes();files.append({'path':rel,'bytes':len(b),'sha256':h(b),'mtime':datetime.datetime.fromtimestamp(f.stat().st_mtime,datetime.timezone.utc).isoformat()})
c=sqlite3.connect('file:'+str(cfgPath.parent/('.delivery-'+agent)/'journal.sqlite')+'?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
try:
 rr=[]
 for rid in p['runs']:
  r=c.execute('SELECT status,checkpoint,stopped_at,stop_code,json FROM runs WHERE id=?',(rid,)).fetchone()
  if r is None:raise RuntimeError('DIAG_NODE_RUN_MISSING')
  cp=json.loads(r['checkpoint']) if r['checkpoint'] else {};request=json.loads(r['json']);session=cp.get('sessionId')
  rr.append({'runId':rid,'status':r['status'],'stoppedAt':r['stopped_at'],'stopCode':r['stop_code'],'checkpointPresent':bool(r['checkpoint']),'checkpointSha256':h(r['checkpoint'].encode()) if r['checkpoint'] else None,'rounds':cp.get('rounds'),'sessionIdPresent':bool(session),'sessionIdSha256':h(session.encode()) if session else None,'sessionBillingPresent':bool(cp.get('sessionBilling')),'usageComplete':(cp.get('usage') or {}).get('usageComplete'),'events':[dict(x) for x in c.execute('SELECT at,code FROM events WHERE run_id=? ORDER BY id',(rid,))],'immutableRequestSha256':h(r['json'].encode()),'goalSha256':h(str(request.get('goal','')).encode()),'goalBytes':len(str(request.get('goal','')).encode())})
 journal={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
finally:c.close()
unit=dict(s.split('=',1) for s in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,MainPID,User'],text=True,timeout=10).splitlines() if '=' in s)
processes=[];parents={};pid=int(unit.get('MainPID','0'))
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  st=(q/'status').read_text();parent=int(next(x.split(':',1)[1] for x in st.splitlines() if x.startswith('PPid:')));parents[int(q.name)]=(parent,q)
 except (FileNotFoundError,PermissionError,StopIteration):pass
ids={pid}
for _ in range(8):
 for ident,(parent,q) in parents.items():
  if parent not in ids or ident in ids:continue
  ids.add(ident)
  try:
   cwd=os.readlink(q/'cwd');processes.append({'pid':ident,'parentPid':parent,'workspaceBound':cwd==str(root) or cwd.startswith(str(root)+'/'),'cwdClass':'autonomy-workspace' if cwd==str(root) or cwd.startswith(str(root)+'/') else 'other'})
  except (FileNotFoundError,PermissionError):pass
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workspace':str(root),'head':head,'gitStatusSha256':h(chr(0).join(status).encode()),'changedPublicFiles':changes,'statusEntries':len(status),'excludedPrivateEntries':excluded,'trackedPublicFileCount':len(tracked),'artifactsInventory':files,'journalRuns':rr,'journal':journal,'unit':unit,'descendantProcesses':processes}))
`),true,{timeoutMs:90000}));
const out={schemaVersion:1,kind:'fa01-timeout-readonly-progress-diagnosis',at:new Date().toISOString(),central,node,rawLogsExported:false,privateFieldsExported:false,modelCalls:0,remoteMutations:false,testsRun:false,buildsRun:false};
const path='artifacts/software-factory/autonomy-r22/fa01-timeout-progress-metadata-r22-7.json';await writeFile(path,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),runLogs:central.runs.map(x=>({id:x.runId,status:x.status,logs:x.logEvidence.count,types:x.logEvidence.eventTypeCounts,tools:x.logEvidence.toolEvents.length})),node:{head:node.head,changed:node.changedPublicFiles.length,artifacts:node.artifactsInventory.length,journal:node.journal,unit:node.unit,children:node.descendantProcesses}}));
