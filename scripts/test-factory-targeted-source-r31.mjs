/** Execute actual R31 pure functions using existing TS; no app, DB, HTTP or remote. */
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {createRequire} from 'node:module';
import * as crypto from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve('.jarvis-dev/workspaces/msf-targets-r31/source'),base=root+'/apps/server/src/modules/test/';
function module(file,deps={}){
 const raw=readFileSync(file,'utf8'),output=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const value={exports:{}};vm.runInNewContext(output,{module:value,exports:value.exports,require:specifier=>{if(specifier in deps)return deps[specifier];if(specifier==='node:crypto')return crypto;throw Error('UNEXPECTED_IMPORT:'+specifier);},Buffer,console,Object,Array,Date},{timeout:1000});return value.exports;
}
const errors=module(root+'/packages/shared/src/error-codes.ts'),fingerprints=module(root+'/packages/shared/src/fingerprint.ts',{'./error-codes.js':errors}),shared={...errors,...fingerprints};
const route=module(base+'route-body.ts',{'@msf/shared':shared}),locks=module(base+'run-lock.ts',{'@msf/shared':shared}),upstream=module(base+'upstream-basis.ts',{'@msf/shared':shared});
const clone=value=>JSON.parse(JSON.stringify(value));
const batch={id:'batch',project_id:'project',code:'TB-001',build_snapshot:{build_id:'build',build_fingerprint:'build-fp'},baseline_snapshot:{baseline_id:'baseline',baseline_fingerprint:'baseline-fp'},dev_report_snapshot:{report_id:'report',report_fingerprint:'report-fp',status:'pass'}};
function current(){return {build:{id:'build',build_fingerprint:'build-fp'},baseline:{id:'baseline',baseline_fingerprint:'baseline-fp',valid:true},devReport:{id:'report',selftest_id:'selftest',status:'pass',report_fingerprint:'report-fp',based_on:{build_fingerprint:'build-fp',baseline_fingerprint:'baseline-fp',selftest_basis:'selftest'}},selftest:{id:'selftest',build_id:'build',build_fingerprint:'build-fp',status:'pass',basis_fingerprint:shared.fingerprint({build:'build-fp',baseline:'baseline-fp'})},runningSelftests:[]};}

test('actual projection preserves route and allowed data only',()=>{
 assert.equal(JSON.stringify(route.routeBoundPayload({type:'normal',confirm:true,unknown:'discarded'},{projectId:'A',reportId:'AR-A'},['type','confirm'])),JSON.stringify({type:'normal',confirm:true,projectId:'A',reportId:'AR-A'}));
});
test('actual projection rejects all three route-ID conflicts before a command',()=>{
 for(const key of ['projectId','reportId','defectId'])assert.throws(()=>route.routeBoundPayload({[key]:'B',confirm:true},{[key]:'A'},['confirm']),error=>error.code==='VALIDATION_FAILED');
});
test('actual projection rejects getter scope without executing it and handles null-prototype bodies',()=>{
 let calls=0;const body=Object.defineProperty({},'projectId',{enumerable:true,get:()=>{calls++;return 'A'}});assert.throws(()=>route.routeBoundPayload(body,{projectId:'A'},[]),error=>error.code==='VALIDATION_FAILED');assert.equal(calls,0);
 const allowed=Object.assign(Object.create(null),{confirm:true});assert.equal(route.routeBoundPayload(allowed,{projectId:'A'},['confirm']).confirm,true);
});
test('actual projection refuses invalid JSON top-level body values',()=>{
 for(const body of [null,[],3,'value',false])assert.throws(()=>route.routeBoundPayload(body,{projectId:'A'},[]),error=>error.code==='VALIDATION_FAILED');
});
test('actual same frozen upstream positive requires exact selftest/report/build/baseline',()=>assert.equal(upstream.upstreamBasisMatches(current(),batch),true));
test('actual later pass and fail reports both invalidate prior batch',()=>{for(const status of ['pass','fail']){const c=current();c.devReport.id='later';c.devReport.status=status;assert.equal(upstream.upstreamBasisMatches(c,batch),false);}});
test('actual active run is not masked by a later passed selftest/report',()=>{const c=current();c.runningSelftests=[{...c.selftest,id:'active',status:'running'}];assert.equal(upstream.upstreamBasisMatches(c,batch),false);});
test('actual nonpass/latest/malformed/mismatched bindings fail closed',()=>{
 for(const mutate of [c=>c.selftest.status='running',c=>c.selftest.status='fail',c=>c.selftest.status='stale',c=>c.selftest.id='other',c=>c.selftest.basis_fingerprint='other',c=>c.devReport.based_on.baseline_fingerprint='other',c=>c.baseline.valid=false,c=>c.runningSelftests=undefined]){const c=current();mutate(c);assert.equal(upstream.upstreamBasisMatches(c,batch),false);}
 assert.equal(upstream.upstreamBasisMatches(current(),{...batch,build_snapshot:null}),false);
});
test('actual lock helper obtains batch first, observes changed latest after barrier, and writes nothing',async()=>{
 let grant;const barrier=new Promise(resolve=>grant=resolve);let latest='TR-001';const queries=[];
 const client={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('FOR UPDATE OF b')){await barrier;return {rows:[batch]};}if(sql.includes('FOR UPDATE'))return {rows:[{id:'run',batch_id:'batch',plan_id:'plan',code:'TR-001'}]};return {rows:[{code:latest}]};}};
 const pending=locks.lockLatestRun(client,'project','TR-001');await Promise.resolve();assert.equal(queries.length,1);assert.ok(queries[0].sql.includes('FOR UPDATE OF b'));latest='TR-002';grant();await assert.rejects(pending,error=>error.code==='STALE_EVIDENCE');assert.equal(queries.length,3);assert.ok(queries.every(x=>x.sql.trim().startsWith('SELECT')));
});
test('actual lock helper stable positive retains scoped identity and consistent order',async()=>{
 const queries=[];const client={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('FOR UPDATE OF b')?[batch]:sql.includes('FOR UPDATE')?[{id:'run',batch_id:'batch',plan_id:'plan',code:'TR-001'}]:[{code:'TR-001'}]};}};
 const result=await locks.lockLatestRun(client,'project','TR-001');assert.equal(result.run.code,'TR-001');assert.ok(queries[1].sql.includes('project_id=$1 AND batch_id=$2'));assert.equal(JSON.stringify(queries[1].args),JSON.stringify(['project','batch','TR-001']));assert.ok(queries[2].sql.includes('created_at DESC, code DESC, id DESC'));
});
test('actual project CommandBus rejects mismatched scope before any transaction',async()=>{
 let transactions=0;const registered={};const bus=module(root+'/apps/server/src/modules/evidence/command-bus.ts',{'@msf/shared':shared,'../../db/pool.js':{inTransaction:async fn=>{transactions++;return fn({query:async()=>({rows:[]})})}},'./audit.service.js':{appendAudit:async()=>{}},'./commands.js':{isCommand:name=>name==='tst.delivery.authorize'}});
 bus.registerCommand('tst.delivery.authorize',async()=>{registered.called=true;return {}});
 await assert.rejects(bus.executeCommand('tst.delivery.authorize',{projectId:'B'},{projectId:'A',actorKind:'human',actorId:'operator'}),error=>error.code==='VALIDATION_FAILED');assert.equal(transactions,0);assert.equal(registered.called,undefined);
});
test('current SQL basis reads latest report, all running selftests, and locks the consumed table',()=>{
 const raw=readFileSync(base+'test-common.ts','utf8');assert.match(raw,/FROM dev_reports WHERE project_id=\$1 ORDER BY created_at DESC, code DESC, id DESC/);assert.match(raw,/FROM dev_selftests WHERE project_id=\$1 AND status=\\'running\\'/);assert.match(raw,/LOCK TABLE dev_builds, dev_reports, dev_selftests,/);assert.doesNotMatch(raw,/FROM dev_reports WHERE id=\$1 AND project_id=\$2/);
});
test('all old assertion lines remain in T8; type fix removes incompatible whole-result cast',()=>{
 const original=readFileSync(resolve('.jarvis-dev/workspaces/msf-targets-r29/source/apps/server/src/modules/test/test.integration.test.ts'),'utf8'),fixed=readFileSync(base+'test.integration.test.ts','utf8');
 const before=original.slice(original.indexOf("it('T8"),original.indexOf("it('T9")),after=fixed.slice(fixed.indexOf("it('T8"),fixed.indexOf("it('T9"));
 for(const line of before.split(/\r?\n/).filter(line=>line.trim().startsWith('expect(')||line.trim().startsWith('await expect(')))assert.ok(after.includes(line.trim()));
 assert.ok(after.includes('const latest = await runs.runsOfBatch(PID, batchId);'));assert.ok(after.includes('expect(latest.latestRunId).not.toBeNull();'));assert.ok(!after.includes('as unknown'));
});

test('actual DTO and T8 expression pass semantic TS while old inferred return reproduces TS2352',()=>{
 const service=readFileSync(base+'runs.service.ts','utf8'),sf=ts.createSourceFile('runs.ts',service,ts.ScriptTarget.Latest,true);
 const dto=sf.statements.filter(n=>ts.isInterfaceDeclaration(n)&&['BatchRunCaseView','BatchRunsView'].includes(n.name.text)).map(n=>n.getText(sf)).join('\n');
 const testSource=readFileSync(base+'test.integration.test.ts','utf8'),oldTest=readFileSync(resolve('.jarvis-dev/workspaces/msf-targets-r29/source/apps/server/src/modules/test/test.integration.test.ts'),'utf8');
 function expression(s){const start=s.indexOf('const latest =',s.indexOf("it('T8"));return s.slice(start,s.indexOf('const g =',start));}
 function codes(contents){const filename=resolve('.jarvis-dev/maintenance/r31-semantic-no-emit.ts').replaceAll('\\','/'),samePath=p=>p.replaceAll('\\','/').toLowerCase()===filename.toLowerCase(),options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,types:[]};const host=ts.createCompilerHost(options);const read=host.readFile.bind(host),exists=host.fileExists.bind(host),get=host.getSourceFile.bind(host);host.readFile=p=>samePath(p)?contents:read(p);host.fileExists=p=>samePath(p)||exists(p);host.getSourceFile=(p,...args)=>samePath(p)?ts.createSourceFile(p,contents,ts.ScriptTarget.ES2022,true):get(p,...args);const program=ts.createProgram([filename],options,host);return ts.getPreEmitDiagnostics(program).filter(d=>d.file&&samePath(d.file.fileName)).map(d=>d.code);}
 const prelude='declare const PID:string,batchId:string;declare function expect(v:unknown):any;';
 const old=codes(prelude+'declare const runs:{runsOfBatch(p:string,b:string):Promise<{items:unknown[];latestRunId:{}|null;cases:unknown[]}>};async function check(){'+expression(oldTest)+'}');
 assert.ok(old.includes(2352));
 const fixed=codes(prelude+dto+'declare const runs:{runsOfBatch(p:string,b:string):Promise<BatchRunsView>};async function check(){'+expression(testSource)+'}');assert.deepEqual(fixed,[]);
});

function insertStatements(relative, table) {
 const raw=readFileSync(root+'/apps/server/src/modules/'+relative,'utf8');
 const sf=ts.createSourceFile(relative,raw,ts.ScriptTarget.Latest,true),statements=[];
 function visit(node){if(ts.isNoSubstitutionTemplateLiteral(node)&&node.text.includes('INSERT INTO '+table+' '))statements.push(node.text);ts.forEachChild(node,visit);}
 visit(sf);return statements;
}
for(const item of [
 {file:'test/runs.service.ts',table:'tst_runs',column:'created_at',scope:'batch_id=$2',count:2},
 {file:'dev/selftest.service.ts',table:'dev_selftests',column:'started_at',scope:'project_id=$1',count:2},
 {file:'dev/selftest.service.ts',table:'dev_reports',column:'created_at',scope:'project_id=$1',count:1},
 {file:'dev/build.service.ts',table:'dev_builds',column:'created_at',scope:'project_id=$1',count:1},
 {file:'design/prototype.service.ts',table:'dsg_baselines',column:'confirmed_at',scope:'project_id=$1',count:1},
 {file:'dev/impact.service.ts',table:'dsg_baselines',column:'confirmed_at',scope:'project_id=$1',count:1},
])test('actual '+item.file+'/'+item.table+' INSERT has explicit DB-only monotonic clock with NULL first-row fallback',()=>{
 const all=insertStatements(item.file,item.table);assert.equal(all.length,item.count);
 for(const sql of all){assert.ok(sql.slice(0,sql.indexOf('VALUES')).includes(item.column));assert.ok(sql.includes('GREATEST(clock_timestamp(), COALESCE('));assert.ok(sql.includes("(SELECT max("+item.column+") + interval '1 microsecond' FROM "+item.table+' WHERE '+item.scope+')'));assert.ok(sql.includes("'-infinity'::timestamptz"));}
});

test('microsecond fixture exposes original BEGIN-order reversal without claiming a PostgreSQL execution',()=>{
 const next=(clock,prior)=>prior===null?clock:clock>prior+1n?clock:prior+1n;
 const oldBeginE2=1000000n,oldBeginE1=1000100n;
 assert.ok(oldBeginE2<oldBeginE1); // Original default now() would incorrectly select E1.
 assert.ok(next(1000200n,oldBeginE1)>oldBeginE1);
 assert.equal(next(1000000n,1000000000000001n),1000000000000002n);
 assert.equal(next(1000000n,null),1000000n);
});

function actualSelftest(handlers,lockQuery) {
 const seq=module(root+'/apps/server/src/db/seq.ts');
 const result=module(root+'/apps/server/src/modules/dev/selftest.service.ts',{
  '@nestjs/common':{Inject:()=>()=>{},Injectable:()=>value=>value},'@msf/shared':shared,
  '../../db/pool.js':{query:()=>{throw Error('GLOBAL_POOL_NOT_ALLOWED')}},'../../db/seq.js':seq,
  '../evidence/command-bus.js':{registerCommand:(name,fn)=>{handlers[name]=fn},executeCommand:()=>{throw Error('NO_BUS_OR_DB_START')}},
  '../platform/md-html.js':{mdToHtml:()=>{throw Error('NO_EXPORT')}},'../platform/storage.service.js':{StorageService:class{}},
  '../platform/ui-score.js':{evaluateUiEvidence:()=>{throw Error('NO_UI_EXECUTOR')}},
  './gate-common.js':{qof:client=>client.query.bind(client),latestBaseline:async()=>({baseline_fingerprint:'baseline'})},
 });
 const service=new result.DevSelftestService({});service.onModuleInit();return service;
}

test('actual two start handlers serialize before running lookup and the loser has no INSERT',async()=>{
 const handlers={},events=[],waiters=[];let owner=null,running=[];
 actualSelftest(handlers);
 const clients=[0,1].map(id=>({id,query:async(sql,args)=>{
  events.push({id,sql,args});
  if(sql.includes('pg_advisory_xact_lock')){assert.equal(args[0],'msf:code:selftest:project');if(owner!==null)await new Promise(resolve=>waiters.push({id,resolve}));else owner=id;return {rows:[]};}
  if(sql.includes('FROM dev_builds'))return {rows:[{id:'build',code:'B',build_fingerprint:'build-fp',status:'pass'}]};
  if(sql.includes('FROM dev_plans')||sql.includes('FROM dev_reports')||sql.includes('FROM dev_tasks'))return {rows:[]};
  if(sql.includes('INSERT INTO dev_selftests')){running.push({id:'selftest'});return {rows:[{id:'selftest'}]};}
  if(sql.includes('FROM dev_selftests'))return {rows:running.slice()};
  throw Error('UNEXPECTED_CONTROLLED_QUERY');
 }}));
 const invoke=async client=>{try{return await handlers['dev.selftest.start'](client,{projectId:'project'},{actorId:'human'})}finally{if(owner===client.id){const next=waiters.shift();owner=next?.id??null;next?.resolve();}}};
 const all=await Promise.allSettled(clients.map(invoke));
 assert.equal(all.filter(x=>x.status==='fulfilled').length,1);const failure=all.find(x=>x.status==='rejected').reason;
 assert.equal(failure.code,'GATE_BLOCKED');assert.ok(failure.details.issues.some(i=>i.code==='SELFTEST_RUNNING'));
 assert.equal(events.filter(e=>e.sql.includes('INSERT INTO dev_selftests')).length,1);
 for(const id of [0,1])assert.ok(events.find(e=>e.id===id).sql.includes('pg_advisory_xact_lock'));
});

test('actual completion acquires the same project lock before its row lock and rejects missing row without writes',async()=>{
 const handlers={},events=[];actualSelftest(handlers);
 const client={query:async(sql,args)=>{events.push({sql,args});return {rows:[]}}};
 await assert.rejects(handlers['dev.selftest.complete'](client,{projectId:'project',selftestId:'absent'},{actorId:'human'}),e=>e.code==='NOT_FOUND');
 assert.ok(events[0].sql.includes('pg_advisory_xact_lock'));assert.equal(events[0].args[0],'msf:code:selftest:project');
 assert.ok(events[1].sql.includes('FOR UPDATE'));assert.ok(events.every(e=>e.sql.startsWith('SELECT')));
});

test('actual retest project lock precedes the same startIssues lookup; consumers agree on tie order',()=>{
 const raw=readFileSync(root+'/apps/server/src/modules/dev/selftest.service.ts','utf8');
 const retest=raw.slice(raw.indexOf("registerCommand('dev.selftest.retest'"),raw.indexOf("registerCommand('dev.selftest.complete'"));
 assert.ok(retest.indexOf('await lockCodeGen(')<retest.indexOf('await this.startIssues('));
 assert.equal((raw.match(/await lockCodeGen\(client, `msf:code:selftest:\$\{projectId\}`\)/g)||[]).length,3);
 assert.ok(!/FROM dev_reports WHERE project_id=\$1 ORDER BY created_at DESC(?: LIMIT|')/.test(raw));
 assert.match(readFileSync(root+'/apps/server/src/modules/dev/gate-common.ts','utf8'),/ORDER BY confirmed_at DESC, id DESC LIMIT 1/);
 assert.match(readFileSync(base+'test-common.ts','utf8'),/IN EXCLUSIVE MODE NOWAIT/);
});

test('prepared real PG barrier keeps original assertions and compares microseconds inside PostgreSQL',()=>{
 const source=readFileSync(base+'truth-gate.integration.test.ts','utf8'),old=readFileSync(resolve('.jarvis-dev/workspaces/msf-targets-r30/source/apps/server/src/modules/test/truth-gate.integration.test.ts'),'utf8');
 for(const line of old.split(/\r?\n/).filter(l=>l.trim().startsWith('expect(')||l.trim().startsWith('await expect(')))assert.ok(source.includes(line.trim()));
 assert.ok(source.includes("await client.query('BEGIN');"));assert.ok(source.includes('await afterBegin(client);'));assert.ok(source.includes("exactlyOneMicrosecond"));assert.ok(source.includes('fixture.approvedPlanId'));assert.ok(source.includes("code: 'REPORT_BASIS_MISMATCH'"));
});

test('prepared PG rerun reaches executing state while finalized case uses a permitted manual revision',()=>{
 const source=readFileSync(base+'truth-gate.integration.test.ts','utf8');
 const rerun=source.slice(source.indexOf("it('orders a later serialized rerun"),source.indexOf("it('invalidates a finalized report when"));
 assert.ok(rerun.includes('const pending = runs.execute('));
 assert.ok(!rerun.includes('await reports.finalize(PID'));
 assert.ok(rerun.indexOf('const later = await pending')<rerun.indexOf('await expect(reports.finalize'));
 const finalized=source.slice(source.indexOf("it('invalidates a finalized report when"),source.indexOf("it('places a manual revision"));
 assert.ok(finalized.includes('const pending = runs.manualRecord('));assert.ok(!finalized.includes('runs.execute('));
 assert.ok(finalized.indexOf('await reports.finalize(PID')<finalized.indexOf('resume();'));
 assert.ok(finalized.includes("code: 'REPORT_BASIS_MISMATCH'"));
});
