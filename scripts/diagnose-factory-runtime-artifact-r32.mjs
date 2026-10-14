/** New readonly diagnosis of the failed artifact inspect. No full-file byte
 * scans, retries, publication, container creation or product/model execution. */
import {open,mkdir} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {safeReadLocal} from './factory-repair-evidence-read-r26.mjs';import {lanProfile,python} from './managed-server-client.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},sha=b=>createHash('sha256').update(b).digest('hex');
export const runtimeArtifactDiagnosticR32Pin='ebcadf55f7ff3853a7a70c807b9898edcf663e9f5141b60fd076d398bb9851ec';
export function runtimeArtifactDiagnosticR32Program(){return String.raw`
import ast,base64,hashlib,json,os,stat,subprocess,time,signal,posixpath,re
from pathlib import PurePosixPath
def need(v,c):
 if not v:raise RuntimeError(c)
need(os.geteuid()==os.getegid()==0 and set(p)=={'programBase64','programSHA256'} and p['programSHA256']=='ebcadf55f7ff3853a7a70c807b9898edcf663e9f5141b60fd076d398bb9851ec','R32_ARTIFACT_DIAGNOSTIC_BINDING_INVALID')
body=base64.b64decode(p['programBase64'],validate=True);need(len(body)<100000 and hashlib.sha256(body).hexdigest()==p['programSHA256'],'R32_ARTIFACT_DIAGNOSTIC_SOURCE_CHANGED')
tree=ast.parse(body);names={'meta','ident','sha','canonical','image_contract','path_ok','resolve_path','resolve_closure'};definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and any(isinstance(y,ast.Name) and y.id=='SCOPE' for y in n.targets)];need(len(definitions)==9,'R32_ARTIFACT_DIAGNOSTIC_FUNCTION_SET_CHANGED');exec(compile(ast.Module(body=definitions,type_ignores=[]),'fixed-readonly-artifact-functions','exec'))
need(SCOPE['work']=='/var/lib/jarvis-development/101/truth-gate-r32-build/febd0e7c2b6eb5eac1947c0725c51416/work' and SCOPE['workIdentity']=={'device':66306,'inode':8054874} and SCOPE['workEntries']==47822 and SCOPE['workMetadataSHA256']=='461b6c1b791f74dce4b7dcf520d12f12a87ec9b2ba6e6f3c634769af221227ab','R32_ARTIFACT_DIAGNOSTIC_FIXED_SCOPE_CHANGED')
stage='ancestor';signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(RuntimeError('R32_ARTIFACT_DIAGNOSTIC_TIMEOUT')));signal.alarm(120)
result={'schemaVersion':1,'kind':'r32-runtime-artifact-failed-inspect-readonly-diagnostic','originalFailureRetained':True,'scope':{'attempt':'febd0e7c2b6eb5eac1947c0725c51416','work':SCOPE['work']},'ready':False,'diagnosticReadComplete':False,'artifactPreparationQualified':False,'candidateCodeExecuted':False,'modelsInvoked':False,'rootMutationsPerformed':False,'fullFileByteScanPerformed':False,'originalInspectFailureCauseConfirmed':False,'completedStages':[]};chain=[]
def open_fixed_chain():
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);chain.append((fd,None,None,meta(os.fstat(fd))));observed=[];parts=PurePosixPath(SCOPE['work']).parts[1:]
 for i,name in enumerate(parts):
  parent=chain[-1][0];s=os.stat(name,dir_fd=parent,follow_symlinks=False);need(stat.S_ISDIR(s.st_mode),'R32_ARTIFACT_DIAGNOSTIC_ANCESTOR_NOT_DIRECTORY');f=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
  try:need(meta(s)==meta(os.fstat(f)),'R32_ARTIFACT_DIAGNOSTIC_ANCESTOR_REPLACED')
  except BaseException:os.close(f);raise
  chain.append((f,parent,name,meta(s)));is_work=i==len(parts)-1;trusted=(s.st_uid==s.st_gid==1000 and stat.S_IMODE(s.st_mode)==0o700 and ident(s)==SCOPE['workIdentity']) if is_work else (s.st_uid==s.st_gid==0 and not s.st_mode&0o022);observed.append({'path':'/'+('/'.join(parts[:i+1])),'identity':ident(s),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'matchesArtifactAncestorRule':trusted})
  need(is_work or s.st_uid==0 and not s.st_mode&0o022,'R32_ARTIFACT_DIAGNOSTIC_UNSAFE_ANCESTOR');need(not is_work or ident(s)==SCOPE['workIdentity'],'R32_ARTIFACT_DIAGNOSTIC_WORK_IDENTITY_CHANGED')
 return observed
def check_chain():
 for fd,parent,name,before in chain:
  current=meta(os.fstat(fd));need(current==before and (parent is None or current==meta(os.stat(name,dir_fd=parent,follow_symlinks=False))),'R32_ARTIFACT_DIAGNOSTIC_ANCESTOR_CHANGED')
def legacy_metadata(fd):
 rows=[];counts={'regularFiles':0,'directories':0,'symlinks':0,'sockets':0};start=meta(os.fstat(fd));closure=[];max_file=0;total_bytes=0
 def walk(d,relative='',depth=0):
  nonlocal max_file,total_bytes
  need(depth<=48,'R32_ARTIFACT_DIAGNOSTIC_DEPTH_LIMIT');before=meta(os.fstat(d));listing=sorted(os.listdir(d))
  for name in listing:
   need(len(rows)<200000,'R32_ARTIFACT_DIAGNOSTIC_ENTRY_LIMIT');s=os.stat(name,dir_fd=d,follow_symlinks=False);rel=relative+'/'+name if relative else name;target=sha(os.readlink(name,dir_fd=d).encode()) if stat.S_ISLNK(s.st_mode) else None;rows.append([rel,*meta(s),target])
   need(stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or stat.S_ISSOCK(s.st_mode),'R32_ARTIFACT_DIAGNOSTIC_SPECIAL_FILE');counts['regularFiles' if stat.S_ISREG(s.st_mode) else 'directories' if stat.S_ISDIR(s.st_mode) else 'symlinks' if stat.S_ISLNK(s.st_mode) else 'sockets']+=1
   kind='file' if stat.S_ISREG(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'socket';entry={'path':rel,'type':kind}
   if kind=='file':max_file=max(max_file,s.st_size);total_bytes+=s.st_size
   if kind=='symlink':entry['target']=os.readlink(name,dir_fd=d)
   closure.append(entry)
   if stat.S_ISDIR(s.st_mode):
    child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=d)
    try:need(meta(s)==meta(os.fstat(child)),'R32_ARTIFACT_DIAGNOSTIC_DIRECTORY_REPLACED');walk(child,rel,depth+1);need(meta(s)==meta(os.fstat(child)),'R32_ARTIFACT_DIAGNOSTIC_DIRECTORY_CHANGED')
    finally:os.close(child)
   need(meta(s)==meta(os.stat(name,dir_fd=d,follow_symlinks=False)),'R32_ARTIFACT_DIAGNOSTIC_ENTRY_CHANGED')
  need(before==meta(os.fstat(d)) and listing==sorted(os.listdir(d)),'R32_ARTIFACT_DIAGNOSTIC_DIRECTORY_CHANGED')
 walk(fd);need(start==meta(os.fstat(fd)),'R32_ARTIFACT_DIAGNOSTIC_ROOT_CHANGED');link_error=None
 try:resolve_closure(closure)
 except RuntimeError as e:link_error=str(e) if str(e).startswith('R32_ARTIFACT_') else 'R32_ARTIFACT_DIAGNOSTIC_LINK_CLOSURE_UNKNOWN'
 return {'metadataSHA256':sha(canonical(rows)),'entries':len(rows),'counts':counts,'maximumRegularFileBytes':max_file,'totalRegularFileBytes':total_bytes,'invalidArtifactPathCount':sum(not path_ok(e['path']) for e in closure),'fileSizeLimitsCompatible':max_file<=128*1024*1024 and total_bytes<=3*1024*1024*1024,'symlinkClosureComplete':link_error is None,'symlinkClosureErrorCode':link_error,'artifactSpecialFileRuleCompatible':counts['sockets']==0,'metadataAlgorithm':'directory DFS sorted children; rel + nine stat integers + symlink target UTF8 SHA, compact sorted-key ensure_ascii false','bytesReadFromRegularFiles':0}
try:
 result['ancestors']=open_fixed_chain();result['ancestorRulesAllMatch']=all(x['matchesArtifactAncestorRule'] for x in result['ancestors']);result['completedStages'].append('ancestors');stage='legacy-metadata';first=legacy_metadata(chain[-1][0]);second=legacy_metadata(chain[-1][0]);need(first==second,'R32_ARTIFACT_DIAGNOSTIC_LEGACY_READ_CHANGED');result['legacy']=first;result['legacyMatchesBuildProof']=first['metadataSHA256']==SCOPE['workMetadataSHA256'] and first['entries']==47822;result['completedStages'].append('legacy-metadata');stage='four-image-config';result['images']=image_contract();result['completedStages'].append('four-image-config');check_chain();result['diagnosticReadComplete']=True;result['ready']=True;result['artifactInputRulesCompatible']=result['ancestorRulesAllMatch'] and result['legacyMatchesBuildProof'] and first['fileSizeLimitsCompatible'] and first['symlinkClosureComplete'] and first['invalidArtifactPathCount']==0 and first['artifactSpecialFileRuleCompatible'];result['originalInspectFailureCauseConfirmed']=False
except BaseException as e:
 result['failedStage']=stage;v=str(e);result['errorCode']=v if v.startswith('R32_ARTIFACT_') and all(c.isupper() or c.isdigit() or c=='_' for c in v) else 'R32_ARTIFACT_DIAGNOSTIC_READ_INCOMPLETE'
finally:
 for f,_,_,_ in reversed(chain):os.close(f)
print(json.dumps(result,separators=(',',':')))
`}
export async function diagnoseRuntimeArtifactR32({authorized=false}={},deps={}){
 if(!authorized)return{kind:'r32-runtime-artifact-diagnostic-preparation',ready:false,reason:'READONLY_DIAGNOSTIC_NOT_AUTHORIZED',remoteOperations:false,modelsInvoked:false};
 const d={readLocal:safeReadLocal,ssh:async(input)=>spawnSync('ssh',['-F',lanProfile,'-o','BatchMode=yes','jarvis-101','sudo -n python3 -'],{input,encoding:'utf8',windowsHide:true,timeout:150000,maxBuffer:2*1024*1024}),privateEvidence:async bytes=>{await mkdir('.jarvis-dev/maintenance',{recursive:true});const path='.jarvis-dev/maintenance/runtime-artifact-r32-diagnostic-private-'+Date.now()+'-'+randomUUID()+'.json';const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}return{path,sha256:sha(bytes)}},publicEvidence:async value=>{const path='artifacts/software-factory/goals-r29/runtime-artifact-r32-readonly-diagnostic-'+Date.now()+'-'+randomUUID()+'.json',bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}return{path,sha256:sha(bytes)}},...deps};const body=await d.readLocal('scripts/factory-runtime-artifact-byte-controller-r32.py');need(sha(body)===runtimeArtifactDiagnosticR32Pin,'R32_ARTIFACT_DIAGNOSTIC_SOURCE_CHANGED');const at=Date.now(),r=await d.ssh(python({programBase64:Buffer.from(body).toString('base64'),programSHA256:runtimeArtifactDiagnosticR32Pin},runtimeArtifactDiagnosticR32Program()));const elapsedMs=Date.now()-at,privateRef=await d.privateEvidence(Buffer.from(JSON.stringify({status:r.status,signal:r.signal,errorCode:r.error?.code??null,stdout:String(r.stdout??''),stderr:String(r.stderr??'')})+'\n'));let value;try{value=JSON.parse(String(r.stdout??''))}catch{}
 const errorLine=String(r.stderr??'').trim().split(/\r?\n/).at(-1)??'',match=/^(?:RuntimeError|ValueError): (R32_ARTIFACT_[A-Z0-9_]+)$/.exec(errorLine);const out={schemaVersion:1,kind:'r32-runtime-artifact-failed-inspect-diagnostic-observation',at:new Date().toISOString(),ready:r.status===0&&value?.ready===true,sshStatus:Number.isInteger(r.status)?r.status:null,sshSignal:['SIGTERM','SIGKILL'].includes(r.signal)?r.signal:null,elapsedMs,errorCode:match?.[1]??(r.status!==0?'R32_ARTIFACT_DIAGNOSTIC_SSH_INCOMPLETE':value?.errorCode??null),diagnostic:r.status===0&&value?.kind==='r32-runtime-artifact-failed-inspect-readonly-diagnostic'?value:null,privateDiagnosticByteSHA256:privateRef.sha256,privateRawErrorExported:false,originalFailureRetained:true,originalInspectFailureCauseConfirmed:false,remoteReadPerformed:true,remoteMutationsPerformed:false,modelsInvoked:false,candidateCodeExecuted:false,productAccepted:false};const ref=await d.publicEvidence(out);return{...out,receipt:ref};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.slice(2).join(',')!=='--execute-readonly')console.log(JSON.stringify(await diagnoseRuntimeArtifactR32()));else console.log(JSON.stringify(await diagnoseRuntimeArtifactR32({authorized:true})));}
