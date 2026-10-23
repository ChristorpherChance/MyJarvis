import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { V1Repository } from '../src/v1/repository.js';
import { BusinessError, type DomainHandler } from '../src/v1/types.js';
import { executeKnowledgeDocumentCommand, publishedKnowledgeDocumentEntries, resolvePublishedKnowledgeDocument, syncRecordCurrent } from '../src/runtime/knowledge-documents.js';
import { registerKnowledgeDocumentRoutes } from '../src/runtime/knowledge-document-routes.js';
import { resolveKnowledgeReference } from '../src/runtime/knowledge-reference.js';
import { RuntimeAccessError } from '../src/runtime/identity.js';
import { registerKnowledgeRuntime, KnowledgeRuntime } from '../src/runtime/knowledge-runtime.js';

const actor = 'server-admin', hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function fixture(secureRoutes = false, bodyText = '第一段正文\n\n第二段正文') {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-knowledge-documents-'));
  const dbPath = join(root, 'test.db'), db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE audit(id INTEGER PRIMARY KEY,action TEXT,subjectId TEXT,details TEXT,createdAt TEXT)'); db.close();
  const repo = new V1Repository(dbPath), bytes = Buffer.from('real original bytes'), directory = join(root, 'inbox-assets');
  await mkdir(directory); const assetId = randomUUID(), sourceId = randomUUID(), body = bodyText;
  await writeFile(join(directory, assetId + '.bin'), bytes);
  const seed: DomainHandler = { domain: 'sources', commands: [], execute(_c, p, ctx) { return ctx.create(p.domain, p.body, p.id); } };
  const save = (domain: 'sources' | 'inbox-assets', id: string, record: any) => repo.execute(seed, 'seed', { commandId: randomUUID(), expectedVersion: 0, scope: 'private', payload: { domain, id, body: record } }, actor, () => undefined).data;
  save('sources', sourceId, { kind: 'source', active: true, authorized: true, mode: 'local', name: 'test' });
  save('inbox-assets', assetId, { kind: 'upload', status: 'stored', lifecycle: 'active', mime: 'text/plain', size: bytes.length, sha256: hash(bytes), extractedText: body, extraction: { textSha256: hash(body), segments: [{ text: '第一段正文\n\n第二段正文' }] }, textTruncated: false });
  const app = Fastify(); app.addHook('onRequest', async (request:any) => { const cookieHeader=String(request.headers.cookie??''); request.cookies=Object.fromEntries(cookieHeader.split(';').map((part:string)=>part.trim().split('=').map(decodeURIComponent)).filter((parts:string[])=>parts.length===2)); }); app.setErrorHandler((error: any, _request, reply) => reply.code(error.status ?? 500).send({ code: error.code ?? 'ERROR', message: error.message }));
  let allowAdmin = true;
  registerKnowledgeDocumentRoutes(app, repo, secureRoutes ? { actorId: actor, authenticated: cookie => cookie === 'valid-admin' && allowAdmin, authorize: request => { if (request.cookies?.jarvis_member_session || request.cookies?.jarvis_terminal || request.headers.authorization !== undefined || Object.keys(request.headers).some((key: string) => /^x-(?:jarvis-)?(?:terminal|pairing)(?:-|$)/i.test(key))) throw new RuntimeAccessError('FORBIDDEN', 'admin only', 403); } } : { actorId: actor }, { directory });
  const knowledgeRuntime = new KnowledgeRuntime(repo, {health:()=>({configured:false}),run:async()=>{throw Error('model disabled');},abort:async()=>{}} as any, {uploadsDirectory:join(root,'uploads'),workDirectory:join(root,'work')});
  registerKnowledgeRuntime(app,knowledgeRuntime,{authenticated:cookie=>cookie==='valid-admin'&&allowAdmin,authorizeReference:request=>{if(request.headers.authorization!==undefined||request.headers['x-jarvis-terminal-id'])throw new BusinessError('FORBIDDEN','admin only',403);}}); await app.ready();
  const run = (command: string, id: string, expectedVersion: number, commandId = randomUUID(), payload: Record<string, any> = {}) => executeKnowledgeDocumentCommand(repo, command, { commandId, expectedVersion, scope: 'private', payload: { id, ...payload } }, actor).data as any;
  return { root, repo, app, sourceId, assetId, body, run, knowledgeRuntime, setAdminAllowed(value: boolean) { allowAdmin = value; }, async close() { await app.close(); await knowledgeRuntime.close(); repo.close(); const target = resolve(root); assert.ok(target.startsWith(resolve(tmpdir()) + sep)); await rm(target, { recursive: true, force: true }); } };
}

test('document segments preserve exact multiline text and source/asset binding', async () => {
  const f = await fixture(); try {
    const original = f.repo.read('inbox-assets', f.assetId, actor)!;
    const seed: DomainHandler = { domain: 'inbox-assets', commands: [], execute(_c, p, ctx) { const old = ctx.require('inbox-assets', p.id, true); ctx.check(old); return ctx.update('inbox-assets', old.id, { extraction: { ...old.extraction, segments: [
      { text: '第一段正文', paragraph: 1, location: 'original://paragraph/1', sha256: hash('第一段正文') },
      { text: '第二段正文', paragraph: 2, location: 'original://paragraph/2', sha256: hash('第二段正文') },
    ] } }); } };
    f.repo.execute(seed, 'set-segments', { commandId: randomUUID(), expectedVersion: original!.revision, scope: 'private', payload: { id: f.assetId } }, actor, () => undefined);
    const created = executeKnowledgeDocumentCommand(f.repo, 'create', { commandId: randomUUID(), expectedVersion: 0, scope: 'private', payload: { sourceId: f.sourceId, assetId: f.assetId, title: 'Synthetic document' } }, actor).data as any;
    assert.equal(created.text, f.body); assert.equal(created.segments.map((part: any) => part.text).join(''), f.body); assert.equal(created.segments.length, 2);
    assert.deepEqual(created.segments.map((part: any) => part.location), ['original://paragraph/1', 'original://paragraph/2']);
    assert.equal(created.segments.map((part:any)=>part.text).join(''),f.body,'segments including attached separators must reconstruct exact body');
    assert.deepEqual(created.segments.map((part: any) => part.sha256), [hash('第一段正文\n\n'), hash('第二段正文')]);
    assert.equal(syncRecordCurrent(f.repo, actor, created), true);
    assert.throws(() => f.run('publish', created.id, created.revision, randomUUID(), { confirmed: true }), (error: any) => error instanceof BusinessError && error.status === 409);
    const reviewed = f.run('review', created.id, created.revision, randomUUID(), { confirmed: true, evidence: '人工检查合成正文' });
    assert.throws(() => f.run('review', reviewed.id, reviewed.revision, randomUUID(), { confirmed: true, evidence: '重复审核' }), (error: any) => error instanceof BusinessError && error.status === 409);
    const published = f.run('publish', reviewed.id, reviewed.revision, randomUUID(), { confirmed: true });
    assert.throws(() => f.run('review', published.id, published.revision, randomUUID(), { confirmed: true, evidence: '已发布不能退回' }), (error: any) => error instanceof BusinessError && error.status === 409);
    const revised = f.run('revise', published.id, published.revision);
    assert.equal(revised.versionHistory.length, 1); assert.equal(revised.versionHistory[0].text, f.body); assert.equal(revised.versionHistory[0].status, 'published');
  } finally { await f.close(); }
});

test('segment reconstruction preserves separator protocol, empty source paragraphs, whitespace, and long chunk locations', async () => {
  for (const scenario of [
    { body:'A \nB', raw:[{text:'A ',location:'original://p/1'},{text:'',location:'original://p/2'},{text:'\nB',location:'original://p/3'}], locations:['original://p/1','original://p/2','original://p/3'] },
    { body:'  A\n\n\n\n B  ', raw:[{text:'  A',location:'original://p/1'},{text:'',location:'original://p/2'},{text:' B  ',location:'original://p/3'}], locations:['original://p/1','original://p/2','original://p/3'] },
    { body:'x'.repeat(1201)+'\n\nlast', raw:[{text:'x'.repeat(1201),location:'original://p/long'},{text:'last',location:'original://p/end'}], locations:['original://p/long','original://p/long','original://p/end'] },
  ]) {
    const f=await fixture(false,scenario.body);try{
      const current=f.repo.read('inbox-assets',f.assetId,actor)!;
      const setSegments:DomainHandler={domain:'inbox-assets',commands:[],execute(_c,_p,ctx){const item=ctx.require('inbox-assets',f.assetId,true);ctx.check(item);return ctx.update('inbox-assets',item.id,{extraction:{...item.extraction,segments:scenario.raw}});}};
      f.repo.execute(setSegments,'segment-fixture',{commandId:randomUUID(),expectedVersion:current.revision,scope:'private',payload:{}},actor,()=>undefined);
      const doc=executeKnowledgeDocumentCommand(f.repo,'create',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{sourceId:f.sourceId,assetId:f.assetId,title:'Segment protocol fixture'}},actor).data as any;
      assert.equal(doc.segments.map((part:any)=>part.text).join(''),scenario.body);
      assert.deepEqual(doc.segments.map((part:any)=>part.location),scenario.locations);
      assert.deepEqual(doc.segments.map((part:any)=>part.sha256),doc.segments.map((part:any)=>hash(part.text)));
    }finally{await f.close();}
  }
});

test('manual asset text review is snapshotted on revise and publication references invalidate on revocation', async () => {
  const f = await fixture(); try {
    const created = executeKnowledgeDocumentCommand(f.repo, 'create', { commandId: randomUUID(), expectedVersion: 0, scope: 'private', payload: { sourceId: f.sourceId, assetId: f.assetId, title: 'Synthetic document' } }, actor).data as any;
    const originalReview=f.run('review',created.id,created.revision,randomUUID(),{confirmed:true,evidence:'原件人工核对'}), originalPublished=f.run('publish',created.id,originalReview.revision,randomUUID(),{confirmed:true}), originalSegment=originalPublished.segments[0];
    const staleQueryId=randomUUID(), staleQuery:DomainHandler={domain:'sources',commands:[],execute(_c,_p,ctx){return ctx.create('sources',{kind:'query',status:'complete',results:[{source:f.sourceId,documentId:originalPublished.id,version:originalPublished.version,segment:originalSegment.index,location:`document://${encodeURIComponent(originalPublished.id)}/${originalPublished.version}/segment/${originalSegment.index}`,sha256:originalSegment.sha256,offset:0,text:originalSegment.text,title:originalPublished.title}],createdAt:ctx.now,updatedAt:ctx.now},staleQueryId);}};
    f.repo.execute(staleQuery,'seed-stale-query',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{}},actor,()=>undefined);
    const seed: DomainHandler = { domain: 'inbox-assets', commands: [], execute(_c, p, ctx) { const old = ctx.require('inbox-assets', p.id, true); ctx.check(old); return ctx.update('inbox-assets', old.id, { textReview: p.review, extractedText: p.review.text, updatedAt: ctx.now }); } };
    const current = f.repo.read('inbox-assets', f.assetId, actor)!;
    f.repo.execute(seed, 'review-text', { commandId: randomUUID(), expectedVersion: current.revision, scope: 'private', payload: { id: current.id, review: { text: '人工修订正文\n\n保留换行', sourceTextSha256: hash(f.body) } } }, actor, () => undefined);
    assert.equal(syncRecordCurrent(f.repo, actor, originalPublished), false);
    assert.throws(()=>resolveKnowledgeReference(f.repo,actor,{queryId:staleQueryId,source:f.sourceId,location:`document://${encodeURIComponent(originalPublished.id)}/${originalPublished.version}/segment/${originalSegment.index}`,sha256:originalSegment.sha256}),(error:any)=>error instanceof BusinessError&&error.status===409);
    assert.equal(publishedKnowledgeDocumentEntries(f.repo,actor).length,0);
    const revised = f.run('revise', originalPublished.id, originalPublished.revision); assert.equal(revised.text, '人工修订正文\n\n保留换行'); assert.equal(revised.version, 2);
    const reviewed = f.run('review', revised.id, revised.revision, randomUUID(), { confirmed: true, evidence: '人工核对原文' });
    const published = f.run('publish', reviewed.id, reviewed.revision, randomUUID(), { confirmed: true });
    assert.equal(published.status, 'published'); assert.equal(publishedKnowledgeDocumentEntries(f.repo, actor).length, 1);
    const segment = published.segments[0]; assert.ok(resolvePublishedKnowledgeDocument(f.repo, actor, published.id, published.version, segment.index, segment.sha256));
    assert.throws(()=>resolveKnowledgeReference(f.repo,actor,{queryId:staleQueryId,source:f.sourceId,location:`document://${encodeURIComponent(originalPublished.id)}/${originalPublished.version}/segment/${originalSegment.index}`,sha256:originalSegment.sha256}),(error:any)=>error instanceof BusinessError&&error.status===409);
    const queryId = randomUUID(), queryHandler: DomainHandler = { domain: 'sources', commands: [], execute(_c, _p, ctx) { return ctx.create('sources', { kind: 'query', status: 'complete', results: [{ source: f.sourceId, documentId: published.id, version: published.version, segment: segment.index, location: `document://${encodeURIComponent(published.id)}/${published.version}/segment/${segment.index}`, sha256: segment.sha256, offset: 0, text: segment.text, title: published.title }], createdAt: ctx.now, updatedAt: ctx.now }, queryId); } };
    f.repo.execute(queryHandler, 'seed-query', { commandId: randomUUID(), expectedVersion: 0, scope: 'private', payload: {} }, actor, () => undefined);
    const resolvedReference = resolveKnowledgeReference(f.repo, actor, { queryId, source: f.sourceId, location: `document://${encodeURIComponent(published.id)}/${published.version}/segment/${segment.index}`, sha256: segment.sha256 });
    assert.equal(resolvedReference.originalLocation, undefined, 'manually edited text does not receive fabricated source coordinates');
    const source = f.repo.read('sources', f.sourceId, actor)!;
    const mutation: DomainHandler = { domain: 'sources', commands: [], execute(_c, p, ctx) { const old = ctx.require('sources', p.id, true); ctx.check(old); return ctx.update('sources', old.id, p.patch); } };
    f.repo.execute(mutation, 'revoke', { commandId: randomUUID(), expectedVersion: source.revision, scope: 'private', payload: { id: source.id, patch: { authorized: false } } }, actor, () => undefined);
    assert.equal(publishedKnowledgeDocumentEntries(f.repo, actor).length, 0);
    assert.equal(resolvePublishedKnowledgeDocument(f.repo, actor, published.id, published.version, segment.index, segment.sha256), null);
  } finally { await f.close(); }
});

test('published references fail closed on source scope, asset revision or segment hash changes', async () => {
  const f=await fixture();try{
    const created=executeKnowledgeDocumentCommand(f.repo,'create',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{sourceId:f.sourceId,assetId:f.assetId,title:'Invalidation fixture'}},actor).data as any;
    const reviewed=f.run('review',created.id,created.revision,randomUUID(),{confirmed:true,evidence:'核对'}),published=f.run('publish',created.id,reviewed.revision,randomUUID(),{confirmed:true}),part=published.segments[0],queryId=randomUUID();
    const queryHandler:DomainHandler={domain:'sources',commands:[],execute(_c,_p,ctx){return ctx.create('sources',{kind:'query',status:'complete',results:[{source:f.sourceId,documentId:published.id,version:published.version,segment:part.index,location:`document://${encodeURIComponent(published.id)}/${published.version}/segment/${part.index}`,sha256:part.sha256,offset:0,text:part.text,title:published.title}],createdAt:ctx.now,updatedAt:ctx.now},queryId);}};
    f.repo.execute(queryHandler,'seed-query',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{}},actor,()=>undefined);
    const input={queryId,source:f.sourceId,location:`document://${encodeURIComponent(published.id)}/${published.version}/segment/${part.index}`,sha256:part.sha256};
    assert.ok(resolveKnowledgeReference(f.repo,actor,input));
    assert.throws(()=>resolveKnowledgeReference(f.repo,actor,{...input,sha256:'0'.repeat(64)}),(e:any)=>e instanceof BusinessError&&e.status===404);
    const asset=f.repo.read('inbox-assets',f.assetId,actor)!;const changeAsset:DomainHandler={domain:'inbox-assets',commands:[],execute(_c,_p,ctx){const current=ctx.require('inbox-assets',f.assetId,true);ctx.check(current);return ctx.update('inbox-assets',current.id,{title:'changed metadata'});}};
    f.repo.execute(changeAsset,'asset-metadata-change',{commandId:randomUUID(),expectedVersion:asset.revision,scope:'private',payload:{}},actor,()=>undefined);
    assert.equal(syncRecordCurrent(f.repo,actor,published),false);
    assert.equal(publishedKnowledgeDocumentEntries(f.repo,actor).length,0);
    assert.throws(()=>resolveKnowledgeReference(f.repo,actor,input),(e:any)=>e instanceof BusinessError&&e.status===409);
    const latestSource=f.repo.read('sources',f.sourceId,actor)!;const scopeChange:DomainHandler={domain:'sources',commands:[],execute(_c,_p,ctx){const current=ctx.require('sources',f.sourceId,true);ctx.check(current);return ctx.update('sources',current.id,{scope:'family'});}};
    f.repo.execute(scopeChange,'scope-change',{commandId:randomUUID(),expectedVersion:latestSource.revision,scope:'private',payload:{}},actor,()=>undefined);
    assert.throws(()=>resolveKnowledgeReference(f.repo,actor,input),(e:any)=>e instanceof BusinessError&&e.status===409);
  }finally{await f.close();}
});

test('HTTP routes require explicit human review and verified original bytes; command retries are idempotent', async () => {
  const f = await fixture(true); try {
    const post = async (url: string, body: any, headers: Record<string,string> = {}) => f.app.inject({ method: 'POST', url, headers: { ...(!Object.hasOwn(headers,'cookie')?{cookie:'jarvis_session=valid-admin'}:{}), ...headers }, payload: body });
    const createBody = { commandId: randomUUID(), expectedVersion: 0, scope: 'private', sourceId: f.sourceId, assetId: f.assetId, title: 'HTTP document' };
        for (const [headers, expected] of [[{},401],[{cookie:'jarvis_member_session=member'},403],[{cookie:'jarvis_session=valid-admin; jarvis_member_session=member'},403],[{cookie:'jarvis_session=expired'},401],[{authorization:'Bearer terminal'},403],[{'x-jarvis-terminal-id':'terminal'},403]] as any) {
      const denied = await f.app.inject({ method:'POST', url:'/api/v1/knowledge/documents', headers, payload:createBody }); assert.equal(denied.statusCode, expected, denied.body); assert.doesNotMatch(denied.body, /第一段正文|第二段正文/);
    }
    f.setAdminAllowed(false); assert.equal((await post('/api/v1/knowledge/documents', createBody)).statusCode, 401); f.setAdminAllowed(true);
    const createId = createBody.commandId, create = await post('/api/v1/knowledge/documents', createBody); assert.equal(create.statusCode, 200, create.body);
    const document = JSON.parse(create.body).data, reviewBody = { commandId: randomUUID(), expectedVersion: document.revision, confirmed: true, evidence: 'synthetic human review' };
    const requestWithCookie = async (method: string, url: string, cookieValue: string, payload?: unknown, extraHeaders: Record<string,string> = {}) => f.app.inject({ method, url, headers: { ...(cookieValue ? { cookie: cookieValue } : {}), ...extraHeaders }, ...(payload === undefined ? {} : { payload }) });
    const protectedRequests: Array<{method:string;url:string;payload?:unknown}> = [
      {method:'GET',url:'/api/v1/knowledge/documents'},
      {method:'GET',url:`/api/v1/knowledge/documents/${document.id}`},
      {method:'POST',url:`/api/v1/knowledge/documents/${document.id}/review`,payload:reviewBody},
      {method:'POST',url:`/api/v1/knowledge/documents/${document.id}/publish`,payload:{commandId:randomUUID(),expectedVersion:document.revision,confirmed:true}},
      {method:'POST',url:`/api/v1/knowledge/documents/${document.id}/revise`,payload:{commandId:randomUUID(),expectedVersion:document.revision}},
      {method:'GET',url:`/api/v1/knowledge/documents/${document.id}/original`},
    ];
    for (const action of protectedRequests) {
      for (const [cookie, expected] of [['',401],['jarvis_member_session=member',403],['jarvis_session=valid-admin; jarvis_member_session=member',403],['jarvis_session=expired',401]] as Array<[string,number]>) {
        const denied = await requestWithCookie(action.method, action.url, cookie, action.payload); assert.equal(denied.statusCode, expected, denied.body); assert.doesNotMatch(denied.body, /第一段正文|第二段正文/);
      }
      for (const extraHeaders of [{authorization:'Bearer terminal'},{'x-jarvis-terminal-id':'terminal'}]) {
        const denied = await requestWithCookie(action.method, action.url, 'jarvis_session=valid-admin', action.payload, extraHeaders); assert.equal(denied.statusCode,403,denied.body);
      }
    }
    const reviewed = await post(`/api/v1/knowledge/documents/${document.id}/review`, reviewBody); assert.equal(reviewed.statusCode, 200, reviewed.body);
    const retry = await post(`/api/v1/knowledge/documents/${document.id}/review`, reviewBody); assert.equal(retry.statusCode, 200); assert.equal(JSON.parse(retry.body).data.revision, JSON.parse(reviewed.body).data.revision);
    const published = await post(`/api/v1/knowledge/documents/${document.id}/publish`, { commandId: randomUUID(), expectedVersion: JSON.parse(reviewed.body).data.revision, confirmed: true }); assert.equal(published.statusCode, 200, published.body);
    const resolve = resolvePublishedKnowledgeDocument(f.repo, actor, document.id, 1, 0, JSON.parse(published.body).data.segments[0].sha256); assert.ok(resolve);
    const badRef=await post('/api/v1/knowledge/references/resolve',{queryId:randomUUID(),source:f.sourceId,location:'document://invalid/1/segment/0',sha256:'0'.repeat(64)}); assert.equal(badRef.statusCode,404);
    const source = f.repo.read('sources', f.sourceId, actor)!;
    const revoke: DomainHandler = { domain: 'sources', commands: [], execute(_command, p, ctx) { const current = ctx.require('sources', p.id, true); ctx.check(current); return ctx.update('sources', p.id, { authorized: false }); } };
    f.repo.execute(revoke, 'revoke', { commandId: randomUUID(), expectedVersion: source.revision, scope: source.scope, payload: { id: source.id } }, actor, () => undefined);
    const revokedQueryId=randomUUID(),revokedQuery:DomainHandler={domain:'sources',commands:[],execute(_c,_p,ctx){return ctx.create('sources',{kind:'query',status:'complete',results:[{source:f.sourceId,documentId:document.id,version:1,segment:0,location:`document://${encodeURIComponent(document.id)}/1/segment/0`,sha256:JSON.parse(published.body).data.segments[0].sha256,offset:0,text:f.body,title:'HTTP document'}],createdAt:ctx.now,updatedAt:ctx.now},revokedQueryId);}};f.repo.execute(revokedQuery,'seed-query',{commandId:randomUUID(),expectedVersion:0,scope:'private',payload:{}},actor,()=>undefined);const revokedRef=await post('/api/v1/knowledge/references/resolve',{queryId:revokedQueryId,source:f.sourceId,location:`document://${encodeURIComponent(document.id)}/1/segment/0`,sha256:JSON.parse(published.body).data.segments[0].sha256}); assert.equal(revokedRef.statusCode,403); assert.doesNotMatch(revokedRef.body,/第一段正文|第二段正文/);
    const oldReviewRetry = await post(`/api/v1/knowledge/documents/${document.id}/review`, reviewBody); assert.equal(oldReviewRetry.statusCode, 409);
    const oldCreateRetry=await post('/api/v1/knowledge/documents',{commandId:createId,expectedVersion:0,sourceId:f.sourceId,assetId:f.assetId,title:'HTTP document'});assert.equal(oldCreateRetry.statusCode,409);assert.ok(!oldCreateRetry.body.includes(f.body));
  } finally { await f.close(); }
});
