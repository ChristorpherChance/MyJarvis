import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {validateDto} from '../src/v1/contract.js';
import type {PiService} from '../src/pi.js';

test('HTTP inbox classification preserves immutable originals, clears obsolete duplicate references and rejects processed or forged changes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-classification-')),pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}}as unknown as PiService,runtime=await createApp({dataDir:directory,pi,webDir:join(directory,'absent')});
 try{
  const setup=await runtime.app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'Isolated-inbox-classification-password'}});assert.equal(setup.statusCode,200,setup.body);const headers={cookie:String(setup.headers['set-cookie']).split(';')[0]};
  const command=(name:string,payload:any,version=0,id=randomUUID())=>runtime.app.inject({method:'POST',url:'/api/v1/inbox/commands/'+name,headers,payload:{commandId:id,expectedVersion:version,scope:'private',payload}});
  const good=(response:any)=>{assert.equal(response.statusCode,200,response.body);const record=response.json().data,validated=validateDto('InboxItem',record);assert.equal(validated.valid,true,JSON.stringify(validated.errors));return record};
  const rawText='  原始案例：先记录证据。\n保留原话与空白  ',capture=async(kind:string,title:string)=>good(await command('capture',{rawText,kind,title,terminalId:'isolated-test',origin:'manual'}));
  const source=await capture('idea','原始灵感'),oldDuplicate=await capture('idea','旧分类重复候选'),newBase=await capture('skill','技能主候选');assert.equal(oldDuplicate.duplicateOf,source.id);
  const id=randomUUID(),payload={inboxId:source.id,note:'依据实际内容修改分类',kind:'skill',title:'整理后的标题'},response=await command('annotate',payload,source.revision,id),changed=good(response);assert.equal(changed.rawText,rawText);assert.equal(changed.kind,'skill');assert.equal(changed.duplicateOf,newBase.id);assert.equal(changed.origin,'manual');assert.equal(changed.terminalId,'isolated-test');assert.deepEqual((await command('annotate',payload,source.revision,id)).json(),response.json());
  const child=good(await runtime.app.inject({url:'/api/v1/inbox/'+oldDuplicate.id,headers}));assert.equal(child.duplicateOf,null);assert.equal(child.kind,'idea');assert.equal(child.status,'pending');assert.equal(child.rawText,rawText);
  assert.equal((await command('annotate',{...payload,kind:'health'},changed.revision)).statusCode,400);assert.equal((await command('annotate',{...payload,rawText:'forged replacement'},changed.revision)).statusCode,400);assert.equal((await command('annotate',{...payload,kind:'book'},source.revision)).statusCode,409);
  assert.equal((await runtime.app.inject({method:'POST',url:'/api/v1/inbox/commands/annotate',headers,payload:{commandId:randomUUID(),expectedVersion:changed.revision,scope:'family',payload:{...payload,kind:'lesson'}}})).statusCode,403);
  const ignored=good(await command('ignore',{inboxId:child.id,reason:'本人明确忽略'},child.revision));assert.equal((await command('annotate',{inboxId:child.id,note:'已经处理不得分类修改',kind:'lesson'},ignored.revision)).statusCode,422);assert.equal(good(await runtime.app.inject({url:'/api/v1/inbox/'+source.id,headers})).rawText,rawText);
 }finally{await runtime.app.close();const absolute=resolve(directory);assert.ok(absolute.startsWith(resolve(tmpdir())+sep)&&absolute.includes('jarvis-inbox-classification-'));await rm(absolute,{recursive:true,force:true});}
});
