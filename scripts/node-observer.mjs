/** Separate read-only node agent. Standby observation never opens business databases. */
import { createServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { ClusterRuntime, readNodeConfiguration, readTrustedJson, requestNodeJson, PLATFORM_BUILD } from '../apps/api/dist/runtime/cluster-runtime.js';
const configuration = await readNodeConfiguration(process.env.JARVIS_NODE_CONFIG ?? '/etc/jarvis/node.json');
const tls = { key: await readFile(process.env.JARVIS_TLS_KEY), cert: await readFile(process.env.JARVIS_TLS_CERT) };
const runtime = new ClusterRuntime(configuration);
let checking;
async function status() {
  if (checking) return checking;
  checking = (async () => {
    const current = await readNodeConfiguration(process.env.JARVIS_NODE_CONFIG ?? '/etc/jarvis/node.json');
    let business;
    try { business = await requestNodeJson('https://127.0.0.1:3140/api/health', await readFile(current.caPath), undefined, 1500); } catch { business = null; }
    let dependencies;
    try { dependencies = await readTrustedJson(current.controlDir + '/dependencies.json'); } catch { dependencies = null; }
    return { version: 1, clusterId: current.clusterId, nodeId: current.nodeId, role: current.role, epoch: current.epoch, build: PLATFORM_BUILD,
      observedAt: new Date().toISOString(), businessHealthy: business?.status === 'ok' && business?.nodeId === current.nodeId && business?.role === current.role,
      businessBuild: business?.build ?? null, snapshot: await runtime.localSnapshot(), dependenciesReady: dependencies?.status === 'passed' && dependencies?.build === PLATFORM_BUILD };
  })().finally(() => { checking = undefined; });
  return checking;
}
const server = createServer(tls, (req, res) => {
  const supplied = req.headers['x-jarvis-node-token'];
  const valid = typeof supplied === 'string' && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied), Buffer.from(configuration.observerToken));
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
  if (!valid) { res.writeHead(401); res.end('{"error":"NODE_AUTH_REQUIRED"}'); return; }
  if (req.method !== 'GET' || req.url !== '/status') { res.writeHead(404); res.end('{"error":"NOT_FOUND"}'); return; }
  void status().then(value => { res.writeHead(200); res.end(JSON.stringify(value)); }, () => { res.writeHead(503); res.end('{"error":"NODE_STATE_UNAVAILABLE"}'); });
});
server.headersTimeout = 5000; server.requestTimeout = 5000; server.keepAliveTimeout = 3000; server.maxHeadersCount = 20;
await new Promise((ok, fail) => { server.once('error', fail); server.listen(3141, '0.0.0.0', ok); });
console.log('Authenticated read-only node observer started: ' + configuration.nodeId);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
