/** Execute actual R30 pure functions using existing TS; no app, DB, HTTP or remote. */
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {createRequire} from 'node:module';
import * as crypto from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve('.jarvis-dev/workspaces/msf-targets-r30/source'),base=root+'/apps/server/src/modules/test/';
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
 function codes(contents){const filename=resolve('.jarvis-dev/maintenance/r30-semantic-no-emit.ts').replaceAll('\\','/'),samePath=p=>p.replaceAll('\\','/').toLowerCase()===filename.toLowerCase(),options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,types:[]};const host=ts.createCompilerHost(options);const read=host.readFile.bind(host),exists=host.fileExists.bind(host),get=host.getSourceFile.bind(host);host.readFile=p=>samePath(p)?contents:read(p);host.fileExists=p=>samePath(p)||exists(p);host.getSourceFile=(p,...args)=>samePath(p)?ts.createSourceFile(p,contents,ts.ScriptTarget.ES2022,true):get(p,...args);const program=ts.createProgram([filename],options,host);return ts.getPreEmitDiagnostics(program).filter(d=>d.file&&samePath(d.file.fileName)).map(d=>d.code);}
 const prelude='declare const PID:string,batchId:string;declare function expect(v:unknown):any;';
 const old=codes(prelude+'declare const runs:{runsOfBatch(p:string,b:string):Promise<{items:unknown[];latestRunId:{}|null;cases:unknown[]}>};async function check(){'+expression(oldTest)+'}');
 assert.ok(old.includes(2352));
 const fixed=codes(prelude+dto+'declare const runs:{runsOfBatch(p:string,b:string):Promise<BatchRunsView>};async function check(){'+expression(testSource)+'}');assert.deepEqual(fixed,[]);
});
