/** Real R4 caller in a controlled VM; no SSH, Docker, package or product execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {protectionContractR29R2 as P} from './verify-factory-protection-contract-r29-r2.mjs';
import {assertTargetCleanupR29NativeHost} from './verify-factory-target-cleanup-r29.mjs';
import {assertBuildOnlyR29Scope} from './read-factory-truth-gate-build-scope-r29.mjs';

const path='scripts/start-factory-truth-gate-build-r29-r4.mjs',source=await readFile(path,'utf8');
const body=source.slice(0,source.indexOf('if(process.argv[1]')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const originalProtection=JSON.parse(await readFile('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json','utf8'));
const originalOwner=JSON.parse(await readFile('artifacts/software-factory/goals-r29/build-owner-lifetime-proof-1791823732398-c590b8b8-8d59-4b56-b168-74a9d242fc3b.json','utf8'));
const clone=value=>JSON.parse(JSON.stringify(value)),forbidden=()=>{throw Error('UNEXPECTED_REAL_IO')};
const now=Date.now(),worker=Buffer.from('controlled-r4-worker-byte-fixture-no-execution'),workerSHA=sha(worker);
const reviewBindings=/review:(?:null|'[^']*'),reviewSHA:(?:null|'[a-f0-9]{64}'),ownerLifecycleReview:(?:null|'[^']*'),ownerLifecycleReviewSHA:(?:null|'[a-f0-9]{64}')/;
function review(){return {kind:'r29-r4-bootstrap-and-owner-independent-local-review',workerSHA256:workerSHA,remainingP0P1:0,staticPreparationReady:true,fiveNamesReviewed:true,ownerBeforeEveryCreate:true,durableCreationIntentBeforeCreate:true,hardFailureBlocksCandidateStages:true,stopPostMaximumBudgetSec:240,ownerStopTimeoutSec:300,ownerContractUnchangedFromOriginal:true,actualR4FiveNameLifecycleVerified:false,actualR4NormalBindVerified:false,productAccepted:false};}
function module(frozen=false){
 let text=body.replace(reviewBindings,'review:null,reviewSHA:null,ownerLifecycleReview:null,ownerLifecycleReviewSHA:null');
 if(frozen){
  const r=Buffer.from(JSON.stringify(review()));
  text=text.replace(/toolSHA:'[a-f0-9]{64}'/,`toolSHA:'${workerSHA}'`)
   .replace(reviewBindings,`review:'controlled-review',reviewSHA:'${sha(r)}',ownerLifecycleReview:'controlled-owner-review',ownerLifecycleReviewSHA:'${sha(r)}'`);
 }
 const context={Buffer,Date,randomBytes:()=>Buffer.from('a'.repeat(32),'hex'),randomUUID:()=> 'controlled-uuid',P,sha,canonical,settleEvidenceReads,assertTargetCleanupR29NativeHost,assertBuildOnlyR29Scope,
  open:forbidden,mkdir:forbidden,lstat:forbidden,unlink:forbidden,rename:forbidden,resolve:forbidden,pathToFileURL:forbidden,spawnSync:forbidden,remote:forbidden,lanProfile:null,python:forbidden,safeReadLocal:forbidden,verifyFactoryProtectionContractR29R2:forbidden};
 return vm.runInNewContext(text+';({S,jp,assertR29R4ProtectionProof,assertR29R4Review,assertR29R4HistoricalOwner,buildStartR29R4Names,buildStartR29R4HostProgram,startFactoryTruthGateBuildR29R4})',context,{timeout:1000});
}
function harness(edit={}){
 const M=module(true),rawOwner=Buffer.from(JSON.stringify(originalOwner,null,2)+'\n'),rawProtection=Buffer.from(JSON.stringify(originalProtection,null,2)+'\n'),reader=Buffer.from('controlled-reader-byte-fixture-no-execution');
 // Only byte-adapter SHA bindings are substituted for controlled VM inputs.
 const editedBody=body.replace(/toolSHA:'[a-f0-9]{64}'/,`toolSHA:'${workerSHA}'`)
  .replace(reviewBindings,`review:'controlled-review',reviewSHA:'${sha(JSON.stringify(review()))}',ownerLifecycleReview:'controlled-owner-review',ownerLifecycleReviewSHA:'${sha(JSON.stringify(review()))}'`)
  .replace(/historicalOwnerProofSHA:'[a-f0-9]{64}'/,`historicalOwnerProofSHA:'${sha(rawOwner)}'`)
  .replace(/originalProtectionProofSHA:'[a-f0-9]{64}'/,`originalProtectionProofSHA:'${sha(rawProtection)}'`)
  .replace(/protectionReaderSHA:'[a-f0-9]{64}'/,`protectionReaderSHA:'${sha(reader)}'`);
 const context={Buffer,Date,randomBytes:()=>Buffer.from('a'.repeat(32),'hex'),randomUUID:()=> 'controlled-uuid',P,sha,canonical,settleEvidenceReads,assertTargetCleanupR29NativeHost,assertBuildOnlyR29Scope,open:forbidden,mkdir:forbidden,lstat:forbidden,unlink:forbidden,rename:forbidden,resolve:forbidden,pathToFileURL:forbidden,spawnSync:forbidden,remote:forbidden,lanProfile:null,python:forbidden,safeReadLocal:forbidden,verifyFactoryProtectionContractR29R2:forbidden};
 const F=vm.runInNewContext(editedBody+';({S,jp,startFactoryTruthGateBuildR29R4,buildStartR29R4HostProgram})',context,{timeout:1000});
 let journal=null,receiptCount=0,remoteCalls=0,freshCalls=0,locks=0,releases=0;
 const writes=[],requests=[],publicValues=[];
 const files=new Map([['scripts/factory-truth-gate-build-r29-r4.py',worker],['controlled-review',Buffer.from(JSON.stringify(review()))],['controlled-owner-review',Buffer.from(JSON.stringify(review()))],[F.S.historicalOwnerProof,rawOwner],[F.S.originalProtectionProof,rawProtection],['scripts/verify-factory-protection-contract-r29-r2.mjs',reader]]);
 const d={now:()=>now,readLocal:async p=>{if(p===F.jp){if(!journal)throw Object.assign(Error('missing'),{code:'ENOENT'});return JSON.stringify(journal);}if(!files.has(p))throw Error('UNEXPECTED_LOCAL_PATH');return files.get(p)},
  saveJournal:async q=>{journal=clone(q);writes.push(clone(q));edit.save?.(q,writes.length)},
  acquireLock:async()=>{locks++;return {controlled:true}},releaseLock:async()=>{releases++},
  freshProtection:async()=>{freshCalls++;const p=clone(originalProtection);p.at=new Date(now).toISOString();edit.fresh?.(p);return p},
  writePublicReceipt:async(kind,value)=>{receiptCount++;publicValues.push({kind,value:clone(value)});return {path:'artifacts/software-factory/goals-r29/controlled-'+receiptCount+'.json',sha256:sha(JSON.stringify(value))}},
  remoteHost:async p=>{remoteCalls++;requests.push(clone(p));assert.ok(journal.startAttemptedAt);assert.ok(journal.receipts.freshProtection?.path);if(edit.remote)await edit.remote(p);return {schemaVersion:1,kind:'software-factory-r29-r4-once-build-observation',attempt:p.attempt,at:new Date(now).toISOString(),launchPhase:'dispatched',processIdentity:{pid:700,startTicks:'10',boot:'controlled-boot'},state:null,installedToolSHA256:F.S.toolSHA,modelsInvoked:false,productAccepted:false,automaticRedispatch:false,rawLogsExported:false,privateEnvironmentExported:false,readOnly:p.action==='check'};}};
 return {F,d,invoke:action=>F.startFactoryTruthGateBuildR29R4(action,d),files,writes,requests,publicValues,journal:()=>journal,counts:()=>({remoteCalls,freshCalls,locks,releases,receiptCount})};
}

test('controlled null review bindings reject all actions before journal/API/SSH',async()=>{const M=module();for(const action of ['inspect','start','check']){const result=await M.startFactoryTruthGateBuildR29R4(action,{readLocal:forbidden,acquireLock:forbidden,freshProtection:forbidden,remoteHost:forbidden});assert.equal(result.ready,false);assert.equal(result.reason,'R29_R4_PREPARATION_NOT_FROZEN');}});
test('current frozen worker and local review bytes match the actual configured caller bindings',async()=>{const context={Buffer,Date,randomBytes:forbidden,randomUUID:forbidden,P,sha,canonical,settleEvidenceReads,assertTargetCleanupR29NativeHost,assertBuildOnlyR29Scope,open:forbidden,mkdir:forbidden,lstat:forbidden,unlink:forbidden,rename:forbidden,resolve:forbidden,pathToFileURL:forbidden,spawnSync:forbidden,remote:forbidden,lanProfile:null,python:forbidden,safeReadLocal:forbidden,verifyFactoryProtectionContractR29R2:forbidden};const M=vm.runInNewContext(body+';({S,assertR29R4Review})',context,{timeout:1000});assert.equal(sha(await readFile('scripts/factory-truth-gate-build-r29-r4.py')),M.S.toolSHA);for(const key of ['review','ownerLifecycleReview']){const raw=await readFile(M.S[key]);assert.equal(sha(raw),M.S[key+'SHA']);M.assertR29R4Review(JSON.parse(raw));}});
test('actual captured new contract qualifies and preserves old drift/four-name boundaries',()=>{const M=module();M.assertR29R4ProtectionProof(originalProtection);M.assertR29R4HistoricalOwner(originalOwner);assert.equal(M.buildStartR29R4Names('a'.repeat(32)).length,5);assert.ok(M.buildStartR29R4Names('a'.repeat(32))[0].endsWith('-mount-proof'));});
test('proof rejects source, stock, profile, signatures, tools and invented acceptance',()=>{const M=module();for(const mutate of [p=>p.sources.main.metadataSHA=P.oldMainMetadataSHA256,p=>p.sources.r29.files=608,p=>p.newProtectedInventorySHA256='0'.repeat(64),p=>p.originalContractProtectionVerified=true,p=>p.profileSHA256='0'.repeat(64),p=>p.terminal.signed=false,p=>p.terminal.nonlate=false,p=>p.terminal.resultSHA256='0'.repeat(64),p=>p.fixedTools['project-autonomy-evidence.py']='0'.repeat(64),p=>p.installedSevenTools.brokerSHA256='0'.repeat(64),p=>p.productAccepted=true]){const p=clone(originalProtection);mutate(p);assert.throws(()=>M.assertR29R4ProtectionProof(p),/R29_BUILD_START_/);}});
test('closed actual census rejects missing counts, unknown processes, live owners and extra resources',()=>{const M=module();for(const mutate of [p=>p.observations.nativeSource.scans[0].counts.inspected++,p=>p.observations.nativeSource.nodeACK.counts.logs=1,p=>p.observations.oldBuild.docker.labelScopes[0].networks.push('foreign'),p=>{p.observations.oldBuild.owner.pidAbsent=false;p.observations.oldBuild.owner.complete=false},p=>delete p.observations.nativeSource.scans[0].exitedDuringScan[0].kernelProof.identityBound]){const p=clone(originalProtection);mutate(p);assert.throws(()=>M.assertR29R4ProtectionProof(p),/R29_(?:BUILD_START|CLEANUP|BUILD_CLEANUP)_/);}});
test('fresh proof must be within five minutes and is never inferred from historical success',()=>{const M=module(),p=clone(originalProtection);p.at=new Date(now-300001).toISOString();assert.throws(()=>M.assertR29R4ProtectionProof(p,{fresh:true,now}),/FRESH_PROTECTION_STALE/);p.at=new Date(now+30001).toISOString();assert.throws(()=>M.assertR29R4ProtectionProof(p,{fresh:true,now}),/FRESH_PROTECTION_STALE/);});
test('new R4 static review explicitly keeps actual five-name/bootstrap verification false',()=>{const M=module(true),r=review();M.assertR29R4Review(r);for(const mutate of [r=>r.actualR4FiveNameLifecycleVerified=true,r=>r.actualR4NormalBindVerified=true,r=>r.ownerBeforeEveryCreate=false,r=>r.stopPostMaximumBudgetSec=301]){const x=clone(r);mutate(x);assert.throws(()=>M.assertR29R4Review(x),/R4_REVIEW_UNPROVEN/);}});
test('frozen inspect without journal does not prepare, call protection, or dispatch',async()=>{const h=harness(),r=await h.invoke('inspect');assert.equal(r.reason,'FINITE_BUILD_ATTEMPT_NOT_STARTED');assert.equal(h.journal(),null);assert.deepEqual(h.counts(),{remoteCalls:0,freshCalls:0,locks:0,releases:0,receiptCount:0});});
test('full actual caller preserves complete fresh proof, then durable intent, then one remote start',async()=>{const h=harness(),r=await h.invoke('start');assert.equal(h.requests.length,1);assert.equal(h.requests[0].action,'start');assert.equal(h.writes[0].startAttemptedAt,null);assert.ok(h.writes[1].startAttemptedAt);assert.equal(h.publicValues[0].kind,'r4-fresh-new-protection-contract');assert.deepEqual(h.publicValues[0].value.observations,originalProtection.observations);assert.equal(h.journal().receipts.start.path,r.output);assert.equal(h.journal().receipts.start.sha256,r.sha256);assert.equal(r.independentCleanupVerified,false);assert.equal(r.r4FiveNameLifecycleRequiresActualReadback,true);assert.deepEqual(h.counts(),{remoteCalls:1,freshCalls:1,locks:1,releases:1,receiptCount:2});});
test('uncertain dispatched response cannot repeat start and check sends no install bytes',async()=>{const h=harness({remote:()=>{throw Error('CONTROLLED_RESPONSE_LOSS')}});await assert.rejects(h.invoke('start'),/CONTROLLED_RESPONSE_LOSS/);assert.ok(h.journal().startAttemptedAt);await assert.rejects(h.invoke('start'),/AMBIGUOUS_OR_DUPLICATE/);assert.equal(h.requests.length,1);h.d.remoteHost=async p=>{h.requests.push(clone(p));return {schemaVersion:1,kind:'software-factory-r29-r4-once-build-observation',attempt:p.attempt,installedToolSHA256:h.F.S.toolSHA,modelsInvoked:false,productAccepted:false,automaticRedispatch:false,rawLogsExported:false,privateEnvironmentExported:false,readOnly:true}};await h.invoke('check');const p=h.requests.at(-1);assert.equal(p.action,'check');assert.equal(p.toolBase64,null);assert.equal(p.freshProtectionSHA256,null);assert.equal(h.counts().freshCalls,1);});
test('fresh failure is retained but cannot write dispatch intent or touch remote',async()=>{const h=harness({fresh:p=>p.fullQueueSQLVerified=false});await assert.rejects(h.invoke('start'),/NEW_INVENTORY_OR_QUEUE_UNPROVEN/);assert.equal(h.publicValues.length,1);assert.equal(h.publicValues[0].value.fullQueueSQLVerified,false);assert.equal(h.requests.length,0);assert.equal(h.journal().startAttemptedAt,null);});
test('durable intent save failure blocks remote start',async()=>{const h=harness({save:(q,i)=>{if(i===2)throw Error('CONTROLLED_DURABLE_IO_FAILURE')}});await assert.rejects(h.invoke('start'),/CONTROLLED_DURABLE_IO_FAILURE/);assert.equal(h.requests.length,0);assert.equal(h.counts().releases,1);});
test('pending local reads settle before a rejected dependency escapes',async()=>{const h=harness();let done=false;h.d.readLocal=p=>p==='controlled-review'?Promise.reject(Error('CONTROLLED_READ_FAILURE')):new Promise(resolve=>setTimeout(()=>{done=true;resolve(h.files.get(p))},5));await assert.rejects(h.invoke('start'),/CONTROLLED_READ_FAILURE/);assert.equal(done,true);assert.equal(h.requests.length,0);});
test('actual assembled Python guard refuses unfrozen scope before any IO and closes five names/two label scopes',()=>{
 const M=module(),program=M.buildStartR29R4HostProgram();
 const py=String.raw`import ast,json,sys
v=json.load(sys.stdin);tree=ast.parse(v);compile(tree,'<r4-root>','exec')
scope=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='expected_scope' for x in n.targets));i=tree.body.index(scope)
def need(ok,code):
 if not ok:raise RuntimeError(code)
env={'json':json,'re':__import__('re'),'need':need}
try:exec(compile(ast.Module(body=[scope,tree.body[i+1]],type_ignores=[]),'<r4-frozen-guard>','exec'),env);raise AssertionError('unfrozen accepted')
except RuntimeError as e:assert str(e)=='R29_BUILD_START_PREPARATION_NOT_FROZEN'
names=next(n for n in ast.walk(tree) if isinstance(n,ast.List) and len(n.elts)==5 and isinstance(n.elts[0],ast.Constant) and n.elts[0].value=='mount-proof');assert [x.value for x in names.elts]==['mount-proof','offline-install','build','typecheck','truth-unit']
text=v;assert "['network','ls','-q']" in text and "['volume','ls','-q']" in text and text.count("time.time()-protection_at<300")==2
assert 'freshProtectionSHA256' in text and "RuntimeMaxSec=1800" in text and "TimeoutStopSec=300" in text
print(json.dumps({'ASTCompiled':True,'defaultUnfrozenRootRefused':True,'fiveNames':5,'labelScopes':2,'freshnessChecks':2}))`;
 const r=spawnSync('python',['-c',py],{input:JSON.stringify(program),encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).fiveNames,5);
});
