#!/usr/bin/python3
"""Root-only, fixed-scope lifecycle for the six-case sandbox fixture."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import stat
import subprocess
import sys
import time
import urllib.parse

TOOLS = Path('/opt/jarvis-development/software-factory')
BROKER_FILE = TOOLS / 'factory-sandbox-broker-r28.py'
PYTHON = '/usr/bin/python3'


def load_broker():
    # Do not import a root-executed module before checking its entire filesystem boundary.
    for file in [Path(__file__).absolute(), BROKER_FILE, Path(PYTHON).resolve()]:
        for part in [file, *file.parents]:
            info = part.lstat()
            if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError('ROOT_OWNED_TOOL_BOUNDARY_REQUIRED')
    spec = importlib.util.spec_from_file_location('fixed_sandbox_broker', BROKER_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def process_identity(pid):
    if type(pid) is not int or pid <= 1:
        return None
    try:
        proc = Path('/proc') / str(pid)
        if proc.stat().st_uid != 0:
            return None
        arguments = proc.joinpath('cmdline').read_bytes().split(b'\0')
        state = proc.joinpath('stat').read_text().rsplit(')', 1)[1].split()
        if state[0] == 'Z':
            return None
        return {'pid': pid, 'startTicks': state[19],
                'argv': [item.decode('utf8') for item in arguments if item]}
    except (OSError, ValueError, UnicodeDecodeError, IndexError):
        return None


def expected_process(state, run_id, fingerprint):
    actual = process_identity(state.get('pid'))
    expected = [PYTHON, str(BROKER_FILE), '--serve', run_id, fingerprint]
    return bool(actual and actual['startTicks'] == state.get('processStartTicks') and actual['argv'] == expected)


def require_pidfd(module):
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise module.Denied('LINUX_PIDFD_REQUIRED')


def owned_pidfd(module, state, run_id, fingerprint):
    require_pidfd(module)
    try:
        descriptor = os.pidfd_open(state['pid'], 0)
    except ProcessLookupError:
        return None
    # Opening first pins this process; no later numeric-PID signal can hit a reused PID.
    if not expected_process(state, run_id, fingerprint):
        os.close(descriptor)
        raise module.Denied('BROKER_PROCESS_IDENTITY_MISMATCH')
    return descriptor


def terminate_pidfd(descriptor, grace=80):
    signal.pidfd_send_signal(descriptor, signal.SIGTERM)
    if not select.select([descriptor], [], [], grace)[0]:
        signal.pidfd_send_signal(descriptor, signal.SIGKILL)
        if not select.select([descriptor], [], [], 3)[0]:
            raise RuntimeError('BROKER_PROCESS_STILL_ALIVE')


def image_and_daemon(module, daemon):
    code, body = daemon.request('GET', '/_ping')
    if code != 200 or body.strip() != b'OK':
        raise module.Denied('DAEMON_NOT_READY')
    image = daemon.json('GET', '/images/' + urllib.parse.quote(module.PIN_REF, safe='') + '/json')
    if image.get('Id') != module.PIN:
        raise module.Denied('REAL_PIN_IMAGE_REQUIRED')
    if module.PIN_REF not in (image.get('RepoDigests') or []):
        raise module.Denied('REAL_PIN_DIGEST_MISMATCH')
    return {'Id': image['Id'], 'RepoDigests': image['RepoDigests']}


def scoped_container(module, details, state, labels, network, container_id):
    prefix = 'jarvis-ft-' + state['runId'] + '-sandbox-'
    if (details.get('Id') != container_id or details.get('Config', {}).get('Labels') != labels or
            not re.fullmatch(re.escape('/' + prefix) + '[1-7]', details.get('Name', '')) or
            details.get('Image') != state.get('realImageId') or
            details.get('HostConfig', {}).get('NetworkMode') != network):
        raise module.Denied('CLEANUP_CONTAINER_IDENTITY_MISMATCH')


def cleanup(module, daemon, fixture, state, labels, network):
    removed, errors = [], []
    socket_path = module.runtime_socket(state['runId'])
    if state.get('socketPath') is not None and state['socketPath'] != str(socket_path):
        raise module.Denied('CONTROL_SOCKET_IDENTITY_MISMATCH')
    if socket_path.parent.exists() or socket_path.parent.is_symlink():
        module.trusted_runtime(state['runId'], state['sourceFingerprint'])
    if state.get('brokerLaunchIntent') and type(state.get('pid')) is not int:
        errors.append('BROKER_PROCESS_OUTCOME_UNRESOLVED')
    registry_file = fixture / 'registry.json'
    if registry_file.exists():
        registry = module.strict_json(module.trusted(registry_file).read_bytes())
        if registry.get('runId') != state['runId'] or registry.get('sourceFingerprint') != state['sourceFingerprint'] or registry.get('labels') != labels:
            raise module.Denied('CLEANUP_REGISTRY_IDENTITY_MISMATCH')
        if any(intent.get('status') != 'acknowledged' for intent in registry.get('createIntents', [])):
            errors.append('CREATE_OUTCOME_UNRESOLVED')
    elif state.get('brokerLaunchIntent'):
        errors.append('BROKER_REGISTRY_NOT_CONFIRMED')
    # A scoped daemon query recovers a successful create whose response/journal write was lost.
    filters = {'label': [key + '=' + value for key, value in labels.items()]}
    candidates = daemon.json('GET', '/containers/json?all=true&filters=' + urllib.parse.quote(json.dumps(filters), safe=''))
    if not isinstance(candidates, list) or len(candidates) > 7:
        raise module.Denied('CLEANUP_SCOPE_BUDGET')
    for candidate in candidates:
        container_id = candidate.get('Id', '')
        if not re.fullmatch('[0-9a-f]{64}', container_id):
            raise module.Denied('CLEANUP_CONTAINER_ID_INVALID')
        details = daemon.json('GET', '/containers/' + container_id + '/json')
        scoped_container(module, details, state, labels, network, container_id)
        code, _ = daemon.request('DELETE', '/containers/' + container_id + '?force=true')
        if code in (204, 404):
            removed.append(container_id)
        else:
            errors.append('OWN_CONTAINER_REMOVE_FAILED')
    network_removed = False
    network_id = state.get('networkId')
    if network_id:
        if not re.fullmatch('[0-9a-f]{64}', network_id):
            raise module.Denied('CLEANUP_NETWORK_ID_INVALID')
        code, body = daemon.request('GET', '/networks/' + network_id)
        if code == 404:
            network_removed = True
        elif code == 200:
            actual = module.strict_json(body)
            if actual.get('Name') != network or actual.get('Id') != network_id or actual.get('Labels') != labels or actual.get('Internal') is not True:
                raise module.Denied('CLEANUP_NETWORK_IDENTITY_MISMATCH')
            if actual.get('Containers'):
                errors.append('OWN_NETWORK_HAS_REMAINING_MEMBERS')
            else:
                code, _ = daemon.request('DELETE', '/networks/' + network_id)
                network_removed = code in (204, 404)
                if not network_removed:
                    errors.append('OWN_NETWORK_REMOVE_FAILED')
        else:
            errors.append('OWN_NETWORK_INSPECTION_FAILED')
    else:
        # Before a network-create acknowledgement, check the exact name and matching labels.
        code, body = daemon.request('GET', '/networks/' + network)
        if code == 404:
            network_removed = True
        elif code == 200:
            actual = module.strict_json(body)
            state['networkId'] = actual.get('Id')
            return cleanup(module, daemon, fixture, state, labels, network)
        else:
            errors.append('OWN_NETWORK_INSPECTION_FAILED')
    runtime_cleanup = module.cleanup_runtime(state['runId'], state['sourceFingerprint'])
    summary = {'ok': not errors and network_removed, 'runId': state['runId'],
               'sourceFingerprint': state['sourceFingerprint'], 'removedContainerIds': removed,
               'networkRemoved': network_removed, 'errors': errors,
               **runtime_cleanup,
               'businessContainersTouched': False, 'modelCalls': 0,
               'hostDaemonSocketExposedToTests': False}
    module.atomic_json(fixture / 'cleanup.json', summary)
    state['status'] = 'stopped' if summary['ok'] else 'cleanup-incomplete'
    module.atomic_json(fixture / 'control.json', state)
    return summary


def stop(module, daemon, run_id, fingerprint):
    directory, labels, network = module.context(run_id, fingerprint)
    fixture = module.trusted(directory / 'sandbox-broker', True)
    state = module.strict_json(module.trusted(fixture / 'control.json').read_bytes())
    if state.get('runId') != run_id or state.get('sourceFingerprint') != fingerprint or state.get('labels') != labels:
        raise module.Denied('CONTROL_IDENTITY_MISMATCH')
    if state.get('brokerLaunchIntent') and type(state.get('pid')) is not int:
        ready_file = fixture / 'ready.json'
        if ready_file.exists():
            ready = module.strict_json(module.trusted(ready_file).read_bytes())
            if ready.get('runId') != run_id or ready.get('sourceFingerprint') != fingerprint:
                raise module.Denied('RECOVERY_READY_IDENTITY_MISMATCH')
            state['pid'], state['processStartTicks'] = ready.get('pid'), ready.get('processStartTicks')
            module.atomic_json(fixture / 'control.json', state)
    if process_identity(state.get('pid')):
        descriptor = owned_pidfd(module, state, run_id, fingerprint)
        if descriptor is not None:
            try:
                terminate_pidfd(descriptor)
            finally:
                os.close(descriptor)
    return cleanup(module, daemon, fixture, state, labels, network)


def start(module, daemon, run_id, fingerprint):
    directory, labels, network = module.context(run_id, fingerprint)
    require_pidfd(module)
    image = image_and_daemon(module, daemon)  # Missing/unrunnable fixed pin is a genuine blocker.
    fixture = directory / 'sandbox-broker'
    if fixture.exists():
        module.trusted(fixture, True)
        state_file = fixture / 'control.json'
        if state_file.exists():
            state = module.strict_json(module.trusted(state_file).read_bytes())
            ready = fixture / 'ready.json'
            if (state.get('runId') == run_id and state.get('sourceFingerprint') == fingerprint and
                    state.get('status') == 'running' and expected_process(state, run_id, fingerprint) and ready.exists()):
                sock = module.trusted_runtime(run_id, fingerprint)
                if state.get('socketPath') != str(sock):
                    raise module.Denied('CONTROL_SOCKET_IDENTITY_MISMATCH')
                return dict(module.strict_json(module.trusted(ready).read_bytes()), ok=True, reused=True, socketPath=str(sock))
        raise module.Denied('NEW_FIXTURE_LIFECYCLE_REQUIRED')
    fixture.mkdir(mode=0o700)
    module.trusted(fixture, True)
    code, _ = daemon.request('GET', '/networks/' + network)
    if code != 404:
        raise module.Denied('NEW_PRIVATE_NETWORK_REQUIRED')
    state = {'runId': run_id, 'sourceFingerprint': fingerprint, 'labels': labels,
             'network': network, 'networkId': None, 'status': 'starting',
             'realImageId': image['Id'], 'realRepoDigests': image['RepoDigests'],
             'virtualReference': module.TEST_TAG, 'actualPinnedReference': module.PIN_REF,
             'socketPath': str(module.runtime_socket(run_id)),
             'brokerSHA256': hashlib.sha256(BROKER_FILE.read_bytes()).hexdigest()}
    module.atomic_json(fixture / 'control.json', state)
    child, child_pidfd = None, None
    try:
        module.prepare_runtime(run_id, fingerprint)
        created = daemon.json('POST', '/networks/create', {'Name': network, 'CheckDuplicate': True,
                             'Internal': True, 'Attachable': False, 'Labels': labels}, statuses=(201,))
        if not re.fullmatch('[0-9a-f]{64}', created.get('Id', '')):
            raise module.Denied('PRIVATE_NETWORK_ID_INVALID')
        state['networkId'] = created['Id']
        module.atomic_json(fixture / 'control.json', state)
        log_fd = os.open(fixture / 'broker.log', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        state['brokerLaunchIntent'] = True
        module.atomic_json(fixture / 'control.json', state)
        with os.fdopen(log_fd, 'wb') as stream:
            child = subprocess.Popen([PYTHON, str(BROKER_FILE), '--serve', run_id, fingerprint],
                                     stdin=subprocess.DEVNULL, stdout=stream, stderr=stream,
                                     start_new_session=True, close_fds=True,
                                     env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'PYTHONUNBUFFERED': '1'})
        child_pidfd = os.pidfd_open(child.pid, 0)
        process = process_identity(child.pid)
        if not process:
            raise module.Denied('BROKER_PROCESS_NOT_READY')
        state['pid'], state['processStartTicks'] = child.pid, process['startTicks']
        module.atomic_json(fixture / 'control.json', state)
        end = time.monotonic() + 20
        while time.monotonic() < end:
            ready_file = fixture / 'ready.json'
            if child.poll() is not None:
                raise module.Denied('BROKER_START_FAILED')
            if ready_file.exists():
                ready = module.strict_json(module.trusted(ready_file).read_bytes())
                if ready.get('runId') != run_id or ready.get('sourceFingerprint') != fingerprint or ready.get('pid') != child.pid:
                    raise module.Denied('BROKER_READY_IDENTITY_MISMATCH')
                state['status'] = 'running'
                module.atomic_json(fixture / 'control.json', state)
                return dict(ready, ok=True, reused=False, socketPath=str(module.runtime_socket(run_id)))
            time.sleep(0.1)
        raise module.Denied('BROKER_START_DEADLINE')
    except Exception:
        # All cleanup remains pinned to this run/source/label identity, never a global prune.
        if child and child.poll() is None:
            if child_pidfd is None:
                # Popen's own unreaped child cannot have its PID reused. Acquire a handle now.
                child_pidfd = os.pidfd_open(child.pid, 0)
            terminate_pidfd(child_pidfd)
            child.wait(timeout=3)
        cleanup(module, daemon, fixture, state, labels, network)
        raise
    finally:
        if child_pidfd is not None:
            os.close(child_pidfd)


def check_bind(module, run_id, fingerprint):
    # A real Linux bind smoke check, no Docker API, task execution or model call.
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise module.Denied('LINUX_ROOT_BIND_CHECK_REQUIRED')
    module.context(run_id, fingerprint)
    sock = module.prepare_runtime(run_id, fingerprint)
    bound = False
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        connection.bind(str(sock))
        bound = True
        os.chown(sock, module.NODE_UID, module.NODE_UID)
        os.chmod(sock, 0o600)
        info = sock.lstat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != module.NODE_UID or stat.S_IMODE(info.st_mode) != 0o600:
            raise module.Denied('BIND_SOCKET_IDENTITY_MISMATCH')
    finally:
        connection.close()
        removed = module.cleanup_runtime(run_id, fingerprint)
    return {'ok': bound and removed['socketRemoved'] and removed['runtimeDirectoryRemoved'],
            'runId': run_id, 'sourceFingerprint': fingerprint, 'actualLinuxAFUnixBind': bound,
            'socketPath': str(sock), 'socketPathBytes': len(os.fsencode(str(sock))),
            'daemonActions': 0, 'modelCalls': 0, 'productSixCasesRun': False, **removed}


def main():
    if os.geteuid() != 0 or len(sys.argv) != 4 or sys.argv[1] not in ('--check', '--check-bind', '--start', '--stop'):
        print(json.dumps({'ok': False, 'code': 'ROOT_FIXED_CONTROL_ARGUMENTS_REQUIRED'}))
        return 2
    module = load_broker()
    run_id, fingerprint = sys.argv[2:]
    module.context(run_id, fingerprint)
    daemon = module.Daemon()
    if sys.argv[1] == '--check-bind':
        answer = check_bind(module, run_id, fingerprint)
    elif sys.argv[1] == '--check':
        image = image_and_daemon(module, daemon)
        answer = {'ok': True, 'runId': run_id, 'sourceFingerprint': fingerprint,
                  'realImageId': image['Id'], 'realRepoDigests': image['RepoDigests'],
                  'virtualReference': module.TEST_TAG, 'actualPinnedReference': module.PIN_REF,
                  'remoteMutation': False, 'hostDaemonSocketExposedToTests': False}
    elif sys.argv[1] == '--start':
        answer = start(module, daemon, run_id, fingerprint)
    else:
        answer = stop(module, daemon, run_id, fingerprint)
    print(json.dumps(answer), flush=True)
    return 0 if answer.get('ok') else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        # Daemon payloads and global host details never enter public fixture errors.
        code = getattr(error, 'code', 'FIXTURE_CONTROL_FAILED')
        print(json.dumps({'ok': False, 'code': code}), flush=True)
        raise SystemExit(2)
