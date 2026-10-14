import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pg4QAStartupR33Protocol,validatePG4QAStartupR33Input,runPG4QAStartupR33,assertPG4QAStartupR33Context,assertPG4QAStartupR33Fresh,recordPG4QAStartupR33FixtureIntent,assertPG4QAStartupR33PriorScope} from './factory-pg4-qa-startup-driver-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),B=x=>Buffer.from(JSON.stringify(x)+'\n');
async function controlled(){
 const memory=new Map(),put=(path,raw)=>{memory.set(path,raw);return{path,sha256:sha(raw)}};
 const driver=await readFile(new URL('./factory-pg4-qa-startup-driver-r33.mjs',import.meta.url));
 const reporter=await readFile(new URL('./factory-pg4-hook-reporter-r33.mjs',import.meta.url));
 const R='/work/source/apps/server',fixture=R+'/src/modules/test/truth-gate.integration.test.ts';
 // The true fixture bytes are not executed. Its declared hash is supplied to the controlled adapter below.
 const fixtureH='c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a';
 const own=put('/tools/driver.mjs',driver),node=Buffer.from('controlled-node-binary-not-Linux');put('/usr/local/bin/node',node);
 const modules=['vitest/node','vitest/reporters','vitest/runners','vite','vite-node/client','vite-node/server','@vitest/runner','@vitest/runner/utils','@vitest/expect','@vitest/snapshot','@vitest/spy','chai','trusted-pg4-hook-reporter'].map(specifier=>{
  const path=specifier==='trusted-pg4-hook-reporter'?'/tools/hook-reporter.mjs':'/work/source/node_modules/controlled/'+specifier.replaceAll('/','_').replaceAll('@','')+'.mjs';
  const raw=specifier==='trusted-pg4-hook-reporter'?reporter:Buffer.from('controlled module '+specifier);put(path,raw);
  return{specifier,resolvedPath:path,sha256:sha(raw),bytes:raw.length,exports:[{name:specifier==='vitest/node'?'createVitest':specifier==='vitest/reporters'?'JsonReporter':specifier==='trusted-pg4-hook-reporter'?'default':'value',type:'function'}]};
 });
 const plugin=Buffer.from('controlled builtin source'),pr=put('/tools/admission/builtin-source.mjs',plugin);
 const w=['vitest.workspace','vitest.projects'].flatMap(n=>['.ts','.mts','.cts','.js','.mjs','.cjs','.json'].map(e=>n+e));
 const fixedRuntime={contractSHA256:'27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71',artifactRootIdentity:{device:66306,inode:7924569},manifestSHA256:'b'.repeat(64),mountedRoot:'/work',runtimeWitness:null,mountWitness:null};
 const source={fixturePath:fixture,fixtureSHA256:fixtureH,effectiveSourceSHA256:'b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed',sourceWitness:null,readonlyOverlayWitness:null};
 const images={runnerImageID:'sha256:'+'c'.repeat(64),postgresImageID:'sha256:'+'d'.repeat(64),imageWitness:null};
 const essentialManifestExpectations={node:{path:'/usr/local/bin/node',sha256:sha(node),bytes:node.length},modules,internalPluginSources:[{...pr,bytes:plugin.length}],workspaceBasenames:w};
 const config={testTimeoutMilliseconds:10000,hookTimeoutMilliseconds:10000,builtinPluginSummaries:[{name:'controlled-internal',hookTypes:{config:'function'}}]};
 const workerH='e'.repeat(64),sqlDriverH='f'.repeat(64),sqlSourceH='1'.repeat(64);
 const sc={kind:'r33-pg4-qa-startup-source-contract',protocol:pg4QAStartupR33Protocol,driverSHA256:own.sha256,workerSHA256:workerH,sqlDriverSHA256:sqlDriverH,sqlSourceSHA256:sqlSourceH,driverInputExpectations:structuredClone({fixedRuntime,source,images,essentialManifestExpectations,config})};
 sc.driverInputExpectations.essentialManifestExpectations.node.sha256=null;sc.driverInputExpectations.essentialManifestExpectations.node.bytes=null;
 const cr=put('/tools/admission/sourceContract.json',B(sc));
 const rv=put('/tools/admission/sourceReview.json',B({kind:'r33-pg4-qa-startup-independent-local-review',driverSHA256:own.sha256,workerSHA256:workerH,staticPreparationReady:true,remainingP0P1:0,isControlledFixture:true}));
 for(const[k,obj]of [['runtimeWitness',fixedRuntime],['mountWitness',fixedRuntime],['sourceWitness',source],['readonlyOverlayWitness',source],['imageWitness',images]])obj[k]=put('/tools/admission/'+k+'.json',B({sourceContractSHA256:cr.sha256,isControlledFixture:true}));
 const now=Date.parse('2026-10-14T00:00:00Z'),at=new Date(now).toISOString(),expiresAt=new Date(now+299999).toISOString();
 const fresh={kind:'software-factory-r33-current-main-single-entry-protection-observation',consumerSHA256:'2'.repeat(64),at,isControlledFixture:true};
 const prior={schemaVersion:1,kind:'r33-pg4-prior-r6-scope-admission',qualificationRef:{path:'artifacts/software-factory/goals-r29/r33-current-main-r6-scope-actual-read-1791912222149-5a007401-3410-48a9-a8d2-259e0acac3fc.json',sha256:'3830f22f633cf4d9694a2d44795936a4560019972eb7cb148e49b9c4370f353d'},auditRef:{path:'artifacts/software-factory/goals-r29/r33-current-main-r6-scope-saved-evidence-independent-limited-audit-1791913112083-2050fde5-3732-4035-b01b-f93c5f522fe7.json',sha256:'2dd222daac519dc4fd2e5497108b277e136c8014c69fe443bb624e698c93010c'},observedAt:'2026-10-13T17:23:42.075Z',historicalNotFreshAdmission:true,currentBatchClosureClaimed:false};
 const freshRef=put('/tools/admission/freshProtection.json',B(fresh)),closure=put('/tools/admission/priorScopeAdmission.json',B(prior)),absence=put('/tools/admission/preScopeAbsence.json',B({observedAt:at,isControlledFixture:true}));
 const runtimeQualification=put('/tools/admission/runtimeQualification.json',B({isControlledFixture:true}));
 const issuerSource=put('/tools/admission/issuerSource.mjs',Buffer.from('controlled issuer')),issuerReview=put('/tools/admission/issuerReview.json',B({isControlledFixture:true}));
 const bootstrap=B({sourceContractSHA256:cr.sha256,isControlledFixture:true});put('/tools/sql-bootstrap.json',bootstrap);
 const baseline={kind:'r33-pg4-independent-sql-result',phase:'bootstrap',status:'complete',actualPG4Qualified:false,overallSourceFamilyQualified:false,attempt:'a'.repeat(32),requestSHA256:sha(bootstrap),sourceContractSHA256:cr.sha256,driverSHA256:sqlDriverH,sqlSourceSHA256:sqlSourceH,schemaIdentitySHA256:'3'.repeat(64),migrationsSHA256:'4'.repeat(64),businessRowsSHA256:'5'.repeat(64),isControlledFixture:true};
 const baselineRef=put('/tools/sql-baseline.json',B(baseline));
 const frame={kind:'r33-pg4-qa-pre-fixture-physical-admission',schemaVersion:1,protocol:pg4QAStartupR33Protocol,attempt:baseline.attempt,sourceContractSHA256:cr.sha256,driverSHA256:own.sha256,workerSHA256:workerH,issuerSource,issuerReview,observedAt:at,expiresAt,source:{originalRuntimeContractSHA256:fixedRuntime.contractSHA256,fixtureSHA256:fixtureH,effectiveSourceFingerprint:source.effectiveSourceSHA256,fileCount:625,totalBytes:18413597,overlayReadOnly:true},runtime:{rootIdentity:fixedRuntime.artifactRootIdentity,manifestSHA256:fixedRuntime.manifestSHA256},nodeExecutable:{...essentialManifestExpectations.node,runnerImageID:images.runnerImageID},credentials:{uid:1000,gid:1000,nnp:1,capEff:'0000000000000000',capPrm:'0000000000000000',capInh:'0000000000000000',capAmb:'0000000000000000'},protection:{proofSHA256:freshRef.sha256,kind:fresh.kind,consumerSHA256:fresh.consumerSHA256,observedAt:at},priorScopeAdmission:{proofSHA256:closure.sha256,observedAt:prior.observedAt,historicalNotFreshAdmission:true,currentBatchClosureClaimed:false},preScopeAbsence:{proofSHA256:absence.sha256,observedAt:at},evidenceRefs:[{...issuerSource,bytes:memory.get(issuerSource.path).length}],isControlledFixture:true};
 const input={schemaVersion:1,kind:'r33-pg4-qa-startup-driver-input',protocol:pg4QAStartupR33Protocol,attempt:baseline.attempt,sourceContractHash:cr.sha256,fixedRuntime,source,images,essentialManifestExpectations,config,preAdmission:{sourceContract:cr,sourceReview:rv,runtimeQualification,freshProtection:freshRef,priorScopeAdmission:closure,preScopeAbsence:absence,expiresAt,physicalFrame:frame},sqlBaseline:{before:baselineRef,schemaIdentitySHA256:baseline.schemaIdentitySHA256,migrationsSHA256:baseline.migrationsSHA256,businessRowsSHA256:baseline.businessRowsSHA256}};
 const counters={read:0,imports:0,start:0,close:0,writes:[]};
 let poison=false;
 class Json{constructor(options){this.options=options}}class Hook{}
 const deps={isControlledFixture:true,now:()=>now,readHeld:async p=>{counters.read++;const b=memory.get(p);if(!b)throw Error('R33_CONTROLLED_SOURCE_MISSING');return b},profile:async()=>({uid:1000,gid:1000,execPath:'/usr/local/bin/node',versions:{node:'controlled',v8:'controlled',modules:'controlled'},status:'NoNewPrivs:\t1\nCapEff:\t0000000000000000\nCapPrm:\t0000000000000000\nCapInh:\t0000000000000000\nCapAmb:\t0000000000000000\n'}),pathAbsent:async()=>true,writeEvidence:async(path,value)=>{counters.writes.push({path,value});const b=B(value);return{path,sha256:sha(b),bytes:b.length}},importModule:async url=>{
  counters.imports++;const m=modules.find(x=>new URL(url).pathname===x.resolvedPath);assert.ok(m);
  if(m.specifier==='vitest/node')return{createVitest:async(mode,o)=>({config:{...o,testNamePattern:new RegExp(o.testNamePattern),runner:poison?'candidate-runner':undefined},server:{config:{configFile:false,cacheDir:'/tmp/pg4-vite-cache',plugins:[{name:'controlled-internal',config(){}}]}},projects:[{config:{root:R}}],reporters:o.reporters,start:async()=>{assert.ok(counters.writes.some(x=>x.path==='/evidence/pg4-startup-frame.json'));counters.start++},close:async()=>{counters.close++}})};
  if(m.specifier==='vitest/reporters')return{JsonReporter:Json};if(m.specifier==='trusted-pg4-hook-reporter')return{default:Hook};return{value(){}};
 }};
 // Exact pinned fixture SHA remains a separate source-read gate; no fabricated bytes bypass it.
 return{input,deps,counters,memory,fixture,poison:()=>{poison=true}};
}
test('driver default and malformed physical admission refuse before dependency IO',async()=>{
 let touches=0;const d=new Proxy({}, {get(){touches++;throw Error('DEPENDENCY_TOUCHED')}});
 assert.equal((await runPG4QAStartupR33(null,d)).ready,false);assert.equal(touches,0);
 assert.equal(validatePG4QAStartupR33Input(null).ready,false);
 await assert.rejects(runPG4QAStartupR33({schemaVersion:1},d),/R33_PG4_DRIVER_INPUT_REQUIRED/);assert.equal(touches,0);
});
test('driver controlled source gates preserve missing exact fixture and never launch',async()=>{
 const f=await controlled();const result=await runPG4QAStartupR33(f.input,f.deps);
 assert.equal(result.status,'incomplete');assert.equal(result.errorCode,'R33_CONTROLLED_SOURCE_MISSING');assert.equal(result.startsAttempted,0);assert.equal(f.counters.imports,0);assert.equal(result.PG4Qualified,false);assert.equal(result.actualStartupObserved,false);assert.equal(result.isControlledFixture,true);
 const invalid=structuredClone(f.input);invalid.essentialManifestExpectations.workspaceBasenames.pop();assert.throws(()=>validatePG4QAStartupR33Input(invalid),/R33_PG4_DRIVER_MODULE_EXPECTATIONS_REQUIRED/);
 const extra=structuredClone(f.input);extra.config.candidate=true;assert.throws(()=>validatePG4QAStartupR33Input(extra),/R33_PG4_DRIVER_CONFIG_REQUIRED/);
});
test('driver actual context predicate binds normalized regex and reporter references without worker instance',async()=>{
 const f=await controlled(),R='/work/source/apps/server',titles=[
  'orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis',
  'invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards',
  'places a manual revision strictly after a future prior timestamp without JavaScript rounding',
  'allows only one real concurrent selftest start and orders it after a future prior selftest',
 ];
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern='(?:'+titles.map(escape).join('|')+')$';
 const a={options:{outputFile:'/evidence/pg4-vitest-result.json'}},b={};
 const c={config:{mode:'test',root:R,watch:false,retry:0,allowOnly:false,passWithNoTests:false,setupFiles:[],globalSetup:[],include:['src/modules/test/truth-gate.integration.test.ts'],includeSource:[],testNamePattern:new RegExp(pattern),testTimeout:10000,hookTimeout:10000,coverage:{enabled:false},browser:{enabled:false},ui:false,api:false},server:{config:{configFile:false,cacheDir:'/tmp/pg4-vite-cache',plugins:[{name:'controlled-internal',config(){}}]}},projects:[{config:{root:R}}],reporters:[a,b]};
 assert.deepEqual(assertPG4QAStartupR33Context(c,f.input,a,b),f.input.config.builtinPluginSummaries);
 assert.equal(c.testRunner,undefined);c.config.runner='custom';assert.throws(()=>assertPG4QAStartupR33Context(c,f.input,a,b),/NORMALIZED_CONFIG_CHANGED/);delete c.config.runner;
 c.reporters=[a,{}];assert.throws(()=>assertPG4QAStartupR33Context(c,f.input,a,b),/CONTEXT_OR_REPORTER_CHANGED/);c.reporters=[a,b];
 c.config.testNamePattern=pattern;assert.throws(()=>assertPG4QAStartupR33Context(c,f.input,a,b),/NORMALIZED_CONFIG_CHANGED/);
});
test('final admission: expiry and durable may intent precede the sole controlled start',async()=>{
 const f=await controlled(),fresh=JSON.parse(f.memory.get('/tools/admission/freshProtection.json')),gateRef={path:'/evidence/pg4-startup-frame.json',sha256:'7'.repeat(64),bytes:100},now=Date.parse(fresh.at);let writes=0,starts=0;
 const execute=async(clock,writer)=>{const r=await recordPG4QAStartupR33FixtureIntent(f.input,fresh,gateRef,{isControlledFixture:true,now:clock,writeEvidence:writer});assertPG4QAStartupR33Fresh(f.input,fresh,clock());starts++;return r;};
 await assert.rejects(execute(()=>now+300000,async()=>{writes++}),/FINAL_ADMISSION_EXPIRED/);assert.equal(writes,0);assert.equal(starts,0);
 const first=Error('CONTROLLED_WRITE_FAILURE');await assert.rejects(execute(()=>now,async()=>{writes++;throw first}),e=>e===first);assert.equal(starts,0);
 let current=now;await assert.rejects(execute(()=>current,async(path,value)=>{assert.equal(value.candidateMayHaveExecuted,true);assert.equal(value.codeExecuted,null);assert.deepEqual(value.gateRef,gateRef);current=now+300000;const raw=B(value);return{path,sha256:sha(raw),bytes:raw.length}}),/FINAL_ADMISSION_EXPIRED/);assert.equal(starts,0);
 const order=[];const r=await execute(()=>now,async(path,value)=>{order.push('durable-intent');assert.equal(value.maximumStarts,1);assert.equal(value.automaticRetry,false);assert.equal(value.attempt,f.input.attempt);assert.equal(value.sourceContractSHA256,f.input.sourceContractHash);assert.equal(value.driverSHA256,f.input.preAdmission.physicalFrame.driverSHA256);assert.equal(value.candidateMayHaveExecuted,true);assert.equal(value.codeExecuted,null);const raw=B(value);return{path,sha256:sha(raw),bytes:raw.length}});order.push('start');assert.equal(starts,1);assert.deepEqual(order,['durable-intent','start']);assert.equal(r.path,'/evidence/pg4-fixture-start-intent.json');
});

test('phase role: historical prior scope stays distinct from terminal current closure',async()=>{
 const f=await controlled(),r=f.input.preAdmission.priorScopeAdmission,v=JSON.parse(f.memory.get(r.path)),binding=f.input.preAdmission.physicalFrame.priorScopeAdmission;
 assert.equal(assertPG4QAStartupR33PriorScope(v,binding,r.sha256),true);assert.equal(validatePG4QAStartupR33Input(f.input).preAdmission.priorScopeAdmission.path,r.path);
 for(const bad of [{...v,currentBatchClosureClaimed:true},{...v,observedAt:'2026-10-14T00:00:00Z'},{...v,qualificationRef:{...v.qualificationRef,sha256:'0'.repeat(64)}}])assert.throws(()=>assertPG4QAStartupR33PriorScope(bad,binding,r.sha256),/PRIOR_SCOPE_UNBOUND/);
 const old=structuredClone(f.input);old.preAdmission.currentScopeClosure=old.preAdmission.priorScopeAdmission;delete old.preAdmission.priorScopeAdmission;assert.throws(()=>validatePG4QAStartupR33Input(old),/ADMISSION_REQUIRED/);assert.equal(f.counters.imports,0);assert.equal(f.counters.start,0);
});
