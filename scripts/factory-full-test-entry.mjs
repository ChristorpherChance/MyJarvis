/** Trusted test collector. Runs only inside the isolated full-test container. */
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,writeFile,open,readdir,mkdir,stat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative,resolve} from 'node:path';
const WORK='/work/source', EVIDENCE='/evidence', PNPM='/corepack-runtime/dist/pnpm.js';
if(process.getuid?.()!==1000||process.cwd()!==WORK||!process.env.JARVIS_FULL_TEST_RUN_ID?.match(/^[0-9a-f]{40}$/))throw Error('FIXED_COLLECTOR_SCOPE_REQUIRED');
const runId=process.env.JARVIS_FULL_TEST_RUN_ID, stages=[], blocks=[], startedAt=new Date().toISOString();
const sha=data=>createHash('sha256').update(data).digest('hex');
const report={formatVersion:1,runId,startedAt,finishedAt:null,collectorCompleted:false,productVerdict:'NO-GO',modelsInvoked:false,productionDatabaseUsed:false,sourceCodeChanged:false,sourceFingerprint:process.env.JARVIS_SOURCE_SHA256,stages,blocks,testManifest:[],testResults:[],browserSuites:[],scope:'available source tests and documented prototype regressions; not final human acceptance'};
await mkdir(EVIDENCE,{recursive:true});
await mkdir('/work/home',{recursive:true});
if(process.env.JARVIS_SANDBOX_FIXTURE_READY!=='1')blocks.push({code:'SANDBOX_PRIVATE_DOCKER_FIXTURE_UNAVAILABLE',scope:'No host daemon socket exposed; fixed-image dependency explicitly unavailable'});
async function save(){report.finishedAt=new Date().toISOString();await writeFile(join(EVIDENCE,'container-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
async function walk(dir){const found=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('SNAPSHOT_SYMLINK_NOT_ALLOWED');if(e.isDirectory()){if(['node_modules','.git','dist','coverage'].includes(e.name))continue;found.push(...await walk(join(dir,e.name)));}else if(e.isFile()&&/\.(test|spec)\.tsx?$/.test(e.name)){const p=join(dir,e.name);found.push({path:relative(WORK,p),sha256:sha(await readFile(p))});}}return found;}
report.testManifest=(await walk(WORK)).sort((a,b)=>a.path.localeCompare(b.path));
function safeError(error){return error?.code&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'PROCESS_START_FAILED';}
async function stage(name,args,timeoutMs=300000,{cwd=WORK,program=process.execPath}={}){
 const started=Date.now(),log=await open(join(EVIDENCE,name+'.log'),'wx',0o600);let result;
 try{result=await new Promise(resolveResult=>{let child;try{child=spawn(program,args,{cwd,env:process.env,stdio:['ignore',log.fd,log.fd],shell:false,detached:true});}catch(e){return resolveResult({exitCode:null,error:safeError(e),timeout:false});}
  let timeout=false;const timer=setTimeout(()=>{timeout=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},timeoutMs);
  child.once('error',e=>{clearTimeout(timer);resolveResult({exitCode:null,error:safeError(e),timeout:false});});child.once('close',(exitCode,signal)=>{clearTimeout(timer);resolveResult({exitCode,signal,timeout});});});
 }finally{await log.close();}
 const bytes=await readFile(join(EVIDENCE,name+'.log'));const row={name,...result,ok:result.exitCode===0&&!result.timeout,durationMs:Date.now()-started,log:{path:name+'.log',sha256:sha(bytes),bytes:bytes.length}};stages.push(row);await save();process.stdout.write(JSON.stringify({phase:name,ok:row.ok,exitCode:row.exitCode,timeout:row.timeout,durationMs:row.durationMs})+'\n');return row;
}
const pnpm=(name,args,timeout)=>stage(name,[PNPM,...args],timeout);
async function parseTests(pkg){const path=join(WORK,pkg,'jarvis-test-report.json');try{const raw=await readFile(path);const j=JSON.parse(raw);const files=(j.testResults??[]).map(r=>({path:relative(WORK,r.name),status:r.status,tests:(r.assertionResults??[]).length,passed:(r.assertionResults??[]).filter(x=>x.status==='passed').length,failed:(r.assertionResults??[]).filter(x=>x.status==='failed').length,skipped:(r.assertionResults??[]).filter(x=>['pending','skipped','todo'].includes(x.status)).length}));const out={package:pkg,total:j.numTotalTests??null,passed:j.numPassedTests??null,failed:j.numFailedTests??null,pending:j.numPendingTests??null,success:j.success===true,files,reportSha256:sha(raw)};report.testResults.push(out);await writeFile(join(EVIDENCE,pkg.replaceAll('/','-')+'-test-report.json'),raw,{mode:0o600});}catch{blocks.push({code:'TEST_REPORT_MISSING_OR_INVALID',package:pkg});}}
async function parseCoverage(pkg){try{const raw=await readFile(join(WORK,pkg,'coverage/coverage-final.json'));const config=await readFile(join(WORK,pkg,'vitest.config.ts'),'utf8');const threshold=config.match(/thresholds\s*:\s*\{\s*lines\s*:\s*(\d+)\s*,\s*branches\s*:\s*(\d+)\s*\}/);if(!threshold)throw Error('CONFIGURED_THRESHOLDS_UNAVAILABLE');const thresholds={lines:Number(threshold[1]),branches:Number(threshold[2])};const require=createRequire(await realpath(join(WORK,pkg,'node_modules/@vitest/coverage-v8/package.json')));const {createCoverageMap}=require('istanbul-lib-coverage');const native=createCoverageMap(JSON.parse(raw)).getCoverageSummary().toJSON();report.coverage??=[];report.coverage.push({package:pkg,reportSha256:sha(raw),metricProvider:'istanbul-lib-coverage',lines:{covered:native.lines.covered,total:native.lines.total,percent:native.lines.pct},branches:{covered:native.branches.covered,total:native.branches.total,percent:native.branches.pct},thresholds,configurationSha256:sha(config),scope:pkg==='apps/server'?'configured evidence/policy/material modules':'configured shared source modules'});}catch{blocks.push({code:'COVERAGE_REPORT_OR_THRESHOLDS_MISSING_OR_INVALID',package:pkg});}}
try{
 const install=await pnpm('offline-install',['install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/pnpm-store'],240000);
 // Each stage is attempted even when earlier assertions, coverage or build fail.
 await pnpm('build',['-r','--no-bail','run','build'],420000);
 await pnpm('typecheck',['-r','--no-bail','run','typecheck'],420000);
 await pnpm('lint',['run','lint'],240000);
 await pnpm('dependency-boundaries',['run','check:deps'],240000);
 await pnpm('document-codes',['run','check:codes'],180000);
 await pnpm('all-package-tests',['-r','--no-bail','--workspace-concurrency=1','run','test','--reporter=json','--outputFile=jarvis-test-report.json','--coverage.reportOnFailure=true','--fileParallelism=false','--maxWorkers=1','--minWorkers=1'],1200000);
 await stage('sandbox-functional-probe',['/tools/factory-sandbox-probe.mjs'],90000);
 try{report.sandboxFunctional=JSON.parse(await readFile(join(EVIDENCE,'sandbox-functional-probe.json'),'utf8'));if(report.sandboxFunctional.probePassed!==true)blocks.push({code:'SUPPLEMENTAL_SANDBOX_FUNCTIONS_UNVERIFIED'});}catch{blocks.push({code:'SUPPLEMENTAL_SANDBOX_PROBE_MISSING_OR_INVALID'});}
 for(const pkg of ['packages/shared','apps/server','apps/web'])await parseTests(pkg);
 if(!report.testManifest.some(t=>t.path.startsWith('apps/web/')))blocks.push({code:'WEB_APPLICATION_TESTS_NOT_CONFIGURED',scope:'legacy prototype regressions do not replace current React application browser acceptance'});
 for(const pkg of ['packages/shared','apps/server'])await parseCoverage(pkg);
 if(report.coverage?.some(c=>c.lines.percent<c.thresholds.lines||c.branches.percent<c.thresholds.branches))blocks.push({code:'COVERAGE_THRESHOLDS_NOT_MET'});
 const expected=report.testManifest.map(x=>x.path).sort(),observed=report.testResults.flatMap(x=>x.files.map(f=>f.path)).sort();
 report.allTestFilesAccountedFor=JSON.stringify(expected)===JSON.stringify(observed);
 if(!report.allTestFilesAccountedFor)blocks.push({code:'TEST_FILE_MANIFEST_INCOMPLETE',missing:expected.filter(p=>!observed.includes(p)),unexpected:observed.filter(p=>!expected.includes(p))});
 if(report.testResults.some(x=>!x.success||x.failed!==0||x.pending!==0||x.files.some(f=>f.skipped>0||f.status!=='passed')))blocks.push({code:'TEST_ASSERTIONS_FAILED_OR_SKIPPED'});
 if(!install.ok)blocks.push({code:'OFFLINE_DEPENDENCIES_FAILED'});
 const documented=join(WORK,'doc/tests/run-all.cjs');
 try{
  const text=await readFile(documented,'utf8'),match=text.match(/const suites=\[([^\]]+)\]/);
  const suites=match?[...match[1].matchAll(/'([a-z][a-z0-9-]+)'/g)].map(m=>m[1]):[];
  if(suites.length!==30||new Set(suites).size!==30)throw Error('DOCUMENTED_BROWSER_MANIFEST_INVALID');
  report.browserSuiteManifest=suites;
  for(const name of suites){const file=join(WORK,'doc/tests',name+'.cjs');let available=false;try{available=(await stat(file)).isFile()}catch{};if(!available){report.browserSuites.push({name,ok:false,attempted:false,reason:'SCRIPT_MISSING'});continue;}
   const s=await stage('prototype-'+name,[file],120000);report.browserSuites.push({name,ok:s.ok,attempted:true,stage:s.name});
  }
 }catch{blocks.push({code:'DOCUMENTED_BROWSER_MANIFEST_MISSING_OR_INVALID'});}
 if(report.browserSuites.length!==30||report.browserSuites.some(s=>!s.ok))blocks.push({code:'PROTOTYPE_BROWSER_REGRESSION_INCOMPLETE_OR_FAILED'});
 await stage('truthfulness-probe',['/tools/factory-risk-probe.mjs'],120000);
 try{report.truthfulnessProbe=JSON.parse(await readFile(join(EVIDENCE,'truthfulness-probe.json'),'utf8'));if(report.truthfulnessProbe.productSafe!==true)blocks.push({code:'TRUTHFULNESS_GATE_UNSAFE_OR_UNVERIFIED'});}catch{blocks.push({code:'TRUTHFULNESS_PROBE_MISSING_OR_INVALID'});}
 await stage('storage-signing-probe',['/tools/factory-storage-probe.mjs'],60000);
 try{report.storageSigning=JSON.parse(await readFile(join(EVIDENCE,'storage-signing-probe.json'),'utf8'));if(report.storageSigning.probePassed!==true)blocks.push({code:'STORAGE_SIGNED_DOWNLOAD_UNVERIFIED'});}catch{blocks.push({code:'STORAGE_SIGNING_PROBE_MISSING_OR_INVALID'});}
 if(stages.some(s=>!s.ok))blocks.push({code:'ONE_OR_MORE_TEST_STAGES_FAILED'});
 report.collectorCompleted=true;
 report.productVerdict=blocks.length===0?'GO-CANDIDATE':'NO-GO';
}catch{report.collectorError='COLLECTOR_FAILED';blocks.push({code:'COLLECTOR_FAILED'});}
await save();
// A truthful NO-GO report is a completed test audit, never a product pass.
process.stdout.write(JSON.stringify({collectorCompleted:report.collectorCompleted,productVerdict:report.productVerdict,stages:stages.length,testFiles:report.testManifest.length,blocks:blocks.map(b=>b.code)})+'\n');
process.exitCode=report.collectorCompleted?0:1;
