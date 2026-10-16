import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {PiService, type PiRunMetadata, type PiUsageRecord} from '../src/pi.js';
import {Store} from '../src/store.js';
import {GovernanceRuntime} from '../src/runtime/governance.js';

async function cleanup(directory: string, prefix: string) {
  const target = resolve(directory);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes(prefix));
  await rm(target, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}

function forbiddenToolStream(model: string) {
  const events = [
    {type: 'message_start', message: {id: 'synthetic-tool-turn', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: {input_tokens: 10, output_tokens: 0}}},
    {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}},
    {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: '{"status":"answered"}'}},
    {type: 'content_block_stop', index: 0},
    {type: 'content_block_start', index: 1, content_block: {type: 'tool_use', id: 'synthetic-forbidden-tool', name: 'bash', input: {}}},
    {type: 'content_block_delta', index: 1, delta: {type: 'input_json_delta', partial_json: '{"command":"never-execute-synthetic"}'}},
    {type: 'content_block_stop', index: 1},
    {type: 'message_delta', delta: {stop_reason: 'tool_use', stop_sequence: null}, usage: {output_tokens: 5}},
    {type: 'message_stop'},
  ];
  return new Response(events.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''), {headers: {'content-type': 'text/event-stream'}});
}

test('ephemeral native SDK ends after one mocked provider request and rejects a tool call even alongside JSON text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-evidence-single-turn-')), originalFetch = globalThis.fetch;
  const requests: any[] = [], usage: PiUsageRecord[] = [], errors: string[] = [];
  let businessReads = 0, sessionWrites = 0, service: PiService | undefined;
  try {
    globalThis.fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(url.origin, 'https://single-turn.example.test');
      if (url.pathname.endsWith('/models')) return Response.json({data: [{id: 'synthetic-evidence-model'}]});
      assert.equal(url.pathname, '/v1/messages');
      const body = JSON.parse(String(options?.body)); requests.push(body);
      assert.equal(requests.length, 1, 'A provider tool response must never cause a second request');
      return forbiddenToolStream(body.model);
    };
    service = new PiService(directory, {listProjects: () => {businessReads++; return [];}, listDevices: () => [], listTasks: () => [], listExperiences: () => []});
    await service.initialize();
    await service.configureGateway({id: 'gateway-single-turn', name: 'Synthetic protocol fixture', baseUrl: 'https://single-turn.example.test', api: 'anthropic-messages'}, 'nonproduction-fixture-key');
    await service.configure({provider: 'gateway-single-turn', model: 'synthetic-evidence-model'});
    service.setLifecycleHooks({onUsage: value => {usage.push(value);}});
    const result = await service.run({conversationId: 'synthetic-evidence', actorId: 'server-admin', member: {name: 'Synthetic', preferences: ''}, sessionPath: null, ephemeral: true, boundedJob: true, scenario: 'knowledge', text: 'Return synthetic JSON without tools.', onSessionPath: () => {sessionWrites++;}, onEvent: (event, value) => {if (event === 'error') errors.push(value.code);}});
    assert.deepEqual(result, {status: 'failed', text: ''});
    assert.deepEqual(errors, ['PI_TOOL_RESPONSE_FORBIDDEN']);
    assert.equal(requests.length, 1); assert.equal(requests[0].max_tokens, 4096); assert.equal(requests[0].tools?.length ?? 0, 0);
    assert.equal(businessReads, 0); assert.equal(sessionWrites, 0);
    assert.equal(usage.length, 1); assert.equal(usage[0].recordOnly, true); assert.equal(usage[0].usageKind, 'evidence-model');
    assert.equal(usage[0].totalTokens, 15); assert.equal(usage[0].costUSD, null); assert.equal(usage[0].costKind, 'unavailable');
    assert.deepEqual(await readdir(join(directory, 'pi', 'sessions')), []);
    assert.equal(service.health().activeRuns, 0);
  } finally {await service?.dispose(); globalThis.fetch = originalFetch; await cleanup(directory, 'jarvis-evidence-single-turn-');}
});

test('record-only native usage retains unknown and over-limit costs while normal budgets, pause, and concurrency still enforce', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-evidence-record-only-')), store = new Store(directory), runtime = new GovernanceRuntime(store);
  const metadata = (id: string, recordOnly = true): PiRunMetadata => ({runId: id, actorId: 'server-admin', conversationId: id, provider: 'synthetic', model: 'synthetic-evidence', origin: 'bounded-job', recordOnly, usageKind: 'evidence-model'});
  const receipt = (meta: PiRunMetadata, costUSD: number | null): PiUsageRecord => ({...meta, usageId: meta.runId + '-usage', inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 15, costUSD, costKind: costUSD === null ? 'unavailable' : 'catalog-estimate', measuredAt: new Date().toISOString()});
  try {
    runtime.updatePolicy(0, {dailyLimitUSD: 0.01, perRunReserveUSD: 1, maxConcurrent: 1, blockUnpriced: true});
    const unknown = metadata('synthetic-unknown'); runtime.beforeRun(unknown, 0, {recordOnly: true});
    assert.doesNotThrow(() => runtime.recordUsage(receipt(unknown, null)));
    assert.throws(() => runtime.beforeRun(metadata('synthetic-concurrent'), 0, {recordOnly: true}), /并发/);
    runtime.afterRun(unknown);
    const over = metadata('synthetic-over'); runtime.beforeRun(over, 0, {recordOnly: true});
    assert.doesNotThrow(() => runtime.recordUsage(receipt(over, 5))); runtime.afterRun(over);
    const page = runtime.usagePage(); assert.equal(page.total, 2); assert.equal(page.summary.estimatedUSD, 5); assert.equal(page.summary.unpricedCalls, 1); assert.equal(page.summary.totalTokens, 30);
    assert.equal(page.items.find(row => row.run_id === unknown.runId)?.cost_usd, null);
    assert.equal(page.items.find(row => row.run_id === unknown.runId)?.cost_complete, 0);
    assert.throws(() => runtime.beforeRun(metadata('synthetic-normal-before', false)), /预算/);
    assert.throws(() => runtime.recordUsage(receipt(metadata('synthetic-normal-after', false), null)), /预算/);
    assert.equal(runtime.usagePage().total, 3, 'Normal post-usage rejection still records the actual receipt');
    runtime.updatePolicy(1, {paused: true});
    assert.throws(() => runtime.beforeRun(metadata('synthetic-paused'), 0, {recordOnly: true}), /暂停/);
  } finally {runtime.close(); store.close(); await cleanup(directory, 'jarvis-evidence-record-only-');}
});
