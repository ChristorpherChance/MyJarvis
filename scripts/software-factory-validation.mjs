/** Fixed isolated baseline, not an integration or delivery acceptance. */
import {spawn} from 'node:child_process';
import {readFile,writeFile,open,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

const PNPM='/home/superopen/opt/node22/lib/node_modules/corepack/dist/pnpm.js';
const NODE='/opt/jarvis-development/node/bin/node';
const STORE='/home/superopen/.local/share/pnpm/store';
const ROOT='/var/lib/jarvis-development/101/validation';
const VALIDATOR='/opt/jarvis-development/software-factory/validate-msf.mjs';
const TEST_FILES=['src/fingerprint.test.ts','src/error-codes.test.ts','src/doc-numbering.test.ts'];
const safeVitest=process.argv[2]==='--safe-vitest';
const [directory,runId]=process.argv.slice(safeVitest?3:2);
if(process.argv.length!==(safeVitest?5:4)||!runId||!/^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(runId)||dirname(directory)!==join(ROOT,runId)||!/^attempt-[0-9a-f]{32}$/.test(basename(directory))||await realpath(directory)!==directory||process.getuid?.()===0)throw Error('FIXED_VALIDATOR_SCOPE_REQUIRED');
async function runSafeVitest(){
 const project=join(directory,'source','packages','shared');
 const {startVitest}=await import(pathToFileURL(join(project,'node_modules','vitest','dist','node.js')).href);
 const typescript=(await import(pathToFileURL(join(project,'node_modules','typescript','lib','typescript.js')).href)).default;
 for(const file of TEST_FILES)await readFile(join(project,file));
 process.memoryUsage(); // Requires only the exact current-PID stat rule.
 const phase=(name,count)=>process.stderr.write(JSON.stringify({validationPhase:name,...count===undefined?{}:{count}})+'\n');
 // Execute the unmodified original tests. Only syntax transformation changes;
 // native esbuild's ancestor enumeration is not needed inside the allowlist.
 const fixedTranspile={name:'jarvis-fixed-typescript-syntax',enforce:'pre',transform(code,id){
  if(!/\.tsx?(?:\?.*)?$/.test(id)||id.includes('/node_modules/'))return;
  phase('typescript-transform');
  return {code:typescript.transpileModule(code,{fileName:id,compilerOptions:{target:typescript.ScriptTarget.ES2022,module:typescript.ModuleKind.ESNext,sourceMap:false,jsx:typescript.JsxEmit.ReactJSX}}).outputText,map:null};
 }};
 const auditReporter={onInit(){phase('vitest-init')},onPathsCollected(paths){phase('test-paths',paths.length)},onCollected(files){phase('test-collected',files.length)},onTaskUpdate(packs){phase('test-updates',packs.length)},onFinished(files,errors){phase('vitest-finished',files.length)}};
 const context=await startVitest('test',TEST_FILES,{root:project,config:false,run:true,watch:false,pool:'threads',poolOptions:{threads:{singleThread:true}},maxWorkers:1,minWorkers:1,fileParallelism:false,reporters:['json',auditReporter],outputFile:join(directory,'unit-report.json')},{configFile:false,esbuild:false,plugins:[fixedTranspile],server:{host:'127.0.0.1',hmr:false}});
 if(!context)throw Error('SAFE_VITEST_START_FAILED');
 await context.close();
}
if(safeVitest){await runSafeVitest()}else{
const workspace=join(directory,'source'),startedAt=new Date().toISOString();
const stages=[],copied=JSON.parse(await readFile(join(directory,'copy.json'),'utf8'));
const copy={files:copied.files,bytes:copied.bytes,sha256:copied.sha256,privateEnvCopied:copied.privateEnvCopied,gitBefore:copied.gitBefore,gitAfter:copied.gitAfter,sourceStateChanged:copied.sourceStateChanged,snapshotVerification:copied.snapshotVerification,verificationSha256:copied.verificationSha256,manifestEntries:copied.manifest.length};
const summary={runId,attemptId:basename(directory),source:'/home/superopen/All-Projects/msf',startedAt,finishedAt:null,ok:false,network:'isolated-netns-connect-denied-including-unix',filesystemIsolation:'landlock-allowlist',landlockAllowlist:true,landlockABI:Number(process.env.JARVIS_VALIDATION_LANDLOCK_ABI),privateEnvCopied:false,integrationTests:'not-run',fullDeliveryAcceptance:false,sourceFingerprint:copy.sha256,dependencyLockSHA256:createHash('sha256').update(await readFile(join(workspace,'pnpm-lock.yaml'))).digest('hex'),copy,stages};
summary.sourceFingerprint=summary.copy.sha256;
async function stage(name,args,timeoutMs){
 const log=await open(join(directory,name+'.log'),'wx',0o600),started=Date.now();
 let output;
 try{output=await new Promise((res,rej)=>{
  const command=name==='safe-unit-tests'?[VALIDATOR,'--safe-vitest',directory,runId]:[PNPM,...args];
  const child=spawn(NODE,command,{cwd:workspace,env:process.env,stdio:['ignore',log.fd,log.fd],shell:false,detached:true});
  let timeout=false;const kill=()=>{timeout=true;try{process.kill(-child.pid,'SIGKILL')}catch{}};
  const timer=setTimeout(kill,timeoutMs);child.once('error',error=>{clearTimeout(timer);rej(error)});child.once('close',(code,signal)=>{clearTimeout(timer);res({code,signal,timeout})});
 });}finally{await log.close()}
 const result={name,...output,durationMs:Date.now()-started};stages.push(result);await save();return result.code===0&&!result.timeout;
}
async function save(){summary.finishedAt=new Date().toISOString();await writeFile(join(directory,'report.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600})}
async function unitStage(){
 const started=Date.now();
 const timer=setTimeout(()=>{void(async()=>{
  stages.push({name:'safe-unit-tests',code:null,signal:'SIGKILL',timeout:true,durationMs:Date.now()-started});
  summary.error='SAFE_UNIT_TEST_TIMEOUT';await save();process.exit(1);
 })()},120000);
 try{
  await runSafeVitest();
  stages.push({name:'safe-unit-tests',code:process.exitCode??0,signal:null,timeout:false,durationMs:Date.now()-started});
  await save();return (process.exitCode??0)===0;
 }finally{clearTimeout(timer)}
}
try{
 if(copy.sourceStateChanged)throw Error('SOURCE_CHANGED_DURING_SNAPSHOT');
 if(!await stage('offline-install',['install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir',STORE],180000))throw Error('OFFLINE_DEPENDENCIES_UNAVAILABLE');
 if(!await stage('build',['-r','run','build'],420000))throw Error('BUILD_FAILED');
 if(!await stage('typecheck',['-r','run','typecheck'],420000))throw Error('TYPECHECK_FAILED');
 if(!await unitStage())throw Error('SAFE_UNIT_TEST_FAILED');
 const tests=JSON.parse(await readFile(join(directory,'unit-report.json'),'utf8'));
 const expectedFiles=TEST_FILES.map(file=>join(workspace,'packages','shared',file)).sort();
 const reportedFiles=Array.isArray(tests.testResults)?tests.testResults.map(result=>result.name).sort():[];
 if(tests.success!==true||tests.numFailedTestSuites!==0||tests.numPendingTestSuites!==0||JSON.stringify(expectedFiles)!==JSON.stringify(reportedFiles)||tests.testResults.some(result=>result.status!=='passed'))throw Error('SAFE_TEST_FILES_INCOMPLETE');
 summary.tests={total:tests.numTotalTests,passed:tests.numPassedTests,failed:tests.numFailedTests,pending:tests.numPendingTests};
 if(!Number.isInteger(summary.tests.total)||summary.tests.total<=0||summary.tests.passed!==summary.tests.total||summary.tests.failed!==0||summary.tests.pending!==0)throw Error('NO_COMPLETE_SAFE_TEST_EVIDENCE');
 summary.ok=true;
}catch(error){summary.error=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'BASELINE_FAILED'}
await save();process.stdout.write(JSON.stringify(summary)+'\n');process.exitCode=summary.ok?0:1;
}
