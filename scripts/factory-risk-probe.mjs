/** Actual DB counterexamples. Only the dedicated full-test Docker network is allowed. */
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const db=new URL(process.env.MSF_DATABASE_URL??'postgresql://invalid@invalid/invalid');
if(process.cwd()!=='/work/source'||db.hostname!=='postgres'||db.username!=='jarvis_test'||db.pathname!=='/jarvis_test'||!process.env.JARVIS_FULL_TEST_RUN_ID?.match(/^[0-9a-f]{40}$/))throw Error('ISOLATED_RISK_DATABASE_REQUIRED');
const root=process.cwd(),load=path=>import(pathToFileURL(join(root,'apps/server/dist',path)).href);
const report={runId:process.env.JARVIS_FULL_TEST_RUN_ID,at:new Date().toISOString(),scope:'isolated synthetic fixtures executed by actual current services; no production database',modelsInvoked:false,sourceCodeChanged:false,productSafe:null,checks:[],errors:[]};
let pool;
try{
 const [{pool:p,query},{resetCommands},{TstRunsService},{TstReportsService},{PolicyService},{StorageService},{NotificationsService}]=await Promise.all([load('db/pool.js'),load('modules/evidence/command-bus.js'),load('modules/test/runs.service.js'),load('modules/test/reports.service.js'),load('modules/policy/policy.service.js'),load('modules/platform/storage.service.js'),load('modules/platform/notifications.service.js')]);pool=p;
 const storage=new StorageService(),policy=new PolicyService(),notices=new NotificationsService();
 const runs=new TstRunsService(storage),reports=new TstReportsService(policy,storage,notices);resetCommands();notices.onModuleInit();runs.onModuleInit();reports.onModuleInit();
 const pid=randomUUID(),ctx={projectId:pid,actorKind:'human',actorId:'jarvis-isolated-risk-probe'},fingerprint=createHash('sha256').update(pid).digest('hex');
 await query('INSERT INTO projects(id,name,created_by) VALUES($1,$2,$3)',[pid,'Jarvis isolated truthfulness counterexamples',ctx.actorId]);
 async function fixture(n,{simulated=false,caseCount=1,result='pass',mustRun=true,executing=false}={}){
  const code='TB-'+String(n).padStart(3,'0'),fp=createHash('sha256').update(pid+':'+n).digest('hex');
  const batch=(await query(`INSERT INTO tst_batches(project_id,code,handoff_fingerprint,handoff,build_snapshot,dev_report_snapshot,baseline_snapshot,acceptance_terms,environment,environment_fingerprint,received_by,status) VALUES($1,$2,$3,'{}','{}','{}','{}','{}','{}',$4,$5,$6) RETURNING id`,[pid,code,fp,fingerprint,ctx.actorId,executing?'executing':'approved'])).rows[0].id;
  const plan=(await query(`INSERT INTO tst_plans(batch_id,code,version_no,scope,state,created_by) VALUES($1,$2,1,'[]','approved',$3) RETURNING id`,[batch,'TP-'+String(n).padStart(3,'0'),ctx.actorId])).rows[0].id;
  const cases=[];for(let i=0;i<caseCount;i++)cases.push((await query(`INSERT INTO tst_cases(plan_id,code,title,mode,must_run,steps,content_hash,created_by) VALUES($1,$2,'Synthetic fixture, never a real tested feature','auto',$3,'[]',$4,$5) RETURNING id`,[plan,'AT-'+i,mustRun,fp,ctx.actorId])).rows[0].id);
  let run;if(executing){run=(await query(`INSERT INTO tst_runs(project_id,batch_id,plan_id,code,conclusion,is_simulated,environment_fingerprint,started_at,finished_at,created_by) VALUES($1,$2,$3,$4,'pass',$5,$6,now(),now(),$7) RETURNING id`,[pid,batch,plan,'TR-'+String(n).padStart(3,'0'),simulated,fingerprint,ctx.actorId])).rows[0].id;
   for(const c of cases)await query(`INSERT INTO tst_case_runs(run_id,case_id,result,is_simulated,executor_kind,executed_by,note) VALUES($1,$2,$3,$4,'auto',$5,'Synthetic fixture without external execution')`,[run,c,result,simulated,ctx.actorId]);}
  return {code,batch,plan,planCode:'TP-'+String(n).padStart(3,'0'),run};
 }
 async function release(f,label,type='normal'){
  const g=await reports.generate(pid,f.code,ctx);await reports.finalize(pid,g.reportId,true,ctx);
  let allowed=false,errorCode=null;try{await reports.authorize(pid,g.reportId,{type,confirm:true,waivers:[]},ctx);allowed=true;}catch(e){errorCode=typeof e.code==='string'?e.code:'UNCLASSIFIED_SERVICE_ERROR';}
  const summary=(await query('SELECT summary FROM tst_reports WHERE batch_id=$1 AND code=$2',[f.batch,g.reportId])).rows[0].summary;
  // A post-commit notification error must never turn a persisted release into
  // an apparently safe rejection. Verify the durable transaction result.
  const batchStatus=(await query('SELECT status FROM tst_batches WHERE id=$1',[f.batch])).rows[0].status;
  const releaseDecisions=Number((await query("SELECT count(*) n FROM tst_decisions WHERE batch_id=$1 AND decision IN('release','conditional_release')",[f.batch])).rows[0].n);
  const gateRejected=['GATE_BLOCKED','WAIVER_NOT_ALLOWED','ZERO_CASES_FORBIDDEN'].includes(errorCode);
  return {label,expected:'gate rejection with no persisted release',returnedSuccess:allowed,errorCode,gateRejected,batchStatus,releaseDecisions,reportVerdict:g.conclusion,reportedSimulated:summary.simulated,simulatedCaseCount:summary.cases.filter(c=>c.is_simulated).length,cases:summary.cases.length,passed:!allowed&&gateRejected&&releaseDecisions===0&&batchStatus!=='released'};
 }
 const auto=await fixture(1);const result=await runs.execute(pid,auto.code,auto.planCode,ctx);
 const actual=(await query(`SELECT r.conclusion,r.is_simulated,cr.result,cr.is_simulated AS case_simulated,cr.note FROM tst_runs r JOIN tst_case_runs cr ON cr.run_id=r.id WHERE r.batch_id=$1`,[auto.batch])).rows;
 report.checks.push({label:'mock-auto-executor-must-mark-simulation',expected:'simulation must be explicit',observedRows:actual.map(r=>({conclusion:r.conclusion,runSimulated:r.is_simulated,result:r.result,caseSimulated:r.case_simulated,note:r.note})),passed:actual.length>0&&actual.every(r=>r.is_simulated===true&&r.case_simulated===true)});
 report.checks.push(await release(auto,'normal-release-after-mock-auto-pass'));
 report.checks.push(await release(await fixture(2,{simulated:true,executing:true}),'normal-release-explicit-simulation'));
 report.checks.push(await release(await fixture(3,{simulated:true,executing:true}),'conditional-release-explicit-simulation','conditional'));
 report.checks.push(await release(await fixture(4,{caseCount:0,executing:true}),'normal-release-zero-case-run'));
 report.checks.push(await release(await fixture(5,{result:'not-applicable',mustRun:true,executing:true}),'normal-release-required-not-applicable-without-execution'));
 const stale=await fixture(6,{executing:true});const g=await reports.generate(pid,stale.code,ctx);await query(`UPDATE tst_case_runs SET result='fail' WHERE run_id=$1`,[stale.run]);let rejected=false,code=null;
 try{await reports.finalize(pid,g.reportId,true,ctx);}catch(e){rejected=true;code=e.code??'UNCLASSIFIED_SERVICE_ERROR';}
 report.checks.push({label:'changed-case-results-invalidate-draft-report',expected:'REPORT_BASIS_MISMATCH',errorCode:code,passed:rejected&&code==='REPORT_BASIS_MISMATCH'});
 report.productSafe=report.checks.length===7&&report.checks.every(c=>c.passed);
}catch(e){report.errors.push({code:typeof e.code==='string'&&/^[A-Z_0-9]+$/.test(e.code)?e.code:'RISK_PROBE_SETUP_OR_EXECUTION_FAILED'});report.productSafe=null;}
finally{await pool?.end();}
await writeFile('/evidence/truthfulness-probe.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({runId:report.runId,checks:report.checks.length,failed:report.checks.filter(c=>!c.passed).length,productSafe:report.productSafe,errors:report.errors}));
process.exitCode=report.productSafe===true?0:1;
