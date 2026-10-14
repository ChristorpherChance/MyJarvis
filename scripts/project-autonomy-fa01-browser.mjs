/** Fixed browser smoke; the coordinator runs this only as UID 1000 offline. */
import { createRequire } from 'node:module';
const URL = 'http://127.0.0.1:18930';
const RUN = /^(?:[a-f0-9]{40}|[a-f0-9-]{36})$/;
async function main() {
  if (process.getuid?.() !== 1000 || !RUN.test(process.env.JARVIS_AUTONOMY_RUN_ID ?? '') || !process.env.JARVIS_VALIDATION_COOKIE) throw Error('BROWSER_SCOPE_INVALID');
  const require = createRequire('/opt/test-tools/package.json');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let errors = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => route.request().url().startsWith(URL + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', () => errors++);
    const login = await page.goto(URL + '/projects', { waitUntil: 'networkidle', timeout: 30000 });
    if (login?.status() !== 200) throw Error('BROWSER_HTTP_FAILED');
    await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 15000 });
    await context.addCookies([{ name: 'msf_auth', value: process.env.JARVIS_VALIDATION_COOKIE, url: URL, httpOnly: true, sameSite: 'Lax' }]);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15000 });
    if (!(await page.locator('body').innerText()).includes('项目')) throw Error('BROWSER_PROJECTS_CONTENT_MISSING');
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    const tasks = await page.goto(URL + '/tasks', { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15000 });
    if (tasks?.status() !== 200 || errors !== 0) throw Error('BROWSER_RENDER_FAILED');
    process.stdout.write(JSON.stringify({ ok: true, checks: ['login-page', 'authenticated-projects', 'authenticated-tasks', 'no-page-errors'], screenshotBase64: screenshot.toString('base64') }) + '\n');
  } finally { await browser.close(); }
}
main().catch(error => { process.stdout.write(JSON.stringify({ ok: false, errorCode: /^[A-Z_]+$/.test(error.message) ? error.message : 'BROWSER_CHECK_FAILED' }) + '\n'); process.exitCode = 1; });
