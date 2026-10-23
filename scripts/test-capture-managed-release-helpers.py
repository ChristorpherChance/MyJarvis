"""Isolated checks for managed-release timeout and config restore helpers."""
import ast
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

MANAGED = Path(__file__).with_name('capture-managed-release.py')
module = ast.parse(MANAGED.read_text())
common_source = next(node.value.value for node in module.body
                     if isinstance(node, ast.Assign)
                     and any(isinstance(target, ast.Name) and target.id == 'common'
                             for target in node.targets))
production = {'p': {'release': 'fixture-release'}}
exec(compile(common_source, str(MANAGED) + ':common', 'exec'), production)
programs_node = next(node.value for node in module.body if isinstance(node, ast.Assign)
                     and any(isinstance(target, ast.Name) and target.id == 'programs' for target in node.targets))
activate_node = next(value for key, value in zip(programs_node.keys, programs_node.values)
                     if isinstance(key, ast.Constant) and key.value == 'activate')
activate = activate_node.value
helpers = type('ProductionHelpers', (), production)


class ManagedReleaseHelperTests(unittest.TestCase):
    def test_forward_and_rollback_have_independent_budgets(self):
        clock = [100.0]
        budget = helpers.Budget(forward_seconds=10, rollback_seconds=12, clock=lambda: clock[0])
        clock[0] += 9
        self.assertLess(budget.timeout(100, reserve=0.1), 1)
        budget.begin_rollback()
        clock[0] += 11
        self.assertLess(budget.timeout(100, rollback=True, reserve=0.1), 1)

    def test_timeout_terminates_and_reaps_owned_child(self):
        runner = helpers.ChildRunner()
        started = time.monotonic()
        with self.assertRaises(helpers.ActivationTimeout):
            runner(['/bin/sh', '-c', 'sleep 30'], timeout=0.1, stdin=subprocess.DEVNULL,
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertLess(time.monotonic() - started, 8)

    def test_real_runner_accepts_check_capture_and_bounds_sigterm_ignoring_child(self):
        runner = helpers.ChildRunner()
        completed = runner(['/bin/sh', '-c', 'printf runner-ok'], timeout=2,
                           check=True, capture_output=True, text=True)
        self.assertEqual(completed.stdout, 'runner-ok')
        started = time.monotonic()
        with self.assertRaises(helpers.ActivationTimeout):
            runner(['/bin/sh', '-c', 'trap "" TERM; sleep 30'], timeout=0.1,
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertLess(time.monotonic() - started, 8)

    def test_health_exchange_caps_entire_dripping_response(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        from unittest.mock import patch
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):pass
            def do_GET(self):
                self.send_response(200);self.end_headers()
                for _ in range(100):
                    try:self.wfile.write(b' ');self.wfile.flush()
                    except (BrokenPipeError,ConnectionResetError):break
                    time.sleep(0.05)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        original=production['run_bounded']
        def fixture_run(argv,cap,rollback=False,**kwargs):
            import json
            data=json.loads(kwargs['input']);data['ca']=None;kwargs['input']=json.dumps(data)
            return original(argv,cap,rollback,**kwargs)
        started=time.monotonic()
        try:
            with patch.dict(production,run_bounded=fixture_run):
                with self.assertRaises(helpers.ActivationTimeout):production['health_json']('http://127.0.0.1:'+str(server.server_port),{},timeout_cap=0.25)
            self.assertLess(time.monotonic()-started,4)
        finally:server.shutdown();server.server_close()

    def run_activate(self, fail_on):
        import json
        import stat
        import hashlib
        from unittest.mock import patch
        temp = tempfile.TemporaryDirectory(prefix='managed-activate-fixture-')
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        base, prior = root / 'candidate', root / 'prior'
        base.mkdir(); prior.mkdir()
        (base / 'scripts').mkdir()
        (base / 'scripts/release-web-assets.py').write_text('# fixture')
        (base / 'scripts/capture-release-recovery.py').write_text('# fixture')
        (base / '.capture-install.json').write_text('{}')
        config = root / 'node.json'
        old = b'{"release":"prior","role":"primary"}'
        config.write_bytes(old)
        current = root / 'current'; current.symlink_to(prior)
        lock = root / 'capture-activate.lock'; lock.touch(mode=0o600)
        control = root / 'capture-upgrade-candidate-112'
        code = activate.replace("Path('/var/lib/jarvis-control')", 'Path('+repr(str(root))+')')
        code = code.replace("'/var/lib/jarvis-control/capture-activate.lock'", repr(str(lock)))
        code = code.replace("Path('/etc/jarvis/node.json')", 'Path('+repr(str(config))+')')
        code = code.replace("Path('/opt/jarvis/current')", 'Path('+repr(str(current))+')')
        code = code.replace("sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True,timeout=5)", "sqlite3.connect(':memory:')")
        events = []; forward = [True]; stop_failed = [False]
        env = dict(production)
        real_fstat = os.fstat
        def root_stat(fd):
            info = real_fstat(fd)
            from types import SimpleNamespace
            return SimpleNamespace(**{**{k:getattr(info,k) for k in dir(info) if k.startswith('st_')}, 'st_uid':0})
        def bounded(argv, cap, rollback=False, **kwargs):
            if argv[0] == 'systemctl':
                action, unit = argv[1], argv[-1]
                events.append(action+':'+unit)
                if action == 'is-active':return subprocess.CompletedProcess(argv,0,'active','')
                if action == 'stop' and unit == 'jarvis-platform.service' and fail_on == 'partial-stop' and not stop_failed[0]:
                    stop_failed[0]=True;raise RuntimeError('INJECTED_PARTIAL_STOP')
                if action == 'start' and fail_on == 'rollback-failure' and not forward[0]:raise RuntimeError('INJECTED_ROLLBACK_START')
                return subprocess.CompletedProcess(argv,0,'','')
            if 'verify' in argv:return subprocess.CompletedProcess(argv,0,json.dumps({'verified':True,'previousRelease':'prior','release':'candidate'}),'')
            if 'snapshot' in argv:
                events.append('snapshot');return subprocess.CompletedProcess(argv,0,json.dumps({'manifestSha256':'a'*64}),'')
            if 'restore' in argv:
                events.append('restore')
                if fail_on in ('restore-timeout','not-reaped'):raise production['ActivationTimeout']('CHILD_NOT_REAPED' if fail_on=='not-reaped' else 'CHILD_TIMEOUT')
                return subprocess.CompletedProcess(argv,0,'{}','')
            raise AssertionError(argv)
        def state(rollback=False):
            forward[0]=not rollback
            if not rollback:
                forward[0]=False
                raise production['ActivationTimeout']('FORWARD_BUDGET_EXHAUSTED')
            return {'release':'prior','currentRelease':'prior','observerBuild':'prior','platformService':'active','healthBuild':'prior','healthStatus':'ok'}
        env.update(p={'node':'112','release':'candidate','expectedCurrent':'prior'},release='candidate',base=base,
                   budget=production['Budget'](forward_seconds=20,rollback_seconds=20),run_bounded=bounded,
                   manifest_verify=lambda:{'files':[]},safe_directory=lambda *args,**kw:None,
                   regular=lambda path:path.stat(),state=state)
        with patch.object(os,'fstat',side_effect=root_stat):
            with self.assertRaises(RuntimeError):exec(compile(code,'<actual-managed-activate>','exec'),env)
        receipt=json.loads((control/'activation-failed.json').read_text())
        return events,receipt,config.read_bytes(),current.resolve(),prior,old

    def test_generated_activation_partial_stop_attempts_rollback(self):
        events,r,data,current,prior,old=self.run_activate('partial-stop')
        self.assertEqual(r['firstError']['code'],'INJECTED_PARTIAL_STOP')
        self.assertTrue(r['codeAndConfigRolledBack']);self.assertEqual(data,old);self.assertEqual(current,prior)
        self.assertIn('start:jarvis-observer.service',events)

    def test_generated_activation_restore_timeout_rolls_back_without_data_restore(self):
        events,r,data,current,prior,old=self.run_activate('restore-timeout')
        self.assertIn('restore',events);self.assertEqual(r['firstError']['code'],'CHILD_TIMEOUT')
        self.assertTrue(r['codeAndConfigRolledBack']);self.assertFalse(r['liveDataOverwritten'])
        self.assertEqual(data,old);self.assertEqual(current,prior)

    def test_generated_activation_rollback_error_preserves_first_error(self):
        _,r,_,_,_,_=self.run_activate('rollback-failure')
        self.assertEqual(r['firstError']['code'],'FORWARD_BUDGET_EXHAUSTED')
        self.assertEqual(r['rollbackError'],'INJECTED_ROLLBACK_START');self.assertFalse(r['codeAndConfigRolledBack'])

    def test_unreaped_child_records_manual_recovery_without_parallel_rollback(self):
        events,r,_,_,_,_=self.run_activate('not-reaped')
        self.assertFalse(r['codeAndConfigRolledBack']);self.assertTrue(r['manualRecoveryRequired'])
        self.assertFalse(any(e.startswith('start:') for e in events))
        self.assertEqual(events.count('stop:jarvis-observer.service'),1)

    def test_generated_common_is_production_runner_and_caps_timeout(self):
        budget = production['Budget'](forward_seconds=10, rollback_seconds=12, clock=lambda: 1.0)
        self.assertLessEqual(budget.timeout(50), 2)
        budget2 = production['Budget'](forward_seconds=10, rollback_seconds=12, clock=lambda: 1.0)
        self.assertEqual(budget2.timeout(50, rollback=True), 4)

    def test_atomic_restore_preserves_permissions_and_bytes(self):
        with tempfile.TemporaryDirectory(prefix='managed-release-') as tmp:
            path = Path(tmp) / 'node.json'
            path.write_bytes(b'{"before":true}\n')
            os.chmod(path, 0o640)
            info = path.stat()
            production['atomic_config_write'](path, b'{"restored":true}\n', info, 'fixture')
            self.assertEqual(path.read_bytes(), b'{"restored":true}\n')
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)
            self.assertEqual((path.stat().st_uid, path.stat().st_gid), (info.st_uid, info.st_gid))
            self.assertFalse(path.with_name('node.json.capture-fixture').exists())


if __name__ == '__main__':
    unittest.main()
