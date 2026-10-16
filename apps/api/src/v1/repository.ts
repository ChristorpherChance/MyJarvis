import { DatabaseSync } from 'node:sqlite';
import { createHash,randomUUID } from 'node:crypto';
import { BusinessError,type BusinessRecord,type CommandContext,type CommandEnvelope,type Domain,type DomainEvent,type DomainHandler,type Scope } from './types.js';

const encode=(value:unknown)=>JSON.stringify(value);
function canonical(value:any):string { if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}' }
function eventPayload(value:Record<string,unknown>){const hidden=/password|secret|token|credential|cookie|content|raw|text|evidence|prompt|transcript/i;return Object.fromEntries(Object.entries(value).filter(([k])=>!hidden.test(k)).slice(0,30))}
export interface CommandReceipt {requestId:string;version:number;data:BusinessRecord;events:DomainEvent[]}
export class V1Repository {
 private db:DatabaseSync;private closed=false;
 private receiptValidator?: (domain:Domain,receipt:CommandReceipt)=>void;
 setReceiptValidator(validator:(domain:Domain,receipt:CommandReceipt)=>void){this.receiptValidator=validator;}
 constructor(databasePath:string){
  this.db=new DatabaseSync(databasePath);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.transaction(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS v1_schema (version INTEGER PRIMARY KEY CHECK(version=1));
   INSERT OR IGNORE INTO v1_schema(version) VALUES(1);
   CREATE TABLE IF NOT EXISTS v1_documents(position INTEGER PRIMARY KEY AUTOINCREMENT,domain TEXT NOT NULL,id TEXT NOT NULL,owner_id TEXT NOT NULL,scope TEXT NOT NULL CHECK(scope IN ('personal','private','family','company')),revision INTEGER NOT NULL CHECK(revision>0),json TEXT NOT NULL CHECK(json_valid(json)),UNIQUE(domain,id));
   CREATE INDEX IF NOT EXISTS v1_documents_owner ON v1_documents(owner_id,domain,scope,position);
   CREATE TABLE IF NOT EXISTS v1_commands(actor_id TEXT NOT NULL,command_id TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL CHECK(json_valid(response)),created_at TEXT NOT NULL,PRIMARY KEY(actor_id,command_id));
   CREATE TABLE IF NOT EXISTS v1_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,actor_id TEXT NOT NULL,scope TEXT NOT NULL,domain TEXT NOT NULL,object_id TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS v1_events_actor ON v1_events(actor_id,sequence);
   CREATE INDEX IF NOT EXISTS v1_events_activity ON v1_events(actor_id,sequence)
    WHERE NOT ((domain='machines' AND type='agent-heartbeat') OR (domain='services' AND type='service-process-observed'));`));
 }
 private transaction<T>(work:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result}catch(error){this.db.exec('ROLLBACK');throw error}}
 version(actorId:string){return Number(this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM v1_events WHERE actor_id=?').get(actorId)?.n??0)}
 eventSequence(actorId:string,id:string):number|undefined {const r=this.db.prepare('SELECT sequence FROM v1_events WHERE actor_id=? AND id=?').get(actorId,id);return r?Number(r.sequence):undefined}
 read(domain:Domain,id:string,actorId:string):BusinessRecord|undefined{const row=this.db.prepare('SELECT json FROM v1_documents WHERE domain=? AND id=? AND owner_id=?').get(domain,id,actorId);return row?JSON.parse(String(row.json)):undefined}
 list(domain:Domain,actorId:string,scope?:Scope):BusinessRecord[]{const rows=scope?this.db.prepare('SELECT json FROM v1_documents WHERE domain=? AND owner_id=? AND scope=? ORDER BY position').all(domain,actorId,scope):this.db.prepare('SELECT json FROM v1_documents WHERE domain=? AND owner_id=? ORDER BY position').all(domain,actorId);return rows.map(r=>JSON.parse(String(r.json)))}
 actors(domain:Domain):string[]{return this.db.prepare('SELECT DISTINCT owner_id FROM v1_documents WHERE domain=?').all(domain).map(row=>String(row.owner_id));}
 /** Internal reference census only. Never expose command history as a public list. */
 commandHistory(actorId:string):BusinessRecord[]{return this.db.prepare('SELECT response FROM v1_commands WHERE actor_id=?').all(actorId).map(row=>JSON.parse(String(row.response))?.data).filter((record):record is BusinessRecord=>!!record&&record.ownerId===actorId);}
 page(domain:Domain,actorId:string,limit:number,cursor?:string,scope?:Scope){
  let last=0;if(cursor){try{const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(c.domain!==domain||c.actorId!==actorId||c.scope!==(scope??null)||!Number.isSafeInteger(c.last)||c.last<0)throw Error();last=c.last}catch{throw new BusinessError('VALIDATION','分页位置无效')}}
  const rows=scope?this.db.prepare('SELECT position,json FROM v1_documents WHERE domain=? AND owner_id=? AND scope=? AND position>? ORDER BY position LIMIT ?').all(domain,actorId,scope,last,limit+1):this.db.prepare('SELECT position,json FROM v1_documents WHERE domain=? AND owner_id=? AND position>? ORDER BY position LIMIT ?').all(domain,actorId,last,limit+1);
  const items=rows.slice(0,limit);return {items:items.map(r=>JSON.parse(String(r.json))),nextCursor:rows.length>limit?Buffer.from(encode({domain,actorId,scope:scope??null,last:Number(items.at(-1)!.position)})).toString('base64url'):null,snapshotVersion:this.version(actorId)};
 }
 events(actorId:string,after:number,limit=100,scope?:Scope,domain?:string,objectId?:string,excludeObservations=false){let sql='SELECT * FROM v1_events WHERE actor_id=? AND sequence>?';const args:any[]=[actorId,after];if(scope){sql+=' AND scope=?';args.push(scope)}if(domain){sql+=' AND domain=?';args.push(domain)}if(objectId){sql+=' AND object_id=?';args.push(objectId)}if(excludeObservations)sql+=" AND NOT ((domain='machines' AND type='agent-heartbeat') OR (domain='services' AND type='service-process-observed'))";sql+=' ORDER BY sequence LIMIT ?';args.push(limit);return this.db.prepare(sql).all(...args).map(r=>({id:String(r.id),sequence:Number(r.sequence),at:String(r.at),actorId:String(r.actor_id),domain:String(r.domain),objectId:String(r.object_id),type:String(r.type),payload:JSON.parse(String(r.payload))}));}
 replay(domain:Domain,command:string,envelope:CommandEnvelope,actorId:string):CommandReceipt|undefined {
  const row=this.db.prepare('SELECT fingerprint,response FROM v1_commands WHERE actor_id=? AND command_id=?').get(actorId,envelope.commandId);if(!row)return;
  const fingerprint=createHash('sha256').update(canonical({domain,command,...envelope})).digest('hex');
  if(row.fingerprint!==fingerprint)throw new BusinessError('CONFLICT','同一个提交编号不能用于不同操作',409);
  return JSON.parse(String(row.response));
 }
 /** Internal async dispatcher completes an accepted receipt without changing its fingerprint. */
 completeReceipt(actorId:string,commandId:string,receipt:CommandReceipt):void {
  if(receipt.data.ownerId!==actorId)throw new BusinessError('FORBIDDEN','回执身份无效',403);
  this.db.prepare('UPDATE v1_commands SET response=? WHERE actor_id=? AND command_id=?').run(encode(receipt),actorId,commandId);
 }
 execute(handler:DomainHandler,command:string,envelope:CommandEnvelope,actorId:string,machine:(id:string)=>Record<string,any>|undefined,emergencyStopped:()=>boolean=()=>false,validateReceipt:(receipt:CommandReceipt)=>void=()=>{},runtime:{ready?:(agent:string,machineId:string)=>boolean;member?:(profileId:string)=>Record<string,any>|undefined}={}):CommandReceipt{
  return this.transaction(()=>{
   const fingerprint=createHash('sha256').update(canonical({domain:handler.domain,command,...envelope})).digest('hex');
   const previous=this.db.prepare('SELECT fingerprint,response FROM v1_commands WHERE actor_id=? AND command_id=?').get(actorId,envelope.commandId);
   if(previous){if(previous.fingerprint!==fingerprint)throw new BusinessError('CONFLICT','同一个提交编号不能用于不同操作',409);return JSON.parse(String(previous.response))}
   if(['capture','create','register'].includes(command)&&envelope.expectedVersion!==0)throw new BusinessError('CONFLICT','新增记录的版本必须为0',409);
   const timestamp=new Date().toISOString(),pending:DomainEvent[]=[];let dirty=false;
   const context:CommandContext={actorId,scope:envelope.scope,expectedVersion:envelope.expectedVersion,now:timestamp,
    list:domain=>this.list(domain,actorId,envelope.scope),
    get:(domain,id)=>{const r=this.read(domain,id,actorId);return r?.scope===envelope.scope?r:undefined},
    require:(domain,id)=>{const r=this.read(domain,id,actorId);if(!r)throw new BusinessError('VALIDATION','关联记录不存在或不可访问',404);if(r.scope!==envelope.scope)throw new BusinessError('FORBIDDEN','不能跨范围关联或修改记录',403);return r},
    check:record=>{if(record.ownerId!==actorId||record.scope!==envelope.scope)throw new BusinessError('FORBIDDEN','不能修改其他人的记录',403);if(record.revision!==envelope.expectedVersion)throw new BusinessError('CONFLICT','记录已更新，请刷新后再提交',409,{currentVersion:record.revision})},
    create:(domain,body,id=randomUUID())=>{if(this.read(domain,id,actorId))throw new BusinessError('CONFLICT','记录已存在',409);const data={...body,id,revision:1,scope:envelope.scope,ownerId:actorId};this.db.prepare('INSERT INTO v1_documents(domain,id,owner_id,scope,revision,json) VALUES(?,?,?,?,?,?)').run(domain,id,actorId,envelope.scope,1,encode(data));dirty=true;return data},
    update:(domain,id,patch)=>{const old=context.require(domain,id,true);const data={...old,...patch,id:old.id,revision:old.revision+1,ownerId:old.ownerId,scope:old.scope};this.db.prepare('UPDATE v1_documents SET revision=?,json=? WHERE domain=? AND id=? AND owner_id=? AND revision=?').run(data.revision,encode(data),domain,id,actorId,old.revision);dirty=true;return data},
    emit:(domain,objectId,type,payload={})=>{const id=randomUUID(),data=eventPayload(payload);const result=this.db.prepare('INSERT INTO v1_events(id,actor_id,scope,domain,object_id,type,payload,at) VALUES(?,?,?,?,?,?,?,?)').run(id,actorId,envelope.scope,domain,objectId,type,encode(data),timestamp);pending.push({id,sequence:Number(result.lastInsertRowid),at:timestamp,actorId,domain,objectId,type,payload:data})},
    machine,executorReady:runtime.ready??(()=>false),emergencyStopped,member:runtime.member,
    redactReceipts:(domain,id,replacement)=>{
     const rows=this.db.prepare('SELECT command_id,response FROM v1_commands WHERE actor_id=?').all(actorId);
     for(const row of rows){const receipt=JSON.parse(String(row.response));
      if(receipt?.data?.id===id&&this.read(domain,id,actorId)){
       receipt.data=replacement;receipt.version=replacement.revision;receipt.events=[];
       this.db.prepare('UPDATE v1_commands SET response=? WHERE actor_id=? AND command_id=?').run(encode(receipt),actorId,String(row.command_id));
      }
     }
    },
   };
   const data=handler.execute(command,envelope.payload,context);
   if(!data||!data.id||!Number.isInteger(data.revision)||data.ownerId!==actorId||data.scope!==envelope.scope)throw new Error('Domain handler returned an invalid record');
   if(!pending.length&&dirty)context.emit(handler.domain,data.id,command,{revision:data.revision});
   const result:CommandReceipt={requestId:randomUUID(),version:data.revision,data,events:pending};
   validateReceipt(result);
   const persisted=this.db.prepare('SELECT domain FROM v1_documents WHERE owner_id=? AND id=? AND revision=? AND json=?').get(actorId,data.id,data.revision,encode(data));
   this.receiptValidator?.((persisted?.domain as Domain)??handler.domain,result);
   this.db.prepare('INSERT INTO v1_commands(actor_id,command_id,fingerprint,response,created_at) VALUES(?,?,?,?,?)').run(actorId,envelope.commandId,fingerprint,encode(result),timestamp);
   this.db.prepare('INSERT INTO audit(action,subjectId,details,createdAt) VALUES(?,?,?,?)').run(`v1.${handler.domain}.${command}`,data.id,encode({scope:data.scope,revision:data.revision,commandId:envelope.commandId}),timestamp);
   return result;
  });
 }
 close(){if(!this.closed){this.db.close();this.closed=true}}
}
