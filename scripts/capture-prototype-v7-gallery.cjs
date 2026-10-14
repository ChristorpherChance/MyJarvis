const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'artifacts/prototype-v7-qa');
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const page = await browser.newPage({viewport:{width:1440, height:1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, '贾维斯V7.0 · 三套电影灵感交互原型.html')).href);
    await page.evaluate(() => J7.openCompare());
    await page.locator('.j7-design-card img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({path:path.join(out, 'cinematic-gallery.png')});
    await page.setViewportSize({width:375, height:812});
    await page.screenshot({path:path.join(out, 'cinematic-gallery-mobile.png')});
    await fs.writeFile(path.join(out, 'gallery-errors.json'), JSON.stringify(errors));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Updated embedded previews and gallery captured; no script errors.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
