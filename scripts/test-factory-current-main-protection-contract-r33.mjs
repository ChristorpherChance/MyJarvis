/** Three new local data/DI groups. No Root, API, candidate, model, or Python program execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {sha,canonical} from './run-factory-main-repair-r26.mjs';
import {targetCleanupR29Scope as T} from './verify-factory-target-cleanup-r29.mjs';
import {protectionContractR29R2 as L} from './verify-factory-protection-contract-r29-r2.mjs';
import {currentMainProtectionR33Contract as C,expectedCurrentMainProtectionStockR33,currentMainProtectionR33HostParams,currentMainProtectionR33HostProgram,
 assertCurrentMainProtectionR33Host,assertCurrentMainProtectionR33Proof,assertCurrentMainProtectionR33SourceContract,
 readCurrentMainProtectionR33Qualification,verifyFactoryCurrentMainProtectionContractR33} from './verify-factory-current-main-protection-contract-r33.mjs';
const SELF='scripts/verify-factory-current-main-protection-contract-r33.mjs';
const W={path:'artifacts/software-factory/goals-r29/r33-fixed-main-diagnostic-result-1791903076645-397c57d0-2eb6-4f22-8636-76293bfaca10.json',sha256:'38920f66c03c47af775255556d39f5ba21b0d32d6dec69768df784c07ea12438'};
const A={path:'artifacts/software-factory/goals-r29/r33-fixed-main-diagnostic-saved-evidence-independent-limited-audit-1791903450314-1d5b67fe-5e2e-4f56-a8e8-14feebcb4bb5.json',sha256:'deb054608022e330de10cdaadd4f00766f2c570b5c1276483388395ff952b4d7'};
const clone=structuredClone;
async function context(){const [qr,mr,sr]=await Promise.all([readFile(T.journalPath),readFile(T.installedManifestPath),readFile(SELF)]);return {q:JSON.parse(qr),m:JSON.parse(mr),selfSHA:sha(sr)}}
test('current Main: exact three-stock derivation and separately committed unchanged root bodies',async()=>{
 const {q,m}=await context(),before=canonical(q.protectedInventory),stock=expectedCurrentMainProtectionStockR33(q);
 assert.equal(sha(q.protectedInventory),L.oldStockSHA256);assert.equal(sha(stock),C.newStockSHA256);assert.equal(canonical(q.protectedInventory),before);
 const inverse=clone(stock);inverse.source.metadataSHA=L.oldMainMetadataSHA256;assert.equal(sha(inverse),L.oldStockSHA256);
 inverse.source.metadataSHA=L.mainMetadataSHA256;assert.equal(sha(inverse),L.newStockSHA256);
 for(const edit of [s=>s.protectedInventory.source.metadataSHA=C.mainMetadataSHA256,s=>s.protectedInventory.installed.wrapperSHA256='0'.repeat(64)]){const bad=clone(q);edit(bad);assert.throws(()=>expectedCurrentMainProtectionStockR33(bad),/ORIGINAL_STOCK_CHANGED/)}
 const params=currentMainProtectionR33HostParams(m.preparation),program=currentMainProtectionR33HostProgram(m.preparation);
 assert.equal(sha(params),C.stockParametersSHA256);assert.equal(sha(program),C.stockProgramSHA256);assert.equal(params.contractId,C.contractId);assert.equal(params.protectedStockSHA256,C.newStockSHA256);
 const py="import ast,json,sys\nv=json.load(sys.stdin);tree=ast.parse(v['program']);assert len([n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='source_state'])==1;assert v['params']['mainMetadataSHA256']==v['meta'];print('parsed-only')";
 const r=spawnSync('python',['-c',py],{input:JSON.stringify({program,params,meta:C.mainMetadataSHA256}),encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'parsed-only');
});
test('current Main: null zero IO, controlled qualification exact refs, and late source refusal before live readers',async()=>{
 let io=0;const noIO=new Proxy({}, {get(){io++;throw Error('UNEXPECTED_IO')}});const closed=await verifyFactoryCurrentMainProtectionContractR33(null,noIO);assert.equal(closed.ready,false);assert.equal(io,0);
 const {q,selfSHA}=await context(),contract={schemaVersion:1,kind:'r33-current-main-metadata-inventory-contract',contractId:C.contractId,contractRevision:1,contractVersion:C.contractVersion,
 selection:{path:C.selectionPath,sha256:C.selectionSHA256},currentMain:expectedCurrentMainProtectionStockR33(q).source,newProtectedStockSHA256:C.newStockSHA256,
 physicalVerifier:{path:SELF,sha256:selfSHA},stockProgramSHA256:C.stockProgramSHA256,stockParametersSHA256:C.stockParametersSHA256,actualCurrentMainWitness:W,actualCurrentMainAudit:A,remoteReadAuthorized:true};
 const review={kind:'r33-current-main-protection-physical-verifier-independent-local-review',verifierSHA256:selfSHA,stockProgramSHA256:C.stockProgramSHA256,stockParametersSHA256:C.stockParametersSHA256,
 staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualFullProtectionQualified:false,isControlledFixture:true};
 const cr=Buffer.from(JSON.stringify(contract)),rr=Buffer.from(JSON.stringify(review)),memory=new Map([['artifacts/software-factory/goals-r29/controlled-current-main-contract.json',cr],['artifacts/software-factory/goals-r29/controlled-current-main-review.json',rr]]);
 const activation={actualCurrentMainAudit:A,independentReview:{path:[...memory.keys()][1],sha256:sha(rr)},contract:{path:[...memory.keys()][0],sha256:sha(cr)},actualCurrentMainWitness:W};
 const read=async(p,e)=>{const b=memory.get(p)??await readFile(p);return e?b.toString(e):b};
 const qualification=await readCurrentMainProtectionR33Qualification(activation,read);assert.equal(qualification.selfSHA256,selfSHA);await qualification.recheck();
 assert.throws(()=>assertCurrentMainProtectionR33SourceContract({...contract,currentMain:{...contract.currentMain,metadataSHA:L.mainMetadataSHA256}},selfSHA),/SOURCE_CONTRACT_UNQUALIFIED/);
 for(const a of [null,{...activation,actualCurrentMainWitness:null}]){const r=await verifyFactoryCurrentMainProtectionContractR33(a,noIO).catch(e=>({ready:false}));assert.equal(r.ready,false);assert.equal(io,0)}
 memory.set([...memory.keys()][1],Buffer.from(JSON.stringify({...review,remainingP0P1:1})));
 let live=0;await assert.rejects(verifyFactoryCurrentMainProtectionContractR33(activation,{readLocal:read,api:()=>{live++;throw Error('UNEXPECTED_API')},readRoot:()=>{live++;throw Error('UNEXPECTED_ROOT')}}),/AUTHORITY_BYTES_CHANGED/);assert.equal(live,0);
 memory.set([...memory.keys()][1],rr);memory.set([...memory.keys()][0],Buffer.concat([cr,Buffer.from(' ')]));await assert.rejects(qualification.recheck(),/QUALIFICATION_CHANGED/);
});
test('current Main: distinct typed proof binds actual census fields; old epoch, unknown, and exact freshness boundary refuse',async()=>{
 const {q,m,selfSHA}=await context(),v=JSON.parse(await readFile('artifacts/software-factory/goals-r29/new-protection-contract-1791828226746-050a98d2-9605-46c2-8d28-57a450f38a5d.json'));
 const stock=expectedCurrentMainProtectionStockR33(q),at=Date.parse(v.at),host={...clone(m.rootReadback),...clone(stock),kind:'software-factory-r33-current-main-protection-host-observation',
 schemaVersion:1,observedAt:v.at,helperVerified:true,mutationsPerformed:false,modelsInvoked:false,rawLogsExported:false,privateEnvironmentExported:false,productCodeExecuted:false,
 sourceVerificationScope:'public-manifest-and-metadata',originBound:true,originIdentity:stock.candidate.identity,fixedTools:m.preparation.oldFixedTools,
 nodeTemplates:{...m.rootReadback.nodeTemplates,targetSHA256:C.baseTemplateSHA256,otherTemplatesSHA256:C.otherNodeTemplatesSHA256},quiet:{active:true,pid:v.node.pid,start:v.node.startTicks,boot:v.node.boot,children:[],counts:{runs:0,deliveries:0,logs:0}},visudoVerified:true};
 assertCurrentMainProtectionR33Host(host,m.preparation,q);
 v.kind='software-factory-r33-current-main-protection-contract-observation';v.contractId=C.contractId;v.contractVersion=C.contractVersion;v.newProtectedInventorySHA256=C.newStockSHA256;v.sources.main=clone(stock.source);
 v.selectionEvidence={path:C.selectionPath,sha256:C.selectionSHA256};v.actualCurrentMainWitness=W;v.actualCurrentMainAudit=A;v.previousContractId=L.contractId;v.previousProtectedInventorySHA256=L.newStockSHA256;
 v.priorContractProtectionVerified=false;v.currentR6CleanupQualified=false;v.PG4Qualified=false;
 v.physicalQualification={activation:{contract:{path:'artifacts/software-factory/goals-r29/controlled-current-main-contract.json',sha256:'1'.repeat(64)},independentReview:{path:'artifacts/software-factory/goals-r29/controlled-current-main-review.json',sha256:'2'.repeat(64)},actualCurrentMainWitness:W,actualCurrentMainAudit:A},sourceSHA256:selfSHA,stockProgramSHA256:C.stockProgramSHA256,stockParametersSHA256:C.stockParametersSHA256,sourcesStable:true};
 v.observations.stockBefore=host;v.observations.stockAfter=clone(host);v.observations.hostBeforeSHA256=sha(host);v.observations.hostAfterSHA256=sha(host);
 for(const h of [v.observations.nativeSource,v.observations.oldBuild])h.observedAt=v.at;
 assert.equal(assertCurrentMainProtectionR33Proof(v,{fresh:true,now:at}),v);
 for(const edit of [p=>p.kind='software-factory-r29-new-protection-contract-observation',p=>p.sources.main.metadataSHA=L.mainMetadataSHA256,p=>p.nodeACKIdle=false,p=>p.observations.oldBuild.owner.complete=false]){const b=clone(v);edit(b);assert.throws(()=>assertCurrentMainProtectionR33Proof(b),/R29_|R33_/)}
 assert.throws(()=>assertCurrentMainProtectionR33Proof(v,{fresh:true,now:at+300000}),/STALE/);
});
