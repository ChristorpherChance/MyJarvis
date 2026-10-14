import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Store} from '../store.js';
import {BusinessError} from '../v1/types.js';
import {RuntimeAccessError,type IdentityRuntime} from './identity.js';

const text=(max=200)=>z.string().trim().min(1).max(max);
const money=z.string().regex(/^-?(0|[1-9]\d{0,8})(\.\d{1,6})?$/,'金额须为十进制字符串，最多6位小数；负数表示账单退款或抵扣');
const instant=z.string().datetime({offset:true}).transform(v=>new Date(v).toISOString());
export const billHeader=z.object({provider:text(),account:text(),invoiceNumber:text(),currency:z.enum(['USD','CNY','EUR']),from:instant,until:instant,sourceName:text(300)}).strict().refine(v=>v.from<v.until,'账期结束须晚于开始');
export const billLine=z.object({id:text(),at:instant,model:text(300),amount:money,usageId:text().optional(),providerRequestId:text().optional(),totalTokens:z.number().int().min(0).max(1e12).optional()}).strict();
export const billInput=z.union([
 z.object({invoice:billHeader,format:z.literal('json'),lines:z.array(billLine).min(1).max(2000)}).strict(),
 z.object({invoice:billHeader,format:z.literal('csv'),csv:z.string().min(1).max(500000)}).strict(),
]);
export const billImport=z.object({requestId:z.string().uuid(),confirm:z.literal(true),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),payload:billInput}).strict();
export const billAction=z.object({requestId:z.string().uuid(),expectedVersion:z.number().int().min(1)}).strict();
export const billLink=billAction.extend({usageId:text().nullable(),note:text(1000)}).strict();
export const billVoid=billAction.extend({reason:text(1000)}).strict();
export const ledgerQuery=z.object({from:instant,until:instant,provider:text().optional(),limit:z.coerce.number().int().min(1).max(5000).default(500)}).strict().refine(q=>q.from<q.until&&Date.parse(q.until)-Date.parse(q.from)<=366*86400000,'查询须为一年以内的有效范围');
const requireValue=(v:unknown,message:string,status=409):void=>{if(!v)throw new BusinessError(status===404?'VALIDATION':status===400?'VALIDATION':'CONFLICT',message,status);};
const micros=(v:string)=>{const negative=v.startsWith('-'),[whole,decimal='']=(negative?v.slice(1):v).split('.');const value=BigInt(whole)*1000000n+BigInt(decimal.padEnd(6,'0'));return negative?-value:value;};
const amount=(n:bigint)=>{const sign=n<0n?'-':'',value=n<0n?-n:n;return sign+(value/1000000n).toString()+'.'+(value%1000000n).toString().padStart(6,'0');};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Header=z.infer<typeof billHeader>;type Line=z.infer<typeof billLine>;
type Normal={invoice:Header;lines:Line[]};
/** Bounded RFC-style CSV reader. Cells are data and are never evaluated. */
export function parseBillCsv(csv:string):Line[]{
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,afterQuote=false;
 const pushCell=()=>{row.push(cell);cell='';afterQuote=false;if(row.length>7)throw new BusinessError('VALIDATION','CSV最多7列',400);};
 const pushRow=()=>{pushCell();if(row.some(v=>v.length))rows.push(row);row=[];if(rows.length>2001)throw new BusinessError('VALIDATION','CSV最多2000条账单',400);};
 csv=csv.replace(/^\uFEFF/,'');
 for(let i=0;i<csv.length;i++){const c=csv[i];if(quoted){if(c==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;}else if(c==='"'){requireValue(!cell&&!afterQuote,'CSV引号位置无效',400);quoted=true;}else if(c===',')pushCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;pushRow();}else{requireValue(!afterQuote,'CSV引号后存在多余字符',400);cell+=c;}requireValue(cell.length<=2000,'CSV单元格过长',400);}
 requireValue(!quoted,'CSV引号未闭合',400);if(cell||row.length||afterQuote)pushRow();
 const header=rows.shift()??[],allowed=['id','at','model','amount','usageId','providerRequestId','totalTokens'];
 requireValue(new Set(header).size===header.length&&header.every(v=>allowed.includes(v))&&['id','at','model','amount'].every(v=>header.includes(v)),'CSV表头须包含id、at、model、amount；仅支持标准列',400);
 return rows.map((cells,i)=>{requireValue(cells.length===header.length,`CSV第${i+2}行列数不一致`,400);const obj:Record<string,unknown>={};header.forEach((k,n)=>{if(cells[n].trim()!==''){if(k==='totalTokens')requireValue(/^\d+$/.test(cells[n].trim()),'Token列须为非负整数',400);obj[k]=k==='totalTokens'?Number(cells[n]):cells[n];}});return billLine.parse(obj);});
}
function normalize(raw:unknown):Normal{
 const input=billInput.parse(raw),lines=input.format==='json'?input.lines:parseBillCsv(input.csv);
 requireValue(lines.length>0&&lines.length<=2000,'账单须有1至2000条',400);
 requireValue(new Set(lines.map(l=>l.id)).size===lines.length,'账单行ID重复',400);
 const references=lines.flatMap(l=>l.usageId?[l.usageId]:[]);requireValue(new Set(references).size===references.length,'账单中的用量ID重复',400);
 for(const line of lines)requireValue(line.at>=input.invoice.from&&line.at<input.invoice.until,'账单行时间不在账期内',400);
 return {invoice:input.invoice,lines:lines.map(l=>({...l,amount:amount(micros(l.amount))})).sort((a,b)=>a.id.localeCompare(b.id,'en'))};
}

/** Imported supplier evidence is separate from SDK estimates and never changes reservations or payments. */
export class BillingRuntime {
 private db:DatabaseSync;
 constructor(private store:Store){this.db=new DatabaseSync(store.databasePath);this.db.exec(`PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS runtime_billing_documents(id TEXT PRIMARY KEY,provider TEXT NOT NULL,account TEXT NOT NULL,invoice_number TEXT NOT NULL,fingerprint TEXT NOT NULL,json TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,void_reason TEXT,UNIQUE(provider,account,invoice_number));
 CREATE TABLE IF NOT EXISTS runtime_billing_links(usage_id TEXT PRIMARY KEY,bill_id TEXT NOT NULL,line_id TEXT NOT NULL,mode TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(bill_id,line_id));
 CREATE TABLE IF NOT EXISTS runtime_billing_receipts(request_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL);`);}
 private transaction<T>(fn:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private idempotent<T extends {id:string;version:number}>(requestId:string,operation:any[],fn:()=>T):T{return this.transaction(()=>{const fp=digest(operation),old=this.db.prepare('SELECT fingerprint,response FROM runtime_billing_receipts WHERE request_id=?').get(requestId);if(old){requireValue(old.fingerprint===fp,'提交编号不能复用为另一操作');return this.get(JSON.parse(String(old.response)).id) as unknown as T;}const result=fn(),action=operation[0],detail=action==='link'?{lineId:operation[2],usageId:operation[4],note:operation[5]}:action==='void'?{reason:operation[3]}:{};this.db.prepare('INSERT INTO runtime_billing_receipts VALUES(?,?,?,?)').run(requestId,fp,JSON.stringify({id:result.id,version:result.version,action,detail}),new Date().toISOString());return result;});}
 private row(id:string){const row=this.db.prepare('SELECT * FROM runtime_billing_documents WHERE id=?').get(id);requireValue(row,'账单不存在',404);return row!;}
 private change(id:string,revision:number){const row=this.row(id);requireValue(row.status==='imported','账单已作废');requireValue(row.revision===revision,'账单已经变化，请刷新');return row;}
 private usage(id:string){return this.db.prepare('SELECT id,run_id,provider,model,total_tokens,cost_usd,cost_kind,measured_at FROM runtime_ai_usage WHERE id=?').get(id);}
 private compatible(normal:Normal,line:Line,usage:any){return usage&&usage.provider===normal.invoice.provider&&usage.model===line.model&&String(usage.measured_at)>=normal.invoice.from&&String(usage.measured_at)<normal.invoice.until;}
 preview(raw:unknown){const normal=normalize(raw);return {fingerprint:digest(normal),invoice:normal.invoice,lineCount:normal.lines.length,totalAmount:amount(normal.lines.reduce((n,l)=>n+micros(l.amount),0n)),lines:normal.lines,matching:'explicit-ledger-id-only',providerConnection:false};}
 import(raw:unknown){const input=billImport.parse(raw),normal=normalize(input.payload);requireValue(digest(normal)===input.fingerprint,'确认内容与预览不一致',400);return this.idempotent(input.requestId,['import',normal],()=>{const existing=this.db.prepare('SELECT id,fingerprint,status FROM runtime_billing_documents WHERE provider=? AND account=? AND invoice_number=?').get(normal.invoice.provider,normal.invoice.account,normal.invoice.invoiceNumber);if(existing){requireValue(existing.fingerprint===input.fingerprint&&existing.status==='imported','同一账单编号已导入不同内容或已作废；请核对原记录');return this.get(String(existing.id));}const id=randomUUID();this.db.prepare('INSERT INTO runtime_billing_documents VALUES(?,?,?,?,?,?,1,\'imported\',?,NULL)').run(id,normal.invoice.provider,normal.invoice.account,normal.invoice.invoiceNumber,input.fingerprint,JSON.stringify(normal),new Date().toISOString());return this.get(id);});}
 get(id:string){const row=this.row(id),normal=JSON.parse(String(row.json)) as Normal;
  const links=this.db.prepare('SELECT * FROM runtime_billing_links WHERE bill_id=?').all(id),lines=normal.lines.map(line=>{const link=links.find(l=>l.line_id===line.id),usage=link?this.usage(String(link.usage_id)):undefined;const usd=normal.invoice.currency==='USD',cost=usage?.cost_usd,estimate=typeof cost==='number'&&Number.isFinite(cost)&&cost>=0&&cost<=1e9?BigInt(Math.round(cost*1e6)):null,delta=usd&&estimate!==null?micros(line.amount)-estimate:null;
   return {...line,match:link?{usageId:link.usage_id,mode:link.mode,note:link.note}:null,ledgerEstimateUSD:estimate===null?null:amount(estimate),differenceUSD:delta===null?null:amount(delta),tokenDifference:usage&&line.totalTokens!==undefined?line.totalTokens-Number(usage.total_tokens):null,state:row.status==='void'?'void':!link?'unmatched':!usage?'ledger-missing':!usd?'currency-not-comparable':estimate===null?'estimate-unknown':delta===0n?'same-amount':'amount-difference'};
  });
  return {id,version:Number(row.revision),status:row.status,createdAt:row.created_at,voidReason:row.void_reason,invoice:normal.invoice,fingerprint:row.fingerprint,totalAmount:amount(normal.lines.reduce((n,l)=>n+micros(l.amount),0n)),lineCount:lines.length,matchedCount:lines.filter(l=>l.match).length,lines,providerConnection:false,boundary:'账单是导入证据；金额比较不代表付款、真实性认证或供应商请求自动匹配。非USD不换汇，差异保留。'};
 }
 list(limit=50,before?:string){const cursor=before?this.db.prepare('SELECT rowid AS cursor FROM runtime_billing_documents WHERE id=?').get(before):null;requireValue(!before||cursor,'账单分页位置不存在',404);const rows=this.db.prepare(`SELECT id FROM runtime_billing_documents ${cursor?'WHERE rowid<?':''} ORDER BY rowid DESC LIMIT ?`).all(...(cursor?[cursor.cursor]:[]),limit+1),items=rows.slice(0,limit).map(r=>{const{lines,...summary}=this.get(String(r.id));return summary;});return {items,nextBefore:rows.length>limit?items.at(-1)!.id:null,totalCount:Number(this.db.prepare('SELECT COUNT(*) AS count FROM runtime_billing_documents').get()!.count),providerConnection:false};}
 events(id:string,limit=100){this.row(id);return {items:this.db.prepare("SELECT request_id,response,created_at FROM runtime_billing_receipts WHERE json_extract(response,'$.id')=? ORDER BY rowid DESC LIMIT ?").all(id,limit).map(row=>{const value=JSON.parse(String(row.response));return {requestId:row.request_id,action:value.action??'legacy',version:value.version,detail:value.detail??{},at:row.created_at};})};}
 reconcile(id:string,raw:unknown){const input=billAction.parse(raw);return this.idempotent(input.requestId,['reconcile',id,input.expectedVersion],()=>{const row=this.change(id,input.expectedVersion),normal=JSON.parse(String(row.json)) as Normal;for(const line of normal.lines){if(!line.usageId||!this.compatible(normal,line,this.usage(line.usageId)))continue;const old=this.db.prepare('SELECT bill_id,line_id FROM runtime_billing_links WHERE usage_id=? OR (bill_id=? AND line_id=?)').get(line.usageId,id,line.id);if(old)continue;this.db.prepare('INSERT INTO runtime_billing_links VALUES(?,?,?,?,?,?)').run(line.usageId,id,line.id,'explicit-ledger-id','导入行明确引用本平台用量ID',new Date().toISOString());}this.db.prepare('UPDATE runtime_billing_documents SET revision=revision+1 WHERE id=?').run(id);return this.get(id);});}
 link(id:string,lineId:string,raw:unknown){const input=billLink.parse(raw);return this.idempotent(input.requestId,['link',id,lineId,input.expectedVersion,input.usageId,input.note],()=>{const row=this.change(id,input.expectedVersion),normal=JSON.parse(String(row.json)) as Normal,line=normal.lines.find(l=>l.id===lineId);requireValue(line,'账单行不存在',404);if(input.usageId){requireValue(this.compatible(normal,line!,this.usage(input.usageId)),'用量不存在或供应商、模型、账期不一致',400);const duplicate=this.db.prepare('SELECT bill_id,line_id FROM runtime_billing_links WHERE usage_id=?').get(input.usageId);requireValue(!duplicate||duplicate.bill_id===id&&duplicate.line_id===lineId,'该用量已关联另一账单行');}this.db.prepare('DELETE FROM runtime_billing_links WHERE bill_id=? AND line_id=?').run(id,lineId);if(input.usageId)this.db.prepare('INSERT INTO runtime_billing_links VALUES(?,?,?,?,?,?)').run(input.usageId,id,lineId,'manual-reviewed',input.note,new Date().toISOString());this.db.prepare('UPDATE runtime_billing_documents SET revision=revision+1 WHERE id=?').run(id);return this.get(id);});}
 void(id:string,raw:unknown){const input=billVoid.parse(raw);return this.idempotent(input.requestId,['void',id,input.expectedVersion,input.reason],()=>{this.change(id,input.expectedVersion);this.db.prepare('DELETE FROM runtime_billing_links WHERE bill_id=?').run(id);this.db.prepare('UPDATE runtime_billing_documents SET status=\'void\',revision=revision+1,void_reason=? WHERE id=?').run(input.reason,id);return this.get(id);});}
 ledger(raw:unknown){const q=ledgerQuery.parse(raw),rows=this.db.prepare(`SELECT id,run_id,provider,model,total_tokens,cost_usd,cost_kind,measured_at FROM runtime_ai_usage WHERE measured_at>=? AND measured_at<? ${q.provider?'AND provider=?':''} ORDER BY measured_at,id LIMIT ?`).all(q.from,q.until,...(q.provider?[q.provider]:[]),q.limit+1);return {items:rows.slice(0,q.limit),truncated:rows.length>q.limit,currency:'USD',from:q.from,until:q.until};}
 summary(){const rows=this.db.prepare('SELECT id FROM runtime_billing_documents WHERE status=\'imported\' ORDER BY rowid DESC LIMIT 501').all();const byCurrency:Record<string,{bills:number;amount:string;matched:number;unmatched:number}>={};for(const row of rows.slice(0,500)){const bill=this.get(String(row.id)),old=byCurrency[bill.invoice.currency]??{bills:0,amount:'0.000000',matched:0,unmatched:0};old.bills++;old.amount=amount(micros(old.amount)+micros(bill.totalAmount));old.matched+=bill.matchedCount;old.unmatched+=bill.lineCount-bill.matchedCount;byCurrency[bill.invoice.currency]=old;}return {byCurrency,truncated:rows.length>500,providerConnection:false,limit:500,note:'汇总最近500张已导入账单；不同币种分别统计，不替代调用预算或供应商结算认证。'};}
 close(){this.db.close();}
}
export function registerBillingRoutes(app:FastifyInstance,billing:BillingRuntime,identity:IdentityRuntime){
 // Member identity takes precedence in a browser that also holds an administrator cookie.
 app.addHook('preHandler',async req=>{if(req.routeOptions.url?.startsWith('/api/runtime/governance/billing/')){const p=identity.principal(req);if(!p.administrator||p.profileId!=='me')throw new RuntimeAccessError('ADMIN_REQUIRED','账单仅管理者本人可用',403);}});
 const id=(req:any)=>z.string().uuid().parse(req.params.id);
 app.get('/api/runtime/governance/billing/template',async()=>({csv:'id,at,model,amount,usageId,providerRequestId,totalTokens\n',note:'供应商账单按标准列整理；usageId仅填写已核对的本平台用量ID，缺失留空。金额为原币种，无自动换汇。'}));
 app.get('/api/runtime/governance/billing/ledger',async req=>billing.ledger(req.query));
 app.get('/api/runtime/governance/billing/summary',async()=>billing.summary());
 app.post('/api/runtime/governance/billing/preview',{bodyLimit:1024*1024},async req=>billing.preview(req.body));
 app.get('/api/runtime/governance/billing/imports',async req=>{const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),before:z.string().uuid().optional()}).strict().parse(req.query);return billing.list(q.limit,q.before);});
 app.post('/api/runtime/governance/billing/imports',{bodyLimit:1024*1024},async req=>billing.import(req.body));
 app.get('/api/runtime/governance/billing/imports/:id',async req=>billing.get(id(req)));
 app.get('/api/runtime/governance/billing/imports/:id/events',async req=>billing.events(id(req),z.object({limit:z.coerce.number().int().min(1).max(200).default(100)}).strict().parse(req.query).limit));
 app.post('/api/runtime/governance/billing/imports/:id/reconcile',async req=>billing.reconcile(id(req),req.body));
 app.put('/api/runtime/governance/billing/imports/:id/lines/:lineId/link',async req=>billing.link(id(req),text().parse((req.params as any).lineId),req.body));
 app.post('/api/runtime/governance/billing/imports/:id/void',async req=>billing.void(id(req),req.body));
}
