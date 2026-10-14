/** Copy only the verified public ZIP through authorized SSH profiles. */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,unlink,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {remote,cloudProfile,lanProfile,python} from './managed-server-client.mjs';
const base='artifacts/software-factory/full-test',receipt=JSON.parse(await readFile(base+'/public-browser-asset.json','utf8'));
if(receipt.complete!==true||receipt.bytes!==120231126||receipt.sha256!=='3cfc2bd00d1bafcf8a68dc74c9c92bb7150ddc8d26ade948a776316e1cec4f14'||!receipt.job.match(/^[a-f0-9]{32}$/)||receipt.path!==('/tmp/jarvis-factory-public-browser-'+receipt.job+'/chrome-headless-shell-linux64.zip'))throw Error('PUBLIC_ASSET_RECEIPT_INVALID');
const local=resolve(base,'public-browser-'+receipt.job+'.zip'),journal={at:new Date().toISOString(),job:receipt.job,source:receipt.source,sha256:receipt.sha256,bytes:receipt.bytes,credentialsExported:false,cloudServicesChanged:false,complete:false};
function copy(profile,from,to){const r=spawnSync('scp',['-O','-F',profile,'-o','BatchMode=yes',from,to],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:100000});if(r.status!==0){journal.copyFailure={exitCode:r.status,errorCode:r.error?.code??null,signal:r.signal??null};throw Error('PUBLIC_ASSET_COPY_FAILED');}}
try{
 let prefix;try{prefix=await readFile(local);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prefix?.length>0&&prefix.length<receipt.bytes){
  const prefixSHA=createHash('sha256').update(prefix).digest('hex');
  const scope={...receipt,start:prefix.length,prefixSHA};
  const check=JSON.parse(remote(cloudProfile,'jarvis-jp',python(scope,'from pathlib import Path\nimport hashlib,json\nq=Path(p["path"])\nif q.is_symlink() or q.stat().st_size!=p["bytes"]:raise RuntimeError("PUBLIC_ASSET_RESUME_IDENTITY_MISMATCH")\nwith q.open("rb") as f:digest=hashlib.sha256(f.read(p["start"])).hexdigest()\nif digest!=p["prefixSHA"]:raise RuntimeError("PUBLIC_ASSET_PREFIX_MISMATCH")\nprint(json.dumps({"prefixVerified":True}))'),false));
  if(check.prefixVerified!==true)throw Error('PUBLIC_ASSET_PREFIX_MISMATCH');
  const code=python(scope,'from pathlib import Path\nimport hashlib,sys\nq=Path(p["path"])\nif q.is_symlink() or q.stat().st_size!=p["bytes"] or hashlib.sha256(q.read_bytes()).hexdigest()!=p["sha256"]:raise RuntimeError("PUBLIC_ASSET_RESUME_IDENTITY_MISMATCH")\nwith q.open("rb") as f:\n f.seek(p["start"])\n while True:\n  b=f.read(1024*1024)\n  if not b:break\n  sys.stdout.buffer.write(b)\nsys.stdout.buffer.flush()\n');
  const r=spawnSync('ssh',['-F',cloudProfile,'-o','BatchMode=yes','jarvis-jp','python3 -'],{input:code,windowsHide:true,timeout:60000,maxBuffer:receipt.bytes-prefix.length+100000});
  if(r.status!==0||r.stdout.length!==receipt.bytes-prefix.length)throw Error('PUBLIC_ASSET_RESUME_FAILED');
  await appendFile(local,r.stdout);journal.resumedFromVerifiedBytes=prefix.length;
 }else{copy(cloudProfile,'jarvis-jp:'+receipt.path,local);}
 const raw=await readFile(local);if(raw.length!==receipt.bytes||createHash('sha256').update(raw).digest('hex')!==receipt.sha256)throw Error('PUBLIC_ASSET_COPY_HASH_MISMATCH');
 const target=JSON.parse(remote(lanProfile,'jarvis-101',python(receipt,'from pathlib import Path\nimport json\nroot=Path("/tmp")/("jarvis-factory-public-browser-"+p["job"]);root.mkdir(mode=0o700)\nprint(json.dumps({"path":str(root/"chrome-headless-shell-linux64.zip")}))'),false)).path;
 if(target!==receipt.path)throw Error('PUBLIC_ASSET_TARGET_INVALID');
 copy(lanProfile,local,'jarvis-101:'+target);
 const verified=JSON.parse(remote(lanProfile,'jarvis-101',python(receipt,'from pathlib import Path\nimport hashlib,json,os\nq=Path(p["path"]);s=q.stat();digest=hashlib.sha256(q.read_bytes()).hexdigest()\nif q.is_symlink() or s.st_size!=p["bytes"] or digest!=p["sha256"]:raise RuntimeError("PUBLIC_ASSET_COPY_HASH_MISMATCH")\nos.chmod(q,0o600)\nprint(json.dumps({"verified":True,"path":str(q),"bytes":s.st_size,"sha256":digest}))'),false));
 journal.complete=verified.verified;journal.target=verified.path;journal.completedAt=new Date().toISOString();
 // Only this exact newly created public asset, verified again before removal.
 remote(cloudProfile,'jarvis-jp',python(receipt,'from pathlib import Path\nimport hashlib\nq=Path(p["path"])\nif q.is_symlink() or hashlib.sha256(q.read_bytes()).hexdigest()!=p["sha256"]:raise RuntimeError("PUBLIC_ASSET_CLEANUP_IDENTITY_MISMATCH")\nq.unlink();q.parent.rmdir()\nprint("{}")'),false);
 await unlink(local);journal.cloudTemporaryAssetRemoved=true;journal.localTemporaryAssetRemoved=true;
}finally{await writeFile(base+'/public-browser-transfer.json',JSON.stringify(journal,null,2)+'\n');}
console.log(JSON.stringify(journal));
