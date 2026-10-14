import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {sha,repairScope as S} from './run-factory-main-repair-r26.mjs';
import {fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {r27VerifierScope as V,r27AuthPolicyException,r27AuthenticationPolicy,r27SandboxImageContract,renderR27Collector,renderR27Wrapper,assertR27Observation,cloneR27Configuration,prepareR27Verifier,localR27Main} from './prepare-factory-verifier-r27.mjs';
const original=await readFile(new URL('./project-autonomy-fa01-collector.mjs',import.meta.url)),oldWrapper=await readFile(new URL('./factory-main-acceptance-wrapper-r26-4.py',import.meta.url)),coordinator=await readFile(new URL('./project-autonomy-fa01-coordinator.py',import.meta.url));
const collector=renderR27Collector(original),fingerprint='a'.repeat(64),wrapper=renderR27Wrapper(oldWrapper,{candidateFingerprint:fingerprint,collectorSHA256:sha(collector)});
const observation=()=>({schemaVersion:1,kind:'software-factory-r27-source-observation',workspace:V.workspace,parent:V.parent,candidateFingerprint:fingerprint,candidateMetadataSHA256:'b'.repeat(64),originSHA256:'c'.repeat(64),files:610,mainFingerprint:S.baselineSHA,mainFiles:593,helperSHA256:fixedToolSHA['project-autonomy-evidence.py'],helperVerified:true,originBound:true,originalMainUnchanged:true,publicFilesOnly:true,privateEnvironmentCopied:false,gitHistoryCopied:false});
function loginHelper(){const a=collector.indexOf('export const r27AuthPolicyExceptions'),b=collector.indexOf('async function runtime()');return vm.runInNewContext(collector.slice(a,b).replaceAll('export ', '')+'\nvalidateSimpleR27Login',{need:(v,c)=>{if(!v)throw Error(c);}});}
function loginRequests(mutate){const seen=[],responses=[{status:401,value:null},{status:200,value:{enabled:true,user:null}},{status:200,value:{ok:true},response:{headers:{get:()=> 'msf_auth=fixture-cookie; HttpOnly; SameSite=Lax'}}}];mutate?.(responses);return {seen,request:async(path,options)=>{seen.push({path,options});return responses[seen.length-1];}};}
test('new collector is exact rendering of approved old bytes and only the declared auth/entry changes',async()=>{
 assert.equal(sha(original),fixedToolSHA['project-autonomy-fa01-collector.mjs']);assert.equal(await readFile(new URL('./project-autonomy-fa01-collector-r27.mjs',import.meta.url),'utf8'),collector);
 assert.ok(!collector.includes('const bad = await request'));assert.ok(!collector.includes('invalidLoginRejected: true'));assert.ok(collector.includes('invalidLoginRejected: null'));assert.ok(collector.includes("'/tools/project-autonomy-fa01-collector-r27.mjs'"));
 for(const text of ['const deadline = Date.now() + 2700 * 1000;','timeoutMs: 120000','COLLECTOR_PROCESS_STOP_UNCONFIRMED','child.requestStop()','ORIGINAL_REQUIRED_PROTOTYPE_SUITE_REMOVED','ORIGINAL_REQUIRED_TEST_FILE_REMOVED','COVERAGE_BELOW_REQUIRED_BASELINE','FRONTEND_AUTH_NOT_READY','BROWSER_SMOKE_FAILED'])assert.equal(collector.split(text).length,original.toString().split(text).length,text);
});
test('actual generated normal login helper performs anonymous/whoami/valid-login, never wrong-password request, and keeps exemption unpassed',async()=>{
 const f=loginRequests(),result=await loginHelper()(f.request,{MSF_AUTH_USER:'fixture-user',MSF_AUTH_PASS:'fixture-private'});
 assert.deepEqual(f.seen.map(x=>x.path),['/api/projects','/api/auth/whoami','/api/auth/login']);assert.equal(JSON.parse(f.seen[2].options.body).username,'fixture-user');assert.equal(result.cookie,'msf_auth=fixture-cookie');assert.equal(result.proof.invalidLoginRejected,null);assert.equal(result.proof.invalidLoginCheck.executed,false);assert.equal(result.proof.invalidLoginCheck.status,'not-applicable');assert.equal(result.proof.invalidLoginCheck.countsAsPassedCheck,false);assert.equal(result.proof.privateCredentialsExported,false);assert.ok(!JSON.stringify(result.proof).includes('fixture-private'));
});
test('anonymous/disabled auth, actual login status or cookie failure still stop before writes/browser readiness',async()=>{
 for(const mutate of [x=>{x[0].status=200;},x=>{x[1].value.enabled=false;},x=>{x[2].status=401;},x=>{x[2].value.ok=false;},x=>{x[2].response.headers.get=()=>null;},x=>{x[2].response.headers.get=()=> 'msf_auth=fixture; SameSite=Lax';},x=>{x[2].response.headers.get=()=> 'different=fixture; HttpOnly; SameSite=Lax';}]){
  const f=loginRequests(mutate);await assert.rejects(loginHelper()(f.request,{MSF_AUTH_USER:'fixture',MSF_AUTH_PASS:'fixture'}),/UNAUTHENTICATED_ACCESS_NOT_DENIED|AUTH_NOT_ENABLED|AUTH_LOGIN_OR_COOKIE_INVALID/);assert.ok(f.seen.length<=3);
 }
});
test('wrapper pins original six tools, new collector SHA, independent workspace and new namespace',()=>{
 assert.ok(wrapper.includes("WORKSPACE = '"+V.workspace+"'"));assert.ok(wrapper.includes("SOURCE_SHA256 = '"+fingerprint+"'"));assert.ok(wrapper.includes("ENTRY = '"+V.entry+"'"));assert.ok(wrapper.includes("R27_COLLECTOR_SHA256 = '"+sha(collector)+"'"));
 for(const value of Object.values(fixedToolSHA))assert.ok(wrapper.includes(value));assert.ok(wrapper.includes("report['scopeExceptions'] = R27_AUTHENTICATION_POLICY['exceptions']"));assert.ok(wrapper.includes("report['productObjectivesAccepted'] = False"));
 assert.throws(()=>renderR27Wrapper(Buffer.from(oldWrapper.toString()+'changed'),{candidateFingerprint:fingerprint,collectorSHA256:sha(collector)}),/ORIGINAL_WRAPPER_CHANGED/);assert.throws(()=>renderR27Collector(Buffer.from(original.toString()+'changed')),/ORIGINAL_COLLECTOR_CHANGED/);
});
test('actual rendered Python compiles/pins collector redirect and preserves every coordinator validation/cleanup/timeout statement',()=>{
 const code=String.raw`import json,sys,ast,base64
sys.stdin.reconfigure(encoding='utf-8');p=json.load(sys.stdin);w={'__name__':'fixture','__file__':'fixture'};exec(compile(p['wrapper'],'fixture','exec'),w)
original=base64.b64decode(p['coordinator']);patched=w['patched_r27_coordinator_body'](original);tree=ast.parse(patched)
assert w['TOOL_SHA256']==p['oldTools'];assert b"COLLECTOR = TOOLS / 'project-autonomy-fa01-collector-r27.mjs'" in patched;assert b"'/tools/project-autonomy-fa01-collector-r27.mjs'" in patched
assert b"report['scopeExceptions']" in patched;assert b"report['productObjectivesAccepted'] = False" in patched
for text in [b"not errors and stable and artifacts",b"all(row['executed'] and row['status'] == 'pass' and row['exitCode'] == 0",b"TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE",b"COLLECTOR_PROCESS_RESULT_INVALID",b"ISOLATED_COLLECTOR_TIMEOUT",b"COORDINATOR_TERMINATED",b"SCOPED_CLEANUP_INCOMPLETE",b"networkRemoved",b"source-stability"]:
 assert patched.count(text)==original.count(text),text.decode()
try:w['patched_r27_coordinator_body'](original+b'changed');raise AssertionError('unapproved coordinator allowed')
except ValueError as e:assert str(e)=='MAIN_ACCEPTANCE_COORDINATOR_HASH_CHANGED'
print(json.dumps({'parsed':True,'inMemoryPatchExecuted':True,'originalFilesChanged':False,'modelsInvoked':0}))`;
 const r=spawnSync('python',['-I','-c',code],{input:JSON.stringify({wrapper,coordinator:coordinator.toString('base64'),oldTools:fixedToolSHA}),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).inMemoryPatchExecuted,true);
});
test('actual wrapper validates authorized exception, all original 45/30 identifiers, 90/80 and exact d9 contract',()=>{
 const code=String.raw`import json,sys
sys.stdin.reconfigure(encoding='utf-8');w={'__name__':'fixture','__file__':'fixture'};exec(compile(json.load(sys.stdin),'fixture','exec'),w)
policy={'mode':'fa01-isolated-v1','workspace':w['WORKSPACE'],'workPackage':'FA-01','goalSpecHash':w['GOAL_HASH'],'evidenceRoot':w['ROOT'],'sourceFingerprint':w['SOURCE_SHA256'],'expectedChecks':w['REQUIRED'],'imageIds':{x:'sha256:'+'b'*64 for x in ['node','postgres','redis','minio']},'authenticationPolicy':w['R27_AUTHENTICATION_POLICY'],'sandboxImageContract':w['R27_SANDBOX_IMAGE_CONTRACT']}
base={'schemaVersion':1,'kind':'project-autonomy-test-baseline','workspace':w['WORKSPACE'],'sourceFingerprintObserved':w['SOURCE_SHA256'],'requiredTestFiles':list(w['ORIGINAL_TESTS']),'requiredPrototypeSuites':list(w['ORIGINAL_SUITES']),'minimumCoverage':{'lines':90,'branches':80}}
w['validate_config'](policy,base)
assert len(base['requiredTestFiles'])==45 and len(base['requiredPrototypeSuites'])==30;assert policy['sandboxImageContract']['imageId']=='sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'
badcases=[({**policy,'authenticationPolicy':{}},base),({**policy,'sandboxImageContract':{**policy['sandboxImageContract'],'imageId':'sha256:'+'c'*64}},base),(policy,{**base,'requiredTestFiles':base['requiredTestFiles'][1:]}),(policy,{**base,'requiredPrototypeSuites':base['requiredPrototypeSuites'][1:]}),(policy,{**base,'minimumCoverage':{'lines':89,'branches':80}})]
for p,b in badcases:
 try:w['validate_config'](p,b);raise AssertionError('weakened scope accepted')
 except ValueError:pass
print(json.dumps({'actualFixedConfigGuardsExecuted':True,'rejections':len(badcases),'installed':False}))`;
 const r=spawnSync('python',['-I','-c',code],{input:JSON.stringify(wrapper),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).rejections,5);
});
test('snapshot after guard rejects moving source and cannot redirect destination outside exact run attempt',()=>{
 const code=String.raw`import json,sys,base64
from types import SimpleNamespace
sys.stdin.reconfigure(encoding='utf-8');p=json.load(sys.stdin);w={'__name__':'fixture','__file__':'fixture'};exec(compile(p['wrapper'],'fixture','exec'),w)
coordinator=SimpleNamespace();helper=SimpleNamespace();w['load_python']=lambda name,body,path: coordinator if 'coordinator' in name else helper
bodies={'project-autonomy-fa01-coordinator.py':base64.b64decode(p['coordinator']),'project-autonomy-evidence.py':b'fixture'}
fp=w['SOURCE_SHA256'];dest=w['ROOT']+'/'+'a'*40+'/'+'b'*32+'/snapshot'
def check(values,workspace=None,destination=None):
 vals=iter(values);helper.fingerprint=lambda q:next(vals);helper.snapshot=lambda q,d:{'sha256':fp};_,h=w['adapt_tools'](bodies,'a'*40);return h.snapshot(workspace or w['WORKSPACE'],destination or dest)
assert check([{'sha256':fp},{'sha256':fp}])=={'sha256':fp}
for values,workspace,destination in [([{'sha256':fp},{'sha256':'b'*64}],None,None),([{'sha256':fp}],'/wrong',None),([{'sha256':fp}],None,w['ROOT']+'/'+'a'*40+'/wrong/snapshot')]:
 try:check(values,workspace,destination);raise AssertionError('moving/redirection snapshot accepted')
 except ValueError:pass
print(json.dumps({'actualSnapshotGuardExecuted':True,'rootToolsExecuted':False}))`;
 const r=spawnSync('python',['-I','-c',code],{input:JSON.stringify({wrapper,coordinator:coordinator.toString('base64')}),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);
});
test('candidate evidence is required and configuration cloning preserves inventories without mutating inputs',()=>{
 const o=observation(),baseline={requiredTestFiles:Array.from({length:45},(_,i)=>'fixture-'+i),requiredPrototypeSuites:Array.from({length:30},(_,i)=>'suite-'+i),minimumCoverage:{lines:90,branches:80},sentinel:{unchanged:true}},policy={imageIds:{node:'sha256:'+'d'.repeat(64)},expectedChecks:['source-stability']};
 const before=JSON.stringify({baseline,policy}),c=cloneR27Configuration(baseline,policy,o);assert.equal(JSON.stringify({baseline,policy}),before);assert.deepEqual(c.baseline.requiredTestFiles,baseline.requiredTestFiles);assert.deepEqual(c.baseline.requiredPrototypeSuites,baseline.requiredPrototypeSuites);assert.deepEqual(c.policy.authenticationPolicy,r27AuthenticationPolicy);assert.deepEqual(c.policy.sandboxImageContract,r27SandboxImageContract);assert.equal(c.policy.workspace,V.workspace);
 for(const mutate of [v=>{v.workspace=S.source;},v=>{v.originBound=false;},v=>{v.publicFilesOnly=false;},v=>{v.privateEnvironmentCopied=true;},v=>{v.originalMainUnchanged=false;},v=>{v.candidateFingerprint=S.baselineSHA;}]){const x=observation();mutate(x);assert.throws(()=>assertR27Observation(x),/REAL_SOURCE_OBSERVATION_REQUIRED/);}
 const withPrivate={...observation(),password:'PRIVATE_FIXTURE_SENTINEL',privateConfig:{token:'PRIVATE_FIXTURE_SENTINEL'}};assert.ok(!JSON.stringify(assertR27Observation(withPrivate)).includes('PRIVATE_FIXTURE_SENTINEL'));
 assert.throws(()=>prepareR27Verifier({originalWrapperBytes:oldWrapper,originalCollectorBytes:original,baselineBytes:Buffer.from('{}'),policyBytes:Buffer.from('{}'),sourceObservation:o}),/ORIGINAL_POLICY_BYTES_CHANGED/);
});
test('offline default inspect cannot install, connect, dispatch or manufacture candidate evidence',async()=>{
 const result=await localR27Main([]);assert.equal(result.ready,false);assert.equal(result.installed,false);assert.equal(result.remoteReadsPerformed,false);assert.equal(result.verificationDispatched,false);assert.equal(result.modelsInvoked,false);
 for(const args of [['--execute'],['start'],['prepare','--fingerprint='+'a'.repeat(64)],['install']])await assert.rejects(localR27Main(args),/PREPARE_ONLY/);
 assert.equal(r27AuthPolicyException.status,'not-applicable');assert.equal(r27AuthPolicyException.required,false);assert.equal(r27AuthPolicyException.countsAsPassedCheck,false);
});
