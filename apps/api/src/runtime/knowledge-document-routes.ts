import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { BusinessError, type BusinessRecord, type Scope } from '../v1/types.js';
import type { V1Repository, CommandReceipt } from '../v1/repository.js';
import { executeKnowledgeDocumentCommand, syncRecordCurrent } from './knowledge-documents.js';

export const MAX_KNOWLEDGE_DOCUMENT_BYTES = 32 * 1024 * 1024;
const scopeSchema = z.enum(['personal', 'private', 'family', 'company']);
const commandSchema = z.object({ commandId: z.uuid(), expectedVersion: z.number().int().min(1), confirmed: z.literal(true), evidence: z.string().trim().min(1).max(4000) }).strict();
const publishSchema = z.object({ commandId: z.uuid(), expectedVersion: z.number().int().min(1), confirmed: z.literal(true) }).strict();
const createSchema = z.object({ commandId: z.uuid(), expectedVersion: z.literal(0), scope: scopeSchema.default('private'), sourceId: z.uuid(), assetId: z.uuid(), title: z.string().trim().min(1).max(300) }).strict();
const reviseSchema = z.object({ commandId: z.uuid(), expectedVersion: z.number().int().min(1), title: z.string().trim().min(1).max(300).optional() }).strict();
export interface KnowledgeDocumentRouteIdentity {
  actorId: string;
  authenticated?: (cookie: string) => boolean;
  authorize?: (request: any) => void | Promise<void>;
}
export interface KnowledgeDocumentRouteOptions { directory: string; maxBytes?: number }
function fail(ok: unknown, message: string, status = 409): asserts ok {
  if (!ok) throw new BusinessError(status === 403 ? 'FORBIDDEN' : status === 404 ? 'VALIDATION' : status === 400 ? 'VALIDATION' : 'CONFLICT', message, status);
}
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function filePath(root: string, id: string): string {
  const parsed = z.uuid().parse(id).toLowerCase();
  const base = resolve(root), target = resolve(base, `${parsed}.bin`);
  if (!target.startsWith(base + sep)) throw new BusinessError('FORBIDDEN', '文档原件路径越界', 403);
  return target;
}
async function verifiedBytes(root: string, asset: BusinessRecord, limit: number): Promise<Buffer> {
  fail(Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= limit, '文档原件超过安全读取限制', 413);
  let handle;
  try {
    const target = filePath(root, asset.id), rootStat = await lstat(resolve(root));
    fail(rootStat.isDirectory() && !rootStat.isSymbolicLink(), '文档原件目录无效', 409);
    const statBefore = await lstat(target);
    fail(statBefore.isFile() && !statBefore.isSymbolicLink() && statBefore.size === asset.size, '原件文件类型或大小异常', 409);
    handle = await open(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    fail(stat.isFile() && stat.dev === statBefore.dev && stat.ino === statBefore.ino && stat.size === asset.size, '原件文件已改变', 409);
    const bytes = await handle.readFile();
    const after = await lstat(target);
    fail(after.isFile() && !after.isSymbolicLink() && after.dev === stat.dev && after.ino === stat.ino && after.size === stat.size && bytes.length === asset.size && sha(bytes) === asset.sha256, '原件指纹异常，停止审核或发布', 409);
    return bytes;
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') throw new BusinessError('NOT_CONFIGURED', '文档原件暂不可用，请核查存储', 503);
    throw error;
  } finally { await handle?.close(); }
}
function reply(data: unknown, version: number) { return { requestId: randomUUID(), version, data, events: [] }; }
function currentDocument(repo: V1Repository, actor: string, id: string, scope?: Scope): BusinessRecord {
  const document = repo.read('books', z.uuid().parse(id).toLowerCase(), actor);
  if (!document || document.kind !== 'document' || scope && document.scope !== scope) throw new BusinessError('VALIDATION', '知识文档不存在或不可访问', 404);
  return document;
}

export function registerKnowledgeDocumentRoutes(app: FastifyInstance, repo: V1Repository, identity: KnowledgeDocumentRouteIdentity, options: KnowledgeDocumentRouteOptions): void {
  const actor = identity.actorId, root = resolve(options.directory), maxBytes = options.maxBytes ?? MAX_KNOWLEDGE_DOCUMENT_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_KNOWLEDGE_DOCUMENT_BYTES) throw new TypeError('maxBytes must be 1..32MiB');
  const authenticate = async (request: any) => {
    if (Object.keys(request.cookies ?? {}).some((key: string) => /member|terminal|pairing/i.test(key)) || request.headers.authorization !== undefined || Object.keys(request.headers).some((key: string) => /^x-(?:jarvis-)?(?:terminal|pairing)(?:-|$)/i.test(key))) throw new BusinessError('FORBIDDEN', '请以管理员本人身份管理知识文档', 403);
    if (identity.authenticated && !identity.authenticated(request.cookies?.jarvis_session ?? '')) throw new BusinessError('FORBIDDEN', '请登录后管理知识文档', 401);
    try { await identity.authorize?.(request); }
    catch (error) { if (error instanceof BusinessError) throw error; throw new BusinessError('FORBIDDEN', '请以当前管理员身份管理知识文档', 403); }
  };
  const response = (data: unknown, version = repo.version(actor)) => reply(data, version);
  app.get('/api/v1/knowledge/documents', { onRequest: authenticate }, async (request: any, replyObject) => {
    const query = z.object({ scope: scopeSchema.optional() }).strict().parse(request.query);
    const items = repo.list('books', actor, query.scope).filter(item => item.kind === 'document').map(item => ({ ...item, bindingCurrent: syncRecordCurrent(repo, actor, item, query.scope), bindingIssue: syncRecordCurrent(repo, actor, item, query.scope) ? null : '来源授权、原件状态或复核文字已变化' }));
    replyObject.header('Cache-Control', 'private, no-store'); return response({ items });
  });
  app.post('/api/v1/knowledge/documents', { onRequest: authenticate }, async request => {
    const input = createSchema.parse(request.body);
    const envelope={commandId:input.commandId,expectedVersion:input.expectedVersion,scope:input.scope,payload:input};
    const prior=repo.replay('books','create',envelope,actor);
    if(prior){const current=currentDocument(repo,actor,prior.data.id);fail(syncRecordCurrent(repo,actor,current),'来源、原件或文本已变化，旧创建回执不可重放',409);return prior;}
    return executeKnowledgeDocumentCommand(repo,'create',envelope,actor);
  });
  app.get<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id', { onRequest: authenticate }, async (request, replyObject) => {
    const document = currentDocument(repo, actor, request.params.id);
    replyObject.header('Cache-Control', 'private, no-store'); return response(syncRecordCurrent(repo, actor, document) ? document : { ...document, status: document.status, sourceCurrent: false }, document.revision);
  });
  for (const action of ['review', 'publish'] as const) {
    app.post<{ Params: { id: string } }>(`/api/v1/knowledge/documents/:id/${action}`, { onRequest: authenticate }, async request => {
      const input = (action === 'review' ? commandSchema : publishSchema).parse(request.body), id = z.uuid().parse(request.params.id).toLowerCase();
      const envelope = { commandId: input.commandId, expectedVersion: input.expectedVersion, scope: (repo.read('books', id, actor)?.scope ?? 'private') as Scope, payload: { id, confirmed: input.confirmed, ...(action === 'review' ? { evidence: (input as z.infer<typeof commandSchema>).evidence } : {}) } };
      const before = currentDocument(repo, actor, id, envelope.scope);
      const prior = repo.replay('books', action, envelope, actor);
      if (prior) {
        fail(syncRecordCurrent(repo, actor, before), '来源授权、原件或文本复核已改变，不能重放旧回执', 409);
        return { ...prior, data: { ...prior.data, review: prior.data.review && { ...prior.data.review, evidence: undefined } } };
      }
      fail(before.revision === input.expectedVersion, '文档版本已变化，请刷新后重试', 409);
      fail(syncRecordCurrent(repo, actor, before), '知识来源、原件或提取正文已变化；请重新创建文档', 409);
      const asset = repo.read('inbox-assets', before.assetId, actor);
      if (!asset) throw new BusinessError('VALIDATION', '原件不存在或不可访问', 404);
      await verifiedBytes(root, asset, maxBytes);
      await authenticate(request);
      const latest = currentDocument(repo, actor, id, envelope.scope), latestAsset = repo.read('inbox-assets', latest.assetId, actor);
      fail(latest.revision === before.revision && latestAsset?.revision === asset.revision && syncRecordCurrent(repo, actor, latest), '复核期间文档、来源或原件已变化', 409);
      return executeKnowledgeDocumentCommand(repo, action, envelope, actor);
    });
  }
  app.post<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id/revise', { onRequest: authenticate }, async request => {
    const input = reviseSchema.parse(request.body), id = z.uuid().parse(request.params.id).toLowerCase();
    const current = currentDocument(repo, actor, id), envelope = { commandId: input.commandId, expectedVersion: input.expectedVersion, scope: current.scope, payload: { id, ...(input.title === undefined ? {} : { title: input.title }) } };
    const prior=repo.replay('books','revise',envelope,actor);
    if(prior){fail(syncRecordCurrent(repo,actor,current),'来源、原件或文本已变化，旧修订回执不可重放',409);return prior;}
    return executeKnowledgeDocumentCommand(repo, 'revise', envelope, actor);
  });
  app.get<{ Params: { id: string } }>('/api/v1/knowledge/documents/:id/original', { onRequest: authenticate }, async (request, replyObject) => {
    const document = currentDocument(repo, actor, request.params.id);
    fail(syncRecordCurrent(repo, actor, document), '知识来源、原件或提取正文已变化', 409);
    const asset = repo.read('inbox-assets', document.assetId, actor);
    if (!asset) throw new BusinessError('VALIDATION', '原件不存在或不可访问', 404);
    const bytes = await verifiedBytes(root, asset, maxBytes);
    await authenticate(request);
    const latest = currentDocument(repo, actor, document.id);
    fail(latest.revision === document.revision && syncRecordCurrent(repo, actor, latest), '原件读取期间文档绑定已变化', 409);
    replyObject.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; sandbox");
    return replyObject.type(asset.mime || 'application/octet-stream').send(bytes);
  });
}
