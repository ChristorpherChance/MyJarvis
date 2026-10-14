/** One finite UID1000 self-FD qualification; no host census or candidate execution. */
import {readFile,open,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(value,code)=>{if(!value)throw Error(code)};
const paths={caller:'scripts/read-factory-single-dirent-self-r33.mjs',module:'scripts/factory-single-dirent-r33.py',fixture:'scripts/factory-single-dirent-linux-fixture-r33-r2.py',dependency:'scripts/managed-server-client.mjs'};
const dependencySHA256='e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f';
const journal='.jarvis-dev/maintenance/r33-single-dirent-self-qualification-once.json';
async function wx(path,value){const b=Buffer.from(JSON.stringify(value,null,2)+'\n'),f=await open(path,'wx',0o600);try{await f.writeFile(b);await f.sync()}finally{await f.close()}return{path,sha256:sha(b),bytes:b.length}}
async function durableIntent(value){const receipt=await wx(journal,value),temp=journal+'.'+randomUUID()+'.tmp',copy=await wx(temp,value);need(copy.sha256===receipt.sha256,'R33_DIRENT_INTENT_CHANGED');
 if(process.platform==='win32'){const r=spawnSync('python',['-c',"import ctypes,sys;f=ctypes.WinDLL('kernel32',use_last_error=True).MoveFileExW;f.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_ulong];f.restype=ctypes.c_int;sys.exit(0 if f(sys.argv[1],sys.argv[2],9) else 1)",resolve(temp),resolve(journal)],{windowsHide:true,timeout:10000});need(r.status===0,'R33_DIRENT_INTENT_DURABILITY_FAILED')}
 else{await rename(temp,journal);const directory=await open('.jarvis-dev/maintenance','r');try{await directory.sync()}finally{await directory.close()}}
 need(sha(await readFile(journal))===receipt.sha256,'R33_DIRENT_INTENT_CHANGED');return receipt;
}
export function singleDirentSelfR33HostProgram(bundle=null){
 need(bundle&&Buffer.isBuffer(bundle.module)&&Buffer.isBuffer(bundle.fixture),'R33_DIRENT_SOURCE_BUNDLE_REQUIRED');
 need(bundle.module.length>0&&bundle.module.length<=65536&&bundle.fixture.length>0&&bundle.fixture.length<=65536,'R33_DIRENT_SOURCE_BUNDLE_LIMIT');
 const encoded=Buffer.from(JSON.stringify({moduleSHA256:sha(bundle.module),moduleBase64:bundle.module.toString('base64'),fixtureSHA256:sha(bundle.fixture),fixtureBase64:bundle.fixture.toString('base64')})).toString('base64');
 return `import signal,time,os,sys,ctypes,json,base64,hashlib
parent_started=time.monotonic()
def deadline(signum,frame):raise TimeoutError('R33_SELF_PARENT_DEADLINE')
signal.signal(signal.SIGALRM,deadline)
signal.alarm(8)
value={'kind':'r33-single-dirent-self-parent-failure','readComplete':False,'actualSingleDirentKernelQualified':False,'wholeProcCensusExecuted':False,'productCodeExecuted':False,'productAccepted':False}
try:
 def need(ok,code):
  if not ok:raise RuntimeError(code)
 payload=json.loads(base64.b64decode('${encoded}',validate=True))
 fixture=base64.b64decode(payload['fixtureBase64'],validate=True)
 need(len(fixture)<=65536 and hashlib.sha256(fixture).hexdigest()==payload['fixtureSHA256'],'R33_SELF_PARENT_SOURCE_CHANGED')
 need(sys.platform=='linux' and os.uname().machine=='x86_64' and sys.byteorder=='little','R33_SELF_PARENT_ABI_REQUIRED')
 need(os.getuid()==os.geteuid()==0 and os.getgid()==os.getegid()==0,'R33_SELF_PARENT_ROOT_REQUIRED')
 os.environ.clear()
 os.setgroups([])
 os.setgid(1000)
 os.setuid(1000)
 library=ctypes.CDLL(None,use_errno=True)
 library.prctl.restype=ctypes.c_int
 library.prctl.argtypes=[ctypes.c_int,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_ulong]
 ctypes.set_errno(0)
 need(library.prctl(38,1,0,0,0)==0,'R33_SELF_PARENT_NNP_FAILED')
 namespace={'__name__':'jarvis_fixed_single_dirent_fixture'}
 exec(compile(fixture,'fixed-single-dirent-fixture-r33-r2','exec'),namespace)
 value=namespace['run_self_fd_fixture_r33_r2']({'moduleSHA256':payload['moduleSHA256'],'moduleBase64':payload['moduleBase64']},parent_started)
 value['parentFixtureSHA256']=payload['fixtureSHA256']
 value['parentSourceBundleVerified']=True
 value['parentSameProcess']=True
 value['parentEnvironmentCleared']=True
 value['parentSupplementaryGroupsCleared']=os.getgroups()==[]
 value['parentAlarmNotExtended']=True
except BaseException as error:
 value={'kind':'r33-single-dirent-self-parent-failure','readComplete':False,'actualSingleDirentKernelQualified':False,'wholeProcCensusExecuted':False,'productCodeExecuted':False,'productAccepted':False,'firstError':{'phase':'trusted-parent','errorCode':str(error) if str(error).startswith('R33_') else 'R33_SELF_PARENT_INCOMPLETE','errno':getattr(error,'errno',None)}}
finally:
 signal.alarm(0)
print(json.dumps(value,separators=(',',':')))
sys.exit(0 if value.get('actualSingleDirentKernelQualified') is True else 1)
`;
}
export async function readSingleDirentSelfR33(reviewRef=null){
 need(reviewRef&&typeof reviewRef.path==='string'&&/^[a-f0-9]{64}$/.test(reviewRef.sha256),'R33_DIRENT_REVIEW_REQUIRED');
 const sources={};for(const[k,p]of Object.entries(paths))sources[k]=await readFile(p);
 need(sha(sources.dependency)===dependencySHA256,'R33_DIRENT_TRANSPORT_SOURCE_CHANGED');
 const rb=await readFile(reviewRef.path);need(sha(rb)===reviewRef.sha256,'R33_DIRENT_REVIEW_CHANGED');const review=JSON.parse(rb);
 need(review.kind==='r33-single-dirent-self-parent-independent-local-review'&&review.ready===true&&review.remoteOperationsPerformed===false&&review.reviewScope==='finite-self-only-bundle','R33_DIRENT_REVIEW_SCOPE_MISMATCH');
 for(const k of Object.keys(sources))need(review[k+'SHA256']===sha(sources[k]),'R33_DIRENT_REVIEW_SOURCE_MISMATCH');
 const program=singleDirentSelfR33HostProgram(sources);need(review.hostProgramSHA256===sha(program),'R33_DIRENT_REVIEW_PROGRAM_MISMATCH');
 for(const[k,p]of Object.entries(paths))need(sha(await readFile(p))===sha(sources[k]),'R33_DIRENT_SOURCE_CHANGED');
 need(sha(await readFile(reviewRef.path))===reviewRef.sha256,'R33_DIRENT_REVIEW_CHANGED');
 const{lanProfile}=await import('./managed-server-client.mjs');
 const intent=await durableIntent({kind:'r33-single-dirent-self-qualification-intent',at:new Date().toISOString(),reviewRef,sourceSHA256:Object.fromEntries(Object.entries(sources).map(([k,b])=>[k,sha(b)])),hostProgramSHA256:sha(program),maximumCalls:1,retries:0,programAlarmSeconds:8,transportTimeoutSeconds:15,scope:'self-fd-only',candidateCodeExecution:false,wholeCensusQualified:false});
 const r=spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n /usr/bin/python3 -I -B -'],{input:program,windowsHide:true,timeout:15000,maxBuffer:200000});
 const stdout=Buffer.from(r.stdout??''),stderr=Buffer.from(r.stderr??'');
 const raw=await wx('.jarvis-dev/maintenance/r33-single-dirent-self-private-'+Date.now()+'-'+randomUUID()+'.json',{status:r.status??null,stdoutBase64:stdout.toString('base64'),stderrBase64:stderr.toString('base64'),stdoutSHA256:sha(stdout),stderrSHA256:sha(stderr),reviewRef,intent,hostProgramSHA256:sha(program)});
 let v;try{v=JSON.parse(stdout)}catch{v={firstError:{errorCode:'R33_DIRENT_RESPONSE_INCOMPLETE'}}}
 let sourceUnchanged=sha(await readFile(reviewRef.path))===reviewRef.sha256;for(const[k,p]of Object.entries(paths))sourceUnchanged&&=sha(await readFile(p))===sha(sources[k]);
 const sec=v.security??{},caps=sec.capabilities??{};
 const qualified=r.status===0&&sourceUnchanged&&v.actualSingleDirentKernelQualified===true&&v.readComplete===true&&v.allOwnedDescriptorsClosed===true&&v.elapsedWithinDeadline===true&&v.fixedBufferBytes===47&&v.minimumRecordBytes===24&&v.parentSameProcess===true&&v.parentEnvironmentCleared===true&&v.parentSupplementaryGroupsCleared===true&&v.parentSourceBundleVerified===true&&v.parentFixtureSHA256===sha(sources.fixture)&&sec.uid===1000&&sec.gid===1000&&sec.noNewPrivileges===true&&caps.effective===0&&caps.permitted===0&&caps.inheritable===0&&v.wholeProcCensusExecuted===false&&v.productCodeExecuted===false;
 const safe={kind:'r33-single-dirent-self-kernel-result',at:new Date().toISOString(),ready:qualified,actualSingleDirentKernelQualified:qualified,scope:'self-fd-only',kernelRelease:typeof v.actualKernel==='string'&&/^[A-Za-z0-9._+-]{1,100}$/.test(v.actualKernel)?v.actualKernel:null,architecture:v.actualMachine==='x86_64'?'x86_64':null,security:qualified?{uid:1000,gid:1000,noNewPrivileges:true,capabilities:{effective:0,permitted:0,inheritable:0}}:null,entryCount:Number.isSafeInteger(v.entryCount)?v.entryCount:null,numericFDEntryCount:Number.isSafeInteger(v.numericFDEntryCount)?v.numericFDEntryCount:null,getdentsCallsIncludingEOF:Number.isSafeInteger(v.getdentsCallsIncludingEOF)?v.getdentsCallsIncludingEOF:null,entryRecordsSHA256:/^[a-f0-9]{64}$/.test(v.entryRecordsSHA256??'')?v.entryRecordsSHA256:null,recordSizeCounts:qualified?v.recordSizeCounts:null,allOwnedDescriptorsClosed:v.allOwnedDescriptorsClosed===true,parentSameProcess:v.parentSameProcess===true,sourceUnchanged,oldUnknownPreserved:true,oldRaceResolved:false,wholeCensusQualified:false,cleanupIndependentlyVerified:false,productAccepted:false,newModelOrProductionDeployment:false,reviewRef,intent,privateObservation:raw,firstError:v.firstError&&/^[A-Z0-9_]{1,100}$/.test(v.firstError.errorCode??'')?{phase:/^[a-z-]{1,100}$/.test(v.firstError.phase??'')?v.firstError.phase:null,errorCode:v.firstError.errorCode,errno:Number.isSafeInteger(v.firstError.errno)?v.firstError.errno:null}:null};
 const receipt=await wx('artifacts/software-factory/goals-r29/r33-single-dirent-self-kernel-result-'+Date.now()+'-'+randomUUID()+'.json',safe);return{receipt,ready:qualified,actualSingleDirentKernelQualified:qualified,wholeCensusQualified:false};
}
// No command-line execution or implicit activation.
