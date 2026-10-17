import type { CommandEnvelope, Domain } from '../v1/types.js';
import type { CommandReceipt } from '../v1/repository.js';

export interface ActualUsage { inputTokens?:number; outputTokens?:number; cacheReadTokens?:number;cacheWriteTokens?:number;totalTokens?:number;provider?:string;model?:string; /** True only when every round has a native final usage receipt; false retains partial observations. */ usageComplete?:boolean; costUSD?:number; /** Known observed fee lower bound, even when other rounds are unpriced; never fabricated zero. */ knownCostUSD?:number; /** False means costUSD is unknown; knownCostUSD may retain a partial observation. */ costComplete?:boolean; costKind?:'provider-reported'|'catalog-estimate';measurementStatus?:'reported'|'partial'|'unknown'; /** Internal SDK result only; node protocol cannot assert this flag. */ ledgerRecorded?:boolean }
export interface ExecutionMetadata {nativeCliVersion?:string;agentBuild:string;programSha256:string;invocationId:string}
export interface NativePhase {index:number;usageComplete:boolean;summarySha256:string;outcome:'success'|'failed'|'cancelled'|'budget-exhausted'|'timeout'|'awaiting-cost'|'round-limit'}

export interface ContinuationGrantInput {commandId:string;expectedVersion:number;taskId:string;ownerId:string;maxRounds:1;timeoutSec:number;retryCount:0;maxParentTokens:number;sourceRunId?:string;acknowledgeUnknownHistory?:boolean}
export interface ContinuationGrant {grantId:string;commandId:string;ownerId:string;taskId:string;projectId:string;machineId:string;workspace:string;sourceRunId:string;sourceResultHash:string;expectedTaskVersion:number;historyAcknowledgedUnknown?:boolean;maxRounds:1;timeoutSec:number;retryCount:0;maxParentTokens:number;createdAt:string;status:'pending'|'consumed';consumedRunId?:string}
export type FixedValidationPurpose='project-autonomy-validation'|'project-candidate-validation';
export type ExecutionPurpose=FixedValidationPurpose|'project-supervisor';
export function isFixedValidationPurpose(value:unknown):value is FixedValidationPurpose{return value==='project-autonomy-validation'||value==='project-candidate-validation';}
/** Canonical usage only for the two strictly pinned, validated no-model protocols. */
export function fixedValidationUsage():ActualUsage{return {inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,provider:'fixed-validator',model:'not-applicable',usageComplete:true,costUSD:0,knownCostUSD:0,costComplete:true,costKind:'provider-reported'};}
/** The immutable R26 receipt predates canonical complete-cost fields; normalize its exact zero shape. */
export function candidateValidationReceiptUsage(value:unknown):ActualUsage{
 const u=value as Record<string,unknown>|null;
 if(!u||typeof u!=='object'||Array.isArray(u)||Object.keys(u).some(k=>!['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens','provider','model','usageComplete','costUSD','knownCostUSD','costComplete','costKind'].includes(k))||u.inputTokens!==0||u.outputTokens!==0||u.costUSD!==0||['cacheReadTokens','cacheWriteTokens','totalTokens','knownCostUSD'].some(k=>u[k]!==undefined&&u[k]!==0)||u.usageComplete!==true||u.costComplete!==undefined&&u.costComplete!==true||u.costKind!=='provider-reported'||!(u.provider==='fixed-test'&&u.model==='no-model'||u.provider==='fixed-validator'&&u.model==='not-applicable'))throw Error('AGENT_CANDIDATE_VALIDATION_NONZERO_OR_INVALID_USAGE');
 return fixedValidationUsage();
}
/** Only the native SDK adapter may attach already-recorded usage to a failed round. */
export class PiDevelopmentFailure extends Error {
 constructor(message:string,readonly partialUsage:ActualUsage,options?:ErrorOptions){super(message,options);this.name='PiDevelopmentFailure';}
}
export interface PiDevelopmentInput { workspace:string; prompt:string; signal:AbortSignal; onLog:(text:string)=>void; runId:string; actorId:string; sessionId?:string; maxBudgetUSD:number; timeoutSec:number;projectId?:string;taskId?:string;machineId?:string;executorId?:string }
export interface PiDevelopmentResult { text:string; sessionId?:string; usage?:ActualUsage; artifacts?:string[] }
export interface ExecutionSkillSnapshot {experienceId:string;version:string;title:string;content:string;conditions:string;evidence:string;ownerId:string;scope:'personal'|'private'|'family'|'company';sourceRevision:number;origins:('task'|'project')[];sha256:string}
export interface ExecutionTemplate {
 id:string; machineId:string; engine:'pi-sdk'|'codex'|'claude'|'fixed'; program?:string; args?:string[];
 workspaceRoot:string; maxRounds:number; timeoutSec:number; leaseSec:number; budgetCurrency:'USD';
 /** Immutable argv for a separate validation process, never an LLM supplied shell command. */
 validation?:{program:string;args:string[];timeoutSec:number};
 /** Explicit continuation/recovery authorization; credentials stay in the native CLI. */
 supervision?:CliSupervisionPolicy;
 /** Strictly pinned execution purpose; supervisor is isolated from validation and generic templates. */
 purpose?:ExecutionPurpose;
}
export interface CliSupervisionPolicy {
 /** Record-only observes spend without making a USD reservation or blocking unpriced rounds. Per-task token/process bounds still apply. */
 billing:'priced'|'subscription'|'record-only';maxTokens:number;maxRecoveryAttempts:number;retryDelaySec:number;
 repairValidation:boolean;fallbackExecutorIds:string[];
 inputUSDPerMillion?:number;outputUSDPerMillion?:number;
}
export interface CliBillingCheckpoint {engine:'codex'|'claude';sessionId:string;costUSD:number;nativeCliVersion?:string;costScope?:'session-cumulative'}
export interface CliRecovery {kind:'quota'|'network'|'authentication'|'permission'|'unknown';automatic:boolean;attempts:number;retryAt?:string;nextExecutorId?:string}
export interface ExecutionValidation {exitCode:number;observedVersion?:string;summary?:string;/** Original JSON emitted only by the configured fixed validation process. */autonomyReportJson?:string;autonomyReportSha256?:string}
export interface ExecutionNodeConfig {
 apiUrl:string; agentId?:string; privateKey?:string; publicKey?:string; pairingTicket?:string;
 machineId:string; workspaceRoots:string[]; backupRoots?:string[]; templates:ExecutionTemplate[]; concurrency?:number;
 /** Private durable delivery spool; absent uses a directory beside the saved node configuration. */
 deliveryDirectory?:string;
 journals?:{path:string;policyId:string;scope:'personal'|'private'|'family'|'company';projectId?:string;offset?:number}[];
 /** Explicit local file allowlist; remote configuration never adds files to it. */
 serviceLogs?:{sourceId:string;path:string;fromStart?:boolean;offset?:number;streamId?:string;fileIdentity?:string;discarding?:boolean}[];
 hardwareReadings?:{sourceId:string;field:'gpuPercent'|'powerWatts';path:string}[];
}
export interface ProjectSupervisorController {
 /** Current authorization for this task; when supplied, runId must match the active run. */
 allows:(taskId:string,runId?:string)=>boolean;
 /** Whether this task is bound to a supervisor session, including when paused. */
 owns?:(taskId:string)=>boolean;
 /** Notify the supervisor that a signed terminal result was committed. */
 terminal:(runId:string)=>void;
}
export interface SupervisorAdoptionBinding {sessionId:string;ownerId:string;taskId:string;sourceRunId:string;sourceResultHash:string;projectId:string;machineId:string;workspace:string;nativeSessionId?:string|null;expectedTaskRevision:number}
export interface ProjectSupervisorDispatchInput {
 sessionId:string;goalRevision:number;supervisorRevision:number;taskId:string;expectedTaskRevision:number;
 consumedRunId?:string|null;resultHash?:string|null;grantId?:string;resumeStopped?:boolean;adoptionBinding?:SupervisorAdoptionBinding;directive:string;goal:string;criteria:string;
 machineId:string;executorId:string;workspace:string;ownerId:string;
}
export interface ExecutionRuntimeOptions {
 powerReading?:(agent:{machineId:string;capabilities?:string[]},raw:unknown)=>import('./power-runtime.js').CpuPowerSample|undefined;
 directory:string; machine:(id:string)=>Record<string,any>|undefined; stopped:()=>boolean;
 actorId?:string; runPi?:(input:PiDevelopmentInput)=>Promise<PiDevelopmentResult>;
 piReady?:()=>boolean; supervised?:()=>boolean;
 /** Narrow project authorization; never implicitly enables supervision of unrelated tasks. */
 taskSupervised?:(taskId:string)=>boolean;
 autoWake?:()=>boolean;
 preflight?:(input?:{recordOnly?:boolean;fixedValidation?:boolean})=>void;
 beforeExecution?:(input:{runId:string;actorId:string;executorId:string;machineId:string;taskId?:string;budgetUSD:number;recordOnly?:boolean;fixedValidation?:boolean})=>{budgetUSD?:number}|void;
 afterExecution?:(input:{runId:string;actorId:string;outcome:string})=>void;
 onUsage?:(input:{runId:string;taskId?:string;projectId?:string;machineId?:string;executorId?:string;agentId?:string;usage:ActualUsage;at:string})=>void|Promise<void>;
 onExternalUsage?:(input:import('./usage-ledger.js').ExternalUsageInput)=>unknown|Promise<unknown>;
}
export interface ClaimedRun {
 id:string; machineId:string; executorId:string; kind:'development'|'deploy'|'restore'|'sleep';
 projectId?:string; workspace:string; goal:string; criteria:string; maxRounds:number; timeoutSec:number;
 budgetUSD:number; templateHash?:string; sessionId?:string; leaseToken:string; leaseExpiresAt:string;
 binding?:Record<string,any>; validation?:ExecutionTemplate['validation'];
 skillSnapshots?:ExecutionSkillSnapshot[];skillSnapshotsHash?:string;
 sessionBilling?:CliBillingCheckpoint;remainingTokens?:number;handoff?:{executorId:string;summary:string};
 supervisor?:{sessionId:string;goalRevision:number;supervisorRevision:number;expectedTaskRevision:number;consumedRunId:string|null;resultHash:string|null;fingerprint?:string};
 purpose?:ExecutionPurpose;
}
export type ExecutionDispatcher=(domain:Domain,command:string,envelope:CommandEnvelope,actorId:string)=>Promise<CommandReceipt|undefined>;
