/** Actual generated Python expressions / local null activation, no host IO. */
import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{spawnSync}from'node:child_process';
import{matrixR32Scope as S,startMatrixR32,assertMatrixR32QualifiedScope,matrixR32HostProgram}from'./start-factory-truth-gate-matrix-r32-r2.mjs';
import{matrixR32NativePrerequisite as P,matrixR32NativePrerequisiteSHA256 as PSHA}from'./factory-truth-gate-matrix-supervisor-r32-r2.mjs';
test('new source qualifier binds exact native descriptor, 34+4 stays fixed, actual activation remains null',async()=>{assert.deepEqual(S.nativePrerequisite,P);assert.equal(S.nativePrerequisiteSHA256,PSHA);assert.equal(S.httpSQLDenominator,34);assert.equal(S.additionalPGDenominator,4);assert.equal(S.resourceCount,8);assert.equal((await startMatrixR32('inspect')).ready,false);let calls=0;await assert.rejects(startMatrixR32('start',{readLocal:()=>{calls++;throw Error('NO_IO')},readRoot:()=>{calls++;throw Error('NO_IO')}}),/QA_R32_ENVIRONMENT_NOT_QUALIFIED/);assert.equal(calls,0);});
test('activated source scope cannot change native descriptor or old loadfalse state',()=>{const s=structuredClone(S);for(const [k,v]of Object.entries(s.qualification))s.qualification[k]={path:'artifacts/software-factory/goals-r29/local-'+k+'.json',sha256:'a'.repeat(64)};assertMatrixR32QualifiedScope(s);for(const mutate of [q=>q.nativePrerequisite.actualLoadVerified=true,q=>q.nativePrerequisite.nativeModule.bytes++,q=>q.nativePrerequisiteSHA256='b'.repeat(64)]){const n=structuredClone(s);mutate(n);assert.throws(()=>assertMatrixR32QualifiedScope(n));}});
test('actual new host Python compiles and checks artifact fullnative SHA before generating execution-contract',()=>{const py=matrixR32HostProgram();const r=spawnSync('python',['-c','import ast,sys;v=sys.stdin.read();ast.parse(v);compile(v,"fixed-native-host","exec")'],{input:py,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert(py.indexOf("native=json.loads(read(control/'artifact-contract.json'))")<py.indexOf("store(tools/'execution-contract.json'"));assert(py.includes("'nativePrerequisite':native,'nativePrerequisiteSHA256':S['nativePrerequisiteSHA256']"));assert(!py.includes('require('));});
test('actual worker artifact and execution predicates distinguish false from0, changedbytes or false priorload claims',()=>{
 const source=readFileSync('scripts/factory-truth-gate-matrix-worker-r32-r2.py','utf8'),input=JSON.stringify({source,P,PSHA,S}),py=String.raw`
import ast,json,sys,hashlib,copy
d=json.load(sys.stdin);t=ast.parse(d['source']);compile(t,'fixed-native-worker','exec')
expr={}
for n in ast.walk(t):
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)==2 and isinstance(n.args[1],ast.Constant) and n.args[1].value in ['QA_R32_NATIVE_PREREQUISITE_UNPROVEN','QA_R32_NONROOT_CONTRACT_CHANGED']:expr[n.args[1].value]=n.args[0]
assert len(expr)==2
P=d['P'];s=d['S'];active={'runID':'b'*40,'pins':{'build-proof.json':'c'*64,'artifact-contract.json':'d'*64}}
e={'schemaVersion':1,'kind':'r32-truth-gate-nonroot-execution-contract','attempt':'a'*32,'runID':active['runID'],'sourceFingerprint':s['sourceFingerprint'],'sourceIndexSHA256':s['sourceIndex']['sha256'],'buildProofSHA256':active['pins']['build-proof.json'],'artifactContractSHA256':active['pins']['artifact-contract.json'],'PGManifestSHA256':s['PGManifestSHA256'],'httpSQLDenominator':34,'additionalPGDenominator':4,'nativePrerequisite':P,'nativePrerequisiteSHA256':d['PSHA']}
ns={'json':json,'digest':lambda b:hashlib.sha256(b).hexdigest(),'NATIVE_PREREQUISITE':P,'NATIVE_PREREQUISITE_SHA':d['PSHA'],'c':{'nativePrerequisite':P},'e':e,'a':'a'*32,'ACTIVE':active,'SOURCE_FP':s['sourceFingerprint'],'SOURCE_INDEX_SHA':s['sourceIndex']['sha256'],'MANIFEST_SHA':s['PGManifestSHA256']}
for key,x in expr.items():
 code=compile(ast.Expression(x),'actual-worker-native-expression','eval');assert eval(code,ns)
 for variant in ['false-zero','loaded','size','hash']:
  p=copy.deepcopy(P)
  if variant=='false-zero':p['actualLoadVerified']=0
  if variant=='loaded':p['actualLoadVerified']=True
  if variant=='size':p['nativeModule']['bytes']+=1
  if variant=='hash':p['nativeModule']['sha256']='e'*64
  ns['c']={'nativePrerequisite':p};ns['e']={**e,'nativePrerequisite':p};assert not eval(code,ns),(key,variant)
 ns['c']={'nativePrerequisite':P};ns['e']=e
print(json.dumps({'actualPredicates':2,'negativeVariantsEach':4,'allPassed':True}))
`;const r=spawnSync('python',['-c',py],{input,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{actualPredicates:2,negativeVariantsEach:4,allPassed:true});
});
