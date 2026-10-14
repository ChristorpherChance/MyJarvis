/** Full-table operational counts, without prompts, credentials or execution logs. */
import {primary} from './managed-server-client.mjs';
import {writeFile} from 'node:fs/promises';
const result=JSON.parse(primary(`import sqlite3,json,datetime
c=sqlite3.connect('file:/var/lib/jarvis/data/execution/execution.sqlite?mode=ro',uri=True)
try:
 all_active=c.execute("SELECT COUNT(*) FROM execution_runs WHERE status IN ('queued','running')").fetchone()[0]
 factory_active=c.execute("SELECT COUNT(*) FROM execution_runs WHERE machine_id=? AND executor_id=? AND status IN ('queued','running')",('b737bb02-1ad7-48e8-8c8a-00fdfb44ef73','msf-101-claude')).fetchone()[0]
 print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'allActive':all_active,'factoryActive':factory_active,'fullTable':True,'readOnly':True}))
finally:c.close()
`));
await writeFile('artifacts/software-factory/node/full-queue-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
