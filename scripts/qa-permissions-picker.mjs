import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { permissionPlan, renderPermissionInstaller, PROFILES, permissionConnectionInventory } from './server-permissions.mjs';
import { parseInventory } from './server-access.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = resolve('artifacts/server-permissions-qa'), errors = [], externalRequests = [], checks = [];
await mkdir(join(out, 'downloads'), { recursive: true });
const inventory = JSON.parse(await readFile('config/servers.example.json', 'utf8'));
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  await page.goto(pathToFileURL(resolve('docs/服务器权限选择与授权.html')).href);
  await page.waitForFunction(() => document.getElementById('perm-script').textContent.includes('target_user='));
  const expected = async server => {
    const user = await page.locator('#perm-user').inputValue();
    const selected = await page.locator('[data-profile][aria-checked=true]').getAttribute('data-profile');
    const unit = selected === 'operator' ? await page.locator('#perm-unit').inputValue() : 'jarvis-platform.service';
    return renderPermissionInstaller(server, permissionPlan({ user, profile: selected, unit }));
  };
  for (const server of inventory.servers) {
    await page.locator('#perm-server').selectOption(server.id);
    for (const profile of PROFILES) {
      await page.locator(`[data-profile="${profile.id}"]`).click();
      await page.locator('#perm-dedicated').click();
      assert.equal(await page.locator('#perm-script').textContent(), await expected(server));
      assert.equal(await page.locator('#perm-download').isEnabled(), true);
      checks.push({ kind: 'selection-and-exact-renderer', server: server.id, profile: profile.id });
    }
  }
  const server = inventory.servers.find(row => row.id === '112');
  await page.locator('#perm-server').selectOption(server.id);
  for (const profile of PROFILES) {
    await page.locator(`[data-profile="${profile.id}"]`).click();
    await page.locator('#perm-dedicated').click();
    const user = await page.locator('#perm-user').inputValue();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#perm-download').click();
    const download = await downloadEvent, filename = `permissions-112-${user}-${profile.id}.sh`;
    assert.equal(download.suggestedFilename(), filename);
    await download.saveAs(join(out, 'downloads', filename));
    assert.equal(await readFile(join(out, 'downloads', filename), 'utf8'), await expected(server));
    checks.push({ kind: 'actual-download', profile: profile.id });
  }
  for (const profile of ['login', 'diagnostics', 'operator', 'admin-password']) {
    await page.locator(`[data-profile="${profile}"]`).click();
    await page.locator('#perm-existing').click();
    assert.match(await page.locator('#perm-notice').textContent(), /不撤销旧授权/);
    checks.push({ kind: 'existing-root-is-not-downgraded', profile });
  }
  await page.locator('#perm-user').fill('root'); assert.equal(await page.locator('#perm-download').isDisabled(), true);
  await page.locator('#perm-user').fill('bad;whoami'); assert.equal(await page.locator('#perm-download').isDisabled(), true);
  await page.locator('[data-profile="operator"]').click(); await page.locator('#perm-dedicated').click();
  await page.locator('#perm-unit').fill('../ssh.service'); assert.equal(await page.locator('#perm-download').isDisabled(), true);
  await page.locator('[data-profile="login"]').click(); assert.equal(await page.locator('#perm-download').isEnabled(), true);
  checks.push({ kind: 'invalid-input-and-unused-service' });
  await page.locator('[data-profile="operator"]').click(); await page.locator('#perm-unit').fill('jarvis-platform.service');
  await page.locator('#perm-dedicated').click();
  assert.match(await page.locator('#perm-apply').textContent(), /--create-user/);
  await page.locator('#perm-create').uncheck(); assert(!String(await page.locator('#perm-apply').textContent()).includes('--create-user'));
  await page.locator('#perm-create').check();
  await page.locator('.permission-picker').screenshot({ path: join(out, 'picker-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.locator('.permission-picker').screenshot({ path: join(out, 'picker-mobile.png') });
  checks.push({ kind: 'account-creation-choice-and-mobile-layout' });
  console.log('Existing server selection and download checks passed.');

  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.locator('#perm-custom').isVisible(), false);
  await page.locator('#perm-server').selectOption('custom');
  assert.equal(await page.locator('#perm-custom').isVisible(), true);
  assert.equal(await page.locator('#perm-download').isDisabled(), true);
  checks.push({ kind: 'manual-form-required-fields' });
  const manual = { id: 'i3-backup', host: '192.168.10.120', port: 2222, hostname: 'i3-study-fixture', user: 'ubuntu', fingerprint: 'SHA256:' + 'a'.repeat(43) };
  await page.locator('#perm-host').fill(manual.host);
  await page.locator('#perm-port').fill(String(manual.port));
  await page.locator('#perm-hostname').fill(manual.hostname);
  await page.locator('#perm-admin').fill(manual.user);
  await page.locator('#perm-dedicated').click();
  assert.equal(await page.locator('#perm-download').isEnabled(), true);
  assert.equal(await page.locator('#perm-inventory').isDisabled(), true);
  assert.match(await page.locator('#perm-snapshot').textContent(), /尚未核验/);
  checks.push({ kind: 'permissions-available-without-untrusted-ssh-inventory' });
  for (const profile of PROFILES) {
    await page.locator(`[data-profile="${profile.id}"]`).click();
    await page.locator('#perm-dedicated').click();
    assert.equal(await page.locator('#perm-script').textContent(), await expected(manual));
    checks.push({ kind: 'manual-exact-renderer', profile: profile.id });
  }
  await page.locator('[data-profile="operator"]').click(); await page.locator('#perm-dedicated').click();
  const manualDownloadEvent = page.waitForEvent('download');
  await page.locator('#perm-download').click();
  const manualDownload = await manualDownloadEvent;
  assert.equal(manualDownload.suggestedFilename(), 'permissions-i3-backup-jarvis-ops-operator.sh');
  await manualDownload.saveAs(join(out, 'downloads', manualDownload.suggestedFilename()));
  assert.equal(await readFile(join(out, 'downloads', manualDownload.suggestedFilename()), 'utf8'), await expected(manual));
  checks.push({ kind: 'manual-permission-download' });
  await page.locator('#perm-fingerprint').fill(manual.fingerprint);
  assert.equal(await page.locator('#perm-inventory').isEnabled(), true);
  const inventoryDownloadEvent = page.waitForEvent('download'); await page.locator('#perm-inventory').click();
  const inventoryDownload = await inventoryDownloadEvent;
  assert.equal(inventoryDownload.suggestedFilename(), 'servers-i3-backup-jarvis-ops.json');
  await inventoryDownload.saveAs(join(out, 'downloads', inventoryDownload.suggestedFilename()));
  const downloadedInventory = JSON.parse(await readFile(join(out, 'downloads', inventoryDownload.suggestedFilename()), 'utf8'));
  assert.deepEqual(downloadedInventory, permissionConnectionInventory(manual, 'jarvis-ops'));
  assert.equal(parseInventory(downloadedInventory)[0].user, 'jarvis-ops');
  assert.match(await page.locator('#perm-access').textContent(), /--identity-dir ~\/.ssh\/jarvis-ops/);
  assert.match(await page.locator('#perm-node').textContent(), /--inventory servers-i3-backup-jarvis-ops.json/);
  checks.push({ kind: 'manual-ssh-inventory-and-new-computer-instructions' });
  console.log('Manual server scripts and connection inventory downloads passed.');
  for (const [id, value, restore] of [
    ['perm-id', '../outside', manual.id], ['perm-host', 'http://192.168.10.120', manual.host],
    ['perm-port', '65536', String(manual.port)], ['perm-hostname', '', manual.hostname],
    ['perm-admin', 'root', manual.user], ['perm-fingerprint', 'SHA256:fake', manual.fingerprint]
  ]) {
    await page.locator('#' + id).fill(value);
    assert.equal(await page.locator('#perm-download').isDisabled(), true);
    assert.equal(await page.locator('#perm-inventory').isDisabled(), true);
    assert.equal(await page.locator('#perm-script').textContent(), '');
    await page.locator('#' + id).fill(restore);
    assert.equal(await page.locator('#perm-download').isEnabled(), true);
    checks.push({ kind: 'manual-invalid-field-blocked', field: id });
  }
  await page.locator('#perm-id').fill('112'); await page.locator('#perm-existing').click();
  assert.equal(await page.locator('#perm-user').inputValue(), manual.user);
  assert.equal(await page.locator('#perm-create').isChecked(), false);
  assert.match(await page.locator('#perm-snapshot').textContent(), /尚未核验/);
  assert(!String(await page.locator('#perm-snapshot').textContent()).includes('已有完整'));
  checks.push({ kind: 'manual-existing-account-and-no-stale-audit-by-id' });
  await page.locator('#perm-id').fill(manual.id); await page.locator('#perm-dedicated').click();
  await page.locator('#perm-host').fill('2001:db8::10');
  assert.equal(await page.locator('#perm-download').isEnabled(), true);
  await page.locator('#perm-host').fill('i3-study.home');
  assert.equal(await page.locator('#perm-download').isEnabled(), true);
  await page.locator('#perm-host').fill(manual.host);
  checks.push({ kind: 'manual-ipv6-and-domain' });
  await page.locator('.perm-guide').evaluate(element => { element.open = false; });
  await page.locator('.permission-picker').screenshot({ path: join(out, 'picker-manual-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.locator('.permission-picker').screenshot({ path: join(out, 'picker-manual-mobile.png') });
  checks.push({ kind: 'manual-mobile-layout' });
  await page.locator('#perm-server').selectOption('112');
  assert.equal(await page.locator('#perm-custom').isVisible(), false);
  assert.match(await page.locator('#perm-snapshot').textContent(), /已有完整免密sudo/);
  checks.push({ kind: 'return-to-known-server' });
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  await writeFile(join(out, 'picker-ui.json'), JSON.stringify({ status: 'passed', at: new Date().toISOString(), checks, jsErrors: errors, externalRequests, serverPermissionChanges: 0 }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, jsErrors: errors.length, externalRequests: externalRequests.length, serverPermissionChanges: 0 }));
} finally { await browser.close(); }
