import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import {executionRequirements} from './factory-truth-gate-probe-r29-r3.mjs';

// These exercise only the exact local tool's finite launch/acceptance guards.
// They do not execute the candidate, HTTP, PostgreSQL, MinIO, Docker or a model.
const path=fileURLToPath(new URL('./factory-truth-gate-probe-r29-r3.mjs',import.meta.url));
const source=readFileSync(path,'utf8');
const db=source.slice(source.indexOf('function databaseURL('),source.indexOf('async function outputReport('));
const head=source.slice(source.indexOf(' const env=process.env,runId='),source.indexOf(' await readPinnedManifest();const {Pool,'));
assert.ok(db&&head.includes('process.getuid?.()===1000'));
const need=(value,code)=>{if(!value)throw Object.assign(new Error(code),{code});};
const run='a'.repeat(40),attempt='b'.repeat(32),fp=executionRequirements.fingerprint;
const env={JARVIS_QA_SCOPE:'r29-truth-gate-isolated-v1',JARVIS_SOURCE_SHA256:fp,JARVIS_AUTONOMY_RUN_ID:run,JARVIS_VALIDATION_ATTEMPT:attempt,
 MSF_MINIO_ENDPOINT:'minio',MSF_MINIO_PORT:'9000',MSF_MINIO_BUCKET:'jarvis-truth-r29-'+run.slice(0,16)+'-'+attempt.slice(0,8),
 MSF_DATABASE_URL:'postgres://jarvis_test:synthetic@postgres:5432/jarvis_truth_gate_r29',R29_UPGRADE_DATABASE_URL:'postgres://jarvis_test:synthetic@postgres:5432/jarvis_truth_upgrade_r29'};
function guard({changedEnv={},uid=1000,gid=1000,cwd='/work/source'}={}){
 const context={URL,need,R:/^[a-f0-9]{40}$/,A:/^[a-f0-9]{32}$/,SOURCE:'/work/source',FP:fp,process:{env:{...env,...changedEnv},getuid:()=>uid,getgid:()=>gid,cwd:()=>cwd}};
 return vm.runInNewContext(db+'\n(()=>{'+head+';return {mainURL,upgradeURL};})()',context);
}
test('actual guard accepts only the documented non-root isolated launch shape',()=>{const r=guard();assert.equal(new URL(r.mainURL).pathname,'/jarvis_truth_gate_r29');assert.equal(new URL(r.upgradeURL).pathname,'/jarvis_truth_upgrade_r29');});
for(const [name,args] of [
 ['root',{uid:0}],['wrong uid',{uid:1001}],['root gid',{gid:0}],['wrong gid',{gid:1001}],['other cwd',{cwd:'/home/superopen/All-Projects/msf'}],
 ['other scope',{changedEnv:{JARVIS_QA_SCOPE:'production'}}],['other source',{changedEnv:{JARVIS_SOURCE_SHA256:'c'.repeat(64)}}],['malformed run',{changedEnv:{JARVIS_AUTONOMY_RUN_ID:'a'.repeat(39)}}],['malformed attempt',{changedEnv:{JARVIS_VALIDATION_ATTEMPT:'b'.repeat(31)}}],
 ['other storage endpoint',{changedEnv:{MSF_MINIO_ENDPOINT:'192.168.10.120'}}],['other storage port',{changedEnv:{MSF_MINIO_PORT:'443'}}],['other storage bucket',{changedEnv:{MSF_MINIO_BUCKET:'production'}}],
 ['other DB protocol',{changedEnv:{MSF_DATABASE_URL:'https://jarvis_test@postgres:5432/jarvis_truth_gate_r29'}}],['other DB host',{changedEnv:{MSF_DATABASE_URL:'postgres://jarvis_test@192.168.10.101:5432/jarvis_truth_gate_r29'}}],['missing DB port',{changedEnv:{MSF_DATABASE_URL:'postgres://jarvis_test@postgres/jarvis_truth_gate_r29'}}],['other DB port',{changedEnv:{MSF_DATABASE_URL:'postgres://jarvis_test@postgres:6432/jarvis_truth_gate_r29'}}],['other DB user',{changedEnv:{MSF_DATABASE_URL:'postgres://superuser@postgres:5432/jarvis_truth_gate_r29'}}],['other DB name',{changedEnv:{MSF_DATABASE_URL:'postgres://jarvis_test@postgres:5432/msf'}}],['DB query override',{changedEnv:{MSF_DATABASE_URL:env.MSF_DATABASE_URL+'?options=-csearch_path%3Dprivate'}}],['DB fragment',{changedEnv:{MSF_DATABASE_URL:env.MSF_DATABASE_URL+'#private'}}],['missing DB',{changedEnv:{MSF_DATABASE_URL:undefined}}],
 ['other upgrade host',{changedEnv:{R29_UPGRADE_DATABASE_URL:'postgres://jarvis_test@127.0.0.1:5432/jarvis_truth_upgrade_r29'}}],['upgrade main DB reuse',{changedEnv:{R29_UPGRADE_DATABASE_URL:env.MSF_DATABASE_URL}}],['missing upgrade DB',{changedEnv:{R29_UPGRADE_DATABASE_URL:undefined}}],
])test('actual guard rejects '+name,()=>assert.throws(()=>guard(args),e=>/^QA_/.test(e.code)));
const matchLine=source.split(/\r?\n/).find(x=>x.startsWith('const matches='));
const matches=vm.runInNewContext(matchLine+'\nmatches');
const expected=[{stage:'finalize',status:423,errorCode:'GATE_BLOCKED'}];
test('acceptance matcher requires exact expected stage/status/code and real zero-write witness',()=>assert.equal(matches([{...expected[0],transactionUnchanged:true}],expected),true));
for(const [name,delta] of [['wrong stage',{stage:'generate'}],['wrong status',{status:400}],['unrelated error',{errorCode:'VALIDATION_FAILED'}],['authentication error',{errorCode:'UNAUTHENTICATED'}],['missing witness',{transactionUnchanged:undefined}],['changed transaction',{transactionUnchanged:false}],['internal error',{status:500}],['transport failure',{status:0}]])test('acceptance matcher rejects '+name,()=>assert.equal(matches([{...expected[0],transactionUnchanged:true,...delta}],expected),false));
test('exact finite matrix keeps 34 unique check IDs and no completed-product claims',()=>{assert.equal(executionRequirements.plannedCheckIds.length,34);assert.equal(new Set(executionRequirements.plannedCheckIds).size,34);assert.equal(executionRequirements.ready,false);assert.equal(executionRequirements.productAccepted,false);});
for(const args of [[],['--inspect']])test('default CLI inspect does not start product or reveal credentials '+JSON.stringify(args),()=>{const r=spawnSync(process.execPath,[path,...args],{encoding:'utf8',timeout:5000});assert.equal(r.status,0);assert.equal(r.stderr,'');const v=JSON.parse(r.stdout);assert.equal(v.defaultAction,'inspect');assert.equal(v.installed,false);assert.equal(v.ready,false);assert.equal(v.plannedChecks,34);assert.equal(r.stdout.includes('synthetic@'),false);});
test('other CLI argument is closed before execution',()=>{const r=spawnSync(process.execPath,[path,'--execute','--source=/tmp/new'],{encoding:'utf8',timeout:5000});assert.equal(r.status,2);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).errorCode,'QA_ARGUMENTS_INVALID');});
test('both severity-negative recipes supply complete waiver and target severity detail',async()=>{const code=source.slice(source.indexOf("  for(const severity of ['P0','P1'])"),source.indexOf("  await negative('N06-missing-evidence'")),calls=[];await vm.runInNewContext('(async()=>{'+code+'})()',{negative:async(id,o)=>calls.push({id,waivers:o.waivers,detail:o.expectedDetail})});assert.equal(calls.length,2);for(const c of calls){assert.equal(c.waivers.length,1);assert.equal(c.waivers[0].defectId,'DF-QA');assert.ok(c.waivers[0].justification.trim());assert.equal(c.detail,'SEVERITY_NOT_WAIVABLE');}});
test('new matrix and client do not silently fall back to old candidate observer',()=>{assert.equal(executionRequirements.priorMatrixChecks,33);assert.equal(executionRequirements.priorMatrixExecuted,false);assert.equal(executionRequirements.independentPGRuntime.manifestSHA256,null);assert.equal(executionRequirements.independentPGRuntime.candidateDependencyFallback,false);assert.equal(source.includes("createRequire(join(SOURCE,'apps/server/package.json'))"),false);assert.ok(executionRequirements.plannedCheckIds.includes('P04-lawful-P2-conditional'));});
