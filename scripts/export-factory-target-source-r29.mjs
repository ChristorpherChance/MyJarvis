/** Read the frozen R29 public source; export only the delta into a private local mirror. */
import {open,mkdir,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
import {repairHostProgram,sha,canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},scope={workspace:'/home/superopen/All-Projects/msf-targets-r29/source',baseline:'/home/superopen/All-Projects/msf-repair-r27/source',helperSHA:'57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',fingerprint:'4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',metadataSHA:'2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',files:621,bytes:18386584,identity:{device:66306,inode:6718050},baselineSHA:'9b07a5115c22d14f82e04ba45b66efbc5ac04f7faa696ab84d81e33696ec7b76',baselineMetadataSHA:'c62497e11de2bb1eeb4873b7d4d70cd8cc05974cafe4c5408d5bfbd041de43ac'};
const outdir='artifacts/software-factory/goals-r29',mirror='.jarvis-dev/workspaces/msf-targets-r29/source',old='.jarvis-dev/workspaces/msf-repair-r27/source';
export function targetSourceExportR29Program(){const at=repairHostProgram.indexOf("before,manifest=source_state(p['source'])");need(at>0,'R29_EXPORT_HELPER_ANCHOR_CHANGED');let prefix=repairHostProgram.slice(0,at);const anchor="tool=Path('/opt/jarvis-development/software-factory/project-autonomy-evidence.py')";need(prefix.split(anchor).length===2,'R29_EXPORT_HELPER_ANCHOR_CHANGED');prefix=prefix.replace(anchor,"expected_scope=json.loads('"+JSON.stringify(scope)+"')\nneed(os.geteuid()==0 and isinstance(p,dict) and set(p)==set(expected_scope) and all(p[k]==v for k,v in expected_scope.items()),'R29_EXPORT_FIXED_SCOPE_REQUIRED')\n"+anchor);return prefix+String.raw`
import base64
need(os.geteuid()==0,'R29_EXPORT_ROOT_REQUIRED')
before,manifest=source_state(p['workspace']);baseline,old_manifest=source_state(p['baseline'])
need(before['sha256']==p['fingerprint'] and before['metadataSHA']==p['metadataSHA'] and before['files']==p['files'] and before['bytes']==p['bytes'] and before['identity']==p['identity'],'R29_EXPORT_CANDIDATE_CHANGED')
need(baseline['sha256']==p['baselineSHA'] and baseline['metadataSHA']==p['baselineMetadataSHA'] and baseline['files']==608,'R29_EXPORT_BASELINE_CHANGED')
old={e['path']:e for e in old_manifest['manifest']};delta=[];total=0;root=h.open_directory(p['workspace'])
try:
 for e in manifest['manifest']:
  if e['path'] in old and e['sha256']==old[e['path']]['sha256']:continue
  fd=h.open_relative(root,e['path'])
  try:body=h.read_fd(fd,h.MAX_FILE)
  finally:os.close(fd)
  need(len(body)==e['bytes'] and hashlib.sha256(body).hexdigest()==e['sha256'],'R29_EXPORT_DELTA_CHANGED');total+=len(body);need(total<=1000000,'R29_EXPORT_DELTA_LIMIT')
  delta.append(e|{'base64':base64.b64encode(body).decode('ascii')})
finally:os.close(root)
after,_=source_state(p['workspace']);baseline_after,_=source_state(p['baseline']);need(before==after and baseline==baseline_after,'R29_EXPORT_READ_CHANGED')
print(json.dumps({'candidate':after,'baseline':baseline_after,'manifest':manifest['manifest'],'delta':delta,'deleted':[x for x in old if x not in {e['path'] for e in manifest['manifest']}],'sourceStable':True,'remoteMutationsPerformed':False,'productExecuted':False,'privatePathsExported':False},separators=(',',':')))
`;}
export async function exportFactoryTargetSourceR29(){
 const q=JSON.parse(await safeReadLocal('.jarvis-dev/maintenance/factory-target-repair-r29.json','utf8'));need(q.restored===true&&q.taskId==='c45462b0-6a28-433c-af8c-d656bd1d2ad3'&&q.runId==='d9f1095aae0edc1b848487b1b567f3be29f25f3b'&&q.candidateAfter?.sha256===scope.fingerprint&&q.candidateAfter.metadataSHA===scope.metadataSHA,'R29_EXPORT_RESTORED_CURRENT_CANDIDATE_REQUIRED');
 const r=JSON.parse(remote(lanProfile,'jarvis-101',python(scope,targetSourceExportR29Program()),true,{timeoutMs:180000}));need(r.sourceStable===true&&r.remoteMutationsPerformed===false&&r.productExecuted===false&&r.candidate.sha256===scope.fingerprint&&r.manifest.length===scope.files,'R29_EXPORT_RESPONSE_INVALID');
 need(canonical(r.candidate)===canonical({sha256:scope.fingerprint,files:scope.files,bytes:scope.bytes,metadataSHA:scope.metadataSHA,stable:true,identity:scope.identity})&&r.baseline.sha256===scope.baselineSHA&&r.baseline.metadataSHA===scope.baselineMetadataSHA&&r.baseline.files===608,'R29_EXPORT_RESPONSE_SOURCE_INVALID');
 need(r.manifest.every(e=>/^[a-f0-9]{64}$/.test(e.sha256??'')&&Number.isSafeInteger(e.bytes)&&e.bytes>=0)&&r.manifest.reduce((n,e)=>n+e.bytes,0)===scope.bytes&&Array.isArray(r.delta)&&r.delta.reduce((n,e)=>n+e.bytes,0)<=1000000,'R29_EXPORT_RESPONSE_DENOMINATOR_INVALID');
 const paths=r.manifest.map(e=>e.path);need(new Set(paths).size===paths.length&&paths.every(x=>typeof x==='string'&&x.length<400&&!x.includes('\\')&&!x.includes(':')&&!x.startsWith('/')&&!x.split('/').some(s=>!s||s==='.'||s==='..')),'R29_EXPORT_MANIFEST_PATH_INVALID');
 need(sha(r.manifest.map(e=>e.path+'\0'+e.sha256+'\n').join(''))===scope.fingerprint,'R29_EXPORT_MANIFEST_FINGERPRINT_INVALID');
 const changed=new Map(r.delta.map(e=>[e.path,e]));need(changed.size===r.delta.length&&[...changed].every(([k,e])=>r.manifest.some(m=>m.path===k&&m.sha256===e.sha256&&m.bytes===e.bytes)),'R29_EXPORT_DELTA_MANIFEST_INVALID');
 const bound=new Map(),root=resolve('.');async function bindDir(path){path=resolve(path);const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&resolve(await realpath(path)).toLowerCase()===path.toLowerCase(),'R29_EXPORT_LOCAL_DIRECTORY_UNTRUSTED');bound.set(path,{dev:s.dev,ino:s.ino});}
 async function assertDirs(){for(const [path,id]of bound){const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.dev===id.dev&&s.ino===id.ino&&resolve(await realpath(path)).toLowerCase()===path.toLowerCase(),'R29_EXPORT_LOCAL_DIRECTORY_CHANGED');}}
 for(const path of [root,resolve('.jarvis-dev'),resolve('.jarvis-dev/workspaces')])await bindDir(path);
 await assertDirs();await mkdir(dirname(mirror),{recursive:false});await bindDir(dirname(mirror));await mkdir(mirror,{recursive:false});await bindDir(mirror);let total=0;
 async function ensureSubdirs(target){const parts=resolve(target).slice(resolve(mirror).length+1).split(/[\\/]/);let path=resolve(mirror);for(const part of parts){path=resolve(path,part);if(!bound.has(path)){await assertDirs();await mkdir(path,{recursive:false});await bindDir(path);}}}
 for(const e of r.manifest){let bytes;if(changed.has(e.path)){const d=changed.get(e.path);bytes=Buffer.from(d.base64,'base64');need(bytes.toString('base64')===d.base64,'R29_EXPORT_DELTA_ENCODING_INVALID');}else bytes=await safeReadLocal(old+'/'+e.path);need(bytes.length===e.bytes&&sha(bytes)===e.sha256,'R29_EXPORT_LOCAL_SOURCE_CHANGED');const target=resolve(mirror,e.path);need(target.startsWith(resolve(mirror)+'\\')||target.startsWith(resolve(mirror)+'/'),'R29_EXPORT_LOCAL_SCOPE_CHANGED');if(dirname(target)!==resolve(mirror))await ensureSubdirs(dirname(target));await assertDirs();const f=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}total+=bytes.length;}
 await assertDirs();
 for(const e of r.manifest){const bytes=await safeReadLocal(mirror+'/'+e.path);need(bytes.length===e.bytes&&sha(bytes)===e.sha256,'R29_EXPORT_MIRROR_READBACK_CHANGED');}await assertDirs();need(total===scope.bytes,'R29_EXPORT_LOCAL_BYTES_INVALID');
 const report={schemaVersion:1,kind:'software-factory-r29-frozen-public-source-export',at:new Date().toISOString(),taskId:q.taskId,runId:q.runId,candidate:r.candidate,baseline:r.baseline,manifest:r.manifest,changed:r.delta.map(({base64,...e})=>e),deleted:r.deleted,localMirror:resolve(mirror),localMirrorByteVerification:true,sourceStable:true,remoteMutationsPerformed:false,productCodeExecuted:false,modelsInvoked:false,privatePathsExported:false,privateDeltaContentsExportedToPublicReport:false,productAccepted:false};await mkdir(outdir,{recursive:true});const path=outdir+'/frozen-source-export-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(report,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}return {output:path,sha256:sha(raw),files:scope.files,fingerprint:scope.fingerprint,changed:r.delta.length,deleted:r.deleted.length,bytes:total,localMirror:resolve(mirror),productAccepted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){need(process.argv.length===2,'R29_EXPORT_ARGUMENTS_INVALID');try{console.log(JSON.stringify(await exportFactoryTargetSourceR29()))}catch(e){process.exitCode=1;console.log(JSON.stringify({failed:true,errorCode:/^R29_EXPORT_[A-Z0-9_]+$/.test(e.message)?e.message:'R29_EXPORT_OPERATION_FAILED',automaticRetry:false,rawErrorExported:false,productAccepted:false}))}}
