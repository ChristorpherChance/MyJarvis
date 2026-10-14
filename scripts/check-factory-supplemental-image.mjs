import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const nonce=randomBytes(16).toString('hex');
const report=JSON.parse(remote(lanProfile,'jarvis-101',python({nonce},`import json,subprocess
image='sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96'
name='jarvis-supplement-image-check-'+p['nonce'];label='jarvis.validation.imagecheck='+p['nonce']
code="const fs=require('node:fs');const cp=require('node:child_process');const py='/usr/bin/python3';const exists=fs.existsSync(py);let caps=null;if(exists){const r=cp.spawnSync(py,['-I','-c','import os,signal,json;print(json.dumps({\\\"pythonVersion\\\":list(__import__(\\\"sys\\\").version_info[:3]),\\\"pidfdOpen\\\":hasattr(os,\\\"pidfd_open\\\"),\\\"pidfdSendSignal\\\":hasattr(signal,\\\"pidfd_send_signal\\\")}))'],{encoding:'utf8'});if(r.status===0)caps=JSON.parse(r.stdout);}console.log(JSON.stringify({pythonPath:py,pythonExists:exists,capabilities:caps,playwrightVersion:require('/opt/test-tools/node_modules/playwright/package.json').version,nodePath:process.env.NODE_PATH,modelCalls:0}));"
result=None
try:
 r=subprocess.run(['/usr/bin/docker','run','--pull=never','--rm','--name',name,'--label',label,'--network','none','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','1','--pids-limit','32',image,'node','-e',code],capture_output=True,text=True,timeout=20)
 if r.returncode!=0:raise RuntimeError('FIXED_IMAGE_CHECK_FAILED')
 result=json.loads(r.stdout)
finally:
 i=subprocess.run(['/usr/bin/docker','inspect','--format','{{index .Config.Labels \\\"jarvis.validation.imagecheck\\\"}}',name],capture_output=True,text=True,timeout=10)
 if i.returncode==0:
  if i.stdout.strip()!=p['nonce']:raise RuntimeError('IMAGE_CHECK_CLEANUP_OWNER_MISMATCH')
  c=subprocess.run(['/usr/bin/docker','rm','-f',name],capture_output=True,text=True,timeout=10)
  if c.returncode!=0:raise RuntimeError('IMAGE_CHECK_CLEANUP_FAILED')
print(json.dumps({'imageID':image,'actualCheck':result,'cleanupConfirmed':True,'businessContainersTouched':False,'network':'none'}))
`),true));
await writeFile('artifacts/software-factory/full-test/supplemental-image-readiness-r3.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
