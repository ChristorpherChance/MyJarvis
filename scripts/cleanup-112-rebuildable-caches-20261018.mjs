import {remote,lanProfile,python} from './managed-server-client.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const prior=JSON.parse(readFileSync('artifacts/ai-terminal-112/20261018-verification.json','utf8'));
const result=JSON.parse(remote(lanProfile,'jarvis-112',python({archiveSHA256:prior.ccSwitch.archiveSha256,binarySHA256:prior.ccSwitch.binarySha256},String.raw`
import os,stat,json,subprocess,hashlib,datetime
from pathlib import Path
def H(f):
 h=hashlib.sha256()
 with f.open('rb') as src:
  while True:
   b=src.read(1024*1024)
   if not b:break
   h.update(b)
 return h.hexdigest()
def free():
 s=os.statvfs('/');return s.f_bavail*s.f_frsize
def allocated(root):
 total=0
 for dr,ds,fs in os.walk(root,followlinks=False):
  for x in [Path(dr),*(Path(dr)/n for n in fs)]:total+=x.lstat().st_blocks*512
 return total
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskAvailableBeforeBytes':free(),'apt':{},'ccSwitchTemporaryArchive':{},'logsModified':False,'snapCacheModified':False}
cache=Path('/var/cache/apt/archives');before=allocated(cache)
try:
 r=subprocess.run(['apt-get','-o','DPkg::Lock::Timeout=0','clean'],capture_output=True,text=True,timeout=30)
 out['apt']={'command':'apt-get -o DPkg::Lock::Timeout=0 clean','exit':r.returncode,'allocatedBeforeBytes':before,'allocatedAfterBytes':allocated(cache),'stderrSHA256':hashlib.sha256(r.stderr.encode()).hexdigest(),'reason':'completed' if r.returncode==0 else 'busy-or-unavailable-kept'}
except subprocess.TimeoutExpired:out['apt']={'reason':'timeout-skipped','allocatedBeforeBytes':before,'allocatedAfterBytes':allocated(cache)}
root=Path('/tmp/cc-switch-install.F63f1b');binary=Path('/home/superopen/.local/bin/cc-switch');refs=[]
if root.is_dir() and not root.is_symlink() and root.resolve()==root and not os.path.ismount(root):
 for proc in Path('/proc').iterdir():
  if not proc.name.isdigit():continue
  try:
   for fd in [proc/'cwd',proc/'exe',*(proc/'fd').iterdir()]:
    try:
     v=os.readlink(fd)
     if v==str(root) or v.startswith(str(root)+'/'):refs.append(int(proc.name))
    except OSError:pass
  except OSError:pass
 files=list(root.iterdir());matches=[x for x in files if x.is_file() and not x.is_symlink() and H(x)==p['archiveSHA256']]
 out['ccSwitchTemporaryArchive']={'path':str(root),'archiveSHA256':p['archiveSHA256'],'knownArchiveMatches':len(matches),'totalEntries':len(files),'processReferences':sorted(set(refs)),'deletedFiles':[]}
 if not refs and binary.is_file() and H(binary)==p['binarySHA256']:
  for file in matches:
   size=file.stat().st_blocks*512;file.unlink();out['ccSwitchTemporaryArchive']['deletedFiles'].append({'path':str(file),'allocatedBytes':size,'sha256':p['archiveSHA256']})
  if not list(root.iterdir()):root.rmdir();out['ccSwitchTemporaryArchive']['emptyDirectoryDeleted']=True
 else:out['ccSwitchTemporaryArchive']['reason']='process-reference-or-installed-binary-mismatch-kept'
else:out['ccSwitchTemporaryArchive']={'path':str(root),'reason':'absent-or-unsafe-kept'}
out['diskAvailableAfterBytes']=free();out['deletedAllocatedBytes']=max(0,out['apt'].get('allocatedBeforeBytes',0)-out['apt'].get('allocatedAfterBytes',0))+sum(x['allocatedBytes'] for x in out['ccSwitchTemporaryArchive'].get('deletedFiles',[]))
print(json.dumps(out))
`),true,{timeoutMs:60000}));
mkdirSync('artifacts/migration-112',{recursive:true});writeFileSync('artifacts/migration-112/cache-cleanup-public.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
