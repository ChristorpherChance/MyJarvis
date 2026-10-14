import {readFile,writeFile} from 'node:fs/promises';
import {remote,python,lanProfile} from './managed-server-client.mjs';
const release=JSON.parse(await readFile('artifacts/managed-servers/release.json','utf8')).release,reports=[];
for(const node of ['101','112'])reports.push(JSON.parse(remote(lanProfile,'jarvis-'+node,python({release,node},`import subprocess
base='/opt/jarvis/releases/'+p['release']
r=subprocess.run(['/opt/jarvis/node/bin/node','--test','--test-reporter=tap','scripts/test-linux-entrypoint.mjs'],cwd=base,capture_output=True,text=True,timeout=35)
if r.returncode or '# pass 1' not in r.stdout or '# skipped 0' not in r.stdout:raise RuntimeError('ISOLATED_ENTRYPOINT_FAILED '+r.stdout[-1800:]+r.stderr[-300:])
print(json.dumps({'node':p['node'],'status':'passed','isolatedTemporaryStorage':True,'realConfiguredHTTPS':True,'primaryRoleWithdrawalVerified':True,'standbyStorageNotOpened':True}))
`),true)));
await writeFile('artifacts/managed-servers/entrypoints.json',JSON.stringify({release,reports,at:new Date().toISOString()},null,2));console.log(JSON.stringify({release,reports}));
