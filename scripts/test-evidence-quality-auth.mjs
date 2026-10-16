import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// One new harness preparation check only. No quality cases or provider calls.
test('compiled quality harness selects the real member cookie after the cleared admin cookie and verifies the current principal', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url)), script = fileURLToPath(new URL('./qa-evidence-assistant-quality.ts', import.meta.url));
  const {stdout, stderr} = await promisify(execFile)(process.execPath, [script, '--compiled', '--auth-check-only', '--attempt=5', '--release-root=' + root], {cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024});
  assert.equal(stderr, '');
  const result = JSON.parse(stdout.trim()); assert.equal(result.status, 'passed'); assert.equal(result.actualModelCalls, 0); assert.equal(result.cleanupVerified, true);
  const bytes = await readFile(new URL('../artifacts/evidence-assistant-quality-r35/auth-check-5.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), result.sha256);
  const report = JSON.parse(bytes.toString()); assert.equal(report.realLoopbackHttp, true); assert.equal(report.actualModelCalls, 0); assert.equal(report.outsideRequests, 0); assert.equal(report.productionAccess, false);
  assert.deepEqual(report.checks, {administratorSetupAndState: true, memberLoginAndState: true, namedMemberCookieResolvesCurrentPrincipal: true, clearAdministratorCookiePrecedesMember: true});
});
