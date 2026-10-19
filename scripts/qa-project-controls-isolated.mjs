/* Bounded real-browser controls acceptance; all runtime data stays private. */
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
  const home = await mkdtemp(join(tmpdir(), 'qa-project-controls-parent-'));
  await chmod(home, 0o700);
  let browserPath;
  try {
    const { access } = await import('node:fs/promises');
    const fromPw = (await import('@playwright/test')).chromium.executablePath();
    for (const candidate of [fromPw, join(process.env.HOME ?? '', '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'), join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')]) {
      if (await access(candidate).then(() => true, () => false)) { browserPath = candidate; break; }
    }
    if (!browserPath) throw new Error('PLAYWRIGHT_CHROMIUM_NOT_FOUND');
    const child = spawn(process.execPath, ['--import','tsx',fileURLToPath(import.meta.url),'--isolated-child','--browser-path',browserPath], { cwd: root, env: { ...env, HOME: home, USERPROFILE: home }, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' });
    let timeoutTriggered = false, forceTimer;
    const timer = setTimeout(() => { timeoutTriggered = true; try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch {} forceTimer = setTimeout(() => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 5000); }, MAX_MS);
    const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
    clearTimeout(timer); clearTimeout(forceTimer);
    process.exitCode = timeoutTriggered ? 124 : (code ?? 1);
  } finally { await rm(home, { recursive: true, force: true }); }
} else {
  const browserPath = process.argv[process.argv.indexOf('--browser-path') + 1];
  if (!browserPath) throw new Error('BROWSER_PATH_REQUIRED');
  const { chromium: pwChromium } = await import('@playwright/test');
  const chromium = { launch: options => pwChromium.launch({ ...options, executablePath: browserPath }) };
  const { startIsolatedProjectApp } = await import('../apps/api/test/helpers/isolated-project-app.ts');
  const { ExecutionAgent } = await import('../apps/api/src/runtime/agent-runner.ts');
  const attempt = randomUUID(), privateDir = await mkdtemp(join(tmpdir(), `qa-project-controls-${attempt}-`));
  await chmod(privateDir, 0o700);
  const reportDir = join(root, 'artifacts/project-acceptance', attempt);
  await mkdir(reportDir, { recursive: true, mode: 0o700 }); await chmod(reportDir, 0o700);
  process.env.HOME = privateDir; process.env.USERPROFILE = privateDir;
  const outcomes = [], blockedOrigins = [], pageErrors = [], httpErrors = [], cleanupErrors = [];
  let fixture, agent, browser, context, page, base = '', projectId = '', taskId = '', machineId = '', activeCase = 'bootstrap', cookie = '', runsSeen = 0;
  const startAt = Date.now();
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  const sanitizedError = error => String(error?.message ?? error).replaceAll(base, '[isolated-origin]').replace(/jarvis_session=[^;\s]+/gi, 'jarvis_session=[redacted]').replace(/(?:\/tmp\/|\/home\/)[^\s]*/g, '[private-path]').slice(0, 350);
  const check = async (name, fn) => { activeCase = name; await fn(); outcomes.push({ name, result: 'pass' }); console.log(`PASS ${name}`); };
  const safeShot = async name => {
    if (!page) return;
    const raw = join(privateDir, `${name}.png`);
    await page.screenshot({ path: raw, fullPage: true });
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('ffmpeg', ['-loglevel','error','-y','-i',raw,'-vf','scale=24:36:flags=area,scale=960:1440:flags=neighbor','-q:v','7',join(reportDir,name)], { shell: false, timeout: 10_000 });
    await rm(raw, { force: true });
    if (result.status !== 0) throw new Error('SANITIZED_SCREENSHOT_FAILED');
  };
  const originalFetch = globalThis.fetch;
  try {
    const pi = { initialize: async()=>{}, dispose: async()=>{}, abort: async()=>{}, health:()=>({configured:true}), run: async()=>({status:'complete',text:'{"action":"wait_user","directive":"","reason":"isolated control test","selectedOption":null,"criteria":[],"experienceReferences":[]}'}) };
    const privateData = join(privateDir, 'platform-data');
    fixture = await startIsolatedProjectApp({ dataDir: privateData, webDir: join(root,'apps/web/dist'), pi });
    base = fixture.baseUrl;
    assert.equal(new URL(base).hostname, '127.0.0.1');
    assert(![3140,3141,3142,43140,45173].includes(Number(new URL(base).port)), 'must not use production or dev ports');
    globalThis.fetch = (input, options) => { const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); if (u.origin !== base) { blockedOrigins.push(u.origin); throw new Error('EXTERNAL_FETCH_FORBIDDEN'); } return originalFetch(input, options); };
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === base) return route.continue(); blockedOrigins.push(new URL(route.request().url()).origin); return route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', error => pageErrors.push(String(error.message).slice(0,200)));
    page.on('response', response => { if (response.status() >= 500) httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
    let lastReadAt = 0;
    const api = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
      const now = Date.now();
      if (method === 'GET' && now - lastReadAt < 700) await new Promise(resolveDelay => setTimeout(resolveDelay, 700 - (now - lastReadAt)));
      if (method === 'GET') lastReadAt = Date.now();
      const response = await originalFetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type':'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.status === 429) { const retry = Number(response.headers.get('retry-after')); if (method !== 'GET' || !Number.isFinite(retry) || retry < 0 || retry > 65) return { response, value: {} }; await new Promise(resolveDelay => setTimeout(resolveDelay, (retry + 1) * 1000)); const second = await originalFetch(base + path, { method, headers: { Cookie: cookie } }); return { response: second, value: await second.json().catch(() => ({})) }; }
      return { response, value: await response.json().catch(() => ({})) };
    };
    const invoke = async (domain, command, payload) => {
      const { response, value } = await api(`/api/v1/${domain}/commands/${command}`, { commandId: randomUUID(), expectedVersion: 0, scope: 'personal', payload });
      assert.equal(response.status, 200, `${domain}/${command} returned ${response.status}`); return value.data;
    };
    const state = async () => {
      const { response, value } = await api(`/api/v1/projects/${projectId}/supervisor`);
      assert.equal(response.status, 200, `supervisor read ${response.status}`); return value.data;
    };
    const until = async (label, predicate, timeout = 12_000) => {
      const end = Date.now() + timeout; let latest;
      while (Date.now() < end) { latest = await state(); if (predicate(latest)) return latest; await new Promise(resolveDelay => setTimeout(resolveDelay, 900)); }
      throw new Error(`WAIT_TIMEOUT:${label}:${JSON.stringify({ status: latest?.session?.status, enabled: latest?.session?.enabled, stop: latest?.stop?.state, run: latest?.session?.runId })}`);
    };
    await check('isolated-login-and-private-project-fixture', async () => {
      await page.goto(base + '/?mode=platform#theme=stark&view=projects');
      const password = `Controls-${randomUUID()}`;
      await page.getByLabel('管理密码',{exact:true}).fill(password); await page.getByLabel('确认密码',{exact:true}).fill(password);
      await page.getByRole('button',{name:'创建账户',exact:true}).click();
      await page.getByRole('heading',{name:'项目',exact:true,level:2}).waitFor();
      const sessionCookie = (await context.cookies(base)).find(item => item.name === 'jarvis_session'); assert(sessionCookie); cookie = `jarvis_session=${sessionCookie.value}`;
      const machine = await invoke('machines','register',{name:'controls browser fixture',role:'development',category:'workstation',ram:16,always:false,readOnly:false}); machineId = machine.id;
      const workspaceRoot = join(privateDir,'workspace-root'), workspace = join(workspaceRoot,'project'); await mkdir(workspace,{recursive:true});
      const project = await invoke('projects','register',{name:'Synthetic controls acceptance',description:'Synthetic isolated browser control test',goal:'Verify owner controls and signed stop lifecycle',milestones:['control lifecycle'],copies:[{machineId,path:workspace,environment:'development',branch:'fixture'}]}); projectId = project.id;
      const task = await invoke('tasks','create',{title:'Synthetic long-running local CLI',projectId,machineId,agent:'controls-cli',mode:'managed',goal:'Wait for explicit control',criteria:'signed termination proof',budget:10,retryLimit:0,worktree:workspace}); taskId = task.id;
      const cli = join(privateDir,'long-lived-fake-cli.cjs');
      await writeFile(cli, `const fs=require('node:fs');const n=fs.existsSync('invocations')?Number(fs.readFileSync('invocations','utf8'))+1:1;fs.writeFileSync('invocations',String(n));const id='fixture-native-'+n;console.log(JSON.stringify({type:'system',subtype:'init',session_id:id,claude_code_version:'2.1.296'}));fs.writeFileSync('child-active',JSON.stringify({pid:process.pid,n}));fs.writeFileSync('cli-args-'+n,JSON.stringify(process.argv.slice(2)));setInterval(()=>{},1000);`, { flag:'wx', mode:0o600 });
      const template = {id:'controls-cli',machineId,engine:'claude',program:process.execPath,args:[cli,'--print','{prompt}','--output-format','stream-json'],workspaceRoot,maxRounds:1,timeoutSec:90,leaseSec:30,budgetCurrency:'USD',purpose:'project-supervisor',supervision:{billing:'record-only',maxTokens:1000,maxRecoveryAttempts:0,retryDelaySec:60,repairValidation:false,fallbackExecutorIds:[]}};
      assert.equal((await api('/api/v1/execution/config',{expectedVersion:0,templates:[template],probes:[],wol:[]},'PUT')).response.status,200);
      const ticket = await api('/api/v1/execution/tickets',{machineId,capabilities:[template.id]}); assert.equal(ticket.response.status,200);
      const { response } = await api(`/api/v1/projects/${projectId}/supervisor`,{commandId:randomUUID(),expectedVersion:0,goal:'Verify owner control lifecycle',criteria:['real button request uses CAS and disables authorization','signed local child termination proof precedes explicit new native session'],machineId,executor:'claude-code',workspace,taskId}); assert.equal(response.status,200);
      agent = new ExecutionAgent({apiUrl:base,machineId,pairingTicket:ticket.value.data.ticket,workspaceRoots:[workspaceRoot],templates:[template],deliveryDirectory:join(privateDir,'agent-private-journal')}); await agent.pair(); await agent.heartbeat();
      await page.goto(`${base}/?mode=platform#${new URLSearchParams({theme:'stark',view:`projects/${projectId}`})}`);
      // API fixture seeding does not mutate the already mounted LiveProvider snapshot.
      await page.reload();
      await page.getByRole('heading',{name:'Synthetic controls acceptance',exact:true}).waitFor();
    });
    const launch = async () => {
      const { response, value } = await api(`/api/v1/projects/${projectId}/supervisor/commands`,{commandId:randomUUID(),expectedVersion:(await state()).session.revision,action:'start',authorizeContinuous:true,acknowledgeUnknownHistory:true,maxParentTokens:1000});
      assert.equal(response.status,200,`start ${response.status}`); const launched = value.data;
      for (let i=0;i<10 && fixture.runtime.execution.listRuns().length < runsSeen+1;i++) { await fixture.runtime.projectSupervisor.pump(); await new Promise(resolveDelay=>setTimeout(resolveDelay,100)); }
      assert.equal(fixture.runtime.execution.listRuns().length,runsSeen+1,'exactly one local execution run'); runsSeen++;
      const runId = (await until('running',x=>x.session.status==='running'&&x.session.runId)).session.runId;
      const delivery = agent.runOnce();
      const activeFile = join(privateDir,'workspace-root','project','child-active');
      const deadline = Date.now()+8000; while(Date.now()<deadline){if(await originalFetch(base+'/api/health').then(r=>r.ok).catch(()=>false)){try{await readFile(activeFile);break;}catch{}} await new Promise(resolveDelay=>setTimeout(resolveDelay,150));}
      await readFile(activeFile); return {runId,delivery,started:launched};
    };
    const clickAndConfirm = async (label, action, expectedStatus) => {
      const before=(await state()).session;
      const requestSeen=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===`/api/v1/projects/${projectId}/supervisor/commands`&&request.postDataJSON()?.action===action);
      const responseSeen=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/v1/projects/${projectId}/supervisor/commands`&&response.request().postDataJSON()?.action===action);
      const button=page.getByRole('button',{name:label,exact:true});await button.click();
      const [sent,response]=await Promise.all([requestSeen,responseSeen]);assert.equal(sent.postDataJSON().expectedVersion,before.revision);assert.match(sent.postDataJSON().commandId,/^[a-f0-9-]{36}$/);assert.equal(response.status(),200);
      const changed=await until(`${label} HTTP/CAS`,x=>x.session.status===expectedStatus&&!x.session.enabled);
      assert.equal(changed.session.enabled,false,`${label} must revoke session authorization`);
      assert.equal(changed.session.revision,before.revision+1); return changed;
    };
    await check('pause-button-real-http-CAS-disables-session-and-signed-proof', async()=>{
      const run=await launch();await page.getByRole('button',{name:'暂停推进',exact:true}).waitFor();
      await clickAndConfirm('暂停推进','pause','paused');
      await agent.heartbeat();
      const limit=Date.now()+10_000; while(Date.now()<limit&&!fixture.runtime.execution.getRun(run.runId)?.result){await agent.runOnce();await new Promise(resolveDelay=>setTimeout(resolveDelay,180));}
      await run.delivery;
      const stopped=fixture.runtime.execution.getRun(run.runId); assert.equal(stopped?.status,'cancelled');
      assert.equal(stopped?.result?.source,'signed-agent'); assert.equal(stopped?.result?.stopConfirmation?.source,'bound-signed-agent');
      assert.equal(stopped?.result?.terminationProof?.childExitObserved,true); assert.equal(stopped?.result?.terminationProof?.stdioClosed,true); assert.equal(stopped?.result?.terminationProof?.groupEmpty,true);
      const confirmed=await until('signed stop proof recorded',x=>x.stop.confirmed); assert.equal(confirmed.stop.sourceRunId,run.runId);
      await safeShot('paused-controls-synthetic.png');
    });
    await check('new-session-is-explicit-recovery-contract-after-signed-stop', async()=>{
      const before=(await state()).session; assert.equal(before.status,'paused'); assert.equal(before.enabled,false);
      const {response,value}=await api(`/api/v1/projects/${projectId}/supervisor/commands`,{commandId:randomUUID(),expectedVersion:before.revision,action:'new_session',directive:'Synthetic handoff: prior child termination proof verified; retain same task history.',authorizeContinuous:true,acknowledgeUnknownHistory:true,maxParentTokens:1000});
      assert.equal(response.status,200,`new_session requires explicit handoff plus fresh authorization: ${response.status}`);
      for(let i=0;i<10&&fixture.runtime.execution.listRuns().length<runsSeen+1;i++){await fixture.runtime.projectSupervisor.pump();await new Promise(resolveDelay=>setTimeout(resolveDelay,100));}
      assert.equal(fixture.runtime.execution.listRuns().length,runsSeen+1); runsSeen++;
      const fresh=await until('new session dispatched',x=>x.session.status==='running'&&x.session.runId&&x.session.runId!==before.runId);
      const delivery=agent.runOnce(); const activeFile=join(privateDir,'workspace-root','project','child-active');
      const deadline=Date.now()+8000;while(Date.now()<deadline){try{const v=JSON.parse(await readFile(activeFile,'utf8'));if(v.n===2)break;}catch{}await new Promise(resolveDelay=>setTimeout(resolveDelay,150));}
      const active=JSON.parse(await readFile(activeFile,'utf8')); assert.equal(active.n,2);
      const args=JSON.parse(await readFile(join(privateDir,'workspace-root','project','cli-args-2'),'utf8')); assert.equal(args.includes('--resume'),false,'new_session must not resume old native session');
      const task=fixture.runtime.v1.read('tasks',taskId,'server-admin'); assert(task); assert.equal(task.executionRequest.id,fresh.session.runId);
      await safeShot('new-session-controls-synthetic.png');
      const stopView=await state(); const stoppedRun=fresh.session.runId;
      const controls=page.locator('.workbench-more-controls');if(!await controls.evaluate(node=>node.open))await controls.locator('summary').click();
      await clickAndConfirm('停止','stop','stopped');
      await agent.heartbeat(); const stopLimit=Date.now()+10_000;while(Date.now()<stopLimit&&!fixture.runtime.execution.getRun(stoppedRun)?.result){await agent.runOnce();await new Promise(resolveDelay=>setTimeout(resolveDelay,180));}
      await delivery; const secondProof=fixture.runtime.execution.getRun(stoppedRun)?.result?.terminationProof; assert.equal(secondProof?.groupEmpty,true); assert.equal(secondProof?.childExitObserved,true);
      void stopView;
    });
    await check('takeover-button-real-http-CAS-disables-session',async()=>{
      // Terminal takeover is exercised against the real browser control and its own session CAS.
      const current=await state(); assert.equal(current.session.status,'stopped');
      // Product contract intentionally keeps takeover terminal and non-resumable.
      // Reuse the real visible button only after constructing no additional execution state.
      const takeover=await clickAndConfirm('本人接管','takeover','human_control');
      assert.equal(takeover.session.enabled,false); assert.equal(takeover.session.status,'human_control');
    });
    assert.deepEqual(blockedOrigins,[]); assert.deepEqual(pageErrors,[]); assert.deepEqual(httpErrors,[]);
  } catch(error) {
    outcomes.push({name:activeCase,result:'fail',cause:sanitizedError(error)}); process.exitCode=1;
    console.error(`FAIL ${activeCase}: ${sanitizedError(error)}`); await safeShot('failure-synthetic.png').catch(()=>{});
  } finally {
    const close=async(name,fn)=>{try{await fn?.()}catch(error){cleanupErrors.push({resource:name,error:sanitizedError(error)})}};
    await close('execution-agent',()=>agent?.stop()); await close('browser-context',()=>context?.close()); await close('browser',()=>browser?.close()); await close('isolated-app',()=>fixture?.close()); globalThis.fetch=originalFetch;
    await close('private-runtime-files',()=>rm(privateDir,{recursive:true,force:true}));
    const report={schemaVersion:1,attempt,passed:outcomes.every(item=>item.result==='pass')&&cleanupErrors.length===0,scope:'single real Chromium session; ephemeral loopback createApp/SQLite; actual HTTP UI controls with CAS; paired local ExecutionAgent and long-lived synthetic Node CLI; no model provider, no factory, no production',elapsedMs:Date.now()-startAt,results:outcomes,runCount:runsSeen,externalModelProviderCalls:0,externalBrowserOriginsBlocked:blockedOrigins.length,pageErrors,httpErrors,cleanupErrors,cleanupComplete:!!fixture&&cleanupErrors.length===0,productionAccess:false,privateJournalOrWorkspacePublished:false,visualAcceptance:'not performed; screenshot is pixelated privacy aid, not visual evidence',publicData:'synthetic identifiers only'};
    await writeFile(join(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600}); console.log(JSON.stringify(report,null,2));
  }
}
