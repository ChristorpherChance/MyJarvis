/** Install a new finite current-main verifier; previous R22 tools/policies remain unchanged. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const execute=process.argv.includes('--execute'),sha=b=>createHash('sha256').update(b).digest('hex');
const source='/home/superopen/All-Projects/msf',fingerprint='151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea';
const files=[];
for(const [local,path,mode] of [
 ['scripts/factory-main-acceptance-wrapper-r26.py','/usr/local/libexec/jarvis-msf-main-acceptance-r26',0o755],
 ['scripts/factory-no-model-receipt-r26.mjs','/opt/jarvis-development/software-factory/factory-no-model-receipt-r26.mjs',0o644]
]){const raw=await readFile(local);files.push({local,path,mode,sha256:sha(raw),body:raw.toString('base64')});}
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({execute,source,fingerprint,files},String.raw`
import os,stat,hashlib,json,subprocess,importlib.util,sys
from pathlib import Path
sys.dont_write_bytecode=True
def need(v,c):
 if not v:raise RuntimeError(c)
def trusted(q):
 for part in [q,*q.parents]:
  s=part.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'MAIN_INSTALL_PATH_UNTRUSTED')
def put(q,body,mode):
 trusted(q.parent)
 if q.exists() or q.is_symlink():
  trusted(q);s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and q.read_bytes()==body,'MAIN_INSTALL_EXISTING_FILE_CHANGED');return
 if not p['execute']:return
 fd=os.open(q,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:f.write(body);f.flush();os.fsync(f.fileno())
 os.chmod(q,mode);trusted(q);need(q.read_bytes()==body,'MAIN_INSTALL_TRANSFER_CHANGED')
root=Path('/etc/jarvis-development/main-acceptance-r26');evidence=Path('/var/lib/jarvis-development/101/main-acceptance-r26')
for q in [root,evidence]:
 trusted(q.parent)
 if p['execute']:q.mkdir(mode=0o700,exist_ok=True)
 if q.exists():trusted(q);need(q.stat().st_mode&0o077==0,'MAIN_INSTALL_DIRECTORY_NOT_PRIVATE')
oldBaseline=Path('/etc/jarvis-development/project-autonomy/baseline.json');oldPolicy=Path('/etc/jarvis-development/project-autonomy/FA-01.json')
for q in [oldBaseline,oldPolicy]:trusted(q)
baseline=json.loads(oldBaseline.read_bytes());policy=json.loads(oldPolicy.read_bytes())
need(baseline['workspace']=='/home/superopen/All-Projects/msf-jarvis-autonomy-r22' and policy['workspace']==baseline['workspace'],'MAIN_INSTALL_OLD_SCOPE_CHANGED')
original={'baseline':hashlib.sha256(oldBaseline.read_bytes()).hexdigest(),'policy':hashlib.sha256(oldPolicy.read_bytes()).hexdigest()}
baseline={**baseline,'workspace':p['source'],'sourceEvidence':'current-main-public-source-identity-r26','sourceFingerprintObserved':p['fingerprint']}
policy={**policy,'workspace':p['source'],'evidenceRoot':str(evidence),'sourceFingerprint':p['fingerprint']}
for name,v in [('baseline.json',baseline),('policy.json',policy)]:
 body=(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
 if root.exists():put(root/name,body,0o600)
for item in p['files']:
 body=base64.b64decode(item['body']);need(hashlib.sha256(body).hexdigest()==item['sha256'],'MAIN_INSTALL_PAYLOAD_CHANGED');put(Path(item['path']),body,item['mode'])
rule=Path('/etc/sudoers.d/jarvis-main-acceptance-r26')
body=b'superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-msf-main-acceptance-r26 *\n'
if p['execute']:
 trusted(rule.parent)
 # Validate the exact rule before making it available to the development node.
 check=subprocess.run(['/usr/sbin/visudo','-cf','-'],input=body,capture_output=True,timeout=15)
 need(check.returncode==0,'MAIN_INSTALL_SUDO_RULE_INVALID');put(rule,body,0o440)
 need(subprocess.run(['/usr/sbin/visudo','-cf',str(rule)],capture_output=True,timeout=15).returncode==0,'MAIN_INSTALL_SUDO_READBACK_INVALID')
need(original=={'baseline':hashlib.sha256(oldBaseline.read_bytes()).hexdigest(),'policy':hashlib.sha256(oldPolicy.read_bytes()).hexdigest()},'MAIN_INSTALL_OLD_POLICY_CHANGED')
print(json.dumps({'at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat().replace('+00:00','Z'),'execute':p['execute'],'source':p['source'],'sourceFingerprint':p['fingerprint'],'files':[{'local':v['local'],'path':v['path'],'sha256':v['sha256']} for v in p['files']],'requiredTestFiles':len(baseline['requiredTestFiles']),'requiredPrototypeSuites':len(baseline['requiredPrototypeSuites']),'oldPolicyHashes':original,'oldPoliciesUnchanged':True,'modelsInvoked':False,'sourceCodeModified':False,'productionServicesTouched':False,'installed':p['execute']}))
`),true));
const dir='artifacts/software-factory/acceptance-r26';await mkdir(dir,{recursive:true});
const output=dir+'/main-verifier-'+(execute?'installed':'prepared')+'-'+randomUUID()+'.json';
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result}));
