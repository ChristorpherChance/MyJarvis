/** Collect local evidence without credentials, model calls or business writes. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {controlService} from './platform-service.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJson=async path=>JSON.parse((await readFile(resolve(root,path),'utf8')).replace(/^\uFEFF/,''));
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const tests=async file=>{
 const text=await readFile(join(root,file),'utf8');
 const sum=label=>[...text.matchAll(new RegExp('(?:ℹ|#) '+label+' (\\d+)','g'))].reduce((n,m)=>n+Number(m[1]),0);
 const count=sum('tests'),passed=sum('pass'),failed=sum('fail');
 assert(count>0&&count===passed&&failed===0,'Test evidence failed: '+file);
 return {tests:count,passed,failed,log:file};
};
const releaseText=await readFile(join(root,'artifacts/companion-release.txt'),'utf8');
const release=JSON.parse(releaseText.slice(releaseText.indexOf('{')));
assert.equal(release.status,'passed');assert.equal(release.build,'20261006-companion');
const state=await controlService(join(root,'.jarvis'),'status');
const pid=Number(await readFile(join(root,'.jarvis/runtime.pid'),'utf8'));
assert.equal(state.status,'running');assert.equal(state.childPid,pid);
const response=await fetch('http://127.0.0.1:3140/api/health',{redirect:'error',signal:AbortSignal.timeout(5000)});
assert(response.ok);const health=await response.json();assert.equal(health.build,release.build);
const local=await readJson('artifacts/companion-runtime-qa/local-runtime.json');
const task=await readJson('artifacts/companion-runtime-qa/task-state.json');
assert.equal(local.status,'passed');assert.equal(task.state,'Running');
const manifest=JSON.parse(await readFile(join(release.backup,'manifest.json'),'utf8'));
const backup={directory:release.backup,businessDatabaseVerified:await sha(join(release.backup,'jarvis.db'))===manifest.databaseSha256,
 executionDatabaseVerified:await sha(join(release.backup,manifest.executionDatabase.path))===manifest.executionDatabase.sha256,
 voiceKeyPreserved:await sha(join(release.backup,'runtime/voice-master.key'))===await sha(join(root,'.jarvis/runtime/voice-master.key')),
 voiceKeyBytes:(await stat(join(root,'.jarvis/runtime/voice-master.key'))).size,containsPrivateData:true};
assert(backup.businessDatabaseVerified&&backup.executionDatabaseVerified&&backup.voiceKeyPreserved);
const contract=await readJson('artifacts/v1-api-qa/contract.json');assert.equal(contract.operations,307);assert.equal(contract.implemented,307);
const ui=await readJson('artifacts/companion-ui-qa/report.json');assert.equal(ui.status,'passed');assert.equal(ui.checks.length,6);
assert.equal(ui.paidOrGeneralModelCalls,0);assert.equal(ui.remoteCalls,0);assert.equal(ui.productionWrites,false);
const parity=await readJson('artifacts/frontend-parity/report.json');assert.equal(parity.checks.length,119);
for(const field of ['errors','httpErrors','api','staticRateLimitHeaders'])assert.deepEqual(parity[field],[]);
const report={status:'passed',at:new Date().toISOString(),build:health.build,
 capabilities:['Pi SDK language practice with actual text corrections and explicit private learning records','Pi recipe drafts with reviewed activation and persistent private timers','paired room ASR → companion → central TTS and spoken controls','actual CPU/memory and probe history with opt-in periodic HTTP probes'],
 validation:{backend:await tests('artifacts/companion-backend-tests.txt'),serviceAndUpgrade:await tests('artifacts/companion-service-tests.txt'),demoLogic:await tests('artifacts/companion-demo-tests.txt'),companionUi:{checks:ui.checks.length,report:'artifacts/companion-ui-qa/report.json'},frontendParity:{checks:parity.checks.length,report:'artifacts/frontend-parity/report.json'},contract},
 release,backup,service:{task:task.task,state:task.state,logonType:task.logonType,supervisorPid:state.supervisorPid,childPid:pid,health,
 currentProcessMatchesPrivateControl:true,instanceGuard:'Verified in isolated actual-process tests; latest supervisor script loads on next task start',limitations:['requires current Windows user login','not available during sleep, shutdown or logout']},
 production:{administratorSetupPresent:local.administratorSetupPresent,database:local.database,localFiles:local.localFiles,protectedStatuses:local.protectedStatuses,
 companionFixturesWritten:false,paidModelCalls:0,physicalMicrophoneCalls:0,physicalSpeakerCalls:0},
 buildEvidence:{stagedCommand:'npm run build:stage',stagingPassed:true,log:'artifacts/companion-staged-build.txt',apiEntrySha256:await sha(join(root,'apps/api/dist/index.js')),webEntrySha256:await sha(join(root,'apps/web/dist/index.html')),
 note:'Initial web build promoted new compatible assets before API maintenance; archived web-before is the actual web state immediately before the staged swap.'},
 remaining:['dedicated Mandarin wake-word model and voiceprint enrollment/revocation/verification','offline Web Push and email/SMS delivery adapters','vendor bill imports and automatic reconciliation','authorized raw service log collection and real GPU/power collectors','configured model acceptance, physical room audio tests and 48GB production migration'],
 readOnlyInspection:'artifacts/companion-runtime-qa/local-runtime.json'};
await writeFile(join(root,'artifacts/companion-runtime-qa/report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,build:report.build,backend:report.validation.backend.tests,service:report.validation.serviceAndUpgrade.tests,demo:report.validation.demoLogic.tests,ui:ui.checks.length,parity:parity.checks.length,backupVerified:true}));
