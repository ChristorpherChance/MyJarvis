/** Exact R4 cache-only independent byte census. Never installs or runs package JS. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {remote,lanProfile,python} from './managed-server-client.mjs';

const H=/^[a-f0-9]{64}$/,need=(v,c)=>{if(!v)throw Error(c);},hash=b=>createHash('sha256').update(b).digest('hex');
const checkRef='artifacts/software-factory/goals-r29/isolated-build-r4-check-1791829453458-fa802c0d-26fe-461a-8d31-b5f051e2a0e9.json';
const checkSHA='f1dab15a255aaea43c3c34cd5d1a82e5855ad2e63fd60fc7017a7b495af8f0cc';
const helperRef='scripts/factory-build-independent-pg-runtime-r29.py',helperSHA='91c5e75ded3aeb74b6f3c9ad7ad0e1639f4eabf3dc2db74a6209f06268e9197c';
// A reviewed actual complete R4 five-resource proof must be bound here before
// any remote read. The current preparation does not discover or auto-fill it.
export const independentPGCacheReadGate=Object.freeze({cleanupReference:'artifacts/software-factory/goals-r29/r4-independent-cleanup-with-evidence-1791829757472-94c01ac6-6d54-44f9-a1e2-f04621dda604.json',cleanupSHA256:'324ed10f0efef0aeb29a6c03550c172a86c46072bc4bbeab93c931ffe629f610'});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function independentPGCacheScope(readLocal=p=>readFile(p)){
 const raw=await readLocal(checkRef);need(hash(raw)===checkSHA,'QA_PG_CACHE_R4_RECEIPT_CHANGED');const r=JSON.parse(raw);
 need(r.kind==='software-factory-r29-r4-once-build-observation'&&r.attempt==='6cc370ff0a1b82babedc165b0e574c26'&&r.scope?.toolSHA==='4ad07994beeb274e9f6b883ad02af89a1b562a1f0f094a55fbe9ebc0de81cf70'&&r.state?.status==='fail'&&r.state.sourceUnchanged===true&&r.state.sourceReadComplete===true,'QA_PG_CACHE_R4_RECEIPT_SCOPE_INVALID');
 const copies=r.state.cacheCopies;need(Array.isArray(copies)&&same(copies.map(x=>x.name),['corepack-runtime','corepack-cache','pnpm-store']),'QA_PG_CACHE_SET_INVALID');
 for(const c of copies){const root='/var/lib/jarvis-development/101/truth-gate-r29-build/'+r.attempt;need(c.root===root+'/caches/'+c.name&&c.manifestPath===root+'/cache-manifests/'+c.name+'.json'&&[c.manifestSHA256,c.outputContentTreeSHA256,c.outputMetadataSHA256].every(x=>H.test(x??''))&&Number.isSafeInteger(c.files)&&c.files>0&&Number.isSafeInteger(c.bytes)&&c.bytes>0&&Number.isSafeInteger(c.identity?.device)&&Number.isSafeInteger(c.identity.inode)&&c.identity.inode>0,'QA_PG_CACHE_BINDING_INVALID');}
 need(copies.reduce((n,c)=>n+c.bytes,0)===475914918,'QA_PG_CACHE_TOTAL_CHANGED');
 return {schemaVersion:1,kind:'r29-pg-cache-exact-read-scope',producerAttempt:r.attempt,producerTool:r.scope.tool,producerToolSHA256:r.scope.toolSHA,producerCheck:{path:checkRef,sha256:checkSHA},helper:{path:helperRef,sha256:helperSHA},caches:copies.map(c=>({name:c.name,root:c.root,manifestPath:c.manifestPath,manifestSHA256:c.manifestSHA256,contentTreeSHA256:c.outputContentTreeSHA256,metadataSHA256:c.outputMetadataSHA256,files:c.files,bytes:c.bytes,identity:c.identity})),totalBytes:475914918};
}
export function independentPGCacheRootProgram(){return String.raw`
import ast,base64,hashlib,json,os,re,stat,time
from pathlib import Path
def need(v,c):
 if not v:raise RuntimeError(c)
def digest(v):return hashlib.sha256(v).hexdigest()
need(os.geteuid()==0,'QA_PG_CACHE_READER_ROOT_REQUIRED')
s=p['scope'];need(digest(json.dumps(s,separators=(',',':')).encode())=='3d3a9fdf3168245f67b6abf8ddc9ab868fff275303e2e083f5a1b22fc64141d6','QA_PG_CACHE_READER_SCOPE_CHANGED')
need(isinstance(p.get('producerStateSHA256'),str) and re.fullmatch('[a-f0-9]{64}',p['producerStateSHA256']),'QA_PG_CACHE_READER_TERMINAL_PROOF_MISSING')
body=base64.b64decode(p['helperBase64']);need(digest(body)==s['helper']['sha256'],'QA_PG_CACHE_READER_HELPER_CHANGED')
tree=ast.parse(body);names={'need','compact','sha','metadata','relpath','held_directory','read_private','validate_cache_manifest','cache_closure'}
selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];need({n.name for n in selected}==names,'QA_PG_CACHE_READER_FUNCTIONS_CHANGED')
deadline=time.monotonic()+110
class BoundedTime:
 @staticmethod
 def monotonic():
  current=time.monotonic();need(current<deadline,'QA_PG_CACHE_READER_DEADLINE_EXCEEDED');return current
env={'hashlib':hashlib,'json':json,'os':os,'re':re,'stat':stat,'time':BoundedTime,'Path':Path,'H':re.compile('[a-f0-9]{64}')}
exec(compile(ast.Module(body=selected,type_ignores=[]),'trusted-pg-cache-read-functions','exec'),env)
read=env['read_private'];closure=env['cache_closure'];qualify=env['validate_cache_manifest']
worker=read(Path(s['producerTool']));need(digest(worker)==s['producerToolSHA256'],'QA_PG_CACHE_READER_PRODUCER_TOOL_CHANGED')
base=Path('/var/lib/jarvis-development/101/truth-gate-r29-build')/s['producerAttempt'];state_raw=read(base/'state.json');need(digest(state_raw)==p['producerStateSHA256'],'QA_PG_CACHE_READER_TERMINAL_PROOF_CHANGED');state=json.loads(state_raw)
need(state.get('attempt')==s['producerAttempt'] and state.get('status')=='fail' and state.get('sourceUnchanged') is True and state.get('sourceReadComplete') is True,'QA_PG_CACHE_READER_TERMINAL_BINDING_CHANGED')
copies=state.get('cacheCopies');need(isinstance(copies,list) and [c.get('name') for c in copies]==['corepack-runtime','corepack-cache','pnpm-store'],'QA_PG_CACHE_READER_PRIVATE_CACHE_SET_CHANGED')
before=[];manifest_raws=[];results=[]
for expected,copy in zip(s['caches'],copies):
 need(all(copy.get(k)==expected[k] for k in ['name','root','manifestPath','manifestSHA256','files','bytes','identity']) and copy.get('outputContentTreeSHA256')==expected['contentTreeSHA256'] and copy.get('outputMetadataSHA256')==expected['metadataSHA256'],'QA_PG_CACHE_READER_PRIVATE_BINDING_CHANGED')
 raw=read(Path(expected['manifestPath']));need(digest(raw)==expected['manifestSHA256'],'QA_PG_CACHE_READER_MANIFEST_CHANGED');v=qualify(json.loads(raw),expected['root'])
 need(v['identity']==expected['identity'] and v['files']==expected['files'] and v['bytes']==expected['bytes'] and v['contentTreeSHA256']==expected['contentTreeSHA256'] and v['metadataSHA256']==expected['metadataSHA256'],'QA_PG_CACHE_READER_MANIFEST_BINDING_CHANGED')
 actual=closure(expected['root']);need(actual==v,'QA_PG_CACHE_READER_FIRST_CLOSURE_CHANGED');before.append(actual);manifest_raws.append(raw)
for expected,first,manifest_raw in zip(s['caches'],before,manifest_raws):
 need(read(Path(expected['manifestPath']))==manifest_raw,'QA_PG_CACHE_READER_MANIFEST_CHANGED');actual=closure(expected['root']);need(actual==first,'QA_PG_CACHE_READER_SECOND_CLOSURE_CHANGED')
 results.append({'name':expected['name'],'root':expected['root'],'manifestPath':expected['manifestPath'],'manifestSHA256':expected['manifestSHA256'],'contentTreeSHA256':actual['contentTreeSHA256'],'metadataSHA256':actual['metadataSHA256'],'identity':actual['identity'],'files':actual['files'],'entries':len(actual['entries']),'bytes':actual['bytes'],'fullClosureDoubleRead':True,'rootOwnedReadOnly':True,'sharedHardlinks':False,'symlinks':False})
need(read(base/'state.json')==state_raw and read(Path(s['producerTool']))==worker,'QA_PG_CACHE_READER_CONTEXT_CHANGED')
print(json.dumps({'schemaVersion':1,'kind':'r29-independent-pg-cache-full-readback','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'producerAttempt':s['producerAttempt'],'producerToolSHA256':s['producerToolSHA256'],'producerStateSHA256':digest(state_raw),'helperSHA256':s['helper']['sha256'],'caches':results,'totalBytes':sum(c['bytes'] for c in results),'ready':True,'cacheClosureIndependentlyVerified':True,'twoFullReads':True,'packageJavaScriptExecuted':False,'packagesInstalled':False,'runtimeFrozen':False,'runtimeReady':False,'productAccepted':False,'modelsInvoked':False,'mutationsPerformed':False,'signalsSent':False,'resourcesRemoved':False,'rawPrivateDataExported':False}))
`;}
export function qualifyIndependentPGCacheReadback(r,s){
 need(r?.schemaVersion===1&&r.kind==='r29-independent-pg-cache-full-readback'&&r.ready===true&&r.cacheClosureIndependentlyVerified===true&&r.twoFullReads===true&&r.producerAttempt===s.producerAttempt&&r.producerToolSHA256===s.producerToolSHA256&&r.helperSHA256===s.helper.sha256&&H.test(r.producerStateSHA256??'')&&r.totalBytes===475914918,'QA_PG_CACHE_READBACK_BINDING_INVALID');
 need(Array.isArray(r.caches)&&r.caches.length===3,'QA_PG_CACHE_READBACK_SET_INVALID');
 for(let i=0;i<3;i++){const c=r.caches[i],expected=s.caches[i];for(const key of ['name','root','manifestPath','manifestSHA256','contentTreeSHA256','metadataSHA256','identity','files','bytes'])need(same(c[key],expected[key]),'QA_PG_CACHE_READBACK_ENTRY_INVALID');need(c.fullClosureDoubleRead===true&&c.rootOwnedReadOnly===true&&c.sharedHardlinks===false&&c.symlinks===false&&Number.isSafeInteger(c.entries)&&c.entries>c.files,'QA_PG_CACHE_READBACK_CLOSURE_INCOMPLETE');}
 need(['packageJavaScriptExecuted','packagesInstalled','runtimeFrozen','runtimeReady','productAccepted','modelsInvoked','mutationsPerformed','signalsSent','resourcesRemoved','rawPrivateDataExported'].every(k=>r[k]===false),'QA_PG_CACHE_READBACK_BOUNDARY_INVALID');return r;
}
export async function readIndependentPGCacheR29(action='inspect',deps={}){
 need(['inspect','read'].includes(action),'QA_PG_CACHE_READER_ACTION_INVALID');const d={readLocal:p=>readFile(p),readRoot:(scope,body)=>JSON.parse(remote(lanProfile,'jarvis-101',python(scope,body),true,{timeoutMs:150000})),now:Date.now,...deps};const scope=await independentPGCacheScope(d.readLocal);
 const gate=independentPGCacheReadGate;if(!gate.cleanupReference||!gate.cleanupSHA256)return {kind:'r29-independent-pg-cache-reader-preparation',ready:false,reason:'QA_PG_CACHE_R4_CLEANUP_GATE_NOT_FROZEN',scope,remoteReadPerformed:false,cacheClosureIndependentlyVerified:false,packagesInstalled:false,runtimeReady:false,productAccepted:false};
 const proofRaw=await d.readLocal(gate.cleanupReference);need(hash(proofRaw)===gate.cleanupSHA256,'QA_PG_CACHE_CLEANUP_PROOF_CHANGED');const proof=JSON.parse(proofRaw);need(proof.kind==='software-factory-r29-r4-build-independent-cleanup'&&proof.attempt===scope.producerAttempt&&proof.ready===true&&proof.cleanupIndependentlyVerified===true&&proof.protectedInventoryFullyVerified===true&&proof.fullQueueSQLVerified===true&&proof.modelsInvoked===false&&proof.productAccepted===false&&H.test(proof.buildHost?.stateSHA256??''),'QA_PG_CACHE_R4_CLEANUP_UNPROVEN');
 if(action==='inspect')return {ready:false,reason:'QA_PG_CACHE_REQUIRES_INDEPENDENT_READ',scope,cleanupProofQualified:true,remoteReadPerformed:false,runtimeReady:false,productAccepted:false};
 const helper=await d.readLocal(helperRef);need(hash(helper)===helperSHA,'QA_PG_CACHE_READER_LOCAL_HELPER_CHANGED');const host=qualifyIndependentPGCacheReadback(await d.readRoot({scope,helperBase64:helper.toString('base64'),producerStateSHA256:proof.buildHost.stateSHA256},independentPGCacheRootProgram()),scope);need(host.producerStateSHA256===proof.buildHost.stateSHA256,'QA_PG_CACHE_READER_TERMINAL_PROOF_CHANGED');
 need(Number.isFinite(Date.parse(host.at))&&d.now()-Date.parse(host.at)>=-30000&&d.now()-Date.parse(host.at)<300000,'QA_PG_CACHE_READBACK_STALE');
 return {...host,scope,cleanupProof:{path:gate.cleanupReference,sha256:gate.cleanupSHA256},producerCheck:{path:checkRef,sha256:checkSHA},remoteReadPerformed:true,runtimeManifestPin:null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const action=process.argv[2]??'inspect';need(process.argv.length<=3,'QA_PG_CACHE_READER_ARGUMENTS_INVALID');let r;try{r=await readIndependentPGCacheR29(action);}catch(e){r={kind:'r29-independent-pg-cache-reader-failure',ready:false,errorCode:/^QA_PG_[A-Z0-9_]+$/.test(e.message)?e.message:'QA_PG_CACHE_READ_FAILED',runtimeReady:false,productAccepted:false,rawErrorExported:false};process.exitCode=1;}
 if(action==='read'){const path='artifacts/software-factory/goals-r29/independent-pg-cache-readback-'+Date.now()+'-'+randomUUID()+'.json';const raw=JSON.stringify(r,null,2)+'\n';await writeFile(path,raw,{flag:'wx'});console.log(JSON.stringify({path,sha256:hash(raw),ready:r.ready,errorCode:r.errorCode,reason:r.reason}));}else console.log(JSON.stringify(r));
}
