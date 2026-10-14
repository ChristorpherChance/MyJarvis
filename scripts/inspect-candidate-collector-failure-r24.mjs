/** Read only bounded trusted metadata; raw private logs and environment are never exported. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const directory='artifacts/software-factory/acceptance-r24';
const terminalPath=directory+'/candidate-terminal-diagnostic.json';
const terminalRaw=await readFile(terminalPath),terminal=JSON.parse(terminalRaw);
const runId='1270b64e58032d91585307d19d4a9be04f204eab';
if(terminal.runId!==runId||terminal.status!=='failed'||terminal.signed!==true)throw Error('COLLECTOR_DIAGNOSIS_SCOPE_INVALID');
const match=terminal.artifacts.find(path=>path.endsWith('/failure-summary.json'))?.match(/^\.jarvis-validation-output\/[a-f0-9]{40}\/([a-f0-9]{32})\/failure-summary\.json$/);
if(!match)throw Error('COLLECTOR_ATTEMPT_INVALID');
const proof=JSON.parse(remote(lanProfile,'jarvis-101',python({runId,attempt:match[1]},String.raw`import json,stat,hashlib,datetime,re
from pathlib import Path
root=Path('/var/lib/jarvis-development/101/autonomy-evidence')/p['runId']/p['attempt']
for q in [root,*root.parents]:
 if str(q)=='/var/lib/jarvis-development/101':break
 s=q.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('COLLECTOR_METADATA_PARENT_UNTRUSTED')
def data(name,max_bytes=2000000):
 q=root/name;s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_nlink!=1 or s.st_uid!=0 or s.st_size>max_bytes:raise RuntimeError('COLLECTOR_METADATA_FILE_UNTRUSTED')
 b=q.read_bytes();return b,{'path':name,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
raw,meta=data('evidence/collector-build.json');v=json.loads(raw)
if v.get('runId')!=p['runId']:raise RuntimeError('COLLECTOR_METADATA_RUN_MISMATCH')
collector={'schemaVersion':v.get('schemaVersion'),'runId':v.get('runId'),'sourceFingerprint':v.get('sourceFingerprint'),'startedAt':v.get('startedAt'),'finishedAt':v.get('finishedAt'),'checks':[{k:row.get(k) for k in ['id','required','executed','status','exitCode','timedOut','outputLimited']} for row in v.get('checks',[])],'problems':[{k:row.get(k) for k in ['id','errorCode']} for row in v.get('problems',[])],'artifactsCount':len(v.get('artifacts',[]))}
detail_raw,detail_meta=data('detailed-report.json');d=json.loads(detail_raw)
cleanup={k:d.get('cleanup',{}).get(k) for k in ['complete','errorCodes','businessResourcesTouched']}
log_raw,log_meta=data('infrastructure.log',16*1024*1024);text=re.sub(r'\x1b\[[0-9;]*[a-zA-Z]','',log_raw.decode(errors='replace'))
codes=sorted(set(re.findall(r'\b(?:EACCES|EPERM|ENOENT|ENOTDIR|EROFS|EADDRINUSE|ECONNREFUSED|ENOSPC|ERR_MODULE_NOT_FOUND|ERR_INVALID_ARG_TYPE)\b',text)))
syscalls=sorted(set(re.findall(r"\bsyscall:\s*['\"](scandir|open|lstat|stat|access|mkdir|chdir|readlink|spawn|exec)['\"]",text)))
paths=sorted(set(path for path in re.findall(r"\bpath:\s*['\"](/(?:work|evidence|tools)(?:/[^'\"\r\n]*)?)['\"]",text) if not re.search(r'(?i)(?:\.env|secret|credential|private|cookie|key)',path)))
for path in re.findall(r"(?:scandir|open|stat|lstat)\s+['\"](/(?:work|evidence|tools)(?:/[^'\"\r\n]*)?)['\"]",text):
 if not re.search(r'(?i)(?:\.env|secret|credential|private|cookie|key)',path):paths.append(path)
paths=sorted(set(paths))[:20]
compile_refs=[{'path':m.group(1),'line':int(m.group(2)),'column':int(m.group(3)),'code':m.group(4)} for m in re.finditer(r'((?:src|apps|packages)/[a-zA-Z0-9_./-]+\.[cm]?[jt]sx?)[(:](\d+)[,:](\d+)\)?\s*:?\s*(?:-\s*)?error\s*(TS\d+)',text)]
permissions=[]
for name in ['work','work/source','work/home','evidence','snapshot']:
 q=root/name;s=q.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode):raise RuntimeError('COLLECTOR_BIND_DIRECTORY_UNSAFE')
 permissions.append({'path':name,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode)})
programs=[]
for name in ['project-autonomy-fa01-coordinator.py','project-autonomy-fa01-collector.mjs']:
 q=Path('/opt/jarvis-development/software-factory')/name;s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('COLLECTOR_PROGRAM_UNTRUSTED')
 programs.append({'path':str(q),'sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':p['runId'],'attempt':p['attempt'],'metadata':[meta,detail_meta,log_meta],'collector':collector,'cleanup':cleanup,'standardErrorMetadata':{'codes':codes,'syscalls':syscalls,'controlledPaths':paths,'compileReferences':compile_refs[:20]},'bindDirectories':permissions,'programs':programs,'rawLogsExported':False,'environmentRead':False,'rawModelLogsRead':False,'readOnly':True}))
`),true,{timeoutMs:45000}));
proof.terminalEvidence={path:terminalPath,sha256:createHash('sha256').update(terminalRaw).digest('hex')};
const output=directory+'/candidate-collector-failure-independent-diagnosis.json';
await writeFile(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,sha256:createHash('sha256').update(await readFile(output)).digest('hex'),collector:proof.collector,standardErrorMetadata:proof.standardErrorMetadata,bindDirectories:proof.bindDirectories,cleanup:proof.cleanup,readOnly:true}));
