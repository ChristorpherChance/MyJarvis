import {writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {remote,lanProfile,python} from './managed-server-client.mjs';
const r=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`import json,subprocess,re,hashlib,datetime,collections
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf-jarvis-autonomy-r22');base=root/'artifacts/fa-01'
def hash(b):return hashlib.sha256(b).hexdigest()
def pub(path):return not any(x.startswith('.env') or x in ['.git','.secrets','.claude','.codex','node_modules','payload','data'] or any(y in x.lower() for y in ['secret','credential','password','cookie']) for x in Path(path).parts)
files=[]
for d in [root/'scripts/jarvis-autonomy',root/'docs']:
 if not d.exists():continue
 for f in d.rglob('*'):
  rel=f.relative_to(root).as_posix()
  if not pub(rel) or f.is_symlink() or not f.is_file() or f.stat().st_size>8*1024*1024:continue
  tracked=subprocess.run(['/usr/bin/git','-C',str(root),'ls-files','--error-unmatch','--',rel],capture_output=True,timeout=10).returncode==0
  ignored=subprocess.run(['/usr/bin/git','-C',str(root),'check-ignore','-q','--',rel],capture_output=True,timeout=10).returncode==0
  files.append({'path':rel,'bytes':f.stat().st_size,'sha256':hash(f.read_bytes()),'tracked':tracked,'ignored':ignored,'mtime':datetime.datetime.fromtimestamp(f.stat().st_mtime,datetime.timezone.utc).isoformat()})
logs=[]
for f in base.glob('round-*.log'):
 if f.is_symlink() or f.stat().st_size>16*1024*1024:continue
 b=f.read_bytes();text=b.decode('utf-8','replace');stats={}
 for label,pat in [('tests',r'^# tests (\d+)'),('pass',r'^# pass (\d+)'),('fail',r'^# fail (\d+)'),('skip',r'^# skipped (\d+)')]:
  match=re.search(pat,text,re.M)
  if match:stats[label]=int(match.group(1))
 eslint=collections.Counter(re.findall(r'\b((?:@typescript-eslint/)?(?:no-[a-z-]+|[a-z-]+/no-[a-z-]+))\s*$',text,re.M));summary=re.findall(r'([0-9]+) problems? \(([0-9]+) errors?, ([0-9]+) warnings?\)',text)
 logs.append({'path':f.relative_to(root).as_posix(),'bytes':len(b),'sha256':hash(b),'tapSummary':stats,'eslintRuleCounts':dict(eslint),'eslintProblemSummary':[{'problems':int(a),'errors':int(c),'warnings':int(d)} for a,c,d in summary], 'processFailureCategories':[name for name,pat in [('TYPECHECK_ERROR',r'error TS\d+'),('TEST_FAILURE',r'not ok \d+|AssertionError'),('DEPENDENCY_MISSING',r'Cannot find module|ERR_MODULE_NOT_FOUND'),('PRIVATE_EVIDENCE_PERMISSION',r'Permission denied') ] if re.search(pat,text)]})
snapshots=[]
for name in ['round-2-source-initial.json','round-3-source-pre-freeze.json']:
 f=base/name;j=json.loads(f.read_bytes());arr=j.get('files');sample=arr[0] if isinstance(arr,list) and arr else None
 snapshots.append({'path':f.relative_to(root).as_posix(),'sha256':hash(f.read_bytes()),'status':j.get('status'),'fileCount':j.get('fileCount'),'contentHash':j.get('contentHash'),'fileEntryKeys':list(sample.keys()) if isinstance(sample,dict) else None,'sourceFiles':[{k:x[k] for k in ['path','sha256','bytes'] if k in x} for x in arr if isinstance(x,dict) and pub(x.get('path',''))] if isinstance(arr,list) else []})
engineering=[]
for name in ['round-3-engineering-review.json','round-3-controlled-evidence-access.json','round-3-development-prechecks.json']:
 f=base/name;j=json.loads(f.read_bytes());findings=j.get('findings') or []
 engineering.append({'path':f.relative_to(root).as_posix(),'sha256':hash(f.read_bytes()),'accepted':j.get('accepted'),'findingsCount':len(findings),'limitationCount':len(j.get('limitations') or []),'conclusionCategories':[k for k,p in [('PRIVATE_EVIDENCE_DENIED',r'permission|denied|受限|无权|不可读|权限'),('NOT_PRODUCT_ACCEPTANCE',r'not.*accept|未.*验收|不能.*验收')] if re.search(p,str(j.get('conclusion','')),re.I)],'findingFieldNames':sorted(set(k for x in findings if isinstance(x,dict) for k in x if re.fullmatch('[a-zA-Z0-9_-]{1,60}',k)))})
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentPublicSupportFiles':files,'storedDevelopmentLogCounters':logs,'modelProducedSnapshotsNotTrustedAcceptance':snapshots,'modelProducedEngineeringMetadataNotTrustedAcceptance':engineering,'sourceChangedByThisInspection':False}))
`),true,{timeoutMs:90000}));const path='artifacts/software-factory/autonomy-r22/fa01-timeout-existing-artifacts-r22-7.json';await writeFile(path,JSON.stringify({schemaVersion:1,...r,rawLogsExported:false,modelCalls:0,remoteMutations:false,testsRun:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),supportFiles:r.currentPublicSupportFiles,logs:r.storedDevelopmentLogCounters,engineering:r.modelProducedEngineeringMetadataNotTrustedAcceptance,snapshots:r.modelProducedSnapshotsNotTrustedAcceptance.map(x=>({...x,sourceFiles:x.sourceFiles.length}))}));
