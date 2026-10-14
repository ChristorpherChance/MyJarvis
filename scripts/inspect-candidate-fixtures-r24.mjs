/** Read-only public source/fixture discovery; never follows fixture symlinks. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const directory='artifacts/software-factory/acceptance-r24';
const diagnosisPath=directory+'/candidate-source-link-diagnosis.json';
const diagnosisBytes=await readFile(diagnosisPath),diagnosis=JSON.parse(diagnosisBytes);
const workspace='/home/superopen/All-Projects/msf-jarvis-autonomy-r22';
if(diagnosis.workspace!==workspace||diagnosis.readOnly!==true||diagnosis.symlinks.length!==14)throw Error('FIXTURE_DIAGNOSIS_SCOPE_CHANGED');
const dirs=[...new Set(diagnosis.symlinks.map(row=>{if(!/^artifacts\/fa-01\/(?:package|snapshot)-contract-[A-Za-z0-9]{6}\/(?:link|outside\.txt)$/.test(row.path))throw Error('FIXTURE_PATH_INVALID');return row.path.split('/').slice(0,-1).join('/');}))].sort();
const files=['scripts/jarvis-autonomy/package.test.mjs','scripts/jarvis-autonomy/source-stability.test.mjs','scripts/jarvis-autonomy/runtime-helpers.mjs','scripts/jarvis-autonomy/package.mjs','scripts/jarvis-autonomy/source-stability.mjs','.gitignore'];
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({workspace,dirs,files},String.raw`import os,stat,json,hashlib,subprocess,datetime,re
from pathlib import Path
w=Path(p['workspace'])
def sha(b):return hashlib.sha256(b).hexdigest()
def git(args):
 r=subprocess.run(['/usr/bin/git','--no-optional-locks',*args],cwd=str(w),text=True,capture_output=True,timeout=10)
 return {'code':r.returncode,'stdout':r.stdout}
head_before=git(['rev-parse','HEAD'])['stdout'].strip();sources=[]
for name in p['files']:
 q=w/name;s=q.lstat()
 if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_size>200000:raise RuntimeError('FIXTURE_SOURCE_NOT_REGULAR')
 b=q.read_bytes();lines=b.decode('utf-8').splitlines();patterns=('contract-','mkdtemp','symlink','rmSync','rm(','finally','after(','afterEach','test(','artifacts','source-stability')
 selected=set()
 for i,line in enumerate(lines):
  if any(k in line for k in patterns):selected.update(range(max(0,i-2),min(len(lines),i+4)))
 sources.append({'path':name,'sha256':sha(b),'bytes':len(b),'lines':len(lines),'publicExcerpts':[{'line':i+1,'text':'[private-related source line omitted]' if re.search(r'(?i)(?:api[-_]?key|password|authorization|bearer|secret|\.env|cookie|token)',lines[i]) else lines[i]} for i in sorted(selected)]})
fixtures=[]
for name in p['dirs']:
 q=w/name
 for ancestor in [q,*q.parents]:
  if ancestor==w.parent:break
  st=ancestor.lstat()
  if not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode):raise RuntimeError('FIXTURE_PARENT_NOT_DIRECTORY')
  if ancestor==w:break
 tracked=git(['ls-files','--',name])
 if tracked['code']!=0:raise RuntimeError('FIXTURE_GIT_LOOKUP_FAILED')
 ignored=git(['check-ignore','--',name]);items=[];regular_bytes=0;count=0
 stack=[q]
 while stack:
  current=stack.pop()
  for child in sorted(current.iterdir(),key=lambda x:x.name):
   st=child.lstat();rel=child.relative_to(q).as_posix();kind='directory' if stat.S_ISDIR(st.st_mode) else 'regular-file' if stat.S_ISREG(st.st_mode) else 'symlink' if stat.S_ISLNK(st.st_mode) else 'other'
   entry={'path':rel,'kind':kind,'mode':stat.S_IMODE(st.st_mode),'uid':st.st_uid,'gid':st.st_gid,'device':st.st_dev,'inode':st.st_ino,'size':st.st_size}
   if kind=='directory':stack.append(child)
   elif kind=='regular-file':
    count+=1;regular_bytes+=st.st_size
    if st.st_size>20*1024*1024:raise RuntimeError('FIXTURE_FILE_TOO_LARGE')
    entry['sha256']=sha(child.read_bytes())
   elif kind=='symlink':
    literal=os.readlink(child);entry['linkLiteralSha256']=sha(literal.encode('utf-8'));entry['linkLiteralBytes']=len(literal.encode('utf-8'));entry['literalAbsolute']=os.path.isabs(literal)
   else:raise RuntimeError('FIXTURE_SPECIAL_FILE')
   items.append(entry)
   if len(items)>2000 or regular_bytes>100*1024*1024:raise RuntimeError('FIXTURE_TREE_TOO_LARGE')
 st=q.lstat();manifest=json.dumps(items,sort_keys=True,separators=(',',':')).encode('utf-8')
 fixtures.append({'path':name,'kind':'directory','mode':stat.S_IMODE(st.st_mode),'uid':st.st_uid,'gid':st.st_gid,'device':st.st_dev,'inode':st.st_ino,'trackedPathCount':len(tracked['stdout'].splitlines()),'ignored':ignored['code']==0,'regularFiles':count,'regularBytes':regular_bytes,'entries':items,'manifestSha256':sha(manifest)})
head_after=git(['rev-parse','HEAD'])['stdout'].strip()
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workspace':str(w),'headBefore':head_before,'headAfter':head_after,'headStable':head_before==head_after,'readOnly':True,'sources':sources,'fixtures':fixtures,'fixtureDirectories':len(fixtures),'symlinks':sum(sum(e['kind']=='symlink' for e in f['entries']) for f in fixtures),'modelsInvoked':False,'sourceCodeChanged':False,'symlinksFollowed':False}))
`),false,{timeoutMs:90000}));
result.diagnosis={path:diagnosisPath,sha256:createHash('sha256').update(diagnosisBytes).digest('hex')};
const output=directory+'/candidate-fixture-source-review.json';
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,sha256:createHash('sha256').update(await readFile(output)).digest('hex'),headStable:result.headStable,sourceFiles:result.sources.map(s=>({path:s.path,sha256:s.sha256})),fixtureDirectories:result.fixtureDirectories,symlinks:result.symlinks,allUntracked:result.fixtures.every(f=>f.trackedPathCount===0),allIgnored:result.fixtures.every(f=>f.ignored),readOnly:true}));
