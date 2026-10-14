import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import vm from 'node:vm';
import {sha,repairScope as S} from './run-factory-main-repair-r26.mjs';import {fixedToolSHA} from './prepare-factory-repair-verifier-r26.mjs';
import {r28VerifierScope as V,r28SourcePins,r28ToolSHA256,r28AuthenticationPolicy,r28SandboxImageContract,renderR28Collector,renderR28Wrapper,assertR28Observation,cloneR28Configuration,localR28Main} from './prepare-factory-verifier-r28.mjs';
const original=await readFile(new URL('./project-autonomy-fa01-collector.mjs',import.meta.url)),oldWrapper=await readFile(new URL('./factory-main-acceptance-wrapper-r26-4.py',import.meta.url)),coordinator=await readFile(new URL('./project-autonomy-fa01-coordinator.py',import.meta.url)),collector=renderR28Collector(original);
const observation=()=>({schemaVersion:1,kind:'software-factory-r27-source-observation',workspace:V.workspace,parent:V.parent,...r28SourcePins,mainFingerprint:S.baselineSHA,mainFiles:593,helperSHA256:fixedToolSHA['project-autonomy-evidence.py'],helperVerified:true,originBound:true,originalMainUnchanged:true,publicFilesOnly:true,privateEnvironmentCopied:false,gitHistoryCopied:false});
const helper=()=>collector.slice(collector.indexOf('export const r28AuthPolicyExceptions'),collector.indexOf('async function runtime()')).replaceAll('export ','');
function workflow(mutate){
 const seen=[],id='10000000-0000-4000-8000-000000000001';let state=null,serial=0,result;const newKey=()=> '20000000-0000-4000-8000-'+String(++serial).padStart(12,'0');
 const request=async(path,options={})=>{const row={path,options};seen.push(row);let r;
  if(path==='/api/projects'&&!options.method)r={status:401,value:null};
  else if(path==='/api/auth/whoami')r={status:200,value:{enabled:true,user:null}};
  else if(path==='/api/auth/login')r={status:200,value:{ok:true},response:{headers:{get:()=> 'msf_auth=fixture-cookie; HttpOnly; SameSite=Lax'}}};
  else if(path==='/api/projects'&&options.method==='POST'){state={id,...JSON.parse(options.body),status:'active'};r={status:201,value:{...state}};}
  else if(path==='/api/projects/'+id&&options.method==='PUT'){state={...state,...JSON.parse(options.body)};r={status:200,value:{...state}};}
  else if(path==='/api/projects/'+id+'/archive'&&options.method==='POST'){state.status='archived';r={status:200,value:{...state}};}
  else if(path==='/api/projects/'+id&&!options.method)r={status:200,value:{...state}};
  else throw Error('UNEXPECTED_FIXTURE_ENDPOINT');
  return mutate?.(row,r,seen)??r;
 };
 const a=collector.indexOf("    await functionCheck('write-readback'"),b=collector.indexOf("    await functionCheck('frontend'",a);assert.ok(a>0&&b>a);
 const context={need:(v,c)=>{if(!v)throw Error(c);},request,randomUUID:newKey,childEnv:{MSF_AUTH_USER:'fixture-user',MSF_AUTH_PASS:'fixture-private'},cookie:undefined,functionCheck:async(id,argv,fn)=>{assert.equal(id,'write-readback');result=await fn();}};
 const f=vm.runInNewContext(helper()+'\n(async()=>{'+collector.slice(a,b)+'})',context);
 return {seen,run:async()=>{await f();return result;}};
}
function generatedWrapper(){return renderR28Wrapper(oldWrapper,{candidateFingerprint:r28SourcePins.candidateFingerprint,collectorSHA256:sha(collector),brokerSHA256:r28ToolSHA256.broker,brokerControlSHA256:r28ToolSHA256.brokerControl});}
function python(code,payload){const r=spawnSync('python',['-I','-X','utf8','-c',code],{input:JSON.stringify(payload),encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}

test('new collector exactly derives from old trusted bytes and preserves full checks, timeout and cleanup',async()=>{
 assert.equal(sha(original),fixedToolSHA['project-autonomy-fa01-collector.mjs']);assert.equal(await readFile(new URL('./project-autonomy-fa01-collector-r28.mjs',import.meta.url),'utf8'),collector);
 assert.ok(!collector.includes('const bad = await request'));assert.ok(!collector.includes('invalidLoginRejected: true'));assert.ok(collector.includes("'/tools/project-autonomy-fa01-collector-r28.mjs'"));
 for(const text of ['const deadline = Date.now() + 2700 * 1000;','timeoutMs: 120000','COLLECTOR_PROCESS_STOP_UNCONFIRMED','child.requestStop()','ORIGINAL_REQUIRED_PROTOTYPE_SUITE_REMOVED','ORIGINAL_REQUIRED_TEST_FILE_REMOVED','COVERAGE_BELOW_REQUIRED_BASELINE','FRONTEND_AUTH_NOT_READY','BROWSER_SMOKE_FAILED'])assert.equal(collector.split(text).length,original.toString().split(text).length,text);
});
test('actual login/create/update/archive callback uses four independent UUID command keys and real readbacks',async()=>{
 const f=workflow(),proof=await f.run(),writes=f.seen.filter(x=>x.options.method);assert.deepEqual(writes.map(x=>x.options.method),['POST','POST','PUT','POST']);
 const keys=writes.map(x=>x.options.headers['Idempotency-Key']);assert.equal(new Set(keys).size,4);for(const key of keys)assert.match(key,/^[a-f0-9-]{36}$/);
 for(const row of f.seen.filter(x=>!x.options.method))assert.equal(row.options.headers?.['Idempotency-Key'],undefined);
 assert.equal(proof.createReadback,true);assert.equal(proof.updateReadback,true);assert.equal(proof.archiveReadback,true);assert.equal(proof.invalidLoginRejected,null);assert.equal(proof.invalidLoginCheck.executed,false);assert.equal(proof.invalidLoginCheck.countsAsPassedCheck,false);assert.ok(!JSON.stringify(proof).includes('fixture-private'));
});
test('actual callback remains blocked by invalid auth, cookie, create, update/archive or stale readback',async()=>{
 const mutations=[(row,r)=>row.path==='/api/auth/login'?{...r,status:400}:r,(row,r)=>row.path==='/api/auth/login'?{...r,response:{headers:{get:()=>null}}}:r,(row,r)=>row.options.method==='POST'&&row.path==='/api/projects'?{...r,status:400}:r,(row,r)=>row.options.method==='PUT'?{...r,status:400}:r,(row,r)=>row.path.endsWith('/archive')?{...r,status:400}:r,(row,r)=>!row.options.method&&r.value?.status==='archived'?{...r,value:{...r.value,status:'active'}}:r];
 for(const m of mutations)await assert.rejects(workflow(m).run(),/AUTH_LOGIN_OR_COOKIE_INVALID|PROJECT_CREATE_FAILED|PROJECT_UPDATE_FAILED|PROJECT_ARCHIVE_FAILED|PROJECT_ARCHIVE_READBACK_FAILED/);
});
test('current exact source observation is mandatory; output contains only whitelisted public fields',()=>{
 assert.equal(assertR28Observation({...observation(),privateConfiguration:{password:'fixture-private'}}).kind,'software-factory-r28-source-observation');assert.ok(!JSON.stringify(assertR28Observation({...observation(),privateConfiguration:{password:'fixture-private'}})).includes('fixture-private'));
 for(const change of [{candidateFingerprint:'a'.repeat(64)},{candidateMetadataSHA256:'b'.repeat(64)},{files:607},{originSHA256:'c'.repeat(64)},{originBound:false},{privateEnvironmentCopied:true},{workspace:S.source}])assert.throws(()=>assertR28Observation({...observation(),...change}),/REAL_FROZEN_SOURCE_REQUIRED/);
});
test('configuration retains original denominators and distinct R28 protocol scope without mutating input',()=>{
 const b={requiredTestFiles:Array.from({length:45},(_,i)=>'test'+i),requiredPrototypeSuites:Array.from({length:30},(_,i)=>'suite'+i),minimumCoverage:{lines:90,branches:80}},p={sentinel:{untouched:true}},before=JSON.stringify({b,p}),c=cloneR28Configuration(b,p,observation());assert.equal(JSON.stringify({b,p}),before);assert.deepEqual(c.baseline.requiredTestFiles,b.requiredTestFiles);assert.deepEqual(c.baseline.requiredPrototypeSuites,b.requiredPrototypeSuites);assert.deepEqual(c.policy.authenticationPolicy,r28AuthenticationPolicy);assert.deepEqual(c.policy.sandboxImageContract,r28SandboxImageContract);assert.equal(c.policy.evidenceRoot,V.evidenceRoot);
 assert.throws(()=>cloneR28Configuration({...b,requiredTestFiles:b.requiredTestFiles.slice(1)},p,observation()),/DENOMINATOR_CHANGED/);assert.throws(()=>cloneR28Configuration({...b,minimumCoverage:{lines:89,branches:80}},p,observation()),/DENOMINATOR_CHANGED/);
});
test('generated wrapper exact memory patch compiles; old six SHAs and original timeout/cleanup statements retained',()=>{
 const r=python(String.raw`import json,sys,ast,base64
p=json.load(sys.stdin);w={'__name__':'fixture','__file__':'fixture'};exec(compile(p['wrapper'],'fixture','exec'),w)
raw=base64.b64decode(p['coordinator']);patched=w['patched_r28_coordinator_body'](raw);ast.parse(patched)
assert w['TOOL_SHA256']==p['oldTools']
for before,after in [(b"COLLECTOR = TOOLS / 'project-autonomy-fa01-collector.mjs'",b"COLLECTOR = TOOLS / 'project-autonomy-fa01-collector-r28.mjs'"),(b"BROKER_CONTROL = TOOLS / 'factory-sandbox-broker-control.py'",b"BROKER_CONTROL = TOOLS / 'factory-sandbox-broker-control-r28.py'"),(b"BROKER_ROOT = Path('/var/lib/jarvis-development/101/full-validation')",b"BROKER_ROOT = Path('/var/lib/jarvis-development/101/full-validation-r28')"),(b"str(sock) == '/run/jarvis-ft-sandbox/'",b"str(sock) == '/run/jarvis-ft-sandbox-r28/'")]:
 assert before not in patched and after in patched
for text in [b"not errors and stable and artifacts",b"all(row['executed'] and row['status'] == 'pass' and row['exitCode'] == 0",b"TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE",b"COLLECTOR_PROCESS_RESULT_INVALID",b"ISOLATED_COLLECTOR_TIMEOUT",b"COORDINATOR_TERMINATED",b"SCOPED_CLEANUP_INCOMPLETE",b"networkRemoved",b"source-stability"]:
 assert patched.count(text)==raw.count(text),text.decode()
assert w['WORKSPACE']==p['workspace'] and w['BROKER_ROOT']==p['brokerRoot']
try:w['patched_r28_coordinator_body'](raw+b'changed');raise AssertionError('untrusted coordinator accepted')
except ValueError:pass
print(json.dumps({'passed':True,'rootToolsExecuted':False}))`,{wrapper:generatedWrapper(),coordinator:coordinator.toString('base64'),oldTools:fixedToolSHA,workspace:V.workspace,brokerRoot:V.brokerRoot});assert.equal(r.passed,true);
});
test('actual fixed wrapper rejects weakened inventories, coverage, auth exception or broker hash',()=>{
 const r=python(String.raw`import json,sys
w={'__name__':'fixture','__file__':'fixture'};exec(compile(json.load(sys.stdin),'fixture','exec'),w)
p={'mode':'fa01-isolated-v1','workspace':w['WORKSPACE'],'workPackage':'FA-01','goalSpecHash':w['GOAL_HASH'],'evidenceRoot':w['ROOT'],'sourceFingerprint':w['SOURCE_SHA256'],'expectedChecks':w['REQUIRED'],'imageIds':{x:'sha256:'+'b'*64 for x in ['node','postgres','redis','minio']},'authenticationPolicy':w['R28_AUTHENTICATION_POLICY'],'sandboxImageContract':w['R28_SANDBOX_IMAGE_CONTRACT']}
b={'schemaVersion':1,'kind':'project-autonomy-test-baseline','workspace':w['WORKSPACE'],'sourceFingerprintObserved':w['SOURCE_SHA256'],'requiredTestFiles':list(w['ORIGINAL_TESTS']),'requiredPrototypeSuites':list(w['ORIGINAL_SUITES']),'minimumCoverage':{'lines':90,'branches':80}}
w['validate_config'](p,b);assert len(b['requiredTestFiles'])==45 and len(b['requiredPrototypeSuites'])==30
for x,y in [({**p,'authenticationPolicy':{}},b),({**p,'sandboxImageContract':{**p['sandboxImageContract'],'brokerSHA256':'a'*64}},b),(p,{**b,'requiredTestFiles':b['requiredTestFiles'][1:]}),(p,{**b,'requiredPrototypeSuites':b['requiredPrototypeSuites'][1:]}),(p,{**b,'minimumCoverage':{'lines':90,'branches':79}})]:
 try:w['validate_config'](x,y);raise AssertionError('weakened scope accepted')
 except ValueError:pass
print(json.dumps({'rejections':5}))`,generatedWrapper());assert.equal(r.rejections,5);
});
test('actual wrapper tool loader checks every old and all three new tool hashes before returning bodies',async()=>{
 const broker=await readFile(new URL('./factory-sandbox-broker-r28.py',import.meta.url)),control=await readFile(new URL('./factory-sandbox-broker-control-r28.py',import.meta.url));assert.equal(sha(broker),r28ToolSHA256.broker);assert.equal(sha(control),r28ToolSHA256.brokerControl);
 const files=Object.fromEntries(await Promise.all(Object.keys(fixedToolSHA).map(async name=>[name,(await readFile(new URL('./'+name,import.meta.url))).toString('base64')])));
 const r=python(String.raw`import json,sys,base64
p=json.load(sys.stdin);w={'__name__':'fixture','__file__':'fixture'};exec(compile(p['wrapper'],'fixture','exec'),w)
files={w['TOOLS']+'/'+k:base64.b64decode(v) for k,v in p['files'].items()};files[w['R28_COLLECTOR_PATH']]=base64.b64decode(p['collector']);files[w['R28_BROKER_PATH']]=base64.b64decode(p['broker']);files[w['R28_BROKER_CONTROL_PATH']]=base64.b64decode(p['control']);w['read_trusted']=lambda q:files[q]
assert len(w['tool_bodies']())==9
for path in [w['R28_COLLECTOR_PATH'],w['R28_BROKER_PATH'],w['R28_BROKER_CONTROL_PATH']]:
 original=files[path];files[path]+=b'changed'
 try:w['tool_bodies']();raise AssertionError('new untrusted bytes accepted')
 except ValueError:pass
 files[path]=original
print(json.dumps({'rejections':3,'rootToolsExecuted':False}))`,{wrapper:generatedWrapper(),files,collector:Buffer.from(collector).toString('base64'),broker:broker.toString('base64'),control:control.toString('base64')});assert.equal(r.rejections,3);
});
test('offline inspect is inert and rejects install/start/unsupported arguments',async()=>{
 const r=await localR28Main([]);assert.equal(r.ready,false);assert.equal(r.installed,false);assert.equal(r.remoteReadsPerformed,false);assert.equal(r.verificationDispatched,false);assert.equal(r.modelsInvoked,false);for(const a of [['start'],['install'],['prepare','--execute']])await assert.rejects(localR28Main(a),/PREPARE_ONLY/);
});
