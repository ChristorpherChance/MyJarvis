import type { V1Scope } from '../../v1-client';

export const INBOX_DRAFT_KEY_PREFIX = 'jarvis-inbox-draft-v1:';
export const INBOX_DRAFT_MAX_TEXT = 20000;
const MAX_STORED_LENGTH = 130000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set(['idea', 'experience', 'lesson', 'skill', 'memory', 'book']);
const scopes = new Set(['private', 'personal', 'family', 'company']);

/** Only the fields explicitly entered in the capture form are persisted. */
export interface InboxDraft {
  id: string;
  rawText: string;
  title: string;
  kind: string;
  scope: V1Scope;
  terminalId: string;
  projectId: string;
  status: 'editing' | 'pending';
  revision: number;
  updatedAt: number;
  sourceUrl?: string;
  attachmentIds?: string[];
  materialRevision?: number;
}
export class InboxDraftError extends Error {
  constructor(message: string, public code: 'UNAVAILABLE' | 'INVALID' | 'CONFLICT') { super(message); this.name = 'InboxDraftError'; }
}
const invalid = (): never => { throw new InboxDraftError('本机草稿格式无效，请先导出当前输入，再移除损坏草稿。', 'INVALID'); };
const conflict = (): never => { throw new InboxDraftError('另一页面已更新草稿，请重新打开查看；当前输入尚未覆盖保存。', 'CONFLICT'); };
function storage(): Storage {
  try {
    if (!globalThis.localStorage || !globalThis.location?.origin || globalThis.location.origin === 'null') throw new Error();
    return globalThis.localStorage;
  } catch { throw new InboxDraftError('浏览器无法保存本机草稿，刷新或关闭后可能无法恢复，请先导出原文。', 'UNAVAILABLE'); }
}
function keyFor(actorId: string): string {
  if (typeof actorId !== 'string' || !actorId.trim() || actorId.length > 256) throw new InboxDraftError('登录身份尚未确认，无法恢复本机草稿。', 'INVALID');
  // localStorage is isolated by browser origin; the key additionally isolates real authenticated actors.
  return INBOX_DRAFT_KEY_PREFIX + encodeURIComponent(actorId);
}
function callStorage<T>(fn: () => T): T {
  try { return fn(); } catch (error) {
    if (error instanceof InboxDraftError) throw error;
    throw new InboxDraftError('浏览器无法保存本机草稿，刷新或关闭后可能无法恢复，请先导出原文。', 'UNAVAILABLE');
  }
}
function cleanDraft(value: unknown): InboxDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const draft = value as InboxDraft;
  if (typeof draft.id !== 'string' || !UUID.test(draft.id) || typeof draft.rawText !== 'string' || draft.rawText.length > INBOX_DRAFT_MAX_TEXT ||
      typeof draft.title !== 'string' || draft.title.length > 300 || !kinds.has(draft.kind) || !scopes.has(draft.scope) ||
      typeof draft.terminalId !== 'string' || draft.terminalId.length > 200 || typeof draft.projectId !== 'string' || draft.projectId.length > 200 ||
      !['editing', 'pending'].includes(draft.status) || !Number.isSafeInteger(draft.revision) || draft.revision < 0 ||
      !Number.isSafeInteger(draft.updatedAt) || draft.updatedAt < 0) return invalid();
  if (draft.sourceUrl !== undefined && (typeof draft.sourceUrl !== 'string' || draft.sourceUrl.length > 2048)) return invalid();
  if (draft.attachmentIds !== undefined && (!Array.isArray(draft.attachmentIds) || draft.attachmentIds.length > 5 || draft.attachmentIds.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(draft.attachmentIds).size !== draft.attachmentIds.length)) return invalid();
  if (draft.materialRevision !== undefined && (!Number.isSafeInteger(draft.materialRevision) || draft.materialRevision < 0)) return invalid();
  // Do not round-trip arbitrary fields, credentials, UI state, or server records.
  return { id: draft.id, rawText: draft.rawText, title: draft.title, kind: draft.kind, scope: draft.scope, terminalId: draft.terminalId, projectId: draft.projectId, status: draft.status, revision: draft.revision, updatedAt: draft.updatedAt,
    ...(draft.sourceUrl !== undefined ? {sourceUrl:draft.sourceUrl} : {}), ...(draft.attachmentIds !== undefined ? {attachmentIds:[...draft.attachmentIds]} : {}), ...(draft.materialRevision !== undefined ? {materialRevision:draft.materialRevision} : {}) };
}
function content(draft: InboxDraft): string {
  return JSON.stringify([draft.id, draft.rawText, draft.title, draft.kind, draft.scope, draft.terminalId, draft.projectId,draft.sourceUrl||'',draft.attachmentIds||[],draft.materialRevision||0]);
}
function read(store: Storage, key: string, actorId: string): InboxDraft | null {
  const raw = callStorage(() => store.getItem(key));
  if (raw === null) return null;
  if (raw.length > MAX_STORED_LENGTH) return invalid();
  let envelope: { schema?: unknown; origin?: unknown; actorId?: unknown; draft?: unknown };
  try { envelope = JSON.parse(raw); } catch { return invalid(); }
  if (!envelope || envelope.schema !== 1 || envelope.origin !== globalThis.location.origin || envelope.actorId !== actorId) return invalid();
  const draft = cleanDraft(envelope.draft);
  if (draft.revision < 1 || draft.updatedAt < 1) return invalid();
  return draft;
}

export function createInboxDraft(fields: Pick<InboxDraft, 'rawText' | 'title' | 'kind' | 'scope' | 'terminalId' | 'projectId'> & Partial<Pick<InboxDraft,'sourceUrl'|'attachmentIds'|'materialRevision'>>): InboxDraft {
  return cleanDraft({ ...fields, id: crypto.randomUUID(), status: 'editing', revision: 0, updatedAt: 0 });
}

/** No automatic expiry: an uncertain submitted command must retain its original receipt ID. */
export function getInboxDraft(actorId: string): InboxDraft | null {
  const key = keyFor(actorId), store = storage();
  return read(store, key, actorId);
}

/** Synchronous optimistic CAS. Always use the returned revision for the next save. */
export function saveInboxDraft(actorId: string, input: InboxDraft): InboxDraft {
  const key = keyFor(actorId), store = storage(), draft = cleanDraft(input), current = read(store, key, actorId);
  if (current ? current.id !== draft.id || current.revision !== draft.revision : draft.revision !== 0) return conflict();
  if (current?.status === 'pending') {
    if (draft.status !== 'pending' || content(current) !== content(draft)) return conflict();
    return current;
  }
  if (current && current.status === draft.status && content(current) === content(draft)) return current;
  const next = { ...draft, revision: draft.revision + 1, updatedAt: Date.now() };
  if (!Number.isSafeInteger(next.revision)) return invalid();
  const serialized = JSON.stringify({ schema: 1, origin: globalThis.location.origin, actorId, draft: next });
  if (serialized.length > MAX_STORED_LENGTH) return invalid();
  callStorage(() => store.setItem(key, serialized));
  // A later tab may win after this call; its storage event must trigger an explicit reload in the UI.
  return cleanDraft(next);
}

/** A completion for an old request must never erase a replacement draft. */
export function removeInboxDraft(actorId: string, id: string): boolean {
  const key = keyFor(actorId), store = storage();
  const raw = callStorage(() => store.getItem(key));
  if (raw === null) return false;
  let storedId: unknown;
  try { storedId = JSON.parse(raw)?.draft?.id; } catch { return invalid(); }
  if (storedId !== id) return false;
  callStorage(() => store.removeItem(key));
  return true;
}

/** Used only when ending an authenticated session, including a 401 response. */
export function clearInboxDrafts(): void {
  const store = storage();
  callStorage(() => {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (key?.startsWith(INBOX_DRAFT_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  });
}
