import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {pg4QACurrentScopeR33ActivationTemplate,readPG4QACurrentScopeQualificationR33,verifyFactoryPG4QACurrentScopeR33,pg4QACurrentScopeR33HostProgram} from './verify-factory-pg4-qa-current-scope-r33.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('current scope: default zero IO and pinned definition assembly only',async()=>{
 let touches=0;const deps=new Proxy({}, {get(){touches++;throw Error('DEPENDENCY_TOUCHED')}});
 assert.equal((await readPG4QACurrentScopeQualificationR33(null,deps)).ready,false);assert.equal((await verifyFactoryPG4QACurrentScopeR33(pg4QACurrentScopeR33ActivationTemplate,deps)).ready,false);assert.equal(touches,0);
 assert.throws(()=>pg4QACurrentScopeR33HostProgram(),/GENERATED_SOURCE_INPUTS_REQUIRED/);
 const observer=await readFile('scripts/factory-pg4-qa-current-scope-observer-r33.py'),native=await readFile('artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py'),source=await readFile('scripts/factory-pg4-source-admission-r33.py');
 const inputs={observerSource:observer.toString(),nativeSource:native.toString(),sourceAdmissionSource:source.toString(),sourceAdmissionSHA256:sha(source)};
 assert.throws(()=>pg4QACurrentScopeR33HostProgram({...inputs,nativeSource:native.toString()+'\n'}),/GENERATED_SOURCE_CHANGED/);
 const program=pg4QACurrentScopeR33HostProgram(inputs);assert.ok(program.includes("return _source_authority_pg4['run'](params,manage_alarm=False)"));assert.ok(program.includes('def pidfd_exit_proof(pid,attachment,boot):'));assert.equal(program.split('def census():').length,2);
 const parsed=spawnSync('python',['-c','import ast,sys;ast.parse(sys.stdin.buffer.read());print("GENERATED_AST_ONLY")'],{input:Buffer.from(program),windowsHide:true,timeout:10000});assert.equal(parsed.status,0,parsed.stderr.toString());assert.equal(parsed.stdout.toString().trim(),'GENERATED_AST_ONLY');assert.equal(touches,0);
});
