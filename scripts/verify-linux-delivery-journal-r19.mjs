/** No-model Linux checks in an isolated private fixture, using the deployed compiled module. */
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const code=String.raw`import assert from 'node:assert/strict';
import {AgentDeliveryJournal} from './apps/api/dist/runtime/agent-delivery-journal.js';
import {DatabaseSync} from 'node:sqlite';
import {statSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[1],directory=join(root,'private');
const a=new AgentDeliveryJournal(directory,'linux-fixture-agent','linux-fixture-machine');
assert.equal(statSync(directory).mode&0o777,0o700);assert.equal(statSync(a.databasePath).mode&0o777,0o600);
assert.throws(()=>new AgentDeliveryJournal(directory,'linux-fixture-agent','linux-fixture-machine'),/AGENT_JOURNAL_PROCESS_ALREADY_ACTIVE/);
const db=new DatabaseSync(a.databasePath),owner=db.prepare('SELECT pid,process_identity FROM process_owner WHERE id=1').get();
const start=readFileSync('/proc/'+process.pid+'/stat','utf8');
const identity=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()+':'+start.slice(start.lastIndexOf(')')+2).trim().split(/\s+/)[19];
assert.equal(owner.pid,process.pid);assert.equal(owner.process_identity,identity);
a.close();db.prepare('INSERT INTO process_owner(id,pid,token,process_identity) VALUES(1,?,?,?)').run(process.pid,'stale-fixture-token','different-boot:1');db.close();
const b=new AgentDeliveryJournal(directory,'linux-fixture-agent','linux-fixture-machine');b.close();
console.log(JSON.stringify({passed:true,platform:process.platform,checks:{privatePermissions:true,liveOwnerMutualExclusion:true,actualBootAndStartIdentity:true,reusedPidEvidenceReconciled:true},modelCalls:0,nativeProcessesStarted:0,businessDatabaseOpened:false,physicalCrashResumeTested:false}));
`;
const report=JSON.parse(primary(python({code},String.raw`import tempfile,subprocess,shutil
from pathlib import Path
base=Path('/var/lib/jarvis-control').resolve();root=Path(tempfile.mkdtemp(prefix='journal-r19-',dir=base))
if root.parent.resolve()!=base or not root.name.startswith('journal-r19-') or root.is_symlink():raise RuntimeError('LINUX_FIXTURE_SCOPE_INVALID')
try:
 if Path('/opt/jarvis/current').resolve().name!='20261010-autonomous-voice-r19-1':raise RuntimeError('LINUX_FIXTURE_BUILD_NOT_LIVE')
 r=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code'],str(root)],cwd='/opt/jarvis/current',capture_output=True,text=True,timeout=20)
 if r.returncode:raise RuntimeError('LINUX_FIXTURE_ASSERTION_FAILED')
 value=json.loads(r.stdout);value['fixtureRemoved']=True;print(json.dumps(value))
finally:
 if root.resolve().parent!=base or root.is_symlink():raise RuntimeError('LINUX_FIXTURE_CLEANUP_SCOPE_INVALID')
 shutil.rmtree(root)
`)));
await mkdir('artifacts/unattended-r19',{recursive:true});
await writeFile('artifacts/unattended-r19/linux-journal-verification.json',JSON.stringify({at:new Date().toISOString(),...report},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
