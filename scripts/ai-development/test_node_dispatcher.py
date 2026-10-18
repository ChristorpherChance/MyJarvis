"""Isolated contract/crash tests; no SSH, subprocess, tool install or model execution."""
import copy
from contextlib import nullcontext
from datetime import datetime,timedelta,timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import stat
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import uuid

spec=importlib.util.spec_from_file_location('ai_node',Path(__file__).with_name('node-dispatcher.py'))
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
spec2=importlib.util.spec_from_file_location('ai_installer',Path(__file__).with_name('install-controller.py'))
i=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(i)

class Contracts(unittest.TestCase):
    def setUp(self):
        self.profile={'id':'linux-ai-dev-v1','revision':1,'name':'终端 AI 开发','tools':[],'providers':[],'statuslineVersion':'1'}
        self.config={'machineId':str(uuid.uuid4()),'hostname':socket.gethostname(),'nodeId':'112','address':'192.168.10.112','targetUser':'superopen','profiles':[{'id':self.profile['id'],'revision':1,'publicHash':n.digest(self.profile),'manifestSHA256':'d'*64}]}
        self.legacy={'machineId':self.config['machineId'],'hostname':socket.gethostname()}
        now=datetime.now(timezone.utc);binding={'machineId':self.config['machineId'],'machineRevision':2,'nodeId':'112','address':'192.168.10.112','targetUser':'superopen','action':'configure','profileId':self.profile['id'],'profileRevision':1,'profileHash':n.digest(self.profile),'policyHash':'a'*64}
        self.r={'schemaVersion':1,'id':str(uuid.uuid4()),'commandId':str(uuid.uuid4()),**binding,'bindingHash':n.digest(binding),'createdAt':now.isoformat(),'expiresAt':(now+timedelta(minutes=15)).isoformat(),'actorId':'fixture-admin','authorizationHash':'f'*64,'profile':self.profile}
        self.e={'schemaVersion':1,'mode':'ai-development','operation':'start','id':self.r['id'],'machineId':self.config['machineId'],'request':self.r,'providers':[{'id':'k3','name':'K3','settingsConfig':{'env':{'ANTHROPIC_AUTH_TOKEN':'fixture-secret'}}}]}

    def test_utf8_hash_matches_contract(self):
        self.assertEqual(n.canonical({'z':'中文','a':[{'z':2,'a':1},None]}),'{"a":[{"a":1,"z":2},null],"z":"中文"}'.encode())
        self.assertEqual(n.digest(self.profile),i.digest(self.profile))

    def test_provider_does_not_admit_hooks_argv_or_shell_env(self):
        n.validate_providers(self.e['providers'])
        for change in [{'hooks':{}},{'env':{'NODE_OPTIONS':'--require /tmp/code'}},{'env':{'ANTHROPIC_AUTH_TOKEN':'x\nlog'}}]:
            providers=copy.deepcopy(self.e['providers']);providers[0]['settingsConfig']=change
            with self.assertRaises(RuntimeError):n.validate_providers(providers)

    def test_target_profile_deadline_and_binding_reject_drift(self):
        n.validate_envelope(self.e,self.config,self.legacy)
        for key,value in [('targetUser','root'),('address','different'),('profileHash','c'*64),('bindingHash','b'*64)]:
            e=copy.deepcopy(self.e);e['request'][key]=value
            with self.assertRaises(RuntimeError):n.validate_envelope(e,self.config,self.legacy)
        with self.assertRaisesRegex(RuntimeError,'REQUEST_EXPIRED'):n.validate_envelope(self.e,self.config,self.legacy,now=n.timestamp(self.r['expiresAt'])+1)

    def test_inventory_projection_never_includes_private_fields(self):
        value={'tools':[{'name':'claude','version':None,'installed':False,'path':None,'env':{'key':'fixture-secret'}}],'providers':[{'id':'k3','name':'K3','model':None,'settingsConfig':{'token':'fixture-secret'}}],'resources':{'cpuPercent':None,'ramTotalBytes':120,'private':'fixture-secret'},'sessionSummary':{'observedAt':datetime.now(timezone.utc).isoformat(),'sessionId':None,'model':None,'provider':None,'contextTokens':None,'billingStatus':'unknown','prompt':'fixture-secret'}}
        public=n.sanitize_inventory(value);self.assertNotIn('fixture-secret',json.dumps(public));self.assertIsNone(public['terminalTelemetry']['contextTokens']);self.assertEqual(public['terminalTelemetry']['billingStatus'],'unknown')

    def test_fixed_installer_does_not_accept_secret_public_profile(self):
        i.public_profile(self.profile)
        p=copy.deepcopy(self.profile);p['providers']=[{'id':'k3','name':'K3','model':'k3','credentialConfigured':True,'settingsConfig':{'key':'fixture-secret'}}]
        with self.assertRaises(RuntimeError):i.public_profile(p)

    def test_receipt_hides_internal_state_and_secrets(self):
        state={**n.initial_receipt(self.r),'requestHash':'private','workerPid':123,'providers':self.e['providers']}
        public=n.public_receipt(state);self.assertNotIn('requestHash',public);self.assertNotIn('workerPid',public);self.assertNotIn('fixture-secret',json.dumps(public))

    def test_durable_job_runs_once_and_crash_becomes_unknown(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);calls=[]
            def read(path,**kw):
                if path==n.CONFIG:return self.config
                if path==n.LEGACY:return self.legacy
                return json.loads(Path(path).read_text())
            def write(path,value):Path(path).write_text(json.dumps(value))
            def launch(*args,**kwargs):calls.append((args,kwargs));return SimpleNamespace(pid=123,stdin=io.BytesIO())
            with patch.object(n,'STATE',root),patch.object(n,'read_json',side_effect=read),patch.object(n,'atomic',side_effect=write),patch.object(n,'validate_state'),patch.object(n,'validate_modules'),patch.object(n,'locked',side_effect=lambda *args,**kw:nullcontext()),patch.object(n,'process_identity',return_value='start-1'):
                first=n.dispatch(self.e,launch);second=n.dispatch(self.e,launch);self.assertEqual(first['status'],'running');self.assertEqual(second['status'],'running');self.assertEqual(len(calls),1)
                with patch.object(n,'process_identity',return_value=None):self.assertEqual(n.dispatch(self.e,launch)['status'],'unknown')
                self.assertEqual(len(calls),1)
                altered=copy.deepcopy(self.e);altered['request']['commandId']=str(uuid.uuid4())
                with self.assertRaisesRegex(RuntimeError,'REQUEST_REPLAY_DIFFERS'):n.dispatch(altered,launch)
                self.assertEqual(len(calls),1)

    def test_status_missing_never_launches_and_observe_cannot_configure(self):
        e=copy.deepcopy(self.e);e['operation']='status';e.pop('providers')
        with tempfile.TemporaryDirectory() as temp,patch.object(n,'STATE',Path(temp)),patch.object(n,'read_json',side_effect=lambda path,**kw:self.config if path==n.CONFIG else self.legacy),patch.object(n,'validate_state'),patch.object(n,'validate_modules'),patch.object(n,'locked',side_effect=lambda *args,**kw:nullcontext()):
            with patch.object(n.subprocess,'Popen') as popen:self.assertEqual(n.dispatch(e)['status'],'unknown');popen.assert_not_called()
        e['operation']='observe'
        with self.assertRaisesRegex(RuntimeError,'OBSERVE_REQUIRES_TELEMETRY'):n.validate_envelope(e,self.config,self.legacy)

    def test_read_only_sampling_has_no_durable_job_or_config_launch(self):
        e=copy.deepcopy(self.e);e['operation']='observe';e.pop('providers');e['request']['action']='telemetry';e['request']['bindingHash']=n.digest({k:e['request'][k] for k in ['machineId','machineRevision','address','nodeId','targetUser','action','profileId','profileRevision','profileHash','policyHash']})
        with patch.object(n,'read_json',side_effect=lambda path,**kw:self.config if path==n.CONFIG else self.legacy),patch.object(n,'validate_state'),patch.object(n,'validate_modules'),patch.object(n,'provision_result',return_value={'status':'succeeded','inventory':{'schemaVersion':1,'tools':[],'providers':[]}}) as observe,patch.object(n,'atomic') as write,patch.object(n.subprocess,'Popen') as launch:
            self.assertEqual(n.dispatch(e)['status'],'succeeded');self.assertLessEqual(observe.call_args.args[-1],12);write.assert_not_called();launch.assert_not_called()

    def test_node_upgrade_preserves_shared_secret_directory_group_and_permissions(self):
        fake=SimpleNamespace(exists=lambda:True,lstat=lambda:SimpleNamespace(st_mode=stat.S_IFDIR|0o750,st_uid=0,st_gid=955))
        with patch.object(i.helpers,'CONF',fake),patch.object(i.helpers,'no_links'),patch.object(i.helpers,'directory') as change:
            i.helpers.shared_private_configuration_directory();change.assert_not_called()

    @unittest.skipUnless(os.name=='posix','POSIX mode/fchown behavior is unavailable on Windows')
    def test_installer_put_sets_cross_uid_mode_despite_umask_0077(self):
        with tempfile.TemporaryDirectory() as temp:
            previous=os.umask(0o077)
            try:
                for name,mode in [('module.py',0o644),('public-policy.json',0o644),('vault.json',0o640),('vault.key',0o640)]:
                    path=Path(temp)/name;i.helpers.put(path,b'fixture',uid=os.getuid(),gid=os.getgid(),mode=mode)
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode),mode);self.assertEqual(path.stat().st_gid,os.getgid());self.assertEqual(path.read_bytes(),b'fixture')
            finally:os.umask(previous)

if __name__=='__main__':unittest.main()
