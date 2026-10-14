import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { hostname, platform, release, cpus, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type RecordKind = 'members' | 'devices' | 'projects' | 'tasks' | 'experiences';
export interface RecordData {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}
export interface Member extends RecordData {
  name: string;
  role: string;
  voice: string;
  wakeWord: string;
  preferences: string;
}
export interface Conversation {
  id: string;
  actorId: string;
  memberId: string;
  title: string;
  sessionPath: string | null;
  createdAt: string;
}
export interface Message {
  id: string;
  role: string;
  content: string;
  status: string;
  createdAt: string;
}
export interface AuditEntry {
  id: number;
  action: string;
  subjectId: string;
  details: unknown;
  createdAt: string;
}

export class StoreAccessError extends Error {
  constructor() { super('无权访问此会话'); this.name = 'StoreAccessError'; }
}
export class StoreNotFoundError extends Error {
  constructor(message = '记录不存在') { super(message); this.name = 'StoreNotFoundError'; }
}
export class StoreConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'StoreConflictError'; }
}

const kinds: readonly string[] = ['members', 'devices', 'projects', 'tasks', 'experiences'];
const now = () => new Date().toISOString();
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
const sensitiveKey = /password|secret|token|authorization|api[_-]?key|credential|cookie|private[_-]?key/i;
const conversationTextKey = /^(content|message|messages|prompt|transcript|text|chat|conversation|history)$/i;

function recordKind(kind: string): RecordKind {
  if (!kinds.includes(kind)) throw new TypeError('未知记录类型');
  return kind as RecordKind;
}
function encode(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined) throw new TypeError('值必须可保存为 JSON');
  return result;
}
function rejectSecrets(value: unknown, depth = 0): void {
  if (depth > 8) throw new TypeError('配置嵌套过深');
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (sensitiveKey.test(key)) throw new TypeError('密钥不可写入普通设置');
    rejectSecrets(nested, depth + 1);
  }
}
function compactAudit(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[OMITTED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[^\s]+|\bsk-[A-Za-z0-9_-]+/gi, '[REDACTED]').slice(0, 180);
  }
  if (Array.isArray(value)) return value.slice(0, 5).map(item => compactAudit(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [
      key,
      sensitiveKey.test(key) || conversationTextKey.test(key) ? '[REDACTED]' : compactAudit(item, depth + 1),
    ]));
  }
  return '[OMITTED]';
}

/** Single-host persistent business state. Pi session bodies remain in their own session storage. */
export class Store {
  readonly databasePath: string;
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dataDir: string) {
    const directory = resolve(dataDir);
    mkdirSync(directory, { recursive: true });
    this.databasePath = resolve(directory, 'jarvis.db');
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 1) {
      this.db.close();
      throw new Error('数据库版本比当前程序新，拒绝降级打开');
    }
    if (version < 1) this.migrate();
    this.seed();
  }

  private migrate(): void {
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE records (
          type TEXT NOT NULL CHECK(type IN ('members','devices','projects','tasks','experiences')),
          id TEXT NOT NULL,
          json TEXT NOT NULL CHECK(json_valid(json)),
          PRIMARY KEY(type, id)
        );
        CREATE TABLE auth (
          id INTEGER PRIMARY KEY CHECK(id=1),
          salt TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
        CREATE TABLE logins (
          tokenHash TEXT PRIMARY KEY,
          expiresAt INTEGER NOT NULL,
          createdAt TEXT NOT NULL
        );
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          actorId TEXT NOT NULL,
          memberId TEXT NOT NULL,
          title TEXT NOT NULL,
          sessionPath TEXT,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX conversations_actor ON conversations(actorId, createdAt);
        CREATE TABLE messages (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX messages_conversation ON messages(conversationId, sequence);
        CREATE TABLE settings (key TEXT PRIMARY KEY, json TEXT NOT NULL CHECK(json_valid(json)));
        CREATE TABLE audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          subjectId TEXT NOT NULL,
          details TEXT NOT NULL CHECK(json_valid(details)),
          createdAt TEXT NOT NULL
        );
        PRAGMA user_version=1;
      `);
    });
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private seed(): void {
    const timestamp = now();
    this.transaction(() => {
      if (!this.get('members', 'owner')) {
        this.insert('members', {
          id: 'owner', name: '我', role: 'owner', voice: '默认', wakeWord: '贾维斯', preferences: '',
          createdAt: timestamp, updatedAt: timestamp,
        });
      }
      const processors = cpus();
      const memoryBytes = totalmem();
      const machine = {
        name: hostname(), host: hostname(), hostName: hostname(), address: '127.0.0.1',
        role: '开发环境', os: `${platform()} ${release()}`, platform: platform(),
        cpu: processors[0]?.model || '未知', cores: processors.length,
        memoryGB: Math.round(memoryBytes / 1024 ** 3), ramGiB: Math.round(memoryBytes / 1024 ** 3), memoryBytes,
        status: 'online', source: 'local-system', lastSeen: timestamp, reportedAt: timestamp,
      };
      if (this.get('devices', 'local')) this.updateRecord('devices', 'local', machine);
      else this.insert('devices', { ...machine, id: 'local', createdAt: timestamp, updatedAt: timestamp });
    });
  }

  private insert(kind: string, data: RecordData): void {
    this.db.prepare('INSERT INTO records(type,id,json) VALUES(?,?,?)').run(recordKind(kind), data.id, encode(data));
  }
  list(kind: string): RecordData[] {
    return this.db.prepare('SELECT json FROM records WHERE type=? ORDER BY rowid').all(recordKind(kind))
      .map(row => JSON.parse(String(row.json)) as RecordData);
  }
  get(kind: string, id: string): RecordData | undefined {
    const row = this.db.prepare('SELECT json FROM records WHERE type=? AND id=?').get(recordKind(kind), id);
    return row ? JSON.parse(String(row.json)) as RecordData : undefined;
  }
  create(kind: string, data: Record<string, unknown>): RecordData {
    const timestamp = now();
    const result = { ...data, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp } as RecordData;
    this.insert(kind, result);
    return result;
  }
  update(kind: string, id: string, patch: Record<string, unknown>): RecordData {
    return this.transaction(() => this.updateRecord(kind, id, patch));
  }
  private updateRecord(kind: string, id: string, patch: Record<string, unknown>): RecordData {
    const previous = this.get(kind, id);
    if (!previous) throw new StoreNotFoundError();
    const result = { ...previous, ...patch, id: previous.id, createdAt: previous.createdAt, updatedAt: now() };
    this.db.prepare('UPDATE records SET json=? WHERE type=? AND id=?').run(encode(result), recordKind(kind), id);
    return result;
  }

  hasAccount(): boolean {
    return !!this.db.prepare('SELECT id FROM auth WHERE id=1').get();
  }
  setPassword(password: string): void {
    if (!password) throw new TypeError('密码不能为空');
    const salt = randomBytes(32).toString('hex');
    const passwordHash = scryptSync(password, salt, 64).toString('hex');
    this.transaction(() => {
      if (this.hasAccount()) throw new StoreConflictError('管理账号已经初始化');
      this.db.prepare('INSERT INTO auth(id,salt,passwordHash,createdAt) VALUES(1,?,?,?)').run(salt, passwordHash, now());
    });
  }
  verifyPassword(password: string): boolean {
    const row = this.db.prepare('SELECT salt,passwordHash FROM auth WHERE id=1').get();
    if (!row) return false;
    const expected = Buffer.from(String(row.passwordHash), 'hex');
    const supplied = scryptSync(password, String(row.salt), 64);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }
  createLogin(): string {
    if (!this.hasAccount()) throw new StoreConflictError('请先初始化管理账号');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    this.transaction(() => {
      this.db.prepare('DELETE FROM logins WHERE expiresAt<=?').run(Date.now());
      this.db.prepare('INSERT INTO logins(tokenHash,expiresAt,createdAt) VALUES(?,?,?)').run(hashToken(token), expiresAt, now());
    });
    return token;
  }
  validateLogin(token: string): boolean {
    if (!token) return false;
    const row = this.db.prepare('SELECT expiresAt FROM logins WHERE tokenHash=?').get(hashToken(token));
    return !!row && Number(row.expiresAt) > Date.now();
  }
  deleteLogin(token: string): void {
    this.db.prepare('DELETE FROM logins WHERE tokenHash=?').run(hashToken(token));
  }

  createConversation(actorId: string, memberId: string, title: string, trustedMember = false): Conversation {
    if (!actorId.trim()) throw new TypeError('会话身份不能为空');
    if (!this.get('members', memberId) && !trustedMember) throw new StoreNotFoundError('成员不存在');
    const result: Conversation = { id: randomUUID(), actorId, memberId, title, sessionPath: null, createdAt: now() };
    this.db.prepare('INSERT INTO conversations(id,actorId,memberId,title,sessionPath,createdAt) VALUES(?,?,?,?,?,?)')
      .run(result.id, actorId, memberId, title, null, result.createdAt);
    return result;
  }
  listConversations(actorId: string, memberId?: string): Conversation[] {
    const statement = memberId
      ? this.db.prepare('SELECT * FROM conversations WHERE actorId=? AND memberId=? ORDER BY rowid DESC')
      : this.db.prepare('SELECT * FROM conversations WHERE actorId=? ORDER BY rowid DESC');
    return (memberId ? statement.all(actorId, memberId) : statement.all(actorId)) as unknown as Conversation[];
  }
  getConversation(actorId: string, id: string): Conversation | undefined {
    const result = this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id) as unknown as Conversation | undefined;
    if (result && result.actorId !== actorId) throw new StoreAccessError();
    return result;
  }
  private requireConversation(actorId: string, id: string): Conversation {
    const result = this.getConversation(actorId, id);
    if (!result) throw new StoreNotFoundError('会话不存在');
    return result;
  }
  setSessionPath(actorId: string, id: string, path: string): void {
    this.requireConversation(actorId, id);
    if (!path.trim()) throw new TypeError('会话路径不能为空');
    this.db.prepare('UPDATE conversations SET sessionPath=? WHERE id=? AND actorId=?').run(path, id, actorId);
  }
  messages(actorId: string, conversationId: string): Message[] {
    this.requireConversation(actorId, conversationId);
    return this.db.prepare('SELECT id,role,content,status,createdAt FROM messages WHERE conversationId=? ORDER BY sequence')
      .all(conversationId) as unknown as Message[];
  }
  addMessage(actorId: string, conversationId: string, data: { role: string; content: string; status: string }): Message {
    this.requireConversation(actorId, conversationId);
    const result: Message = { id: randomUUID(), role: data.role, content: data.content, status: data.status, createdAt: now() };
    this.db.prepare('INSERT INTO messages(id,conversationId,role,content,status,createdAt) VALUES(?,?,?,?,?,?)')
      .run(result.id, conversationId, result.role, result.content, result.status, result.createdAt);
    return result;
  }

  conversationActivity(actorId: string, id: string): string {
    const conversation = this.requireConversation(actorId, id);
    const last = this.db.prepare('SELECT MAX(createdAt) AS at FROM messages WHERE conversationId=?').get(id);
    return typeof last?.at === 'string' ? last.at : conversation.createdAt;
  }

  /** Owned removal cascades message bodies. Canonical Pi files are removed separately. */
  deleteConversation(actorId: string, id: string): void {
    this.requireConversation(actorId, id);
    this.db.prepare('DELETE FROM conversations WHERE id=? AND actorId=?').run(id, actorId);
    this.audit('conversation.removed', id, { actorId });
  }

  conversationActors(): string[] {
    return this.db.prepare('SELECT DISTINCT actorId FROM conversations').all().map(row => String(row.actorId));
  }

  setSetting(key: string, value: unknown): void {
    if (!key.trim() || sensitiveKey.test(key)) throw new TypeError('密钥不可写入普通设置');
    rejectSecrets(value);
    this.db.prepare('INSERT INTO settings(key,json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json')
      .run(key, encode(value));
  }
  getSetting<T = unknown>(key: string): T | undefined {
    const row = this.db.prepare('SELECT json FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(String(row.json)) as T : undefined;
  }
  audit(action: string, subjectId: string, details: unknown = {}): void {
    this.db.prepare('INSERT INTO audit(action,subjectId,details,createdAt) VALUES(?,?,?,?)')
      .run(action.slice(0, 100), subjectId.slice(0, 120), encode(compactAudit(details)), now());
  }
  listAudit(): AuditEntry[] {
    return this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50').all()
      .map(row => ({ ...row, details: JSON.parse(String(row.details)) }) as unknown as AuditEntry);
  }
  backup(targetPath: string): void {
    const target = resolve(targetPath);
    if (target === this.databasePath) throw new TypeError('备份目标不能覆盖当前数据库');
    mkdirSync(dirname(target), { recursive: true });
    this.db.prepare('VACUUM INTO ?').run(target);
  }
  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}
