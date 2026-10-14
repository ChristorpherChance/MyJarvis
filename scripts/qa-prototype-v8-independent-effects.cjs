const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/prototype-v8-independent-effects');
const checks = [], errors = [];
const resume = process.argv.includes('--resume');
const voiceOnly = process.argv.includes('--voice');
function check(name, ok, detail) {
  checks.push({ name, passed: !!ok, ...(detail === undefined ? {} : { detail }) });
  if (!ok) throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail)));
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  if (resume) {
    const prior = JSON.parse(await fs.readFile(path.join(output, 'independent-effects-report.json'), 'utf8'));
    checks.push(...prior.checks.filter(c => c.passed));
  }
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__qaSpeech = { played: [], canceled: 0, last: null };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { window.__qaSpeech.canceled++; },
      getVoices() { return []; },
      speak(utterance) { window.__qaSpeech.played.push(utterance.text); window.__qaSpeech.last = utterance; }
    } });
    class QARecognition {
      constructor() { window.__qaRecognition = this; this.started = false; this.aborted = false; }
      start() { this.started = true; }
      abort() { this.aborted = true; }
      stop() { this.stopped = true; this.onend?.(); }
    }
    window.SpeechRecognition = QARecognition;
  });
  const start = async () => page.locator('.vm5-stage-meta [data-j8-act="demo"]').click();
  const stage = async value => page.waitForFunction(v => J7Effects.state.stage === v, value, { timeout: 20000 });
  const reset = async (mode = 'progress') => page.evaluate(m => {
    J7Effects.cancel(true); U.overlay = null; handleAction('v5-vm-identify', 'me');
    J5.state().terminal = true; navigate('chat'); handleAction('v5-vm-mode', m);
    S.settings.voice = true; S.settings.privacy = false; S.preferences.me.privacy = 'ask'; S.preferences.me.autoSpeak = false;
    S.projects.find(p => p.id === 'p1').progress = 73;
  }, mode);
  try {
    await page.goto(pathToFileURL(path.join(root, '贾维斯V8.0 · 四套电影灵感与对话特效原型.html')).href + '#theme=stark&view=chat');
    if (!resume) {
    check('Four themes and shared effects registered', await page.evaluate(() => J7.designs.length === 4 && ['stark', 'matrix', 'hero', 'jaeger'].every(t => J7Visuals[t]?.mount) && !!J7Effects));

    await reset();
    await page.evaluate(() => { S.preferences.me.autoSpeak = true; S.projects.find(p => p.id === 'p1').progress = 73; window.__beforeMessages = S.chat.me.length; });
    await start();
    check('Complete demo begins with listening', await page.evaluate(() => U.vm5.phase === 'listening' && J7Effects.state.active));
    await page.waitForTimeout(700);
    check('Listening uses a partial transcript', await page.evaluate(() => U.vm5.transcript.length > 0 && U.vm5.transcript !== '贾维斯，查看项目进度。'));
    await stage('processing');
    check('Original response pipeline runs', await page.evaluate(() => U.vm5.phase === 'thinking'));
    await stage('resolved');
    check('Answer reads the shared project state', await page.evaluate(() => U.vm5.answer.includes('73%')));
    check('A single user and assistant message were created', await page.evaluate(() => S.chat.me.length === window.__beforeMessages + 2));
    check('Automatic real speech suppressed without changing preference', await page.evaluate(() => __qaSpeech.played.length === 0 && S.preferences.me.autoSpeak));
    await stage('output');
    check('Simulated response is labeled silent', await page.evaluate(() => U.vm5.phase === 'speaking' && document.querySelector('.vm5-caption small').textContent.includes('无音频')));
    const themeContinuity = await page.evaluate(() => {
      const node = document.getElementById('vm5-input'); node.value = '保留的输入草稿';
      const old = { id: J7Effects.state.id, token: U.vm5.token, playStart: J7Effects.state.playStart, reply: J7Effects.state.reply, stage: J7Effects.state.stage };
      document.querySelector('.j7-film-switch [data-j7-act="apply"][data-id="jaeger"]').click();
      return { old, current: { id: J7Effects.state.id, token: U.vm5.token, playStart: J7Effects.state.playStart, stage: J7Effects.state.stage }, preserved: J7.state.theme === 'jaeger' && J7Effects.state.id === old.id && U.vm5.token === old.token && J7Effects.state.playStart === old.playStart && J7Effects.state.reply === old.reply && J7Effects.state.stage === old.stage && document.getElementById('vm5-input') === node && node.value === '保留的输入草稿' };
    });
    check('Theme change preserves playback and draft node', themeContinuity.preserved, themeContinuity);
    await page.screenshot({ path: path.join(output, 'jaeger-silent-demo-desktop.png') });
    await stage('complete');
    check('Demo completes with full answer and no audio', await page.evaluate(() => !J7Effects.state.active && J7Effects.state.completed && U.vm5.phase === 'answered' && document.querySelector('.vm5-caption p').textContent === U.vm5.answer && __qaSpeech.played.length === 0));
    console.log('complete demo, silent preference guard, theme continuity passed');

    for (const value of ['input', 'processing', 'output']) {
      await reset(); await start(); await stage(value);
      await page.locator('[data-act="v5-vm-interrupt"]').click();
      const messageCount = await page.evaluate(() => S.chat.me.length);
      await page.waitForTimeout(1900);
      check('Interrupt cancels delayed work during ' + value, await page.evaluate(count => U.vm5.phase === 'interrupted' && !J7Effects.state.active && S.chat.me.length === count, messageCount));
    }
    await reset(); await start(); await page.waitForTimeout(500);
    await page.locator('.vm5-modes [data-act="v5-vm-mode"][data-id="life"]').click();
    const modeMessageCount = await page.evaluate(() => S.chat.me.length);
    await page.waitForTimeout(3400);
    check('Changing scene cancels both demo and old send timer', await page.evaluate(count => U.vm5.mode === 'life' && U.vm5.phase === 'ready' && !J7Effects.state.active && S.chat.me.length === count, modeMessageCount));
    }

    if (!voiceOnly) {
    await reset('general'); await start(); await page.waitForTimeout(500);
    await page.locator('#vm5-input').fill('广州天气怎么样？');
    await page.locator('[data-act="v5-vm-send"]').click();
    await page.waitForFunction(() => U.vm5.phase === 'answered');
    await page.waitForTimeout(1000);
    check('A new request replaces the demo without late prior response', await page.evaluate(() => !J7Effects.state.active && U.vm5.answer.includes('天气演示') && !U.vm5.answer.includes('我在')));

    await reset(); await start(); await page.waitForTimeout(500);
    await page.evaluate(() => handleAction('switch-profile', 'wife'));
    await page.waitForTimeout(3400);
    check('Profile switch prevents late demo messages', await page.evaluate(() => S.profile === 'wife' && !J7Effects.state.active && U.vm5.phase === 'ready' && !U.vm5.transcript && !U.vm5.answer));
    await reset(); await start(); await page.waitForTimeout(500);
    await page.evaluate(() => handleAction('v5-vm-unknown'));
    await page.waitForTimeout(3400);
    check('Unknown identity cancels a private demo', await page.evaluate(() => U.vm5.unknown && !J7Effects.state.active && U.vm5.phase === 'ready' && !U.vm5.transcript));
    await page.evaluate(() => handleAction('v5-vm-mode', 'progress'));
    await start();
    await stage('waiting');
    check('Unknown progress demo pauses for identity', await page.evaluate(() => U.vm5.phase === 'awaiting' && !J7Effects.state.active && U.vm5.answer.includes('先确认') && !U.vm5.answer.includes('73%')));
    check('Identity confirmation remains an actual action', await page.locator('.vm5-reply-actions [data-act="v5-vm-identity"]').count() > 0);

    await reset(); await start(); await page.waitForTimeout(500);
    await page.evaluate(() => navigate('tasks'));
    await page.waitForTimeout(3400);
    check('Leaving chat cancels the demo and visual lifecycle', await page.evaluate(() => U.route === 'tasks' && !J7Effects.state.active && J7Effects.state.mounted === J7Effects.state.disposed));
    console.log('interrupt, scene, request, profile, identity and route guards passed');
    }

    await reset();
    await page.locator('[data-act="v5-vm-listen"]').click();
    check('Original microphone choice still opens', await page.locator('[data-act="v5-vm-real-listen"]').isVisible() && await page.locator('[data-act="v5-vm-demo-listen"]').isVisible());
    await page.locator('[data-act="v5-vm-demo-listen"]').click();
    check('Original simulated microphone choice connects to complete effects', await page.evaluate(() => !U.overlay && J7Effects.state.active && J7Effects.state.stage === 'input'));
    await page.locator('[data-act="v5-vm-interrupt"]').click();
    await page.locator('[data-act="v5-vm-listen"]').click();
    await page.locator('[data-act="v5-vm-real-listen"]').click();
    check('Real microphone entry runs the recognition adapter, not the demo', await page.evaluate(() => __qaRecognition.started && U.vm5.recognition === __qaRecognition && U.vm5.phase === 'listening' && !J7Effects.state.active));
    await page.evaluate(() => { const words = [{ transcript: '贾维斯项目进度怎么样？' }]; words.isFinal = true; __qaRecognition.onresult({ results: [words] }); });
    await page.waitForFunction(() => U.vm5.phase === 'answered');
    check('Recognition final text reaches original business response', await page.evaluate(() => U.vm5.answer.includes('73%') && !J7Effects.state.active));
    await page.locator('[data-act="v5-vm-speak"]').click();
    check('Explicit system read uses the real speech API separately', await page.evaluate(() => __qaSpeech.played.length === 1 && __qaSpeech.played[0] === U.vm5.answer && U.vm5.phase === 'speaking' && document.querySelector('.vm5-orb-label p').textContent.includes('系统朗读')));
    await page.evaluate(() => __qaSpeech.last.onend());
    check('Actual read end returns to answered', await page.evaluate(() => U.vm5.phase === 'answered'));
    console.log('microphone choices and explicit system read passed (adapters stubbed, no physical audio)');

    for (const theme of ['stark', 'matrix', 'hero', 'jaeger']) {
      await page.evaluate(t => J7.apply(t), theme);
      await page.setViewportSize({ width: 375, height: 812 });
      const boxes = await page.evaluate(() => {
        const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
        return { demo: rect('.j8-demo-shortcut'), stop: rect('[data-act="v5-vm-interrupt"]'), width: document.documentElement.scrollWidth };
      });
      check(theme + ' mobile demo and stop controls are on first screen', boxes.demo.bottom <= 812 && boxes.stop.bottom <= 812 && boxes.width <= 375, boxes);
      if (theme === 'jaeger') await page.screenshot({ path: path.join(output, 'jaeger-mobile-controls.png') });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const life = await page.evaluate(() => {
      for (let i = 0; i < 12; i++) J7.apply(['stark', 'matrix', 'hero', 'jaeger'][i % 4]);
      const canvas = document.querySelector('.j8-signal-field'), host = canvas.parentElement;
      return { outstanding: J7Effects.state.mounted - J7Effects.state.disposed, fields: document.querySelectorAll('.j8-signal-field').length, waves: document.querySelectorAll('.j8-waveform').length, dpr: canvas.width / host.getBoundingClientRect().width };
    });
    check('Theme switches clean all but one effect instance', life.outstanding === 1 && life.fields === 1 && life.waves === 1 && life.dpr <= 2.01, life);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200);
    const still = await page.evaluate(() => J7Effects.state.frames); await page.waitForTimeout(300);
    check('Reduced motion pauses the canvas loop', await page.evaluate(n => J7Effects.state.frames === n, still));
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(200);
    await page.evaluate(() => { document.querySelector('.vm5-stage .j7-core-holder').style.transform = 'translateY(4000px)'; });
    await page.waitForTimeout(300); const offscreen = await page.evaluate(() => J7Effects.state.frames); await page.waitForTimeout(300);
    check('Offscreen effect pauses its animation loop', await page.evaluate(n => J7Effects.state.frames === n, offscreen));
    check('No browser script errors', errors.length === 0, errors);
  } finally {
    await fs.writeFile(path.join(output, 'independent-effects-report.json'), JSON.stringify({ checks, errors }, null, 2), 'utf8');
    await browser.close();
  }
  console.log(JSON.stringify({ passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed), errors }));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
