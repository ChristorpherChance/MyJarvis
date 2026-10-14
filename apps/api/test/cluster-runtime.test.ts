import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClusterRuntime, enforceNodeStartup, nodeConfiguration, recoveryReadiness, PLATFORM_BUILD } from '../src/runtime/cluster-runtime.js';
import { createApp } from '../src/app.js';
import type { PiService } from '../src/pi.js';

const unavailablePi = () => ({ initialize: async () => {}, dispose: async () => {}, health: () => ({ configured: false, activeRuns: 0 }), getSettings: async () => ({ configured: false }) }) as unknown as PiService;
const config = (dir: string) => nodeConfiguration.parse({ version: 1, clusterId: 'home', nodeId: '112', role: 'primary', epoch: 1, release: PLATFORM_BUILD, dataDir: dir, controlDir: dir, caPath: join(dir, 'ca.crt'), observerToken: 'a'.repeat(64), maxSnapshotLagSec: 900, peers: [{ nodeId: '101', url: 'https://127.0.0.1:3141/', caPath: join(dir, 'ca.crt'), observerToken: 'b'.repeat(64) }] });
const observation = () => ({ version: 1 as const, clusterId: 'home', nodeId: '101', role: 'standby' as const, epoch: 1, build: PLATFORM_BUILD, observedAt: new Date().toISOString(), businessHealthy: false, businessBuild: null, dependenciesReady: true, snapshot: { batchId: 'batch-test', snapshotAt: new Date().toISOString(), verifiedAt: new Date().toISOString(), build: PLATFORM_BUILD, verified: true as const, businessIntegrity: 'ok' as const, executionIntegrity: 'ok' as const, filesChecked: 20, manifestSha256: 'e'.repeat(64), voiceKeyPreserved: true as const } });
test('startup rejects standby, mismatched data/release and retired production data before business initialization', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-cluster-'));
  try {
    const file = join(dir, 'node.json'), retired = join(dir, 'retired.json');
    await writeFile(file, JSON.stringify({ ...config(dir), role: 'standby' }), { mode: 0o600 });
    // Linux fixtures must be root-owned, exactly like actual /etc/jarvis control files.
    if (process.platform !== 'win32' && process.getuid?.() !== 0) { t.skip('Root-owned control file validation requires a root fixture'); return; }
    await assert.rejects(enforceNodeStartup(file, dir), /Standby/);
    await writeFile(file, JSON.stringify(config(dir)));
    await assert.rejects(enforceNodeStartup(file, join(dir, 'other')), /data directory/);
    await writeFile(file, JSON.stringify({ ...config(dir), release: 'old-release' }));
    await assert.rejects(enforceNodeStartup(file, dir), /release differ/);
    await writeFile(retired, JSON.stringify({ version: 1, retiredDataDir: dir, destination: '112' }), { mode: 0o600 });
    await assert.rejects(enforceNodeStartup(undefined, dir, retired), /retired/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('application factory refuses standby before creating any business database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-standby-factory-'));
  try {
    await assert.rejects(createApp({dataDir:dir,pi:unavailablePi(),nodeConfiguration:{...config(dir),role:'standby'}}), /Standby/);
    const {existsSync}=await import('node:fs'); assert.equal(existsSync(join(dir,'jarvis.db')),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('fresh restore materials never grant takeover; stale, running, wrong release and missing dependencies block recovery readiness', () => {
  const c = config(tmpdir()), value = observation();
  assert.equal(recoveryReadiness(c, value).recoveryMaterialsReady, true);
  assert.equal(recoveryReadiness(c, value).canTakeover, false);
  for (const patch of [{ businessHealthy: true }, { dependenciesReady: false }, { snapshot: null }, { build: 'old' }, { role: 'primary' as const }]) assert.equal(recoveryReadiness(c, { ...value, ...patch }).recoveryMaterialsReady, false);
  assert.equal(recoveryReadiness(c, { ...value, snapshot: { ...value.snapshot, snapshotAt: new Date(Date.now() - 1000000).toISOString() } }).recoveryMaterialsReady, false);
});
test('peer checks bind identity and time, never expose observer tokens and preserve unknown when verification fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-cluster-'));
  try {
    await writeFile(join(dir, 'ca.crt'), 'fixture-ca');
    const c = config(dir), value = observation();
    const runtime = new ClusterRuntime(c, async (url, ca, token) => { assert.equal(url, 'https://127.0.0.1:3141/status'); assert.equal(ca.toString(), 'fixture-ca'); assert.equal(token, 'b'.repeat(64)); return value; });
    const result = await runtime.check(); assert.equal(result.nodes[0].readiness!.recoveryMaterialsReady, true); assert(!JSON.stringify(result).includes('b'.repeat(64)));
    for (const invalid of [{ ...value, nodeId: 'wrong' }, { ...value, observedAt: '2020-01-01T00:00:00.000Z' }, { ...value, observerToken: 'secret' }]) {
      const bad = new ClusterRuntime(c, async () => invalid), state = await bad.check(); assert.equal(state.nodes[0].status, 'unreachable'); assert.equal(state.nodes[0].readiness, null);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('cluster endpoints require administrator authentication and refuse arbitrary peer URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-cluster-http-'));
  const { app } = await createApp({ dataDir: dir, pi: unavailablePi() });
  try {
    assert.equal((await app.inject({ url: '/api/runtime/cluster' })).statusCode, 401);
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: 'cluster-test-secret-long' } });
    const headers = { cookie: String(setup.headers['set-cookie']).split(';')[0] };
    const state = await app.inject({ url: '/api/runtime/cluster', headers }); assert.equal(state.statusCode, 200); assert.equal(state.json().configured, false);
    assert.equal((await app.inject({ method: 'POST', url: '/api/runtime/cluster/check', headers, payload: { url: 'https://attacker.example' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/runtime/cluster/check', headers, payload: {} })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/runtime/cluster/nodes/unknown/readiness', headers })).statusCode, 404);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
test('fixed-peer background observation refreshes and stops without further requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-cluster-poll-'));let calls=0;
 try{await writeFile(join(dir,'ca.crt'),'fixture');const runtime=new ClusterRuntime(config(dir),async()=>{calls++;return observation();});runtime.start(20);await new Promise(r=>setTimeout(r,65));await runtime.close();assert(calls>=2);const stopped=calls;await new Promise(r=>setTimeout(r,50));assert.equal(calls,stopped);}finally{await rm(dir,{recursive:true,force:true});}
});
