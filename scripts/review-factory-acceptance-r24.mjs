/** Local-only independent evidence review. Never connects to a server or executes product tests. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const directory='artifacts/software-factory/acceptance-r24';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const file=async path=>{const bytes=await readFile(path);return {path,sha256:hash(bytes),bytes:bytes.length};};
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const plan=await read(directory+'/acceptance-first-plan.json');
const original=await read('artifacts/software-factory/autonomy-r22/objectives.json');
const ui=await read(directory+'/ui-verification-r24.json');
const planReport=await read(directory+'/plan-validation-r3.json');
const main=await read(directory+'/main-baseline-independent-review.json');
const checks=[];
function check(name,actual,expected){assert.equal(canonical(actual),canonical(expected),name);checks.push({name,result:'consistent'});}
check('all 74 original objectives and acceptance remain byte-content equivalent',plan.originalObjectivesSnapshot,original.objectives);
check('formal work-package dependencies remain unchanged',plan.originalWorkPackagesSnapshot,original.workPackages);
check('common acceptance remains unchanged',plan.commonAcceptanceSnapshot,original.commonAcceptance);
check('all original requirement mappings remain unchanged',plan.legacyRequirementsCoverageSnapshot,original.legacyRequirementsCoverage);
check('all original audit mappings remain unchanged',plan.auditFindingsCoverageSnapshot,original.auditFindingsCoverage);
check('coverage counts remain unchanged',plan.coverageSummarySnapshot,original.coverageSummary);
check('main result binds to the actual readback run',main.runId,'edd530589f3adc669a313dcfc6207fa536afb3cb');
check('main independently read back actual build failure',main.report.error,'BUILD_FAILED');
check('main source stayed stable before, during and after validation',main.sourceStableBeforeDuringAndAfter,true);
check('main remains unaccepted with subsequent checks not run',main.notRun,['typecheck','safe-unit-tests']);
check('main does not fabricate a zero usage receipt',main.usage,null);
assert.equal(main.productAccepted,false);assert.equal(main.independentlyAcceptedObjectives,0);
for(const item of [...ui.files,...planReport.files])check('reported source fingerprint: '+item.path,(await file(item.path)).sha256,item.sha256);

const paths=[
 'apps/api/src/runtime/project-autonomy-runtime.ts',
 'apps/api/src/runtime/project-autonomy-routes.ts',
 'apps/api/src/runtime/project-autonomy-evidence.ts',
 'apps/api/test/project-autonomy-baseline.test.ts',
 'scripts/run-factory-main-baseline-r24.mjs',
 'scripts/start-factory-acceptance-r24.mjs',
 'scripts/record-factory-acceptance-r24.mjs',
 'scripts/project-autonomy-contract.cjs',
 'docs/openapi-v1-planned.json',
 ...ui.files.map(item=>item.path),
 ...planReport.files.map(item=>item.path),
 directory+'/main-baseline-independent-review.json',
 directory+'/ui-verification-r24.json',
 directory+'/plan-validation-r3.json',
 directory+'/read-only-readiness-conclusions.json',
 'artifacts/software-factory/autonomy-r22/objectives.json',
 'scripts/project-autonomy-baseline-r22.json',
];
const sources=await Promise.all([...new Set(paths)].map(file));
const runtime=await readFile('apps/api/src/runtime/project-autonomy-runtime.ts','utf8');
const evidence=await readFile('apps/api/src/runtime/project-autonomy-evidence.ts','utf8');
const missingTestCountsExplicitlyRejected=/c\.id\s*===\s*['"]tests['"]\s*&&\s*!c\.tests/.test(runtime)||/check\.id\s*===\s*['"]tests['"]\s*&&\s*!check\.tests/.test(runtime)||/c\.id\s*!==\s*['"]tests['"]\s*\|\|\s*c\.tests\s*!=\s*null/.test(runtime);
assert.match(evidence,/sourceStable:z\.literal\(true\)/);
assert.match(evidence,/total:z\.number\(\)\.int\(\)\.positive\(\)/);
const result={
 schemaVersion:1,kind:'software-factory-r24-independent-static-review',at:new Date().toISOString(),
 scope:'Independent local static review and public evidence reconciliation; source-and-entry SSH discovery was performed separately before the root main validation. No product task, model call, build, deployment, service restart, remote configuration write or acceptance rerun was performed by this review.',
 planVersion:plan.version,sources,checks,
 assessment:{
  sourceRoles:'Current main is primary; the R22 independently modified candidate is a comparison only. Git manifest, protected snapshot and running dist identities are not conflated.',
  baselineAuthorization:'A fresh root-owned byte-hashed reconciliation binds the frozen profile, machine, paired agent, templates, candidate source and complete signed terminal runs. The new task is a bounded fixed validator; the exhausted old tasks are not revived.',
  controls:'Emergency stop, task pause/cancel, stale profile/template/project binding and terminal runs withdraw baseline supervision. Main controls operate on the main task, not the old candidate autonomy plan.',
  evidence:'Candidate batch status is independent of goal acceptance. Signed run, raw fixed JSON/hash, source/workspace/goal/work-package, machine/agent/frozen template, executed checks and test counts are separately checked. objectivesAccepted stays false and verifiedObjectiveIds stays empty.',
  mainDriver:'Persistent create/start intent, actual run reconciliation, exact frozen template binding and signed terminal response precede restore. Central/node CAS, zero pending journal/logs/direct node children and unchanged 27 frozen template hashes are checked. Actual root readback establishes the main build failure; the driver response alone is not product proof.',
  ui:'The five frozen UI files separate main and comparison identities, retain prior supervision history and known/unknown usage, reset project-scoped fetch state and link to actual tasks. Synthetic rendering and pure state tests are presentation evidence only.',
 },
 reviewCorrections:[{subject:'sourceStable=false and zero test denominator',correction:'Earlier local-expression concerns were corrected after reading the shared schema: literal true and positive total already rejected these values. Explicit guards and new regression assertions harden an existing boundary; this review does not claim an existing product bypass was reproduced.'}],
 findings:[{id:'R24-TEST-METADATA',severity:'hardening',status:missingTestCountsExplicitlyRejected?'addressed':'recommended',description:'A required check named tests should require explicit positive test counts, rather than permitting the generic optional tests property. Current trusted producer and formal objective review remain separate; this is not a demonstrated production false acceptance.',file:'apps/api/src/runtime/project-autonomy-runtime.ts',line:179}],
 mainObservedResult:{taskId:main.taskId,runId:main.runId,sourceFingerprint:main.sourceFingerprint,status:main.signedRunStatus,buildError:main.report.error,diagnostics:main.buildDiagnostics,tests:main.actualTests,notRun:main.notRun,usageUnknown:main.usageUnknown,restored:main.restored,acceptedObjectives:0},
 attributedValidation:{planStructure:{checks:planReport.summary.checks,result:planReport.result,scope:planReport.scope},ui:{pureViewTests:ui.pureViewTests,staticPresentationChecks:ui.summary,webTypecheck:ui.webTypecheck,productAcceptancePerformed:false}},
 limitations:[
  'This static review does not verify the final production release or API/UI browser authentication and race behavior.',
  'No new candidate batch or full product acceptance was executed here; the root owns actual dispatch and result collection.',
  'Running process identity versus dist/source remains unknown without a build manifest; healthy existing ports do not prove a fresh deployment.',
  'Quiet direct-child/journal evidence is a bounded admission snapshot, not a universal proof that every unrelated or orphaned process on 101 is absent.',
  'Main build failed before typecheck and the three shared unit files. Nothing in the plan, UI or this review signs the 74 goals as passed.',
 ],
 productAcceptancePerformed:false,
};
await writeFile(directory+'/independent-review.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:directory+'/independent-review.json',sha256:(await file(directory+'/independent-review.json')).sha256,planVersion:plan.version,checks:checks.length,findings:result.findings}));
