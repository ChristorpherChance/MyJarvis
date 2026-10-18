import {createHash} from 'node:crypto';
const hash=(bytes:string)=>createHash('sha256').update(bytes,'utf8').digest('hex');
const reasons=new Set(['skill-not-supervisor-lesson','unmatched','archived','deprecated','superseded','counterexample-recorded','unknown-condition','project-mismatch','condition-mismatch','unverified','selected-cap-exceeded']);
const metric=(value:unknown)=>{const raw=JSON.stringify(value??null);return {UTF8bytes:Buffer.byteLength(raw),sha256:hash(raw),count:Array.isArray(value)?value.length:value==null?0:1};};
/** Frozen input is retained in intents. Only excluded, non-authoritative bodies are omitted. */
export function supervisorModelProjection(frozen:any){
 const exclusions=Array.isArray(frozen.experienceExclusions)?frozen.experienceExclusions:[];
 const metadata=exclusions.map((ref:any)=>({experienceId:ref.experienceId,revision:ref.revision,hash:ref.hash??hash(JSON.stringify(ref)),reason:reasons.has(ref.reason)?ref.reason:'unknown-condition'}));
 const {experienceAudit,...required}=frozen;
 const input={...required,experienceExclusions:metadata,experienceExclusionCount:frozen.experienceExclusionCount??exclusions.length};
 const components={goal:metric(input.goal),criteria:metric(input.criteria),corrections:metric(input.corrections),originals:metric(input.originals),selected:metric(input.experienceReferences),exclusions:metric(metadata),other:metric(Object.fromEntries(Object.entries(input).filter(([k])=>!['goal','criteria','corrections','originals','experienceReferences','experienceExclusions'].includes(k)))),total:metric(input)};
 const diagnostic={components,binding:frozen.binding?{goalRevision:Number.isSafeInteger(frozen.binding.goalRevision)?frozen.binding.goalRevision:null,sourceRunSHA256:typeof frozen.binding.runId==='string'?hash(frozen.binding.runId):null,resultHash:/^[a-f0-9]{64}$/.test(frozen.binding.resultHash)?frozen.binding.resultHash:null}:null,frozenSHA256:hash(JSON.stringify(frozen))};
 return {input,diagnostic,complete:components.total.UTF8bytes<=30000};
}
export function boundedSupervisorModelInput(frozen:any){const projected=supervisorModelProjection(frozen);if(!projected.complete)throw Object.assign(new Error('MODEL_CONTEXT_INCOMPLETE'),{code:'MODEL_CONTEXT_INCOMPLETE',contextDiagnostic:projected.diagnostic});return projected;}
