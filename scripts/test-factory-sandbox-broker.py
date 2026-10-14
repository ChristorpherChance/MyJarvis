"""Boundary tests using a fake daemon; these are not the six Linux product tests."""
import copy
from email.message import Message
import importlib.util
import json
from pathlib import Path
import stat
import sys
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import urllib.parse


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


broker = load('sandbox_fixture', 'factory-sandbox-broker.py')
control = load('sandbox_controller', 'factory-sandbox-broker-control.py')
RUN = 'a' * 40
SOURCE = 'b' * 64
NETWORK_ID = 'c' * 64
IMAGE_ID = broker.PIN
IMAGE = {'Id': IMAGE_ID, 'RepoDigests': ['alpine@' + broker.PIN], 'PrivateExtra': 'must-not-return'}
NETWORK = 'jarvis-ft-' + RUN + '-sandbox-net'


class FakeDaemon:
    def __init__(self):
        self.calls = []
        self.objects = {}
        self.ping = True
        self.wait_entered, self.kill_seen = threading.Event(), threading.Event()
        self.block_wait = False
        self.network = {'Id': NETWORK_ID, 'Name': NETWORK, 'Internal': True,
                        'Labels': broker.identities(RUN, SOURCE), 'Containers': {}}

    def request(self, method, path, body=None, timeout=15):
        self.calls.append((method, path, copy.deepcopy(body), timeout))
        if path == '/_ping':
            return (200, b'OK') if self.ping else (503, b'not-ready')
        if path.startswith('/networks/'):
            if method == 'DELETE':
                return 204, b''
            return 200, json.dumps(self.network).encode()
        if '/logs?' in path:
            return 200, b'actual-bytes'
        if method == 'DELETE':
            self.objects.pop(path.split('/')[2].split('?')[0], None)
            return 204, b''
        raise AssertionError('Unexpected fake request: ' + path)

    def json(self, method, path, body=None, timeout=15, statuses=(200,)):
        self.calls.append((method, path, copy.deepcopy(body), timeout))
        if path.startswith('/containers/create?'):
            value = format(len(self.objects) + len([c for c in self.calls if c[1].startswith('/containers/create?')]), '064x')
            name = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)['name'][0]
            self.objects[value] = {'Id': value, 'Name': '/' + name, 'Image': IMAGE_ID,
                                   'Config': {'Labels': copy.deepcopy(body['Labels'])},
                                   'HostConfig': copy.deepcopy(body['HostConfig'])}
            return {'Id': value}
        if path.startswith('/containers/json?'):
            return [{'Id': value} for value in self.objects]
        if path.startswith('/images/'):
            return copy.deepcopy(IMAGE)
        identifier = path.split('/')[2].split('?')[0]
        if path.endswith('/json'):
            return copy.deepcopy(self.objects[identifier])
        if '/wait?' in path:
            self.wait_entered.set()
            if self.block_wait:
                self.kill_seen.wait(timeout=2)
            return {'StatusCode': 0}
        if '/kill?' in path:
            self.kill_seen.set()
        if method == 'DELETE':
            self.objects.pop(identifier, None)
        return None


def body(command=('sh', '-c', 'echo hello-sandbox')):
    return {'Image': broker.TEST_TAG, 'Cmd': list(command), 'Env': [],
            'HostConfig': {'NetworkMode': NETWORK, 'Memory': 268435456,
                           'NanoCpus': 500000000, 'CapDrop': ['ALL'],
                           'SecurityOpt': ['no-new-privileges'], 'ReadonlyRootfs': True,
                           'Tmpfs': {'/tmp': 'rw,noexec,nosuid,size=64m'}}}


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        # Windows pure boundary tests do not claim the Linux O_NOFOLLOW syscall was exercised.
        if not hasattr(broker.os, 'O_NOFOLLOW'):
            flag = patch.object(broker.os, 'O_NOFOLLOW', 0, create=True)
            flag.start(); self.addCleanup(flag.stop)
        self.daemon = FakeDaemon()
        self.fixture = broker.Broker(self.daemon, RUN, SOURCE, NETWORK_ID, IMAGE)

    def create(self, command=('sh', '-c', 'echo hello-sandbox')):
        return self.fixture.dispatch('POST', '/containers/create', json.dumps(body(command)).encode())[1]['Id']

    def assert_denied(self, callback, code=None):
        with self.assertRaises(broker.Denied) as caught:
            callback()
        if code:
            self.assertEqual(caught.exception.code, code)

    def test_real_daemon_ping_and_not_fake_availability(self):
        self.assertEqual(self.fixture.dispatch('GET', '/_ping')[1], b'OK')
        self.assertEqual(self.daemon.calls[-1][1], '/_ping')
        self.daemon.ping = False
        self.assert_denied(lambda: self.fixture.dispatch('GET', '/_ping'), 'DAEMON_NOT_READY')

    def test_image_overlay_preserves_real_digest_and_minimal_response(self):
        target = '/images/json?filters=' + urllib.parse.quote(json.dumps({'reference': [broker.TEST_TAG]}))
        result = self.fixture.dispatch('GET', target)[1]
        self.assertEqual(result, [{'Id': IMAGE_ID, 'RepoDigests': IMAGE['RepoDigests']}])
        self.assertEqual(self.daemon.calls, [])
        self.assert_denied(lambda: broker.Broker(self.daemon, RUN, SOURCE, NETWORK_ID, {'Id': IMAGE_ID, 'RepoDigests': ['alpine@sha256:' + 'e' * 64]}), 'REAL_PIN_IMAGE_REQUIRED')

    def test_seven_bounded_exact_commands_including_quota_true(self):
        for command, cap in broker.COMMAND_CAPS.items():
            for _ in range(cap):
                identifier = self.create(command)
                self.fixture.dispatch('DELETE', '/containers/' + identifier + '?force=true')
        self.assertEqual(self.fixture.creates, 7)
        self.assert_denied(lambda: self.create(('true',)), 'CREATE_BUDGET_EXHAUSTED')
        creates = [value for value in self.daemon.calls if value[1].startswith('/containers/create?')]
        self.assertEqual(len(creates), 7)
        for _, _, value, _ in creates:
            self.assertEqual(value['Image'], broker.PIN_REF)
            self.assertEqual(value['Labels'], broker.identities(RUN, SOURCE))
            self.assertEqual(value['HostConfig']['PidsLimit'], 64)
            self.assertFalse(any(key in value['HostConfig'] for key in ('Binds', 'Mounts', 'Privileged')))

    def test_rejects_arbitrary_commands_without_daemon_side_effect(self):
        for command in [('sh', '-c', 'cat /etc/shadow'), ('sleep', '999'), ('wget', 'http://host/'), ('true', '--anything')]:
            self.assert_denied(lambda: self.create(command), 'COMMAND_REJECTED')
        self.assertEqual(self.daemon.calls, [])

    def test_requires_original_host_security_and_rejects_extra_options(self):
        mutations = [lambda b: b['HostConfig'].pop('ReadonlyRootfs'),
                     lambda b: b['HostConfig'].update(ReadonlyRootfs=False),
                     lambda b: b['HostConfig'].update(Privileged=True),
                     lambda b: b['HostConfig'].update(Binds=['/:/host']),
                     lambda b: b['HostConfig'].update(NetworkMode='host'),
                     lambda b: b['HostConfig'].update(CapDrop=[]),
                     lambda b: b['HostConfig'].update(SecurityOpt=['seccomp=unconfined']),
                     lambda b: b['HostConfig'].update(Memory=268435456.0),
                     lambda b: b['HostConfig'].update(NanoCpus=0),
                     lambda b: b['HostConfig'].update(Tmpfs={'/tmp': 'rw,size=8g'}),
                     lambda b: b.update(Env=['SECRET=ignored']),
                     lambda b: b.update(Labels=broker.identities('f' * 40, SOURCE)),
                     lambda b: b.update(Image='alpine:3.19')]
        for mutate in mutations:
            value = body(); mutate(value)
            self.assert_denied(lambda: self.fixture.dispatch('POST', '/containers/create', json.dumps(value).encode()))
        self.assertEqual(self.daemon.calls, [])

    def test_foreign_ids_rejected_before_daemon_access(self):
        for target in ['/containers/' + 'f' * 64 + '/kill', '/containers/short/start', '/containers/' + 'f' * 64 + '?force=true']:
            self.assert_denied(lambda: self.fixture.dispatch('POST' if '/' in target.rsplit('/', 1)[-1] else 'DELETE', target))
        self.assertEqual(self.daemon.calls, [])

    def test_real_container_label_and_source_required_each_call(self):
        identifier = self.create()
        self.daemon.objects[identifier]['Config']['Labels']['jarvis.validation.sourceFingerprint'] = '0' * 64
        self.assert_denied(lambda: self.fixture.dispatch('POST', '/containers/' + identifier + '/start'), 'CONTAINER_LABEL_IDENTITY_MISMATCH')
        self.assertFalse(any(value[1].endswith('/start') for value in self.daemon.calls))

    def test_rejects_global_docker_and_mutating_endpoints(self):
        for method, target in [('GET', '/info'), ('GET', '/version'), ('GET', '/containers/json'),
                               ('POST', '/images/create?fromImage=alpine'), ('POST', '/build'),
                               ('POST', '/containers/' + 'f' * 64 + '/exec'), ('POST', '/networks/create')]:
            self.assert_denied(lambda: self.fixture.dispatch(method, target))
        self.assertEqual(self.daemon.calls, [])

    def test_path_and_query_ambiguities_rejected(self):
        for target in ['http://localhost/_ping', '//host/_ping', '/%5fping', '/_ping#x', '/_ping?x=%zz',
                       '/images/json?filters=%7B%7D&filters=%7B%7D', '/v1.999/_ping']:
            self.assert_denied(lambda: self.fixture.dispatch('GET', target))
        self.assertEqual(self.daemon.calls, [])

    def test_duplicate_json_nonfinite_and_malformed_json_rejected(self):
        for data in [b'{"Image":"alpine:3.20","Image":"alpine:3.20"}', b'{"x":NaN}', b'{"x":Infinity}', b'{']:
            self.assert_denied(lambda: self.fixture.dispatch('POST', '/containers/create', data))
        self.assertEqual(self.daemon.calls, [])

    def test_duplicate_content_length_transfer_encoding_and_limits(self):
        for fields in [[('Content-Length', '1'), ('Content-Length', '1')], [('Transfer-Encoding', 'chunked')],
                       [('Content-Length', '-1')], [('Content-Length', '16385')], [('Content-Length', '1,1')]]:
            headers = Message()
            for key, value in fields: headers[key] = value
            self.assert_denied(lambda: broker.body_length(headers))
        self.assertEqual(broker.body_length(Message()), 0)

    def test_timeout_kill_can_proceed_while_wait_is_blocked(self):
        identifier = self.create(('sleep', '30'))
        self.fixture.dispatch('POST', '/containers/' + identifier + '/start')
        self.daemon.block_wait = True
        results = []
        child = threading.Thread(target=lambda: results.append(self.fixture.dispatch('POST', '/containers/' + identifier + '/wait')))
        child.start()
        self.assertTrue(self.daemon.wait_entered.wait(timeout=1))
        self.fixture.dispatch('POST', '/containers/' + identifier + '/kill')
        child.join(timeout=1)
        self.assertFalse(child.is_alive())
        self.assertEqual(results[0][1], {'StatusCode': 0})

    def test_connection_actions_and_lifecycle_are_not_replayed(self):
        identifier = self.create()
        self.fixture.dispatch('POST', '/v1.41/containers/' + identifier + '/start')
        self.assert_denied(lambda: self.fixture.dispatch('POST', '/containers/' + identifier + '/start'), 'REPEATED_START')
        self.fixture.dispatch('GET', '/containers/' + identifier + '/logs?stdout=true&stderr=true')
        self.assert_denied(lambda: self.fixture.dispatch('GET', '/containers/' + identifier + '/logs?stdout=true&stderr=true'), 'INVALID_LOG_STATE')
        self.fixture.dispatch('DELETE', '/containers/' + identifier + '?force=true')
        self.assert_denied(lambda: self.fixture.dispatch('POST', '/containers/' + identifier + '/kill'), 'CONTAINER_ALREADY_REMOVED')

    def test_network_image_and_name_must_remain_owned(self):
        for mutation in [lambda v: v.update(Name='/business'), lambda v: v.update(Image='sha256:' + '0' * 64),
                         lambda v: v['HostConfig'].update(NetworkMode='business')]:
            daemon = FakeDaemon(); current = broker.Broker(daemon, RUN, SOURCE, NETWORK_ID, IMAGE)
            identifier = current.dispatch('POST', '/containers/create', json.dumps(body()).encode())[1]['Id']
            mutation(daemon.objects[identifier])
            self.assert_denied(lambda: current.dispatch('POST', '/containers/' + identifier + '/start'))
            self.assertFalse(any(value[1].endswith('/start') for value in daemon.calls))

    def test_controller_rejects_pid_reuse_or_cross_run_argv(self):
        state = {'pid': 2000, 'processStartTicks': '50'}
        valid = {'pid': 2000, 'startTicks': '50', 'argv': [control.PYTHON, str(control.BROKER_FILE), '--serve', RUN, SOURCE]}
        with patch.object(control, 'process_identity', return_value=valid):
            self.assertTrue(control.expected_process(state, RUN, SOURCE))
            self.assertFalse(control.expected_process(state, 'f' * 40, SOURCE))
        with patch.object(control, 'process_identity', return_value=dict(valid, startTicks='51')):
            self.assertFalse(control.expected_process(state, RUN, SOURCE))

    def test_independent_cleanup_recovers_unjournaled_owned_container(self):
        identifier = self.create()
        state = {'runId': RUN, 'sourceFingerprint': SOURCE, 'networkId': NETWORK_ID, 'realImageId': IMAGE_ID}
        with tempfile.TemporaryDirectory() as directory, patch.object(broker, 'atomic_json'):
            result = control.cleanup(broker, self.daemon, Path(directory), state, broker.identities(RUN, SOURCE), NETWORK)
        self.assertTrue(result['ok'])
        self.assertIn(identifier, result['removedContainerIds'])
        query = next(value[1] for value in self.daemon.calls if value[1].startswith('/containers/json?'))
        self.assertEqual(json.loads(urllib.parse.parse_qs(urllib.parse.urlsplit(query).query)['filters'][0]),
                         {'label': [key + '=' + value for key, value in broker.identities(RUN, SOURCE).items()]})

    def test_cleanup_never_removes_cross_source_container(self):
        identifier = self.create()
        self.daemon.objects[identifier]['Config']['Labels']['jarvis.validation.sourceFingerprint'] = '0' * 64
        state = {'runId': RUN, 'sourceFingerprint': SOURCE, 'networkId': NETWORK_ID, 'realImageId': IMAGE_ID}
        with tempfile.TemporaryDirectory() as directory, patch.object(broker, 'atomic_json'):
            self.assert_denied(lambda: control.cleanup(broker, self.daemon, Path(directory), state, broker.identities(RUN, SOURCE), NETWORK), 'CLEANUP_CONTAINER_IDENTITY_MISMATCH')
        self.assertFalse(any(value[0] == 'DELETE' for value in self.daemon.calls))

    def test_pidfd_open_precedes_identity_validation_and_closes_foreign_handle(self):
        state = {'pid': 2000, 'processStartTicks': '50'}
        sequence = []
        with patch.object(control.os, 'pidfd_open', create=True, side_effect=lambda *_: sequence.append('opened') or 42), \
                patch.object(control.signal, 'pidfd_send_signal', create=True), \
                patch.object(control.os, 'close') as close, \
                patch.object(control, 'expected_process', side_effect=lambda *_: sequence.append('checked') or False):
            self.assert_denied(lambda: control.owned_pidfd(broker, state, RUN, SOURCE), 'BROKER_PROCESS_IDENTITY_MISMATCH')
            close.assert_called_once_with(42)
        self.assertEqual(sequence, ['opened', 'checked'])

    def test_termination_only_signals_pinned_descriptor(self):
        with patch.object(control.signal, 'pidfd_send_signal', create=True) as send, \
                patch.object(control.signal, 'SIGKILL', 9, create=True), \
                patch.object(control.select, 'select', side_effect=[([], [], []), ([42], [], [])]), \
                patch.object(control.os, 'kill') as numeric_kill:
            control.terminate_pidfd(42, grace=0)
            self.assertEqual(send.call_args_list[0].args, (42, control.signal.SIGTERM))
            self.assertEqual(send.call_args_list[1].args, (42, control.signal.SIGKILL))
            numeric_kill.assert_not_called()

    def test_launch_before_journal_window_cannot_report_clean(self):
        state = {'runId': RUN, 'sourceFingerprint': SOURCE, 'networkId': NETWORK_ID,
                 'realImageId': IMAGE_ID, 'brokerLaunchIntent': True}
        with tempfile.TemporaryDirectory() as directory, patch.object(broker, 'atomic_json'):
            result = control.cleanup(broker, self.daemon, Path(directory), state, broker.identities(RUN, SOURCE), NETWORK)
        self.assertFalse(result['ok'])
        self.assertIn('BROKER_PROCESS_OUTCOME_UNRESOLVED', result['errors'])

    def test_unresolved_create_intent_cannot_report_clean(self):
        state = {'runId': RUN, 'sourceFingerprint': SOURCE, 'networkId': NETWORK_ID, 'realImageId': IMAGE_ID}
        registry = {'runId': RUN, 'sourceFingerprint': SOURCE, 'labels': broker.identities(RUN, SOURCE),
                    'createIntents': [{'name': 'jarvis-ft-' + RUN + '-sandbox-1', 'status': 'pending'}]}
        with tempfile.TemporaryDirectory() as directory, patch.object(broker, 'atomic_json'), patch.object(broker, 'trusted', side_effect=lambda value, *_: value):
            Path(directory, 'registry.json').write_text(json.dumps(registry))
            result = control.cleanup(broker, self.daemon, Path(directory), state, broker.identities(RUN, SOURCE), NETWORK)
        self.assertFalse(result['ok'])
        self.assertIn('CREATE_OUTCOME_UNRESOLVED', result['errors'])

    def test_connection_budget_rejects_flood_and_expired_lifetime(self):
        budget = broker.ConnectionBudget()
        self.assertTrue(all(budget.admit() for _ in range(200)))
        self.assertFalse(budget.admit())
        expired = broker.ConnectionBudget()
        expired.started -= broker.MAX_LIFETIME_SECONDS + 1
        self.assertFalse(expired.admit())

    def test_actual_image_identity_and_digest_are_never_synthesized(self):
        old_pin = 'sha256:bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731'
        for wrong in [dict(IMAGE, Id=old_pin), dict(IMAGE, RepoDigests=['alpine@' + old_pin]),
                      dict(IMAGE, RepoDigests=None), dict(IMAGE, RepoDigests=['foreign@' + broker.PIN])]:
            self.assert_denied(lambda: broker.Broker(self.daemon, RUN, SOURCE, NETWORK_ID, wrong), 'REAL_PIN_IMAGE_REQUIRED')
        self.assertEqual(self.fixture.dispatch('GET', '/images/json?filters=' + urllib.parse.quote(json.dumps({'reference': [broker.TEST_TAG]}), safe=''))[1],
                         [{'Id': IMAGE_ID, 'RepoDigests': IMAGE['RepoDigests']}])

    def test_short_runtime_path_is_75_bytes_and_never_accepts_cross_run_path(self):
        self.assertEqual(broker.runtime_socket(RUN).as_posix(), '/run/jarvis-ft-sandbox/' + RUN + '/docker.sock')
        self.assertEqual(len(str(broker.runtime_socket(RUN)).encode()), 75)
        self.assert_denied(lambda: broker.runtime_socket('../' + RUN), 'FIXTURE_IDENTITY_REQUIRED')
        with patch.object(broker, 'RUNTIME_ROOT', Path('/run/' + 'x' * 80)):
            self.assert_denied(lambda: broker.runtime_socket(RUN), 'AF_UNIX_PATH_LIMIT')

    def runtime_metadata(self, real_lstat, bad=None, socket_kind=None, socket_uid=1000):
        def metadata(path):
            info = real_lstat(path)
            if bad and path == bad[0]:
                return SimpleNamespace(st_mode=bad[1], st_uid=bad[2])
            if path.name == 'docker.sock' and socket_kind is not None:
                return SimpleNamespace(st_mode=socket_kind | 0o600, st_uid=socket_uid)
            return SimpleNamespace(st_mode=(stat.S_IFDIR | 0o700) if stat.S_ISDIR(info.st_mode) else (stat.S_IFREG | 0o600), st_uid=0)
        return metadata

    def test_runtime_parent_group_write_nonroot_and_symlink_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary) / 'runtime'; base.mkdir()
            real_lstat = Path.lstat
            for mode, uid in [(stat.S_IFDIR | 0o770, 0), (stat.S_IFDIR | 0o700, 1000), (stat.S_IFLNK | 0o700, 0)]:
                with patch.object(broker, 'RUNTIME_ROOT', base), patch.object(Path, 'lstat', self.runtime_metadata(real_lstat, (base, mode, uid))):
                    self.assert_denied(lambda: broker.prepare_runtime(RUN, SOURCE), 'ROOT_OWNED_BOUNDARY_REQUIRED')
                self.assertFalse((base / RUN).exists())

    def test_runtime_rejects_non_private_parent_and_existing_run_without_chmod(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary) / 'runtime'; base.mkdir()
            real_lstat = Path.lstat
            with patch.object(broker, 'RUNTIME_ROOT', base), patch.object(Path, 'lstat', self.runtime_metadata(real_lstat, (base, stat.S_IFDIR | 0o755, 0))):
                self.assert_denied(lambda: broker.prepare_runtime(RUN, SOURCE), 'ROOT_PRIVATE_RUNTIME_DIRECTORY_REQUIRED')
            with patch.object(broker, 'RUNTIME_ROOT', base), patch.object(Path, 'lstat', self.runtime_metadata(real_lstat)):
                existing = base / RUN; existing.mkdir(); marker = existing / 'owner.json'; marker.write_text('must-stay')
                self.assert_denied(lambda: broker.prepare_runtime(RUN, SOURCE), 'NEW_RUNTIME_DIRECTORY_REQUIRED')
                self.assertEqual(marker.read_text(), 'must-stay')

    def test_runtime_owner_source_mismatch_and_unknown_entry_preserve_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary) / 'runtime'
            real_lstat = Path.lstat
            with patch.object(broker, 'RUNTIME_ROOT', base), patch.object(Path, 'lstat', self.runtime_metadata(real_lstat)):
                sock = broker.prepare_runtime(RUN, SOURCE)
                owner = sock.parent / 'owner.json'
                owner.write_text(json.dumps({'runId': RUN, 'sourceFingerprint': 'f' * 64}))
                self.assert_denied(lambda: broker.cleanup_runtime(RUN, SOURCE), 'RUNTIME_OWNER_IDENTITY_MISMATCH')
                self.assertTrue(owner.exists())
                owner.write_text(json.dumps({'runId': RUN, 'sourceFingerprint': SOURCE}))
                other = sock.parent / 'unexpected'; other.write_text('must-stay')
                self.assert_denied(lambda: broker.cleanup_runtime(RUN, SOURCE), 'RUNTIME_UNEXPECTED_ENTRY')
                self.assertTrue(other.exists()); self.assertTrue(owner.exists())

    def test_runtime_cleanup_only_removes_owned_socket_marker_and_empty_run_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary) / 'runtime'
            real_lstat = Path.lstat
            with patch.object(broker, 'RUNTIME_ROOT', base), patch.object(Path, 'lstat', self.runtime_metadata(real_lstat, socket_kind=stat.S_IFSOCK)):
                sock = broker.prepare_runtime(RUN, SOURCE)
                sock.write_bytes(b'fake-socket-boundary-only')
                foreign = base / ('f' * 40); foreign.mkdir(); (foreign / 'must-stay').write_text('other-run')
                result = broker.cleanup_runtime(RUN, SOURCE)
                self.assertEqual(result, {'socketRemoved': True, 'runtimeDirectoryRemoved': True})
                self.assertFalse(sock.parent.exists()); self.assertTrue(base.exists()); self.assertTrue((foreign / 'must-stay').exists())

    def test_runtime_cleanup_refuses_regular_file_or_wrong_socket_owner(self):
        for kind, uid in [(stat.S_IFREG, 1000), (stat.S_IFSOCK, 0)]:
            with tempfile.TemporaryDirectory() as temporary:
                base = Path(temporary) / 'runtime'; real_lstat = Path.lstat
                with patch.object(broker, 'RUNTIME_ROOT', base), patch.object(Path, 'lstat', self.runtime_metadata(real_lstat, socket_kind=kind, socket_uid=uid)):
                    sock = broker.prepare_runtime(RUN, SOURCE); sock.write_bytes(b'must-stay')
                    self.assert_denied(lambda: broker.cleanup_runtime(RUN, SOURCE), 'CLEANUP_SOCKET_IDENTITY_MISMATCH')
                    self.assertTrue(sock.exists()); self.assertTrue((sock.parent / 'owner.json').exists())

    def test_controller_rejects_foreign_socket_path_before_daemon_actions(self):
        state = {'runId': RUN, 'sourceFingerprint': SOURCE, 'networkId': NETWORK_ID,
                 'realImageId': IMAGE_ID, 'socketPath': '/run/other/docker.sock'}
        with tempfile.TemporaryDirectory() as directory:
            self.assert_denied(lambda: control.cleanup(broker, self.daemon, Path(directory), state, broker.identities(RUN, SOURCE), NETWORK), 'CONTROL_SOCKET_IDENTITY_MISMATCH')
        self.assertEqual(self.daemon.calls, [])

    def test_real_bind_entry_refuses_non_linux_without_creating_socket(self):
        with patch.object(control.sys, 'platform', 'win32'), patch.object(broker, 'prepare_runtime') as prepare:
            self.assert_denied(lambda: control.check_bind(broker, RUN, SOURCE), 'LINUX_ROOT_BIND_CHECK_REQUIRED')
        prepare.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
