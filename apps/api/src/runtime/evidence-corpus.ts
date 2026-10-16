import {createHash} from 'node:crypto';
import type {V1Repository} from '../v1/repository.js';
import type {RuntimePrincipal} from './identity.js';
import {RuntimeAccessError} from './identity.js';
import {searchKnowledgeDocuments} from './knowledge-connectors.js';

export type EvidenceDomain = 'knowledge' | 'memory';
export type EvidenceReference = {
  kind: 'book' | 'external-document' | 'memory'; id: string; sourceId?: string; sourceRevision?: number;
  revision?: number; version?: string | number; page?: number; sha256: string; offset: number; quote: string;
  title: string; sourceName: string; quoteKind: 'published-original' | 'external-source-unreviewed' | 'confirmed-memory';
};
export type EvidenceDocument = {reference: EvidenceReference; text: string};
const OWNER = 'server-admin';
export const evidenceHash = (text: string) => createHash('sha256').update(text).digest('hex');
const string = (value: unknown) => typeof value === 'string' ? value : '';
function required(value: unknown, message: string, status = 409): asserts value {if (!value) throw new RuntimeAccessError(status === 403 ? 'SOURCE_FORBIDDEN' : 'REFERENCE_CHANGED', message, status);}
/** Connector titles can contain a private absolute path. Only display its last name. */
function label(value: unknown, fallback: string) {
  let name = string(value).trim(); if (!name) return fallback;
  if (/^file:/i.test(name)) {try {name = decodeURIComponent(new URL(name).pathname);} catch {return fallback;}}
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(name)) name = name.split(/[\\/]/).at(-1) || '';
  return name && name !== '.' && name !== '..' ? name.slice(0, 300) : fallback;
}
function boundaries(text: string, start: number, end: number) {
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end++;
  return {start, end};
}

/** Collect current authorized originals before any ranking. History and other actors never enter it. */
export function authorizedEvidence(repository: V1Repository, principal: RuntimePrincipal, domain: EvidenceDomain): EvidenceDocument[] {
  if (domain === 'memory') return repository.list('memory', principal.actorId, 'private')
    .filter(record => record.kind === 'memory' && record.ownerId === principal.actorId && record.profileId === 'me' && record.status === 'active' && string(record.text).trim())
    .map(record => ({text: record.text, reference: {kind: 'memory' as const, id: record.id, revision: record.revision, sha256: evidenceHash(record.text), offset: 0, quote: '', title: label(record.title || record.category, '本人已确认记忆'), sourceName: '本人当前已确认记忆', quoteKind: 'confirmed-memory' as const}}));
  const familyOnly = !principal.administrator;
  const sources = repository.list('sources', OWNER).filter(source => source.kind === 'source' && source.ownerId === OWNER && source.active && source.authorized && (!familyOnly || source.scope === 'family'));
  const documents: EvidenceDocument[] = [];
  for (const book of repository.list('books', OWNER).filter(book => book.kind === 'book' && book.ownerId === OWNER && book.status === 'published' && (!familyOnly || book.scope === 'family'))) {
    const source = sources.find(source => source.id === book.source && source.scope === book.scope); if (!source) continue;
    for (const page of book.pageTexts || []) {
      const text = string(page.text); if (!text.trim() || !Number.isInteger(page.page) || page.page < 1) continue;
      documents.push({text, reference: {kind: 'book', id: book.id, sourceId: source.id, sourceRevision: source.revision, revision: book.revision, page: page.page, version: book.version, sha256: evidenceHash(text), offset: 0, quote: '', title: label(book.title, '已发布书页'), sourceName: label(source.name, '当前授权来源'), quoteKind: 'published-original'}});
    }
  }
  for (const source of sources) for (const document of source.documents || []) {
    const text = string(document.text); if (!text.trim() || typeof document.id !== 'string') continue;
    documents.push({text, reference: {kind: 'external-document', id: document.id, sourceId: source.id, sourceRevision: source.revision, version: source.version, sha256: evidenceHash(text), offset: 0, quote: '', title: label(document.title, '已保存资料'), sourceName: label(source.name, '当前授权来源'), quoteKind: 'external-source-unreviewed'}});
  }
  return documents;
}

/** Models expand the query; this final candidate stage remains explicit literal ranking. */
export function selectEvidence(documents: EvidenceDocument[], query: string, terms: string[], limit: number): EvidenceReference[] {
  const indexed = documents.map((document, index) => ({id: String(index), title: document.reference.title, text: document.text, location: String(index), sha256: document.reference.sha256, metadata: {index}}));
  return searchKnowledgeDocuments(indexed, [query, ...terms].join(' '), indexed.length).slice(0, limit).map(hit => {
    const document = documents[Number(hit.id)], range = boundaries(document.text, hit.offset, Math.min(document.text.length, hit.offset + 1600));
    return {...document.reference, offset: range.start, quote: document.text.slice(range.start, range.end)};
  });
}

/** Re-read current authorization, version and complete text; no client location or URL is accepted. */
export function reopenEvidence(repository: V1Repository, principal: RuntimePrincipal, reference: EvidenceReference): string {
  let text: string;
  if (reference.kind === 'memory') {
    const memory = repository.read('memory', reference.id, principal.actorId);
    required(memory?.kind === 'memory' && memory.ownerId === principal.actorId && memory.profileId === 'me' && memory.scope === 'private' && memory.status === 'active', '这条记忆已遗忘或不属于当前本人。', 403);
    required(memory.revision === reference.revision, '本人记忆已更正，请重新查询。'); text = string(memory.text);
  } else {
    const source = repository.read('sources', reference.sourceId!, OWNER);
    required(source?.kind === 'source' && source.ownerId === OWNER && source.active && source.authorized && (principal.administrator || source.scope === 'family'), '来源已撤权、停用或停止共享。', 403);
    required(source.revision === reference.sourceRevision, '来源版本已变化，请重新查询。');
    if (reference.kind === 'book') {
      const book = repository.read('books', reference.id, OWNER);
      required(book?.kind === 'book' && book.ownerId === OWNER && book.source === source.id && book.scope === source.scope && book.status === 'published' && (principal.administrator || book.scope === 'family'), '这份原文已撤下或不在当前授权范围。', 403);
      required(book.revision === reference.revision && book.version === reference.version, '书页版本已变化，请重新查询。');
      const pages = (book.pageTexts || []).filter((page: any) => page.page === reference.page); required(pages.length === 1, '当前书页已变化。'); text = string(pages[0].text);
    } else {
      const documents = (source.documents || []).filter((document: any) => document.id === reference.id); required(documents.length === 1, '保存资料已变化，请重新查询。'); text = string(documents[0].text);
    }
  }
  required(evidenceHash(text) === reference.sha256 && text.slice(reference.offset, reference.offset + reference.quote.length) === reference.quote, '正文或摘录位置已变化，请重新查询。');
  return text;
}

export function evidenceContext(text: string, reference: EvidenceReference) {
  const range = boundaries(text, Math.max(0, reference.offset - 700), Math.min(text.length, reference.offset + reference.quote.length + 700));
  return {text: text.slice(range.start, range.end), quote: reference.quote, quoteStart: reference.offset - range.start, contextStart: range.start, hasEarlierText: range.start > 0, hasLaterText: range.end < text.length};
}
