import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store } from '../src/store.js';
import { IdentityRuntime, RuntimeAccessError } from '../src/runtime/identity.js';
import { VoiceRuntime } from '../src/runtime/voice.js';
import { V1Repository } from '../src/v1/repository.js';
import { familyHandlers } from '../src/v1/family-domains.js';
import { createApp } from '../src/app.js';
import type { PiService } from '../src/pi.js';

const options = { memberExists: (id: string) => id === 'me', memberProfile: (id: string) => id === 'me' ? { id, name: '隔离验收' } : undefined };
const isError = (code: string) => (error: unknown) => error instanceof RuntimeAccessError && error.code === code;

test('restoring encrypted voice settings requires the matching original key and never replaces a missing or invalid key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-voice-key-'));
  const sourceDir = join(directory, 'source'), targetDir = join(directory, 'restored');
  const store = new Store(sourceDir), identity = new IdentityRuntime(store, options);
  const voice = new VoiceRuntime(sourceDir, identity, { defaultLocalTts: false });
  const secret = 'synthetic-secret-not-a-real-credential';
  const keyPath = join(sourceDir, 'runtime', 'voice-master.key');
  let restoredStore: Store | undefined, restoredIdentity: IdentityRuntime | undefined, restoredVoice: VoiceRuntime | undefined;
  try {
    voice.configure('asr', { adapter: 'http', baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture', apiKey: secret });
    const originalKey = await readFile(keyPath);
    await voice.close(); identity.close(); store.close();
    await mkdir(targetDir); await copyFile(store.databasePath, join(targetDir, 'jarvis.db'));
    restoredStore = new Store(targetDir); restoredIdentity = new IdentityRuntime(restoredStore, options);
    const restoredKey = join(targetDir, 'runtime', 'voice-master.key');
    const encryptedBefore = restoredIdentity.db.prepare('SELECT config FROM runtime_voice_engines').get()!.config;
    assert.throws(() => new VoiceRuntime(targetDir, restoredIdentity!, { defaultLocalTts: false }), isError('VOICE_KEY_MISSING'));
    await assert.rejects(access(restoredKey));
    assert.equal(restoredIdentity.db.prepare('SELECT config FROM runtime_voice_engines').get()!.config, encryptedBefore);
    for (const invalid of [Buffer.from('short-invalid-key'), randomBytes(32)]) {
      await writeFile(restoredKey, invalid);
      assert.throws(() => new VoiceRuntime(targetDir, restoredIdentity!, { defaultLocalTts: false }), isError('VOICE_KEY_INVALID'));
      assert.deepEqual(await readFile(restoredKey), invalid);
      assert.equal(restoredIdentity.db.prepare('SELECT config FROM runtime_voice_engines').get()!.config, encryptedBefore);
    }
    await writeFile(restoredKey, originalKey);
    restoredVoice = new VoiceRuntime(targetDir, restoredIdentity, { defaultLocalTts: false });
    assert.equal(restoredVoice.getConfig('asr')?.adapter, 'http');
    const config = restoredVoice.getConfig('asr');
    assert(config?.adapter === 'http'); assert.equal(config.apiKey, secret);
    assert.equal(JSON.stringify(restoredVoice.state()).includes(secret), false);
    assert.deepEqual(await readFile(keyPath), originalKey); assert.deepEqual(await readFile(restoredKey), originalKey);
  } finally {
    await restoredVoice?.close(); restoredIdentity?.close(); restoredStore?.close();
    await voice.close(); identity.close(); store.close(); await rm(directory, { recursive: true, force: true });
  }
});

test('persona records report the implemented runtime without claiming a configured engine or an authenticated person', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-persona-status-')), store = new Store(directory), repository = new V1Repository(store.databasePath);
  try {
    const handler = familyHandlers.find(h => h.domain === 'personas')!;
    const record = repository.execute(handler, 'preference', { commandId: randomUUID(), expectedVersion: 0, scope: 'private', payload: { profileId: 'me', address: '本人', replyStyle: '清晰自然', cloudPrivacy: 'local', dailyVoiceMinutes: 10, autoSpeak: true } }, 'server-admin', () => undefined).data;
    assert.equal(record.voiceStatus, 'runtime-managed'); assert.equal(record.wakeStatus, 'runtime-managed');
    assert.equal(record.enforcementStatus, 'server-enforced'); assert.equal(record.authentication, 'administrator-managed-profile');
    assert.match(record.note, /需要配置引擎/); assert.match(record.note, /档案不代替本人认证/);
    assert.doesNotMatch(record.note, /待接入/);
  } finally { repository.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('createApp releases every startup handle after key errors so the same restored directory can recover and be deleted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jarvis-app-key-recovery-')), sourceDir = join(directory, 'source'), targetDir = join(directory, 'restored');
  const store = new Store(sourceDir), identity = new IdentityRuntime(store, options), voice = new VoiceRuntime(sourceDir, identity, { defaultLocalTts: false });
  let disposed = 0, initialized = 0, runtime: Awaited<ReturnType<typeof createApp>> | undefined;
  const fakePi = { initialize: async () => { initialized++; }, health: () => ({ configured: false, activeRuns: 0 }), abort: async () => {}, dispose: async () => { disposed++; } } as unknown as PiService;
  try {
    voice.configure('tts', { adapter: 'http', baseUrl: 'http://127.0.0.1:1/v1', model: 'fixture', apiKey: 'offline-restoration-fixture' });
    const key = await readFile(join(sourceDir, 'runtime', 'voice-master.key'));
    await voice.close(); identity.close(); store.close();
    await mkdir(targetDir); await copyFile(store.databasePath, join(targetDir, 'jarvis.db'));
    const appOptions = { dataDir: targetDir, pi: fakePi, webDir: join(directory, 'no-web'), pythonExecutable: join(directory, 'no-python.exe'), whisperModelDirectory: join(directory, 'no-model') };
    await assert.rejects(createApp(appOptions), isError('VOICE_KEY_MISSING'));
    assert.equal(disposed, 1);
    const restoredKey = join(targetDir, 'runtime', 'voice-master.key'), invalid = randomBytes(32);
    await writeFile(restoredKey, invalid);
    await assert.rejects(createApp(appOptions), isError('VOICE_KEY_INVALID'));
    assert.equal(disposed, 2); assert.deepEqual(await readFile(restoredKey), invalid);
    await writeFile(restoredKey, key);
    runtime = await createApp(appOptions); await runtime.app.ready();
    const config = runtime.voice.getConfig('tts'); assert(config?.adapter === 'http');
    assert.equal(config.apiKey, 'offline-restoration-fixture'); assert.equal(initialized, 3);
    await runtime.app.close(); runtime = undefined;
    assert.equal(disposed, 3);
    // On Windows this fails with EBUSY if even one startup SQLite handle survived.
    await rm(targetDir, { recursive: true, force: true }); await assert.rejects(access(targetDir));
  } finally {
    await runtime?.app.close(); await voice.close(); identity.close(); store.close(); await rm(directory, { recursive: true, force: true });
  }
});
