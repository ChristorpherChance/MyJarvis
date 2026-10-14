/** Supplement missing tracked public implementation/schema files; static reads only. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const inventory=JSON.parse(await readFile('artifacts/software-factory/goals-r21/agent-source-inventory.json','utf8'));
const target=resolve('artifacts/software-factory/goals-r21/public-source');
const remaining=[];
for(const f of inventory.files){
 if(!f.path.startsWith('apps/server/src/')&&!f.path.startsWith('packages/shared/src/')&&!/LLD-[45]/.test(f.path))continue;
 try{await access(resolve(target,f.path));}catch{remaining.push(f);}
}
for(let index=0;index<remaining.length;){
 const batch=[];let bytes=0;
 while(index<remaining.length){const f=remaining[index];if(batch.length&&bytes+f.bytes>500000)break;batch.push(f);bytes+=f.bytes;index++;}
 const reply=JSON.parse(remote(lanProfile,'jarvis-101',python({files:batch,head:inventory.head},String.raw`
import json,base64,hashlib,subprocess,os
from pathlib import Path
root=Path('/home/superopen/All-Projects/msf');env=dict(os.environ);env['GIT_OPTIONAL_LOCKS']='0';out=[]
r=subprocess.run(['/usr/sbin/runuser','-u','superopen','--','git','--no-optional-locks','-C',str(root),'rev-parse','HEAD'],capture_output=True,timeout=10,env=env)
if r.returncode or r.stdout.decode().strip()!=p['head']:raise RuntimeError('SOURCE_HEAD_CHANGED')
for f in p['files']:
 name=f['path'];q=root/name
 if q.is_symlink() or not q.is_file() or not q.resolve().is_relative_to(root):raise RuntimeError('PUBLIC_SOURCE_PATH_INVALID')
 raw=q.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=f['sha256']:raise RuntimeError('SOURCE_CONTENT_CHANGED')
 out.append({'path':name,'base64':base64.b64encode(raw).decode()})
print(json.dumps({'files':out}))
`),true));
 for(const f of reply.files){const path=resolve(target,f.path);if(!path.startsWith(target+'\\'))throw Error('LOCAL_SCOPE_INVALID');await mkdir(dirname(path),{recursive:true});await writeFile(path,Buffer.from(f.base64,'base64'),{flag:'wx'});}
}
await writeFile('artifacts/software-factory/goals-r21/agent-source-supplement.json',JSON.stringify({head:inventory.head,readOnly:true,files:remaining,modelCalls:0,tests:0,builds:0,deployments:0,databaseReads:0},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({head:inventory.head,additionalPublicFiles:remaining.length}));
