import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {PiService} from '../src/pi.js';
import {createApp} from '../src/app.js';
import {V1Repository} from '../src/v1/repository.js';
import {knowledgeHandlers} from '../src/v1/knowledge-domains.js';
import {jobHandler} from '../src/v1/job-domains.js';
import {PiJobRuntime} from '../src/v1/job-runtime.js';
import {assertDto} from '../src/v1/contract.js';
import type {BusinessRecord,Domain,Scope} from '../src/v1/types.js';

type RunResult={text:string;status:'complete'|'cancelled'|'failed'};
class HoldingPi {
 calls:any[]=[];aborts:string[]=[];private pending=new Map<string,(value:RunResult)=>void>();
 health(){return {configured:true};}
 async run(input:any):Promise<RunResult>{this.calls.push(input);return new Promise(resolve=>this.pending.set(input.conversationId,resolve));}
 async abort(id:string,_actor:string){this.aborts.push(id);const settle=this.pending.get(id);if(settle){this.pending.delete(id);settle({text:'',status:'cancelled'});}}
}
const ACTOR='server-admin',scope:Scope='private';
const dtoNames:Partial<Record<Domain,string>>={sources:'KnowledgeSourcesRecordV2',books:'KnowledgeBooksRecordV2',stories:'KnowledgeStoriesRecordV2',jobs:'PiJob'};
function command(repo:V1Repository,domain:Domain,name:string,payload:Record<string,any>,expectedVersion=0):BusinessRecord {
 const handler=domain==='jobs'?jobHandler:knowledgeHandlers.find(h=>h.domain===domain)!;
 return repo.execute(handler,name,{commandId:randomUUID(),expectedVersion,scope,payload},ACTOR,()=>undefined,()=>false,receipt=>assertDto(dtoNames[domain]!,receipt.data),{ready:()=>true}).data;
}
async function seedPublishedBook(repo:V1Repository,directory:string){
 const source=command(repo,'sources','save',{name:'专项测试原件',type:'本地文档库',mode:'local',endpoint:'local://knowledge-job-test',topics:'测试经典',rights:'隔离测试内部使用',authorized:true});
 const bytes=Buffer.from('%PDF-1.7\nIsolated fixture original.\n%%EOF\n'),ticket=command(repo,'books','create-upload',{sourceId:source.id,filename:'test-original.pdf',mime:'application/pdf',size:bytes.length});
 const originals=resolve(directory,'knowledge-uploads');assert.ok(originals.startsWith(resolve(directory)+sep));await mkdir(originals,{recursive:true});await writeFile(join(originals,ticket.id+'.bin'),bytes,{flag:'wx'});
 command(repo,'books','complete-upload',{uploadId:ticket.id,size:bytes.length,mime:'application/pdf',sha256:createHash('sha256').update(bytes).digest('hex')},ticket.revision);
 let book=command(repo,'books','create',{uploadId:ticket.id,title:'实际人工校对来源',edition:'测试独立版',pages:1,rights:'隔离测试内部使用'});
 book=command(repo,'books','page',{bookId:book.id,page:1,text:'这是一页专项测试的实际人工转录。',evidence:'测试原件第1页逐字登记',pagesVerified:true},book.revision);
 book=command(repo,'books','review-page',{bookId:book.id,page:1,evidence:'测试人工独立回查第1页',confirmed:true},book.revision);
 book=command(repo,'books','publish',{bookId:book.id,confirmed:true},book.revision);
 assertDto('KnowledgeBooksRecordV2',book);return {book,sourceId:source.id};
}
async function temporary(){const directory=await mkdtemp(join(tmpdir(),'jarvis-knowledge-jobs-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));return directory;}
async function removeTemporary(directory:string){const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-knowledge-jobs-'));await rm(absolute,{recursive:true,force:true});}
async function fixture(){const directory=await temporary(),store=new Store(directory),repo=new V1Repository(store.databasePath),pi=new HoldingPi(),worker=new PiJobRuntime(repo,pi as unknown as PiService,()=>false);return {directory,store,repo,pi,worker,async close(){await worker.close();repo.close();store.close();await removeTemporary(directory);}};}
async function until(repo:V1Repository,id:string,status:string){const end=Date.now()+7000;while(Date.now()<end){const r=repo.read('jobs',id,ACTOR);if(r?.status===status)return r;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('作业未进入预期状态：'+status);}
function createJob(repo:V1Repository,book:BusinessRecord){return command(repo,'jobs','create',{kind:'knowledge',title:'原文解读专项',instruction:'给出有出处的待审阅解读草稿。',sourceId:book.id,sourceVersion:book.revision});}
function revoke(repo:V1Repository,id:string){const source=repo.read('sources',id,ACTOR)!;return command(repo,'sources','authorize',{sourceId:id,authorized:false,reason:'本次测试明确撤回原文处理授权'},source.revision);}

test('排队后撤权：工作线程启动前拒绝来源，零Pi调用且不自动重试',async()=>{
 const f=await fixture();try{const {book,sourceId}=await seedPublishedBook(f.repo,f.directory),job=createJob(f.repo,book);assert.equal(job.status,'queued');revoke(f.repo,sourceId);f.worker.start();const failed=await until(f.repo,job.id,'failed');assert.equal(f.pi.calls.length,0);assert.equal(failed.result,null);assert.match(String(failed.error),/授权/);await new Promise(resolve=>setTimeout(resolve,550));assert.equal(f.pi.calls.length,0);assert.equal(f.repo.read('jobs',job.id,ACTOR)?.status,'failed');}finally{await f.close();}
});
test('运行中撤权：调用真实取消接口并等待fake Pi abort，结果不入库',async()=>{
 const f=await fixture();try{const {book,sourceId}=await seedPublishedBook(f.repo,f.directory),job=createJob(f.repo,book);f.worker.start();await until(f.repo,job.id,'running');assert.equal(f.pi.calls.length,1);assert.equal(f.pi.calls[0].boundedJob,true);revoke(f.repo,sourceId);const cancelled=await until(f.repo,job.id,'cancelled');const end=Date.now()+3000;while(!f.pi.aborts.includes('job-'+job.id)&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(f.pi.aborts.includes('job-'+job.id));assert.equal(cancelled.result,null);assert.equal(f.repo.read('books',book.id,ACTOR)?.revision,book.revision);assert.equal(f.pi.calls.length,1);}finally{await f.close();}
});
test('已撤权或停用来源不能新建知识作业，拒绝后没有新job或Pi请求',async()=>{
 const f=await fixture();try{const {book,sourceId}=await seedPublishedBook(f.repo,f.directory);revoke(f.repo,sourceId);assert.throws(()=>createJob(f.repo,book),(e:any)=>e.code==='REVIEW_REQUIRED');assert.equal(f.repo.list('jobs',ACTOR).length,0);assert.equal(f.pi.calls.length,0);let source=f.repo.read('sources',sourceId,ACTOR)!;source=command(f.repo,'sources','authorize',{sourceId,authorized:true,reason:'重新确认测试来源许可'},source.revision);command(f.repo,'sources','toggle',{sourceId,active:false},source.revision);assert.throws(()=>createJob(f.repo,book),(e:any)=>e.code==='REVIEW_REQUIRED');assert.equal(f.repo.list('jobs',ACTOR).length,0);}finally{await f.close();}
});
test('重启遇到旧running记录标记interrupted，原快照保留且没有自动模型重试',async()=>{
 const directory=await temporary();let store=new Store(directory),repo=new V1Repository(store.databasePath);const pi=new HoldingPi();let worker:PiJobRuntime|undefined;
 try{const {book}=await seedPublishedBook(repo,directory),job=createJob(repo,book);const running=command(repo,'jobs','running',{jobId:job.id},job.revision);assert.equal(running.status,'running');repo.close();store.close();store=new Store(directory);repo=new V1Repository(store.databasePath);worker=new PiJobRuntime(repo,pi as unknown as PiService,()=>false);worker.start();const interrupted=repo.read('jobs',job.id,ACTOR)!;assert.equal(interrupted.status,'interrupted');assert.equal(interrupted.sourceSnapshot.pageTexts[0].text,book.pageTexts[0].text);assert.match(String(interrupted.error),/未自动重试/);await new Promise(resolve=>setTimeout(resolve,600));assert.equal(pi.calls.length,0);assert.equal(repo.list('jobs',ACTOR).length,1);}finally{await worker?.close();repo.close();store.close();await removeTemporary(directory);}
});
test('真实app的Pi知识查询回调只返回有效发布引用，撤权后工具读不到原文或故事',async()=>{
 const directory=await temporary();const initialize=PiService.prototype.initialize,run=PiService.prototype.run;let initializationCalls=0,modelCalls=0;let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 // Exercise the real callback wiring and SDK tool definition, without credential loading or model execution.
 PiService.prototype.initialize=async function(){initializationCalls++;};PiService.prototype.run=async function(){modelCalls++;throw new Error('本测试禁止模型调用');};
 try{runtime=await createApp({dataDir:directory,webDir:join(directory,'absent')});const {book,sourceId}=await seedPublishedBook(runtime.v1!,directory);const payload={bookId:book.id,title:'有出处的专项故事',page:1,version:book.version,topic:'知识',duration:3,level:'入门',summary:'隔离测试解读草稿',quote:book.pageTexts[0].text,sections:['原文与解读分开。'],connections:[],quiz:{question:'这段文字来自哪里？',choices:['原件第1页','无出处'],answer:0,explanation:'回到原文定位。'}};const story=command(runtime.v1!,'stories','create',payload);command(runtime.v1!,'stories','review',{storyId:story.id,confirmed:true,evidence:'本测试人工回查版本与原文引用'},story.revision);command(runtime.v1!,'stories','create',{...payload,title:'未复核草稿不得进入知识工具'});const tool=(runtime.pi as any).businessTools().find((t:any)=>t.name==='jarvis_knowledge');assert.ok(tool);const read=async()=>JSON.parse((await tool.execute('isolated-tool-call',{limit:50},new AbortController().signal)).content[0].text);const before=await read();assert.equal(before.total,2);assert.ok(before.records.some((r:any)=>r.id===book.id));assert.ok(before.records.some((r:any)=>r.id===story.id));assert.ok(!before.records.some((r:any)=>r.title==='未复核草稿不得进入知识工具'));revoke(runtime.v1!,sourceId);const after=await read();assert.equal(after.total,0);assert.deepEqual(after.records,[]);assert.equal(initializationCalls,1);assert.equal(modelCalls,0);}finally{await runtime?.app.close();PiService.prototype.initialize=initialize;PiService.prototype.run=run;await removeTemporary(directory);}
});
