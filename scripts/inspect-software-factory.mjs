/** Read-only inventory. Never print configuration values, environments or credentials. */
import {remote,lanProfile} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
if(process.argv.includes('--doctor')){
 const script=`import json,os,subprocess,urllib.request,shutil
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf')
env=dict(os.environ);env['HOME']='/home/superopen';env['PATH']='/home/superopen/.local/bin:/home/superopen/.local/share/pnpm:/home/superopen/opt/node22/bin:/opt/jarvis/node/bin:/usr/local/bin:/usr/bin:/bin'
checks={}
for name,path in [('health','/health'),('identity','/api/auth/whoami')]:
 try:
  with urllib.request.urlopen('http://127.0.0.1:8080'+path,timeout=3) as r:
   body=json.load(r);checks[name]={'status':r.status,'authEnabled':body.get('enabled') if name=='identity' else None,'healthy':r.status==200}
 except Exception:checks[name]={'healthy':False}
git={}
for name,args in [('branch',['branch','--show-current']),('commit',['rev-parse','HEAD']),('status',['status','--porcelain=v1'])]:
 try:
  r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','git','-C',str(root),*args],capture_output=True,text=True,timeout=5,env=env)
  git[name]=r.stdout.strip() if r.returncode==0 else None
 except subprocess.TimeoutExpired:git[name]=None
clis={}
for name in ['claude','codex','pnpm']:
 path=shutil.which(name,path=env['PATH']);item={'installed':bool(path),'path':str(Path(path).resolve()) if path else None}
 if path:
  try:
   r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--',path,'--version'],capture_output=True,text=True,timeout=5,env=env)
   import re
   match=re.search(r'\\d+\\.\\d+(?:\\.\\d+)?',(r.stdout+r.stderr))
   item.update({'version':match.group(0) if match else None,'versionExit':r.returncode})
  except subprocess.TimeoutExpired:item.update({'version':None,'versionExit':'timeout'})
 clis[name]=item
packages={}
for name in ['package.json','apps/server/package.json','apps/web/package.json']:
 data=json.loads((root/name).read_text());packages[name]={'name':data.get('name'),'scripts':data.get('scripts',{})}
print(json.dumps({'checks':checks,'git':git,'clis':clis,'packages':packages,'sourceOwner':root.stat().st_uid,'dependenciesInstalled':(root/'node_modules').is_dir()},ensure_ascii=False))
`;
 try{const report=JSON.parse(remote(lanProfile,'jarvis-101',script,true));await mkdir('artifacts/software-factory',{recursive:true});await writeFile('artifacts/software-factory/101-doctor.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
 catch{console.error('FACTORY_DOCTOR_FAILED');process.exitCode=1;}process.exit();
}
if(process.argv.includes('--source')){
 const sourceScript=`import json,base64
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf').resolve()
files=[]
for base in [root/'apps/server/src',root/'packages/shared/src']:
 if not base.is_dir():continue
 for item in base.rglob('*'):
  if item.is_symlink() or not item.is_file() or item.suffix not in ['.ts','.sql','.prisma']:continue
  if item.stat().st_size>1024*1024:continue
  try:name=str(item.resolve().relative_to(root))
  except ValueError:continue
  files.append({'path':name,'file':item})
for name in ['package.json','README.md','AGENTS.md','apps/server/package.json','apps/web/package.json','packages/shared/package.json']:
 item=root/name
 if item.is_file() and not item.is_symlink():files.append({'path':name,'file':item})
parents=[]
for item in [Path('/home/superopen/AGENTS.md'),Path('/home/superopen/All-Projects/AGENTS.md')]:
 if item.is_file():parents.append({'path':str(item),'base64':base64.b64encode(item.read_bytes()).decode()})
files.sort(key=lambda item:item['path'])
index=SOURCE_INDEX
batch=[];size=0
while index<len(files):
 item=files[index];raw=item['file'].read_bytes()
 if batch and size+len(raw)>600000:break
 batch.append({'path':item['path'],'base64':base64.b64encode(raw).decode()});size+=len(raw);index+=1
print(json.dumps({'files':batch,'total':len(files),'nextIndex':index if index<len(files) else None,'parentInstructions':parents if SOURCE_INDEX==0 else []}))
`;
 try{
  const target=resolve('artifacts/software-factory/reference');
  let index=0,total=0,parentCount=0;
  do{
   const snapshot=JSON.parse(remote(lanProfile,'jarvis-101',sourceScript.replaceAll('SOURCE_INDEX',String(index)),true));
   for(const item of snapshot.files){
    const path=resolve(target,item.path);if(!path.startsWith(target+'\\'))throw Error('INVALID_SOURCE_PATH');
    await mkdir(dirname(path),{recursive:true});await writeFile(path,Buffer.from(item.base64,'base64'));
   }
   for(let i=0;i<snapshot.parentInstructions.length;i++)await writeFile(resolve(target,'PARENT-'+i+'-AGENTS.md'),Buffer.from(snapshot.parentInstructions[i].base64,'base64'));
   parentCount+=snapshot.parentInstructions.length;total=snapshot.total;index=snapshot.nextIndex;
  }while(index!==null);
  console.log(JSON.stringify({readOnly:true,source:'/home/superopen/All-Projects/msf',files:total,parentInstructions:parentCount,localReference:target}));
 }catch(error){console.error('FACTORY_SOURCE_SNAPSHOT_FAILED '+(error?.code||'UNKNOWN'));process.exitCode=1;}
 process.exit();
}
const script=process.argv.includes('--locate')?`import json,os
from pathlib import Path
root=Path('/home/superopen')
directories=[]
def scan(path,depth):
 if depth>3 or len(directories)>160:return
 try:
  for item in path.iterdir():
   if not item.is_dir() or item.is_symlink() or item.name.startswith('.') or item.name in ['node_modules','vendor','dist','build','logs','data','snap']:continue
   directories.append(str(item));scan(item,depth+1)
 except OSError:pass
scan(root,0)
processes=[]
for entry in Path('/proc').iterdir():
 if not entry.name.isdigit():continue
 try:
  name=(entry/'comm').read_text().strip()
  if name not in ['node','MainThread','claude','codex','cc-switch']:continue
  processes.append({'pid':int(entry.name),'name':name,'cwd':os.readlink(entry/'cwd'),'executable':os.readlink(entry/'exe')})
 except OSError:pass
print(json.dumps({'directories':directories,'processes':processes},ensure_ascii=False))
`:`import json,subprocess
from pathlib import Path
directories={}
for root in ['/opt','/srv','/home','/var/www','/data','/root']:
 try:directories[root]=[{'name':p.name,'directory':p.is_dir()} for p in Path(root).iterdir() if not p.name.startswith('.')][:100]
 except OSError:directories[root]=[]
units=subprocess.run(['systemctl','list-units','--type=service','--state=running','--no-legend','--no-pager'],capture_output=True,text=True,check=True).stdout
ports=subprocess.run(['ss','-lntp'],capture_output=True,text=True,check=True).stdout
print(json.dumps({'directories':directories,'services':units,'ports':ports},ensure_ascii=False))
`;
try{
 const report=JSON.parse(remote(lanProfile,'jarvis-101',script,true));
 await mkdir('artifacts/software-factory',{recursive:true});
 await writeFile('artifacts/software-factory/'+(process.argv.includes('--locate')?'101-project-location':'101-inventory')+'.json',JSON.stringify({at:new Date().toISOString(),readOnly:true,...report},null,2));
 console.log(JSON.stringify(report));
}catch{console.error('FACTORY_INVENTORY_FAILED');process.exitCode=1;}
