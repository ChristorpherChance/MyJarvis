/** Fixed independent SQL-client guard. No candidate-controlled import fallback. */
import {lstat,readFile,readdir,readlink,realpath,open} from 'node:fs/promises';
import {constants,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Module,{createRequire,isBuiltin} from 'node:module';
import {posix,relative as nativeRelative,isAbsolute,sep} from 'node:path';

const ROOT='/qa-runtime',MANIFEST='/tools/r29-qa-runtime-manifest.json';
// Preparation only. Root must first freeze the real offline closure, then a
// newly reviewed tool version replaces this literal with that exact byte hash.
const MANIFEST_SHA256=null;
const TRUSTED_RESOLVE=Module._resolveFilename;
const TRUSTED_LOAD=Module._load;
const H=/^[a-f0-9]{64}$/,sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(Object.keys(v).sort())===JSON.stringify([...keys].sort());
const inside=p=>p===ROOT||p.startsWith(ROOT+'/');
function relative(p){return typeof p==='string'&&p.length>0&&p.length<=1000&&!p.startsWith('/')&&!/[\\\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');}
export const inspectIndependentPGRuntime=Object.freeze({root:ROOT,manifest:MANIFEST,manifestSHA256:MANIFEST_SHA256,pgVersion:'8.23.0',prepared:false,ready:false,candidateDependencyFallback:false});
export function validatePGObserverEnvironment(env){for(const key of ['NODE_PATH','NODE_OPTIONS','PG_FORCE_NATIVE'])need(env[key]===undefined||env[key]==='','QA_SQL_CLIENT_ENVIRONMENT_INVALID');}
const nativeInside=(root,path)=>{const rel=nativeRelative(root,path);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
export function assertNewPGModuleCache(cache,baseline,approved,root=ROOT){for(const [path,mod] of Object.entries(cache))if(!baseline.has(path)){const actual=realpathSync(path);need(nativeInside(root,actual)&&approved.has(actual)&&mod?.filename===actual,'QA_SQL_CLIENT_EXTERNAL_CACHE');}}
/** The controlled-fixture tests exercise the actual Node resolver/load path.
 * Production always supplies ROOT and its fully verified immutable manifest.
 */
export function installClosedPGResolver(approvedFilePaths,root=ROOT){
 need(Module._resolveFilename===TRUSTED_RESOLVE&&Module._load===TRUSTED_LOAD,'QA_SQL_RESOLVER_ALREADY_CHANGED');
 const approved=new Set(approvedFilePaths),baseline=new Set(Object.keys(Module._cache));
 for(const path of baseline)need(!nativeInside(root,path),'QA_SQL_CLIENT_ALREADY_LOADED');
 const guard=function(request,...args){need(typeof request==='string'&&request!=='pg-native'&&!request.startsWith('pg-native/'),'QA_SQL_NATIVE_CLIENT_FORBIDDEN');const path=TRUSTED_RESOLVE.call(this,request,...args);if(isBuiltin(path))return path;const actual=realpathSync(path);need(!actual.endsWith('.node'),'QA_SQL_NATIVE_CLIENT_FORBIDDEN');need(nativeInside(root,actual)&&approved.has(actual),'QA_SQL_CLIENT_EXTERNAL_RESOLUTION');return path;};
 // Node's same-parent relativeResolveCache may return exports before calling
 // _resolveFilename. Validate the actual request before that load fast-path.
 const load=function(request,parent,...args){guard.call(Module,request,parent,...args);return TRUSTED_LOAD.call(this,request,parent,...args);};
 Module._resolveFilename=guard;Module._load=load;let released=false;
 const assertCache=()=>{need(!released&&Module._resolveFilename===guard&&Module._load===load,'QA_SQL_RESOLVER_CHANGED');assertNewPGModuleCache(Module._cache,baseline,approved,root);};
 const release=()=>{if(released)return;const same=Module._resolveFilename===guard&&Module._load===load;Module._resolveFilename=TRUSTED_RESOLVE;Module._load=TRUSTED_LOAD;released=true;need(same,'QA_SQL_RESOLVER_CHANGED');};
 return {assertCache,release};
}

/** Pure qualification, shared with meaningful malformed-manifest tests. */
export function validateIndependentPGRuntimeManifest(v){
 need(exact(v,['schemaVersion','kind','root','pgVersion','packageJSONSHA256','entries','treeSHA256'])&&v.schemaVersion===1&&v.kind==='r29-independent-pg-runtime'&&v.root===ROOT&&v.pgVersion==='8.23.0'&&H.test(v.packageJSONSHA256??'')&&H.test(v.treeSHA256??''),'QA_SQL_RUNTIME_MANIFEST_INVALID');
 need(Array.isArray(v.entries)&&v.entries.length>=3&&v.entries.length<=20000,'QA_SQL_RUNTIME_ENTRY_COUNT_INVALID');
 let previous='',bytes=0;const paths=new Map();for(const e of v.entries){
  need(e&&typeof e==='object'&&!Array.isArray(e)&&relative(e.path)&&e.path>previous&&!paths.has(e.path),'QA_SQL_RUNTIME_PATH_INVALID');previous=e.path;
  if(e.type==='file'){need(exact(e,['path','type','sha256','bytes'])&&H.test(e.sha256??'')&&Number.isSafeInteger(e.bytes)&&e.bytes>=0&&e.bytes<=100*1024*1024,'QA_SQL_RUNTIME_FILE_INVALID');bytes+=e.bytes;}
  else if(e.type==='directory')need(exact(e,['path','type']),'QA_SQL_RUNTIME_DIRECTORY_INVALID');
  else if(e.type==='symlink'){need(exact(e,['path','type','target'])&&typeof e.target==='string'&&e.target.length>0&&e.target.length<=1000&&!posix.isAbsolute(e.target)&&!/[\\\x00-\x1f\x7f]/.test(e.target)&&inside(posix.resolve(ROOT,posix.dirname(e.path),e.target)),'QA_SQL_RUNTIME_SYMLINK_INVALID');}
  else need(false,'QA_SQL_RUNTIME_TYPE_INVALID');paths.set(e.path,e);
 }
 need(bytes<=100*1024*1024&&sha(v.entries)===v.treeSHA256,'QA_SQL_RUNTIME_TREE_HASH_INVALID');
 for(const path of paths.keys()){let parent=posix.dirname(path);while(parent!=='.'){need(paths.get(parent)?.type==='directory','QA_SQL_RUNTIME_PARENT_INVALID');parent=posix.dirname(parent);}}
 need(paths.get('package.json')?.type==='file'&&paths.get('package.json').sha256===v.packageJSONSHA256,'QA_SQL_RUNTIME_PACKAGE_PIN_INVALID');
 return {entries:v.entries,paths,bytes};
}
export function validateIndependentPGRuntimeStat(stat,type){
 need(stat.uid===0&&stat.gid===0,'QA_SQL_RUNTIME_OWNER_INVALID');
 if(type==='directory')need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o022),'QA_SQL_RUNTIME_DIRECTORY_WRITABLE');
 else if(type==='file')need(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o022)&&stat.nlink===1,'QA_SQL_RUNTIME_FILE_UNTRUSTED');
 else if(type==='symlink')need(stat.isSymbolicLink(),'QA_SQL_RUNTIME_LINK_TYPE_CHANGED');
 else need(false,'QA_SQL_RUNTIME_TYPE_INVALID');
}
async function readHeldFile(path){const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await fd.stat();validateIndependentPGRuntimeStat(s,'file');return await fd.readFile();}finally{await fd.close();}}
export async function verifyIndependentPGRuntime(){
 need(process.getuid?.()===1000&&process.getgid?.()===1000,'QA_SQL_RUNTIME_NONROOT_REQUIRED');
 validatePGObserverEnvironment(process.env);
 need(H.test(MANIFEST_SHA256??''),'QA_SQL_RUNTIME_NOT_FROZEN');
 const raw=await readHeldFile(MANIFEST);need(sha(raw)===MANIFEST_SHA256,'QA_SQL_RUNTIME_MANIFEST_CHANGED');const v=JSON.parse(raw),approved=validateIndependentPGRuntimeManifest(v);
 validateIndependentPGRuntimeStat(await lstat(ROOT),'directory');const actual=[];
 async function walk(relativeRoot=''){for(const name of (await readdir(posix.join(ROOT,relativeRoot))).sort()){
   const p=relativeRoot?relativeRoot+'/'+name:name;need(relative(p),'QA_SQL_RUNTIME_PATH_INVALID');const full=posix.join(ROOT,p),s=await lstat(full),type=s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'unknown';validateIndependentPGRuntimeStat(s,type);actual.push({path:p,type});
   const expected=approved.paths.get(p);need(expected&&expected.type===type,'QA_SQL_RUNTIME_EXTRA_OR_TYPE_CHANGED');
   if(type==='directory')await walk(p);else if(type==='file'){const b=await readHeldFile(full);need(b.length===expected.bytes&&sha(b)===expected.sha256,'QA_SQL_RUNTIME_FILE_CHANGED');}
   else{need(await readlink(full)===expected.target&&inside(await realpath(full)),'QA_SQL_RUNTIME_LINK_CHANGED');}
  }}
 await walk();actual.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);need(JSON.stringify(actual)===JSON.stringify(v.entries.map(x=>({path:x.path,type:x.type}))),'QA_SQL_RUNTIME_CLOSURE_CHANGED');
 const packageJSON=JSON.parse(await readHeldFile(ROOT+'/package.json'));need(packageJSON.name==='jarvis-r29-qa-runtime'&&packageJSON.private===true&&exact(packageJSON.dependencies,['pg'])&&packageJSON.dependencies.pg==='8.23.0','QA_SQL_RUNTIME_PACKAGE_CHANGED');
 return {root:ROOT,manifestSHA256:MANIFEST_SHA256,treeSHA256:v.treeSHA256,pgVersion:v.pgVersion,entries:v.entries.length,bytes:approved.bytes,verified:true,candidateDependencyFallback:false};
}
export async function loadIndependentPG(){
 const runtime=await verifyIndependentPGRuntime(),require=createRequire(ROOT+'/package.json'),path=await realpath(require.resolve('pg'));
 need(inside(path),'QA_SQL_CLIENT_OUTSIDE_RUNTIME');
 const raw=await readHeldFile(MANIFEST);need(sha(raw)===MANIFEST_SHA256,'QA_SQL_RUNTIME_MANIFEST_CHANGED');const manifest=JSON.parse(raw),entry=manifest.entries.find(e=>e.type==='file'&&posix.join(ROOT,e.path)===path);need(entry,'QA_SQL_CLIENT_NOT_MANIFESTED');
 const pgPackagePath=await realpath(require.resolve('pg/package.json')),pgPackageEntry=manifest.entries.find(e=>e.type==='file'&&posix.join(ROOT,e.path)===pgPackagePath);need(inside(pgPackagePath)&&pgPackageEntry,'QA_SQL_CLIENT_PACKAGE_NOT_MANIFESTED');const pgPackage=JSON.parse(await readHeldFile(pgPackagePath));need(pgPackage.name==='pg'&&pgPackage.version==='8.23.0','QA_SQL_CLIENT_VERSION_CHANGED');
 const lifecycle=installClosedPGResolver(manifest.entries.filter(e=>e.type==='file').map(e=>posix.join(ROOT,e.path)));
 try{const {Pool}=require('pg');need(typeof Pool==='function','QA_SQL_CLIENT_API_INVALID');lifecycle.assertCache();return {Pool,runtime:{...runtime,resolvedEntrySHA256:entry.sha256,resolvedPackageSHA256:pgPackageEntry.sha256,resolverClosureGuard:true},...lifecycle};}
 catch(error){lifecycle.release();throw error;}
}
