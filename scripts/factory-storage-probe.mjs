/** Supplemental HTTP download check. Runs only inside the fixed isolated test network. */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const runId = process.env.JARVIS_FULL_TEST_RUN_ID;
const sourceSHA256 = process.env.JARVIS_SOURCE_SHA256;
const bucket = process.env.MSF_MINIO_BUCKET;
if (
  process.cwd() !== '/work/source' || process.getuid?.() !== 1000 ||
  !/^[0-9a-f]{40}$/.test(runId ?? '') ||
  !/^[0-9a-f]{64}$/.test(sourceSHA256 ?? '') ||
  process.env.MSF_MINIO_ENDPOINT !== 'minio' ||
  process.env.MSF_MINIO_ACCESS_KEY !== 'jarvis_test' ||
  process.env.MSF_MINIO_PORT !== '9000' ||
  !process.env.MSF_MINIO_SECRET_KEY ||
  process.env.MSF_FILES_PROXY === '1' ||
  bucket !== `jarvis-test-${runId}`
) throw Error('ISOLATED_STORAGE_PROBE_REQUIRED');

const sha256 = data => createHash('sha256').update(data).digest('hex');
const content = Buffer.from(`Jarvis isolated storage HTTP probe\n${runId}\n${randomBytes(24).toString('hex')}\n`);
const expectedSHA256 = sha256(content);
const ownedObjectKey = `sha256/${expectedSHA256}`;
const report = {
  formatVersion: 1,
  runId,
  at: new Date().toISOString(),
  sourceSHA256,
  scope: 'Supplemental actual StorageService signed HTTP GET, unique synthetic object in run-specific isolated MinIO bucket. No production object or credentials.',
  modelsInvoked: false,
  sourceCodeChanged: false,
  originalFailedAssertionsUnchanged: true,
  productDeliveryAccepted: false,
  signedURLExported: false,
  objectContentExported: false,
  stages: [],
  signedURL: { scopeValidated: false, pathStyle: null, objectKeySlashEncoding: null },
  download: { attempted: false, httpStatus: null, bytes: null, contentMatches: false },
  cleanup: { attempted: false, ownObjectRemoved: false },
  probePassed: false,
  errors: [],
};
let storage;
let writeAttempted = false;
let currentStage = 'load-current-storage-service';
const stage = (name, ok) => report.stages.push({ name, ok });
const fail = code => { throw Object.assign(Error(code), { probeCode: code }); };
const publicErrors = new Set([
  'EFFECTIVE_STORAGE_CONFIG_OUTSIDE_ISOLATED_SCOPE', 'STORAGE_WRITE_IDENTITY_MISMATCH',
  'SIGNED_URL_OUTSIDE_ISOLATED_SCOPE', 'SIGNED_DOWNLOAD_HTTP_FAILED',
  'SIGNED_DOWNLOAD_CONTENT_TOO_LARGE', 'SIGNED_DOWNLOAD_CONTENT_MISMATCH',
]);

try {
  const { config } = await import(pathToFileURL(join(process.cwd(), 'apps/server/dist/config.js')).href);
  if (
    config.minio.endPoint !== 'minio' || config.minio.port !== 9000 ||
    config.minio.accessKey !== 'jarvis_test' || config.minio.bucket !== bucket ||
    config.minio.secretKey !== process.env.MSF_MINIO_SECRET_KEY
  ) fail('EFFECTIVE_STORAGE_CONFIG_OUTSIDE_ISOLATED_SCOPE');
  const moduleURL = pathToFileURL(join(process.cwd(), 'apps/server/dist/modules/platform/storage.service.js'));
  const { StorageService } = await import(moduleURL.href);
  storage = new StorageService();
  stage(currentStage, true);

  currentStage = 'write-own-synthetic-object';
  writeAttempted = true;
  const stored = await storage.putContentAddressed(content);
  if (stored.objectKey !== ownedObjectKey || stored.size !== content.length) fail('STORAGE_WRITE_IDENTITY_MISMATCH');
  stage(currentStage, true);

  currentStage = 'generate-actual-signed-url';
  // Never store or print the URL: its query includes temporary signature material.
  const signed = await storage.presignedGet(ownedObjectKey, 120);
  const url = new URL(signed);
  if (
    url.protocol !== 'http:' || url.hostname !== 'minio' || url.port !== '9000' ||
    url.username || url.password || url.hash ||
    decodeURIComponent(url.pathname) !== `/${bucket}/${ownedObjectKey}` ||
    !url.searchParams.has('X-Amz-Signature') ||
    url.searchParams.get('X-Amz-Expires') !== '120'
  ) fail('SIGNED_URL_OUTSIDE_ISOLATED_SCOPE');
  report.signedURL.scopeValidated = true;
  report.signedURL.pathStyle = 'bucket/object-key';
  report.signedURL.objectKeySlashEncoding = url.pathname.endsWith(`/sha256/${expectedSHA256}`)
    ? 'literal-slash' : 'percent-encoded-slash';
  stage(currentStage, true);

  currentStage = 'download-actual-signed-url';
  report.download.attempted = true;
  // Reject redirects so a signed response cannot send the test outside its network.
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  report.download.httpStatus = response.status;
  if (response.status !== 200 || !response.body) fail('SIGNED_DOWNLOAD_HTTP_FAILED');
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > content.length) {
      await reader.cancel();
      fail('SIGNED_DOWNLOAD_CONTENT_TOO_LARGE');
    }
    chunks.push(Buffer.from(value));
  }
  const downloaded = Buffer.concat(chunks);
  report.download.bytes = downloaded.length;
  report.download.contentMatches = downloaded.equals(content) && sha256(downloaded) === expectedSHA256;
  if (!report.download.contentMatches) fail('SIGNED_DOWNLOAD_CONTENT_MISMATCH');
  stage(currentStage, true);
} catch (error) {
  stage(currentStage, false);
  // Raw SDK/fetch errors can contain a signed URL. Only fixed public codes escape.
  report.errors.push({ stage: currentStage, code: publicErrors.has(error?.probeCode) ? error.probeCode : 'STORAGE_PROBE_STAGE_FAILED' });
} finally {
  if (storage && writeAttempted) {
    report.cleanup.attempted = true;
    try {
      // This exact random-content key is the only object the probe may remove.
      await storage.removeObject(ownedObjectKey);
      report.cleanup.ownObjectRemoved = true;
      stage('remove-own-synthetic-object', true);
    } catch {
      stage('remove-own-synthetic-object', false);
      report.errors.push({ stage: 'remove-own-synthetic-object', code: 'OWN_OBJECT_CLEANUP_FAILED' });
    }
  }
}

report.probePassed = report.errors.length === 0 && report.signedURL.scopeValidated &&
  report.download.httpStatus === 200 && report.download.contentMatches && report.cleanup.ownObjectRemoved;
await writeFile('/evidence/storage-signing-probe.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({
  runId, probePassed: report.probePassed,
  pathStyle: report.signedURL.pathStyle,
  objectKeySlashEncoding: report.signedURL.objectKeySlashEncoding,
  downloadMatches: report.download.contentMatches,
  ownObjectRemoved: report.cleanup.ownObjectRemoved,
  errors: report.errors,
}));
process.exitCode = report.probePassed ? 0 : 1;
