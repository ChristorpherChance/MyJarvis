"""One new AST group for14/sink/two bridge fields and fourth-probe unknown; no Linux."""
import ast
import base64
import copy
from contextlib import contextmanager
import errno
import hashlib
import json
from pathlib import Path
import re
import stat
from types import SimpleNamespace
import unittest

RAW = Path(__file__).with_name('factory-single-entry-owned-scope-observer-r33-r3.py').read_bytes()
TREE = ast.parse(RAW)
CONSTANTS = {'BASE','PROTOCOL','CONTROL','WORK','RAW_NAMES','FIXED_SOURCES','H','N','BOOT','IDENTITY_KEYS','SELECTED_SOURCES'}
NODES = [n for n in TREE.body if isinstance(n,ast.FunctionDef) or isinstance(n,ast.Assign)
         and any(isinstance(t,ast.Name) and t.id in CONSTANTS for t in n.targets)]


class ForbiddenOS:
    def __getattr__(self,key):raise AssertionError('Unexpected OS access: '+key)


def definitions():
    s={'base64':base64,'json':json,'hashlib':hashlib,'re':re,'stat':stat,'contextmanager':contextmanager,
       'Path':Path,'errno':errno,'os':ForbiddenOS(),'sys':SimpleNamespace(platform='controlled-only')}
    exec(compile(ast.Module(body=NODES,type_ignores=[]),'<actual-r3-readonly-definitions>','exec'),s)
    return s


class R3ObserverTests(unittest.TestCase):
    def test_fourteen_source_bound_sink_capability_fields_and_fourth_probe_failure(self):
        s=definitions()
        self.assertEqual(len(s['RAW_NAMES']),14)
        self.assertFalse(s['observe_owned_scope_r33_r3']()['runtimeIOPerformed'])
        nonce='a'*32;unit='jarvis-single-entry-method-r33-r3-'+nonce+'.service';group='/system.slice/'+unit
        boot='11111111-1111-1111-1111-111111111111'
        def root(pid):return {'pid':pid,'ppid':1,'startTicks':str(pid),'boot':boot,'procDevice':160,'procInode':1000+pid,
                              'uid':0,'gid':0,'unit':unit,'controlGroup':group,'invocationId':'b'*32}
        p={'nonce':nonce,'owner':root(111),'fixture':{'pid':112},'child':{'pid':113},'stopPost':root(114),
           'activationSHA256':'4'*64,'onceSHA256':'5'*64,'sourceExpected':{**s['FIXED_SOURCES'],'ownerSHA256':'1'*64},'invocationId':'b'*32}
        initial=[1,2,0,0,stat.S_IFREG|0o600,1,0,1700000000000000001,1700000000000000002]
        path=s['BASE']+'/'+nonce+'/work/owner.stderr.raw'
        proof={'schemaVersion':1,'kind':'r33-single-entry-method-root-stderr-sink-proof-r3','nonce':nonce,'phase':'native',
               'sourceProtocol':s['PROTOCOL'],'unit':unit,'ownerSHA256':'1'*64,'fixtureSHA256':s['FIXED_SOURCES']['fixtureSHA256'],
               'generatedSHA256':s['FIXED_SOURCES']['generatedSHA256'],'activationSHA256':'4'*64,'onceSHA256':'5'*64,
               'stderrPath':path,'submittedStandardError':'append:'+path,'initialIdentity':initial,
               'initialIdentitySHA256':s['digest'](s['canonical'](initial))}
        raw=json.dumps(proof,separators=(',',':')).encode();p['stderrSinkProofSHA256']=s['digest'](raw)
        empty={'base64':'','sha256':s['digest'](b''),'bytes':0,'metadata':initial}
        rows={'stderr-sink-proof.json':{'base64':base64.b64encode(raw).decode(),'sha256':s['digest'](raw),'bytes':len(raw)},
              'work/owner.stderr.raw':empty}
        p['expectedRawFiles']={'work/owner.stderr.raw':{'sha256':empty['sha256'],'bytes':0}}
        unitproof={'stderrSinkProofSHA256':p['stderrSinkProofSHA256'],
                   'configuration':{'standardOutput':'null','standardError':'append','standardErrorFile':path}}
        sink=s['verify_r3_stderr_binding'](p,rows,unitproof)
        def snapshot(i):
            return {'capget':{'effective':226,'permitted':226,'inheritable':i,'highWords':[0,0,0]},'capgetReturn':0,'capgetErrno':0,
                    'status':dict(zip(['CapEff','CapPrm','CapInh','CapAmb'],[format(v,'016x') for v in [226,226,i,i]])),
                    'realEffectiveSavedUID':[0,0,0],'realEffectiveSavedGID':[0,0,0],'noNewPrivileges':1}
        bridge={'kind':'r33-owner-self-capability-bridge-v3','abi':{'architecture':'x86_64','byteOrder':'little','version':537396514,
                'headerBytes':8,'dataBytes':24,'capgetSyscall':125,'capsetSyscall':126,'pid':0},'pre':snapshot(128),
                'request':{'effective':226,'permitted':226,'inheritable':0,'highWords':[0,0,0],'pid':0},
                'capsetReturn':0,'capsetErrno':0,'post':snapshot(0),'verified':True}
        profile={'capabilityBridge':bridge,'stderrSinkBinding':{'proofSHA256':p['stderrSinkProofSHA256'],
                 'initialIdentitySHA256':sink['initialIdentitySHA256'],'fd':2,'fdIdentityFirstSix':initial[:6],
                 'appendMode':True,'accessMode':'write-only','stderrPathSHA256':s['digest'](path.encode())},
                 'capabilities':bridge['post']['status'],'realEffectiveSavedUID':[0,0,0],'realEffectiveSavedGID':[0,0,0],
                 'noNewPrivileges':1,'rootCapabilitiesAreZero':False}
        self.assertTrue(s['verify_r3_root_transition'](profile,sink))
        for change in ['old62','virtualAmbient','postAmbient','errno','highWord','fdInode']:
            bad=copy.deepcopy(profile)
            if change=='old62':bad['capabilityBridge']['pre']['capget']['permitted']=98
            if change=='virtualAmbient':bad['capabilityBridge']['pre']['capget']['ambient']=128
            if change=='postAmbient':bad['capabilityBridge']['post']['status']['CapAmb']=format(128,'016x')
            if change=='errno':bad['capabilityBridge']['capsetErrno']=13
            if change=='highWord':bad['capabilityBridge']['post']['capget']['highWords'][0]=1
            if change=='fdInode':bad['stderrSinkBinding']['fdIdentityFirstSix'][1]+=1
            with self.subTest(change=change),self.assertRaises(RuntimeError):s['verify_r3_root_transition'](bad,sink)
        with self.assertRaises(RuntimeError):s['verify_r3_stderr_binding'](p,rows,{'stderrSinkProofSHA256':'0'*64})
        calls=[]
        def probe(identity,role,*_):
            calls.append((identity['pid'],role))
            if role=='stop-post':raise RuntimeError('R33_OWNED_ACTOR_IDENTITY_CHANGED')
            return {'role':role,'pid':identity['pid'],'present':False,'complete':True}
        s['Path']=lambda _:SimpleNamespace(read_text=lambda:boot)
        s['actor_probe']=probe;s['unit_frame']=lambda *_:{'complete':True,'currentStopped':True}
        s['cgroup_frame']=lambda *_:{'complete':True,'members':[]};s['namespace_sockets']=lambda *_:{'complete':True,'count':0}
        frame=s['physical_frame'](p)
        self.assertEqual(calls,[(111,'owner'),(112,'fixture'),(113,'child'),(114,'stop-post')])
        self.assertIsNone(frame['actors'][-1]['present'])
        self.assertFalse(frame['actors'][-1]['complete'])
        self.assertEqual(frame['actors'][-1]['errorCode'],'R33_OWNED_ACTOR_IDENTITY_CHANGED')


if __name__=='__main__':unittest.main(verbosity=2)
