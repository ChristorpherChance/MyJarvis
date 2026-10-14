/** New cwd-only physical observer checks. Pure generation and controlled Python, no host IO. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {canonical,sha} from './run-factory-main-repair-r26.mjs';
import * as n from './verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs';
import * as old from './verify-factory-truth-gate-matrix-cleanup-r32-r7.mjs';
const copy=structuredClone,bytes=p=>fs.readFileSync(p),wh=sha(bytes('scripts/factory-truth-gate-matrix-worker-r32-r6.py'));
function controlledB(){
 const q=JSON.parse(bytes('.jarvis-dev/maintenance/factory-r32-truth-gate-matrix-r5-once.json')),s=copy(q.immutableScope),start=JSON.parse(bytes(q.receipts.start.path));
 s.worker={...s.worker,path:'scripts/factory-truth-gate-matrix-worker-r32-r6.py',sha256:wh,installedPath:'/opt/jarvis-development/software-factory/factory-truth-gate-matrix-worker-r32-r6-'+wh.slice(0,16)+'.py'};
 q.immutableScope=s;start.workerSHA256=wh;
 const S={...copy(n.matrixCleanupR32Scope),workerSHA256:wh,starterSHA256:q.starterSHA256,installedWorker:s.worker.installedPath,producerProtocolSHA256:sha(canonical(n.matrixCleanupR32Protocol)),protocol:n.matrixCleanupR32Protocol,producerScope:s,artifactContract:{...s.qualification.artifactContract,value:JSON.parse(bytes(s.qualification.artifactContract.path))},imageContract:{...s.qualification.imageContract,value:JSON.parse(bytes(s.qualification.imageContract.path))}};
 return n.assertMatrixCleanupR32Context(q,start,S);
}
test('new normal default operational null remains zero IO and uses new R6 once only',async()=>{let io=0;const no=()=>{io++;throw Error('unexpected IO')};const r=await n.verifyFactoryTruthGateMatrixCleanupR32({},{readLocal:no,readRoot:no,verifyProtection:no});assert.equal(io,0);assert.equal(r.ready,false);assert.equal(r.observerRevision,8);assert.equal(r.productResultsIndependentlyQualified,false);assert.match(n.matrixCleanupR32JournalPath,/-r6-once/);assert.notEqual(n.matrixCleanupR32JournalPath,old.matrixCleanupR32JournalPath);assert.equal(n.matrixCleanupR32PreparedPins.workerSHA256,wh);assert.equal(n.matrixCleanupR32Scope.workerSHA256,null)});
test('actual generated cwd image and present-resource functions match new worker while original census/stock are preserved',()=>{
 const B=controlledB(),code=n.matrixCleanupR32HostProgram(B),before=old.matrixCleanupR32HostProgram({...B,tool:B.tool.replace('worker-r32-r6-','worker-r32-r5-')});
 const py=String.raw`import ast,json,sys,re,hashlib,importlib.util,copy,types
x=json.load(sys.stdin);a=ast.parse(x['before']);b=ast.parse(x['code']);parts=lambda t,s:{v.name:ast.get_source_segment(s,v) for v in t.body if isinstance(v,ast.FunctionDef)};first=parts(a,x['before']);second=parts(b,x['code']);assert {k for k in first if first[k]!=second[k]}=={'image_state','present_resource'}
assert first['census']==second['census'] and first['process_record']==second['process_record'] and first['pidfd_exit_proof']==second['pidfd_exit_proof']
spec=importlib.util.spec_from_file_location('controlled_new_fixture','scripts/test-factory-truth-gate-dependency-r32-r6.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.initialize()
names={'image_state','present_resource','dependency_caps_match'};nodes=[v for v in b.body if isinstance(v,ast.FunctionDef) and v.name in names or isinstance(v,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'IMAGE_WORKING_DIRECTORIES','CONTAINER_WORKING_DIRECTORIES'} for t in v.targets)]
need=lambda value,code:None if value else (_ for _ in ()).throw(RuntimeError(code));B=x['B'];attempt=m.A;p=B;roleKinds={k:'container' for k in ['postgres','redis','minio','api-probe']};roleKinds.update({'network':'network',**{k:'volume' for k in m.m.VOLUMES}});ns={'p':B,'need':need,'json':json,'re':re,'roles':roleKinds,'VOLUMES':m.m.VOLUMES,'labels':m.m.labels(attempt),'resources':m.m.names(attempt),'tools':'/unused','private':'/unused','resource_name':lambda r:m.m.expected_resource(attempt,r)[1],'registry_before':{'records':{k:{'id':m.CID} for k in ['postgres','redis','minio','api-probe']}},'strict_json':json.loads,'hashv':lambda v:hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
ns['resources']=m.m.names(attempt);ns['resources']['volumes']=ns['resources']['volumes'];exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-normal-generated','exec'),ns)
def docker(args):
 role=next(k for k,v in m.m.IMAGES.items() if v==args[2]);return types.SimpleNamespace(returncode=0,stdout=json.dumps([m.actual_images[role]]).encode())
ns['docker']=docker;out=ns['image_state']();assert out['images']['redis']['workingDirectory']=='/data'
v=m.container('redis');ns['present_resource']('redis',v)
v['Config']['WorkingDir']='/'
try:ns['present_resource']('redis',v)
except RuntimeError:pass
else:raise AssertionError('old forced root cwd accepted')
bad=copy.deepcopy(m.actual_images['redis']);bad['Config']['WorkingDir']='/tmp';ns['docker']=lambda args:types.SimpleNamespace(returncode=0,stdout=json.dumps([bad if args[2]==m.m.IMAGES['redis'] else m.actual_images[next(k for k,v in m.m.IMAGES.items() if v==args[2])]]).encode())
try:ns['image_state']()
except RuntimeError:pass
else:raise AssertionError('wrong image cwd accepted')
print(json.dumps({'changedGeneratedFunctions':2,'originalGeneratedFunctionsUnchanged':len(first)-2,'actualDockerExecuted':False}))`;
 const r=spawnSync('C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe',['-c',py],{input:JSON.stringify({code,before,B}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.changedGeneratedFunctions,2);assert.equal(result.actualDockerExecuted,false);assert.ok(result.originalGeneratedFunctionsUnchanged>20);
});
test('all same fixed image roles retain exact effective cwd including API; no arbitrary cwd widening',()=>{assert.deepEqual(n.matrixCleanupR32ImageWorkingDirectories,{node:'',postgres:'',redis:'/data',minio:'/'});assert.deepEqual(n.matrixCleanupR32ContainerWorkingDirectories,{postgres:'/',redis:'/data',minio:'/', 'api-probe':'/work/source'});const source=fs.readFileSync('scripts/verify-factory-truth-gate-matrix-cleanup-r32-r8.mjs','utf8');assert.match(source,/v\.workingDirectory===matrixCleanupR32ImageWorkingDirectories\[r\]/);assert.match(source,/worker-r32-r6-/);assert.equal(sha(bytes('scripts/verify-factory-truth-gate-matrix-cleanup-r32-r7.mjs')),'92d134c01a7b69fa19cff7f1df842584826c6b630f8e1548796bc74bba083b66')});
