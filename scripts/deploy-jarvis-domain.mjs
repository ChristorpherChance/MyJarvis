/** Pinned maintenance deployment. All proxy credentials remain in process memory. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {remote,python,lanProfile,cloudProfile} from './managed-server-client.mjs';

const domain='cc-jarvis.ikvein.com',out='artifacts/domain-access';
await mkdir(out,{recursive:true});
function run(program,args,input){const r=spawnSync(program,args,{input,encoding:'utf8',windowsHide:true,maxBuffer:100000,timeout:90000});if(r.status!==0)throw Error('INGRESS_TRANSFER_FAILED '+program);return r.stdout;}
const publicSettings=JSON.parse(await readFile(out+'/116-frp-public-settings.json','utf8'));
const binary=resolve(out+'/frpc-v0.69.1-linux-amd64');
run('sftp',['-F',lanProfile,'-b','-','jarvis-116'],'get "/home/superopen/frpc/frpc" "'+binary.replaceAll('\\','/')+'"\n');
const binarySHA256=createHash('sha256').update(await readFile(binary)).digest('hex');if(binarySHA256!==publicSettings.binarySHA256)throw Error('FRPC_BINARY_CHECKSUM_DIFF');
const credentials=JSON.parse(remote(lanProfile,'jarvis-116',`import json,tomllib
from pathlib import Path
c=tomllib.loads(Path('/home/superopen/frpc/frpc.toml').read_text());token=c.get('auth',{}).get('token')
if not isinstance(token,str) or not token or '{{' in token:raise RuntimeError('Existing literal FRP token unavailable')
print(json.dumps({'serverAddr':c['serverAddr'],'serverPort':c.get('serverPort',7000),'token':token}))`,true));
if(credentials.serverAddr!=='8.163.127.192'||credentials.serverPort!==7000)throw Error('EXISTING_FRP_GATEWAY_DIFF');
const existing=JSON.parse(remote(lanProfile,'jarvis-112',`import json,tomllib
from pathlib import Path
f=Path('/etc/jarvis-frpc/frpc.toml')
if not f.exists():print('{}')
else:
 c=tomllib.loads(f.read_text());r=next((r for r in c.get('proxies',[]) if r.get('customDomains')==['${domain}'] or r.get('subdomain')=='cc-jarvis'),None)
 if not r:raise RuntimeError('Existing domain client differs')
 print(json.dumps({'edgeUser':r['httpUser'],'edgePassword':r['httpPassword']}))`,true));
const edge={edgeUser:existing.edgeUser||'jarvis-edge',edgePassword:existing.edgePassword||randomBytes(32).toString('base64url')};
const client=await readFile('scripts/install-jarvis-frpc.py','utf8'),nginx=await readFile('scripts/install-jarvis-nginx.py','utf8'),nodes=[];
for(const id of ['101','112']){
 const upload='/home/superopen/jarvis-frpc-upload';run('sftp',['-F',lanProfile,'-b','-','jarvis-'+id],'put "'+binary.replaceAll('\\','/')+'" "'+upload+'"\n');
 const r=JSON.parse(remote(lanProfile,'jarvis-'+id,python({nodeId:id,address:'192.168.10.'+id,domain,upload,binarySHA256,...credentials,...edge},client),true));nodes.push(r);console.log(JSON.stringify({phase:'domain-client-installed',...r}));
}
const ingress=JSON.parse(remote(cloudProfile,'jarvis-gz',python({domain,...edge},nginx),true));console.log(JSON.stringify({phase:'domain-gateway-enabled',...ingress}));
// Do not persist tokens, basic passwords or rendered private server configuration.
const report={domain,url:'https://'+domain,at:new Date().toISOString(),nodes,ingress,credentialsWrittenToLocalArtifacts:false,existing116ClientModified:false};
await writeFile(out+'/deployment.json',JSON.stringify(report,null,2));
