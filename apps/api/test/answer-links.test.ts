import test from 'node:test';
import assert from 'node:assert/strict';
import {answerLinks} from '../../web/src/features/family/answer-links';
test('answer links preserve source names, deduplicate and never enable executable or credentialed URLs',()=>{
 assert.deepEqual(answerLinks('[联合国](https://news.un.org/zh/) https://news.un.org/zh/。 [危险](javascript:alert(1)) https://user:password@example.com/ <script>ignored</script>'),[{title:'联合国',url:'https://news.un.org/zh/'}]);
});
test('plain references are limited and remain text without rendering supplied HTML',()=>{
 const result=answerLinks(Array.from({length:12},(_,n)=>`https://example.com/${n}`).join(' '));assert.equal(result.length,8);
 assert.equal(answerLinks('[<img onerror=alert(1)>](https://example.com/)')[0].title,'<img onerror=alert(1)>');
});
