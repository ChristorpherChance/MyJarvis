/** Independent finite R29 HTTP + committed PostgreSQL probe.
 * Default CLI only describes requirements. --execute requires the exact isolated
 * container scope and immutable public source manifest. No Docker/model/SSH API.
 */
import {readFile,lstat,open,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectIndependentPGRuntime,loadIndependentPG,verifyIndependentPGRuntime} from './factory-independent-pg-cjs-consumer-r29.mjs';

const SOURCE='/work/source',EVIDENCE='/evidence',BASE='http://127.0.0.1:18931';
const FP='7814f74e1e7c62b1aeb862a6617970551a00493ba2884bf65595cfe65ef2a981';
const MANIFEST='/tools/r31-source-actual-index.json',MANIFEST_SHA=null; // New Linux copy receipt not yet frozen; hard refuse before I/O.
const H=/^[a-f0-9]{64}$/,R=/^[a-f0-9]{40}$/,A=/^[a-f0-9]{32}$/,U=/^[a-f0-9-]{36}$/;
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const need=(v,c)=>{if(!v){const e=Error(c);e.code=c;throw e;}};
const safeCode=v=>/^[A-Z][A-Z0-9_]{0,100}$/.test(v??'')?v:'QA_UNCLASSIFIED_ERROR';
const json=v=>JSON.stringify(v),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const FINALIZE_TRUTH=Object.freeze([{stage:'finalize',status:423,errorCode:'GATE_BLOCKED'}]);
const RELEASE_TRUTH=Object.freeze([{stage:'release',status:423,errorCode:'GATE_BLOCKED'}]);
const RELEASE_BASIS=Object.freeze([{stage:'release',status:409,errorCode:'REPORT_BASIS_MISMATCH'}]);
const matches=(outcomes,expected)=>outcomes.some(x=>x.transactionUnchanged===true&&expected.some(e=>x.stage===e.stage&&x.status===e.status&&x.errorCode===e.errorCode));
const CHECK_IDS=Object.freeze(['N01-mock-normal','N01-mock-conditional','N02-unknown-source','N02-unknown-run-source','N03-zero-case-run','N04-required-result-missing','N04-required-not-run','N05-fail','N05-blocked','N05-blocked-batch','N05-unwaivable-P0','N05-unwaivable-P1','N06-missing-evidence','N06-evidence-hash-tampered','N07-environment-mismatch','N07-new-current-build','N08-result-change','N08-source-change','N09-required-flag-change','N09-content-change','N09-required-case-added','N10-current-baseline-invalid','N10-new-same-build-failed-report','N10-new-postfinal-blocking-defect','N11-mandatory-na-without-applicability','N12-route-body-project-report-override','N12-manual-stale-after-batch-lock','N12-attachment-stale-after-batch-lock','N12-idempotency-same-key-other-body','P01-real-manual-http-and-byte-evidence','P02-lawful-optional-na','P03-legacy-unknown-preserved-new-real-run','P03-real-legacy-migration','P04-lawful-P2-conditional']);
export const executionRequirements=Object.freeze({schemaVersion:1,kind:'r31-finite-truth-gate-probe-preparation',
 source:SOURCE,fingerprint:FP,sourceFiles:625,sourceBytes:18413026,manifest:MANIFEST,manifestSHA256:MANIFEST_SHA,
 environment:{JARVIS_QA_SCOPE:'r31-truth-gate-isolated-v1',JARVIS_SOURCE_SHA256:FP,JARVIS_AUTONOMY_RUN_ID:'new40hex',JARVIS_VALIDATION_ATTEMPT:'new32hex',
 MSF_DATABASE_URL:'private postgres://jarvis_test@postgres:5432/jarvis_truth_gate_r31',R29_UPGRADE_DATABASE_URL:'private postgres://jarvis_test@postgres:5432/jarvis_truth_upgrade_r31',
 MSF_MINIO_BUCKET:'jarvis-truth-r31-<run16>-<attempt8>',JARVIS_VALIDATION_USER:'private generated',JARVIS_VALIDATION_PASSWORD:'private generated'},
 topology:'new isolated internal network; no host ports; no host Docker socket; same container loopback API and read-only /tools; API and probe UID1000:GID1000; dedicated evidence UID1000 mode700 protected by root-only host parent, root collector seals after exit',
 upgrades:'empty dedicated upgrade DB; actual frozen SQL0001..0029, historical unknown/mock rows, then actual0030; no drop/truncate',
 positiveScope:'real HTTP observation + actual manualRecord/attachment bytes + committed release; synthetic upstream QA context, not customer software delivery',
 plannedChecks:CHECK_IDS.length,plannedCheckIds:CHECK_IDS,negativeGroups:12,positiveGroups:4,priorMatrixChecks:34,priorMatrixExecuted:false,independentPGRuntime:inspectIndependentPGRuntime,
 defaultAction:'inspect',installed:false,ready:false,productAccepted:false});

async function readPinnedManifest(){
 need(H.test(MANIFEST_SHA??''),'QA_R31_SOURCE_NOT_FROZEN');
 const s=await lstat(MANIFEST);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&!(s.mode&0o022)&&s.nlink===1,'QA_SOURCE_MANIFEST_UNTRUSTED');
 const b=await readFile(MANIFEST);need(sha(b)===MANIFEST_SHA,'QA_SOURCE_MANIFEST_CHANGED');const v=JSON.parse(b);
 need(v.candidate?.sha256===FP&&v.candidate.files===625&&v.manifest?.length===625&&v.localMirrorByteVerification===true,'QA_SOURCE_MANIFEST_SCOPE_CHANGED');
 let bytes=0;for(const x of v.manifest){need(typeof x.path==='string'&&!x.path.startsWith('/')&&!x.path.split('/').includes('..')&&H.test(x.sha256),'QA_SOURCE_PATH_INVALID');const p=join(SOURCE,x.path),s=await lstat(p);need(s.isFile()&&!s.isSymbolicLink(),'QA_SOURCE_FILE_NOT_REGULAR');const b=await readFile(p);need(b.length===x.bytes&&sha(b)===x.sha256,'QA_SOURCE_FILE_CHANGED');bytes+=b.length;}
 need(bytes===18413026,'QA_SOURCE_BYTES_CHANGED');return v;
}
function databaseURL(value,name){let u;try{u=new URL(value??'');}catch{need(false,'QA_EXPLICIT_DATABASE_REQUIRED');}
 need(['postgres:','postgresql:'].includes(u.protocol)&&u.hostname==='postgres'&&u.port==='5432'&&u.username==='jarvis_test'&&u.pathname==='/'+name&&!u.search&&!u.hash,'QA_DATABASE_SCOPE_INVALID');return u.href;
}
async function outputReport(report){
 const s=await lstat(EVIDENCE);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===1000&&s.gid===1000&&(s.mode&0o777)===0o700,'QA_EVIDENCE_ROOT_UNTRUSTED');
 const raw=json(report)+'\n';need(Buffer.byteLength(raw)<=4*1024*1024,'QA_REPORT_TOO_LARGE');const f=await open(join(EVIDENCE,'truth-gate-result.json'),'wx',0o600);try{await f.writeFile(raw);await f.sync();}finally{await f.close();}return {sha256:sha(raw),bytes:Buffer.byteLength(raw)};
}
export async function executeTruthGateProbe(){
 const env=process.env,runId=env.JARVIS_AUTONOMY_RUN_ID,attempt=env.JARVIS_VALIDATION_ATTEMPT;
 need(process.getuid?.()===1000&&process.getgid?.()===1000&&process.cwd()===SOURCE&&env.JARVIS_QA_SCOPE==='r31-truth-gate-isolated-v1'&&env.JARVIS_SOURCE_SHA256===FP&&R.test(runId??'')&&A.test(attempt??''),'QA_ISOLATED_SCOPE_REQUIRED');
 need(env.MSF_MINIO_ENDPOINT==='minio'&&env.MSF_MINIO_PORT==='9000'&&env.MSF_MINIO_BUCKET==='jarvis-truth-r31-'+runId.slice(0,16)+'-'+attempt.slice(0,8),'QA_STORAGE_SCOPE_INVALID');
 const mainURL=databaseURL(env.MSF_DATABASE_URL,'jarvis_truth_gate_r31'),upgradeURL=databaseURL(env.R29_UPGRADE_DATABASE_URL,'jarvis_truth_upgrade_r31');
 await readPinnedManifest();const {Pool,runtime:independentPGRuntime,assertCache,release}=await loadIndependentPG();
 let pool,upgrade;try{pool=new Pool({connectionString:mainURL,max:12,statement_timeout:15000,application_name:'jarvis-r31-independent-qa'});upgrade=new Pool({connectionString:upgradeURL,max:2,statement_timeout:15000,application_name:'jarvis-r31-upgrade-qa'});}catch(error){await Promise.allSettled([pool?.end(),upgrade?.end()].filter(Boolean));release();throw error;}
 const report={schemaVersion:1,kind:'software-factory-r31-independent-truth-gate-probe',runId,attempt,sourceFingerprint:FP,
 startedAt:new Date().toISOString(),finishedAt:null,status:'fail',checks:[],problems:[],httpObservations:[],
 syntheticUpstreamContext:true,serviceReturnValuesMocked:false,actualHTTP:true,actualPostgreSQL:true,modelsInvoked:false,
 productionDatabaseUsed:false,sourceCodeChanged:false,productAccepted:false,full74ObjectivesAccepted:false,rawCredentialsExported:false,rawPrivateResponsesExported:false,sourceManifestSHA256:MANIFEST_SHA,plannedCheckIds:CHECK_IDS,independentPGRuntime};
 let cookie,sealedOutput;const q=(s,p=[])=>pool.query(s,p);
 async function request(path,{method='GET',body,key=randomUUID(),raw=false}={}){
  need(path==='/health'||path==='/api/auth/whoami'||path==='/api/auth/login'||path==='/api/projects'||/^\/api\/projects\/[a-f0-9-]{36}$/.test(path)||/^\/api\/v1\/projects\/[a-f0-9-]{36}\/acceptance\/[A-Za-z0-9_:/?=.%&-]+$/.test(path),'QA_HTTP_PATH_OUTSIDE_SCOPE');
  need(['GET','POST','PUT'].includes(method),'QA_HTTP_METHOD_OUTSIDE_SCOPE');const headers={};if(cookie)headers.cookie=cookie;if(method!=='GET'){headers['Idempotency-Key']=key;headers['content-type']=raw?'application/octet-stream':'application/json';}
  try{const r=await fetch(BASE+path,{method,headers,body:method==='GET'?undefined:raw?body:json(body??{}),redirect:'error',signal:AbortSignal.timeout(20000)}),b=Buffer.from(await r.arrayBuffer());let value;try{value=JSON.parse(b);}catch{value=null;}
   const errorCode=safeCode(value?.error?.code);report.httpObservations.push({method,route:path.replace(/[a-f0-9-]{36}/g,':project'),status:r.status,responseSHA256:sha(b),errorCode:value?.error?errorCode:null});
   return {status:r.status,value,errorCode:value?.error?errorCode:null,response:r};
  }catch{report.httpObservations.push({method,route:path.replace(/[a-f0-9-]{36}/g,':project'),status:0,errorCode:'QA_HTTP_TRANSPORT_FAILED'});return {status:0,value:null,errorCode:'QA_HTTP_TRANSPORT_FAILED',response:null};}
 }
 async function ok(path,options){const r=await request(path,options);need(r.status>=200&&r.status<300,'QA_SETUP_REQUEST_FAILED');return r.value;}
 const prefix=f=>'/api/v1/projects/'+f.pid+'/acceptance';
 async function schemaCheck(){
  const id=(await q('SELECT current_database(),current_user')).rows[0];need(id.current_database==='jarvis_truth_gate_r31'&&id.current_user==='jarvis_test','QA_DATABASE_IDENTITY_CHANGED');
  const cols=await q("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('tst_runs','tst_case_runs') AND column_name='execution_source'");need(cols.rows.length===2,'QA_TRUTH_SCHEMA_MISSING');
  need(Number((await q('SELECT count(*) n FROM projects')).rows[0].n)===0,'QA_NEW_EMPTY_DATABASE_REQUIRED');
 }
 async function seedBasis(db,pid,label){
  const token=randomUUID(),baselineFp=sha(pid+'baseline'),buildFp=sha(pid+'build'),reportFp=sha(pid+'report'),self=randomUUID();
  const bl=(await db.query("INSERT INTO dsg_baselines(project_id,code,finalization_id,items,baseline_fingerprint,confirmed_by) VALUES($1,$2,$3,'[]',$4,'local') RETURNING id",[pid,'BL-'+label,'fin-'+token,baselineFp])).rows[0];
  const build=(await db.query("INSERT INTO dev_builds(project_id,code,plan_revision,commit_refs,artifact_object_key,ui_artifact_object_key,build_fingerprint,ui_artifact_fingerprint,source_manifest,status,created_by) VALUES($1,$2,1,'[]',$3,$4,$5,$6,'{}','pass','local') RETURNING id",[pid,'B-'+label,'qa-only/'+token+'/build','qa-only/'+token+'/ui',buildFp,sha(pid+'ui')])).rows[0];
  await db.query("INSERT INTO dev_selftests(id,project_id,build_id,build_fingerprint,gate_function,gate_smoke,gate_ui,gate_review,status,basis_fingerprint,started_by,finished_at) VALUES($1,$2,$3,$4,'{}','{}','{}','{}','pass',$5,'local',now())",[self,pid,build.id,buildFp,sha(pid+'selftest')]);
  const sr=(await db.query("INSERT INTO dev_reports(project_id,code,selftest_id,based_on,summary,status,report_fingerprint,created_by) VALUES($1,$2,$3,$4,'{}','pass',$5,'local') RETURNING id",[pid,'SR-'+label,self,json({build_fingerprint:buildFp,baseline_fingerprint:baselineFp}),reportFp])).rows[0];
  return {bl,build,sr,baselineFp,buildFp,reportFp};
 }
 async function fixture({automatic=false,optional=false}={}){
  const project=await ok('/api/projects',{method:'POST',body:{name:'Jarvis R31 isolated QA '+randomUUID(),description:'Synthetic upstream context; independent real test-gate HTTP/SQL, never customer delivery'}});need(U.test(project.id??''),'QA_PROJECT_ID_MISSING');
  const f={pid:project.id,batchCode:'TB-001',observation:[]};Object.assign(f,await seedBasis(pool,f.pid,'QA'));
  f.batch=(await q("INSERT INTO tst_batches(project_id,code,handoff_fingerprint,handoff,build_snapshot,dev_report_snapshot,baseline_snapshot,acceptance_terms,environment,environment_fingerprint,received_by,status) VALUES($1,$2,$3,'{}',$4,$5,$6,$7,'{}',$8,'local','received') RETURNING id",[f.pid,f.batchCode,sha(f.pid+'handoff'),json({build_id:f.build.id,build_fingerprint:f.buildFp}),json({report_id:f.sr.id,report_fingerprint:f.reportFp,status:'pass'}),json({baseline_id:f.bl.id,baseline_fingerprint:f.baselineFp}),json({flows:automatic?[{code:'FLOW-QA',payload:{title:'QA automatic simulated control',steps:['explicit mock control']}}]:[]}),sha(f.pid+'environment')])).rows[0].id;
  const d=await ok(prefix(f)+'/batches/'+f.batchCode+'/plans:draft',{method:'POST'});const draft=(await q('SELECT id FROM tst_plans WHERE batch_id=$1 AND code=$2',[f.batch,d.planId])).rows[0];need(draft,'QA_DRAFT_PLAN_MISSING');
  let optionalBefore;if(optional){const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("INSERT INTO tst_cases(plan_id,code,title,mode,must_run,steps,content_hash,created_by) VALUES($1,'AT-OPTIONAL','Optional QA applicability','manual',false,'[]',$2,'local')",[draft.id,sha(f.pid+'optional')]);await tx.query("UPDATE tst_plans SET scope=scope || '[{\"code\":\"AT-OPTIONAL\",\"mode\":\"manual\",\"required\":false}]'::jsonb WHERE id=$1 AND state='draft'",[draft.id]);optionalBefore=(await tx.query("SELECT code,title,mode,must_run,steps,content_hash,flow_id,req_codes,priority FROM tst_cases WHERE plan_id=$1 AND code='AT-OPTIONAL'",[draft.id])).rows[0];await tx.query('COMMIT');}catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}}
  const a=await ok(prefix(f)+'/batches/'+f.batchCode+'/plans/'+d.planId+':approve',{method:'POST',body:{confirm:true}});f.planCode=a.planId;
  f.plan=(await q('SELECT id FROM tst_plans WHERE batch_id=$1 AND code=$2',[f.batch,f.planCode])).rows[0].id;
  if(optional){const plan=(await q('SELECT state,previous_id,scope FROM tst_plans WHERE id=$1',[f.plan])).rows[0],copied=(await q("SELECT code,title,mode,must_run,steps,content_hash,flow_id,req_codes,priority FROM tst_cases WHERE plan_id=$1 AND code='AT-OPTIONAL'",[f.plan])).rows[0];need(plan.state==='approved'&&plan.previous_id===draft.id&&json(copied)===json(optionalBefore)&&plan.scope.some(x=>x.code==='AT-OPTIONAL'&&x.mode==='manual'&&x.required===false),'QA_OPTIONAL_APPROVAL_LINEAGE_MISMATCH');f.optionalApprovalVerified=true;}
  f.manual=(await q("SELECT id FROM tst_cases WHERE plan_id=$1 AND code='AT-MANUAL'",[f.plan])).rows[0].id;
  const r=await ok(prefix(f)+'/batches/'+f.batchCode+'/runs:execute',{method:'POST',body:{planId:f.planCode}});f.runCode=r.runId;f.run=(await q('SELECT id FROM tst_runs WHERE project_id=$1 AND code=$2',[f.pid,f.runCode])).rows[0].id;return f;
 }
 async function actualObservation(f){
  const h=await request('/health'),p=await request('/api/projects/'+f.pid);need(h.status===200&&h.value?.ok&&h.value.db&&h.value.redis&&h.value.minio&&p.status===200&&p.value?.id===f.pid,'QA_REAL_MANUAL_OBSERVATION_FAILED');
  return {schemaVersion:1,sourceFingerprint:FP,runId,attempt,fixtureProject:f.pid,observedAt:new Date().toISOString(),scope:'actual health and scoped project readback in real isolated API',healthStatus:h.status,projectStatus:p.status,projectIdObserved:p.value.id,observationSHA256:sha([h.value,p.value])};
 }
 async function manual(f,{status='pass',simulation=false,caseCode='AT-MANUAL'}={}){
  const evidence=await actualObservation(f),r=await ok(prefix(f)+'/runs/'+f.runCode+'/results/'+caseCode,{method:'PUT',body:{status,simulation,evidence:json(evidence)}});f.runCode=r.runId;f.run=(await q('SELECT id FROM tst_runs WHERE project_id=$1 AND code=$2',[f.pid,f.runCode])).rows[0].id;return evidence;
 }
 async function committed(f){
  const b=(await q('SELECT status FROM tst_batches WHERE id=$1 AND project_id=$2',[f.batch,f.pid])).rows[0];need(b,'QA_BATCH_READBACK_MISSING');
  const d=await q("SELECT decision FROM tst_decisions WHERE batch_id=$1 AND decision IN('release','conditional_release')",[f.batch]);
  const r=await q("SELECT id FROM tst_reports WHERE batch_id=$1 AND status='finalized' AND verdict='pass'",[f.batch]);
  return {batchStatus:b.status,releaseDecisions:d.rows.length,formalPassReports:r.rows.length};
 }
 // Business/audit state only. The normal idempotency response-cache is not a
 // product transaction and is intentionally outside this rollback witness.
 async function stateWitness(projectIds){
  const row=(await q(`SELECT jsonb_build_object(
   'projects',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM projects x WHERE x.id=ANY($1::uuid[])),'[]'::jsonb),
   'batches',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_batches x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'plans',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_plans x JOIN tst_batches b ON b.id=x.batch_id WHERE b.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'cases',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_cases x JOIN tst_plans p ON p.id=x.plan_id JOIN tst_batches b ON b.id=p.batch_id WHERE b.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'runs',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_runs x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'caseRuns',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_case_runs x JOIN tst_runs r ON r.id=x.run_id WHERE r.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'reports',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_reports x JOIN tst_batches b ON b.id=x.batch_id WHERE b.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'defects',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_defects x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'decisions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM tst_decisions x JOIN tst_batches b ON b.id=x.batch_id WHERE b.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'evidence',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.seq) FROM evd_records x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'audit',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.seq) FROM audit_log x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'events',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM evd_events x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb),
   'notifications',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM sys_notifications x WHERE x.project_id=ANY($1::uuid[])),'[]'::jsonb)
  ) witness`,[projectIds])).rows[0];need(row?.witness,'QA_TRANSACTION_READBACK_MISSING');return sha(row.witness);
 }
 async function observedRequest(f,stage,path,options,also=[]){const ids=[...new Set([f.pid,...also])],before=await stateWitness(ids),r=await request(path,options),after=await stateWitness(ids),allowed=['SEVERITY_NOT_WAIVABLE','WAIVER_INCOMPLETE','WAIVER_INVALID','WAIVER_UNKNOWN','SIMULATION_DISTORTION','MUST_RUN_NOT_EXECUTED','UNWAIVED_CASE_RESULT','ZERO_PASS','TRUTH_GATE','VERDICT_NOT_PASS'],detailCodes=Array.isArray(r.value?.error?.details?.issues)?[...new Set(r.value.error.details.issues.map(x=>x?.code).filter(x=>allowed.includes(x)))].slice(0,20):[];return {r,outcome:{stage,status:r.status,errorCode:r.errorCode,detailCodes,transactionBeforeSHA256:before,transactionAfterSHA256:after,transactionUnchanged:r.status>=400&&r.status<500?before===after:null}};}
 async function workflow(f,{finalized=false,type='normal',waivers=[]}={}){
  const out=[];if(!finalized){const {r:g,outcome}=await observedRequest(f,'generate',prefix(f)+'/batches/'+f.batchCode+'/report:generate',{method:'POST'});out.push(outcome);if(g.status<200||g.status>=300)return out;f.reportCode=g.value?.reportId;need(f.reportCode,'QA_REPORT_ID_MISSING');
   const {r:z,outcome:zout}=await observedRequest(f,'finalize',prefix(f)+'/reports/'+f.reportCode+':finalize',{method:'POST',body:{confirm:true}});out.push(zout);if(z.status<200||z.status>=300)return out;}
  const {outcome}=await observedRequest(f,'release',prefix(f)+'/reports/'+f.reportCode+':release',{method:'POST',body:{type,confirm:true,waivers}});out.push(outcome);return out;
 }
 async function finalizeOnly(f){const g=await ok(prefix(f)+'/batches/'+f.batchCode+'/report:generate',{method:'POST'});f.reportCode=g.reportId;await ok(prefix(f)+'/reports/'+f.reportCode+':finalize',{method:'POST',body:{confirm:true}});}
 async function check(id,kind,fn){const row={id,kind,status:'incomplete',startedAt:new Date().toISOString(),actualHTTP:true,actualPostgreSQL:true};let f;
  try{const result=await fn(x=>{f=x;});Object.assign(row,result);row.status=result.outcomes?.some(x=>x.status===0||x.status>=500)?'incomplete':result.passed?'pass':'fail';}
  catch(e){row.errorCode=safeCode(e.code??e.message);row.status='incomplete';}
  finally{if(f)try{row.committedState=await committed(f);}catch(e){row.readbackErrorCode=safeCode(e.code??e.message);row.status='incomplete';}row.finishedAt=new Date().toISOString();report.checks.push(row);}
 }
 async function negative(id,{setup=async()=>{},automatic=false,finalized=false,type='normal',waivers=[],expected=finalized?RELEASE_BASIS:FINALIZE_TRUTH,expectedDetail=null}={}){await check(id,'negative',async set=>{const f=await fixture({automatic});set(f);await manual(f);if(finalized)await finalizeOnly(f);await setup(f);const outcomes=await workflow(f,{finalized,type,waivers}),state=await committed(f);return {outcomes,expectedRejection:expected,expectedDetail,passed:matches(outcomes,expected)&&(!expectedDetail||outcomes.some(x=>x.detailCodes?.includes(expectedDetail)))&&state.releaseDecisions===0&&state.batchStatus!=='released'&&(!finalized?state.formalPassReports===0:true)};});}
 async function attachment(f,evidence){const b=Buffer.from(json(evidence)),name='independent-observation.json';await ok(prefix(f)+'/runs/'+f.runCode+'/results/AT-MANUAL/evidence?name='+name,{method:'PUT',raw:true,body:b});
  const ids=(await q('SELECT evidence_ids FROM tst_case_runs WHERE run_id=$1 AND case_id=$2',[f.run,f.manual])).rows[0].evidence_ids,index=ids.findIndex(x=>x?.kind==='attachment'&&x.name===name);need(index>=0,'QA_ATTACHMENT_NOT_PERSISTED');
  const d=await ok(prefix(f)+'/runs/'+f.runCode+'/results/AT-MANUAL/evidence/'+index+'/download');const u=new URL(d.url);need(u.hostname==='minio'&&u.port==='9000'&&u.protocol==='http:'&&!u.username&&!u.password&&u.pathname.startsWith('/'+env.MSF_MINIO_BUCKET+'/'),'QA_SIGNED_URL_OUTSIDE_ISOLATION');
  const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(10000)}),raw=Buffer.from(await r.arrayBuffer());need(r.status===200&&sha(raw)===sha(b),'QA_ATTACHMENT_BYTES_MISMATCH');return {sha256:sha(raw),bytes:raw.length,downloaded:true};
 }
 async function positive(id,opts={}){await check(id,'positive',async set=>{const f=await fixture({optional:opts.optional});set(f);if(opts.legacy){await q('UPDATE tst_runs SET execution_source=NULL WHERE id=$1',[f.run]);await q('UPDATE tst_case_runs SET execution_source=NULL WHERE run_id=$1',[f.run]);f.oldRun=f.run;}
   const ev=await manual(f);if(opts.optional)await manual(f,{caseCode:'AT-OPTIONAL',status:'not-applicable'});const bytes=await attachment(f,ev),outcomes=await workflow(f),state=await committed(f);
   let legacyPreserved=true;if(opts.legacy){const old=(await q('SELECT execution_source FROM tst_runs WHERE id=$1',[f.oldRun])).rows[0];legacyPreserved=old.execution_source===null;}
   return {outcomes,byteEvidence:bytes,legacyPreserved,optionalApprovalVerified:opts.optional?f.optionalApprovalVerified:null,passed:outcomes.every(x=>x.status>=200&&x.status<300)&&state.batchStatus==='released'&&state.releaseDecisions===1&&state.formalPassReports===1&&legacyPreserved&&(!opts.optional||f.optionalApprovalVerified===true)};});}
 async function concurrentStale(id,attach){await check(id,'negative',async set=>{const f=await fixture();set(f);const initialRun=f.run,initialCode=f.runCode;
  const baseline=(await q('SELECT * FROM tst_case_runs WHERE run_id=$1 AND case_id=$2',[initialRun,f.manual])).rows[0],command=attach?'tst.evidence.attach':'tst.run.manual.record';
  const auditBefore=(await q('SELECT * FROM audit_log WHERE project_id=$1 AND command=$2 ORDER BY seq',[f.pid,command])).rows,evidenceBefore=(await q('SELECT * FROM evd_records WHERE project_id=$1 ORDER BY seq',[f.pid])).rows;
  const holder=await pool.connect();let execution,pending,unlocked=false;
  try{await holder.query('BEGIN');const hp=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))',['msf:code:tst:tst_runs:TR:'+f.pid]);
   execution=request(prefix(f)+'/batches/'+f.batchCode+'/runs:execute',{method:'POST',body:{planId:f.planCode}});
   async function blockedBy(pid,pattern){for(let i=0;i<100;i++){const x=await q("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE $1 AND $2=ANY(pg_blocking_pids(pid))",[pattern,pid]);if(x.rows.length===1)return x.rows[0].pid;await sleep(30);}need(false,'QA_CONCURRENCY_BARRIER_NOT_OBSERVED');}
   const executionPID=await blockedBy(hp,'%pg_advisory_xact_lock%');
   pending=attach?request(prefix(f)+'/runs/'+initialCode+'/results/AT-MANUAL/evidence?name=stale-barrier.txt',{method:'PUT',raw:true,body:Buffer.from('independent concurrency barrier bytes')}):request(prefix(f)+'/runs/'+initialCode+'/results/AT-MANUAL',{method:'PUT',body:{status:'pass',simulation:false,evidence:json(await actualObservation(f))}});
   await blockedBy(executionPID,'%tst_batches%FOR UPDATE%');await holder.query('COMMIT');unlocked=true;
   const [e,m]=await Promise.all([execution,pending]);const rows=await q('SELECT id FROM tst_runs WHERE batch_id=$1',[f.batch]),after=(await q('SELECT * FROM tst_case_runs WHERE run_id=$1 AND case_id=$2',[initialRun,f.manual])).rows[0],auditAfter=(await q('SELECT * FROM audit_log WHERE project_id=$1 AND command=$2 ORDER BY seq',[f.pid,command])).rows,evidenceAfter=(await q('SELECT * FROM evd_records WHERE project_id=$1 ORDER BY seq',[f.pid])).rows;
   const unchanged=json(after)===json(baseline)&&json(auditBefore)===json(auditAfter)&&json(evidenceBefore)===json(evidenceAfter);
   return {barrierActuallyObserved:true,outcomes:[{stage:'concurrent-execute',status:e.status,errorCode:e.errorCode},{stage:'stale-write',status:m.status,errorCode:m.errorCode}],runRows:rows.rows.length,oldCaseUnchanged:json(after)===json(baseline),staleCommandAuditUnchanged:json(auditBefore)===json(auditAfter),staleEvidenceLedgerUnchanged:json(evidenceBefore)===json(evidenceAfter),expectedRejection:[{stage:'stale-write',status:423,errorCode:'STALE_EVIDENCE'}],passed:e.status>=200&&e.status<300&&m.errorCode==='STALE_EVIDENCE'&&m.status===423&&rows.rows.length===2&&unchanged};
  }finally{if(!unlocked)await holder.query('ROLLBACK').catch(()=>{});holder.release();await Promise.allSettled([execution,pending].filter(Boolean));}
 });}
 try{
  await schemaCheck();need(env.JARVIS_VALIDATION_USER&&env.JARVIS_VALIDATION_PASSWORD,'QA_PRIVATE_LOGIN_REQUIRED');const anonymous=await request('/api/auth/whoami');need(anonymous.status===200&&anonymous.value?.enabled===true&&anonymous.value.user===null,'QA_AUTH_PRECONDITION_FAILED');
  const login=await request('/api/auth/login',{method:'POST',body:{username:env.JARVIS_VALIDATION_USER,password:env.JARVIS_VALIDATION_PASSWORD}});cookie=login.response?.headers.get('set-cookie')?.split(';')[0];need(login.status===200&&login.value?.ok===true&&/^msf_auth=[^;\s]+$/.test(cookie??''),'QA_LOGIN_FAILED');
  await negative('N01-mock-normal',{automatic:true});await negative('N01-mock-conditional',{automatic:true,type:'conditional'});
  await negative('N02-unknown-source',{setup:f=>q('UPDATE tst_case_runs SET execution_source=NULL WHERE run_id=$1 AND case_id=$2',[f.run,f.manual])});
  await negative('N02-unknown-run-source',{setup:f=>q('UPDATE tst_runs SET execution_source=NULL WHERE id=$1',[f.run])});
  await check('N03-zero-case-run','negative',async set=>{const f=await fixture();set(f);await q('DELETE FROM tst_case_runs WHERE run_id=$1',[f.run]);await q('DELETE FROM tst_cases WHERE plan_id=$1',[f.plan]);const {outcome}=await observedRequest(f,'execute',prefix(f)+'/batches/'+f.batchCode+'/runs:execute',{method:'POST',body:{planId:f.planCode}}),state=await committed(f),expected=[{stage:'execute',status:422,errorCode:'ZERO_CASES_FORBIDDEN'}];return {outcomes:[outcome],expectedRejection:expected,passed:matches([outcome],expected)&&state.releaseDecisions===0&&state.formalPassReports===0};});
  await negative('N04-required-result-missing',{setup:f=>q('DELETE FROM tst_case_runs WHERE run_id=$1 AND case_id=$2',[f.run,f.manual])});
  await negative('N04-required-not-run',{setup:f=>q("UPDATE tst_case_runs SET result='not-run' WHERE run_id=$1 AND case_id=$2",[f.run,f.manual])});
  for(const result of ['fail','blocked'])await check('N05-'+result,'negative',async set=>{const f=await fixture();set(f);await manual(f,{status:result});const outcomes=await workflow(f),state=await committed(f);return {outcomes,expectedRejection:RELEASE_TRUTH,passed:matches(outcomes,RELEASE_TRUTH)&&state.releaseDecisions===0&&state.batchStatus!=='released'};});
  await negative('N05-blocked-batch',{expected:[{stage:'generate',status:409,errorCode:'INVALID_STATE'}],setup:f=>q("UPDATE tst_batches SET previous_status=status,status='blocked',blocked_reason='isolated QA explicit block' WHERE id=$1",[f.batch])});
  for(const severity of ['P0','P1'])await negative('N05-unwaivable-'+severity,{type:'conditional',waivers:[{defectId:'DF-QA',justification:'Isolated QA deliberately supplies a complete waiver; P0/P1 severity must still be unwaivable.'}],expected:[{stage:'release',status:422,errorCode:'WAIVER_NOT_ALLOWED'}],expectedDetail:'SEVERITY_NOT_WAIVABLE',setup:f=>q("INSERT INTO tst_defects(project_id,code,batch_id,run_id,case_id,title,severity,status,created_by) VALUES($1,'DF-QA',$2,$3,$4,'isolated blocking defect',$5,'confirmed','local')",[f.pid,f.batch,f.run,f.manual,severity])});
  await negative('N06-missing-evidence',{setup:f=>q("UPDATE tst_case_runs SET evidence_ids='[]' WHERE run_id=$1 AND case_id=$2",[f.run,f.manual])});
  await negative('N06-evidence-hash-tampered',{setup:async f=>{const ids=(await q('SELECT evidence_ids FROM tst_case_runs WHERE run_id=$1 AND case_id=$2',[f.run,f.manual])).rows[0].evidence_ids;await q("UPDATE evd_records SET content_hash=repeat('0',64) WHERE seq=$1 AND project_id=$2",[ids.find(x=>typeof x==='number'),f.pid]);}});
  await negative('N07-environment-mismatch',{setup:f=>q('UPDATE tst_batches SET environment_fingerprint=$2 WHERE id=$1',[f.batch,sha(f.pid+'changedenv')])});
  await negative('N07-new-current-build',{setup:f=>q("INSERT INTO dev_builds(project_id,code,plan_revision,commit_refs,artifact_object_key,ui_artifact_object_key,build_fingerprint,ui_artifact_fingerprint,source_manifest,status,created_by) VALUES($1,'B-NEW',2,'[]','qa-only/new-build','qa-only/new-ui',$2,$3,'{}','pass','local')",[f.pid,sha(f.pid+'newbuild'),sha(f.pid+'newui')])});
  await negative('N08-result-change',{finalized:true,setup:f=>q("UPDATE tst_case_runs SET result='fail' WHERE run_id=$1 AND case_id=$2",[f.run,f.manual])});
  await negative('N08-source-change',{finalized:true,setup:f=>q('UPDATE tst_case_runs SET is_simulated=true WHERE run_id=$1 AND case_id=$2',[f.run,f.manual])});
  await negative('N09-required-flag-change',{finalized:true,setup:f=>q('UPDATE tst_cases SET must_run=false WHERE id=$1',[f.manual])});
  await negative('N09-content-change',{finalized:true,setup:f=>q("UPDATE tst_cases SET title='mutated QA definition' WHERE id=$1",[f.manual])});
  await negative('N09-required-case-added',{finalized:true,setup:f=>q("INSERT INTO tst_cases(plan_id,code,title,mode,must_run,steps,content_hash,created_by) VALUES($1,'AT-ADDED','new required QA case','manual',true,'[]',$2,'local')",[f.plan,sha(f.pid+'addedcase')])});
  await negative('N10-current-baseline-invalid',{finalized:true,setup:f=>q('UPDATE dsg_baselines SET valid=false WHERE id=$1',[f.bl.id])});
  await negative('N10-new-same-build-failed-report',{finalized:true,expected:[...RELEASE_BASIS,...RELEASE_TRUTH],setup:async f=>{const self=randomUUID();await q("INSERT INTO dev_selftests(id,project_id,build_id,build_fingerprint,gate_function,gate_smoke,gate_ui,gate_review,status,basis_fingerprint,started_by,finished_at) VALUES($1,$2,$3,$4,'{}','{}','{}','{}','fail',$5,'local',now())",[self,f.pid,f.build.id,f.buildFp,sha(f.pid+'newfail')]);await q("INSERT INTO dev_reports(project_id,code,selftest_id,based_on,summary,status,report_fingerprint,created_by) VALUES($1,'SR-NEW-FAIL',$2,$3,'{}','fail',$4,'local')",[f.pid,self,json({build_fingerprint:f.buildFp,baseline_fingerprint:f.baselineFp}),sha(f.pid+'newfailreport')]);}});
  await negative('N10-new-postfinal-blocking-defect',{finalized:true,setup:f=>q("INSERT INTO tst_defects(project_id,code,batch_id,run_id,case_id,title,severity,status,created_by) VALUES($1,'DF-POSTFINAL',$2,$3,$4,'new postfinal QA defect','P1','confirmed','local')",[f.pid,f.batch,f.run,f.manual])});
  await check('N11-mandatory-na-without-applicability','negative',async set=>{const f=await fixture();set(f);await manual(f,{status:'not-applicable'});const outcomes=await workflow(f),state=await committed(f);return {outcomes,expectedRejection:RELEASE_TRUTH,passed:matches(outcomes,RELEASE_TRUTH)&&state.releaseDecisions===0&&state.batchStatus!=='released'};});
  await check('N12-route-body-project-report-override','negative',async set=>{const a=await fixture(),b=await fixture();set(b);await manual(a);await manual(b);await finalizeOnly(a);await finalizeOnly(b);await q("UPDATE projects SET status='archived' WHERE id=$1",[b.pid]);const auditBefore=Number((await q('SELECT count(*) n FROM audit_log WHERE project_id=$1',[a.pid])).rows[0].n);
   const {outcome}=await observedRequest(a,'cross-project-release',prefix(a)+'/reports/'+a.reportCode+':release',{method:'POST',body:{projectId:b.pid,reportId:b.reportCode,type:'normal',confirm:true,waivers:[]}},[b.pid]),state=await committed(b),sourceState=await committed(a),auditAfter=Number((await q('SELECT count(*) n FROM audit_log WHERE project_id=$1',[a.pid])).rows[0].n),expected=[{stage:'cross-project-release',status:400,errorCode:'VALIDATION_FAILED'},{stage:'cross-project-release',status:409,errorCode:'INVALID_STATE'},{stage:'cross-project-release',status:403,errorCode:'FORBIDDEN'}];
   return {outcomes:[outcome],expectedRejection:expected,targetProjectCommittedState:state,sourceProjectCommittedState:sourceState,archivedTargetReleased:state.batchStatus==='released',sourceProjectAuditUnchanged:auditBefore===auditAfter,passed:matches([outcome],expected)&&state.releaseDecisions===0&&state.batchStatus!=='released'&&sourceState.releaseDecisions===0&&sourceState.batchStatus!=='released'&&auditBefore===auditAfter};});
  await concurrentStale('N12-manual-stale-after-batch-lock',false);await concurrentStale('N12-attachment-stale-after-batch-lock',true);
  await check('N12-idempotency-same-key-other-body','negative',async set=>{const f=await fixture();set(f);const key=randomUUID(),path=prefix(f)+'/runs/'+f.runCode+'/results/AT-MANUAL',evidence=json(await actualObservation(f));const first=await request(path,{method:'PUT',key,body:{status:'pass',simulation:false,evidence}});need(first.status>=200&&first.status<300,'QA_IDEMPOTENCY_BASE_FAILED');const {outcome}=await observedRequest(f,'idempotency-replay',path,{method:'PUT',key,body:{status:'fail',simulation:false,evidence:evidence+' altered'}}),expected=[{stage:'idempotency-replay',status:409,errorCode:'IDEMPOTENCY_CONFLICT'}];return {outcomes:[outcome],expectedRejection:expected,passed:matches([outcome],expected)};});
  await positive('P01-real-manual-http-and-byte-evidence');await positive('P02-lawful-optional-na',{optional:true});
  await positive('P03-legacy-unknown-preserved-new-real-run',{legacy:true});
  // Dedicated upgrade DB is real, new and never shared with runtime/production.
  await check('P03-real-legacy-migration','positive',async()=>{const ident=(await upgrade.query('SELECT current_database(),current_user')).rows[0];need(ident.current_database==='jarvis_truth_upgrade_r31'&&ident.current_user==='jarvis_test','QA_UPGRADE_DATABASE_IDENTITY_CHANGED');need(Number((await upgrade.query("SELECT count(*) n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n)===0,'QA_NEW_EMPTY_UPGRADE_DATABASE_REQUIRED');
   const dir=join(SOURCE,'apps/server/src/db/migrations'),names=(await readdir(dir)).filter(x=>/^\d{4}_[a-z0-9_]+\.sql$/.test(x)).sort();need(names.includes('0030_tst_execution_source.sql')&&names.at(-1)==='0030_tst_execution_source.sql','QA_FROZEN_MIGRATION_MANIFEST_CHANGED');for(const name of names.filter(x=>x<'0030'))await upgrade.query(await readFile(join(dir,name),'utf8'));
   const pid=randomUUID();await upgrade.query("INSERT INTO projects(id,name) VALUES($1,'isolated legacy migration QA')",[pid]);const f=await seedBasis(upgrade,pid,'LEGACY');const batch=(await upgrade.query("INSERT INTO tst_batches(project_id,code,handoff_fingerprint,handoff,build_snapshot,dev_report_snapshot,baseline_snapshot,acceptance_terms,environment,environment_fingerprint,received_by,status) VALUES($1,'TB-OLD',$2,'{}','{}','{}','{}','{}','{}',$3,'local','executing') RETURNING id",[pid,sha(pid+'handoff'),sha(pid+'env')])).rows[0].id;
   const plan=(await upgrade.query("INSERT INTO tst_plans(batch_id,code,version_no,scope,state,has_manual_walkthrough,created_by) VALUES($1,'TP-OLD',1,'[]','approved',true,'local') RETURNING id",[batch])).rows[0].id;
   const run=(await upgrade.query("INSERT INTO tst_runs(project_id,batch_id,plan_id,code,conclusion,is_simulated,environment_fingerprint,created_by) VALUES($1,$2,$3,'TR-OLD','pass',false,$4,'local') RETURNING id",[pid,batch,plan,sha(pid+'env')])).rows[0].id;
   for(const [code,mode,note] of [['AT-MANUAL','manual','legacy unknown'],['AT-AUTO','auto','mock 执行器']]){const c=(await upgrade.query("INSERT INTO tst_cases(plan_id,code,title,mode,must_run,steps,content_hash,created_by) VALUES($1,$2,'legacy fixture',$3,true,'[]',$4,'local') RETURNING id",[plan,code,mode,sha(pid+code)])).rows[0].id;await upgrade.query("INSERT INTO tst_case_runs(run_id,case_id,result,is_simulated,executor_kind,evidence_ids,executed_by,note) VALUES($1,$2,'pass',false,$3,'[]','local',$4)",[run,c,mode==='manual'?'human':'auto',note]);}
   const beforeCases=(await upgrade.query('SELECT * FROM tst_case_runs WHERE run_id=$1 ORDER BY id',[run])).rows,beforeRun=(await upgrade.query('SELECT * FROM tst_runs WHERE id=$1',[run])).rows[0];
   await upgrade.query("INSERT INTO tst_reports(batch_id,code,basis_fingerprint,summary,verdict,status,created_by) VALUES($1,'AR-HISTORY',$2,'{\"legacyFixture\":true}','pass','finalized','local')",[batch,sha(pid+'old-report-basis')]);
   const oldReportsBefore=(await upgrade.query('SELECT * FROM tst_reports WHERE batch_id=$1 ORDER BY id',[batch])).rows;
   await upgrade.query(await readFile(join(dir,'0030_tst_execution_source.sql'),'utf8'));const rs=(await upgrade.query('SELECT * FROM tst_case_runs WHERE run_id=$1 ORDER BY id',[run])).rows,runAfter=(await upgrade.query('SELECT * FROM tst_runs WHERE id=$1',[run])).rows[0],oldReportsAfter=(await upgrade.query('SELECT * FROM tst_reports WHERE batch_id=$1 ORDER BY id',[batch])).rows;
   const withoutSource=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['execution_source','is_simulated'].includes(k))),isMockSource=s=>!!s&&json(Object.keys(s).sort())==='["executor","kind","legacy"]'&&s.kind==='simulated-executor'&&s.executor==='mock-v1'&&s.legacy===true;
   const manualRow=rs.find(x=>x.executor_kind==='human'),mockRow=rs.find(x=>x.executor_kind==='auto'),exactMockSource=isMockSource(mockRow?.execution_source),runMarked=runAfter.is_simulated===true&&isMockSource(runAfter.execution_source),rowsPreserved=json(beforeCases.map(withoutSource))===json(rs.map(withoutSource)),runPreserved=json(withoutSource(beforeRun))===json(withoutSource(runAfter)),historyPreserved=json(oldReportsBefore)===json(oldReportsAfter);
   return {scope:'legacy migration semantics only; seeded historical pass is not a legitimate release positive',oldRowsPreserved:rowsPreserved,oldRunPreserved:runPreserved,oldReportsPreserved:historyPreserved,manualLegacyRemainsUnknown:manualRow?.execution_source===null&&manualRow?.is_simulated===false,knownMockMarkedSimulated:mockRow?.is_simulated===true&&exactMockSource,oldMockRunMarkedSimulated:runMarked,passed:rs.length===2&&rowsPreserved&&runPreserved&&historyPreserved&&manualRow?.execution_source===null&&manualRow?.is_simulated===false&&mockRow?.is_simulated===true&&exactMockSource&&runMarked};});
  await check('P04-lawful-P2-conditional','positive',async set=>{const f=await fixture();set(f);await manual(f);await q("INSERT INTO tst_defects(project_id,code,batch_id,run_id,case_id,title,severity,status,created_by) VALUES($1,'DF-P2',$2,$3,$4,'lawful isolated P2 waiver fixture','P2','confirmed','local')",[f.pid,f.batch,f.run,f.manual]);const outcomes=await workflow(f,{type:'conditional',waivers:[{defectId:'DF-P2',justification:'Isolated QA accepts this non-blocking synthetic P2 issue for a bounded conditional-release fixture.'}]}),state=await committed(f),decisions=(await q('SELECT d.decision,d.exemptions,r.status report_status,r.verdict report_verdict,r.code report_code FROM tst_decisions d JOIN tst_reports r ON r.id=d.report_id WHERE d.batch_id=$1',[f.batch])).rows;const bound=decisions.length===1&&decisions[0].decision==='conditional_release'&&decisions[0].report_status==='finalized'&&decisions[0].report_verdict==='fail'&&decisions[0].report_code===f.reportCode&&decisions[0].exemptions.some(x=>x.defect_code==='DF-P2'&&x.severity==='P2'&&typeof x.reason==='string'&&x.reason.trim().length>0);return {scope:'lawful conditional business fixture, not customer acceptance',outcomes,conditionalDecisionAndFinalizedReportVerified:bound,passed:outcomes.every(x=>x.status>=200&&x.status<300)&&state.batchStatus==='released'&&state.releaseDecisions===1&&bound};});
 }catch(e){report.problems.push({errorCode:safeCode(e.code??e.message),scope:'setup-or-matrix-infrastructure'});}
 finally{const ended=await Promise.allSettled([pool.end(),upgrade.end()]);if(ended.some(x=>x.status==='rejected'))report.problems.push({errorCode:'QA_DATABASE_CLOSE_UNCONFIRMED'});try{await readPinnedManifest();await verifyIndependentPGRuntime();assertCache();}catch(e){report.problems.push({errorCode:safeCode(e.code??e.message),scope:'source-or-runtime-after'});}try{release();}catch(e){report.problems.push({errorCode:safeCode(e.code??e.message),scope:'sql-resolver-restore'});}report.finishedAt=new Date().toISOString();report.counts={total:report.checks.length,passed:report.checks.filter(x=>x.status==='pass').length,failed:report.checks.filter(x=>x.status==='fail').length,incomplete:report.checks.filter(x=>x.status==='incomplete').length};report.plannedCheckCount=CHECK_IDS.length;const actualIds=report.checks.map(x=>x.id);report.exactCheckSetCompleted=json(actualIds)===json(CHECK_IDS);report.status=report.exactCheckSetCompleted&&report.checks.every(x=>x.status==='pass')&&report.problems.length===0?'pass':'fail';sealedOutput=await outputReport(report);}
 return {report,output:sealedOutput};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length===0||json(args)==='["--inspect"]')console.log(json(executionRequirements));
 else if(json(args)==='["--execute"]')executeTruthGateProbe().then(({report:r,output})=>{console.log(json({kind:r.kind,status:r.status,counts:r.counts,output,productAccepted:false,rawCredentialsExported:false}));process.exitCode=r.status==='pass'?0:1;}).catch(e=>{console.error(json({errorCode:safeCode(e.code??e.message),ready:false,productAccepted:false,rawErrorExported:false}));process.exitCode=1;});
 else{console.error(json({errorCode:'QA_ARGUMENTS_INVALID',ready:false}));process.exitCode=2;}
}
