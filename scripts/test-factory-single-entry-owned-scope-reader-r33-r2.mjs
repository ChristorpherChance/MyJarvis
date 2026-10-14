/** Only the new R2 admission and thirteenth raw row. No kernel, fixture, Root or remote IO. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {assertOriginalSingleEntryMethodEvidenceR33R2, singleEntryOwnedScopeR33R2Source as S,
  singleEntryOwnedScopeR33R2HostProgram, verifySingleEntryOwnedScopeR33R2} from './verify-factory-single-entry-owned-scope-r33-r2.mjs';
import {singleEntryMethodR33R2Scope} from './start-factory-single-entry-bound-method-r33-r2.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v)+'\n');
async function controlled13(){
  // Reuse only the old data constructor; never import/run its two tests.
  const old=await readFile('scripts/test-factory-single-entry-owned-scope-reader-r33.mjs','utf8');
  let source=old.slice(old.indexOf('const sha ='),old.indexOf("\ntest('default"));
  assert.ok(source.startsWith('const sha =')&&source.endsWith('\n'));
  for(const [a,b] of [
    ['jarvis-single-entry-method-r33-','jarvis-single-entry-method-r33-r2-'],
    ['scripts/factory-single-entry-bound-method-owner-r33.py','scripts/factory-single-entry-bound-method-owner-r33-r2.py'],
    ['r33-single-entry-owned-method-v1','r33-single-entry-owned-method-v2'],
    ['/var/lib/jarvis-single-entry-bound-method-r33/','/var/lib/jarvis-single-entry-bound-method-r33-r2/'],
    ['r33-single-entry-method-root-activation','r33-single-entry-method-root-activation-r2'],
    ['r33-single-entry-method-root-once','r33-single-entry-method-root-once-r2'],
    ['r33-single-entry-method-owner-result','r33-single-entry-method-owner-result-r2'],
    ['r33-single-entry-method-owner-stopped','r33-single-entry-method-owner-stopped-r2'],
    ['r33-single-entry-method-root-unit-proof','r33-single-entry-method-root-unit-proof-r2']
  ])source=source.replaceAll(a,b);
  const make=runInNewContext(source+'\ncontrolledRecords;', {readFile,createHash,Buffer,S});
  const {records,payload}=await make();
  // Cross VM objects become ordinary data at the API boundary.
  const result=JSON.parse(JSON.stringify({records,payload}));
  const proof=JSON.parse(Buffer.from(result.records['unit-proof.json'].base64,'base64'));
  proof.configuration.standardOutput='null';proof.configuration.standardError='append';
  proof.configuration.standardErrorFile='/var/lib/jarvis-single-entry-bound-method-r33-r2/'+payload.nonce+'/work/owner.stderr.raw';
  proof.ownerStderrInitialIdentity=[1,2,0,0,0o100600,1,0,1000000000,1000000000];
  proof.ownerStderrInitialIdentitySHA256=sha(JSON.stringify(proof.ownerStderrInitialIdentity));
  const insert=(name,raw)=>{
    result.records[name]={base64:raw.toString('base64'),sha256:sha(raw),bytes:raw.length};
    result.payload.expectedRawFiles[name]={sha256:sha(raw),bytes:raw.length};
  };
  insert('unit-proof.json',encode(proof));insert('work/owner.stderr.raw',Buffer.alloc(0));
  const parentResult=JSON.parse(Buffer.from(result.records['work/result.json'].base64,'base64'));
  parentResult.methodSubsetProducerPassed=true;insert('work/result.json',encode(parentResult));
  return {...result,insert};
}
test('R2 default null activation and review perform zero dependency IO',async()=>{
  let count=0;const reject=()=>{count++;throw Error('UNEXPECTED_IO')};
  const value=await verifySingleEntryOwnedScopeR33R2({}, {readLocal:reject,readRoot:reject,writePrivateRaw:reject,writePublic:reject});
  assert.equal(value.ready,false);assert.equal(value.localIOPerformed,false);assert.equal(count,0);
  assert.equal(value.fullProtectionQualified,false);
});
test('R2 method raw oracle requires13rows and empty original bound owner stderr',async()=>{
  const data=await controlled13();assert.equal(Object.keys(data.records).length,13);
  const positive=assertOriginalSingleEntryMethodEvidenceR33R2(data.records,data.payload);
  assert.equal(positive.ownerStderrVerifiedEmpty,true);assert.equal(positive.naturalChildExit,true);
  data.insert('work/owner.stderr.raw',Buffer.from('private-controlled-error\n'));
  assert.throws(()=>assertOriginalSingleEntryMethodEvidenceR33R2(data.records,data.payload),/R33_OWNED_SCOPE_OWNER_STDERR_NOT_EMPTY/);
  delete data.records['work/owner.stderr.raw'];
  assert.throws(()=>assertOriginalSingleEntryMethodEvidenceR33R2(data.records,data.payload),/R33_OWNED_SCOPE_ORIGINAL_RECORD_SET_CHANGED/);
});

test('configured R2 reader refuses unknown original owner before any Root or evidence write',async()=>{
  const nonce='a'.repeat(32),unit='jarvis-single-entry-method-r33-r2-'+nonce+'.service';
  const callerPath='scripts/verify-factory-single-entry-owned-scope-r33-r2.mjs';
  const observerPath='scripts/factory-single-entry-owned-scope-observer-r33-r2.py';
  const observerRaw=await readFile(observerPath),callerRaw=await readFile(callerPath),program=singleEntryOwnedScopeR33R2HostProgram(observerRaw);
  const reviewPath='artifacts/software-factory/goals-r29/r33-single-entry-owned-scope-independent-local-review-r2-1791880000000-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json';
  const hostPath='artifacts/software-factory/goals-r29/controlled-r33-r2-host.py';
  const sourceReview={path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-r2-1791885333173-6d374857-b426-4a9b-acd7-ca89eefa0298.json',sha256:'809f45fb702de6270ee6d4d06d7270f6d559ce9fed381958fbd82ca6bf12b952'};
  const review=encode({kind:'r33-single-entry-owned-scope-independent-local-review-r2',callerSHA256:sha(callerRaw),observerSHA256:sha(observerRaw),
    hostProgramSHA256:sha(program),staticPreparationReady:true,remainingP0P1:0,remoteOperations:false});
  const q={kind:'r33-single-entry-method-local-once-r2',nonce,phase:'native',scope:singleEntryMethodR33R2Scope,dispatched:true,startUncertain:false,
    automaticRetry:false,ownerSHA256:singleEntryMethodR33R2Scope.owner.sha256,starterSHA256:'3d19fac9e8efbf743c0072deac6a05c688a47d9f942df677854815d67f070866',
    review:sourceReview,hostProgramSHA256:'6b1d8be1421a3074d439db65e8178d57fb700c49a37d6e38ff30c25b538a529e',activationSHA256:'d'.repeat(64),onceSHA256:'e'.repeat(64),unitProofSHA256:'f'.repeat(64)};
  const frame=readOnly=>({schemaVersion:1,kind:'r33-single-entry-bound-method-parent-observation-r2',nonce,phase:'native',sourceProtocol:singleEntryMethodR33R2Scope.sourceProtocol,
    ownerSHA256:q.ownerSHA256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.native.sha256,buildStaticMappingSHA256:S.buildStatic.sha256,
    activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,readOnly,dispatchSubmitted:true,controlsStable:true,unitConfigVerified:true,
    unit:{Id:unit},unitProofSHA256:q.unitProofSHA256,ownerStderrSinkPresent:true,ownerStderrSHA256:sha(Buffer.alloc(0)),ownerStderrBytes:0,
    ownerStderrStructured:true,earlyFailures:[],owner:null,fixtureProcess:null,status:'failed',
    actualMethodIndependentlyQualified:false,currentScopeCleanupIndependentlyVerified:false,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false});
  const qPath='.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-r2-once.json',startPath='artifacts/software-factory/goals-r29/controlled-r2-start.json',terminalPath='artifacts/software-factory/goals-r29/controlled-r2-terminal.json';
  const values=new Map([[reviewPath,review],[hostPath,program],[qPath,encode(q)],[startPath,encode(frame(false))],[terminalPath,encode(frame(true))]]);
  const memoryRef=path=>({path,sha256:sha(values.get(path))});
  const activation={schemaVersion:1,kind:'r33-single-entry-owned-scope-read-activation-r2',remoteReadAuthorized:true,callerSHA256:sha(callerRaw),
    observer:{path:observerPath,sha256:sha(observerRaw)},observationHostProgram:memoryRef(hostPath),review:memoryRef(reviewPath),
    execution:{starter:{path:'scripts/start-factory-single-entry-bound-method-r33-r2.mjs',sha256:q.starterSHA256},owner:singleEntryMethodR33R2Scope.owner,
      executionHostProgram:{path:'artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-host-source-r2-6b1d8be1421a3074d439db65e8178d57fb700c49a37d6e38ff30c25b538a529e.py',sha256:q.hostProgramSHA256},
      sourceReview,journal:memoryRef(qPath),start:memoryRef(startPath),terminal:memoryRef(terminalPath)}};
  let rootCalls=0,writes=0;
  const value=await verifySingleEntryOwnedScopeR33R2({activation},{readLocal:path=>values.has(path)?values.get(path):readFile(path),
    readRoot:()=>{rootCalls++;throw Error('UNEXPECTED_ROOT')},writePrivateRaw:()=>{writes++;throw Error('UNEXPECTED_WRITE')},writePublic:()=>{writes++;throw Error('UNEXPECTED_WRITE')}});
  assert.equal(value.ready,false);assert.equal(value.reason,'R33_OWNED_SCOPE_OWNER_CHANGED');
  assert.equal(value.originalContextIncomplete,true);assert.equal(value.remoteReadAttempted,false);
  assert.equal(value.actualMethodSubsetIndependentlyQualified,false);assert.equal(value.currentOwnedScopeCleanupVerified,false);
  assert.equal(rootCalls,0);assert.equal(writes,0);assert.equal(value.sourceRefsStable,true);
});

test('failed producer cannot become method-qualified while known current scope remains separate',async()=>{
  const data=await controlled13();
  assert.equal(assertOriginalSingleEntryMethodEvidenceR33R2(data.records,data.payload).naturalChildExit,true);
  const failed=JSON.parse(Buffer.from(data.records['work/result.json'].base64,'base64'));
  failed.methodSubsetProducerPassed=false;data.insert('work/result.json',encode(failed));
  assert.throws(()=>assertOriginalSingleEntryMethodEvidenceR33R2(data.records,data.payload),/R33_OWNED_SCOPE_ORIGINAL_PARENT_METHOD_NOT_PASSED/);
  // Evaluate the actual production gate expressions, not a copied implementation.
  const source=await readFile('scripts/verify-factory-single-entry-owned-scope-r33-r2.mjs','utf8');
  const expression=name=>{const rows=[...source.matchAll(new RegExp('const '+name+' = ([^\\n]+);','g'))];assert.equal(rows.length,1);return rows[0][1]};
  const parentExpression=expression('parentMethodPassed'),methodExpression=expression('methodQualified'),currentExpression=expression('currentCleanup');
  for(const [status,flag,wanted] of [['passed',true,true],['failed',false,false],['passed',false,false],['failed',true,false]]){
    const parentMethodPassed=runInNewContext(parentExpression,{terminalMethodState:{status,methodSubsetProducerPassed:flag}});
    const env={Boolean,host:{currentOwnedScopeCleanupVerified:true},sourcesStable:true,kernelFacts:{naturalChildExit:true},parentMethodPassed};
    assert.equal(runInNewContext(methodExpression,env),wanted);
    assert.equal(runInNewContext(currentExpression,env),true);
  }
});
