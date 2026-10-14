"""Isolated dispatcher tests. All power commands are mocked; no host is powered off."""
import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

spec=importlib.util.spec_from_file_location('fixed_dispatcher',p['dispatcher'])
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

class DispatcherTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.state=patch.object(d,'STATE',Path(self.temp.name));self.state.start()
        self.config={'machineId':'isolated-test','hostname':socket.gethostname(),'powerEnabled':True,'services':{'test.service':{'controllable':True,'expected':'active'},'ssh.service':{'controllable':False,'expected':'active'}}}
        self.boot=patch.object(d,'boot_id',return_value='original-boot');self.boot.start()
    def tearDown(self):self.boot.stop();self.state.stop();self.temp.cleanup()
    def req(self,action='restart',units=None):return {'version':1,'mode':'execute','id':str(uuid.uuid4()),'machineId':self.config['machineId'],'bindingHash':'frozen','action':action,'units':['test.service'] if units is None else units,'executeBefore':(datetime.now(timezone.utc)+timedelta(seconds=60)).isoformat()}
    def test_power_commands_are_fixed_and_sent_once(self):
        for action in ['reboot','poweroff']:
            request=self.req(action,[])
            with patch.object(d,'command',return_value=SimpleNamespace(returncode=0)) as run:
                first=d.dispatch(self.config,request);again=d.dispatch(self.config,request)
                self.assertEqual(first['status'],'accepted');self.assertEqual(first,again);self.assertEqual(run.call_count,1)
                args=run.call_args.args[0];self.assertEqual(args[-2:],['/usr/bin/systemctl',action]);self.assertIn('--on-active=12s',args)
                if action=='poweroff':
                    with patch.object(d,'boot_id',return_value='manually-started-boot'):
                        status=d.dispatch(self.config,{'mode':'status','id':request['id'],'machineId':request['machineId']})
                        self.assertEqual(status['status'],'unknown');self.assertIn('未核实',status['summary'])
    def test_no_shell_or_unlisted_unit(self):
        for unit in ['other.service','test.service;reboot','/tmp/anything.service']:
            with self.assertRaisesRegex(RuntimeError,'SERVICE_NOT_AUTHORIZED'):d.dispatch(self.config,self.req(units=[unit]))
        r=self.req();r['shell']='reboot'
        with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_FIELDS'):d.dispatch(self.config,r)
    def test_identity_protected_unit_and_machine_target(self):
        with self.assertRaisesRegex(RuntimeError,'INFRASTRUCTURE_SERVICE_PROTECTED'):d.dispatch(self.config,self.req(units=['ssh.service']))
        with self.assertRaisesRegex(RuntimeError,'POWER_TARGET_MUST_BE_MACHINE'):d.dispatch(self.config,self.req('poweroff'))
        r=self.req();r['machineId']='another-host'
        with self.assertRaisesRegex(RuntimeError,'NODE_IDENTITY_DIFFERS'):d.dispatch(self.config,r)
    def test_expired_execution_and_different_target_replay(self):
        r=self.req();r['executeBefore']=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
        with self.assertRaisesRegex(RuntimeError,'EXPIRED_EXECUTION'):d.dispatch(self.config,r)
        r=self.req('poweroff',[])
        with patch.object(d,'command',return_value=SimpleNamespace(returncode=0)):d.dispatch(self.config,r)
        r['action']='reboot'
        with self.assertRaisesRegex(RuntimeError,'JOB_REPLAY_DIFFERENT_TARGET'):d.dispatch(self.config,r)
    def test_interrupted_execution_is_not_repeated(self):
        r=self.req('diagnose',[])
        with patch.object(d,'diagnostics',side_effect=KeyboardInterrupt) as diagnose:
            with self.assertRaises(KeyboardInterrupt):d.dispatch(self.config,r)
            self.assertEqual(d.dispatch(self.config,r)['status'],'unknown');self.assertEqual(diagnose.call_count,1)
    def test_reboot_requires_new_boot_and_expected_services(self):
        r=self.req('reboot',[])
        with patch.object(d,'command',return_value=SimpleNamespace(returncode=0)):d.dispatch(self.config,r)
        status={'mode':'status','id':r['id'],'machineId':r['machineId']}
        self.assertEqual(d.dispatch(self.config,status)['status'],'accepted')
        info=lambda unit,logs=False:{'unit':unit,'fields':{'ActiveState':'active'}}
        with patch.object(d,'boot_id',return_value='new-boot'),patch.object(d,'service_info',side_effect=info):self.assertEqual(d.dispatch(self.config,status)['status'],'succeeded')
    def test_restart_state_and_timestamp_are_verified(self):
        r=self.req();before={'unit':'test.service','fields':{'ActiveState':'active','ActiveEnterTimestampMonotonic':'10'}};after={'unit':'test.service','fields':{'ActiveState':'active','ActiveEnterTimestampMonotonic':'20'}}
        with patch.object(d,'command',return_value=SimpleNamespace(returncode=0)),patch.object(d,'service_info',side_effect=[before,after]):self.assertEqual(d.dispatch(self.config,r)['status'],'succeeded')
        r=self.req()
        with patch.object(d,'command',return_value=SimpleNamespace(returncode=0)),patch.object(d,'service_info',side_effect=[before,before]):self.assertEqual(d.dispatch(self.config,r)['status'],'failed')
    def test_credentials_redacted_in_logs(self):
        text=d.redact('password=private-value Bearer private-token token=another-secret sk-12345678901234567890')
        for secret in ['private-value','private-token','another-secret','sk-12345678901234567890']:self.assertNotIn(secret,text)

suite=unittest.defaultTestLoader.loadTestsFromTestCase(DispatcherTests)
result=unittest.TextTestRunner(verbosity=1).run(suite)
print(json.dumps({'tests':result.testsRun,'passed':result.wasSuccessful(),'realPowerCommandsExecuted':0}))
if not result.wasSuccessful():raise RuntimeError('ISOLATED_DISPATCHER_TEST_FAILED')
