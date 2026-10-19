import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createIsolatedProjectAppOptions, isolatedProjectChildEnvironment, startIsolatedProjectApp } from './isolated-project-app.js';

test('isolated project app uses loopback ephemeral port, private runtime paths and closes owned data', async () => {
  const instance = await startIsolatedProjectApp();
  try {
    assert.match(instance.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(instance.instanceId, /^test-/);
    assert.equal((await fetch(`${instance.baseUrl}/api/health`)).status, 200);
    const health = await (await fetch(`${instance.baseUrl}/api/health`)).json() as { instanceId: string };
    assert.equal(health.instanceId, instance.instanceId);
    assert.equal(instance.runtime.pi.health().configured, false);
    await assert.rejects(instance.runtime.pi.run({} as never), /ISOLATED_PROJECT_FIXTURE_PI_DISABLED/);
    assert.equal(instance.runtime.remoteOps?.queue.startsWith(instance.dataDir), true);
    assert.equal(instance.runtime.remoteOps?.configPath.startsWith(instance.dataDir), true);
    assert.equal(instance.runtime.aiDevelopment?.queue.startsWith(instance.dataDir), true);
    assert.equal(instance.runtime.aiDevelopment?.configPath.startsWith(instance.dataDir), true);
  } finally {
    const ownedDirectory = instance.dataDir;
    await instance.close();
    await assert.rejects(access(ownedDirectory));
    await instance.close();
  }
});

test('isolated options and child environment exclude inherited service and model settings', () => {
  const options = createIsolatedProjectAppOptions({ dataDir: '/tmp/project-fixture', instanceId: 'test-explicit' });
  assert.equal(options.pythonExecutable, '/tmp/project-fixture/disabled-python');
  assert.equal(options.whisperModelDirectory, '/tmp/project-fixture/disabled-whisper-model');
  assert.equal(options.remoteOperations.queue, '/tmp/project-fixture/remote-operations/queue');
  assert.equal(options.aiDevelopment.configPath, '/tmp/project-fixture/ai-development/config.json');
  const previous = { JARVIS_DATA_DIR: process.env.JARVIS_DATA_DIR, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  process.env.JARVIS_DATA_DIR = '/forbidden/production';
  process.env.ANTHROPIC_API_KEY = 'must-not-leak';
  try {
    const env = isolatedProjectChildEnvironment({ JARVIS_DATA_DIR: '/tmp/allowed-fixture', JARVIS_SERVICE_INSTANCE: 'test-child' });
    assert.equal(env.JARVIS_DATA_DIR, '/tmp/allowed-fixture');
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.equal(env.JARVIS_SERVICE_INSTANCE, 'test-child');
    assert.throws(() => isolatedProjectChildEnvironment({ ANTHROPIC_API_KEY: 'must-not-leak' }), /OVERRIDE_NOT_ALLOWED/);
  } finally {
    if (previous.JARVIS_DATA_DIR === undefined) delete process.env.JARVIS_DATA_DIR; else process.env.JARVIS_DATA_DIR = previous.JARVIS_DATA_DIR;
    if (previous.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous.ANTHROPIC_API_KEY;
  }
});
