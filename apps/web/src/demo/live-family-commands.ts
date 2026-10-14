import type { DemoData } from './types';
import { V1Error, v1Command, v1All, type V1CollectionDomain, type V1Record, type V1Scope } from '../v1-client';

type Values = Record<string, any>;
type Operation = { domain: V1CollectionDomain; command: string; body: Values; scope: V1Scope; version: number };
const pending = new Map<string, { id: string; promise?: Promise<unknown> }>();
export const clearLiveFamilySession=()=>pending.clear();
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const iso = (value: unknown): string | null => { if (value === undefined || value === null || value === '') return null; const parsed = Date.parse(String(value)); if (Number.isNaN(parsed)) throw new V1Error('请填写有效的日期或留空。', 400, 'VALIDATION'); return new Date(parsed).toISOString(); };
const denied = (message: string): never => { throw new V1Error(message, 403, 'FORBIDDEN'); };

export function translateLiveFamily(action: string, p: Values, data: DemoData, records: Partial<Record<V1CollectionDomain, V1Record[]>>): Operation {
  const profile = p.profile ?? data.profile;
  if (profile === 'public') denied('公共空间不能修改私人档案或家庭安排。');
  const domain: V1CollectionDomain = action.startsWith('memory.') ? 'memory' : action === 'persona.save' || action === 'family.member.register' ? 'personas' : 'family';
  if ((domain === 'memory' || action.startsWith('family.health.')) && profile !== 'me') denied('当前使用管理员登录；私人记忆与健康备忘需本人独立认证，不能通过档案切换冒用。');
  let command = '', body: Values = {}, scope: V1Scope = 'private';
  const list = records[domain] ?? [];
  const selected = p.id ? list.find(r => r.id === p.id) : action === 'memory.policy' ? list.find(r => r.kind === 'policy' && r.profileId === 'me') : action === 'persona.save' ? list.find(r => r.kind === 'persona' && r.profileId === profile) : undefined;
  if (p.id && !selected) throw new V1Error('记录已不可访问，请刷新。', 404, 'NOT_FOUND');
  const version = p.expectedVersion ?? selected?.revision ?? 0;
  if (!Number.isInteger(version) || version < 0) throw new V1Error('记录版本无效，请重新打开表单。', 400, 'VALIDATION');
  if (action.startsWith('family.todo.')) {
    command = 'todo'; scope = 'family';
    if (action.endsWith('.add')) body = { operation: 'create', text: p.text, dueAt: iso(p.dueAt) };
    else if (action.endsWith('.toggle')) body = { operation: 'complete', todoId: p.id, completed: p.completed ?? !selected?.done };
    else if (action.endsWith('.remove')) body = { operation: 'remove', todoId: p.id };
  } else if (action.startsWith('family.health.')) {
    command = 'health-note';
    body = action.endsWith('.remove') ? { operation: 'forget', noteId: p.id } : { operation: action.endsWith('.edit') ? 'edit' : 'create', ...(p.id ? { noteId: p.id } : {}), text: p.text, context: p.context ?? '' };
  } else if (action === 'family.member.register') {
    command = 'register'; body = { name: p.name, role: p.role };
  } else if (action === 'persona.save') {
    command = 'save'; body = { profileId: profile, voiceId: p.voice, language: p.language, ...(p.replyLanguage!==undefined?{replyLanguage:p.replyLanguage}:{}), pace: ({ '较慢': 'slow', '正常': 'normal', '较快': 'fast' } as Values)[p.pace], wakeWord: p.wakeword, address: p.address, replyStyle: p.replyStyle, cloudPrivacy: p.privacy, dailyVoiceMinutes: Number(p.dailyVoice), autoSpeak: p.autoSpeak === true, start: p.quietStart, end: p.quietEnd, timezone: p.timezone || 'Asia/Shanghai' };
  } else if (action === 'memory.add') {
    command = 'candidate'; body = { text: p.text, category: p.category, source: p.source || '管理员本人手动录入', nextReviewAt: iso(p.expires) };
  } else if (action === 'memory.edit') {
    command = 'edit'; body = { memoryId: p.id, text: p.text, confirmed: true, ...(p.category ? { category: p.category } : {}), nextReviewAt: iso(p.expires) };
  } else if (action === 'memory.confirm') { command = 'confirm'; body = { memoryId: p.id, confirmed: true }; }
  else if (action === 'memory.reject' || action === 'memory.forget') { command = action.split('.')[1]; body = { memoryId: p.id, reason: p.reason || (command === 'reject' ? '本人明确拒绝此候选' : '本人明确要求遗忘') }; }
  else if (action === 'memory.policy') { command = 'policy'; body = { textRetention: p.text, audioRetention: p.audio, longTerm: p.longterm }; }
  else if (action === 'memory.export') { command = 'export'; body = { format: 'json', includeCandidates: true }; }
  if (!command) throw new V1Error('此家庭操作尚未接入，未修改真实记录。', 503, 'NOT_CONFIGURED');
  if (selected && selected.scope !== scope) denied('记录范围与操作不一致。');
  return { domain, command, body, scope, version };
}

export async function executeLiveFamily(action: string, payload: Values, data: DemoData, records: Partial<Record<V1CollectionDomain, V1Record[]>>): Promise<unknown> {
  const op = translateLiveFamily(action, payload, data, records), key = stable(op);
  let entry = pending.get(key); if (entry?.promise) return entry.promise;
  if (!entry) { entry = { id: crypto.randomUUID() }; pending.set(key, entry); }
  const id = entry.id;
  const promise = v1Command(op.domain, op.command, op.body, op.scope, op.version, id).then(result => { pending.delete(key); return result; }).catch(error => { const current = pending.get(key); if (current?.id === id) current.promise = undefined; throw error; });
  entry.promise = promise; return promise;
}

/** Read again after the export receipt; do not download stale screen snapshots. */
export async function readCurrentMemoryExport(): Promise<unknown> {
  const items = (await v1All('memory')).items.filter(record => record.scope === 'private' && record.profileId === 'me');
  return { owner: '当前已认证管理员本人', exportedAt: new Date().toISOString(), policy: items.find(r => r.kind === 'policy') ?? null, memories: items.filter(r => r.kind === 'memory' && ['active', 'candidate'].includes(String(r.status))) };
}
