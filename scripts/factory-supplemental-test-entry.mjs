/** Fixed isolated supplemental checks. Original product assertions and full-suite counts stay unchanged. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,readdir,open,writeFile,mkdir} from 'node:fs/promises';
import {writeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const WORK='/work/source',EVIDENCE='/evidence',PNPM='/corepack-runtime/dist/pnpm.js';
const EXPECTED_SOURCE='25ae0ce3523832bedac7d0838d0061f6a57a5af4a112f2d25e8551a980f4f4bf';
const ORIGINAL_TEST='apps/server/src/modules/executor/sandbox.integration.test.ts';
const PIN='sha256:bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731';
const STAGES=Object.freeze(['timeout-cleanup-smoke','offline-install','build','original-sandbox-tests','sandbox-functional-probe','prototype-selftest','prototype-selftest-boundary','prototype-build-artifact']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function parseProcStat(value){
 const split=value.lastIndexOf(')');if(split<1)throw Error('PROC_STAT_INVALID');
 const pid=Number(value.slice(0,value.indexOf(' '))),fields=value.slice(split+2).trim().split(/\s+/);
 if(!Number.isSafeInteger(pid)||pid<1||fields.length<20||!/^\d+$/.test(fields[19]))throw Error('PROC_STAT_INVALID');
 return {pid,startTicks:fields[19],state:fields[0],ppid:Number(fields[1])};
}
export function selectNewIdentities(current,baseline,entryPid){
 const known=new Set(baseline.map(x=>`${x.pid}:${x.startTicks}`));
 return current.filter(x=>x.uid===1000&&x.pid>1&&x.pid!==entryPid&&x.state!=='Z'&&!known.has(`${x.pid}:${x.startTicks}`));
}
export function guardedScope(env,cwd,uid){
 const forbidden=['V18_CASE','V19_CASE','V19_CATALOG_SOURCE_ONLY','V19_CUSTOMER_ARTIFACT_HTML','V19_SKIP_HEALTH','V19_PROTOTYPE_CANDIDATE','V19_EVIDENCE_DIR','MSF_SANDBOX_IMAGES','OPENAI_API_KEY','ANTHROPIC_API_KEY','PI_API_KEY'];
 return forbidden.every(k=>env[k]===undefined)&&env.MSF_AI_PROVIDER!=='pi'&&uid===1000&&cwd===WORK&&/^[0-9a-f]{40}$/.test(env.JARVIS_FULL_TEST_RUN_ID??'')&&
  env.JARVIS_SOURCE_SHA256===EXPECTED_SOURCE&&env.JARVIS_SUPPLEMENTAL_TEST==='1'&&
  env.JARVIS_SANDBOX_FIXTURE_READY==='1'&&env.MSF_SANDBOX_NETWORK===`jarvis-ft-${env.JARVIS_FULL_TEST_RUN_ID}-sandbox-net`;
}
export function originalSandboxCounts(j){
 if(!j||!Array.isArray(j.testResults)||j.testResults.length!==1||j.testResults[0].name!==`${WORK}/${ORIGINAL_TEST}`)throw Error('ORIGINAL_SIX_CASE_REPORT_IDENTITY_INVALID');
 const file=j.testResults[0],rows=file.assertionResults;
 if(!Array.isArray(rows)||rows.length!==6||rows.some(x=>!['passed','failed','pending','skipped','todo'].includes(x.status)))throw Error('ORIGINAL_SIX_CASE_REPORT_INVALID');
 const passed=rows.filter(x=>x.status==='passed').length,failed=rows.filter(x=>x.status==='failed').length,pending=6-passed-failed;
 if(j.numTotalTests!==6||j.numPassedTests!==passed||j.numFailedTests!==failed||j.numPendingTests!==pending)throw Error('ORIGINAL_SIX_CASE_COUNTS_MISMATCH');
 return {total:6,passed,failed,pending,success:j.success===true,files:[{path:ORIGINAL_TEST,status:file.status,total:6,passed,failed,skipped:pending}]};
}

// Descriptor pinning closes the PID-reuse race. Only same-UID processes in this container are eligible.
export const KILL_HELPER=String.raw`import os,json,sys,signal,selectors,time
from pathlib import Path
def identity(pid):
 try:
  q=Path('/proc')/str(pid);s=(q/'stat').read_text();f=s[s.rfind(')')+2:].split()
  line=next(x for x in (q/'status').read_text().splitlines() if x.startswith('Uid:'))
  ids=[int(x) for x in line.split()[1:]]
  return {'uid':ids[0],'allUid1000':all(x==1000 for x in ids),'startTicks':f[19],'state':f[0]}
 except (FileNotFoundError,ProcessLookupError):return None
def main():
 if os.getuid()!=1000 or not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):raise RuntimeError('PIDFD_REQUIRED')
 probe=os.pidfd_open(os.getpid(),0);os.close(probe)
 init=Path('/proc/1/comm').read_text().strip()
 if init not in ['docker-init','tini'] or os.readlink('/proc/1/ns/pid')!=os.readlink('/proc/self/ns/pid'):raise RuntimeError('PRIVATE_CONTAINER_PID_NAMESPACE_REQUIRED')
 p=json.loads(sys.stdin.read(65537))
 if set(p)!=set(['entryPid','entryStartTicks','targets']) or type(p['entryPid']) is not int or not str(p['entryStartTicks']).isdigit() or len(p['targets'])>512:raise RuntimeError('PROCESS_SCOPE_INVALID')
 entry=identity(p['entryPid'])
 if not entry or not entry['allUid1000'] or entry['startTicks']!=p['entryStartTicks']:raise RuntimeError('ENTRY_IDENTITY_INVALID')
 fds=[];gone=0;changed=0
 try:
  for row in p['targets']:
   if set(row)!=set(['pid','startTicks']) or type(row['pid']) is not int or row['pid']<=1 or row['pid'] in [p['entryPid'],os.getpid()] or not str(row['startTicks']).isdigit():raise RuntimeError('PROCESS_SCOPE_INVALID')
   try:fd=os.pidfd_open(row['pid'],0)
   except ProcessLookupError:gone+=1;continue
   cur=identity(row['pid'])
   if not cur or cur['state']=='Z':os.close(fd);gone+=1;continue
   if not cur['allUid1000'] or cur['startTicks']!=row['startTicks']:os.close(fd);changed+=1;continue
   fds.append(fd)
  sel=selectors.DefaultSelector()
  try:
   for fd in fds:
    sel.register(fd,selectors.EVENT_READ)
    try:signal.pidfd_send_signal(fd,signal.SIGTERM,None,0)
    except ProcessLookupError:pass
   deadline=time.monotonic()+2
   while sel.get_map() and time.monotonic()<deadline:
    for key,_ in sel.select(max(0,deadline-time.monotonic())):sel.unregister(key.fd)
   for fd in list(sel.get_map()):
    try:signal.pidfd_send_signal(fd,signal.SIGKILL,None,0)
    except ProcessLookupError:pass
   deadline=time.monotonic()+3
   while sel.get_map() and time.monotonic()<deadline:
    for key,_ in sel.select(max(0,deadline-time.monotonic())):sel.unregister(key.fd)
   print(json.dumps({'ok':len(sel.get_map())==0,'pinned':len(fds),'alreadyGone':gone,'identityChangedNotSignaled':changed,'descriptorsRemaining':len(sel.get_map())}))
  finally:sel.close()
 finally:
  for fd in fds:os.close(fd)
try:main()
except:print(json.dumps({'ok':False,'code':'STAGE_PROCESS_CLEANUP_UNCONFIRMED'}));sys.exit(1)
`;
const CHROMIUM_SMOKE=String.raw`const {chromium}=require('/opt/test-tools/node_modules/playwright');(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage();await p.goto('about:blank');console.log('CHROMIUM_TIMEOUT_FIXTURE_READY');setInterval(()=>{},1000);})().catch(()=>{console.log('CHROMIUM_TIMEOUT_FIXTURE_START_FAILED');process.exitCode=1;});`;

async function identities(){
 const out=[];
 for(const name of await readdir('/proc')){
  if(!/^\d+$/.test(name))continue;
  try{
   const [raw,status]=await Promise.all([readFile(`/proc/${name}/stat`,'utf8'),readFile(`/proc/${name}/status`,'utf8')]);
   const ids=status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);
   if(!ids||!ids.slice(1).every(x=>x==='1000'))continue;
   out.push({...parseProcStat(raw),uid:1000});
  }catch(e){if(!['ENOENT','ESRCH','EACCES'].includes(e?.code))throw e;}
 }
 return out;
}
async function runCleanupHelper(targets,entryStartTicks){
 return new Promise(resolveResult=>{
  const child=spawn('/usr/bin/python3',['-I','-c',KILL_HELPER],{stdio:['pipe','pipe','ignore'],shell:false});let output='',done=false;
  const finish=r=>{if(done)return;done=true;clearTimeout(timer);resolveResult(r);};
  const timer=setTimeout(()=>finish({ok:false,code:'STAGE_CLEANUP_HELPER_TIMEOUT'}),10000);
  child.stdout.on('data',b=>{output+=b.toString();if(output.length>4096)finish({ok:false,code:'STAGE_CLEANUP_OUTPUT_INVALID'});});
  child.once('error',()=>finish({ok:false,code:'STAGE_CLEANUP_HELPER_START_FAILED'}));
  child.once('close',code=>{try{const r=JSON.parse(output);finish({...r,ok:code===0&&r.ok===true});}catch{finish({ok:false,code:'STAGE_CLEANUP_OUTPUT_INVALID'});}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({entryPid:process.pid,entryStartTicks,targets:targets.map(({pid,startTicks})=>({pid,startTicks}))}));
 });
}

async function main(){
 if(!guardedScope(process.env,process.cwd(),process.getuid?.()))throw Error('FIXED_SUPPLEMENTAL_SCOPE_REQUIRED');
 const init=(await readFile('/proc/1/comm','utf8')).trim();
 if(!['docker-init','tini'].includes(init))throw Error('PRIVATE_CONTAINER_INIT_REQUIRED');
 const baseline=(await identities()).filter(x=>x.pid>1);
 if(baseline.length!==1||baseline[0].pid!==process.pid)throw Error('CLEAN_PRIVATE_CONTAINER_BASELINE_REQUIRED');
 const runId=process.env.JARVIS_FULL_TEST_RUN_ID;
 await mkdir(EVIDENCE,{recursive:true});await mkdir('/work/home',{recursive:true});
 const report={formatVersion:1,runId,sourceFingerprint:EXPECTED_SOURCE,startedAt:new Date().toISOString(),finishedAt:null,
  scope:'Separate supplemental run: bounded timeout recovery and original/supplemental sandbox checks; never merged into earlier full-suite counts.',
  collectorCompleted:false,scopeComplete:false,allPlannedStagesAttempted:false,productVerdict:'NO-GO',productDeliveryAccepted:false,modelsInvoked:false,
  productionDatabaseUsed:false,sourceCodeChanged:false,includedInOriginalFullSuiteCounts:false,stages:[],originalSandboxTests:null,browserSuites:[],blocks:[],
  expectedStages:[...STAGES],testManifest:[],browserSuiteManifest:['selftest','selftest-boundary','build-artifact'],initialProcessBaseline:{entryPid:process.pid,uid:1000,initProcess:init,initPidExcludedFromCleanup:1,uid1000NonInitCount:baseline.length},timeoutCleanupSmoke:null,sandboxFunctional:null};
 let failClosed=false;
 async function save(){report.finishedAt=new Date().toISOString();await writeFile(join(EVIDENCE,'container-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 async function clean(){
  let observed=0;const rounds=[];
  for(let i=0;i<3;i++){
   const targets=selectNewIdentities(await identities(),baseline,process.pid);observed+=targets.length;
   if(targets.length===0)return {confirmed:true,newProcessesObserved:observed,remainingLive:0,rounds};
   const r=await runCleanupHelper(targets,baseline[0].startTicks);rounds.push(r);
   if(r.ok!==true)return {confirmed:false,newProcessesObserved:observed,remainingLive:null,rounds};
   await sleep(100);
  }
  const left=selectNewIdentities(await identities(),baseline,process.pid);
  return {confirmed:left.length===0,newProcessesObserved:observed,remainingLive:left.length,rounds};
 }
 async function stage(name,args,timeoutMs,{cwd=WORK,smoke=false}={}){
  if(failClosed){const row={name,attempted:false,ok:false,blockedCode:'PREVIOUS_STAGE_CLEANUP_UNCONFIRMED'};report.stages.push(row);await save();return row;}
  const started=Date.now(),log=await open(join(EVIDENCE,name+'.log'),'wx',0o600);
  let child,timer,resolveDeadline,ready=false,tail='',logged=0,logLimited=false,exit;
  const deadline=new Promise(r=>{resolveDeadline=r;});
  const setDeadline=ms=>{clearTimeout(timer);timer=setTimeout(()=>resolveDeadline({timeout:true,exitCode:null,signal:null}),ms);};
  try{
   const completed=new Promise(resolveResult=>{
    try{child=spawn(process.execPath,args,{cwd,env:process.env,stdio:['ignore','pipe','pipe'],shell:false,detached:true});}
    catch{resolveResult({timeout:false,exitCode:null,errorCode:'STAGE_PROCESS_START_FAILED'});return;}
    const chunk=b=>{
     logged+=b.length;if(logged>16*1024*1024){logLimited=true;resolveDeadline({timeout:false,exitCode:null,errorCode:'STAGE_LOG_LIMIT_EXCEEDED'});return;}
     try{if(writeSync(log.fd,b)!==b.length)resolveDeadline({timeout:false,exitCode:null,errorCode:'STAGE_LOG_WRITE_FAILED'});}catch{resolveDeadline({timeout:false,exitCode:null,errorCode:'STAGE_LOG_WRITE_FAILED'});}
     if(smoke&&!ready){tail=(tail+b.toString()).slice(-512);if(tail.includes('CHROMIUM_TIMEOUT_FIXTURE_READY')){ready=true;setDeadline(4000);}}
    };
    child.stdout.on('data',chunk);child.stderr.on('data',chunk);
    child.once('error',()=>resolveResult({timeout:false,exitCode:null,errorCode:'STAGE_PROCESS_START_FAILED'}));
    child.once('close',(exitCode,signal)=>resolveResult({timeout:false,exitCode,signal}));
   });
   setDeadline(timeoutMs);exit=await Promise.race([completed,deadline]);clearTimeout(timer);
   const cleanup=await clean();
   if(cleanup.confirmed!==true){failClosed=true;report.blocks.push({code:'STAGE_PROCESS_CLEANUP_UNCONFIRMED',stage:name});}
   child?.stdout?.destroy();child?.stderr?.destroy();
   const normalResidual=exit.timeout!==true&&cleanup.newProcessesObserved>0;
   const ok=smoke?ready&&exit.timeout===true&&cleanup.confirmed===true&&cleanup.newProcessesObserved>=2:
    exit.exitCode===0&&exit.timeout!==true&&cleanup.confirmed===true&&!normalResidual&&!logLimited;
   const row={name,attempted:true,...exit,ok,durationMs:Date.now()-started,configuredTimeoutMs:timeoutMs,cleanup,
    normalExitResidualProcesses:normalResidual,...(smoke?{launchReadyObserved:ready,forcedTimeoutAfterReadyMs:4000}:{}),log:null};
   report.stages.push(row);return row;
  }catch{
   failClosed=true;const cleanup=await clean().catch(()=>({confirmed:false}));
   const row={name,attempted:true,ok:false,errorCode:'STAGE_LIFECYCLE_OR_CLEANUP_FAILED',cleanup,durationMs:Date.now()-started,log:null};report.stages.push(row);return row;
  }finally{
   clearTimeout(timer);child?.stdout?.destroy();child?.stderr?.destroy();await log.close();
   const bytes=await readFile(join(EVIDENCE,name+'.log'));const row=report.stages.at(-1);if(row?.name===name)row.log={path:name+'.log',sha256:sha(bytes),bytes:bytes.length};
   await save();process.stdout.write(JSON.stringify({phase:name,ok:row.ok,timeout:row.timeout===true,attempted:row.attempted,durationMs:row.durationMs??0})+'\n');
  }
 }
 report.cleanupHelperPreflight=await runCleanupHelper([],baseline[0].startTicks);
 if(report.cleanupHelperPreflight.ok!==true){failClosed=true;report.blocks.push({code:'PIDFD_HELPER_PREFLIGHT_UNAVAILABLE'});}
 try{
  const original=await readFile(join(WORK,ORIGINAL_TEST));
  if(!original.toString().includes(PIN))throw Error('ORIGINAL_SANDBOX_PIN_REQUIRED');
  report.testManifest=[{path:ORIGINAL_TEST,sha256:sha(original)}];
  report.originalSandboxTest={path:ORIGINAL_TEST,sha256Before:sha(original),originalPIN:PIN,assertionsChanged:false};
  report.timeoutCleanupSmoke=await stage('timeout-cleanup-smoke',['-e',CHROMIUM_SMOKE],20000,{smoke:true});
  report.timeoutCleanupSmoke.passed=report.timeoutCleanupSmoke.ok===true;
  if(!report.timeoutCleanupSmoke.passed){failClosed=true;report.blocks.push({code:'TIMEOUT_CLEANUP_SMOKE_UNVERIFIED'});}
  await stage('offline-install',[PNPM,'install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/pnpm-store'],240000);
  await stage('build',[PNPM,'-r','--no-bail','run','build'],420000);
  await stage('original-sandbox-tests',[PNPM,'exec','vitest','run','src/modules/executor/sandbox.integration.test.ts','--coverage.enabled=false','--reporter=json','--outputFile=/evidence/original-sandbox-test-report.json','--fileParallelism=false','--maxWorkers=1','--minWorkers=1'],180000,{cwd:join(WORK,'apps/server')});
  if(!failClosed)try{
   const raw=await readFile(join(EVIDENCE,'original-sandbox-test-report.json'));const j=JSON.parse(raw);
   report.originalSandboxTests={scope:'Original BF six assertions; separate run, no additions to previous full-suite counts.',...originalSandboxCounts(j),reportSHA256:sha(raw)};
  }catch{report.blocks.push({code:'ORIGINAL_SANDBOX_REPORT_MISSING_OR_INVALID'});}
  await stage('sandbox-functional-probe',['/tools/factory-sandbox-probe.mjs'],90000);
  if(!failClosed)try{
   const r=JSON.parse(await readFile(join(EVIDENCE,'sandbox-functional-probe.json'),'utf8'));
   if(r.runId!==runId||r.sourceSHA256!==EXPECTED_SOURCE||r.originalTestPIN!==PIN||r.includedInOriginalTestCounts!==false||r.productDeliveryAccepted!==false)throw Error('SUPPLEMENTAL_SANDBOX_SCOPE_INVALID');
   report.sandboxFunctional=r;
  }catch{report.blocks.push({code:'SUPPLEMENTAL_SANDBOX_REPORT_MISSING_OR_INVALID'});}
  for(const name of ['selftest','selftest-boundary','build-artifact']){
   const row=await stage('prototype-'+name,[join(WORK,'doc/tests',name+'.cjs')],600000);
   report.browserSuites.push({name,attempted:row.attempted,ok:row.ok,stage:row.name,timeout:row.timeout===true,configuredTimeoutMs:600000});
  }
  report.originalSandboxTest.sha256After=sha(await readFile(join(WORK,ORIGINAL_TEST)));
  report.originalSandboxTest.unchanged=report.originalSandboxTest.sha256Before===report.originalSandboxTest.sha256After;
  if(!report.originalSandboxTest.unchanged)report.blocks.push({code:'ORIGINAL_SANDBOX_ASSERTIONS_CHANGED'});
  if(report.timeoutCleanupSmoke?.ok!==true)report.blocks.push({code:'ACTUAL_CHROMIUM_TIMEOUT_CLEANUP_UNVERIFIED'});
  if(report.originalSandboxTests?.total!==6||report.originalSandboxTests.files.length!==1)report.blocks.push({code:'ORIGINAL_SIX_CASE_MANIFEST_INCOMPLETE'});
  if(report.originalSandboxTests&&!report.originalSandboxTests.success||report.originalSandboxTests?.failed>0||report.originalSandboxTests?.pending>0)report.blocks.push({code:'ORIGINAL_SANDBOX_ASSERTIONS_FAILED_OR_SKIPPED'});
  if(report.sandboxFunctional?.probePassed!==true)report.blocks.push({code:'SUPPLEMENTAL_D9_SANDBOX_UNVERIFIED'});
  if(report.browserSuites.some(x=>!x.ok))report.blocks.push({code:'BOUNDED_BROWSER_SUPPLEMENT_INCOMPLETE_OR_FAILED'});
  if(report.stages.some(s=>!s.ok))report.blocks.push({code:'SUPPLEMENTAL_STAGE_FAILED_OR_NOT_RUN'});
  report.allPlannedStagesAttempted=report.stages.length===8&&report.stages.every(s=>s.attempted===true);
  report.scopeComplete=report.allPlannedStagesAttempted&&!failClosed&&report.timeoutCleanupSmoke.passed===true&&report.originalSandboxTest.unchanged===true&&
   report.originalSandboxTests?.total===6&&report.originalSandboxTests.pending===0&&
   report.sandboxFunctional?.counts?.attempted===6&&report.sandboxFunctional.errors?.length===0&&
   report.browserSuites.length===3&&report.browserSuites.every(s=>s.attempted===true&&s.timeout===false);
  report.collectorCompleted=true;
 }catch{report.blocks.push({code:'SUPPLEMENTAL_COLLECTOR_FAILED'});}
 finally{
  report.finalProcessCleanup=await clean().catch(()=>({confirmed:false}));
  if(report.finalProcessCleanup.confirmed!==true){report.blocks.push({code:'FINAL_CONTAINER_PROCESS_CLEANUP_UNCONFIRMED'});report.scopeComplete=false;}
  await save();
 }
 process.stdout.write(JSON.stringify({collectorCompleted:report.collectorCompleted,scopeComplete:report.scopeComplete,productVerdict:'NO-GO',stages:report.stages.length,modelsInvoked:false})+'\n');
 process.exitCode=report.collectorCompleted&&report.finalProcessCleanup.confirmed===true?0:1;
 if(report.finalProcessCleanup.confirmed!==true)process.exit(1);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
