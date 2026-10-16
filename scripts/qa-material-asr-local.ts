/** Preregistered, bounded local ASR evidence. Default mode prepares only; --run is explicit. */
import assert from 'node:assert/strict';
import childProcess, {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {createApp} from '../apps/api/src/app.js';
import {measureAudioSeconds} from '../apps/api/src/runtime/voice-duration.js';
import type {PiService} from '../apps/api/src/pi.js';

const execute = promisify(execFile);
const project = resolve('D:/AI/workspaces/MyJevis');
const output = resolve('artifacts/material-asr-local-r34');
const fixtures = join(output, 'fixed-sapi-fixtures-v1');
const python = join(project, '.runtime-venv/Scripts/python.exe');
const powershell = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const worker = resolve('apps/api/resources/voice/asr_faster_whisper.py');
const sapi = resolve('apps/api/resources/voice/tts_sapi.ps1');
const script = fileURLToPath(import.meta.url);
const expectedWorker = '016a8ec264a95cbd0cef757daafeaa749a6a7dffb2f38d5f5607ed6e00aca0f6';
const models = {tiny: join(project, '.jarvis/runtime/models/whisper-tiny'), small: join(project, 'artifacts/multilingual-voice/models/faster-whisper-small')};
const samples = [
  {language: 'zh', voice: 'Microsoft Huihui Desktop', reference: '明天下午三点，我想整理今天的灵感，再把会议记录加入知识库。', metric: 'CER'},
  {language: 'en', voice: 'Microsoft Zira Desktop', reference: 'Tomorrow at three in the afternoon I want to review my project ideas and collect the meeting notes.', metric: 'WER'},
] as const;
type Language = typeof samples[number]['language'];
const parameters = new Map(process.argv.slice(2).filter(value => value.startsWith('--') && value.includes('=')).map(value => {const index = value.indexOf('='); return [value.slice(2, index), value.slice(index + 1)];}));
for (const argument of process.argv.slice(2)) assert.ok(argument === '--run' || argument === '--prepare-only' || /^--(only|attempt|model)=/.test(argument), 'Unsupported ASR QA option');
assert.ok(!(process.argv.includes('--run') && process.argv.includes('--prepare-only')), 'Choose prepare or run');
const run = process.argv.includes('--run');
const model = parameters.get('model') || 'tiny';
assert.ok(model === 'tiny' || model === 'small', 'Only pre-existing tiny or small local models are eligible');
const modelName = model as keyof typeof models, modelDirectory = models[modelName];
const attempt = parameters.get('attempt') || '1';
assert.match(attempt, /^[1-9][0-9]{0,3}$/, 'Attempt must be a positive integer');
const selected = (parameters.get('only') || 'zh,en').split(',');
assert.ok(selected.length >= 1 && selected.length <= 2 && new Set(selected).size === selected.length && selected.every(value => value === 'zh' || value === 'en'), '--only accepts zh, en, or zh,en');
const chosen = samples.filter(sample => selected.includes(sample.language));
const contractPath = join(output, `contract-${modelName}-${attempt}.json`);
const reportPath = join(output, `attempt-${modelName}-${attempt}.json`);
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
async function hashFile(path: string) {const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');}
async function fingerprints(directory: string): Promise<Array<{file: string; bytes: number; sha256: string}>> {
  const entries: Array<{file: string; bytes: number; sha256: string}> = [];
  const visit = async (folder: string, relative: string) => {
    for (const name of (await readdir(folder)).sort()) {
      const path = join(folder, name), stat = await lstat(path), file = relative ? `${relative}/${name}` : name;
      assert.equal(stat.isSymbolicLink(), false, 'Model snapshot must not follow symbolic links');
      if (stat.isDirectory()) await visit(path, file);
      else if (stat.isFile()) entries.push({file, bytes: stat.size, sha256: await hashFile(path)});
      else throw Error('Unsupported model snapshot entry');
    }
  };
  await visit(directory, ''); assert.ok(entries.some(item => item.file === 'model.bin'), 'Local model.bin is missing'); return entries;
}
function normalized(reference: string, language: Language): string[] {
  // No numeral conversion, synonym replacement, spelling correction, or hypothesis-specific edits.
  const text = reference.replace(/\p{P}/gu, '');
  return language === 'zh' ? [...text.replace(/\s/gu, '')] : text.toLowerCase().trim().split(/\s+/u).filter(Boolean);
}
function distance(reference: string[], recognized: string[]) {
  let row = Array.from({length: recognized.length + 1}, (_, index) => index);
  for (let index = 1; index <= reference.length; index++) {
    const next = [index];
    for (let column = 1; column <= recognized.length; column++) next.push(Math.min(next[column - 1] + 1, row[column] + 1, row[column - 1] + (reference[index - 1] === recognized[column - 1] ? 0 : 1)));
    row = next;
  }
  return row[recognized.length];
}
const normalization = {zh: 'Remove Unicode punctuation and whitespace only; compare Unicode code points with Levenshtein distance.', en: 'Remove Unicode punctuation, lowercase, split on whitespace; compare words with Levenshtein distance.', thresholdInclusive: 0.25, numeralConversion: false, synonymReplacement: false};
await mkdir(output, {recursive: true});
await Promise.all([access(python), access(powershell), access(worker), access(sapi), access(join(modelDirectory, 'model.bin'))]);
const identities = {scriptSha256: await hashFile(script), workerSha256: await hashFile(worker), sapiSha256: await hashFile(sapi), model: modelName, modelFiles: await fingerprints(modelDirectory)};
assert.equal(identities.workerSha256, expectedWorker, 'Worker differs from the frozen source');

if (!run) {
  const contract = {
    schema: 1, preparedAt: new Date().toISOString(), mode: 'preregistered-not-executed', attempt, selected: chosen.map(sample => sample.language), identities,
    samples, normalization, synthesis: {engine: 'Windows SAPI via existing tts_sapi.ps1', rate: 0, sampleRate: 16000, bits: 16, channels: 1, output: 'file-only; no speaker playback', maximumSecondsInclusive: 15, synthesesPerLanguage: 1, originalReferenceMustNotChange: true},
    recognition: {http: 'new temporary createApp; authenticated upload then explicit transcribe', model: modelName, device: 'cpu', computeType: 'int8', threads: 2, workerMaximumSeconds: 65, engineTimeoutMs: 180000, callsPerModelAndLanguage: 1, language: 'explicit zh/en', cloudConsent: false, localFilesOnly: true, noInstallOrDownload: true, noAutomaticModelFallback: true},
    acceptance: {sourceSha256: 'exact uploaded/downloaded WAV SHA-256', engine: 'command', textSha256: 'exact recognized text SHA-256', segmentCount: 'at least one actual segment', segmentTimes: 'finite, start >= 0, end >= start, end <= measured WAV duration + 0.25', segmentsMustReconstructText: true, maximumErrorRateInclusive: 0.25, physicalMicrophoneOrRealSpeakerVerified: false},
    retention: {fixtures: 'Only these public synthetic sentences and their generated WAV bytes are retained for same-audio comparison.', results: 'Each attempt and first failure retained without overwrite.', temporaryData: 'Own mkdtemp directory only; removed after createApp closes.', prohibited: 'No credentials, endpoint, session, private recording, provider setup, production operation, old test matrix, or legacy temporary-directory cleanup.'},
    usage: {policy: 'record only; no spend cap', localAsr: 'actual child launches and local usage entries reported separately from Pi', piExpected: 0, externalFetchExpected: 0, localComputePriceUSD: null, internalAssistantTokens: null, internalAssistantCostUSD: null},
  };
  await writeFile(contractPath, JSON.stringify(contract, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: 'prepared-only', contract: `artifacts/material-asr-local-r34/${basename(contractPath)}`, contractSha256: await hashFile(contractPath), model: modelName, selected: chosen.map(sample => sample.language), localAsrCalls: 0, sapiSyntheses: 0, piCalls: 0}));
  process.exit(0);
}

const contract = JSON.parse(await readFile(contractPath, 'utf8'));
assert.equal(contract.schema, 1); assert.equal(contract.mode, 'preregistered-not-executed'); assert.equal(contract.attempt, attempt);
assert.deepEqual(contract.selected, chosen.map(sample => sample.language)); assert.deepEqual(contract.samples, samples); assert.deepEqual(contract.normalization, normalization); assert.deepEqual(contract.identities, identities, 'Source or local model changed after preregistration');
await writeFile(reportPath, JSON.stringify({schema: 1, status: 'running', attempt, model: modelName, contractSha256: await hashFile(contractPath)}) + '\n', {flag: 'wx'});

let runtime: Awaited<ReturnType<typeof createApp>> | undefined, temporary = '', origin = '', cookie = '', password = randomUUID() + '-local-asr';
let active = 'preflight', piCalls = 0, externalFetchAttempts = 0, httpTranscribeRequests = 0, sapiSyntheses = 0, cleanupVerified = false;
const results: any[] = [], localWorkerLaunches: Array<{language: string; model: string; at: string}> = [], runtimeFacts: any = {};
const originalFetch = globalThis.fetch, originalSpawn = childProcess.spawn;
const offlineEnvironment = {HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE, TRANSFORMERS_OFFLINE: process.env.TRANSFORMERS_OFFLINE, HF_DATASETS_OFFLINE: process.env.HF_DATASETS_OFFLINE};
const pi = {initialize: async () => {}, health: () => ({configured: false}), modelIsLocal: () => true, abort: async () => {}, dispose: async () => {}, run: async () => {piCalls++; throw Error('Pi is prohibited in local ASR evidence');}} as unknown as PiService;
const safeError = (error: unknown) => {
  let text = String(error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown verification failure');
  for (const secret of [password, cookie, origin, temporary].filter(Boolean)) text = text.replaceAll(secret, '[REDACTED]');
  return text.replace(/https?:\/\/[^\s"'<>]+/g, '[ENDPOINT REDACTED]').slice(0, 3000);
};
async function http(path: string, method = 'GET', body?: unknown, binary = false) {
  assert.match(path, /^\/api\//);
  const response = await fetch(origin + path, {method, redirect: 'error', headers: {...(cookie ? {cookie} : {}), ...(body === undefined ? {} : {'content-type': binary ? 'application/octet-stream' : 'application/json'})}, ...(body === undefined ? {} : {body: binary ? new Uint8Array(body as Buffer) : JSON.stringify(body)}), signal: AbortSignal.timeout(path.endsWith('/process') ? 210000 : 30000)});
  if (binary && method === 'GET') {assert.equal(response.status, 200, 'Original download HTTP status'); return Buffer.from(await response.arrayBuffer());}
  let data: any; try {data = await response.json();} catch {throw Error('HTTP did not return JSON');}
  assert.equal(response.status, 200, `HTTP ${method} failed with status ${response.status}`); return data;
}
function safeUsage() {
  if (!runtime) return [];
  const rows = runtime.governance.usagePage({source: 'local-voice', limit: 100}).items;
  return rows.map((row: any) => ({kind: row.usage_kind, source: row.source, provider: row.provider, model: modelName, seconds: Number(row.seconds), inputTokens: row.input_tokens, outputTokens: row.output_tokens, totalTokens: row.total_tokens, costUSD: row.cost_usd, costKind: row.cost_kind, measurementStatus: row.measurement_status}));
}
async function fixture(sample: typeof samples[number]) {
  await mkdir(fixtures, {recursive: true});
  const wavPath = join(fixtures, sample.language + '.wav'), metadataPath = join(fixtures, sample.language + '.json');
  let metadata: any;
  try {metadata = JSON.parse(await readFile(metadataPath, 'utf8'));}
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    assert.equal(modelName, 'tiny', 'Small comparison must reuse existing original WAV; no resynthesis allowed');
    await writeFile(join(fixtures, sample.language + '.synthesis-claim.json'), JSON.stringify({at: new Date().toISOString(), sample, sapiSha256: identities.sapiSha256}) + '\n', {flag: 'wx'});
    const textFile = join(temporary, sample.language + '-reference.txt'), wavTemporary = join(temporary, sample.language + '.wav');
    await writeFile(textFile, sample.reference, 'utf8');
    sapiSyntheses++;
    await execute(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', sapi, '-TextFile', textFile, '-Output', wavTemporary, '-Voice', sample.voice, '-Language', sample.language, '-Rate', '0'], {windowsHide: true, timeout: 30000, maxBuffer: 65536});
    const bytes = await readFile(wavTemporary);
    const seconds = await measureAudioSeconds(bytes, 'audio/wav', new AbortController().signal, python);
    const measured = await execute(python, ['-c', 'import json,sys,wave\nwith wave.open(sys.argv[1],"rb") as w:\n print(json.dumps({"seconds":w.getnframes()/w.getframerate(),"frames":w.getnframes(),"sampleRate":w.getframerate(),"channels":w.getnchannels(),"sampleWidth":w.getsampwidth()}))', wavTemporary], {windowsHide: true, timeout: 30000, maxBuffer: 65536});
    const waveFacts = JSON.parse(measured.stdout);
    metadata = {schema: 1, generatedAt: new Date().toISOString(), sample, sapiSha256: identities.sapiSha256, synthesisRate: 0, sha256: sha(bytes), bytes: bytes.length, seconds, waveFacts};
    await copyFile(wavTemporary, wavPath, 1); await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', {flag: 'wx'});
  }
  assert.deepEqual(metadata.sample, sample); assert.equal(metadata.sapiSha256, identities.sapiSha256); assert.equal(metadata.synthesisRate, 0);
  const bytes = await readFile(wavPath); assert.equal(sha(bytes), metadata.sha256); assert.equal(bytes.length, metadata.bytes);
  const seconds = await measureAudioSeconds(bytes, 'audio/wav', new AbortController().signal, python);
  assert.ok(seconds > 0 && seconds <= 15, 'Fixed synthetic WAV is outside preregistered 15-second bound; it must not be replaced');
  assert.ok(Math.abs(metadata.seconds - seconds) < 0.000001); assert.ok(Math.abs(metadata.waveFacts.seconds - seconds) < 0.000001);
  assert.equal(metadata.waveFacts.sampleRate, 16000); assert.equal(metadata.waveFacts.channels, 1); assert.equal(metadata.waveFacts.sampleWidth, 2);
  return {bytes, metadata, seconds};
}

try {
  process.env.HF_HUB_OFFLINE = '1'; process.env.TRANSFORMERS_OFFLINE = '1'; process.env.HF_DATASETS_OFFLINE = '1';
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!origin || url.origin !== origin) {externalFetchAttempts++; throw Error('External request blocked by isolated ASR harness');}
    return originalFetch(input, init);
  }) as typeof fetch;
  childProcess.spawn = ((command: string, args: readonly string[] = [], options?: any) => {
    if (args[0] && resolve(args[0]) === worker) {
      const value = (flag: string) => args[args.indexOf(flag) + 1];
      assert.equal(resolve(command), resolve(python)); assert.equal(resolve(value('--model')), resolve(modelDirectory)); assert.equal(value('--threads'), '2');
      const language = value('--language'); assert.ok(chosen.some(sample => sample.language === language));
      assert.equal(localWorkerLaunches.some(item => item.language === language), false, 'A second native ASR launch for the same planned sentence is prohibited');
      localWorkerLaunches.push({language, model: modelName, at: new Date().toISOString()});
    }
    return originalSpawn(command, args as string[], options);
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  temporary = await mkdtemp(join(tmpdir(), 'jarvis-material-asr-local-'));
  const facts = await execute(python, ['-c', 'import importlib.metadata as m,json,sys,platform,faster_whisper,ctranslate2,numpy,av\nprint(json.dumps({"python":sys.version.split()[0],"platform":platform.system(),"versions":{k:m.version(k) for k in ["faster-whisper","ctranslate2","numpy","av"]},"cpuComputeTypes":sorted(ctranslate2.get_supported_compute_types("cpu"))}))'], {windowsHide: true, timeout: 30000, maxBuffer: 65536});
  Object.assign(runtimeFacts, JSON.parse(facts.stdout));
  const prepared = new Map<Language, Awaited<ReturnType<typeof fixture>>>();
  for (const sample of chosen) {active = 'fixed-synthesis-' + sample.language; prepared.set(sample.language, await fixture(sample));}
  active = 'isolated-http-setup';
  runtime = await createApp({dataDir: join(temporary, 'data'), pi, webDir: join(temporary, 'no-web-content'), pythonExecutable: python, whisperModelDirectory: modelDirectory});
  const config = runtime.voice.getConfig('asr'); assert.ok(config?.adapter === 'command'); assert.equal(config.executable, python); assert.equal(config.model, modelDirectory);
  const args = config.args.includes('--threads') ? [...config.args] : [...config.args, '--threads', '2'];
  runtime.voice.configure('asr', {...config, args});
  const policy = runtime.governance.policy(); runtime.governance.updatePolicy(policy.revision, {dailyLimitUSD: 0, blockUnpriced: false});
  await runtime.app.listen({host: '127.0.0.1', port: 0}); const address = runtime.app.server.address(); assert.ok(address && typeof address !== 'string'); origin = `http://127.0.0.1:${address.port}`;
  const setup = await originalFetch(origin + '/api/auth/setup', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({password}), signal: AbortSignal.timeout(30000)});
  assert.equal(setup.status, 200, 'Isolated authentication setup'); cookie = String(setup.headers.get('set-cookie')).split(';')[0]; assert.ok(cookie.startsWith('jarvis_session=')); await setup.arrayBuffer();
  await mkdir(join(output, 'claims'), {recursive: true});
  for (const sample of chosen) {
    active = 'http-transcribe-' + sample.language; const started = Date.now(), original = prepared.get(sample.language)!;
    const evidence: any = {language: sample.language, metric: sample.metric, reference: sample.reference, normalizedReference: normalized(sample.reference, sample.language).join(sample.language === 'zh' ? '' : ' '), model: modelName, input: original.metadata, cloudConsent: false, retries: 0};
    try {
      const id = randomUUID(), prefix = '/api/v1/inbox-materials/uploads';
      const preparedUpload = await http(prefix, 'POST', {id, filename: `fixed-sapi-${sample.language}.wav`, mime: 'audio/wav', size: original.bytes.length, scope: 'private'});
      assert.equal(preparedUpload.data.status, 'awaiting-file');
      const stored = await http(prefix + '/' + id + '/file', 'PUT', original.bytes, true);
      assert.equal(stored.data.status, 'stored'); assert.equal(stored.data.sha256, original.metadata.sha256); assert.equal(stored.data.mediaKind, 'audio');
      assert.equal(sha(await http(prefix + '/' + id + '/file', 'GET', undefined, true)), original.metadata.sha256);
      await writeFile(join(output, 'claims', `${modelName}-${sample.language}.json`), JSON.stringify({at: new Date().toISOString(), attempt, contractSha256: await hashFile(contractPath), wavSha256: original.metadata.sha256}) + '\n', {flag: 'wx'});
      const launchesBefore = localWorkerLaunches.length, usageBefore = safeUsage().length;
      httpTranscribeRequests++;
      const processed = await http(prefix + '/' + id + '/process', 'POST', {commandId: randomUUID(), expectedVersion: stored.data.revision, operation: 'transcribe', language: sample.language, cloudConsent: false});
      evidence.httpElapsedMs = Date.now() - started;
      evidence.processingStatus = processed.data.processing?.status;
      evidence.processingError = processed.data.processing?.error ? {code: processed.data.processing.error.code, message: processed.data.processing.error.message} : null;
      const record = (await http(prefix + '/' + id)).data;
      evidence.engine = record.extraction?.engine ?? null; evidence.recognizedText = record.extraction?.text ?? null; evidence.segments = record.extraction?.segments ?? [];
      evidence.nativeWorkerLaunches = localWorkerLaunches.length - launchesBefore; evidence.localUsageEntries = safeUsage().length - usageBefore;
      assert.equal(evidence.nativeWorkerLaunches, 1, 'One actual native ASR launch per HTTP sentence'); assert.equal(evidence.localUsageEntries, 1, 'One local usage entry per native ASR sentence');
      assert.equal(evidence.processingStatus, 'complete', 'Actual local material transcription did not complete');
      assert.equal(record.sha256, original.metadata.sha256); assert.equal(record.extraction.sourceSha256, original.metadata.sha256); assert.equal(record.extraction.engine, 'command'); assert.equal(record.extraction.language, sample.language);
      assert.equal(record.extraction.reviewRequired, true); assert.equal(record.extraction.textTruncated, false); assert.equal(record.extraction.textSha256, sha(record.extraction.text));
      assert.ok(Array.isArray(record.extraction.segments) && record.extraction.segments.length > 0, 'Expected real decoder time segments');
      assert.equal(record.extraction.segments.map((segment: any) => segment.text).join('').trim(), record.extraction.text);
      for (const segment of record.extraction.segments) {assert.ok(typeof segment.text === 'string' && segment.text.trim()); assert.equal(segment.sha256, sha(segment.text)); assert.ok(Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end >= segment.start && segment.end <= original.seconds + 0.25, 'Actual segment exceeds measured original duration');}
      const reference = normalized(sample.reference, sample.language), recognized = normalized(record.extraction.text, sample.language), errors = distance(reference, recognized), rate = errors / reference.length;
      evidence.normalizedRecognized = recognized.join(sample.language === 'zh' ? '' : ' '); evidence.referenceUnits = reference.length; evidence.editErrors = errors; evidence.errorRate = rate; evidence.thresholdInclusive = 0.25;
      assert.ok(rate <= 0.25, `${sample.metric} exceeded preregistered 0.25 gate`);
      evidence.status = 'passed';
    } catch (error) {evidence.status = 'failed'; evidence.cut = active; evidence.diagnostic = safeError(error); process.exitCode = 1;}
    evidence.totalElapsedMs = Date.now() - started; results.push(evidence);
    // Only public synthetic text and outcome are written. Never print the auth cookie or local endpoint.
    console.log(JSON.stringify({language: sample.language, model: modelName, status: evidence.status, metric: sample.metric, errorRate: evidence.errorRate ?? null, nativeWorkerLaunches: evidence.nativeWorkerLaunches ?? null}));
  }
  assert.equal(piCalls, 0); assert.equal(externalFetchAttempts, 0); assert.equal(localWorkerLaunches.length, chosen.length); assert.equal(results.length, chosen.length);
  const usage = safeUsage(); assert.equal(usage.length, localWorkerLaunches.length);
  assert.ok(usage.every(row => row.kind === 'asr' && row.source === 'local-voice' && row.provider === 'local-command' && row.measurementStatus === 'local' && row.totalTokens === 0 && row.costUSD === 0));
} catch (error) {process.exitCode = 1; results.push({status: 'failed', cut: active, diagnostic: safeError(error)});}
finally {
  const usage = safeUsage();
  try {if (runtime) await runtime.app.close(); if (temporary) {const target = resolve(temporary); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('jarvis-material-asr-local-')); await rm(target, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});} cleanupVerified = true;} catch {process.exitCode = 1;}
  globalThis.fetch = originalFetch; childProcess.spawn = originalSpawn; syncBuiltinESMExports();
  for (const [name, value] of Object.entries(offlineEnvironment)) {if (value === undefined) delete process.env[name]; else process.env[name] = value;}
  cookie = ''; password = ''; origin = '';
  const report = {schema: 1, completedAt: new Date().toISOString(), attempt, model: modelName, contractSha256: await hashFile(contractPath), identities, runtime: runtimeFacts, status: results.length === chosen.length && results.every(item => item.status === 'passed') && cleanupVerified ? 'passed' : 'failed', realHttp: true, temporarySqlite: true, productionAccess: false, physicalMicrophoneVerified: false, realSpeakerVerified: false, sapiSyntheses, httpTranscribeRequests, localAsrCalls: localWorkerLaunches.length, localWorkerLaunches, piCalls, observedExternalFetchAttempts: externalFetchAttempts, networkPolicy: {nodeFetch: 'same-process loopback only', huggingFaceOffline: true, localFilesOnly: true, cloudConsent: false, providerConfigurationCreated: false}, localUsage: usage, cost: {ledgerLocalEngineUSD: usage.reduce((sum, row) => sum + Number(row.costUSD || 0), 0), localComputePriceUSD: null, internalAssistantTokens: null, internalAssistantCostUSD: null, spendingCap: null}, cleanupVerified, results};
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status: report.status, report: `artifacts/material-asr-local-r34/${basename(reportPath)}`, localAsrCalls: report.localAsrCalls, piCalls, observedExternalFetchAttempts: externalFetchAttempts, cleanupVerified}));
}
