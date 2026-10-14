import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile} from './managed-server-client.mjs';
const release=process.env.JARVIS_PATCH_RELEASE??JSON.parse(await readFile('artifacts/managed-servers/release.json','utf8')).release;
async function walk(dir){const list=[];for(const f of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory())list.push(...await walk(p));else if(f.isFile())list.push({path:p,sha256:createHash('sha256').update(await readFile(p)).digest('hex')});}return list;}
const local=[...await walk('apps/api/dist'),...await walk('apps/web/dist')].sort((a,b)=>a.path.localeCompare(b.path));let checks=[];
for(const id of ['101','112']){
 const files=JSON.parse(remote(lanProfile,'jarvis-'+id,`from pathlib import Path
import hashlib,json
base=Path('/opt/jarvis/releases/${release}');files=[]
for d in ['apps/api/dist','apps/web/dist']:
 for f in (base/d).rglob('*'):
  if f.is_file():files.append({'path':str(f.relative_to(base)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
print(json.dumps(files))`,true)).sort((a,b)=>a.path.localeCompare(b.path));
 const mismatches=local.filter(f=>!files.some(v=>v.path===f.path&&v.sha256===f.sha256)).map(f=>f.path);
 if(files.length!==local.length||mismatches.length)throw Error('STAGED_COMPILED_DIFF '+id+' '+mismatches.join(','));
 checks.push({node:id,compiledFiles:files.length,match:true});
}
const output=process.env.JARVIS_PATCH_RELEASE?'artifacts/managed-servers/'+release+'-stage-verification.json':'artifacts/managed-servers/application-stage-verification.json';
await writeFile(output,JSON.stringify({status:'passed',release,checks},null,2),process.env.JARVIS_PATCH_RELEASE?{flag:'wx'}:{});console.log(JSON.stringify({release,checks}));
