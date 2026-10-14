import { DatabaseSync } from 'node:sqlite';
import { randomUUID,createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from '../store.js';
import type { PiRunMetadata, PiUsageRecord } from '../pi.js';
import { BusinessError } from '../v1/types.js';
import {UsageLedger,externalUsageSchema,partialCliKinds,type ExternalUsageInput} from './usage-ledger.js';
import {RuntimeAccessError,type IdentityRuntime} from './identity.js';

const policySchema = z.object({
  dailyLimitUSD: z.number().min(0).max(100000),
  perRunReserveUSD: z.number().min(0.001).max(1000),
  maxConcurrent: z.number().int().min(1).max(32),
  paused: z.boolean(),
  blockUnpriced: z.boolean(),
  timezone: z.string().max(100).refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }),
}).strict();
export type BudgetPolicy = z.infer<typeof policySchema>;
const defaultPolicy: BudgetPolicy = { dailyLimitUSD: 0, perRunReserveUSD: 0.1, maxConcurrent: 4, paused: false, blockUnpriced: true, timezone: 'Asia/Shanghai' };

/** Actual reported token counts and catalog estimates. Neither is claimed to be a supplier invoice. */
export class GovernanceRuntime {
  private db: DatabaseSync;
  readonly ledger:UsageLedger;
  constructor(private store: Store) {
    this.db = new DatabaseSync(store.databasePath);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_ai_runs(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, conversation_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, origin TEXT NOT NULL, day TEXT NOT NULL, state TEXT NOT NULL, reserve_usd REAL NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, unpriced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE IF NOT EXISTS runtime_ai_usage(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, actor_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, origin TEXT NOT NULL, day TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, total_tokens INTEGER NOT NULL, cost_usd REAL, cost_kind TEXT NOT NULL, measured_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_cli_aggregates(actor_id TEXT NOT NULL,usage_id TEXT NOT NULL,request_sha TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(actor_id,usage_id));
      CREATE INDEX IF NOT EXISTS runtime_ai_usage_day ON runtime_ai_usage(day, actor_id);
      CREATE TABLE IF NOT EXISTS runtime_ai_unreported(run_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,day TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
      INSERT OR IGNORE INTO runtime_ai_unreported SELECT id,actor_id,provider,model,day,'process-interrupted-before-usage',datetime('now') FROM runtime_ai_runs WHERE state='active' AND NOT EXISTS(SELECT 1 FROM runtime_ai_usage WHERE run_id=runtime_ai_runs.id);
      UPDATE runtime_ai_runs SET state='interrupted', reserve_usd=0, ended_at=datetime('now') WHERE state='active';`);
    for (const table of ['runtime_ai_runs','runtime_ai_usage']) {
      if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === 'scenario')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN scenario TEXT`);
    }
    this.ledger=new UsageLedger(this.db,()=>this.policy().values.timezone);
    // Migrate known gaps without manufacturing model counts.
    for(const row of this.db.prepare('SELECT * FROM runtime_ai_unreported').all())this.recordUnknown({runId:String(row.run_id),actorId:String(row.actor_id),conversationId:String(row.run_id),provider:String(row.provider),model:String(row.model),origin:'bounded-job'},String(row.reason),String(row.created_at));
  }
  policy(): { revision: number; values: BudgetPolicy } { return this.store.getSetting('runtime.governance') ?? { revision: 0, values: { ...defaultPolicy } }; }
  updatePolicy(expectedVersion: number, patch: Partial<BudgetPolicy>) {
    const old = this.policy();
    if (old.revision !== expectedVersion) throw new BusinessError('CONFLICT', '预算策略已更新，请刷新', 409);
    const values = policySchema.parse({ ...old.values, ...patch });
    const result = { revision: old.revision + 1, values };
    this.store.setSetting('runtime.governance', result); this.store.audit('governance.policy', 'platform', { revision: result.revision }); return result;
  }
  private day(at = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: this.policy().values.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const value = (name: string) => parts.find(p => p.type === name)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  private totals(day = this.day()) {
    const usage = this.db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(CASE WHEN measurement_status='reported' THEN total_tokens ELSE 0 END),0) AS tokens, SUM(CASE WHEN measurement_status='reported' AND (cost_usd IS NULL OR cost_complete=0) THEN 1 ELSE 0 END) AS unpriced, SUM(CASE WHEN measurement_status='reported' THEN 1 ELSE 0 END) AS calls FROM runtime_ai_usage WHERE day=?").get(day)!;
    const runs = this.db.prepare("SELECT COUNT(*) AS active,COALESCE(SUM(MAX(0,reserve_usd-cost_usd)),0) AS reserved FROM runtime_ai_runs WHERE state='active'").get()!;
    const unreported=Number(this.db.prepare("SELECT COUNT(*) AS count FROM runtime_ai_usage WHERE day=? AND measurement_status='unknown'").get(day)!.count);
    return { day, estimatedUSD: Number(usage.cost), totalTokens: Number(usage.tokens), unpricedCalls: Number(usage.unpriced ?? 0)+unreported, unreportedRuns:unreported, calls: Number(usage.calls), active: Number(runs.active), reservedUSD: Number(runs.reserved) };
  }
  preflight(options?:{recordOnly?:boolean}): void {
    const p = this.policy().values, totals = this.totals();
    if (p.paused) throw new BusinessError('REVIEW_REQUIRED', '平台已暂停新的AI调用', 422);
    if (totals.active >= p.maxConcurrent) throw new BusinessError('DEPENDENCY_PENDING', 'AI并发已满，请稍后重试', 409);
    if (!options?.recordOnly && p.dailyLimitUSD > 0 && (totals.estimatedUSD + totals.reservedUSD + p.perRunReserveUSD > p.dailyLimitUSD || p.blockUnpriced && totals.unpricedCalls > 0)) throw new BusinessError('BUDGET_EXHAUSTED', '当日AI预算不足或存在未定价用量，请调整预算后重试', 409);
  }
  beforeRun = (meta: PiRunMetadata, reserveUSD?:number,options?:{recordOnly?:boolean}): void => {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT id FROM runtime_ai_runs WHERE id=?').get(meta.runId)) { this.db.exec('COMMIT'); return; }
      this.preflight(options);
      this.db.prepare('INSERT INTO runtime_ai_runs(id,actor_id,conversation_id,provider,model,origin,day,state,reserve_usd,created_at,scenario) VALUES(?,?,?,?,?,?,?,\'active\',?,?,?)').run(meta.runId, meta.actorId, meta.conversationId, meta.provider, meta.model, meta.origin, this.day(), reserveUSD??this.policy().values.perRunReserveUSD, new Date().toISOString(),meta.scenario??null);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  };
  reserveExecution(input:{runId:string;actorId:string;executorId:string;budgetUSD:number;recordOnly?:boolean}){
    this.preflight(input);if(input.recordOnly){this.beforeRun({runId:'execution_'+input.runId,actorId:input.actorId,conversationId:input.runId,provider:input.executorId,model:'cli-reported',origin:'bounded-job'},0,{recordOnly:true});return {};}
    const totals=this.totals(),policy=this.policy().values;
    const budgetUSD=Math.min(input.budgetUSD,policy.dailyLimitUSD>0?Math.max(0,policy.dailyLimitUSD-totals.estimatedUSD-totals.reservedUSD):input.budgetUSD);
    if(budgetUSD<=0)throw new BusinessError('BUDGET_EXHAUSTED','没有可预留的执行预算',409);
    this.beforeRun({runId:'execution_'+input.runId,actorId:input.actorId,conversationId:input.runId,provider:input.executorId,model:'cli-reported',origin:'bounded-job'},budgetUSD);
    return {budgetUSD};
  }
  releaseExecution(input:{runId:string;actorId:string;outcome?:string}){
    const runId='execution_'+input.runId;
    const run=this.db.prepare('SELECT * FROM runtime_ai_runs WHERE id=?').get(runId);
    if(run&&!this.db.prepare('SELECT id FROM runtime_ai_usage WHERE run_id=?').get(runId))this.db.prepare('INSERT OR IGNORE INTO runtime_ai_unreported(run_id,actor_id,provider,model,day,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(runId,input.actorId,run.provider,run.model,run.day,'executor-ended-without-usage:'+(input.outcome??'unknown'),new Date().toISOString());
    this.afterRun({runId,actorId:input.actorId,conversationId:input.runId,provider:'executor',model:'cli-reported',origin:'bounded-job'});
  }
  recordUsage = (usage: PiUsageRecord,aggregate?:{id:string;sha:string}): void => {
    const n = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1e12 ? Math.floor(value) : 0;
    const cost = usage.costUSD !== null && Number.isFinite(usage.costUSD) && usage.costUSD >= 0 ? usage.costUSD : null;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted=this.ledger.insert({...usage,costUSD:cost});
      if (inserted) this.db.prepare('UPDATE runtime_ai_runs SET cost_usd=cost_usd+?,unpriced=unpriced+? WHERE id=?').run(cost ?? 0, cost === null||usage.costComplete===false ? 1 : 0, usage.runId);
      if((usage.measurementStatus??'reported')!=='unknown'){
        this.db.prepare('DELETE FROM runtime_ai_unreported WHERE run_id=?').run(usage.runId);
        this.db.prepare("DELETE FROM runtime_ai_usage WHERE run_id=? AND measurement_status='unknown' AND usage_kind='missing-run-receipt'").run(usage.runId);
      }
      if(aggregate)this.db.prepare('INSERT INTO runtime_cli_aggregates(actor_id,usage_id,request_sha,created_at) VALUES(?,?,?,?)').run(usage.actorId,aggregate.id,aggregate.sha,new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    const p = this.policy().values, totals = this.totals();
    if (p.dailyLimitUSD > 0 && (totals.estimatedUSD >= p.dailyLimitUSD || p.blockUnpriced && cost === null)) throw new BusinessError('BUDGET_EXHAUSTED', '本次用量已达到预算边界，停止继续调用', 409);
  };
  recordUnknown(meta:PiRunMetadata,reason='ended-without-provider-usage',measuredAt=new Date().toISOString(),usageKind='missing-run-receipt'){
    const stamp=Number.isFinite(Date.parse(measuredAt))?new Date(measuredAt).toISOString():new Date().toISOString();
    if(!this.db.prepare('SELECT id FROM runtime_ai_usage WHERE id=?').get(meta.runId+'_unknown_'+usageKind))this.ledger.insert({...meta,usageId:meta.runId+'_unknown_'+usageKind,sourceRecordId:meta.runId+'_unknown_'+usageKind,usageKind,measurementStatus:'unknown',inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:0,costUSD:null,costKind:'unavailable',measuredAt:stamp});
    this.db.prepare('INSERT OR IGNORE INTO runtime_ai_unreported(run_id,actor_id,provider,model,day,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(meta.runId,meta.actorId,meta.provider,meta.model,this.ledger.day(new Date(stamp)),reason,stamp);
  }
  afterRun = (meta: PiRunMetadata): void => {
    if(!this.db.prepare("SELECT id FROM runtime_ai_usage WHERE run_id=?").get(meta.runId))this.recordUnknown(meta);
    this.db.prepare("UPDATE runtime_ai_runs SET state='finished',reserve_usd=0,ended_at=? WHERE id=? AND state='active'").run(new Date().toISOString(), meta.runId);
  };
  /** Signed execution adapters may report provider usage. Zero never substitutes for missing cost. */
  executionUsage(input: { runId: string; actorId: string; provider: string; model: string; inputTokens: number; outputTokens: number; cacheReadTokens?:number;cacheWriteTokens?:number;totalTokens?:number;usageComplete?:boolean; projectId?:string;taskId?:string;machineId?:string;executorId?:string;sourceRecordId?:string; costUSD?: number; knownCostUSD?:number;costComplete?:boolean; costKind?: 'provider-reported' | 'catalog-estimate'; usageId?: string;measuredAt?:string }): void {
    const partial=input.usageComplete===false,record = { ...input, source:'controlled-cli',usageKind:partial?'development-partial':input.usageComplete===true?'development-complete':'development',scenario:'development',usageId: input.usageId ?? randomUUID(), conversationId: input.runId, origin: 'bounded-job' as const, cacheReadTokens: input.cacheReadTokens??0, cacheWriteTokens: input.cacheWriteTokens??0, totalTokens: input.totalTokens??input.inputTokens + input.outputTokens, costUSD: input.costUSD ?? input.knownCostUSD ?? null,costComplete:input.costComplete, costKind: input.costUSD === undefined&&input.knownCostUSD===undefined ? 'unavailable' : input.costKind ?? 'catalog-estimate', measuredAt: input.measuredAt??new Date().toISOString() } as PiUsageRecord;
    const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
    // Identity belongs to the original aggregate, never to an observer-adjusted remainder.
    const requestSHA=createHash('sha256').update(canonical({...record,measuredAt:input.measuredAt??null})).digest('hex'),old=this.db.prepare('SELECT request_sha FROM runtime_cli_aggregates WHERE actor_id=? AND usage_id=?').get(input.actorId,record.usageId);
    if(old){if(old.request_sha!==requestSHA)throw new BusinessError('CONFLICT','同一CLI汇总身份不能对应不同原始回执',409);return;}
    const observed=this.db.prepare("SELECT COALESCE(SUM(input_tokens),0) input,COALESCE(SUM(output_tokens),0) output,COALESCE(SUM(cache_read),0) cacheRead,COALESCE(SUM(cache_write),0) cacheWrite,COALESCE(SUM(total_tokens),0) total,COALESCE(SUM(cost_usd),0) cost,COUNT(*) count FROM runtime_ai_usage WHERE run_id=? AND source='external-cli' AND measurement_status='reported'").get(input.runId)!;
    if(Number(observed.count)>0){for(const [field,column]of Object.entries({inputTokens:'input',outputTokens:'output',cacheReadTokens:'cacheRead',cacheWriteTokens:'cacheWrite',totalTokens:'total'})){const value=(record as any)[field]-Number(observed[column]);if(value<0&&!partial)throw new BusinessError('CONFLICT','CLI汇总小于已观察实际用量，请核对凭据',409);(record as any)[field]=Math.max(0,value);}if(partial){record.cacheReadTokens=Math.min(record.inputTokens,record.cacheReadTokens);record.cacheWriteTokens=Math.min(record.inputTokens-record.cacheReadTokens,record.cacheWriteTokens);record.totalTokens=record.inputTokens+record.outputTokens;}if(record.costUSD!==null)record.costUSD=Math.max(0,record.costUSD-Number(observed.cost));record.usageKind=partial?'cli-reconciliation-partial':input.usageComplete===true?'cli-reconciliation-complete':'cli-reconciliation';}
    record.sourceRecordId??='cli-aggregate:'+input.runId;
    try{this.recordUsage(record,{id:record.usageId,sha:requestSHA});}
    catch(error){const saved=this.db.prepare('SELECT request_sha FROM runtime_cli_aggregates WHERE actor_id=? AND usage_id=?').get(input.actorId,record.usageId);if(error instanceof BusinessError&&error.code==='BUDGET_EXHAUSTED'&&saved?.request_sha===requestSHA)return;throw error;}
  }
  importUsage(raw:ExternalUsageInput){
    this.db.exec('BEGIN IMMEDIATE');
    try{const input=externalUsageSchema.parse(raw),result=this.ledger.import(input),runId=input.controlledRunId?'execution_'+input.controlledRunId:null;
      if(result.recorded&&runId&&input.measurementStatus!=='unknown'){
        // Replace overlapping partial aggregate counts with immutable per-message evidence.
        // The original signed aggregate remains in the execution run receipt; this row is its remainder.
        const placeholders=partialCliKinds.map(()=>'?').join(',');
        for(const row of this.db.prepare(`SELECT * FROM runtime_ai_usage WHERE run_id=? AND source='controlled-cli' AND measurement_status='reported' AND usage_kind IN (${placeholders})`).all(runId,...partialCliKinds)){
          const leftInput=Math.max(0,Number(row.input_tokens)-input.inputTokens!),leftOutput=Math.max(0,Number(row.output_tokens)-input.outputTokens!),read=Math.min(leftInput,Math.max(0,Number(row.cache_read)-input.cacheReadTokens)),write=Math.min(leftInput-read,Math.max(0,Number(row.cache_write)-input.cacheWriteTokens)),cost=row.cost_usd===null?null:Math.max(0,Number(row.cost_usd)-(input.costUSD??0));
          this.db.prepare("UPDATE runtime_ai_usage SET input_tokens=?,output_tokens=?,cache_read=?,cache_write=?,total_tokens=?,cost_usd=?,usage_kind='cli-partial-remainder' WHERE id=?").run(leftInput,leftOutput,read,write,leftInput+leftOutput,cost,row.id);
        }
        this.db.prepare("DELETE FROM runtime_ai_usage WHERE run_id=? AND usage_kind='missing-run-receipt' AND measurement_status='unknown'").run(runId);this.db.prepare('DELETE FROM runtime_ai_unreported WHERE run_id=?').run(runId);
      }
      this.db.exec('COMMIT');return result;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  observeUsageSeconds(usageId:string,seconds:number){if(Number.isFinite(seconds)&&seconds>0&&seconds<86400)this.db.prepare('UPDATE runtime_ai_usage SET seconds=? WHERE id=? AND seconds IS NULL').run(seconds,usageId);}
  usagePage(raw:unknown={}){return this.ledger.page(raw);}
  usageSummary(raw:unknown={}){return this.ledger.summary(raw);}
  summary() { return { policy: this.policy(), ...this.totals(), currency: 'USD', billing: 'reported-tokens-and-estimates', invoicesConnected: false, boundary: 'Reservations gate new calls; provider charges from an in-flight call can exceed a local estimate.' }; }
  unreported(){return this.db.prepare('SELECT * FROM runtime_ai_unreported ORDER BY rowid DESC LIMIT 200').all();}
  usage(actorId?: string, limit = 200) { return actorId ? this.db.prepare("SELECT * FROM runtime_ai_usage WHERE actor_id=? AND measurement_status='reported' ORDER BY rowid DESC LIMIT ?").all(actorId, limit) : this.db.prepare("SELECT * FROM runtime_ai_usage WHERE measurement_status='reported' ORDER BY rowid DESC LIMIT ?").all(limit); }
  close() { this.db.close(); }
}

export function registerGovernanceRoutes(app: FastifyInstance, governance: GovernanceRuntime,identity?:IdentityRuntime) {
  app.addHook('preHandler',async req=>{if(identity&&req.routeOptions.url?.startsWith('/api/runtime/governance')){const p=identity.principal(req);if(!p.administrator||p.profileId!=='me')throw new RuntimeAccessError('ADMIN_REQUIRED','模型用量与调用策略仅管理者本人可用',403);}});
  app.get('/api/runtime/governance', async () => governance.summary());
  app.put('/api/runtime/governance', async req => { const input = z.object({ expectedVersion: z.number().int().min(0), patch: policySchema.partial() }).strict().parse(req.body); return governance.updatePolicy(input.expectedVersion, input.patch); });
  app.get('/api/runtime/governance/usage', async req => governance.usagePage(req.query));
  app.get('/api/runtime/governance/usage/summary', async req => governance.usageSummary(req.query));
  app.post('/api/runtime/governance/usage/import', async req => governance.importUsage(externalUsageSchema.parse(req.body)));
}
