import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

export interface SupervisorIntent {id:string;kind:'model'|'dispatch';binding:string;input:unknown;state:'prepared'|'started'|'complete'|'uncertain';result?:any;}
/** A model has no provider idempotency contract: an interrupted started call is uncertain, never silently retried. */
export class SupervisorIntents {
 private db:DatabaseSync;
 constructor(path:string){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY,kind TEXT NOT NULL,binding TEXT NOT NULL,json TEXT NOT NULL);CREATE TABLE IF NOT EXISTS observations(sequence INTEGER PRIMARY KEY AUTOINCREMENT,intent_id TEXT NOT NULL,json TEXT NOT NULL);CREATE TRIGGER IF NOT EXISTS observations_no_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT,'immutable');END;CREATE TRIGGER IF NOT EXISTS observations_no_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT,'immutable');END;`);}
 get(id:string):SupervisorIntent|null{const row=this.db.prepare('SELECT json FROM intents WHERE id=?').get(id);return row?JSON.parse(String(row.json)):null;}
 prepare(id:string,kind:SupervisorIntent['kind'],input:unknown){const binding=createHash('sha256').update(JSON.stringify(input)).digest('hex'),old=this.get(id);if(old){if(old.binding!==binding||old.kind!==kind)throw Error('INTENT_BINDING_CHANGED');return old;}const intent:SupervisorIntent={id,kind,binding,input,state:'prepared'};this.db.prepare('INSERT INTO intents VALUES(?,?,?,?)').run(id,kind,binding,JSON.stringify(intent));return intent;}
 started(id:string){const value=this.get(id);if(!value||value.state!=='prepared')throw Error('INTENT_ALREADY_STARTED');value.state='started';this.db.prepare('UPDATE intents SET json=? WHERE id=?').run(JSON.stringify(value),id);return value;}
 observe(id:string,result:unknown){this.db.prepare('INSERT INTO observations(intent_id,json) VALUES(?,?)').run(id,JSON.stringify({at:new Date().toISOString(),result}));}
 complete(id:string,result:unknown){const value=this.get(id);if(!value)throw Error('INTENT_MISSING');if(value.state==='complete'){if(JSON.stringify(value.result)!==JSON.stringify(result))throw Error('INTENT_RESULT_CONFLICT');return value;}this.db.exec('BEGIN IMMEDIATE');try{this.observe(id,result);value.result=result;value.state='complete';this.db.prepare('UPDATE intents SET json=? WHERE id=?').run(JSON.stringify(value),id);this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 interrupted(id:string){const value=this.get(id);if(value?.state==='started'&&value.kind==='model'){value.state='uncertain';this.db.prepare('UPDATE intents SET json=? WHERE id=?').run(JSON.stringify(value),id);}return value;}
 close(){this.db.close();}
}
