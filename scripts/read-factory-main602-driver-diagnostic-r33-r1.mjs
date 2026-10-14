/** One source-bound diagnostic read. Missing activation/review performs no IO. */
import {open,lstat,link,unlink,constants} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const SELF='scripts/read-factory-main602-driver-diagnostic-r33-r1.mjs';
const PROGRAM='scripts/factory-main602-driver-diagnostic-r33-r1.py';
const HOST='.jarvis-dev/maintenance/r33-main602-driver-diagnostic-r1-host.py';
const PREFIX='r33-main602-driver-diagnostic-r1';
const ONCE='.jarvis-dev/maintenance/'+PREFIX+'-once.json',OUTCOME='.jarvis-dev/maintenance/'+PREFIX+'-outcome.json';
const H=/^[a-f0-9]{64}$/,LOCAL_MAX=16*1024**2,WIRE_MAX=16*1024**2,PRIVATE_MAX=48*1024**2;
const need=(v,c)=>{if(!v)throw Error(c)},sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>typeof v==='bigint'?v.toString():Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>canonical(a)===canonical(b),keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...k].sort());
const pathValid=p=>typeof p==='string'&&p.length<=768&&/^(?:scripts\/|artifacts\/software-factory\/goals-r29\/|\.jarvis-dev\/maintenance\/)[A-Za-z0-9._/-]+$/.test(p)&&!p.split('/').some(x=>!x||x==='.'||x==='..');
const fullref=r=>keys(r,['path','sha256','bytes'])&&pathValid(r.path)&&H.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=LOCAL_MAX;
const bytesRef=(path,raw)=>({path,sha256:sha(raw),bytes:raw.length});
const flags=()=>({mainBaselineQualified:false,fullProtectionQualified:false,currentResourceScopeClosedVerified:false,actualPG4Qualified:false,productAccepted:false,modelsInvoked:false,mutationsPerformed:false});
const REQUEST=Object.freeze({schemaVersion:1,kind:PREFIX+'-request',purpose:'main-four-conjunct-and-terminal-driver-two-file-diagnostic-only',attempt:'454f612e7c27a68f5197006b99aa4f7d',maximumSeconds:60,fileStageSeconds:15,mainStageSeconds:30});
const EXPECTED={sha256:'11446020cbec373e92ab22293352bde874b18e82cca11f3a5757454dc9b9e212',files:602,metadataSHA:'ac7131117c9782bbdb3a064568d3d4b6ce42f952eebbe9e80e84c907625dec06',identity:{device:66306,inode:14417953}};
const RECORDS={'work/retained-pg4-driver-result.json':{sha256:'6d030223a2afdcfe9fd8ad18f3b81b955526c50ba9d7d221cb8b6c33468cf5ef',bytes:613},'work/startup-and-four-cases-9f4576f61038a95a.json':{sha256:'a7e462c6870b2a7713b6db7ed32a8faec1e093eea15e7a949ac585e6d8118e09',bytes:1316}};
const FIXED={
 selection:{path:'artifacts/software-factory/goals-r29/r33-main602-driver-diagnostic-root-selection-1791991753684-1da164fd-4242-44ae-8a7e-c3a9eace8d55.json',sha256:'24ada0dbe13326531f75ffd2deb11c495b947fb3d1607c4fad3b2d01dd0a8554',bytes:6652},
 stockSource:{path:'.jarvis-dev/maintenance/r33-current-main602-stock-program-7610454057b47f204d69aeec259e048f964437a0f29ed46783c93e82066b4d5f.py',sha256:'7610454057b47f204d69aeec259e048f964437a0f29ed46783c93e82066b4d5f',bytes:31642},
 exactFileReaderSource:{path:'scripts/factory-pg4-terminal-binding-bytes-r33-main602-pgready-r7.py',sha256:'e83ba3661e23a4b0011525aee2b2e1b22acc87aef8165558b6cdef6950f44fc6',bytes:10018},
 helper:{path:'scripts/project-autonomy-evidence.py',sha256:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',bytes:11026},
 managedServerClient:{path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f',bytes:6440},
 terminalState:{path:'.jarvis-dev/maintenance/r33-pg4-pgready-r7-terminal-binding-state.json-b06eb60ab6d03827a52d06ee6b2e47ac448b8b6b38740e2690bd8efcadeacb31.json',sha256:'b06eb60ab6d03827a52d06ee6b2e47ac448b8b6b38740e2690bd8efcadeacb31',bytes:22486},
 terminal5Observation:{path:'artifacts/software-factory/goals-r29/r33-pg4-pgready-r7-terminal-binding-byte-actual-observation-1791988224993-b85fce89-9d3c-42aa-8331-1e5803fca585.json',sha256:'32c576971cc422975448d16845b1d0f76240deb7ba83436b16ba8e49c30ab22b',bytes:4045},
 terminal5Seal:{path:'artifacts/software-factory/goals-r29/r33-pg4-pgready-r7-terminal5-actual-data-seal.json',sha256:'80f535b7e1db67e39db1ed0ca4402cd4f7d4a6b9bf3389847d0dfc6b1a31ad0e',bytes:4429},
};
const REF_KEYS=[...Object.keys(FIXED),'program','caller','hostProgram','extractionProof','authorReport'];
const ERROR_CODES=new Set(['R28_HOST_ROOT_CHAIN_UNTRUSTED','R28_HOST_FILE_INVALID','R28_HOST_FILE_CHANGED','R28_HOST_SOURCE_READ_CHANGED','R28_HOST_SOURCE_DIRECTORY_REPLACED','EVIDENCE_PATH_INVALID','EVIDENCE_RELATIVE_PATH_INVALID','EVIDENCE_PRIVATE_PATH_REFUSED','EVIDENCE_FILE_NOT_REGULAR_SINGLE_LINK','EVIDENCE_FILE_LIMIT','SOURCE_CHANGED_DURING_READ','SOURCE_SYMLINK_NOT_ALLOWED','SOURCE_HARDLINK_NOT_ALLOWED','SOURCE_MANIFEST_LIMIT','SOURCE_SPECIAL_FILE_NOT_ALLOWED','PG4_D_PATH_CHANGED','PG4_D_DIRECTORY_UNTRUSTED','PG4_D_DIRECTORY_REPLACED','PG4_D_DIRECTORY_CHANGED','PG4_D_RECORD_UNTRUSTED','PG4_D_RECORD_REPLACED','PG4_D_RECORD_CHANGED','PG4_D_CLOSE_INCOMPLETE','R33_MAIN_DRIVER_DIAG_FIXED_REQUEST_REQUIRED','R33_MAIN_DRIVER_DIAG_PROFILE_REQUIRED','R33_MAIN_DRIVER_DIAG_PARENT_TIMER_REQUIRED','R33_MAIN_DRIVER_DIAG_DEADLINE','R33_MAIN_DRIVER_DIAG_TWO_READS_CHANGED','R33_MAIN_DRIVER_DIAG_HELPER_CHANGED','R33_MAIN_DRIVER_DIAG_HELPER_LIMITS_CHANGED','R33_MAIN_DRIVER_DIAG_HELD_ROOT_CHANGED','R33_MAIN_DRIVER_DIAG_FINAL_ROOT_CHANGED','R33_MAIN_DRIVER_DIAG_READ_INCOMPLETE']);
const PHASES=new Set(['FILES_BEGIN','DRIVER_FIRST','DRIVER_SECOND','CAPTURE_FIRST','CAPTURE_SECOND','MAIN_BEGIN','LOAD_FIXED_HELPER','OPEN_FIXED_MAIN','MAIN_FRAME_FIRST','MAIN_FRAME_SECOND','FINAL_NAMED_MAIN','RUNTIME_GATE','FILES_PHASE','MAIN_PHASE','FINALIZE']);
const EXCEPTIONS=new Set(['RuntimeError','ValueError','OSError','FileNotFoundError','PermissionError','NotADirectoryError','IsADirectoryError','BlockingIOError','InterruptedError','TimeoutError','MemoryError','RecursionError','UnicodeDecodeError','OtherException']);
const CLOSE_PHASES=new Set(['ROOT_CLOSE','DIRECTORY_CLOSE','RECORD_CLOSE','MAIN_ROOT_CLOSE','MAIN_NAMED_ROOT_CLOSE','UNKNOWN_CLOSE']);
export const main602DriverDiagnosticR33Activation=null;
export const main602DriverDiagnosticR33ActualReview=null;

function parseOriginal(raw){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 return JSON.parse(text,(_key,value,context)=>{
  if(typeof value!=='number'||Number.isSafeInteger(value))return value;
  need(Number.isInteger(value)&&typeof context?.source==='string'&&/^-?[0-9]+$/.test(context.source),'R33_MAIN_DRIVER_DIAG_INTEGER_SOURCE_REQUIRED');return BigInt(context.source);
 });
}
async function close(f,primary){try{await f.close()}catch(e){if(!primary)return e;primary.secondaryCloseFailure='R33_MAIN_DRIVER_DIAG_LOCAL_CLOSE_INCOMPLETE'}return primary}
async function heldRead(path,maximum=LOCAL_MAX){
 need(pathValid(path)&&Number.isSafeInteger(maximum)&&maximum>0&&maximum<=PRIVATE_MAX,'R33_MAIN_DRIVER_DIAG_LOCAL_PATH');
 const a=await lstat(path,{bigint:true});need(a.isFile()&&!a.isSymbolicLink()&&a.nlink===1n&&a.size>=0n&&a.size<=BigInt(maximum),'R33_MAIN_DRIVER_DIAG_LOCAL_FILE');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));const equal=(x,y)=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>x[k]===y[k]);let raw,primary=null;
 try{const before=await f.stat({bigint:true});need(equal(a,before),'R33_MAIN_DRIVER_DIAG_LOCAL_CHANGED');raw=await f.readFile();need(BigInt(raw.length)===before.size&&equal(before,await f.stat({bigint:true}))&&equal(before,await lstat(path,{bigint:true})),'R33_MAIN_DRIVER_DIAG_LOCAL_CHANGED')}catch(e){primary=e}finally{primary=await close(f,primary)}
 if(primary)throw primary;return raw;
}
async function durableWX(path,raw){
 need(pathValid(path)&&Buffer.isBuffer(raw)&&raw.length<=PRIVATE_MAX&&['win32','linux'].includes(process.platform),'R33_MAIN_DRIVER_DIAG_DURABLE_INPUT');
 const temp=path+'.'+randomUUID()+'.tmp',f=await open(temp,'wx',0o600);let primary=null;
 try{await f.writeFile(raw);await f.sync()}catch(e){primary=e}finally{primary=await close(f,primary)}if(primary)throw primary;
 if(process.platform==='win32'){
  const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-I','-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],8) else 1)",resolve(temp),resolve(path)],{windowsHide:true,timeout:10000});need(r.status===0&&r.signal===null,'R33_MAIN_DRIVER_DIAG_NOREPLACE_WRITE_THROUGH_FAILED');
 }else{
  await link(temp,path);const directory=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);let error=null;try{await directory.sync()}catch(e){error=e}finally{error=await close(directory,error)}if(error)throw error;await unlink(temp);
 }
 need((await heldRead(path,PRIVATE_MAX)).equals(raw),'R33_MAIN_DRIVER_DIAG_DURABLE_READBACK_CHANGED');return bytesRef(path,raw);
}
const saveJSON=(path,value)=>durableWX(path,Buffer.from(JSON.stringify(value)+'\n'));
const privateRaw=(label,raw)=>durableWX('.jarvis-dev/maintenance/'+PREFIX+'-'+label+'-'+Date.now()+'-'+randomUUID()+'.json',raw);
async function absent(path){try{await lstat(path)}catch(e){if(e.code==='ENOENT')return;throw e}throw Error('R33_MAIN_DRIVER_DIAG_ONCE_CLOSED_NO_REPLAY')}
const closed=e=>/^R33_MAIN_DRIVER_DIAG_[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'R33_MAIN_DRIVER_DIAG_LOCAL_INCOMPLETE';
const errno=v=>v===null||Number.isSafeInteger(v)&&v>0&&v<=4095;
function safeError(v){
 if(v===null)return null;
 need(keys(v,['phase','errorCode','exceptionClass','errno','secondaryFailures'])&&PHASES.has(v.phase)&&ERROR_CODES.has(v.errorCode)&&EXCEPTIONS.has(v.exceptionClass)&&errno(v.errno)&&Array.isArray(v.secondaryFailures)&&v.secondaryFailures.length<=32,'R33_MAIN_DRIVER_DIAG_CLOSED_ERROR_CHANGED');
 const secondary=v.secondaryFailures.map(r=>{need(keys(r,['phase','errorCode','errno'])&&CLOSE_PHASES.has(r.phase)&&r.errorCode==='PG4_D_CLOSE_INCOMPLETE'&&errno(r.errno),'R33_MAIN_DRIVER_DIAG_CLOSED_ERROR_CHANGED');return{phase:r.phase,errorCode:r.errorCode,errno:r.errno}});
 return{phase:v.phase,errorCode:v.errorCode,exceptionClass:v.exceptionClass,errno:v.errno,secondaryFailures:secondary};
}
const bool=v=>typeof v==='boolean';
const integer=v=>typeof v==='bigint'||Number.isSafeInteger(v);
function rawRow(row,pin){
 if(row===null)return null;
 if(row.readComplete===false){need(keys(row,['prefixBase64','prefixSHA256','prefixBytes','readComplete'])&&typeof row.prefixBase64==='string'&&H.test(row.prefixSHA256)&&Number.isSafeInteger(row.prefixBytes)&&row.prefixBytes>=0&&row.prefixBytes<=pin.bytes+1,'R33_MAIN_DRIVER_DIAG_FILE_PREFIX_CHANGED');const prefix=Buffer.from(row.prefixBase64,'base64');need(prefix.toString('base64')===row.prefixBase64&&prefix.length===row.prefixBytes&&sha(prefix)===row.prefixSHA256,'R33_MAIN_DRIVER_DIAG_FILE_PREFIX_CHANGED');return{raw:prefix,partial:true}}
 need(keys(row,['sha256','bytes','metadata','metadataSHA256','readComplete','base64'])&&row.readComplete===true&&row.sha256===pin.sha256&&row.bytes===pin.bytes&&typeof row.base64==='string'&&Array.isArray(row.metadata)&&row.metadata.length===9&&row.metadata.every(integer)&&H.test(row.metadataSHA256)&&sha(canonical(row.metadata))===row.metadataSHA256,'R33_MAIN_DRIVER_DIAG_FILE_ROW_CHANGED');
 const raw=Buffer.from(row.base64,'base64');need(raw.toString('base64')===row.base64&&raw.length===pin.bytes&&sha(raw)===pin.sha256,'R33_MAIN_DRIVER_DIAG_FILE_BYTES_CHANGED');return{raw,partial:false};
}
function safeFrame(frame){
 if(frame===null)return null;
 need(keys(frame,['tuple','manifest','rootMetadata9','expectedMatches']),'R33_MAIN_DRIVER_DIAG_MAIN_FRAME_CHANGED');const t=frame.tuple;
 need(keys(t,['sha256','files','bytes','metadataSHA','stable','identity'])&&H.test(t.sha256)&&H.test(t.metadataSHA)&&t.stable===true&&Number.isSafeInteger(t.files)&&t.files>=0&&t.files<=20000&&Number.isSafeInteger(t.bytes)&&t.bytes>=0&&t.bytes<=209715200&&keys(t.identity,['device','inode'])&&Object.values(t.identity).every(x=>Number.isSafeInteger(x)&&x>=0)&&Array.isArray(frame.rootMetadata9)&&frame.rootMetadata9.length===9&&frame.rootMetadata9.every(integer)&&Array.isArray(frame.manifest)&&frame.manifest.length===t.files,'R33_MAIN_DRIVER_DIAG_MAIN_TUPLE_CHANGED');
 need(frame.manifest.every(r=>keys(r,['path','sha256','bytes'])&&typeof r.path==='string'&&r.path.length>0&&r.path.length<4096&&!r.path.includes('\0')&&!r.path.split('/').some(x=>!x||x==='.'||x==='..')&&H.test(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&r.bytes<=20971520)&&new Set(frame.manifest.map(r=>r.path)).size===frame.manifest.length,'R33_MAIN_DRIVER_DIAG_MAIN_MANIFEST_CHANGED');
 need(sha(frame.manifest.map(r=>r.path+'\0'+r.sha256+'\n').join(''))===t.sha256&&frame.manifest.reduce((sum,r)=>sum+r.bytes,0)===t.bytes,'R33_MAIN_DRIVER_DIAG_MAIN_MANIFEST_CHANGED');
 const matches={fingerprint:t.sha256===EXPECTED.sha256,files:t.files===EXPECTED.files,metadata:t.metadataSHA===EXPECTED.metadataSHA,rootIdentity:same(t.identity,EXPECTED.identity)};need(same(frame.expectedMatches,matches),'R33_MAIN_DRIVER_DIAG_MAIN_COMPARISON_CHANGED');
 return{fingerprint:t.sha256,files:t.files,bytes:t.bytes,metadataSHA256:t.metadataSHA,rootIdentity:{device:t.identity.device,inode:t.identity.inode},expectedMatches:matches};
}
export function assertMain602DriverDiagnosticR33Host(value){
 need(keys(value,['schemaVersion','kind','request','source','expected','records','helperSHA256','filesPhase','mainPhase','diagnosticReadComplete','firstClosedError','readOnly','originalIntegerDomainPreserved','mainBaselineQualified','fullProtectionQualified','currentResourceScopeClosedVerified','actualPG4Qualified','productAccepted','modelsInvoked','mutationsPerformed','observedAt'])&&value.schemaVersion===1&&value.kind===PREFIX+'-observation'&&same(value.request,REQUEST)&&value.source==='/home/superopen/All-Projects/msf'&&same(value.expected,EXPECTED)&&same(value.records,RECORDS)&&value.helperSHA256===FIXED.helper.sha256&&value.readOnly===true&&value.originalIntegerDomainPreserved===true&&Object.keys(flags()).every(k=>value[k]===false)&&bool(value.diagnosticReadComplete)&&typeof value.observedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00:00$/.test(value.observedAt),'R33_MAIN_DRIVER_DIAG_HOST_BINDING_CHANGED');
 const files=value.filesPhase,main=value.mainPhase,rawFiles=[],fileSummary=[];
 need(keys(files,['readComplete','allReaderDescriptorsClosed','files','errors'])&&bool(files.readComplete)&&bool(files.allReaderDescriptorsClosed)&&keys(files.files,Object.keys(RECORDS))&&Array.isArray(files.errors)&&files.errors.length<=8,'R33_MAIN_DRIVER_DIAG_FILES_PHASE_CHANGED');
 const fileErrors=files.errors.map(safeError);need(fileErrors.every(x=>x!==null),'R33_MAIN_DRIVER_DIAG_FILES_ERRORS_CHANGED');
 for(const[name,pin]of Object.entries(RECORDS)){
  const slot=files.files[name];need(keys(slot,['first','second','twoReadsStable','readComplete','error'])&&bool(slot.twoReadsStable)&&bool(slot.readComplete),'R33_MAIN_DRIVER_DIAG_FILE_SLOT_CHANGED');const first=rawRow(slot.first,pin),second=rawRow(slot.second,pin),error=safeError(slot.error);
  need(slot.readComplete===slot.twoReadsStable&&(!slot.readComplete||first&&!first.partial&&second&&!second.partial&&same(slot.first,slot.second)&&error===null)&&(!error||fileErrors.some(x=>same(x,error))),'R33_MAIN_DRIVER_DIAG_FILE_COMPLETION_CHANGED');
  const label=fileSummary.length===0?'driver':'capture';if(first)rawFiles.push({label,partial:first.partial,raw:first.raw});
  fileSummary.push({role:label,expectedSHA256:pin.sha256,expectedBytes:pin.bytes,firstReadComplete:slot.first?.readComplete===true,secondReadComplete:slot.second?.readComplete===true,twoReadsStable:slot.twoReadsStable,readComplete:slot.readComplete,error});
 }
 need(files.readComplete===fileSummary.every(x=>x.readComplete)&&files.allReaderDescriptorsClosed===files.readComplete&&(!files.readComplete||fileErrors.length===0),'R33_MAIN_DRIVER_DIAG_FILES_COMPLETION_CHANGED');
 need(keys(main,['helperSHA256','helperVerified','frames','framesEqual','errors','readComplete','allReaderDescriptorsClosed','perFileMetadataRowsRetained'])&&bool(main.helperVerified)&&bool(main.readComplete)&&bool(main.allReaderDescriptorsClosed)&&main.perFileMetadataRowsRetained===false&&(main.helperSHA256===null||H.test(main.helperSHA256))&&(!main.helperVerified||main.helperSHA256===FIXED.helper.sha256)&&Array.isArray(main.frames)&&main.frames.length===2&&Array.isArray(main.errors)&&main.errors.length<=8,'R33_MAIN_DRIVER_DIAG_MAIN_PHASE_CHANGED');
 const frames=main.frames.map(safeFrame),mainErrors=main.errors.map(safeError);need(mainErrors.every(x=>x!==null),'R33_MAIN_DRIVER_DIAG_MAIN_ERRORS_CHANGED');
 let framesEqual=null;
 if(main.framesEqual!==null){need(main.frames.every(x=>x!==null),'R33_MAIN_DRIVER_DIAG_MAIN_COMPARISON_CHANGED');const[a,b]=main.frames;framesEqual={tuple:same(a.tuple,b.tuple),manifest:same(a.manifest,b.manifest),rootMetadata9:same(a.rootMetadata9,b.rootMetadata9)};need(same(main.framesEqual,framesEqual),'R33_MAIN_DRIVER_DIAG_MAIN_COMPARISON_CHANGED')}
 need(main.allReaderDescriptorsClosed===main.readComplete&&(!main.readComplete||main.helperVerified&&frames.every(x=>x!==null)&&framesEqual!==null&&mainErrors.length===0),'R33_MAIN_DRIVER_DIAG_MAIN_COMPLETION_CHANGED');
 const firstClosedError=safeError(value.firstClosedError);need(value.diagnosticReadComplete===(files.readComplete&&main.readComplete&&firstClosedError===null),'R33_MAIN_DRIVER_DIAG_COMPLETION_CHANGED');
 return{summary:{diagnosticReadComplete:value.diagnosticReadComplete,filesPhase:{readComplete:files.readComplete,allReaderDescriptorsClosed:files.allReaderDescriptorsClosed,files:fileSummary,errors:fileErrors},mainPhase:{readComplete:main.readComplete,allReaderDescriptorsClosed:main.allReaderDescriptorsClosed,helperVerified:main.helperVerified,helperSHA256:main.helperSHA256,frames,framesEqual,errors:mainErrors,perFileMetadataRowsRetained:false},firstClosedError,originalIntegerDomainPreserved:true,rawOutputPubliclyExposed:false},rawFiles};
}
const shellQuote=s=>"'"+s.replaceAll("'","'\"'\"'")+"'";
async function readRoot(host){
 const{lanProfile}=await import('./managed-server-client.mjs');
 const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n /usr/bin/python3 -I -c '+shellQuote(host.toString('utf8'))],{input:Buffer.from(JSON.stringify(REQUEST)),timeout:90000,windowsHide:true,maxBuffer:WIRE_MAX});
 return{status:r.status??null,signal:r.signal??null,errorCode:r.error?.code??null,stdout:Buffer.from(r.stdout??''),stderr:Buffer.from(r.stderr??'')};
}
const preparation=errorCode=>({schemaVersion:1,kind:PREFIX+'-preparation',ready:false,errorCode,localIOPerformed:false,actualDiagnosticExecuted:false,diagnosticReadComplete:false,rootCalls:0,maximumRootCalls:1,automaticRetry:false,executionNonce:null,...flags()});
export async function readFactoryMain602DriverDiagnosticR33({activation=main602DriverDiagnosticR33Activation,actualReview=main602DriverDiagnosticR33ActualReview}={}){
 if(activation===null||actualReview===null)return preparation('R33_MAIN_DRIVER_DIAG_EXPLICIT_DATA_AND_REVIEW_REQUIRED');
 need(pathValid(activation)&&pathValid(actualReview)&&activation!==actualReview,'R33_MAIN_DRIVER_DIAG_EXPLICIT_PATHS_REQUIRED');
 const originals=new Map(),acquire=async(path,expected=null)=>{const raw=await heldRead(path);if(expected)need(fullref(expected)&&expected.path===path&&sha(raw)===expected.sha256&&raw.length===expected.bytes,'R33_MAIN_DRIVER_DIAG_SOURCE_REF_CHANGED');const old=originals.get(path);need(!old||old.equals(raw),'R33_MAIN_DRIVER_DIAG_SOURCE_CONFLICT');originals.set(path,raw);return raw};
 const recheck=async()=>{let first=null;for(const[path,raw]of originals)try{need((await heldRead(path)).equals(raw),'R33_MAIN_DRIVER_DIAG_SOURCE_CHANGED')}catch(e){if(!first)first=e}if(first)throw first};
 const dataRaw=await acquire(activation),reviewRaw=await acquire(actualReview),data=parseOriginal(dataRaw),review=parseOriginal(reviewRaw),dataRef=bytesRef(activation,dataRaw),reviewRef=bytesRef(actualReview,reviewRaw);
 need(keys(data,['schemaVersion','kind','remoteReadAuthorized','request','sourceRefs'])&&data.schemaVersion===1&&data.kind===PREFIX+'-actual-data'&&data.remoteReadAuthorized===true&&same(data.request,REQUEST)&&keys(data.sourceRefs,REF_KEYS)&&Object.values(data.sourceRefs).every(fullref),'R33_MAIN_DRIVER_DIAG_ACTUAL_DATA_CHANGED');
 const refs=data.sourceRefs;
 need(Object.entries(FIXED).every(([k,r])=>same(refs[k],r))&&refs.program.path===PROGRAM&&refs.program.bytes<65536&&refs.caller.path===SELF&&refs.hostProgram.path===HOST&&refs.hostProgram.bytes<100000&&refs.extractionProof.path==='artifacts/software-factory/goals-r29/r33-main602-driver-diagnostic-r1-source-extraction-proof.json'&&refs.authorReport.path.startsWith('artifacts/software-factory/goals-r29/'+PREFIX+'-'),'R33_MAIN_DRIVER_DIAG_FIXED_SOURCES_CHANGED');
 const required=[dataRef,...Object.values(refs)];need(new Set([...required.map(r=>r.path),actualReview]).size===15,'R33_MAIN_DRIVER_DIAG_SOURCE_GRAPH_CHANGED');
 need(review&&review.kind===PREFIX+'-specific-entry-independent-local-review'&&review.staticPreparationReady===true&&review.remainingP0P1===0&&review.remoteOperationsPerformed===false&&review.actualDiagnosticExecuted===false&&review.callerSHA256===refs.caller.sha256&&review.programSHA256===refs.program.sha256&&review.hostProgramSHA256===refs.hostProgram.sha256&&review.contextSHA256===dataRef.sha256&&Array.isArray(review.sourceRefs)&&review.sourceRefs.length===14&&review.sourceRefs.every(fullref)&&new Set(review.sourceRefs.map(r=>r.path)).size===14&&required.every(r=>review.sourceRefs.some(x=>same(x,r))),'R33_MAIN_DRIVER_DIAG_SPECIFIC_REVIEW_REQUIRED');
 for(const r of Object.values(refs))await acquire(r.path,r);
 const host=originals.get(HOST);need(Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(host)).equals(host),'R33_MAIN_DRIVER_DIAG_HOST_ENCODING_CHANGED');
 await absent(ONCE);await absent(OUTCOME);await recheck();
 const sourceRefs=[...required,reviewRef],once=await saveJSON(ONCE,{schemaVersion:1,kind:PREFIX+'-once',at:new Date().toISOString(),data:dataRef,entryReview:reviewRef,sourceRefs,request:REQUEST,opportunityClosed:true,maximumRootCalls:1,automaticRetry:false,executionNonce:null});
 let rootCalls=0,error=null,transportRef=null,hostRef=null,summary=null,sourcesStable=false;const rawFiles=[],secondaryFailureCodes=[];
 try{
  await recheck();rootCalls=1;const r=await readRoot(host);
  need(Buffer.isBuffer(r.stdout)&&Buffer.isBuffer(r.stderr),'R33_MAIN_DRIVER_DIAG_TRANSPORT_SHAPE');
  transportRef=await privateRaw('transport',Buffer.from(JSON.stringify({schemaVersion:1,kind:PREFIX+'-original-transport',data:dataRef,entryReview:reviewRef,caller:refs.caller,program:refs.program,hostProgram:refs.hostProgram,request:REQUEST,status:r.status,signal:r.signal,errorCode:r.errorCode,stdoutBase64:r.stdout.toString('base64'),stderrBase64:r.stderr.toString('base64'),stdoutSHA256:sha(r.stdout),stderrSHA256:sha(r.stderr),stdoutBytes:r.stdout.length,stderrBytes:r.stderr.length})+'\n'));
  hostRef=await privateRaw('host-original',r.stdout);
  need(r.status===0&&r.signal===null&&r.errorCode===null&&r.stdout.length+r.stderr.length<=WIRE_MAX,'R33_MAIN_DRIVER_DIAG_TRANSPORT_INCOMPLETE');
  const checked=assertMain602DriverDiagnosticR33Host(parseOriginal(r.stdout));summary=checked.summary;
  for(const item of checked.rawFiles)rawFiles.push({role:item.label,partial:item.partial,ref:await privateRaw(item.label+(item.partial?'-prefix':'-original'),item.raw)});
 }catch(e){error=e}
 try{await recheck();sourcesStable=true}catch(e){if(error)secondaryFailureCodes.push(closed(e));else error=e}
 const ready=error===null&&sourcesStable&&summary?.diagnosticReadComplete===true;
 const result={schemaVersion:1,kind:PREFIX+'-result',at:new Date().toISOString(),ready,diagnosticReadComplete:ready,errorCode:error?closed(error):null,secondaryFailureCodes,data:dataRef,entryReview:reviewRef,sourceRefs,once,opportunityClosed:true,remoteReadAttempted:rootCalls===1,actualDiagnosticExecuted:summary!==null,rootCalls,maximumRootCalls:1,automaticRetry:false,executionNonce:null,maximumHostSeconds:60,sshTimeoutSeconds:90,sourceBytesStable:sourcesStable,originalTransport:transportRef,originalHostBytes:hostRef,rawFiles,diagnostic:summary,...flags()};
 const outcome=await saveJSON(OUTCOME,result);
 const receipt=await saveJSON('artifacts/software-factory/goals-r29/'+PREFIX+'-actual-observation-'+Date.now()+'-'+randomUUID()+'.json',{...result,outcome});
 return{...result,outcome,receipt};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{need(process.argv.length===2||process.argv.length===4,'R33_MAIN_DRIVER_DIAG_TWO_EXTERNAL_PATHS_REQUIRED');const result=await readFactoryMain602DriverDiagnosticR33(process.argv.length===2?{}:{activation:process.argv[2],actualReview:process.argv[3]});console.log(JSON.stringify({kind:result.kind,ready:result.ready,diagnosticReadComplete:result.diagnosticReadComplete,errorCode:result.errorCode,receipt:result.receipt??null,rootCalls:result.rootCalls,maximumRootCalls:1,automaticRetry:false,executionNonce:null,opportunityClosed:result.opportunityClosed??false,actualDiagnosticExecuted:result.actualDiagnosticExecuted,diagnostic:result.diagnostic??null,...flags()}));if(!result.ready)process.exitCode=1}
 catch(e){console.log(JSON.stringify({...preparation(closed(e)),kind:PREFIX+'-entry-failure',localIOPerformed:true,actualDiagnosticExecuted:null,rootCalls:null,opportunityClosed:null}));process.exitCode=1}
}
