import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

test('theme assets cannot consume the API rate allowance and API requests still stop at its boundary',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'jarvis-static-limits-')),web=join(directory,'web');
 await mkdir(join(web,'assets'),{recursive:true});await writeFile(join(web,'assets','theme.css'),'body{color:#abc}');await writeFile(join(web,'index.html'),'<div id="root"></div>');
 const pi={initialize:async()=>{},dispose:async()=>{},health:()=>({configured:false})}as unknown as PiService;
 const runtime=await createApp({dataDir:directory,webDir:web,pi});
 try{
  for(let i=0;i<350;i++){
   const resource=await runtime.app.inject({url:'/assets/theme.css',headers:{host:'localhost'}});
   assert.equal(resource.statusCode,200);assert.match(resource.body,/#abc/);assert.equal(resource.headers['x-ratelimit-remaining'],undefined);
  }
  for(let i=0;i<300;i++)assert.equal((await runtime.app.inject({url:'/api/health',headers:{host:'localhost'}})).statusCode,200);
  const limited=await runtime.app.inject({url:'/api/health',headers:{host:'localhost'}});assert.equal(limited.statusCode,429);assert.ok(limited.headers['retry-after']);
  assert.equal((await runtime.app.inject({url:'/assets/theme.css',headers:{host:'localhost'}})).statusCode,200);
 }finally{await runtime.app.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
