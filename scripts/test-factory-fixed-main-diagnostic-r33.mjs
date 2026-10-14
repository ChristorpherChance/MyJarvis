/** New caller-only controlled checks. No SSH, kernel, persistence or source-tree observation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyFactoryFixedMainDiagnosticR33,fixedMainDiagnosticR33HostProgram,assertFixedMainDiagnosticR33Host} from './read-factory-fixed-main-diagnostic-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),raw=v=>Buffer.from(JSON.stringify(v)+'\n');
const SELF='scripts/read-factory-fixed-main-diagnostic-r33.mjs',PROGRAM='scripts/factory-fixed-main-diagnostic-r33.py';
const failure={path:'artifacts/software-factory/goals-r29/r33-single-entry-full-protection-actual-read-1791900232788-a9e9b2c3-8956-439c-af84-20bfd35059e5.json',sha256:'fa0d6afe00670c62181b03df446817f177c9d746e5b91cb5792008240635e695'};
const selection={path:'artifacts/software-factory/goals-r29/r33-fixed-main-failure-source-analysis-selected-outline-1791901152906-a32f7f1a-033a-44e8-93dc-f9d9fe57a7a7.json',sha256:'4ff5daab94c84e4e66ce389fa5066689be06b9473837b6f11ea0665825477789'};
async function configured(){
 const callerRaw=await readFile(SELF),programRaw=await readFile(PROGRAM),host=fixedMainDiagnosticR33HostProgram(programRaw);
 const caller={path:SELF,sha256:sha(callerRaw)},program={path:PROGRAM,sha256:sha(programRaw)},hostProgram={path:'artifacts/software-factory/goals-r29/r33-fixed-main-diagnostic-controlled-host.py',sha256:sha(host)};
 const r={kind:'r33-fixed-main-diagnostic-independent-local-review',callerSHA256:caller.sha256,programSHA256:program.sha256,hostProgramSHA256:hostProgram.sha256,staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualDiagnosticReadComplete:false};
 const reviewRaw=raw(r),review={path:'artifacts/software-factory/goals-r29/r33-fixed-main-diagnostic-controlled-review.json',sha256:sha(reviewRaw)};
 const activation={schemaVersion:1,kind:'r33-fixed-main-diagnostic-read-activation',remoteReadAuthorized:true,caller,program,hostProgram,review,actualFailure:failure,selection};
 const map=new Map([[hostProgram.path,host],[review.path,reviewRaw]]),reads=[];
 const readLocal=async path=>{reads.push(path);return map.get(path)??readFile(path)};
 return{activation,readLocal,reads,host,callerRaw};
}
function syntheticHost(){
 const expected={sha256:'151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea',files:593,metadataSHA:'a7a2ca5cf6875d70820d820cac575187b3d196e0fc990bb89144063cdff1dde6',identity:{device:66306,inode:14417953}};
 const extractedAuthority={path:'scripts/factory-verifier-host-r28.mjs',sha256:'967bc2394240a92059d177c0119544f833059080bc4b3d0852ba2140a5256308',functionSHA256:{need:'e4eaf757341336073fd627bfdb678da5e330c94ded6b36a13057b7a9269a36ca',key:'f7f3c65a770294ea6637cb4e4a0e5e2b47b2296806d8330343ac0bcee243285b',trusted:'bc9f4f7f541974c511cbc0259ce315c97941019bd4a07699e61f2bf50c0ecfb5',private_read:'c9a7ad35a64d0cf1d6e75ae44f971fee508900293f16ca00a416c5fe25644ce6',hashv:'6a07494eaebe3cf21c1c259e2aea12513a71a74aab7e12a2fd3f07b5b9e84b40',identity:'cb484ffb2206222b71dc010209abd6e6ca8657654376087c7f9b72046b127bf3',fingerprint_fd:'e9d5c5d930570b82c8c6cc5a25150046b24d14b573479a9018ca564525867d57',source_state:'14238b55dac51c6d398f5fb8f64918ca47b63f6554399862eae3d482349318d7'}};
 extractedAuthority.functionSHA256Domain='python-ast-source-segment-utf8-no-trailing-newline';
 const tuple={sha256:sha(Buffer.alloc(0)),files:0,bytes:0,metadataSHA:expected.metadataSHA,stable:true,identity:expected.identity};
 const frame={tuple,manifest:[],rootMetadata9:[66306,14417953,1000,1000,16877,1,4096,1791900000123456700,1791900000123456800],expectedMatches:{fingerprint:false,files:false,metadata:true,rootIdentity:true}};
 return{schemaVersion:1,kind:'r33-fixed-main-source-diagnostic',source:'/home/superopen/All-Projects/msf',maximumSeconds:30,expected,extractedAuthority,helperSHA256:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',helperVerified:true,diagnosticReadComplete:true,frames:[frame,structuredClone(frame)],framesEqual:{tuple:true,manifest:true,rootMetadata9:true},readError:null,legacyPrimaryErrorRecovered:false,originalMetadataRowsDirectlyExported:false,independentPerFileMetadataReadPerformed:false,perFileMetadataRowsRetained:false,actualFullProtectionQualified:false,currentR6CleanupQualified:false,modelsInvoked:false,productCodeExecuted:false,mutationsPerformed:false};
}
function sinks(){const written=[],existing=new Set();let id=0;const bytes=(path,b)=>{written.push({path,raw:b});return{path,sha256:sha(b),bytes:b.length}};return{written,existing,
 ensureAbsent:async p=>{if(existing.has(p))throw Error('R33_MAIN_DIAG_ONCE_ALREADY_EXISTS_NO_RETRY')},
 writeOnce:async(p,v)=>{existing.add(p);return bytes(p,raw(v))},writeOutcome:async(p,v)=>bytes(p,raw(v)),
 writePrivateRaw:async(label,b)=>bytes('.jarvis-dev/maintenance/r33-fixed-main-controlled-'+label+'-'+(++id)+'.json',b),
 writePublic:async v=>bytes('artifacts/software-factory/goals-r29/r33-fixed-main-controlled-public-'+(++id)+'.json',raw(v)),now:()=>1791901200000};}

test('default/explicit missing refs refuse all IO; generated trusted host parses without executing',async()=>{
 const forbidden=new Proxy({}, {get(){throw Error('UNEXPECTED_DEPENDENCY_ACCESS')}});
 assert.equal((await verifyFactoryFixedMainDiagnosticR33({},forbidden)).localIOPerformed,false);
 assert.equal((await verifyFactoryFixedMainDiagnosticR33({activation:{review:null}},forbidden)).remoteReadAttempted,false);
 const accessor={get review(){throw Error('ACCESSOR_EXECUTED')}};
 await assert.rejects(verifyFactoryFixedMainDiagnosticR33({activation:accessor},forbidden),/R33_MAIN_DIAG_PACKET_PROPERTIES/);
 const c=await configured(),parsed=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-I','-c','import ast,sys;ast.parse(sys.stdin.buffer.read())'],{input:c.host,windowsHide:true,timeout:5000});
 assert.equal(parsed.status,0);assert.equal(parsed.signal,null);
 assert(c.host.indexOf('signal.alarm(30)')<c.host.indexOf('sys.stdin.buffer.read(16385)'));
 assert(c.host.includes(Buffer.from(c.activation.program.sha256)));
});

test('configured production caller keeps mismatches diagnostic-only, raw-before-parse and once; lost reply never repeats',async()=>{
 const c=await configured(),s=sinks();let roots=0;
 const bytes=raw(syntheticHost());const v=await verifyFactoryFixedMainDiagnosticR33({activation:c.activation},{...s,readLocal:c.readLocal,readRoot:async()=>{roots++;assert(s.existing.size===1);return{status:0,signal:null,stdout:bytes,stderr:Buffer.alloc(0)}}});
 assert.equal(roots,1);assert.equal(v.ready,true);assert.equal(v.currentMain.frames[0].expectedMatches.files,false);
 assert.equal(v.mainBaselineQualified,false);assert.equal(v.fullProtectionQualified,false);assert.equal(v.currentR6CleanupQualified,false);assert.equal(v.originalFailedConjunct,null);
 const transport=s.written.find(r=>r.path.includes('transport')),host=s.written.find(r=>r.path.includes('host-original'));
 assert.equal(Buffer.from(JSON.parse(transport.raw).stdoutBase64,'base64').equals(bytes),true);assert.equal(host.raw.equals(bytes),true);
 assert(v.currentMain.frames.every(f=>!Object.hasOwn(f,'rootMetadata9')));assert(!JSON.stringify(v).includes('179190000012345'));
 await assert.rejects(verifyFactoryFixedMainDiagnosticR33({activation:c.activation},{...s,readLocal:c.readLocal,readRoot:async()=>{roots++;throw Error('ROOT_REPEATED')}}),/ONCE_ALREADY_EXISTS/);assert.equal(roots,1);
 const lost=sinks();let lostCalls=0;const result=await verifyFactoryFixedMainDiagnosticR33({activation:c.activation},{...lost,readLocal:c.readLocal,readRoot:async()=>{lostCalls++;throw Error('CONTROLLED_LOST_REPLY')}});
 assert.equal(result.ready,false);assert.equal(result.errorCode,'R33_MAIN_DIAG_READ_INCOMPLETE');assert.equal(result.maximumRootReads,1);assert.equal(result.automaticRetry,false);
 await assert.rejects(verifyFactoryFixedMainDiagnosticR33({activation:c.activation},{...lost,readLocal:c.readLocal,readRoot:async()=>{lostCalls++}}),/ONCE_ALREADY_EXISTS/);assert.equal(lostCalls,1);
});

test('source drift rejects before intent and forged comparison cannot claim a completed diagnostic',async()=>{
 const c=await configured(),s=sinks();let roots=0;
 await assert.rejects(verifyFactoryFixedMainDiagnosticR33({activation:c.activation},{...s,readLocal:async p=>p===SELF?Buffer.concat([c.callerRaw,Buffer.from(' ') ]):c.readLocal(p),readRoot:async()=>{roots++}}),/SOURCE_CHANGED/);
 assert.equal(roots,0);assert.equal(s.written.length,0);
 const v=syntheticHost();v.frames[0].expectedMatches.files=true;
 assert.throws(()=>assertFixedMainDiagnosticR33Host(v),/COMPARISON_CHANGED/);
 const failure=syntheticHost();failure.diagnosticReadComplete=false;failure.frames=[];failure.framesEqual=null;failure.readError={phase:'SOURCE_STATE_FIRST',errorCode:'R28_HOST_SOURCE_READ_CHANGED',errno:null};
 assert.equal(assertFixedMainDiagnosticR33Host(failure).diagnosticReadComplete,false);
});

test('actual Python AST extraction authority matches the new Node predicate; archived old predicate rejects',async()=>{
 const syntaxOnly=String.raw`import ast,json,sys
t=ast.parse(sys.stdin.buffer.read())
value=None
for node in t.body:
 if isinstance(node,ast.Assign):
  for target in node.targets:
   if isinstance(target,ast.Name) and target.id=='EXTRACTION_SOURCE':value=ast.literal_eval(node.value)
   if isinstance(target,ast.Subscript) and isinstance(target.value,ast.Name) and target.value.id=='EXTRACTION_SOURCE':
    assert value is not None
    value[ast.literal_eval(target.slice)]=ast.literal_eval(node.value)
assert type(value) is dict
print(json.dumps(value,separators=(',',':')))
`;
 const parsed=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-I','-c',syntaxOnly],{input:await readFile(PROGRAM),windowsHide:true,timeout:5000});
 assert.equal(parsed.status,0);assert.equal(parsed.signal,null);
 const actual=JSON.parse(parsed.stdout),v=syntheticHost();v.extractedAuthority=actual;
 assert.equal(actual.functionSHA256Domain,'python-ast-source-segment-utf8-no-trailing-newline');
 const archive='artifacts/software-factory/goals-r29/r33-fixed-main-before-domain-interface-fix-ff4febfe1b1fe7231c7d974aa8ebd6e849942fe7b24d06b436afc2255d1e791b.mjs';
 assert.equal(sha(await readFile(archive)),'ff4febfe1b1fe7231c7d974aa8ebd6e849942fe7b24d06b436afc2255d1e791b');
 const old=await import(pathToFileURL(resolve(archive)).href);
 assert.throws(()=>old.assertFixedMainDiagnosticR33Host(v),/HOST_BINDING/);
 assert.equal(assertFixedMainDiagnosticR33Host(v).diagnosticReadComplete,true);
});
