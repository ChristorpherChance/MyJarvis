/** Business contracts shared by the mock adapter and future API adapters.
 * This catalog documents planned HTTP operations; it does not claim those routes exist today.
 */
export type Scope='personal'|'private'|'family'|'company';
export type ProfileId='me'|'wife'|'son'|'mom'|'dad'|'public';
export type TaskState='queued'|'running'|'paused'|'waitingQuota'|'waitingResource'|'waitingUser'|'validating'|'completed'|'failed'|'blocked'|'cancelled';
export type DeploymentState='requested'|'ready'|'verifying'|'healthy'|'failed'|'rejected'|'restoring'|'restored';
export interface CommandEnvelope<T>{commandId:string;expectedVersion:number;scope:Scope;payload:T}
export interface CommandResult<T>{requestId:string;version:number;data:T;events:DomainEvent[]}
export interface DomainEvent {id:string;sequence:number;at:string;actorId:string;domain:string;objectId:string;type:string;payload:Record<string,unknown>}
export interface ApiFailure {requestId:string;code:'VALIDATION'|'FORBIDDEN'|'CONFLICT'|'BUDGET_EXHAUSTED'|'DEPENDENCY_PENDING'|'REVIEW_REQUIRED'|'NOT_CONFIGURED';message:string;details?:Record<string,unknown>}
export interface SpeechIntent {profileId:ProfileId;transcript:string;alternatives:{title:string;command:string;objectId?:string;effect:string;requiresConfirmation:boolean}[];status:'proposed'|'confirmed'|'cancelled'}
export interface Acceptance {outcome:'pass'|'fail';evidence:string;tests:string;artifacts:string[];reviewerId:string;at:string}
export interface KnowledgeCitation {bookId:string;version:string;page:number;chapter:string;sourceId:string;verified:boolean}
export const DOMAIN_CONTRACTS=[
 {domain:'inbox',route:'/api/v1/inbox',actions:['capture','annotate','merge','route','ignore','capture-policy','keep-independent'],events:['captured','routed','independent']},
 {domain:'research',route:'/api/v1/research',actions:['create','discuss','start','pause','evidence','option','decide','convert'],events:['stage','budget','decision']},
 {domain:'projects',route:'/api/v1/projects',actions:['register','copies','milestone','plan','archive'],events:['milestone','plan']},
 {domain:'tasks',route:'/api/v1/tasks',actions:['create','start','pause','resume','cancel','retry','accept','package'],events:['lease','progress','log','artifact','acceptance']},
 {domain:'experiences',route:'/api/v1/experiences',actions:['capture','verify','merge','skill-publish','version','reuse','deprecate'],events:['verified','published','referenced']},
 {domain:'sources',route:'/api/v1/knowledge/sources',actions:['configure','authorize','sync','disable','query'],events:['sync','health']},
 {domain:'books',route:'/api/v1/knowledge/books',actions:['upload-ticket','register','parse','recheck','verdict','rescan','page-review','publish','revision'],events:['stage','doubt','publication','revision']},
 {domain:'stories',route:'/api/v1/knowledge/stories',actions:['index','refresh','favorite','listen','quiz','gaps'],events:['indexed','stale','gap']},
 {domain:'learning',route:'/api/v1/learning',actions:['plan','assign','refresh','progress','quiz','review'],events:['progress','review']},
 {domain:'voice',route:'/api/v1/voice',actions:['session','transcript','intent','confirm','interrupt','tts'],events:['phase','transcript','intent','audio']},
 {domain:'family',route:'/api/v1/family',actions:['todo','learning','health-note'],events:['arrangement','progress']},
 {domain:'memory',route:'/api/v1/memory',actions:['candidate','confirm','edit','reject','forget','export','policy'],events:['candidate','confirmed','forgotten']},
 {domain:'personas',route:'/api/v1/personas',actions:['voice','wake-word','preference','quiet-hours'],events:['configured']},
 {domain:'machines',route:'/api/v1/machines',actions:['register','agent-status','wake','sleep'],events:['status','metrics']},
 {domain:'services',route:'/api/v1/services',actions:['register','health','release','request-deployment','execute','verify','restore'],events:['health','deployment','restoration']},
 {domain:'operations',route:'/api/v1/operations',actions:['budget','resource-policy','backup','restore-drill'],events:['cost','resource','backup']},
 {domain:'approvals',route:'/api/v1/approvals',actions:['request','approve','reject','execute','rollback'],events:['decision','receipt']},
 {domain:'settings',route:'/api/v1/settings',actions:['pi-provider','model-capability','terminal','policy'],events:['configured']}
] as const;
