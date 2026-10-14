/** Validate recorded local release evidence; never calls models or writes business data. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {controlService} from './platform-service.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=async path=>JSON.parse((await readFile(resolve(root,path),'utf8')).replace(/^\uFEFF/,''));
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const tests=async file=>{
 const text=await readFile(join(root,file),'utf8');
 const sum=label=>[...text.matchAll(new RegExp('(?:ℹ|#) '+label+' (\\d+)','g'))].reduce((n,m)=>n+Number(m[1]),0);
 const count=sum('tests'),passed=sum('pass'),failed=sum('fail'),skipped=sum('skipped');
 assert(count>0&&count===passed&&failed===0&&skipped===0,'Test evidence failed: '+file);
 return {tests:count,passed,failed,skipped,log:file};
};
const releaseText=await readFile(join(root,'artifacts/prepared-release.txt'),'utf8');
const release=JSON.parse(releaseText.slice(releaseText.indexOf('{')));
assert.equal(release.status,'passed');assert.equal(release.build,'20261006-prepared');assert.equal(release.osTaskStarted,false);
const state=await controlService(join(root,'.jarvis'),'status');
const pid=Number(await readFile(join(root,'.jarvis/runtime.pid'),'utf8'));
assert.equal(state.status,'running');assert.equal(state.childPid,pid);assert.equal(pid,release.childPid);
const response=await fetch('http://127.0.0.1:3140/api/health',{redirect:'error',signal:AbortSignal.timeout(5000)});
assert(response.ok);const health=await response.json();assert.equal(health.build,release.build);
const local=await json('artifacts/prepared-runtime-qa/local-runtime.json'),task=await json('artifacts/prepared-runtime-qa/task-state.json');
assert.equal(local.status,'passed');assert.equal(local.health.build,release.build);assert.equal(task.state,'Running');
for(const field of ['importedBills','billLinks','configuredLogSources','configuredHardwareSources','rawServiceLogs'])assert.equal(local.database[field],0,'No prepared QA fixture in production: '+field);
for(const status of Object.values(local.protectedStatuses))assert.equal(status,401);
const manifest=JSON.parse(await readFile(join(release.backup,'manifest.json'),'utf8'));
const backup={directory:release.backup,businessDatabaseVerified:await sha(join(release.backup,'jarvis.db'))===manifest.databaseSha256,
 executionDatabaseVerified:await sha(join(release.backup,manifest.executionDatabase.path))===manifest.executionDatabase.sha256,
 voiceKeyPreserved:await sha(join(release.backup,'runtime/voice-master.key'))===await sha(join(root,'.jarvis/runtime/voice-master.key')),
 voiceKeyBytes:(await stat(join(root,'.jarvis/runtime/voice-master.key'))).size,containsPrivateData:true};
assert(backup.businessDatabaseVerified&&backup.executionDatabaseVerified&&backup.voiceKeyPreserved);
const contract=await json('artifacts/v1-api-qa/contract.json');assert.equal(contract.operations,323);assert.equal(contract.implemented,323);assert.equal(contract.planned,0);assert.equal(contract.schemas,755);
const ui=await json('artifacts/prepared-ui-qa/report.json');assert.equal(ui.status,'passed');assert.equal(ui.checks.length,5);
for(const field of ['pageErrors','httpErrors'])assert.deepEqual(ui[field],[]);assert.equal(ui.modelCalls,0);assert.equal(ui.remoteCalls,0);assert.equal(ui.productionWrites,false);assert.equal(ui.actualFileReads,true);assert.equal(ui.physicalHardwareCollectors,false);
const parity=await json('artifacts/frontend-parity/report.json');assert.equal(parity.checks.length,119);
for(const field of ['errors','httpErrors','api','staticRateLimitHeaders'])assert.deepEqual(parity[field],[]);
assert(Date.parse(parity.at)>=Date.parse(release.at),'Parity must inspect the released assets');
const docs=await json('artifacts/prepared-docs-qa/report.json');assert.equal(docs.status,'passed');
const buildText=await readFile(join(root,'artifacts/prepared-staged-build.txt'),'utf8');assert.match(buildText,/built in/);assert.match(buildText,/--outDir \.dist-next/);assert.doesNotMatch(buildText,/error TS\d|ERR!/);
const typeText=await readFile(join(root,'artifacts/prepared-typecheck.txt'),'utf8');assert.match(typeText,/tsc --noEmit/);assert.doesNotMatch(typeText,/error TS\d|ERR!/);
const backend=await tests('artifacts/prepared-backend-tests.txt'),demo=await tests('artifacts/prepared-demo-tests.txt');assert.equal(backend.tests,244);assert.equal(demo.tests,25);
const report={status:'passed',at:new Date().toISOString(),build:health.build,
 capabilities:['standard CSV/JSON invoice preview and confirmed import with exact signed decimal totals','explicit local SDK usage matching, reviewed manual linking, versioning and audit; no currency conversion','native Pi read-only owner billing summary and actual optional GPU/power history','signed opt-in fixed-file service log collection with client/server redaction, bounded retention and restart-safe deduplication','configured fresh GPU/power file readings forwarded by actual signed nodes; missing stays unknown'],
 addedOperations:{billing:11,observations:5,total:16},
 validation:{backend,demoLogic:demo,preparedUi:{checks:ui.checks.length,report:'artifacts/prepared-ui-qa/report.json'},frontendParity:{checks:parity.checks.length,report:'artifacts/frontend-parity/report.json'},docs:{report:'artifacts/prepared-docs-qa/report.json'},contract,typecheck:{passed:true,log:'artifacts/prepared-typecheck.txt'}},
 release,backup,service:{task:task.task,state:task.state,logonType:task.logonType,supervisorPid:state.supervisorPid,childPid:pid,health,currentProcessMatchesPrivateControl:true,
 instanceGuard:'Verified in prior isolated actual-process tests; latest supervisor script loads on next OS task start',limitations:['requires current Windows user login','not available during sleep, shutdown or logout']},
 production:{administratorSetupPresent:local.administratorSetupPresent,database:local.database,localFiles:local.localFiles,protectedStatuses:local.protectedStatuses,
 preparedFixturesWritten:false,paidModelCalls:0,physicalMicrophoneCalls:0,physicalSpeakerCalls:0,physicalHardwareCollectorsInstalled:false},
 buildEvidence:{stagedCommand:'npm run build:stage',stagingPassed:true,log:'artifacts/prepared-staged-build.txt',apiEntrySha256:await sha(join(root,'apps/api/dist/index.js')),webEntrySha256:await sha(join(root,'apps/web/dist/index.html'))},
 previousEvidence:'artifacts/companion-runtime-qa/report.json',
 remaining:['dedicated Mandarin wake-word model and voiceprint enrollment/revocation/verification','offline Web Push and email/SMS delivery adapters','vendor API automatic invoice download and provider request-ID mapping','real GPU/smart-meter collector installation; current implementation forwards configured readings','configured model acceptance, physical room audio tests and 48GB production migration'],
 readOnlyInspection:'artifacts/prepared-runtime-qa/local-runtime.json'};
await writeFile(join(root,'artifacts/prepared-runtime-qa/report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,build:report.build,backend:backend.tests,demo:demo.tests,ui:ui.checks.length,parity:parity.checks.length,operations:contract.operations,backupVerified:true}));
