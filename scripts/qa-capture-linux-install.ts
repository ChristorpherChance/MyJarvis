/** Node 24 native TypeScript. Compiled staged release only; never starts its business data or entrypoint.
 * node scripts/qa-capture-linux-install.ts --compiled --release-root=/staged/release 
 *   --expected-build=20261016-capture-complete-r35 [--report=/new/smoke.json]
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {chmod,lstat,mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const args=process.argv.slice(2),values=new Map<string,string>();
let stage='arguments',directory='',runtime:any,origin='',modelCalls=0,blockedFetches=0,requests=0,cleanupVerified=false;
const nativeFetch=globalThis.fetch,checks:string[]=[],files:any[]=[];
const report:any={schemaVersion:1,kind:'capture-compiled-install-smoke',at:new Date().toISOString(),group:'temporary-compiled-app-sqlite-http-and-offline-static',status:'failed',platform:process.platform,arch:process.arch,node:process.versions.node,linuxExecution:process.platform==='linux',productionAccess:false,businessDataRead:false,piConfigurationRead:false,asrExecuted:false,sourceModulesExecuted:false,checks,files};
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const okay=(value:unknown,name:string)=>{assert.ok(value,name);checks.push(name)};
const record=(path:string,bytes:Buffer)=>{files.push({path,bytes:bytes.length,sha256:sha(bytes)})};
async function publicFile(root:string,path:string){
 assert.ok(!path.includes('\\')&&!path.includes('\0')&&!path.split('/').some(part=>!part||part==='.'||part==='..'),'safe-public-file-path');
 const absolute=join(root,path),info=await lstat(absolute),actual=await realpath(absolute);
 assert.ok(info.isFile()&&!info.isSymbolicLink()&&actual.startsWith(root+sep),'regular-public-file-inside-release');
 assert.ok(info.size>0&&info.size<=16*1024*1024,'bounded-public-file');return readFile(absolute);
}
async function get(path:string){requests++;const response=await fetch(origin+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});return {response,bytes:Buffer.from(await response.arrayBuffer())}}
try{
 for(const arg of args){if(arg==='--compiled'){assert.ok(!values.has('compiled'),'duplicate-compiled');values.set('compiled','true');continue}const match=/^--(release-root|expected-build|report)=(.+)$/.exec(arg);assert.ok(match&&!values.has(match[1]),'explicit-unique-options-only');values.set(match[1],match[2])}
 okay(Number(process.versions.node.split('.')[0])===24,'node24-runtime');
 okay(values.get('compiled')==='true'&&values.has('release-root')&&values.has('expected-build'),'explicit-compiled-release-and-build');
 const expected=values.get('expected-build')!;assert.match(expected,/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/);
 const root=await realpath(resolve(values.get('release-root')!)),web=await realpath(join(root,'apps/web/dist'));
 okay(web.startsWith(root+sep),'compiled-web-within-selected-release');
 if(values.has('report')){try{await lstat(resolve(values.get('report')!));throw Error('report-output-already-exists')}catch(error:any){if(error.code!=='ENOENT')throw error}}
 stage='compiled-files-and-runtime-resources';
 for(const path of ['apps/api/dist/app.js','apps/api/dist/runtime/cluster-runtime.js','apps/api/dist/runtime/offline-draft-sync.js','apps/api/dist/runtime/evidence-assistant.js','apps/api/dist/runtime/evidence-corpus.js','apps/api/resources/skills/jarvis-companion/SKILL.md','apps/api/resources/voice/asr_faster_whisper.py','apps/api/resources/voice/audio_duration.py','apps/api/resources/knowledge-runtime/scan_worker.py','apps/api/resources/inbox-runtime/docx_worker.py','apps/api/resources/inbox-runtime/html_worker.py'])record(path,await publicFile(root,path));
 stage='offline-manifest-and-worker';
 const manifestBytes=await publicFile(root,'apps/web/dist/offline-capture-shell-manifest.json'),workerBytes=await publicFile(root,'apps/web/dist/offline-capture-sw.js');
 record('apps/web/dist/offline-capture-shell-manifest.json',manifestBytes);record('apps/web/dist/offline-capture-sw.js',workerBytes);
 const manifest=JSON.parse(manifestBytes.toString('utf8'));okay(manifest.schema===1&&manifest.scope==='/offline-capture.html'&&Array.isArray(manifest.entries)&&manifest.entries.length>=3&&manifest.entries.length<=32,'offline-manifest-shape');
 const seen=new Set<string>();for(const item of manifest.entries){assert.ok(typeof item.path==='string'&&/^(?:\/offline-capture\.html|\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css))$/.test(item.path)&&!seen.has(item.path)&&/^[a-f0-9]{64}$/.test(item.sha256)&&typeof item.contentType==='string','offline-public-allowlist');seen.add(item.path);const bytes=await publicFile(root,'apps/web/dist'+item.path);assert.equal(sha(bytes),item.sha256,'offline-disk-sha256');record('apps/web/dist'+item.path,bytes)}
 okay(seen.has('/offline-capture.html')&&manifest.entries.some((item:any)=>item.path.endsWith('.js')),'offline-html-and-module-present');
 okay(manifest.version===sha('jarvis-offline-static-v1\n'+JSON.stringify(manifest.entries)),'offline-manifest-version');
 const worker=/const ENTRIES = (\[[\s\S]*?\]);\r?\nconst VERSION = "([a-f0-9]{64})";/.exec(workerBytes.toString('utf8'));
 okay(worker&&worker[2]===manifest.version&&JSON.stringify(JSON.parse(worker[1]))===JSON.stringify(manifest.entries),'offline-worker-matches-manifest');report.offlineManifestVersion=manifest.version;report.offlineManifestEntries=manifest.entries.length;
 stage='private-temporary-instance';directory=await mkdtemp(join(tmpdir(),'jarvis-capture-install-smoke-'));await chmod(directory,0o700);
 // All environment-selectable runtime locations are explicitly inside this new directory.
 globalThis.fetch=async(input:any,init?:any)=>{const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!origin||target.origin!==origin){blockedFetches++;throw Error('non-smoke-fetch-blocked')}return nativeFetch(input,init)};
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},abort:async()=>{},modelIsLocal:()=>true,run:async()=>{modelCalls++;throw Error('models-disabled-in-install-smoke')}};
 const {createApp}=await import(pathToFileURL(join(root,'apps/api/dist/app.js')).href);
 const {PLATFORM_BUILD}=await import(pathToFileURL(join(root,'apps/api/dist/runtime/cluster-runtime.js')).href);
 okay(PLATFORM_BUILD===expected,'compiled-runtime-build');
 const offline=await import(pathToFileURL(join(root,'apps/api/dist/runtime/offline-draft-sync.js')).href),evidence=await import(pathToFileURL(join(root,'apps/api/dist/runtime/evidence-assistant.js')).href),corpus=await import(pathToFileURL(join(root,'apps/api/dist/runtime/evidence-corpus.js')).href);
 okay(typeof offline.registerOfflineDraftSync==='function'&&typeof evidence.registerEvidenceAssistantRoutes==='function'&&typeof corpus.authorizedEvidence==='function','new-compiled-runtime-exports-resolve');
 runtime=await createApp({dataDir:directory,pi,webDir:web,pythonExecutable:join(directory,'no-python-configured'),whisperModelDirectory:join(directory,'no-model-configured'),allowedHosts:['127.0.0.1'],nodeConfiguration:null,healthInstanceId:randomUUID(),remoteOperations:{queue:join(directory,'remote-queue'),configPath:join(directory,'unconfigured-remote-policy.json')}});
 await runtime.app.listen({host:'127.0.0.1',port:0});origin='http://127.0.0.1:'+runtime.app.server.address().port;
 stage='compiled-health-and-auth-http';
 const health=await get('/api/health'),value=JSON.parse(health.bytes.toString('utf8'));okay(health.response.status===200&&value.status==='ok'&&value.build===expected,'real-http-health-build');report.build=value.build;report.runtimeBuild=value.build;
 for(const path of ['/api/bootstrap','/api/runtime/offline-draft-sync','/api/runtime/evidence-assistant/status?domain=knowledge','/api/runtime/evidence-assistant/status?domain=memory']){const reply=await get(path);assert.equal(reply.response.status,401,'anonymous-private-route-rejected');assert.ok(JSON.parse(reply.bytes.toString('utf8')),'private-route-json-error')}
 checks.push('anonymous-private-routes-401');
 stage='sqlite-schema-and-integrity';const db=new DatabaseSync(join(directory,'jarvis.db'),{readOnly:true});try{for(const table of ['runtime_offline_draft_sync','runtime_offline_draft_sync_receipts','runtime_member_credentials'])assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table),'new-runtime-sqlite-table');assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok','sqlite-integrity')}finally{db.close()}checks.push('real-temporary-sqlite-schema-and-integrity');
 stage='offline-static-real-http';
 for(const [path,bytes] of [['/offline-capture-shell-manifest.json',manifestBytes],['/offline-capture-sw.js',workerBytes]] as const){const reply=await get(path);assert.equal(reply.response.status,200,'offline-metadata-http200');assert.equal(sha(reply.bytes),sha(bytes),'offline-metadata-http-sha256')}
 report.staticHttpTypes=[];for(const item of manifest.entries){const reply=await get(item.path);assert.equal(reply.response.status,200,'offline-static-http200');assert.equal(sha(reply.bytes),item.sha256,'offline-static-http-sha256');const actual=(reply.response.headers.get('content-type')||'').split(';')[0],expectedType=item.contentType.split(';')[0];assert.ok(actual===expectedType||item.path.endsWith('.js')&&expectedType==='text/javascript'&&actual==='application/javascript','offline-static-content-type');report.staticHttpTypes.push({path:item.path,contentType:actual})}
 checks.push('offline-html-worker-manifest-and-every-asset-http-sha256');okay(modelCalls===0&&blockedFetches===0,'no-model-or-outside-fetch-attempts');report.status='passed';
}catch(error:any){process.exitCode=1;report.failedStage=stage;report.failure=error?.code==='ERR_ASSERTION'?'assertion-failed':typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'smoke-check-failed';report.errorName=/^[A-Za-z]+$/.test(error?.name||'')?error.name:'Error'}
finally{
 try{if(runtime)await runtime.app.close()}catch{process.exitCode=1;report.status='failed';report.closeFailed=true}
 globalThis.fetch=nativeFetch;
 try{if(directory){const target=resolve(directory);assert.ok(dirname(target)===resolve(tmpdir())&&relative(resolve(tmpdir()),target).startsWith('jarvis-capture-install-smoke-'),'owned-temporary-cleanup-only');await rm(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});try{await lstat(target);throw Error('temporary-cleanup-incomplete')}catch(error:any){if(error.code!=='ENOENT')throw error}}cleanupVerified=true}catch{process.exitCode=1;report.status='failed';report.cleanupFailed=true}
 Object.assign(report,{modelCalls,blockedFetchAttempts:blockedFetches,httpRequests:requests,cleanupVerified,privateTemporaryDirectory:!!directory,linuxQualification:process.platform==='linux'?'this-staged-compiled-installation-only':'not-linux-evidence',boundaries:['Temporary loopback app only; selected release entrypoint and business services not started','No business data, Pi configuration, credentials, model or ASR invocation','Nonexistent temporary Python path disables OCR health execution; Python/model availability is not verified','This is dependency/startup/static integrity smoke, not browser, audio, model quality, restore or production acceptance']});
 if(values.has('report'))try{const path=resolve(values.get('report')!);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})}catch{process.exitCode=1;report.status='failed';report.reportWriteFailed=true}
 console.log(JSON.stringify(report));
}
