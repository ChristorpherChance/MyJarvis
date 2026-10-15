import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineVault, OfflineVaultError, createOfflineVaultDraft, decryptOfflinePackage, validateOfflineVaultDraft,
  OFFLINE_VAULT_MAX_FILE_SIZE, OFFLINE_VAULT_MAX_PACKAGE_SIZE, type OfflineVaultDraft, type OfflineVaultEnvelope,
  type OfflineVaultRevision, type OfflineVaultStorage } from '../../web/src/features/offline/offline-vault.ts';

const PASSPHRASE = 'isolated-vault-fixture-口令';
class MemoryStorage implements OfflineVaultStorage {
  row: OfflineVaultEnvelope | null = null;
  async read() { return structuredClone(this.row); }
  async compareAndSwap(expected: OfflineVaultRevision | null, next: OfflineVaultEnvelope, signal: AbortSignal) {
    if (signal.aborted) throw new OfflineVaultError('locked', 'LOCKED');
    if (expected ? this.row?.vaultId !== expected.vaultId || this.row?.revision !== expected.revision : this.row !== null) throw new OfflineVaultError('conflict', 'CONFLICT');
    this.row = structuredClone(next);
  }
}
const code = (expected: string) => (error: unknown) => error instanceof OfflineVaultError && error.code === expected;
const file = (value: unknown) => new Blob([JSON.stringify(value)], { type: 'application/json' });
function fixtureDraft(): OfflineVaultDraft {
  const pdf = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 255, 127])], { type: 'application/pdf' });
  const recording = new Blob([new Uint8Array([26, 69, 223, 163, 0, 255, 128, 11, 9])], { type: 'audio/webm' });
  return createOfflineVaultDraft({ title: '隔离草稿标题', rawText: '  原文空白\n中文与🎤录音保留。  ', kind: 'memory', scope: 'family', sourceUrl: 'https://example.invalid/offline-source',
    materials: [pdf, recording].map((blob, index) => ({ id: crypto.randomUUID(), filename: index ? '原始录音.webm' : '原始资料.pdf', mime: blob.type, size: blob.size, blob })) });
}
async function assertDraft(actual: OfflineVaultDraft, expected: OfflineVaultDraft) {
  assert.deepEqual({ ...actual, materials: undefined }, { ...expected, materials: undefined });
  assert.equal(actual.materials.length, expected.materials.length);
  for (let index = 0; index < actual.materials.length; index++) {
    const a = actual.materials[index], e = expected.materials[index];
    assert.deepEqual({ ...a, blob: undefined }, { ...e, blob: undefined }); assert.equal(a.blob.type, e.blob.type);
    assert.deepEqual(new Uint8Array(await a.blob.arrayBuffer()), new Uint8Array(await e.blob.arrayBuffer()));
  }
}

test('offline vault persists ciphertext only and reopens original text, PDF and recording bytes', async () => {
  const storage = new MemoryStorage(), vault = new OfflineVault(storage), draft = fixtureDraft();
  assert.equal(await vault.exists(), false); await assertDraft(await vault.create(PASSPHRASE, draft), draft);
  const stored = JSON.stringify(storage.row); assert.ok(!stored.includes(draft.rawText)); assert.ok(!stored.includes(draft.title));
  for (const item of draft.materials) assert.ok(!stored.includes(item.filename));
  assert.deepEqual(Object.keys(storage.row!).sort(), ['cipher', 'ciphertext', 'format', 'iterations', 'iv', 'kdf', 'revision', 'salt', 'vaultId', 'version']);
  assert.equal(await vault.exists(), true); vault.lock(); assert.equal(vault.unlocked, false); await assert.rejects(vault.load(), code('LOCKED'));
  const reopened = new OfflineVault(storage); await assertDraft(await reopened.unlock(PASSPHRASE), draft); await assertDraft(await reopened.load(), draft);
  const portable = await reopened.exportPackage(), before = structuredClone(storage.row);
  await assertDraft(await decryptOfflinePackage(portable, PASSPHRASE), draft); assert.deepEqual(storage.row, before);
  const migratedStore = new MemoryStorage(), migrated = new OfflineVault(migratedStore);
  await assertDraft(await migrated.importPackage(portable, PASSPHRASE), draft); migrated.lock();
  await assertDraft(await new OfflineVault(migratedStore).unlock(PASSPHRASE), draft);
});

test('bad passwords, corruption, unsafe parameters and existing-vault imports preserve old ciphertext', async () => {
  const storage = new MemoryStorage(), vault = new OfflineVault(storage), draft = fixtureDraft();
  await vault.create(PASSPHRASE, draft); const original = structuredClone(storage.row!), portable = await vault.exportPackage();
  await assert.rejects(vault.unlock('incorrect-local-password'), code('BAD_PASSPHRASE')); assert.deepEqual(storage.row, original);
  const corrupt = { ...original, ciphertext: (original.ciphertext[0] === 'A' ? 'B' : 'A') + original.ciphertext.slice(1) };
  await assert.rejects(vault.importPackage(file(corrupt), PASSPHRASE), code('BAD_PASSPHRASE')); assert.deepEqual(storage.row, original);
  for (const unsafe of [{ ...original, iterations: 2 ** 31 }, { ...original, version: 2 }, { ...original, salt: 'AAAA' }, { ...original, actorId: 'must-not-import' }, { ...original, ciphertext: '!' + original.ciphertext.slice(1) }]) {
    await assert.rejects(vault.importPackage(file(unsafe), PASSPHRASE), code('INVALID')); assert.deepEqual(storage.row, original);
  }
  await assert.rejects(vault.importPackage(portable, PASSPHRASE), code('CONFLICT')); assert.deepEqual(storage.row, original);
  const empty = new MemoryStorage(); await assert.rejects(new OfflineVault(empty).importPackage(portable, 'incorrect-password'), code('BAD_PASSPHRASE')); assert.equal(empty.row, null);
});

test('atomic revision CAS rejects a stale tab and concurrent saves without losing the winning draft', async () => {
  const storage = new MemoryStorage(), first = new OfflineVault(storage), second = new OfflineVault(storage), draft = fixtureDraft();
  await first.create(PASSPHRASE, draft); await second.unlock(PASSPHRASE);
  const winner = { ...draft, rawText: 'first tab saves' }; await first.save(winner); const saved = structuredClone(storage.row);
  await assert.rejects(second.save({ ...draft, rawText: 'stale tab must not replace' }), code('CONFLICT')); assert.deepEqual(storage.row, saved);
  await assert.rejects(second.load(), code('CONFLICT')); await assert.rejects(new OfflineVault(storage).create(PASSPHRASE), code('CONFLICT'));
  await assertDraft(await second.unlock(PASSPHRASE), winner);
  const results = await Promise.allSettled([second.save({ ...winner, title: 'concurrent A' }), second.save({ ...winner, title: 'concurrent B' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && code('CONFLICT')(result.reason)).length, 1);
  assert.equal(storage.row!.revision, 3);
});

test('locking invalidates pending unlock/save and leaves no unlocked session or stale write', async () => {
  const storage = new MemoryStorage(), vault = new OfflineVault(storage), draft = fixtureDraft(); await vault.create(PASSPHRASE, draft);
  const original = structuredClone(storage.row); const pendingSave = vault.save({ ...draft, rawText: 'locked pending save' }); vault.lock();
  await assert.rejects(pendingSave, code('LOCKED')); assert.deepEqual(storage.row, original); assert.equal(vault.unlocked, false);
  let release!: (value: unknown) => void; const delayed: OfflineVaultStorage = { read: () => new Promise(resolve => { release = resolve; }), compareAndSwap: storage.compareAndSwap.bind(storage) };
  const other = new OfflineVault(delayed), pendingUnlock = other.unlock(PASSPHRASE); other.lock(); release(structuredClone(original));
  await assert.rejects(pendingUnlock, code('LOCKED')); assert.equal(other.unlocked, false); await assert.rejects(other.save(draft), code('LOCKED'));
});

test('bounded draft validation rejects attachment/count/text abuse and discards identity/server fields', async () => {
  const draft = fixtureDraft(), item = draft.materials[0];
  assert.throws(() => validateOfflineVaultDraft({ ...draft, rawText: 'a'.repeat(20001) }), code('INVALID'));
  assert.throws(() => validateOfflineVaultDraft({ ...draft, materials: [...draft.materials, item, item, item, item] }), code('INVALID'));
  assert.throws(() => validateOfflineVaultDraft({ ...draft, materials: [item, item] }), code('INVALID'));
  assert.throws(() => validateOfflineVaultDraft({ ...draft, materials: [{ ...item, size: item.size + 1 }] }), code('INVALID'));
  const large = new Blob([new Uint8Array(OFFLINE_VAULT_MAX_FILE_SIZE + 1)]);
  assert.throws(() => validateOfflineVaultDraft({ ...draft, materials: [{ ...item, size: large.size, blob: large }] }), code('INVALID'));
  const maximum = large.slice(0, OFFLINE_VAULT_MAX_FILE_SIZE);
  assert.throws(() => validateOfflineVaultDraft({ ...draft, materials: Array.from({ length: 3 }, () => ({ ...item, id: crypto.randomUUID(), size: maximum.size, blob: maximum })) }), code('INVALID'));
  const clean = validateOfflineVaultDraft({ ...draft, actorId: 'private-identity', token: 'private-token', materials: draft.materials.map(material => ({ ...material, asset: { id: 'server-upload-id' } })) });
  assert.equal('actorId' in clean, false); assert.equal('token' in clean, false); assert.equal('asset' in clean.materials[0], false);
  const oversized = new class extends Blob { override get size() { return OFFLINE_VAULT_MAX_PACKAGE_SIZE + 1; } }();
  await assert.rejects(decryptOfflinePackage(oversized, PASSPHRASE), code('INVALID'));
  await assert.rejects(decryptOfflinePackage(file({}), 'short'), code('INVALID'));
});

test('authenticated envelope metadata cannot be changed to bypass a conflict or alter a package', async () => {
  const storage = new MemoryStorage(), vault = new OfflineVault(storage); await vault.create(PASSPHRASE, fixtureDraft()); const original = storage.row!;
  for (const modified of [{ ...original, revision: original.revision + 1 }, { ...original, vaultId: crypto.randomUUID() }, { ...original, iv: btoa('different-iv') }]) {
    await assert.rejects(decryptOfflinePackage(file(modified), PASSPHRASE), code('BAD_PASSPHRASE'));
  }
  await assert.rejects(decryptOfflinePackage(file({ ...original, revision: Number.MAX_SAFE_INTEGER }), PASSPHRASE), code('INVALID'));
});

test('authenticated but malformed binary payloads fail bounded validation before any imported write', async () => {
  const storage = new MemoryStorage(), vault = new OfflineVault(storage); await vault.create(PASSPHRASE, fixtureDraft()); const row = storage.row!;
  const fromBase64 = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(row.salt), iterations: row.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const additionalData = new TextEncoder().encode(JSON.stringify([row.format, row.version, row.vaultId, row.revision, row.kdf, row.iterations, row.salt, row.cipher]));
  const parameters = { name: 'AES-GCM', iv: fromBase64(row.iv), additionalData, tagLength: 128 };
  const original = new Uint8Array(await crypto.subtle.decrypt(parameters, key, fromBase64(row.ciphertext)));
  const trailing = new Uint8Array(original.length + 1); trailing.set(original);
  const excessiveManifest = original.slice(); new DataView(excessiveManifest.buffer).setUint32(4, 0x7fffffff, false);
  const metadata = new TextEncoder().encode(JSON.stringify({ schema: 1, id: crypto.randomUUID(), rawText: '', title: '', kind: 'idea', scope: 'private', sourceUrl: '', materials: [{ id: crypto.randomUUID(), filename: 'fake.webm', mime: 'audio/webm', size: OFFLINE_VAULT_MAX_FILE_SIZE + 1 }] }));
  const excessiveAttachment = new Uint8Array(metadata.length + 8); excessiveAttachment.set([74, 86, 68, 49]); new DataView(excessiveAttachment.buffer).setUint32(4, metadata.length, false); excessiveAttachment.set(metadata, 8);
  for (const plaintext of [trailing, excessiveManifest, excessiveAttachment]) {
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(parameters, key, plaintext));
    const corrupted = file({ ...row, ciphertext: btoa(String.fromCharCode(...encrypted)) });
    const target = new MemoryStorage(); await assert.rejects(new OfflineVault(target).importPackage(corrupted, PASSPHRASE), code('INVALID')); assert.equal(target.row, null);
    assert.deepEqual(storage.row, row);
  }
});

test('stale unlocked export refuses another tab revision while locked ciphertext backup remains available', async () => {
  const storage = new MemoryStorage(), first = new OfflineVault(storage), second = new OfflineVault(storage), draft = fixtureDraft();
  await first.create(PASSPHRASE, draft); await second.unlock(PASSPHRASE);
  await first.save({ ...draft, rawText: 'another tab revision must be explicitly reopened' }); const winner = structuredClone(storage.row);
  await assert.rejects(second.exportPackage(), code('CONFLICT')); assert.deepEqual(storage.row, winner);
  await second.unlock(PASSPHRASE); const exported = await second.exportPackage(); assert.equal(JSON.parse(await exported.text()).revision, winner!.revision);
  second.lock(); const lockedBackup = await second.exportPackage(); assert.equal(JSON.parse(await lockedBackup.text()).ciphertext, winner!.ciphertext);
  await first.unlock(PASSPHRASE);
  let release!: (value: unknown) => void; storage.read = () => new Promise(resolve => { release = resolve; });
  const pending = first.exportPackage(); first.lock(); release(structuredClone(winner)); await assert.rejects(pending, code('LOCKED'));
});
