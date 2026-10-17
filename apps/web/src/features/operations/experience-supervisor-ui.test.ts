import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('experience detail renders machine conditions, lineage and independent review controls',async()=>{
 const source=await readFile(new URL('./experience.tsx',import.meta.url),'utf8');
 for(const text of ['主管经验范围与状态','适用机器','执行器','原生CLI版本','来源决策与反例','记录反例','撤销验证','标记被替代','顶层验证资格'])assert.ok(source.includes(text),`missing UI affordance ${text}`);
 assert.match(source,/supervisorLearning\.conditions\?\.machineId/);assert.match(source,/counterexamples:/);assert.match(source,/command:'supersede'/);assert.match(source,/command:'revoke-verification'/);
});

test('supervisor panel distinguishes correction facts/preferences and fetches full event history by id',async()=>{
 const source=await readFile(new URL('./ProjectSupervisorPanel.tsx',import.meta.url),'utf8');
 for(const text of ['纠正事实','纠正偏好/方案选择','修订目标与条件','查看完整事件链','/events/${encodeURIComponent(event.eventId)}','correctionType'])assert.ok(source.includes(text),`missing UI affordance ${text}`);
 assert.match(source,/correctionType==='fact'\?\{correctedFact\}:\{preferredOption\}/);assert.match(source,/goalRevision/);
});
