import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultUsageFilters,tokenNumber,usageDayBoundary,usagePageCSV,usageQuery,type UsageRecord} from '../apps/web/src/features/operations/usage-ledger.ts';

test('all history does not apply a hidden date or browser-language filter',()=>{
 assert.equal(usageQuery(defaultUsageFilters(),'Asia/Shanghai',new Date('2026-10-10T23:00:00Z')).toString(),'');
});
test('calendar boundaries use policy timezone including daylight saving transitions',()=>{
 assert.equal(usageDayBoundary('2026-10-10','Asia/Shanghai'),'2026-10-09T16:00:00.000Z');
 assert.equal(usageDayBoundary('2026-03-08','America/New_York'),'2026-03-08T05:00:00.000Z');
 assert.equal(usageDayBoundary('2026-03-09','America/New_York'),'2026-03-09T04:00:00.000Z');
});
test('inclusive custom last day becomes exclusive backend boundary and preserves attribution',()=>{
 const f={...defaultUsageFilters(),period:'custom' as const,from:'2026-10-01',until:'2026-10-10',projectId:'factory',machineId:'101',source:'pi',actorId:'me'};
 const q=usageQuery(f);assert.equal(q.get('from'),'2026-09-30T16:00:00.000Z');assert.equal(q.get('until'),'2026-10-10T16:00:00.000Z');
 assert.equal(q.get('projectId'),'factory');assert.equal(q.get('machineId'),'101');assert.equal(q.get('actorId'),'me');
 assert.throws(()=>usageQuery({...f,from:'2026-10-11'}),/开始日期/);
});
test('today and seven day presets are anchored to server timezone calendar',()=>{
 const at=new Date('2026-10-10T23:00:00Z');
 const today=usageQuery({...defaultUsageFilters(),period:'today'},'Asia/Shanghai',at);assert.equal(today.get('from'),'2026-10-10T16:00:00.000Z');
 const week=usageQuery({...defaultUsageFilters(),period:'week'},'Asia/Shanghai',at);assert.equal(week.get('from'),'2026-10-04T16:00:00.000Z');
});
test('unknown is distinct from measured local zero and CSV retains blanks',()=>{
 assert.equal(tokenNumber(null),'未知');assert.equal(tokenNumber(0),'0');
 const record={id:'usage1',run_id:'run1',actor_id:'me',provider:'gateway',model:'=UNSAFE()',origin:'chat',scenario:null,input_tokens:null,output_tokens:null,cache_read:null,cache_write:null,total_tokens:null,cost_usd:null,cost_kind:'unavailable',measured_at:'2026-10-10T01:00:00Z',source:'pi',source_record_id:null,usage_kind:'model',measurement_status:'unknown',project_id:null,machine_id:null,task_id:null,executor_id:null} satisfies UsageRecord;
 const csv=usagePageCSV([record]);assert.match(csv,/"'=UNSAFE\(\)"/);assert.match(csv,/"unknown","","","","","","","unavailable"/);
});
