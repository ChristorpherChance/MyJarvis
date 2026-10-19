import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID, sign } from 'node:crypto';
import { ExecutionAgent } from '../src/runtime/agent-runner.js';
import { canonicalExecution, signedExecutionText } from '../src/runtime/execution-runtime.js';
import type { ExecutionTemplate } from '../src/runtime/execution-types.js';
import type { PiService } from '../src/pi.js';
import { startIsolatedProjectApp } from './helpers/isolated-project-app.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('current correction keeps a real signed cancellation when a separately signed late success arrives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'project-correction-late-success-'));
  const root = join(dir, 'work');
  const workspace = join(root, 'project');
  await mkdir(workspace, { recursive: true });
  const script = join(dir, 'long-lived-fixture.cjs');
  await writeFile(script, `const fs=require('node:fs');
console.log(JSON.stringify({type:'system',subtype:'init',session_id:'late-success-native',claude_code_version:'2.1.296'}));
fs.writeFileSync('active-child',String(process.pid));
console.log(JSON.stringify({type:'assistant',message:{id:'active',usage:{input_tokens:3,output_tokens:1}}}));
setInterval(()=>fs.writeFileSync('child-heartbeat',String(Date.now())),25);
`);
  const pi = {
    initialize: async () => {}, dispose: async () => {}, health: () => ({ configured: true }),
    run: async () => ({ status: 'complete', text: JSON.stringify({ action: 'continue', directive: 'bounded fixture continuation', reason: 'isolated late-success correction contract', selectedOption: null, criteria: [], experienceReferences: [] }) }),
  } as unknown as PiService;
  const isolated = await startIsolatedProjectApp({ dataDir: dir, pi, webDir: join(dir, 'none') });
  const { runtime: app, baseUrl } = isolated;
  let agent: ExecutionAgent | undefined;
  let running: Promise<unknown> | undefined;
  const headers: Record<string, string> = {};
  const request = async (path: string, method = 'GET', payload?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...headers, ...(payload ? { 'content-type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return { status: response.status, value: await response.json() as any };
  };
  try {
    const setup = await fetch(`${baseUrl}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'isolated-late-success-correction' }) });
    const setupBody = await setup.json();
    assert.equal(setup.status, 200, JSON.stringify(setupBody));
    const setCookie = setup.headers.get('set-cookie');
    assert.ok(setCookie, 'isolated setup returns an administrator session cookie');
    headers.cookie = setCookie.split(';', 1)[0];

    const command = async (domain: string, operation: string, payload: any) => {
      const result = await request(`/api/v1/${domain}/commands/${operation}`, 'POST', { commandId: randomUUID(), expectedVersion: 0, scope: 'personal', payload });
      assert.equal(result.status, 200, JSON.stringify(result.value));
      return result.value.data;
    };
    const machine = await command('machines', 'register', { name: 'late success correction fixture', role: 'development', category: 'workstation', ram: 32, always: false, readOnly: false });
    const project = await command('projects', 'register', { name: 'late success correction fixture', description: 'isolated current correction acceptance', goal: 'Keep the actual goal unchanged while rejecting late success', milestones: ['bounded correction behavior'], copies: [{ machineId: machine.id, path: workspace, environment: 'development', branch: 'fixture' }] });
    const task = await command('tasks', 'create', { title: 'late success correction fixture', projectId: project.id, machineId: machine.id, agent: 'late-success-cc', mode: 'managed', goal: 'run an isolated process until correction', criteria: 'late success remains evidence only', budget: 10, retryLimit: 0, worktree: workspace });
    const template: ExecutionTemplate = { id: 'late-success-cc', machineId: machine.id, engine: 'claude', program: process.execPath, args: [script, '--print', '{prompt}', '--output-format', 'stream-json'], workspaceRoot: root, maxRounds: 1, timeoutSec: 30, leaseSec: 60, budgetCurrency: 'USD', purpose: 'project-supervisor', supervision: { billing: 'record-only', maxTokens: 1000, maxRecoveryAttempts: 0, retryDelaySec: 60, repairValidation: false, fallbackExecutorIds: [] } };
    const config = await request('/api/v1/execution/config', 'PUT', { expectedVersion: 0, templates: [template], probes: [], wol: [] });
    assert.equal(config.status, 200, JSON.stringify(config.value));
    const ticket = await request('/api/v1/execution/tickets', 'POST', { machineId: machine.id, capabilities: [template.id] });
    assert.equal(ticket.status, 200, JSON.stringify(ticket.value));
    agent = new ExecutionAgent({ apiUrl: isolated.baseUrl, machineId: machine.id, pairingTicket: ticket.value.data.ticket, workspaceRoots: [root], templates: [template], deliveryDirectory: join(dir, 'private-journal') });
    await agent.pair();
    await agent.heartbeat();
    const supervisor = `/api/v1/projects/${project.id}/supervisor`;
    const created = await request(supervisor, 'POST', { commandId: randomUUID(), expectedVersion: 0, goal: 'Keep the actual goal unchanged while rejecting late success', criteria: ['late success remains evidence only'], machineId: machine.id, executor: 'claude-code', workspace, taskId: task.id });
    assert.equal(created.status, 200, JSON.stringify(created.value));
    const started = await request(`${supervisor}/commands`, 'POST', { commandId: randomUUID(), expectedVersion: 1, action: 'start', authorizeContinuous: true, acknowledgeUnknownHistory: true, maxParentTokens: 1000 });
    assert.equal(started.status, 200, JSON.stringify(started.value));
    for (let i = 0; i < 50 && app.execution.listRuns().length === 0; i++) { await app.projectSupervisor.pump(); await pause(10); }
    assert.equal(app.execution.listRuns().length, 1, 'one active supervisor run is dispatched');
    const runId = app.execution.listRuns()[0].id;
    running = agent.runOnce();
    for (let i = 0; i < 150; i++) { try { await readFile(join(workspace, 'active-child'), 'utf8'); break; } catch { await pause(10); } }
    await readFile(join(workspace, 'active-child'), 'utf8');
    const actualLeaseToken = (agent as any).leases.get(runId)?.run.leaseToken as string;
    assert.ok(actualLeaseToken, 'the paired agent holds the actual claimed lease for this run');

    const before = await request(supervisor);
    assert.equal(before.status, 200, JSON.stringify(before.value));
    const initialGoal = before.value.data.session.goal;
    const target = before.value.data.events.find((event: any) => event.kind === 'goal') ?? before.value.data.events.at(-1);
    const corrected = await request(`${supervisor}/corrections`, 'POST', { commandId: randomUUID(), expectedVersion: before.value.data.session.revision, targetEventId: target.eventId, targetHash: target.hash, reason: 'A current correction invalidates the active follow-up', correctedFact: 'Do not treat an old successful response as renewed authorization', preferredOption: 'Keep the stated objective', correctionType: 'preference', applyTo: 'current_followup' });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.value));
    assert.equal(corrected.value.data.enabled, false);
    assert.equal(corrected.value.data.status, 'paused');
    assert.equal(corrected.value.data.goal, initialGoal);
    assert.equal(corrected.value.data.runId, runId);
    assert.equal(app.execution.getRun(runId)?.stopRequested, true);
    const pausedView = await request(supervisor);
    assert.equal(pausedView.value.data.goalPolicy.active, false, 'current correction revoked goal policy');

    await agent.heartbeat();
    await running;
    running = undefined;
    const cancelled = app.execution.getRun(runId)!;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.result?.source, 'signed-agent', 'original cancellation came through the actual signed node route');
    assert.equal(cancelled.result?.outcome, 'cancelled');
    assert.equal(cancelled.result?.stopConfirmation?.source, 'bound-signed-agent');
    assert.equal(cancelled.result?.stopConfirmation?.runId, runId);
    assert.equal(cancelled.result?.stopConfirmation?.agentId, cancelled.agentId);
    assert.equal(cancelled.result?.stopConfirmation?.stopRequested, true);
    assert.deepEqual(cancelled.result?.stopConfirmation?.terminationProof, cancelled.result?.terminationProof);
    assert.equal(cancelled.result?.terminationProof?.childExitObserved, true);
    assert.equal(cancelled.result?.terminationProof?.stdioClosed, true);
    assert.equal(cancelled.result?.terminationProof?.groupEmpty, true);
    assert.equal(cancelled.result?.terminationProof?.invocationId, cancelled.result?.executionMetadata?.invocationId);
    assert.equal(cancelled.result?.terminationProof?.method, 'process-group-probe');

    // Synthetic late-success payload, but genuinely signed with the paired node's private key and sent through HTTP.
    const lateBody = { deliveryId: randomBytes(24).toString('base64url'), runId, leaseToken: actualLeaseToken, outcome: 'success', exitCode: 0, rounds: 1, summary: 'independently injected late-success observation', artifacts: [] };
    const path = `/api/v1/agents/${agent.config.agentId}/result`;
    const timestamp = new Date().toISOString();
    const nonce = randomBytes(24).toString('base64url');
    const signature = sign(null, Buffer.from(signedExecutionText('POST', path, timestamp, nonce, lateBody)), agent.config.privateKey!).toString('base64url');
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-timestamp': timestamp, 'x-jarvis-nonce': nonce, 'x-jarvis-signature': signature }, body: canonicalExecution(lateBody) });
    assert.equal(response.status, 200, await response.clone().text());
    const delivery = (await response.json() as any).data;
    assert.equal(delivery.lateEvidenceOnly, true, 'separately delivered success is classified as late evidence only');
    assert.equal(delivery.status, 'cancelled');
    assert.equal(delivery.result.outcome, 'cancelled');
    const lateRow = (app.execution as any).db.prepare('SELECT report FROM execution_late_results WHERE run_id=?').get(runId);
    const lateEvidence = JSON.parse(lateRow.report);
    assert.equal(lateEvidence.outcome, 'success');
    assert.equal(lateEvidence.source, 'signed-agent-late-evidence', 'the injected success is stored under the explicit late-evidence source classification');
    assert.equal(lateEvidence.summary, 'independently injected late-success observation');
    assert.equal(delivery.result?.outcome, 'cancelled');
    assert.equal(delivery.result?.stopConfirmation?.source, 'bound-signed-agent');
    assert.equal(delivery.result?.lateEvidenceOnly, undefined);
    assert.equal(delivery.result?.summary, cancelled.result.summary, 'late observation does not overwrite the retained signed cancellation');
    assert.equal(app.execution.getRun(runId)?.result?.outcome, 'cancelled');
    assert.equal(app.execution.getRun(runId)?.result?.lateEvidenceOnly, undefined);
    assert.equal(app.execution.runsForTask(task.id)[0].result?.lateEvidenceOnly, undefined, 'task execution state retains the real cancelled result, not the late response');
    for (let i = 0; i < 4; i++) await app.projectSupervisor.pump();
    assert.equal(app.execution.listRuns().length, 1, 'late success does not dispatch another run');
    const after = await request(supervisor);
    assert.equal(after.value.data.session.goal, initialGoal);
    assert.equal(after.value.data.session.enabled, false);
    assert.equal(after.value.data.session.status, 'paused');
    assert.equal(after.value.data.session.stopRunId, runId);
    assert.equal(after.value.data.goalPolicy.active, false, 'goal policy remains paused after late success');
  } finally {
    await agent?.stop();
    try { await running; } catch {}
    await isolated.close();
    await rm(dir, { recursive: true, force: true });
  }
});
