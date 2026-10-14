import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Store } from '../store.js';
import type { PiService, PiCallbacks } from '../pi.js';
import {cloudGate} from './voice-policy.js';
import {PublicAnswerFilter,publicAnswer} from '../public-answer.js';
import {FamilySpeechSegments,permitsDirectVoiceReply,waitingSpeechText} from './family-speech.js';
import {memberReplyLanguage,replyLanguageSchema,replyLanguageRevision,resolveReplyLanguage,type ReplyLanguage} from './conversation-language.js';

export const MEMBER_COOKIE = 'jarvis_member_session';
const ADMIN_COOKIE = 'jarvis_session';
const stamp = () => new Date().toISOString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class RuntimeAccessError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) { super(message); }
}
export type RuntimePrincipal = { actorId: string; profileId: string; administrator: boolean; credentialId?: string; authorizationHash?: string };
export type RuntimeProfile = { id: string; name: string; preferences?: unknown; voice?: string; wakeWord?: string; [key: string]: unknown };
export interface IdentityOptions {
  memberExists: (id: string) => boolean;
  memberProfile: (id: string) => RuntimeProfile | undefined;
  terminalExists?: (id: string) => boolean;
  callbacksForMember?: (profileId: string, actorId: string, principal?: RuntimePrincipal, context?: {cloudConsent:boolean}) => PiCallbacks;
  setReplyLanguage?: (principal:RuntimePrincipal,input:{expectedVersion:number;replyLanguage:ReplyLanguage})=>RuntimeProfile|Promise<RuntimeProfile>;
  beforeRun?: (actorId: string, conversationId: string) => void | Promise<void>;
  onConversationComplete?: (actorId: string, conversationId: string) => void | Promise<void>;
  onUsage?: (actorId: string, conversationId: string, usage: unknown) => void | Promise<void>;
}
/** Routes in this set authenticate inside this module. They never grant an admin cookie. */
export function runtimeOwnAuthRoute(route: string): boolean {
  return ['/api/runtime/identity/login', '/api/runtime/identity/logout', '/api/runtime/identity/state', '/api/runtime/terminals/claim'].includes(route)
    || route.startsWith('/api/runtime/family/')
    || (route.startsWith('/api/runtime/voice/') && !route.startsWith('/api/runtime/voice/engines'));
}
export function runtimeHandler(fn: (req: any, reply: FastifyReply) => unknown | Promise<unknown>) {
  return async (req: any, reply: FastifyReply) => {
    try { return await fn(req, reply); }
    catch (error) {
      if (error instanceof RuntimeAccessError) return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
      if (error instanceof z.ZodError) return reply.code(400).send({error:{code:'INVALID_INPUT',message:'请检查输入格式'}});
      throw error;
    }
  };
}

/** Identity tables share jarvis.db so the platform's existing consistent backup includes them. */
export class IdentityRuntime {
  readonly db: DatabaseSync;
  private closed = false;
  constructor(readonly store: Store, readonly options: IdentityOptions) {
    this.db = new DatabaseSync(store.databasePath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_member_credentials(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL,kind TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_member_sessions(token_hash TEXT PRIMARY KEY,credential_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_auth_throttle(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_at INTEGER NOT NULL,locked_until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_pair_tickets(token_hash TEXT PRIMARY KEY,terminal_id TEXT NOT NULL,room_id TEXT NOT NULL,profiles TEXT NOT NULL,expires_at INTEGER NOT NULL,claimed_at TEXT);
      CREATE TABLE IF NOT EXISTS runtime_terminal_bindings(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,terminal_id TEXT NOT NULL UNIQUE,room_id TEXT NOT NULL,profiles TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    `);
  }
  private transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const value=fn(); this.db.exec('COMMIT'); return value; } catch(error) { this.db.exec('ROLLBACK'); throw error; } }
  requireAdmin(req: FastifyRequest): RuntimePrincipal {
    if (!this.store.validateLogin(req.cookies?.[ADMIN_COOKIE] ?? '')) throw new RuntimeAccessError('ADMIN_REQUIRED','请先以管理员登录',401);
    return {actorId:'server-admin',profileId:'me',administrator:true,authorizationHash:hash(req.cookies[ADMIN_COOKIE] ?? '')};
  }
  principal(req: FastifyRequest, allowAdmin = true): RuntimePrincipal {
    // A valid member session takes precedence if a shared browser also has an admin session.
    const member = this.resolveSession(req.cookies?.[MEMBER_COOKIE] ?? '');
    if (member) return member;
    if (allowAdmin && this.store.validateLogin(req.cookies?.[ADMIN_COOKIE] ?? '')) return {actorId:'server-admin',profileId:'me',administrator:true,authorizationHash:hash(req.cookies[ADMIN_COOKIE] ?? '')};
    throw new RuntimeAccessError('LOGIN_REQUIRED','请先验证家庭成员身份',401);
  }
  resolveSession(token: string): RuntimePrincipal | undefined {
    if (!token) return undefined;
    const row=this.db.prepare(`SELECT c.id,c.profile_id,c.disabled FROM runtime_member_sessions s JOIN runtime_member_credentials c ON c.id=s.credential_id WHERE s.token_hash=? AND s.expires_at>?`).get(hash(token),Date.now());
    if (!row || Number(row.disabled) || !this.options.memberExists(String(row.profile_id))) return undefined;
    return {actorId:row.profile_id==='me'?'server-admin':`member_${row.id}`,profileId:String(row.profile_id),credentialId:String(row.id),administrator:false,authorizationHash:hash(token)};
  }
  isPrincipalCurrent(p:RuntimePrincipal):boolean {
    if(!p.authorizationHash)return p.administrator&&p.actorId==='server-admin'; // Internal V1 adapter principal only.
    if(p.administrator){const row=this.db.prepare('SELECT expiresAt FROM logins WHERE tokenHash=?').get(p.authorizationHash);return !!row&&Number(row.expiresAt)>Date.now();}
    const row=this.db.prepare('SELECT c.profile_id,c.disabled FROM runtime_member_sessions s JOIN runtime_member_credentials c ON c.id=s.credential_id WHERE s.token_hash=? AND s.credential_id=? AND s.expires_at>?').get(p.authorizationHash,p.credentialId??'',Date.now());
    return !!row&&!Number(row.disabled)&&row.profile_id===p.profileId&&this.options.memberExists(p.profileId);
  }
  profile(principal: RuntimePrincipal): RuntimeProfile {
    const value=this.options.memberProfile(principal.profileId);
    if (!value) throw new RuntimeAccessError('PROFILE_NOT_FOUND','成员档案不存在或已停用',404);
    return value;
  }
  setCredential(profileId: string, secret: string, kind: 'password'|'pin', disabled = false) {
    if (!this.options.memberExists(profileId)) throw new RuntimeAccessError('PROFILE_NOT_FOUND','成员档案不存在或已停用',404);
    if (kind==='pin'?!/^\d{6,12}$/.test(secret):secret.length<12||secret.length>256) throw new RuntimeAccessError('INVALID_CREDENTIAL','密码至少12位，PIN需6至12位数字');
    const old=this.db.prepare('SELECT id FROM runtime_member_credentials WHERE profile_id=?').get(profileId);
    const id=String(old?.id??randomUUID()), salt=randomBytes(16).toString('hex');
    const digest=scryptSync(secret,salt,32).toString('hex');
    this.transaction(()=>{
      this.db.prepare(`INSERT INTO runtime_member_credentials(id,profile_id,salt,hash,kind,disabled,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(profile_id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,kind=excluded.kind,disabled=excluded.disabled,updated_at=excluded.updated_at`).run(id,profileId,salt,digest,kind,Number(disabled),stamp());
      this.db.prepare('DELETE FROM runtime_member_sessions WHERE credential_id=?').run(id);
    });
    this.store.audit('family.identity.credential',profileId,{kind,disabled});
    return {profileId,kind,configured:true,disabled};
  }
  disableCredential(profileId: string) {
    this.transaction(()=>{ this.db.prepare('UPDATE runtime_member_credentials SET disabled=1,updated_at=? WHERE profile_id=?').run(stamp(),profileId); this.db.prepare('DELETE FROM runtime_member_sessions WHERE credential_id IN(SELECT id FROM runtime_member_credentials WHERE profile_id=?)').run(profileId); });
    this.store.audit('family.identity.disabled',profileId,{}); return {profileId,disabled:true};
  }
  credentials() {return this.db.prepare('SELECT profile_id AS profileId,kind,disabled,updated_at AS updatedAt FROM runtime_member_credentials').all().map(r=>({...r,configured:true,disabled:!!r.disabled}));}
  throttle(key: string, max = 6, windowMs = 60_000) {
    const k=hash(key), time=Date.now(); const row=this.db.prepare('SELECT * FROM runtime_auth_throttle WHERE key=?').get(k);
    if(row&&Number(row.locked_until)>time) throw new RuntimeAccessError('TOO_MANY_ATTEMPTS','验证次数过多，请稍后重试',429);
    const attempts=row&&time-Number(row.window_at)<windowMs?Number(row.attempts)+1:1;
    const windowAt=attempts===1?time:Number(row!.window_at), lockedUntil=attempts>max?time+windowMs:0;
    this.db.prepare('INSERT INTO runtime_auth_throttle(key,attempts,window_at,locked_until) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,window_at=excluded.window_at,locked_until=excluded.locked_until').run(k,attempts,windowAt,lockedUntil);
    if(lockedUntil) throw new RuntimeAccessError('TOO_MANY_ATTEMPTS','验证次数过多，请稍后重试',429);
  }
  login(profileId: string, secret: string, remote: string) {
    this.throttle(`login-ip:${remote}`,30); this.throttle(`login:${remote}:${profileId}`);
    const row=this.db.prepare('SELECT * FROM runtime_member_credentials WHERE profile_id=?').get(profileId);
    // Perform the same password derivation for unknown profiles to reduce an identity oracle.
    const actual=scryptSync(secret,String(row?.salt??'unconfigured-family-identity'),32);
    const expected=row?Buffer.from(String(row.hash),'hex'):Buffer.alloc(32);
    if(!row || !timingSafeEqual(actual,expected) || Number(row.disabled) || !this.options.memberExists(profileId)) throw new RuntimeAccessError('INVALID_CREDENTIALS','身份或凭据不正确',401);
    const token=randomBytes(48).toString('base64url');
    this.db.prepare('DELETE FROM runtime_member_sessions WHERE expires_at<=?').run(Date.now());
    this.db.prepare('INSERT INTO runtime_member_sessions(token_hash,credential_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash(token),String(row.id),Date.now()+8*3600_000,stamp());
    return {token,principal:{actorId:profileId==='me'?'server-admin':`member_${row.id}`,profileId,credentialId:String(row.id),administrator:false,authorizationHash:hash(token)} as RuntimePrincipal};
  }
  logout(token: string) {this.db.prepare('DELETE FROM runtime_member_sessions WHERE token_hash=?').run(hash(token));}
  issuePairing(terminalId: string, roomId: string, profiles: string[]) {
    if(this.options.terminalExists&&!this.options.terminalExists(terminalId))throw new RuntimeAccessError('TERMINAL_NOT_FOUND','请先登记房间终端',404);
    if(!profiles.length || profiles.some(id=>!this.options.memberExists(id))) throw new RuntimeAccessError('PROFILE_NOT_FOUND','请指定有效的允许成员');
    const token=randomBytes(32).toString('base64url'),expiresAt=Date.now()+10*60_000;
    this.db.prepare('DELETE FROM runtime_pair_tickets WHERE expires_at<=?').run(Date.now());
    this.db.prepare('INSERT INTO runtime_pair_tickets(token_hash,terminal_id,room_id,profiles,expires_at) VALUES(?,?,?,?,?)').run(hash(token),terminalId,roomId,JSON.stringify([...new Set(profiles)]),expiresAt);
    return {pairingToken:token,terminalId,roomId,expiresAt:new Date(expiresAt).toISOString(),oneTime:true};
  }
  claimPairing(ticket: string, remote: string) {
    this.throttle(`pair:${remote}`,8); const deviceToken=randomBytes(48).toString('base64url');
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM runtime_pair_tickets WHERE token_hash=? AND expires_at>? AND claimed_at IS NULL').get(hash(ticket),Date.now());
      if(!row) throw new RuntimeAccessError('INVALID_PAIRING','配对码无效、已使用或过期',401);
      const profiles=JSON.parse(String(row.profiles)) as string[];
      if(profiles.some(id=>!this.options.memberExists(id))) throw new RuntimeAccessError('INVALID_PAIRING','配对中的成员档案已变更',409);
      const id=randomUUID();
      this.db.prepare('UPDATE runtime_pair_tickets SET claimed_at=? WHERE token_hash=? AND claimed_at IS NULL').run(stamp(),hash(ticket));
      this.db.prepare('DELETE FROM runtime_terminal_bindings WHERE terminal_id=?').run(String(row.terminal_id));
      this.db.prepare('INSERT INTO runtime_terminal_bindings(id,token_hash,terminal_id,room_id,profiles,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,hash(deviceToken),String(row.terminal_id),String(row.room_id),String(row.profiles),Date.now()+90*86400_000,stamp());
      return {id,terminalId:String(row.terminal_id),roomId:String(row.room_id),allowedProfileIds:profiles,terminalToken:deviceToken,expiresAt:new Date(Date.now()+90*86400_000).toISOString(),identityVerified:false};
    });
  }
  bindings() {return this.db.prepare('SELECT id,terminal_id AS terminalId,room_id AS roomId,profiles,expires_at AS expiresAt,revoked,created_at AS createdAt FROM runtime_terminal_bindings').all().map(({profiles,...r})=>({...r,allowedProfileIds:JSON.parse(String(profiles)),revoked:!!r.revoked}));}
  revokeBinding(id: string) {this.db.prepare('UPDATE runtime_terminal_bindings SET revoked=1 WHERE id=?').run(id);return {id,revoked:true};}
  terminal(req: FastifyRequest, expectedId?: string, principal?: RuntimePrincipal) {
    const supplied=req.headers['x-jarvis-terminal']; const token=typeof supplied==='string'?supplied:'';
    const row=this.db.prepare('SELECT * FROM runtime_terminal_bindings WHERE token_hash=? AND revoked=0 AND expires_at>?').get(hash(token),Date.now());
    if(!row || (expectedId && row.terminal_id!==expectedId)) throw new RuntimeAccessError('TERMINAL_NOT_PAIRED','请先配对当前房间终端',401);
    const profiles=JSON.parse(String(row.profiles)) as string[];
    if(principal && !principal.administrator && !profiles.includes(principal.profileId)) throw new RuntimeAccessError('MEMBER_NOT_ALLOWED','当前成员无权使用此终端',403);
    return {id:String(row.id),terminalId:String(row.terminal_id),roomId:String(row.room_id),allowedProfileIds:profiles};
  }
  close() {if(!this.closed){this.db.close();this.closed=true;}}
}

export function registerIdentityRoutes(app: FastifyInstance, identity: IdentityRuntime, store: Store, pi: PiService) {
  const runLocks=new Set<string>();
  app.get('/api/runtime/identity/state',runtimeHandler(req=>{
    try {const p=identity.principal(req);const profile=identity.profile(p);return {authenticated:true,profileId:p.profileId,administrator:p.administrator,profile:{id:profile.id,name:profile.name,voice:profile.voice,wakeWord:profile.wakeWord}};}
    catch {return {authenticated:false};}
  }));
  app.post('/api/runtime/identity/login',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},runtimeHandler((req,reply)=>{
    const data=z.object({profileId:z.string().min(1).max(128),credential:z.string().min(1).max(256)}).strict().parse(req.body);
    const {token,principal}=identity.login(data.profileId,data.credential,req.ip);
    // A room browser must not retain a parent's administrator privileges after member login.
    const oldAdministrator=req.cookies?.[ADMIN_COOKIE];if(oldAdministrator)identity.store.deleteLogin(oldAdministrator);
    reply.clearCookie(ADMIN_COOKIE,{path:'/',httpOnly:true,sameSite:'strict',secure:req.protocol==='https'});
    reply.setCookie(MEMBER_COOKIE,token,{path:'/',httpOnly:true,sameSite:'strict',secure:req.protocol==='https',maxAge:8*3600});
    const profile=identity.profile(principal); return {authenticated:true,profileId:principal.profileId,profile:{id:profile.id,name:profile.name,voice:profile.voice,wakeWord:profile.wakeWord}};
  }));
  app.post('/api/runtime/identity/logout',runtimeHandler((req,reply)=>{identity.logout(req.cookies?.[MEMBER_COOKIE]??'');reply.clearCookie(MEMBER_COOKIE,{path:'/',httpOnly:true,sameSite:'strict',secure:req.protocol==='https'});return {ok:true};}));
  app.get('/api/runtime/identity/credentials',runtimeHandler(req=>{identity.requireAdmin(req);return {items:identity.credentials()};}));
  app.put('/api/runtime/identity/profiles/:id/credential',runtimeHandler(req=>{
    identity.requireAdmin(req); const data=z.object({credential:z.string().min(1).max(256),kind:z.enum(['password','pin']),disabled:z.boolean().default(false)}).strict().parse(req.body);
    return identity.setCredential(req.params.id,data.credential,data.kind,data.disabled);
  }));
  app.delete('/api/runtime/identity/profiles/:id/credential',runtimeHandler(req=>{identity.requireAdmin(req);return identity.disableCredential(req.params.id);}));
  app.post('/api/runtime/terminals/pair',runtimeHandler(req=>{
    identity.requireAdmin(req);const data=z.object({terminalId:z.string().min(1).max(128),roomId:z.string().min(1).max(128),allowedProfileIds:z.array(z.string().min(1).max(128)).min(1).max(30)}).strict().parse(req.body);
    return identity.issuePairing(data.terminalId,data.roomId,data.allowedProfileIds);
  }));
  app.post('/api/runtime/terminals/claim',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},runtimeHandler(req=>{const {pairingToken}=z.object({pairingToken:z.string().min(20).max(100)}).strict().parse(req.body);return identity.claimPairing(pairingToken,req.ip);}));
  app.get('/api/runtime/terminals/pairings',runtimeHandler(req=>{identity.requireAdmin(req);return {items:identity.bindings()};}));
  app.delete('/api/runtime/terminals/pairings/:id',runtimeHandler(req=>{identity.requireAdmin(req);return identity.revokeBinding(req.params.id);}));
  app.get('/api/runtime/family/profile',runtimeHandler(req=>{const p=identity.principal(req);return {profile:identity.profile(p)};}));
  const replyLanguageState=(profile:RuntimeProfile)=>({replyLanguage:memberReplyLanguage(profile.preferences),revision:replyLanguageRevision(profile.preferences)});
  app.get('/api/runtime/family/reply-language',runtimeHandler(req=>{
    const p=identity.principal(req);return replyLanguageState(identity.profile(p));
  }));
  app.put('/api/runtime/family/reply-language',runtimeHandler(async req=>{
    const p=identity.principal(req),input=z.object({expectedVersion:z.number().int().min(0),replyLanguage:replyLanguageSchema}).strict().parse(req.body);
    if(!identity.isPrincipalCurrent(p))throw new RuntimeAccessError('SESSION_EXPIRED','成员会话已失效，请重新验证',401);
    if(!identity.options.setReplyLanguage)throw new RuntimeAccessError('REPLY_LANGUAGE_UNAVAILABLE','回复语言设置尚未接入',503);
    const profile=await identity.options.setReplyLanguage(p,input);
    if(!identity.isPrincipalCurrent(p))throw new RuntimeAccessError('SESSION_EXPIRED','成员会话已失效，请重新验证',401);
    return replyLanguageState(profile);
  }));
  app.get('/api/runtime/family/conversations',runtimeHandler(req=>{const p=identity.principal(req);const rows=store.listConversations(p.actorId,p.profileId);if(p.profileId==='me')rows.push(...store.listConversations(p.actorId,'owner'));return {items:[...new Map(rows.map(r=>[r.id,r])).values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(({sessionPath,actorId,...r})=>r)};}));
  app.post('/api/runtime/family/conversations',runtimeHandler(req=>{
    const p=identity.principal(req);const {title}=z.object({title:z.string().trim().min(1).max(100).default('语音对话')}).strict().parse(req.body??{});
    identity.profile(p); const {sessionPath,actorId,...r}=store.createConversation(p.actorId,p.profileId,title,true);return r;
  }));
  const owned=(req:any)=>{const p=identity.principal(req);let conversation;try{conversation=store.getConversation(p.actorId,req.params.id);}catch{throw new RuntimeAccessError('FORBIDDEN','不能访问其他成员会话',403);}if(!conversation)throw new RuntimeAccessError('NOT_FOUND','会话不存在',404);return {p,conversation};};
  app.get('/api/runtime/family/conversations/:id/messages',runtimeHandler(req=>{const {p,conversation}=owned(req);return {items:store.messages(p.actorId,conversation.id)};}));
  app.post('/api/runtime/family/conversations/:id/abort',runtimeHandler(async req=>{const {p,conversation}=owned(req);await pi.abort(conversation.id,p.actorId);return {ok:true};}));
  app.post('/api/runtime/family/conversations/:id/messages',runtimeHandler(async(req,reply)=>{
    const {p,conversation}=owned(req),{text,cloudConsent,voiceMode,voiceLanguage}=z.object({text:z.string().trim().min(1).max(16000),cloudConsent:z.boolean().default(false),voiceMode:z.boolean().default(false),voiceLanguage:z.enum(['zh','en','fr','de']).optional()}).strict().parse(req.body);
    const streaming=String(req.headers.accept??'').includes('text/event-stream');let streamStarted=false,partial='',persisted=false;let heartbeat:ReturnType<typeof setInterval>|undefined;
    const emit=(event:string,data:unknown)=>{if(streamStarted&&!reply.raw.destroyed&&!reply.raw.writableEnded){if(!reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))void pi.abort(conversation.id,p.actorId);}};
    if(runLocks.has(conversation.id))throw new RuntimeAccessError('PI_BUSY','当前会话正在回答，请先打断',409);
    if(!pi.health('family-chat').configured)throw new RuntimeAccessError('PI_NOT_CONFIGURED','请管理员配置 Pi 模型与凭证',503);
    const cloud=cloudGate(identity.profile(p).preferences,typeof pi.modelIsLocal==='function'?await pi.modelIsLocal('family-chat'):false,cloudConsent);if(cloud)throw new RuntimeAccessError(cloud,cloud==='CLOUD_FORBIDDEN'?'本人偏好仅本地，当前Pi模型为外部服务':'本轮Pi对话需要明确允许云端处理；也可改用本地模型',403);
    // The privacy adapter may await model discovery; another request or logout can win meanwhile.
    if(runLocks.has(conversation.id))throw new RuntimeAccessError('PI_BUSY','当前会话正在回答，请先打断',409);
    if(!identity.isPrincipalCurrent(p))throw new RuntimeAccessError('SESSION_EXPIRED','成员会话已失效，请重新验证',401);
    runLocks.add(conversation.id);
    let disconnectedState=false;const disconnected=()=>{if(!reply.raw.writableEnded){disconnectedState=true;void pi.abort(conversation.id,p.actorId);}};reply.raw.on('close',disconnected);
    const authorizationMonitor=setInterval(()=>{if(!identity.isPrincipalCurrent(p))void pi.abort(conversation.id,p.actorId);},500);authorizationMonitor.unref();
    try {
      await identity.options.beforeRun?.(p.actorId,conversation.id);
      if(!identity.isPrincipalCurrent(p))throw new RuntimeAccessError('SESSION_EXPIRED','成员会话已失效，请重新验证',401);
      if(disconnectedState||reply.raw.destroyed)return;
      const profile=identity.profile(p),responseLanguage=resolveReplyLanguage(profile.preferences,voiceLanguage,text);const userMessage=store.addMessage(p.actorId,conversation.id,{role:'user',content:text,status:'complete'});
      if(streaming){reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'});streamStarted=true;emit('status',{state:'thinking',userMessageId:userMessage.id,responseLanguage});heartbeat=setInterval(()=>{if(!reply.raw.destroyed&&!reply.raw.writableEnded)reply.raw.write(': heartbeat\n\n');},15000);heartbeat.unref();}
      // Explicit callbacks are mandatory for members; empty lists cannot fall back to administrator data.
      const callbacks=identity.options.callbacksForMember?.(p.profileId,p.actorId,p,{cloudConsent})??{listProjects:()=>[],listDevices:()=>[],listTasks:()=>[],listExperiences:()=>[],listMemory:()=>[],listFamily:()=>[],listKnowledge:()=>[]};
      const privacy=profile.preferences&&typeof profile.preferences==='object'?(profile.preferences as Record<string,unknown>).cloudPrivacy:'ask';
      const visibleStream=new PublicAnswerFilter();let transitionText='';
      const voiceDirectReply=voiceMode&&permitsDirectVoiceReply(text);
      const speech=new FamilySpeechSegments(voiceDirectReply,event=>{if(!disconnectedState&&identity.isPrincipalCurrent(p))emit('speech',event);});
      const result=await pi.run({scenario:'family-chat',actorId:p.actorId,conversationId:conversation.id,member:{name:profile.name,preferences:typeof profile.preferences==='string'?profile.preferences:JSON.stringify(profile.preferences??{})},voiceMode,responseLanguage,voiceDirectReply,text,sessionPath:conversation.sessionPath,requireLocalModel:privacy==='local'||(privacy!=='allowed'&&!cloudConsent),businessCallbacks:callbacks,onSessionPath:path=>store.setSessionPath(p.actorId,conversation.id,path),onEvent:(event,data)=>{if(event==='usage')void identity.options.onUsage?.(p.actorId,conversation.id,data);if(event==='transition'){const waiting=waitingSpeechText(publicAnswer(String(data.text??'')));if(waiting&&!transitionText&&!partial&&!disconnectedState&&identity.isPrincipalCurrent(p)){transitionText=waiting;emit('transition',{text:waiting,approved:true,sequence:0});}}if(event==='delta'){const visible=visibleStream.push(String(data.text??''));partial+=visible;if(partial.length>64000){void pi.abort(conversation.id,p.actorId);return;}if(visible&&!disconnectedState&&identity.isPrincipalCurrent(p)){emit('delta',{...data,text:visible});speech.push(visible);}}else if(['status','route','tool'].includes(event)&&!disconnectedState&&identity.isPrincipalCurrent(p)){if(event==='route')emit(event,{responseLanguage,tier:data.tier,reason:String(data.reason??'').slice(0,100),provider:String(data.provider??'').slice(0,100),model:String(data.model??'').slice(0,200),...(data.fallback?{fallback:String(data.fallback).slice(0,100)}:{})});else if(event==='tool')emit(event,{name:String(data.name??'').slice(0,120),state:data.state});else emit(event,data);}}});
      if(!identity.isPrincipalCurrent(p))throw new RuntimeAccessError('SESSION_EXPIRED','成员会话已失效，回答未向旧会话返回',401);
      const visibleTail=visibleStream.finish();if(visibleTail){partial+=visibleTail;emit('delta',{text:visibleTail});speech.push(visibleTail);}
      if(!disconnectedState)speech.finish(result.status==='complete');
      const message=store.addMessage(p.actorId,conversation.id,{role:'assistant',content:publicAnswer(result.text),status:result.status});persisted=true;
      if(result.status==='complete')await identity.options.onConversationComplete?.(p.actorId,conversation.id);
      if(streaming){emit('done',{message,status:result.status,profileId:p.profileId,responseLanguage,...(voiceMode?{speech:speech.summary(),transition:{segments:transitionText?1:0,text:transitionText}}:{})});return;}
      return {message,status:result.status,profileId:p.profileId,responseLanguage};
    } catch(error){if(!streamStarted)throw error;if(!persisted){try{store.addMessage(p.actorId,conversation.id,{role:'assistant',content:publicAnswer(partial),status:reply.raw.destroyed?'cancelled':'failed'});}catch{}}if(identity.isPrincipalCurrent(p))emit('error',{message:'本轮回答未完成，请检查连接后重试'});
    } finally {clearInterval(authorizationMonitor);clearInterval(heartbeat);reply.raw.off('close',disconnected);runLocks.delete(conversation.id);if(streamStarted&&!reply.raw.destroyed)reply.raw.end();}
  }));
}
