/** Actual exported writer body with controlled filesystem doubles; no product run. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { posix } from 'node:path';
const { dirname, basename, join } = posix; // Production collector is Linux-only.
const source = await readFile(new URL('./project-autonomy-fa01-collector.mjs', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export async function writeTrustedPackageManifest'), source.indexOf('\nconst env ='));
assert.ok(body.startsWith('export async function writeTrustedPackageManifest'));
const constants = { O_RDONLY: 0, O_DIRECTORY: 65536, O_WRONLY: 1, O_NOFOLLOW: 131072, O_NONBLOCK: 2048 };
function fixture(overrides = {}, failure) {
  const calls = [];
  const file = Object.fromEntries(['truncate', 'writeFile', 'chmod', 'sync', 'close'].map(name => [name, async (...args) => {
    calls.push([name, ...args]); if (failure === name) throw Object.assign(Error('DUMMY_IO_FAILED'), { code: 'EIO' });
  }]));
  file.stat = async () => ({ isFile: () => true, nlink: 1, uid: 0, gid: 0, ...overrides });
  const directory = { fd: 73, stat: async () => ({ isDirectory: () => true, uid: 1000, gid: 0 }), close: async () => { calls.push(['directoryClose']); } };
  const open = async (...args) => { calls.push(['open', ...args]);
    if (args[0] === '/dummy') {
      if (failure === 'parent-open') throw Object.assign(Error('DUMMY_OPEN_FAILED'), { code: 'ELOOP' });
      return directory;
    }
    if (failure === 'open') throw Object.assign(Error('DUMMY_OPEN_FAILED'), { code: 'ELOOP' }); return file;
  };
  const writer = vm.runInNewContext('(' + body.replace(/^export /, '') + ')', {
    constants, open, dirname, basename, join, need: (value, code) => { if (!value) throw Error(code); },
  });
  return { calls, writer };
}
test('trusted manifest writes only through one checked existing FD and syncs readable package bytes', async () => {
  const { calls, writer } = fixture();
  await writer('/dummy/jarvis-package-manifest.json', 'dummy-json');
  assert.deepEqual(calls, [['open', '/dummy', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW],
    ['open', '/proc/self/fd/73/jarvis-package-manifest.json', constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK],
    ['truncate', 0], ['writeFile', 'dummy-json', 'utf8'], ['chmod', 0o644], ['sync'], ['close'], ['directoryClose']]);
});
for (const [name, overrides] of [
  ['candidate owned replacement', { uid: 1000 }], ['wrong group', { gid: 1000 }],
  ['root hardlink', { nlink: 2 }], ['unlinked descriptor', { nlink: 0 }],
  ['nonregular entry', { isFile: () => false }],
]) test(name + ' is rejected before truncate/write/chmod and FD always closes', async () => {
  const { calls, writer } = fixture(overrides);
  await assert.rejects(writer('/dummy/jarvis-package-manifest.json', 'dummy'), /PACKAGE_MANIFEST_FILE_UNTRUSTED/);
  assert.deepEqual(calls.map(call => call[0]), ['open', 'open', 'close', 'directoryClose']);
});
test('nofollow open failure does not create, truncate or retry by pathname', async () => {
  const { calls, writer } = fixture({}, 'open');
  await assert.rejects(writer('/dummy/jarvis-package-manifest.json', 'dummy'), error => error.code === 'ELOOP');
  assert.deepEqual(calls.map(call => call[0]), ['open', 'open', 'directoryClose']);
});
test('source-parent symlink is rejected with no file opened or written', async () => {
  const { calls, writer } = fixture({}, 'parent-open');
  await assert.rejects(writer('/dummy/jarvis-package-manifest.json', 'dummy'), error => error.code === 'ELOOP');
  assert.deepEqual(calls.map(call => call[0]), ['open']);
});
test('write failure closes the checked FD and never claims package completion', async () => {
  const { calls, writer } = fixture({}, 'writeFile');
  await assert.rejects(writer('/dummy/jarvis-package-manifest.json', 'dummy'), error => error.code === 'EIO');
  assert.deepEqual(calls.map(call => call[0]), ['open', 'open', 'truncate', 'writeFile', 'close', 'directoryClose']);
});
