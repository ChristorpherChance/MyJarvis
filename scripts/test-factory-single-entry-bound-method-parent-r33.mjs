/** Only the new caller/owner boundary. All dispatch, journal and receipts are memory DI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {startSingleEntryMethodR33,singleEntryMethodR33HostProgram,singleEntryMethodR33Scope as S,singleEntryMethodR33Journal as JP} from './start-factory-single-entry-bound-method-r33.mjs';
const H=b=>createHash('sha256').update(b).digest('hex');
const owner=readFileSync(S.owner.path),self=readFileSync(S.starterPath);
const program=singleEntryMethodR33HostProgram(owner);
const python='C:/Users/Admin/AppData/Local/Programs/Python/Python312/python.exe';

test('default null qualification rejects before local/root/journal hooks',async()=>{
 let calls=0;const forbidden=()=>{calls++;throw Error('IO_FORBIDDEN')};
 for(const activation of [null,{review:null}]){
  const v=await startSingleEntryMethodR33({action:'start',activation},{readLocal:forbidden,readRoot:forbidden,writeWX:forbidden,lock:forbidden});
  assert.equal(v.ready,false);assert.equal(v.journalCreated,false);
 }
 assert.equal(calls,0);
 assert.equal(Object.isFrozen(S.owner),true);assert.equal(Object.isFrozen(S.workReports),true);
});

test('actual owner pin and generated trusted host parse without executing either body',()=>{
 assert.equal(H(owner),S.owner.sha256);
 assert.throws(()=>singleEntryMethodR33HostProgram(Buffer.from('changed')),/HOST_OWNER_SOURCE_REQUIRED/);
 const p=spawnSync(python,['-I','-c',"import ast,json,sys;p=json.load(sys.stdin);a=ast.parse(p['owner']);b=ast.parse(p['host']);assert not any(isinstance(n,(ast.Import,ast.ImportFrom)) and ('fixture' in ast.get_source_segment(p['owner'],n)) for n in a.body);print(json.dumps({'ownerParsed':True,'hostParsed':True,'bodiesExecuted':False}))"],{input:JSON.stringify({owner:owner.toString(),host:program}),encoding:'utf8',windowsHide:true});
 assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).bodiesExecuted,false);
});

test('production export memory flow keeps durable intent, lost reply and same-nonce check; no real writes',async()=>{
 const reviewPath='artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-1000000000000-00000000-0000-0000-0000-000000000000.json';
 const review=Buffer.from(JSON.stringify({kind:'r33-single-entry-bound-method-parent-independent-local-review',ownerSHA256:S.owner.sha256,starterSHA256:H(self),hostProgramSHA256:H(program),fixtureSHA256:S.fixture.sha256,staticPreparationReady:true,remainingP0P1:0,remoteOperationsPerformed:false,actualMethodIndependentlyQualified:false}));
 const activation={kind:'r33-single-entry-method-reviewed-activation',schemaVersion:1,phase:'native',nonce:'1'.repeat(32),starterSHA256:H(self),review:{path:reviewPath,sha256:H(review)},remoteExecutionAuthorized:true};
 let journal,rootCalls=0;const trace=[],memory=new Map([[reviewPath,review]]);
 for(const item of [S.owner,S.fixture,S.generated,S.buildStatic,S.generator,S.pureModule,S.fixtureReview,S.generatorReview,S.transport])memory.set(item.path,readFileSync(item.path));memory.set(S.starterPath,self);
 const deps={
  readLocal:async path=>{if(path===JP){if(!journal){const e=Error('missing');e.code='ENOENT';throw e}return journal}return memory.get(path)},
  writeWX:async(path,raw)=>{assert.equal(path,JP);assert.equal(journal,undefined);trace.push('wx');journal=Buffer.from(raw)},
  save:async q=>{trace.push('durable');journal=Buffer.from(JSON.stringify(q)+'\n')},lock:async()=>({memory:true}),unlock:async()=>{},now:()=>1,
  receipt:async()=>({path:'memory-only',sha256:'a'.repeat(64)}),
  readRoot:async p=>{rootCalls++;trace.push(p.action);if(p.action==='start')assert.equal(trace.at(-2),'durable');assert.equal(p.phase,'native');assert.equal(p.scope.rootUID,0);
   if(p.action==='start'){assert.equal(Object.keys(p.files).length,5);assert.equal(H(Buffer.from(p.files['generated.py'].base64,'base64')),S.generated.sha256);throw Error('CONTROLLED_LOST_REPLY')}
   assert.deepEqual(p.files,{});const v={schemaVersion:1,kind:'r33-single-entry-bound-method-parent-observation',nonce:p.nonce,phase:'native',sourceProtocol:S.sourceProtocol,ownerSHA256:S.owner.sha256,fixtureSHA256:S.fixture.sha256,generatedSHA256:S.generated.sha256,buildStaticMappingSHA256:S.buildStatic.sha256,activationSHA256:p.activationSHA256,onceSHA256:p.onceSHA256,dispatchSubmitted:true,readOnly:true,controlsStable:true,unitConfigVerified:true,unitProofSHA256:'b'.repeat(64),unit:{Id:'jarvis-single-entry-method-r33-'+p.nonce+'.service',ActiveState:'active'},owner:null,ownerPublicMetadataIsProjection:true,status:'running',methodSubsetProducerPassed:false,actualMethodIndependentlyQualified:false,currentScopeCleanupIndependentlyVerified:false,fullProtectionQualified:false,productCodeExecuted:false,modelsInvoked:false,rawReports:{private:'not exported'}};return{raw:Buffer.from(JSON.stringify(v)),transportEvidence:{path:'memory-only-raw',sha256:'c'.repeat(64)}}
  }};
 await assert.rejects(startSingleEntryMethodR33({action:'start',activation},deps),/CONTROLLED_LOST_REPLY/);
 assert.equal(JSON.parse(journal).startUncertain,true);assert.equal(rootCalls,1);
 await assert.rejects(startSingleEntryMethodR33({action:'start',activation},deps),/PRIOR_INTENT_ONLY_CHECK/);assert.equal(rootCalls,1);
 // Same intent is checked, without another root start or a generated nonce.
 const v=await startSingleEntryMethodR33({action:'check',activation},deps);
 assert.equal(rootCalls,2);assert.equal(v.readOnly,true);assert.equal(Object.hasOwn(v,'rawReports'),false);
 assert.equal(JSON.parse(journal).dispatched,true);assert.equal(JSON.parse(journal).startUncertain,false);
 const old=memory.get(S.fixture.path);memory.set(S.fixture.path,Buffer.from('changed'));
 await assert.rejects(startSingleEntryMethodR33({action:'check',activation},deps),/LOCAL_SOURCE_CHANGED/);assert.equal(rootCalls,2);memory.set(S.fixture.path,old);
});

test('actual assembled unit functions reject extra command, wrong cap and an extended work bound',()=>{
 const code=String.raw`import ast,json,sys
p=json.load(sys.stdin);source=p['host'];tree=ast.parse(source);nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['argv_of','verify_unit']]
def need(v,c):
 if not v:raise RuntimeError(c)
scope={'need':need,'cmd':['/usr/bin/python3','-I','fixed-owner.py','--run','fixed'],'stop':['/usr/bin/python3','-I','fixed-owner.py','--stopped','fixed'],'sha':lambda x:'0'*64,'json':json};exec(compile(ast.Module(body=nodes,type_ignores=[]),'controlled-unit-functions','exec'),scope)
def command(argv):return '{ path=/usr/bin/python3 ; argv[]='+ ' '.join(argv)+' ; ignore_errors=no ; }'
v={'User':'root','Group':'root','NoNewPrivileges':'yes','CapabilityBoundingSet':'cap_setuid cap_kill cap_dac_override cap_setgid','AmbientCapabilities':'','PrivateNetwork':'yes','ProtectControlGroups':'yes','RuntimeMaxUSec':'80s','TimeoutStopUSec':'10s','KillMode':'control-group','KillSignal':'SIGKILL','Restart':'no','ExecStart':command(scope['cmd']),'ExecStopPost':command(scope['stop'])}
assert scope['verify_unit'](v)['rootCapabilityMask']==226
for field,value in [('ExecStopPost',v['ExecStopPost']+' '+v['ExecStopPost']),('CapabilityBoundingSet',v['CapabilityBoundingSet']+' cap_sys_ptrace'),('RuntimeMaxUSec','90s')]:
 try:scope['verify_unit']({**v,field:value})
 except RuntimeError:pass
 else:raise AssertionError('unsafe configuration accepted')
print(json.dumps({'controlledConfigurations':4,'actualSystemdExecuted':False}))`;
 const p=spawnSync(python,['-I','-c',code],{input:JSON.stringify({host:program}),encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).controlledConfigurations,4);
});

test('new root glue admits source only after binding and keeps a read error before failed close',()=>{
 const code=String.raw`import ast,errno,json,sys
from contextlib import contextmanager
from types import SimpleNamespace
source=json.load(sys.stdin)['owner'];tree=ast.parse(source);nodes={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
main=nodes['main'];calls=sorted((n for n in ast.walk(main) if isinstance(n,ast.Call)),key=lambda n:n.lineno)
spawn=[n for n in calls if isinstance(n.func,ast.Attribute) and n.func.attr=='Popen'];assert len(spawn)==1
kwargs={n.arg:n.value for n in spawn[0].keywords};assert isinstance(kwargs['stdin'],ast.Attribute) and kwargs['stdin'].attr=='PIPE'
assert ast.literal_eval(kwargs['user'])==ast.literal_eval(kwargs['group'])==1000 and ast.literal_eval(kwargs['extra_groups'])==[]
bind=[n.lineno for n in calls if isinstance(n.func,ast.Name) and n.func.id=='bind_fixture'][0]
save=[n.lineno for n in calls if isinstance(n.func,ast.Name) and n.func.id=='save_work' and any(isinstance(a,ast.Constant) and a.value=='fixture-process.json' for a in n.args)][0]
admit=[n.lineno for n in calls if isinstance(n.func,ast.Attribute) and n.func.attr=='communicate' and any(k.arg=='input' for k in n.keywords)][0]
assert spawn[0].lineno<bind<save<admit
def failed_close(fd):assert fd==0;raise OSError(errno.EACCES,'controlled close')
scope={'contextmanager':contextmanager,'os':SimpleNamespace(close=failed_close)};exec(compile(ast.Module(body=[nodes['closing_read']],type_ignores=[]),'actual-root-close-glue','exec'),scope)
primary=OSError(errno.ENOENT,'controlled read')
try:
 with scope['closing_read'](0,'fixture-status'):raise primary
except OSError as error:
 assert error is primary and error.errno==errno.ENOENT and error.secondaryCloseErrors[0]['errno']==errno.EACCES
else:raise AssertionError('lost primary')
try:
 with scope['closing_read'](0,'fixture-status'):pass
except OSError as error:assert error.errno==errno.EACCES
else:raise AssertionError('failed close accepted')
record=ast.get_source_segment(source,nodes['fixture_record']);assert 'profile["UID"] == profile["GID"] == [1000, 1000, 1000, 1000]' in record and '"procDirectoryUID": before.st_uid' in record
print(json.dumps({'admissionOrderVerified':True,'closeCombinations':2,'actualChildExecuted':False}))`;
 const p=spawnSync(python,['-I','-c',code],{input:JSON.stringify({owner:owner.toString()}),encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).closeCombinations,2);
});
