/** Limited R32 type/return-contract verification. No app, DB, HTTP, remote or model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
const oldRoot=resolve('.jarvis-dev/workspaces/msf-targets-r31/source');
const newRoot=resolve('.jarvis-dev/workspaces/msf-targets-r32/source');
const validation=resolve('.jarvis-dev/workspaces/msf-targets-r32/validation');
const pgRequire=createRequire('D:/AI/workspaces/MSF/backend/package.json');
const vitestRequire=createRequire('D:/AI/workspaces/MSF/frontend/package.json');
const pgTypes=resolve(pgRequire.resolve('@types/pg/package.json'),'../index.d.ts');
const vitestTypes=resolve(vitestRequire.resolve('vitest/package.json'),'../dist/index.d.ts');
const {Client}=pgRequire('pg');
const spy=await import(pathToFileURL(vitestRequire.resolve('@vitest/spy')).href);
const results={schemaVersion:1,kind:'r32-limited-local-compiler-repair-verification',at:new Date().toISOString(),dependencies:{typescript:ts.version,pgTypes:pgRequire('@types/pg/package.json').version,pgRuntime:pgRequire('pg/package.json').version,vitestTypes:vitestRequire('vitest/package.json').version},limits:['Local installed Vitest4.1 declarations differ from the candidate locked Vitest2.1.9. This is not the frozen full workspace typecheck.','Actual local pg Client constructors and query mocks never connect or query a database.','Full Linux build, actual HTTP/SQL and 74 goals remain unverified.'],remoteOperations:false,modelsInvoked:false,fullBuildPassed:false,actualPGTransactions:0,actualHTTPChecks:0,productAccepted:false};
const norm=p=>p.replaceAll('\\','/');
const text=(root,relative)=>readFileSync(resolve(root,relative),'utf8');
const domain='apps/server/src/modules/test/';
function module(raw,deps={},globals={}){
 const output=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const value={exports:{}};vm.runInNewContext(output,{module:value,exports:value.exports,require:n=>{if(n in deps)return deps[n];if(n==='node:crypto')return crypto;throw Error('UNEXPECTED_IMPORT:'+n)},Buffer,console,Object,Array,Date,...globals},{timeout:1000});return value.exports;
}
const errors=module(text(newRoot,'packages/shared/src/error-codes.ts'));
const shared={...errors,...module(text(newRoot,'packages/shared/src/fingerprint.ts'),{'./error-codes.js':errors})};
function compileSharedDeclarations(){
 mkdirSync(validation,{recursive:true});
 const opt={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,esModuleInterop:true,skipLibCheck:true,declaration:true,emitDeclarationOnly:true,rootDir:resolve(newRoot,'packages/shared/src'),outDir:resolve(validation,'shared'),typeRoots:[resolve('node_modules/@types')],types:['node']};
 const program=ts.createProgram([resolve(newRoot,'packages/shared/src/index.ts')],opt);
 assert.deepEqual(ts.getPreEmitDiagnostics(program),[]);assert.equal(program.emit().emitSkipped,false);
}
compileSharedDeclarations();
function semantic(root){
 const c=ts.readConfigFile(resolve(root,'apps/server/tsconfig.json'),ts.sys.readFile);
 const parsed=ts.parseJsonConfigFileContent(c.config,ts.sys,resolve(root,'apps/server'));
 const options={...parsed.options,noEmit:true,typeRoots:[resolve('node_modules/@types')]};
 const host=ts.createCompilerHost(options),fixed={'pg':pgTypes,'vitest':vitestTypes,'@msf/shared':resolve(validation,'shared/index.d.ts')};
 host.resolveModuleNames=(names,containing)=>names.map(n=>n in fixed?{resolvedFileName:fixed[n],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,containing,options,host).resolvedModule);
 const program=ts.createProgram(['test-common.ts','targeted-repair.test.ts'].map(p=>resolve(root,domain+p)),options,host);
 return ts.getPreEmitDiagnostics(program).map(d=>({path:d.file?norm(d.file.fileName).replace(norm(root)+'/',''):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code}));
}
test('real PG declarations reproduce exactly the three prior errors and resolve them without suppressions',()=>{
 results.beforeSemantic=semantic(oldRoot);results.afterSemantic=semantic(newRoot);
 assert.deepEqual(results.beforeSemantic.map(d=>d.code).sort(),[2352,2352,2375]);assert.deepEqual(results.afterSemantic,[]);
 const raw=text(newRoot,domain+'targeted-repair.test.ts');assert.ok(!raw.includes('as PoolClient'));assert.ok(!raw.includes('as unknown as'));assert.ok(!raw.includes('@ts-ignore'));
});
function calls(raw,qualify){const source=ts.createSourceFile('source.ts',raw,ts.ScriptTarget.Latest,true);const out=[];function visit(n){if(ts.isCallExpression(n)&&qualify(n,source))out.push(n.getText(source));ts.forEachChild(n,visit)}visit(source);return out;}
test('every original assertion and database query expression remains unchanged',()=>{
 const before=text(oldRoot,domain+'targeted-repair.test.ts'),after=text(newRoot,domain+'targeted-repair.test.ts');
 const assertions=raw=>calls(raw,n=>/^expect\(/.test(n.getText())||/\.to[A-Z]/.test(n.expression.getText()));
 assert.deepEqual(assertions(before),assertions(after));results.originalAssertionExpressions=assertions(before).length;
 const sql=raw=>calls(raw,n=>/client\.query|^q(?:of)?\(/.test(n.expression.getText()));
 assert.deepEqual(sql(text(oldRoot,domain+'test-common.ts')),sql(text(newRoot,domain+'test-common.ts')));
 for(const relative of [domain+'run-lock.ts',domain+'upstream-basis.ts',domain+'truth-gate.integration.test.ts'])assert.equal(text(oldRoot,relative),text(newRoot,relative));
});
function basisReader(root,rows){
 const raw=text(root,domain+'test-common.ts')+'\nexport const __readCurrentBasis=currentFrozenBasis;';
 let index=0;const query=async()=>({rows:rows[index++]});
 const common=module(raw,{'@msf/shared':shared,'../../db/pool.js':{query},'../../db/seq.js':{},'./truth-gate.js':{},'./upstream-basis.js':module(text(root,domain+'upstream-basis.ts'),{'@msf/shared':shared})});
 return common.__readCurrentBasis(null,'project');
}
test('all sixteen absent/present upstream combinations retain legacy JSON fingerprint and failed-closed gate',async()=>{
 const batch={build_snapshot:{build_id:'build',build_fingerprint:'bf'},baseline_snapshot:{baseline_id:'baseline',baseline_fingerprint:'bl'},dev_report_snapshot:{report_id:'report',report_fingerprint:'rf',status:'pass'}};
 const entities=[{id:'build',build_fingerprint:'bf'},{id:'baseline',baseline_fingerprint:'bl',valid:true},{id:'report',selftest_id:'selftest',status:'pass',report_fingerprint:'rf',based_on:{build_fingerprint:'bf',baseline_fingerprint:'bl',selftest_basis:'selftest'}},{id:'selftest',build_id:'build',build_fingerprint:'bf',status:'pass',basis_fingerprint:shared.fingerprint({build:'bf',baseline:'bl'})}];
 const gate=module(text(newRoot,domain+'upstream-basis.ts'),{'@msf/shared':shared});
 for(let mask=0;mask<16;mask++){const rows=entities.map((x,i)=>mask&(1<<i)?[x]:[]).concat([[]]);const before=await basisReader(oldRoot,rows),after=await basisReader(newRoot,rows);
  assert.equal(JSON.stringify(after),JSON.stringify(before));assert.equal(shared.fingerprint(JSON.parse(JSON.stringify(after))),shared.fingerprint(JSON.parse(JSON.stringify(before))));assert.equal(gate.upstreamBasisMatches(after,batch),mask===15);
  for(const [i,key]of ['build','baseline','devReport','selftest'].entries())assert.equal(Object.hasOwn(after,key),!!(mask&(1<<i)));
 }results.returnContractCombinations=16;
});
const raw=text(newRoot,domain+'targeted-repair.test.ts'),source=ts.createSourceFile('targeted.ts',raw,ts.ScriptTarget.Latest,true);
const factory=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='mockPoolClient');assert.ok(factory);
const helper=module(factory.getText(source)+'\nexport {mockPoolClient};',{},{Client,vi:{fn:spy.fn}});
const locks=module(text(newRoot,domain+'run-lock.ts'),{'@msf/shared':shared});
function clientDouble(query){let attempts=0;const saved=net.Socket.prototype.connect;net.Socket.prototype.connect=function(){attempts++;throw Error('UNEXPECTED_LOCAL_DB_CONNECTION')};try{const client=helper.mockPoolClient(query);assert.ok(client instanceof Client);assert.equal(typeof client.on,'function');assert.equal(typeof client.connect,'function');assert.equal(typeof client.release,'function');assert.equal(client.query,query);assert.equal(attempts,0);return client}finally{net.Socket.prototype.connect=saved}}
test('real Client query double preserves the stable batch/run/latest order without connecting',async()=>{
 const sql=[];const query=spy.fn(async text=>{sql.push(text);return {rows:[text.includes('FOR UPDATE OF b')?{id:'batch'}:text.includes('FOR UPDATE')?{id:'run',batch_id:'batch',plan_id:'plan',code:'TR-001'}:{code:'TR-001'}]}});
 const result=await locks.lockLatestRun(clientDouble(query),'project','TR-001');assert.equal(result.run.code,'TR-001');assert.equal(sql.length,3);assert.ok(sql[0].includes('FOR UPDATE OF b'));assert.ok(sql[1].includes('FOR UPDATE'));assert.ok(sql[2].includes('created_at DESC, code DESC, id DESC'));assert.ok(sql.every(s=>s.trim().startsWith('SELECT')));
});
test('real Client query double keeps the existing stale barrier and performs no write',async()=>{
 let grant;const barrier=new Promise(r=>{grant=r});let latest='TR-001';const sql=[];
 const query=spy.fn(async text=>{sql.push(text);if(text.includes('FOR UPDATE OF b')){await barrier;return {rows:[{id:'batch'}]}}if(text.includes('FOR UPDATE'))return {rows:[{id:'run',batch_id:'batch',plan_id:'plan',code:'TR-001'}]};return {rows:[{code:latest}]}});
 const pending=locks.lockLatestRun(clientDouble(query),'project','TR-001');await Promise.resolve();assert.equal(sql.length,1);latest='TR-002';grant();await assert.rejects(pending,e=>e.code==='STALE_EVIDENCE');assert.ok(sql.every(s=>s.trim().startsWith('SELECT')));results.actualLocalClientConstructorCases=2;results.actualDatabaseConnections=0;results.actualDatabaseQueries=0;
});
test('old sources and the exact two-file repair scope remain byte protected',()=>{
 const context=JSON.parse(readFileSync(resolve(newRoot,'../context.json'),'utf8'));
 const before=context.oldSources.r31.manifest;const allowed=new Set(context.allowedSourceFiles);let changed=0;
 for(const row of before){const current=readFileSync(resolve(newRoot,row.path)),old=readFileSync(resolve(oldRoot,row.path));assert.equal(crypto.createHash('sha256').update(old).digest('hex'),row.sha256);if(crypto.createHash('sha256').update(current).digest('hex')!==row.sha256){assert.ok(allowed.has(row.path));changed++}}
 assert.equal(changed,2);results.original625BytesRetained=true;results.exactChangedFiles=2;
 for(const version of ['r29','r30'])for(const row of context.oldSources[version].manifest)assert.equal(crypto.createHash('sha256').update(readFileSync(resolve('.jarvis-dev/workspaces/msf-targets-'+version+'/source',row.path))).digest('hex'),row.sha256);
});
test.after(()=>{console.log('R32_LIMITED_RESULT '+JSON.stringify(results))});
