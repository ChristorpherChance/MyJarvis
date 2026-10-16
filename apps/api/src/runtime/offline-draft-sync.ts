import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {IdentityRuntime,RuntimeAccessError} from './identity.js';

const OWNER='server-admin',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CIPHER=64*1024*1024+128*1024+8+16,MAX_PACKAGE=4*Math.ceil(MAX_CIPHER/3)+4096;
const KEYS=['format','version','vaultId','revision','kdf','iterations','salt','cipher','iv','ciphertext'];
type Envelope={format:string;version:number;vaultId:string;revision:number;kdf:string;iterations:number;salt:string;cipher:string;iv:string;ciphertext:string};
export interface OfflineSyncMetadata {revision:number;deleted:boolean;updatedAt:string|null;sha256:string|null;bytes:number;vaultId:string|null;vaultRevision:number|null}
class SyncError extends Error {constructor(public code:string,message:string,public status=400,public current?:OfflineSyncMetadata){super(message)}}
const invalid=():never=>{throw new SyncError('INVALID_INPUT','同步只接收当前格式的密文包与明确的修订编号。')};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
function exact(value:Record<string,unknown>,keys:string[]){return Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))}
function base64(value:unknown,min:number,max:number):value is string{
 if(typeof value!=='string'||value.length%4||value.length<4*Math.ceil(min/3)||value.length>4*Math.ceil(max/3))return false;
 const bytes=Buffer.from(value,'base64');return bytes.length>=min&&bytes.length<=max&&bytes.toString('base64')===value;
}
function encrypted(value:unknown):Envelope{
 if(!object(value)||!exact(value,KEYS)||value.format!=='jarvis-offline-vault'||value.version!==1||typeof value.vaultId!=='string'||!UUID.test(value.vaultId)||!Number.isSafeInteger(value.revision)||(value.revision as number)<1||(value.revision as number)>0x7fffffff||value.kdf!=='PBKDF2-SHA256'||value.iterations!==600000||value.cipher!=='AES-GCM-256'||!base64(value.salt,16,16)||!base64(value.iv,12,12)||!base64(value.ciphertext,24,MAX_CIPHER))return invalid();
 return Object.fromEntries(KEYS.map(key=>[key,value[key]])) as unknown as Envelope;
}
/** One encrypted remote slot. Receipt rows never retain a package or prior body. */
export class OfflineDraftSync {
 private db:DatabaseSync;private closed=false;
 constructor(databasePath:string,private identity:IdentityRuntime){this.db=new DatabaseSync(databasePath);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS runtime_offline_draft_sync(owner TEXT PRIMARY KEY,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,envelope TEXT,sha256 TEXT,bytes INTEGER NOT NULL DEFAULT 0,vault_id TEXT,vault_revision INTEGER);
 CREATE TABLE IF NOT EXISTS runtime_offline_draft_sync_receipts(owner TEXT NOT NULL,command_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner,command_id));`)}
 authorize(request:FastifyRequest){const principal=this.identity.principal(request,!Object.hasOwn(request.cookies||{},'jarvis_member_session'));if(!principal.administrator||principal.actorId!==OWNER)throw new RuntimeAccessError('ADMIN_REQUIRED','请以当前本人管理员身份启用密文草稿同步。',403);this.identity.requireAdmin(request);if(!this.identity.isPrincipalCurrent(principal))throw new RuntimeAccessError('LOGIN_REQUIRED','登录已失效，请重新验证。',401);return principal}
 metadata():OfflineSyncMetadata{const row=this.db.prepare('SELECT revision,updated_at,sha256,bytes,vault_id,vault_revision,envelope IS NULL AS deleted FROM runtime_offline_draft_sync WHERE owner=?').get(OWNER);return row?{revision:Number(row.revision),deleted:!!row.deleted,updatedAt:String(row.updated_at),sha256:row.sha256===null?null:String(row.sha256),bytes:Number(row.bytes),vaultId:row.vault_id===null?null:String(row.vault_id),vaultRevision:row.vault_revision===null?null:Number(row.vault_revision)}:{revision:0,deleted:true,updatedAt:null,sha256:null,bytes:0,vaultId:null,vaultRevision:null}}
 package(revision:number){const current=this.metadata();if(current.revision!==revision)throw new SyncError('CONFLICT','远端修订已经变化，请重新比较。',409,current);if(current.deleted)throw new SyncError('DELETED','远端当前没有密文草稿。',404,current);const row=this.db.prepare('SELECT envelope FROM runtime_offline_draft_sync WHERE owner=?').get(OWNER)!;return {...current,envelope:JSON.parse(String(row.envelope)) as Envelope}}
 command(input:unknown){
  if(!object(input)||typeof input.commandId!=='string'||!UUID.test(input.commandId)||!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision as number)<0||(input.expectedRevision as number)>0x7fffffff||input.confirmed!==true||!['put','delete'].includes(String(input.action))||!exact(input,input.action==='put'?['commandId','expectedRevision','action','confirmed','envelope']:['commandId','expectedRevision','action','confirmed']))return invalid();
  const value=input.action==='put'?encrypted(input.envelope):null,serialized=value?JSON.stringify(value):null;if(serialized&&Buffer.byteLength(serialized)>MAX_PACKAGE)return invalid();
  const fingerprint=hash(JSON.stringify([input.action,input.expectedRevision,serialized?hash(serialized):null])),id=input.commandId,now=new Date().toISOString();
  this.db.exec('BEGIN IMMEDIATE');try{
   const previous=this.db.prepare('SELECT fingerprint,result FROM runtime_offline_draft_sync_receipts WHERE owner=? AND command_id=?').get(OWNER,id);if(previous){if(previous.fingerprint!==fingerprint)throw new SyncError('COMMAND_REUSED','同一操作编号不能改写内容。',409);const result=JSON.parse(String(previous.result));this.db.exec('COMMIT');return {...result,replayed:true}}
   const current=this.metadata();if(current.revision!==input.expectedRevision)throw new SyncError('CONFLICT','另一浏览器已更新远端，请先比较并选择保留哪一份。',409,current);if(current.revision>=0x7fffffff)throw new SyncError('REVISION_LIMIT','远端修订已达上限，请停止同步并保留本机备份。',409,current);
   const revision=current.revision+1;this.db.prepare(`INSERT INTO runtime_offline_draft_sync(owner,revision,updated_at,envelope,sha256,bytes,vault_id,vault_revision) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,envelope=excluded.envelope,sha256=excluded.sha256,bytes=excluded.bytes,vault_id=excluded.vault_id,vault_revision=excluded.vault_revision`).run(OWNER,revision,now,serialized,serialized?hash(serialized):null,serialized?Buffer.byteLength(serialized):0,value?.vaultId??null,value?.revision??null);
   // Explicit remote forgetting also removes old receipt metadata. Tombstone CAS
   // still rejects a late old write, and the delete itself remains retryable.
   if(input.action==='delete')this.db.prepare('DELETE FROM runtime_offline_draft_sync_receipts WHERE owner=?').run(OWNER);
   const result={...this.metadata(),replayed:false};this.db.prepare('INSERT INTO runtime_offline_draft_sync_receipts(owner,command_id,fingerprint,result,created_at) VALUES(?,?,?,?,?)').run(OWNER,id,fingerprint,JSON.stringify(result),now);this.db.prepare('DELETE FROM runtime_offline_draft_sync_receipts WHERE owner=? AND command_id NOT IN(SELECT command_id FROM runtime_offline_draft_sync_receipts WHERE owner=? ORDER BY rowid DESC LIMIT 128)').run(OWNER,OWNER);this.db.exec('COMMIT');return result;
  }catch(error){this.db.exec('ROLLBACK');throw error}
 }
 close(){if(!this.closed){this.closed=true;this.db.close()}}
}
export function registerOfflineDraftSync(app:FastifyInstance,identity:IdentityRuntime,databasePath:string){
 const sync=new OfflineDraftSync(databasePath,identity);
 const handle=(action:(request:FastifyRequest)=>unknown)=>async(request:FastifyRequest,reply:any)=>{reply.header('cache-control','no-store');try{sync.authorize(request);return action(request)}catch(error){if(error instanceof SyncError)return reply.code(error.status).send({error:{code:error.code,message:error.message},...(error.current?{current:error.current}:{})});if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});throw error}};
 app.get('/api/runtime/offline-draft-sync',handle(()=>sync.metadata()));
 app.get('/api/runtime/offline-draft-sync/package',handle(request=>{const query=request.query as {revision?:string};if(!/^(?:0|[1-9]\d{0,9})$/.test(query?.revision||''))return invalid();return sync.package(Number(query.revision))}));
 app.post('/api/runtime/offline-draft-sync/commands',{bodyLimit:MAX_PACKAGE+8192,config:{rateLimit:{max:30,timeWindow:'1 minute'}}},handle(request=>sync.command(request.body)));
 app.addHook('onClose',async()=>sync.close());return sync;
}
