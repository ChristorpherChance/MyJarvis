import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { PiService, PiServiceError, type PiRunInput } from '../src/pi.js';

test('Pi 1.0.2 configuration, persistence and boundaries require no model or network requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-pi-sdk-check-'));
  const names = ['OPENAI_API_KEY', 'JARVIS_PI_PROVIDER', 'JARVIS_PI_MODEL', 'JARVIS_PI_API_KEY'] as const;
  const environment = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.OPENAI_API_KEY = '';
  for (const name of names.slice(1)) delete process.env[name];
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = async () => { networkRequests++; throw new Error('NETWORK_DISABLED_FOR_CHECK'); };
  const callbacks = {
    listProjects: () => [{ id: 'project-1', name: '真实登记项目', apiKey: 'should-be-filtered', nested: { token: 'also-filtered' } }],
    listDevices: () => [], listTasks: () => [], listExperiences: () => [],
    listInbox:()=>[{id:'inbox-1',rawText:'本人主动记录的原话'}],listResearch:()=>[{id:'research-1',status:'discussion'}],listReleases:()=>[{id:'release-1',version:'1.0.0'}],
    listKnowledge:()=>[{id:'knowledge-1',version:1}],listMemory:()=>[{id:'memory-1',status:'active'}],listFamily:()=>[{id:'family-1',kind:'todo'}],listServices:()=>[{id:'service-1',health:'unknown'}],
  };
  const runInput: PiRunInput = {
    conversationId: 'check-1', actorId: 'owner', member: { name: '我', preferences: '' },
    sessionPath: null, text: '你好', onEvent: () => {}, onSessionPath: () => {},
  };
  let service: PiService | undefined;
  try {
    service = new PiService(directory, callbacks);
    await service.initialize();
    const first = await service.getSettings();
    assert.equal(first.configured, false, 'an unconfigured service must not pretend to answer');
    const provider = first.providers.find(provider => provider.id === 'openai');
    assert.ok(provider?.models.length, 'the model catalog comes from Pi');
    await assert.rejects(service.run(runInput), error => error instanceof PiServiceError && error.code === 'PI_NOT_CONFIGURED');
    assert.equal(service.health().activeRuns, 0, 'a rejected run releases its lock');
    await assert.rejects(service.configure({ provider: 'not-registered', model: 'invented' }), error => error instanceof PiServiceError && error.code === 'PI_MODEL_INVALID');
    const model = provider.models[0]!.id;
    // This is a deliberately invalid test credential. Pi's login checks local
    // configuration/persistence; no request is made to validate it remotely.
    const checkKey = 'jarvis-nonproduction-credential-check';
    await service.configure({ provider: 'openai', model, apiKey: checkKey });
    assert.equal(service.health().configured, true);
    assert.ok(!JSON.stringify(await service.getSettings()).includes(checkKey), 'settings never expose the credential');
    const stored = JSON.parse(await readFile(join(directory, 'pi/agent/auth.json'), 'utf8'));
    assert.equal(stored.openai.type, 'api_key', 'Pi persists its canonical credential');
    assert.equal(stored.openai.key, checkKey);
    const tools = (service as unknown as { businessTools(): ToolDefinition[] }).businessTools();
    assert.deepEqual(tools.map(tool => tool.name), ['jarvis_projects', 'jarvis_devices', 'jarvis_tasks', 'jarvis_experiences','jarvis_inbox','jarvis_research','jarvis_releases','jarvis_knowledge','jarvis_memory','jarvis_family','jarvis_services']);
    for(const [toolName,expectedId] of [['jarvis_inbox','inbox-1'],['jarvis_research','research-1'],['jarvis_releases','release-1']]){const queryTool=tools.find(t=>t.name===toolName)!;assert.equal(queryTool.annotations?.readOnlyHint,true);const queryResult=await queryTool.execute('query-1',{},undefined,undefined,{} as Parameters<typeof queryTool.execute>[4]);const queryText=queryResult.content.find(i=>i.type==='text');assert.ok(queryText?.type==='text');assert.equal(JSON.parse(queryText.text).records[0].id,expectedId)}
    const tool = tools[0]!;
    const result = await tool.execute('call-1', {}, undefined, undefined, {} as Parameters<typeof tool.execute>[4]);
    const content = result.content.find(item => item.type === 'text');
    assert.ok(content && content.type === 'text');
    const record = JSON.parse(content.text).records[0];
    assert.equal(record.name, '真实登记项目');
    assert.ok(!('apiKey' in record) && !('token' in record.nested), 'record credentials never enter model context');
    const settingsManager = SettingsManager.inMemory();
    const cwd = join(directory, 'pi/workspace');
    const agentDir = join(directory, 'pi/agent');
    const resourceLoader = new DefaultResourceLoader({
      cwd, agentDir, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalSkillPaths: [fileURLToPath(new URL('../resources/skills/jarvis-companion/', import.meta.url))],
      systemPromptOverride: () => '受控SDK测试', appendSystemPromptOverride: () => [],
    });
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getSkills().skills.map(skill => skill.name), ['jarvis-companion']);
    const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false });
    const { session } = await createAgentSession({
      cwd, agentDir, modelRuntime, model: modelRuntime.getModel('openai', model),
      sessionManager: SessionManager.inMemory(cwd), settingsManager, resourceLoader,
      customTools: tools, tools: tools.map(tool => tool.name),
      excludeTools: ['read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls'],
    });
    try {
      assert.deepEqual(session.getActiveToolNames().sort(), tools.map(tool => tool.name).sort(), 'the real Pi SDK has only the eleven allowed query tools');
      assert.ok(session.systemPrompt.includes('受控SDK测试'));
    } finally { session.dispose(); }
    await assert.rejects(service.run({ ...runInput, sessionPath: join(directory, 'outside.jsonl') }), error => error instanceof PiServiceError && error.code === 'PI_SESSION_INVALID');
    assert.equal(service.health().activeRuns, 0);
    await service.dispose();
    service = new PiService(directory, callbacks);
    await service.initialize();
    assert.equal(service.health().configured, true, 'provider-owned login survives a process restart');
    assert.equal((await service.getSettings()).model, model);
    assert.equal(networkRequests, 0, 'the check never calls a remote model or provider endpoint');
  } finally {
    await service?.dispose();
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (environment[name] === undefined) delete process.env[name];
      else process.env[name] = environment[name];
    }
    const resolved = resolve(directory);
    const part = relative(resolve(tmpdir()), resolved);
    assert.ok(part && part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !isAbsolute(part) && basename(resolved).startsWith('jarvis-pi-sdk-check-'));
    await rm(resolved, { recursive: true, force: true });
  }
});
