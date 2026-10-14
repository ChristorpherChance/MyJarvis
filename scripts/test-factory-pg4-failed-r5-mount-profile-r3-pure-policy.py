"""One new local pure AST policy group. Never imports an operational module."""
import ast,base64,copy,hashlib,json
from pathlib import Path
ROOT=Path('D:/AI/workspaces/MyJevis')
SOURCE='scripts/factory-pg4-failed-scope-observer-r33-main602-proof-r5-profile-r3.py'
INPUTS=[
 {'path':'.jarvis-dev/maintenance/r33-pg4-proof-r5-inspect-capture-original-1791956111272-2e6fee4e-f56c-4f9e-a732-7f0bf9f3a844.json','sha256':'3782b41b438b7c052be6a661d6a1c67fbe3baf0a9a4861b7bfaf0a162d4eddef','bytes':14764},
 {'path':'.jarvis-dev/maintenance/r33-pg4-proof-r5-inspect-capture-original-1791956111355-2a9af425-e246-4136-9a9c-596b0bacad94.json','sha256':'160f8feb4d0dc7e48f1908144d5f457694d97b0541d14eed978ed4429e0ea967','bytes':14764}]
def digest(b):return hashlib.sha256(b).hexdigest()
def ref(p):
    b=(ROOT/p).read_bytes();return {'path':p,'sha256':digest(b),'bytes':len(b)}
saved=[]
for r in INPUTS:
    raw=(ROOT/r['path']).read_bytes();assert digest(raw)==r['sha256'] and len(raw)==r['bytes']
    packet=json.loads(raw);assert packet['status']==0 and packet['complete'] is True
    rows=json.loads(base64.b64decode(packet['stdoutBase64'],validate=True));assert type(rows) is list and len(rows)==1 and type(rows[0]) is dict
    saved.append(rows[0])
first,second=saved;raw=(ROOT/SOURCE).read_bytes();tree=ast.parse(raw)
functions={x.name:x for x in tree.body if isinstance(x,ast.FunctionDef)}
subset=ast.Module(body=[functions[x] for x in ('need','canonical','mount_destination_map','inspect_mount_order_equal','assert_runner')],type_ignores=[])
namespace={'json':json,'RUNNER_ID':'34294fbf42662eac178a67a2362ecdcf8436db6363663c7ddf30483e5939c9b4'}
exec(compile(subset,'<local-only-r3-pure-mount-policy>','exec'),namespace)
assert first['Mounts']!=second['Mounts'] and len(first['Mounts'])>=2
assert all(first[k]==second[k] for k in ('Id','Name','Created','Image','Config','HostConfig','State'))
assert any(isinstance(x,ast.Call) and isinstance(x.func,ast.Name) and x.func.id=='inspect_mount_order_equal' and len(x.args)==2 and all(isinstance(a,ast.Name) and a.id==b for a,b in zip(x.args,('by_name','by_id'))) for x in ast.walk(functions['resource_frame']))
cases=[];calls=0
def runner_case(name,value,expected=None,saved_value=first):
    global calls
    calls+=1
    try:result=namespace['assert_runner'](value,saved_value)
    except RuntimeError as e:
        assert str(e)==expected;cases.append({'case':name,'passed':True,'errorCode':str(e)})
    else:
        assert expected is None and result is True;cases.append({'case':name,'passed':True})
def inspect_case(name,left,right,expected,expected_error=None):
    global calls
    calls+=1
    try:result=namespace['inspect_mount_order_equal'](left,right)
    except RuntimeError as e:
        assert expected_error==str(e);cases.append({'case':name,'passed':True,'errorCode':str(e)})
    else:
        assert expected_error is None and result is expected;cases.append({'case':name,'passed':True})
runner_case('two genuine saved capture complete Mounts objects reordered pass',second)
ordered_current=copy.deepcopy(first);ordered_current['Mounts']=copy.deepcopy(second['Mounts'])
inspect_case('current name and ID frames differing only genuine Mounts order pass',first,ordered_current,True)
changed=copy.deepcopy(first);changed['Mounts'].append(copy.deepcopy(changed['Mounts'][0]));runner_case('duplicate Destination refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts'].pop();runner_case('missing mount refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);extra=copy.deepcopy(changed['Mounts'][0]);extra['Destination']='/r33-pg4-controlled-extra-destination';changed['Mounts'].append(extra);runner_case('additional mount refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts'][0]['Type']='r33-pg4-controlled-field-change';runner_case('one complete mount field change refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);assert type(changed['Mounts'][0]['RW']) is bool;changed['Mounts'][0]['RW']=int(changed['Mounts'][0]['RW']);runner_case('mount boolean versus integer field type change refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts']=tuple(changed['Mounts']);runner_case('non-list Mounts refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts'][0]='r33-pg4-controlled-non-dict';runner_case('non-dict mount refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts'][0]['Destination']='';runner_case('empty Destination refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts'][0]['Destination']=7;runner_case('non-string Destination refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Mounts'][0]['__r3_unexpected_field__']=True;runner_case('additional complete mount field refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);del changed['Mounts'][0]['Type'];runner_case('missing complete mount field refuses',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['Config']['WorkingDir']='r33-pg4-controlled-working-dir';runner_case('complete Config equality remains required',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(first);changed['HostConfig']['ReadonlyRootfs']=not changed['HostConfig']['ReadonlyRootfs'];runner_case('complete HostConfig equality remains required',changed,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
for field,replacement in [('Id','0'*64),('Name','/r33-pg4-controlled-name'),('Created','2026-10-14T00:00:00Z'),('Image','sha256:'+'0'*64)]:
    changed=copy.deepcopy(first);changed[field]=replacement;runner_case('exact '+field+' remains required',changed,'PG4_RF_RUNNER_EXACT_ID_CHANGED')
changed=copy.deepcopy(ordered_current);changed['Mounts'].append(copy.deepcopy(changed['Mounts'][0]));inspect_case('current name ID gate rejects duplicate Destination',first,changed,False,'PG4_RF_RUNNER_CONFIGURATION_CHANGED')
changed=copy.deepcopy(ordered_current);changed['Mounts'][0]['Type']='r33-pg4-controlled-field-change';inspect_case('current name ID gate rejects complete mount field change',first,changed,False)
changed=copy.deepcopy(ordered_current);changed['__r3_unexpected_inspect_field__']=True;inspect_case('current name ID gate retains all other inspect fields',first,changed,False)
changed=copy.deepcopy(ordered_current);del changed['Mounts'];inspect_case('current name ID gate rejects asymmetric Mounts presence',first,changed,False,'PG4_RF_RESOURCE_ID_OR_NAME_CHANGED')
assert all((ROOT/r['path']).stat().st_size==r['bytes'] and digest((ROOT/r['path']).read_bytes())==r['sha256'] for r in INPUTS)
print(json.dumps({'schemaVersion':1,'kind':'r33-pg4-failed-r5-profile-r3-mount-semantic-pure-policy-controlled-group','source':ref(SOURCE),'testProgram':ref('scripts/test-factory-pg4-failed-r5-mount-profile-r3-pure-policy.py'),'originalInputs':INPUTS,'groupsExecuted':1,'groupsPassed':1,'purePolicyInvocations':calls,'cases':cases,'genuineSavedMountsOrderEqual':False,'genuineSavedCompleteMountObjectMapsEqual':True,'genuineSavedConfigHostConfigIdentityAndStateEqual':True,'resourceFrameNewEqualityGateASTVerified':True,'originalInputsInitialFinalHashesEqual':True,'trustedPureASTPolicyExecuted':True,'subjectOperationalFunctionsExecuted':0,'wholeEntryOrQualificationExecuted':False,'generatedPythonExecuted':False,'RootCalls':0,'remoteOperationsPerformed':False,'candidateOrFrameworkExecuted':False,'oldFourRunnerAndFiveUnitCasesRerun':False,'rawInspectOrEnvironmentPrinted':False},ensure_ascii=False,separators=(',',':')))
