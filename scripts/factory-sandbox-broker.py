#!/usr/bin/python3
"""A per-run Engine API fixture. Never expose the host daemon socket to tests."""
import collections
import hashlib
import http.client
import http.server
import json
import os
from pathlib import Path
import re
import signal
import socket
import socketserver
import stat
import struct
import threading
import time
import urllib.parse

ROOT = Path('/var/lib/jarvis-development/101/full-validation')
TOOLS = Path('/opt/jarvis-development/software-factory')
RUNTIME_ROOT = Path('/run/jarvis-ft-sandbox')
DAEMON_SOCKET = '/run/docker.sock'
# This is the real local image identity recorded by the read-only 101 inspection.
# The original product test's bf8527... pin is intentionally NOT manufactured.
PIN = 'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'
PIN_REF = 'alpine@' + PIN
TEST_TAG = 'alpine:3.20'
NODE_UID = 1000
MAX_CREATES = 7
MAX_ACTIVE = 2
MAX_LIFETIME_SECONDS = 1800
LABEL_ROLE = 'sandbox-six-case-fixture'
COMMAND_CAPS = {
    ('sh', '-c', 'echo hello-sandbox'): 1,
    ('wget', '-T', '3', '-q', '-O', '-', 'http://example.com/'): 1,
    ('sh', '-c', 'touch /x 2>/dev/null; echo root=$?; touch /tmp/y; echo tmp=$?'): 1,
    ('sleep', '30'): 1,
    ('sleep', '5'): 2,
    ('true',): 1,
}


class Denied(Exception):
    def __init__(self, code, status=403):
        self.code, self.status = code, status
        super().__init__(code)


def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise Denied('DUPLICATE_JSON_KEY', 400)
            result[key] = value
        return result
    def constant(_):
        raise Denied('NON_FINITE_JSON', 400)
    try:
        return json.loads(data, object_pairs_hook=pairs, parse_constant=constant)
    except (ValueError, UnicodeDecodeError):
        raise Denied('INVALID_JSON', 400) from None


def identities(run_id, fingerprint):
    if not re.fullmatch('[0-9a-f]{40}', run_id) or not re.fullmatch('[0-9a-f]{64}', fingerprint):
        raise Denied('FIXTURE_IDENTITY_REQUIRED')
    return {
        'jarvis.validation.runId': run_id,
        'jarvis.validation.sourceFingerprint': fingerprint,
        'jarvis.validation.role': LABEL_ROLE,
    }


def trusted(path, directory=False):
    path = Path(path)
    for item in [path, *path.parents]:
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise Denied('ROOT_OWNED_BOUNDARY_REQUIRED')
    if directory and not path.is_dir():
        raise Denied('TRUSTED_DIRECTORY_REQUIRED')
    return path


def atomic_json(path, value):
    trusted(path.parent, True)
    if path.exists():
        trusted(path)
    temporary = path.with_name(path.name + '.tmp-' + str(os.getpid()) + '-' + threading.current_thread().name)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def context(run_id, fingerprint):
    labels = identities(run_id, fingerprint)
    directory = trusted(ROOT / run_id, True)
    copied = strict_json(trusted(directory / 'copy.json').read_bytes())
    if copied.get('sha256') != fingerprint:
        raise Denied('SOURCE_FINGERPRINT_MISMATCH')
    return directory, labels, 'jarvis-ft-' + run_id + '-sandbox-net'


def runtime_socket(run_id):
    if not re.fullmatch('[0-9a-f]{40}', run_id):
        raise Denied('FIXTURE_IDENTITY_REQUIRED')
    result = RUNTIME_ROOT / run_id / 'docker.sock'
    if len(os.fsencode(str(result))) > 107:
        raise Denied('AF_UNIX_PATH_LIMIT')
    return result


def trusted_runtime(run_id, fingerprint):
    identities(run_id, fingerprint)
    sock = runtime_socket(run_id)
    for directory in (RUNTIME_ROOT, sock.parent):
        trusted(directory, True)
        if stat.S_IMODE(directory.lstat().st_mode) != 0o700:
            raise Denied('ROOT_PRIVATE_RUNTIME_DIRECTORY_REQUIRED')
    owner = strict_json(trusted(sock.parent / 'owner.json').read_bytes())
    if owner != {'runId': run_id, 'sourceFingerprint': fingerprint}:
        raise Denied('RUNTIME_OWNER_IDENTITY_MISMATCH')
    return sock


def prepare_runtime(run_id, fingerprint):
    identities(run_id, fingerprint)
    sock = runtime_socket(run_id)
    trusted(RUNTIME_ROOT.parent, True)
    if not RUNTIME_ROOT.exists() and not RUNTIME_ROOT.is_symlink():
        RUNTIME_ROOT.mkdir(mode=0o700)
    trusted(RUNTIME_ROOT, True)
    if stat.S_IMODE(RUNTIME_ROOT.lstat().st_mode) != 0o700:
        raise Denied('ROOT_PRIVATE_RUNTIME_DIRECTORY_REQUIRED')
    if sock.parent.exists() or sock.parent.is_symlink():
        raise Denied('NEW_RUNTIME_DIRECTORY_REQUIRED')
    sock.parent.mkdir(mode=0o700)
    atomic_json(sock.parent / 'owner.json', {'runId': run_id, 'sourceFingerprint': fingerprint})
    return trusted_runtime(run_id, fingerprint)


def cleanup_runtime(run_id, fingerprint):
    identities(run_id, fingerprint)
    sock = runtime_socket(run_id)
    if not RUNTIME_ROOT.exists() and not RUNTIME_ROOT.is_symlink():
        return {'socketRemoved': True, 'runtimeDirectoryRemoved': True}
    trusted(RUNTIME_ROOT, True)
    if stat.S_IMODE(RUNTIME_ROOT.lstat().st_mode) != 0o700:
        raise Denied('ROOT_PRIVATE_RUNTIME_DIRECTORY_REQUIRED')
    if not sock.parent.exists() and not sock.parent.is_symlink():
        return {'socketRemoved': True, 'runtimeDirectoryRemoved': True}
    trusted_runtime(run_id, fingerprint)
    # No recursive deletion, unrelated run removal or shared-base cleanup is allowed.
    entries = list(sock.parent.iterdir())
    owner_file = sock.parent / 'owner.json'
    if any(entry not in (sock, owner_file) for entry in entries):
        raise Denied('RUNTIME_UNEXPECTED_ENTRY')
    if sock.exists() or sock.is_symlink():
        info = sock.lstat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != NODE_UID or stat.S_IMODE(info.st_mode) != 0o600:
            raise Denied('CLEANUP_SOCKET_IDENTITY_MISMATCH')
        sock.unlink()
    owner_file.unlink()
    sock.parent.rmdir()
    return {'socketRemoved': True, 'runtimeDirectoryRemoved': True}


class UnixConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(DAEMON_SOCKET)


class Daemon:
    def request(self, method, path, body=None, timeout=15):
        connection = UnixConnection('localhost', timeout=timeout)
        headers = {}
        encoded = None
        if body is not None:
            encoded = json.dumps(body, separators=(',', ':'), allow_nan=False).encode()
            headers['Content-Type'] = 'application/json'
        try:
            connection.request(method, path, body=encoded, headers=headers)
            response = connection.getresponse()
            data = response.read(1_048_577)
            if len(data) > 1_048_576:
                raise Denied('DAEMON_RESPONSE_LIMIT', 502)
            return response.status, data
        except (OSError, http.client.HTTPException, TimeoutError):
            raise Denied('DAEMON_REQUEST_FAILED', 502) from None
        finally:
            connection.close()

    def json(self, method, path, body=None, timeout=15, statuses=(200,)):
        code, data = self.request(method, path, body, timeout)
        if code not in statuses:
            raise Denied('DAEMON_OPERATION_FAILED', 502)
        return strict_json(data) if data else None


def split_target(target):
    if not isinstance(target, str) or len(target) > 4096 or not target.startswith('/') or target.startswith('//'):
        raise Denied('INVALID_REQUEST_TARGET', 400)
    parts = urllib.parse.urlsplit(target)
    if parts.scheme or parts.netloc or parts.fragment or '%' in parts.path or '\\' in parts.path:
        raise Denied('INVALID_REQUEST_TARGET', 400)
    if re.search('%(?![0-9a-fA-F]{2})', parts.query):
        raise Denied('INVALID_QUERY_ENCODING', 400)
    path = re.sub(r'^/v1\.[2-9][0-9](?=/)', '', parts.path)
    items = urllib.parse.parse_qsl(parts.query, keep_blank_values=True, strict_parsing=True)
    if len({key for key, _ in items}) != len(items):
        raise Denied('DUPLICATE_QUERY', 400)
    return path, dict(items)


def body_length(headers):
    lengths = headers.get_all('Content-Length', [])
    if len(lengths) > 1 or headers.get_all('Transfer-Encoding', []):
        raise Denied('AMBIGUOUS_BODY_FRAMING', 400)
    if lengths and not re.fullmatch(r'[0-9]{1,5}', lengths[0]):
        raise Denied('CONTENT_LENGTH_REJECTED', 400)
    length = int(lengths[0]) if lengths else 0
    if length > 16384:
        raise Denied('REQUEST_BODY_LIMIT', 413)
    return length


class Broker:
    def __init__(self, daemon, run_id, fingerprint, network_id, image, persist=None):
        self.labels = identities(run_id, fingerprint)
        self.daemon, self.run_id, self.fingerprint = daemon, run_id, fingerprint
        self.network_name = 'jarvis-ft-' + run_id + '-sandbox-net'
        self.network_id = network_id
        self.image = image
        self.lock = threading.RLock()
        self.command_counts = collections.Counter()
        self.containers = {}
        self.create_intents = []
        self.requests = 0
        self.creates = 0
        self.stopping = False
        self.persist = persist
        self.started = time.monotonic()
        digests = image.get('RepoDigests') or []
        if image.get('Id') != PIN or PIN_REF not in digests:
            raise Denied('REAL_PIN_IMAGE_REQUIRED')

    def _save(self):
        if self.persist:
            self.persist({'runId': self.run_id, 'sourceFingerprint': self.fingerprint,
                          'labels': self.labels, 'network': self.network_name,
                          'networkId': self.network_id, 'creates': self.creates,
                          'containers': self.containers, 'createIntents': self.create_intents,
                          'requestCount': self.requests})

    def _owned(self, container_id):
        if not re.fullmatch('[0-9a-f]{64}', container_id) or container_id not in self.containers:
            raise Denied('CONTAINER_OUTSIDE_BROKER')
        item = self.containers[container_id]
        if item.get('removed'):
            raise Denied('CONTAINER_ALREADY_REMOVED', 404)
        current = self.daemon.json('GET', '/containers/' + container_id + '/json')
        if current.get('Id') != container_id or current.get('Config', {}).get('Labels') != self.labels:
            raise Denied('CONTAINER_LABEL_IDENTITY_MISMATCH')
        if current.get('Name') != '/' + item['name'] or current.get('Image') != self.image['Id']:
            raise Denied('CONTAINER_SPEC_IDENTITY_MISMATCH')
        if current.get('HostConfig', {}).get('NetworkMode') != self.network_name:
            raise Denied('CONTAINER_NETWORK_IDENTITY_MISMATCH')
        return item

    def _create(self, body, query):
        if query or not isinstance(body, dict) or set(body) != {'Image', 'Cmd', 'Env', 'HostConfig'}:
            raise Denied('CREATE_SCHEMA_REJECTED')
        if body['Image'] != TEST_TAG or body['Env'] != [] or not isinstance(body['Env'], list):
            raise Denied('IMAGE_OR_ENV_REJECTED')
        cmd = body['Cmd']
        if not isinstance(cmd, list) or any(not isinstance(value, str) for value in cmd):
            raise Denied('COMMAND_REJECTED')
        command = tuple(cmd)
        if command not in COMMAND_CAPS:
            raise Denied('COMMAND_REJECTED')
        host = body['HostConfig']
        expected = {'NetworkMode': self.network_name, 'Memory': 268435456, 'NanoCpus': 500000000,
                    'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges'],
                    'ReadonlyRootfs': True, 'Tmpfs': {'/tmp': 'rw,noexec,nosuid,size=64m'}}
        if not isinstance(host, dict) or set(host) != set(expected) or host != expected:
            raise Denied('HOST_CONFIGURATION_REJECTED')
        if type(host['Memory']) is not int or type(host['NanoCpus']) is not int or type(host['ReadonlyRootfs']) is not bool:
            raise Denied('HOST_CONFIGURATION_REJECTED')
        with self.lock:
            if self.stopping or self.creates >= MAX_CREATES or self.command_counts[command] >= COMMAND_CAPS[command]:
                raise Denied('CREATE_BUDGET_EXHAUSTED', 409)
            if sum(not value.get('removed') for value in self.containers.values()) >= MAX_ACTIVE:
                raise Denied('FIXTURE_ACTIVE_BUDGET', 409)
            self.creates += 1
            self.command_counts[command] += 1
            name = 'jarvis-ft-' + self.run_id + '-sandbox-' + str(self.creates)
            # Record intent before the daemon side effect, allowing scoped cleanup after lost replies.
            intent = {'name': name, 'status': 'pending'}
            self.create_intents.append(intent)
            self._save()
            safe_host = dict(expected, PidsLimit=64)
            try:
                result = self.daemon.json('POST', '/containers/create?name=' + name,
                                          {'Image': PIN_REF, 'Cmd': cmd, 'Env': [],
                                           'Labels': self.labels, 'HostConfig': safe_host}, statuses=(201,))
            except Exception:
                intent['status'] = 'outcome-unknown'
                self._save()
                raise
            container_id = result.get('Id', '')
            if not re.fullmatch('[0-9a-f]{64}', container_id) or container_id in self.containers:
                raise Denied('DAEMON_CONTAINER_ID_INVALID', 502)
            self.containers[container_id] = {'name': name, 'started': False, 'waited': False,
                                              'logsRead': False, 'killed': False, 'removed': False}
            intent.update(status='acknowledged', containerId=container_id)
            self._save()
            return 201, {'Id': container_id, 'Warnings': []}, 'application/json'

    def dispatch(self, method, target, data=b''):
        with self.lock:
            self.requests += 1
            if self.requests > 150 or self.stopping or time.monotonic() - self.started > MAX_LIFETIME_SECONDS:
                raise Denied('FIXTURE_REQUEST_BUDGET')
        try:
            path, query = split_target(target)
        except ValueError:
            raise Denied('INVALID_QUERY', 400) from None
        if method == 'GET' and path == '/_ping' and not query and not data:
            code, actual = self.daemon.request('GET', '/_ping')
            if code != 200 or actual.strip() != b'OK':
                raise Denied('DAEMON_NOT_READY', 503)
            return 200, b'OK', 'text/plain'
        if method == 'GET' and path == '/images/json' and not data:
            if set(query) != {'filters'} or strict_json(query['filters']) != {'reference': [TEST_TAG]}:
                raise Denied('IMAGE_QUERY_REJECTED')
            # A documented private logical tag overlay, backed by a genuinely inspected RepoDigest.
            return 200, [{'Id': self.image['Id'], 'RepoDigests': self.image['RepoDigests']}], 'application/json'
        if method == 'POST' and path == '/containers/create':
            return self._create(strict_json(data), query)
        match = re.fullmatch(r'/containers/([0-9a-f]{64})(?:/(start|wait|logs|kill))?', path)
        if not match or data:
            raise Denied('ENDPOINT_NOT_ALLOWED')
        container_id, action = match.groups()
        with self.lock:
            item = self._owned(container_id)
            if method == 'POST' and action == 'start' and not query:
                if item['started']:
                    raise Denied('REPEATED_START')
                self.daemon.json('POST', '/containers/' + container_id + '/start', statuses=(204,))
                item['started'] = True
                self._save()
                return 204, b'', 'application/json'
            if method == 'POST' and action == 'kill' and query in ({}, {'signal': 'SIGKILL'}):
                if not item['started'] or item['killed']:
                    raise Denied('INVALID_KILL_STATE')
                self.daemon.json('POST', '/containers/' + container_id + '/kill?signal=SIGKILL', statuses=(204, 409))
                item['killed'] = True
                self._save()
                return 204, b'', 'application/json'
            if method == 'DELETE' and action is None and set(query) == {'force'} and query['force'] in ('true', '1'):
                self.daemon.json('DELETE', '/containers/' + container_id + '?force=true', statuses=(204,))
                item['removed'] = True
                self._save()
                return 204, b'', 'application/json'
            if method == 'GET' and action == 'logs' and set(query) == {'stdout', 'stderr'} and all(v in ('true', '1') for v in query.values()):
                if not item['started'] or item['logsRead']:
                    raise Denied('INVALID_LOG_STATE')
                item['logsRead'] = True
                self._save()
            elif method == 'POST' and action == 'wait' and query in ({}, {'condition': 'not-running'}):
                if not item['started'] or item['waited']:
                    raise Denied('INVALID_WAIT_STATE')
                item['waited'] = True
                self._save()
            else:
                raise Denied('ENDPOINT_OR_QUERY_NOT_ALLOWED')
        # Wait must release the broker lock so the timeout kill request can proceed.
        if action == 'wait':
            result = self.daemon.json('POST', '/containers/' + container_id + '/wait?condition=not-running', timeout=65)
            if type(result.get('StatusCode')) is not int:
                raise Denied('INVALID_WAIT_RESPONSE', 502)
            return 200, {'StatusCode': result['StatusCode']}, 'application/json'
        code, result = self.daemon.request('GET', '/containers/' + container_id + '/logs?stdout=true&stderr=true')
        if code != 200:
            raise Denied('LOG_READ_FAILED', 502)
        return 200, result, 'application/vnd.docker.raw-stream'


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def log_message(self, *_):
        pass

    def handle_one_request(self):
        self.connection.settimeout(15)
        super().handle_one_request()

    def perform(self):
        self.close_connection = True
        try:
            _, uid, _ = struct.unpack('3i', self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid != NODE_UID:
                raise Denied('NODE_UID_REQUIRED')
            length = body_length(self.headers)
            data = self.rfile.read(length) if length else b''
            if len(data) != length:
                raise Denied('INCOMPLETE_REQUEST_BODY', 400)
            code, result, content_type = self.server.broker.dispatch(self.command, self.path, data)
        except Denied as error:
            code, result, content_type = error.status, {'message': error.code}, 'application/json'
        except Exception:
            code, result, content_type = 502, {'message': 'FIXTURE_REQUEST_FAILED'}, 'application/json'
        encoded = result if isinstance(result, bytes) else json.dumps(result, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(encoded)

    do_GET = perform
    do_POST = perform
    do_DELETE = perform
    do_PUT = perform
    do_PATCH = perform


class ConnectionBudget:
    def __init__(self):
        self.count = 0
        self.lock = threading.Lock()
        self.started = time.monotonic()

    def admit(self):
        with self.lock:
            if self.count >= 200 or time.monotonic() - self.started > MAX_LIFETIME_SECONDS:
                return False
            self.count += 1
            return True


class UnixServer(socketserver.ThreadingMixIn, getattr(socketserver, 'UnixStreamServer', socketserver.TCPServer)):
    # The Windows fallback only allows importing pure validators; serve() rejects it.
    daemon_threads = False
    block_on_close = True
    allow_reuse_address = False
    request_queue_size = 8

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(8)
        self.connection_budget = ConnectionBudget()
        self.budget_shutdown_started = False
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.connection_budget.admit():
            self.shutdown_request(request)
            if not self.budget_shutdown_started:
                self.budget_shutdown_started = True
                self.broker.stopping = True
                threading.Thread(target=self.shutdown, daemon=True).start()
            return
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def serve(run_id, fingerprint):
    if not hasattr(socketserver, 'UnixStreamServer') or not hasattr(socket, 'SO_PEERCRED'):
        raise Denied('UNIX_FIXTURE_PLATFORM_REQUIRED')
    if os.geteuid() != 0:
        raise Denied('ROOT_REQUIRED')
    trusted(Path(__file__).absolute())
    directory, labels, network = context(run_id, fingerprint)
    fixture = trusted(directory / 'sandbox-broker', True)
    daemon = Daemon()
    state = strict_json(trusted(fixture / 'control.json').read_bytes())
    if state.get('runId') != run_id or state.get('sourceFingerprint') != fingerprint or state.get('labels') != labels:
        raise Denied('CONTROL_IDENTITY_MISMATCH')
    actual_network = daemon.json('GET', '/networks/' + state['networkId'])
    if actual_network.get('Name') != network or actual_network.get('Internal') is not True or actual_network.get('Labels') != labels:
        raise Denied('INTERNAL_NETWORK_REQUIRED')
    image = daemon.json('GET', '/images/' + urllib.parse.quote(PIN_REF, safe='') + '/json')
    broker = Broker(daemon, run_id, fingerprint, state['networkId'], image,
                    lambda value: atomic_json(fixture / 'registry.json', value))
    broker._save()
    sock = trusted_runtime(run_id, fingerprint)
    if state.get('socketPath') != str(sock):
        raise Denied('CONTROL_SOCKET_IDENTITY_MISMATCH')
    if sock.exists() or sock.is_symlink():
        raise Denied('NEW_SOCKET_REQUIRED')
    server = UnixServer(str(sock), Handler)
    os.chown(sock, NODE_UID, NODE_UID)
    os.chmod(sock, 0o600)
    server.broker = broker
    atomic_json(fixture / 'ready.json', {'runId': run_id, 'sourceFingerprint': fingerprint,
                'pid': os.getpid(), 'networkId': state['networkId'], 'network': network,
                'processStartTicks': Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()[19],
                'realImageId': image['Id'], 'realRepoDigests': image.get('RepoDigests'),
                'virtualReference': TEST_TAG, 'actualPinnedReference': PIN_REF,
                'socketPath': str(sock), 'socketPathBytes': len(os.fsencode(str(sock))),
                'maxCreates': MAX_CREATES, 'maxActive': MAX_ACTIVE,
                'hostDaemonSocketExposedToTests': False, 'socketUid': NODE_UID, 'socketMode': '0600'})
    def stop(*_):
        broker.stopping = True
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    timer = threading.Timer(MAX_LIFETIME_SECONDS, stop)
    timer.daemon = True
    timer.start()
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        timer.cancel()
        server.server_close()
        sock.unlink(missing_ok=True)
        # The root controller also independently recovers the create-before-reply window.
        for container_id in list(broker.containers):
            try:
                item = broker._owned(container_id)
                daemon.json('DELETE', '/containers/' + container_id + '?force=true', statuses=(204,))
                item['removed'] = True
                broker._save()
            except Denied:
                pass


if __name__ == '__main__':
    import sys
    try:
        if len(sys.argv) != 4 or sys.argv[1] != '--serve':
            raise Denied('FIXED_SERVE_ARGUMENTS_REQUIRED')
        serve(sys.argv[2], sys.argv[3])
    except Denied as error:
        print(json.dumps({'ok': False, 'code': error.code}), flush=True)
        raise SystemExit(2)
