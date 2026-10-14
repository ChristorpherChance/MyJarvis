/** Aggregate existing public receipts only. Never rerun validation or contact servers. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'artifacts/software-factory/acceptance-r24';
const names = {
 identity: 'main-source-identity-readback-source-update-second-r24.json',
 baseline: 'main-baseline-independent-review-source-update-second-r24.json',
 restored: 'main-baseline-restoration-readback-source-update-second-r24.json',
 selection: 'main-baseline-selection-readback-source-update-second-r24.json',
 inspectionFailure: 'main-baseline-independent-inspection-failure-source-update-second-r24.json',
 historicalInitial: 'main-baseline-independent-review.json',
 historicalFirstSourceUpdate: 'main-baseline-independent-review-source-update-r24.json'
};
const data = {}, references = [];
for (const [key, name] of Object.entries(names)) {
 const bytes = await readFile(directory + '/' + name); data[key] = JSON.parse(bytes);
 references.push({ role: key, path: directory + '/' + name, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const { identity, baseline, restored, selection } = data;
if (baseline.taskId !== '4244fb55-7a54-45b9-a94a-ebaddd5d9a59' || baseline.runId !== 'cbd1f5971f17a8c9990c05afc25a009536568322' || baseline.batchKey !== 'source-update-second-r24' || baseline.signedRunStatus !== 'succeeded' || !baseline.sourceStableBeforeDuringAndAfter || baseline.sourceChangedBetweenObservationAndSnapshot || baseline.sourceFingerprint !== identity.current.narrowFingerprint || !baseline.report.ok || baseline.report.fullDeliveryAcceptance !== false || baseline.actualTests.numTotalTests !== 15 || baseline.actualTests.numPassedTests !== 15 || baseline.actualTests.numFailedTests !== 0 || baseline.actualTests.numPendingTests !== 0 || !restored.restorationConfirmed || !restored.idleConfirmed || !selection.topLevelMatches) throw Error('MAIN_SECOND_SOURCE_UPDATE_CLOSURE_BINDING_FAILED');
const sourcePaths = ['scripts/run-factory-main-baseline-r24.mjs', 'scripts/inspect-factory-main-baseline-r24.mjs', 'scripts/readback-main-source-identity-r24.mjs', 'scripts/readback-main-baseline-selection-r24.mjs', 'scripts/readback-main-baseline-restoration-r24.mjs'];
const sourceFingerprints = [];
for (const path of sourcePaths) sourceFingerprints.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
const result = {
 schemaVersion: 1, kind: 'software-factory-main-limited-baseline-closure', at: new Date().toISOString(), batchKey: baseline.batchKey,
 projectId: baseline.projectId, taskId: baseline.taskId, runId: baseline.runId, sourceRole: 'current-main', source: baseline.report.source,
 head: baseline.report.copy.gitAfter.head, sourceFingerprint: baseline.sourceFingerprint, sourceFiles: baseline.sourceFiles,
 sourceStableBeforeDuringAndAfter: true,
 changesComparedToFirstSourceUpdate: Object.fromEntries(Object.entries(identity.historicalToCurrentNarrowDelta).map(([kind, value]) => [kind, { total: value.total, categories: value.categories, privateMetadataOmitted: value.privateMetadataOmitted }])),
 realSignedOutcome: 'succeeded', stages: baseline.report.stages, tests: baseline.report.tests, exactTestFiles: baseline.unitReportMetadata.files,
 historicalTwoTS2345SeenInCurrentBuild: false,
 currentLimitedBaselinePassed: true, fullProductAccepted: false, independentlyAcceptedObjectives: 0, goalDenominator: 74,
 integrationTests: 'not-run', endToEndTests: 'not-run', completeDeliveryAcceptance: 'not-run', longUnattendedAcceptance: 'not-run',
 usage: baseline.usage, usageUnknown: baseline.usageUnknown, modelsInvoked: false, originalBusinessSourceModified: false, candidateModifiedByThisWork: false,
 originalGeneralTemplateRestored: true, oldAutonomyProfileUnchanged: true, frozenAutonomyTemplatesPreserved: restored.frozenTemplateCount,
 centralAllActive: restored.queue.allActive, nodeActive: restored.node.active, nodeJournalCounts: restored.node.counts,
 historicalReportsPreserved: true, noProductTaskRetry: true, inspectionFailurePreserved: true,
 inspectionCorrection: 'The in-process unit stage saves unit-report.json and no separate log. Fixed the readback assumption and read the same existing evidence again without rerunning tests.',
 sourceChangeAuthorAndExactDevelopmentTime: 'unknown', references, sourceFingerprints,
 constructionRecordOwner: 'root-agent', documentationOrLedgerEditedByThisScript: false
};
const output = directory + '/main-limited-baseline-closure-source-update-second-r24.json';
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: createHash('sha256').update(await readFile(output)).digest('hex'), currentLimitedBaselinePassed: true, fullProductAccepted: false, sourceFingerprint: result.sourceFingerprint }));
