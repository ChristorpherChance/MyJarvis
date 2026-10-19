import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import type { PiService } from '../../src/pi.js';

function createFakePi(): PiService {
  return {
    initialize: async () => {},
    dispose: async () => {},
    health: () => ({ configured: false }),
    run: async () => { throw new Error('ISOLATED_PROJECT_FIXTURE_PI_DISABLED'); },
    abort: async () => {},

  } as unknown as PiService;
}

/** Explicit subprocess environment: intentionally does not inherit host variables. */
export function isolatedProjectChildEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const allowed = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'WINDIR', 'PATHEXT', 'LANG', 'LC_ALL', 'TZ'];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const key of Object.keys(env)) {
    if (/^(?:JARVIS_|ANTHROPIC_|CLAUDE_|OPENAI_|GEMINI_|GOOGLE_|AZURE_OPENAI_|AWS_)/i.test(key) || /(?:API_KEY|TOKEN|SECRET|PASSWORD|COOKIE|AUTH)/i.test(key)) delete env[key];
  }
  const allowedOverrides = new Set(['JARVIS_DATA_DIR', 'JARVIS_SERVICE_INSTANCE', 'JARVIS_HOST', 'JARVIS_PORT', 'JARVIS_WEB_DIR']);
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowedOverrides.has(key)) throw new Error(`ISOLATED_PROJECT_ENV_OVERRIDE_NOT_ALLOWED:${key}`);
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

export interface IsolatedProjectAppOptions {
  dataDir: string;
  webDir?: string;
  pi?: PiService;
  instanceId?: string;
}

/** Build createApp options with every external/configurable data path isolated. */
export function createIsolatedProjectAppOptions(options: IsolatedProjectAppOptions) {
  const dataDir = resolve(options.dataDir);
  const instanceId = options.instanceId ?? `test-${randomUUID()}`;
  return {
    dataDir,
    pi: options.pi ?? createFakePi(),
    webDir: options.webDir ?? join(dataDir, 'no-web-assets'),
    pythonExecutable: join(dataDir, 'disabled-python'),
    whisperModelDirectory: join(dataDir, 'disabled-whisper-model'),
    healthInstanceId: instanceId,
    remoteOperations: {
      queue: join(dataDir, 'remote-operations', 'queue'),
      configPath: join(dataDir, 'remote-operations', 'config.json'),
    },
    aiDevelopment: {
      queue: join(dataDir, 'ai-development', 'queue'),
      configPath: join(dataDir, 'ai-development', 'config.json'),
    },
  };
}

export interface IsolatedProjectApp {
  runtime: Awaited<ReturnType<typeof createApp>>;
  dataDir: string;
  baseUrl: string;
  instanceId: string;
  close(): Promise<void>;
}

/** Start a real createApp instance on an ephemeral loopback port with private data. */
export async function startIsolatedProjectApp(options: Omit<IsolatedProjectAppOptions, 'dataDir'> & { dataDir?: string } = {}): Promise<IsolatedProjectApp> {
  const dataDir = options.dataDir ? resolve(options.dataDir) : await mkdtemp(join(tmpdir(), 'jarvis-isolated-project-'));
  const ownsDataDir = options.dataDir === undefined;
  const instanceId = options.instanceId ?? `test-${randomUUID()}`;
  let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
  let closed = false;
  try {
    runtime = await createApp(createIsolatedProjectAppOptions({ ...options, dataDir, instanceId }));
    await runtime.app.listen({ host: '127.0.0.1', port: 0 });
    const address = runtime.app.server.address();
    if (!address || typeof address === 'string') throw new Error('ISOLATED_PROJECT_APP_NOT_LISTENING');
    const appRuntime = runtime;
    return {
      runtime: appRuntime,
      dataDir,
      baseUrl: `http://127.0.0.1:${address.port}`,
      instanceId,
      async close() {
        if (closed) return;
        closed = true;
        try { await appRuntime.app.close(); }
        finally { if (ownsDataDir) await rm(dataDir, { recursive: true, force: true }); }
      },
    };
  } catch (error) {
    try { await runtime?.app.close(); } catch { /* preserve startup error */ }
    if (ownsDataDir) await rm(dataDir, { recursive: true, force: true });
    throw error;
  }
}
