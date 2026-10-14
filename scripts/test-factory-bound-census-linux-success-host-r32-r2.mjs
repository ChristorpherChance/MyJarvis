/** New positive source/kernel and third-known-PID guards. No actual root or Linux observation. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {boundCensusLinuxSuccessR32R2HostScope as S,boundCensusLinuxSuccessR32R2HostProgram as program,assertBoundCensusLinuxSuccessR32R2Host as qualify} from './factory-bound-census-linux-success-host-r32-r2.mjs';
import {boundCensusLinuxFailureHostR32Program as oldProgram} from './factory-bound-census-linux-failure-host-r32.mjs';import {boundProcessCensusR32NativeProgram as native} from './factory-bound-process-census-r32.mjs';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v),H=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex'),json=v=>Buffer.from(JSON.stringify(v)+'\n');
const q=JSON.parse(readFileSync('.jarvis-dev/maintenance/factory-r32-bound-census-linux-r2-once.json')),terminal=JSON.parse(readFileSync('artifacts/software-factory/goals-r29/bound-census-linux-r32-r2-check-1791858291243-84277130-55cb-4acc-ac55-0411bc561643.json'));
function rows(){const raw={'control/owner.py':readFileSync(q.scope.owner.path),'control/fixture.py':readFileSync(q.scope.fixture.path),'control/generated.py':Buffer.from(native()),'control/activation.json':json({schemaVersion:1,kind:'r32-bound-census-root-activation-r2',nonce:q.nonce,phase:q.phase,ownerSHA256:q.ownerSHA256,fixtureSHA256:q.scope.fixture.sha256,generatedSHA256:q.scope.generated[q.phase]}),'control/once.json':json({schemaVersion:1,kind:'r32-bound-census-root-once-r2',nonce:q.nonce,phase:q.phase,unit:q.owner.unit,ownerSHA256:q.ownerSHA256,fixtureSHA256:q.scope.fixture.sha256,generatedSHA256:q.scope.generated[q.phase]}),'work/owner.json':json(terminal.owner),'work/fixture-process.json':json(terminal.fixtureProcess),'work/result.json':json(terminal.result),'work/stopped.json':json(terminal.stopped),'work/fixture.stdout.json':json(terminal.fixture),'unit-proof.json':json({kind:'r32-bound-census-root-unit-proof-r2',nonce:q.nonce,unit:q.owner.unit,invocationId:q.owner.invocationId,ownerSHA256:q.ownerSHA256,activationSHA256:q.activationSHA256,onceSHA256:q.onceSHA256,configuration:{uid:1000,gid:1000,noNewPrivileges:true,capabilitiesEmpty:true,privateNetwork:true,protectControlGroups:true,runtimeMaxSec:80,stopTimeoutSec:10,hardParentBoundSeconds:90,killMode:'control-group',killSignal:'SIGKILL',restart:'no',execStartSHA256:terminal.unitExecStartSHA256,execStopPostSHA256:terminal.unitExecStopPostSHA256}})};return Object.fromEntries(Object.entries(raw).map(([path,b])=>{assert.equal(H(b),S.records[path].sha256,path);if(S.records[path].bytes!==null)assert.equal(b.length,S.records[path].bytes);return[path,{sha256:H(b),bytes:b.length,metadata:Array(9).fill(1),base64:b.toString('base64'),readComplete:true}]}));}
function py(code,extra={}){const r=spawnSync('python',['-c',code],{input:JSON.stringify({source:program(),scope:S,rows:rows(),...extra}),encoding:'utf8',timeout:12000,windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
test('new success source parses, original PIDFD/FD helpers remain unchanged and all three known PIDs are included',()=>{
 const old=oldProgram(),p=program();for(const name of ['process_record','pidfd_poll','pidfd_exit_proof','read_file','namespace_read','known_process','cgroup_read']){const part=s=>s.slice(s.indexOf('def '+name+'('),s.indexOf('\ndef ',s.indexOf('def '+name+'(')+1));assert.equal(part(p).replaceAll('R32_BOUND_SUCCESS_R2_','R32_BOUND_FAILURE_'),part(old));}
 assert.match(p,/front=\{S\['owner'\]\['pid'\],S\['fixture'\]\['pid'\],S\['tiny'\]\['pid'\]\}/);assert.match(p,/known=set\(records\)&\{S\['owner'\]\['pid'\],S\['fixture'\]\['pid'\],S\['tiny'\]\['pid'\]\}/);assert.equal(p.split("for k in ['owner','fixture','tiny']").length,3);
 assert.ok(p.indexOf('second=census()')<p.indexOf('second_records,second_namespace=namespace_read()'));assert.ok(!p.includes('pidfd_send_signal'));assert.ok(!p.includes('os.kill('));assert.ok(!p.includes('sqlite3'));
 assert.deepEqual(py('import ast,json,sys\nx=json.load(sys.stdin);ast.parse(x["source"]);print(json.dumps({"syntax":True}))'),{syntax:true});
});
test('actual generated positive verifier joins exact eleven raw record hashes and rejects forged ready, tiny/parent kernel, functions and unit command facts',()=>{
 const r=py(String.raw`import ast,base64,copy,errno,json,sys
x=json.load(sys.stdin);tree=ast.parse(x['source']);g={'S':x['scope'],'base64':base64,'json':json,'errno':errno}
def need(v,c):
 if not v:raise RuntimeError(c)
g['need']=need;g['compact']=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='verify_records');exec(compile(ast.Module(body=[node],type_ignores=[]),'actual-positive-verifier','exec'),g)
v=g['verify_records'](x['rows']);assert v['fixtureQualified']is True and v['originalBoundExitProof']['pid']==x['scope']['tiny']['pid'] and v['parentFixtureKernelExitProof']['requestedPID']==x['scope']['fixture']['pid'];cases=1
for change in ['ready','release','tiny-parent','tiny-inode','unbound','pollerror','parent-exit','signals','function','phase','unit-argv','unit-bound','emergency']:
 rows=copy.deepcopy(x['rows']);path='work/fixture.stdout.json';data=json.loads(base64.b64decode(rows[path]['base64']));result=json.loads(base64.b64decode(rows['work/result.json']['base64']))
 if change=='ready':data['readyHandshakeCompleted']=False
 elif change=='release':data['releaseGateSent']=False
 elif change=='tiny-parent':data['originalBoundExitProof']['processIdentity']['ppid']=999
 elif change=='tiny-inode':data['originalBoundExitProof']['listedProcIdentity']['inode']+=1
 elif change=='unbound':data['originalBoundExitProof']['kernelProof']['identityBound']=False
 elif change=='pollerror':data['originalBoundExitProof']['kernelProof']['pollEvents']=9
 elif change=='signals':data['signalsSent']=True
 elif change=='function':data['functionSHA256']['process_record']='f'*64
 elif change=='phase':data['phase']='build'
 elif change=='parent-exit':result['fixtureKernelExitProof']['identityBound']=False
 elif change=='emergency':result['fixtureEmergencyStopUsed']=True
 else:
  path='unit-proof.json';proof=json.loads(base64.b64decode(rows[path]['base64']))
  if change=='unit-argv':proof['configuration']['execStartSHA256']='f'*64
  else:proof['configuration']['runtimeMaxSec']=900
  rows[path]['base64']=base64.b64encode(json.dumps(proof).encode()).decode()
 if change not in ['unit-argv','unit-bound']:
  result['fixtureResult']=data;rows['work/fixture.stdout.json']['base64']=base64.b64encode(json.dumps(data).encode()).decode();rows['work/result.json']['base64']=base64.b64encode(json.dumps(result).encode()).decode()
 try:g['verify_records'](rows)
 except RuntimeError:pass
 else:raise AssertionError('forged original kernel or unit fact accepted')
 cases+=1
print(json.dumps({'cases':cases,'actualKernelReads':False}))`);assert.equal(r.cases,14);
});
function facts(){return{originalBoundExitProof:terminal.fixture.originalBoundExitProof,fixtureProcessIdentity:terminal.fixtureProcess,parentFixtureKernelExitProof:terminal.result.fixtureKernelExitProof,knownChildIdentity:terminal.fixture.originalBoundExitProof.processIdentity,readyHandshakeCompleted:true,releaseGateSent:true,descriptorClosed:true,childReaped:true,naturalChildExit:true,signalsSent:false,deadAttachErrno:3,sharedFunctionSHA256:terminal.fixture.functionSHA256,generatedSHA256:terminal.generatedSHA256,sourcePhase:'native',fixtureQualified:true}}
function frame(){const scan={fullProcScan:true,pidfdSupported:true,total:1,inspected:1,provenExited:0,incompleteCount:0,incomplete:[],relatedCount:0,relatedProcesses:[],complete:true,listedPIDs:[42],inspectedPIDs:[42],exitedDuringScan:[]};return{schemaVersion:1,kind:'r32-bound-census-linux-success-scope-host-observation-r2',scopeBinding:S,contextSHA256:H(S),successScope:true,failureScope:false,tinyChildIdentity:S.tiny,unknownTinyChildIdentityPreserved:false,fixtureQualified:true,actualLinuxQualified:false,fullProtectionQualified:false,modelsInvoked:false,productCodeExecuted:false,signalsSent:false,resourcesRemoved:false,mutationsPerformed:false,recordsStable:true,namespaceStable:true,unitProofVerified:true,records:rows(),kernelFacts:facts(),processScans:[structuredClone(scan),structuredClone(scan)],knownProcesses:Object.fromEntries(['owner','fixture','tiny'].map(key=>[key,{pid:S[key].pid,present:false}])),unit:{Id:S.unit,ActiveState:'inactive',MainPID:'0',ControlGroup:''},cgroup:{absent:true,complete:true},sockets:{count:0,complete:true},namespaceFD:{relatedCount:0,complete:true},cleanupScopeComplete:true}}
test('new actual assertion requires current tiny absence and separate physical cleanup; historical success cannot hide unknowns or forged proof',()=>{
 assert.equal(qualify(frame()).actualLinuxQualified,false);
 for(const mutate of [h=>h.knownProcesses.tiny.present=true,h=>h.kernelFacts.originalBoundExitProof.kernelProof.identityBound=false,h=>h.kernelFacts.parentFixtureKernelExitProof.identityBound=false,h=>h.kernelFacts.readyHandshakeCompleted=false,h=>h.processScans[0].inspectedPIDs=[42,42],h=>h.scopeBinding={...S,nonce:'f'.repeat(32)},h=>h.actualLinuxQualified=true]){const h=structuredClone(frame());mutate(h);assert.throws(()=>qualify(h));}
 const h=frame();h.processScans[0]={...h.processScans[0],total:2,incompleteCount:1,incomplete:[{pid:43}],listedPIDs:[42,43],complete:false};h.cleanupScopeComplete=false;assert.equal(qualify(h).cleanupScopeComplete,false);
});
