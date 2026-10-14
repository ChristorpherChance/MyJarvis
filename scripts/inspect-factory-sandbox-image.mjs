/** Read-only local image identities. Image ID is not a registry manifest. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {writeFile} from 'node:fs/promises';
const observation=JSON.parse(remote(lanProfile,'jarvis-101',python({},String.raw`import subprocess,json,datetime
r=subprocess.run(['/usr/bin/docker','image','inspect','alpine:3.20'],capture_output=True,text=True,timeout=10)
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'exitCode':r.returncode}
if r.returncode==0:
 d=json.loads(r.stdout)[0]
 out.update({k:d.get(k) for k in ['Id','RepoDigests','Architecture','Os','Size']})
print(json.dumps(out))
`),true));
await writeFile('artifacts/software-factory/full-test/sandbox-image-identity.json',JSON.stringify(observation,null,2)+'\n');
console.log(JSON.stringify(observation));
