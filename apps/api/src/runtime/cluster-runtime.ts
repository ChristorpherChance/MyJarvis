import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { IdentityRuntime, RuntimeAccessError, type RuntimePrincipal } from './identity.js';

export const PLATFORM_BUILD = '20261020-cc-switch-center-r56';
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const absolutePath = z.string().min(1).max(1000).refine(value => resolve(value) === value, 'Absolute path required');
const baseUrl = z.string().url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/'; });
const token = z.string().regex(/^[a-f0-9]{64}$/);
export const nodeConfiguration = z.object({
  version: z.literal(1), clusterId: id, nodeId: id, role: z.enum(['primary', 'standby', 'development']),
  epoch: z.number().int().min(1), release: id, dataDir: absolutePath, controlDir: absolutePath,
  caPath: absolutePath, observerToken: token,
  maxSnapshotLagSec: z.number().int().min(60).max(86400).default(900),
  peers: z.array(z.object({ nodeId: id, url: baseUrl, caPath: absolutePath, observerToken: token }).strict()).max(8)
}).strict().superRefine((value, context) => {
  const ids = new Set([value.nodeId]);
  for (const peer of value.peers) { if (ids.has(peer.nodeId)) context.addIssue({ code: 'custom', message: 'Duplicate node identity' }); ids.add(peer.nodeId); }
});
export type NodeConfiguration = z.infer<typeof nodeConfiguration>;

export async function readTrustedJson(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 128 * 1024) throw new Error('Invalid node control file');
  if (process.platform !== 'win32' && (info.uid !== 0 || (info.mode & 0o022) !== 0)) throw new Error('Node control files must be root-owned and protected');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function readNodeConfiguration(path: string) { return nodeConfiguration.parse(await readTrustedJson(path)); }
export async function enforceNodeStartup(path: string | undefined, dataDir: string, retiredFile?: string) {
  if (retiredFile) {
    let retired: unknown;
    try { retired = await readTrustedJson(retiredFile); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    if (retired) { const value = z.object({ version: z.literal(1), retiredDataDir: absolutePath, destination: z.string().min(1) }).strict().parse(retired); if (resolve(dataDir) === value.retiredDataDir) throw new Error('This data directory was retired after production migration; use isolated development data'); }
  }
  if (!path) return null;
  const config = await readNodeConfiguration(path);
  if (resolve(dataDir) !== config.dataDir) throw new Error('Node role does not authorize this data directory');
  if (config.role === 'standby') throw new Error('Standby role blocks business startup; stop and fence the old primary before controlled activation');
  if (config.release !== PLATFORM_BUILD) throw new Error('Node configuration and application release differ');
  return config;
}

export function requestNodeJson(url: string, ca: Buffer, observerToken?: string, timeoutMs = 3500): Promise<any> {
  return new Promise((ok, fail) => {
    const req = httpsRequest(url, { ca, rejectUnauthorized: true, method: 'GET', headers: observerToken ? { 'x-jarvis-node-token': observerToken } : {} }, response => {
      let length = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 65536) req.destroy(new Error('Node response too large')); else chunks.push(chunk); });
      response.on('end', () => { if (response.statusCode !== 200) return fail(new Error('Node response was not successful')); try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { fail(new Error('Invalid node response')); } });
      response.on('error', fail);
    });
    // Wall-clock deadline also covers DNS lookup and the TLS handshake.
    const deadline = setTimeout(() => req.destroy(new Error('Node probe timed out')), timeoutMs);
    req.once('close', () => clearTimeout(deadline)); req.once('error', fail); req.end();
  });
}
export const snapshotSchema = z.object({ batchId: id, snapshotAt: z.string().datetime(), verifiedAt: z.string().datetime(), build: id,
  verified: z.literal(true), businessIntegrity: z.literal('ok'), executionIntegrity: z.literal('ok'),
  filesChecked: z.number().int().positive(), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/), voiceKeyPreserved: z.literal(true) }).strict();
export const observationSchema = z.object({ version: z.literal(1), clusterId: id, nodeId: id, role: z.enum(['primary', 'standby', 'development']), epoch: z.number().int().min(1), build: id,
  observedAt: z.string().datetime(), businessHealthy: z.boolean(), businessBuild: z.string().nullable(),
  snapshot: snapshotSchema.nullable(), dependenciesReady: z.boolean() }).strict();
export type NodeObservation = z.infer<typeof observationSchema>;

export function recoveryReadiness(config: NodeConfiguration, node: NodeObservation, now = Date.now()) {
  const reasons: string[] = [];
  if (node.role !== 'standby') reasons.push('NODE_NOT_STANDBY');
  if (node.businessHealthy) reasons.push('BUSINESS_ALREADY_RUNNING');
  if (node.clusterId !== config.clusterId) reasons.push('CLUSTER_MISMATCH');
  if (node.build !== PLATFORM_BUILD) reasons.push('RELEASE_MISMATCH');
  if (!node.dependenciesReady) reasons.push('DEPENDENCIES_NOT_VERIFIED');
  if (!node.snapshot) reasons.push('NO_VERIFIED_SNAPSHOT');
  const lagSec = node.snapshot ? Math.floor((now - Date.parse(node.snapshot.snapshotAt)) / 1000) : null;
  if (node.snapshot && node.snapshot.build !== PLATFORM_BUILD) reasons.push('SNAPSHOT_RELEASE_MISMATCH');
  if (lagSec !== null && (lagSec < -30 || lagSec > config.maxSnapshotLagSec)) reasons.push('SNAPSHOT_TOO_OLD_OR_FUTURE');
  return { nodeId: node.nodeId, recoveryMaterialsReady: reasons.length === 0, snapshotLagSec: lagSec,
    automaticTakeover: false, canTakeover: false, reasons, activationBlocker: 'OLD_PRIMARY_MUST_BE_STOPPED_AND_FENCED',
    note: '已核验恢复材料不等于已隔离旧主。此接口不启动服务，不切换角色或入口。' };
}
export class ClusterRuntime {
  private observations = new Map<string, { checkedAt: string; observation?: NodeObservation; error?: string }>();
  private pending?: Promise<unknown>;
  private timer?:ReturnType<typeof setInterval>;
  constructor(readonly config: NodeConfiguration | null, private probe = requestNodeJson) {}
  start(intervalMs=15000){if(!this.config||this.timer)return;void this.check();this.timer=setInterval(()=>{void this.check();},intervalMs);this.timer.unref();}
  async close(){clearInterval(this.timer);this.timer=undefined;await this.pending;}
  state() {
    if (!this.config) return { configured: false, local: { nodeId: 'local', role: 'development', build: PLATFORM_BUILD }, nodes: [], replication: { mode: 'not-configured' }, automaticFailover: false };
    const config = this.config;
    return { configured: true, clusterId: config.clusterId, local: { nodeId: config.nodeId, role: config.role, epoch: config.epoch, build: PLATFORM_BUILD },
      nodes: config.peers.map(peer => {
        const row = this.observations.get(peer.nodeId), fresh = !!row && Date.now() - Date.parse(row.checkedAt) <= 30000;
        return { nodeId: peer.nodeId, url: peer.url, checkedAt: row?.checkedAt ?? null, status: !fresh ? 'unknown' : row?.observation ? 'reachable' : 'unreachable',
          observation: fresh ? row?.observation ?? null : null, readiness: fresh && row?.observation ? recoveryReadiness(config, row.observation) : null, error: fresh ? row?.error ?? null : null };
      }), replication: { mode: 'controlled-cold-snapshot', continuous: false, maxSnapshotLagSec: config.maxSnapshotLagSec }, automaticFailover: false };
  }
  async check() {
    if (!this.config) return this.state();
    if (this.pending) { await this.pending; return this.state(); }
    const config = this.config;
    this.pending = Promise.all(config.peers.map(async peer => {
      const checkedAt = new Date().toISOString();
      try {
        const ca = await readFile(peer.caPath), raw = await this.probe(new URL('/status', peer.url).href, ca, peer.observerToken);
        const observation = observationSchema.parse(raw);
        if (observation.nodeId !== peer.nodeId || observation.clusterId !== config.clusterId || Math.abs(Date.now() - Date.parse(observation.observedAt)) > 30000) throw new Error('Node identity or time differs');
        this.observations.set(peer.nodeId, { checkedAt, observation });
      } catch { this.observations.set(peer.nodeId, { checkedAt, error: '节点未通过TLS、身份、时效或响应校验；不视为可接替。' }); }
    })).finally(() => { this.pending = undefined; });
    await this.pending; return this.state();
  }
  async localSnapshot() {
    if (!this.config) return null;
    try { return snapshotSchema.parse(await readTrustedJson(resolve(this.config.controlDir, 'restore.json'))); } catch { return null; }
  }
}
export function registerClusterRoutes(app: FastifyInstance, runtime: ClusterRuntime, identity: IdentityRuntime) {
  app.addHook('preHandler', async req => { if (req.routeOptions.url?.startsWith('/api/runtime/cluster')) {
    const p = identity.principal(req); if (!p.administrator || p.profileId !== 'me') throw new RuntimeAccessError('ADMIN_REQUIRED', '主备状态仅管理者本人可用', 403);
  } });
  app.get('/api/runtime/cluster', async () => runtime.state());
  app.get('/api/runtime/cluster/nodes', async () => ({ items: runtime.state().nodes }));
  app.post('/api/runtime/cluster/check', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async req => { z.object({}).strict().parse(req.body ?? {}); return runtime.check(); });
  app.get('/api/runtime/cluster/snapshot', async () => ({ snapshot: await runtime.localSnapshot(), continuousReplication: false }));
  app.get('/api/runtime/cluster/nodes/:id/readiness', async req => {
    const nodeId = id.parse((req.params as any).id), row = runtime.state().nodes.find(node => node.nodeId === nodeId);
    if (!row) throw new RuntimeAccessError('NOT_FOUND', '节点未登记', 404);
    return row.readiness ?? { nodeId, recoveryMaterialsReady: false, canTakeover: false, reasons: ['NO_FRESH_VERIFIED_OBSERVATION'] };
  });
}
export function createClusterTools(runtime: ClusterRuntime, identity: IdentityRuntime, principal: RuntimePrincipal): ToolDefinition[] {
  return [defineTool({ name: 'jarvis_platform_nodes', label: '中心主备状态', description: '查询已记录的中心节点角色、版本和恢复材料。只读；未知节点不算在线，旧快照不算可接替，不执行接管。',
    parameters: Type.Object({}, { additionalProperties: false }), annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async (_id, _input, signal) => { signal?.throwIfAborted(); if (!identity.isPrincipalCurrent(principal) || !principal.administrator || principal.profileId !== 'me') throw new RuntimeAccessError('FORBIDDEN', '仅管理者本人可查询中心主备', 403);
      const value = runtime.state(); return { content: [{ type: 'text', text: JSON.stringify(value) }], details: { readOnly: true, automaticFailover: false } }; }
  })];
}

