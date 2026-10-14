/** Local analysis of fixed process evidence, not a reproduction or repair. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const directory='artifacts/software-factory/acceptance-r24';
const evidencePath=directory+'/candidate-collector-failure-independent-diagnosis.json';
const raw=await readFile(evidencePath),v=JSON.parse(raw),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(v.runId,'1270b64e58032d91585307d19d4a9be04f204eab');assert.equal(v.readOnly,true);assert.equal(v.collector.checks.length,0);assert.equal(v.collector.artifactsCount,0);
const sourceHashes=[];
for(const item of v.programs){const path='scripts/'+item.path.split('/').at(-1),bytes=await readFile(path);assert.equal(sha(bytes),item.sha256);sourceHashes.push({path,sha256:sha(bytes)});}
const durationMs=Date.parse(v.collector.finishedAt)-Date.parse(v.collector.startedAt);
const source=await readFile('scripts/project-autonomy-fa01-coordinator.py','utf8');
assert.match(source,/work\.mkdir\(mode=0o700\)/);assert.match(source,/chown_copy\(work\)/);assert.match(source,/os\.chown\(base, 1000, 1000\)/);
assert.match(source,/'--cap-drop', 'ALL', '--cap-add', 'SETUID', '--cap-add', 'SETGID'/);
const report={
 schemaVersion:1,kind:'software-factory-r24-collector-cause-independent-review',at:new Date().toISOString(),
 runId:v.runId,attempt:v.attempt,sourceFingerprint:v.collector.sourceFingerprint,
 evidence:{path:evidencePath,sha256:sha(raw)},sourceHashes,
 classification:'validation-isolation-harness-failed-before-product-checks',
 verifiedFacts:{collectorDurationMs:durationMs,collectorChecksExecuted:0,collectorArtifacts:0,compileReferences:v.standardErrorMetadata.compileReferences,standardErrnoCaptured:v.standardErrorMetadata.codes,cleanup:v.cleanup,bindDirectories:v.bindDirectories,rawLogsExported:false},
 cause:{
  conclusion:'The fixed copy permission layout denies the UID0/GID0 collector access to the UID1000/GID1000 private /work tree when the container drops all capabilities except SETUID/SETGID.',
  confidence:'high-confidence static inference from exact installed trusted program plus current run directory metadata; original syscall errno was discarded and is not claimed as observed',
  chain:[
   {file:'scripts/project-autonomy-fa01-coordinator.py',operation:'work.mkdir(mode=0o700), copy private source and home, then chown_copy(work) to 1000:1000 without changing 0700 directory/0600 private-file modes'},
   {file:'scripts/project-autonomy-fa01-coordinator.py',operation:'start root collector with cap-drop ALL and only SETUID/SETGID, leaving no DAC read override capability'},
   {file:'scripts/project-autonomy-fa01-collector.mjs',operation:'main first checks its root evidence directory then enumerates manifest(/work/source), before any processCheck(build/typecheck/tests)'},
   {file:'scripts/project-autonomy-fa01-collector.mjs',operation:'outer catch reduces an ordinary filesystem exception to FIXED_CHECK_FAILED and saves empty check/artifact arrays; it does not retain the original errno'},
  ],
 },
 minimalRepairProposal:{
  owner:'trusted isolation adapter; not software-factory business source',
  preferred:'Prepare only the disposable /work source/home copy for UID1000 owner and GID0 group. Give directories owner access plus group r-x (normally0750), and ordinary files owner access plus group r (normally0640, preserving required owner execution bits). The trusted collector remains UID0/GID0; candidate processes remain UID1000/GID1000. Evidence and immutable source snapshots remain root-private.',
  boundaries:['Do not modify the original main or candidate source, protected helper rejection rules, goal/template bindings, real business services or data.','Do not chmod globally or use 0777; changing only the /work parent is insufficient while the source tree/file modes remain private to UID1000.','Prefer the copy group-mode layout to adding a broad DAC capability or elevating the candidate.','A future test changing these modes must fail evidence access rather than silently restoring access or passing.'],
  observability:'Preserve a bounded diagnostic for trusted collector exceptions: allowlisted errno/syscall and controlled /work,/evidence,/tools path, plus digest and size of the original private log. Never export environment, raw stdout or arbitrary exception text.',
  requiredVerification:['Meaningful adapter fixture using real UID0 without DAC capabilities and UID1000 candidate access; confirm root can read candidate bytes and candidate cannot write/read private evidence.','After independently reviewed adapter installation, start a new fixed-only run with a fresh receipt and source binding; preserve this failed run.','Only actual checks/compile diagnostics from the new signed report can establish product failures or batch results.'],
 },
 notEstablished:['The original exact syscall/errno was not retained, so an observed EACCES error is not asserted.','No new product build/typecheck/unit test was executed here.','The candidate product did not pass or fail compilation in this run because those checks never executed.','No repair or retry was performed by this review.'],
 modelsInvoked:0,testsRun:0,remoteChanges:0,productAccepted:false,
};
const output=directory+'/candidate-collector-cause-independent-review.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,sha256:sha(await readFile(output)),classification:report.classification,collectorDurationMs:durationMs,checksExecuted:0,remoteChanges:0}));
