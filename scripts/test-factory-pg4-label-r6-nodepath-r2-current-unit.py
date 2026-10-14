import ast,hashlib,json,unittest
from pathlib import Path
ROOT=Path('D:/AI/workspaces/MyJevis')
SOURCE=ROOT/'scripts/factory-pg4-qa-current-scope-observer-r33-main602-label-r6-nodepath-r2.py'
raw=SOURCE.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='809f0e143bee0bde79013cc3c757fbaa036e4b35d28fe9d597b0443472147eb5'
tree=ast.parse(raw.decode('utf8'));selected=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ('unit_frame','argv_of')]
assert len(selected)==2
def need(value,code):
    if not value:raise RuntimeError(code)
unit='jarvis-pg4-qa-r33-main602-label-r6-'+'1'*32+'.service'
context={'unitBinding':{'unit':unit,'invocationId':'2'*32},'namespace':'/var/lib/jarvis-development/101/r33-pg4-qa-startup-main602-label-r6/'+'1'*32,'attempt':'1'*32}
scope={};calls=[]
def command(args):
    calls.append(args)
    assert args[:3]==['/usr/bin/systemctl','show',unit]
    assert len(args)==21
    return {'status':0},('\n'.join(k+'='+v for k,v in scope.items())+'\n').encode(),None
namespace={'need':need,'command':command}
exec(compile(ast.Module(body=selected,type_ignores=[]),'controlled-current-unit-only','exec'),namespace)
fields=('Id','InvocationID','LoadState','ActiveState','SubState','MainPID','ControlGroup','RuntimeMaxUSec','TimeoutStopUSec','KillMode','Restart','NoNewPrivileges','User','Group','ExecStart','ExecStopPost','PrivateTmp','UMask')
notfound={k:'' for k in fields if k not in ('ExecStart','ExecStopPost')}
notfound.update(Id=unit,LoadState='not-found',ActiveState='inactive',SubState='dead',MainPID='0')
loaded={k:'' for k in fields};loaded.update(Id=unit,InvocationID='2'*32,LoadState='loaded',ActiveState='inactive',SubState='dead',MainPID='0',ControlGroup='/system.slice/'+unit,RuntimeMaxUSec='15min',TimeoutStopUSec='2min',KillMode='control-group',Restart='no',NoNewPrivileges='yes',User='root',Group='root',PrivateTmp='yes',UMask='0077')
for key,action in [('ExecStart','--run'),('ExecStopPost','--stop')]:loaded[key]='{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 -I '+context['namespace']+'/control/worker.py '+action+' '+context['attempt']+' ; ignore_errors=no }'
class UnitScopeCompatibility(unittest.TestCase):
    def test_observed_notfound_shape_and_strict_loaded_binding(self):
        global scope
        scope=dict(notfound);result=namespace['unit_frame'](context)
        self.assertTrue(result['complete'] and result['currentStopped'])
        self.assertNotIn('ExecStart',result['properties']);self.assertNotIn('ExecStopPost',result['properties'])
        scope=dict(loaded);self.assertTrue(namespace['unit_frame'](context)['complete'])
        bads=[{**notfound,'ExecStart':''},{k:v for k,v in notfound.items() if k!='RuntimeMaxUSec'},{**notfound,'InvocationID':'3'*32},{**notfound,'SubState':'running'},{**loaded,'InvocationID':'3'*32},{k:v for k,v in loaded.items() if k!='ExecStopPost'}]
        for value in bads:
            scope=value
            with self.assertRaises(RuntimeError):namespace['unit_frame'](context)
        self.assertEqual(len(calls),8)
if __name__=='__main__':unittest.main()
