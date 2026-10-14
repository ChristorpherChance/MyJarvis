/** Independent limited guards, no host/process/product/native execution. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {readArtifactReconciliationR32,artifactReconciliationR32NativePrefix} from './read-factory-runtime-artifact-reconciliation-r32.mjs';
import {targetCopyR29Scope} from './prepare-factory-target-copy-r29.mjs';import {targetCleanupR29Scope,targetCleanupR29HostProgram} from './verify-factory-target-cleanup-r29.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),source=readFileSync('scripts/read-factory-runtime-artifact-reconciliation-r32.py','utf8'),caller=readFileSync('scripts/read-factory-runtime-artifact-reconciliation-r32.mjs','utf8'),native=artifactReconciliationR32NativePrefix();
const old=JSON.parse(readFileSync(targetCleanupR29Scope.journalPath,'utf8')),params={...targetCopyR29Scope,job:old.copyJob,taskId:old.taskId,runId:old.runId,originSHA256:targetCleanupR29Scope.originSHA256,parentIdentity:targetCleanupR29Scope.parentIdentity,workspaceIdentity:targetCleanupR29Scope.workspaceIdentity};
function run(code,extra={}){const r=spawnSync('python',['-c',code],{input:JSON.stringify({source,native,params,...extra}),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
test('actual import/default activation returns notReady and never dispatches',async()=>{const r=await readArtifactReconciliationR32();assert.equal(r.ready,false);assert.equal(r.remoteOperations,false);assert.equal(r.productAccepted,false);assert.match(r.reason,/ACTIVATION_REQUIRED/)});
test('native copied prefix contains unchanged d486 identity-bound PIDFD reader and full census',()=>{const all=targetCleanupR29HostProgram(),a=all.indexOf('def process_record('),b=all.indexOf('def census():',a);assert.ok(native.includes(all.slice(a,b)));assert.ok(native.includes('identityBound'));assert.ok(native.includes('pidfd-POLLIN'));assert.ok(native.includes('readIncompletePIDs'));assert.equal(sha(native),'a29fd5e9bb10f8b4023914bbc71a9de2ce479103b8166ce0214c47fc077d6796');assert.ok(!native.includes('if pid==os.getpid():continue'));});
test('actual root admission fixes native hash and full params before either exec',()=>{const r=run(String.raw`
import ast,base64,hashlib,json,sys,types,copy
x=json.load(sys.stdin);t=ast.parse(x['source']);f=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='main');stop=next(i for i,n in enumerate(f.body) if isinstance(n,ast.Assign) and any(isinstance(z,ast.Name) and z.id=='c' for z in n.targets));assert not any(isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='exec' for n in f.body[:stop]);assign=[n for n in t.body if isinstance(n,ast.Assign)];defs=[n for n in t.body if isinstance(n,ast.FunctionDef) and n.name in ['need','digest']];ns={'json':json,'base64':base64,'hashlib':hashlib,'os':types.SimpleNamespace(geteuid=lambda:0,getegid=lambda:0)};exec(compile(ast.Module(body=assign+defs,type_ignores=[]),'actual-admission-defs','exec'),ns)
approved=lambda b:ns['CORE'] if b==b'controlled core' else ns['INSPECTION'] if b==b'controlled prior' else hashlib.sha256(b).hexdigest();ns['digest']=approved
def gate(p):ns['p']=p;exec(compile(ast.Module(body=f.body[:stop],type_ignores=[]),'actual-pre-exec-gate','exec'),ns)
raw=x['native'].encode();p={'coreRaw':base64.b64encode(b'controlled core').decode(),'nativeRaw':base64.b64encode(raw).decode(),'nativeSHA256':hashlib.sha256(raw).hexdigest(),'nativeParams':x['params'],'inspectionRaw':base64.b64encode(b'controlled prior').decode(),'sourceIndex':{},'packageSupplement':{}};gate(p)
variants=[];v=copy.deepcopy(p);v['nativeRaw']=base64.b64encode(b"p['untrustedNativeExecuted']=True").decode();v['nativeSHA256']=hashlib.sha256(base64.b64decode(v['nativeRaw'])).hexdigest();variants.append(v)
v=copy.deepcopy(p);v['nativeSHA256']='0'*64;variants.append(v)
v=copy.deepcopy(p);v['nativeParams']['workspace']='/different';variants.append(v)
v=copy.deepcopy(p);v['nativeParams']['projectId']=999;variants.append(v)
v=copy.deepcopy(p);v['nativeParams']['extra']=True;variants.append(v)
for v in variants:
 try:gate(v)
 except RuntimeError as e:assert str(e)=='R32_RECON_INPUT_BYTES_CHANGED'
 else:raise AssertionError('untrusted native admitted')
print(json.dumps({'approvedNativeAccepted':True,'beforeExecNegatives':len(variants),'noCoreOrNativeExecuted':True}))
`);assert.deepEqual(r,{approvedNativeAccepted:true,beforeExecNegatives:5,noCoreOrNativeExecuted:true});});
test('actual related predicate catches root-only FD but rejects neighboring namespace',()=>{const r=run(String.raw`
import ast,json,re,sys
x=json.load(sys.stdin);t=ast.parse(x['source']);f=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='main');wanted=[n for n in f.body if isinstance(n,ast.Assign) and any(isinstance(z,ast.Name) and z.id=='paths' for z in n.targets) or isinstance(n,ast.FunctionDef) and n.name in ['related','argv']];root='/var/lib/jarvis-development/101/r32-truth-artifacts';ns={'p':{'nativeParams':{'workspace':'/r29/source'}},'scope':{'work':'/old/work'},'root':root,'old':root+'/nonce','TREE':'9'*64,'re':re};exec(compile(ast.Module(body=wanted,type_ignores=[]),'actual-related-predicates','exec'),ns)
assert ns['related'](root);assert ns['related'](root+' (deleted)');assert ns['related'](root+'/nonce/bundle/runtime');assert ns['argv']('python --path='+root);assert not ns['related'](root+'-other');assert not ns['argv']('python /prefix'+root);print(json.dumps({'rootFDMatches':True,'deletedRootFDMatches':True,'childMatches':True,'boundaryNegatives':2}))
`);assert.deepEqual(r,{rootFDMatches:true,deletedRootFDMatches:true,childMatches:true,boundaryNegatives:2});});
test('partial ownership gate rejects nonroot and hardlinks without certifying its link graph',()=>{const r=run(String.raw`
import ast,json,stat,sys
x=json.load(sys.stdin);f=next(n for n in ast.parse(x['source']).body if isinstance(n,ast.FunctionDef) and n.name=='main');nodes=list(ast.walk(f));call=next(n for n in nodes if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)>1 and isinstance(n.args[1],ast.Constant) and n.args[1].value=='R32_RECON_PARTIAL_OWNER_OR_HARDLINK_CHANGED');expr=compile(ast.Expression(call.args[0]),'actual-partial-gate','eval')
root=[1,2,0,0,stat.S_IFDIR|0o700,2,64,1791840000000000001,1791840000000000002]
def accepted(rows,rootstat=root):return eval(expr,{'partial':{'rootStat':rootstat,'metadata':rows},'stat':stat})
row=['file',1,2,0,0,stat.S_IFREG|0o444,1,1,1791840000000000001,1791840000000000002];assert accepted([row])
for index,value in [(3,1000),(4,1000),(6,2)]:
 bad=list(row);bad[index]=value;assert not accepted([bad])
directory=list(row);directory[5]=stat.S_IFDIR|0o700;directory[6]=2;assert accepted([directory]);directory[5]=stat.S_IFDIR|0o777;assert not accepted([directory]);directory[5]=stat.S_IFDIR|0o700;directory[3]=1000;assert not accepted([directory])
link=list(row);link[5]=stat.S_IFLNK|0o777;assert accepted([link]);link[6]=2;assert not accepted([link]);badroot=list(root);badroot[4]=stat.S_IFDIR|0o755;assert not accepted([row],badroot)
flags=[n.value for n in nodes if isinstance(n,ast.Dict) for k,n in zip(n.keys,n.values) if isinstance(k,ast.Constant) and k.value=='partialLinkClosureQualified' and isinstance(n,ast.Constant)];assert flags and all(v is False for v in flags)
print(json.dumps({'ownerHardlinkAndDirectoryNegatives':7,'partialLinkQualifiedAlwaysFalse':True}))
`);assert.deepEqual(r,{ownerHardlinkAndDirectoryNegatives:7,partialLinkQualifiedAlwaysFalse:true});});
test('unknown census/socket prevents ready; held namespace identity and own FD closure remain explicit',()=>{
 const r=run(String.raw`
import ast,json,sys
x=json.load(sys.stdin);f=next(n for n in ast.parse(x['source']).body if isinstance(n,ast.FunctionDef) and n.name=='main');a=next(n for n in f.body if isinstance(n,ast.Assign) and any(isinstance(z,ast.Name) and z.id=='proc_clean' for z in n.targets));expr=compile(ast.Expression(a.value),'actual-clean-gate','eval');clean={'readIncompletePIDs':[],'relatedProcesses':[],'allDescendants':[],'unitCgroupOtherProcesses':[],'workspaceRelatedProcesses':[],'ack':{'counts':{'runs':0,'deliveries':0,'logs':0}}}
def check(first=clean,second=clean,sockets=[]):return eval(expr,{'first':first,'second':second,'sockets_second':sockets})
assert check()
for field in ['readIncompletePIDs','relatedProcesses','allDescendants','unitCgroupOtherProcesses','workspaceRelatedProcesses']:
 bad=json.loads(json.dumps(clean));bad[field]=[42];assert not check(bad)
bad=json.loads(json.dumps(clean));bad['ack']['counts']['runs']=1;assert not check(second=bad);assert not check(sockets=[{'inode':'1'}]);print(json.dumps({'unknownRelatedAckSocketNegatives':7,'closedCleanPositive':True}))
`);assert.deepEqual(r,{unknownRelatedAckSocketNegatives:7,closedCleanPositive:true});assert.ok(source.indexOf("namespace_identity=c['ident'](os.fstat(outer))")>source.indexOf('outer=oc[-1][0]'));assert.ok(source.indexOf("c['close_chain'](chain)")<source.indexOf("second=n['census']()"));assert.ok(source.includes("'namespaceIdentity':namespace_identity"));
});
test('caller binds real node identity and ACK before/after, error diagnostics stay private',()=>{
 assert.ok(caller.includes('nodeIdentity:nodeIdentity(p.node)'));assert.ok(caller.includes('nodeACK:p.observations.nativeSource.nodeACK'));assert.ok(caller.includes('actual.nativeScans.every(s=>same(nodeIdentity(s.node),pinned.nodeIdentity)&&same(s.ack,pinned.nodeACK))'));assert.ok(caller.includes('status:r.status,signal:r.signal'));assert.ok(caller.includes('stdout:r.stdout'));assert.ok(caller.includes("open(path,'wx',0o600)"));assert.ok(caller.includes('rawErrorExported:false'));assert.ok(caller.includes('q.actualFrozenArtifact!==true'));assert.ok(!source.includes("c['main']"));
 const r=spawnSync('python',['-c','import ast,sys;v=sys.stdin.read();ast.parse(v);compile(v,"actual-reconciliation-root","exec")'],{input:source,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
