import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const runs=['e5fa0b814c994194896e292d1d2297ff06274608','d37133ca872bc9f0a33263584e3019e7dd5a3ed5'];
const central=JSON.parse(remote(lanProfile,'jarvis-112',python({runs},String.raw`import json,sqlite3,re,hashlib,datetime,collections
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
root='/home/superopen/All-Projects/msf-jarvis-autonomy-r22';out=[]
def hash(s):return hashlib.sha256(s.encode()).hexdigest()
def public_path(s):
 if not isinstance(s,str):return None
 s=s.removeprefix(root+'/')
 if s.startswith('/') or '..' in s.split('/') or not re.fullmatch('[a-zA-Z0-9_./-]{1,240}',s):return None
 if any(x.startswith('.env') or x in ['.secrets','.claude','.codex','.git','node_modules','data','uploads'] or any(y in x.lower() for y in ['secret','credential','password','cookie']) for x in s.split('/')):return None
 return s
names={'Bash','Read','Write','Edit','MultiEdit','Glob','Grep','Agent','Task','TaskOutput','TaskStop','TodoWrite','TaskCreate','TaskUpdate','TaskList','AskUserQuestion','EnterPlanMode','ExitPlanMode','Skill','SendMessage','ToolSearch'}
def walk(v):
 if isinstance(v,dict):
  yield v
  for z in v.values():yield from walk(z)
 elif isinstance(v,list):
  for z in v:yield from walk(z)
def content(v):
 if isinstance(v,str):return v
 if isinstance(v,list):return '\n'.join(x.get('text','') for x in v if isinstance(x,dict))
 return ''
try:
 for rid in p['runs']:
  tools={};toolnames=collections.Counter();errors=[];bash=[];edited={};stats=collections.Counter();tasks=[];last=[]
  for row in c.execute('SELECT at,text FROM execution_logs WHERE run_id=? ORDER BY id',(rid,)):
   try:v=json.loads(row['text'])
   except ValueError:continue
   for x in walk(v):
    if x.get('type')=='tool_use':
     name=x.get('name');name=name if name in names else 'other';inp=x.get('input') or {};tools[x.get('id')]=(name,inp);toolnames[name]+=1
     if name in ['Edit','Write','MultiEdit']:
      rel=public_path(inp.get('file_path') or inp.get('path'))
      if rel:
       e=edited.setdefault(rel,{'path':rel,'edits':0,'firstAt':row['at'],'lastAt':row['at']});e['edits']+=1;e['lastAt']=row['at']
    if x.get('type')=='tool_result':
     name,inp=tools.get(x.get('tool_use_id'),('unknown',{}));text=content(x.get('content'));codes=[]
     for code,pat in {'MISSING_FILE':r'File does not exist|ENOENT|No such file or directory','EDIT_MISMATCH':r'String to replace not found|old_string.*not found|not unique|No changes to make','TASK_HANDLE_MISSING':r'No task found|Unknown task|task.*not found','PERMISSION_DENIED':r'Permission denied|requires approval|waiting for approval','TEST_ASSERTION_FAILURE':r'AssertionError|FAIL|tests? failed|expected.*received','DEPENDENCY_MODULE_MISSING':r'Cannot find module|ERR_MODULE_NOT_FOUND','RATE_LIMIT':r'429 Too Many|rate limit exceeded|quota exceeded','RUNNING_BACKGROUND':r'Process running|running in the background|task is still running','TIMEOUT':r'timed out|timeout exceeded'}.items():
      if re.search(pat,text,re.I):codes.append(code)
     if x.get('is_error') is True:errors.append({'at':row['at'],'tool':name,'categories':codes or ['OTHER'],'resultSha256':hash(text)})
     if name=='Bash':
      cmd=inp.get('command','');commandTypes=[]
      for code,pat in {'TEST':r'vitest|(?:npm|pnpm) (?:run )?test|node --test|tsx --test','LINT':r'(?:npm|pnpm) (?:run )?lint','BUILD':r'(?:npm|pnpm) (?:run )?build','TYPECHECK':r'typecheck|tsc --noEmit','PACKAGE':r'\btar\b|\bzip\b','GIT':r'\bgit\b','WATCH_OR_DEV':r'--watch|(?:npm|pnpm) run dev|tail -f'}.items():
       if re.search(pat,cmd):commandTypes.append(code)
      exitmatch=re.search(r'Exit code:?\s*(-?\d+)',text,re.I)
      testCounts=[]
      for pat in [r'Test Files\s+([^\n]{1,120})',r'Tests\s+([^\n]{1,120})',r'tests\s+(\d+)\s*\n[^\n]*pass\s+(\d+)']:
       for m in re.finditer(pat,text):
        safe=m.group(1)
        if re.fullmatch('[a-zA-Z0-9 (),|.%-]{1,120}',safe):testCounts.append(safe)
      bash.append({'at':row['at'],'commandTypes':commandTypes or ['OTHER'],'commandSha256':hash(cmd),'resultSha256':hash(text),'toolIsError':bool(x.get('is_error')),'reportedExitCode':int(exitmatch.group(1)) if exitmatch else None,'categories':codes,'testSummaryCounters':testCounts})
     last.append({'at':row['at'],'tool':name,'isError':bool(x.get('is_error')),'categories':codes})
    if x.get('type')=='system' and x.get('subtype') in ['task_notification','task_started','task_progress']:
     st=x.get('status');tasks.append({'at':row['at'],'subtype':x.get('subtype'),'status':st if st in ['completed','failed','running','stopped'] else 'unknown'})
  out.append({'runId':rid,'toolNameCounts':dict(toolnames),'editPathTimeline':list(edited.values()),'toolErrors':errors,'bashResults':bash,'lastToolResults':last[-20:],'taskNotifications':tasks})
 print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':out}))
finally:c.close()
`),true));
const node=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`import json,subprocess,hashlib,datetime,re,os
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf-jarvis-autonomy-r22')
def h(b):return hashlib.sha256(b).hexdigest()
def pub(rel):return not any(x.startswith('.env') or x in ['.secrets','.claude','.codex','.git','node_modules','data','uploads','private','payload'] or any(y in x.lower() for y in ['secret','credential','password','cookie']) for x in Path(rel).parts)
def command(args):return subprocess.check_output(['/usr/bin/git','-C',str(root),*args],timeout=15)
head=command(['rev-parse','HEAD']).decode().strip();history=[]
for line in command(['log','-8','--format=%H %P %cI']).decode().splitlines():
 parts=line.split();commit=parts[0];files=[s for s in command(['diff-tree','--no-commit-id','--name-only','-r',commit]).decode().splitlines() if pub(s)];history.append({'commit':commit,'parents':parts[1:-1],'commitTimestamp':parts[-1],'publicChangedFiles':files})
reports=[];decisions=[]
for base in ['reports','artifacts','docs','doc']:
 folder=root/base
 if not folder.is_dir():continue
 for directory,dirs,names in os.walk(folder,followlinks=False):
  dirs[:]=[x for x in dirs if pub((Path(directory)/x).relative_to(root).as_posix()) and not (Path(directory)/x).is_symlink()]
  for name in names:
   f=Path(directory)/name;rel=f.relative_to(root).as_posix()
   if not pub(rel) or f.is_symlink() or f.suffix not in ['.json','.md','.tgz','.tar','.gz','.zip','.log'] or f.stat().st_size>128*1024*1024:continue
   st=f.stat();b=f.read_bytes();r={'path':rel,'bytes':len(b),'sha256':h(b),'mtime':datetime.datetime.fromtimestamp(st.st_mtime,datetime.timezone.utc).isoformat()}
   if f.suffix=='.json' and len(b)<=8*1024*1024:
    try:
     j=json.loads(b);r['jsonRootType']=type(j).__name__
     if isinstance(j,dict):
      r['keys']=[k for k in j if re.fullmatch('[a-zA-Z0-9_-]{1,60}',str(k)) and not any(z in k.lower() for z in ['token','password','secret','credential','cookie','env','session'])]
      scalar={}
      for k in ['schemaVersion','version','status','kind','passed','failed','total','tests','testCount','durationMs','exitCode','sourceFingerprint','goalSpecHash','sourceStable','simulated','workPackage','runId','startedAt','finishedAt']:
       v=j.get(k)
       if isinstance(v,(bool,int,float)) or isinstance(v,str) and (re.fullmatch('[a-zA-Z0-9_.:-]{1,100}',v) or re.fullmatch('[a-f0-9]{64}',v)):scalar[k]=v
      r['metadata']=scalar
      if isinstance(j.get('checks'),list):r['checks']=[{'id':x.get('id'),'status':x.get('status'),'exitCode':x.get('exitCode'),'executed':x.get('executed')} for x in j['checks'] if isinstance(x,dict) and re.fullmatch('[a-zA-Z0-9_-]{1,70}',str(x.get('id','')))]
    except (ValueError,TypeError):r['jsonInvalid']=True
   if 'decision' in name.lower() or 'checkpoint' in name.lower():decisions.append(r)
   if base in ['reports','artifacts'] or st.st_mtime>1760161380:reports.append(r)
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headBefore':head,'headAfter':command(['rev-parse','HEAD']).decode().strip(),'recentHistory':history,'reportAndNewDocumentMetadata':reports[:300],'reportInventoryTruncated':len(reports)>300,'decisionOrCheckpointFiles':decisions,'buildAndTestNotExecuted':True}))
`),true,{timeoutMs:90000}));
const r={schemaVersion:1,kind:'fa01-timeout-structured-private-log-readonly-analysis',at:new Date().toISOString(),central,node,rawLogsExported:false,privateFieldsExported:false,modelCalls:0,remoteMutations:false};const path='artifacts/software-factory/autonomy-r22/fa01-timeout-structured-analysis-r22-7.json';await writeFile(path,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),runs:central.runs.map(x=>({id:x.runId,types:x.toolNameCounts,errors:x.toolErrors.length,last:x.lastToolResults.slice(-5)})),reports:node.reportAndNewDocumentMetadata.filter(x=>x.path.endsWith('.json')||x.path.endsWith('.tgz')).map(x=>({path:x.path,bytes:x.bytes,metadata:x.metadata,checks:x.checks})),decisions:node.decisionOrCheckpointFiles,head:node.headAfter}));
