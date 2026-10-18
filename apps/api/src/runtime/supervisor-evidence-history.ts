import {createHash} from 'node:crypto';
import {supervisorEvidencePath,type SupervisorEvidenceRef} from './supervisor-evidence.js';

// Bounds apply to one immutable model snapshot; nothing is silently truncated.
export const SUPERVISOR_EVIDENCE_HISTORY_MAX_RUNS=20;
export const SUPERVISOR_EVIDENCE_HISTORY_MAX_ITEMS=120;
export const SUPERVISOR_EVIDENCE_HISTORY_MAX_BYTES=256*1024;
export interface EvidenceHistoryBinding {
 sessionId:string;ownerId:string;scope:string;projectId:string;taskId:string;machineId:string;
 executorId:string;workspace:string;nativeSessionId:string;goalRevision:number;taskRevision:number;
 decisionContextRevision:number;
}
export interface EvidenceHistoryAccess {
 binding:EvidenceHistoryBinding;
 readRun:(id:string)=>any;
 ownsRun:(run:any)=>boolean;
 isAuthorized:()=>boolean;
 refsForRun:(run:any)=>SupervisorEvidenceRef[];
 resolveEvidence:(runId:string,refs:SupervisorEvidenceRef[])=>{items:any[];missing:any[]};
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const normal=new Set(['success','failed','round-limit','timeout','budget-exhausted','awaiting-cost','blocked']);
function reject(code:string):never{throw Object.assign(new Error(code),{code});}
const pair=(ref:SupervisorEvidenceRef)=>JSON.stringify([ref.path,ref.sha256]);
function authorized(access:EvidenceHistoryAccess){if(!access.isAuthorized())reject('SUPERVISOR_EVIDENCE_HISTORY_STALE');}
function source(run:any,id:string,access:EvidenceHistoryAccess,stoppedBoundary=false){
 const b=access.binding,r=run?.result;
 const proof=r?.terminationProof,stop=r?.stopConfirmation;
 const stopped=stoppedBoundary&&run?.stopRequested===true&&run.status==='cancelled'&&r?.outcome==='cancelled'&&
  stop?.source==='bound-signed-agent'&&stop.runId===id&&stop.agentId===run.agentId&&stop.stopRequested===true&&
  proof?.childExitObserved===true&&proof.stdioClosed===true&&proof.groupEmpty===true&&proof.invocationId===r?.executionMetadata?.invocationId;
 if(!run||run.id!==id||!access.ownsRun(run)||run.ownerId!==undefined&&run.ownerId!==b.ownerId||
  run.domain!=='tasks'||run.taskId!==b.taskId||run.objectId!==b.taskId||run.projectId!==b.projectId||
  run.scope!==b.scope||run.machineId!==b.machineId||run.executorId!==b.executorId||run.workspace!==b.workspace||
  !r||r.source!=='signed-agent'||r.lateEvidenceOnly||(!stopped&&(run.stopRequested||!normal.has(r.outcome)))||
  (stoppedBoundary&&!stopped)||run.status!==(r.outcome==='success'?'succeeded':r.outcome)||!b.nativeSessionId||r.sessionId!==b.nativeSessionId||
  run.sessionId!==undefined&&run.sessionId!==b.nativeSessionId)reject('SUPERVISOR_EVIDENCE_HISTORY_BINDING');
 return {runId:id,resultHash:hash(r),outcome:String(r.outcome),nativeSessionId:b.nativeSessionId};
}
function supervisor(run:any,access:EvidenceHistoryAccess){
 const s=run.supervisor;
 if(!s||s.sessionId!==access.binding.sessionId||!Number.isSafeInteger(s.goalRevision)||s.goalRevision<1||
  !Number.isSafeInteger(s.supervisorRevision)||s.supervisorRevision<1||
  !Number.isSafeInteger(s.expectedTaskRevision)||s.expectedTaskRevision<1||s.expectedTaskRevision>access.binding.taskRevision)
  reject('SUPERVISOR_EVIDENCE_HISTORY_BINDING');
 const hasRun=s.consumedRunId!==null&&s.consumedRunId!==undefined;
 const hasHash=s.resultHash!==null&&s.resultHash!==undefined;
 if(hasRun!==hasHash||hasRun&&(typeof s.consumedRunId!=='string'||!s.consumedRunId||!sha(s.resultHash)))reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
 return {goalRevision:Number(s.goalRevision),supervisorRevision:Number(s.supervisorRevision),expectedTaskRevision:Number(s.expectedTaskRevision),previousRunId:hasRun?s.consumedRunId as string:null,previousResultHash:hasHash?s.resultHash as string:null};
}
/** Re-read accepted receipts through the existing verifier, never from report aliases or filesystem paths. */
export function resolveSupervisorEvidenceHistory(currentRunId:string,access:EvidenceHistoryAccess){
 authorized(access);
 const b=access.binding,sources:any[]=[],items:any[]=[],declared:SupervisorEvidenceRef[]=[],missing:any[]=[];
 const byPath=new Map<string,string>(),byPair=new Map<string,any>(),declaredPairs=new Set<string>(),seen=new Set<string>();
 let runId:string|null=currentRunId,expectedHash:string|null=null,total=0,boundary:any=null,handoff:any=null;
 while(runId){
  authorized(access);
  if(seen.has(runId))reject('SUPERVISOR_EVIDENCE_HISTORY_CYCLE');
  seen.add(runId);
  const run=access.readRun(runId);
  if(handoff){
   if(handoff.sourceRunId!==runId||handoff.sourceHash!==expectedHash||handoff.reason!=='verified-child-termination'||typeof handoff.previousSessionId!=='string'||!handoff.previousSessionId||handoff.previousSessionId===b.nativeSessionId)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
   const priorAccess={...access,binding:{...b,nativeSessionId:handoff.previousSessionId}};
   const identity=source(run,runId,priorAccess,true);if(identity.resultHash!==expectedHash)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
   const prior=supervisor(run,priorAccess);if(prior.goalRevision>b.goalRevision)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
   boundary={...identity,goalRevision:prior.goalRevision,reason:'verified-native-handoff'};break;
  }
  const identity=source(run,runId,access);
  if(expectedHash!==null&&identity.resultHash!==expectedHash)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
  // A legitimately revised goal may point to its old source. Verify that boundary but never import it.
  if(sources.length&&(!run.supervisor||run.supervisor.goalRevision!==b.goalRevision)){
   if(run.supervisor){const prior=supervisor(run,access);if(prior.goalRevision>=b.goalRevision)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');}
   boundary={...identity,goalRevision:run.supervisor?.goalRevision??null,reason:run.supervisor?'different-goal':'legacy-source'};break;
  }
  const sup=supervisor(run,access);
  if(sup.goalRevision!==b.goalRevision)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
  if(sources.length>=SUPERVISOR_EVIDENCE_HISTORY_MAX_RUNS)reject('SUPERVISOR_EVIDENCE_HISTORY_LIMIT');
  const origin={...identity,...sup};sources.push(origin);
  const refs=access.refsForRun(run);
  if(!Array.isArray(refs)||refs.length>30)reject('SUPERVISOR_EVIDENCE_HISTORY_REFERENCE');
  const sourcePairs=new Set<string>();
  for(const ref of refs){
   supervisorEvidencePath(ref?.path);if(!sha(ref.sha256)||sourcePairs.has(pair(ref)))reject('SUPERVISOR_EVIDENCE_HISTORY_REFERENCE');
   sourcePairs.add(pair(ref));
   if(byPath.has(ref.path)&&byPath.get(ref.path)!==ref.sha256)reject('SUPERVISOR_EVIDENCE_HISTORY_CONFLICT');
   byPath.set(ref.path,ref.sha256);
   if(!declaredPairs.has(pair(ref))){declaredPairs.add(pair(ref));declared.push({path:ref.path,sha256:ref.sha256});}
  }
  const resolved=access.resolveEvidence(runId,refs);
  if(!resolved||!Array.isArray(resolved.items)||!Array.isArray(resolved.missing))reject('SUPERVISOR_EVIDENCE_HISTORY_REFERENCE');
  for(const entry of resolved.missing)missing.push({sourceRunId:runId,sourceResultHash:identity.resultHash,sourceGoalRevision:sup.goalRevision,path:String(entry?.path??''),reason:String(entry?.reason??'receipt-missing'),current:runId===currentRunId});
  const verifiedPairs=new Set<string>();
  for(const item of resolved.items){
   const content=Buffer.isBuffer(item.content)?item.content:typeof item.content==='string'?Buffer.from(item.content,'utf8'):null;
   if(item.verified!==true||!sourcePairs.has(pair(item))||verifiedPairs.has(pair(item))||!content||content.length!==item.size||digest(content)!==item.sha256||Buffer.from(content.toString('utf8'),'utf8').compare(content)!==0)reject('SUPERVISOR_EVIDENCE_HISTORY_REFERENCE');
   verifiedPairs.add(pair(item));
   const provenance={sourceRunId:runId,sourceResultHash:identity.resultHash,sourceGoalRevision:sup.goalRevision,sourceSupervisorRevision:sup.supervisorRevision,sourceTaskRevision:sup.expectedTaskRevision};
   const old=byPair.get(pair(item));
   if(old){old.sourceBindings.push(provenance);continue;}
   total+=content.length;
   if(items.length>=SUPERVISOR_EVIDENCE_HISTORY_MAX_ITEMS||total>SUPERVISOR_EVIDENCE_HISTORY_MAX_BYTES)reject('SUPERVISOR_EVIDENCE_HISTORY_LIMIT');
   const original={path:item.path,sha256:item.sha256,size:item.size,content:content.toString('utf8'),verified:true as const,...provenance,sourceBindings:[provenance]};
   byPair.set(pair(item),original);items.push(original);
  }
  // Missing current receipts remain missing even if an older source has identical path/hash bytes.
  for(const ref of refs)if(!verifiedPairs.has(pair(ref))&&!resolved.missing.some(m=>m.path===ref.path))missing.push({sourceRunId:runId,sourceResultHash:identity.resultHash,sourceGoalRevision:sup.goalRevision,path:ref.path,reason:'receipt-missing',current:runId===currentRunId});
  runId=sup.previousRunId;expectedHash=sup.previousResultHash;handoff=run.nativeLineage??null;
  if(handoff&&!runId)reject('SUPERVISOR_EVIDENCE_HISTORY_SOURCE');
 }
 authorized(access);
 const evidenceReferences=items.map(({path,sha256})=>({path,sha256}));
 const table={declared,verified:evidenceReferences,missing,complete:declared.length>0&&missing.length===0&&declared.every(ref=>byPair.has(pair(ref))),sources: sources.map(x=>({...x})),boundary};
 const unsigned={version:1 as const,binding:{...b},currentRunId,sources,boundary,items:items.map(({path,sha256,size,sourceBindings})=>({path,sha256,size,sourceBindings})),missing};
 return {originals:items,evidenceReferences,evidenceTable:table,history:{...unsigned,sha256:hash(unsigned)}};
}
/** Prepared/complete model intents never acquire new evidence or authority after their snapshot was frozen. */
export function assertSupervisorEvidenceHistoryCurrent(history:any,access:EvidenceHistoryAccess){
 authorized(access);
 if(!history||history.version!==1||!sha(history.sha256)||typeof history.currentRunId!=='string')reject('SUPERVISOR_EVIDENCE_HISTORY_STALE');
 const {sha256,...unsigned}=history;
 if(hash(unsigned)!==sha256||hash(history.binding)!==hash(access.binding))reject('SUPERVISOR_EVIDENCE_HISTORY_STALE');
 const current=resolveSupervisorEvidenceHistory(history.currentRunId,access);
 if(current.history.sha256!==sha256)reject('SUPERVISOR_EVIDENCE_HISTORY_STALE');
 return current;
}
