/** Freeze local regression and reviewed candidate identity; no model or server operations. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='artifacts/unattended-r19';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const decode=bytes=>bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8');
async function tally(path){const bytes=await readFile(path),text=decode(bytes);const count=name=>{const matches=[...text.matchAll(new RegExp('(?:ℹ|#) '+name+' (\\d+)','g'))];if(!matches.length)throw Error('REGRESSION_SUMMARY_MISSING_'+name);return Number(matches.at(-1)[1]);};return {path,sha256:sha(bytes),tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')};}
const regression=await tally(folder+'/full-api-tests-verified.tap');
const prior=await tally(folder+'/full-api-tests.tap');
const packageTest=await tally(folder+'/packaged-node-test.tap');
const independent=await json(folder+'/independent-review.json');
const voice=await json('artifacts/voice-latency-r19/local-verification.json');
const sourceChecks=[];
for(const [scope,files] of [['delivery',independent.sourceFingerprints],['voice',voice.files]])for(const entry of files){const actual=sha(await readFile(entry.path));sourceChecks.push({scope,path:entry.path,sha256:actual,match:entry.sha256===actual});}
const manifest=await json('artifacts/development-node/package/SHA256.json');
const packageChecks=await Promise.all(manifest.map(async entry=>({file:entry.file,sha256:entry.sha256,match:sha(await readFile('artifacts/development-node/package/'+entry.file))===entry.sha256})));
const checks={wholePlatformRegression:regression.tests===491&&regression.pass===490&&regression.fail===0&&regression.cancelled===0&&regression.skipped===1,isolatedPackagedNode:packageTest.tests===1&&packageTest.pass===1&&packageTest.fail===0&&packageTest.skipped===0,frozenCandidateUnchanged:sourceChecks.every(x=>x.match),packageManifestMatches:packageChecks.length===5&&packageChecks.every(x=>x.match)};
const report={at:new Date().toISOString(),release:'20261010-autonomous-voice-r19-1',passed:Object.values(checks).every(Boolean),checks,regression,priorRegressionPreserved:prior,priorFailureResolution:['Only the obsolete exact read-only tool list fixture was updated; identity revoke and read-only enforcement remain checked.','Unknown-fee committed receipt may be confirmed; unknown value stays null, duplicate receipt stays idempotent, next execution preflight/reservation remains rejected.'],remainingSkip:'Linux PID reuse / boot identity ownership check; separately run the deployed compiled module in an isolated Linux fixture.',packageTest,sourceChecks,packageChecks,modelCalls:0,physicalCrashResumeVerified:false,continuous24hVerified:false,productAccepted:false};
await writeFile(folder+'/local-release-verification.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,checks,regression,packageTest}));if(!report.passed)process.exitCode=1;
