const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { buildSync } = require('esbuild');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-offline-shell-'));
const compiled = path.join(temporary, 'plugin.cjs');
buildSync({ entryPoints: [path.resolve('apps/web/build/offline-shell.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: compiled, logLevel: 'silent' });
const { offlineShell } = require(compiled);
const sha = value => createHash('sha256').update(value).digest('hex');
const origin = 'https://owned-offline.test';
function fixture() {
  return {
    'index.html': { type: 'asset', source: '<html>private platform fixture</html>' },
    'assets/platform-private.js': { type: 'chunk', code: 'PRIVATE_PLATFORM_FIXTURE', imports: [], dynamicImports: [] },
    'offline-capture.html': { type: 'asset', source: '<script src="/assets/offline.js"></script><link href="/assets/offline.css" rel="stylesheet">' },
    'assets/offline.js': { type: 'chunk', code: 'PUBLIC_OFFLINE_ENTRY', imports: ['assets/shared.js'], dynamicImports: [], viteMetadata: { importedCss: new Set(['assets/offline.css']), importedAssets: new Set() } },
    'assets/shared.js': { type: 'chunk', code: 'PUBLIC_REACT_RUNTIME', imports: [], dynamicImports: [] },
    'assets/offline.css': { type: 'asset', source: 'body{color:white}' },
  };
}
function generate(bundle) {
  const emitted = [];
  offlineShell().generateBundle.call({ emitFile: value => emitted.push(value) }, {}, bundle);
  const worker = emitted.find(value => value.fileName === 'offline-capture-sw.js').source;
  const manifest = JSON.parse(emitted.find(value => value.fileName === 'offline-capture-shell-manifest.json').source);
  return { bundle, worker, manifest };
}
class CacheStorage {
  rows = new Map();
  async has(name) { return this.rows.has(name); }
  async keys() { return [...this.rows.keys()]; }
  async delete(name) { return this.rows.delete(name); }
  async open(name) {
    if (!this.rows.has(name)) this.rows.set(name, new Map());
    const rows = this.rows.get(name);
    return { keys: async () => [...rows.keys()].map(url => new Request(url)), put: async (url, response) => rows.set(String(url), response.clone()), match: async url => rows.get(String(url))?.clone() };
  }
}
function harness(generated, caches, mismatch = false) {
  const handlers = new Map(), fetched = []; let claims = 0;
  const self = { location: { origin }, clients: { claim: async () => { claims++; } }, addEventListener: (name, callback) => handlers.set(name, callback) };
  const fetch = async request => {
    fetched.push({ url: request.url, credentials: request.credentials, cache: request.cache, redirect: request.redirect });
    const name = new URL(request.url).pathname.slice(1), asset = generated.bundle[name];
    assert.ok(asset, 'worker tried to fetch a non-manifest fixture');
    const bytes = mismatch && name.endsWith('.css') ? 'MISMATCH_FIXTURE' : asset.type === 'chunk' ? asset.code : asset.source;
    const response = new Response(bytes); Object.defineProperty(response, 'url', { value: request.url }); return response;
  };
  vm.runInNewContext(generated.worker, { self, caches, fetch, crypto: webcrypto, URL, Request, Response, Uint8Array, Set, Array, Error });
  return {
    fetched, get claims() { return claims; },
    async lifecycle(name) { let pending; handlers.get(name)({ waitUntil: value => { pending = value; } }); await pending; },
    async request(url, method = 'GET') { let response; handlers.get('fetch')({ request: new Request(url, { method }), respondWith: value => { response = value; } }); return response === undefined ? null : await response; },
  };
}
let checks = 0;
async function check(name, action) { await action(); checks++; console.log('PASS ' + name); }
(async () => {
  const generated = generate(fixture());
  await check('build manifest includes only the independent public dependency graph with exact fingerprints', () => {
    assert.deepEqual(generated.manifest.entries.map(row => row.path), ['/assets/offline.css', '/assets/offline.js', '/assets/shared.js', '/offline-capture.html']);
    assert.equal(generated.manifest.scope, '/offline-capture.html');
    for (const row of generated.manifest.entries) { const item = generated.bundle[row.path.slice(1)]; assert.equal(row.sha256, sha(item.type === 'chunk' ? item.code : item.source)); }
    assert.equal(generate(fixture()).manifest.version, generated.manifest.version);
    const changed = fixture(); changed['assets/offline.css'].source += 'a{color:red}';
    assert.notEqual(generate(changed).manifest.version, generated.manifest.version);
    assert.equal(generated.worker.includes('skipWaiting('), false);
  });
  await check('incomplete new installation rejects atomically and leaves the previous complete shell intact', async () => {
    const caches = new CacheStorage(), old = await caches.open('jarvis-public-offline-shell-v1:old-fixture');
    await old.put(origin + '/offline-capture.html', new Response('OLD_PUBLIC_SHELL'));
    const failed = harness(generated, caches, true);
    await assert.rejects(failed.lifecycle('install'), /fingerprint mismatch/);
    assert.deepEqual(await caches.keys(), ['jarvis-public-offline-shell-v1:old-fixture']);
    assert.equal(await (await old.match(origin + '/offline-capture.html')).text(), 'OLD_PUBLIC_SHELL');
    assert.equal(failed.claims, 0);
    for (const request of failed.fetched) assert.deepEqual([request.credentials, request.cache, request.redirect], ['omit', 'no-store', 'error']);
    const good = harness(generated, caches); await good.lifecycle('install');
    assert.equal((await caches.keys()).length, 2); assert.equal(good.claims, 0);
    await good.lifecycle('activate'); assert.deepEqual(await caches.keys(), ['jarvis-public-offline-shell-v1:' + generated.manifest.version]); assert.equal(good.claims, 1);
  });
  await check('runtime serves only exact static GET allowlist and never handles API, private pages, query URLs or unknown requests', async () => {
    const caches = new CacheStorage(), worker = harness(generated, caches); await worker.lifecycle('install');
    const originalFetches = worker.fetched.length;
    assert.equal(await (await worker.request(origin + '/offline-capture.html')).text(), generated.bundle['offline-capture.html'].source);
    for (const [url, method] of [[origin + '/api/v1/inbox', 'GET'], [origin + '/?mode=room', 'GET'], [origin + '/index.html', 'GET'], [origin + '/assets/platform-private.js', 'GET'], [origin + '/offline-capture.html?private=fixture', 'GET'], [origin + '/assets/offline.js?token=fixture', 'GET'], ['https://external.test/assets/offline.js', 'GET'], [origin + '/assets/offline.js', 'HEAD'], [origin + '/offline-capture.html', 'POST'], [origin + '/unknown', 'GET']]) assert.equal(await worker.request(url, method), null, url + ' ' + method);
    assert.equal(worker.fetched.length, originalFetches);
    const cache = await caches.open('jarvis-public-offline-shell-v1:' + generated.manifest.version);
    assert.deepEqual((await cache.keys()).map(item => new URL(item.url).pathname).sort(), generated.manifest.entries.map(row => row.path));
  });
  console.log(checks + ' offline shell checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { const target = path.resolve(temporary); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('jarvis-offline-shell-')); fs.rmSync(target, { recursive: true, force: true }); });
