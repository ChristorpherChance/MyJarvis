import assert from 'node:assert/strict';
import test from 'node:test';
import {knowledgeBookIdFromResult,knowledgePageMatchesFilter,knowledgePageWindow,knowledgeUploadIssue,MAX_KNOWLEDGE_SCAN_BYTES} from './domain.ts';

test('长书页码窗口有界且支持跳至尾页和筛选后的非连续页',()=>{
 const tail=knowledgePageWindow(10000,9999,61);assert.equal(tail.length,61);assert.ok(tail.includes(9999));assert.equal(tail.at(-1),10000);
 const filtered=knowledgePageWindow(10000,8000,61,[2,14,203,7998,8001,9950]);assert.equal(filtered.length,6);assert.ok(filtered.includes(8001));
 assert.deepEqual(knowledgePageWindow(10000,1,10,[3,5,8,12,20]),[3,5,8,12,20]);
});

test('页面筛选区分已转录、未裁决疑点和全部页面',()=>{
 const doubts=new Set([4,9]),transcribed=new Set([1,4,7]);
 assert.equal(knowledgePageMatchesFilter(2,'all',doubts,transcribed),true);
 assert.equal(knowledgePageMatchesFilter(4,'doubt',doubts,transcribed),true);
 assert.equal(knowledgePageMatchesFilter(9,'doubt',doubts,transcribed),true);
 assert.equal(knowledgePageMatchesFilter(7,'untranscribed',doubts,transcribed),false);
 assert.equal(knowledgePageMatchesFilter(8,'untranscribed',doubts,transcribed),true);
});

test('真实扫描上传限制单文件、格式和字节数，32MiB边界接受',()=>{
 assert.equal(knowledgeUploadIssue([{name:'book.pdf',size:1}],true),null);
 assert.equal(knowledgeUploadIssue([{name:'one.pdf',size:1},{name:'two.jpg',size:1}],true)?.includes('一个文件'),true);
 assert.equal(knowledgeUploadIssue([{name:'book.exe',size:1}],false)?.includes('仅支持'),true);
 assert.equal(knowledgeUploadIssue([{name:'book.pdf',size:MAX_KNOWLEDGE_SCAN_BYTES}],true),null);
 assert.equal(knowledgeUploadIssue([{name:'book.pdf',size:MAX_KNOWLEDGE_SCAN_BYTES+1}],true)?.includes('32 MiB'),true);
 assert.equal(knowledgeUploadIssue([{name:'empty.png',size:0}],true)?.includes('1 字节'),true);
});

test('上传操作结果取回准确书目ID，不将布尔成功当作记录',()=>{
 assert.equal(knowledgeBookIdFromResult({requestId:'request',data:{id:'book-accurate',title:'刚上传'}}),'book-accurate');
 assert.equal(knowledgeBookIdFromResult({bookId:'book-alias'}),'book-alias');
 assert.equal(knowledgeBookIdFromResult(true),undefined);
 assert.equal(knowledgeBookIdFromResult({ok:true}),undefined);
});
