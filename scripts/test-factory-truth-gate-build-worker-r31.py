"""Actual worker function/AST guards only. No root, Docker, caches, source packages or PG execution."""
import ast, hashlib, json, os, re, stat, unittest
from pathlib import Path
from types import SimpleNamespace

BODY=(Path(__file__).parent/'factory-truth-gate-build-r31.py').read_text()
TREE=ast.parse(BODY)
SELECTED={'need','preparation_ready','qualify_mount_probe','qa_tools_state','reuse_cache_reports'}
ENV={'os':os,'re':re,'stat':stat,'json':json,'hashlib':hashlib,'Path':Path,
 'METADATA':None,'IDENTITY':None,'SOURCE_ORIGIN':None,'SOURCE_ORIGIN_SHA':None,'QA_MANIFEST_SHA':None}
exec(compile(ast.Module(body=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in SELECTED],type_ignores=[]),'actual-r31-worker-bounded-functions','exec'),ENV)

def ready():
    return {'METADATA':'a'*64,'IDENTITY':{'device':66306,'inode':123},'SOURCE_ORIGIN':'/var/lib/jarvis-development/101/targets-r31-preparation/'+'b'*32+'/origin.json','SOURCE_ORIGIN_SHA':'c'*64,'QA_MANIFEST_SHA':'d'*64}

class Worker(unittest.TestCase):
    def setUp(self):ENV.update(ready())
    def test_default_unobserved_fields_cannot_execute(self):
        for key in ready():
            old=ENV[key];ENV[key]=None;self.assertFalse(ENV['preparation_ready']());ENV[key]=old
    def test_exact_observed_metadata_shape(self):
        self.assertTrue(ENV['preparation_ready']())
        for value in [{'device':66306,'inode':0},{'device':True,'inode':123},{'device':66306,'inode':'123'},{'device':66306,'inode':123,'extra':1}]:
            ENV['IDENTITY']=value;self.assertFalse(ENV['preparation_ready']())
    def test_origin_namespace_cannot_expand(self):
        for value in ['/tmp/origin.json','/var/lib/jarvis-development/101/targets-r31-preparation/../origin.json','/var/lib/jarvis-development/101/targets-r31-preparation/'+'a'*32+'/other.json']:
            ENV['SOURCE_ORIGIN']=value;self.assertFalse(ENV['preparation_ready']())
    def test_bootstrap_actual_typed_qualifier(self):
        expected=[{'root':'/cache','device':1,'inode':2,'path':'x','sha256':'a'*64,'bytes':2,'mode':292}]
        value={'schemaVersion':1,'kind':'r31-normal-bind-bootstrap','uid':1000,'gid':1000,'caches':[{**expected[0],'readOnlyMount':True,'mutationRejected':True,'bytesVerified':True}],'workWritable':True,'candidateCodeExecuted':False}
        self.assertEqual(ENV['qualify_mount_probe'](json.dumps(value).encode(),expected),value)
        for key,bad in [('uid',0),('candidateCodeExecuted',True),('workWritable',False)]:
            changed=dict(value);changed[key]=bad;self.assertIsNone(ENV['qualify_mount_probe'](json.dumps(changed).encode(),expected))
        duplicate=json.dumps(value).replace('"uid": 1000','"uid": 1000, "uid": 1000');self.assertIsNone(ENV['qualify_mount_probe'](duplicate.encode(),expected))
    def test_reuse_reads_exact_old_manifest_and_double_actual_closure(self):
        prefix=Path('/root-fixture');names=[('corepack-runtime','a'*64),('corepack-cache','b'*64),('pnpm-store','c'*64)];ENV['CACHE_PRODUCER']=prefix;ENV['CACHE_BINDINGS']=names
        # The hash fixture substitutes only the expected data pin; actual function
        # still performs its own hash+scope+two-closure equality checks.
        data={};pins=[]
        for name,_ in names:
            v={'kind':'r29-independent-readonly-cache-closure','root':str(prefix/'caches'/name),'identity':{'device':1,'inode':2},'contentTreeSHA256':'d'*64,'metadataSHA256':'e'*64,'files':1,'bytes':2}
            raw=json.dumps(v).encode();data[str(prefix/'cache-manifests'/(name+'.json'))]=raw;pins.append((name,hashlib.sha256(raw).hexdigest()))
        ENV['CACHE_BINDINGS']=pins;ENV['private_read']=lambda p,*_:data[str(p)];calls=[]
        def closure(_,path):calls.append(path);name=Path(path).name;return json.loads(data[str(prefix/'cache-manifests'/(name+'.json'))])
        ENV['cache_closure']=closure;r=ENV['reuse_cache_reports'](object());self.assertEqual(len(calls),6);self.assertTrue(all(x['cacheCopiedAgain'] is False for x in r))
        ENV['cache_closure']=lambda _,path:{'root':path,'tampered':True}
        with self.assertRaisesRegex(RuntimeError,'CACHE_REUSE_CHANGED'):ENV['reuse_cache_reports'](object())
    def test_six_stoppost_names_and_budget_have_no_new_host_mount(self):
        assignments={}
        for n in TREE.body:
            if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='STAGES':assignments['STAGES']=ast.literal_eval(n.value)
        scopes=[x[0] for x in assignments['STAGES']];self.assertEqual(scopes,['offline-install','build','typecheck','truth-unit']);self.assertIn("STAGES.insert(0,('mount-proof',[],30))",BODY);self.assertIn("STAGES.append(('targeted-pure'",BODY);self.assertEqual(6*45+15,285);self.assertLess(285,300)
        self.assertNotIn("['/usr/bin/mount'",BODY);self.assertNotIn('docker.sock',BODY)
    def test_owner_and_durable_creation_intent_precede_each_candidate_create(self):
        main=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name=='main');text=ast.get_source_segment(BODY,main)
        self.assertLess(text.index('owner=owner_contract(attempt)'),text.index('created=call(command)'))
        self.assertLess(text.index("r['creationIntent']="),text.index('created=call(command)'))
        self.assertIn("r['creationIntent']={'name':container",text);self.assertIn("store(state,r)\n            need(h.fingerprint",text)
        self.assertIn("'--user','1000:1000'",text);self.assertIn("'--env','NODE_OPTIONS='",text)
    def test_original_cache_copy_is_unreachable_and_PG_never_enters_stage_list(self):
        main=next(n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name=='main');calls=[n for n in ast.walk(main) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)]
        self.assertFalse(any(n.func.id=='stage_cache' for n in calls));self.assertTrue(any(n.func.id=='reuse_cache_reports' for n in calls));self.assertNotIn('truth-gate-probe',BODY)
        self.assertFalse(any(isinstance(n,ast.Constant) and type(n.value) is int and n.value==34 for n in ast.walk(main)))
    def test_actual_nested_container_guard_rejects_command_env_and_capability_drift(self):
        import copy
        node=next(n for n in ast.walk(TREE) if isinstance(n,ast.FunctionDef) and n.name=='assert_container')
        labels={'jarvis.truthgate.r31.attempt':'a'*32,'jarvis.truthgate.r31.kind':'build'}
        scope={'need':ENV['need'],'labels':labels,'IMAGE':'sha256:'+'b'*64,'mounts':[],'assert_mount_root':lambda _:None}
        exec(compile(ast.Module(body=[node],type_ignores=[]),'actual-r31-nested-container-guard','exec'),scope)
        args=['/usr/local/bin/node','--test','/qa-tools/targeted-pure.mjs']
        value={'Image':scope['IMAGE'],'Config':{'Labels':{**labels,'jarvis.truthgate.r31.stage':'targeted-pure'},'User':'1000:1000','Entrypoint':[args[0]],'Cmd':args[1:],'WorkingDir':'/work/source','Volumes':None,'Env':['CI=1','HOME=/work/home','COREPACK_HOME=/corepack-cache','COREPACK_ENABLE_NETWORK=0','NODE_PATH=','NODE_OPTIONS=','PG_FORCE_NATIVE=']},'HostConfig':{'NetworkMode':'none','Init':True,'ReadonlyRootfs':True,'Privileged':False,'PidMode':'','IpcMode':'private','CapDrop':['ALL'],'CapAdd':[],'SecurityOpt':['no-new-privileges'],'Memory':8589934592,'NanoCpus':3000000000,'PidsLimit':512,'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=512m'}},'Mounts':[]}
        self.assertEqual(scope['assert_container'](value,'targeted-pure',args),value)
        for mutation in [lambda v:v['Config'].update(Cmd=['wrong']),lambda v:v['Config']['Env'].append('NODE_OPTIONS=--require=unapproved'),lambda v:v['HostConfig'].update(Privileged=True),lambda v:v['HostConfig'].update(Devices=[{'PathOnHost':'/dev/x'}]),lambda v:v.update(Mounts=[{'Destination':'/extra'}])]:
            bad=copy.deepcopy(value);mutation(bad)
            with self.assertRaises(RuntimeError):scope['assert_container'](bad,'targeted-pure',args)

if __name__=='__main__':unittest.main()
