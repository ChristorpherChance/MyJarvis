import {createHash,randomUUID} from 'node:crypto';
import {assertPublicSupervisorContent} from './public-privacy-guard.js';
export const supervisorHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface Correction {commandId:string;expectedVersion:number;targetEventId:string;targetHash:string;reason:string;correctedFact?:string;preferredOption?:string;applyTo:'current_followup'|'future_reference';correctionType?:'fact'|'preference';}
export function correctionInput(raw:any):Correction{if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['commandId','expectedVersion','targetEventId','targetHash','reason','correctedFact','preferredOption','applyTo','correctionType'].includes(k))||typeof raw.commandId!=='string'||!/^[a-f0-9-]{36}$/i.test(raw.commandId)||!Number.isSafeInteger(raw.expectedVersion)||raw.expectedVersion<1||typeof raw.targetEventId!=='string'||typeof raw.targetHash!=='string'||!/^[a-f0-9]{64}$/.test(raw.targetHash)||!['current_followup','future_reference'].includes(raw.applyTo)||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>1000||!raw.correctedFact&&!raw.preferredOption)throw Error('CORRECTION_INVALID');if(raw.correctionType!==undefined&&!['fact','preference'].includes(raw.correctionType))throw Error('CORRECTION_TYPE_INVALID_USE_GOAL_REVISION_FOR_CRITERIA');for(const k of ['correctedFact','preferredOption'])if(raw[k]!==undefined&&(typeof raw[k]!=='string'||!raw[k].trim()||raw[k].length>2000))throw Error('CORRECTION_INVALID');assertPublicSupervisorContent(raw);return raw;}
export function supervisorEvent(binding:any,kind:string,data:any,previousHash:string){const event={eventId:randomUUID(),kind,at:new Date().toISOString(),...binding,...data,previousHash};return {...event,hash:supervisorHash(event)};}
export function failureFeedback(result:any){return {state:'blocked' as const,summary:'执行终态未完成，等待主管分析可信诊断',question:'',options:[],recommendedOption:null,evidence:[],nextSuggestion:'核对诊断后调整方案，不把失败当成功',diagnostic:{outcome:String(result.outcome??'unknown'),exitCode:result.exitCode??null,summary:String(result.summary??'').slice(0,4000),usage:result.usage??null,protocolError:result.protocolError??null,logHash:result.logHash??null,source:'server-frozen-terminal'}};}
export function evidenceComplete(declared:any[],verified:any[],missing:any[]){return declared.length>0&&missing.length===0&&declared.every(ref=>verified.some(v=>v.verified===true&&v.path===ref.path&&v.sha256===ref.sha256));}
/** Authorized context preserves every exclusion reason for safety-intent review. Candidates never grant authority. */
export function selectSupervisorExperienceContext(records:any[],binding:any){
 const selected:any[]=[],excluded:any[]=[];
 for(const r of records){
  if(r.ownerId!==binding.ownerId)continue;
  const m=r.supervisorLearning??{},conditions=m.conditions??{};let reason='';
  if(r.kind==='skill')reason='skill-not-supervisor-lesson';
  else if(!m.projectId)reason='unmatched';
  else if(r.status==='archived')reason='archived';
  else if(r.status==='deprecated')reason='deprecated';
  else if(r.status==='superseded'||m.supersededBy)reason='superseded';
  else if((m.counterexamples??[]).length)reason='counterexample-recorded';
  else if(m.unknownConditions?.length)reason='unknown-condition';
  else if(m.unmatched===true)reason='unmatched';
  else if(m.projectId!==binding.projectId)reason='project-mismatch';
  else if(m.unknownConditions?.length||!['machineId','executor','version'].every(k=>conditions[k]&&binding[k]&&conditions[k]===binding[k]))reason=m.unknownConditions?.length?'unknown-condition':'condition-mismatch';
  else if(r.verified!==true||r.verifiedContent!==r.content||r.verifiedConditions!==r.conditions||!r.evidence?.trim())reason='unverified';
  if(reason){excluded.push({experienceId:r.id,revision:r.revision,reason,hash:supervisorHash(r),status:r.status,verified:r.verified===true,conditions,sourceConditions:r.conditions,authorization:m,content:String(r.content??'')});continue;}
  selected.push({experienceId:r.id,revision:r.revision,hash:supervisorHash(r),status:r.status,verified:true,conditions,content:String(r.content??''),sourceConditions:r.conditions,verifiedConditions:r.verifiedConditions,evidence:r.evidence,authorization:m,use:'qualified-reference'});
 }
 selected.sort((a,b)=>String(a.experienceId).localeCompare(String(b.experienceId)));
 excluded.sort((a,b)=>String(a.experienceId).localeCompare(String(b.experienceId)));
 const selectedCap=selected.slice(0,5),capped=selected.slice(5).map(item=>({...item,reason:'selected-cap-exceeded'}));
 return {selected:selectedCap,excluded:[...excluded,...capped],reminders:[...excluded,...capped].filter((item:any)=>['unverified','condition-mismatch','unknown-condition','unmatched','project-mismatch','selected-cap-exceeded'].includes(item.reason)).slice(0,20)};
}
/** Backwards-compatible selected-only helper; new runtime integrations should use the context result. */
export function selectSupervisorExperiences(records:any[],binding:any){return selectSupervisorExperienceContext(records,binding).selected;}
export function experiencesCurrent(refs:any[],read:(id:string)=>any){return refs.every(ref=>{const current=read(ref.experienceId);return current&&current.revision===ref.revision&&supervisorHash(current)===ref.hash&&current.status!=='deprecated'&&current.status!=='archived'&&current.status!=='superseded'&&!current.supervisorLearning?.counterexamples?.length&&!current.supervisorLearning?.supersededBy;});}

export function deriveDecisionProjection(session:any,event:any){
 const decision=event.decision??{},feedback=event.feedback??{},correction=event.kind==='correction',sourceEvent=correction?((event.targetEventId&&event.originalEvent)??event):event,sourceDecision=sourceEvent.decision??decision,sourceFeedback=sourceEvent.feedback??feedback;
 const rawOptions=Array.isArray(sourceFeedback.options)?sourceFeedback.options:[];
 const projectionOptions=correction&&event.preferredOption&&!rawOptions.some((item:any)=>typeof item==='string'?item===event.preferredOption:item?.title===event.preferredOption)?[...rawOptions,{id:'owner-correction-option',title:event.preferredOption}]:rawOptions;
 const chosen=correction?event.preferredOption??null:sourceDecision.selectedOption??null;
 const normalizedOptions=projectionOptions.map((item:any,index:number)=>typeof item==='string'?{id:`option-${index+1}`,title:item}:item).filter((o:any)=>o&&typeof o==='object'&&typeof o.id==='string'&&typeof o.title==='string');
 const options=normalizedOptions.length?normalizedOptions.map((o:any)=>({id:o.id,title:o.title,advantages:Array.isArray(o.advantages)?o.advantages:[],disadvantages:Array.isArray(o.disadvantages)?o.disadvantages:[],impact:String(o.impact??'当时反馈未说明影响'),compliesWithGoals:o.compliesWithGoals??'unknown',withinAuthority:o.withinAuthority??'unknown',environmentEvidence:o.environmentEvidence??'unknown',missingEvidence:Array.isArray(o.missingEvidence)?o.missingEvidence:['当时反馈未提供该方案的验证依据'],reversibility:o.reversibility??'unknown',coveredObjectives:Array.isArray(o.coveredObjectives)?o.coveredObjectives:[],operationalImpact:Number.isInteger(o.operationalImpact)?o.operationalImpact:0})):[{id:'unverified-source',title:String(sourceFeedback.summary??'当时反馈未列出可比较方案').slice(0,500),advantages:[],disadvantages:[],impact:'候选反馈保留但不构成已核验备选',compliesWithGoals:'unknown',withinAuthority:'unknown',environmentEvidence:'unknown',missingEvidence:['源反馈未提供结构化方案证据'],reversibility:'unknown',coveredObjectives:[],operationalImpact:0}];
 if(!normalizedOptions.length)return null;
 const chosenId=correction&&event.preferredOption?options.find((o:any)=>o.title===event.preferredOption)?.id??null:options.find((o:any)=>o.id===chosen||o.title===chosen)?.id??null;const selectedProjectionId=options.find((o:any)=>o.id===sourceDecision.selectedOption||o.title===sourceDecision.selectedOption)?.id??null,projectedChosenId=correction?chosenId:selectedProjectionId;
 // A recorded option label is not verified authority for the actual directive.
 return {questionSummary:correction?'本人更正主管判断':String(sourceFeedback.question||sourceDecision.reason||event.reason||'主管后继技术判断').slice(0,4000),context:{observedAt:event.at,goalSpecHash:supervisorHash({goal:session.goal,criteria:session.criteria}),sourceFingerprint:correction?(sourceEvent.hash??null):(event.hash??null),sourceVersion:null,runId:sourceEvent.runId??null,taskId:session.taskId,machineId:session.machineId,objectives:[],constraints:['不得扩大项目授权','选择不代表执行或验收'],situation:String(sourceFeedback.summary??sourceDecision.reason??event.reason??session.summary??'待复核').slice(0,8000)},options,chosenId:null,decisionRationale:String(correction?event.reason:sourceDecision.reason??sourceFeedback.nextSuggestion??sourceFeedback.summary??'当时没有记录模型理由').slice(0,8000),basisRefs:[{reference:'supervisor-event:'+event.eventId,sha256:event.hash,kind:'observation'},...(correction?[{reference:'supervisor-event:'+sourceEvent.eventId,sha256:sourceEvent.hash,kind:'observation' as const}]:[])],risk:'unknown',affectedObjectives:[],rollbackPlan:{plan:'如有实际副作用，另行授权补救；当前没有回滚声明',triggers:[],impact:'未报告',requiresNewExecutionPlan:true},actions:[],status:'proposed',origin:correction?'human':'ai',...(projectedChosenId&&(!correction||event.originalEvent?.decision)?{projectionSelection:{chosenId:projectedChosenId,origin:correction?'human':'ai',reason:String(correction?event.reason:sourceDecision.reason??'监督判断记录的方案选择').slice(0,4000),basisRefs:[{reference:'supervisor-event:'+event.eventId,sha256:event.hash,kind:'observation'}]}}:{})};
}
