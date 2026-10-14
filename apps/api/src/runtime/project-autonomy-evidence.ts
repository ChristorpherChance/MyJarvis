import {createHash} from 'node:crypto';
import {z} from 'zod';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.string().trim().min(1).max(200);
const date=z.iso.datetime({offset:true});
const relativePath=z.string().min(1).max(2000).refine(value=>!/[\u0000-\u001f\u007f:]/.test(value)&&!value.startsWith('/')&&!value.startsWith('\\')&&!value.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'));
const workspace=z.string().min(1).max(2000).refine(value=>!/[\u0000-\u001f\u007f]/.test(value)&&(/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value))&&!value.split(/[\\/]/).some(part=>part==='.'||part==='..'));
const testCounts=z.object({total:z.number().int().positive().max(1e9),passed:z.number().int().nonnegative().max(1e9),failed:z.number().int().nonnegative().max(1e9),skipped:z.number().int().nonnegative().max(1e9),unknown:z.number().int().nonnegative().max(1e9)}).strict();
const checkSchema=z.object({id,command:z.string().trim().min(1).max(4000),required:z.boolean(),executed:z.boolean(),status:z.enum(['pass','fail','skip','unknown']),exitCode:z.number().int().min(-1).max(255).nullable(),evidenceSha256:hash,tests:testCounts.optional()}).strict();
const artifactSchema=z.object({path:relativePath,sha256:hash,bytes:z.number().int().nonnegative().max(1e12)}).strict();
export const autonomyPrerequisiteIds=['provider','native-execution','native-recovery','ui-comparison','regression','performance-data','agent-evaluation','agent-promotion','jarvis-workflow','workflow-controls','customer-installation','e2e','long-observation','reuse-records'] as const;
export const autonomyPrerequisiteReasons=['FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING','FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING','FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING','CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING','LONG_OBSERVATION_IN_PROGRESS','LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING'] as const;
const pendingPrerequisite=z.object({id:z.enum(autonomyPrerequisiteIds),reasonCode:z.enum(autonomyPrerequisiteReasons),actualObservedSeconds:z.number().min(0).max(259200).optional(),requiredSeconds:z.literal(259200).optional()}).strict().superRefine((v,ctx)=>{
 const long=v.id==='long-observation';if(long!==(v.actualObservedSeconds!==undefined&&v.requiredSeconds!==undefined)||!long&&(v.actualObservedSeconds!==undefined||v.requiredSeconds!==undefined))ctx.addIssue({code:'custom',message:'Observation duration belongs only to the long-observation prerequisite'});
 const reason=long?(v.actualObservedSeconds!<259200?'LONG_OBSERVATION_IN_PROGRESS':'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING'):v.id==='provider'?'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING':['native-execution','native-recovery'].includes(v.id)?'FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING':v.id==='customer-installation'?'CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING':'FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING';
 if(v.reasonCode!==reason)ctx.addIssue({code:'custom',message:'Prerequisite reason does not match its producer scope'});
});
/** Resource observations never constitute product acceptance, even at the full observation duration. */
export const projectAutonomyPrerequisiteStatusSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('project-autonomy-prerequisite-status'),simulated:z.literal(false),runId:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/),attempt:z.string().regex(/^[a-f0-9]{32}$/),sourceFingerprint:hash,goalSpecHash:hash,workPackage:z.string().regex(/^FA-0[1-9]$/),waiting:z.array(pendingPrerequisite).min(1).max(14),observedAt:date,nextCheckSeconds:z.number().int().min(60).max(86400),observationsAreAcceptance:z.literal(false)}).strict();
export const projectAutonomyWaitingPrerequisiteSchema=z.object({id:z.enum(autonomyPrerequisiteIds),checkId:id,objectiveIds:z.array(id).min(1).max(1000),errorCode:z.literal('TRUSTED_PREREQUISITE_RECEIPT_MISSING')}).strict();
const common={schemaVersion:z.literal(1),status:z.enum(['pass','fail']),simulated:z.literal(false),runId:id,workspace,goalSpecHash:hash,workPackage:id,sourceFingerprint:hash,sourceStable:z.literal(true),startedAt:date,finishedAt:date};
export const projectAutonomyValidationSchema=z.object({...common,kind:z.literal('project-autonomy-validation'),checks:z.array(checkSchema).min(1).max(1000),artifacts:z.array(artifactSchema).min(1).max(1000),prerequisiteWaitEligible:z.literal(true).optional(),prerequisiteStatusJson:z.string().min(1).max(256*1024).optional(),prerequisiteStatusSha256:hash.optional(),waitingPrerequisites:z.array(projectAutonomyWaitingPrerequisiteSchema).min(1).max(1000).optional()}).strict().superRefine((v,ctx)=>{
 const values=[v.prerequisiteWaitEligible,v.prerequisiteStatusJson,v.prerequisiteStatusSha256,v.waitingPrerequisites],count=values.filter(x=>x!==undefined).length;
 if(count!==0&&(count!==4||v.status!=='fail'))ctx.addIssue({code:'custom',message:'Waiting evidence must be complete and must not claim acceptance'});
});
export const projectAutonomyReviewSchema=z.object({...common,kind:z.literal('project-autonomy-review'),validationRunId:id,validationReportSha256:hash,criteria:z.array(z.object({objectiveId:id,outcome:z.enum(['pass','fail','skip','unknown']),evidenceRefs:z.array(z.string().trim().min(1).max(2200)).min(1).max(1000),reason:z.string().trim().min(1).max(8000)}).strict()).min(1).max(1000)}).strict();
export type ProjectAutonomyValidation=z.infer<typeof projectAutonomyValidationSchema>;
export type ProjectAutonomyReview=z.infer<typeof projectAutonomyReviewSchema>;

export interface AutonomyEvidenceExpectation {
 runId:string;workspace:string;goalSpecHash:string;workPackage:string;objectiveIds:string[];
 /** A current fingerprint from a trusted fixed observation, never from the model's summary. */
 sourceFingerprint?:string;requiredCheckIds?:string[];reviewRunId?:string;
}
export interface AutonomyEvidenceCandidate {
 /** Original UTF-8 report bytes represented as text; no reserialization before hashing. */
 json:string;sha256:string;producer:'fixed-validation'|'independent-review';
 /** Caller supplies this from the trusted execution store, not from the report. */
 run:{id:string;status:string;outcome:string;exitCode:number;lateEvidenceOnly?:boolean;cancelled?:boolean;stopRequested?:boolean};
}
export interface AutonomyEvidenceContext {
 now:string;maxAgeMs:number;cancelled?:boolean;
 /** Optional latest controlled source observation when the expectation has not yet been sealed. */
 currentSourceFingerprint?:string;
}
export interface AutonomyEvidenceDecision {
 outcome:'pass'|'fail'|'unknown';reasons:string[];
 validation?:ProjectAutonomyValidation;review?:ProjectAutonomyReview;evidenceHash?:string;
}
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const unique=(values:string[])=>new Set(values).size===values.length;
const validIds=(values:unknown):values is string[]=>Array.isArray(values)&&values.length>0&&values.length<=1000&&values.every(value=>id.safeParse(value).success)&&unique(values);

export interface AutonomyPrerequisiteDecision {outcome:'waiting'|'not-waiting'|'invalid';reasons:string[];validation?:ProjectAutonomyValidation;prerequisiteStatus?:z.infer<typeof projectAutonomyPrerequisiteStatusSchema>;waitingCheckIds?:string[];nextCheckSeconds?:number}
/** Classifies only an immutable fixed-process receipt; it never turns failed evidence into a pass. */
export function evaluateProjectAutonomyPrerequisites(expected:Pick<AutonomyEvidenceExpectation,'runId'|'workspace'|'goalSpecHash'|'workPackage'|'sourceFingerprint'|'requiredCheckIds'> & {objectiveIds?:string[]},candidate:AutonomyEvidenceCandidate|undefined,context:AutonomyEvidenceContext):AutonomyPrerequisiteDecision {
 const invalid=(reason:string):AutonomyPrerequisiteDecision=>({outcome:'invalid',reasons:[reason]});
 if(!expected||!id.safeParse(expected.runId).success||!workspace.safeParse(expected.workspace).success||!hash.safeParse(expected.goalSpecHash).success||!id.safeParse(expected.workPackage).success||expected.requiredCheckIds!==undefined&&!validIds(expected.requiredCheckIds)||expected.objectiveIds!==undefined&&!validIds(expected.objectiveIds))return invalid('INVALID_EXPECTATION');
 const current=expected.sourceFingerprint??context.currentSourceFingerprint,now=Date.parse(context.now);
 if(!date.safeParse(context.now).success||!Number.isSafeInteger(context.maxAgeMs)||context.maxAgeMs<1000||context.maxAgeMs>7*24*3600000)return invalid('INVALID_FRESHNESS_BOUNDARY');
 if(context.cancelled)return invalid('PROJECT_CANCELLED');
 if(!candidate||candidate.producer!=='fixed-validation')return invalid('UNTRUSTED_PRODUCER');
 if(typeof candidate.json!=='string'||Buffer.byteLength(candidate.json,'utf8')>1024*1024||!hash.safeParse(candidate.sha256).success||sha(candidate.json)!==candidate.sha256)return invalid('REPORT_HASH_MISMATCH');
 const run=candidate.run;if(!run||run.id!==expected.runId||!['failed','succeeded'].includes(run.status)||!['failed','success'].includes(run.outcome)||![0,1].includes(run.exitCode)||run.lateEvidenceOnly||run.cancelled||run.stopRequested)return invalid('RUN_REVOKED_OR_NOT_FINAL');
 let raw:unknown;try{raw=JSON.parse(candidate.json)}catch{return invalid('REPORT_JSON_INVALID')}
 const parsed=projectAutonomyValidationSchema.safeParse(raw);if(!parsed.success)return invalid('VALIDATION_SCHEMA_INVALID');const v=parsed.data;
 if(v.runId!==run.id||v.workspace!==expected.workspace||v.goalSpecHash!==expected.goalSpecHash||v.workPackage!==expected.workPackage||current!==undefined&&v.sourceFingerprint!==current||context.currentSourceFingerprint!==undefined&&current!==context.currentSourceFingerprint)return invalid('REPORT_BINDING_CHANGED');
 const started=Date.parse(v.startedAt),finished=Date.parse(v.finishedAt);if(started>finished||finished>now||now-started>context.maxAgeMs||now-finished>context.maxAgeMs)return invalid('REPORT_NOT_FRESH');
 if(!v.prerequisiteWaitEligible)return {outcome:'not-waiting',reasons:['NO_TRUSTED_WAITING_EVIDENCE'],validation:v};
 if(v.status!=='fail'||run.status!=='failed'||run.outcome!=='failed'||run.exitCode!==1)return invalid('WAITING_MUST_REMAIN_FAILED');
 if(!unique(v.checks.map(c=>c.id))||!unique(v.artifacts.map(a=>a.path))||!v.checks.some(c=>c.required)||expected.requiredCheckIds?.some(required=>!v.checks.some(c=>c.id===required&&c.required)))return invalid('REQUIRED_CHECK_DENOMINATOR_INVALID');
 const json=v.prerequisiteStatusJson!;if(Buffer.byteLength(json,'utf8')>256*1024||sha(json)!==v.prerequisiteStatusSha256)return invalid('PREREQUISITE_RAW_HASH_MISMATCH');
 let statusRaw:unknown;try{statusRaw=JSON.parse(json)}catch{return invalid('PREREQUISITE_JSON_INVALID')}
 const status=projectAutonomyPrerequisiteStatusSchema.safeParse(statusRaw);if(!status.success)return invalid('PREREQUISITE_SCHEMA_INVALID');const pending=status.data;
 if(pending.runId!==v.runId||pending.sourceFingerprint!==v.sourceFingerprint||pending.goalSpecHash!==v.goalSpecHash||pending.workPackage!==v.workPackage)return invalid('PREREQUISITE_BINDING_CHANGED');
 const observed=Date.parse(pending.observedAt);if(observed<started||observed>finished||now-observed>context.maxAgeMs||!unique(pending.waiting.map(row=>row.id)))return invalid('PREREQUISITE_NOT_FRESH_OR_DUPLICATE');
 if(v.checks.some(c=>!c.executed||c.status==='fail'||c.status==='skip'||c.status==='pass'&&(!c.executed||c.exitCode!==0||!!c.tests&&c.tests.unknown>0)||c.tests&&(c.tests.total!==c.tests.passed+c.tests.failed+c.tests.skipped+c.tests.unknown||c.tests.failed>0||c.tests.skipped>0)))return {outcome:'not-waiting',reasons:['ACTUAL_PRODUCT_OR_PROCESS_FAILURE'],validation:v};
 const unknown=v.checks.filter(c=>c.status==='unknown'),mapped=v.waitingPrerequisites!;
 if(!unknown.length||!unique(mapped.map(row=>row.id+'\0'+row.checkId))||mapped.some(row=>!unique(row.objectiveIds)||!unknown.some(c=>c.id===row.checkId&&c.required)||!pending.waiting.some(p=>p.id===row.id)||expected.objectiveIds!==undefined&&row.objectiveIds.some(objective=>!expected.objectiveIds!.includes(objective)))||unknown.some(c=>!c.required||![null,1,2].includes(c.exitCode)||!mapped.some(row=>row.checkId===c.id)))return invalid('PREREQUISITE_CHECK_MAPPING_INCOMPLETE');
 return {outcome:'waiting',reasons:[...new Set(mapped.map(row=>pending.waiting.find(p=>p.id===row.id)!.reasonCode))],validation:v,prerequisiteStatus:pending,waitingCheckIds:unknown.map(c=>c.id),nextCheckSeconds:pending.nextCheckSeconds};
}

/**
 * A fail-closed structural check, not proof of physical execution. The caller must
 * fetch reports through the controlled fixed validator and independent review run.
 * Successful CLI exit alone, model assertions and old human acceptance are insufficient.
 */
export function evaluateProjectAutonomyEvidence(expected:AutonomyEvidenceExpectation,candidates:{validation?:AutonomyEvidenceCandidate;review?:AutonomyEvidenceCandidate},context:AutonomyEvidenceContext):AutonomyEvidenceDecision {
 const unknown=(...reasons:string[]):AutonomyEvidenceDecision=>({outcome:'unknown',reasons});
 if(!expected||!context||!id.safeParse(expected.runId).success||!workspace.safeParse(expected.workspace).success||!hash.safeParse(expected.goalSpecHash).success||!id.safeParse(expected.workPackage).success||!validIds(expected.objectiveIds)||expected.requiredCheckIds!==undefined&&!validIds(expected.requiredCheckIds)||expected.reviewRunId!==undefined&&!id.safeParse(expected.reviewRunId).success)return unknown('INVALID_EXPECTATION');
 const currentSource=expected.sourceFingerprint??context.currentSourceFingerprint;
 if(!hash.safeParse(currentSource).success)return unknown('CURRENT_SOURCE_NOT_OBSERVED');
 if(context.currentSourceFingerprint!==undefined&&context.currentSourceFingerprint!==currentSource)return unknown('CURRENT_SOURCE_CHANGED');
 const now=Date.parse(context.now);
 if(!date.safeParse(context.now).success||!Number.isFinite(now)||!Number.isSafeInteger(context.maxAgeMs)||context.maxAgeMs<1000||context.maxAgeMs>7*24*3600000)return unknown('INVALID_FRESHNESS_BOUNDARY');
 if(context.cancelled)return unknown('PROJECT_CANCELLED');
 const read=(candidate:AutonomyEvidenceCandidate|undefined,producer:AutonomyEvidenceCandidate['producer']):{value?:unknown;reason?:string}=>{
  if(!candidate)return {reason:producer==='fixed-validation'?'VALIDATION_MISSING':'REVIEW_MISSING'};
  if(candidate.producer!==producer)return {reason:'UNTRUSTED_PRODUCER'};
  if(typeof candidate.json!=='string'||Buffer.byteLength(candidate.json,'utf8')>1024*1024||!hash.safeParse(candidate.sha256).success||sha(candidate.json)!==candidate.sha256)return {reason:'REPORT_HASH_MISMATCH'};
  const run=candidate.run;
  if(!run||!id.safeParse(run.id).success||run.status!=='succeeded'||run.outcome!=='success'||run.exitCode!==0)return {reason:'RUN_NOT_SUCCESSFUL'};
  if(run.lateEvidenceOnly||run.cancelled||run.stopRequested)return {reason:'RUN_REVOKED_OR_LATE'};
  try{return {value:JSON.parse(candidate.json)}}catch{return {reason:'REPORT_JSON_INVALID'}}
 };
 const v=read(candidates.validation,'fixed-validation');if(v.reason)return unknown(v.reason);
 const parsedValidation=projectAutonomyValidationSchema.safeParse(v.value);if(!parsedValidation.success)return unknown('VALIDATION_SCHEMA_INVALID');
 const validation=parsedValidation.data;
 const bound=(report:ProjectAutonomyValidation|ProjectAutonomyReview,runId:string):string|undefined=>{
  if(report.runId!==runId||report.workspace!==expected.workspace||report.goalSpecHash!==expected.goalSpecHash||report.workPackage!==expected.workPackage)return 'REPORT_BINDING_MISMATCH';
  if(report.sourceFingerprint!==currentSource)return 'REPORT_SOURCE_CHANGED';
  const start=Date.parse(report.startedAt),finish=Date.parse(report.finishedAt);
  if(start>finish||finish>now||now-start>context.maxAgeMs||now-finish>context.maxAgeMs)return 'REPORT_NOT_FRESH';
 };
 if(candidates.validation!.run.id!==expected.runId)return unknown('VALIDATION_RUN_MISMATCH');
 const validationBinding=bound(validation,expected.runId);if(validationBinding)return unknown(validationBinding);
 if(!unique(validation.checks.map(check=>check.id))||!unique(validation.artifacts.map(artifact=>artifact.path)))return unknown('DUPLICATE_VALIDATION_EVIDENCE');
 if(!validation.checks.some(check=>check.required))return unknown('REQUIRED_CHECK_DENOMINATOR_EMPTY');
 if(expected.requiredCheckIds?.some(required=>!validation.checks.some(check=>check.id===required&&check.required)))return unknown('REQUIRED_CHECK_MISSING');
 for(const check of validation.checks){
  if(!check.executed||check.status==='skip'||check.status==='unknown'||check.exitCode===null)return unknown('CHECK_NOT_EXECUTED_OR_UNKNOWN');
  if(check.tests&&(check.tests.total!==check.tests.passed+check.tests.failed+check.tests.skipped+check.tests.unknown||check.tests.skipped>0||check.tests.unknown>0))return unknown('TEST_COVERAGE_INCOMPLETE');
 }
 if(validation.status!=='pass'||validation.checks.some(check=>check.status!=='pass'||check.exitCode!==0||!!check.tests&&check.tests.failed>0))return {outcome:'fail',reasons:['FIXED_VALIDATION_FAILED'],validation};
 const r=read(candidates.review,'independent-review');if(r.reason)return {...unknown(r.reason),validation};
 const parsedReview=projectAutonomyReviewSchema.safeParse(r.value);if(!parsedReview.success)return {...unknown('REVIEW_SCHEMA_INVALID'),validation};
 const review=parsedReview.data;
 const reviewBinding=bound(review,candidates.review!.run.id);if(reviewBinding)return {...unknown(reviewBinding),validation};
 if(review.runId===validation.runId||expected.reviewRunId!==undefined&&review.runId!==expected.reviewRunId)return {...unknown('REVIEW_NOT_INDEPENDENT'),validation};
 if(review.validationRunId!==validation.runId||review.validationReportSha256!==candidates.validation!.sha256)return {...unknown('REVIEW_VALIDATION_BINDING_MISMATCH'),validation};
 if(Date.parse(review.startedAt)<Date.parse(validation.finishedAt))return {...unknown('REVIEW_PRECEDES_VALIDATION'),validation};
 const objectiveIds=review.criteria.map(criterion=>criterion.objectiveId);
 if(!unique(objectiveIds)||objectiveIds.length!==expected.objectiveIds.length||expected.objectiveIds.some(objective=>!objectiveIds.includes(objective)))return {...unknown('OBJECTIVE_COVERAGE_INCOMPLETE'),validation,review};
 const references=new Set([...validation.checks.map(check=>'check:'+check.id),...validation.artifacts.map(artifact=>'artifact:'+artifact.path)]);
 if(review.criteria.some(criterion=>!unique(criterion.evidenceRefs)||criterion.evidenceRefs.some(ref=>!references.has(ref))))return {...unknown('REVIEW_EVIDENCE_UNBOUND'),validation,review};
 if(review.criteria.some(criterion=>['skip','unknown'].includes(criterion.outcome)))return {...unknown('REVIEW_COVERAGE_UNKNOWN'),validation,review};
 if(review.status!=='pass'||review.criteria.some(criterion=>criterion.outcome!=='pass'))return {outcome:'fail',reasons:['INDEPENDENT_REVIEW_FAILED'],validation,review};
 return {outcome:'pass',reasons:[],validation,review,evidenceHash:sha(JSON.stringify({validation:candidates.validation!.sha256,review:candidates.review!.sha256,runId:expected.runId,workspace:expected.workspace,goalSpecHash:expected.goalSpecHash,workPackage:expected.workPackage,sourceFingerprint:currentSource,objectiveIds:[...expected.objectiveIds].sort()}))};
}

export interface AutonomyBudgetInput {
 spentUSD:number|null;unknownCostCount:number;usedTokens:number|null;maxUSD:number;maxTokens:number;nextBudgetUSD:number;nextTokenLimit:number;
}
/** Reserve a whole bounded next task. Missing fees/counts stop further automatic spending. */
export function evaluateAutonomyBudget(input:AutonomyBudgetInput):{outcome:'allow'|'stop';reason:string|null;remainingUSD:number|null;remainingTokens:number|null} {
 const stop=(reason:string)=>({outcome:'stop' as const,reason,remainingUSD:null,remainingTokens:null});
 if(!input||!Number.isSafeInteger(input.unknownCostCount)||input.unknownCostCount<0||!Number.isFinite(input.maxUSD)||input.maxUSD<=0||!Number.isSafeInteger(input.maxTokens)||input.maxTokens<=0||!Number.isFinite(input.nextBudgetUSD)||input.nextBudgetUSD<=0||!Number.isSafeInteger(input.nextTokenLimit)||input.nextTokenLimit<=0)return stop('INVALID_BUDGET_BOUNDARY');
 if(input.unknownCostCount>0||input.spentUSD===null||!Number.isFinite(input.spentUSD)||input.spentUSD<0)return stop('COST_UNKNOWN');
 if(input.usedTokens===null||!Number.isSafeInteger(input.usedTokens)||input.usedTokens<0)return stop('TOKENS_UNKNOWN');
 const remainingUSD=input.maxUSD-input.spentUSD,remainingTokens=input.maxTokens-input.usedTokens;
 if(remainingUSD<=0||input.nextBudgetUSD>remainingUSD)return {outcome:'stop',reason:'USD_BOUNDARY',remainingUSD,remainingTokens};
 if(remainingTokens<=0||input.nextTokenLimit>remainingTokens)return {outcome:'stop',reason:'TOKEN_BOUNDARY',remainingUSD,remainingTokens};
 return {outcome:'allow',reason:null,remainingUSD,remainingTokens};
}

export interface AutonomyProgressCheckpoint {sourceFingerprint:string;problemFingerprint:string;repeated:number}
/** Only stable source + stable structured problem identity is considered no progress. */
export function evaluateAutonomyProgress(input:{previous?:AutonomyProgressCheckpoint;current:{sourceFingerprint:string;problemFingerprint:string};maxRepeated:number}):{outcome:'progress'|'unchanged'|'stalled'|'unknown';checkpoint?:AutonomyProgressCheckpoint;reason:string|null} {
 if(!input||!input.current||!hash.safeParse(input.current.sourceFingerprint).success||!hash.safeParse(input.current.problemFingerprint).success||!Number.isSafeInteger(input.maxRepeated)||input.maxRepeated<2||input.maxRepeated>100||input.previous&&(!hash.safeParse(input.previous.sourceFingerprint).success||!hash.safeParse(input.previous.problemFingerprint).success||!Number.isSafeInteger(input.previous.repeated)||input.previous.repeated<1||input.previous.repeated>100))return {outcome:'unknown',reason:'INVALID_PROGRESS_CHECKPOINT'};
 const unchanged=input.previous?.sourceFingerprint===input.current.sourceFingerprint&&input.previous.problemFingerprint===input.current.problemFingerprint;
 const checkpoint={...input.current,repeated:unchanged?input.previous!.repeated+1:1};
 return {outcome:checkpoint.repeated>=input.maxRepeated?'stalled':unchanged?'unchanged':'progress',checkpoint,reason:checkpoint.repeated>=input.maxRepeated?'REPEATED_SOURCE_AND_PROBLEMS':null};
}
