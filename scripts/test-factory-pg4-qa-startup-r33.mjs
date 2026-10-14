/** Three local groups. No Docker, SSH, framework import, fixture or database execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertPG4QAStartupR33Activation,readPG4QAStartupR33Qualification,startPG4QAStartupR33,pg4QAStartupR33ActivationTemplate,pg4QAStartupR33HostProgram} from './factory-pg4-qa-startup-r33.mjs';
const PY='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('default/missing source family refuses before dependency, nonce, or durable intent',async()=>{
 let effects=0;const deps={readLocal:async()=>{effects++;throw Error('unexpected read')},nonce:()=>{effects++;throw Error('unexpected nonce')},rawRoot:async()=>{effects++;throw Error('unexpected Root')},writeOnce:async()=>{effects++;throw Error('unexpected intent')}};
 await assert.rejects(()=>readPG4QAStartupR33Qualification(null,deps),/EXECUTION_FAMILY_NOT_QUALIFIED/);
 await assert.rejects(()=>startPG4QAStartupR33({action:'start'},deps),/EXECUTION_FAMILY_NOT_QUALIFIED/);
 const a=structuredClone(pg4QAStartupR33ActivationTemplate);assert.throws(()=>assertPG4QAStartupR33Activation(a),/EXECUTION_FAMILY_NOT_QUALIFIED/);
 assert.equal(effects,0);
 const worker=await readFile('scripts/factory-pg4-qa-startup-worker-r33.py'),program=pg4QAStartupR33HostProgram(worker);
 assert.ok(program.includes(worker.toString('base64')));assert.ok(program.includes("p['workerSHA256']"));
 const parsed=spawnSync(PY,['-c',"import ast,sys; ast.parse(sys.stdin.read()); print('parsed-only')"],{input:program,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(parsed.status,0,parsed.stderr);assert.match(parsed.stdout,/parsed-only/);
 assert.match(sha(worker),/^[a-f0-9]{64}$/);
});
test('present resource without a created record is never adopted or removed',()=>{
 const result=spawnSync(PY,['-c',String.raw`
import ast, pathlib, types
source=pathlib.Path('scripts/factory-pg4-qa-startup-worker-r33.py').read_text()
tree=ast.parse(source)
# Load only trusted definitions/imports/constants. Never run __main__ or any CLI.
tree.body=[n for n in tree.body if not isinstance(n,ast.If)]
m=types.ModuleType('local_controlled_worker');exec(compile(tree,'controlled','exec'),m.__dict__)
m.ACTIVE={'attempt':'a'*32};m.ROOT=pathlib.Path('/controlled/attempt')
m.STATE={'cleanupFacts':[],'cleanupFailures':[]};mutations=[]
m.inspect=lambda role:{'present':True}
m.os.path.lexists=lambda path:False
m.docker=lambda *args,**kw:mutations.append(args)
m.save_state=lambda:None
m.cleanup_owned()
assert mutations==[]
assert len(m.STATE['cleanupFailures'])==4
assert all(row['errorCode']=='PG4_R33_PRESENT_ID_HISTORY_UNKNOWN' for row in m.STATE['cleanupFailures'])
assert m.STATE['cleanupIndependentlyVerified'] is False
print('four exact roles preserved unknown; zero mutation')
`],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/zero mutation/);
});
test('new descriptor glue preserves first errno and keeps a close failure secondary, including fd zero',()=>{
 const result=spawnSync(PY,['-c',String.raw`
import ast,pathlib,types,errno
tree=ast.parse(pathlib.Path('scripts/factory-pg4-qa-startup-worker-r33.py').read_text());tree.body=[n for n in tree.body if not isinstance(n,ast.If)]
m=types.ModuleType('local_controlled_worker');exec(compile(tree,'controlled','exec'),m.__dict__)
calls=[]
def failed_close(fd):calls.append(fd);raise OSError(errno.EIO,'controlled close')
m.os.close=failed_close
primary=OSError(errno.EACCES,'controlled read')
try:
 with m.descriptor(0):raise primary
except BaseException as actual:assert actual is primary and actual.errno==errno.EACCES
else:raise AssertionError('did not reject')
assert calls==[0] and primary.secondaryFailures[0]['errno']==errno.EIO
assert primary.secondaryFailures[0]['phase']=='descriptor-close'
print('first errno kept; close zero recorded secondary')
`],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/recorded secondary/);
});
