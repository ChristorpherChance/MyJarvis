/** New finite adapter tests only; no remote, Docker, PG, HTTP, native or model execution. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {matrixCleanupR32Scope as S,matrixCleanupR32PreparedPins as pins,
 matrixCleanupR32HostProgram,verifyFactoryTruthGateMatrixCleanupR32 as verify}
 from './verify-factory-truth-gate-matrix-cleanup-r32-r4.mjs';
const W='scripts/factory-truth-gate-matrix-worker-r32-r3.py',O='scripts/verify-factory-truth-gate-matrix-cleanup-r32-r4.mjs';
const worker=readFileSync(W,'utf8'),H=b=>createHash('sha256').update(b).digest('hex');
const B={attempt:'a'.repeat(32),root:S.root,source:S.source.path,fingerprint:S.source.fingerprint,
 sourceFiles:625,sourceBytes:18413560,metadataSHA:S.source.metadataSHA256,sourceIdentity:S.source.identity,
 toolSHA:H(worker),tool:'/opt/jarvis-development/software-factory/factory-truth-gate-matrix-worker-r32-r3-'+H(worker).slice(0,16)+'.py',
 ownerPID:1234,ownerStartTicks:'567',ownerBoot:'328726a0-5495-4892-b0a6-2fa9de26242e',
 nativePrerequisite:S.nativePrerequisite,nativePrerequisiteSHA256:S.nativePrerequisiteSHA256};
const generated=matrixCleanupR32HostProgram(B);
function py(body){const r=spawnSync('python',['-c',prelude+'\n'+body],{input:JSON.stringify({worker,generated}),encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
const prelude=String.raw`
import ast,copy,itertools,json,re,sys,types
from pathlib import Path
d=json.load(sys.stdin);wt=ast.parse(d['worker']);ot=ast.parse(d['generated'])
m={'__name__':'local_cap_workdir_worker_definitions'};exec(compile(wt,'new-worker-definitions','exec'),m)
names={'dependency_caps_match','present_resource'};on={'re':re,'p':{'images':m['IMAGES'],'artifactContract':{'root':'/owned/artifact/runtime'},'runtimeRoot':str(m['RUNTIME'])}}
nodes=[n for n in ot.body if isinstance(n,ast.FunctionDef) and n.name in names];assert {n.name for n in nodes}==names
exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-observer-functions','exec'),on)
def need(value,code):
 if not value:raise RuntimeError(code)
on['need']=need;on['hashv']=lambda _: 'b'*64
A='a'*32;root=m['ROOT'];resources=m['names'](A)
files={str(root/A/'control'/'artifact-contract.json'):json.dumps({'root':'/owned/artifact/runtime'}).encode(),str(root/A/'control'/'image-contract.json'):json.dumps({'images':{k:{'Config':{'Entrypoint':['entry-'+k],'Cmd':['cmd-'+k]}} for k in m['IMAGES']}}).encode()}
for role in m['ROLES']:files[str(root/A/(role+'.env'))]=b''
m['B']=types.SimpleNamespace(read_private=lambda path,*args,**kwargs:files[str(path)])
on.update({'roles':{r:'container' for r in m['ROLES']},'resource_name':lambda role:resources['containers'][role],
 'resources':resources,'labels':m['labels'](A),'VOLUMES':m['VOLUMES'],'private':root/A,'tools':root/A/'tools',
 'registry_before':{'records':{r:{'id':'1'*64} for r in m['ROLES']}}})
def fixture(role):
 app=role=='api-probe'
 return {'Id':'1'*64,'Name':'/'+resources['containers'][role],'Image':m['IMAGES']['node' if app else role],
 'Config':{'User':'1000:1000' if app else '', 'WorkingDir':'/work/source' if app else '/',
 'Entrypoint':['/usr/local/bin/node'] if app else ['entry-'+role],
 'Cmd':['/tools/supervisor.mjs'] if app else ['cmd-postgres'] if role=='postgres' else ['redis-server','--save','','--appendonly','no'] if role=='redis' else ['server','/data'],
 'Volumes':None if app else {m['VOLUMES'][role+'-data']:{}},'Labels':m['labels'](A),'Env':[]},
 'HostConfig':{'NetworkMode':resources['network'],'Privileged':False,'PidMode':'','IpcMode':'private',
 'CapDrop':['ALL'],'CapAdd':None if app else ['CAP_CHOWN','CAP_DAC_OVERRIDE','CAP_FOWNER','CAP_SETGID','CAP_SETUID'],
 'SecurityOpt':['no-new-privileges'],'Init':True,'ReadonlyRootfs':app,
 'Memory':4*1024**3 if app else 768*1024**2,'NanoCpus':2*10**9 if app else 10**9,
 'PidsLimit':256 if app else 128,'PortBindings':{},'Devices':[],'DeviceRequests':None,
 'LogConfig':{'Type':'json-file','Config':{'max-size':'4m','max-file':'2'}},'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=128m'} if app else None},
 'Mounts':[{'Type':'bind','Source':x['source'],'Destination':x['destination'],'RW':not x['readOnly']}
 for x in m['app_mounts'](A)] if app else [{'Type':'volume','Name':resources['volumes'][role+'-data'],
 'Destination':m['VOLUMES'][role+'-data'],'RW':True}]}
caps=['CHOWN','DAC_OVERRIDE','FOWNER','SETUID','SETGID']
def reject(fn,role,value):
 try:fn(role,value)
 except RuntimeError:return
 raise AssertionError('invalid config accepted')
`;

test('actual worker and assembled observer accept exact cap sets for every order and single prefix',()=>{
 const r=py(String.raw`
for perm in itertools.permutations(caps):
 for value in [list(perm),['CAP_'+x for x in perm],[('CAP_' if i%2 else '')+x for i,x in enumerate(perm)]]:
  assert m['dependency_caps_match'](value) and on['dependency_caps_match'](value)
assert ast.dump(next(n for n in wt.body if isinstance(n,ast.FunctionDef) and n.name=='dependency_caps_match'))==ast.dump(next(n for n in ot.body if isinstance(n,ast.FunctionDef) and n.name=='dependency_caps_match'))
print(json.dumps({'variants':360,'bothActualHelpersEquivalent':True}))
`);assert.equal(r.variants,360);assert.equal(r.bothActualHelpersEquivalent,true)
});
test('duplicate, extra, malformed, nested prefix or non-list capabilities never normalize into permission',()=>{
 const r=py(String.raw`
bad=[None,{},'CHOWN',tuple(caps),caps[:4],caps+['SYS_ADMIN'],['CHOWN','CAP_CHOWN','FOWNER','SETUID','SETGID'],
 ['CHOWN','DAC_OVERRIDE','FOWNER','SETUID','SYS_ADMIN'],['CAP_CAP_CHOWN',*caps[1:]],['cap_CHOWN',*caps[1:]],
 ['CHOWN ',*caps[1:]],['CAP_ CHOWN',*caps[1:]],['',*caps[1:]],[None,*caps[1:]],[1,*caps[1:]],[True,*caps[1:]]]
for value in bad:assert not m['dependency_caps_match'](value) and not on['dependency_caps_match'](value)
print(json.dumps({'invalidVariants':len(bad)}))
`);assert.equal(r.invalidVariants,16)
});
test('actual dependency create argv fixes workdir to slash while retaining isolated app and caps',()=>{
 const r=py(String.raw`
for role in m['ROLES']:
 args=m['container_command'](A,role);assert args.count('--workdir')==1
 assert args[args.index('--workdir')+1]==('/work/source' if role=='api-probe' else '/')
 assert args[args.index('--cap-drop')+1]=='ALL' and '--network' in args and '--env-file' in args
 adds=[args[i+1] for i,x in enumerate(args) if x=='--cap-add'];assert adds==([] if role=='api-probe' else caps)
 assert not any(x in ['--privileged','--publish','-p'] for x in args)
print(json.dumps({'exactRoles':4,'newDependencySlash':3}))
`);assert.equal(r.exactRoles,4)
});
test('both actual full config guards accept observed CAP_ shape and reject changed dependency/app workdirs',()=>{
 const r=py(String.raw`
for role in m['ROLES']:
 good=fixture(role);m['check_container'](A,role,good);on['present_resource'](role,good)
 for wrong in ['', '/data','.', '/work/source' if role!='api-probe' else '/', '/../']:
  if wrong==good['Config']['WorkingDir']:continue
  bad=copy.deepcopy(good);bad['Config']['WorkingDir']=wrong
  reject(lambda r,v:m['check_container'](A,r,v),role,bad);reject(on['present_resource'],role,bad)
print(json.dumps({'fullContainerRoles':4,'bothGuardsChecked':True}))
`);assert.equal(r.fullContainerRoles,4);assert.equal(r.bothGuardsChecked,true)
});
test('API retains no added capability; valid normalized dependency caps cannot bypass identity/isolation/mounts',()=>{
 const r=py(String.raw`
for allowed in [None,[]]:
 v=fixture('api-probe');v['HostConfig']['CapAdd']=allowed;m['check_container'](A,'api-probe',v);on['present_resource']('api-probe',v)
for role in m['ROLES']:
 for change in [lambda v:v['Config'].update(User='0'),lambda v:v['HostConfig'].update(Privileged=True),
 lambda v:v['HostConfig'].update(PortBindings={'9000/tcp':[]}),lambda v:v['Mounts'].append({'Type':'bind','Source':'/var/run/docker.sock','Destination':'/var/run/docker.sock','RW':True}),
 lambda v:v.update(Image='sha256:'+'f'*64),lambda v:v['HostConfig'].update(CapAdd=['SYS_ADMIN'])]:
  bad=fixture(role);change(bad);reject(lambda r,v:m['check_container'](A,r,v),role,bad);reject(on['present_resource'],role,bad)
print(json.dumps({'roles':4,'mutationsPerRole':6,'noAddedAppCapsPreserved':True}))
`);assert.equal(r.mutationsPerRole,6);assert.equal(r.noAddedAppCapsPreserved,true)
});
test('inverse byte proof preserves all old worker and normal observer content outside explicit adapter/version deltas',()=>{
 const manifest=JSON.parse(readFileSync('artifacts/software-factory/goals-r29/r32-matrix-cap-workdir-local-delta.json'));
 for(const [which,path] of [['worker',W],['observer',O]]){
  let s=readFileSync(path,'utf8');for(const e of manifest.edits.filter(e=>e.file===which).reverse()){
   assert.equal(s.split(e.to).length,2);s=s.replace(e.to,e.from)
  }
  assert.equal(H(s),manifest[which].baseSHA256);assert.equal(H(readFileSync(manifest[which].basePath)),manifest[which].baseSHA256)
 }
 assert.equal(manifest.inverseExactOldBytes,true)
});
test('new normal observer default pins remain null and refuse all operational IO',async()=>{
 let io=0;const nope=()=>{io++;throw Error('UNEXPECTED_IO')};const r=await verify({},{readLocal:nope,readRoot:nope,verifyProtection:nope,evidence:nope});
 assert.equal(io,0);assert.equal(r.ready,false);assert.equal(r.observerRevision,4);assert.equal(r.productResultsIndependentlyQualified,false);
 assert.equal(pins.workerSHA256,H(worker));assert.equal(pins.starterSHA256,null);
 assert.equal(S.workerSHA256,null);assert.equal(S.artifactContract,null);assert.equal(S.nativePrerequisite.actualLoadVerified,false)
});
test('full new Python worker and generated observer syntax remain valid without execution',()=>{
 const r=py("compile(wt,'new-worker','exec');compile(ot,'new-observer','exec');print(json.dumps({'bothSyntaxValid':True}))");assert.equal(r.bothSyntaxValid,true)
});
test('actual new worker inspect stays inert and does not load pinned library/package code',()=>{
 const r=spawnSync('python',[W,'--inspect'],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.status,0,r.stderr);
 const v=JSON.parse(r.stdout);assert.equal(v.ready,false);assert.equal(v.remoteOperations,false);assert.equal(v.httpSQLExecuted,0);assert.equal(v.additionalPGExecuted,0);assert.equal(v.modelsInvoked,false)
});
