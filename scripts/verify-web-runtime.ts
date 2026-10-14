// Safe zero-fee smoke: fixed public queries, isolated SQLite, no model/provider keys or real user history.
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Store} from '../apps/api/src/store.js';
import {IdentityRuntime} from '../apps/api/src/runtime/identity.js';
import {WebRuntime} from '../apps/api/src/runtime/web-runtime.js';

const directory=await mkdtemp(join(tmpdir(),'jarvis-web-live-smoke-')),store=new Store(directory),identity=new IdentityRuntime(store,{memberExists:id=>id==='me',memberProfile:id=>id==='me'?{id,name:'isolated smoke',preferences:{cloudPrivacy:'allowed'}}:undefined}),runtime=new WebRuntime(store,{identity});
store.setPassword('isolated-web-smoke-only-password');const p=identity.requireAdmin({cookies:{jarvis_session:store.createLogin()}}as any),report:{startedAt:string;completedAt?:string;paidModelCalls:0;productionDataTouched:false;results:unknown[]}={startedAt:new Date().toISOString(),paidModelCalls:0,productionDataTouched:false,results:[]};
try{
 for(const [name,operation]of [
  ['search',()=>runtime.search(p,{query:'TypeScript 官方文档',count:3})],
  ['read',()=>runtime.read(p,{url:'https://www.typescriptlang.org/docs/',maxChars:500})],
  ['news',()=>runtime.news(p,{count:6,withinHours:168})]
 ]as const){const started=Date.now();try{const result=await operation();report.results.push({name,status:'ok',elapsedMs:Date.now()-started,result});}catch(error){report.results.push({name,status:'failed',elapsedMs:Date.now()-started,code:(error as any).code??'unexpected',message:error instanceof Error?error.message:String(error)});}}
 report.completedAt=new Date().toISOString();const target=fileURLToPath(new URL('../artifacts/web-runtime/',import.meta.url));await mkdir(target,{recursive:true});await writeFile(join(target,'live-source-smoke.json'),JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify({report:join(target,'live-source-smoke.json'),results:report.results.map((r:any)=>({name:r.name,status:r.status,code:r.code,fetchedAt:r.result?.fetchedAt,resultCount:r.result?.resultCount??r.result?.items?.length,sourceStatus:r.result?.sourceStatus}))},null,2));
 assert(report.results.every((r:any)=>r.status==='ok'),'One or more actual public sources unavailable; report preserves failure rather than fabricating results');
}finally{runtime.close();identity.close();store.close();const path=resolve(directory);assert(path.startsWith(resolve(tmpdir())+sep)&&path.includes('jarvis-web-live-smoke-'));await rm(path,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
