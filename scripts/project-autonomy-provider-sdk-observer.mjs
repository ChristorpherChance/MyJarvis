/** Root fixed Node Inspector observer. No Runtime.evaluate, model, or shell API.
 * Exact loaded-script hashes + function counts establish actual SDK invocation;
 * runtime/source/namespace provisioning and the complete provider gate are separate.
 */
import {readFile,lstat,readlink,readdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const POLICY='/etc/jarvis-development/project-autonomy/provider-sdk-observer.json';
const PORT=17994,MAX=8*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code)};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function evaluatePreciseCoverage(coverage,sources,expected){
 need(Array.isArray(coverage)&&Array.isArray(expected)&&expected.length>=3&&expected.length<=10,'SDK_COVERAGE_INPUT_INVALID');
 const roles=new Set(expected.map(v=>v.role));need(['gateway','loader','sdk-api'].every(v=>roles.has(v)),'SDK_REQUIRED_ROLE_MISSING');
 need(new Set(expected.map(v=>v.url)).size===expected.length,'SDK_SCRIPT_POLICY_DUPLICATE');
 const observations=[];
 for(const sealed of expected){
  need(['gateway','loader','sdk-api','sdk-context'].includes(sealed.role)&&hex(sealed.sha256)&&typeof sealed.url==='string'&&sealed.url.startsWith('file:///')&&Array.isArray(sealed.requiredFunctions)&&sealed.requiredFunctions.length>0&&sealed.requiredFunctions.length<=20&&sealed.requiredFunctions.every(v=>typeof v==='string'&&v.length>0&&v.length<200),'SDK_SCRIPT_POLICY_INVALID');
  need(sealed.role==='gateway'?/\/apps\/server\/dist\/(?:src\/)?modules\/ai\/pi-gateway\.js$/.test(sealed.url):sealed.role==='loader'?/\/apps\/server\/dist\/(?:src\/)?modules\/ai\/pi-loader\.js$/.test(sealed.url):sealed.url.includes('/@earendil-works/pi-ai/')&&(sealed.role==='sdk-context'||/\/api\/(?:openai-completions|anthropic-messages)\.js$/.test(sealed.url)),'SDK_ROLE_SOURCE_MISMATCH');
  const candidates=coverage.filter(v=>v.url===sealed.url);need(candidates.length===1,'SDK_LOADED_SCRIPT_NOT_UNIQUE');
  const actual=candidates[0],source=sources[actual.scriptId];need(typeof source==='string'&&Buffer.byteLength(source)<=MAX&&hash(Buffer.from(source,'utf8'))===sealed.sha256,'SDK_ACTUAL_SCRIPT_HASH_MISMATCH');
  const called=[];
  for(const name of sealed.requiredFunctions){
   const functions=actual.functions.filter(f=>f.functionName===name&&Array.isArray(f.ranges)&&f.ranges.length&&Number.isSafeInteger(f.ranges[0].count)&&f.ranges[0].count>0);
   need(functions.length>0,'SDK_REQUIRED_FUNCTION_NOT_INVOKED');
   called.push({name,calls:functions.reduce((n,f)=>n+f.ranges[0].count,0)});
  }
  observations.push({role:sealed.role,scriptSHA256:sealed.sha256,functions:called});
 }
 return {independentSdkInvocationObserved:true,observationMethod:'root-fixed-inspector-precise-coverage',scripts:observations,productAcceptance:false,trustedReceiptsCreated:0};
}

export async function verifyListenerOwnership(pid,proc,port=PORT){
 need(Number.isSafeInteger(pid)&&pid>1,'SDK_FACTORY_PID_INVALID');
 const tcp=await proc.read('/proc/net/tcp'),endpoint='0100007F:'+port.toString(16).padStart(4,'0').toUpperCase();
 const inodes=tcp.trim().split('\n').slice(1).map(l=>l.trim().split(/\s+/)).filter(p=>p[1]===endpoint&&p[3]==='0A').map(p=>p[9]);
 need(inodes.length===1,'SDK_INSPECTOR_LISTENER_NOT_UNIQUE');
 const links=await proc.links('/proc/'+pid+'/fd');need(links.includes('socket:['+inodes[0]+']'),'SDK_INSPECTOR_NOT_FACTORY_OWNED');return inodes[0];
}

class Inspector {
 constructor(socket){this.socket=socket;this.next=0;this.pending=new Map();socket.addEventListener('message',event=>{try{const text=String(event.data);need(Buffer.byteLength(text)<=MAX,'SDK_RPC_RESPONSE_TOO_LARGE');const message=JSON.parse(text);if(message.id&&this.pending.has(message.id)){const entry=this.pending.get(message.id);this.pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(Error('SDK_RPC_REJECTED')):entry.resolve(message.result);}}catch{this.fail('SDK_RPC_INVALID_RESPONSE')}});socket.addEventListener('close',()=>this.fail('SDK_RPC_DISCONNECTED'));socket.addEventListener('error',()=>this.fail('SDK_RPC_FAILED'));}
 fail(code){for(const v of this.pending.values()){clearTimeout(v.timer);v.reject(Error(code));}this.pending.clear();}
 rpc(method,params={}){need(['Debugger.enable','Debugger.getScriptSource','Profiler.enable','Profiler.startPreciseCoverage','Profiler.takePreciseCoverage','Profiler.stopPreciseCoverage'].includes(method),'SDK_RPC_METHOD_NOT_CLOSED');const id=++this.next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('SDK_RPC_TIMEOUT'))},10000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 close(){this.fail('SDK_RPC_CLOSED');this.socket.close();}
}
async function trusted(path,privateFile=false){need(path.startsWith('/')&&!path.split('/').includes('..'),'SDK_PATH_INVALID');let current='';for(const part of path.split('/').filter(Boolean)){current+='/'+part;const state=await lstat(current);need(state.uid===0&&!state.isSymbolicLink()&&!(state.mode&0o022),'SDK_ROOT_PATH_REQUIRED');if(state.isFile())need(state.nlink===1,'SDK_FILE_LINK_INVALID');}if(privateFile)need(!((await lstat(path)).mode&0o077),'SDK_PRIVATE_PATH_REQUIRED');}
async function privateRead(path,limit=MAX){await trusted(path,true);need((await lstat(path)).isFile(),'SDK_PRIVATE_FILE_INVALID');const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const state=await file.stat();need(state.isFile()&&state.uid===0&&state.nlink===1&&state.size>0&&state.size<=limit,'SDK_PRIVATE_FILE_INVALID');return await file.readFile();}finally{await file.close();}}
async function writeNew(path,value){const file=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}}
async function identity(pid){const text=await readFile('/proc/'+pid+'/stat','utf8');return text.slice(text.lastIndexOf(')')+1).trim().split(/\s+/)[19];}
export async function main(){
 need(process.platform==='linux'&&process.getuid()===0&&process.argv.length===2,'SDK_ROOT_FIXED_ENTRY_REQUIRED');await trusted(new URL(import.meta.url).pathname);const policy=JSON.parse((await privateRead(POLICY,64*1024)).toString());
 need(policy.schemaVersion===1&&policy.kind==='root-provider-sdk-observer-policy'&&policy.isolatedNamespacePrepared===true&&['sourceFingerprint','goalSpecHash'].every(k=>hex(policy[k]))&&/^[a-f0-9]{32}$/.test(policy.attempt??'')&&/^[a-f0-9]{32}$/.test(policy.probeNonce??'')&&/^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(policy.runId??''),'SDK_POLICY_NOT_PREPARED');
 const pid=policy.factoryPID;need(Number.isSafeInteger(pid)&&pid>1,'SDK_FACTORY_PID_INVALID');need(await readlink('/proc/self/ns/net')===policy.networkNamespaceIdentity&&await readlink('/proc/'+pid+'/ns/net')===policy.networkNamespaceIdentity&&await identity(pid)===policy.factoryProcessStartTicks,'SDK_FACTORY_PROCESS_CHANGED');
 await trusted(policy.evidenceDir,true);const binding=Object.fromEntries(['runId','attempt','sourceFingerprint','goalSpecHash','probeNonce'].map(k=>[k,policy[k]]));await writeNew(policy.evidenceDir+'/sdk-observer-started.json',{...binding,startedAt:new Date().toISOString()});
 const proc={read:p=>readFile(p,'utf8'),links:async p=>Promise.all((await readdir(p)).map(async n=>{try{return await readlink(p+'/'+n)}catch{return ''}}))};const inode=await verifyListenerOwnership(pid,proc);
 const response=await fetch('http://127.0.0.1:'+PORT+'/json/list',{redirect:'error',signal:AbortSignal.timeout(5000)});need(response.ok,'SDK_INSPECTOR_HTTP_FAILED');const text=await response.text();need(Buffer.byteLength(text)<=64*1024,'SDK_INSPECTOR_LIST_TOO_LARGE');const list=JSON.parse(text);need(Array.isArray(list)&&list.length===1&&list[0].type==='node','SDK_INSPECTOR_TARGET_NOT_UNIQUE');
 const endpoint=new URL(list[0].webSocketDebuggerUrl);need(endpoint.protocol==='ws:'&&endpoint.hostname==='127.0.0.1'&&Number(endpoint.port)===PORT&&/^\/[a-f0-9-]{36}$/.test(endpoint.pathname)&&!endpoint.search&&!endpoint.username&&!endpoint.password,'SDK_INSPECTOR_ENDPOINT_INVALID');need(await identity(pid)===policy.factoryProcessStartTicks&&await verifyListenerOwnership(pid,proc)===inode,'SDK_INSPECTOR_PROCESS_CHANGED');
 const socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('SDK_INSPECTOR_CONNECT_TIMEOUT'))},5000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('SDK_INSPECTOR_CONNECT_FAILED'))},{once:true});});const inspector=new Inspector(socket);
 try{
  await inspector.rpc('Debugger.enable');await inspector.rpc('Profiler.enable');await inspector.rpc('Profiler.startPreciseCoverage',{callCount:true,detailed:true,allowTriggeredUpdates:false});await writeNew(policy.evidenceDir+'/sdk-observer-ready.json',{...binding,readyAt:new Date().toISOString()});
  const until=Date.now()+600000;let finished;
  while(Date.now()<until){try{finished=JSON.parse((await privateRead(policy.evidenceDir+'/factory-probe-complete.json',64*1024)).toString());break}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,250));}
  need(finished&&Object.entries(binding).every(([k,v])=>finished[k]===v),'SDK_INTERNAL_PROBE_NOT_COMPLETED');const coverage=(await inspector.rpc('Profiler.takePreciseCoverage')).result;await inspector.rpc('Profiler.stopPreciseCoverage');
  const sources={};for(const item of coverage.filter(v=>policy.expectedScripts?.some(e=>e.url===v.url)))sources[item.scriptId]=(await inspector.rpc('Debugger.getScriptSource',{scriptId:item.scriptId})).scriptSource;
  const observations=evaluatePreciseCoverage(coverage,sources,policy.expectedScripts);need(await identity(pid)===policy.factoryProcessStartTicks&&await verifyListenerOwnership(pid,proc)===inode,'SDK_PROCESS_CHANGED_DURING_PROBE');const result={schemaVersion:1,kind:'root-provider-sdk-invocation',simulated:false,...binding,factoryPID:pid,factoryProcessStartTicks:policy.factoryProcessStartTicks,networkNamespaceIdentity:policy.networkNamespaceIdentity,finishedAt:new Date().toISOString(),...observations};await writeNew(policy.evidenceDir+'/sdk-invocation.json',result);const bytes=Buffer.from(JSON.stringify(result));process.stdout.write(JSON.stringify({kind:result.kind,evidenceSHA256:hash(bytes),bytes:bytes.length,trustedReceiptsCreated:0})+'\n');
 }finally{inspector.close();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(error=>{const code=/^[A-Z][A-Z0-9_]{1,100}$/.test(error.message)?error.message:'SDK_FIXED_OBSERVATION_FAILED';process.stdout.write(JSON.stringify({kind:'root-provider-sdk-observer-error',errorCode:code,trustedReceiptsCreated:0})+'\n');process.exitCode=1;});
