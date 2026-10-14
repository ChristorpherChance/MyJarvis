/** Three new local groups only. No generated Root program or package JS execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {readPG4SourceAdmissionQualificationR33,readPG4SourceAdmissionR33,pg4SourceAdmissionR33HostProgram} from './factory-pg4-source-admission-r33.mjs';
import {assertPG4QAStartupR33Activation,pg4QAStartupR33ActivationTemplate,pg4QAStartupR33AdmissionPhasePlan} from './factory-pg4-qa-startup-r33.mjs';
const PY='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';
function controlled(code){const r=spawnSync(PY,['-c',code],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);return r.stdout}
test('phase A null before all IO and parent provided/deferred roles have one closed map',async()=>{
 let effects=0;const deps={readLocal:async()=>{effects++;throw Error('IO')},rawRoot:async()=>{effects++;throw Error('Root')}};
 await assert.rejects(()=>readPG4SourceAdmissionQualificationR33(null,deps),/NOT_SOURCE_QUALIFIED/);await assert.rejects(()=>readPG4SourceAdmissionR33(null,deps),/NOT_SOURCE_QUALIFIED/);assert.equal(effects,0);
 const a=structuredClone(pg4QAStartupR33ActivationTemplate),r={path:'artifacts/software-factory/goals-r29/controlled.json',sha256:'a'.repeat(64)};
 for(const k of Object.keys(a).filter(k=>!['schemaVersion','kind','protocol','admissionFiles'].includes(k)))a[k]=r;
 a.admissionFiles=Object.fromEntries(pg4QAStartupR33AdmissionPhasePlan.providedRoles.map(k=>[k,r]));assert.ok(assertPG4QAStartupR33Activation(a));
 const premature=structuredClone(a);premature.admissionFiles.preScopeAbsence=r;assert.throws(()=>assertPG4QAStartupR33Activation(premature),/ADMISSION_FILES_MISSING/);
 assert.ok(!pg4QAStartupR33AdmissionPhasePlan.providedRoles.includes('newPG4CurrentScopeClosure'));assert.ok(pg4QAStartupR33AdmissionPhasePlan.deferredRoles.includes('imageWitness'));
 const source=await readFile('scripts/factory-pg4-source-admission-r33.py');const program=pg4SourceAdmissionR33HostProgram(source);
 assert.match(controlled("import ast,sys;ast.parse(sys.stdin.read())")||'',/^$/); // No runtime body is invoked.
 const parsed=spawnSync(PY,['-c','import ast,sys;ast.parse(sys.stdin.read());print("AST-only")'],{input:program,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(parsed.status,0,parsed.stderr);assert.match(parsed.stdout,/AST-only/);
});
test('actual625 supplied source union and original Python integer domain; read/close first exception stays primary',()=>{
 const out=controlled(String.raw`
import ast,pathlib,types,json,errno
src=pathlib.Path('scripts/factory-pg4-source-admission-r33.py').read_bytes();t=ast.parse(src);t.body=[n for n in t.body if not isinstance(n,ast.If)]
m=types.ModuleType('controlled_a');exec(compile(t,'controlled-a','exec'),m.__dict__)
base=pathlib.Path('artifacts/software-factory/goals-r29/r32-source-public-index-1791837951701-4991420c-d4b4-42f0-a8eb-f684d32a8127.json').read_bytes()
overlay=pathlib.Path('artifacts/software-factory/goals-r29/r33-four-fixture-source-public-index-1791868427390-693228d2-4a53-411a-9ba3-173ad79cd061.json').read_bytes()
fixture=pathlib.Path('.jarvis-dev/workspaces/msf-targets-r33/source/apps/server/src/modules/test/truth-gate.integration.test.ts').read_bytes()
entries=[dict(path='source/'+x['path'],type='file',sha256=x['sha256'],bytes=x['bytes']) for x in json.loads(base)['manifest']]
w=m.source_union(base,overlay,fixture,entries);assert w['files']==625 and w['otherSourceFilesUnchanged']==624 and w['protectedOverlayPhysicalInstalled'] is False
entries[0]['sha256']='0'*64
try:m.source_union(base,overlay,fixture,entries)
except RuntimeError as e:assert str(e)=='PG4_A_RUNTIME_SOURCE625_CHANGED'
else:raise AssertionError('changed source accepted')
large=1791916234428123456;raw=m.compact({'rootIdentity':[66306,7924569,0,0,16749,1,1,large,large+1]});assert str(large).encode() in raw and json.loads(raw)['rootIdentity'][-1]==large+1
r=m.Reader();closed=[];primary=OSError(errno.EACCES,'controlled read')
def close(fd):closed.append(fd);raise OSError(errno.EIO,'controlled close')
m.os.close=close
try:
 with r.held(0):raise primary
except OSError as e:assert e is primary and e.errno==errno.EACCES
else:raise AssertionError('primary not propagated')
r.finish();assert closed==[0] and r.first['errno']==errno.EACCES and r.secondary[-1]['errno']==errno.EIO and r.unresolved=={0}
print('actual supplied625 relation; synthetic tree not Linux; integer and fd0 first error closed')
`);assert.match(out,/synthetic tree not Linux/);
});
test('all four names and both label scopes are checked before first create; any present stays refused',()=>{
 const out=controlled(String.raw`
import ast,pathlib,types,json
t=ast.parse(pathlib.Path('scripts/factory-pg4-qa-startup-worker-r33.py').read_bytes());t.body=[n for n in t.body if not isinstance(n,ast.If)]
m=types.ModuleType('controlled_phase_b');exec(compile(t,'controlled-b','exec'),m.__dict__)
m.ACTIVE={'attempt':'a'*32,'workerSHA256':'b'*64,'driverSHA256':'c'*64,'sourceContractSHA256':'d'*64};m.ROOT=pathlib.Path('/controlled/attempt');m.STATE={'captures':[]};events=[];saved=[]
def labels():events.append('both-label-scopes');m.STATE['captures'].append({'controlled':True})
def inspect(role):events.append(role);m.STATE['captures'].append({'controlled':role});return None
m.empty_labels=labels;m.inspect=inspect;m.store=lambda p,b,mode:saved.append((p,json.loads(b),mode))
m.pre_resource_absence();assert events==['both-label-scopes','postgres','pg4-runner','internal-network','postgres-data'] and len(saved)==1 and saved[0][1]['phase']=='B' and saved[0][1]['currentBatchClosureClaimed'] is False
events.clear();saved.clear();m.inspect=lambda role:{'present':True} if role=='postgres' else None
try:m.pre_resource_absence()
except RuntimeError as e:assert str(e)=='PG4_R33_FIRST_CREATE_SCOPE_NOT_EMPTY'
else:raise AssertionError('present resource accepted')
assert saved==[]
print('B actual helper controlled exact4 before create, zero Docker/create')
`);assert.match(out,/zero Docker/);
});
