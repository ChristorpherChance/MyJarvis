/** Project-scoped Claude receipts. Never sends transcript, prompts, settings or credentials. */
import {open,readFile,writeFile,rename,mkdir,readdir,lstat,realpath,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash,randomBytes,sign} from 'node:crypto';
import {resolve,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

export function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(v=>canonical(v??null)).join(',')+']';return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
const hash=value=>createHash('sha256').update(value).digest('hex');
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e12;
export function receiptFromLine(line,options){
 if(!line||line.type!=='assistant'||line.cwd&&resolve(line.cwd)!==options.workspace)return null;
 const message=line.message,usage=message?.usage;
 if(typeof message?.id!=='string'||!message.id||typeof message.model!=='string'||!message.model||typeof line.sessionId!=='string'||!line.sessionId||!Number.isFinite(Date.parse(line.timestamp)))return null;
 const rawId=`cli:claude:${line.sessionId}:${message.id}`,sourceRecordId=rawId.length<=300?rawId:'cli:claude:sha256:'+hash(rawId);
 const unknown=()=>({source:'external-cli',sourceRecordId,provider:'claude-cli',model:message.model,measuredAt:new Date(line.timestamp).toISOString(),projectId:options.projectId,machineId:options.machineId,executorId:options.executorId,scenario:'development',usageKind:'assistant-message-unreported',costUSD:null,costKind:'unavailable',measurementStatus:'unknown',sessionId:line.sessionId});
 if(!usage||!count(usage.input_tokens)||!count(usage.output_tokens))return unknown();
 const read=usage.cache_read_input_tokens??0,write=usage.cache_creation_input_tokens??0;
 if(!count(read)||!count(write))return unknown();
 const input=usage.input_tokens+read+write,output=usage.output_tokens;
 if(!count(input)||!count(input+output))return unknown();
 return {source:'external-cli',sourceRecordId,provider:'claude-cli',model:message.model,measuredAt:new Date(line.timestamp).toISOString(),projectId:options.projectId,machineId:options.machineId,executorId:options.executorId,scenario:'development',usageKind:'assistant-message',inputTokens:input,outputTokens:output,cacheReadTokens:read,cacheWriteTokens:write,totalTokens:input+output,costUSD:null,costKind:'unavailable',measurementStatus:'reported',sessionId:line.sessionId};
}
export async function collectReceipts(options){
 const root=await realpath(options.receipts);if(root!==resolve(options.receipts))throw Error('RECEIPT_DIRECTORY_LINK_REFUSED');
 const names=(await readdir(root)).filter(n=>n.endsWith('.jsonl')).sort();if(names.length>5000)throw Error('RECEIPT_FILE_LIMIT');
 const byId=new Map(),quietIds=new Set(),stats={files:0,liveFiles:0,malformedLines:0,foreignFiles:0,records:0};
 for(const name of names){
  const file=join(root,name),st=await lstat(file);if(st.isSymbolicLink()||!st.isFile())continue;
  if(st.size>50*1024*1024)throw Error('RECEIPT_FILE_TOO_LARGE');
  const quiet=(options.now??Date.now())-st.mtimeMs>=(options.stabilityMs??90000);
  if(!quiet)stats.liveFiles++;
  stats.files++;const fileRecords=new Map();let foreign=false;
  const input=createReadStream(file,{encoding:'utf8'}),lines=createInterface({input,crlfDelay:Infinity});
  try{for await(const raw of lines){
   if(Buffer.byteLength(raw)>2*1024*1024){stats.malformedLines++;continue;}
   let line;try{line=JSON.parse(raw);}catch{stats.malformedLines++;continue;}
   if(typeof line.cwd==='string'&&resolve(line.cwd)!==options.workspace){foreign=true;continue;}
   const item=receiptFromLine(line,options);if(!item)continue;
   const old=fileRecords.get(item.sourceRecordId);
   // Claude repeats one message's cumulative receipt in streaming snapshots.
   // Keep the most complete snapshot; never add repeated message IDs together.
   if(!old||(item.totalTokens??-1)>(old.totalTokens??-1)||(item.totalTokens??-1)===(old.totalTokens??-1)&&item.measuredAt<old.measuredAt)fileRecords.set(item.sourceRecordId,item);
  }}finally{lines.close();input.destroy();}
  const after=await lstat(file),unchanged=after.size===st.size&&after.mtimeMs===st.mtimeMs;
  if(!unchanged&&quiet)stats.liveFiles++;
  // A mixed-workspace transcript is not an authorised source for this observer.
  if(foreign){stats.foreignFiles++;continue;}
  for(const [id,item]of fileRecords){const old=byId.get(id);if(!old||(item.totalTokens??-1)>(old.totalTokens??-1)){byId.set(id,item);if(quiet&&unchanged)quietIds.add(id);else quietIds.delete(id);}}
 }
 stats.records=byId.size;return {items:[...byId.values()].sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt)||a.sourceRecordId.localeCompare(b.sourceRecordId)),quietIds,stats};
}
async function privateRead(path){const st=await lstat(path);if(st.isSymbolicLink()||!st.isFile()||st.size>25*1024*1024)throw Error('PRIVATE_FILE_INVALID');if(process.platform!=='win32'&&(st.mode&0o077))throw Error('PRIVATE_FILE_PERMISSIONS');return JSON.parse(await readFile(path,'utf8'));}
async function saveState(path,state){const next=path+'.'+randomBytes(12).toString('hex')+'.next';await writeFile(next,JSON.stringify(state)+'\n',{mode:0o600,flag:'wx'});try{await rename(next,path);}catch(error){await unlink(next).catch(()=>{});throw error;}}
async function acquireLock(path){
 try{const lock=await open(path,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,at:Date.now()}));return lock;}
 catch(error){if(error.code!=='EEXIST')throw error;const old=await privateRead(path);if(!Number.isSafeInteger(old.pid)||old.pid<1)throw Error('OBSERVER_LOCK_INVALID');let live=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')live=false;}if(live)throw Error('OBSERVER_ALREADY_RUNNING');await unlink(path);return acquireLock(path);}
}
export async function sendReceipts(config,items,fetchImpl=fetch){
 if(!config.agentId||!config.privateKey)throw Error('AGENT_NOT_PAIRED');
 const base=new URL(config.apiUrl);if(base.protocol!=='https:'||base.username||base.password)throw Error('INVALID_CENTRAL_URL');
 const path=`/api/v1/agents/${encodeURIComponent(config.agentId)}/usage`,body={items},timestamp=new Date().toISOString(),nonce=randomBytes(24).toString('base64url');
 const signature=sign(null,Buffer.from(['POST',path,timestamp,nonce,hash(canonical(body))].join('\n')),config.privateKey).toString('base64url');
 const response=await fetchImpl(new URL(path,base),{method:'POST',body:canonical(body),headers:{'content-type':'application/json','x-jarvis-timestamp':timestamp,'x-jarvis-nonce':nonce,'x-jarvis-signature':signature},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('USAGE_HTTP_'+response.status);const result=await response.json(),data=result?.data;
 if(result?.version!==1||data?.accepted!==items.length||!Array.isArray(data.items)||data.items.length!==items.length||data.items.some(receipt=>!(receipt?.recorded===true||receipt?.recorded===false&&receipt?.duplicate===true)))throw Error('INVALID_USAGE_RECEIPT');
 return data;
}
export function stableCandidates(collected,state,now=Date.now(),stabilityMs=90000){
 state.pendingSnapshots??={};const pending=[],changed=[];
 for(const item of collected.items){
  const fingerprint=hash(canonical(item)),previous=state.receipts[item.sourceRecordId];
  if(previous){if(previous!==fingerprint)changed.push(item.sourceRecordId);continue;}
  const snapshot=state.pendingSnapshots[item.sourceRecordId];
  if(!snapshot||snapshot.fingerprint!==fingerprint)state.pendingSnapshots[item.sourceRecordId]={fingerprint,since:now};
  const current=state.pendingSnapshots[item.sourceRecordId];
  if(collected.quietIds.has(item.sourceRecordId)||now-current.since>=stabilityMs)pending.push(item);
 }
 return {pending,changed};
}
export async function observeOnce(options){
 if(!/^[0-9a-f-]{36}$/i.test(options.projectId)||!options.workspace||!options.receipts)throw Error('INVALID_PROJECT_SCOPE');
 const config=await privateRead(resolve(options.config)),workspace=await realpath(options.workspace);
 if(workspace!==resolve(options.workspace)||!(config.workspaceRoots??[]).some(root=>workspace.startsWith(resolve(root)+'/')))throw Error('WORKSPACE_NOT_BOUND_TO_NODE');
 const template=(config.templates??[]).find(t=>t.engine==='claude'&&t.machineId===config.machineId&&workspace.startsWith(resolve(t.workspaceRoot)+'/'));if(!template)throw Error('CLAUDE_TEMPLATE_NOT_BOUND');
 const expected=workspace.replaceAll('/','-');if(basename(resolve(options.receipts))!==expected)throw Error('RECEIPT_NAMESPACE_MISMATCH');
 const statePath=resolve(options.state);await mkdir(dirname(statePath),{recursive:true,mode:0o700});
 const lock=await acquireLock(statePath+'.lock');
 try{
  let state={version:1,projectId:options.projectId,workspace,receipts:{}};
  try{state=await privateRead(statePath);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(state.version!==1||state.projectId!==options.projectId||state.workspace!==workspace)throw Error('OBSERVER_STATE_SCOPE_CHANGED');
  const collected=await collectReceipts({...options,workspace,machineId:config.machineId,executorId:template.id});
  const {pending,changed}=stableCandidates(collected,state,options.now,options.stabilityMs);
  // Persist stability checkpoints even while a session keeps appending new messages.
  state.updatedAt=new Date().toISOString();await saveState(statePath,state);
  let submitted=0;for(let i=0;i<pending.length;i+=100){const batch=pending.slice(i,i+100);await sendReceipts(config,batch);for(const item of batch){state.receipts[item.sourceRecordId]=hash(canonical(item));delete state.pendingSnapshots[item.sourceRecordId];}submitted+=batch.length;state.updatedAt=new Date().toISOString();await saveState(statePath,state);}
  return {...collected.stats,submitted,waitingForStableReceipts:Object.keys(state.pendingSnapshots).length,previouslyRecorded:Object.keys(state.receipts).length,changedReceipts:changed.length,needsReview:changed.length>0};
 }finally{await lock.close();await unlink(statePath+'.lock').catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),get=key=>{const n=args.indexOf('--'+key);return n<0?undefined:args[n+1];};
 try{const result=await observeOnce({config:get('config'),projectId:get('project-id'),workspace:get('workspace'),receipts:get('receipts'),state:get('state')});console.log(JSON.stringify(result));}
 catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'OBSERVER_FAILED'}));process.exitCode=1;}
}
