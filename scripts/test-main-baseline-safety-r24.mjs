/** Synthetic driver control tests: memory files/APIs, no machine or product execution. */
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('./run-factory-main-baseline-r24.mjs', import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const templateId = 'msf-101-claude';
function fixture(options = {}) {
  const original = { id: templateId, machineId: 'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73', engine: 'claude', program: '/dummy/claude', args: ['--model', 'gpt-6.1-sol[1m]'], workspaceRoot: '/home/superopen/All-Projects' };
  const state = { central: clone(original), node: clone(original), files: new Map(), events: [], runs: new Map(), startCount: 0, outputs: [], clock: 0 };
  const profile = { goalSpecHash: '23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42', config: { costPolicy: 'record-only' }, revision: 20, templateHashes: {} };
  const nodeState = () => ({ template: clone(state.node), agentId: 'paired-fixture', unit: { ActiveState: 'active', SubState: 'running', MainPID: '1' } });
  const api = async (url, body) => {
    if (url === '/api/v1/execution/supervision') return { data: { supervised: false, stopped: false } };
    if (url.endsWith('/autonomy')) return { data: clone(profile) };
    if (url === '/api/v1/execution/config') return { data: { templates: [clone(state.central)] } };
    if (url === '/api/v1/execution/capabilities') return { data: { configuredTemplates: [{ id: templateId, ready: options.notReady !== true && state.central.engine === 'fixed' && state.node.engine === 'fixed' }] } };
    if (url === '/api/v1/tasks/commands/create') {
      state.events.push('create');
      // Simulate a scheduler seeing the task immediately when created.
      assert.equal(state.central.engine, 'fixed'); assert.equal(state.node.engine, 'fixed');
      assert.deepEqual(state.central.args, []); assert.deepEqual(state.node.args, []);
      return { data: { id: 'fixture-task' } };
    }
    if (url === '/api/v1/tasks/fixture-task') return { data: { id: 'fixture-task', revision: 1 } };
    if (url === '/api/v1/tasks/commands/start') {
      state.events.push('start'); state.startCount++;
      const run = { id: 'a'.repeat(40), projectId: '70ec346f-6520-46ed-abed-22cac770a3e4', workspace: '/home/superopen/All-Projects/msf', taskId: 'fixture-task', executorId: templateId, machineId: original.machineId, agentId: 'paired-fixture', status: 'queued' };
      state.runs.set(run.id, run);
      if (options.loseStartResponse && state.startCount === 1) throw Error('API_503 synthetic-response-lost');
      return { data: { id: 'fixture-task', executionRequest: { id: run.id } } };
    }
    if (url.startsWith('/api/v1/execution/runs/')) {
      const run = state.runs.get(url.split('/').at(-1));
      if (!run) throw Error('API_404 synthetic-not-found');
      return { data: clone(run) };
    }
    throw Error('UNEXPECTED_FIXTURE_API ' + url);
  };
  const fs = {
    readFile: async name => { if (state.files.has(name)) return state.files.get(name); if (name.startsWith('scripts/')) return Buffer.from('dummy-fixed-tool'); throw Object.assign(Error('fixture missing'), { code: 'ENOENT' }); },
    writeFile: async (name, bytes, options) => { if (options?.flag === 'wx' && state.files.has(name)) throw Error('fixture duplicate output'); state.files.set(name, bytes); },
    mkdir: async () => {}, rename: async (before, after) => { state.files.set(after, state.files.get(before)); state.files.delete(before); },
  };
  const managed = {
    withPlatform: async callback => callback({ api }), lanProfile: 'fixture-profile', python: (payload, script) => ({ payload, script }),
    primary: () => JSON.stringify({ template: state.central }),
    remote: (_profile, _alias, code) => code.script.includes('MAIN_BASELINE_SOURCE_INSPECTION_FAILED')
      ? JSON.stringify({ ok: true, sourceStateChanged: false, sourceFingerprint: 'b'.repeat(64), files: 1, gitBefore: { head: 'c'.repeat(40) } })
      : JSON.stringify({ active: true, children: [], counts: { runs: options.journalBusy ? 1 : 0, deliveries: 0, logs: 0 } }),
  };
  const helpers = {
    nodeState, queueState: () => ({ allActive: 0 }),
    putCentral: async (_api, expected, replacement) => { assert.deepEqual(state.central, expected); state.events.push('central-fixed'); state.central = clone(replacement); return { revision: 1 }; },
    patchNode: (expected, replacement) => { assert.deepEqual(state.node, expected); state.events.push('node-fixed'); state.node = clone(replacement); return { templateUpdated: true }; },
  };
  state.execute = async () => {
    class Clock extends Date { static now() { state.clock += 1000; return state.clock; } }
    const context = vm.createContext({ Buffer, process: { argv: ['node', 'driver', 'start', '--batch-key=fixture-r24'] }, console: { log: text => state.outputs.push(JSON.parse(text)) }, Date: Clock, setTimeout: callback => { queueMicrotask(callback); return 1; } });
    const definitions = { 'node:fs/promises': fs, 'node:path': path, 'node:crypto': crypto,
      './managed-server-client.mjs': managed, './run-factory-supervision-probe.mjs': helpers,
      './verify-software-factory-execution.mjs': { expectedRunId: () => 'a'.repeat(40) } };
    const module = new vm.SourceTextModule(source, { context });
    await module.link(name => { const value = definitions[name]; assert.ok(value, name); return new vm.SyntheticModule(Object.keys(value), function () { for (const [key, item] of Object.entries(value)) this.setExport(key, item); }, { context }); });
    await module.evaluate();
  };
  return state;
}
test('managed task becomes visible only after central and node fixed executor are ready', async () => {
  const state = fixture(); await state.execute();
  assert.deepEqual(state.events, ['central-fixed', 'node-fixed', 'create', 'start']); assert.equal(state.startCount, 1);
});
test('readiness failure produces audit evidence and creates no schedulable task', async () => {
  const state = fixture({ notReady: true }); await assert.rejects(state.execute(), /MAIN_BASELINE_EXECUTOR_NOT_READY/);
  assert.equal(state.startCount, 0); assert.ok(!state.events.includes('create'));
  assert.equal(state.outputs.at(-1).automaticRetry, false);
});
test('nonacknowledged local journal blocks any executor mutation or task creation', async () => {
  const state = fixture({ journalBusy: true }); await assert.rejects(state.execute(), /MAIN_BASELINE_NODE_NOT_RECONCILED/);
  assert.deepEqual(state.events, []); assert.equal(state.startCount, 0);
});
test('lost start response is reconciled from the existing bound run and never starts twice', async () => {
  const state = fixture({ loseStartResponse: true }); await assert.rejects(state.execute(), /API_503/);
  await state.execute(); assert.equal(state.startCount, 1); assert.equal(state.events.filter(value => value === 'create').length, 1);
});
