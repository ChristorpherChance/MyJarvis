/** One new controlled production API group. No Root IO, actors or old tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {singleEntryOwnedScopeR33R3Source, singleEntryOwnedScopeR33R3HostProgram,
  verifySingleEntryOwnedScopeR33R3} from './verify-factory-single-entry-owned-scope-r33-r3.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'), json=v=>Buffer.from(JSON.stringify(v));

test('R3 default and unknown fourth actor refuse before Root/evidence with source reread',async()=>{
  let forbidden=0;
  const no=()=>{forbidden++;throw Error('Must not run')};
  const empty=await verifySingleEntryOwnedScopeR33R3({}, {readLocal:no,readRoot:no,writePrivateRaw:no,writePublic:no});
  assert.equal(empty.ready,false);assert.equal(forbidden,0);
  const author=JSON.parse(await readFile('artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-local-preparation-r3-1791891596394-51f911be-57a2-42c3-9f39-7e5b95784fb4.json'));
  const parentReviewPath='artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-r3-1791892476584-08373fde-0676-4dc8-b577-f85e0f4c3a5a.json';
  const parentReviewRaw=await readFile(parentReviewPath);
  assert.equal(sha(parentReviewRaw),'20685b7e4282b590bfb515873a9a227651d41abcd7193a1a01df6e7ea68f11c8');
  const self='scripts/verify-factory-single-entry-owned-scope-r33-r3.mjs';
  const observer='scripts/factory-single-entry-owned-scope-observer-r33-r3.py';
  const selfRaw=await readFile(self),observerRaw=await readFile(observer),program=singleEntryOwnedScopeR33R3HostProgram(observerRaw);
  const staged=new Map();
  for(const r of Object.values(singleEntryOwnedScopeR33R3Source))staged.set(r.path,await readFile(r.path));
  staged.set(self,selfRaw);staged.set(observer,observerRaw);
  const exec={owner:{path:author.sourceRefs[0].path,sha256:author.ownerSHA256},starter:{path:author.sourceRefs[1].path,sha256:author.starterSHA256},
    executionHostProgram:{path:author.hostProgram.path,sha256:author.hostProgramSHA256},sourceReview:{path:parentReviewPath,sha256:sha(parentReviewRaw)},
    journal:{path:'.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-r3-once.json',sha256:null},
    start:{path:'artifacts/software-factory/goals-r29/controlled-r3-start.json',sha256:null},
    terminal:{path:'artifacts/software-factory/goals-r29/controlled-r3-terminal.json',sha256:null}};
  for(const r of [exec.owner,exec.starter,exec.executionHostProgram])staged.set(r.path,await readFile(r.path));
  staged.set(parentReviewPath,parentReviewRaw);
  const nonce='a'.repeat(32),unit='jarvis-single-entry-method-r33-r3-'+nonce+'.service',boot='11111111-1111-1111-1111-111111111111';
  const core=(pid,ppid)=>({pid,ppid,startTicks:String(pid),boot,procDevice:160,procInode:1000+pid});
  const owner={...core(111,1),uid:0,gid:0,unit,controlGroup:'/system.slice/'+unit,invocationId:'b'.repeat(32),
    runtimeMaxSec:80,stopTimeoutSec:10,hardParentBoundSeconds:90,killMode:'control-group',killSignal:'SIGKILL',restart:'no'};
  const fixture={...core(112,111),uid:1000,controlGroup:owner.controlGroup};
  const child=core(113,112);
  const q={kind:'r33-single-entry-method-local-once-r3',nonce,phase:'native',dispatched:true,startUncertain:false,automaticRetry:false,
    ownerSHA256:exec.owner.sha256,starterSHA256:exec.starter.sha256,hostProgramSHA256:exec.executionHostProgram.sha256,review:exec.sourceReview,
    activationSHA256:'4'.repeat(64),onceSHA256:'5'.repeat(64),unitProofSHA256:'6'.repeat(64),stderrSinkProofSHA256:'7'.repeat(64),scope:author.scope,owner};
  const frame={schemaVersion:1,kind:'r33-single-entry-bound-method-parent-observation-r3',nonce,phase:'native',sourceProtocol:'r33-single-entry-owned-method-v3',
    ownerSHA256:exec.owner.sha256,fixtureSHA256:singleEntryOwnedScopeR33R3Source.fixture.sha256,
    generatedSHA256:singleEntryOwnedScopeR33R3Source.native.sha256,buildStaticMappingSHA256:singleEntryOwnedScopeR33R3Source.buildStatic.sha256,
    activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,dispatchSubmitted:true,controlsStable:true,unitConfigVerified:true,
    unit:{Id:unit},unitProofSHA256:q.unitProofSHA256,stderrSinkProofSHA256:q.stderrSinkProofSHA256,
    ownerStderrSinkPresent:true,ownerStderrSHA256:'8'.repeat(64),ownerStderrBytes:0,ownerStderrStructured:true,earlyFailures:[],
    actualMethodIndependentlyQualified:false,currentScopeCleanupIndependentlyVerified:false,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false,
    owner,fixtureProcess:fixture,fixtureSummary:{childIdentity:child},status:'passed',methodSubsetProducerPassed:true};
  const work=author.scope.workReports;
  const start={...frame,readOnly:false},terminal={...frame,readOnly:true,stopped:null,
    reportSHA256:Object.fromEntries(work.map(k=>[k,k==='owner.stderr.raw'?'8'.repeat(64):'9'.repeat(64)])),
    reportBytes:Object.fromEntries(work.map(k=>[k,0]))};
  for(const [r,v] of [[exec.journal,q],[exec.start,start],[exec.terminal,terminal]]){const b=json(v);r.sha256=sha(b);staged.set(r.path,b)}
  const hostRef={path:'artifacts/software-factory/goals-r29/controlled-r3-observation-host.py',sha256:sha(program)};staged.set(hostRef.path,program);
  // Controlled reader review exists in memory only; it is never an actual review artifact.
  const reviewRaw=json({kind:'r33-single-entry-owned-scope-independent-local-review-r3',callerSHA256:sha(selfRaw),observerSHA256:sha(observerRaw),
    hostProgramSHA256:sha(program),staticPreparationReady:true,remainingP0P1:0,remoteOperations:false,isControlledFixture:true});
  const review={path:'artifacts/software-factory/goals-r29/r33-single-entry-owned-scope-independent-local-review-r3-1791890000000-11111111-1111-1111-1111-111111111111.json',sha256:sha(reviewRaw)};
  staged.set(review.path,reviewRaw);
  const activation={schemaVersion:1,kind:'r33-single-entry-owned-scope-read-activation-r3',remoteReadAuthorized:true,callerSHA256:sha(selfRaw),
    observer:{path:observer,sha256:sha(observerRaw)},observationHostProgram:hostRef,review,execution:exec};
  const reads=new Map();let roots=0,writes=0;
  const result=await verifySingleEntryOwnedScopeR33R3({activation},{readLocal:async path=>{reads.set(path,(reads.get(path)??0)+1);assert.ok(staged.has(path));return staged.get(path)},
    readRoot:()=>{roots++;throw Error('No Root')},writePrivateRaw:()=>{writes++;throw Error('No private writes')},writePublic:()=>{writes++;throw Error('No public writes')}});
  assert.equal(result.reason,'R33_OWNED_SCOPE_STOP_IDENTITY_UNKNOWN');assert.equal(result.ready,false);assert.equal(result.remoteReadAttempted,false);
  assert.equal(result.currentOwnedScopeCleanupVerified,false);assert.equal(result.actualMethodSubsetIndependentlyQualified,false);
  assert.equal(roots,0);assert.equal(writes,0);assert.equal(result.sourceRefsStable,true);
  assert.ok([...reads.values()].every(n=>n===2));
});
