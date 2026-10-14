/** One explicitly approved factory agent gains only installed project executors. */
import {readFile,writeFile} from 'node:fs/promises';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const phase=process.argv.includes('--all')?'all':'FA-01';
const report=JSON.parse(await readFile('artifacts/software-factory/autonomy-r22/validator-installation.json','utf8'));
if(!report.installed||phase==='all'&&!report.allPhaseAdaptersReady)throw Error('AUTONOMY_ADAPTERS_NOT_INSTALLED');
const ids=report.policies.filter(p=>phase==='all'||p.workPackage===phase).flatMap(p=>['worker','reviewer'].map(role=>'msf-autonomy-'+p.workPackage.toLowerCase()+'-'+role));
const execute=process.argv.includes('--execute');
const result=JSON.parse(remote(lanProfile,'jarvis-112',python({ids,phase,execute},String.raw`import sqlite3,hashlib,os,datetime
from pathlib import Path
db='/var/lib/jarvis/data/execution/execution.sqlite';agent='0b5aea06-47e1-4f4b-a32e-969417915c9c';machine='b737bb02-1ad7-48e8-8c8a-00fdfb44ef73'
c=sqlite3.connect(db,timeout=10);c.row_factory=sqlite3.Row
c.execute('BEGIN IMMEDIATE')
try:
 row=c.execute('SELECT * FROM execution_agents WHERE id=?',(agent,)).fetchone()
 if not row or row['machine_id']!=machine or row['revoked']:raise RuntimeError('AUTONOMY_AGENT_IDENTITY_CHANGED')
 old=json.loads(row['capabilities']);allowed=['msf-101-claude','telemetry']+['msf-autonomy-fa-'+str(i).zfill(2)+'-'+role for i in range(1,10) for role in ['worker','reviewer']]
 if any(i not in allowed for i in old+p['ids']):raise RuntimeError('AUTONOMY_CAPABILITY_SCOPE_CHANGED')
 added=[i for i in p['ids'] if i not in old];new=old+added
 if p['execute'] and added:
  root=Path('/var/lib/jarvis-control/autonomy-r22');root.mkdir(mode=0o700,exist_ok=True)
  name=root/('capabilities-before-'+p['phase']+'.json')
  fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w') as f:json.dump({'agentId':agent,'machineId':machine,'before':old,'after':new},f)
  c.execute('UPDATE execution_agents SET capabilities=? WHERE id=? AND capabilities=? AND revoked=0',(json.dumps(new),agent,row['capabilities']))
 c.commit()
 print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'agentId':agent,'machineId':machine,'phase':p['phase'],'execute':p['execute'],'added':added,'capabilities':new,'pairedIdentityPreserved':True,'privateKeyChanged':False,'globalSupervisionChanged':False}))
except:c.rollback();raise
finally:c.close()
`),true));
if(execute)await withPlatform(async({api})=>{const caps=(await api('/api/v1/execution/capabilities')).data;result.readback=caps.configuredTemplates.filter(t=>ids.includes(t.id));if(result.readback.length!==ids.length||result.readback.some(t=>!t.ready))throw Error('AUTONOMY_CAPABILITY_READBACK_NOT_READY');});
await writeFile('artifacts/software-factory/autonomy-r22/executor-authorization-'+phase+'.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
