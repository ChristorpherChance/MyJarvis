/** One scoped no-network offline-image infrastructure proof. Never installs. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { remote, lanProfile, python } from './managed-server-client.mjs';
const dir='artifacts/software-factory/acceptance-r24',id=randomUUID();
const hash=v=>createHash('sha256').update(v).digest('hex');
const readiness=JSON.parse(await readFile(dir+'/source-and-fixed-entry-readiness.json','utf8'));
const image=readiness.snapshot.fixedDockerImages.find(v=>v.reference==='jarvis-msf-test:20261010-r2');
if(!image?.present||!/^sha256:[a-f0-9]{64}$/.test(image.imageId))throw Error('TIMEOUT_PROOF_APPROVED_IMAGE_MISSING');
const files=await Promise.all(['project-autonomy-fa01-collector.mjs','test-project-autonomy-process-timeout-r24.mjs'].map(async name=>{const raw=await readFile('scripts/'+name);return {name,sha256:hash(raw),base64:raw.toString('base64')};}));
const intent={at:new Date().toISOString(),id,kind:'project-autonomy-timeout-proof-intent',imageReference:image.reference,imageId:image.imageId,
 sourceFingerprints:files.map(({name,sha256})=>({name,sha256})),network:'none',capabilities:['SETUID','SETGID'],installs:false,projectExecuted:false,modelInvoked:false};
await writeFile(dir+'/timeout-proof-intent-'+id+'.json',JSON.stringify(intent,null,2)+'\n',{flag:'wx'});
let result;
try{result=JSON.parse(remote(lanProfile,'jarvis-101',python({id,image,files},String.raw`import os,stat,json,hashlib,base64,subprocess,datetime,re
from pathlib import Path
def need(value,code):
 if not value:raise RuntimeError(code)
def trusted(q):
 for v in [q,*q.parents]:
  s=v.lstat();need(not stat.S_ISLNK(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'TIMEOUT_PROOF_PATH_UNTRUSTED')
def confirmed_absent(name):
 query=subprocess.run(['/usr/bin/docker','container','ls','--all','--filter','name='+name,'--format','{{.Names}}'],capture_output=True,text=True,timeout=10)
 return query.returncode==0 and name not in [v.strip() for v in query.stdout.splitlines()]
need(os.geteuid()==0 and re.fullmatch('[a-f0-9-]{36}',p['id']),'TIMEOUT_PROOF_SCOPE_INVALID')
base=Path('/root')/('jarvis-timeout-proof-r24-'+p['id']);trusted(base.parent);base.mkdir(mode=0o700);trusted(base)
for item in p['files']:
 need(item['name'] in ['project-autonomy-fa01-collector.mjs','test-project-autonomy-process-timeout-r24.mjs'],'TIMEOUT_PROOF_FILE_INVALID')
 raw=base64.b64decode(item['base64'],validate=True);need(hashlib.sha256(raw).hexdigest()==item['sha256'],'TIMEOUT_PROOF_FILE_HASH_INVALID')
 fd=os.open(base/item['name'],os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o444)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
docker='/usr/bin/docker';trusted(Path(docker))
actual=subprocess.check_output([docker,'image','inspect','--format','{{.Id}}',p['image']['reference']],text=True,timeout=15).strip();need(actual==p['image']['imageId'],'TIMEOUT_PROOF_IMAGE_CHANGED')
name='jarvis-timeout-proof-r24-'+p['id'].replace('-','');created=False;removed=False;proof=None;error=None;stdout=b'';stderr=b'';exit_code=None;create_ambiguous=False;private_logs_saved=False
try:
 create_ambiguous=True
 create=subprocess.run([docker,'create','--pull=never','--init','--name',name,'--network','none','--read-only','--user','0:0','--cap-drop','ALL','--cap-add','SETUID','--cap-add','SETGID','--security-opt','no-new-privileges','--memory','256m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,nodev,size=16m','--tmpfs','/evidence:rw,nosuid,nodev,size=1m,mode=0700','--mount','type=bind,src='+str(base)+',dst=/tools,readonly','--label','jarvis.validation.role=r24-timeout-proof','--label','jarvis.validation.attempt='+p['id'],actual,'node','/tools/test-project-autonomy-process-timeout-r24.mjs','--linux-proof'],capture_output=True,timeout=20)
 need(create.returncode==0,'TIMEOUT_PROOF_CONTAINER_CREATE_FAILED');created=True
 create_ambiguous=False
 run=subprocess.run([docker,'start','--attach',name],capture_output=True,timeout=25);stdout=run.stdout;stderr=run.stderr;exit_code=run.returncode
 need(exit_code==0,'TIMEOUT_PROOF_PROCESS_FAILED');need(len(stdout)<=65536,'TIMEOUT_PROOF_OUTPUT_LIMIT')
 proof=json.loads(stdout.decode().strip().splitlines()[-1]);need(proof.get('kind')=='project-autonomy-timeout-linux-proof' and proof.get('simulated') is False and proof.get('passed') is True and proof.get('capEff')=='00000000000000c0' and len(proof.get('checks',[]))==5,'TIMEOUT_PROOF_REPORT_INVALID')
except subprocess.TimeoutExpired:error='TIMEOUT_PROOF_OUTER_TIMEOUT'
except Exception as e:error=str(e) if re.fullmatch('TIMEOUT_PROOF_[A-Z_]+',str(e)) else 'TIMEOUT_PROOF_UNCONFIRMED'
finally:
 try:
  (base/'stdout.private').write_bytes(stdout);(base/'stderr.private').write_bytes(stderr);os.chmod(base/'stdout.private',0o600);os.chmod(base/'stderr.private',0o600);private_logs_saved=True
 except Exception:error='TIMEOUT_PROOF_PRIVATE_LOG_SAVE_FAILED'
 try:
   observed=subprocess.run([docker,'inspect','--type','container',name],capture_output=True,text=True,timeout=10)
   if observed.returncode!=0:
    need(confirmed_absent(name),'TIMEOUT_PROOF_CLEANUP_UNCONFIRMED');removed=True
   else:
    state=json.loads(observed.stdout)[0];labels=state.get('Config',{}).get('Labels',{});mounts=state.get('Mounts',[]);created=True
    need(state.get('Image')==actual and labels.get('jarvis.validation.role')=='r24-timeout-proof' and labels.get('jarvis.validation.attempt')==p['id'] and state.get('HostConfig',{}).get('NetworkMode')=='none' and len(mounts)==1 and mounts[0].get('Source')==str(base) and mounts[0].get('Destination')=='/tools' and mounts[0].get('RW') is False,'TIMEOUT_PROOF_CLEANUP_SCOPE_INVALID')
    stop=subprocess.run([docker,'rm','--force',name],capture_output=True,timeout=20);need(stop.returncode==0,'TIMEOUT_PROOF_CLEANUP_FAILED')
    absent=subprocess.run([docker,'inspect','--type','container',name],capture_output=True,text=True,timeout=10);removed=absent.returncode!=0 and confirmed_absent(name);need(removed,'TIMEOUT_PROOF_CLEANUP_UNCONFIRMED')
 except Exception:error='TIMEOUT_PROOF_CLEANUP_UNCONFIRMED'
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':p['id'],'imageReference':p['image']['reference'],'imageId':actual,'sourceFingerprints':[{'name':v['name'],'sha256':v['sha256']} for v in p['files']],
 'proof':proof,'exitCode':exit_code,'stderrMetadata':{'sha256':hashlib.sha256(stderr).hexdigest(),'bytes':len(stderr)},'stdoutMetadata':{'sha256':hashlib.sha256(stdout).hexdigest(),'bytes':len(stdout)},'errorCode':error,
 'containerCreated':created,'containerRemoved':removed,'createOutcomeAmbiguous':create_ambiguous,'privateLogsSaved':private_logs_saved,'passed':bool(proof and not error and removed and private_logs_saved),'network':'none','productionOrSourceChanged':False,'installed':False,'rawLogsExported':False,'modelInvoked':False,'productAcceptance':False}
(base/'result.json').write_text(json.dumps(result,indent=2)+'\n');os.chmod(base/'result.json',0o600)
print(json.dumps(result))
`),true,{timeoutMs:120000}));}catch(error){result={at:new Date().toISOString(),id,errorCode:'TIMEOUT_PROOF_REMOTE_UNCONFIRMED',passed:false,installed:false,modelInvoked:false,rawLogsExported:false,remoteReconciliationRequired:true};}
const output=dir+'/timeout-linux-proof-'+id+'.json';await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,...result}));if(!result.passed)process.exitCode=1;
