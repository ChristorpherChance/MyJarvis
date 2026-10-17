import { randomUUID } from 'node:crypto';
import type { PiRunInput, PiService } from '../pi.js';
import {PROJECT_SUPERVISOR_CONTRACT} from './project-supervisor-contract.js';

const MAX_RESPONSE_BYTES = 16_000;
const MAX_DIRECTIVE = 4_000;
const MAX_REASON = 1_000;
const INVALID = 'MODEL_REVIEW_INVALID';
const NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED';


function error(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function ownRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseResponse(text: string): Record<string, unknown> {
  if (utf8Bytes(text) > MAX_RESPONSE_BYTES) throw error(INVALID);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw error(INVALID);
  }
  if (!ownRecord(parsed)) throw error(INVALID);
  return parsed;
}

function validate(parsed: Record<string, unknown>, input: any): Record<string, unknown> {
  const allowed = ['action', 'directive', 'reason', 'selectedOption', 'criteria', 'experienceReferences'];
  input={...input,experienceReferences:input.experienceReferences??[]};
  if(input.experienceReferences!==undefined){if(!Array.isArray(parsed.experienceReferences))throw error(INVALID);const given=new Map(input.experienceReferences.map((r:any)=>[r.experienceId,r]));if(parsed.experienceReferences.length!==given.size)throw error(INVALID);const seen=new Set();for(const ref of parsed.experienceReferences as any[]){if(!ownRecord(ref)||!given.has(ref.experienceId)||seen.has(ref.experienceId)||!['adopted','not_adopted'].includes(ref.disposition as string)||typeof ref.reason!=='string'||!ref.reason||ref.reason.length>1000)throw error(INVALID);seen.add(ref.experienceId);if(ref.disposition==='adopted'&&!(given.get(ref.experienceId) as any).verified)throw error(INVALID);}}
  if (Object.keys(parsed).length !== allowed.length || allowed.some(key => !Object.hasOwn(parsed, key))) throw error(INVALID);
  if (!['continue', 'wait_user', 'review', 'stop'].includes(parsed.action as string)) throw error(INVALID);
  if (typeof parsed.directive !== 'string' || parsed.directive.length > MAX_DIRECTIVE) throw error(INVALID);
  if (typeof parsed.reason !== 'string' || parsed.reason.length > MAX_REASON) throw error(INVALID);
  if (parsed.selectedOption !== null && typeof parsed.selectedOption !== 'string') throw error(INVALID);
  if (!Array.isArray(parsed.criteria)) throw error(INVALID);
  for (const criterion of parsed.criteria) {
    if (!ownRecord(criterion) || Object.keys(criterion).length !== 3 || !Object.hasOwn(criterion, 'criterion') || !Object.hasOwn(criterion, 'met') || !Object.hasOwn(criterion, 'evidence') || typeof criterion.criterion !== 'string' || typeof criterion.met !== 'boolean' || !Array.isArray(criterion.evidence)) throw error(INVALID);
    for (const citation of criterion.evidence) {
      if (!ownRecord(citation) || Object.keys(citation).length !== 2 || typeof citation.path !== 'string' || typeof citation.sha256 !== 'string') throw error(INVALID);
    }
  }

  if (parsed.action === 'review') {
    const expected = input?.criteria;
    const evidence = input?.feedback?.evidence;
    if (!Array.isArray(expected) || !Array.isArray(evidence) || parsed.criteria.length !== expected.length) throw error(INVALID);
    const available = new Set<string>();
    for (const item of evidence) {
      if (!ownRecord(item) || typeof item.path !== 'string' || typeof item.sha256 !== 'string') continue;
      available.add(JSON.stringify([item.path, item.sha256]));
    }
    const expectedSet = new Set<string>();
    for (const criterion of expected) {
      if (typeof criterion !== 'string' || expectedSet.has(criterion)) throw error(INVALID);
      expectedSet.add(criterion);
    }
    const seen = new Set<string>();
    for (const result of parsed.criteria as Record<string, unknown>[]) {
      const criterion = result.criterion as string;
      if (!expectedSet.has(criterion) || result.met !== true || seen.has(criterion)) throw error(INVALID);
      seen.add(criterion);
      if (!(result.evidence as unknown[]).length) throw error(INVALID);
      for (const citation of result.evidence as Record<string, string>[]) {
        if (!available.has(JSON.stringify([citation.path, citation.sha256]))) throw error(INVALID);
      }
    }
    if (seen.size !== expectedSet.size) throw error(INVALID);
  }
  return parsed;
}

export function createProjectSupervisorModel(pi: PiService): (input: any) => Promise<any> {
  return async (input: any): Promise<any> => {
    input={...input,experienceReferences:input.experienceReferences??[]};
    const health = pi.health('project-supervisor');
    if (!health.configured) throw error(NOT_CONFIGURED);
    if (utf8Bytes(JSON.stringify(input)) > 30_000) throw error('MODEL_CONTEXT_INCOMPLETE');
    const runInput: PiRunInput = {
      conversationId: `supervisor-${randomUUID()}`,
      actorId: input?.binding?.ownerId ?? 'server-admin',
      member: { name: 'project-supervisor', preferences: '' },
      sessionPath: null,
      text: `${PROJECT_SUPERVISOR_CONTRACT}\n\nUntrusted supervisor input JSON:\n${JSON.stringify(input)}`,
      onEvent: () => {},
      onSessionPath: () => {},
      boundedJob: true,
      ephemeral: true,
      purpose: 'project-supervisor',
      ...(input?.binding?.projectId?{supervisorBinding:{projectId:input.binding.projectId,taskId:input.binding.taskId,goalRevision:input.binding.goalRevision,sourceRunId:input.binding.runId}}:{}),
      scenario: 'project-supervisor',
    };
    const result = await pi.run(runInput);
    if (result.status !== 'complete') throw error('MODEL_RUN_FAILED');
    return validate(parseResponse(result.text), input);
  };
}
