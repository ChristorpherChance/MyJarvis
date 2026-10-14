"""Read-only, exact-owned-scope observer. No CLI, census, signal or source execution.

External reviewed caller binds actual source/run/raw-record references. Imports and
observe_owned_scope_r33(None) do not perform filesystem or kernel observations.
"""
import base64
from contextlib import contextmanager
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import select
import stat
import subprocess
import sys

BASE = '/var/lib/jarvis-single-entry-bound-method-r33-r2'
PROTOCOL = 'r33-single-entry-owned-method-v2'
CONTROL = ('owner.py', 'fixture.py', 'generated.py', 'activation.json', 'once.json')
WORK = ('owner.json', 'fixture-process.json', 'fixture.stdout.json', 'fixture.stderr.raw', 'result.json', 'stopped.json', 'owner.stderr.raw')
RAW_NAMES = tuple('control/' + n for n in CONTROL) + tuple('work/' + n for n in WORK) + ('unit-proof.json',)
FIXED_SOURCES = {
    'fixtureSHA256': '3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8',
    'generatedSHA256': '2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73',
    'buildStaticMappingSHA256': '909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
    'moduleSHA256': 'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8',
    'generatorSHA256': '7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5',
}
H = re.compile(r'[a-f0-9]{64}\Z')
N = re.compile(r'[a-f0-9]{32}\Z')
BOOT = re.compile(r'[a-f0-9-]{36}\Z')
IDENTITY_KEYS = ('pid', 'ppid', 'startTicks', 'boot', 'procDevice', 'procInode')
SELECTED_SOURCES = {
    'SingleEntryR33': '34b11bfa298198de1d6476c0d41cfef28b7912e95dfc2692446fce0a3528a495',
    'SingleEntryDirectoryR33': 'a0b59cc1a28b47715b24f2b1ffd6f949b56c039e5d48dfe156b74fa70b33dd17',
    'process_record': 'd6cf839ecd4cc6fba03b7c4f6a44b6cf73180ef5809d8fc8d79914902139f640',
    'pidfd_poll': '94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533',
    'pidfd_exit_proof': 'ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109',
}


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


def identity_core(value):
    if type(value) is not dict:
        return None
    if not all(type(value.get(k)) is int and value[k] >= (0 if k in ('ppid', 'procDevice') else 1)
               for k in ('pid', 'ppid', 'procDevice', 'procInode')):
        return None
    if not (type(value.get('boot')) is str and BOOT.fullmatch(value['boot'])
            and type(value.get('startTicks')) is str and re.fullmatch('[0-9]+', value['startTicks'])):
        return None
    return {k: value[k] for k in IDENTITY_KEYS}


def validate_payload(p):
    keys = {'schemaVersion', 'kind', 'nonce', 'phase', 'sourceProtocol', 'owner', 'fixture', 'child',
            'activationSHA256', 'onceSHA256', 'unitProofSHA256', 'invocationId', 'expectedRawFiles', 'sourceExpected'}
    need(type(p) is dict and set(p) == keys and type(p['schemaVersion']) is int and p['schemaVersion'] == 1
         and p['kind'] == 'r33-single-entry-owned-scope-observation-input-r2'
         and type(p['nonce']) is str and N.fullmatch(p['nonce']) and p['phase'] == 'native'
         and p['sourceProtocol'] == PROTOCOL and type(p['invocationId']) is str and N.fullmatch(p['invocationId']),
         'R33_OWNED_ACTUAL_PACKET_REQUIRED')
    need(all(type(p[k]) is str and H.fullmatch(p[k]) for k in ('activationSHA256', 'onceSHA256', 'unitProofSHA256')),
         'R33_OWNED_ACTUAL_RECORD_BINDING_REQUIRED')
    sources = p['sourceExpected']
    need(type(sources) is dict and set(sources) == set(FIXED_SOURCES) | {'ownerSHA256', 'starterSHA256', 'sourceReviewSHA256'}
         and all(type(v) is str and H.fullmatch(v) for v in sources.values())
         and all(sources[k] == v for k, v in FIXED_SOURCES.items()), 'R33_OWNED_SOURCE_PACKET_CHANGED')
    pins = p['expectedRawFiles']
    need(type(pins) is dict and set(pins) == set(RAW_NAMES), 'R33_OWNED_RECORD_SET_CHANGED')
    for name, row in pins.items():
        if row is None:
            need(name.startswith('work/'), 'R33_OWNED_CONTROL_BINDING_REQUIRED')
            continue
        need(type(row) is dict and set(row) == {'sha256', 'bytes'} and type(row['sha256']) is str
             and H.fullmatch(row['sha256'])
             and ((row['bytes'] is None and (name.startswith('control/') or name == 'unit-proof.json'))
                  or type(row['bytes']) is int and 0 <= row['bytes'] <= 1048576),
             'R33_OWNED_RECORD_PIN_INVALID')
    for role in ('owner', 'fixture', 'child'):
        need(p[role] is None or identity_core(p[role]) is not None, 'R33_OWNED_ACTOR_IDENTITY_INVALID')
    if p['owner'] is not None:
        unit = 'jarvis-single-entry-method-r33-r2-' + p['nonce'] + '.service'
        need(set(p['owner']) == set(IDENTITY_KEYS) | {'uid', 'gid', 'unit', 'controlGroup', 'invocationId'}
             and type(p['owner']['uid']) is type(p['owner']['gid']) is int
             and p['owner']['uid'] == p['owner']['gid'] == 0 and p['owner']['unit'] == unit
             and p['owner']['controlGroup'] == '/system.slice/' + unit
             and p['owner']['invocationId'] == p['invocationId'], 'R33_OWNED_OWNER_PACKET_CHANGED')
    if p['child'] is not None:
        need(set(p['child']) == set(IDENTITY_KEYS), 'R33_OWNED_CHILD_PACKET_CHANGED')
    known = [identity_core(p[k]) for k in ('owner', 'fixture', 'child') if p[k] is not None]
    need(len({v['pid'] for v in known}) == len(known) and len({v['boot'] for v in known}) <= 1,
         'R33_OWNED_ACTOR_SCOPE_CHANGED')
    if p['owner'] is not None and p['fixture'] is not None:
        need(p['fixture']['ppid'] == p['owner']['pid'], 'R33_OWNED_FIXTURE_PARENT_CHANGED')
    if p['fixture'] is not None and p['child'] is not None:
        need(p['child']['ppid'] == p['fixture']['pid'], 'R33_OWNED_CHILD_PARENT_CHANGED')
    return p


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


def namespace_read(p, output):
    root = BASE + '/' + p['nonce']
    fd = anchored_directory(root)
    missing = []
    rows = {}
    with preserving_close([fd], 'NAMESPACE_READ'):
        outer = os.fstat(fd)
        need(stat.S_IMODE(outer.st_mode) == 0o711, 'R33_OWNED_NAMESPACE_MODE_CHANGED')
        need(set(os.listdir(fd)) == {'control', 'work', 'unit-proof.json'}, 'R33_OWNED_NAMESPACE_SET_CHANGED')
        for folder, names, directory_mode, file_mode in [('control', CONTROL, 0o555, 0o444), ('work', WORK, 0o700, 0o600)]:
            before = os.stat(folder, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
                 and stat.S_IMODE(before.st_mode) == directory_mode, 'R33_OWNED_RECORD_DIRECTORY_UNTRUSTED')
            directory = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            with preserving_close([directory], 'RECORD_DIRECTORY_READ'):
                need(metadata(before) == metadata(os.fstat(directory)), 'R33_OWNED_RECORD_DIRECTORY_CHANGED')
                names_now = set(os.listdir(directory))
                need(names_now <= set(names), 'R33_OWNED_EXTRA_RECORD')
                for name in names:
                    relative = folder + '/' + name
                    if name not in names_now:
                        missing.append(relative)
                        continue
                    raw, meta = held_file(directory, name, file_mode)
                    row = {'base64': base64.b64encode(raw).decode(), 'sha256': digest(raw), 'bytes': len(raw),
                           'metadata': meta, 'metadataSHA256': digest(canonical(meta)), 'readComplete': True}
                    rows[relative] = row
                    output[relative] = row
                    pin = p['expectedRawFiles'][relative]
                    need(pin is not None and row['sha256'] == pin['sha256']
                         and (pin['bytes'] is None or row['bytes'] == pin['bytes']),
                         'R33_OWNED_RECORD_NOT_BOUND')
                need(metadata(before) == metadata(os.fstat(directory))
                     == metadata(os.stat(folder, dir_fd=fd, follow_symlinks=False)), 'R33_OWNED_RECORD_DIRECTORY_CHANGED')
        raw, meta = held_file(fd, 'unit-proof.json', 0o444)
        row = {'base64': base64.b64encode(raw).decode(), 'sha256': digest(raw), 'bytes': len(raw),
               'metadata': meta, 'metadataSHA256': digest(canonical(meta)), 'readComplete': True}
        rows['unit-proof.json'] = row
        output['unit-proof.json'] = row
        pin = p['expectedRawFiles']['unit-proof.json']
        need(row['sha256'] == pin['sha256'] == p['unitProofSHA256']
             and (pin['bytes'] is None or row['bytes'] == pin['bytes']),
             'R33_OWNED_UNIT_PROOF_NOT_BOUND')
        need(metadata(outer) == metadata(os.fstat(fd)), 'R33_OWNED_NAMESPACE_CHANGED')
        identity = {'device': outer.st_dev, 'inode': outer.st_ino}
        directories = {'root': metadata(outer)}
        for name in ('control', 'work'):
            directories[name] = metadata(os.stat(name, dir_fd=fd, follow_symlinks=False))
        return {'identity': identity, 'directories': directories, 'records': rows, 'missing': missing,
                'metadataSHA256': digest(canonical(directories)), 'complete': not missing}


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


def verify_raw_chain(p, rows):
    sources = p['sourceExpected']
    for name, field in [('owner.py', 'ownerSHA256'), ('fixture.py', 'fixtureSHA256'), ('generated.py', 'generatedSHA256')]:
        need(rows['control/' + name]['sha256'] == sources[field], 'R33_OWNED_INSTALLED_SOURCE_CHANGED')
    activation = raw_json(rows, 'control/activation.json')
    once = raw_json(rows, 'control/once.json')
    owner = raw_json(rows, 'work/owner.json')
    fixture = raw_json(rows, 'work/fixture-process.json')
    method = raw_json(rows, 'work/fixture.stdout.json')
    result = raw_json(rows, 'work/result.json')
    stopped = raw_json(rows, 'work/stopped.json')
    proof = raw_json(rows, 'unit-proof.json')
    unit = 'jarvis-single-entry-method-r33-r2-' + p['nonce'] + '.service'
    common = {'schemaVersion': 1, 'nonce': p['nonce'], 'phase': 'native', 'sourceProtocol': PROTOCOL,
              'ownerSHA256': sources['ownerSHA256'], 'fixtureSHA256': sources['fixtureSHA256'],
              'generatedSHA256': sources['generatedSHA256'], 'buildStaticMappingSHA256': sources['buildStaticMappingSHA256'],
              'fixtureWorkSeconds': 45, 'runtimeMaxSec': 80, 'timeoutStopSec': 10, 'hardParentBoundSeconds': 90}
    need(activation.get('kind') == 'r33-single-entry-method-root-activation-r2'
         and once.get('kind') == 'r33-single-entry-method-root-once-r2'
         and all(same_json(activation.get(k), v) and same_json(once.get(k), v) for k, v in common.items())
         and once.get('unit') == unit and activation.get('parentReview', {}).get('sha256') == sources['sourceReviewSHA256']
         and rows['control/activation.json']['sha256'] == p['activationSHA256']
         and rows['control/once.json']['sha256'] == p['onceSHA256']
         and once.get('activationSHA256') == p['activationSHA256'], 'R33_OWNED_INTENT_CHANGED')
    need(identity_core(owner) == identity_core(p['owner']) and owner.get('uid') == owner.get('gid') == 0
         and owner.get('unit') == unit and owner.get('controlGroup') == '/system.slice/' + unit
         and owner.get('invocationId') == p['invocationId'] and owner.get('ownerSHA256') == sources['ownerSHA256']
         and owner.get('fixtureSHA256') == sources['fixtureSHA256'] and owner.get('generatedSHA256') == sources['generatedSHA256']
         and owner.get('activationSHA256') == p['activationSHA256'] and owner.get('onceSHA256') == p['onceSHA256'],
         'R33_OWNED_OWNER_HISTORY_CHANGED')
    profile = owner.get('profile', {})
    caps = profile.get('capabilities', {})
    need(profile.get('realEffectiveSavedUID') == profile.get('realEffectiveSavedGID') == [0, 0, 0]
         and profile.get('noNewPrivileges') == 1 and profile.get('rootCapabilitiesAreZero') is False
         and set(caps) == {'CapEff', 'CapPrm', 'CapInh', 'CapAmb'}
         and all(type(v) is str and re.fullmatch('[a-f0-9]+', v) for v in caps.values())
         and int(caps['CapEff'], 16) == int(caps['CapPrm'], 16) == 226
         and int(caps['CapInh'], 16) == int(caps['CapAmb'], 16) == 0, 'R33_OWNED_ROOT_PROFILE_CHANGED')
    need(same_json(fixture, p['fixture']) and fixture.get('uid') == 1000
         and fixture.get('ppid') == owner['pid'] and fixture.get('controlGroup') == owner['controlGroup'],
         'R33_OWNED_FIXTURE_HISTORY_CHANGED')
    need(result.get('kind') == 'r33-single-entry-method-owner-result-r2' and result.get('nonce') == p['nonce']
         and result.get('phase') == 'native' and result.get('sourceProtocol') == PROTOCOL
         and same_json(result.get('owner'), owner) and same_json(result.get('fixtureProcessIdentity'), fixture)
         and same_json(result.get('fixtureResult'), method) and result.get('fixtureStdoutSHA256') == rows['work/fixture.stdout.json']['sha256']
         and result.get('fixtureStderrSHA256') == rows['work/fixture.stderr.raw']['sha256'], 'R33_OWNED_RESULT_CHAIN_CHANGED')
    need(method.get('kind') == 'r33-single-entry-bound-method-fixture-result' and method.get('phase') == 'native'
         and identity_core(method.get('childIdentity')) == identity_core(p['child']), 'R33_OWNED_CHILD_HISTORY_CHANGED')
    config = proof.get('configuration', {})
    expected_config = {'rootUID': 0, 'rootGID': 0, 'rootCapabilityMask': 226, 'fixtureUID': 1000, 'fixtureGID': 1000,
                       'noNewPrivileges': True, 'ambientCapabilitiesEmpty': True, 'privateNetwork': True,
                       'runtimeMaxSec': 80, 'timeoutStopSec': 10, 'totalParentSeconds': 90,
                       'killMode': 'control-group', 'killSignal': 'SIGKILL', 'restart': 'no',
                       'standardOutput': 'null', 'standardError': 'append',
                       'standardErrorFile': BASE + '/' + p['nonce'] + '/work/owner.stderr.raw'}
    for field, value in expected_config.items():
        need(type(config.get(field)) is type(value) and config[field] == value, 'R33_OWNED_UNIT_PROFILE_CHANGED')
    control = BASE + '/' + p['nonce'] + '/control/owner.py'
    for action, field in [('--run', 'execStartSHA256'), ('--stopped', 'execStopPostSHA256')]:
        need(config.get(field) == digest(json.dumps(['/usr/bin/python3', '-I', control, action, p['nonce']],
                                                   separators=(',', ':')).encode()), 'R33_OWNED_UNIT_COMMAND_CHANGED')
    need(proof.get('kind') == 'r33-single-entry-method-root-unit-proof-r2' and proof.get('nonce') == p['nonce']
         and proof.get('unit') == unit and proof.get('invocationId') == p['invocationId']
         and proof.get('ownerSHA256') == sources['ownerSHA256']
         and proof.get('activationSHA256') == p['activationSHA256'] and proof.get('onceSHA256') == p['onceSHA256'],
         'R33_OWNED_UNIT_PROOF_CHAIN_CHANGED')
    need(stopped.get('kind') == 'r33-single-entry-method-owner-stopped-r2' and stopped.get('nonce') == p['nonce']
         and stopped.get('unit') == unit and stopped.get('invocationId') == p['invocationId']
         and stopped.get('ownerSHA256') == sources['ownerSHA256']
         and stopped.get('activationSHA256') == p['activationSHA256'], 'R33_OWNED_STOP_CHAIN_CHANGED')
    stderr = verify_r2_stderr_binding(p, rows, proof)
    facts = {'originalKernelFactsVerified': False, 'ownerStderrEmpty': stderr['bytes'] == 0,
             'ownerStderrIdentityBound': True, 'ownerStderrSHA256': stderr['sha256'], 'ownerStderrBytes': stderr['bytes']}
    if stderr['bytes'] != 0:
        facts['kernelFactsError'] = {'errorCode': 'R33_OWNED_R2_OWNER_STDERR_NOT_EMPTY', 'errno': None}
    elif result.get('methodSubsetProducerPassed') is not True:
        facts['kernelFactsError'] = {'errorCode': 'R33_OWNED_R2_PARENT_METHOD_NOT_PASSED', 'errno': None}
    else:
        try:
            facts['originalKernelFactsVerified'] = verify_original_kernel_facts(p, owner, fixture, method, result, stopped)
        except BaseException as error:
            # Failure never supplies missing historical EXIT facts. No stdout/body
            # passed claim overrides a nonempty inherited Root stderr stream.
            facts['kernelFactsError'] = closed_error(error)
    return {'rawChainBound': True, **facts, 'rootCapabilityMask': 226, 'stoppedServiceResult': stopped.get('serviceResult'),
            'stoppedExitCode': stopped.get('exitCode'), 'stoppedExitStatus': stopped.get('exitStatus'),
            'methodSubsetProducerPassed': result.get('methodSubsetProducerPassed') is True,
            'actualMethodSubsetSourceFactsVerified': False}


def verify_r2_stderr_binding(p, rows, proof):
    """Bind the pre-WX sink inode; original integers never cross a Node re-encode."""
    initial = proof.get('ownerStderrInitialIdentity')
    row = rows.get('work/owner.stderr.raw')
    need(type(initial) is list and len(initial) == 9 and all(type(v) is int for v in initial)
         and initial[0] >= 0 and initial[1] > 0 and initial[2:4] == [0, 0]
         and stat.S_ISREG(initial[4]) and stat.S_IMODE(initial[4]) == 0o600 and initial[5:7] == [1, 0]
         and proof.get('ownerStderrInitialIdentitySHA256') == digest(canonical(initial)),
         'R33_OWNED_R2_STDERR_INITIAL_IDENTITY_CHANGED')
    need(type(row) is dict and type(row.get('metadata')) is list and len(row['metadata']) == 9
         and all(type(v) is int for v in row['metadata']) and row['metadata'][:6] == initial[:6]
         and type(row.get('bytes')) is int and row['bytes'] >= 0 and row['metadata'][6] == row['bytes'],
         'R33_OWNED_R2_STDERR_CURRENT_IDENTITY_CHANGED')
    raw = base64.b64decode(row.get('base64', ''), validate=True)
    pin = p['expectedRawFiles'].get('work/owner.stderr.raw')
    need(type(pin) is dict and len(raw) == row['bytes'] == pin['bytes']
         and digest(raw) == row.get('sha256') == pin['sha256'], 'R33_OWNED_R2_STDERR_ORIGINAL_BYTES_CHANGED')
    config = proof.get('configuration', {})
    need(config.get('standardOutput') == 'null' and config.get('standardError') == 'append'
         and config.get('standardErrorFile') == BASE + '/' + p['nonce'] + '/work/owner.stderr.raw',
         'R33_OWNED_R2_STDERR_UNIT_DESTINATION_CHANGED')
    return {'sha256': digest(raw), 'bytes': len(raw), 'identityBound': True}


def verify_original_kernel_facts(p, owner, fixture, method, result, stopped):
    """Data only: original integers, source and two distinct historical PIDFD chains."""
    if method.get('fixtureQualified') is not True:
        return False
    source, runtime = method.get('source', {}), method.get('runtime', {})
    need(source.get('phase') == 'native' and source.get('generatedSourceSHA256') == FIXED_SOURCES['generatedSHA256']
         and source.get('generatorSHA256') == FIXED_SOURCES['generatorSHA256']
         and source.get('pureModuleSHA256') == FIXED_SOURCES['moduleSHA256']
         and same_json(source.get('selectedSourceSHA256'), SELECTED_SOURCES)
         and all(source.get(k) is False for k in ('wholeProgramTopLevelExecuted', 'censusDefinitionLoaded', 'actualSourceMappingQualified')),
         'R33_OWNED_ORIGINAL_METHOD_SOURCE_CHANGED')
    caps = runtime.get('capabilities', {})
    need(same_json(runtime.get('realEffectiveSavedUID'), [1000, 1000, 1000])
         and same_json(runtime.get('realEffectiveSavedGID'), [1000, 1000, 1000])
         and type(runtime.get('noNewPrivileges')) is int and runtime['noNewPrivileges'] == 1
         and runtime.get('isolatedPython') is True and runtime.get('rootOwnerProfileAsserted') is False
         and runtime.get('cgroups') == [owner['controlGroup']] and set(caps) == {'CapEff', 'CapPrm', 'CapInh'}
         and all(type(v) is str and re.fullmatch('[a-f0-9]+', v) and int(v, 16) == 0 for v in caps.values())
         and same_json(identity_core(runtime.get('fixtureIdentity')), identity_core(fixture)),
         'R33_OWNED_ORIGINAL_METHOD_RUNTIME_CHANGED')
    child = method.get('childIdentity')
    need(type(child) is dict and set(child) == set(IDENTITY_KEYS) and identity_core(child) is not None
         and same_json(child, p['child']) and child['ppid'] == fixture['pid'] and child['boot'] == fixture['boot']
         and type(method.get('requestedChildPID')) is int and method['requestedChildPID'] == child['pid'],
         'R33_OWNED_ORIGINAL_CHILD_IDENTITY_CHANGED')
    live = method.get('liveRecord', {})
    need(same_json(identity_core(live), child) and type(live.get('uid')) is int and live['uid'] == 1000
         and type(live.get('state')) is str and len(live['state']) == 1 and live['state'] != 'Z'
         and live.get('cgroups') == runtime['cgroups'], 'R33_OWNED_ORIGINAL_CHILD_LIVE_RECORD_CHANGED')
    proof = method.get('originalBoundExitProof', {})
    kernel = proof.get('kernelProof', {})
    need(proof.get('pid') == child['pid'] and proof.get('boot') == child['boot']
         and same_json(proof.get('processIdentity'), child)
         and same_json(proof.get('listedProcIdentity'), {'device': child['procDevice'], 'inode': child['procInode']})
         and set(kernel) == {'type', 'attached', 'identityBound', 'requestedPID', 'exitConfirmed', 'pollEvents', 'procPathAbsent'}
         and kernel.get('type') == 'pidfd-POLLIN' and type(kernel.get('requestedPID')) is int
         and kernel['requestedPID'] == child['pid'] and type(kernel.get('pollEvents')) is int and kernel['pollEvents'] in (1, 17)
         and all(kernel.get(k) is True for k in ('attached', 'identityBound', 'exitConfirmed', 'procPathAbsent')),
         'R33_OWNED_ORIGINAL_CHILD_EXIT_PROOF_CHANGED')
    parent = result.get('fixtureKernelExitProof', {})
    need(parent.get('type') == 'parent-owned-fixture-pidfd-POLLIN' and type(parent.get('requestedPID')) is int
         and parent['requestedPID'] == fixture['pid'] and same_json(parent.get('processIdentity'), fixture)
         and type(parent.get('pollEvents')) is int and parent['pollEvents'] in (1, 17)
         and all(parent.get(k) is True for k in ('attached', 'identityBound', 'exitConfirmed', 'procPathAbsent'))
         and result.get('fixturePIDFDClosed') is True and result.get('ownerSelfPIDFDClosed') is True
         and result.get('emergencyStopAttempted') is False and result.get('fixtureExitCode') == 0
         and result.get('requestedFixturePID') == fixture['pid'] and result.get('firstFailure') is None
         and same_json(result.get('secondaryFailures'), []) and result.get('methodSubsetProducerPassed') is True,
         'R33_OWNED_ORIGINAL_PARENT_EXIT_PROOF_CHANGED')
    self_bound = owner.get('selfPIDFD', {})
    need(self_bound.get('requestedPID') == owner['pid'] and self_bound.get('attached') is True
         and self_bound.get('identityBound') is True and type(self_bound.get('livePollEvents')) is int
         and self_bound['livePollEvents'] == 0 and type(self_bound.get('fdIdentity')) is list
         and len(self_bound['fdIdentity']) == 9 and all(type(v) is int for v in self_bound['fdIdentity']),
         'R33_OWNED_ORIGINAL_OWNER_PIDFD_CHANGED')
    need(method.get('schemaVersion') == 1 and method.get('readyProtocolSHA256')
         == 'b7648b15b26e79747f5dd39557acde5a710b8efd9b7e4172eee10de00dbaa408'
         and all(method.get(k) is True for k in ('methodSubsetExercised', 'readyHandshakeCompleted', 'releaseGateSent',
                                              'naturalChildExit', 'childReaped', 'descriptorClosed'))
         and method.get('signalsSent') is False and method.get('firstFailure') is None
         and same_json(method.get('secondaryFailures'), []) and method.get('fixturePhase') == 'COMPLETE'
         and type(method.get('childExitCode')) is int and method['childExitCode'] == 0
         and stopped.get('serviceResult') == 'success' and stopped.get('exitCode') == 'exited' and stopped.get('exitStatus') == '0',
         'R33_OWNED_ORIGINAL_METHOD_LIFECYCLE_CHANGED')
    ledger = method.get('descriptorLedger')
    need(type(ledger) is list and 0 < len(ledger) <= 1000
         and all(type(row) is dict and row.get('closeAttempted') is True and row.get('closed') is True
                 and row.get('closeError') is None and type(row.get('fd')) is int and row['fd'] >= 0
                 and type(row.get('sequence')) is int and row['sequence'] == i
                 for i, row in enumerate(ledger)), 'R33_OWNED_ORIGINAL_LEDGER_INCOMPLETE')
    own_dir, child_fd = method.get('selfAcquisition', {}), method.get('childFDAcquisition', {})
    need(own_dir.get('numericPIDPathUsed') is True and own_dir.get('eofObserved') is True
         and own_dir.get('adapterMatchedPrimitiveWithoutDotEntries') is True and own_dir.get('adapterBorrowedFDStayedOpen') is True
         and type(own_dir.get('primitiveRecords')) is list and type(own_dir.get('primitiveCallsIncludingEOF')) is int
         and own_dir['primitiveCallsIncludingEOF'] == len(own_dir['primitiveRecords']) + 1
         and child_fd.get('borrowedFDStayedOpen') is True and child_fd.get('getfdUsed') is False
         and type(child_fd.get('knownPipeSlots')) is dict and len(child_fd['knownPipeSlots']) == 2
         and all(type(row) is dict and row.get('matched') is True for row in child_fd['knownPipeSlots'].values()),
         'R33_OWNED_ORIGINAL_ACQUISITION_INCOMPLETE')
    return True


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


def workspace_path(value, root):
    value = value.removesuffix(' (deleted)')
    return value == root or value.startswith(root + '/')


def actor_probe(identity, role, root, boot):
    if identity is None:
        return {'role': role, 'present': None, 'complete': False, 'errorCode': 'R33_OWNED_ACTOR_HISTORY_UNKNOWN'}
    value = identity_core(identity)
    path = '/proc/' + str(value['pid'])
    try:
        before = os.stat(path, follow_symlinks=False)
    except FileNotFoundError as error:
        need(error.errno == errno.ENOENT and boot == value['boot'], 'R33_OWNED_ACTOR_ABSENCE_UNKNOWN')
        return {'role': role, 'pid': value['pid'], 'present': False, 'complete': True,
                'currentPathAbsent': True, 'historicalExitInferredFromAbsence': False}
    need(stat.S_ISDIR(before.st_mode) and (before.st_dev, before.st_ino) == (value['procDevice'], value['procInode']),
         'R33_OWNED_ACTOR_PID_REUSED')
    held = None
    directory = None
    descriptors = []
    with preserving_close(descriptors, 'ACTOR_READ'):
        held = os.pidfd_open(value['pid'], 0)
        descriptors.append(held)
        after_attach = os.stat(path, follow_symlinks=False)
        need((after_attach.st_dev, after_attach.st_ino) == (before.st_dev, before.st_ino), 'R33_OWNED_ACTOR_ATTACH_CHANGED')
        directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        descriptors.insert(0, directory)
        info = os.fstat(directory)
        need((info.st_dev, info.st_ino) == (before.st_dev, before.st_ino), 'R33_OWNED_ACTOR_DIRECTORY_CHANGED')
        first = read_proc_bytes(directory, 'stat', 65536).decode('utf-8', 'strict').rsplit(')', 1)[1].split()
        need(len(first) >= 20 and first[19] == value['startTicks'] and int(first[1]) == value['ppid'] and boot == value['boot'],
             'R33_OWNED_ACTOR_LIFETIME_CHANGED')
        related = 0
        links = []
        if first[0] != 'Z':
            for name in ('cwd', 'exe'):
                links.append(os.readlink(name, dir_fd=directory))
            fds = os.open('fd', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
            with preserving_close([fds], 'ACTOR_FD_TARGET_READ'):
                entries = os.scandir(fds)
                with preserving_close([], 'ACTOR_FD_TARGET_READ', [entries.close]):
                    count = 0
                    for entry in entries:
                        count += 1
                        need(count <= 100000 and entry.name.isdigit(), 'R33_OWNED_FD_SCOPE_INCOMPLETE')
                        links.append(os.readlink(entry.name, dir_fd=fds))
            related = sum(workspace_path(link, root) for link in links)
        last = read_proc_bytes(directory, 'stat', 65536).decode('utf-8', 'strict').rsplit(')', 1)[1].split()
        named = os.stat(path, follow_symlinks=False)
        need(last[19] == first[19] and last[1] == first[1]
             and (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino), 'R33_OWNED_ACTOR_READ_CHANGED')
        poll = select.poll()
        poll.register(held, select.POLLIN)
        events = poll.poll(0)
        need(len(events) <= 1 and all(row[0] == held for row in events), 'R33_OWNED_PIDFD_POLL_UNKNOWN')
        mask = events[0][1] if events else 0
        need(mask == 0 or mask & select.POLLIN and not mask & ~(select.POLLIN | select.POLLHUP), 'R33_OWNED_PIDFD_POLL_UNKNOWN')
        return {'role': role, 'pid': value['pid'], 'present': True, 'complete': True, 'identityMatches': True,
                'pidfdBound': True, 'pollEvents': mask, 'namespaceRelatedFDOrLinkCount': related}


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
    need(re.fullmatch(r'/system.slice/jarvis-single-entry-method-r33-r2-[a-f0-9]{32}\.service', group),
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


def namespace_sockets(root):
    fd = os.open('/proc/net/unix', os.O_RDONLY | os.O_CLOEXEC)
    with preserving_close([fd], 'SOCKET_READ'):
        raw = b''
        while len(raw) <= 4194304:
            block = os.read(fd, 65536)
            if not block:
                break
            raw += block
        need(len(raw) <= 4194304, 'R33_OWNED_SOCKET_READ_LIMIT')
    rows = []
    lines = raw.decode('utf-8', 'strict').splitlines()
    need(lines and lines[0].split() == ['Num', 'RefCount', 'Protocol', 'Flags', 'Type', 'St', 'Inode', 'Path'],
         'R33_OWNED_SOCKET_HEADER_INCOMPLETE')
    for line in lines[1:]:
        parts = line.split(None, 7)
        need(len(parts) >= 7, 'R33_OWNED_SOCKET_PARSE_INCOMPLETE')
        if len(parts) == 8:
            name = parts[7]
            if workspace_path(name.removeprefix('@'), root):
                rows.append({'inode': parts[6], 'pathSHA256': digest(name.encode())})
    return {'count': len(rows), 'rows': rows, 'complete': True,
            'scope': 'current host-visible unix paths under exact namespace; not external/private-net holder absence'}


def physical_frame(p):
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    need(BOOT.fullmatch(boot) is not None, 'R33_OWNED_BOOT_UNKNOWN')
    root = BASE + '/' + p['nonce']
    unit = 'jarvis-single-entry-method-r33-r2-' + p['nonce'] + '.service'
    actors = []
    for role in ('owner', 'fixture', 'child'):
        try:
            actors.append(actor_probe(p[role], role, root, boot))
        except BaseException as error:
            actors.append({'role': role, 'pid': p[role].get('pid') if p[role] else None,
                           'present': None, 'complete': False, **closed_error(error)})
    return {'boot': boot, 'actors': actors, 'unit': unit_frame(unit, p['invocationId']),
            'cgroup': cgroup_frame('/system.slice/' + unit), 'namespaceSockets': namespace_sockets(root)}


def observe_owned_scope_r33_r2(payload=None):
    result = {'schemaVersion': 1, 'kind': 'r33-single-entry-owned-scope-host-observation-r2',
              'ready': False, 'currentOwnedScopeCleanupVerified': False,
              'actualMethodSubsetSourceFactsVerified': False, 'originalKernelFactsVerified': False,
              'sourceRawBindingVerified': False, 'wholeProcCensusExecuted': False,
              'externalHoldersAbsenceProved': False, 'fullProtectionQualified': False,
              'nodeACKRead': False, 'queueRead': False, 'productAccepted': False, 'productCodeExecuted': False,
              'modelsInvoked': False, 'mutationsPerformed': False, 'signalsSent': False, 'resourcesRemoved': False,
              'remoteMutationsPerformed': False, 'historicalNamespaceIdentityRecorded': False,
              'originalRawFileRefs': {}, 'physicalFrames': [], 'readErrors': []}
    if payload is None:
        return {**result, 'preparedOnly': True, 'runtimeIOPerformed': False,
                'reason': 'R33_OWNED_ACTUAL_PACKET_REQUIRED'}
    p = validate_payload(payload)  # All source/record/run structural guards precede OS access.
    result.update({'nonce': p['nonce'], 'phase': 'native', 'sourceProtocol': PROTOCOL,
                   'contextSHA256': digest(canonical(p)), 'scopeBinding': p, 'runtimeIOPerformed': True})
    first = second = None
    try:
        need(sys.platform == 'linux' and os.getresuid() == os.getresgid() == (0, 0, 0)
             and hasattr(os, 'pidfd_open'), 'R33_OWNED_ROOT_LINUX_REQUIRED')
        first = namespace_read(p, result['originalRawFileRefs'])
        result['rawSourceChain'] = verify_raw_chain(p, first['records'])
        result['originalKernelFactsVerified'] = result['rawSourceChain']['originalKernelFactsVerified']
        result['physicalFrames'].append(physical_frame(p))
        result['physicalFrames'].append(physical_frame(p))
        last_rows = {}
        second = namespace_read(p, last_rows)
        need(first == second, 'R33_OWNED_RECORDS_OR_NAMESPACE_DRIFT')
        frames = result['physicalFrames']
        need(frames[0] == frames[1], 'R33_OWNED_CURRENT_PHYSICAL_FRAME_DRIFT')
        result['namespaceIdentity'] = first['identity']
        result['namespaceMetadataSHA256'] = first['metadataSHA256']
        result['recordsStable'] = result['namespaceStable'] = True
        result['sourceRawBindingVerified'] = True
        clean = all(all(a['complete'] and a['present'] is False for a in f['actors'])
                    and f['unit']['complete'] and f['unit']['currentStopped']
                    and f['cgroup']['complete'] and not f['cgroup']['members']
                    and f['namespaceSockets']['complete'] and f['namespaceSockets']['count'] == 0 for f in frames)
        result['currentOwnedScopeCleanupVerified'] = bool(first['complete'] and second['complete'] and clean)
        result['ready'] = result['currentOwnedScopeCleanupVerified']
    except BaseException as error:
        result['readErrors'].append(closed_error(error))
    return result
