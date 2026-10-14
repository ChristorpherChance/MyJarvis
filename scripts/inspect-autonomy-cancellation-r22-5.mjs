/** Read-only, fixed run-scoped metadata. Never exports model logs, lease tokens or private config. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const runId='111ade66794ad6a5dc7de7318aceb4838449934b';
const taskId='30d37bfa-6bf5-4ca7-8167-89a5df5be091';
const central=JSON.parse(remote(lanProfile,'jarvis-112',python({runId,taskId},String.raw`import json,sqlite3,hashlib,datetime,subprocess
from pathlib import Path
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
try:
 row=c.execute('SELECT id,object_id,machine_id,executor_id,status,json,agent_id,lease_expires,created_at,updated_at FROM execution_runs WHERE id=?',(p['runId'],)).fetchone()
 if row is None or row['object_id']!=p['taskId']:raise RuntimeError('DIAG_FIXED_RUN_BINDING_MISMATCH')
 data=json.loads(row['json']);result=data.get('result') or {};reason=data.get('stopReason')
 known=['自治根目录执行的项目级授权已失效','任务已停止或被替换','任务或项目已不存在','平台急停','急停或管理员停止']
 deliveries=[]
 for d in c.execute('SELECT delivery_id,kind,body_sha,created_at,usage_reconciled FROM execution_deliveries WHERE run_id=? ORDER BY created_at',(p['runId'],)):
  deliveries.append(dict(d))
 late=c.execute('SELECT count(*) FROM execution_late_results WHERE run_id=?',(p['runId'],)).fetchone()[0]
 print(json.dumps({'readOnly':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'run':{k:row[k] for k in ['id','object_id','machine_id','executor_id','status','agent_id','lease_expires','created_at','updated_at']},'request':{'stopRequested':data.get('stopRequested',False),'centralStopReason':reason if reason in known else None,'centralStopReasonSHA256':hashlib.sha256(str(reason).encode()).hexdigest() if reason else None,'sessionIdPresent':bool(data.get('sessionId'))},'result':{'outcome':result.get('outcome'),'exitCode':result.get('exitCode'),'rounds':result.get('rounds'),'source':result.get('source'),'at':result.get('at'),'stopReason':result.get('stopReason'),'sessionIdPresent':bool(result.get('sessionId')),'validationPresent':bool(result.get('validation')),'usage':result.get('usage'),'lateEvidenceOnly':result.get('lateEvidenceOnly',False)},'deliveries':deliveries,'lateResultCount':late,'rawModelLogsExported':False,'credentialsExported':False}))
finally:c.close()
`),true));
const node=JSON.parse(remote(lanProfile,'jarvis-101',python({runId},String.raw`import json,sqlite3,datetime,hashlib,subprocess
from pathlib import Path
config=Path('/var/lib/jarvis-development/101/config.json');cfg=json.loads(config.read_bytes());agent=cfg['agentId']
if agent!='0b5aea06-47e1-4f4b-a32e-969417915c9c':raise RuntimeError('DIAG_NODE_IDENTITY_CHANGED')
db=config.parent/('.delivery-'+agent)/'journal.sqlite';c=sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=10);c.row_factory=sqlite3.Row
try:
 row=c.execute('SELECT id,status,checkpoint,stopped_at,stop_code,stop_detail FROM runs WHERE id=?',(p['runId'],)).fetchone()
 if row is None:raise RuntimeError('DIAG_NODE_RUN_MISSING')
 checkpoint=json.loads(row['checkpoint']) if row['checkpoint'] else {}
 events=[{'at':x['at'],'code':x['code'],'detailCode':x['detail'] if __import__('re').fullmatch('[A-Z0-9_]{1,120}',x['detail']) else None,'detailSHA256':hashlib.sha256(x['detail'].encode()).hexdigest() if x['detail'] else None} for x in c.execute('SELECT at,code,detail FROM events WHERE run_id=? ORDER BY id',(p['runId'],))]
 deliveries=[{k:x[k] for k in ['id','kind','status','attempts','error_code','body_sha']} for x in c.execute('SELECT id,kind,status,attempts,error_code,body_sha FROM deliveries WHERE run_id=? ORDER BY rowid',(p['runId'],))]
 final=c.execute("SELECT body FROM deliveries WHERE run_id=? AND kind='result'",(p['runId'],)).fetchone();body=json.loads(final['body']) if final else {}
 unit=dict(x.split('=',1) for x in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,MainPID'],text=True,timeout=10).splitlines() if '=' in x)
 summary={'unresolvedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0],'unconfirmedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0],'pendingLogs':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
 print(json.dumps({'readOnly':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'run':{k:row[k] for k in ['id','status','stopped_at','stop_code']},'checkpoint':{'rounds':checkpoint.get('rounds'),'sessionIdPresent':bool(checkpoint.get('sessionId')),'sessionBillingPresent':bool(checkpoint.get('sessionBilling')),'usage':checkpoint.get('usage')},'events':events,'deliveries':deliveries,'retainedFinalBody':{'outcome':body.get('outcome'),'stopReason':body.get('stopReason'),'sessionIdPresent':bool(body.get('sessionId'))},'unit':unit,'journal':summary,'rawModelLogsExported':False,'credentialsExported':False}))
finally:c.close()
`),true));
const sources=[];for(const path of ['apps/api/src/app.ts','apps/api/src/runtime/execution-runtime.ts','apps/api/src/runtime/project-autonomy-runtime.ts','apps/api/src/runtime/agent-runner.ts','apps/api/src/runtime/agent-delivery-journal.ts']){const bytes=await readFile(path);sources.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});}
const report={schemaVersion:1,kind:'autonomy-cancellation-readonly-diagnosis',at:new Date().toISOString(),runId,taskId,central,node,sourceFingerprints:sources,actions:{remoteReadOnly:true,modelCalls:0,taskRecovery:false,restarts:false,remoteMutations:false},limitation:'Shutdown causal chain is inferred only after combining actual stop metadata with source; timing alone is insufficient.'};
const output='artifacts/software-factory/autonomy-r22/cancellation-diagnosis-r22-5.json';await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,sha256:createHash('sha256').update(await readFile(output)).digest('hex'),central:central.request,result:central.result,node:node.run,events:node.events,journal:node.journal}));
