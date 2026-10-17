import test from 'node:test';
import assert from 'node:assert/strict';
import {clearLiveKnowledgeSession,executeLiveKnowledge} from '../../web/src/demo/live-knowledge-commands.js';
import {memoryEditorRefresh} from '../../web/src/features/family/memory-editor-refresh.js';
import {taskOutcomeLabels} from '../../web/src/features/operations/task-outcome-labels.js';

test('different selected files with identical metadata each upload their own bytes, including concurrent selection',async()=>{
 const savedFetch=globalThis.fetch;clearLiveKnowledgeSession();let tickets=0,books=0;const uploaded=new Map<string,string>();
 const records:any={sources:[{id:'source',kind:'source',scope:'family',revision:1}]};
 const payload=(file:File)=>({source:'source',title:'scan',files:[file],rights:'authorized'});
 globalThis.fetch=async(path,init)=>{
  if(String(path).endsWith('/commands/create-upload')){const id=`upload-${++tickets}`;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({data:{id},events:[]})}
  if(init?.method==='PUT'){uploaded.set(String(path),await (init.body as File).text());return Response.json({ok:true})}
  if(String(path).endsWith('/commands/create'))return Response.json({data:{id:`book-${++books}`},events:[]});
  throw Error('unexpected request');
 };
 try{
  const one=new File(['AAAA'],'scan.pdf',{type:'application/pdf',lastModified:1000}),two=new File(['BBBB'],'scan.pdf',{type:'application/pdf',lastModified:1000});
  const first=await executeLiveKnowledge('knowledge.book.upload',payload(one),{} as any,records);
  const second=await executeLiveKnowledge('knowledge.book.upload',payload(two),{} as any,records);
  assert.notDeepEqual(first,second);assert.equal(tickets,2);assert.equal(books,2);assert.deepEqual([...uploaded.values()],['AAAA','BBBB']);
  const three=new File(['CCCC'],'scan.pdf',{type:'application/pdf',lastModified:1000}),four=new File(['DDDD'],'scan.pdf',{type:'application/pdf',lastModified:1000});
  await Promise.all([executeLiveKnowledge('knowledge.book.upload',payload(three),{} as any,records),executeLiveKnowledge('knowledge.book.upload',payload(four),{} as any,records)]);
  assert.equal(tickets,4);assert.equal(books,4);assert.deepEqual(new Set(uploaded.values()),new Set(['AAAA','BBBB','CCCC','DDDD']));
 }finally{globalThis.fetch=savedFetch;clearLiveKnowledgeSession()}
});

test('background memory changes keep an open draft, while forgetting or losing its target clears private text',()=>{
 assert.equal(memoryEditorRefresh('add','',[]),'preserve');assert.equal(memoryEditorRefresh('policy','',[]),'preserve');
 const current=[{id:'editing',status:'active',revision:8},{id:'other',status:'candidate',revision:1}];
 assert.equal(memoryEditorRefresh('edit','editing',current),'preserve');
 assert.equal(memoryEditorRefresh('edit','editing',[{id:'editing',status:'candidate'}]),'preserve');
 for(const status of ['forgotten','rejected','merged'])assert.equal(memoryEditorRefresh('edit','editing',[{id:'editing',status}]),'clear');
 assert.equal(memoryEditorRefresh('edit','editing',[{id:'other',status:'active'}]),'clear');assert.equal(memoryEditorRefresh('detail','editing',current),'clear');
});

test('a successful execution without acceptance stays pending acceptance rather than displaying a computed percentage',()=>{
 assert.deepEqual(taskOutcomeLabels({executionStatus:'succeeded'}),{execution:'执行成功',acceptance:'尚未独立验收'});
 assert.deepEqual(taskOutcomeLabels({executionStatus:'failed',acceptance:{outcome:'fail'}}),{execution:'执行失败',acceptance:'独立验收未通过'});
 assert.equal(taskOutcomeLabels({acceptance:{outcome:'pass'}}).acceptance,'独立验收通过');
 assert.equal(taskOutcomeLabels({}).execution,'暂无受控执行回执');
});

test('retry and concurrent save of the same File keep a single upload intent after a lost response',async()=>{
 const savedFetch=globalThis.fetch;clearLiveKnowledgeSession();let tickets=0,puts=0,books=0;
 globalThis.fetch=async(path,init)=>{
  if(String(path).endsWith('/commands/create-upload')){tickets++;return Response.json({data:{id:'upload-one'},events:[]})}
  if(init?.method==='PUT'){puts++;if(puts===1)throw new TypeError('connection lost');await new Promise(resolve=>setTimeout(resolve,5));return Response.json({ok:true})}
  if(String(path).endsWith('/commands/create')){books++;return Response.json({data:{id:'book-one'},events:[]})}
  throw Error('unexpected request');
 };
 const file=new File(['same'],'scan.pdf',{type:'application/pdf',lastModified:1000}),payload={source:'source',title:'scan',files:[file]},records:any={sources:[{id:'source',kind:'source',scope:'family',revision:1}]};
 try{
  await assert.rejects(()=>executeLiveKnowledge('knowledge.book.upload',payload,{} as any,records),TypeError);
  const [first,second]=await Promise.all([executeLiveKnowledge('knowledge.book.upload',payload,{} as any,records),executeLiveKnowledge('knowledge.book.upload',payload,{} as any,records)]);
  assert.deepEqual(first,second);assert.equal(tickets,1);assert.equal(puts,2);assert.equal(books,1);
  assert.deepEqual(await executeLiveKnowledge('knowledge.book.upload',payload,{} as any,records),first);assert.equal(puts,2);
 }finally{globalThis.fetch=savedFetch;clearLiveKnowledgeSession()}
});
