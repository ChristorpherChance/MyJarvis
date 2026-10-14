"""One focused actual producer/config-consumer group; local definitions only, no Root."""
import ast
import base64
import copy
import hashlib
import json
from pathlib import Path
import re
import stat
import subprocess
import unittest

PARENT=Path('artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-host-source-r3-93f7bf40ff76917891efb0ac0ae876b4102d889a4a0239a66aa9b7cc6d7991e3.py')
OBSERVER=Path('scripts/factory-single-entry-owned-scope-observer-r33-r3.py')
NODE=Path('scripts/verify-factory-single-entry-owned-scope-r33-r3.mjs')


class SubmittedStderrInterfaceTests(unittest.TestCase):
    def test_actual_parent_configuration_passes_three_real_destination_predicates_and_wrong_missing_reject(self):
        raw=PARENT.read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),'93f7bf40ff76917891efb0ac0ae876b4102d889a4a0239a66aa9b7cc6d7991e3')
        tree=ast.parse(raw)
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'need','sha','argv_of','verify_unit'}]
        nonce='a'*32;root='/var/lib/jarvis-single-entry-bound-method-r33-r3/'+nonce
        cmd=['/usr/bin/python3','-I',root+'/control/owner.py','--run',nonce]
        stop=cmd[:3]+['--stopped',nonce]
        env={'hashlib':hashlib,'json':json,'cmd':cmd,'stop':stop,'stderr_sink':root+'/work/owner.stderr.raw'}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-parent-verify-unit-only>','exec'),env)
        def argv(a):return '{ path=/usr/bin/python3 ; argv[]='+' '.join(a)+' ; ignore_errors=no }'
        props={'CapabilityBoundingSet':'cap_dac_override cap_kill cap_setgid cap_setuid','User':'root','Group':'root',
               'NoNewPrivileges':'yes','AmbientCapabilities':'cap_setuid','PrivateNetwork':'yes','ProtectControlGroups':'yes',
               'RuntimeMaxUSec':'80s','TimeoutStopUSec':'10s','KillMode':'control-group','KillSignal':'SIGKILL','Restart':'no',
               'ExecStart':argv(cmd),'ExecStopPost':argv(stop),'StandardOutput':'null','StandardError':'append'}
        config=env['verify_unit'](props)
        self.assertNotIn('standardErrorFile',config)
        self.assertEqual(config['submittedStandardError'],'append:'+env['stderr_sink'])
        self.assertEqual(config['stderrDestinationEvidence'],'source-command-plus-inherited-fd2-object')
        ot=ast.parse(OBSERVER.read_bytes())
        constants={'BASE','PROTOCOL'}
        pure=[n for n in ot.body if isinstance(n,ast.FunctionDef) and n.name in {'need','digest','canonical','same_json','raw_json','verify_r3_stderr_binding'}
              or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
        local={'base64':base64,'hashlib':hashlib,'json':json,'re':re,'stat':stat}
        exec(compile(ast.Module(body=pure,type_ignores=[]),'<actual-observer-sink-definitions>','exec'),local)
        whole=next(n for n in ot.body if isinstance(n,ast.FunctionDef) and n.name=='verify_raw_chain')
        assignment=next(n for n in whole.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='expected_config' for t in n.targets))
        loop=next(n for n in whole.body if isinstance(n,ast.For) and isinstance(n.iter,ast.Call) and isinstance(n.iter.func,ast.Attribute)
                  and isinstance(n.iter.func.value,ast.Name) and n.iter.func.value.id=='expected_config')
        profile_gate=compile(ast.Module(body=[assignment,loop],type_ignores=[]),'<actual-verify-raw-chain-config-loop>','exec')
        initial=[1,2,0,0,stat.S_IFREG|0o600,1,0,1700000000000000001,1700000000000000002]
        unit='jarvis-single-entry-method-r33-r3-'+nonce+'.service'
        p={'nonce':nonce,'owner':{'unit':unit},'sourceExpected':{'ownerSHA256':'1'*64,'fixtureSHA256':'2'*64,'generatedSHA256':'3'*64},
           'activationSHA256':'4'*64,'onceSHA256':'5'*64}
        sink={'schemaVersion':1,'kind':'r33-single-entry-method-root-stderr-sink-proof-r3','sourceProtocol':local['PROTOCOL'],
              'nonce':nonce,'phase':'native','unit':unit,'ownerSHA256':'1'*64,'fixtureSHA256':'2'*64,'generatedSHA256':'3'*64,
              'activationSHA256':'4'*64,'onceSHA256':'5'*64,'stderrPath':env['stderr_sink'],'submittedStandardError':'append:'+env['stderr_sink'],
              'initialIdentity':initial,'initialIdentitySHA256':local['digest'](local['canonical'](initial))}
        source=json.dumps(sink,separators=(',',':')).encode();p['stderrSinkProofSHA256']=local['digest'](source)
        empty=local['digest'](b'');p['expectedRawFiles']={'work/owner.stderr.raw':{'sha256':empty,'bytes':0}}
        rows={'stderr-sink-proof.json':{'base64':base64.b64encode(source).decode(),'sha256':local['digest'](source),'bytes':len(source)},
              'work/owner.stderr.raw':{'base64':'','sha256':empty,'bytes':0,'metadata':initial}}
        variants=[config]
        for key in ['submittedStandardError','stderrDestinationEvidence']:
            bad=copy.deepcopy(config);bad[key]='wrong';variants.append(bad)
            missing=copy.deepcopy(config);del missing[key];variants.append(missing)
        for i,cfg in enumerate(variants):
            with self.subTest(variant=i):
                if i==0:
                    exec(profile_gate,{**local,'p':p,'config':cfg})
                    self.assertTrue(local['verify_r3_stderr_binding'](p,rows,{'configuration':cfg,'stderrSinkProofSHA256':p['stderrSinkProofSHA256']})['identityBound'])
                else:
                    with self.assertRaises(RuntimeError):exec(profile_gate,{**local,'p':p,'config':cfg})
                    with self.assertRaises(RuntimeError):local['verify_r3_stderr_binding'](p,rows,{'configuration':cfg,'stderrSinkProofSHA256':p['stderrSinkProofSHA256']})
        # Compile the exact configuration subexpression from the actual Node raw
        # oracle, rather than mirror its predicates or run a generated Root program.
        script="""import vm from 'node:vm';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
        const v=JSON.parse(readFileSync(0,'utf8')),s=v.source,start=s.indexOf('config?.rootUID === 0'),end=s.indexOf('&& unitProof.stderrSinkProofSHA256',start);
        if(start<0||end<start)throw Error('CONFIG_ANCHOR_CHANGED');const expression=s.slice(start,end).trim();
        const sha=b=>createHash('sha256').update(b).digest('hex'),check=config=>vm.runInNewContext('Boolean('+expression+')',{config,sha,root:v.root,runCommand:v.cmd,stopCommand:v.stop});
        const results=v.variants.map(check);process.stdout.write(JSON.stringify(results));"""
        payload={'source':NODE.read_text(encoding='utf-8'),'root':root,'cmd':cmd,'stop':stop,'variants':variants}
        result=subprocess.run(['node','--input-type=module','-e',script],input=json.dumps(payload),capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout),[True,False,False,False,False])


if __name__=='__main__':unittest.main(verbosity=2)
