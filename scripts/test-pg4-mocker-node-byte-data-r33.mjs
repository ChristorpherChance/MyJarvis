import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readPG4MockerNodeByteQualificationR33 as q,selectPG4MockerNodeDeclaredTargetR33 as select,createPG4MockerNodeWireCaptureR33 as capture} from './read-factory-pg4-mocker-node-bytes-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('new mocker declared data branch/default0IO and complete-wire-before-final-failure retention',async()=>{
 let touched=0;await assert.rejects(q(null,new Proxy({},{ownKeys(){touched++;throw Error('deps touched')}})),/ACTIVATION_REQUIRED/);assert.equal(touched,0);
 const pkg=exports=>({name:'@vitest/mocker',exports:{'./node':exports}});
 assert.equal(select(pkg({types:'./types.d.ts',node:{import:'./dist/node.js',default:'./dist/fallback.js'}})),'./dist/node.js');
 for(const x of [['./node.js'],{unknown:'./node.js'},'../escape.js','./../escape.js',{'require':'./node.cjs'}])assert.throws(()=>select(pkg(x)),/R33_MOCKER_/);
 const python=String.raw`import pathlib,types
m=types.ModuleType('data');exec(compile(pathlib.Path('scripts/factory-pg4-mocker-node-byte-reader-r33.py').read_bytes(),'trusted-data','exec'),m.__dict__)
assert m.declared_node_target({'name':'@vitest/mocker','exports':{'./node':{'types':'x','node':{'import':'./dist/node.js'}}}})=='./dist/node.js'
assert m.unique_standalone_reexport(b'export {h as hoistMocksPlugin,a as automockPlugin} from "./one.js";')=='./one.js'
assert m.unique_standalone_reexport(b'import x from "a"; export function hoistMocksPlugin(){}') is None
for raw in [b'export {hoistMocksPlugin} from "./a.js"; export {automockPlugin} from "./b.js";',b'export {hoistMocksPlugin} from "./a.js";']:
 try:m.unique_standalone_reexport(raw)
 except RuntimeError as e:assert str(e).startswith('R33_MOCKER_')
 else:raise AssertionError('unknown/multiple reexport accepted')
print('pure declaration tests only')
`;
 const p=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-I','-c',python],{windowsHide:true,timeout:10000});assert.equal(p.status,0,p.stderr?.toString());
 const files=new Map(),out=Buffer.from('{"originalData":"kept"}'),empty=Buffer.alloc(0);let calls=0;
 const d={rawTransport:async()=>{calls++;return{status:1,signal:null,error:null,stdout:out,stderr:empty}},privateEvidence:async v=>{const b=Buffer.from(JSON.stringify(v)+'\n'),path='.jarvis-dev/maintenance/controlled-mocker-wire.json';files.set(path,b);return{path,sha256:sha(b),bytes:b.length}},readLocal:async path=>files.get(path)};
 const c=capture(d,{parameters:{scope:{limits:{combinedWireMaxBytes:8388608}}},hostProgram:'trusted',stdinBundle:empty,hostProgramSHA256:'a'.repeat(64),stdinBundleSHA256:sha(empty),parametersSHA256:'b'.repeat(64)});
 await assert.rejects(c.read(),e=>{assert.equal(e.message,'R33_MOCKER_ROOT_TRANSPORT_INCOMPLETE');assert.ok(e.mockerNodeCaptureEvidence.wire);return true});assert.equal(calls,1);const saved=JSON.parse(files.values().next().value);assert.equal(Buffer.from(saved.stdoutBase64,'base64').toString(),out.toString());await assert.rejects(c.read(),/ALREADY_USED/);assert.equal(calls,1);
 const caller=(await readFile('scripts/read-factory-pg4-mocker-node-bytes-r33.mjs')).toString();assert.ok(caller.includes("SELF='scripts/read-factory-pg4-mocker-node-bytes-r33.mjs'"));assert.ok(caller.includes("evidence.kind==='r33-pg4-vite-and-vitest-plugin-creator-bounded-source-analysis'"));
});
