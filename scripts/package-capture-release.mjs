/** Local candidate packaging only: no build, install, network, SSH, or service operation. */
import {readFile,writeFile,mkdir,lstat,readdir,copyFile,rm,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join,sep,isAbsolute,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),execute=promisify(execFile);
const fail=message=>{throw Error(message)},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(base,path)=>path===base||path.startsWith(base+sep);
const options={},previousPackages=[];
for(const arg of process.argv.slice(2)){const match=/^--(version|source-commit|api-dist|web-dist|output|previous-package)=(.+)$/.exec(arg);if(!match)fail('Use explicit packaging options; --previous-package=<SHA256>:<ZIP> may repeat.');if(match[1]==='previous-package'){if(!/^[a-f0-9]{64}:.+$/.test(match[2]))fail('Use --previous-package=<SHA256>:<ZIP>');previousPackages.push(match[2]);}else{if(options[match[1]])fail('Duplicate packaging option');options[match[1]]=match[2]}}
for(const key of ['version','source-commit','api-dist','web-dist','output'])if(!options[key])fail('Missing --'+key);
if(!previousPackages.length)fail('At least one explicit --previous-package=<SHA256>:<ZIP> is required; no implicit initial-release exemption.');
if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(options.version))fail('Invalid explicit release version');
if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(options['source-commit']))fail('Use a full source commit hash');
const version=options.version,commit=options['source-commit'],apiDist=resolve(options['api-dist']),webDist=resolve(options['web-dist']),output=resolve(options.output);
const python=process.env.JARVIS_PACKAGE_PYTHON||'python';
const deniedParts=new Set(['.git','node_modules','.jarvis','.jarvis-dev','.secrets','secrets','credentials','.deployment','.maintenance','.runtime-venv','serverinfo','backups']);
function safeRelative(path){
 if(typeof path!=='string'||!path||path.includes('\\')||path.includes('\0')||isAbsolute(path)||path.split('/').some(part=>!part||part==='.'||part==='..'||deniedParts.has(part.toLowerCase())))return false;
 const name=path.split('/').at(-1);return !/^\.env(?:\.|$)/i.test(name)&&!/(?:\.pem|\.key|\.p12|\.pfx|\.sqlite3?|\.db(?:-wal|-shm)?)$/i.test(name)&&!/(?:^|[-_.])(?:credentials|secrets|passwords|tokens)(?:[-_.]|$)/i.test(name);
}
const sourceDirectories=['apps/api/src/','apps/api/resources/','apps/api/test/','apps/web/src/','apps/web/public/','apps/web/build/','apps/agent/src/','scripts/','docs/'];
const sourceFiles=new Set(['.gitattributes','.gitignore','package.json','package-lock.json','README.md','apps/api/package.json','apps/api/tsconfig.json','apps/web/package.json','apps/web/tsconfig.json','apps/web/vite.config.ts','apps/web/index.html','apps/web/offline-capture.html','apps/agent/package.json','apps/agent/tsconfig.json','apps/agent/config.example.json']);
const textExtensions=new Set(['.cjs','.css','.html','.js','.json','.md','.mjs','.ps1','.py','.sh','.ts','.tsx','.txt']);
const publicZipPath='apps/web/public/downloads/jarvis-development-node.zip',publicZipSha256='cc59db4c958d805011d4e29e8c36b6e365b773ebc68fd06c64f69ef3a95f1c69';
const extension=path=>posix.extname(path).toLowerCase();
const sourceScope=path=>(sourceFiles.has(path)||sourceDirectories.some(prefix=>path.startsWith(prefix)))&&!path.startsWith('docs/版本记录/')&&!path.startsWith('docs/建设记录/');
const sourceType=path=>textExtensions.has(extension(path))||['.gitattributes','.gitignore'].includes(path)||/^apps\/web\/public\/themes\/previews\/[a-z-]+\.jpg$/.test(path)||path===publicZipPath;
const allowedSource=path=>safeRelative(path)&&sourceScope(path)&&sourceType(path);
const requiredSources=['package.json','package-lock.json','apps/api/package.json','apps/api/tsconfig.json','apps/api/src/index.ts','apps/api/src/runtime/cluster-runtime.ts','apps/api/resources/voice/asr_faster_whisper.py','apps/web/package.json','apps/web/tsconfig.json','apps/web/vite.config.ts','apps/web/index.html','apps/web/offline-capture.html','apps/web/build/offline-shell.ts','scripts/promote-web.mjs','scripts/node-observer.mjs','scripts/release-web-assets.py','docs/openapi-v1-planned.json'];
async function noLinks(path,allowMissing=false){
 const absolute=resolve(path),parts=absolute.slice(resolve(absolute,sep).length).split(sep).filter(Boolean);let cursor=resolve(absolute,sep);
 for(const part of parts){cursor=join(cursor,part);let info;try{info=await lstat(cursor)}catch(error){if(allowMissing&&error.code==='ENOENT')return;throw error}if(info.isSymbolicLink())fail('Symlink input/output boundary refused');}
}
const git=async args=>(await execute('git',['--no-optional-locks','-c','core.quotePath=false',...args],{cwd:root,windowsHide:true,maxBuffer:64*1024*1024,encoding:'utf8',timeout:30000})).stdout;
async function trackedSnapshot(){
 const selected=(await git(['rev-parse','--verify',commit+'^{commit}'])).trim();if(selected!==commit)fail('Source commit resolution differs');
 const format=(await git(['rev-parse','--show-object-format'])).trim();if(!['sha1','sha256'].includes(format))fail('Unsupported Git object format');
 const entries=(await git(['ls-tree','-r','-z','--full-tree',commit])).split('\0').filter(Boolean).map(entry=>{const match=/^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);if(!match)fail('Source commit contains a linked or unsupported tracked entry');return {mode:match[1]==='100755'?0o755:0o644,oid:match[2],path:match[3]}});
 const index=(await git(['ls-files','-z'])).split('\0').filter(Boolean).sort(),expected=entries.map(item=>item.path).sort();if(JSON.stringify(index)!==JSON.stringify(expected))fail('Tracked path set differs from source commit');
 const source=[];
 for(const entry of entries){if(entry.path.includes('\\')||entry.path.split('/').some(part=>part==='..'||!part))fail('Unsafe tracked path');const path=join(root,entry.path);await noLinks(path);const info=await lstat(path);if(!info.isFile())fail('Tracked regular file is missing: '+entry.path);const bytes=await readFile(path),oid=createHash(format).update('blob '+bytes.length+'\0').update(bytes).digest('hex');if(oid!==entry.oid)fail('Tracked bytes differ from source commit: '+entry.path);if(sourceScope(entry.path)&&safeRelative(entry.path)&&!sourceType(entry.path))fail('Unsupported source file type; media/models/runtime data are not admitted: '+entry.path);if(allowedSource(entry.path)){if(entry.path===publicZipPath&&sha(bytes)!==publicZipSha256)fail('Reviewed public download archive fingerprint differs');source.push({...entry,absolute:path,size:bytes.length,sha256:sha(bytes),mtimeMs:info.mtimeMs});}}
 for(const name of requiredSources)if(!source.some(item=>item.path===name))fail('Required committed source missing: '+name);
 const untracked=(await git(['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean);if(untracked.some(path=>sourceScope(path)&&safeRelative(path)))fail('Uncommitted source exists inside package source scope');
 return source;
}
async function runtimeFiles(directory,prefix,source){await noLinks(directory);if(!(await lstat(directory)).isDirectory())fail('Compiled input must be a directory');const files=[],publicSource=new Map(source.filter(item=>item.path.startsWith('apps/web/public/')).map(item=>[item.path.slice('apps/web/public/'.length),item]));async function walk(path,relativePath=''){for(const entry of await readdir(path,{withFileTypes:true})){const name=relativePath?relativePath+'/'+entry.name:entry.name,absolute=join(path,entry.name);if(!safeRelative(name))fail('Private or unsafe compiled filename refused');const info=await lstat(absolute);if(info.isSymbolicLink())fail('Symlink compiled input refused');if(info.isDirectory())await walk(absolute,name);else if(info.isFile()){const ext=extension(name),text=prefix==='apps/api/dist'?['.js','.map'].includes(ext):['.js','.css','.html','.json'].includes(ext),asset=prefix==='apps/web/dist'&&(ext==='.jpg'||name==='downloads/jarvis-development-node.zip')?publicSource.get(name):undefined;if(!text&&!asset)fail('Unsupported compiled file type; media/models/runtime data are not admitted');const bytes=await readFile(absolute),fingerprint=sha(bytes);if(asset&&fingerprint!==asset.sha256)fail('Compiled public asset differs from committed source');files.push({path:prefix+'/'+name,absolute,size:bytes.length,sha256:fingerprint,mode:0o644,mtimeMs:info.mtimeMs})}else fail('Unsupported compiled input type')}}await walk(directory);if(!files.length)fail('Compiled input is empty');return files}
async function validateBuilds(source,apiFiles,webFiles){
 const sourceBuild=await readFile(join(root,'apps/api/src/runtime/cluster-runtime.ts'),'utf8'),compiledBuild=await readFile(join(apiDist,'runtime/cluster-runtime.js'),'utf8');
 const releasePattern=/\bPLATFORM_BUILD\s*=\s*['"]([^'"]+)['"]/;const runtimeBuild=releasePattern.exec(sourceBuild)?.[1];if(!runtimeBuild||releasePattern.exec(compiledBuild)?.[1]!==runtimeBuild)fail('Source and compiled API runtime identity differ');
 const apiByPath=new Map(apiFiles.map(item=>[item.path,item]));if(!apiByPath.has('apps/api/dist/index.js'))fail('Compiled API entry missing');
 for(const item of source.filter(item=>item.path.startsWith('apps/api/src/')&&item.path.endsWith('.ts')&&!item.path.endsWith('.d.ts'))){const tail=item.path.slice('apps/api/src/'.length).replace(/\.ts$/,'.js'),compiled=apiByPath.get('apps/api/dist/'+tail),map=apiByPath.get('apps/api/dist/'+tail+'.map');if(!compiled||!map||compiled.mtimeMs+2<item.mtimeMs||map.mtimeMs+2<item.mtimeMs)fail('Compiled API is missing or older than committed source: '+item.path);let sourcemap;try{sourcemap=JSON.parse(await readFile(map.absolute,'utf8'))}catch{fail('Compiled API source map invalid')}if(!Array.isArray(sourcemap.sources)||!sourcemap.sources.some(name=>typeof name==='string'&&resolve(dirname(map.absolute),sourcemap.sourceRoot||'',name)===item.absolute))fail('Compiled API source map does not reference committed source: '+item.path);}
 const webByPath=new Map(webFiles.map(item=>[item.path.slice('apps/web/dist/'.length),item])),required=['index.html','offline-capture.html','offline-capture-sw.js','offline-capture-shell-manifest.json'];
 const newest=Math.max(...source.filter(item=>item.path.startsWith('apps/web/')||['package.json','package-lock.json'].includes(item.path)).map(item=>item.mtimeMs));
 for(const name of required){const item=webByPath.get(name);if(!item||item.mtimeMs+2<newest)fail('Compiled web entry missing or older than committed source: '+name);}
 let manifest;try{manifest=JSON.parse(await readFile(join(webDist,'offline-capture-shell-manifest.json'),'utf8'))}catch{fail('Offline shell manifest invalid')}
 if(manifest.schema!==1||manifest.scope!=='/offline-capture.html'||!Array.isArray(manifest.entries)||manifest.entries.length<3)fail('Offline shell manifest shape invalid');
 const seen=new Set();for(const entry of manifest.entries){if(!entry||typeof entry.path!=='string'||!entry.path.startsWith('/')||entry.path.includes('?')||entry.path.includes('#')||!safeRelative(entry.path.slice(1))||!(entry.path==='/offline-capture.html'||entry.path.startsWith('/assets/'))||seen.has(entry.path)||!/^([a-f0-9]{64})$/.test(entry.sha256)||typeof entry.contentType!=='string')fail('Offline shell manifest allowlist invalid');seen.add(entry.path);const file=webByPath.get(entry.path.slice(1));if(!file||file.sha256!==entry.sha256)fail('Offline shell manifest fingerprint mismatch');}
 if(!seen.has('/offline-capture.html')||!manifest.entries.some(item=>item.path.endsWith('.js')))fail('Offline shell entry dependency missing');
 if(manifest.version!==sha('jarvis-offline-static-v1\n'+JSON.stringify(manifest.entries)))fail('Offline shell manifest version differs');
 const worker=await readFile(join(webDist,'offline-capture-sw.js'),'utf8'),workerEntries=/const ENTRIES = (\[[\s\S]*?\]);\r?\nconst VERSION = "([a-f0-9]{64})";/.exec(worker);if(!workerEntries||workerEntries[2]!==manifest.version||JSON.stringify(JSON.parse(workerEntries[1]))!==JSON.stringify(manifest.entries))fail('Offline worker and current manifest differ');
 const dependency=(owner,target)=>{if(target.startsWith('data:'))return;if(!target||target.includes('?')||target.includes('#')||target.includes('\\')||/^[a-z]+:/i.test(target))fail('Offline dependency is outside the admitted build graph');const path=target.startsWith('/')?target:'/'+posix.normalize(posix.join(posix.dirname(owner.slice(1)),target));if(!path.startsWith('/assets/')||!seen.has(path))fail('Offline dependency is missing from precache manifest');};
 for(const name of ['index.html','offline-capture.html']){const html=await readFile(join(webDist,name),'utf8');for(const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)){if(!webByPath.has(match[1]))fail('HTML references a missing compiled asset');if(name==='offline-capture.html')dependency('/'+name,'/'+match[1]);}}
 // The current Vite shell emits local static module specifiers, literal import(),
 // and CSS url/@import references. Validate this finite emitted graph, not arbitrary JS.
 for(const entry of manifest.entries){const ext=extension(entry.path);if(ext!=='.js'&&ext!=='.css')continue;const content=await readFile(webByPath.get(entry.path.slice(1)).absolute,'utf8');if(ext==='.js'){for(const match of content.matchAll(/(?:^|[;\n])\s*(?:import|export)\s*(?:\{[^}]*\}|\*\s*as\s*[\w$]+|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s*from\s*["']([^"']+)["']|(?:^|[;\n])\s*import\s*["']([^"']+)["']/g))dependency(entry.path,match[1]||match[2]);for(const match of content.matchAll(/\bimport\s*\(([^)]*)\)/g)){const literal=/^\s*(["'])([^"']+)\1\s*$/.exec(match[1]);if(!literal)fail('Unsupported nonliteral offline module dependency');dependency(entry.path,literal[2]);}}else{for(const match of content.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)|@import\s*["']([^"']+)["']/g))dependency(entry.path,match[1]||match[2]);}}
 return {runtimeBuild,apiSourceMapsVerified:true,buildMtimesChecked:true,offlineDependencyClosure:'current-vite-local-static-literal-import-and-css-references',offlineManifestVersion:manifest.version,offlineManifestEntries:manifest.entries.length,offlineEntrySha256:webByPath.get('offline-capture.html').sha256,offlineWorkerSha256:webByPath.get('offline-capture-sw.js').sha256};
}
const zipProgram=String.raw`import sys,json,hashlib,stat
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
payload=Path(sys.argv[1]);manifest_path=Path(sys.argv[2]);archive=Path(sys.argv[3])
manifest_bytes=manifest_path.read_bytes();manifest=json.loads(manifest_bytes)
with ZipFile(archive,'x',compression=ZIP_DEFLATED,compresslevel=6) as z:
 for item in manifest['files']:
  p=payload/item['path'];s=p.lstat()
  if not stat.S_ISREG(s.st_mode) or p.is_symlink():raise RuntimeError('PACKAGE_FILE_TYPE_CHANGED')
  data=p.read_bytes()
  if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('PACKAGE_FILE_BYTES_CHANGED')
  info=ZipInfo(item['path'],date_time=(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.create_system=3;info.external_attr=(stat.S_IFREG|item['mode'])<<16;z.writestr(info,data)
 info=ZipInfo('release-manifest.json',date_time=(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.create_system=3;info.external_attr=(stat.S_IFREG|0o644)<<16;z.writestr(info,manifest_bytes)
with ZipFile(archive,'r') as z:
 expected=[item['path'] for item in manifest['files']]+['release-manifest.json']
 if sorted(z.namelist())!=sorted(expected) or z.testzip() is not None:raise RuntimeError('ZIP_INVENTORY_INVALID')
 for item in manifest['files']:
  data=z.read(item['path'])
  if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('ZIP_FINGERPRINT_INVALID')
  info=z.getinfo(item['path'])
  if info.create_system!=3 or (info.external_attr>>16)&0o777!=item['mode']:raise RuntimeError('ZIP_UNIX_MODE_INVALID')
 if z.read('release-manifest.json')!=manifest_bytes:raise RuntimeError('ZIP_MANIFEST_INVALID')
print(json.dumps({'zipVerified':True,'files':len(expected)}))
`;
const makeReadme=runtimeBuild=>`# Jarvis Linux candidate ${version}\n\nArchive version: ${version}\nSelected runtime build: ${runtimeBuild}\nSource commit: ${commit}\n\nThis is a local candidate archive. Linux has not been installed or started by this packager. It is not production acceptance. Archive version and runtime build are recorded separately. A managed release requires both to match the selected release and separately verified installation, recovery and health evidence. This archive does not itself perform deployment. It contains committed public source, explicitly selected compiled API/web files and API runtime resources. release-manifest.json records every payload file size and SHA-256; the manifest excludes itself. The adjacent ZIP.sha256 binds the whole archive.\n\nLinux needs the compatible Node runtime and its own dependency installation (npm ci using the lockfile, or an already verified matching dependency set). A source rebuild uses npm run build. These commands are not executed by this packager. Existing HTTPS certificates, node role/configuration, credentials, private databases, node_modules and voice models are not included. Python voice/OCR dependencies, native audio tools and model paths must be configured and verified on Linux separately. Local synthetic ASR evidence does not verify 112, a real microphone, or a room terminal.\n\nThe chosen source commit is checked against all currently tracked raw bytes. API source-map paths, release identity and build timestamps are checked; web entry timestamps and the current offline manifest/worker/asset fingerprints are checked. These are source/artifact association checks, not a reproducible-build proof or a new full test run. Historical generated record folders are omitted. File admission uses explicit text/build extensions, committed theme preview JPGs, and one exact fingerprint-pinned public development-node ZIP. Audio/video/model/runtime-data file types are refused. This checks admitted types and source provenance; it does not identify private content inside text or images.\n\nThe public offline page is /offline-capture.html. Each intended browser must first prepare that exact trusted HTTPS origin online. Localhost preparation does not prepare a production origin. Its encrypted backup migration remains an explicit user action.\n\nDeployment, exact staged readback, bound previous-release/configuration/data recovery material, 112 health and 101 cold-standby checks remain separate operations. No SSH, network access, installation, service startup, production change or rollback is performed by this archive.\n`;

let created=false;
try{
 await noLinks(root);await noLinks(apiDist);await noLinks(webDist);await noLinks(dirname(output));
 if(inside(apiDist,output)||inside(webDist,output)||sourceDirectories.some(name=>inside(resolve(root,name),output)))fail('Output overlaps package input');
 try{await lstat(output);fail('Output already exists; choose a new directory')}catch(error){if(error.code!=='ENOENT')throw error}
 const source=await trackedSnapshot(),apiFiles=await runtimeFiles(apiDist,'apps/api/dist',source),webFiles=await runtimeFiles(webDist,'apps/web/dist',source),association=await validateBuilds(source,apiFiles,webFiles);
 for(const spec of previousPackages)await noLinks(resolve(spec.slice(65)));
 const inheritedResult=await execute(python,[join(root,'scripts/release-web-assets.py'),'inherit','--web-root',webDist,...previousPackages.map(value=>'--previous-package='+value)],{windowsHide:true,timeout:180000,maxBuffer:64*1024*1024});
 const inherited=JSON.parse(inheritedResult.stdout),webByPath=new Map(webFiles.map(item=>[item.path,item]));
 if(inherited.compatibility?.schema!==1||inherited.compatibility.kind!=='previous-release-js-css-assets'||!Array.isArray(inherited.assets)||!inherited.assets.length)fail('Previous asset inheritance did not qualify');
 for(const row of inherited.assets){if(!safeRelative(row.path)||!row.path.startsWith('apps/web/dist/assets/')||!['.js','.css'].includes(extension(row.path)))fail('Inherited asset path refused');const bytes=Buffer.from(row.base64,'base64');if(bytes.length!==row.size||sha(bytes)!==row.sha256)fail('Inherited asset bytes differ');const present=webByPath.get(row.path);if(present){if(present.sha256!==row.sha256||present.size!==row.size)fail('Inherited asset path collision');}else{const item={path:row.path,size:row.size,sha256:row.sha256,mode:0o644,inheritedBytes:bytes};webFiles.push(item);webByPath.set(row.path,item);}}
 await execute(python,['-c','import zipfile; print("zipfile-ready")'],{windowsHide:true,timeout:10000,maxBuffer:4096});
 const all=[...source,...apiFiles,...webFiles].sort((a,b)=>a.path.localeCompare(b.path,'en'));if(new Set(all.map(item=>item.path)).size!==all.length)fail('Package path collision');
 await mkdir(output);created=true;const payload=join(output,'.package-payload');await mkdir(payload);
 for(const item of all){const destination=join(payload,item.path);await mkdir(dirname(destination),{recursive:true});if(item.inheritedBytes)await writeFile(destination,item.inheritedBytes,{flag:'wx'});else{await noLinks(item.absolute);await copyFile(item.absolute,destination,constants.COPYFILE_EXCL);}const bytes=await readFile(destination);if(bytes.length!==item.size||sha(bytes)!==item.sha256)fail('Input changed while packaging: '+item.path);}
 const readme=makeReadme(association.runtimeBuild);await writeFile(join(payload,'RELEASE-README.md'),readme,{flag:'wx'});all.push({path:'RELEASE-README.md',size:Buffer.byteLength(readme),sha256:sha(readme),mode:0o644});
 const metadata={schema:1,archiveVersion:version,runtimeBuild:association.runtimeBuild,sourceCommit:commit,createdAt:new Date().toISOString(),localCandidateOnly:true,productionDeployed:false,dependenciesIncluded:false,admission:{source:'raw-byte-verified tracked public source with explicit text extensions, theme preview JPGs and one fingerprint-pinned public development-node ZIP',compiled:'explicit JS/map API and JS/CSS/HTML/JSON web builds; binary public assets must match committed source',audioVideoModelsAndRuntimeDataAdmitted:false,contentPrivacyInspectionPerformed:false},association,compatibility:inherited.compatibility,files:all.map(({path,size,sha256,mode})=>({path,size,sha256,mode})).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
 const manifestPath=join(output,'release-manifest.json'),archive=join(output,version+'.zip');await writeFile(manifestPath,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 const zipped=await execute(python,['-c',zipProgram,payload,manifestPath,archive],{windowsHide:true,timeout:180000,maxBuffer:8192});if(!JSON.parse(zipped.stdout).zipVerified)fail('ZIP verification did not finish');
 // Recheck all tracked bytes after copying; a concurrent source change cannot silently enter a successful package.
 await trackedSnapshot();const archiveSha256=sha(await readFile(archive));await writeFile(archive+'.sha256',archiveSha256+'  '+version+'.zip\n',{flag:'wx'});
 const actualPayload=await realpath(payload),actualOutput=await realpath(output);if(!inside(actualOutput,actualPayload)||actualPayload===actualOutput)fail('Temporary payload cleanup boundary invalid');await rm(actualPayload,{recursive:true,force:false});
 console.log(JSON.stringify({status:'passed',archiveVersion:version,runtimeBuild:association.runtimeBuild,sourceCommit:commit,archive,archiveSha256,manifest:manifestPath,manifestSha256:sha(await readFile(manifestPath)),files:metadata.files.length,offlineManifestVersion:association.offlineManifestVersion,localOnly:true,buildPerformed:false,productionAccess:false}));
}catch(error){if(created)try{await writeFile(join(output,'packaging-failure.json'),JSON.stringify({status:'failed',localOnly:true,reason:error.message,preservedPartialOutput:true},null,2)+'\n',{flag:'wx'})}catch{}console.error(error.message);process.exitCode=1}
