/** Read-only field-path/hash comparison; no private configuration values exported. */
import {readFile,writeFile} from 'node:fs/promises';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const path='artifacts/software-factory/autonomy-r22/fixed-validator-executors.json';
const report=JSON.parse(await readFile(path,'utf8'));
if(!/^[a-f0-9-]{36}$/.test(report.operationId))throw Error('FIXED_DIAGNOSTIC_OPERATION_INVALID');
const result=JSON.parse(remote(lanProfile,'jarvis-101',python({operationId:report.operationId,validators:report.templates},String.raw`import os,stat,hashlib,subprocess,sqlite3,re
from pathlib import Path
def need(ok,code):
 if not ok:raise RuntimeError(code)
def safe(q,directory=False,root=False,private=False):
 s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)),'DIAGNOSTIC_PATH_UNSAFE')
 need(not root or s.st_uid==0,'DIAGNOSTIC_ROOT_OWNER_INVALID');need(not s.st_mode&(0o077 if private else 0o022),'DIAGNOSTIC_PATH_MODE_INVALID')
 if not directory:need(s.st_nlink==1,'DIAGNOSTIC_HARDLINK_INVALID')
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
def rawsha(v):return hashlib.sha256(v).hexdigest()
def paths(a,b,prefix=''):
 if type(a)!=type(b):return [prefix or '$']
 if isinstance(a,dict):
  out=[]
  for k in sorted(set(a)|set(b)):
   name=(prefix+'.' if prefix else '')+k
   if k not in a or k not in b:out.append(name)
   else:out.extend(paths(a[k],b[k],name))
  return out
 if isinstance(a,list):
  if len(a)!=len(b):return [prefix+'.length']
  return [v for i,(x,y) in enumerate(zip(a,b)) for v in paths(x,y,prefix+'['+str(i)+']')]
 return [] if a==b else [prefix]
try:
 config=Path('/var/lib/jarvis-development/101/config.json');safe(config,private=True)
 for q in [config.parent,*config.parent.parents]:safe(q,True,True)
 folder=Path('/var/lib/jarvis-control/autonomy-r22')/('fixed-validator-r22-3-'+p['operationId'])
 for q in [folder,*folder.parents]:safe(q,True,True,private=q==folder)
 values={};raws={}
 for name,q in [('actual',config),('expectedAfter',folder/'config-expected-after.json'),('before',folder/'config-before.json')]:
  safe(q,root=name!='actual',private=True);raws[name]=q.read_bytes();values[name]=json.loads(raws[name])
 safe(folder/'state.json',root=True,private=True);state=json.loads((folder/'state.json').read_bytes())
 actual=values['actual'];expected=values['expectedAfter'];before=values['before']
 need(actual.get('agentId')=='0b5aea06-47e1-4f4b-a32e-969417915c9c' and actual.get('machineId')=='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73','DIAGNOSTIC_IDENTITY_CHANGED')
 identity_fields=['agentId','machineId','privateKey','publicKey','apiUrl']
 hashes={name:{'rawSHA256':rawsha(raws[name]),'semanticSHA256':sha(cfg),'nonTemplateSHA256':sha({k:v for k,v in cfg.items() if k!='templates'}),'templateHashes':{t['id']:sha(t) for t in cfg.get('templates',[])}} for name,cfg in values.items()}
 u=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,MainPID,User,ControlGroup'],text=True,timeout=10).splitlines() if '=' in x)
 spool=config.parent/('.delivery-'+actual['agentId']);safe(spool,True,private=True);db=spool/'journal.sqlite';safe(db,private=True)
 c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10)
 try:
  owner=c.execute('SELECT pid,process_identity FROM process_owner WHERE id=1').fetchone();pid=int(u.get('MainPID','0'));current_identity=None
  if pid>0:
   body=Path('/proc/'+str(pid)+'/stat').read_text();current_identity=Path('/proc/sys/kernel/random/boot_id').read_text().strip()+':'+body[body.rfind(')')+2:].split()[19]
  journal={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0],'identityMatches':c.execute('SELECT agent_id,machine_id FROM identity').fetchone()==(actual['agentId'],actual['machineId']),'pidAndBootStartIdentityMatches':bool(owner and pid>0 and owner[0]==pid and owner[1]==current_identity)}
 finally:c.close()
 print(json.dumps({'at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'readOnly':True,'hashes':hashes,'actualVsExpectedChangedPaths':paths(expected,actual),'actualVsBeforeChangedPaths':paths(before,actual),'actualAndExpectedSemanticallyEqual':sha(actual)==sha(expected),'rawSerializationChangedOnly':sha(actual)==sha(expected) and rawsha(raws['actual'])!=rawsha(raws['expectedAfter']),'pairingAndAPIFieldsPreserved':all(actual.get(k)==before.get(k) for k in identity_fields),'validatorHashesMatch':all(hashes['actual']['templateHashes'].get(t['id'])==sha(t) for t in p['validators']),'beforeBackupHashMatchesState':rawsha(raws['before'])==state['oldSHA256'],'unit':u,'journal':journal,'credentialsExported':False,'modelCalls':0}))
except Exception as error:
 code=str(error) if isinstance(error,RuntimeError) and re.fullmatch('DIAGNOSTIC_[A-Z0-9_]+',str(error)) else 'DIAGNOSTIC_REMOTE_FAILED'
 print(json.dumps({'readOnly':True,'ok':False,'errorCode':code,'credentialsExported':False}))
`),true));
const output='artifacts/software-factory/autonomy-r22/fixed-validator-normalization-diagnosis.json';
await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
