/** Actual generated Python pre-IO guard; no Linux, Docker, PG or remote. */
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {independentPGFrozenRootProgram as program} from './read-factory-independent-pg-runtime-r29.mjs';
function evaluate(p){const py="import ast,sys,os,json\nos.geteuid=lambda:0\nt=ast.parse(sys.stdin.read());stop=next(i for i,n in enumerate(t.body) if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='base' for x in n.targets));ns={'p':json.loads(sys.argv[1])}\ntry:exec(compile(ast.Module(body=t.body[:stop],type_ignores=[]),'actual-independent-frozen-scope','exec'),ns);print('accepted')\nexcept RuntimeError as e:print(str(e))";const r=spawnSync('python',['-c',py,JSON.stringify(p)],{input:program(),encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const p={attempt:'3c7ade1178fc47184cd9aaba9e84b855',manifestSHA256:'d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1',metadataSHA256:'3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca'};
test('exact actual nonce/manifest/metadata accepted before IO',()=>assert.equal(evaluate(p),'accepted'));
for(const key of Object.keys(p))test('changed '+key+' rejected before IO',()=>assert.equal(evaluate({...p,[key]:'changed'}),'QA_PG_FROZEN_EXACT_SCOPE_CHANGED'));
test('unknown extra is not allowed',()=>assert.equal(evaluate({...p,path:'/tmp'}),'QA_PG_FROZEN_EXACT_SCOPE_CHANGED'));
