"""One local AST inspect policy group using saved CLI bytes; no OS commands."""
import ast,base64,hashlib,json,re
from pathlib import Path
ROOT=Path('D:/AI/workspaces/MyJevis')
SOURCE='scripts/factory-pg4-failed-scope-observer-r33-main602-proof-r5-profile-r4.py'
WIRE='.jarvis-dev/maintenance/r33-pg4-proof-r5-failed-scope-recovery-private-1791964683307-e3e6e284-1b33-4c37-975a-5e016a1ba589.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def ref(p):
    b=(ROOT/p).read_bytes();return {'path':p,'sha256':sha(b),'bytes':len(b)}
raw=(ROOT/WIRE).read_bytes();assert sha(raw)=='25818bc6bacb8d4ac818cbaf2c7fb34bbadc6695fb8b21f5400e1a74aa2bba4e' and len(raw)==6576457
wire=json.loads(raw);host_raw=base64.b64decode(wire['stdoutBase64'],validate=True);host=json.loads(host_raw)
assert sha(host_raw)=='14b53c204046696f587d07fde3894a4eefed25496fa16c8099bd03e106438ece' and len(host['cliCaptures'])==2
packet=host['cliCaptures'][1];actual_out=base64.b64decode(packet['stdoutBase64'],validate=True);actual_err=base64.b64decode(packet['stderrBase64'],validate=True)
assert packet['status']==1 and actual_out==b'[]\n' and len(actual_err)==124 and sha(actual_err)=='0ecb9e8b59157321cb4d3611e201e49c2290e74ad1987f05d2a9e274d6900b38'
target='jarvis-pg4-qa-r33-main602-proof-r5-'+host['attempt']+'-postgres'
tree=ast.parse((ROOT/SOURCE).read_bytes());functions={x.name:x for x in tree.body if isinstance(x,ast.FunctionDef)}
subset=ast.Module(body=[functions[x] for x in ('need','decode','inspect_one')],type_ignores=[])
namespace={'json':json,'re':re};exec(compile(subset,'<local-only-r4-mocked-inspect-policy>','exec'),namespace)
cases=[];calls=0
def case(name,status,stdout,stderr,target_value=target,expected_error=None):
    global calls
    namespace['command']=lambda args:({'status':status},stdout,stderr)
    calls+=1
    try:result=namespace['inspect_one']('container',target_value)
    except RuntimeError as e:
        assert str(e)==expected_error;cases.append({'case':name,'passed':True,'errorCode':str(e)})
    else:
        assert expected_error is None and result is None;cases.append({'case':name,'passed':True})
prefix=b'Error response from daemon: ';assert actual_err.startswith(prefix)
bare=actual_err[len(prefix):]
case('actual saved status1 empty array exact daemon-prefix absent response',packet['status'],actual_out,actual_err)
case('existing unprefixed exact target form remains accepted',1,actual_out,bare)
case('existing Error prefix exact target form remains accepted',1,actual_out,b'Error: '+bare)
case('daemon prefix exact No such object form accepted',1,actual_out,actual_err.replace(b'No such container:',b'No such object:',1))
case('wrong escaped exact target refuses',1,actual_out,actual_err,target+'-different','PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
case('unexpected prefix refuses',1,actual_out,b'Unexpected: '+actual_err,expected_error='PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
case('permission error refuses',1,actual_out,b'Error response from daemon: permission denied\n',expected_error='PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
case('different nonzero exit refuses',2,actual_out,actual_err,expected_error='PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
case('zero exit with empty inspect does not become absent',0,actual_out,actual_err,expected_error='PG4_RF_CURRENT_INSPECT_INCOMPLETE')
case('unexpected nonempty stdout refuses',1,b'[{}]\n',actual_err,expected_error='PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
case('trailing additional message refuses',1,actual_out,actual_err+b'Additional message\n',expected_error='PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
case('target suffix substring does not qualify',1,actual_out,actual_err.rstrip()+b'-suffix\n',expected_error='PG4_RF_RESOURCE_ABSENCE_UNKNOWN')
assert (ROOT/WIRE).read_bytes()==raw
captures=[]
for i,p in enumerate(host['cliCaptures']):
    out=base64.b64decode(p['stdoutBase64'],validate=True);err=base64.b64decode(p['stderrBase64'],validate=True)
    captures.append({'index':i,'status':p['status'],'stdoutSHA256':sha(out),'stdoutBytes':len(out),'stderrSHA256':sha(err),'stderrBytes':len(err),'commandSHA256Recorded':'commandSHA256' in p})
print(json.dumps({'schemaVersion':1,'kind':'r33-pg4-failed-r5-profile-r4-container-absence-prefix-pure-policy-controlled-group','source':ref(SOURCE),'testProgram':ref('scripts/test-factory-pg4-failed-r5-container-prefix-profile-r4-pure-policy.py'),'originalRootWire':ref(WIRE),'originalHostStdoutSHA256':sha(host_raw),'originalHostStdoutBytes':len(host_raw),'savedTwoCLIPacketSafeRefs':captures,'role':'postgres','provenExactTargetSHA256':sha(target.encode()),'provenExactTargetBytes':len(target.encode()),'groupsExecuted':1,'groupsPassed':1,'mockedInspectPolicyInvocations':calls,'cases':cases,'actualSavedReplyPositivePassed':True,'originalInputBytesUnchanged':True,'ASTFunctionsExecuted':['need','decode','inspect_one'],'mockedCommandFunctionOnly':True,'OSCommandsExecuted':0,'wholeEntryOrQualificationExecuted':False,'generatedPythonExecuted':False,'RootCalls':0,'remoteOperationsPerformed':False,'candidateOrFrameworkExecuted':False,'oldMount23Runner4Unit5TestsRerun':False,'rawStderrInspectEnvironmentArgvBase64Printed':False},ensure_ascii=False,separators=(',',':')))
