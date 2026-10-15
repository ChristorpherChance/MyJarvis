import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';
import {V1Repository} from '../src/v1/repository.js';
import {captureHandlers} from '../src/v1/capture-domains.js';
import type {Domain} from '../src/v1/types.js';
import {Store} from '../src/store.js';

test('merged inbox provenance survives routing followed by experience merge',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'jarvis-material-capture-'));
  const store=new Store(directory),repository=new V1Repository(store.databasePath);
  try {
    const call=(domain:Domain,name:string,payload:Record<string,any>,id?:string)=>repository.execute(captureHandlers.find(h=>h.domain===domain)!,name,{commandId:randomUUID(),expectedVersion:id?repository.read(domain,id,'server-admin')!.revision:0,scope:'private',payload},'server-admin',()=>undefined).data;
    const capture=(url:string)=>call('inbox','capture',{sourceUrl:url,kind:'idea',terminalId:'隔离出处链',origin:'manual'});
    const a=capture('https://example.test/a'),b=capture('https://example.test/b');
    call('inbox','merge',{sourceId:b.id,targetId:a.id,reason:'保留两处相关来源'},b.id);
    const routed=call('inbox','route',{inboxId:a.id,target:'experience'},a.id),experience=repository.read('experiences',routed.target.id,'server-admin')!;
    const base=call('experiences','capture',{title:'整理后的经验',content:'隔离验证正文',kind:'experience',source:'人工整理'});
    call('experiences','merge',{experienceId:experience.id,baseId:base.id,reason:'保留收件出处链'},experience.id);
    const merged=repository.read('experiences',base.id,'server-admin')!;
    assert.equal(merged.mergedSources[0].sourceUrl,'https://example.test/a');
    assert.equal(merged.mergedSources[0].inboxOrigins[0].sourceUrl,'https://example.test/b');
    assert.equal(merged.mergedSources[0].inboxOrigins[0].id,b.id);
  }finally{repository.close();store.close();const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-material-capture-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

test('real HTTP link and attachment capture preserve originals across merge and routing',{timeout:60000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'jarvis-material-capture-'));let calls=0;
  const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{},run:async()=>{calls++;throw Error('No model in material capture verification');}} as unknown as PiService;
  const runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'no-web')});
  try {
    await runtime.app.listen({host:'127.0.0.1',port:0});const address=runtime.app.server.address();assert.ok(address&&typeof address!=='string');
    const base=`http://127.0.0.1:${address.port}`;let cookie='';
    const request=async(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>{
      const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'})},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
      const result={status:response.status,body:await response.json() as any,headers:response.headers};return result;
    };
    const setup=await request('/api/auth/setup',{password:randomUUID()+'-isolated'});assert.equal(setup.status,200);cookie=setup.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    const command=(domain:string,name:string,payload:unknown,expectedVersion=0,scope='private',commandId=randomUUID())=>request(`/api/v1/${domain}/commands/${name}`,{commandId,expectedVersion,scope,payload});
    const upload=async(filename:string,content:string,scope='private')=>{const id=randomUUID(),bytes=Buffer.from(content);assert.equal((await request('/api/v1/inbox-materials/uploads',{id,filename,mime:'text/plain',size:bytes.length,scope})).status,200);const saved=await request(`/api/v1/inbox-materials/uploads/${id}/file`,bytes,'PUT');assert.equal(saved.status,200);return saved.body.data;};
    const capture=(extra:Record<string,unknown>,scope='private',id=randomUUID())=>command('inbox','capture',{kind:'idea',terminalId:'隔离材料验收',origin:'manual',...extra},0,scope,id);
    const alpha=await upload('灵感甲.txt','可检索原件：星际花园🎵');const beta=await upload('灵感乙.txt','另一份原件：雨水花园');
    const first=await capture({attachmentIds:[alpha.id]});assert.equal(first.status,200,JSON.stringify(first.body));const a=first.body.data;
    assert.equal(a.rawText,'');assert.equal(a.title,'灵感甲.txt');assert.equal(a.materialText,'可检索原件：星际花园🎵');assert.equal(a.materialTextTruncated,false);assert.equal(a.attachments[0].sha256,alpha.sha256);assert.equal(a.duplicateOf,null);
    const different=await capture({attachmentIds:[beta.id]});assert.equal(different.status,200);assert.equal(different.body.data.duplicateOf,null);
    const sameBytes=await upload('不同文件名.txt','可检索原件：星际花园🎵');const duplicate=await capture({attachmentIds:[sameBytes.id]});assert.equal(duplicate.status,200);assert.equal(duplicate.body.data.duplicateOf,a.id);
    const empty=await capture({});assert.equal(empty.status,400);assert.equal((await capture({rawText:'',sourceUrl:'javascript:alert(1)'})).status,400);assert.equal((await capture({sourceUrl:'https://person:credential@example.test/a'})).status,400);
    assert.equal((await capture({attachmentIds:[alpha.id]},'family')).status,403);assert.equal((await capture({attachmentIds:[randomUUID()]})).status,404);assert.equal((await capture({attachmentIds:[alpha.id,alpha.id]})).status,400);
    assert.equal((await capture({attachments:[{id:alpha.id,extractedText:'伪造正文'}]})).status,400);assert.equal((await capture({materialText:'伪造原件正文'})).status,400);
    const waitingId=randomUUID();assert.equal((await request('/api/v1/inbox-materials/uploads',{id:waitingId,filename:'未完成.txt',mime:'text/plain',size:1,scope:'private'})).status,200);assert.equal((await capture({attachmentIds:[waitingId]})).status,422);
    const fixed=randomUUID(),url='http://127.0.0.1:1/only-a-saved-link?source=synthetic';const linked=await capture({sourceUrl:url},'private',fixed);assert.equal(linked.status,200);assert.equal(linked.body.data.rawText,'');assert.equal(linked.body.data.sourceUrl,url);assert.deepEqual((await capture({sourceUrl:url},'private',fixed)).body,linked.body);assert.equal((await capture({sourceUrl:url+'/changed'},'private',fixed)).status,409);
    const noMemory=await command('inbox','route',{inboxId:a.id,target:'memory'},a.revision);assert.equal(noMemory.status,422);
    const merged=await command('inbox','merge',{sourceId:different.body.data.id,targetId:a.id,reason:'合并两个已保存的来源'},different.body.data.revision);assert.equal(merged.status,200);
    const current=(await request('/api/v1/inbox/'+a.id)).body.data;assert.equal(current.origins[0].attachments[0].sha256,beta.sha256);assert.equal(current.origins[0].materialText,beta.extractedText);
    const routed=await command('inbox','route',{inboxId:a.id,target:'research'},current.revision);assert.equal(routed.status,200,JSON.stringify(routed.body));
    const research=(await request('/api/v1/research/'+routed.body.data.target.id)).body.data;assert.equal(research.sourceInboxId,a.id);assert.equal(research.attachments[0].id,alpha.id);assert.equal(research.materialText,alpha.extractedText);assert.equal(research.inboxOrigins[0].attachments[0].id,beta.id);assert.match(research.raw,/原件：灵感甲.txt/);assert.match(research.raw,/尚未整理为正文/);assert.notEqual(research.raw,alpha.extractedText);
    const urlRoute=await command('inbox','route',{inboxId:linked.body.data.id,target:'material'},linked.body.data.revision);assert.equal(urlRoute.status,200);const material=(await request('/api/v1/knowledge/books/'+urlRoute.body.data.target.id)).body.data;assert.equal(material.sourceUrl,url);assert.equal(material.status,'pending');assert.equal(material.metadata.reviewed,false);
    const note='  核对后的文字原话\n保留  ';const textual=await capture({rawText:note,attachmentIds:[alpha.id]});assert.equal(textual.status,200);assert.equal(textual.body.data.rawText,note);const experienceRoute=await command('inbox','route',{inboxId:textual.body.data.id,target:'experience'},textual.body.data.revision);assert.equal(experienceRoute.status,200);
    const experience=(await request('/api/v1/experiences/'+experienceRoute.body.data.target.id)).body.data;assert.equal(experience.content,note);assert.equal(experience.attachments[0].id,alpha.id);assert.equal(experience.verified,false);
    const archived=await command('experiences','archive',{experienceId:experience.id,reason:'隔离验收移除私人内容'},experience.revision);assert.equal(archived.status,200);assert.equal(archived.body.data.materialText,'');assert.deepEqual(archived.body.data.attachments,[]);
    assert.equal(calls,0);
  } finally {await runtime.app.close();const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-material-capture-'));await rm(absolute,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
