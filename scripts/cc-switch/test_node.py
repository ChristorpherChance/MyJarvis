import contextlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest import mock
import uuid

spec = importlib.util.spec_from_file_location('cc_model_node', Path(__file__).with_name('node.py'))
adapter = importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
spec2 = importlib.util.spec_from_file_location('cc_model_controller', Path(__file__).with_name('controller.py'))
controller = importlib.util.module_from_spec(spec2);spec2.loader.exec_module(controller)
REAL_CLI = str(Path.home() / '.local/bin/cc-switch')
KEY_A = 'simulation-key-a-only'
KEY_B = 'simulation-key-b-only'

class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jarvis-model-test-')
        self.home = Path(self.temp.name)
        self.environ = mock.patch.dict(os.environ, {'HOME':str(self.home), 'CLAUDE_CONFIG_DIR':str(self.home/'.claude'),
            'XDG_CONFIG_HOME':str(self.home/'.config'), 'XDG_DATA_HOME':str(self.home/'.local/share'), 'XDG_STATE_HOME':str(self.home/'.local/state')})
        self.environ.start();(self.home/'.claude').mkdir()
        result=subprocess.run([REAL_CLI,'-a','claude','provider','list'],capture_output=True)
        self.assertEqual(result.returncode,0)
        self.manager=adapter.Manager(self.home,'test-machine','112',REAL_CLI)
        # The real machines already have a current provider; seed that state here.
        anchor=self.manager.snapshot()['providers'][0]
        self.manager.invoke(['use',anchor['id']])

    def tearDown(self):
        self.environ.stop();self.temp.cleanup()

    def value(self, key=KEY_A, model='simulation-model', url='https://simulation.example/anthropic'):
        return {'name':'Simulation provider','baseUrl':url,'model':model,'models':{'opus':model,'sonnet':'simulation-lite','haiku':'simulation-fast','fable':model,'subagent':'simulation-lite'},'authType':'auth-token','apiKey':key}

    def create(self, value=None):
        request={'action':'create','machineId':'test-machine','commandId':str(uuid.uuid4()),'provider':value or self.value()}
        snapshot=self.manager.execute(request)
        provider=next(p for p in snapshot['providers'] if p['id']==request['commandId'])
        return request,provider

    def current(self, provider_id):
        return next(p for p in self.manager.snapshot()['providers'] if p['id']==provider_id)

    def switch(self,p):
        return self.manager.execute({'action':'switch','machineId':'test-machine','providerId':p['id'],'expectedRevision':p['revision']})

    def test_create_idempotency_and_no_key_in_public_output(self):
        request,p=self.create()
        self.assertNotIn(KEY_A,adapter.canonical(self.manager.snapshot()))
        self.assertTrue(p['credentialConfigured'])
        self.assertEqual(self.manager.execute(request)['providers'],self.manager.snapshot()['providers'])
        request['provider']['apiKey']=KEY_B
        with self.assertRaises(adapter.Rejected) as ctx:self.manager.execute(request)
        self.assertEqual(ctx.exception.code,'CONFLICT')

    def test_current_provider_edit_applies_new_key_url_and_models(self):
        _,p=self.create();self.switch(p);p=self.current(p['id'])
        result=self.manager.execute({'action':'update','machineId':'test-machine','providerId':p['id'],'expectedRevision':p['revision'],
             'provider':self.value(KEY_B,'changed-model','https://changed.example/v1')})
        live=json.loads(self.manager.live.read_text())['env']
        self.assertEqual(live['ANTHROPIC_AUTH_TOKEN'],KEY_B)
        self.assertEqual(live['ANTHROPIC_MODEL'],'changed-model')
        self.assertEqual(live['ANTHROPIC_BASE_URL'],'https://changed.example/v1')
        self.assertNotIn(KEY_B,adapter.canonical(result))

    def test_blank_key_keeps_existing_and_other_metadata(self):
        _,p=self.create()
        with contextlib.closing(self.manager.database()) as db:
            db.execute("UPDATE providers SET notes='keep metadata',meta=? WHERE id=? AND app_type='claude'",(json.dumps({'custom':True}),p['id']));db.commit()
        p=self.current(p['id'])
        self.manager.execute({'action':'update','machineId':'test-machine','providerId':p['id'],'expectedRevision':p['revision'],'provider':self.value('')})
        with contextlib.closing(self.manager.database()) as db:
            row=db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'",(p['id'],)).fetchone()
        self.assertEqual(json.loads(row['settings_config'])['env']['ANTHROPIC_AUTH_TOKEN'],KEY_A)
        self.assertEqual(row['notes'],'keep metadata');self.assertEqual(json.loads(row['meta']),{'custom':True})

    def test_conflict_and_current_delete_guard(self):
        _,p=self.create();self.switch(p)
        with self.assertRaises(adapter.Rejected) as ctx:self.manager.execute({'action':'delete','machineId':'test-machine','providerId':p['id'],'expectedRevision':p['revision']})
        self.assertEqual(ctx.exception.code,'CONFLICT')
        p=self.current(p['id'])
        with self.assertRaises(adapter.Rejected) as ctx:self.manager.execute({'action':'delete','machineId':'test-machine','providerId':p['id'],'expectedRevision':p['revision']})
        self.assertEqual(ctx.exception.code,'ACTIVE_PROVIDER')

    def test_inactive_delete_and_unrelated_apps_untouched(self):
        _,p=self.create()
        with contextlib.closing(self.manager.database()) as db:
            original=db.execute("SELECT * FROM providers WHERE app_type!='claude' ORDER BY id").fetchall()
        self.manager.execute({'action':'delete','machineId':'test-machine','providerId':p['id'],'expectedRevision':p['revision']})
        self.assertFalse(any(i['id']==p['id'] for i in self.manager.snapshot()['providers']))
        with contextlib.closing(self.manager.database()) as db:
            after=db.execute("SELECT * FROM providers WHERE app_type!='claude' ORDER BY id").fetchall()
        self.assertEqual([tuple(r) for r in original],[tuple(r) for r in after])

    def test_input_scope_and_credentials_are_not_command_arguments(self):
        for value in [dict(self.value(),baseUrl='https://user:password@example.com'),dict(self.value(),apiKey='bad\nkey')]:
            with self.assertRaises(adapter.Rejected):adapter.validated_provider(value,True)
        with self.assertRaises(adapter.Rejected):self.manager.execute({'action':'list','machineId':'other'})
        original=subprocess.run;arguments=[]
        def observed(args,**options):arguments.append(args);return original(args,**options)
        with mock.patch.object(adapter.subprocess,'run',side_effect=observed):self.create()
        self.assertTrue(arguments)
        self.assertNotIn(KEY_A,adapter.canonical(arguments))
        self.assertIn('--config-file',arguments[0])

    def test_controller_reprojects_secret_fields(self):
        _,p=self.create();value=self.manager.snapshot()
        value['apiKey']=KEY_A;value['providers'][0]['apiKey']=KEY_B
        public=controller.public_snapshot(value,{'id':'test-machine','host':'112'})
        self.assertNotIn(KEY_A,adapter.canonical(public));self.assertNotIn(KEY_B,adapter.canonical(public))

if __name__=='__main__':unittest.main(verbosity=2)
