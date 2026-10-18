import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,copyFile,utimes,rename,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),python=process.env.JARVIS_PACKAGE_PYTHON||'python';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Explicit previous-package input for these existing fixtures. This does not
// weaken or rerun their original assertions; the new inheritance group is separate.
function fixturePreviousPackage(temporary){
 const path=join(temporary,'owned-previous.zip'),program=String.raw`import sys,json,stat,hashlib
from zipfile import ZipFile,ZipInfo
p=sys.argv[1];content=b'export const previousOwned = true;';name='apps/web/dist/assets/previous-owned.js'
m={'schema':1,'archiveVersion':'owned-previous','runtimeBuild':'owned-previous','sourceCommit':'a'*40,'files':[{'path':name,'size':len(content),'sha256':hashlib.sha256(content).hexdigest(),'mode':420}]}
with ZipFile(p,'x') as z:
 for n,b in [(name,content),('release-manifest.json',json.dumps(m).encode())]:
  i=ZipInfo(n);i.create_system=3;i.external_attr=(stat.S_IFREG|420)<<16;z.writestr(i,b)
print(hashlib.sha256(open(p,'rb').read()).hexdigest()+':'+p)
`;
 const result=spawnSync(python,['-c',program,path],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim();
}
test('local package fixture verifies ZIP and rejects stale, changed, corrupt, linked and existing inputs',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'jarvis-package-capture-fixture-')),directory=join(temporary,'repo');await mkdir(directory);
 const write=async(name,value)=>{const file=join(directory,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,value)};
 const git=args=>{const result=spawnSync('git',['-c','core.autocrlf=false','-c','core.hooksPath='+join(temporary,'no-hooks'),'-c','commit.gpgsign=false',...args],{cwd:directory,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim()};
 let cases=0;
 try{
  const sources={'package.json':'{"type":"module","workspaces":["apps/*"]}','package-lock.json':'{"lockfileVersion":3}','.gitattributes':'* -text\n','.gitignore':'apps/*/dist/\nnode_modules/\n.jarvis/\n','README.md':'Owned package fixture.','apps/api/package.json':'{"name":"fixture-api"}','apps/api/tsconfig.json':'{}','apps/api/src/index.ts':'export const fixture = true;\n','apps/api/src/runtime/cluster-runtime.ts':"export const PLATFORM_BUILD = 'fixture-runtime';\n",'apps/api/resources/voice/asr_faster_whisper.py':'# Owned source fixture; never executed.\n','apps/web/package.json':'{"name":"fixture-web"}','apps/web/tsconfig.json':'{}','apps/web/vite.config.ts':"import './build/offline-shell';\n",'apps/web/index.html':'<div id="root"></div>','apps/web/offline-capture.html':'<div id="offline"></div>','apps/web/build/offline-shell.ts':'export const fixture = true;\n','apps/web/src/main.tsx':'export const fixture = true;\n','scripts/promote-web.mjs':'// Owned source fixture.\n','scripts/node-observer.mjs':'// Owned source fixture.\n','docs/openapi-v1-planned.json':'{}','.env':'OWNED_FAKE_PRIVATE_DO_NOT_PACKAGE\n'};
  for(const [path,value]of Object.entries(sources))await write(path,value);
  await copyFile(join(root,'scripts/package-capture-release.mjs'),join(directory,'scripts/package-capture-release.mjs'));
  await copyFile(join(root,'scripts/release-web-assets.py'),join(directory,'scripts/release-web-assets.py'));const previous=fixturePreviousPackage(temporary);
  git(['init','--quiet']);git(['config','user.name','Owned fixture']);git(['config','user.email','fixture@example.invalid']);git(['add','.']);git(['commit','--quiet','-m','Owned packaging fixture']);const commit=git(['rev-parse','HEAD']);
  const api=join(directory,'apps/api/dist'),web=join(directory,'apps/web/dist');
  await write('apps/api/dist/index.js','export const fixture = true;\n');await write('apps/api/dist/index.js.map',JSON.stringify({version:3,sources:['../src/index.ts']}));
  await write('apps/api/dist/runtime/cluster-runtime.js',"export const PLATFORM_BUILD = 'fixture-runtime';\n");await write('apps/api/dist/runtime/cluster-runtime.js.map',JSON.stringify({version:3,sources:['../../src/runtime/cluster-runtime.ts']}));
  await write('apps/web/dist/assets/fixture.js','export const offlineFixture = true;\n');await write('apps/web/dist/assets/fixture.css','body{color:#123}\n');
  const html='<script type="module" src="/assets/fixture.js"></script><link href="/assets/fixture.css" rel="stylesheet">';await write('apps/web/dist/index.html',html);await write('apps/web/dist/offline-capture.html',html);
  const entries=[['/assets/fixture.js','text/javascript; charset=utf-8'],['/assets/fixture.css','text/css; charset=utf-8'],['/offline-capture.html','text/html; charset=utf-8']].map(([path,contentType])=>({path,sha256:hash(path.endsWith('.js')?'export const offlineFixture = true;\n':path.endsWith('.css')?'body{color:#123}\n':html),contentType}));
  const manifest={schema:1,version:hash('jarvis-offline-static-v1\n'+JSON.stringify(entries)),scope:'/offline-capture.html',entries};await write('apps/web/dist/offline-capture-shell-manifest.json',JSON.stringify(manifest));await write('apps/web/dist/offline-capture-sw.js','const ENTRIES = '+JSON.stringify(entries)+';\nconst VERSION = "'+manifest.version+'";\n');
  await write('node_modules/owned-secret.txt','MUST_NOT_PACKAGE');await write('.jarvis/owned-secret.txt','MUST_NOT_PACKAGE');
  const run=output=>spawnSync(process.execPath,[join(directory,'scripts/package-capture-release.mjs'),'--version=fixture-archive','--source-commit='+commit,'--api-dist='+api,'--web-dist='+web,'--output='+output,'--previous-package='+previous],{cwd:directory,env:{...process.env,JARVIS_PACKAGE_PYTHON:python},encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
  const output=join(temporary,'valid');let result=run(output);assert.equal(result.status,0,result.stderr);const metadata=JSON.parse(await readFile(join(output,'release-manifest.json'),'utf8'));assert.equal(metadata.archiveVersion,'fixture-archive');assert.equal(metadata.runtimeBuild,'fixture-runtime');assert.equal(metadata.sourceCommit,commit);assert.ok(metadata.files.some(item=>item.path==='apps/web/offline-capture.html'));assert.ok(metadata.files.some(item=>item.path==='apps/web/build/offline-shell.ts'));assert.ok(metadata.files.some(item=>item.path==='apps/api/resources/voice/asr_faster_whisper.py'));assert.equal(metadata.files.some(item=>item.path==='.env'||item.path.includes('node_modules')||item.path.includes('.jarvis/')),false);const zip=await readFile(join(output,'fixture-archive.zip')),fingerprint=hash(zip);assert.ok((await readFile(join(output,'fixture-archive.zip.sha256'),'utf8')).startsWith(fingerprint));assert.equal(spawnSync(python,['-m','zipfile','-t',join(output,'fixture-archive.zip')],{encoding:'utf8',windowsHide:true}).status,0);cases++;
  result=run(output);assert.notEqual(result.status,0);assert.match(result.stderr,/Output already exists/);assert.equal(hash(await readFile(join(output,'fixture-archive.zip'))),fingerprint);cases++;
  const offline=join(web,'offline-capture.html'),old=new Date(1000);await utimes(offline,old,old);result=run(join(temporary,'stale'));assert.notEqual(result.status,0);assert.match(result.stderr,/older than committed source/);await utimes(offline,new Date(),new Date());cases++;
  await write('apps/web/dist/assets/fixture.js','CORRUPT OWNED FIXTURE');result=run(join(temporary,'corrupt'));assert.notEqual(result.status,0);assert.match(result.stderr,/manifest fingerprint mismatch/);await write('apps/web/dist/assets/fixture.js','export const offlineFixture = true;\n');cases++;
  const assets=join(web,'assets'),realAssets=join(web,'owned-assets');await rename(assets,realAssets);await symlink(realAssets,assets,process.platform==='win32'?'junction':'dir');result=run(join(temporary,'linked'));assert.notEqual(result.status,0);assert.match(result.stderr,/Symlink compiled input refused/);await unlink(assets);await rename(realAssets,assets);cases++;
  await write('apps/api/src/index.ts','export const UNCOMMITTED = true;\n');result=run(join(temporary,'dirty'));assert.notEqual(result.status,0);assert.match(result.stderr,/Tracked bytes differ from source commit/);cases++;
  console.log(JSON.stringify({fixtureCases:cases,allPassed:true,syntheticRepositoryOnly:true,realSourceBuild:false,network:false,productionAccess:false}));
 }finally{const absolute=resolve(temporary);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-package-capture-fixture-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
});

// These two review corrections have their own isolated fixtures and names, so
// they can run without repeating the six already recorded original cases.
async function correctionFixture(runCase){
 const temporary=await mkdtemp(join(tmpdir(),'jarvis-package-correction-fixture-')),directory=join(temporary,'repo');await mkdir(directory);
 const write=async(name,value)=>{const path=join(directory,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,value)};
 const git=args=>{const result=spawnSync('git',['-c','core.autocrlf=false','-c','core.hooksPath='+join(temporary,'no-hooks'),'-c','commit.gpgsign=false',...args],{cwd:directory,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim()};
 try{
  for(const [path,value]of Object.entries({'package.json':'{"type":"module"}','package-lock.json':'{}','.gitattributes':'* -text\n','.gitignore':'apps/*/dist/\n','apps/api/package.json':'{}','apps/api/tsconfig.json':'{}','apps/api/src/index.ts':'export const owned = true;\n','apps/api/src/runtime/cluster-runtime.ts':"export const PLATFORM_BUILD = 'owned-runtime';\n",'apps/api/resources/voice/asr_faster_whisper.py':'# Owned synthetic resource.\n','apps/web/package.json':'{}','apps/web/tsconfig.json':'{}','apps/web/vite.config.ts':'export default {};\n','apps/web/index.html':'<div/>','apps/web/offline-capture.html':'<div/>','apps/web/build/offline-shell.ts':'export const owned = true;\n','scripts/promote-web.mjs':'// owned\n','scripts/node-observer.mjs':'// owned\n','docs/openapi-v1-planned.json':'{}'}))await write(path,value);
  await copyFile(join(root,'scripts/package-capture-release.mjs'),join(directory,'scripts/package-capture-release.mjs'));await copyFile(join(root,'scripts/release-web-assets.py'),join(directory,'scripts/release-web-assets.py'));const previous=fixturePreviousPackage(temporary);git(['init','--quiet']);git(['config','user.name','Owned correction fixture']);git(['config','user.email','fixture@example.invalid']);git(['add','.']);git(['commit','--quiet','-m','Owned review correction fixture']);const commit=git(['rev-parse','HEAD']);
  const api=join(directory,'apps/api/dist'),web=join(directory,'apps/web/dist');
  await write('apps/api/dist/index.js','export const owned = true;\n');await write('apps/api/dist/index.js.map',JSON.stringify({version:3,sources:['../src/index.ts']}));await write('apps/api/dist/runtime/cluster-runtime.js',"export const PLATFORM_BUILD = 'owned-runtime';\n");await write('apps/api/dist/runtime/cluster-runtime.js.map',JSON.stringify({version:3,sources:['../../src/runtime/cluster-runtime.ts']}));
  const js='export const owned = true;\n',css='body{color:#123}',html='<script type="module" src="/assets/owned.js"></script><link href="/assets/owned.css" rel="stylesheet">';await write('apps/web/dist/assets/owned.js',js);await write('apps/web/dist/assets/owned.css',css);await write('apps/web/dist/index.html',html);await write('apps/web/dist/offline-capture.html',html);
  const entries=[{path:'/assets/owned.js',sha256:hash(js),contentType:'text/javascript; charset=utf-8'},{path:'/assets/owned.css',sha256:hash(css),contentType:'text/css; charset=utf-8'},{path:'/offline-capture.html',sha256:hash(html),contentType:'text/html; charset=utf-8'}];
  const manifest=async items=>{const value={schema:1,version:hash('jarvis-offline-static-v1\n'+JSON.stringify(items)),scope:'/offline-capture.html',entries:items};await write('apps/web/dist/offline-capture-shell-manifest.json',JSON.stringify(value));await write('apps/web/dist/offline-capture-sw.js','const ENTRIES = '+JSON.stringify(items)+';\nconst VERSION = "'+value.version+'";\n')};await manifest(entries);
  let number=0;const run=()=>spawnSync(process.execPath,[join(directory,'scripts/package-capture-release.mjs'),'--version=owned-candidate','--source-commit='+commit,'--api-dist='+api,'--web-dist='+web,'--output='+join(temporary,'rejected-'+number++),'--previous-package='+previous],{cwd:directory,env:{...process.env,JARVIS_PACKAGE_PYTHON:python},encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
  await runCase({temporary,directory,web,write,git,run,entries,manifest});
 }finally{const absolute=resolve(temporary);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-package-correction-fixture-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
}
test('corrected admission: media/model/runtime extensions and mixed-case private directories are refused',async()=>{
 await correctionFixture(async({web,write,run})=>{let rejected=0;for(const extension of ['wav','webm','mp3','mp4','bin','onnx','sqlite']){const name='owned-disallowed.'+extension;await write('apps/web/dist/'+name,'Owned synthetic disallowed bytes');const result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Unsupported compiled file type|Private or unsafe compiled filename/);await unlink(join(web,name));rejected++;}await write('apps/web/dist/Node_Modules/owned.js','export const owned = true;');const result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Private or unsafe compiled filename/);rejected++;console.log(JSON.stringify({newGroup:'type-admission',rejectedVariants:rejected,oldSixCasesRerun:false,syntheticOnly:true}))});
});
test('corrected precache: an HTML module present in dist but absent from manifest is refused',async()=>{
 await correctionFixture(async({write,run,entries,manifest})=>{const other='export const other = true;\n';await write('apps/web/dist/assets/other.js',other);await manifest([{path:'/assets/other.js',sha256:hash(other),contentType:'text/javascript; charset=utf-8'},entries[1],entries[2]]);const result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Offline dependency is missing from precache manifest/);console.log(JSON.stringify({newGroup:'offline-precache-closure',rejectedVariants:1,allOtherHashesAndWorkerMatched:true,oldSixCasesRerun:false,syntheticOnly:true}))});
});
