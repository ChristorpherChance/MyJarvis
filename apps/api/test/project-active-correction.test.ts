import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ExecutionAgent } from '../src/runtime/agent-runner.js';
import type { ExecutionTemplate } from '../src/runtime/execution-types.js';
import type { PiService } from '../src/pi.js';
import { startIsolatedProjectApp } from './helpers/isolated-project-app.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(label: string) {
  const dir = await mkdtemp(join(tmpdir(), `active-correction-${label}-`));
  const root = join(dir, 'work');
  const workspace = join(root, 'project');
  await mkdir(workspace, { recursive: true });
  const script = join(dir, 'long-lived-fixture.cjs');
  await writeFile(script, `const fs=require('node:fs');
console.log(JSON.stringify({type:'system',subtype:'init',session_id:'active-correction-native',claude_code_version:'2.1.296'}));
fs.writeFileSync('active-child',String(process.pid));
console.log(JSON.stringify({type:'assistant',message:{id:'active',usage:{input_tokens:3,output_tokens:1}}}));
setInterval(()=>fs.writeFileSync('child-heartbeat',String(Date.now())),25);
`);
  const pi = {
    initialize: async () => {},
    dispose: async () => {},
    health: () => ({ configured: true }),
    run: async () => ({ status: 'complete', text: JSON.stringify({ action: 'continue', directive: 'bounded fixture continuation', reason: 'isolated active correction contract', selectedOption: null, criteria: [], experienceReferences: [] }) }),
  } as unknown as PiService;
  const isolated = await startIsolatedProjectApp({ dataDir: dir, pi, webDir: join(dir, 'none') });
  const { runtime: app, baseUrl } = isolated;
  let agent: ExecutionAgent | undefined;
  let activeRunId: string | undefined;
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
    const setup = await fetch(`${baseUrl}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'isolated-active-correction' }) });
    const setupBody = await setup.json();
    assert.equal(setup.status, 200, JSON.stringify(setupBody));
    const setCookie = setup.headers.get('set-cookie');
    assert.ok(setCookie, 'isolated setup returns an administrator session cookie');
    headers.cookie = setCookie.split(';', 1)[0];
    const authenticated = await request('/api/v1/projects');
    assert.notEqual(authenticated.status, 401, JSON.stringify(authenticated.value));
  } catch (error) {
    await isolated.close();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { isolated, dir, root, workspace, script, app, request, headers, get agent() { return agent; }, set agent(value: ExecutionAgent | undefined) { agent = value; }, get activeRunId() { return activeRunId; }, set activeRunId(value: string | undefined) { activeRunId = value; }, get running() { return running; }, set running(value: Promise<unknown> | undefined) { running = value; }, close: async () => { await agent?.stop(); try { await running; } catch {} await isolated.close(); await rm(dir, { recursive: true, force: true }); } };
}

async function authenticatedFixture(label: string) {
  return fixture(label);
}

async function prepare(f: Awaited<ReturnType<typeof authenticatedFixture>>) {
  const { app, root, workspace, script, isolated, request } = f;
  const call = async (path: string, method = 'GET', payload?: any) => request(path, method, payload);
  const command = async (domain: string, operation: string, payload: any) => {
    const result = await call(`/api/v1/${domain}/commands/${operation}`, 'POST', { commandId: randomUUID(), expectedVersion: 0, scope: 'personal', payload });
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return result.value.data;
  };
  const machine = await command('machines', 'register', { name: 'active correction fixture', role: 'development', category: 'workstation', ram: 32, always: false, readOnly: false });
  const project = await command('projects', 'register', { name: 'active correction fixture', description: 'isolated correction acceptance', goal: 'Keep the actual goal unchanged while handling owner corrections', milestones: ['bounded correction behavior'], copies: [{ machineId: machine.id, path: workspace, environment: 'development', branch: 'fixture' }] });
  const task = await command('tasks', 'create', { title: 'active correction fixture', projectId: project.id, machineId: machine.id, agent: 'active-correction-cc', mode: 'managed', goal: 'run a long-lived isolated fixture process', criteria: 'verify correction behavior', budget: 10, retryLimit: 0, worktree: workspace });
  const template: ExecutionTemplate = { id: 'active-correction-cc', machineId: machine.id, engine: 'claude', program: process.execPath, args: [script, '--print', '{prompt}', '--output-format', 'stream-json'], workspaceRoot: root, maxRounds: 1, timeoutSec: 30, leaseSec: 60, budgetCurrency: 'USD', purpose: 'project-supervisor', supervision: { billing: 'record-only', maxTokens: 1000, maxRecoveryAttempts: 0, retryDelaySec: 60, repairValidation: false, fallbackExecutorIds: [] } };
  const config = await call('/api/v1/execution/config', 'PUT', { expectedVersion: 0, templates: [template], probes: [], wol: [] });
  assert.equal(config.status, 200, JSON.stringify(config.value));
  const ticket = await call('/api/v1/execution/tickets', 'POST', { machineId: machine.id, capabilities: [template.id] });
  assert.equal(ticket.status, 200, JSON.stringify(ticket.value));
  const currentAgent = new ExecutionAgent({ apiUrl: isolated.baseUrl, machineId: machine.id, pairingTicket: ticket.value.data.ticket, workspaceRoots: [root], templates: [template], deliveryDirectory: join(f.dir, 'private-journal') });
  f.agent = currentAgent;
  await currentAgent.pair();
  await currentAgent.heartbeat();
  const supervisor = `/api/v1/projects/${project.id}/supervisor`;
  const created = await call(supervisor, 'POST', { commandId: randomUUID(), expectedVersion: 0, goal: 'Keep the actual goal unchanged while handling owner corrections', criteria: ['bounded correction behavior'], machineId: machine.id, executor: 'claude-code', workspace, taskId: task.id });
  assert.equal(created.status, 200, JSON.stringify(created.value));
  const started = await call(`${supervisor}/commands`, 'POST', { commandId: randomUUID(), expectedVersion: 1, action: 'start', authorizeContinuous: true, acknowledgeUnknownHistory: true, maxParentTokens: 1000 });
  assert.equal(started.status, 200, JSON.stringify(started.value));
  for (let i = 0; i < 50 && app.execution.listRuns().length === 0; i++) { await app.projectSupervisor.pump(); await pause(10); }
  assert.equal(app.execution.listRuns().length, 1, 'one active supervisor run is dispatched');
  f.activeRunId = app.execution.listRuns()[0].id;
  f.running = currentAgent.runOnce();
  for (let i = 0; i < 150; i++) { try { await readFile(join(workspace, 'active-child'), 'utf8'); break; } catch { await pause(10); } }
  await readFile(join(workspace, 'active-child'), 'utf8');
  return { project, task, machine, template, supervisor, call };
}

// The helper uses native HTTP so corrections and stop confirmations traverse real routes and signing.
for (const applyTo of ['future_reference', 'current_followup'] as const) {
  test(`active run correction ${applyTo} preserves the real goal and prevents stale follow-up`, async () => {
    const f = await authenticatedFixture(applyTo);
    let prepared: Awaited<ReturnType<typeof prepare>> | undefined;
    try {
      prepared = await prepare(f);
      const { supervisor, call } = prepared;
      let view = await call(supervisor);
      assert.equal(view.status, 200, JSON.stringify(view.value));
      const initialGoal = view.value.data.session.goal;
      const target = view.value.data.events.find((event: any) => event.kind === 'goal') ?? view.value.data.events.at(-1);
      const run = f.app.execution.getRun(f.activeRunId!);
      assert.ok(run, 'real execution row exists in temporary SQLite');
      assert.equal(run.status, 'running');
      const correction = await call(`${supervisor}/corrections`, 'POST', { commandId: randomUUID(), expectedVersion: view.value.data.session.revision, targetEventId: target.eventId, targetHash: target.hash, reason: 'Actual owner counterexample requires a bounded correction', correctedFact: 'Do not alter the original target or current execution text', preferredOption: 'Keep the stated objective', correctionType: 'preference', applyTo });
      assert.equal(correction.status, 200, JSON.stringify(correction.value));
      assert.equal(correction.value.data.goal, initialGoal, 'correction never rewrites the actual goal');
      assert.equal(correction.value.data.runId, f.activeRunId);
      if (applyTo === 'future_reference') {
        assert.equal(correction.value.data.correctionEffect, '仅未来参考，本次执行未变');
        assert.equal(Boolean(f.app.execution.getRun(f.activeRunId!)?.stopRequested), false, 'future reference does not cancel an active run');
        assert.equal(f.app.execution.listRuns().length, 1, 'future reference does not dispatch an extra run');
        await f.app.projectSupervisor.pump();
        assert.equal(f.app.execution.listRuns().length, 1);
        const pid=Number(await readFile(join(f.workspace,'active-child'),'utf8'));assert.doesNotThrow(()=>process.kill(pid,0));
        const alive=await readFile(join(f.workspace,'child-heartbeat'),'utf8');await pause(75);assert.notEqual(await readFile(join(f.workspace,'child-heartbeat'),'utf8'),alive,'future-only correction leaves the actual child running');
        await f.app.execution.cancelRun(f.activeRunId!, 'fixture cleanup after future-reference assertions');
        await f.agent!.heartbeat();
      } else {
        assert.equal(correction.value.data.enabled, false, 'current correction revokes continuation authorization');
        assert.equal(correction.value.data.status, 'paused');
        assert.equal(f.app.execution.getRun(f.activeRunId!)?.stopRequested, true, 'current correction requests real execution stop');
        const policy = await call(supervisor);
        assert.equal(policy.value.data.goalPolicy.active, false, 'goal authorization was revoked');
        await f.agent!.heartbeat();
      }
      await f.running;
      f.running = undefined;
      const terminal = f.app.execution.getRun(f.activeRunId!)!;
      assert.equal(terminal.status, 'cancelled');
      assert.equal(terminal.result?.source, 'signed-agent');
      assert.equal(terminal.result?.outcome, 'cancelled');
      assert.equal(terminal.result?.stopConfirmation?.source, 'bound-signed-agent');
      assert.equal(terminal.result?.stopConfirmation?.runId, f.activeRunId);
      assert.equal(terminal.result?.stopConfirmation?.agentId, terminal.agentId);
      assert.equal(terminal.result?.stopConfirmation?.stopRequested, true);
      assert.deepEqual(terminal.result?.stopConfirmation?.terminationProof, terminal.result?.terminationProof);
      assert.equal(terminal.result?.terminationProof?.childExitObserved, true);
      assert.equal(terminal.result?.terminationProof?.stdioClosed, true);
      assert.equal(terminal.result?.terminationProof?.groupEmpty, true);
      assert.equal(terminal.result?.terminationProof?.invocationId, terminal.result?.executionMetadata?.invocationId);
      assert.equal(terminal.result?.terminationProof?.method, 'process-group-probe');
      for (let i = 0; i < 4; i++) await f.app.projectSupervisor.pump();
      assert.equal(f.app.execution.listRuns().length, 1, 'processing the signed cancellation after correction never dispatches a successor');
      view = await call(supervisor);
      assert.equal(view.value.data.session.goal, initialGoal);
      if (applyTo === 'current_followup') {
        assert.equal(view.value.data.session.enabled, false);
        assert.equal(view.value.data.session.status, 'paused');
        assert.equal(view.value.data.session.stopRunId, f.activeRunId);
        assert.equal(view.value.data.stop.confirmed, true);
      } else {
        assert.equal(view.value.data.session.correctionContext.at(-1).applyTo, 'future_reference');
      }
      assert.equal(f.app.execution.getRun(f.activeRunId!)?.result?.lateEvidenceOnly, undefined);
    } finally {
      await f.close();
    }
  });
}
