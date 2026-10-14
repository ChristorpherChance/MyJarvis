/** Read-only fixed-source capture for a static Agent/Pi audit. Does not execute project code. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const target=resolve('artifacts/software-factory/goals-r21/public-source');
const inventory=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`
import os,json,subprocess,hashlib,re,stat
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf')
env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0';env['HOME']='/home/superopen'
def git(args):
 r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',str(root),*args],capture_output=True,timeout=15,env=env)
 if r.returncode:raise RuntimeError('READONLY_GIT_FAILED')
 return r.stdout
files=[]
for raw in git(['ls-files','-z']).split(b'\0'):
 if not raw:continue
 name=raw.decode();parts=Path(name).parts;base=parts[-1].lower()
 if base.startswith('.env') or '.env.' in base or base.endswith('.env') or any(x in parts for x in ['.git','.claude','.codex','.secrets','node_modules','data','logs','sessions','conversations']):continue
 if re.search('secret|credential|password|private[-_]?key|api[-_]?key|chat[-_]?history',base):continue
 if not (name.startswith('apps/server/src/') or name.startswith('packages/shared/src/') or name.startswith('doc/product-design/') or name in ['AGENTS.md','README.md','CLAUDE.md']):continue
 if Path(name).suffix not in ['.ts','.mjs','.js','.md','.sql','.json']:continue
 if 'prototype/' in name or 'tools/rtm-index' in name:continue
 q=root/name
 if q.is_symlink() or not q.is_file() or q.stat().st_size>1048576:continue
 raw=q.read_bytes();files.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
keys=['agent','subagent','子agent','子 agent','提示词','systemprompt','system_prompt','promptversion','prompt_version','delegate','handoff','memory','记忆','评估','评测']
matches=[]
for f in files:
 raw=(root/f['path']).read_text(errors='replace');hits=[]
 for i,line in enumerate(raw.splitlines(),1):
  found=[k for k in keys if k in line.lower()]
  if found:hits.append({'line':i,'terms':found})
 if hits:matches.append({'path':f['path'],'hits':hits,'hitCount':len(hits)})
head=git(['rev-parse','HEAD']).decode().strip();status=git(['status','--porcelain=v1','-z','--untracked-files=all'])
print(json.dumps({'head':head,'branch':git(['branch','--show-current']).decode().strip(),'statusSha256':hashlib.sha256(status).hexdigest(),'trackedDirtyCount':sum(x[:2]!=b'??' for x in status.split(b'\0') if x),'files':files,'keywordMatches':matches,'privateEnvironmentContentsRead':False,'modelsInvoked':0,'testsRun':0,'buildsRun':0,'deploymentsRun':0,'databaseReads':0}))
`),true));
await mkdir('artifacts/software-factory/goals-r21',{recursive:true});
await writeFile('artifacts/software-factory/goals-r21/agent-source-inventory.json',JSON.stringify(inventory,null,2)+'\n',{flag:'wx'});
const paths=inventory.files.filter(f=>f.path.startsWith('apps/server/src/modules/ai/') || f.path.startsWith('apps/server/src/modules/agents/') || /(?:agent|prompt|memory|autopilot|quality|gate|session|generate|review|router|provider|chat|tool|delegate|notification|models)/i.test(f.path) || /(?:PRD|HLD|LLD-1|LLD-2|LLD-3|LLD-7|阶段指引|AGENTS|CLAUDE)/i.test(f.path)).map(f=>f.path);
for(let index=0;index<paths.length;){
 const batch=[];let bytes=0;
 while(index<paths.length){const path=paths[index];const info=inventory.files.find(f=>f.path===path);if(batch.length&&bytes+info.bytes>500000)break;batch.push(path);bytes+=info.bytes;index++;}
 const reply=JSON.parse(remote(lanProfile,'jarvis-101',python({paths:batch,head:inventory.head},String.raw`
import json,base64,hashlib,subprocess,os
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf');out=[]
env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0'
r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',str(root),'rev-parse','HEAD'],capture_output=True,timeout=10,env=env)
if r.returncode or r.stdout.decode().strip()!=p['head']:raise RuntimeError('SOURCE_HEAD_CHANGED')
for name in p['paths']:
 q=root/name
 if q.is_symlink() or not q.is_file() or not q.resolve().is_relative_to(root):raise RuntimeError('PUBLIC_SOURCE_PATH_INVALID')
 raw=q.read_bytes();out.append({'path':name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'base64':base64.b64encode(raw).decode()})
print(json.dumps({'files':out}))
`),true));
 for(const f of reply.files){
  const expected=inventory.files.find(x=>x.path===f.path);if(f.sha256!==expected.sha256)throw Error('SOURCE_CONTENT_CHANGED');
  const file=resolve(target,f.path);if(!file.startsWith(target+'\\'))throw Error('LOCAL_PATH_INVALID');await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from(f.base64,'base64'),{flag:'wx'});
 }
}
const end=JSON.parse(remote(lanProfile,'jarvis-101',python({paths,head:inventory.head},String.raw`
import json,hashlib,os,subprocess
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf');env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0'
def git(args):
 r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',str(root),*args],capture_output=True,timeout=15,env=env)
 if r.returncode:raise RuntimeError('READONLY_GIT_FAILED')
 return r.stdout
files=[]
for name in p['paths']:
 q=root/name
 if q.is_symlink() or not q.is_file():raise RuntimeError('SOURCE_PATH_CHANGED')
 raw=q.read_bytes();files.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
print(json.dumps({'head':git(['rev-parse','HEAD']).decode().strip(),'statusSha256':hashlib.sha256(git(['status','--porcelain=v1','-z','--untracked-files=all'])).hexdigest(),'files':files}))
`),true));
const stable=end.head===inventory.head&&end.statusSha256===inventory.statusSha256&&end.files.every(f=>inventory.files.some(x=>x.path===f.path&&x.sha256===f.sha256));
const capture={readOnly:true,head:inventory.head,publicSourceFiles:inventory.files.length,downloadedPublicFiles:paths.length,sourceStableDuringCapture:stable,modelCalls:0,remoteTests:0,builds:0,deployments:0,databaseReads:0,scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),end};
await writeFile('artifacts/software-factory/goals-r21/agent-source-capture.json',JSON.stringify(capture,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...capture,end:undefined,paths,keywordMatchedFiles:inventory.keywordMatches.map(x=>({path:x.path,hitCount:x.hitCount}))}));
