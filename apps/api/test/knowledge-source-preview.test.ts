import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {V1Repository} from '../src/v1/repository.ts';
import {knowledgeHandlers} from '../src/v1/knowledge-domains.ts';
import {KnowledgeRuntime} from '../src/runtime/knowledge-runtime.ts';
import {readKnowledgeDirectoryPreview} from '../src/runtime/knowledge-connectors.ts';
import {registerKnowledgeSourcePreviewRoutes} from '../src/runtime/knowledge-source-preview.ts';
import {RuntimeAccessError} from '../src/runtime/identity.ts';

const actor='server-admin';
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'jarvis-knowledge-preview-')),dbPath=join(root,'records.sqlite'),directory=join(root,'authorized');
 const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE audit(id INTEGER PRIMARY KEY,action TEXT,subjectId TEXT,details TEXT,createdAt TEXT)');db.close();await mkdir(directory);
 const repository=new V1Repository(dbPath),runtime=new KnowledgeRuntime(repository,{health:()=>({configured:false}),run:async()=>{throw Error('model not expected');},abort:async()=>{}} as any,{uploadsDirectory:join(root,'uploads'),workDirectory:join(root,'work'),pythonExecutable:'python',allowedDirectoryRoots:[directory],tickMs:10});runtime.start();
 const envelope=(payload:any,expectedVersion=0,scope:any='personal',commandId=randomUUID())=>({commandId,expectedVersion,scope,payload});
 const source=(scope='personal')=>repository.execute(knowledgeHandlers.find(h=>h.domain==='sources')!,'save',envelope({name:'临时目录来源',type:'文件夹',mode:'local',endpoint:directory,topics:'测试',rights:'仅测试目录',authorized:true},0,scope),actor,()=>undefined).data;
 let login='valid-admin',administrator=true;const identity:any={principal:()=>({actorId:actor,profileId:administrator?'me':'member-1',administrator,authorizationHash:'auth'}),isPrincipalCurrent:()=>login==='valid-admin',requireAdmin:()=>{if(login!=='valid-admin')throw new RuntimeAccessError('FORBIDDEN','not logged in',401);return{};}};
 const app=Fastify();app.addHook('preHandler',async(req:any)=>{req.cookies={jarvis_session:'valid-admin'};});registerKnowledgeSourcePreviewRoutes(app,repository,identity,runtime);
 return {root,directory,repository,runtime,identity,app,source,envelope,setLogin:(v:string)=>login=v,setAdmin:(v:boolean)=>administrator=v,async close(){await app.close();await runtime.close();repository.close();const path=resolve(root);assert(path.startsWith(resolve(tmpdir())+sep)&&path.includes('jarvis-knowledge-preview-'));await rm(path,{recursive:true,force:true});}};
}

test('directory preview reports stable relative-path delta, unsupported media without reading, and no symlink traversal',async()=>{
 const f=await fixture();try{
  await mkdir(join(f.directory,'sub'));await writeFile(join(f.directory,'one.md'),'原文一');await writeFile(join(f.directory,'sub','two.txt'),'原文二');await writeFile(join(f.directory,'scan.pdf'),Buffer.from('%PDF-secret'));await writeFile(join(f.directory,'photo.png'),Buffer.from([0,255,1]));await writeFile(join(f.directory,'mystery.bin'),Buffer.from([0,255,1]));
  await symlink(join(f.root,'outside'),join(f.directory,'escape.md'));
  const outside=join(f.root,'outside');await writeFile(outside,'不要读取');
  const policy={allowedHttpOrigins:[],allowedDirectoryRoots:[f.directory],timeoutMs:1000,maxBytes:1000,maxDocuments:10};
  const first=await readKnowledgeDirectoryPreview(f.directory,policy,new AbortController().signal);assert.deepEqual(first.documents.map(d=>d.location),['one.md#1','sub/two.txt#1']);assert.deepEqual(first.changes.added.map(d=>d.path),['one.md','sub/two.txt']);assert.deepEqual(first.unsupported,['photo.png','scan.pdf']);assert.deepEqual(first.skipped,['escape.md','mystery.bin']);
  const second=await readKnowledgeDirectoryPreview(f.directory,policy,new AbortController().signal,first.documents);assert.equal(second.snapshotFingerprint,first.snapshotFingerprint);assert.equal(second.changes.unchanged.length,2);assert.equal(second.changes.added.length,0);
  await writeFile(join(f.directory,'one.md'),'更新后的原文');await rm(join(f.directory,'sub','two.txt'));await writeFile(join(f.directory,'new.html'),'<p>新增</p>');const third=await readKnowledgeDirectoryPreview(f.directory,policy,new AbortController().signal,first.documents);assert.deepEqual(third.changes.changed.map(d=>d.path),['one.md']);assert.deepEqual(third.changes.deleted.map(d=>d.path),['sub/two.txt']);assert.deepEqual(third.changes.added.map(d=>d.path),['new.html']);assert.notEqual(third.snapshotFingerprint,first.snapshotFingerprint);
  await assert.rejects(()=>readKnowledgeDirectoryPreview(f.directory,{...policy,maxBytes:2},new AbortController().signal));
 }finally{await f.close();}
});

test('source preview and confirmed sync require current admin, exact source revision, configuration and fingerprint; queue is idempotent',async()=>{
 const f=await fixture();try{
  await writeFile(join(f.directory,'source.txt'),'首次文字');const source=f.source();
  const url=`/api/v1/knowledge/sources/${source.id}/preview`,headers={cookie:'jarvis_session=valid-admin'};
  const preview=await f.app.inject({method:'GET',url,headers});assert.equal(preview.statusCode,200,preview.body);f.setAdmin(false);const memberDenied=await f.app.inject({method:'GET',url,headers});assert.equal(memberDenied.statusCode,403,memberDenied.body);f.setAdmin(true);const value=preview.json().data;assert.equal(value.documents[0].location,'source.txt#1');assert.equal(value.sourceRevision,source.revision);assert.match(value.expectedSnapshotFingerprint,/^[a-f0-9]{64}$/);
  const body={commandId:randomUUID(),expectedVersion:source.revision,expectedSnapshotFingerprint:value.expectedSnapshotFingerprint,expectedConfigurationRevision:value.configurationRevision};const confirmUrl=`/api/v1/knowledge/sources/${source.id}/confirm-sync`;
  const accepted=await f.app.inject({method:'POST',url:confirmUrl,headers,payload:body});assert.equal(accepted.statusCode,200,accepted.body);assert.equal(accepted.json().data.id,source.id);assert.equal(f.runtime.list().filter(x=>x.sourceId===source.id).length,1);
  const repeated=await f.app.inject({method:'POST',url:confirmUrl,headers,payload:body});assert.equal(repeated.statusCode,200,repeated.body);assert.equal(f.runtime.list().filter(x=>x.sourceId===source.id).length,1);
  const conflict=await f.app.inject({method:'POST',url:confirmUrl,headers,payload:{...body,commandId:randomUUID(),expectedSnapshotFingerprint:'0'.repeat(64)}});assert.equal(conflict.statusCode,409,conflict.body);
  await f.runtime.close();
 }finally{await f.close();}
});

test('source-derived private scope preview works, stale configuration is refused, and queued confirmation rescans',async()=>{
 const f=await fixture();try{
  await writeFile(join(f.directory,'source.txt'),'预览文字');const source=f.source('private');const headers={cookie:'jarvis_session=valid-admin'},routePreview=await f.app.inject({method:'GET',url:`/api/v1/knowledge/sources/${source.id}/preview`,headers});assert.equal(routePreview.statusCode,200,routePreview.body);const preview=routePreview.json().data;
  await assert.rejects(()=>f.runtime.confirmDirectorySourceSync(f.envelope({sourceId:source.id,expectedSnapshotFingerprint:preview.expectedSnapshotFingerprint,expectedConfigurationRevision:preview.configurationRevision+1},source.revision,'private'),actor),(error:any)=>error.status===409);
  const staleConfig=await f.runtime.configurationState(actor);await f.runtime.configure(f.envelope({configuration:{...staleConfig.configuration,maxBytes:staleConfig.configuration.maxBytes-1}},staleConfig.configurationRevision,'personal'));await assert.rejects(()=>f.runtime.confirmDirectorySourceSync(f.envelope({sourceId:source.id,expectedSnapshotFingerprint:preview.expectedSnapshotFingerprint,expectedConfigurationRevision:preview.configurationRevision},source.revision,'private'),actor),(error:any)=>error.status===409);
  const refreshed=await f.runtime.previewDirectorySource(source.id,actor,'private');const envelope=f.envelope({sourceId:source.id,expectedSnapshotFingerprint:refreshed.expectedSnapshotFingerprint,expectedConfigurationRevision:refreshed.configurationRevision},source.revision,'private');const accepted=await f.runtime.confirmDirectorySourceSync(envelope,actor);
  await writeFile(join(f.directory,'source.txt'),'确认后被替换');const executionId=String(f.runtime.list().find(row=>row.sourceId===source.id)!.id);for(let i=0;i<100;i++){const result=f.repository.read('operations',executionId,actor);if(result&&!['queued','running'].includes(result.status)){assert.equal(result.status,'failed');assert.match(result.error,/内容或安全策略/);break;}await new Promise(r=>setTimeout(r,20));if(i===99)assert.fail('execution did not settle');}
  assert.equal(f.repository.read('sources',source.id,actor)!.count,0);assert.notEqual(accepted.data.syncFingerprint,refreshed.snapshotFingerprint);
 }finally{await f.close();}
});
