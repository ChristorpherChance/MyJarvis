/** Supplemental facts only. Default import performs no IO or framework execution. */
import {open} from 'node:fs/promises';
const path = '/work/source/apps/server/src/modules/test/truth-gate.integration.test.ts';
const describe = 'M07 truth-gate contract (dedicated PostgreSQL integration)';
const titles = Object.freeze([
 'orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis',
 'invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards',
 'places a manual revision strictly after a future prior timestamp without JavaScript rounding',
 'allows only one real concurrent selftest start and orders it after a future prior selftest',
]);
const need = (ok, code) => {if (!ok) throw Error(code)};
const state = value => {if (value === undefined || value === null) return null;
 need(['pass', 'fail', 'skip', 'run', 'todo'].includes(value), 'R33_PG4_TASK_STATE_INVALID'); return value;};
export function pg4HookFrameR33(files = null, errors = null) {
 need(Array.isArray(files) && files.length === 1 && Array.isArray(errors), 'R33_PG4_FINISHED_FRAME_REQUIRED');
 const file = files[0];
 need(file?.filepath === path && file.type === 'suite' && Array.isArray(file.tasks), 'R33_PG4_FILE_SCOPE_INVALID');
 const matches = file.tasks.filter(t => t?.type === 'suite' && t.name === describe);
 need(matches.length === 1 && file.tasks.length === 1, 'R33_PG4_DESCRIBE_SCOPE_INVALID');
 const suite = matches[0];
 need(Array.isArray(suite.tasks) && suite.tasks.length === 15 && suite.tasks.every(t => t?.type === 'test'), 'R33_PG4_CASE_SCOPE_INVALID');
 const selected = titles.map(title => {const found = suite.tasks.filter(t => t.name === title);
  need(found.length === 1, 'R33_PG4_SELECTED_CASE_MISSING_OR_DUPLICATE'); return {title, state: state(found[0].result?.state)};});
 const hooks = file.result?.hooks;
 need(hooks === undefined || hooks === null || (typeof hooks === 'object' && !Array.isArray(hooks)), 'R33_PG4_HOOK_STATE_INVALID');
 const counts = Object.fromEntries(['pass', 'fail', 'skip', 'run', 'todo'].map(k => [k, selected.filter(t => t.state === k).length]));
 counts.unknown = selected.filter(t => t.state === null).length;
 return {schemaVersion: 1, kind: 'r33-pg4-framework-hook-state', file: {path, state: state(file.result?.state)},
  describe: {name: describe, state: state(suite.result?.state)}, hooks: {beforeAll: state(hooks?.beforeAll), afterAll: state(hooks?.afterAll)},
  selected, selectedCounts: {expected: 4, ...counts}, unexpectedPassedCount: suite.tasks.filter(t => !titles.includes(t.name) && state(t.result?.state) === 'pass').length,
  unhandledErrorCount: errors.length, poolEndEvidenceKind: 'requires-independent-source-await-derivation', independentPoolEndEventObserved: false,
  frameworkBundleQualificationRef: null, sourceConfigQualificationRef: null, actualPG4Qualified: false, productAccepted: false};
}
export default class PG4HookReporterR33 {
 async onFinished(files, errors) {
  const frame = pg4HookFrameR33(files, errors);
  need(process.getuid?.() === 1000 && process.getgid?.() === 1000, 'R33_PG4_REPORTER_UID_GID_REQUIRED');
  const bytes = Buffer.from(JSON.stringify({...frame, observedAt: new Date().toISOString(), writerUID: 1000, writerGID: 1000}) + '\n');
  const output = await open('/evidence/pg4-hook-result.json', 'wx', 0o600);
  try {await output.writeFile(bytes); await output.sync();} finally {await output.close();}
 }
}
