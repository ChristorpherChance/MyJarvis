/** Read-only final reconciliation; no start, restart, model, or product changes. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { withPlatform, remote, lanProfile, python } from './managed-server-client.mjs';
import { nodeState, queueState } from './run-factory-supervision-probe.mjs';
const batchKey = process.argv.find(v => v.startsWith('--batch-key='))?.slice('--batch-key='.length);
if (!batchKey || !/^[a-z][a-z0-9-]{0,63}$/.test(batchKey)) throw Error('MAIN_RESTORATION_BATCH_INVALID');
const directory = 'artifacts/software-factory/acceptance-r24';
const journal = JSON.parse(await readFile('.jarvis-dev/maintenance/factory-main-baseline-r24-' + batchKey + '.json', 'utf8'));
const evidenceBytes = await readFile(directory + '/main-baseline-independent-review-' + batchKey + '.json');
const evidence = JSON.parse(evidenceBytes);
if (journal.batchKey !== batchKey || journal.restored !== true || evidence.taskId !== journal.taskId || evidence.runId !== journal.runId || evidence.restored !== true || evidence.terminalIndependentReadback !== true) throw Error('MAIN_RESTORATION_BINDING_INVALID');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
const sha = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const result = await withPlatform(async ({ api }) => {
 const run = (await api('/api/v1/execution/runs/' + journal.runId)).data;
 if (run.taskId !== journal.taskId || run.projectId !== journal.projectId || run.agentId !== journal.nodeAgentId || run.workspace !== journal.source || run.result?.source !== 'signed-agent' || ['queued', 'running'].includes(run.status)) throw Error('MAIN_RESTORATION_TERMINAL_INVALID');
 const config = (await api('/api/v1/execution/config')).data;
 const profile = (await api('/api/v1/projects/' + journal.projectId + '/autonomy')).data;
 const global = (await api('/api/v1/execution/supervision')).data;
 const node = nodeState(), queue = queueState();
 const quiet = JSON.parse(remote(lanProfile, 'jarvis-101', python({ agentId: journal.nodeAgentId, pid: Number(node.unit.MainPID) }, String.raw`
import datetime,json,sqlite3,stat,subprocess
from pathlib import Path
unit=dict(line.split('=',1) for line in subprocess.check_output(['/usr/bin/systemctl','show','jarvis-software-factory-development.service','--property=ActiveState,SubState,MainPID'],text=True).splitlines() if '=' in line)
pid=int(unit.get('MainPID','0'));children=[]
for q in Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  if int(next(v.split(':',1)[1] for v in (q/'status').read_text().splitlines() if v.startswith('PPid:')))==pid:children.append(int(q.name))
 except (FileNotFoundError,PermissionError,StopIteration):pass
path=Path('/var/lib/jarvis-development/101')/('.delivery-'+p['agentId'])/'journal.sqlite'
s=path.lstat()
if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_nlink!=1 or s.st_uid!=1000 or s.st_mode&0o077:raise RuntimeError('MAIN_RESTORATION_JOURNAL_UNSAFE')
c=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True,timeout=10)
try:
 counts={'unacknowledgedRuns':c.execute("SELECT count(*) FROM runs WHERE status<>'acknowledged'").fetchone()[0], 'unacknowledgedDeliveries':c.execute("SELECT count(*) FROM deliveries WHERE status<>'acknowledged'").fetchone()[0], 'pendingLogRows':c.execute('SELECT count(*) FROM logs').fetchone()[0]}
finally:c.close()
print(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'active':unit.get('ActiveState')=='active' and unit.get('SubState')=='running','pid':pid,'pidMatchesNodeRead':pid==p['pid'],'directChildren':children,'counts':counts,'readOnly':True,'privateRowsExported':False}))
`), true));
 const hashes = Object.fromEntries(Object.keys(profile.templateHashes).map(id => [id, sha(config.templates.find(t => t.id === id) ?? null)]));
 const checks = { signedTerminal: true, originalTemplateCentral: sha(config.templates.find(t => t.id === journal.originalTemplate.id) ?? null) === sha(journal.originalTemplate), originalTemplateNode: sha(node.template) === sha(journal.originalTemplate), sameAgent: node.agentId === journal.nodeAgentId, nodeActive: quiet.active && quiet.pidMatchesNodeRead, frozenTemplatesUnchanged: Object.entries(profile.templateHashes).every(([id, expected]) => hashes[id] === expected), oldProfileUnchanged: sha(profile) === journal.initialProfileSHA256, globalSupervisionStillOff: global.supervised === false && !global.stopped };
 return { schemaVersion: 1, kind: 'software-factory-main-baseline-restoration-readback', at: new Date().toISOString(), batchKey, taskId: journal.taskId, runId: journal.runId, projectId: journal.projectId, source: journal.source, sourceFingerprint: evidence.sourceFingerprint, runStatus: run.status, independentReportSHA256: sha(evidenceBytes), checks, restorationConfirmed: Object.values(checks).every(v => v === true), queue, node: quiet, idleConfirmed: queue.allActive === 0 && quiet.directChildren.length === 0 && Object.values(quiet.counts).every(v => v === 0), frozenTemplateCount: Object.keys(profile.templateHashes).length, originalTemplateSHA256: sha(journal.originalTemplate), readOnly: true, modelCalled: false, originalSourceModified: false, productAccepted: false, privateConfigurationExported: false };
});
const output = directory + '/main-baseline-restoration-readback-' + batchKey + '.json';
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, ...result }));
if (!result.restorationConfirmed || !result.idleConfirmed) process.exitCode = 1;
