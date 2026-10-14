"""Fixed R2 unit configuration diagnostic only; no method or cleanup qualification.

No CLI/import IO. Null or incomplete original packet refuses before OS access.
Only this namespace and exact systemd/cgroup are read; original bytes stay private.
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

BASE = '/var/lib/jarvis-single-entry-bound-method-r33-r2'
NONCE = '33144b8f580272b698427102f902ad51'
PROTOCOL = 'r33-single-entry-owned-method-v2'
DEPENDENCY_SHA256 = '95e2a5f174c0e820f83c3af24b11965c50eabbb1e9db72b87757f112a31b4507'
CONTROL = ('owner.py', 'fixture.py', 'generated.py', 'activation.json', 'once.json')
WORK = ('owner.json', 'fixture-process.json', 'fixture.stdout.json', 'fixture.stderr.raw', 'result.json', 'stopped.json', 'owner.stderr.raw')
EXPECTED_CONTROL5 = {
 'owner.py': {'sha256':'0ef6b9ca43da43c19f7ae4fe97646cabbc8e72e4f11e5b342ad2452e0509a8f7','bytes':34024},
 'fixture.py': {'sha256':'3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8','bytes':34256},
 'generated.py': {'sha256':'2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73','bytes':28366},
 'activation.json': {'sha256':'1aa7c8a4d97f2e5871700ef4290ce7ffb8239bbbc3c9ae98b43cb519d532bc06','bytes':None},
 'once.json': {'sha256':'d124375a2c27d15dc56f18e5b8d77d9510354a3fe057270e0c84faed910f9f6e','bytes':None}}
ACTUAL_REFS = {
 'journal': {'path':'.jarvis-dev/maintenance/factory-r33-single-entry-bound-method-r2-once.json','sha256':'2c175cb818d03807ef0fc4bd76e386720618bce4b17a9db61e2ba43936c0fe9d'},
 'startTransport': {'path':'.jarvis-dev/maintenance/r33-single-entry-method-r2-transport-1791887865619-221277bd-5528-405d-97f6-e898c0bb4061.json','sha256':'8d38c042b5e4966dacae22f1ec43ee1ac3ceed0b688539995c1d40f3aa366a3d'},
 'checkTransport': {'path':'.jarvis-dev/maintenance/r33-single-entry-method-r2-transport-1791888029074-2eb374d4-2cb7-4647-abc2-4dae49e19fea.json','sha256':'11933fe07b28ede84563d9ffb192a9ca0370bc58936d407313a407a76d3d4eac'},
 'sourceReview': {'path':'artifacts/software-factory/goals-r29/r33-single-entry-bound-method-parent-independent-local-review-r2-1791885333173-6d374857-b426-4a9b-acd7-ca89eefa0298.json','sha256':'809f45fb702de6270ee6d4d06d7270f6d559ce9fed381958fbd82ca6bf12b952'}}
UNIT_PROPERTIES = ('Id','LoadState','ActiveState','SubState','MainPID','ControlGroup','InvocationID','User','Group','NoNewPrivileges','CapabilityBoundingSet','AmbientCapabilities','PrivateNetwork','ProtectControlGroups','RuntimeMaxUSec','TimeoutStopUSec','KillMode','KillSignal','Restart','ExecStart','ExecStopPost','StandardOutput','StandardError','StandardErrorFile','Result','ExecMainCode','ExecMainStatus')
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

def validate_diagnostic_payload(payload):
    need(type(payload) is dict and set(payload) == {'schemaVersion','kind','nonce','sourceProtocol','readerReview','actualRefs','expectedControl5'},
         'R33_OWNED_UNIT_DIAGNOSTIC_PACKET_REQUIRED')
    need(type(payload.get('schemaVersion')) is int and payload['schemaVersion'] == 1
         and payload.get('kind') == 'r33-single-entry-unit-config-diagnostic-input-r2'
         and payload.get('nonce') == NONCE and payload.get('sourceProtocol') == PROTOCOL,
         'R33_OWNED_UNIT_DIAGNOSTIC_SCOPE_CHANGED')
    review = payload.get('readerReview')
    need(type(review) is dict and set(review) == {'path','sha256'} and type(review.get('path')) is str
         and re.fullmatch(r'artifacts/software-factory/goals-r29/r33-single-entry-unit-config-diagnostic-independent-local-review-r2-[0-9]{13}-[a-f0-9-]{36}\.json', review['path'])
         and type(review.get('sha256')) is str and H.fullmatch(review['sha256']), 'R33_OWNED_UNIT_DIAGNOSTIC_REVIEW_REQUIRED')
    need(same_json(payload.get('actualRefs'), ACTUAL_REFS) and same_json(payload.get('expectedControl5'), EXPECTED_CONTROL5),
         'R33_OWNED_UNIT_DIAGNOSTIC_ORIGINAL_SOURCE_CHANGED')
    return json.loads(canonical(payload))


def diagnostic_namespace_read(output):
    fd = anchored_directory(BASE + '/' + NONCE)
    records, directories = {}, {}
    with preserving_close([fd], 'UNIT_DIAGNOSTIC_NAMESPACE_READ'):
        outer = os.fstat(fd)
        names = set(os.listdir(fd))
        need(stat.S_IMODE(outer.st_mode) == 0o711 and names in ({'control','work'},{'control','work','unit-proof.json'}),
             'R33_OWNED_UNIT_DIAGNOSTIC_NAMESPACE_CHANGED')
        directories['root'] = metadata(outer)
        present_work = []
        for folder, mode in [('control',0o555),('work',0o700)]:
            before = os.stat(folder, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0 and stat.S_IMODE(before.st_mode) == mode,
                 'R33_OWNED_UNIT_DIAGNOSTIC_DIRECTORY_UNTRUSTED')
            directory = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
            with preserving_close([directory], 'UNIT_DIAGNOSTIC_DIRECTORY_READ'):
                entries = set(os.listdir(directory))
                need(metadata(before) == metadata(os.fstat(directory)) and
                     (entries == set(CONTROL) if folder == 'control' else entries <= set(WORK)),
                     'R33_OWNED_UNIT_DIAGNOSTIC_FILE_SET_CHANGED')
                if folder == 'work':present_work = sorted(entries)
                for name in sorted(entries):
                    raw, meta = held_file(directory, name, 0o444 if folder == 'control' else 0o600)
                    key = folder + '/' + name
                    row = {'base64':base64.b64encode(raw).decode(),'sha256':digest(raw),'bytes':len(raw),
                           'metadata':meta,'metadataSHA256':digest(canonical(meta)),'readComplete':True}
                    records[key] = row
                    output[key] = row
                    if folder == 'control':
                        pin = EXPECTED_CONTROL5[name]
                        need(row['sha256'] == pin['sha256'] and (pin['bytes'] is None or row['bytes'] == pin['bytes']),
                             'R33_OWNED_UNIT_DIAGNOSTIC_CONTROL_BYTES_CHANGED')
                need(entries == set(os.listdir(directory)) and metadata(before) == metadata(os.fstat(directory))
                     == metadata(os.stat(folder,dir_fd=fd,follow_symlinks=False)), 'R33_OWNED_UNIT_DIAGNOSTIC_DIRECTORY_CHANGED')
                directories[folder] = metadata(before)
        if 'unit-proof.json' in names:
            raw, meta = held_file(fd,'unit-proof.json',0o444)
            row = {'base64':base64.b64encode(raw).decode(),'sha256':digest(raw),'bytes':len(raw),
                   'metadata':meta,'metadataSHA256':digest(canonical(meta)),'readComplete':True}
            records['unit-proof.json'] = row
            output['unit-proof.json'] = row
        need(names == set(os.listdir(fd)) and metadata(outer) == metadata(os.fstat(fd)), 'R33_OWNED_UNIT_DIAGNOSTIC_NAMESPACE_CHANGED')
        missing = ['work/' + name for name in WORK if name not in present_work]
        if 'unit-proof.json' not in names:missing.append('unit-proof.json')
        return {'identity':{'device':outer.st_dev,'inode':outer.st_ino},'directories':directories,
                'metadataSHA256':digest(canonical(directories)),'records':records,'presentWorkNames':present_work,
                'missingRawFiles':missing,'unitProofPresent':'unit-proof.json' in names,'complete':True}


def verify_diagnostic_controls(rows):
    a = raw_json(rows,'control/activation.json')
    once = raw_json(rows,'control/once.json')
    common = {'schemaVersion':1,'nonce':NONCE,'phase':'native','sourceProtocol':PROTOCOL,
              'ownerSHA256':EXPECTED_CONTROL5['owner.py']['sha256'],'fixtureSHA256':EXPECTED_CONTROL5['fixture.py']['sha256'],
              'generatedSHA256':EXPECTED_CONTROL5['generated.py']['sha256'],
              'buildStaticMappingSHA256':'909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188',
              'fixtureWorkSeconds':45,'runtimeMaxSec':80,'timeoutStopSec':10,'hardParentBoundSeconds':90}
    need(a.get('kind') == 'r33-single-entry-method-root-activation-r2' and once.get('kind') == 'r33-single-entry-method-root-once-r2'
         and all(same_json(a.get(k),v) and same_json(once.get(k),v) for k,v in common.items())
         and same_json(a.get('parentReview'),ACTUAL_REFS['sourceReview'])
         and once.get('unit') == 'jarvis-single-entry-method-r33-r2-' + NONCE + '.service'
         and once.get('activationSHA256') == EXPECTED_CONTROL5['activation.json']['sha256'],
         'R33_OWNED_UNIT_DIAGNOSTIC_SOURCE_INTENT_CHANGED')
    return True


def diagnostic_unit_frame(responses):
    unit = 'jarvis-single-entry-method-r33-r2-' + NONCE + '.service'
    r = subprocess.run(['/usr/bin/systemctl','show',unit,'--property=' + ','.join(UNIT_PROPERTIES)],capture_output=True,
                       timeout=8,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
    responses.append({'status':r.returncode,'stdoutBase64':base64.b64encode(r.stdout).decode(),
                      'stderrBase64':base64.b64encode(r.stderr).decode(),'stdoutSHA256':digest(r.stdout),
                      'stderrSHA256':digest(r.stderr),'stdoutBytes':len(r.stdout),'stderrBytes':len(r.stderr)})
    need(r.returncode == 0 and len(r.stdout) <= 131072 and len(r.stderr) <= 32768, 'R33_OWNED_UNIT_DIAGNOSTIC_SYSTEMD_READ_INCOMPLETE')
    rows = [line.split('=',1) for line in r.stdout.decode('utf-8','strict').splitlines()]
    need(all(len(row) == 2 for row in rows), 'R33_OWNED_UNIT_DIAGNOSTIC_SYSTEMD_PARSE_INCOMPLETE')
    props = dict(rows)
    need(len(props) == len(rows) and set(props) <= set(UNIT_PROPERTIES) and props.get('Id') == unit,
         'R33_OWNED_UNIT_DIAGNOSTIC_SYSTEMD_SCOPE_CHANGED')
    # Diagnostic values remain original strings. Never substitute expected config
    # or bind this currently observed invocation as an unrecorded historical ID.
    missing = [name for name in UNIT_PROPERTIES if name not in props]
    return {'properties':props,'missingProperties':missing,'propertiesComplete':not missing,
            **({'observedInvocationId':props['InvocationID']} if 'InvocationID' in props else {}),
            'historicalInvocationIdRecorded':False,'complete':True}


def observe_single_entry_unit_config_r33_r2(payload=None):
    result = {'schemaVersion':1,'kind':'r33-single-entry-unit-config-diagnostic-host-observation-r2','ready':False,
              'diagnosticReadComplete':False,'sourceRawBindingVerified':False,'recordsStable':False,'namespaceStable':False,
              'physicalFramesStable':False,'historicalInvocationIdRecorded':False,'historicalNamespaceIdentityRecorded':False,
              'historicalRecordMetadataRecorded':False,'unknownOriginalActorIdentitiesPreserved':True,
              'ownerIdentity':None,'fixtureIdentity':None,'childIdentity':None,'generatedMethodCodeMayHaveExecuted':None,
              'originalMethodPhaseOrFirstFailureKnown':False,'actualMethodSubsetIndependentlyQualified':False,
              'actualKernelMethodQualified':False,'currentOwnedScopeCleanupVerified':False,
              'currentFailureUnitAndCgroupScopeClosedVerified':False,'externalHoldersAbsenceProved':False,
              'fullProtectionQualified':False,'globalCleanupQualified':False,'wholeProcCensusExecuted':False,'actorProbeExecuted':False,
              'unixGlobalSocketScanExecuted':False,'signalsSent':False,'resourcesRemoved':False,'mutationsPerformed':False,
              'productCodeExecuted':False,'modelsInvoked':False,'originalRawFileRefs':{},'physicalFrames':[],
              'unitRawResponses':[],'readErrors':[]}
    if payload is None:
        return {**result,'preparedOnly':True,'runtimeIOPerformed':False,'reason':'R33_OWNED_UNIT_DIAGNOSTIC_ACTUAL_PACKET_REQUIRED'}
    p = validate_diagnostic_payload(payload)  # Complete pinned packet before any OS access.
    result.update({'nonce':NONCE,'phase':'native','sourceProtocol':PROTOCOL,'contextSHA256':digest(canonical(p)),
                   'scopeBinding':p,'runtimeIOPerformed':True})
    try:
        need(sys.platform == 'linux' and os.getresuid() == os.getresgid() == (0,0,0), 'R33_OWNED_UNIT_DIAGNOSTIC_ROOT_LINUX_REQUIRED')
        first = diagnostic_namespace_read(result['originalRawFileRefs'])
        verify_diagnostic_controls(first['records'])
        unit = 'jarvis-single-entry-method-r33-r2-' + NONCE + '.service'
        for _ in range(2):
            frame = {'unit':diagnostic_unit_frame(result['unitRawResponses'])}
            result['physicalFrames'].append(frame)
            frame['cgroup'] = cgroup_frame('/system.slice/' + unit)
        second = diagnostic_namespace_read({})
        need(same_json(first,second), 'R33_OWNED_UNIT_DIAGNOSTIC_ORIGINAL_BYTES_OR_METADATA_DRIFT')
        result['sourceRawBindingVerified'] = result['recordsStable'] = result['namespaceStable'] = True
        result['physicalFramesStable'] = same_json(result['physicalFrames'][0],result['physicalFrames'][1])
        for frame,namespace in zip(result['physicalFrames'],(first,second)):
            frame.update({'namespaceIdentity':namespace['identity'],'namespaceMetadataSHA256':namespace['metadataSHA256'],
                          'presentWorkNames':namespace['presentWorkNames'],'missingRawFiles':namespace['missingRawFiles'],
                          'unitProofPresent':namespace['unitProofPresent']})
        result['allRequestedUnitPropertiesPresent'] = all(frame['unit']['propertiesComplete'] for frame in result['physicalFrames'])
        result['diagnosticReadComplete'] = True  # Response read complete; missing getters remain explicit.
    except BaseException as error:
        result['readErrors'].append(closed_error(error))
    return result
