/** Local-only review of a reversible quarantine proposal; this script never moves files. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const directory='artifacts/software-factory/acceptance-r24';
const sourcePath=directory+'/candidate-fixture-source-review.json';
const raw=await readFile(sourcePath),proof=JSON.parse(raw);
assert.equal(proof.readOnly,true);assert.equal(proof.headStable,true);assert.equal(proof.fixtureDirectories,14);assert.equal(proof.symlinks,14);
for(const item of proof.fixtures){assert.match(item.path,/^artifacts\/fa-01\/(?:package|snapshot)-contract-[A-Za-z0-9]{6}$/);assert.equal(item.trackedPathCount,0);assert.equal(item.entries.filter(entry=>entry.kind==='symlink').length,1);}
const report={
 schemaVersion:1,kind:'software-factory-r24-fixture-quarantine-independent-review',at:new Date().toISOString(),
 sourceEvidence:{path:sourcePath,sha256:createHash('sha256').update(raw).digest('hex')},
 workspace:proof.workspace,head:proof.headAfter,
 status:'reviewed-proposal-not-executed',
 finding:{
  category:'generated-test-fixture-cleanup',
  verifiedFacts:[
   'The exact 14 directories are untracked and are not currently hidden by gitignore.',
   'Seven package-contract directories contain an empty destination directory and a literal absolute symlink.',
   'Seven snapshot-contract directories contain seven small fixture files (110 bytes per directory) and a literal absolute outside symlink.',
   'The two public test sources create these exact mkdtemp prefixes inside candidate artifacts/fa-01 and explicitly create the observed symlink types.',
   'The scanned test-source excerpts include no rm/finally/after/afterEach cleanup hook; fixture generation and retention are consistent with the observed directories.',
   'The independent source fingerprint helper correctly rejects the symlinks. No helper rule was relaxed and no model or test was run by this review.',
  ],
  publicReferences:[
   {file:'scripts/jarvis-autonomy/package.test.mjs',lines:[13,14,16,17],sha256:proof.sources.find(item=>item.path==='scripts/jarvis-autonomy/package.test.mjs').sha256},
   {file:'scripts/jarvis-autonomy/source-stability.test.mjs',lines:[9,10,13,15],sha256:proof.sources.find(item=>item.path==='scripts/jarvis-autonomy/source-stability.test.mjs').sha256},
  ],
 },
 exactMoveCandidates:proof.fixtures.map(item=>({relativePath:item.path,device:item.device,inode:item.inode,uid:item.uid,gid:item.gid,mode:item.mode,manifestSha256:item.manifestSha256})),
 reversibleProcedure:[
  'Confirm all 101 execution queues, delivery journals and pending logs are clear, the old signed terminal receipts are acknowledged, and no candidate writer/test process is active.',
  'Create a fresh private root-owned 0700 quarantine outside the candidate and original main source roots. Verify trusted nonsymlink parents and same st_dev; otherwise stop rather than falling back to an unchecked cross-device copy or deletion.',
  'Persist a private 0600 manifest with exact original paths, directory identity, every descendant regular-file hash and literal symlink text. Public reports use link-text hashes and metadata only; never read symlink targets.',
  'Before each move, recompute and compare the complete lstat-based metadata/content manifest with this fixed review. Any new entry, source-directory replacement, changed hash or existing destination stops the operation.',
  'Rename only each of the 14 listed whole directories into its unique quarantine destination. Do not move the enclosing artifacts/fa-01 folder, delete outputs, rewrite symlinks or touch other artifacts.',
  'After each rename, verify the destination preserves directory and descendant identities, hashes and literal link text. The internal absolute link may temporarily dangle after relocation; this is preservation of the original evidence, not a reason to follow or repair the link.',
  'Record every successful move durably. On partial failure, restore only recorded exact directories with matching destination manifests and absent original paths; refuse to overwrite newly generated source artifacts.',
  'Verify original public source code files are unchanged, retain the original rejected-fingerprint incident, then take a fresh strict fingerprint and fresh root receipt for any new fixed candidate validation.',
 ],
 rollback:'Recheck each exact quarantined manifest and absence of its original path, then rename that whole directory back. Verify matching inode/device, regular bytes/hash and literal symlink text. Any collision or changed contents requires reconciliation, not overwrite.',
 limits:[
  'No directory was moved, deleted, rewritten or tested by this review.',
  'Quarantine removes retained fixtures from source admission; it does not repair the tests that generated them.',
  'Rerunning those tests may generate new symlinks inside an independent validation snapshot and cause another genuine failure. Capture that result and repair cleanup in a separate narrow source task.',
  'A valid pre-quarantine strict fingerprint did not exist. A new successful fingerprint is fresh evidence, not a claim that the old rejected state passed.',
  'This bounded proposal does not establish product acceptance, cleanup of unrelated processes, or the 74 goal outcomes.',
 ],
 modelCalls:0,testsRun:0,remoteChanges:0,productAccepted:false,
};
const output=directory+'/candidate-fixture-quarantine-independent-review.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,sha256:createHash('sha256').update(await readFile(output)).digest('hex'),directories:report.exactMoveCandidates.length,status:report.status}));
