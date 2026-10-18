import { createHash, randomUUID } from 'node:crypto';
import type { PiRunInput, PiService } from '../pi.js';
import {assertPublicSupervisorContent} from './public-privacy-guard.js';
import {PROJECT_SUPERVISOR_CONTRACT} from './project-supervisor-contract.js';

const MAX_RESPONSE_BYTES = 16_000;
const MAX_DIRECTIVE = 4_000;
const MAX_REASON = 1_000;
const INVALID = 'MODEL_REVIEW_INVALID';
const NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED';


export const modelDiagnosticReasons=['RESPONSE_TOO_LARGE','JSON_SYNTAX','ROOT_TYPE','EXPERIENCE_SCHEMA','KEY_SET','ACTION','DIRECTIVE','REASON','SELECTED_OPTION','CRITERIA_SCHEMA','CITATION_SCHEMA','REVIEW_COVERAGE','REVIEW_EXPECTED','REVIEW_CRITERION','REVIEW_EMPTY_EVIDENCE','REVIEW_FOREIGN_EVIDENCE','TERMINAL_REJECTED','RUN_EXCEPTION'] as const;
const experienceReasons=['INPUT_ARRAY','INPUT_REFERENCE','MISSING','ARRAY_TYPE','COUNT','ENTRY_TYPE','ENTRY_KEYS','ID_TYPE','UNKNOWN_ID','DUPLICATE_ID','DISPOSITION','REASON_TYPE','REASON_EMPTY','REASON_LENGTH','UNVERIFIED_ADOPTION'] as const;
const valueType=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v==='object'?'object':['string','number','boolean','undefined'].includes(typeof v)?typeof v:'other';
function experienceFailure(subtype:typeof experienceReasons[number],actual:unknown,expectedCount:number|null,responseCount:number|null):never{
 throw Object.assign(error(INVALID,'EXPERIENCE_SCHEMA','$.experienceReferences'),{experienceDiagnostic:{subtype,actualType:valueType(actual),expectedCount,responseCount}});
}
type DiagnosticReason=typeof modelDiagnosticReasons[number];
function error(code: string,reasonEnum?:DiagnosticReason,schemaPath='$'): Error {
  return Object.assign(new Error(code), { code,...(reasonEnum?{rejection:{reasonEnum,schemaPath}}:{}) });
}
/** Never project response text, dynamic JSON keys, provider errors, or model metadata publicly. */
export function publicModelRejection(value:unknown){
 const e=value as any,r=e?.rejection;
 return e?.code==='MODEL_REVIEW_INVALID'&&modelDiagnosticReasons.includes(r?.reasonEnum)?{reasonEnum:r.reasonEnum,nextAction:'核对已绑定诊断及原用量后明确新决定；不自动重试'}:null;
}
export function modelFailureObservation(value:unknown){
 const e=value as any,d=e?.diagnostics;
 if(!d||!modelDiagnosticReasons.includes(d.reasonEnum)||!['$','$.experienceReferences','$.action','$.directive','$.reason','$.selectedOption','$.criteria','$.criteria[].evidence'].includes(d.schemaPath))return null;
 const digest=typeof d.responseSHA256==='string'&&/^[a-f0-9]{64}$/.test(d.responseSHA256)?d.responseSHA256:null;
 const usageReferences=Array.isArray(d.usageReferences)?d.usageReferences.slice(0,100).flatMap((r:any)=>{
  if(typeof r?.usageId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(r.usageId)||typeof r.runId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(r.runId))return [];
  let model=null;if(typeof r.model==='string'&&/^[a-zA-Z0-9._:/-]{1,200}$/.test(r.model))try{assertPublicSupervisorContent(r.model);model=r.model;}catch{}
  return [{usageId:r.usageId,runId:r.runId,model}];
 }):[];
 const ex=d.experience;
 const experience=ex&&experienceReasons.includes(ex.subtype)&&['null','array','object','string','number','boolean','undefined','other'].includes(ex.actualType)?{subtype:ex.subtype,actualType:ex.actualType,expectedCount:Number.isSafeInteger(ex.expectedCount)&&ex.expectedCount>=0?ex.expectedCount:null,responseCount:Number.isSafeInteger(ex.responseCount)&&ex.responseCount>=0?ex.responseCount:null}:null;
 return {...(experience?{experience}:{}),reasonEnum:d.reasonEnum,schemaPath:d.schemaPath,responseSHA256:digest,UTF8bytes:Number.isSafeInteger(d.UTF8bytes)&&d.UTF8bytes>=0?d.UTF8bytes:null,terminal:['complete','failed','cancelled','partial'].includes(d.terminal)?d.terminal:null,usageReferences};
}

function ownRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseResponse(text: string): Record<string, unknown> {
  if (utf8Bytes(text) > MAX_RESPONSE_BYTES) throw error(INVALID,'RESPONSE_TOO_LARGE');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw error(INVALID,'JSON_SYNTAX');
  }
  if (!ownRecord(parsed)) throw error(INVALID,'ROOT_TYPE');
  return parsed;
}

function validate(parsed: Record<string, unknown>, input: any): Record<string, unknown> {
  const allowed = ['action', 'directive', 'reason', 'selectedOption', 'criteria', 'experienceReferences'];
  const supplied=input?.experienceReferences;
  if(!Array.isArray(supplied))experienceFailure('INPUT_ARRAY',supplied,null,null);
  const given=new Map<string,any>();
  for(const ref of supplied){
    if(!ownRecord(ref)||typeof ref.experienceId!=='string'||!ref.experienceId||given.has(ref.experienceId))experienceFailure('INPUT_REFERENCE',ref,supplied.length,null);
    given.set(ref.experienceId,ref);
  }
  const refs=parsed.experienceReferences,expectedCount=given.size;
  if(!Object.hasOwn(parsed,'experienceReferences'))experienceFailure('MISSING',undefined,expectedCount,null);
  if(!Array.isArray(refs))experienceFailure('ARRAY_TYPE',refs,expectedCount,null);
  if(refs.length!==expectedCount)experienceFailure('COUNT',refs,expectedCount,refs.length);
  const seen=new Set<string>();
  for(const ref of refs){
    const reject=(kind:typeof experienceReasons[number],actual:unknown):never=>experienceFailure(kind,actual,expectedCount,refs.length);
    if(!ownRecord(ref))reject('ENTRY_TYPE',ref);
    if(Object.keys(ref).length!==3||!['experienceId','disposition','reason'].every(k=>Object.hasOwn(ref,k)))reject('ENTRY_KEYS',ref);
    if(typeof ref.experienceId!=='string')reject('ID_TYPE',ref.experienceId);
    if(!given.has(ref.experienceId))reject('UNKNOWN_ID',ref.experienceId);
    if(seen.has(ref.experienceId))reject('DUPLICATE_ID',ref.experienceId);
    seen.add(ref.experienceId);
    if(!['adopted','not_adopted'].includes(ref.disposition))reject('DISPOSITION',ref.disposition);
    if(typeof ref.reason!=='string')reject('REASON_TYPE',ref.reason);
    if(!ref.reason.trim())reject('REASON_EMPTY',ref.reason);
    if(ref.reason.length>1000)reject('REASON_LENGTH',ref.reason);
    if(ref.disposition==='adopted'&&given.get(ref.experienceId).verified!==true)reject('UNVERIFIED_ADOPTION',given.get(ref.experienceId).verified);
  }
  if (Object.keys(parsed).length !== allowed.length || allowed.some(key => !Object.hasOwn(parsed, key))) throw error(INVALID,'KEY_SET','$');
  if (!['continue', 'wait_user', 'review', 'stop'].includes(parsed.action as string)) throw error(INVALID,'ACTION','$.action');
  if (typeof parsed.directive !== 'string' || parsed.directive.length > MAX_DIRECTIVE) throw error(INVALID,'DIRECTIVE','$.directive');
  if (typeof parsed.reason !== 'string' || parsed.reason.length > MAX_REASON) throw error(INVALID,'REASON','$.reason');
  if (parsed.selectedOption !== null && typeof parsed.selectedOption !== 'string') throw error(INVALID,'SELECTED_OPTION','$.selectedOption');
  if (!Array.isArray(parsed.criteria)) throw error(INVALID,'CRITERIA_SCHEMA','$.criteria');
  for (const criterion of parsed.criteria) {
    if (!ownRecord(criterion) || Object.keys(criterion).length !== 3 || !Object.hasOwn(criterion, 'criterion') || !Object.hasOwn(criterion, 'met') || !Object.hasOwn(criterion, 'evidence') || typeof criterion.criterion !== 'string' || typeof criterion.met !== 'boolean' || !Array.isArray(criterion.evidence)) throw error(INVALID,'CRITERIA_SCHEMA','$.criteria');
    for (const citation of criterion.evidence) {
      if (!ownRecord(citation) || Object.keys(citation).length !== 2 || typeof citation.path !== 'string' || typeof citation.sha256 !== 'string') throw error(INVALID,'CITATION_SCHEMA','$.criteria[].evidence');
    }
  }

  if (parsed.action === 'review') {
    const expected = input?.criteria;
    const evidence = input?.feedback?.evidence;
    if (!Array.isArray(expected) || !Array.isArray(evidence) || parsed.criteria.length !== expected.length) throw error(INVALID,'REVIEW_COVERAGE','$.criteria');
    const available = new Set<string>();
    for (const item of evidence) {
      if (!ownRecord(item) || typeof item.path !== 'string' || typeof item.sha256 !== 'string') continue;
      available.add(JSON.stringify([item.path, item.sha256]));
    }
    const expectedSet = new Set<string>();
    for (const criterion of expected) {
      if (typeof criterion !== 'string' || expectedSet.has(criterion)) throw error(INVALID,'REVIEW_EXPECTED','$.criteria');
      expectedSet.add(criterion);
    }
    const seen = new Set<string>();
    for (const result of parsed.criteria as Record<string, unknown>[]) {
      const criterion = result.criterion as string;
      if (!expectedSet.has(criterion) || result.met !== true || seen.has(criterion)) throw error(INVALID,'REVIEW_CRITERION','$.criteria');
      seen.add(criterion);
      if (!(result.evidence as unknown[]).length) throw error(INVALID,'REVIEW_EMPTY_EVIDENCE','$.criteria[].evidence');
      for (const citation of result.evidence as Record<string, string>[]) {
        if (!available.has(JSON.stringify([citation.path, citation.sha256]))) throw error(INVALID,'REVIEW_FOREIGN_EVIDENCE','$.criteria[].evidence');
      }
    }
    if (seen.size !== expectedSet.size) throw error(INVALID,'REVIEW_COVERAGE','$.criteria');
  }
  return parsed;
}

export function createProjectSupervisorModel(pi: PiService): (input: any) => Promise<any> {
  return async (input: any): Promise<any> => {
    const health = pi.health('project-supervisor');
    if (!health.configured) throw error(NOT_CONFIGURED);
    if (utf8Bytes(JSON.stringify(input)) > 30_000) throw error('MODEL_CONTEXT_INCOMPLETE');
    const usageReferences:{usageId:string;runId:string;model:string|null}[]=[];
    const runInput: PiRunInput = {
      conversationId: `supervisor-${randomUUID()}`,
      actorId: input?.binding?.ownerId ?? 'server-admin',
      member: { name: 'project-supervisor', preferences: '' },
      sessionPath: null,
      text: `${PROJECT_SUPERVISOR_CONTRACT}\n\nUntrusted supervisor input JSON:\n${JSON.stringify(input)}`,
      onEvent: (event,data) => {
        // Pi's existing measured usage event is the only model/run attribution source.
        if(event!=='usage'||data?.actorId!==runInput.actorId||data?.conversationId!==runInput.conversationId||data?.projectId!==input?.binding?.projectId||data?.taskId!==input?.binding?.taskId||data?.source!==`supervisor:${input?.binding?.goalRevision}:${input?.binding?.runId}`)return;
        if(typeof data.usageId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(data.usageId)||typeof data.runId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(data.runId))return;
        let model:string|null=null;
        if(typeof data.model==='string'&&/^[a-zA-Z0-9._:/-]{1,200}$/.test(data.model))try{assertPublicSupervisorContent(data.model);model=data.model;}catch{/* Unknown rather than publishing private metadata. */}
        if(usageReferences.length<100)usageReferences.push({usageId:data.usageId,runId:data.runId,model});
      },
      onSessionPath: () => {},
      boundedJob: true,
      ephemeral: true,
      purpose: 'project-supervisor',
      ...(input?.binding?.projectId?{supervisorBinding:{projectId:input.binding.projectId,taskId:input.binding.taskId,goalRevision:input.binding.goalRevision,sourceRunId:input.binding.runId}}:{}),
      scenario: 'project-supervisor',
    };
    let result:Awaited<ReturnType<PiService['run']>>|undefined;
    try{
      try{result=await pi.run(runInput);}catch{throw error('MODEL_RUN_FAILED','RUN_EXCEPTION');}
      if(result.status!=='complete')throw error('MODEL_RUN_FAILED','TERMINAL_REJECTED');
      return validate(parseResponse(result.text),input);
    }catch(e){
      const failure=e as Error&{rejection?:{reasonEnum:DiagnosticReason;schemaPath:string};diagnostics?:unknown;experienceDiagnostic?:unknown};
      const text=typeof result?.text==='string'?result.text:null;
      const terminal=['complete','failed','cancelled','partial'].includes(result?.status??'')?result!.status:null;
      failure.diagnostics={...(failure.rejection??{reasonEnum:'RUN_EXCEPTION',schemaPath:'$'}),responseSHA256:text===null?null:createHash('sha256').update(text,'utf8').digest('hex'),UTF8bytes:text===null?null:utf8Bytes(text),terminal,usageReferences,...(failure.experienceDiagnostic?{experience:failure.experienceDiagnostic}:{})};
      throw failure;
    }
  };
}
