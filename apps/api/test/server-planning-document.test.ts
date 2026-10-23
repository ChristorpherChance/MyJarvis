import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,symlink,link,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Store} from '../src/store.js';
import {IdentityRuntime} from '../src/runtime/identity.js';
import {RuntimeAccessError,type RuntimePrincipal} from '../src/runtime/identity.js';
import {registerServerPlanningRoutes} from '../src/runtime/server-planning-routes.js';

const projectRoot=resolve(import.meta.dirname,'../../..');
const route='/api/runtime/server-planning/document';
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'server-planning-'));await mkdir(join(root,'docs'),{recursive:true});await mkdir(join(root,'apps/api/resources/server-planning'),{recursive:true});
 await copyFile(join(projectRoot,'docs/服务器扩容与AI节点规划.html'),join(root,'docs/服务器扩容与AI节点规划.html'));
 await copyFile(join(projectRoot,'docs/服务器扩容与AI节点规划.md'),join(root,'docs/服务器扩容与AI节点规划.md'));
 await copyFile(join(projectRoot,'docs/AI配置只读差异预览.md'),join(root,'docs/AI配置只读差异预览.md'));
 await copyFile(join(projectRoot,'apps/api/resources/server-planning/registration-public.json'),join(root,'apps/api/resources/server-planning/registration-public.json'));
 let current=true;const identity={principal(req:any){if(req.headers.authorization==='member')return {administrator:false,profileId:'son'};if(req.headers.authorization==='admin')return {administrator:true,profileId:'me',actorId:'admin',authorizationHash:'admin'};throw new RuntimeAccessError('LOGIN_REQUIRED','请登录',401);},isPrincipalCurrent(_p:RuntimePrincipal){return current;},revoke(){current=false;}};
 const app=Fastify({logger:false});registerServerPlanningRoutes(app,identity as unknown as IdentityRuntime,root);await app.ready();return {app,root,identity};
}
const admin={authorization:'admin'};
test('fixed server-planning route serves HTML and only enumerated resources to an administrator',async()=>{
 const f=await fixture();try{
  const main=await f.app.inject({url:route,headers:admin});assert.equal(main.statusCode,200,main.body);assert.match(main.headers['content-security-policy'] as string,/script-src 'none'/);assert.match(main.headers['cache-control'] as string,/no-store/);assert.match(main.body,/resource=source/);assert.match(main.body,/resource=registration/);assert.match(main.body,/resource=preview-guide/);assert.doesNotMatch(main.body,/<script\b/i);assert.doesNotMatch(main.body,/<button\b/i);assert.doesNotMatch(main.body,/href="%E6%9C%8D%E5%8A%A1%E5%99%A8/);
  const source=await f.app.inject({url:route+'?resource=source',headers:admin});assert.equal(source.statusCode,200);assert.equal(source.body,await readFile(join(f.root,'docs/服务器扩容与AI节点规划.md'),'utf8'));
  for(const resource of ['registration','preview-guide'])assert.equal((await f.app.inject({url:route+'?resource='+resource,headers:admin})).statusCode,200);
  for(const url of [route+'?resource=../../etc/passwd',route+'?resource=source&resource=registration',route+'?x=1'])assert.equal((await f.app.inject({url,headers:admin})).statusCode,400,url);
 }finally{await f.app.close();await rm(f.root,{recursive:true,force:true});}
});
test('anonymous and member requests receive safe HTML without document text',async()=>{
 const f=await fixture();try{
  const anon=await f.app.inject({url:route});assert.equal(anon.statusCode,401);assert.match(anon.body,/前往平台登录/);assert.doesNotMatch(anon.body,/服务器扩容与AI节点规划|RTX2060/);
  const member=await f.app.inject({url:route,headers:{authorization:'member'}});assert.equal(member.statusCode,403);assert.doesNotMatch(member.body,/RTX2060/);
 }finally{await f.app.close();await rm(f.root,{recursive:true,force:true});}
});
test('fixed resources reject symlinks, hardlinks, missing files, and revoked administrator after read',async()=>{
 const f=await fixture();try{
  const path=join(f.root,'docs/AI配置只读差异预览.md'),backup=path+'.backup';await rm(path);await symlink('/etc/passwd',path);let r=await f.app.inject({url:route+'?resource=preview-guide',headers:admin});assert.notEqual(r.statusCode,200);assert.doesNotMatch(r.body,/root:/);await rm(path);
  await copyFile(join(projectRoot,'docs/AI配置只读差异预览.md'),path);await link(path,backup);r=await f.app.inject({url:route+'?resource=preview-guide',headers:admin});assert.notEqual(r.statusCode,200);await rm(backup);await rm(path);
  r=await f.app.inject({url:route+'?resource=preview-guide',headers:admin});assert.equal(r.statusCode,404);
  const revoke=f.identity as any;revoke.revoke();r=await f.app.inject({url:route,headers:admin});assert.equal(r.statusCode,401);
 }finally{await f.app.close();await rm(f.root,{recursive:true,force:true});}
});


test('real administrator/member cookies, mixed identity and logout protect document without business writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'planning-auth-')),store=new Store(dir);store.setPassword('isolated-document-auth-password');
 const token=store.createLogin(),identity=new IdentityRuntime(store,{memberExists:id=>id==='me'||id==='child',memberProfile:id=>({id,name:id})});
 identity.setCredential('child','123456','pin');const member=identity.login('child','123456','fixture').token;
 const app=Fastify({logger:false});await app.register(cookie);registerServerPlanningRoutes(app,identity,projectRoot);await app.ready();
 try{
  const headers={cookie:'jarvis_session='+token};
  assert.equal((await app.inject({url:route,headers})).statusCode,200);
  for(const value of ['jarvis_member_session='+member,headers.cookie+'; jarvis_member_session='+member])assert.equal((await app.inject({url:route,headers:{cookie:value}})).statusCode,403);
  const audit=store.db.prepare('SELECT * FROM audit').all();await app.inject({url:route,headers});assert.deepEqual(store.db.prepare('SELECT * FROM audit').all(),audit);
  store.deleteLogin(token);assert.equal((await app.inject({url:route,headers})).statusCode,401);
 }finally{await app.close();identity.close();store.close();await rm(dir,{recursive:true,force:true});}
});
