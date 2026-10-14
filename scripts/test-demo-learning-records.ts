import test from 'node:test';
import assert from 'node:assert/strict';
import {freshDemo,reduceDemo} from '../apps/web/src/demo/model';
const complete=(payload:Record<string,unknown>)=>reduceDemo(freshDemo(),{type:'family.learning.complete',payload:{profile:'me',type:'language',title:'本次口语练习',minutes:10,...payload}});
test('保存实际轮次、原始答句与已显示改句，不补造评分',()=>{
 const rounds=[{question:'What did you do yesterday?',answer:'I go to the park yesterday.',feedback:'go 的过去式是 went。',correction:'I went to the park yesterday.'},{question:'What would you like to do tomorrow?',answer:'I would like to read a book.',feedback:'可以补充 because…'}];
 const answers=rounds.map(r=>r.answer),corrections=['I went to the park yesterday.'];
 const d=complete({rounds,answers,corrections}),event=d.learning.me.events[0];
 assert.deepEqual(event.rounds,rounds);assert.deepEqual(event.answers,answers);assert.deepEqual(event.corrections,corrections);assert.ok(!Object.hasOwn(event,'score'));assert.equal(d.learning.wife.events?.length||0,0);
 rounds[0].answer='changed';answers[0]='changed';corrections[0]='changed';assert.equal(event.rounds[0].answer,'I go to the park yesterday.');assert.equal(event.answers[0],'I go to the park yesterday.');assert.equal(event.corrections[0],'I went to the park yesterday.');
});
test('无逐轮记录或没有发生纠错时保持缺省与空数组',()=>{const legacy=complete({}).learning.me.events[0];assert.ok(!Object.hasOwn(legacy,'rounds'));assert.ok(!Object.hasOwn(legacy,'corrections'));const event=complete({rounds:[{question:'',answer:'I am happy.',feedback:''}],answers:['I am happy.'],corrections:[]}).learning.me.events[0];assert.deepEqual(event.corrections,[]);assert.ok(!Object.hasOwn(event.rounds[0],'correction'));});
test('拒绝无效轮次、超过上限及跨成员保存',()=>{assert.throws(()=>complete({rounds:'not-an-array'}),/格式/);assert.throws(()=>complete({rounds:[{question:'Q',answer:'',feedback:'F'}]}),/答句/);assert.throws(()=>complete({rounds:new Array(1001).fill({answer:'A'})}),/1000/);assert.throws(()=>complete({corrections:[{}]}),/纠错/);assert.throws(()=>complete({profile:'wife',answers:['private']}),/切换/);});
