/** Safe diagnostics from our fixed dummy proof, never model/project logs. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
const id=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(id??''))throw Error('PROOF_ID_INVALID');
const r=remote(lanProfile,'jarvis-101',python({id},String.raw`import json,re,subprocess
from pathlib import Path
text=(Path('/root')/('jarvis-timeout-proof-r24-'+p['id'])/'stderr.private').read_text()
r=subprocess.run(['/usr/bin/docker','inspect','--type','container','jarvis-timeout-proof-r24-'+p['id'].replace('-','')],capture_output=True,text=True,timeout=10)
state=json.loads(r.stdout)[0] if r.returncode==0 else None
metadata={'exists':bool(state),'inspectExitCode':r.returncode}
if state:metadata.update({'image':state.get('Image'),'labels':state.get('Config',{}).get('Labels',{}),'network':state.get('HostConfig',{}).get('NetworkMode'),'running':state.get('State',{}).get('Running'),'mounts':[{k:v.get(k) for k in ['Type','Source','Destination','RW']} for v in state.get('Mounts',[])]})
print(json.dumps({'errorTypes':re.findall(r'\b(?:[A-Za-z]+Error|ERR_[A-Z_]+)\b',text),'locations':re.findall(r'/tools/[A-Za-z0-9_.-]+(?::\d+){0,2}',text),'fixedDiagnosticLines':[v for v in text.splitlines() if re.fullmatch(r'(?:AssertionError[^\r\n]*|\s*(?:actual|expected|operator): [^\r\n]*|Error: [A-Z_]+|\s*code: .ERR_[A-Z_]+.,?)',v)],'container':metadata}))
`),true);console.log(r);
