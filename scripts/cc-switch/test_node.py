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

    def edit(self, p, value=None):
        return self.manager.execute({'action':'update','machineId':'test-machine','providerId':p['id'],
             'expectedRevision':p['revision'],'provider':value or self.value(KEY_B,'changed-model','https://changed.example/v1')})

    def row_and_endpoints(self, provider_id):
        with contextlib.closing(self.manager.database()) as db:
            row=dict(db.execute("SELECT * FROM providers WHERE id=? AND app_type='claude'",(provider_id,)).fetchone())
            endpoints=[dict(e) for e in db.execute("SELECT * FROM provider_endpoints WHERE provider_id=? AND app_type='claude' ORDER BY id",(provider_id,))]
        return row,endpoints

    def test_auth_type_changes_remove_the_old_live_auth_key(self):
        _,p=self.create();self.switch(p)
        for auth_type,wanted,removed in [('api-key','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN'),('auth-token','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_API_KEY')]:
            p=self.current(p['id']);self.edit(p,dict(self.value(KEY_B),authType=auth_type))
            env=json.loads(self.manager.live.read_text())['env']
            self.assertEqual(env[wanted],KEY_B);self.assertNotIn(removed,env)

    def test_active_edit_and_switch_preserve_raw_metadata(self):
        _,p=self.create()
        raw_meta='{ "unknownFutureField": {"preserve": true}, "custom": 7 }'
        with contextlib.closing(self.manager.database()) as db:
            db.execute("UPDATE providers SET meta=?,notes='preserve notes',icon='preserve icon' WHERE id=?",(raw_meta,p['id']));db.commit()
        self.switch(self.current(p['id']));self.edit(self.current(p['id']))
        row,_=self.row_and_endpoints(p['id'])
        self.assertEqual(row['meta'],raw_meta);self.assertEqual(row['notes'],'preserve notes');self.assertEqual(row['icon'],'preserve icon')

    def test_create_preserves_other_provider_metadata(self):
        _,p=self.create();raw_meta='{ "unknownFutureField": true }'
        with contextlib.closing(self.manager.database()) as db:
            db.execute('UPDATE providers SET meta=? WHERE id=?',(raw_meta,p['id']));db.commit()
        self.create()
        self.assertEqual(self.row_and_endpoints(p['id'])[0]['meta'],raw_meta)

    def test_edit_preserves_helper_and_unrelated_settings_without_new_key(self):
        _,p=self.create()
        with contextlib.closing(self.manager.database()) as db:
            settings=json.loads(db.execute('SELECT settings_config FROM providers WHERE id=?',(p['id'],)).fetchone()[0])
            settings['apiKeyHelper']='custom-vault-helper';settings['customSetting']={'preserve':True};settings['env']['CCR_CLAUDE_CODE_MODEL']='custom-preserve'
            db.execute('UPDATE providers SET settings_config=? WHERE id=?',(json.dumps(settings),p['id']));db.commit()
        self.edit(self.current(p['id']),self.value(''))
        row,_=self.row_and_endpoints(p['id']);settings=json.loads(row['settings_config'])
        self.assertEqual(settings['apiKeyHelper'],'custom-vault-helper');self.assertEqual(settings['customSetting'],{'preserve':True})
        self.assertEqual(settings['env']['CCR_CLAUDE_CODE_MODEL'],'custom-preserve')
        self.edit(self.current(p['id']),self.value(KEY_B))
        row,_=self.row_and_endpoints(p['id']);self.assertNotIn('apiKeyHelper',json.loads(row['settings_config']))

    def test_change_primary_url_preserves_alternate_endpoints(self):
        _,p=self.create();old_url=self.value()['baseUrl']
        with contextlib.closing(self.manager.database()) as db:
            db.execute("DELETE FROM provider_endpoints WHERE provider_id=? AND app_type='claude'",(p['id'],))
            for url in [old_url,'https://alternate.example/v1']:
                db.execute("INSERT INTO provider_endpoints(provider_id,app_type,url,added_at) VALUES(?,'claude',?,1)",(p['id'],url))
            db.commit()
        _,before=self.row_and_endpoints(p['id']);self.edit(self.current(p['id']))
        _,after=self.row_and_endpoints(p['id'])
        self.assertEqual({r['url'] for r in after},{'https://changed.example/v1','https://alternate.example/v1'})
        self.assertEqual(next(r for r in before if r['url']=='https://alternate.example/v1'),next(r for r in after if r['url']=='https://alternate.example/v1'))

    def test_timeout_and_oserror_are_safe_apply_failures(self):
        for exception in [subprocess.TimeoutExpired(['private-cli'],25),OSError('private error')]:
            with mock.patch.object(adapter.subprocess,'run',side_effect=exception):
                with self.assertRaises(adapter.Rejected) as ctx:self.manager.invoke(['use','simulation'])
            self.assertEqual(ctx.exception.code,'APPLY_FAILED')

    def test_current_edit_failure_restores_row_endpoints_and_live(self):
        _,p=self.create();self.switch(p);p=self.current(p['id'])
        with contextlib.closing(self.manager.database()) as db:
            db.execute("INSERT INTO provider_endpoints(provider_id,app_type,url,added_at) VALUES(?,'claude',?,1)",(p['id'],'https://alternate.example/v1'));db.commit()
        before=self.row_and_endpoints(p['id']);invoke=self.manager.invoke;failed=False
        def fail_once(args,timeout=25):
            nonlocal failed
            if args[0]=='use' and not failed:
                failed=True;raise adapter.Rejected('APPLY_FAILED')
            return invoke(args,timeout)
        with mock.patch.object(self.manager,'invoke',side_effect=fail_once):
            with self.assertRaises(adapter.Rejected) as ctx:self.edit(p)
        self.assertEqual(ctx.exception.code,'APPLY_FAILED');self.assertEqual(self.row_and_endpoints(p['id']),before)
        self.assertEqual(json.loads(self.manager.live.read_text())['env']['ANTHROPIC_AUTH_TOKEN'],KEY_A)

    def test_invalid_live_json_is_rolled_back_after_current_edit(self):
        _,p=self.create();self.switch(p);p=self.current(p['id']);before=self.row_and_endpoints(p['id'])
        invoke=self.manager.invoke;failed=False
        def corrupt_once(args,timeout=25):
            nonlocal failed
            result=invoke(args,timeout)
            if args[0]=='use' and not failed:
                failed=True;self.manager.live.write_text('{ invalid private settings')
            return result
        with mock.patch.object(self.manager,'invoke',side_effect=corrupt_once):
            with self.assertRaises(adapter.Rejected) as ctx:self.edit(p)
        self.assertEqual(ctx.exception.code,'APPLY_FAILED');self.assertEqual(self.row_and_endpoints(p['id']),before)
        self.assertEqual(json.loads(self.manager.live.read_text())['env']['ANTHROPIC_AUTH_TOKEN'],KEY_A)

    def test_switch_rechecks_revision_after_backup(self):
        _,p=self.create();backup=self.manager.backup
        def edit_during_backup(action):
            result=backup(action)
            with contextlib.closing(self.manager.database()) as db:
                db.execute("UPDATE providers SET name='external edit' WHERE id=?",(p['id'],));db.commit()
            return result
        with mock.patch.object(self.manager,'backup',side_effect=edit_during_backup):
            with self.assertRaises(adapter.Rejected) as ctx:self.switch(p)
        self.assertEqual(ctx.exception.code,'CONFLICT');self.assertFalse(self.current(p['id'])['isCurrent'])

    def test_edit_does_not_undo_concurrent_native_switch_or_metadata_edit(self):
        _,p=self.create();self.switch(p);p=self.current(p['id'])
        anchor=next(q for q in self.manager.snapshot()['providers'] if q['id']!=p['id'])
        def concurrent_edit(args,timeout=25):
            with contextlib.closing(self.manager.database()) as db:
                db.execute("UPDATE providers SET is_current=CASE WHEN id=? THEN 1 ELSE 0 END WHERE app_type='claude'",(anchor['id'],))
                db.execute("UPDATE providers SET meta=? WHERE id=?",(json.dumps({'externalEdit':True}),p['id']));db.commit()
            raise adapter.Rejected('APPLY_FAILED')
        with mock.patch.object(self.manager,'invoke',side_effect=concurrent_edit):
            with self.assertRaises(adapter.Rejected) as ctx:self.edit(p)
        self.assertEqual(ctx.exception.code,'UNKNOWN_RESULT');self.assertTrue(self.current(anchor['id'])['isCurrent'])
        row,_=self.row_and_endpoints(p['id']);self.assertEqual(json.loads(row['meta']),{'externalEdit':True})

    def test_post_apply_detects_external_configuration_change(self):
        _,p=self.create();invoke=self.manager.invoke
        def concurrent_edit(args,timeout=25):
            result=invoke(args,timeout)
            with contextlib.closing(self.manager.database()) as db:
                db.execute("UPDATE providers SET name='external edit after use' WHERE id=?",(p['id'],));db.commit()
            return result
        with mock.patch.object(self.manager,'invoke',side_effect=concurrent_edit):
            with self.assertRaises(adapter.Rejected) as ctx:self.switch(p)
        self.assertEqual(ctx.exception.code,'UNKNOWN_RESULT');self.assertEqual(self.current(p['id'])['name'],'external edit after use')

if __name__=='__main__':unittest.main(verbosity=2)
