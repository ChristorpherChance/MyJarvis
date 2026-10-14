/** Independent PG4 bootstrap/post-hook SQL facts. Import performs no IO. All output is private. */
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const H=/^[a-f0-9]{64}$/,A=/^[a-f0-9]{32}$/,PROTOCOL='PG4_QA_STARTUP_R33_V1';
const sha=v=>createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ref=v=>exact(v,['path','sha256'])&&/^\/tools\/meta\/[A-Za-z0-9._-]+\.json$/.test(v.path)&&H.test(v.sha256);
const baselineRef=v=>exact(v,['path','sha256'])&&v.path==='/tools/sql-baseline.json'&&H.test(v.sha256);
const migrationSame=(a,b)=>exact(a,['path','sha256','bytes'])&&a.path===b.path&&a.sha256===b.sha256&&a.bytes===b.bytes;
const CLIENT='/tools/factory-independent-pg-cjs-consumer-r29.mjs',MANIFEST='/tools/r29-qa-runtime-manifest.json',URLFILE='/tools/pg4-db-url.txt';
const CLIENT_H='45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99',MANIFEST_H='d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1';
const INDEX_H='b79e5d154fd21abfa422428a622ef2ba8cd3b6953bdc071079fd65c117da136e',FIXTURE_H='c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a';
export const PG4SQLMigrationSourcesR33=Object.freeze([
  {
    "path": "/work/source/apps/server/src/db/migrations/0001_m0_core.sql",
    "sha256": "406e6bfa8617ddfa79d7b3569bf0ecf92d49c358a6104aae61ec2402cf15f451",
    "bytes": 1917
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0002_m1_material.sql",
    "sha256": "5e14ec75f0af93f3d4ce95fc69c35c3ca982c1c5486c2dd708e59584050543ca",
    "bytes": 3211
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0003_m1_uploads.sql",
    "sha256": "a82d3c707a78fd043ba7d9e38c0af326f802a4ddb8b4d57ac455904f0bf172ce",
    "bytes": 1200
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0004_m1_batch.sql",
    "sha256": "a50ee532c90e381269bb4e34d91e4a907b3a3c14327b878535e393459e9619b8",
    "bytes": 1677
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0005_m2_requirements.sql",
    "sha256": "5d89c7d2e45241a33f2ec5709b16d6ec0a32293c2b8d46d95a70abc6cbaf00d2",
    "bytes": 5555
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0006_m3_design.sql",
    "sha256": "405aca46b9a21b40180ae52f15e4ff436a2b2ec046ad93c33024be038bf030b9",
    "bytes": 8729
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0007_m4_dev.sql",
    "sha256": "536872fb5c54790d85ec4b4420faa9004e81fd06b9e337745e90427349b34f3c",
    "bytes": 14391
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0008_m5_test.sql",
    "sha256": "72f783499a5cd0950a43fe0e4ba016331341644d8235a9747584531460d46d99",
    "bytes": 7497
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0009_dev_auth_run_seq.sql",
    "sha256": "2e95d6940e571386671b53971a8845d61491e5a4313a1ca84602f8d4c6ab2003",
    "bytes": 781
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0010_m6_ai.sql",
    "sha256": "b0ea63efb04393c6fd5bf04ba1608f3a52f16925f9a094f9f2badb2e1658f343",
    "bytes": 8495
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0011_m6_ai_models_routes.sql",
    "sha256": "eb7ca536b99aed05a81424c656327bb68a44f1a9fbcbc3042b3b853603d43e13",
    "bytes": 349
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0012_m7_platform.sql",
    "sha256": "2f63efd3f3be84175b778349893b60e46e1805680adfb88f7afbec03b5bc3637",
    "bytes": 3499
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0013_ai_session_model.sql",
    "sha256": "1a3d9041192ad41ddded648056ace90e743c1907b02879e23cfe54a7558f9092",
    "bytes": 290
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0014_notification_link.sql",
    "sha256": "6d1e34928173adfa4d13332e850d8673a7ca89afa4b5410be9539b0795468556",
    "bytes": 233
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0015_project_description.sql",
    "sha256": "86dee9cf6d9b73f1cab687d6469066594f8f33f95805636c2b3514ebcd97040d",
    "bytes": 160
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0016_mat_parsed_file_fk.sql",
    "sha256": "ca2a0a7144cd0e3456371e65265253fab9bd32cab52d7eac9d9cc4ac78e6b86b",
    "bytes": 365
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0017_w7_settings_delegate.sql",
    "sha256": "b28816018ebe40f355123692b1493c675da058757538f151ea1fe22b9503c6f6",
    "bytes": 1642
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0018_batch_items_file_nullable.sql",
    "sha256": "a138732940129b86c5662cf2403864f520ad238bf3ee45dacf7838cb0395ad11",
    "bytes": 271
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0019_tasks_view_status.sql",
    "sha256": "83cad08a65e6d62491fa753ccf9fb34c5bbfaebbd6f3ed618718f54e1416f746",
    "bytes": 1041
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0020_gbk_data_cleanup.sql",
    "sha256": "caabaad342bccbfad95c429daadb095a55e6cf736871a460f335059176b00d2e",
    "bytes": 855
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0021_req_pendings_reason.sql",
    "sha256": "5cc05b88a052c06d21ffba09e4548c0d5a23c7b3338766906aa711f2d2e9987c",
    "bytes": 456
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0022_ai_messages_error.sql",
    "sha256": "a8737cc5467e6deb7b364c0be63d8c9643ea91a90fc9ef595385eea9b4e611e4",
    "bytes": 557
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0023_ai_models_conn_checked_at.sql",
    "sha256": "61069e6d50b07dfc3f99d57f58a9d17f30fd23531272b457eb97eab33f649b93",
    "bytes": 411
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0024_dsg_prototype_pages.sql",
    "sha256": "ae60d014406ef673713d32802973b727ae4b53749b3533a2557f304bfe6fca68",
    "bytes": 1210
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0025_pendings_seq.sql",
    "sha256": "ffbf75a3289900fc2c49592818a153e6777cff16b0fa1e638b9c28c194b394bb",
    "bytes": 1046
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0026_dsg_pendings_reason.sql",
    "sha256": "c718936b7e0cf86b9a7a441fbe303def861aaffa9c589f1eeb81235b968528ab",
    "bytes": 619
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0027_template_sets.sql",
    "sha256": "0e53bcebc4eb06f47bd29d4d88a7ff37d7630f3b6da239f00f8ba4aaacb8bc7d",
    "bytes": 2011
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0028_template_kind_binding.sql",
    "sha256": "105af64a40f6cd9e80d9e601d72c9d14908ea76a12cd109d5cfd7409992d62eb",
    "bytes": 833
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0029_session_doc_kind.sql",
    "sha256": "bd4f32f24afb98d516212fac3fe3a20ed98d341c7e3f8b99c1be1080bbbf1213",
    "bytes": 633
  },
  {
    "path": "/work/source/apps/server/src/db/migrations/0030_tst_execution_source.sql",
    "sha256": "4142fef89f3c92cfb79e04a760501b4e7ba71ca09b758691e6f4ffb83e8fafba",
    "bytes": 707
  }
].map(v=>Object.freeze(v)));
export const PG4SQLBusinessTablesR33=Object.freeze(['audit_log','dev_builds','dev_reports','dev_selftests','dsg_baselines','evd_events','evd_records','policy_gates','projects','sys_notifications','tst_batches','tst_case_runs','tst_cases','tst_decisions','tst_defects','tst_plans','tst_reports','tst_runs']);
const COLUMNS=['tst_case_runs.execution_source','tst_case_runs.is_simulated','tst_runs.execution_source'];
export const PG4IndependentSQLR33=Object.freeze({kind:'r33-pg4-independent-sql-interface',protocol:PROTOCOL,request:null,sourceAdmissionRef:null,sourceFamilyReviewRef:null,entryReviewRef:null,operationalReady:false,actualSQLQualified:false,PG4Qualified:false});
export function validatePG4SQLRequestR33(r=null){
 need(exact(r,['schemaVersion','kind','protocol','attempt','phase','sourceContractSHA256','driverSHA256','sqlSourceSHA256','runtimeWitness','migrationWitness','databaseIdentity','selectedFixtureSHA256']),'R33_PG4_SQL_REQUEST_REQUIRED');
 need(r.schemaVersion===1&&r.kind==='r33-pg4-independent-sql-request'&&r.protocol===PROTOCOL&&A.test(r.attempt)&&['bootstrap','after-hooks'].includes(r.phase)&&[r.sourceContractSHA256,r.driverSHA256,r.sqlSourceSHA256].every(h=>H.test(h))&&r.selectedFixtureSHA256===FIXTURE_H,'R33_PG4_SQL_REQUEST_BINDING_CHANGED');
 const w=r.runtimeWitness;
 need(exact(w,['root','clientPath','clientSHA256','manifestPath','manifestSHA256','sourceAdmissionRef','sourceFamilyReviewRef','entryReviewRef'])&&w.root==='/qa-runtime'&&w.clientPath===CLIENT&&w.clientSHA256===CLIENT_H&&w.manifestPath===MANIFEST&&w.manifestSHA256===MANIFEST_H&&[w.sourceAdmissionRef,w.sourceFamilyReviewRef,w.entryReviewRef].every(ref),'R33_PG4_SQL_SOURCE_REFS_REQUIRED');
 const m=r.migrationWitness;
 need(exact(m,['sourceIndexSHA256','listSHA256','files'])&&m.sourceIndexSHA256===INDEX_H&&Array.isArray(m.files)&&m.files.length===30&&m.files.every((v,i)=>migrationSame(v,PG4SQLMigrationSourcesR33[i]))&&m.listSHA256===sha(PG4SQLMigrationSourcesR33),'R33_PG4_SQL_MIGRATION_SOURCE_CHANGED');
 const d=r.databaseIdentity;
 need(exact(d,['database','user','host','port','urlPath','urlSHA256','bootstrapSnapshotRef'])&&d.database==='jarvis_truth_pg4_r33'&&d.user==='qa'&&d.host==='postgres'&&d.port===5432&&d.urlPath===URLFILE&&H.test(d.urlSHA256)&&((r.phase==='bootstrap'&&d.bootstrapSnapshotRef===null)||(r.phase==='after-hooks'&&baselineRef(d.bootstrapSnapshotRef))),'R33_PG4_SQL_DATABASE_IDENTITY_REQUIRED');
 return r;
}
const statKeys=['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'];
const tuple=s=>Object.fromEntries(statKeys.map(k=>[k,String(s[k])]));
const trusted=s=>need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0n&&s.gid===0n&&s.nlink===1n&&(s.mode&0o222n)===0n,'R33_PG4_SQL_FILE_UNTRUSTED');
async function held(path,max,expected=null){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let primary,raw,proof,secondary=[];
 try{const initial=await fd.stat({bigint:true});trusted(initial);need(initial.size<=BigInt(max),'R33_PG4_SQL_FILE_TOO_LARGE');
  const named=await lstat(path,{bigint:true});trusted(named);need(same(tuple(initial),tuple(named)),'R33_PG4_SQL_FILE_REBOUND');
  raw=Buffer.alloc(Number(initial.size));let firstOffset=0;
  while(firstOffset<raw.length){const v=await fd.read(raw,firstOffset,Math.min(65536,raw.length-firstOffset),firstOffset);need(v.bytesRead>0,'R33_PG4_SQL_FILE_INCOMPLETE');firstOffset+=v.bytesRead}
  const eof=Buffer.alloc(1);need((await fd.read(eof,0,1,raw.length)).bytesRead===0,'R33_PG4_SQL_FILE_GREW');need(expected===null||sha(raw)===expected,'R33_PG4_SQL_FILE_CHANGED');
  const second=Buffer.alloc(raw.length);let offset=0;
  while(offset<second.length){const v=await fd.read(second,offset,Math.min(65536,second.length-offset),offset);need(v.bytesRead>0,'R33_PG4_SQL_SECOND_READ_INCOMPLETE');offset+=v.bytesRead}
  need(raw.equals(second),'R33_PG4_SQL_SECOND_READ_CHANGED');
  proof={path,sha256:sha(raw),bytes:raw.length,stat:tuple(initial)};
  need(same(tuple(initial),tuple(await fd.stat({bigint:true})))&&same(tuple(initial),tuple(await lstat(path,{bigint:true}))),'R33_PG4_SQL_FILE_DRIFT');
 }catch(e){primary=e}finally{try{await fd.close()}catch(e){secondary.push(e)}}
 if(primary){primary.secondaryCloseErrors=secondary;throw primary}need(secondary.length===0,'R33_PG4_SQL_FD_CLOSE_FAILED');return {raw,proof};
}
function profile(status){
 const one=key=>{const rows=status.split('\n').filter(x=>x.startsWith(key+':'));need(rows.length===1,'R33_PG4_SQL_PROFILE_INCOMPLETE');return rows[0].slice(key.length+1).trim()};
 need(process.getuid?.()===1000&&process.getgid?.()===1000&&one('Uid').split(/\s+/).every(x=>x==='1000')&&one('Gid').split(/\s+/).every(x=>x==='1000')&&one('NoNewPrivs')==='1','R33_PG4_SQL_PROFILE_CHANGED');
 const caps=Object.fromEntries(['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].map(k=>[k,one(k)]));
 need(Object.values(caps).every(v=>/^[0-9a-f]{16}$/.test(v)&&BigInt('0x'+v)===0n),'R33_PG4_SQL_CAPABILITIES_CHANGED');
 return {uid:1000,gid:1000,pid:process.pid,noNewPrivileges:1,caps,statusSHA256:sha(status)};
}
function errorFrame(e){const b=Buffer.from(String(e?.message??''));
 return {stage:typeof e?.sqlStage==='string'?e.sqlStage:null,code:typeof e?.code==='string'?e.code:null,errno:Number.isSafeInteger(e?.errno)?e.errno:null,messageBase64:b.subarray(0,65536).toString('base64'),messageBytes:b.length,messageComplete:b.length<=65536,
  secondaryCloseErrors:Array.isArray(e?.secondaryCloseErrors)?e.secondaryCloseErrors.map(v=>({code:typeof v.code==='string'?v.code:null,errno:Number.isSafeInteger(v.errno)?v.errno:null})):[]};
}
async function readSelfStatus(){
 const f=await open('/proc/'+process.pid+'/status',constants.O_RDONLY|constants.O_NOFOLLOW);let value,primary=null,closed=[];
 try{const bytes=Buffer.alloc(65537);let offset=0;
  while(offset<bytes.length){const part=await f.read(bytes,offset,bytes.length-offset,offset);if(part.bytesRead===0)break;offset+=part.bytesRead}
  need(offset<=65536,'R33_PG4_SQL_STATUS_TOO_LARGE');value=bytes.subarray(0,offset).toString('utf8');
 }catch(e){primary=e}finally{try{await f.close()}catch(e){closed.push(e)}}
 if(primary){primary.secondaryCloseErrors=closed;throw primary}need(closed.length===0,'R33_PG4_SQL_STATUS_CLOSE_FAILED');return value;
}
export function PG4SQLRowFingerprintR33(rows){
 need(Array.isArray(rows)&&rows.length===18&&rows.every((r,i)=>exact(r,['table','count','rowsJSONText','sha256'])&&r.table===PG4SQLBusinessTablesR33[i]&&Number.isSafeInteger(r.count)&&r.count>=0&&r.count<=4096&&typeof r.rowsJSONText==='string'&&Buffer.byteLength(r.rowsJSONText)<=524288&&sha(r.rowsJSONText)===r.sha256),'R33_PG4_SQL_SNAPSHOT_CHANGED');
 return sha(rows.map(r=>({table:r.table,count:r.count,rowsJSONText:r.rowsJSONText})));
}
export async function runPG4IndependentSQLR33(request=null,deps={}){
 const r=validatePG4SQLRequestR33(request); // Default missing refs refuses before every IO/dependency callback.
 const d={held,lstat,readStatus:readSelfStatus,loadClient:async()=>import(pathToFileURL(CLIENT).href),now:()=>Date.now(),monotonic:()=>Number(process.hrtime.bigint()/1000000n),...deps};
 const started=d.now(),deadline=d.monotonic()+(r.phase==='bootstrap'?240000:60000),requestSHA256=sha(r),sources=[],migrations=[],secondary=[];
 let client,lifecycle,connected=false,inTransaction=false,primary=null,identity=null,clientRuntime=null,ownProfile=null,snapshot=null,baseline=null,currentStage='profile',statusBefore=null,statusAfter=null,schemaIdentity=null;
 const cleanupError=(stage,e)=>{if(primary===null){e.sqlStage=stage;primary=e}else secondary.push({stage,...errorFrame(e)})};
 const needTime=()=>need(d.monotonic()<deadline,'R33_PG4_SQL_DEADLINE_EXCEEDED');
 async function keep(path,max,h){needTime();const v=await d.held(path,max,h);sources.push(v.proof);return v.raw}
 async function query(text,values=[]){needTime();return client.query({text,values,query_timeout:15000})}
 try{
  statusBefore=await d.readStatus();ownProfile=profile(statusBefore);
  currentStage='source';await keep(fileURLToPath(import.meta.url),1048576,r.sqlSourceSHA256);await keep(CLIENT,1048576,CLIENT_H);await keep(MANIFEST,1048576,MANIFEST_H);
  for(const p of [r.runtimeWitness.sourceAdmissionRef,r.runtimeWitness.sourceFamilyReviewRef,r.runtimeWitness.entryReviewRef])await keep(p.path,4194304,p.sha256);
  currentStage='database-url';const rawURL=await keep(URLFILE,4096,r.databaseIdentity.urlSHA256),connectionString=rawURL.toString('utf8').trim(),u=new URL(connectionString),di=r.databaseIdentity;
  need(['postgres:','postgresql:'].includes(u.protocol)&&u.hostname===di.host&&Number(u.port||5432)===di.port&&decodeURIComponent(u.username)===di.user&&decodeURIComponent(u.pathname.slice(1))===di.database&&u.password.length>0&&!u.search&&!u.hash,'R33_PG4_SQL_ENDPOINT_CHANGED');
  if(r.phase==='after-hooks'){
   currentStage='bootstrap-frame';const p=di.bootstrapSnapshotRef;baseline=JSON.parse(await keep(p.path,16777216,p.sha256));
   need(baseline.kind==='r33-pg4-independent-sql-result'&&baseline.protocol===PROTOCOL&&baseline.attempt===r.attempt&&baseline.phase==='bootstrap'&&baseline.status==='complete'&&baseline.sourceContractSHA256===r.sourceContractSHA256&&baseline.driverSHA256===r.driverSHA256&&baseline.sqlSourceSHA256===r.sqlSourceSHA256&&baseline.selectedFixtureSHA256===FIXTURE_H&&baseline.migrations?.length===30&&baseline.migrations.every((v,i)=>v.completed===true&&migrationSame(v.source,PG4SQLMigrationSourcesR33[i]))&&baseline.businessRowFingerprint===PG4SQLRowFingerprintR33(baseline.businessRows),'R33_PG4_SQL_BOOTSTRAP_FRAME_CHANGED');
  }
  currentStage='client-load';const code=await d.loadClient();need(typeof code.loadIndependentPG==='function','R33_PG4_SQL_CLIENT_API_CHANGED');lifecycle=await code.loadIndependentPG();clientRuntime=lifecycle.runtime;
  need(clientRuntime?.verified===true&&clientRuntime.manifestSHA256===MANIFEST_H&&clientRuntime.pgVersion==='8.23.0'&&clientRuntime.resolverClosureGuard===true,'R33_PG4_SQL_RUNTIME_INCOMPLETE');
  currentStage='connect';client=new lifecycle.Client({connectionString,connectionTimeoutMillis:10000,statement_timeout:15000,query_timeout:15000,application_name:'r33-pg4-'+r.phase+'-'+r.attempt});await client.connect();connected=true;
  currentStage='database-identity';
  const id=(await query('SELECT current_database() AS database, current_user AS "user", inet_server_addr()::text AS server_address, inet_server_port() AS port')).rows;
  need(id.length===1&&id[0].database===di.database&&id[0].user===di.user&&id[0].port===5432,'R33_PG4_SQL_DATABASE_CHANGED');identity=id[0];
  if(r.phase==='bootstrap'){
   currentStage='empty-schema';const empty=(await query("SELECT count(*)::text AS count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')")).rows;
   need(empty.length===1&&empty[0].count==='0','R33_PG4_SQL_DATABASE_NOT_EMPTY');
   for(const m of PG4SQLMigrationSourcesR33){currentStage='migration-'+m.path.split('/').pop().slice(0,4);const bytes=await keep(m.path,1048576,m.sha256);need(bytes.length===m.bytes,'R33_PG4_SQL_MIGRATION_BYTES_CHANGED');const entry={source:{...m},completed:false};migrations.push(entry);await query(bytes.toString('utf8'));entry.completed=true}
  }
  currentStage='row-snapshot';await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');inTransaction=true;await query("SET LOCAL TIME ZONE 'UTC'");
  currentStage='required-tables-columns';const tables=(await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(v=>v.table_name);
  need(PG4SQLBusinessTablesR33.every(t=>tables.includes(t)),'R33_PG4_SQL_REQUIRED_TABLE_MISSING');
  const cols=(await query("SELECT table_name||'.'||column_name AS column FROM information_schema.columns WHERE table_schema='public' AND (table_name,column_name) IN (('tst_case_runs','execution_source'),('tst_case_runs','is_simulated'),('tst_runs','execution_source')) ORDER BY table_name,column_name")).rows.map(v=>v.column);
  need(same(cols,COLUMNS),'R33_PG4_SQL_REQUIRED_COLUMN_MISSING');
  schemaIdentity={tables,columns:cols,identity};currentStage='row-snapshot';
  const rows=[];
  for(const table of PG4SQLBusinessTablesR33){
   const n=(await query('SELECT count(*)::text AS count FROM "'+table+'"')).rows;need(n.length===1&&/^\d+$/.test(n[0].count),'R33_PG4_SQL_ROW_COUNT_INCOMPLETE');
   const count=Number(n[0].count);need(Number.isSafeInteger(count)&&count<=4096,'R33_PG4_SQL_ROW_LIMIT_EXCEEDED');
   const v=(await query('WITH snapshot AS (SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data::text),\'[]\'::jsonb)::text AS payload FROM (SELECT to_jsonb(t) AS row_data FROM "'+table+'" t) s) SELECT octet_length(payload) AS bytes, CASE WHEN octet_length(payload)<=524288 THEN payload ELSE NULL END AS rows FROM snapshot')).rows;
   need(v.length===1&&typeof v[0].rows==='string'&&Number.isSafeInteger(v[0].bytes)&&v[0].bytes<=524288&&Buffer.byteLength(v[0].rows)===v[0].bytes,'R33_PG4_SQL_ROW_BYTES_INCOMPLETE');
   rows.push({table,count,rowsJSONText:v[0].rows,sha256:sha(v[0].rows)});
  }
  await query('ROLLBACK');inTransaction=false;snapshot={rows,fingerprint:PG4SQLRowFingerprintR33(rows)};
  if(baseline)need(baseline.identity.database===identity.database&&baseline.identity.user===identity.user&&baseline.identity.server_address===identity.server_address&&baseline.identity.port===identity.port&&baseline.businessRowFingerprint===snapshot.fingerprint&&same(baseline.businessRows,rows),'R33_PG4_SQL_POST_HOOK_BASELINE_CHANGED');
  lifecycle.assertCache();
 }catch(e){e.sqlStage=currentStage;primary=e}
 finally{
  if(inTransaction&&connected){try{await client.query({text:'ROLLBACK',query_timeout:10000})}catch(e){cleanupError('rollback',e)}}
  if(client){try{await client.end()}catch(e){cleanupError('client-end',e)}}
  if(lifecycle){try{lifecycle.assertCache()}catch(e){cleanupError('client-cache',e)}try{lifecycle.release()}catch(e){cleanupError('client-release',e)}}
 }
 try{for(const s of sources){const b=await d.held(s.path,Math.max(s.bytes,1),s.sha256);need(same(s.stat,b.proof.stat)&&b.raw.length===s.bytes,'R33_PG4_SQL_POST_SOURCE_DRIFT')}if(ownProfile){statusAfter=await d.readStatus();profile(statusAfter)}needTime()}catch(e){cleanupError('source-post',e)}
 const complete=primary===null&&secondary.length===0&&snapshot!==null;
 return {schemaVersion:1,kind:'r33-pg4-independent-sql-result',protocol:PROTOCOL,attempt:r.attempt,phase:r.phase,requestSHA256,
  sourceContractSHA256:r.sourceContractSHA256,driverSHA256:r.driverSHA256,sqlSourceSHA256:r.sqlSourceSHA256,selectedFixtureSHA256:FIXTURE_H,
  status:complete?'complete':'incomplete',startedAt:new Date(started).toISOString(),finishedAt:new Date(d.now()).toISOString(),
  schemaIdentity,schemaIdentitySHA256:schemaIdentity===null?null:sha(schemaIdentity),migrationsSHA256:sha(PG4SQLMigrationSourcesR33),businessRowsSHA256:snapshot?.fingerprint??null,
  fingerprintDomains:{schemaIdentitySHA256:'canonical output tables/three selected columns/connection identity in one readonly snapshot',migrationsSHA256:'ordered frozen30 source declarations; not a second migration execution or database catalog hash',businessRowsSHA256:'alias of businessRowFingerprint over18 original server row-text values; not another independent event'},
  profile:ownProfile,statusEvidence:{before:statusBefore===null?null:{base64:Buffer.from(statusBefore).toString('base64'),sha256:sha(statusBefore)},after:statusAfter===null?null:{base64:Buffer.from(statusAfter).toString('base64'),sha256:sha(statusAfter)}},identity,independentClientRuntime:clientRuntime,migrations,businessRows:snapshot?.rows??null,businessRowFingerprint:snapshot?.fingerprint??null,
  businessRowBaselineMatches:r.phase==='after-hooks'?(complete?true:null):null,sourceRefs:sources,sourceAdmissionReferencesBoundOnly:true,
  sourceAdmissionSemanticQualificationByThisProgram:false,primary:primary?errorFrame(primary):null,secondary,
  originalRowNumbersKeptAsServerJSONText:true,sequenceAndCatalogCompared:false,independentPoolEndEventObserved:false,
  overallSourceFamilyQualified:false,actualPG4Qualified:false,productAccepted:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 let result;
 try{need(process.argv.length===4&&/^\/tools\/[A-Za-z0-9._-]+\.json$/.test(process.argv[2])&&H.test(process.argv[3]),'R33_PG4_SQL_REQUEST_ARGUMENTS_REQUIRED');
  const body=await held(process.argv[2],16777216,process.argv[3]),request=JSON.parse(body.raw);
  need(body.raw.equals(Buffer.from(JSON.stringify(request))),'R33_PG4_SQL_REQUEST_COMPACT_RAW_REQUIRED');result=await runPG4IndependentSQLR33(request);
  const wire=Buffer.from(JSON.stringify(result)+'\n');need(wire.length<=16777216,'R33_PG4_SQL_OUTPUT_TOO_LARGE');process.stdout.write(wire);if(result.status!=='complete')process.exitCode=1;
 }catch(e){process.stderr.write(JSON.stringify({kind:'r33-pg4-independent-sql-entry-failure',error:errorFrame(e),actualSQLQualified:false,actualPG4Qualified:false})+'\n');process.exitCode=1}
}
