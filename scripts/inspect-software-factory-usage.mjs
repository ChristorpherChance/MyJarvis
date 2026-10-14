import {remote,lanProfile,withPlatform,primary} from './managed-server-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const node=JSON.parse(remote(lanProfile,'jarvis-101',`import json,subprocess
from pathlib import Path
r=subprocess.run(['systemctl','show','jarvis-msf-usage.service','--property=ActiveState,SubState,Result,ExecMainStatus'],capture_output=True,text=True,timeout=5)
timer=subprocess.run(['systemctl','is-active','jarvis-msf-usage.timer'],capture_output=True,text=True,timeout=5)
journal=subprocess.run(['journalctl','-u','jarvis-msf-usage.service','-n','20','--no-pager','-o','cat'],capture_output=True,text=True,timeout=5)
receipt=None
allowed=['files','liveFiles','malformedLines','foreignFiles','records','submitted','previouslyRecorded','waitingForStableReceipts','changedReceipts','needsReview','ok','code']
for line in journal.stdout.splitlines():
 try:
  data=json.loads(line)
  if isinstance(data,dict):receipt={k:v for k,v in data.items() if k in allowed and isinstance(v,(int,float,bool,str))}
 except:pass
state=Path('/var/lib/jarvis-development/101/usage/receipts.json')
checkpoint=None
if state.is_file() and not state.is_symlink():
 data=json.loads(state.read_text());checkpoint={'mode':oct(state.stat().st_mode&0o777),'recordCount':len(data.get('receipts',{})),'pendingCount':len(data.get('pendingSnapshots',{})),'updatedAt':data.get('updatedAt')}
print(json.dumps({'timerActive':timer.stdout.strip()=='active','service':dict(v.split('=',1) for v in r.stdout.splitlines() if '=' in v),'lastReceipt':receipt,'checkpoint':checkpoint,'transcriptsReturned':False}))
`,true));
const legacy=JSON.parse(primary(`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True)
print(json.dumps({'unreportedWithoutUnknownRows':c.execute("SELECT COUNT(*) FROM runtime_ai_unreported u WHERE NOT EXISTS (SELECT 1 FROM runtime_ai_usage a WHERE a.run_id=u.run_id AND a.measurement_status='unknown')").fetchone()[0]}))
`));
const platform=await withPlatform(async({api})=>{
 const all=await api('/api/runtime/governance/usage/summary'),project=await api('/api/runtime/governance/usage/summary?projectId=70ec346f-6520-46ed-abed-22cac770a3e4');
 const external=await api('/api/runtime/governance/usage?source=external-cli&projectId=70ec346f-6520-46ed-abed-22cac770a3e4&limit=25');
 return {all:all.totals,project:project.totals,externalRecords:external.total,sourceIdsUnique:new Set(external.items.map(i=>i.source_record_id)).size===external.items.length,currency:all.currency,invoicesConnected:external.invoicesConnected};
});
await mkdir('artifacts/software-factory',{recursive:true});const result={at:new Date().toISOString(),node,platform,legacy};await writeFile('artifacts/software-factory/usage-observer-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
