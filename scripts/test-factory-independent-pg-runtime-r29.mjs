import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateIndependentPGRuntimeManifest as validate,validateIndependentPGRuntimeStat as stat,inspectIndependentPGRuntime} from './factory-independent-pg-runtime-r29.mjs';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),H='a'.repeat(64);
const fresh=()=>{const entries=[{path:'node_modules',type:'directory'},{path:'node_modules/pg',type:'directory'},{path:'node_modules/pg/index.js',type:'file',bytes:5,sha256:H},{path:'package.json',type:'file',bytes:3,sha256:H}];return {schemaVersion:1,kind:'r29-independent-pg-runtime',root:'/qa-runtime',pgVersion:'8.23.0',packageJSONSHA256:H,entries,treeSHA256:sha(entries)};};
const change=fn=>{const v=fresh();fn(v);v.treeSHA256=sha(v.entries);return v;};
test('actual manifest qualification accepts finite ordered plain closure',()=>assert.equal(validate(fresh()).entries.length,4));
for(const [name,fn] of [
 ['wrong schema',v=>v.schemaVersion=2],['wrong kind',v=>v.kind='candidate-runtime'],['other root',v=>v.root='/work/source'],['other version',v=>v.pgVersion='8.13.0'],['unknown top key',v=>v.clientPath='/work/source/node_modules/pg'],['too few entries',v=>v.entries=[]],['null entry',v=>v.entries[0]=null],
 ['absolute path',v=>v.entries[2].path='/etc/passwd'],['traversal path',v=>v.entries[2].path='node_modules/../bad'],['Windows path',v=>v.entries[2].path='node_modules\\pg\\index.js'],['empty component',v=>v.entries[2].path='node_modules//pg/index.js'],['duplicate path',v=>v.entries.splice(2,0,{...v.entries[1]})],['unordered path',v=>v.entries.reverse()],['unknown type',v=>v.entries[2].type='socket'],['unknown file key',v=>v.entries[2].uid=1000],['negative bytes',v=>v.entries[2].bytes=-1],['noninteger bytes',v=>v.entries[2].bytes=1.5],['oversized file',v=>v.entries[2].bytes=104857601],['bad file hash',v=>v.entries[2].sha256='invalid'],['missing parent',v=>v.entries.splice(1,1)],['package hash mismatch',v=>v.packageJSONSHA256='b'.repeat(64)],
])test('actual manifest rejects '+name,()=>assert.throws(()=>validate(change(fn)),e=>/^QA_SQL_/.test(e.code)));
test('tree hash requires exact complete entries',()=>{const v=fresh();v.treeSHA256='b'.repeat(64);assert.throws(()=>validate(v),e=>e.code==='QA_SQL_RUNTIME_TREE_HASH_INVALID');});
function links(target){const v=fresh();v.entries.splice(2,0,{path:'node_modules/pg-link',type:'symlink',target});v.entries.sort((a,b)=>a.path<b.path?-1:1);v.treeSHA256=sha(v.entries);return v;}
test('relative internal pnpm-style link is eligible',()=>assert.equal(validate(links('./pg')).entries.length,5));
test('inside parent-relative link is eligible',()=>assert.equal(validate(links('../node_modules/pg')).entries.length,5));
for(const target of ['/home/superopen/pg','../../outside','../../../etc/passwd','C:\\pg','../\\evil'])test('link escape/absolute path rejects '+target,()=>assert.throws(()=>validate(links(target)),e=>/^QA_SQL_/.test(e.code)));
const metadata=(type,delta={})=>({uid:0,gid:0,nlink:1,mode:type==='symlink'?0o777:type==='directory'?0o555:0o444,isDirectory:()=>type==='directory',isFile:()=>type==='file',isSymbolicLink:()=>type==='symlink',...delta});
for(const type of ['file','directory','symlink'])test('actual stat qualification accepts root-owned readonly '+type,()=>assert.doesNotThrow(()=>stat(metadata(type),type)));
for(const type of ['file','directory'])for(const [label,delta] of [['non-root owner',{uid:1000}],['non-root group',{gid:1000}],['group writable',{mode:0o664}],['other writable',{mode:0o446}]])test(type+' rejects '+label,()=>assert.throws(()=>stat(metadata(type,delta),type),e=>/^QA_SQL_/.test(e.code)));
test('hardlinked client file rejects',()=>assert.throws(()=>stat(metadata('file',{nlink:2}),'file'),e=>/^QA_SQL_/.test(e.code)));
test('regular file cannot impersonate declared symlink',()=>assert.throws(()=>stat(metadata('file'),'symlink'),e=>/^QA_SQL_/.test(e.code)));
test('unfrozen pin stops UID1000 guard before any runtime file or import',()=>{const text=readFileSync(new URL('./factory-independent-pg-runtime-r29.mjs',import.meta.url),'utf8'),prefix=text.slice(text.indexOf(' need(process.getuid?.()'),text.indexOf(' const raw=await readHeldFile(MANIFEST);')),need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};assert.throws(()=>vm.runInNewContext('(()=>{'+prefix+'})()',{process:{getuid:()=>1000,getgid:()=>1000},H:/^[a-f0-9]{64}$/,MANIFEST_SHA256:null,need}),e=>e.code==='QA_SQL_RUNTIME_NOT_FROZEN');assert.equal(inspectIndependentPGRuntime.ready,false);});
