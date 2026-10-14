import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {parseProcStat,selectNewIdentities,guardedScope,originalSandboxCounts,KILL_HELPER} from './factory-supplemental-test-entry.mjs';
const source='25ae0ce3523832bedac7d0838d0061f6a57a5af4a112f2d25e8551a980f4f4bf',run='a'.repeat(40);
const env={JARVIS_FULL_TEST_RUN_ID:run,JARVIS_SOURCE_SHA256:source,JARVIS_SUPPLEMENTAL_TEST:'1',JARVIS_SANDBOX_FIXTURE_READY:'1',MSF_SANDBOX_NETWORK:`jarvis-ft-${run}-sandbox-net`};
test('scope rejects host execution, malformed identity, wrong network and hidden partial-case overrides',()=>{
 assert(guardedScope(env,'/work/source',1000));
 for(const [k,v] of Object.entries({JARVIS_FULL_TEST_RUN_ID:'a'.repeat(39),JARVIS_SOURCE_SHA256:'b'.repeat(64),MSF_SANDBOX_NETWORK:'bridge',JARVIS_SANDBOX_FIXTURE_READY:'0',V19_CASE:'only-pass',MSF_AI_PROVIDER:'pi',OPENAI_API_KEY:'fixture'}))assert(!guardedScope({...env,[k]:v},'/work/source',1000),k);
 assert(!guardedScope(env,'/tmp/source',1000));assert(!guardedScope(env,'/work/source',0));
});
test('proc identity parsing handles parenthesized process names and rejects untrusted ticks',()=>{
 const fields=['S','1',...Array(17).fill('0'),'456',...Array(5).fill('0')];
 assert.deepEqual(parseProcStat('22 (chrome helper (odd)) '+fields.join(' ')),{pid:22,startTicks:'456',state:'S',ppid:1});
 assert.throws(()=>parseProcStat('22 x broken'));fields[19]='invalid';assert.throws(()=>parseProcStat('22 (chrome) '+fields.join(' ')));
});
test('cleanup selection excludes init, entry, baseline and other UID but includes reused identity and reparented new child',()=>{
 const baseline=[{pid:10,startTicks:'100',uid:1000,state:'S'}];
 const rows=[{pid:1,startTicks:'1',uid:1000,state:'S'},{pid:10,startTicks:'100',uid:1000,state:'S'},{pid:11,startTicks:'200',uid:0,state:'S'},{pid:12,startTicks:'200',uid:1000,state:'Z'},{pid:13,startTicks:'300',uid:1000,state:'S',ppid:1},{pid:14,startTicks:'400',uid:1000,state:'S'}];
 assert.deepEqual(selectNewIdentities(rows,baseline,14).map(x=>x.pid),[13]);
 assert.deepEqual(selectNewIdentities([{pid:10,startTicks:'101',uid:1000,state:'S'}],baseline,14).map(x=>x.pid),[10]);
});
test('original sandbox accounting refuses foreign files, partial reports and invented totals',()=>{
 const rows=Array.from({length:6},(_,i)=>({status:i===0?'passed':'failed'}));
 const report={testResults:[{name:'/work/source/apps/server/src/modules/executor/sandbox.integration.test.ts',status:'failed',assertionResults:rows}],numTotalTests:6,numPassedTests:1,numFailedTests:5,numPendingTests:0,success:false};
 assert.equal(originalSandboxCounts(report).failed,5);
 assert.throws(()=>originalSandboxCounts({...report,numPassedTests:6}));
 assert.throws(()=>originalSandboxCounts({...report,testResults:[{...report.testResults[0],name:'/work/source/other.test.ts'}]}));
 assert.throws(()=>originalSandboxCounts({...report,testResults:[{...report.testResults[0],assertionResults:rows.slice(0,5)}]}));
});
test('Python descriptor helper parses without executing any Linux process operation',()=>{
 const r=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.read());print("syntax-only")'],{input:KILL_HELPER,encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0);assert.equal(r.stdout.trim(),'syntax-only');
});
