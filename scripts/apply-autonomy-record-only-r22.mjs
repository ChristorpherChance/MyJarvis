/** Apply the user's no-fee-limit decision to this project's 18 native executors. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const directory='artifacts/software-factory/autonomy-r22';
const preparation=JSON.parse(await readFile(directory+'/preparation.json','utf8'));
const installed=JSON.parse(await readFile(directory+'/validator-installation.json','utf8'));
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex');
const templates=preparation.templates.map(old=>{
 const args=[];for(let i=0;i<old.args.length;i++){if(old.args[i]==='--max-budget-usd'){i++;continue;}if(old.args[i].startsWith('--max-budget-usd='))continue;args.push(old.args[i]);}
 return {...old,args,validation:{...old.validation,args:[...old.validation.args.slice(0,-1),installed.goalSpecHash]},supervision:{...old.supervision,billing:'record-only'}};
});
const execute=process.argv.includes('--execute');
const payload={execute,old:preparation.templates,templates};
const result=await withPlatform(async({api})=>{
 if((await api('/api/health')).build!=='20261011-project-autonomy-r22-2')throw Error('RECORD_ONLY_EXPECTED_RELEASE_MISSING');
 const central=(await api('/api/v1/execution/config')).data;
 for(const old of preparation.templates){const current=central.templates.find(t=>t.id===old.id),next=templates.find(t=>t.id===old.id);if(!current||![sha(old),sha(next)].includes(sha(current)))throw Error('RECORD_ONLY_CENTRAL_CAS_CONFLICT');}
 if(!execute)return {ready:true,executors:templates.length,execute:false};
 const node=JSON.parse(remote(lanProfile,'jarvis-101',python(payload,String.raw`import os,stat,hashlib,tempfile,subprocess,time,sqlite3,shutil
from pathlib import Path
config=Path('/var/lib/jarvis-development/101/config.json');s=config.lstat()
if stat.S_ISLNK(s.st_mode) or not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_mode&0o077:raise RuntimeError('RECORD_ONLY_PRIVATE_CONFIG_UNSAFE')
raw=config.read_bytes();value=json.loads(raw);old={t['id']:t for t in p['old']};new={t['id']:t for t in p['templates']}
if value.get('agentId')!='0b5aea06-47e1-4f4b-a32e-969417915c9c' or value.get('machineId')!='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73':raise RuntimeError('RECORD_ONLY_NODE_IDENTITY_CHANGED')
canonical=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
for t in value['templates']:
 if t['id'] in old and canonical(t) not in [canonical(old[t['id']]),canonical(new[t['id']])]:raise RuntimeError('RECORD_ONLY_LOCAL_CAS_CONFLICT')
if set(old)-{t['id'] for t in value['templates']}:raise RuntimeError('RECORD_ONLY_LOCAL_TEMPLATE_MISSING')
unit='jarvis-software-factory-development.service';base=Path('/opt/jarvis-development/software-factory')
if 'record-only' not in (base/'jarvis-node.mjs').read_text():raise RuntimeError('RECORD_ONLY_NODE_BUNDLE_NOT_UPGRADED')
spool=config.parent/('.delivery-'+value['agentId'])/'journal.sqlite'
c=sqlite3.connect('file:'+str(spool)+'?mode=ro',uri=True)
try:
 if c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0] or c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0]:raise RuntimeError('RECORD_ONLY_NODE_NOT_IDLE')
finally:c.close()
backup=Path('/var/lib/jarvis-control/autonomy-r22/node-config-before-record-only.json')
if not backup.exists():
 fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(raw)
subprocess.run(['systemctl','stop',unit],check=True,capture_output=True,timeout=20)
try:
 value['templates']=[new.get(t['id'],t) for t in value['templates']]
 fd,temp=tempfile.mkstemp(prefix='.r22-cost-',dir=config.parent)
 with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
 os.chown(temp,s.st_uid,s.st_gid);os.chmod(temp,0o600);os.replace(temp,config)
 subprocess.run(['systemctl','start',unit],check=True,capture_output=True,timeout=20)
 for attempt in range(20):
  state=dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show',unit,'--property=ActiveState,MainPID'],text=True).splitlines())
  c=sqlite3.connect('file:'+str(spool)+'?mode=ro',uri=True);owner=c.execute('SELECT pid FROM process_owner WHERE id=1').fetchone();c.close()
  if state['ActiveState']=='active' and owner and owner[0]==int(state['MainPID']):break
  if attempt==19:raise RuntimeError('RECORD_ONLY_NODE_START_FAILED')
  time.sleep(1)
except:
 config.write_bytes(raw);os.chmod(config,0o600);subprocess.run(['systemctl','restart',unit],capture_output=True,timeout=20);raise
print(json.dumps({'configured':True,'executors':len(new),'pairedIdentityPreserved':True,'oldExecutorUnchanged':True,'nativeUSDFlagsRemoved':True,'privateCredentialsExported':False,'modelCalls':0,'unit':state}))
`),true,{timeoutMs:90000}));
 const updated=central.templates.map(t=>templates.find(n=>n.id===t.id)??t);
 const receipt=(await api('/api/v1/execution/config',{expectedVersion:central.revision,templates:updated,probes:central.probes??[],wol:central.wol??[]},'PUT')).data;
 for(const next of templates){const readback=receipt.templates.find(t=>t.id===next.id);if(!readback||sha(readback)!==sha(next))throw Error('RECORD_ONLY_READBACK_CHANGED');}
 return {at:new Date().toISOString(),configured:true,release:'20261011-project-autonomy-r22-2',goalSpecHash:installed.goalSpecHash,costPolicy:'record-only',executors:templates.length,node,centralRevision:receipt.revision,templates,globalSupervision:(await api('/api/v1/execution/supervision')).data.supervised};
});
await writeFile(directory+'/record-only-executors.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({execute,configured:result.configured,executors:result.executors,costPolicy:result.costPolicy,globalSupervision:result.globalSupervision}));
