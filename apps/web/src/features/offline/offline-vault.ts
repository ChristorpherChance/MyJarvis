/** Browser-only, passphrase-encrypted capture. No identity or server records enter this store. */
export const OFFLINE_VAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;
export const OFFLINE_VAULT_MAX_TOTAL_SIZE = 64 * 1024 * 1024;
export const OFFLINE_VAULT_MAX_FILES = 5;
const DB = 'jarvis-offline-vault-v1', STORE = 'vaults', ROW = 'primary';
const FORMAT = 'jarvis-offline-vault', VERSION = 1, ITERATIONS = 600000;
const MAX_MANIFEST = 128 * 1024, MAX_PLAINTEXT = OFFLINE_VAULT_MAX_TOTAL_SIZE + MAX_MANIFEST + 8;
const MAX_CIPHERTEXT = MAX_PLAINTEXT + 16, MAX_BASE64 = 4 * Math.ceil(MAX_CIPHERTEXT / 3);
export const OFFLINE_VAULT_MAX_PACKAGE_SIZE = MAX_BASE64 + 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['idea', 'experience', 'lesson', 'skill', 'memory', 'book']);
const SCOPES = new Set(['private', 'personal', 'family', 'company']);
type Kind = 'idea' | 'experience' | 'lesson' | 'skill' | 'memory' | 'book';
type Scope = 'private' | 'personal' | 'family' | 'company';
export interface OfflineVaultMaterial { id: string; filename: string; mime: string; size: number; blob: Blob }
export interface OfflineVaultDraft { id: string; rawText: string; title: string; kind: Kind; scope: Scope; sourceUrl: string; materials: OfflineVaultMaterial[] }
export type OfflineVaultErrorCode = 'INVALID' | 'UNAVAILABLE' | 'CONFLICT' | 'LOCKED' | 'BAD_PASSPHRASE';
export class OfflineVaultError extends Error {
  constructor(message: string, public code: OfflineVaultErrorCode) { super(message); this.name = 'OfflineVaultError'; }
}
/** Local CAS token: forked packages may share an id and revision, so compare their full encrypted state. */
export interface OfflineVaultRevision { vaultId: string; revision: number; salt: string; iv: string; ciphertext: string }
export interface OfflineVaultEnvelope extends OfflineVaultRevision {
  format: typeof FORMAT; version: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; cipher: 'AES-GCM-256'; iv: string; ciphertext: string;
}
/** CAS must compare the full token and write atomically; the signal cancels locked or stopped writes. */
export interface OfflineVaultStorage {
  read(): Promise<unknown | null>;
  compareAndSwap(expected: OfflineVaultRevision | null, next: OfflineVaultEnvelope, signal: AbortSignal): Promise<void>;
}
const invalid = (): never => { throw new OfflineVaultError('离线草稿文件格式、版本或大小无效，原草稿未被覆盖。', 'INVALID'); };
const conflict = (): never => { throw new OfflineVaultError('本机已有草稿或另一页面已更新，请先保留当前输入并重新打开。', 'CONFLICT'); };
const locked = (): never => { throw new OfflineVaultError('离线草稿已锁定，请用本机口令重新解锁。', 'LOCKED'); };
const unavailable = (): never => { throw new OfflineVaultError('此浏览器无法使用加密草稿库，请保留当前输入和附件原件。', 'UNAVAILABLE'); };
function cryptoApi(): Crypto { if (!globalThis.crypto?.subtle) return unavailable(); return globalThis.crypto; }
function passphraseValid(value: string): void { if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw new OfflineVaultError('本机口令需为12至256个字符。', 'INVALID'); }
function exactKeys(value: object, keys: string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function base64(bytes: Uint8Array): string {
  let output = ''; const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  output = btoa(chunks.join('')); return output;
}
function base64Valid(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string' || value.length < 4 * Math.ceil(min / 3) || value.length > 4 * Math.ceil(max / 3) || value.length % 4) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0, end = value.length - padding;
  for (let index = 0; index < end; index++) {
    const code = value.charCodeAt(index);
    if (!(code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47)) return false;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', last = alphabet.indexOf(value[end - 1]);
  if (padding === 2 && (last & 15) !== 0 || padding === 1 && (last & 3) !== 0) return false;
  const length = value.length / 4 * 3 - padding; return length >= min && length <= max;
}
function unbase64(value: unknown, min: number, max: number): Uint8Array<ArrayBuffer> {
  if (!base64Valid(value, min, max)) return invalid();
  let raw: string; try { raw = atob(value); } catch { return invalid(); }
  if (raw.length < min || raw.length > max) return invalid();
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  return bytes;
}
function envelope(value: unknown): OfflineVaultEnvelope {
  if (!object(value) || !exactKeys(value, ['format', 'version', 'vaultId', 'revision', 'kdf', 'iterations', 'salt', 'cipher', 'iv', 'ciphertext']) ||
      value.format !== FORMAT || value.version !== VERSION || typeof value.vaultId !== 'string' || !UUID.test(value.vaultId) ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || (value.revision as number) > 0x7fffffff ||
      value.kdf !== 'PBKDF2-SHA256' || value.iterations !== ITERATIONS || value.cipher !== 'AES-GCM-256') return invalid();
  unbase64(value.salt, 16, 16); unbase64(value.iv, 12, 12);
  // Check the large field without allocating its decoded form before a decrypt is actually requested.
  if (!base64Valid(value.ciphertext, 24, MAX_CIPHERTEXT)) return invalid();
  return { format: FORMAT, version: VERSION, vaultId: value.vaultId, revision: value.revision as number, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: value.salt as string, cipher: 'AES-GCM-256', iv: value.iv as string, ciphertext: value.ciphertext };
}
export function validateOfflineVaultDraft(value: unknown): OfflineVaultDraft {
  if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id) || typeof value.rawText !== 'string' || value.rawText.length > 20000 ||
      typeof value.title !== 'string' || value.title.length > 300 || typeof value.kind !== 'string' || !KINDS.has(value.kind) ||
      typeof value.scope !== 'string' || !SCOPES.has(value.scope) || typeof value.sourceUrl !== 'string' || value.sourceUrl.length > 2048 ||
      !Array.isArray(value.materials) || value.materials.length > OFFLINE_VAULT_MAX_FILES) return invalid();
  let total = 0; const ids = new Set<string>();
  const materials = value.materials.map((item: unknown): OfflineVaultMaterial => {
    if (!object(item) || typeof item.id !== 'string' || !UUID.test(item.id) || ids.has(item.id) || typeof item.filename !== 'string' || !item.filename || item.filename.length > 500 ||
        typeof item.mime !== 'string' || item.mime.length > 200 || !Number.isSafeInteger(item.size) || (item.size as number) < 1 || (item.size as number) > OFFLINE_VAULT_MAX_FILE_SIZE ||
        !(item.blob instanceof Blob) || item.blob.size !== item.size) return invalid();
    total += item.size as number; if (total > OFFLINE_VAULT_MAX_TOTAL_SIZE) return invalid(); ids.add(item.id);
    return { id: item.id, filename: item.filename, mime: item.mime, size: item.size as number, blob: item.blob.slice(0, item.blob.size, item.mime) };
  });
  return { id: value.id, rawText: value.rawText, title: value.title, kind: value.kind as Kind, scope: value.scope as Scope, sourceUrl: value.sourceUrl, materials };
}
export function createOfflineVaultDraft(fields: Partial<OfflineVaultDraft> = {}): OfflineVaultDraft {
  return validateOfflineVaultDraft({ id: cryptoApi().randomUUID(), rawText: '', title: '', kind: 'idea', scope: 'private', sourceUrl: '', materials: [], ...fields });
}
function aad(row: OfflineVaultEnvelope): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([row.format, row.version, row.vaultId, row.revision, row.kdf, row.iterations, row.salt, row.cipher]));
}
async function derive(passphrase: string, row: OfflineVaultEnvelope): Promise<CryptoKey> {
  passphraseValid(passphrase);
  const api = cryptoApi(), bytes = new TextEncoder().encode(passphrase);
  try {
    const material = await api.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await api.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unbase64(row.salt, 16, 16), iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}
async function serialize(input: OfflineVaultDraft): Promise<Uint8Array<ArrayBuffer>> {
  const draft = validateOfflineVaultDraft(input);
  const metadata = { schema: 1, id: draft.id, rawText: draft.rawText, title: draft.title, kind: draft.kind, scope: draft.scope, sourceUrl: draft.sourceUrl,
    materials: draft.materials.map(({ id, filename, mime, size }) => ({ id, filename, mime, size })) };
  const manifest = new TextEncoder().encode(JSON.stringify(metadata)); if (manifest.length > MAX_MANIFEST) return invalid();
  const bytes = new Uint8Array(8 + manifest.length + draft.materials.reduce((sum, item) => sum + item.size, 0));
  bytes.set([74, 86, 68, 49]); new DataView(bytes.buffer).setUint32(4, manifest.length, false); bytes.set(manifest, 8);
  let offset = 8 + manifest.length;
  try { for (const item of draft.materials) { const binary = new Uint8Array(await item.blob.arrayBuffer()); bytes.set(binary, offset); offset += binary.length; binary.fill(0); } return bytes; }
  catch (error) { bytes.fill(0); throw error; }
}
function deserialize(bytes: Uint8Array): OfflineVaultDraft {
  if (bytes.length < 10 || bytes.length > MAX_PLAINTEXT || bytes[0] !== 74 || bytes[1] !== 86 || bytes[2] !== 68 || bytes[3] !== 49) return invalid();
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);
  if (size < 2 || size > MAX_MANIFEST || 8 + size > bytes.length) return invalid();
  let metadata: unknown; try { metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + size))); } catch { return invalid(); }
  if (!object(metadata) || !exactKeys(metadata, ['schema', 'id', 'rawText', 'title', 'kind', 'scope', 'sourceUrl', 'materials']) || metadata.schema !== 1 || !Array.isArray(metadata.materials) || metadata.materials.length > OFFLINE_VAULT_MAX_FILES) return invalid();
  let offset = 8 + size, total = 0;
  const materials = metadata.materials.map((item: unknown) => {
    if (!object(item) || !exactKeys(item, ['id', 'filename', 'mime', 'size']) || typeof item.mime !== 'string' || !Number.isSafeInteger(item.size) || (item.size as number) < 1 || (item.size as number) > OFFLINE_VAULT_MAX_FILE_SIZE) return invalid();
    const length = item.size as number; total += length; if (total > OFFLINE_VAULT_MAX_TOTAL_SIZE || offset + length > bytes.length) return invalid();
    const blob = new Blob([bytes.slice(offset, offset + length)], { type: item.mime }); offset += length;
    return { ...item, blob };
  });
  if (offset !== bytes.length) return invalid();
  return validateOfflineVaultDraft({ ...metadata, materials });
}
async function encrypt(draft: OfflineVaultDraft, row: OfflineVaultEnvelope, key: CryptoKey): Promise<OfflineVaultEnvelope> {
  const plaintext = await serialize(draft), iv = cryptoApi().getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(row), tagLength: 128 }, key, plaintext);
    return { ...row, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
  } finally { plaintext.fill(0); }
}
async function decrypt(row: OfflineVaultEnvelope, key: CryptoKey): Promise<OfflineVaultDraft> {
  const ciphertext = unbase64(row.ciphertext, 24, MAX_CIPHERTEXT); let plaintext: Uint8Array;
  try { plaintext = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: unbase64(row.iv, 12, 12), additionalData: aad(row), tagLength: 128 }, key, ciphertext)); }
  catch { throw new OfflineVaultError('口令不正确或文件已损坏，原草稿未被覆盖。', 'BAD_PASSPHRASE'); }
  finally { ciphertext.fill(0); }
  try { return deserialize(plaintext); } finally { plaintext.fill(0); }
}
async function readPackage(file: Blob): Promise<OfflineVaultEnvelope> {
  if (!(file instanceof Blob) || file.size < 1 || file.size > OFFLINE_VAULT_MAX_PACKAGE_SIZE) return invalid();
  let value: unknown; try { value = JSON.parse(await file.text()); } catch { return invalid(); }
  return envelope(value);
}
/** Explicit portable import: decrypts only in memory and never touches the browser vault. */
export async function decryptOfflinePackage(file: Blob, passphrase: string): Promise<OfflineVaultDraft> {
  passphraseValid(passphrase); const row = await readPackage(file); return decrypt(row, await derive(passphrase, row));
}
function sameRevision(value: unknown, expected: OfflineVaultRevision | null): boolean {
  return expected === null ? value === null || value === undefined : object(value) && value.vaultId === expected.vaultId && value.revision === expected.revision && value.salt === expected.salt && value.iv === expected.iv && value.ciphertext === expected.ciphertext;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new OfflineVaultError('此浏览器不能打开离线草稿库。', 'UNAVAILABLE')); return; }
    let request: IDBOpenDBRequest; try { request = indexedDB.open(DB, 1); } catch { reject(new OfflineVaultError('无法打开离线草稿库。', 'UNAVAILABLE')); return; }
    let settled = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
    request.onerror = request.onblocked = () => { settled = true; reject(new OfflineVaultError('离线草稿库暂不可用，请关闭其他旧页面后重试。', 'UNAVAILABLE')); };
  });
}
function browserStorage(): OfflineVaultStorage {
  return {
    async read() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        let value: unknown = null; const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).get(ROW);
        request.onsuccess = () => { value = request.result ?? null; };
        tx.oncomplete = () => { db.close(); resolve(value); };
        tx.onerror = tx.onabort = () => { db.close(); reject(new OfflineVaultError('无法读取离线草稿库。', 'UNAVAILABLE')); };
      });
    },
    async compareAndSwap(expected, next, signal) {
      const db = await openDatabase();
      if (signal.aborted) { db.close(); return locked(); }
      return new Promise<void>((resolve, reject) => {
        let failure: OfflineVaultError | undefined;
        const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE), request = store.get(ROW);
        const abort = () => { failure = new OfflineVaultError('离线草稿已锁定，保存已停止。', 'LOCKED'); try { tx.abort(); } catch { /* already completed */ } };
        signal.addEventListener('abort', abort, { once: true });
        const close = () => { signal.removeEventListener('abort', abort); db.close(); };
        request.onsuccess = () => {
          if (signal.aborted) { abort(); return; }
          if (!sameRevision(request.result, expected)) { failure = new OfflineVaultError('另一页面已有草稿更新，当前输入尚未覆盖保存。', 'CONFLICT'); tx.abort(); return; }
          store.put(next, ROW);
        };
        tx.oncomplete = () => { close(); resolve(); };
        tx.onerror = tx.onabort = () => { close(); reject(failure || new OfflineVaultError('离线草稿未能保存，请保留当前输入。', 'UNAVAILABLE')); };
      });
    }
  };
}
/** The instance keeps only an in-memory CryptoKey and encrypted metadata, never a draft or passphrase. */
export class OfflineVault {
  private key?: CryptoKey;
  private current?: OfflineVaultEnvelope;
  private controller = new AbortController();
  constructor(private readonly storage: OfflineVaultStorage = browserStorage()) {}
  get unlocked(): boolean { return !!this.key && !!this.current && !this.controller.signal.aborted; }
  lock(): void { this.controller.abort(); this.controller = new AbortController(); this.key = undefined; this.current = undefined; }
  private check(signal: AbortSignal): void { if (signal.aborted || signal !== this.controller.signal) return locked(); }
  private session(): { key: CryptoKey; row: OfflineVaultEnvelope; signal: AbortSignal } { if (!this.key || !this.current) return locked(); return { key: this.key, row: this.current, signal: this.controller.signal }; }
  async exists(): Promise<boolean> { const value = await this.storage.read(); if (value === null) return false; envelope(value); return true; }
  async create(passphrase: string, draft = createOfflineVaultDraft()): Promise<OfflineVaultDraft> {
    passphraseValid(passphrase); const clean = validateOfflineVaultDraft(draft); this.lock(); const signal = this.controller.signal;
    const row: OfflineVaultEnvelope = { format: FORMAT, version: VERSION, vaultId: cryptoApi().randomUUID(), revision: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: base64(cryptoApi().getRandomValues(new Uint8Array(16))), cipher: 'AES-GCM-256', iv: '', ciphertext: '' };
    const key = await derive(passphrase, row); this.check(signal);
    const next = await encrypt(clean, row, key); this.check(signal);
    await this.storage.compareAndSwap(null, next, signal); this.check(signal); this.key = key; this.current = next; return clean;
  }
  async unlock(passphrase: string): Promise<OfflineVaultDraft> {
    passphraseValid(passphrase); this.lock(); const signal = this.controller.signal;
    const value = await this.storage.read(); this.check(signal); if (value === null) throw new OfflineVaultError('本机还没有离线草稿，请先创建。', 'INVALID');
    const row = envelope(value), key = await derive(passphrase, row); this.check(signal);
    const draft = await decrypt(row, key); this.check(signal); this.key = key; this.current = row; return draft;
  }
  async load(): Promise<OfflineVaultDraft> {
    const { key, row, signal } = this.session(), value = await this.storage.read(); this.check(signal);
    if (!sameRevision(value, row)) return conflict();
    const draft = await decrypt(envelope(value), key); this.check(signal); return draft;
  }
  async save(draft: OfflineVaultDraft): Promise<OfflineVaultDraft> {
    const clean = validateOfflineVaultDraft(draft), { key, row, signal } = this.session(); if (row.revision >= 0x7fffffff) return invalid();
    const next = await encrypt(clean, { ...row, revision: row.revision + 1 }, key); this.check(signal);
    await this.storage.compareAndSwap(row, next, signal); this.check(signal); this.current = next; return clean;
  }
  async exportPackage(): Promise<Blob> {
    const expected = this.current, signal = this.controller.signal;
    const value = await this.storage.read(); if (value === null) throw new OfflineVaultError('本机还没有可导出的加密草稿。', 'INVALID');
    if (expected) { this.check(signal); if (!sameRevision(value, expected)) return conflict(); }
    return new Blob([JSON.stringify(envelope(value))], { type: 'application/json' });
  }
  async importPackage(file: Blob, passphrase: string): Promise<OfflineVaultDraft> {
    passphraseValid(passphrase); this.lock(); const signal = this.controller.signal, row = await readPackage(file); this.check(signal);
    const key = await derive(passphrase, row); this.check(signal); const draft = await decrypt(row, key); this.check(signal);
    await this.storage.compareAndSwap(null, row, signal); this.check(signal); this.key = key; this.current = row; return draft;
  }
  /** Explicit conflict choice only. Decrypt first, then atomically replace the exact observed local row. */
  async replaceForSync(file: Blob, passphrase: string, expected: OfflineVaultRevision | null, stillCurrent: () => boolean = () => true, syncSignal?: AbortSignal): Promise<OfflineVaultDraft> {
    passphraseValid(passphrase); const signal = this.controller.signal, writeSignal = syncSignal ? AbortSignal.any([signal, syncSignal]) : signal;
    const check = () => { this.check(signal); if (writeSignal.aborted || !stillCurrent()) throw new DOMException('Aborted', 'AbortError'); };
    const before = await this.storage.read(); check(); if (!sameRevision(before, expected)) return conflict();
    const row = await readPackage(file); check(); const key = await derive(passphrase, row); check();
    const draft = await decrypt(row, key); check();
    await this.storage.compareAndSwap(expected, row, writeSignal); check(); this.key = key; this.current = row; return draft;
  }
}
