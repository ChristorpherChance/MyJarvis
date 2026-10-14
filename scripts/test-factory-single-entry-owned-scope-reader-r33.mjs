/** Two controlled data-only boundaries; no fixture/OS acquisition, dispatch or remote access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertOriginalSingleEntryMethodEvidenceR33, singleEntryOwnedScopeR33Source as S, verifySingleEntryOwnedScopeR33} from './verify-factory-single-entry-owned-scope-r33.mjs';
const sha = raw => createHash('sha256').update(raw).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value) + '\n');
const selected = {SingleEntryR33:'34b11bfa298198de1d6476c0d41cfef28b7912e95dfc2692446fce0a3528a495',
  SingleEntryDirectoryR33:'a0b59cc1a28b47715b24f2b1ffd6f949b56c039e5d48dfe156b74fa70b33dd17',
  process_record:'d6cf839ecd4cc6fba03b7c4f6a44b6cf73180ef5809d8fc8d79914902139f640',
  pidfd_poll:'94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533',
  pidfd_exit_proof:'ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109'};
async function controlledRecords({badKernel=false}={}) {
  const nonce='a'.repeat(32), unit='jarvis-single-entry-method-r33-'+nonce+'.service', group='/system.slice/'+unit;
  const boot='328726a0-5495-4892-b0a6-2fa9de26242e', invocationId='b'.repeat(32), reviewSHA='c'.repeat(64);
  const ownerRaw=await readFile('scripts/factory-single-entry-bound-method-owner-r33.py'), ownerSHA=sha(ownerRaw);
  const common={schemaVersion:1,nonce,phase:'native',sourceProtocol:'r33-single-entry-owned-method-v1',ownerSHA256:ownerSHA,
    fixtureSHA256:S.fixture.sha256,generatedSHA256:S.native.sha256,buildStaticMappingSHA256:S.buildStatic.sha256,
    fixtureWorkSeconds:45,runtimeMaxSec:80,timeoutStopSec:10,hardParentBoundSeconds:90};
  const activation={...common,kind:'r33-single-entry-method-root-activation',parentReview:{path:'controlled-review.json',sha256:reviewSHA}};
  const activationRaw=bytes(activation), activationSHA256=sha(activationRaw);
  const once={...common,kind:'r33-single-entry-method-root-once',unit,activationSHA256}, onceRaw=bytes(once), onceSHA256=sha(onceRaw);
  const core=(pid,ppid)=>({pid,ppid,startTicks:String(100+pid),boot,procDevice:24,procInode:1000+pid});
  const owner={...core(10,1),uid:0,gid:0,unit,controlGroup:group,invocationId,ownerSHA256:ownerSHA,
    fixtureSHA256:S.fixture.sha256,generatedSHA256:S.native.sha256,activationSHA256,onceSHA256,
    profile:{realEffectiveSavedUID:[0,0,0],realEffectiveSavedGID:[0,0,0],capabilities:{CapEff:'e2',CapPrm:'e2',CapInh:'0',CapAmb:'0'},
      noNewPrivileges:1,rootCapabilitiesAreZero:false,generatedDefinitionsLoaded:false,methodExecutedAsRoot:false},
    selfPIDFD:{requestedPID:10,attached:true,identityBound:true,livePollEvents:0}};
  const fixture={...core(11,10),uid:1000,controlGroup:group,argvSHA256:'d'.repeat(64),commandSHA256:'e'.repeat(64)}, child=core(12,11);
  const originalBoundExitProof={pid:12,boot,listedProcIdentity:{device:24,inode:1012},processIdentity:child,
    kernelProof:{type:'pidfd-POLLIN',attached:true,identityBound:true,requestedPID:12,exitConfirmed:true,pollEvents:badKernel?0:17,procPathAbsent:true}};
  const f={schemaVersion:1,kind:'r33-single-entry-bound-method-fixture-result',phase:'native',fixtureQualified:true,methodSubsetExercised:true,
    fixturePhase:'COMPLETE',firstFailure:null,secondaryFailures:[],readyProtocolSHA256:'b7648b15b26e79747f5dd39557acde5a710b8efd9b7e4172eee10de00dbaa408',
    readyHandshakeCompleted:true,releaseGateSent:true,naturalChildExit:true,childReaped:true,descriptorClosed:true,signalsSent:false,
    childExitCode:0,internalWorkSeconds:45,cleanupWaitSeconds:[3,3],requiredParentWorkSeconds:80,requiredParentStopSeconds:10,requiredParentTotalSeconds:90,
    source:{phase:'native',generatedSourceSHA256:S.native.sha256,generatorSHA256:S.generator.sha256,pureModuleSHA256:S.pureModule.sha256,
      selectedSourceSHA256:selected,wholeProgramTopLevelExecuted:false,censusDefinitionLoaded:false,actualSourceMappingQualified:false},
    runtime:{fixtureIdentity:core(11,10),realEffectiveSavedUID:[1000,1000,1000],realEffectiveSavedGID:[1000,1000,1000],noNewPrivileges:1,
      isolatedPython:true,rootOwnerProfileAsserted:false,cgroups:[group],capabilities:{CapEff:'0',CapPrm:'0',CapInh:'0'}},
    childIdentity:child,requestedChildPID:12,liveRecord:{...child,uid:1000,state:'S',cgroups:[group]},originalBoundExitProof,
    descriptorLedger:[{closeAttempted:true,closed:true,closeError:null}],
    descriptorLedgerScope:'explicit fixture allocations and selected-function os.open/os.close; excludes standard streams and transient Popen implementation handles',
    selfAcquisition:{numericPIDPathUsed:true,eofObserved:true,adapterMatchedPrimitiveWithoutDotEntries:true,adapterBorrowedFDStayedOpen:true,
      primitiveRecords:[{recordBytes:24}],primitiveCallsIncludingEOF:2},
    childFDAcquisition:{borrowedFDStayedOpen:true,getfdUsed:false,knownPipeSlots:{'4':{matched:true},'6':{matched:true}},foreignPIDRead:false,targetsReadAsContents:false,
      childSecurity:{UID:[1000,1000,1000,1000],GID:[1000,1000,1000,1000],noNewPrivileges:'1',capabilities:{CapEff:'0',CapPrm:'0',CapInh:'0'}}}};
  for(const key of ['wholeProgramQualified','fullProtectionQualified','fullProcCensusExecuted','foreignProcessInspected','protectedInventoryRead','nodeACKRead',
    'queueRead','productCodeExecuted','modelsInvoked','getfdFallbackUsed','entryToPIDRaceEliminated','externalHoldersAbsenceProved',
    'parentImplementedByThisFixture','independentClosureVerified','rawArgvExported','privateEnvironmentExported'])f[key]=false;
  const fraw=bytes(f), stderr=Buffer.alloc(0), parentProof={type:'parent-owned-fixture-pidfd-POLLIN',requestedPID:11,processIdentity:fixture,
    attached:true,identityBound:true,exitConfirmed:true,pollEvents:17,procPathAbsent:true};
  const result={schemaVersion:1,kind:'r33-single-entry-method-owner-result',nonce,phase:'native',sourceProtocol:common.sourceProtocol,
    owner,fixtureProcessIdentity:fixture,fixtureResult:f,fixtureExitCode:0,requestedFixturePID:11,fixtureStdoutSHA256:sha(fraw),fixtureStderrSHA256:sha(stderr),
    fixturePIDFDClosed:true,ownerSelfPIDFDClosed:true,emergencyStopAttempted:false,firstFailure:null,secondaryFailures:[],fixtureKernelExitProof:parentProof};
  for(const key of ['actualMethodIndependentlyQualified','currentScopeCleanupIndependentlyVerified','fullProtectionQualified','productCodeExecuted','modelsInvoked','buildWholeProgramExecuted'])result[key]=false;
  const root='/var/lib/jarvis-single-entry-bound-method-r33/'+nonce;
  const config={rootUID:0,rootGID:0,rootCapabilityMask:226,fixtureUID:1000,fixtureGID:1000,runtimeMaxSec:80,timeoutStopSec:10,totalParentSeconds:90,
    killMode:'control-group',killSignal:'SIGKILL',restart:'no',noNewPrivileges:true,ambientCapabilitiesEmpty:true,privateNetwork:true,
    execStartSHA256:sha(JSON.stringify(['/usr/bin/python3','-I',root+'/control/owner.py','--run',nonce])),
    execStopPostSHA256:sha(JSON.stringify(['/usr/bin/python3','-I',root+'/control/owner.py','--stopped',nonce]))};
  const unitProof={kind:'r33-single-entry-method-root-unit-proof',nonce,unit,invocationId,ownerSHA256:ownerSHA,activationSHA256,onceSHA256,configuration:config};
  const stopped={kind:'r33-single-entry-method-owner-stopped',nonce,unit,invocationId,ownerSHA256:ownerSHA,activationSHA256,
    serviceResult:'success',exitCode:'exited',exitStatus:'0'};
  const raws={'control/owner.py':ownerRaw,'control/fixture.py':await readFile(S.fixture.path),'control/generated.py':await readFile(S.native.path),
    'control/activation.json':activationRaw,'control/once.json':onceRaw,'work/owner.json':bytes(owner),'work/fixture-process.json':bytes(fixture),
    'work/fixture.stdout.json':fraw,'work/fixture.stderr.raw':stderr,'work/result.json':bytes(result),'work/stopped.json':bytes(stopped),'unit-proof.json':bytes(unitProof)};
  const records=Object.fromEntries(Object.entries(raws).map(([name,raw])=>[name,{base64:raw.toString('base64'),sha256:sha(raw),bytes:raw.length}]));
  const payload={nonce,owner,fixture,child,invocationId,activationSHA256,onceSHA256,
    sourceExpected:{ownerSHA256:ownerSHA,sourceReviewSHA256:reviewSHA},expectedRawFiles:Object.fromEntries(Object.entries(records).map(([name,row])=>[name,{sha256:row.sha256,bytes:row.bytes}]))};
  return {records,payload};
}

test('default prepared reader performs zero dependency IO',async()=>{
  let called=0;const reject=()=>{called++;throw Error('UNEXPECTED_IO')};
  const value=await verifySingleEntryOwnedScopeR33({}, {readLocal:reject,readRoot:reject,writePrivateRaw:reject,writePublic:reject});
  assert.equal(value.ready,false);assert.equal(value.localIOPerformed,false);assert.equal(called,0);
});

test('typed raw oracle requires actual kernel event even when every producer success flag is true',async()=>{
  const positive=await controlledRecords();
  assert.equal(assertOriginalSingleEntryMethodEvidenceR33(positive.records,positive.payload).naturalChildExit,true);
  const negative=await controlledRecords({badKernel:true});
  assert.throws(()=>assertOriginalSingleEntryMethodEvidenceR33(negative.records,negative.payload),/R33_OWNED_SCOPE_ORIGINAL_CHILD_EXIT_UNPROVEN/);
});
