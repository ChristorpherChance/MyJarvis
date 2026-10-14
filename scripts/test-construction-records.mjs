import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {appendConstructionRecords,readConstructionRecords,renderConstructionRecords} from './construction-records.mjs';

async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'jarvis-construction-'));try{await mkdir(join(root,'artifacts'));await writeFile(join(root,'artifacts','proof.json'),'{"passed":true}\n');await fn(root);}finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});}}
const record={id:'JARVIS-TEST-20261010-01',kind:'validation',project:'jarvis',occurredAt:'2026-10-10',title:'Actual evidence',objective:'Preserve a real result',verification:['One bounded verification passed'],evidence:['artifacts/proof.json']};

test('dry run has no ledger; append and identical retry preserve one immutable record',()=>fixture(async root=>{
 const plan=await appendConstructionRecords(record,{root});assert.equal(plan.executed,false);assert.deepEqual(await readConstructionRecords(root),[]);
 const first=await appendConstructionRecords(record,{root,execute:true,now:'2026-10-10T12:00:00.000Z'});const retry=await appendConstructionRecords(record,{root,execute:true,now:'2026-10-10T12:01:00.000Z'});assert.equal(first.headHash,retry.headHash);assert.equal(retry.added.length,0);assert.equal(retry.reused.length,1);assert.equal((await readConstructionRecords(root)).length,1);
 await assert.rejects(appendConstructionRecords({...record,title:'Rewritten history'},{root,execute:true}),/EXISTING_RECORD_CANNOT_BE_REWRITTEN/);
}));
test('damaged and truncated history is rejected instead of silently discarded',()=>fixture(async root=>{
 await appendConstructionRecords(record,{root,execute:true});const file=join(root,'docs','建设记录','events.jsonl'),old=await readFile(file,'utf8');await writeFile(file,old.replace('Actual evidence','Changed evidence'));await assert.rejects(readConstructionRecords(root),/INTEGRITY/);await writeFile(file,old.trimEnd());await assert.rejects(readConstructionRecords(root),/INCOMPLETE/);
}));
test('private values and private or escaping evidence paths never enter the ledger',()=>fixture(async root=>{
 await assert.rejects(appendConstructionRecords({...record,facts:['Bearer '+ 'a'.repeat(30)]},{root,execute:true}),/PRIVATE_VALUE/);
 for(const path of ['../outside.json','.secrets/key.txt','artifacts/server-access/ssh-config','artifacts/private-key.pem','D:/private.json'])await assert.rejects(appendConstructionRecords({...record,evidence:[path]},{root,execute:true}),/EVIDENCE_PATH/);
 assert.deepEqual(await readConstructionRecords(root),[]);
}));
test('quoted JSON, quoted assignments, prefixed environment keys and ordinary passwords are rejected',()=>fixture(async root=>{
 const longValue='test'+ 'A'.repeat(24),key=['api','Key'].join(''),envKey=['JARVIS','API','KEY'].join('_'),passwordKey=['pass','word'].join('');
 const samples=[JSON.stringify({[key]:longValue}),key+'="'+longValue+'"',envKey+'='+longValue,passwordKey+'='+['Test','Pass','123'].join('')];
 for(const sample of samples){
  await assert.rejects(appendConstructionRecords({...record,facts:[sample]},{root,execute:true}),/PRIVATE_VALUE/);
  await writeFile(join(root,'artifacts','proof.json'),sample+'\n');await assert.rejects(appendConstructionRecords(record,{root,execute:true}),/PRIVATE_VALUE/);
 }
 assert.deepEqual(await readConstructionRecords(root),[]);
}));
test('free text cannot create executable Markdown links while generated evidence links remain valid',()=>fixture(async root=>{
 await appendConstructionRecords({...record,facts:['[来源](javascript:alert(1))','![image](https://example.invalid/image)','\n# injected title\n* injected list']},{root,execute:true});
 const rendered=await renderConstructionRecords(root),md=await readFile(join(root,rendered.markdown),'utf8');
 assert(md.includes('\\[来源\\]\\(javascript:alert\\(1\\)\\)'));assert(!md.includes('[来源](javascript:'));assert(!md.includes('![image]('));assert(!md.includes('\n# injected'));assert(md.includes('[artifacts/proof\\.json](../artifacts/proof.json)'));
}));
test('a locked writer cannot bypass the lock or erase another writer lock',()=>fixture(async root=>{
 const folder=join(root,'docs','建设记录');await mkdir(folder,{recursive:true});const lock=join(folder,'events.jsonl.lock');await writeFile(lock,'other writer');await assert.rejects(appendConstructionRecords(record,{root,execute:true}),{code:'EEXIST'});assert.equal(await readFile(lock,'utf8'),'other writer');assert.deepEqual(await readConstructionRecords(root),[]);
}));
test('batch validation is complete before append and generated views distinguish historical uncertainty',()=>fixture(async root=>{
 await assert.rejects(appendConstructionRecords([record,{...record,id:'JARVIS-TEST-20261010-02',state:{verification:'passed'}}],{root,execute:true}),/INVALID_RECORD_STATE/);assert.deepEqual(await readConstructionRecords(root),[]);
 await appendConstructionRecords([record,{...record,id:'JARVIS-TEST-20261010-02',occurredAt:null,retrospective:true,title:'<script>untrusted</script>'}],{root,execute:true});const records=await readConstructionRecords(root);assert.equal(records[1].previousHash,records[0].hash);const rendered=await renderConstructionRecords(root);assert.equal(rendered.records,2);const md=await readFile(join(root,rendered.markdown),'utf8');assert(md.includes('历史日期未核实'));assert(md.includes('&lt;script&gt;'));assert(!md.includes('<script>untrusted'));
}));
