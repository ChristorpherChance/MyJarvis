/* Real Chromium acceptance for ordinary project-session resume; fully isolated. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_MS = 120_000;
if (!process.argv.includes('--isolated-child')) {
  const env = {};
  for (const key of ['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ']) if (process.env[key] !== undefined) env[key] = process.env[key];
  const home = await mkdtemp(join(tmpdir(), 'qa-project-resume-parent-'));
  await chmod(home, 0o700);
  let timer, forceTimer, timedOut = false;
  try {
    const { access } = await import('node:fs/promises');
    const fromPw = (await import('@playwright/test')).chromium.executablePath();
    const candidates = [fromPw, join(process.env.HOME ?? '', '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')];
    let browserPath;
    for (const candidate of candidates) if (await access(candidate).then(() => true, () => false)) { browserPath = candidate; break; }
    if (!browserPath) throw new Error('PLAYWRIGHT_CHROMIUM_NOT_FOUND');
    const child = spawn(process.execPath, ['--import','tsx',fileURLToPath(import.meta.url),'--isolated-child','--browser-path',browserPath], { cwd: root, env: { ...env, HOME: home, USERPROFILE: home }, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' });
    const terminate = signal => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch {} };
    timer = setTimeout(() => { timedOut = true; terminate('SIGTERM'); forceTimer = setTimeout(() => terminate('SIGKILL'), 5000); }, MAX_MS);
    const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
    process.exitCode = timedOut ? 124 : (code ?? 1);
  } finally { clearTimeout(timer); clearTimeout(forceTimer); await rm(home, { recursive: true, force: true }); }
} else {
  const browserPath = process.argv[process.argv.indexOf('--browser-path') + 1];
  if (!browserPath) throw new Error('BROWSER_PATH_REQUIRED');
  const { chromium: pwChromium } = await import('@playwright/test');
  const chromium = { launch: options => pwChromium.launch({ ...options, executablePath: browserPath }) };
  const { startIsolatedProjectApp } = await import('../apps/api/test/helpers/isolated-project-app.ts');
  const { ExecutionAgent } = await import('../apps/api/src/runtime/agent-runner.ts');
  const attempt = randomUUID();
  const reportDir = join(root, 'artifacts/project-acceptance', attempt);
  const privateDir = await mkdtemp(join(tmpdir(), `qa-project-resume-${attempt}-`));
  await chmod(privateDir, 0o700);
  await mkdir(reportDir, { recursive: true, mode: 0o700 }); await chmod(reportDir, 0o700);
  process.env.HOME = privateDir; process.env.USERPROFILE = privateDir;
  const checks = [], blockedOrigins = [], pageErrors = [], httpErrors = [], cleanupErrors = [], captured = {};
  let fixture, agent, browser, context, page, base = '', projectId = '', machineId = '', taskId = '', cookie = '', activeCheck = 'bootstrap', runCount = 0, piCalls = 0;
  const startedAt = Date.now();
  const evidenceText = 'Private temporary resume acceptance fixture; no external project data.\n';
  const evidenceHash = createHash('sha256').update(evidenceText).digest('hex');
  const safeError = error => String(error?.message ?? error).replaceAll(base, '[isolated-origin]').replace(/jarvis_session=[^;\s]+/gi, 'jarvis_session=[redacted]').replaceAll(privateDir, '[private-path]').slice(0, 600);
  const check = async (name, fn) => { activeCheck = name; await fn(); checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); };
  const safeCommandResponse = response => { const data = response?.data; return { status: response?.status, session: data ? { id: data.id, revision: data.revision, goalRevision: data.goalRevision, status: data.status, enabled: data.enabled, action: data.action } : undefined }; };
  const originalFetch = globalThis.fetch;
  try {
    const pi = { initialize: async()=>{}, dispose: async()=>{}, abort: async()=>{}, health:()=>({configured:true}), run: async input => {
      piCalls++;
      const marker = '\n\nUntrusted supervisor input JSON:\n', at = String(input.text).lastIndexOf(marker);
      assert(at >= 0, 'real supervisor model-input marker');
      const payload = JSON.parse(String(input.text).slice(at + marker.length).trim());
      assert.equal(typeof payload.binding?.runId, 'string');
      return { status: 'complete', text: JSON.stringify({ action: 'wait_user', directive: '', reason: '仅用于隔离验收的确定性Pi替身判断。', selectedOption: null, criteria: [], experienceReferences: [] }) };
    } };
    fixture = await startIsolatedProjectApp({ dataDir: join(privateDir, 'platform-data'), webDir: join(root, 'apps/web/dist'), pi });
    base = fixture.baseUrl;
    assert.equal(new URL(base).hostname, '127.0.0.1');
    assert(![3140,3141,3142,43140,45173].includes(Number(new URL(base).port)));
    globalThis.fetch = (input, options) => { const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); if (u.origin !== base) { blockedOrigins.push(u.origin); throw Error('EXTERNAL_FETCH_FORBIDDEN'); } return originalFetch(input, options); };
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.route('**/*', route => { const origin = new URL(route.request().url()).origin; if (origin === base) return route.continue(); blockedOrigins.push(origin); return route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(12_000);
    page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 300)));
    page.on('response', r => { if (r.status() >= 500) httpErrors.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    const api = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
      const response = await originalFetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { response, value: await response.json().catch(() => ({})) };
    };
    const invoke = async (domain, command, payload) => {
      const { response, value } = await api(`/api/v1/${domain}/commands/${command}`, { commandId: randomUUID(), expectedVersion: 0, scope: 'personal', payload });
      assert.equal(response.status, 200, `${domain}/${command} HTTP ${response.status}`); return value.data;
    };
    const workbench = async () => {
      const { response, value } = await api(`/api/v1/projects/${projectId}/workbench`);
      assert.equal(response.status, 200); return value.data;
    };
    const waitFor = async (label, predicate, timeout = 20_000) => {
      const end = Date.now() + timeout; let latest;
      while (Date.now() < end) {
        const data = await workbench(); latest = data;
        if (predicate(data)) return data;
        if(data.supervisor?.session?.status==='blocked')throw Error('SUPERVISOR_BLOCKED:'+JSON.stringify({reason:data.supervisor.session.blocker,diagnostics:data.supervisor.events?.slice(0,3).map(event=>({kind:event.kind,reason:event.reason,diagnostic:event.diagnostic?.reasonEnum}))}));
        await new Promise(resolveDelay => setTimeout(resolveDelay, 750));
      }
      throw new Error(`WAIT_TIMEOUT:${label}:${JSON.stringify({ status: latest?.supervisor?.session?.status, execution: latest?.execution?.state, runId: latest?.supervisor?.session?.runId })}`);
    };
    const route = `/?mode=platform#${new URLSearchParams({ theme: 'stark', view: 'projects' }).toString()}`;
    await page.goto(base + route);
    const password = `Resume-isolated-${randomUUID()}`;
    await page.getByLabel('管理密码', { exact: true }).fill(password);
    await page.getByLabel('确认密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '创建账户', exact: true }).click();
    await page.getByRole('heading', { name: '项目', exact: true, level: 2 }).waitFor();
    const sessionCookie = (await context.cookies(base)).find(item => item.name === 'jarvis_session'); assert(sessionCookie);
    cookie = `jarvis_session=${sessionCookie.value}`;

    const workspaceRoot = join(privateDir, 'workspace-root'), workspace = join(workspaceRoot, 'project');
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, 'public-source.txt'), evidenceText, { flag: 'wx', mode: 0o600 });
    const machine = await invoke('machines', 'register', { name: 'resume isolated fixture', role: 'development', category: 'workstation', ram: 16, always: false, readOnly: false });
    machineId = machine.id;
    const project = await invoke('projects', 'register', { name: '隔离普通resume真实浏览器验收', description: '临时私有SQLite、Loopback与签名Node假CLI。', goal: '验证wait_user后普通resume续接同一原生会话', milestones: ['验证普通resume lineage'], copies: [{ machineId, path: workspace, environment: 'development', branch: 'fixture' }] });
    projectId = project.id;
    const evidenceFile = join(workspace, 'public-source.txt');
    const cli = join(privateDir, 'fake-native-cli.cjs');
    const nativeId = `fixture-native-${randomUUID()}`;
    const cliSource = `const fs=require('node:fs');const args=process.argv.slice(2);const resume=args.indexOf('--resume');const n=fs.existsSync('resume-round.txt')?Number(fs.readFileSync('resume-round.txt','utf8'))+1:1;const native=${JSON.stringify(nativeId)};if(n===1&&resume>=0||n===2&&(resume<0||args[resume+1]!==native)||n>2)process.exit(42);fs.writeFileSync('resume-round.txt',String(n));fs.writeFileSync('captured-args-'+n,JSON.stringify(args));const state={state:'progress',summary:'签名Node假CLI完成隔离轮次'+n,question:'是否继续核对同一目标？',options:['继续核对本地临时原件'],recommendedOption:'继续核对本地临时原件',evidence:[{path:'public-source.txt',sha256:${JSON.stringify(evidenceHash)}}],nextSuggestion:'依据临时原件继续核验'};console.log(JSON.stringify({type:'system',subtype:'init',session_id:native,claude_code_version:'2.1.296'}));console.log(JSON.stringify({type:'result',session_id:native,result:JSON.stringify(state),usage:{input_tokens:0,output_tokens:0},total_cost_usd:0}));`;
    await writeFile(cli, cliSource, { flag: 'wx', mode: 0o600 });
    const template = { id: 'resume-fixture-cli', machineId, engine: 'claude', program: process.execPath, args: [cli, '--print', '{prompt}', '--output-format', 'stream-json'], workspaceRoot, maxRounds: 1, timeoutSec: 20, leaseSec: 30, budgetCurrency: 'USD', purpose: 'project-supervisor', supervision: { billing: 'record-only', maxTokens: 1000, maxRecoveryAttempts: 0, retryDelaySec: 60, repairValidation: false, fallbackExecutorIds: [] } };
    const config = await api('/api/v1/execution/config', { expectedVersion: 0, templates: [template], probes: [], wol: [] }, 'PUT'); assert.equal(config.response.status, 200);
    const ticket = await api('/api/v1/execution/tickets', { machineId, capabilities: [template.id] }); assert.equal(ticket.response.status, 200);
    const task = await invoke('tasks', 'create', { title: '普通resume本地CLI样本', projectId, machineId, agent: template.id, mode: 'managed', goal: '同goal完成两轮本地核验', criteria: '临时原件准确SHA-256', budget: 10, retryLimit: 0, worktree: workspace }); taskId = task.id;
    const kickoff = await api(`/api/v1/projects/${projectId}/supervisor`, { commandId: randomUUID(), expectedVersion: 0, goal: '同goal完成两轮本地核验', criteria: ['签名运行并核对临时原件'], machineId, executor: 'claude-code', workspace, taskId });
    assert.equal(kickoff.response.status, 200, 'seed supervisor using real API contract');
    agent = new ExecutionAgent({ apiUrl: base, machineId, pairingTicket: ticket.value.data.ticket, workspaceRoots: [workspaceRoot], templates: [template], deliveryDirectory: join(privateDir, 'agent-journal') });
    await agent.pair(); await agent.heartbeat();
    // API setup is intentionally followed by a reload so the mounted LiveProvider sees the seeded session.
    await page.goto(`${base}/?mode=platform#${new URLSearchParams({ theme: 'stark', view: `projects/${projectId}` }).toString()}`);
    await page.reload();
    await page.getByRole('heading', { name: '隔离普通resume真实浏览器验收', exact: true }).first().waitFor();

    await check('signed-first-run-reaches-wait-user', async () => {
      const state = await workbench(); assert.equal(state.supervisor.session.status, 'draft');
      const start = await api(`/api/v1/projects/${projectId}/supervisor/commands`, { commandId: randomUUID(), expectedVersion: state.supervisor.session.revision, action: 'start', authorizeContinuous: true, acknowledgeUnknownHistory: true, maxParentTokens: 1000 });
      assert.equal(start.response.status, 200);
      const queued = await waitFor('first run queued', value => value.execution.state === 'queued');
      const firstRunId = queued.supervisor.session.runId; assert(firstRunId);
      assert(await agent.runOnce()); runCount++;
      const waiting = await waitFor('signed first wait_user', value => value.supervisor.session.status === 'waiting_user' && value.supervisor.events.some(event => event.kind === 'feedback' && event.runId === firstRunId));
      const signed = fixture.runtime.execution.getRun(firstRunId);
      assert.equal(signed.status, 'succeeded'); assert.equal(signed.result.source, 'signed-agent'); assert.equal(signed.result.sessionId, nativeId);
      assert.equal(waiting.currentLoopBrief.ownerActionRequired, true);
      assert((agent.deliveryStatus()).deliveries.acknowledged >= 1);
      captured.firstRun = { runId: firstRunId, status: signed.status, resultSource: signed.result.source, nativeSessionId: signed.result.sessionId, supervisorStatus: waiting.supervisor.session.status };
    });

    await check('pause-wait-user-session-through-real-ui', async () => {
      const before = (await workbench()).supervisor.session;
      const controls = page.locator('.workbench-more-controls');
      if (!await controls.evaluate(node => node.open)) await controls.locator('summary').click();
      const requestSeen = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api/v1/projects/${projectId}/supervisor/commands` && request.postDataJSON()?.action === 'pause');
      const responseSeen = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/projects/${projectId}/supervisor/commands` && response.request().postDataJSON()?.action === 'pause');
      await controls.getByRole('button', { name: '暂停', exact: true }).click();
      const [request, response] = await Promise.all([requestSeen, responseSeen]);
      assert.equal(request.postDataJSON().expectedVersion, before.revision); assert.match(request.postDataJSON().commandId, /^[a-f0-9-]{36}$/); assert.equal(response.status(), 200);
      const paused = await waitFor('paused UI command', value => value.supervisor.session.status === 'paused');
      assert.equal(paused.supervisor.session.enabled, false);
      captured.pause = { request: { commandId: request.postDataJSON().commandId, expectedVersion: request.postDataJSON().expectedVersion, action: request.postDataJSON().action }, response: safeCommandResponse(await response.json()), resultingStatus: paused.supervisor.session.status, resultingRevision: paused.supervisor.session.revision, enabled: paused.supervisor.session.enabled };
    });

    await check('real-ui-ordinary-resume-captures-CAS-and-native-args', async () => {
      const paused = (await workbench()).supervisor.session;
      assert.equal(paused.status, 'paused'); assert.equal(paused.goal, '同goal完成两轮本地核验');
      await page.getByRole('button', { name: '补充指令并继续', exact: true }).click();
      const form = page.locator('#workbench-arrange-form').locator('form');
      await form.waitFor({ state: 'visible' });
      await form.getByLabel('你的说明', { exact: true }).fill('继续同一目标，只核对临时原件并保留原生会话。');
      await form.getByRole('checkbox').check();
      const requestSeen = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api/v1/projects/${projectId}/supervisor/commands` && request.postDataJSON()?.action === 'resume');
      const responseSeen = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/projects/${projectId}/supervisor/commands` && response.request().postDataJSON()?.action === 'resume');
      await form.getByRole('button', { name: '继续推进', exact: true }).click();
      const [request, response] = await Promise.all([requestSeen, responseSeen]);
      const body = request.postDataJSON();
      assert.equal(body.expectedVersion, paused.revision); assert.match(body.commandId, /^[a-f0-9-]{36}$/); assert.equal(body.action, 'resume'); assert.equal(body.authorizeContinuous, true); assert.equal(body.acknowledgeUnknownHistory, true); assert.equal(body.directive, '继续同一目标，只核对临时原件并保留原生会话。'); assert.equal(response.status(), 200);
      const responseBody = safeCommandResponse(await response.json());
      const queued = await waitFor('ordinary resume queued', value => value.execution.state === 'queued' && value.supervisor.session.runId !== captured.firstRun.runId);
      const secondRunId = queued.supervisor.session.runId; assert(secondRunId);
      assert(await agent.runOnce()); runCount++;
      const waiting = await waitFor('resumed run wait_user', value => value.supervisor.session.status === 'waiting_user' && value.supervisor.events.some(event => event.kind === 'feedback' && event.runId === secondRunId));
      const signed = fixture.runtime.execution.getRun(secondRunId);
      assert.equal(signed.status, 'succeeded'); assert.equal(signed.result.source, 'signed-agent'); assert.equal(signed.result.sessionId, nativeId);
      const args = JSON.parse(await readFile(join(workspace, 'captured-args-2'), 'utf8'));
      const resumeAt = args.indexOf('--resume'); assert(resumeAt >= 0, 'Node fake CLI args must contain --resume'); assert.equal(args[resumeAt + 1], nativeId);
      const printAt = args.indexOf('--print'); const safeArgs = args.map((arg, index) => index === printAt + 1 ? '[prompt-redacted]' : arg).filter((_, index) => index !== 0);
      const taskAfter = fixture.runtime.v1.read('tasks', taskId, 'server-admin'); assert.equal(taskAfter.sessionId, nativeId);
      assert.equal(waiting.supervisor.session.goal, '同goal完成两轮本地核验'); assert.equal(waiting.supervisor.session.status, 'waiting_user');
      captured.resume = { request: { commandId: body.commandId, expectedVersion: body.expectedVersion, action: body.action, authorizeContinuous: body.authorizeContinuous, acknowledgeUnknownHistory: body.acknowledgeUnknownHistory, directive: body.directive }, response: responseBody, resultingRunId: secondRunId, result: { status: signed.status, source: signed.result.source, nativeSessionId: signed.result.sessionId }, actualNodeCliArgs: safeArgs, nativeResumeIdMatched: args[resumeAt + 1] === nativeId, sameGoal: waiting.supervisor.session.goal === '同goal完成两轮本地核验', resultingSupervisorStatus: waiting.supervisor.session.status };
    });

    await check('stop-then-ordinary-resume-rejected-without-run', async () => {
      const before = (await workbench()).supervisor.session; assert.equal(before.status, 'waiting_user');
      // The API can reach terminal feedback before the browser consumes its SSE refresh.
      await page.getByRole('button',{name:'回答本轮问题',exact:true}).waitFor();
      const controls = page.locator('.workbench-more-controls');
      if (!await controls.evaluate(node => node.open)) await controls.locator('summary').click();
      const requestSeen = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api/v1/projects/${projectId}/supervisor/commands` && request.postDataJSON()?.action === 'stop');
      const responseSeen = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/projects/${projectId}/supervisor/commands` && response.request().postDataJSON()?.action === 'stop');
      await controls.getByRole('button', { name: '停止', exact: true }).click();
      const [stopRequest, stopResponse] = await Promise.all([requestSeen, responseSeen]); assert.equal(stopResponse.status(), 200);
      const stopBody = stopRequest.postDataJSON(); const stopResponseBody = safeCommandResponse(await stopResponse.json());
      const stopped = await waitFor('stopped terminal session', value => value.supervisor.session.status === 'stopped');
      const countBeforeResume = fixture.runtime.execution.listRuns().length;
      const deniedRequest = { commandId: randomUUID(), expectedVersion: stopped.supervisor.session.revision, action: 'resume', authorizeContinuous: true, acknowledgeUnknownHistory: true, maxParentTokens: 1000 };
      const denied = await api(`/api/v1/projects/${projectId}/supervisor/commands`, deniedRequest);
      assert.equal(denied.response.status, 409, `ordinary resume after terminal stop must reject; got ${denied.response.status}`);
      assert.equal(fixture.runtime.execution.listRuns().length, countBeforeResume, 'rejected resume adds no execution run');
      const after = await workbench(); assert.equal(after.supervisor.session.status, 'stopped'); assert.equal(after.supervisor.session.revision, stopped.supervisor.session.revision);
      captured.stop = { request: stopBody, response: { status: stopResponse.status(), body: stopResponseBody }, resultingStatus: stopped.supervisor.session.status };
      captured.postStopOrdinaryResume = { request: deniedRequest, response: { status: denied.response.status, body: denied.value }, runCountBefore: countBeforeResume, runCountAfter: fixture.runtime.execution.listRuns().length, sessionStatusAfter: after.supervisor.session.status };
    });
    assert.equal(runCount, 2); assert.equal(piCalls, 2); assert.equal(blockedOrigins.length, 0); assert.deepEqual(pageErrors, []); assert.deepEqual(httpErrors, []);
  } catch (error) {
    process.exitCode = 1; checks.push({ name: activeCheck, status: 'failed', error: safeError(error) });
    console.error(`FAIL ${activeCheck}: ${safeError(error)}`);
  } finally {
    const close = async (resource, fn) => { try { await fn?.(); } catch (error) { cleanupErrors.push({ resource, error: safeError(error) }); } };
    await close('execution-agent', () => agent?.stop()); await close('browser-context', () => context?.close()); await close('browser', () => browser?.close()); await close('isolated-app', () => fixture?.close());
    globalThis.fetch = originalFetch;
    await close('private-runtime-files', () => rm(privateDir, { recursive: true, force: true }));
    const report = { schemaVersion: 1, attempt, startedAt: new Date(startedAt).toISOString(), elapsedMs: Date.now() - startedAt, passed: checks.every(item => item.status === 'passed') && cleanupErrors.length === 0, scope: 'single real Chromium platform-mode session; ephemeral loopback HTTP/SQLite; real signed local ExecutionAgent; Node fake Claude CLI protocol only; deterministic fake Pi supervisor only; no external provider, no factory, no production', results: checks, runCount, externalModelProviderCalls: 0, fakePiJudgeCalls: piCalls, externalBrowserOriginsBlocked: blockedOrigins.length, pageErrors, httpErrors, capturedLifecycle: captured, cleanupErrors, cleanupComplete: !!fixture && cleanupErrors.length === 0, productionAccess: false, privateJournalOrWorkspacePublished: false, externalProviderSpend: 0 };
    await writeFile(join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); console.log(JSON.stringify(report, null, 2));
  }
}
