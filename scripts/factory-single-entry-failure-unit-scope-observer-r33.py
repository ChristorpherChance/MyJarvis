"""Exact failed-unit and cgroup observation only; no actor/process/kernel-method probe.

This independent failure-only scope cannot qualify the original owned-actor method,
external holder absence or full protection. No CLI; null activation rejects before OS.
"""
import base64
from contextlib import contextmanager
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

BASE = '/var/lib/jarvis-single-entry-bound-method-r33'
NONCE = 'e088487022a3aadb4fd5e173fdb70b85'
PROTOCOL = 'r33-single-entry-owned-method-v1'
INVOCATION = '471c2e41fefa4c0f88546f95563f8830'
DEPENDENCY_SHA256 = 'a67cd324e19e52cf005dba94bbb0a7276b0c1f1cc2ca8b9ea5f0b99867309a26'
CONTROL = ('owner.py', 'fixture.py', 'generated.py', 'activation.json', 'once.json')
WORK = ('owner.json', 'fixture-process.json', 'fixture.stdout.json', 'fixture.stderr.raw', 'result.json', 'stopped.json')
EXPECTED_RAW_FILES = {
    'control/owner.py': {'sha256': '9fb69d1e6d6bcf8c5561042bbca2e7258f5436791ddc49f20156b5631a9b2c39', 'bytes': 29447},
    'control/fixture.py': {'sha256': '3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8', 'bytes': 34256},
    'control/generated.py': {'sha256': '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73', 'bytes': 28366},
    'control/activation.json': {'sha256': 'd406276c3d333b3097f7245b85cb42bfb569bc163e6541e30e899f4c68fe0c7b', 'bytes': 1131},
    'control/once.json': {'sha256': 'e748d574cd0fa58bc91daea2a1f221c7bb53ab1ee5dc6ca628d3fa60ba0396ca', 'bytes': 776},
    'unit-proof.json': {'sha256': '5b4eaa39360f5e4e6e8a969f56133acbc032283f1fd0549d0de877bc9f9a073a', 'bytes': 953},
}
ACTUAL_REFS = {
    'journal': {'path': '.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-once.json', 'sha256': '7be2a90005730a5f7a33d455a20b5a803685f0901be3301d3d4970525c89e663'},
    'start': {'path': 'artifacts/software-factory/goals-r29/r33-single-entry-method-start-1791882894257-01c77463-99c6-4093-8cbd-6a8947b0fe73.json', 'sha256': 'f0f477b33f107262b4bb9ef7e441abb3e0a58ec5b08d934caaafd3e785007472'},
    'terminal': {'path': 'artifacts/software-factory/goals-r29/r33-single-entry-method-check-1791882974229-5b43f092-a5f6-49a0-b3cd-fe7cf50ff184.json', 'sha256': 'cc654757aa006a6d26cdc7ac03ad73be279816aff3d38e592270f53383793f04'},
    'startTransport': {'path': '.jarvis-dev/maintenance/r33-single-entry-method-transport-1791882894243-817a8bd4-1f72-420a-aa58-65588c91c59e.json', 'sha256': '205622d6ad5c3e7e910c847bd9d40be2291a0596166ae318016a234b378f96ea'},
    'terminalTransport': {'path': '.jarvis-dev/maintenance/r33-single-entry-method-transport-1791882974219-c1d2e582-100e-4f29-86de-378772841eed.json', 'sha256': '5c0960ab3ed110748d78a122c460a41998942cbc717fb41b2ef54c0d5374b05a'},
    'sourceReview': {'path': 'artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-1791881838200-c58cf2c8-b032-4005-b721-9c3d9c20105b.json', 'sha256': 'd560953389199aed52a1d013faefea8219afab27aac2b649895aa578639b57b5'},
}
H = re.compile(r'[a-f0-9]{64}\Z')

def need(value, code):
    if not value:
        raise RuntimeError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def same_json(a, b):
    # Preserve Python's original integer domain and distinguish bool from int.
    return canonical(a) == canonical(b)


def metadata(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def closed_error(error):
    text = str(error)
    return {'errorCode': text if re.fullmatch(r'R33_OWNED_[A-Z0-9_]+', text) else 'R33_OWNED_READ_INCOMPLETE',
            'errno': error.errno if type(getattr(error, 'errno', None)) is int else None,
            'readPhase': getattr(error, 'owned_read_phase', 'READ'),
            'secondaryCloseFailures': getattr(error, 'owned_secondary_close_failures', [])}


@contextmanager
def preserving_close(descriptors, phase, extra_closers=()):
    """Own each FD once; retain the first read failure and attempt every close."""
    primary = None
    try:
        yield
    except BaseException as error:
        primary = error
        if not hasattr(error, 'owned_read_phase'):
            error.owned_read_phase = phase
        raise
    finally:
        first_close = None
        failures = []
        actions = [lambda fd=fd: os.close(fd) for fd in descriptors if fd is not None] + list(extra_closers)
        for close in actions:
            try:
                close()
            except BaseException as error:
                if first_close is None:
                    first_close = error
                failures.append({'readPhase': phase + '_CLOSE',
                                 'errorCode': 'R33_OWNED_OBSERVER_FD_CLOSE_INCOMPLETE',
                                 'errno': error.errno if type(getattr(error, 'errno', None)) is int else None})
        if failures:
            target = primary if primary is not None else first_close
            target.owned_secondary_close_failures = getattr(target, 'owned_secondary_close_failures', []) + failures
            if primary is None:
                if not hasattr(target, 'owned_read_phase'):
                    target.owned_read_phase = phase + '_CLOSE'
                raise target


def anchored_directory(path):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    held = [fd]
    anchors = []
    with preserving_close(held, 'PARENT_DIRECTORY_READ'):
        for name in Path(path).parts[1:]:
            before = os.stat(name, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
                 and not before.st_mode & 0o022, 'R33_OWNED_PARENT_UNTRUSTED')
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            held.append(child)
            need(metadata(before) == metadata(os.fstat(child)), 'R33_OWNED_PARENT_CHANGED')
            anchors.append((fd, name, metadata(before), child))
            fd = child
        for parent, name, original, child in anchors:
            need(original == metadata(os.fstat(child))
                 == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'R33_OWNED_PARENT_CHANGED')
        # Remove each descriptor from ownership before its one close attempt.
        while len(held) > 1:
            parent = held.pop(0)
            with preserving_close([parent], 'PARENT_DIRECTORY'):
                pass
        return held.pop()


def held_file(directory, name, mode):
    before = os.stat(name, dir_fd=directory, follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1
         and stat.S_IMODE(before.st_mode) == mode and before.st_size <= 1048576, 'R33_OWNED_FILE_UNTRUSTED')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory)
    with preserving_close([fd], 'HELD_FILE_READ'):
        need(metadata(before) == metadata(os.fstat(fd)), 'R33_OWNED_FILE_CHANGED')
        data = b''
        while len(data) <= before.st_size:
            block = os.read(fd, min(65536, before.st_size + 1 - len(data)))
            if not block:
                break
            data += block
        need(len(data) == before.st_size and metadata(before) == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=directory, follow_symlinks=False)), 'R33_OWNED_FILE_CHANGED')
        return data, metadata(before)


def raw_json(rows, name):
    need(name in rows, 'R33_OWNED_RAW_CHAIN_INCOMPLETE')
    def pairs(values):
        result = {}
        for key, value in values:
            need(key not in result, 'R33_OWNED_DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    def constant(_):
        raise RuntimeError('R33_OWNED_JSON_CONSTANT_INVALID')
    result = json.loads(base64.b64decode(rows[name]['base64'], validate=True).decode('utf-8', 'strict'),
                        object_pairs_hook=pairs, parse_constant=constant)
    need(type(result) is dict, 'R33_OWNED_RAW_JSON_OBJECT_REQUIRED')
    return result


def read_proc_bytes(directory, name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory)
    with preserving_close([fd], 'PROC_FILE_READ'):
        data = b''
        while len(data) <= limit:
            block = os.read(fd, min(65536, limit + 1 - len(data)))
            if not block:
                break
            data += block
        need(len(data) <= limit, 'R33_OWNED_PROC_READ_LIMIT')
        return data


def unit_frame(unit, invocation):
    props = 'Id,LoadState,ActiveState,SubState,MainPID,ControlGroup,InvocationID,Result,ExecMainCode,ExecMainStatus'
    r = subprocess.run(['/usr/bin/systemctl', 'show', unit, '--property=' + props], capture_output=True,
                       timeout=8, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    need(r.returncode == 0 and len(r.stdout) <= 32768, 'R33_OWNED_UNIT_READ_INCOMPLETE')
    rows = [line.split('=', 1) for line in r.stdout.decode('utf-8', 'strict').splitlines()]
    need(all(len(row) == 2 for row in rows), 'R33_OWNED_UNIT_PARSE_INCOMPLETE')
    value = dict(rows)
    need(len(value) == len(rows) and set(value) == set(props.split(','))
         and value.get('Id') == unit, 'R33_OWNED_UNIT_SCOPE_CHANGED')
    # Historical commands/configuration come from the immutable root unit proof;
    # a loaded unit must additionally be the exact original invocation.
    if value.get('LoadState') == 'loaded':
        need(value.get('InvocationID') == invocation, 'R33_OWNED_UNIT_INVOCATION_CHANGED')
        stopped = value.get('ActiveState') in ('inactive', 'failed') and value.get('MainPID') == '0' \
            and value.get('ControlGroup') in ('', '/system.slice/' + unit)
        return {'properties': value, 'currentStopped': stopped, 'complete': True}
    need(value.get('LoadState') == 'not-found' and value.get('ActiveState') == 'inactive'
         and value.get('SubState') == 'dead' and value.get('MainPID') == '0'
         and value.get('ControlGroup') == '' and value.get('InvocationID') == ''
         and value.get('Result') in ('', 'success') and value.get('ExecMainCode') == '0'
         and value.get('ExecMainStatus') == '0', 'R33_OWNED_UNIT_CURRENT_DEFAULTS_CHANGED')
    return {'properties': value, 'currentStopped': True, 'complete': True}


def cgroup_frame(group):
    need(re.fullmatch(r'/system.slice/jarvis-single-entry-method-r33-[a-f0-9]{32}\.service', group),
         'R33_OWNED_CGROUP_SCOPE_CHANGED')
    # An absent ancestor is an incomplete read, never proof that the unit leaf
    # disappeared. Establish the complete trusted parent before the exact stat.
    parent = anchored_directory('/sys/fs/cgroup/system.slice')
    name = group.rsplit('/', 1)[1]
    with preserving_close([parent], 'CGROUP_PARENT_READ'):
        parent_before = metadata(os.fstat(parent))
        try:
            before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError as error:
            need(error.errno == errno.ENOENT and metadata(os.fstat(parent)) == parent_before,
                 'R33_OWNED_CGROUP_ABSENCE_UNKNOWN')
            return {'absent': True, 'members': [], 'complete': True}
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
             and not before.st_mode & 0o022, 'R33_OWNED_CGROUP_DIRECTORY_UNTRUSTED')
        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
        with preserving_close([fd], 'CGROUP_READ'):
            need(metadata(before) == metadata(os.fstat(fd)), 'R33_OWNED_CGROUP_DIRECTORY_CHANGED')
            value = cgroup_members(fd)
            need(metadata(before) == metadata(os.fstat(fd))
                 == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False))
                 and metadata(os.fstat(parent)) == parent_before, 'R33_OWNED_CGROUP_DIRECTORY_CHANGED')
            return value


def cgroup_members(fd):
    members = set()
    visited = 0
    def walk(directory, depth):
        nonlocal visited
        visited += 1
        need(depth <= 32 and visited <= 1024, 'R33_OWNED_CGROUP_LIMIT')
        raw = read_proc_bytes(directory, 'cgroup.procs', 1048576)
        for name in raw.decode('ascii', 'strict').splitlines():
            need(name.isdigit() and int(name) > 0, 'R33_OWNED_CGROUP_PID_INVALID')
            members.add(int(name))
        entries = os.scandir(directory)
        with preserving_close([], 'CGROUP_DIRECTORY_READ', [entries.close]):
            for entry in entries:
                info = os.stat(entry.name, dir_fd=directory, follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                    with preserving_close([child], 'CGROUP_DIRECTORY_READ'):
                        need(metadata(info) == metadata(os.fstat(child)), 'R33_OWNED_CGROUP_DIRECTORY_CHANGED')
                        walk(child, depth + 1)
    walk(fd, 0)
    return {'absent': False, 'members': sorted(members), 'directoriesRead': visited, 'complete': True}


def validate_failure_payload(payload):
    keys = {'schemaVersion', 'kind', 'nonce', 'sourceProtocol', 'invocationId', 'readerReview', 'actualRefs', 'expectedRawFiles'}
    need(type(payload) is dict and set(payload) == keys and type(payload['schemaVersion']) is int and payload['schemaVersion'] == 1
         and payload['kind'] == 'r33-single-entry-failure-unit-cgroup-observation-input'
         and payload['nonce'] == NONCE and payload['sourceProtocol'] == PROTOCOL and payload['invocationId'] == INVOCATION,
         'R33_OWNED_FAILURE_ACTUAL_PACKET_REQUIRED')
    review = payload['readerReview']
    need(type(review) is dict and set(review) == {'path', 'sha256'} and type(review['path']) is str
         and re.fullmatch(r'artifacts/software-factory/goals-r29/r33-single-entry-failed-unit-scope-independent-local-review-[0-9]{13}-[a-f0-9-]{36}\.json', review['path'])
         and type(review['sha256']) is str and H.fullmatch(review['sha256']), 'R33_OWNED_FAILURE_READER_REVIEW_REQUIRED')
    need(same_json(payload['actualRefs'], ACTUAL_REFS) and same_json(payload['expectedRawFiles'], EXPECTED_RAW_FILES),
         'R33_OWNED_FAILURE_ORIGINAL_REF_SCOPE_CHANGED')
    return payload


def failure_namespace_read(output):
    root = BASE + '/' + NONCE
    fd = anchored_directory(root)
    records = {}
    directories = {}
    with preserving_close([fd], 'FAILURE_NAMESPACE_READ'):
        outer = os.fstat(fd)
        need(stat.S_IMODE(outer.st_mode) == 0o711 and set(os.listdir(fd)) == {'control', 'work', 'unit-proof.json'},
             'R33_OWNED_FAILURE_NAMESPACE_SCOPE_CHANGED')
        directories['root'] = metadata(outer)
        for folder, expected_names, mode in [('control', set(CONTROL), 0o555), ('work', set(), 0o700)]:
            before = os.stat(folder, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0 and stat.S_IMODE(before.st_mode) == mode,
                 'R33_OWNED_FAILURE_DIRECTORY_UNTRUSTED')
            directory = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            with preserving_close([directory], 'FAILURE_DIRECTORY_READ'):
                need(metadata(before) == metadata(os.fstat(directory)) and set(os.listdir(directory)) == expected_names,
                     'R33_OWNED_FAILURE_WORK_OR_CONTROL_SET_CHANGED')
                if folder == 'control':
                    for name in CONTROL:
                        raw, meta = held_file(directory, name, 0o444)
                        key = 'control/' + name
                        row = {'base64': base64.b64encode(raw).decode(), 'sha256': digest(raw), 'bytes': len(raw),
                               'metadata': meta, 'metadataSHA256': digest(canonical(meta)), 'readComplete': True}
                        records[key] = row
                        output[key] = row
                        need(same_json({'sha256': row['sha256'], 'bytes': row['bytes']}, EXPECTED_RAW_FILES[key]),
                             'R33_OWNED_FAILURE_ORIGINAL_RECORD_CHANGED')
                need(metadata(before) == metadata(os.fstat(directory))
                     == metadata(os.stat(folder, dir_fd=fd, follow_symlinks=False)), 'R33_OWNED_FAILURE_DIRECTORY_CHANGED')
                directories[folder] = metadata(before)
        raw, meta = held_file(fd, 'unit-proof.json', 0o444)
        row = {'base64': base64.b64encode(raw).decode(), 'sha256': digest(raw), 'bytes': len(raw),
               'metadata': meta, 'metadataSHA256': digest(canonical(meta)), 'readComplete': True}
        records['unit-proof.json'] = row
        output['unit-proof.json'] = row
        need(same_json({'sha256': row['sha256'], 'bytes': row['bytes']}, EXPECTED_RAW_FILES['unit-proof.json']),
             'R33_OWNED_FAILURE_ORIGINAL_UNIT_PROOF_CHANGED')
        need(metadata(outer) == metadata(os.fstat(fd)), 'R33_OWNED_FAILURE_NAMESPACE_CHANGED')
        return {'identity': {'device': outer.st_dev, 'inode': outer.st_ino}, 'directories': directories,
                'metadataSHA256': digest(canonical(directories)), 'records': records,
                'missingWorkNames': list(WORK), 'complete': True}


def verify_failure_records(rows):
    need(set(rows) == set(EXPECTED_RAW_FILES), 'R33_OWNED_FAILURE_ORIGINAL_RECORD_SET_CHANGED')
    a = raw_json(rows, 'control/activation.json')
    once = raw_json(rows, 'control/once.json')
    proof = raw_json(rows, 'unit-proof.json')
    unit = 'jarvis-single-entry-method-r33-' + NONCE + '.service'
    common = {'schemaVersion': 1, 'nonce': NONCE, 'phase': 'native', 'sourceProtocol': PROTOCOL,
              'ownerSHA256': EXPECTED_RAW_FILES['control/owner.py']['sha256'],
              'fixtureSHA256': EXPECTED_RAW_FILES['control/fixture.py']['sha256'],
              'generatedSHA256': EXPECTED_RAW_FILES['control/generated.py']['sha256'],
              'buildStaticMappingSHA256': '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
              'fixtureWorkSeconds': 45, 'runtimeMaxSec': 80, 'timeoutStopSec': 10, 'hardParentBoundSeconds': 90}
    need(all(same_json(a.get(k), v) and same_json(once.get(k), v) for k, v in common.items())
         and a.get('kind') == 'r33-single-entry-method-root-activation'
         and once.get('kind') == 'r33-single-entry-method-root-once'
         and same_json(a.get('parentReview'), ACTUAL_REFS['sourceReview']) and once.get('unit') == unit
         and once.get('activationSHA256') == EXPECTED_RAW_FILES['control/activation.json']['sha256'],
         'R33_OWNED_FAILURE_SOURCE_INTENT_CHANGED')
    need(proof.get('kind') == 'r33-single-entry-method-root-unit-proof' and proof.get('nonce') == NONCE
         and proof.get('unit') == unit and proof.get('invocationId') == INVOCATION
         and proof.get('ownerSHA256') == common['ownerSHA256']
         and proof.get('activationSHA256') == EXPECTED_RAW_FILES['control/activation.json']['sha256']
         and proof.get('onceSHA256') == EXPECTED_RAW_FILES['control/once.json']['sha256'],
         'R33_OWNED_FAILURE_UNIT_PROOF_BINDING_CHANGED')
    expected = {'rootUID': 0, 'rootGID': 0, 'rootCapabilityMask': 226, 'fixtureUID': 1000, 'fixtureGID': 1000,
                'noNewPrivileges': True, 'ambientCapabilitiesEmpty': True, 'privateNetwork': True,
                'runtimeMaxSec': 80, 'timeoutStopSec': 10, 'totalParentSeconds': 90,
                'killMode': 'control-group', 'killSignal': 'SIGKILL', 'restart': 'no'}
    control = BASE + '/' + NONCE + '/control/owner.py'
    for action, key in [('--run', 'execStartSHA256'), ('--stopped', 'execStopPostSHA256')]:
        expected[key] = digest(json.dumps(['/usr/bin/python3', '-I', control, action, NONCE], separators=(',', ':')).encode())
    need(same_json(proof.get('configuration'), expected), 'R33_OWNED_FAILURE_UNIT_CONFIGURATION_CHANGED')
    return True


def observe_failed_unit_scope_r33(payload=None):
    result = {'schemaVersion': 1, 'kind': 'r33-single-entry-failure-unit-cgroup-host-observation', 'ready': False,
              'currentFailureUnitAndCgroupScopeClosedVerified': False,
              'sourceRawBindingVerified': False, 'recordsStable': False, 'namespaceStable': False,
              'historicalNamespaceIdentityRecorded': False, 'historicalRecordMetadataRecorded': False,
              'unknownOriginalActorIdentitiesPreserved': True, 'ownerIdentity': None, 'fixtureIdentity': None, 'childIdentity': None,
              'originalMethodObservationStatus': 'incomplete', 'originalMethodPhaseOrFirstFailureKnown': False,
              'generatedMethodCodeMayHaveExecuted': None, 'originalMethodFailurePreserved': True,
              'actualMethodSubsetIndependentlyQualified': False, 'actualKernelMethodQualified': False,
              'currentOwnedScopeCleanupVerified': False, 'externalHoldersAbsenceProved': False,
              'fullProtectionQualified': False, 'wholeProcCensusExecuted': False, 'actorProbeExecuted': False,
              'unixGlobalSocketScanExecuted': False, 'signalsSent': False, 'resourcesRemoved': False,
              'mutationsPerformed': False, 'productCodeExecuted': False, 'modelsInvoked': False,
              'originalRawFileRefs': {}, 'physicalFrames': [], 'readErrors': []}
    if payload is None:
        return {**result, 'preparedOnly': True, 'runtimeIOPerformed': False, 'reason': 'R33_OWNED_FAILURE_ACTUAL_PACKET_REQUIRED'}
    p = validate_failure_payload(payload)  # Exact original scope and external reader review before OS.
    result.update({'nonce': NONCE, 'phase': 'native', 'sourceProtocol': PROTOCOL,
                   'contextSHA256': digest(canonical(p)), 'scopeBinding': p, 'runtimeIOPerformed': True})
    try:
        need(sys.platform == 'linux' and os.getresuid() == os.getresgid() == (0, 0, 0), 'R33_OWNED_FAILURE_ROOT_LINUX_REQUIRED')
        first = failure_namespace_read(result['originalRawFileRefs'])
        verify_failure_records(first['records'])
        unit = 'jarvis-single-entry-method-r33-' + NONCE + '.service'
        frames = result['physicalFrames']
        for _ in range(2):
            u = unit_frame(unit, INVOCATION)
            need(u['properties']['LoadState'] == 'loaded' and u['properties']['ActiveState'] == 'failed',
                 'R33_OWNED_FAILURE_UNIT_STATE_CHANGED')
            frame = {'unit': u}
            frames.append(frame)
            frame['cgroup'] = cgroup_frame('/system.slice/' + unit)
        second = failure_namespace_read({})
        need(same_json(first, second), 'R33_OWNED_FAILURE_ORIGINAL_BYTES_OR_METADATA_DRIFT')
        need(same_json(frames[0], frames[1]), 'R33_OWNED_FAILURE_CURRENT_UNIT_OR_CGROUP_DRIFT')
        for frame, namespace in zip(frames, (first, second)):
            frame['namespaceIdentity'] = namespace['identity']
            frame['namespaceMetadataSHA256'] = namespace['metadataSHA256']
            frame['missingWorkNames'] = namespace['missingWorkNames']
        result['sourceRawBindingVerified'] = result['recordsStable'] = result['namespaceStable'] = True
        closed = all(f['unit']['complete'] and f['unit']['currentStopped'] and f['cgroup']['complete']
                     and not f['cgroup']['members'] and first['complete'] and second['complete']
                     and f['missingWorkNames'] == list(WORK) for f in frames)
        result['currentFailureUnitAndCgroupScopeClosedVerified'] = bool(closed)
        result['ready'] = bool(closed)
    except BaseException as error:
        result['readErrors'].append(closed_error(error))
    return result
