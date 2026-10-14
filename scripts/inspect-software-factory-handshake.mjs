/** Read only the bounded verification task/run; do not dispatch or expose logs. */
import {readFile} from 'node:fs/promises';
import {withPlatform,primary,python,remote,lanProfile} from './managed-server-client.mjs';
const evidence=JSON.parse(await readFile('artifacts/software-factory/node/managed-execution-r18-1.json','utf8'));
await withPlatform(async({api})=>{
 const task=(await api('/api/v1/tasks/'+evidence.taskId)).data;
 let run;
 try{const r=(await api('/api/v1/execution/runs/'+evidence.runId)).data;run={id:r.id,status:r.status,agentId:r.agentId??null,projectId:r.projectId,taskId:r.taskId,executorId:r.executorId};}
 catch(e){run={readError:/^API_\d+/.exec(e.message)?.[0]??'READ_FAILED'};}
 const q=JSON.parse(primary(python({runId:evidence.runId,taskId:evidence.taskId},`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True);c.row_factory=sqlite3.Row
try:
 rows=[dict(r) for r in c.execute("SELECT id,status,machine_id,executor_id,agent_id FROM execution_runs WHERE id=? OR object_id=?",(p['runId'],p['taskId']))]
 active=c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN ('queued','running')").fetchone()[0]
 print(json.dumps({'rows':rows,'allActive':active,'readOnly':True}))
finally:c.close()
`)));
 const unit=JSON.parse(remote(lanProfile,'jarvis-101',python({},`import subprocess,json
r=subprocess.run(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,Result,MainPID,ExecMainStatus'],capture_output=True,text=True,timeout=10)
print(json.dumps(dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)))
`),true));
 console.log(JSON.stringify({task:{id:task.id,revision:task.revision,status:task.status,ownerId:task.ownerId,scope:task.scope,agent:task.agent,executionStatus:task.executionStatus??null,requestId:task.executionRequest?.id??null},run,queue:q,unit}));
});
