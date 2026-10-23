import { createHash, randomUUID } from 'node:crypto';
import { BusinessError, type BusinessRecord, type CommandContext, type DomainHandler, type Scope } from '../v1/types.js';
import type { V1Repository, CommandReceipt } from '../v1/repository.js';

export interface KnowledgeDocumentSegment {
  id: string;
  index: number;
  text: string;
  sha256: string;
  location: string | null;
}
export interface KnowledgeDocumentRecord extends BusinessRecord {
  kind: 'document';
  status: 'draft' | 'reviewed' | 'published' | 'revised';
  title: string;
  sourceId: string;
  assetId: string;
  sourceRevision: number;
  assetRevision: number;
  materialSha256: string;
  sourceTextSha256: string;
  materialTextReviewSha256: string;
  textSha256: string;
  version: number;
  text: string;
  segments: KnowledgeDocumentSegment[];
  review: null | { actorId: string; at: string; evidence: string; sourceRevision: number; assetRevision: number; materialSha256: string; sourceTextSha256: string; textSha256: string; materialTextReviewSha256: string; version: number };
  reviewHistory: Array<NonNullable<KnowledgeDocumentRecord['review']>>;
  versionHistory: Array<{ version: number; title: string; status: KnowledgeDocumentRecord['status']; text: string; textSha256: string; sourceRevision: number; assetRevision: number; materialSha256: string; sourceTextSha256: string; materialTextReviewSha256: string; segments: KnowledgeDocumentSegment[]; review: KnowledgeDocumentRecord['review']; publishedAt: string | null; archivedAt: string }>;
  publishedAt: string | null;
}
export interface KnowledgeDocumentError extends BusinessError {}

const handler: DomainHandler = {
  domain: 'books', commands: [],
  execute(command, p, ctx) {
    const fail: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 422) => {
      if (!ok) throw new BusinessError(status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : 'REVIEW_REQUIRED', message, status);
    };
    const text = (value: unknown, label: string, max: number) => {
      if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BusinessError('VALIDATION', `${label}不能为空或过长`, 400);
      return value.trim();
    };
    const source = (id: string) => {
      const item = ctx.require('sources', id);
      fail(item.kind === 'source' && item.active === true && item.authorized === true && item.mode !== 'live', '知识来源未启用、未授权或不能用于本地文档', 403);
      return item;
    };
    const asset = (id: string) => {
      const item = ctx.require('inbox-assets', id);
      fail(item.kind === 'upload' && item.status === 'stored' && (item.lifecycle ?? 'active') === 'active' && item.deletion?.status !== 'running' && item.lastReuse?.status !== 'running', '原件不可用或已删除', 409);
      fail(typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256) && typeof item.extractedText === 'string' && item.extractedText.length > 0 && item.textTruncated !== true, '原件没有完整可审核的提取正文', 422);
      fail(item.scope === ctx.scope && item.ownerId === ctx.actorId, '原件身份或范围不一致', 403);
      return item;
    };
    const record = (id: string, check = true) => {
      const item = ctx.require('books', id, true);
      if (check) ctx.check(item);
      fail(item.kind === 'document', '知识文档不存在', 404);
      return item as KnowledgeDocumentRecord;
    };
    const effectiveText = (material: BusinessRecord) => typeof material.textReview?.text === 'string' ? material.textReview.text : material.extractedText;
    const textReviewHash = (material: BusinessRecord) => material.textReview ? sha(JSON.stringify({ text: material.textReview.text, sourceTextSha256: material.textReview.sourceTextSha256 })) : sha('');
    const currentSnapshot = (src: BusinessRecord, material: BusinessRecord) => ({ sourceRevision: src.revision, assetRevision: material.revision, materialSha256: material.sha256, sourceTextSha256: material.extraction?.textSha256 ?? sha(material.extractedText ?? ''), materialTextReviewSha256: textReviewHash(material), text: effectiveText(material) as string });
    const bindCurrent = (doc: KnowledgeDocumentRecord, requireReview = false, allowChanged = false) => {
      const src = source(doc.sourceId), material = asset(doc.assetId), snapshot = currentSnapshot(src, material);
      fail(doc.ownerId === ctx.actorId && doc.scope === ctx.scope && src.ownerId === ctx.actorId && material.ownerId === ctx.actorId && src.scope === ctx.scope && material.scope === ctx.scope, '文档、来源与原件身份或范围不一致', 403);
      if (!allowChanged) fail(snapshot.sourceRevision === doc.sourceRevision && snapshot.assetRevision === doc.assetRevision && snapshot.materialSha256 === doc.materialSha256 && snapshot.sourceTextSha256 === doc.sourceTextSha256 && snapshot.materialTextReviewSha256 === doc.materialTextReviewSha256 && sha(snapshot.text) === doc.textSha256, '来源、原件、提取正文或人工文字复核已变化；请重新修订并复核', 409);
      if (requireReview) fail(doc.review && doc.review.version === doc.version && doc.review.sourceRevision === snapshot.sourceRevision && doc.review.assetRevision === snapshot.assetRevision && doc.review.materialSha256 === snapshot.materialSha256 && doc.review.sourceTextSha256 === snapshot.sourceTextSha256 && doc.review.materialTextReviewSha256 === snapshot.materialTextReviewSha256 && doc.review.textSha256 === sha(doc.text), '当前文档版本未完成人工复核', 422);
      return { src, material, snapshot };
    };
    if (command === 'create') {
      if (ctx.expectedVersion !== 0) throw new BusinessError('CONFLICT', '新增记录的版本必须为0', 409);
      const src = source(text(p.sourceId, '知识来源', 200)), material = asset(text(p.assetId, '原件', 200));
      fail(src.scope === ctx.scope && material.scope === ctx.scope && src.ownerId === ctx.actorId && material.ownerId === ctx.actorId, '来源与原件身份或范围不一致', 403);
      fail(!material.sourceId || material.sourceId === src.id, '原件绑定了其他知识来源', 403);
      const bodyText = (typeof material.textReview?.text === 'string' ? material.textReview.text : material.extractedText) as string, segments = makeSegments(bodyText, material.textReview ? null : material.extraction?.segments), snapshot = { sourceRevision: src.revision, assetRevision: material.revision, materialSha256: material.sha256, sourceTextSha256: material.extraction?.textSha256 ?? sha(material.extractedText ?? ''), materialTextReviewSha256: material.textReview ? sha(JSON.stringify({ text: material.textReview.text, sourceTextSha256: material.textReview.sourceTextSha256 })) : sha('') };
      fail(!material.textReview || material.textReview.sourceTextSha256 === snapshot.sourceTextSha256, '人工复核文字已不匹配当前提取版本', 409);
      const doc = ctx.create('books', { kind: 'document', status: 'draft', title: text(p.title, '文档标题', 300), sourceId: src.id, assetId: material.id, ...snapshot, textSha256: sha(bodyText), version: 1, text: bodyText, segments, review: null, reviewHistory: [], versionHistory: [], publishedAt: null, createdAt: ctx.now, updatedAt: ctx.now }, p.id ?? randomUUID()) as KnowledgeDocumentRecord;
      ctx.emit('books', doc.id, 'document-created', { sourceId: src.id, assetId: material.id, version: doc.version }); return doc;
    }
    const doc = record(String(p.id));
    const { src, material, snapshot } = bindCurrent(doc, false, command === 'revise');
    if (command === 'review') {
      fail(['draft', 'revised'].includes(doc.status), '只有未复核草稿可以提交审核；已复核或发布版本请先修订', 409);
      fail(p.confirmed === true, '请明确确认已经人工审核原文与分段', 400);
      const evidence = text(p.evidence, '人工复核依据', 4000);
      const review = { actorId: ctx.actorId, at: ctx.now, evidence, sourceRevision: snapshot.sourceRevision, assetRevision: snapshot.assetRevision, materialSha256: snapshot.materialSha256, sourceTextSha256: snapshot.sourceTextSha256, materialTextReviewSha256: snapshot.materialTextReviewSha256, textSha256: sha(doc.text), version: doc.version };
      const updated = ctx.update('books', doc.id, { status: 'reviewed', review, reviewHistory: [...doc.reviewHistory, review].slice(-20), updatedAt: ctx.now }) as KnowledgeDocumentRecord;
      ctx.emit('books', doc.id, 'document-reviewed', { version: updated.version }); return updated;
    }
    if (command === 'publish') {
      fail(doc.status === 'reviewed', '只有已复核的当前草稿可以发布', 409);
      fail(p.confirmed === true, '请明确确认发布当前人工审核版本', 400);
      bindCurrent(doc, true);
      const updated = ctx.update('books', doc.id, { status: 'published', publishedAt: ctx.now, updatedAt: ctx.now }) as KnowledgeDocumentRecord;
      ctx.emit('books', doc.id, 'document-published', { version: updated.version }); return updated;
    }
    if (command === 'revise') {
      fail(typeof p.title === 'undefined' || typeof p.title === 'string' && !!p.title.trim() && p.title.length <= 300, '文档标题无效', 400);
      const bodyText = snapshot.text;
      const archived = { version: doc.version, title: doc.title, status: doc.status, text: doc.text, textSha256: doc.textSha256, sourceRevision: doc.sourceRevision, assetRevision: doc.assetRevision, materialSha256: doc.materialSha256, sourceTextSha256: doc.sourceTextSha256, materialTextReviewSha256: doc.materialTextReviewSha256, segments: doc.segments, review: doc.review, publishedAt: doc.publishedAt, archivedAt: ctx.now };
      const updated = ctx.update('books', doc.id, { ...(p.title === undefined ? {} : { title: p.title.trim() }), ...snapshot, textSha256: sha(bodyText), text: bodyText, segments: makeSegments(bodyText, material.textReview ? null : material.extraction?.segments), status: 'draft', versionHistory: [...(doc.versionHistory ?? []), archived].slice(-50), version: doc.version + 1, review: null, publishedAt: null, updatedAt: ctx.now }) as KnowledgeDocumentRecord;
      ctx.emit('books', doc.id, 'document-revised', { version: updated.version }); return updated;
    }
    throw new BusinessError('VALIDATION', '知识文档命令不存在', 400);
  },
};

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function makeSegments(text: string, extracted: unknown): KnowledgeDocumentSegment[] {
  const raw = Array.isArray(extracted) ? extracted.map((item: any) => typeof item?.text === 'string' ? { text: item.text, location: typeof item.location === 'string' ? item.location : null } : null).filter((item): item is { text: string; location: string | null } => item !== null) : [];
  // Parser text is built from segments joined with either no separator (legacy) or \n\n.
  // In the latter form attach the separator to the preceding segment so all bytes retain their source.
  let parts: { text: string; location: string | null }[] = [];
  if (raw.length && raw.map(part => part.text).join('') === text) parts = raw;
  else if (raw.length && raw.map(part => part.text).join('\n\n') === text) {
    parts = raw.map((part, index) => ({ text: part.text + (index < raw.length - 1 ? '\n\n' : ''), location: part.location }));
  } else parts = [{ text, location: null }];
  const segments: KnowledgeDocumentSegment[] = [];
  for (const part of parts) {
    if (!part.text.length) {
      segments.push({ id: randomUUID(), index: segments.length, text: '', sha256: sha(''), location: part.location });
      if (segments.length > 2000) throw new BusinessError('VALIDATION', '文档分段超过安全限制', 400);
      continue;
    }
    for (let at = 0; at < part.text.length; at += 1200) {
      const chunk = part.text.slice(at, at + 1200);
      segments.push({ id: randomUUID(), index: segments.length, text: chunk, sha256: sha(chunk), location: part.location });
      if (segments.length > 2000) throw new BusinessError('VALIDATION', '文档分段超过安全限制', 400);
    }
  }
  return segments;
}

export function syncRecordCurrent(repo: V1Repository, actor: string, value: BusinessRecord, scope?: Scope): boolean {
  if (!value || value.kind !== 'document' || value.ownerId !== actor || scope && value.scope !== scope) return false;
  const doc = repo.read('books', value.id, actor), source = repo.read('sources', value.sourceId, actor), asset = repo.read('inbox-assets', value.assetId, actor);
  return !!doc && doc.revision === value.revision && doc.kind === 'document' && !!source && source.kind === 'source' && source.active === true && source.authorized === true && source.mode !== 'live' && source.revision === doc.sourceRevision && source.scope === doc.scope && !!asset && asset.kind === 'upload' && asset.status === 'stored' && (asset.lifecycle ?? 'active') === 'active' && asset.deletion?.status !== 'running' && asset.lastReuse?.status !== 'running' && asset.revision === doc.assetRevision && asset.sha256 === doc.materialSha256 && asset.scope === doc.scope && asset.ownerId === actor && source.ownerId === actor && (!asset.sourceId || asset.sourceId === source.id) && typeof asset.extractedText === 'string' && (asset.extraction?.textSha256 ?? sha(asset.extractedText)) === doc.sourceTextSha256 && (asset.textReview ? sha(JSON.stringify({ text: asset.textReview.text, sourceTextSha256: asset.textReview.sourceTextSha256 })) : sha('')) === doc.materialTextReviewSha256 && sha(typeof asset.textReview?.text === 'string' ? asset.textReview.text : asset.extractedText) === doc.textSha256 && sha(doc.text) === doc.textSha256 && (!doc.review || doc.review.version === doc.version && doc.review.sourceRevision === doc.sourceRevision && doc.review.assetRevision === doc.assetRevision && doc.review.materialSha256 === doc.materialSha256 && doc.review.sourceTextSha256 === doc.sourceTextSha256 && doc.review.materialTextReviewSha256 === doc.materialTextReviewSha256 && doc.review.textSha256 === doc.textSha256);
}
export function publishedKnowledgeDocumentEntries(repo: V1Repository, actor: string, scope?: Scope): KnowledgeDocumentRecord[] {
  return repo.list('books', actor, scope).filter((item): item is KnowledgeDocumentRecord => item.kind === 'document' && item.status === 'published' && !!item.review && syncRecordCurrent(repo, actor, item, scope));
}
export function resolvePublishedKnowledgeDocument(repo: V1Repository, actor: string, id: string, version: number, segment: number | string, hash: string, scope?: Scope): { document: KnowledgeDocumentRecord; segment: KnowledgeDocumentSegment } | null {
  const item = repo.read('books', id, actor) as KnowledgeDocumentRecord | undefined;
  if (!item || item.kind !== 'document' || item.status !== 'published' || item.version !== version || !item.review || !syncRecordCurrent(repo, actor, item, scope)) return null;
  const part = item.segments.find(entry => (typeof segment === 'number' ? entry.index === segment : entry.id === segment) && entry.sha256 === hash && sha(entry.text) === entry.sha256);
  return part ? { document: item, segment: part } : null;
}
export function executeKnowledgeDocumentCommand(repo: V1Repository, command: string, envelope: { commandId: string; expectedVersion: number; scope: Scope; payload: Record<string, any> }, actor: string): CommandReceipt {
  return repo.execute(handler, command, { ...envelope, payload: { ...envelope.payload, ...(command === 'create' ? {} : { id: envelope.payload.id }) } }, actor, () => undefined);
}
