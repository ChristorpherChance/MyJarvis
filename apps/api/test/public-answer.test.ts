import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicAnswerFilter,publicAnswer} from '../src/public-answer.js';
import {speechText} from '../../web/src/features/family/voice-stream.js';
import {BargeSpeechGate} from '../../web/src/features/family/speech-endpoint.js';
test('split hidden reasoning tags never become visible deltas',()=>{
 const filter=new PublicAnswerFilter(),visible:string[]=[];
 for(const chunk of ['<th','ink>private draft.','</thi','nk>你好。','<analysis>draft','</analysis>最终回答。'])visible.push(filter.push(chunk));visible.push(filter.finish());
 assert.equal(visible.join(''),'你好。最终回答。');assert(!visible.some(text=>text.includes('private')));
});
test('nested reasoning and unclosed drafts are removed, ordinary comparison text remains',()=>{
 assert.equal(publicAnswer('<THINK>one<analysis>two</analysis>three</THINK>结果。'),'结果。');
 assert.equal(publicAnswer('<think>unfinished secret'),'');assert.equal(publicAnswer('结果。<reasoning>unfinished secret'),'结果。');
 assert.equal(publicAnswer('1<2，答案成立。'),'1<2，答案成立。');assert.equal(publicAnswer('你好<thi'),'你好');
});
test('paragraph speech keeps several sentences together and strips display-only markup',()=>{
 assert.equal(speechText('**你好。**\n这是第二句。第三句。'),'你好。\n这是第二句。第三句。');
 assert.equal(speechText('请看[说明](https://example.test)。\n```js\ncode\n```\n结束。'),'请看说明。\n结束。');
});
test('barge-in ignores early output and short impulses, but sustained speech can interrupt',()=>{
 const gate=new BargeSpeechGate(0);assert.equal(gate.accept(.2,500),false);assert.equal(gate.accept(.2,950),false);assert.equal(gate.accept(0,1100),false);
 assert.equal(gate.accept(.1,1500),false);assert.equal(gate.accept(.1,1949),false);assert.equal(gate.accept(.1,1950),true);
});
