const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/prototype-v8-independent-effects');
const checks = [], errors = [];
function check(name, value, detail) { checks.push({ name, passed: !!value, ...(detail === undefined ? {} : { detail }) }); if (!value) throw new Error(name + ' ' + JSON.stringify(detail)); }
(async () => {
  const file = path.join(root, '贾维斯V8.0 · 四套电影灵感与对话特效原型.html');
  const bytes = (await fs.stat(file)).size;
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  try {
    await p.goto(pathToFileURL(file).href + '#theme=jaeger&view=chat');
    for (const theme of ['stark', 'matrix', 'hero', 'jaeger']) {
      await p.evaluate(t => { J7.apply(t); handleAction('v5-vm-mode', 'general'); }, theme);
      const rects = await p.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
        return { demo: rect('.j8-demo-shortcut'), listen: rect('[data-act="v5-vm-listen"]'), stop: rect('[data-act="v5-vm-interrupt"]'), input: rect('#vm5-input'), width: document.documentElement.scrollWidth };
      });
      check(theme + ' final mobile primary controls', rects.demo.bottom <= 812 && rects.listen.bottom <= 812 && rects.stop.bottom <= 812 && rects.width <= 375, rects);
      if (theme === 'jaeger') await p.screenshot({ path: path.join(out, 'jaeger-mobile-final.png') });
    }
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.evaluate(() => { handleAction('v5-vm-unknown'); handleAction('v5-vm-mode', 'progress'); handleAction('v5-vm-sample', '查看贾维斯项目进度'); });
    await p.waitForFunction(() => U.vm5.phase === 'awaiting');
    await p.waitForTimeout(300);
    let frames = await p.evaluate(() => J7Effects.state.frames); await p.waitForTimeout(350);
    check('Awaiting stops public effect RAF', await p.evaluate(n => J7Effects.state.frames === n, frames));
    await p.evaluate(() => handleAction('v5-vm-interrupt')); await p.waitForTimeout(200);
    frames = await p.evaluate(() => J7Effects.state.frames); await p.waitForTimeout(350);
    check('Interrupted stops public effect RAF', await p.evaluate(n => J7Effects.state.frames === n, frames));
    await p.evaluate(() => { handleAction('v5-vm-identify', 'me'); handleAction('v5-vm-mode', 'general'); J7Effects.start(); });
    await p.waitForTimeout(500);
    frames = await p.evaluate(() => J7Effects.state.frames); await p.waitForTimeout(200);
    check('Listening restarts the public effect RAF', await p.evaluate(n => J7Effects.state.frames > n, frames));
    await p.evaluate(() => { handleAction('v5-vm-interrupt'); handleAction('v5-vm-mode', 'general'); });
    const life = await p.evaluate(() => {
      for (let i = 0; i < 12; i++) J7.apply(['stark', 'matrix', 'hero', 'jaeger'][i % 4]);
      const c = document.querySelector('.j8-signal-field');
      return { outstanding: J7Effects.state.mounted - J7Effects.state.disposed, fields: document.querySelectorAll('.j8-signal-field').length, waves: document.querySelectorAll('.j8-waveform').length, dpr: c.width / c.parentElement.getBoundingClientRect().width };
    });
    check('Final theme cleanup and DPR cap', life.outstanding === 1 && life.fields === 1 && life.waves === 1 && life.dpr <= 2.01, life);
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200);
    frames = await p.evaluate(() => J7Effects.state.frames); await p.waitForTimeout(300);
    check('Final reduced motion stops public RAF', await p.evaluate(n => J7Effects.state.frames === n, frames));
    await p.emulateMedia({ reducedMotion: 'no-preference' }); await p.waitForTimeout(200);
    await p.evaluate(() => { document.querySelector('.vm5-stage .j7-core-holder').style.transform = 'translateY(4000px)'; });
    await p.waitForTimeout(300); frames = await p.evaluate(() => J7Effects.state.frames); await p.waitForTimeout(300);
    check('Final offscreen stops public RAF', await p.evaluate(n => J7Effects.state.frames === n, frames));
    await p.evaluate(() => { document.querySelector('.vm5-stage .j7-core-holder').style.transform = ''; });
    await p.waitForTimeout(200);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(200); frames = await p.evaluate(() => J7Effects.state.frames); await p.waitForTimeout(300);
    check('Visibility handler stops RAF when hidden (property simulated)', await p.evaluate(n => J7Effects.state.frames === n, frames));
    await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    check('Final page has no script errors', errors.length === 0, errors);
  } finally {
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, 'final-visual-effects-report.json'), JSON.stringify({ bytes, checks, errors }, null, 2), 'utf8');
    await b.close();
  }
  console.log(JSON.stringify({ bytes, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed), errors }));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
