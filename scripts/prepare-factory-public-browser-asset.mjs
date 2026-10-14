/** Download one official public build to a new cloud directory; never overwrite active builds. */
import {remote,cloudProfile,python} from './managed-server-client.mjs';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const job=randomUUID().replaceAll('-','');
const url='https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-headless-shell-linux64.zip';
const code=String.raw`import urllib.request,hashlib,os,time,json,datetime
from pathlib import Path
root=Path('/tmp')/('jarvis-factory-public-browser-'+p['job']);root.mkdir(mode=0o700)
target=root/'chrome-headless-shell-linux64.zip'
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':p['url'],'job':p['job'],'alias':'jarvis-jp','credentialsUsed':False,'cloudServicesChanged':False,'complete':False}
started=time.monotonic();total=0;sha=hashlib.sha256()
try:
 with urllib.request.urlopen(p['url'],timeout=8) as r:
  out['status']=r.status;out['etag']=r.headers.get('ETag');expected=int(r.headers.get('Content-Length','0'))
  if r.status!=200 or expected!=120231126 or r.headers.get('ETag')!='"792047b3c2625d7d4b0fc7c4fc67d7ad"':raise RuntimeError('PUBLIC_ASSET_IDENTITY_MISMATCH')
  fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'wb') as f:
   while True:
    if time.monotonic()-started>25:raise TimeoutError('DOWNLOAD_TIME_LIMIT')
    block=r.read(1024*1024)
    if not block:break
    total+=len(block)
    if total>expected:raise RuntimeError('PUBLIC_ASSET_SIZE_LIMIT')
    sha.update(block);f.write(block)
  if total!=expected:raise RuntimeError('PUBLIC_ASSET_INCOMPLETE')
  out.update({'complete':True,'bytes':total,'sha256':sha.hexdigest(),'path':str(target)})
except Exception as e:
 out['failureKind']=type(e).__name__;out['partialBytes']=total
 if target.exists():target.unlink()
 if not any(root.iterdir()):root.rmdir()
out['seconds']=round(time.monotonic()-started,3)
print(json.dumps(out))
`;
const out=JSON.parse(remote(cloudProfile,'jarvis-jp',python({job,url},code),false));
await writeFile('artifacts/software-factory/full-test/public-browser-asset.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out));
