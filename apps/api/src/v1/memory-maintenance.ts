import {z} from 'zod';
import {createHash} from 'node:crypto';
import {BusinessError,type BusinessRecord,type CommandContext,type DomainHandler} from './types.js';

const fail=(message:string,status=400):never=>{throw new BusinessError(status===409?'CONFLICT':status===403?'FORBIDDEN':'VALIDATION',message,status)};
const nextDate=z.string().datetime({offset:true}).nullable();
export const maintenanceEnvelope=z.object({commandId:z.string().min(1).max(200),expectedVersion:z.number().int().min(1),scope:z.literal('private'),payload:z.record(z.string(),z.unknown())}).strict();
export const mergeMemoryInput=z.object({memoryId:z.string().min(1).max(200),otherMemoryId:z.string().min(1).max(200),otherExpectedVersion:z.number().int().min(1),text:z.string().trim().min(1).max(1200),category:z.string().trim().min(1).max(60),nextReviewAt:nextDate,confirmed:z.literal(true)}).strict();
export const forgetLineageInput=z.object({memoryId:z.string().min(1).max(200),lineageVersion:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(1000),confirmed:z.literal(true)}).strict();
export const reviewMemoryInput=z.discriminatedUnion('outcome',[
  z.object({memoryId:z.string().min(1).max(200),outcome:z.literal('accurate'),nextReviewAt:nextDate,confirmed:z.literal(true)}).strict(),
  z.object({memoryId:z.string().min(1).max(200),outcome:z.literal('changed'),text:z.string().trim().min(1).max(1200),nextReviewAt:nextDate,confirmed:z.literal(true)}).strict()
]);
function owned(ctx:CommandContext,id:string,revision:number){
  const record=ctx.require('memory',id,true);
  if(record.kind!=='memory'||record.profileId!=='me'||record.ownerId!==ctx.actorId||record.scope!=='private')fail('只能操作当前本人私有记忆',403);
  if(record.revision!==revision)fail('记忆已更新，请重新读取后比较或复核',409);
  return record;
}
function reviewDate(value:string|null,now:string){if(value!==null&&Date.parse(value)<=Date.parse(now))fail('下次复核日期请选择未来日期，或明确选择暂不安排');return value===null?null:new Date(value).toISOString()}
const event=(ctx:CommandContext,name:string)=>({at:ctx.now,event:name,actorId:ctx.actorId});
export const memoryMaintenanceHandler:DomainHandler={domain:'memory',commands:['merge-confirmed','review-confirmed','forget-lineage-confirmed'],execute(command,p,ctx){
  if(ctx.scope!=='private')fail('记忆维护仅允许本人私有范围',403);
  if(command==='merge-confirmed'){
    const input=mergeMemoryInput.parse(p);if(input.memoryId===input.otherMemoryId)fail('请选择两条不同的记忆');
    const left=owned(ctx,input.memoryId,ctx.expectedVersion),right=owned(ctx,input.otherMemoryId,input.otherExpectedVersion);
    if(![left,right].every(r=>['active','candidate'].includes(r.status)&&typeof r.text==='string'&&r.text.trim()))fail('只能比较并合并仍有效或待确认的记忆',409);
    const nextReviewAt=reviewDate(input.nextReviewAt,ctx.now);
    const merged=ctx.create('memory',{kind:'memory',profileId:'me',text:input.text,category:input.category,source:'本人比较两条记忆后明确确认合并',status:'active',nextReviewAt,confirmedAt:ctx.now,lastReviewedAt:ctx.now,createdAt:ctx.now,updatedAt:ctx.now,mergeSources:[{id:left.id,revision:left.revision},{id:right.id,revision:right.revision}],history:[event(ctx,'merged-confirmed')]});
    for(const original of [left,right]){ctx.update('memory',original.id,{status:'merged',mergedInto:merged.id,history:[...(original.history??[]),event(ctx,'merged-retired')],updatedAt:ctx.now});ctx.emit('memory',original.id,'merged-retired',{mergedInto:merged.id});}
    ctx.emit('memory',merged.id,'merged-confirmed',{sourceIds:[left.id,right.id]});return merged;
  }
  if(command==='forget-lineage-confirmed'){
    const input=forgetLineageInput.parse(p),selected=owned(ctx,input.memoryId,ctx.expectedVersion);
    if(!['active','candidate','rejected','merged'].includes(selected.status))fail('这条记忆已遗忘',409);
    const component=memoryLineageRecords(ctx.list('memory'),selected.id);
    if(lineageVersion(component)!==input.lineageVersion)fail('关联记忆已变化，请重新读取并确认遗忘范围',409);
    return forgetMemoryLineage(ctx,selected);
  }
  if(command!=='review-confirmed')fail('记忆维护操作不存在');
  const input=reviewMemoryInput.parse(p),record=owned(ctx,input.memoryId,ctx.expectedVersion);
  if(record.status!=='active')fail('只能复核当前生效的记忆',409);
  const nextReviewAt=reviewDate(input.nextReviewAt,ctx.now),history=[...(record.history??[]),event(ctx,input.outcome==='accurate'?'review-still-accurate':'review-changed')];
  // A changed confirmation retains its original provenance as historical evidence only.
  if(input.outcome==='changed')history.push(event(ctx,'edited-confirmed'));
  const updated=ctx.update('memory',record.id,{...(input.outcome==='changed'?{text:input.text,confirmedAt:ctx.now}:{}),nextReviewAt,lastReviewedAt:ctx.now,updatedAt:ctx.now,history});
  ctx.emit('memory',record.id,input.outcome==='accurate'?'review-still-accurate':'review-changed');return updated;
}};

/** Erase the whole connected merge lineage; records and receipts never copy another record's prose. */
export function memoryLineageRecords(input:BusinessRecord[],selectedId:string){
  const records=input.filter(r=>r.kind==='memory'&&r.profileId==='me'&&r.scope==='private'),ids=new Set([selectedId]);
  for(let changed=true;changed;){changed=false;for(const record of records){const linked=[record.mergedInto,...(record.mergeSources??[]).map((r:any)=>r?.id)].filter(id=>typeof id==='string');if(ids.has(record.id)||linked.some(id=>ids.has(id))){for(const id of [record.id,...linked])if(!ids.has(id)){ids.add(id);changed=true;}}}}
  return records.filter(r=>ids.has(r.id));
}
export const lineageVersion=(records:BusinessRecord[])=>createHash('sha256').update(JSON.stringify(records.map(r=>[r.id,r.revision]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
export function forgetMemoryLineage(ctx:CommandContext,selected:BusinessRecord){
  const records=memoryLineageRecords(ctx.list('memory'),selected.id);
  let result:BusinessRecord|undefined;
  for(const original of records){
    const record=ctx.update('memory',original.id,{text:null,source:null,...(original.evidenceQuote!==undefined?{evidenceQuote:null}:{}),...(original.evidence!==undefined?{evidence:null}:{}),previousTexts:[],mergeSources:[],mergedInto:null,nextReviewAt:null,status:'forgotten',category:'已遗忘',confirmedAt:null,forgottenAt:ctx.now,history:[event(ctx,'forgotten')],updatedAt:ctx.now});
    ctx.redactReceipts('memory',record.id,record);ctx.emit('memory',record.id,'forgotten',{status:'forgotten'});if(record.id===selected.id)result=record;
  }
  return result!;
}

const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
function tokens(value:string){const normalized=value.normalize('NFKC').toLowerCase(),result=new Set(normalized.match(/[a-z0-9]{2,}/g)??[]);for(const block of normalized.match(/[\p{Script=Han}]+/gu)??[])for(let i=0;i<block.length-1;i++)result.add(block.slice(i,i+2));return result;}
export function memoryWorkbench(records:BusinessRecord[],now=new Date().toISOString()){
  const items=records.filter(r=>r.kind==='memory'&&r.scope==='private'&&r.profileId==='me'&&r.status!=='forgotten'),current=items.filter(r=>['active','candidate'].includes(r.status));
  const due=current.filter(r=>r.status==='active'&&r.nextReviewAt&&Number.isFinite(Date.parse(r.nextReviewAt))&&Date.parse(r.nextReviewAt)<=Date.parse(now)).sort((a,b)=>Date.parse(a.nextReviewAt)-Date.parse(b.nextReviewAt));
  const prepared=current.map(record=>({record,tokens:tokens(record.text)})),pairs:{leftId:string;rightId:string;reason:string;sharedFragments:string[];score:number}[]=[];
  for(let i=0;i<prepared.length;i++)for(let j=i+1;j<prepared.length;j++){
    const a=prepared[i],b=prepared[j],shared=[...a.tokens].filter(t=>b.tokens.has(t)),exact=normalize(a.record.text)===normalize(b.record.text),sameCategory=normalize(a.record.category)===normalize(b.record.category),score=shared.length/Math.max(1,Math.min(a.tokens.size,b.tokens.size));
    if(exact||sameCategory&&shared.length>=1&&score>=.25)pairs.push({leftId:a.record.id,rightId:b.record.id,reason:exact?'原文字词相同，请本人比较':'同类且含相同词片段，请本人比较',sharedFragments:shared.slice(0,8),score:exact?2:score});
  }
  pairs.sort((a,b)=>b.score-a.score||a.leftId.localeCompare(b.leftId)||a.rightId.localeCompare(b.rightId));
  const seen=new Set<string>(),lineages:{ids:string[];version:string}[]=[];for(const record of items){if(seen.has(record.id))continue;const component=memoryLineageRecords(items,record.id);component.forEach(r=>seen.add(r.id));lineages.push({ids:component.map(r=>r.id),version:lineageVersion(component)});}
  return {checkedAt:now,records:items,lineages,dueIds:due.map(r=>r.id),pairs:pairs.slice(0,50),totalPairs:pairs.length,comparison:'literal-fragments' as const,notice:'相同字词或同类片段仅提示可能重复，不能判断语义冲突；由本人比较并决定最终表述。复核日期仅提醒，不会自动停用生效记忆。'};
}
