import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

// Real HTTP handlers and isolated SQLite/files only. A disabled model and a
// rejecting fetch boundary cannot manufacture an executor, OCR or model result.
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'jarvis-action-effectiveness-r40-'));
 const originalFetch=globalThis.fetch;let networkAttempts=0,modelAttempts=0,requests=0;
 globalThis.fetch=async()=>{networkAttempts++;throw new Error('R40_EXTERNAL_FETCH_FORBIDDEN')};
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},
  run:async()=>{modelAttempts++;throw new Error('R40_MODEL_EXECUTION_FORBIDDEN')}} as unknown as PiService;
 let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 const open=()=>createApp({dataDir:dir,pi,webDir:join(dir,'absent-web'),pythonExecutable:join(dir,'absent-python')});
 try{
  runtime=await open();
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'isolated-r40-action-effectiveness-passphrase'}});
  assert.equal(setup.statusCode,200,setup.body);
  const cookie=String(setup.headers['set-cookie']).split(';')[0],headers={cookie};
  const request=async(options:Record<string,any>)=>{requests++;return runtime!.app.inject({...options,headers:{...headers,...options.headers}})};
  const command=async(domain:string,name:string,payload:Record<string,unknown>,version=0,scope='personal',commandId=randomUUID())=>request({method:'POST',url:`/api/v1/${['sources','books','stories'].includes(domain)?'knowledge/':''}${domain}/commands/${name}`,payload:{commandId,expectedVersion:version,scope,payload}});
  const commit=async(domain:string,name:string,payload:Record<string,unknown>,version=0,scope='personal',commandId?:string)=>{
   const response=await command(domain,name,payload,version,scope,commandId);assert.equal(response.statusCode,200,`${domain}.${name}: ${response.body}`);return response.json().data;
  };
  const read=async(domain:string,id:string)=>{const response=await request({url:`/api/v1/${['sources','books','stories'].includes(domain)?'knowledge/':''}${domain}/${encodeURIComponent(id)}`});assert.equal(response.statusCode,200,response.body);return response.json().data};
  const list=async(domain:string)=>{const response=await request({url:`/api/v1/${domain}?limit=100`});assert.equal(response.statusCode,200,response.body);return response.json().data.items as any[]};
  const value=async(url:string,payload?:unknown)=>{const response=await request({url,...payload===undefined?{}:{method:'POST',payload}});assert.equal(response.statusCode,200,response.body);return response.json()};
  return {dir,request,command,commit,read,list,value,
   async restart(){await runtime!.app.close();runtime=await open()},
   counts(){return {requests,networkAttempts,modelAttempts}},
   async close(){try{await runtime?.app.close()}finally{globalThis.fetch=originalFetch;const absolute=resolve(dir);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&basename(absolute).startsWith('jarvis-action-effectiveness-r40-'));await rm(absolute,{recursive:true,force:true});assert.equal(networkAttempts,0);assert.equal(modelAttempts,0)}}};
 }catch(error){try{await runtime?.app.close()}finally{globalThis.fetch=originalFetch;const absolute=resolve(dir);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&basename(absolute).startsWith('jarvis-action-effectiveness-r40-'));await rm(absolute,{recursive:true,force:true})}throw error}
}

test('R40 项目编辑和任务取消有持久产物，未配置执行器明确拒绝且不伪造执行',{timeout:60_000},async t=>{
 const f=await fixture();try{
  let project=await f.commit('projects','register',{name:'隔离操作项目',description:'验证写入后的真实记录',goal:'保存、版本保护与重启读取',milestones:['核对记录产物']});
  project=await f.commit('projects','update',{projectId:project.id,name:'修改后的隔离项目',description:'已修改说明',goal:'修改后仍可准确读取'},project.revision);
  assert.equal((await f.read('projects',project.id)).name,'修改后的隔离项目');
  const task=await f.commit('tasks','create',{title:'无执行器的隔离任务',projectId:project.id,machineId:'local',agent:'manual-external',mode:'managed',goal:'检查真实阻塞',criteria:'没有执行器不能运行',budget:10,retryLimit:0});
  const denied=await f.command('tasks','start',{taskId:task.id},task.revision);
  assert.equal(denied.statusCode,503,denied.body);assert.equal(denied.json().code,'NOT_CONFIGURED');
  assert.deepEqual(await f.read('tasks',task.id),task,'a refused start cannot change task revision, cost or status');
  const cancelled=await f.commit('tasks','cancel',{taskId:task.id,reason:'隔离验证取消'},task.revision);
  assert.equal(cancelled.status,'cancelled');
  const stale=await f.command('projects','update',{projectId:project.id,name:'旧版本覆盖',description:'不应保存',goal:'不应覆盖'},project.revision-1);
  assert.equal(stale.statusCode,409,stale.body);
  await f.restart();assert.deepEqual(await f.read('projects',project.id),project);assert.deepEqual(await f.read('tasks',task.id),cancelled);
  const overview=(await f.value('/api/v1/execution/supervision')).data;
  assert.equal(overview.tasks.find((row:any)=>row.taskId===task.id).runs,0);
  t.diagnostic(JSON.stringify({scope:'project-task',...f.counts(),executorOutcome:'NOT_CONFIGURED',executionRuns:0,restartExact:true}));
 }finally{await f.close()}
});

test('R40 研究人工证据与明确决定生成唯一真实项目，重复提交不新增产物',{timeout:60_000},async t=>{
 const f=await fixture();try{
  let research=await f.commit('research','create',{title:'隔离研究决定',raw:'需要保存原始问题和出处'});
  research=await f.commit('research','discuss',{researchId:research.id,text:'先保原始记录',question:'怎样核对版本？',criteria:'有明确证据'},research.revision);
  research=await f.commit('research','evidence',{researchId:research.id,kind:'support',title:'人工隔离证据',summary:'本组仅验证记录与关联',source:'合成测试材料',locator:'R40-LOCAL-REFERENCE',status:'verified'},research.revision);
  research=await f.commit('research','option',{researchId:research.id,title:'保留固定版本',approach:'保存来源与版本',risk:'后续修订需另核',effort:'有限记录',budget:1,benefit:'可追溯'},research.revision);
  research=await f.commit('research','decide',{researchId:research.id,choice:'accepted',reason:'仅人工选择隔离记录方案',optionId:research.options[0].id},research.revision);
  const commandId=randomUUID(),payload={researchId:research.id,name:'研究转换产物',description:'保留明确选择与来源',goal:'关联同一研究记录',milestones:['核对出处']};
  const project=await f.commit('research','convert',payload,research.revision,'personal',commandId);
  assert.deepEqual(await f.commit('research','convert',payload,research.revision,'personal',commandId),project);
  const linked=await f.read('research',research.id);assert.equal(linked.projectId,project.id);assert.equal(linked.status,'converted');
  assert.equal((await f.list('projects')).filter(row=>row.id===project.id).length,1);
  await f.restart();assert.deepEqual(await f.read('research',research.id),linked);assert.deepEqual(await f.read('projects',project.id),project);
  const unavailable=await f.command('jobs','create',{kind:'research',title:'应明确阻塞',instruction:'没有模型配置时不能生成结果'},0,'private');
  assert.equal(unavailable.statusCode,503,unavailable.body);assert.equal(unavailable.json().code,'NOT_CONFIGURED');assert.equal((await f.list('jobs')).length,0);
  t.diagnostic(JSON.stringify({scope:'research-decision',...f.counts(),projectsCreated:1,idempotentReplay:true,restartExact:true,modelJobOutcome:'NOT_CONFIGURED'}));
 }finally{await f.close()}
});

function onePagePdf(){
 const content='BT /F1 12 Tf 20 50 Td (R40 isolated original) Tj ET\n';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let text='%PDF-1.4\n';const offsets=[0];
 for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${index+1} 0 obj\n${object}\nendobj\n`}
 const xref=Buffer.byteLength(text);text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(text);
}

test('R40 知识原件真实入库与重启字节回读，人工发布可检索，撤权立即移出结果',{timeout:60_000},async t=>{
 const f=await fixture();try{
  const source=await f.commit('sources','save',{name:'隔离原文来源',type:'本地文档库',mode:'local',endpoint:'local://r40-original',topics:'隔离验证',rights:'合成原件内部验证',authorized:true},0,'family');
  const bytes=onePagePdf(),upload=await f.commit('books','create-upload',{sourceId:source.id,filename:'r40-original.pdf',mime:'application/pdf',size:bytes.length},0,'family');
  const binary='/api/v1/book-uploads/'+upload.id+'/file',put=await f.request({method:'PUT',url:binary,headers:{'content-type':'application/octet-stream'},payload:bytes});assert.equal(put.statusCode,200,put.body);
  let book=await f.commit('books','create',{uploadId:upload.id,title:'隔离原文',edition:'合成单页',pages:1,rights:'测试内部使用'},0,'family');
  assert.equal(book.file.sha256,createHash('sha256').update(bytes).digest('hex'));
  const text='R40-KNOWLEDGE-NEEDLE 原文由本测试手动登记，不冒OCR。';
  book=await f.commit('books','page',{bookId:book.id,page:1,text,evidence:'合成原件第1页，人工登记接口验证',pagesVerified:true},book.revision,'family');
  book=await f.commit('books','review-page',{bookId:book.id,page:1,evidence:'人工回查合成单页与登记内容',confirmed:true},book.revision,'family');
  book=await f.commit('books','publish',{bookId:book.id,confirmed:true},book.revision,'family');assert.equal(book.text,text);assert.equal(book.status,'published');
  await f.restart();const stored=await f.request({url:binary});assert.equal(stored.statusCode,200,stored.body);assert.deepEqual(stored.rawPayload,bytes);
  const query=()=>f.commit('sources','query',{query:'R40-KNOWLEDGE-NEEDLE',mode:'local'},0,'family');
  const result=await query();assert.ok(result.results.some((row:any)=>row.book===book.id&&row.text===text&&row.version===book.version));
  const currentSource=await f.read('sources',source.id);await f.commit('sources','authorize',{sourceId:source.id,authorized:false,reason:'隔离测试明确撤销'},currentSource.revision,'family');
  assert.deepEqual((await query()).results,[]);
  t.diagnostic(JSON.stringify({scope:'knowledge',...f.counts(),storedOriginalBytes:bytes.length,binaryRestartExact:true,publishedPageCount:1,manualTextNotOCR:true,revocationSearchEmpty:true}));
 }finally{await f.close()}
});

test('R40 本人记忆确认后可查、遗忘后消失，家庭待办完成和移除是真实记录变化',{timeout:60_000},async t=>{
 const f=await fixture();try{
  const candidate=await f.commit('memory','candidate',{text:'R40-MEMORY-NEEDLE 本人明确录入。',category:'隔离验证',source:'合成测试手动输入'},0,'private');
  const query=()=>f.value('/api/runtime/memory/query',{query:'R40-MEMORY-NEEDLE'});
  assert.deepEqual((await query()).records,[]);
  const active=await f.commit('memory','confirm',{memoryId:candidate.id,confirmed:true},candidate.revision,'private');
  assert.equal((await query()).records[0].id,active.id);
  const todo=await f.commit('family','todo',{operation:'create',text:'隔离家庭待办'},0,'family');
  const completed=await f.commit('family','todo',{operation:'complete',todoId:todo.id,completed:true},todo.revision,'family');assert.equal(completed.done,true);
  await f.restart();assert.equal((await query()).records[0].id,active.id);assert.deepEqual(await f.read('family',todo.id),completed);
  const forgotten=await f.commit('memory','forget',{memoryId:active.id,reason:'本人撤回隔离记忆'},active.revision,'private');assert.equal(forgotten.text,null);assert.deepEqual((await query()).records,[]);
  const removed=await f.commit('family','todo',{operation:'remove',todoId:todo.id},completed.revision,'family');assert.equal((await f.read('family',todo.id)).status,'removed');assert.equal(removed.id,todo.id);
  t.diagnostic(JSON.stringify({scope:'memory-family',...f.counts(),activeSearchThenForgetVerified:true,todoCompletedRestartExact:true,todoRemovalReadback:true}));
 }finally{await f.close()}
});

test('R40 平台策略立即进入真实运行门并跨重启保留，不重复R39个人安静时段组',{timeout:60_000},async t=>{
 const f=await fixture();try{
  let policy=await f.commit('settings','policy',{supervise:false,autoWake:false,emergency:true,dailyBudget:10,retryLimit:0});
  assert.equal((await f.value('/api/v1/execution/supervision')).data.stopped,true);
  const stale=await f.command('settings','policy',{supervise:true,autoWake:false,emergency:false,dailyBudget:10,retryLimit:0},0);assert.equal(stale.statusCode,409,stale.body);assert.deepEqual(await f.read('settings',policy.id),policy);
  policy=await f.commit('settings','policy',{supervise:true,autoWake:false,emergency:false,dailyBudget:10,retryLimit:0},policy.revision);
  let effective=(await f.value('/api/v1/execution/supervision')).data;assert.equal(effective.stopped,false);assert.equal(effective.supervised,true);
  await f.restart();assert.deepEqual(await f.read('settings',policy.id),policy);effective=(await f.value('/api/v1/execution/supervision')).data;assert.equal(effective.supervised,true);assert.equal(effective.stopped,false);
  policy=await f.commit('settings','policy',{supervise:false,autoWake:false,emergency:false,dailyBudget:10,retryLimit:0},policy.revision);assert.equal((await f.value('/api/v1/execution/supervision')).data.supervised,false);
  t.diagnostic(JSON.stringify({scope:'platform-settings',...f.counts(),effectiveEmergencyAndSupervisionVerified:true,staleRejected:true,restartExact:true}));
 }finally{await f.close()}
});
