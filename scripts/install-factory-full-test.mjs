/** Install only the fixed isolated test tools. Never starts tests or model calls. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {queueState,nodeState} from './run-factory-supervision-probe.mjs';
const args=process.argv.slice(2),attempt=args.includes('--attempt=r2-retry1')?'r2-retry1':args.includes('--attempt=r2')?'r2':'r1',isR2=attempt.startsWith('r2');
if(args.some(a=>!['--execute','--attempt=r2','--attempt=r2-retry1'].includes(a))||new Set(args).size!==args.length||args.filter(a=>a.startsWith('--attempt=')).length>1)throw Error('FIXED_TOOL_INSTALL_ARGUMENTS_REQUIRED');
const execute=args.includes('--execute'),items=[];
const reportPath='artifacts/software-factory/full-test/'+(execute?'tool-install':'tool-prepare')+(isR2?'-'+attempt:'')+'.json';
// Historical installation evidence is immutable. A new tool set needs a new attempt.
try{const old=JSON.parse(await readFile(reportPath,'utf8'));console.log(JSON.stringify({...old,reusedHistoricalEvidence:true}));process.exit(0);}catch(e){if(e.code!=='ENOENT')throw e;}
if(execute){const q=queueState(),n=nodeState();if(q.allActive!==0||n.template.engine!=='claude'||n.unit.ActiveState!=='active'||n.unit.SubState!=='running')throw Error('FULL_TEST_INSTALL_REQUIRES_RESTORED_IDLE_NODE');}
const files=[
 ['scripts/factory-full-test-runner.py','/usr/local/libexec/jarvis-msf-full-validation',0o755],
 ['scripts/factory-full-test-entry.mjs','/opt/jarvis-development/software-factory/factory-full-test-entry.mjs',0o644],
 ['scripts/factory-risk-probe.mjs','/opt/jarvis-development/software-factory/factory-risk-probe.mjs',0o644]
];
if(isR2)files.push(['scripts/factory-storage-probe.mjs','/opt/jarvis-development/software-factory/factory-storage-probe.mjs',0o644],['scripts/factory-sandbox-broker.py','/opt/jarvis-development/software-factory/factory-sandbox-broker.py',0o644],['scripts/factory-sandbox-broker-control.py','/opt/jarvis-development/software-factory/factory-sandbox-broker-control.py',0o644],['scripts/factory-sandbox-probe.mjs','/opt/jarvis-development/software-factory/factory-sandbox-probe.mjs',0o644]);
for(const [source,target,mode] of files){const bytes=await readFile(source);if(mode===0o755&&bytes.subarray(0,bytes.indexOf(10)).includes(13))throw Error('LINUX_EXECUTABLE_SHEBANG_MUST_USE_LF');items.push({source,target,mode,sha256:createHash('sha256').update(bytes).digest('hex'),data:bytes.toString('base64')});}
const imagesRequired=[isR2?'jarvis-msf-test:20261010-r2':'node:24-bookworm-slim','postgres:16','redis:7','quay.io/minio/minio'];
let expectedImageId=null;
if(isR2){
 const built=JSON.parse(await readFile('artifacts/software-factory/full-test/image-build-r2.json','utf8'));
 const smoke=JSON.parse(await readFile('artifacts/software-factory/full-test/image-smoke-r2.json','utf8'));
 if(!built.complete||built.exitCode!==0||smoke.exitCode!==0||smoke.smoke?.ok!==true||smoke.imageId!==built.imageId||!/^sha256:[a-f0-9]{64}$/.test(built.imageId))throw Error('VERIFIED_FIXED_TEST_IMAGE_REQUIRED');
 expectedImageId=built.imageId;
}
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({execute,items,imagesRequired,attempt,expectedImageId},`from pathlib import Path
import os,stat,subprocess,tempfile,json,hashlib
images={}
for image in p['imagesRequired']:
 r=subprocess.run(['/usr/bin/docker','image','inspect','--format','{{.Id}}',image],capture_output=True,text=True,timeout=15)
 images[image]={'present':r.returncode==0,'id':r.stdout.strip() if r.returncode==0 else None}
if p['attempt'].startswith('r2') and images['jarvis-msf-test:20261010-r2']['id']!=p['expectedImageId']:raise RuntimeError('VERIFIED_TEST_IMAGE_IDENTITY_CHANGED')
if p['execute']:
 if not all(i['present'] for i in images.values()):raise RuntimeError('REQUIRED_LOCAL_IMAGE_UNAVAILABLE')
 for item in p['items']:
  target=Path(item['target'])
  for parent in [target.parent,*target.parent.parents]:
   s=parent.lstat()
   if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('TEST_INSTALL_PATH_NOT_TRUSTED')
  if target.is_symlink():raise RuntimeError('TEST_INSTALL_TARGET_SYMLINK')
  data=base64.b64decode(item['data'])
  if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('TEST_TOOL_TRANSFER_DIGEST_MISMATCH')
  fd,temp=tempfile.mkstemp(prefix='.full-test-',dir=target.parent)
  with os.fdopen(fd,'wb') as stream:stream.write(data)
  os.chown(temp,0,0);os.chmod(temp,item['mode']);os.replace(temp,target)
 sudoers='superopen ALL=(root) NOPASSWD: /usr/local/libexec/jarvis-msf-full-validation'+chr(10)
 fd,temp=tempfile.mkstemp(prefix='.full-test-',dir='/etc/sudoers.d')
 with os.fdopen(fd,'w') as stream:stream.write(sudoers)
 os.chown(temp,0,0);os.chmod(temp,0o440)
 r=subprocess.run(['/usr/sbin/visudo','-cf',temp],capture_output=True,timeout=10)
 if r.returncode:os.unlink(temp);raise RuntimeError('TEST_SUDOERS_INVALID')
 os.replace(temp,'/etc/sudoers.d/jarvis-msf-full-validation')
print(json.dumps({'installed':p['execute'],'images':images,'tools':[{'source':i['source'],'target':i['target'],'sha256':i['sha256']} for i in p['items']],'modelsInvoked':False,'testsStarted':False,'sourceCodeChanged':False}))
`),true));
await mkdir('artifacts/software-factory/full-test',{recursive:true});
await writeFile(reportPath,JSON.stringify({at:new Date().toISOString(),attempt,...result},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
