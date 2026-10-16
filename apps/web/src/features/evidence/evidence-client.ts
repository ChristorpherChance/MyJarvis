import {V1Error} from '../../v1-client';
export type EvidenceDomain = 'knowledge' | 'memory';
export type EvidenceHit = {refId: string; kind: 'book' | 'external-document' | 'memory'; title: string; sourceName: string; quote: string; quoteKind: 'published-original' | 'external-source-unreviewed' | 'confirmed-memory'; page?: number; version?: number | string};
export type EvidenceStatus = {actorId: string; profileId: string; domain: EvidenceDomain; configured: boolean; provider: string; model: string; local: boolean; privacy: string; maximumModelCalls: number; queryPersisted: false};
export type EvidenceResult = {actorId: string; profileId: string; domain: EvidenceDomain; queryId: string; expiresAt: string; retrieval: 'model-query-expansion'; status: 'answered' | 'insufficient'; claims: Array<{text: string; citations: Array<{refId: string}>}>; records: EvidenceHit[]; searchTerms: string[]; model: {provider: string; name: string; local: boolean; calls: number; priceNotice: string}; notice: string};
export type EvidenceResolved = EvidenceHit & {actorId: string; profileId: string; queryId: string; text: string; quoteStart: number; contextStart: number; hasEarlierText: boolean; hasLaterText: boolean; verifiedSourceText: true; sha256: string; notice: string};
type Context = {signal: AbortSignal; current: () => boolean; profileId?: string; actorId?: string};
async function request<T extends {actorId: string; profileId: string}>(path: string, context: Context, body?: unknown): Promise<T> {
  const current = () => {if (context.signal.aborted || !context.current()) throw new DOMException('Aborted', 'AbortError');}; current();
  const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: context.signal});
  const value = await response.json().catch(() => null); current();
  if (!response.ok) throw new V1Error(value?.error?.message || value?.message || '模型查询未完成。', response.status, value?.error?.code || value?.code || 'REQUEST_FAILED');
  if (!value || typeof value.actorId !== 'string' || typeof value.profileId !== 'string' || context.actorId && value.actorId !== context.actorId || context.profileId && value.profileId !== context.profileId) throw new V1Error('当前登录已变化，结果已隐藏。', 403, 'IDENTITY_CHANGED');
  return value;
}
export async function evidenceStatus(domain: EvidenceDomain, context: Context) {
  const value = await request<EvidenceStatus>('/api/runtime/evidence-assistant/status?domain=' + domain, context);
  if (value.domain !== domain || typeof value.configured !== 'boolean' || typeof value.local !== 'boolean' || value.queryPersisted !== false) throw new V1Error('模型状态格式无效。', 502, 'INVALID_RESPONSE'); return value;
}
export async function askEvidence(domain: EvidenceDomain, query: string, cloudConsent: boolean, context: Context) {
  const value = await request<EvidenceResult>('/api/runtime/evidence-assistant/query', context, {requestId: crypto.randomUUID(), domain, query, cloudConsent, useModel: true, limit: 6});
  const valid = value.domain === domain && value.retrieval === 'model-query-expansion' && ['answered', 'insufficient'].includes(value.status) && Array.isArray(value.claims) && Array.isArray(value.records) && value.records.every(record => typeof record.refId === 'string' && typeof record.quote === 'string' && ['book', 'external-document', 'memory'].includes(record.kind)) && value.claims.every(claim => typeof claim.text === 'string' && Array.isArray(claim.citations) && claim.citations.length > 0 && claim.citations.every(citation => value.records.some(record => record.refId === citation.refId))) && (value.status !== 'insufficient' || value.claims.length === 0);
  if (!valid) throw new V1Error('模型回答缺少可核对的出处，已隐藏。', 502, 'INVALID_RESPONSE'); return value;
}
export async function resolveEvidence(queryId: string, refId: string, context: Context) {
  const value = await request<EvidenceResolved>('/api/runtime/evidence-assistant/references/resolve', context, {queryId, refId});
  if (value.queryId !== queryId || value.refId !== refId || value.verifiedSourceText !== true || typeof value.text !== 'string' || typeof value.quote !== 'string' || !Number.isSafeInteger(value.quoteStart) || value.quoteStart < 0 || value.text.slice(value.quoteStart, value.quoteStart + value.quote.length) !== value.quote) throw new V1Error('出处未能完整核对，请重新查询。', 502, 'INVALID_RESPONSE'); return value;
}
