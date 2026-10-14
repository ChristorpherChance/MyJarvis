/** Read actual installed fixed gates and configuration; no product verdict or dispatch. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const dir='artifacts/software-factory/autonomy-r22';
const release='20261011-project-autonomy-r22-3';
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const read=async p=>JSON.parse(await readFile(dir+'/'+p,'utf8'));
const base=await read('adapter-install-manifest-r6-install-r2.json');
const r7=await read('adapter-install-manifest-r7.json');
const phase=await read('phase-install-manifest.json');
const installed=await read('validator-installation.json');
const files=[...base.files.map(x=>r7.files.find(y=>y.installedPath===x.installedPath)??x),...phase.files];
for(const f of files)if(sha(await readFile(f.path))!==f.sha256)throw Error('READINESS_LOCAL_SOURCE_CHANGED');
const policies=Object.entries(phase.phasePolicies).map(([workPackage,p])=>({workPackage,path:p.installedPolicyPath,sha256:p.expectedOldPolicySha256,expectedChecks:p.expectedChecks}));
if(policies.length!==9||phase.goalSpecHash!==installed.goalSpecHash)throw Error('READINESS_POLICY_BINDING_CHANGED');
const actual=JSON.parse(remote(lanProfile,'jarvis-101',python({files,policies,goal:installed.goalSpecHash,workspace:installed.workspace},String.raw`import stat,hashlib,subprocess,datetime
from pathlib import Path
def need(ok,code):
 if not ok:raise RuntimeError(code)
def trusted(q):
 s=q.lstat();need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022,'READINESS_FILE_UNTRUSTED')
 for t in q.parents:
  a=t.lstat();need(stat.S_ISDIR(a.st_mode) and a.st_uid==0 and not a.st_mode&0o022,'READINESS_PARENT_UNTRUSTED')
 return q.read_bytes()
rows=[]
for f in p['files']:
 raw=trusted(Path(f['installedPath']));h=hashlib.sha256(raw).hexdigest();need(h==f['sha256'],'READINESS_REMOTE_FILE_CHANGED');rows.append({'path':f['installedPath'],'sha256':h,'bytes':len(raw)})
policy_rows=[]
for f in p['policies']:
 raw=trusted(Path(f['path']));h=hashlib.sha256(raw).hexdigest();v=json.loads(raw)
 need(h==f['sha256'] and v['workspace']==p['workspace'] and v['goalSpecHash']==p['goal'] and v['workPackage']==f['workPackage'] and v['expectedChecks']==f['expectedChecks'],'READINESS_REMOTE_POLICY_CHANGED')
 policy_rows.append({'workPackage':f['workPackage'],'sha256':h,'expectedChecks':v['expectedChecks']})
config=Path('/var/lib/jarvis-development/101/config.json');s=config.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and not s.st_mode&0o077,'READINESS_PRIVATE_CONFIG_UNTRUSTED');cfg=json.loads(config.read_bytes())
need(cfg['agentId']=='0b5aea06-47e1-4f4b-a32e-969417915c9c' and cfg['machineId']=='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73','READINESS_NODE_IDENTITY_CHANGED')
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
node=[{'id':t['id'],'sha256':digest(t)} for t in cfg['templates'] if t['id'].startswith('msf-autonomy-fa-')]
unit=subprocess.run(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,MainPID,User'],capture_output=True,text=True,check=True,timeout=10)
u=dict(line.split('=',1) for line in unit.stdout.splitlines() if '=' in line);need(u.get('ActiveState')=='active' and int(u.get('MainPID','0'))>0 and u.get('User')=='superopen','READINESS_NODE_NOT_RUNNING')
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':rows,'policies':policy_rows,'node':{'pairedIdentityPreserved':True,'templateHashes':node,'unit':u},'modelCalls':0,'productTestsRun':False,'productAccepted':False}))
`),true,{timeoutMs:60000}));
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');if(health.build!==release)throw Error('READINESS_RELEASE_CHANGED');
 if((await api('/api/v1/execution/supervision')).data.supervised!==false)throw Error('READINESS_GLOBAL_SUPERVISION_CHANGED');
 const config=(await api('/api/v1/execution/config')).data;
 const rows=[];
 for(const p of policies)for(const role of ['worker','reviewer','validator']){
  const id='msf-autonomy-'+p.workPackage.toLowerCase()+'-'+role;
  const t=config.templates.find(x=>x.id===id),n=actual.node.templateHashes.find(x=>x.id===id);
  if(!t||!n||sha(canonical(t))!==n.sha256||t.machineId!=='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73')throw Error('READINESS_TEMPLATE_MISMATCH');
  const v=t.validation;if(!v||v.program!=='/usr/bin/sudo'||JSON.stringify(v.args)!==JSON.stringify(['-n','/usr/local/libexec/jarvis-project-autonomy-validation','{workspace}','{runId}',p.workPackage,installed.goalSpecHash]))throw Error('READINESS_FIXED_GATE_CHANGED');
  if(role==='validator'){
   if(t.engine!=='fixed'||t.purpose!=='project-autonomy-validation'||t.program!=='/usr/bin/true'||t.args.length||t.maxRounds!==1)throw Error('READINESS_VALIDATOR_CHANGED');
  }else if(t.engine!=='claude'||t.supervision?.billing!=='record-only'||t.args.includes('--max-budget-usd')||t.args[t.args.indexOf('--model')+1]!=='gpt-6.1-sol[1m]')throw Error('READINESS_WORKER_CHANGED');
  rows.push({id,sha256:n.sha256});
 }
 return {schemaVersion:1,kind:'project-autonomy-execution-readiness',at:new Date().toISOString(),release,goalSpecHash:installed.goalSpecHash,workspace:installed.workspace,allPhaseFixedChecksReady:true,completePhaseAcceptanceProducersReady:false,policies:actual.policies,files:actual.files,node:actual.node,central:{revision:config.revision,templates:rows},globalSupervision:false,costPolicy:'record-only',modelCalls:0,productAccepted:false,pending:['14 complete trusted acceptance producers','real product evidence and current-version final acceptance','72-hour continuous observation','native paused-generation recovery interface']};
});
await writeFile(dir+'/execution-readiness-r22-3.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({allPhaseFixedChecksReady:true,completePhaseAcceptanceProducersReady:false,templates:27,files:result.files.length,policies:9,modelCalls:0,productAccepted:false}));
