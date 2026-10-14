/** UID1000 finite environment orchestrator. No Docker, SSH or model API.
 * Real SQL migrations, real Nest HTTP, independent PG probe, four original
 * integration callbacks with their complete beforeAll/afterAll lifecycle.
 */
import {readFile,lstat,open,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {loadIndependentPG} from './factory-independent-pg-cjs-consumer-r29.mjs';
const SOURCE='/work/source',E='/evidence',FP='f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2';
const H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/,R=/^[a-f0-9]{40}$/;
const need=(v,c)=>{if(!v)throw Error(c)},sha=b=>createHash('sha256').update(b).digest('hex');
const FOUR=Object.freeze(['orders a later serialized rerun after an older-BEGIN transaction and rejects the old draft basis','invalidates a finalized report when an older-BEGIN manual revision obtains the batch afterwards','places a manual revision strictly after a future prior timestamp without JavaScript rounding','allows only one real concurrent selftest start and orders it after a future prior selftest']);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function writeAll(f,b){let offset=0;while(offset<b.length){const n=await f.write(b,offset,b.length-offset);need(n.bytesWritten>0&&n.bytesWritten<=b.length-offset,'QA_R32_SHORT_LOG_WRITE');offset+=n.bytesWritten;}}
async function store(name,v){const bytes=JSON.stringify(v)+'\n';need(Buffer.byteLength(bytes)<=4194304,'QA_R32_REPORT_BOUND');const f=await open(E+'/'+name,'wx',0o600);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}}
async function admission(){
 need(process.getuid?.()===1000&&process.getgid?.()===1000&&process.cwd()===SOURCE,'QA_R32_NONROOT_SCOPE_REQUIRED');const e=process.env;need(e.JARVIS_QA_SCOPE==='r32-truth-gate-isolated-v1'&&e.JARVIS_SOURCE_SHA256===FP&&A.test(e.JARVIS_VALIDATION_ATTEMPT??'')&&R.test(e.JARVIS_AUTONOMY_RUN_ID??'')&&H.test(e.JARVIS_EXECUTION_CONTRACT_SHA256??'')&&!e.NODE_OPTIONS&&!e.NODE_PATH&&!e.PG_FORCE_NATIVE,'QA_R32_EXECUTION_SCOPE_REQUIRED');
 const s=await lstat('/tools/execution-contract.json');need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.gid===0&&s.nlink===1&&!(s.mode&0o222)&&s.size<32768,'QA_R32_EXECUTION_CONTRACT_UNTRUSTED');const raw=await readFile('/tools/execution-contract.json');need(sha(raw)===e.JARVIS_EXECUTION_CONTRACT_SHA256,'QA_R32_EXECUTION_CONTRACT_CHANGED');const c=JSON.parse(raw);
 need(c.schemaVersion===1&&c.kind==='r32-truth-gate-nonroot-execution-contract'&&c.attempt===e.JARVIS_VALIDATION_ATTEMPT&&c.runID===e.JARVIS_AUTONOMY_RUN_ID&&c.sourceFingerprint===FP&&H.test(c.buildProofSHA256??'')&&H.test(c.artifactContractSHA256??'')&&c.httpSQLDenominator===34&&c.additionalPGDenominator===4,'QA_R32_EXECUTION_CONTRACT_SCOPE_CHANGED');const es=await lstat(E);need(es.isDirectory()&&!es.isSymbolicLink()&&es.uid===1000&&es.gid===1000&&(es.mode&0o777)===0o700,'QA_R32_EVIDENCE_DIRECTORY_CHANGED');return c;
}
function dedicated(value,name){const u=new URL(value??'');need(u.protocol==='postgres:'&&u.hostname==='postgres'&&u.port==='5432'&&u.username==='jarvis_test'&&u.pathname==='/'+name&&!u.search&&!u.hash,'QA_R32_DATABASE_SCOPE_CHANGED');return u.href}
async function settleBootstrapPools(main,upgrade,release){
 let ended;try{ended=await Promise.allSettled([()=>main?.end(),()=>upgrade?.end()].map(call=>Promise.resolve().then(call)));}finally{release();}
 need(ended.every(x=>x.status==='fulfilled'),'QA_R32_BOOTSTRAP_DATABASE_CLOSE_INCOMPLETE');
}
async function bootstrap(){
 const {Pool,assertCache,release}=await loadIndependentPG();let main,upgrade;
 try{
  main=new Pool({connectionString:dedicated(process.env.MSF_DATABASE_URL,'jarvis_truth_gate_r32'),max:2,connectionTimeoutMillis:10000,statement_timeout:15000});const current=await main.query('SELECT current_database() AS name');need(current.rows[0]?.name==='jarvis_truth_gate_r32','QA_R32_MAIN_DATABASE_CHANGED');const dbs=await main.query("SELECT datname FROM pg_database WHERE datname='jarvis_truth_upgrade_r32'");need(dbs.rows.length===0,'QA_R32_UPGRADE_DATABASE_NOT_FRESH');await main.query('CREATE DATABASE jarvis_truth_upgrade_r32');
  upgrade=new Pool({connectionString:dedicated(process.env.R29_UPGRADE_DATABASE_URL,'jarvis_truth_upgrade_r32'),max:1,connectionTimeoutMillis:10000,statement_timeout:15000});const uc=await upgrade.query('SELECT current_database() AS name');need(uc.rows[0]?.name==='jarvis_truth_upgrade_r32','QA_R32_UPGRADE_DATABASE_CHANGED');for(const p of [main,upgrade]){const empty=await p.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");need(empty.rows[0]?.n===0,'QA_R32_DATABASE_NOT_EMPTY');}
  const dir=SOURCE+'/apps/server/src/db/migrations',files=(await readdir(dir)).filter(x=>/^\d{4}_[a-z0-9_-]+\.sql$/i.test(x)).sort();need(files.length===30&&files[0].startsWith('0001_')&&files.at(-1).startsWith('0030_'),'QA_R32_MIGRATION_SET_CHANGED');for(const f of files){const s=await lstat(dir+'/'+f);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&!(s.mode&0o222),'QA_R32_MIGRATION_SOURCE_UNTRUSTED');await main.query(await readFile(dir+'/'+f,'utf8'));}assertCache();return {actualSQLMigrations:30,main:'jarvis_truth_gate_r32',upgrade:'jarvis_truth_upgrade_r32',upgradeInitialPublicTables:0,supplierModelsInvoked:false};
 }finally{await settleBootstrapPools(main,upgrade,release)}
}
async function child(args,name,{cwd=SOURCE,env=process.env,timeout=600000}={}){
 const f=await open(E+'/'+name+'.private.log','wx',0o600);let count=0,err,writes=Promise.resolve();const p=spawn('/usr/local/bin/node',args,{cwd,env,stdio:['ignore','pipe','pipe']});const ondata=b=>{count+=b.length;if(count>4194304){err='QA_R32_CHILD_LOG_BOUND';p.kill('SIGTERM');return;}writes=writes.then(()=>writeAll(f,b)).catch(()=>{err='QA_R32_CHILD_LOG_WRITE_FAILED';p.kill('SIGTERM')})};p.stdout.on('data',ondata);p.stderr.on('data',ondata);let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;p.kill('SIGTERM')},timeout);timer.unref();const killTimer=setTimeout(()=>{if(timedOut)p.kill('SIGKILL')},timeout+5000);killTimer.unref();try{const outcome=await new Promise((r,j)=>{p.once('error',j);p.once('close',(code,signal)=>r({code,signal}))});return {...outcome,logBytes:count,timedOut,errorCode:err??null};}finally{clearTimeout(timer);clearTimeout(killTimer);await writes;await f.sync();await f.close()}
}
async function apiStart(){const f=await open(E+'/api.private.log','wx',0o600);let size=0,writeFailure=false,writes=Promise.resolve();const api=spawn('/usr/local/bin/node',[SOURCE+'/apps/server/dist/main.js'],{cwd:SOURCE,env:process.env,stdio:['ignore','pipe','pipe']});for(const stream of [api.stdout,api.stderr])stream.on('data',b=>{size+=b.length;if(size>4194304){writeFailure=true;api.kill('SIGTERM');return}writes=writes.then(()=>writeAll(f,b)).catch(()=>{writeFailure=true;api.kill('SIGTERM')})});api.once('error',()=>{writeFailure=true});let closed=false;api.once('close',()=>{closed=true});
 const stop=async()=>{if(!closed){api.kill('SIGTERM');for(let n=0;n<50&&!closed;n++)await pause(100);if(!closed){api.kill('SIGKILL');for(let n=0;n<50&&!closed;n++)await pause(100)}}await writes;await f.sync();await f.close();return closed};
 try{for(let n=0;n<100;n++){need(!writeFailure&&!closed,'QA_R32_API_PROCESS_EXITED');try{const r=await fetch('http://127.0.0.1:18932/health',{signal:AbortSignal.timeout(1500)}),v=await r.json();if(r.status===200&&v.ok===true&&v.db===true&&v.redis===true&&v.minio===true)return {api,stop,health:{db:true,redis:true,minio:true}}}catch{}await pause(300)}throw Error('QA_R32_API_HEALTH_TIMEOUT')}catch(e){await stop();throw e}
}
export async function runMatrixSupervisor(){
 const c=await admission();for(const path of ['/tmp/r32-qa','/tmp/r32-qa/home','/tmp/r32-qa/tmp','/tmp/r32-qa/cache','/tmp/r32-qa/config']){await mkdir(path,{mode:0o700});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===1000&&s.gid===1000&&(s.mode&0o777)===0o700,'QA_R32_WRITABLE_DIRECTORY_CHANGED');}const report={schemaVersion:1,kind:'r32-truth-gate-supervisor-report',attempt:c.attempt,runID:c.runID,sourceFingerprint:FP,sourceUID:1000,status:'incomplete',stages:[],httpSQLDenominator:34,additionalPGDenominator:4,productAccepted:false,customerDelivery:false,modelsInvoked:false};let server;
 try{
  report.stages.push({id:'fresh-databases-and-migrations',status:'pass',...await bootstrap()});server=await apiStart();report.stages.push({id:'api-health',status:'pass',...server.health});
  const http=await child(['/tools/probe.mjs','--execute'],'http-sql');report.stages.push({id:'http-sql34',...http});
  // This config changes no callback, hook, test timeout or assertion. The original
  // coverage-only config has no coverage mode here; a /tmp config keeps Vite's
  // config-bundle temporary file off the immutable product/tool directories.
  const cfg='/tmp/r32-four-vitest.config.mjs',fd=await open(cfg,'wx',0o600);try{await fd.writeFile("export default {cacheDir:'/tmp/r32-qa/cache/vite',test:{}};\n");await fd.sync()}finally{await fd.close()}
  const escaped=FOUR.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const four=await child([SOURCE+'/apps/server/node_modules/vitest/vitest.mjs','run','src/modules/test/truth-gate.integration.test.ts','--config',cfg,'--reporter=json','--outputFile='+E+'/pg-four-result.json','-t','(?:'+escaped.join('|')+')$'],'pg-four',{cwd:SOURCE+'/apps/server',env:{...process.env,R29_TEST_DATABASE_URL:process.env.MSF_DATABASE_URL},timeout:600000});report.stages.push({id:'original-handler-pg4',...four});
  let selected=[];try{const js=await lstat(E+'/pg-four-result.json');need(js.isFile()&&!js.isSymbolicLink()&&js.uid===1000&&js.nlink===1&&js.size<=4194304,'QA_R32_FOUR_REPORT_UNTRUSTED');const jr=JSON.parse(await readFile(E+'/pg-four-result.json','utf8')),all=jr.testResults.flatMap(r=>r.assertionResults??[]);selected=all.filter(x=>FOUR.includes(x.title));need(selected.length===4&&new Set(selected.map(x=>x.title)).size===4&&!all.some(x=>!FOUR.includes(x.title)&&x.status==='passed')&&jr.success===true&&jr.numFailedTestSuites===0&&(jr.numRuntimeErrorTestSuites===undefined||jr.numRuntimeErrorTestSuites===0),'QA_R32_FOUR_SELECTION_OR_HOOK_INCOMPLETE');report.fourOriginalCases=selected.map(x=>({title:x.title,status:x.status}));}catch(e){report.fourReportErrorCode=/^QA_R32_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_R32_FOUR_REPORT_INCOMPLETE';}
  report.status=selected.length===4&&selected.every(x=>x.status==='passed')&&!report.fourReportErrorCode&&http.code===0&&!http.timedOut&&!http.errorCode&&four.code===0&&!four.timedOut&&!four.errorCode?'execution-complete':'failed';
 }catch(e){report.errorCode=/^QA_R32_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_R32_SUPERVISOR_INCOMPLETE';report.status='incomplete'}
 finally{if(server){const stopped=await server.stop();report.apiChildStopped=stopped;if(!stopped)report.status='incomplete'}await store('supervisor-result.json',report)}
 // Independent tools, not this exit status, qualify result sources and all38
 // real-case outcomes. Both denominators are retained even on expected failure.
 return report;
}
if(process.argv[1]==='/tools/supervisor.mjs'){try{const v=await runMatrixSupervisor();console.log(JSON.stringify({kind:v.kind,status:v.status,attempt:v.attempt,httpSQLDenominator:34,additionalPGDenominator:4,productAccepted:false}));process.exitCode=v.status==='execution-complete'?0:1}catch(e){console.error(JSON.stringify({status:'incomplete',errorCode:/^QA_R32_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_R32_SUPERVISOR_INCOMPLETE',productAccepted:false}));process.exitCode=1}}
