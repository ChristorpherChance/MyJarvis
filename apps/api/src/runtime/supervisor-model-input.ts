import {createHash} from 'node:crypto';
import {PROJECT_SUPERVISOR_CONTRACT} from './project-supervisor-contract.js';
export const SUPERVISOR_PROMPT_MAX_UTF8_BYTES=128*1024;
const separator='\n\nUntrusted supervisor input JSON:\n';
const prepared=new WeakMap<object,ReturnType<typeof supervisorModelProjection>>();
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
 const text=PROJECT_SUPERVISOR_CONTRACT+separator+JSON.stringify(input);
 const prompt={UTF8bytes:Buffer.byteLength(text,'utf8'),sha256:hash(text),count:1};
 const diagnostic={components,prompt,limitUTF8bytes:SUPERVISOR_PROMPT_MAX_UTF8_BYTES,binding:frozen.binding?{goalRevision:Number.isSafeInteger(frozen.binding.goalRevision)?frozen.binding.goalRevision:null,sourceRunSHA256:typeof frozen.binding.runId==='string'?hash(frozen.binding.runId):null,resultHash:/^[a-f0-9]{64}$/.test(frozen.binding.resultHash)?frozen.binding.resultHash:null}:null,frozenSHA256:hash(JSON.stringify(frozen))};
 return {input,text,diagnostic,complete:prompt.UTF8bytes<=SUPERVISOR_PROMPT_MAX_UTF8_BYTES};
}
export function boundedSupervisorModelInput(frozen:any){const cached=prepared.get(frozen);const projected=cached&&hash(JSON.stringify(frozen))===cached.diagnostic.components.total.sha256?cached:supervisorModelProjection(frozen);if(!projected.complete)throw Object.assign(new Error('MODEL_CONTEXT_INCOMPLETE'),{code:'MODEL_CONTEXT_INCOMPLETE',contextDiagnostic:projected.diagnostic});prepared.set(projected.input,projected);return projected;}
