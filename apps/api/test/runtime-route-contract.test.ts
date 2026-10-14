import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/app.js';
import {plannedContract} from '../src/v1/contract.js';
import type {PiService} from '../src/pi.js';

test('every implemented OpenAPI operation has a concrete runtime route and declared authentication',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-contract-routes-'));
 const web=join(directory,'web');await mkdir(web);await writeFile(join(web,'index.html'),'<html>isolated fixture</html>');
 const pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})} as unknown as PiService;
 const runtime=await createApp({dataDir:directory,pi,webDir:web});
 try{
  await runtime.app.ready();let count=0;
  for(const [path,item]of Object.entries(plannedContract.paths) as [string,Record<string,any>][]){
   for(const method of ['get','post','put','patch','delete','head','options']){
    const operation=item[method];if(!operation)continue;
    assert.equal(operation['x-implementation-status'],'implemented',path);
    for(const auth of operation.security??plannedContract.security??[])for(const name of Object.keys(auth))assert.ok(plannedContract.components.securitySchemes[name],`Missing authentication scheme: ${name}`);
    const url=path.replace(/\{[^}]+\}/g,'contract-route-fixture');
    const route=runtime.app.findRoute({method:method.toUpperCase() as 'GET',url});
    assert.ok(route?.handler,`${method} ${path} missing actual handler`);
    assert.ok(!Object.hasOwn(route.params,'*'),`${method} ${path} only resolves to static frontend fallback`);
    count++;
   }
  }
  assert.ok(count>=270);console.log(`Validated ${count} concrete backend operations; no static fallback accepted`);
 }finally{await runtime.app.close();await rm(directory,{recursive:true,force:true})}
});
