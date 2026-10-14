/** Retain transport evidence for necessary fresh reads. Never relabel parsed frames as wire bytes. */
import {open} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {canonical} from './run-factory-main-repair-r26.mjs';
import {safeReadLocal,settleEvidenceReads} from './factory-repair-evidence-read-r26.mjs';
import {verifyFactoryBoundProtectionContractR32R2,assertBoundProtectionActivationR32R2} from './verify-factory-bound-protection-contract-r32-r2.mjs';
import {withPlatform,lanProfile,python} from './managed-server-client.mjs';
import {nodeState,queueState} from './run-factory-supervision-probe.mjs';
const need=(v,c)=>{if(!v)throw Error(c)},sha=b=>createHash('sha256').update(b).digest('hex');
export const boundProtectionCaptureR32R2Sources=Object.freeze([
 {path:'scripts/verify-factory-bound-protection-contract-r32-r2.mjs',sha256:'58955c845603768c208364682bc991fead7a4a363191574ef78de442f3ac1d41'},
 {path:'scripts/run-factory-main-repair-r26.mjs',sha256:'31094cee37b1005e43d3e3810c9c7c3916fe31c6e8ed8c23185dbe6f78a3c462'},
 {path:'scripts/factory-repair-evidence-read-r26.mjs',sha256:'4db9e5fd1f80bde99ae53609a4bbad788d871ecc098528499cbf0c43d864911e'},
 {path:'scripts/managed-server-client.mjs',sha256:'e287938e2d79b0335523d3d198bd93b588541866cebc2c21d997ae6fce5e4a9f'},
 {path:'scripts/run-factory-supervision-probe.mjs',sha256:'699d0b9c06557bff28e855b9505c8b6ff7a4bb980a0755f1102c8a79e8cea402'},
 {path:'scripts/factory-bound-protection-capture-r32-r2.mjs'}
]);
async function privateWX(value){
 const raw=Buffer.from(JSON.stringify(value)+'\n'),path='.jarvis-dev/maintenance/r32-bound-protection-transport-'+Date.now()+'-'+randomUUID()+'.json',fd=await open(path,'wx',0o600);
 try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}
 return {path,sha256:sha(raw),bytes:raw.length};
}
/** Only these exact existing read targets. SSH output remains Buffer until its private WX save. */
export function boundProtectionCaptureRawTransportR32R2(target,p,program,{spawn=spawnSync}={}){
 need(['root','primary'].includes(target)&&typeof program==='string','R32_BOUND_CAPTURE_TRANSPORT_TARGET_INVALID');
 return spawn('ssh',['-F',lanProfile,'-o','BatchMode=yes',target==='root'?'jarvis-101':'jarvis-112','sudo -n python3 -'],{input:python(p,program),windowsHide:true,timeout:target==='root'?180000:45000,maxBuffer:2000000});
}
/** A failed save rejects the whole qualification. Private bytes are never returned publicly. */
export function createBoundProtectionCaptureR32R2({privateEvidence=privateWX,rawTransport=boundProtectionCaptureRawTransportR32R2,api,nodeState:readNode=nodeState,queueState:readQueue=queueState}={}){
 need(typeof privateEvidence==='function'&&typeof rawTransport==='function'&&typeof api==='function','R32_BOUND_CAPTURE_DEPENDENCY_REQUIRED');
 const rows=[];let failure=null,rootStage=0;const stages=['inventory-before','native-source','old-build','inventory-after'];
 const rootSources=['3fbdb6b634ad037723083550608f43b3c6e94210df5f5f56349d8605e3621b5b','b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78','e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba','3fbdb6b634ad037723083550608f43b3c6e94210df5f5f56349d8605e3621b5b'];
 let tail=Promise.resolve();const serial=fn=>(...args)=>{const next=tail.then(()=>fn(...args));tail=next.catch(()=>{});return next;};
 async function store(value,record){
  let ref;try{ref=await privateEvidence(value);need(ref&&typeof ref.path==='string'&&/^\.jarvis-dev\/maintenance\/[A-Za-z0-9._-]+\.json$/.test(ref.path)&&/^[a-f0-9]{64}$/.test(ref.sha256??''),'R32_BOUND_CAPTURE_SAVE_REF_INVALID');}catch(e){failure='R32_BOUND_CAPTURE_SAVE_FAILED';throw Object.assign(Error(failure),{cause:e});}
  rows.push({...record,privateEvidence:ref});
 }
 async function transport(target,p,program){
  need(!failure,'R32_BOUND_CAPTURE_PREVIOUS_CAPTURE_FAILED');const sourceSHA256=sha(program),parametersSHA256=sha(canonical(p));
  const stage=target==='root'?stages[rootStage++]:null;
  if(target==='root')need(stage&&sourceSHA256===rootSources[rootStage-1],'R32_BOUND_CAPTURE_ROOT_SOURCE_SEQUENCE_CHANGED');
  let r;try{r=await rawTransport(target,p,program);}catch(e){failure='R32_BOUND_CAPTURE_TRANSPORT_UNCONFIRMED';throw Object.assign(Error(failure),{cause:e});}
  const stdout=Buffer.from(r.stdout??''),stderr=Buffer.from(r.stderr??'');
  const record={target,stage,sourceSHA256,parametersSHA256,representation:'transport-stdout-bytes',wireBytes:true,status:r.status??null,responseSHA256:sha(stdout),bytes:stdout.length};
  await store({schemaVersion:1,kind:'r32-bound-protection-private-transport',...record,stdoutBase64:stdout.toString('base64'),stderrBase64:stderr.toString('base64'),signal:r.signal??null,errorCode:r.error?.code??null},record);
  if(r.status!==0){failure='R32_BOUND_CAPTURE_TRANSPORT_FAILED';throw Error(failure);}
  let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stdout));}catch{failure='R32_BOUND_CAPTURE_TRANSPORT_JSON_INVALID';throw Error(failure);}
  rows.at(-1).parsedFrameSHA256=sha(canonical(parsed)); // Original bytes and the frame actually consumed are distinct facts.
  return parsed;
 }
 async function parsed(target,fn,args,scope){
  need(!failure,'R32_BOUND_CAPTURE_PREVIOUS_CAPTURE_FAILED');let value;
  const sourceSHA256=boundProtectionCaptureR32R2Sources[target==='api'?3:4].sha256;
  try{value=await fn(...args);}catch(e){failure='R32_BOUND_CAPTURE_PARSED_READ_FAILED';await store({schemaVersion:1,kind:'r32-bound-protection-private-parsed-failure',target,scope,errorCode:failure},{target,stage:null,representation:'parsed-failure',wireBytes:false,sourceSHA256,parametersSHA256:sha(canonical(scope)),status:null,responseSHA256:null,bytes:null});throw Object.assign(Error(failure),{cause:e});}
  const raw=Buffer.from(JSON.stringify(value)),record={target,stage:null,representation:'parsed-json-frame',wireBytes:false,sourceSHA256,parametersSHA256:sha(canonical(scope)),status:null,responseSHA256:sha(raw),bytes:raw.length};
  await store({schemaVersion:1,kind:'r32-bound-protection-private-parsed-frame',...record,frame:value},record);return value;
 }
 const evidence=()=>({schemaVersion:1,kind:'r32-bound-protection-transport-evidence',consumerSHA256:boundProtectionCaptureR32R2Sources[0].sha256,originalResponsesRetained:true,apiFramesAreWireBytes:false,records:structuredClone(rows),captureComplete:failure===null,errorCode:failure});
 return {readRoot:serial((p,program)=>transport('root',p,program)),readPrimary:serial((p,program)=>transport('primary',p,program)),api:serial((...args)=>parsed('api',api,args,{path:args[0],method:args[2]??(args[1]===undefined?'GET':'POST')})),nodeState:serial(()=>parsed('nodeState',readNode,[],{scope:'native-node-identity'})),queueState:serial(()=>parsed('queueState',readQueue,[],{scope:'platform-queue-state'})),evidence,drain:async()=>{for(;;){const captured=tail;await captured;if(captured===tail)return;}}};
}
export async function verifyCapturedBoundProtectionR32R2(activation,deps){
 assertBoundProtectionActivationR32R2(activation); // No credentials, journal or transport before this gate.
 const d={readLocal:safeReadLocal,privateEvidence:privateWX,rawTransport:boundProtectionCaptureRawTransportR32R2,withPlatform,verify:verifyFactoryBoundProtectionContractR32R2,nodeState,queueState,...deps};
 const initial=await settleEvidenceReads(boundProtectionCaptureR32R2Sources.map(r=>()=>d.readLocal(r.path)));need(initial.every((b,i)=>!boundProtectionCaptureR32R2Sources[i].sha256||sha(b)===boundProtectionCaptureR32R2Sources[i].sha256),'R32_BOUND_CAPTURE_SOURCE_CHANGED');
 const run=async api=>{
  const capture=createBoundProtectionCaptureR32R2({...d,api});let value,failed;
  try{value=await d.verify(activation,{...d,...capture});}catch(e){failed=e;}finally{await capture.drain();}
  let finalSourcesVerified=false;try{const last=await settleEvidenceReads(boundProtectionCaptureR32R2Sources.map(r=>()=>d.readLocal(r.path)));finalSourcesVerified=initial.every((b,i)=>sha(b)===sha(last[i]));if(!finalSourcesVerified)failed=Error('R32_BOUND_CAPTURE_SOURCE_CHANGED_AFTER');}catch(e){failed=e;}
  const evidence={...capture.evidence(),captureHelperSHA256:sha(initial.at(-1)),sourcePins:boundProtectionCaptureR32R2Sources.map((r,i)=>({path:r.path,sha256:sha(initial[i])})),sourceBytesCheckedInitially:true,sourceBytesCheckedFinally:finalSourcesVerified};if(failed){failed.captureEvidence=evidence;throw failed;}
  try{need(evidence.captureComplete,'R32_BOUND_CAPTURE_SAVE_FAILED');const root=evidence.records.filter(r=>r.target==='root');need(root.length===4&&value.sourceReceipts?.length===4&&root.every((r,i)=>r.stage===value.sourceReceipts[i].stage&&r.sourceSHA256===value.sourceReceipts[i].actualProgramSHA256&&r.parametersSHA256===value.sourceReceipts[i].parametersSHA256&&r.parsedFrameSHA256===value.sourceReceipts[i].responseSHA256),'R32_BOUND_CAPTURE_CONSUMED_RESPONSE_UNBOUND');}catch(e){e.captureEvidence=evidence;throw e;}return {...value,transportEvidence:evidence};
 };
 return typeof d.api==='function'?run(d.api):d.withPlatform(({api})=>run(api));
}
