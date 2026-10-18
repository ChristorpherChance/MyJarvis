import {createHash} from 'node:crypto';
import {PROJECT_SUPERVISOR_CONTRACT} from './project-supervisor-contract.js';
export const SUPERVISOR_PROMPT_MAX_UTF8_BYTES=128*1024;
const separator='\n\nUntrusted supervisor input JSON:\n';
const prepared=new WeakMap<object,ReturnType<typeof supervisorModelProjection>>();
const hash=(bytes:string)=>createHash('sha256').update(bytes,'utf8').digest('hex');
const reasons=new Set(['skill-not-supervisor-lesson','unmatched','archived','deprecated','superseded','counterexample-recorded','unknown-condition','project-mismatch','condition-mismatch','unverified','selected-cap-exceeded']);
const metric=(value:unknown)=>{const raw=JSON.stringify(value??null);return {UTF8bytes:Buffer.byteLength(raw),sha256:hash(raw),count:Array.isArray(value)?value.length:value==null?0:1};};
const provenanceKeys=['sourceRunId','sourceResultHash','sourceGoalRevision','sourceSupervisorRevision','sourceTaskRevision'] as const;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function evidenceProjectionInvalid():never{throw Object.assign(new Error('SUPERVISOR_EVIDENCE_PROJECTION_INVALID'),{code:'SUPERVISOR_EVIDENCE_PROJECTION_INVALID'});}
/** Remove duplicate model serialization only. The complete intent audit remains frozen and runtime-verified. */
function projectEvidence(frozen:any){
 const {evidenceHistory,...required}=frozen;
 if(evidenceHistory===undefined&&frozen.evidenceAuditHash===undefined)return required;
 const originalHash=evidenceHistory?.sha256??frozen.evidenceAuditHash;
 if(typeof originalHash!=='string'||!/^[a-f0-9]{64}$/.test(originalHash)||!Array.isArray(frozen.originals)||!Array.isArray(frozen.evidenceTable?.sources))evidenceProjectionInvalid();
 if(evidenceHistory!==undefined){
  if(!evidenceHistory||evidenceHistory.version!==1||!Array.isArray(evidenceHistory.items))evidenceProjectionInvalid();
  const {sha256,...unsigned}=evidenceHistory;
  if(hash(JSON.stringify(unsigned))!==sha256||frozen.evidenceAuditHash!==undefined&&frozen.evidenceAuditHash!==sha256||!same(evidenceHistory.sources,frozen.evidenceTable.sources))evidenceProjectionInvalid();
 }
 const sources=new Map<string,any>();
 for(const source of frozen.evidenceTable.sources){if(typeof source?.runId!=='string'||!source.runId||sources.has(source.runId)||typeof source.resultHash!=='string'||!/^[a-f0-9]{64}$/.test(source.resultHash)||![source.goalRevision,source.supervisorRevision,source.expectedTaskRevision].every(v=>Number.isSafeInteger(v)&&v>0))evidenceProjectionInvalid();sources.set(source.runId,source);}
 const originals=frozen.originals.map((original:any)=>{
  if(!original||typeof original.path!=='string'||!original.path||original.verified!==true||typeof original.content!=='string'||!Number.isSafeInteger(original.size)||original.size<1||original.size!==Buffer.byteLength(original.content,'utf8')||hash(original.content)!==original.sha256||!Array.isArray(original.sourceBindings)||!original.sourceBindings.length)evidenceProjectionInvalid();
  for(const binding of original.sourceBindings){const source=sources.get(binding?.sourceRunId);if(!source||binding.sourceResultHash!==source.resultHash||binding.sourceGoalRevision!==source.goalRevision||binding.sourceSupervisorRevision!==source.supervisorRevision||binding.sourceTaskRevision!==source.expectedTaskRevision)evidenceProjectionInvalid();}
  const first=original.sourceBindings[0],present=provenanceKeys.filter(k=>Object.hasOwn(original,k));
  if(present.length!==0&&present.length!==provenanceKeys.length||present.some(k=>original[k]!==first[k])||evidenceHistory!==undefined&&present.length!==provenanceKeys.length)evidenceProjectionInvalid();
  const projected={...original};for(const k of provenanceKeys)delete projected[k];
  // The first source binding reconstructs every omitted field byte-for-byte.
  if(present.length&& !same(Object.fromEntries(provenanceKeys.map(k=>[k,original[k]])),Object.fromEntries(provenanceKeys.map(k=>[k,first[k]]))))evidenceProjectionInvalid();
  return projected;
 });
 const metadata=originals.map(({path,sha256,size,sourceBindings}:any)=>({path,sha256,size,sourceBindings}));
 if(evidenceHistory!==undefined&&!same(evidenceHistory.items,metadata))evidenceProjectionInvalid();
 return {...required,originals,evidenceAuditHash:originalHash};
}
/** Frozen input stays complete. Omit excluded bodies and strictly reconstructible duplicate audit fields only. */
export function supervisorModelProjection(frozen:any){
 const exclusions=Array.isArray(frozen.experienceExclusions)?frozen.experienceExclusions:[];
 const metadata=exclusions.map((ref:any)=>({experienceId:ref.experienceId,revision:ref.revision,hash:ref.hash??hash(JSON.stringify(ref)),reason:reasons.has(ref.reason)?ref.reason:'unknown-condition'}));
 const {experienceAudit,...required}=projectEvidence(frozen);
 const input={...required,experienceExclusions:metadata,experienceExclusionCount:frozen.experienceExclusionCount??exclusions.length};
 const components={goal:metric(input.goal),criteria:metric(input.criteria),corrections:metric(input.corrections),originals:metric(input.originals),selected:metric(input.experienceReferences),exclusions:metric(metadata),other:metric(Object.fromEntries(Object.entries(input).filter(([k])=>!['goal','criteria','corrections','originals','experienceReferences','experienceExclusions'].includes(k)))),total:metric(input)};
 const text=PROJECT_SUPERVISOR_CONTRACT+separator+JSON.stringify(input);
 const prompt={UTF8bytes:Buffer.byteLength(text,'utf8'),sha256:hash(text),count:1};
 const diagnostic={components,prompt,limitUTF8bytes:SUPERVISOR_PROMPT_MAX_UTF8_BYTES,binding:frozen.binding?{goalRevision:Number.isSafeInteger(frozen.binding.goalRevision)?frozen.binding.goalRevision:null,sourceRunSHA256:typeof frozen.binding.runId==='string'?hash(frozen.binding.runId):null,resultHash:/^[a-f0-9]{64}$/.test(frozen.binding.resultHash)?frozen.binding.resultHash:null}:null,frozenSHA256:hash(JSON.stringify(frozen))};
 return {input,text,diagnostic,complete:prompt.UTF8bytes<=SUPERVISOR_PROMPT_MAX_UTF8_BYTES};
}
export function boundedSupervisorModelInput(frozen:any){const cached=prepared.get(frozen);const projected=cached&&hash(JSON.stringify(frozen))===cached.diagnostic.components.total.sha256?cached:supervisorModelProjection(frozen);if(!projected.complete)throw Object.assign(new Error('MODEL_CONTEXT_INCOMPLETE'),{code:'MODEL_CONTEXT_INCOMPLETE',contextDiagnostic:projected.diagnostic});prepared.set(projected.input,projected);return projected;}
