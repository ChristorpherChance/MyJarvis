/** Actual Linux file semantics in a root-private test tree; no product/model calls. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const names=['scripts/test-factory-autonomy-phase-contract.py','scripts/test-project-autonomy-prerequisite-observer.py','scripts/factory-autonomy-phase-contract.py','scripts/project-autonomy-evidence.py','scripts/project-autonomy-fa01-coordinator.py','scripts/project-autonomy-prerequisite-observer.py','artifacts/software-factory/autonomy-r22/objectives.json'];
const files=[];for(const path of names){const data=await readFile(path);files.push({path,base64:data.toString('base64'),sha256:createHash('sha256').update(data).digest('hex')});}
const cases=[['scripts/test-factory-autonomy-phase-contract.py','PhaseContractTests.test_actual_safe_bytes_and_symlink_hardlink_refused'],['scripts/test-project-autonomy-prerequisite-observer.py','StatusAndControlTests.test_root_file_link_and_private_path_checks']];
const report=JSON.parse(remote(lanProfile,'jarvis-101',python({files,cases,id:randomUUID()},String.raw`import os,stat,hashlib,subprocess,datetime
from pathlib import Path
base=Path('/var/lib/jarvis-control/autonomy-r22/linux-primitives')/p['id']
base.mkdir(mode=0o700,parents=True,exist_ok=False)
for item in p['files']:
 q=base/item['path'];q.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 if not q.is_relative_to(base):raise RuntimeError('LINUX_TEST_PATH_INVALID')
 raw=base64.b64decode(item['base64'])
 if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise RuntimeError('LINUX_TEST_TRANSFER_INVALID')
 fd=os.open(q,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(raw)
rows=[]
for script,name in p['cases']:
 r=subprocess.run(['/usr/bin/python3',script,name],cwd=base,capture_output=True,text=True,timeout=30)
 rows.append({'test':name,'exitCode':r.returncode,'output':(r.stdout+r.stderr)[-5000:]})
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':'101','scope':'Actual Linux regular bytes, symlink/hardlink and root-private file semantics; not factory acceptance','cases':rows,'passed':sum(r['exitCode']==0 for r in rows),'failed':sum(r['exitCode']!=0 for r in rows),'files':[{'path':i['path'],'sha256':i['sha256']} for i in p['files']],'modelCalls':0,'productTestsRun':False,'productionServicesModified':False}))
`),true,{timeoutMs:90000}));
await writeFile('artifacts/software-factory/autonomy-r22/linux-primitives-verification.json',JSON.stringify(report,null,2)+'\n');
if(report.failed)throw Error('LINUX_PRIMITIVES_FAILED_SEE_REPORT');
console.log(JSON.stringify({host:report.host,passed:report.passed,failed:report.failed,modelCalls:0,productTestsRun:false}));
