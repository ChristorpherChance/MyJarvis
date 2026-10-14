"""One reviewed byte-only source handoff. No candidate code or package is loaded."""
import base64
import ctypes
import fcntl
import hashlib
import json
import os
import re
import signal
import stat
import sys
import time
import uuid
from pathlib import PurePosixPath
from types import ModuleType

sys.dont_write_bytecode = True
SCOPE = {
    'kind': 'r31-target-source-byte-scope-r2', 'schemaVersion': 1,
    'projectId': '70ec346f-6520-46ed-abed-22cac770a3e4',
    'machineId': 'b737bb02-1ad7-48e8-8c8a-00fdfb44ef73',
    'source': '/home/superopen/All-Projects/msf-targets-r29/source',
    'parent': '/var/lib/jarvis-development/101/targets-r31-candidate-r2',
    'workspace': '/var/lib/jarvis-development/101/targets-r31-candidate-r2/source',
    'preparationRoot': '/var/lib/jarvis-development/101/targets-r31-preparation-r2',
    'helperPath': '/opt/jarvis-development/software-factory/project-autonomy-evidence.py',
    'helperSHA256': '57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
    'baselineSHA256': '4907e45a21799f2dd14ac2373769607f40d6b9e0319bb614fbe259b157e60493',
    'baselineMetadataSHA256': '2da9d3e490fd6d042113c067807a89b000a4f40fdb5fa8d3ca2911b6615ebce8',
    'baselineIdentity': {'device': 66306, 'inode': 6718050},
    'baselineFiles': 621, 'baselineBytes': 18386584,
    'candidateSHA256': '7814f74e1e7c62b1aeb862a6617970551a00493ba2884bf65595cfe65ef2a981',
    'flatManifestSHA256': '0800a9f384a3b96ce43b9b676c8b085fbc3666892a7376b7dde326069b2e030d',
    'candidateFiles': 625, 'candidateBytes': 18413026,
    'manifestSHA256': 'bd836464db3898667db0e10270821b3af54d4baa33a6f3c07de0368a8f702d27',
    'deltaMetadataSHA256': '4210324de567c391c9b201388c12a8bcdfeb52c5b21c8574cae2ddcd0a17bad1',
    'deltaPayloadSHA256': '16602d803deb25eff15a69db77d8f932e35998bb8acc2b31ff4abe655fef7fb6',
    'deltaFiles': 18, 'changedFiles': 14, 'addedFiles': 4,
}


def need(value, code):
    if not value:
        raise RuntimeError(code)


def raw_json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def metadata(value):
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid, value.st_mode,
            value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def identity(fd):
    value = os.fstat(fd)
    return {'device': value.st_dev, 'inode': value.st_ino}


def valid_path(value):
    return (isinstance(value, str) and 0 < len(value) < 400 and not value.startswith('/')
            and not re.search(r'[\\\x00-\x1f\x7f:]', value)
            and all(part not in ['', '.', '..'] for part in value.split('/')))


def validate_payload(p):
    need(isinstance(p, dict) and set(p) == {'scope', 'action', 'job', 'manifest', 'delta', 'planSHA256', 'programSHA256'}, 'R31_SOURCE_PARAMETER_SET_CHANGED')
    need(raw_json(p['scope']) == raw_json(SCOPE) and p['action'] in ['prepare', 'check']
         and isinstance(p['job'], str) and re.fullmatch(r'[a-f0-9]{32}', p['job']), 'R31_SOURCE_SCOPE_CHANGED')
    manifest, delta = p['manifest'], p['delta']
    need(isinstance(manifest, list) and len(manifest) == 625
         and digest(raw_json(manifest)) == SCOPE['manifestSHA256'], 'R31_SOURCE_MANIFEST_CHANGED')
    need(all(set(e) == {'path', 'sha256', 'bytes'} and valid_path(e['path'])
             and re.fullmatch(r'[a-f0-9]{64}', e['sha256'])
             and isinstance(e['bytes'], int) and not isinstance(e['bytes'], bool) and e['bytes'] >= 0 for e in manifest)
         and len({e['path'] for e in manifest}) == 625
         and sum(e['bytes'] for e in manifest) == 18413026, 'R31_SOURCE_MANIFEST_SCHEMA_CHANGED')
    need(isinstance(delta, list) and len(delta) == 18 and digest(raw_json(delta)) == SCOPE['deltaPayloadSHA256'], 'R31_SOURCE_DELTA_CHANGED')
    stripped = []
    for entry in delta:
        need(set(entry) == {'path', 'sha256', 'bytes', 'baselineSHA256', 'base64'} and valid_path(entry['path']), 'R31_SOURCE_DELTA_SCHEMA_CHANGED')
        data = base64.b64decode(entry['base64'], validate=True)
        need(base64.b64encode(data).decode() == entry['base64'] and len(data) == entry['bytes']
             and digest(data) == entry['sha256'], 'R31_SOURCE_DELTA_BYTES_CHANGED')
        stripped.append({k: v for k, v in entry.items() if k != 'base64'})
    need(digest(raw_json(stripped)) == SCOPE['deltaMetadataSHA256']
         and len({e['path'] for e in delta}) == 18
         and sum(e['baselineSHA256'] is None for e in delta) == 4, 'R31_SOURCE_DELTA_CLOSED_SET_CHANGED')
    need(digest(raw_json({'scope': p['scope'], 'manifest': manifest, 'delta': delta})) == p['planSHA256']
         and isinstance(p['programSHA256'], str) and re.fullmatch(r'[a-f0-9]{64}', p['programSHA256']), 'R31_SOURCE_PLAN_CHANGED')
    return p


def write_all(fd, data):
    view = memoryview(data)
    while view:
        size = os.write(fd, view)
        need(isinstance(size, int) and not isinstance(size, bool) and 0 < size <= len(view), 'R31_SOURCE_SHORT_WRITE')
        view = view[size:]


def original_ancestor_allowed(value, path, owner_ids, allow_original_read):
    standard = value.st_uid in owner_ids and value.st_gid in owner_ids and not value.st_mode & 0o022
    known_read = (allow_original_read is True and path == '/home/superopen/All-Projects'
                  and (value.st_dev, value.st_ino, value.st_uid, value.st_gid, stat.S_IMODE(value.st_mode))
                  == (66306, 14417952, 1000, 1000, 0o775))
    return stat.S_ISDIR(value.st_mode) and (standard or known_read)


def open_chain(path, owner_ids=(0, 1000), allow_original_read=False):
    parts = PurePosixPath(path).parts
    need(parts and parts[0] == '/' and '..' not in parts, 'R31_SOURCE_ABSOLUTE_PATH_REQUIRED')
    root = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    current = ''
    chain = [(root, None, None, metadata(os.fstat(root)))]
    try:
        for name in parts[1:]:
            current += '/' + name
            parent = chain[-1][0]
            before = os.stat(name, dir_fd=parent, follow_symlinks=False)
            need(original_ancestor_allowed(before, current, owner_ids, allow_original_read), 'R31_SOURCE_ANCESTOR_UNTRUSTED')
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                need(metadata(before) == metadata(os.fstat(fd)), 'R31_SOURCE_ANCESTOR_REPLACED')
            except BaseException:
                os.close(fd)
                raise
            chain.append((fd, parent, name, metadata(before)))
        return chain
    except BaseException:
        close_chain(chain)
        raise


def close_chain(chain):
    for fd, _, _, _ in reversed(chain):
        os.close(fd)


def check_chain(chain):
    for fd, parent, name, original in chain:
        held = metadata(os.fstat(fd))
        need(held[:5] == original[:5], 'R31_SOURCE_ANCESTOR_CHANGED')
        if parent is not None:
            need(metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)) == held, 'R31_SOURCE_ANCESTOR_REPLACED')


def parent_fd(root, path, create=False):
    need(valid_path(path), 'R31_SOURCE_RELATIVE_PATH_INVALID')
    fd = os.dup(root)
    try:
        for name in path.split('/')[:-1]:
            try:
                before = os.stat(name, dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                need(create, 'R31_SOURCE_PARENT_MISSING')
                os.mkdir(name, 0o755, dir_fd=fd)
                os.fsync(fd)
                before = os.stat(name, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and not before.st_mode & 0o022, 'R31_SOURCE_PARENT_UNTRUSTED')
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                need(metadata(before) == metadata(os.fstat(child)), 'R31_SOURCE_PARENT_REPLACED')
                if create:
                    need(before.st_uid == before.st_gid == 0, 'R31_SOURCE_DESTINATION_NOT_ROOT_OWNED')
                    os.fchmod(child, 0o755)
                    os.fsync(child)
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd, path.split('/')[-1]
    except BaseException:
        os.close(fd)
        raise


def read_regular(parent, name, expected=None, limit=20000000, root_owned=False):
    before = os.stat(name, dir_fd=parent, follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 <= before.st_size <= limit
         and (not root_owned or (before.st_uid == before.st_gid == 0 and not before.st_mode & 0o022)), 'R31_SOURCE_FILE_UNTRUSTED')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        need(metadata(before) == metadata(os.fstat(fd)), 'R31_SOURCE_FILE_PREOPEN_CHANGED')
        chunks, size = [], 0
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            size += len(block)
            need(size <= before.st_size, 'R31_SOURCE_FILE_GREW')
            chunks.append(block)
        need(size == before.st_size and metadata(before) == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'R31_SOURCE_FILE_CHANGED')
        data = b''.join(chunks)
        if expected is not None:
            need(len(data) == expected['bytes'] and digest(data) == expected['sha256'], 'R31_SOURCE_FILE_BYTES_CHANGED')
        return data
    finally:
        os.close(fd)


def write_new(parent, name, data, mode=0o644):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=parent)
    try:
        write_all(fd, data)
        os.fchmod(fd, mode)
        os.fsync(fd)
    finally:
        os.close(fd)
    os.fsync(parent)


def replace_known(parent, name, expected, data):
    before = os.stat(name, dir_fd=parent, follow_symlinks=False)
    read_regular(parent, name, expected, root_owned=True)
    temporary = '.r31-replacement-' + uuid.uuid4().hex
    write_new(parent, temporary, data)
    need(metadata(before) == metadata(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'R31_SOURCE_REPLACE_CAS_CHANGED')
    os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
    os.fsync(parent)


def store_phase(root, value):
    name = '.phase-' + uuid.uuid4().hex
    write_new(root, name, raw_json(value), 0o600)
    os.replace(name, 'phase.json', src_dir_fd=root, dst_dir_fd=root)
    os.fsync(root)


def publish_noreplace(source_parent, source_name, destination_parent, destination_name):
    library = ctypes.CDLL(None, use_errno=True)
    rename = getattr(library, 'renameat2', None)
    need(rename is not None, 'R31_SOURCE_ATOMIC_NOREPLACE_UNAVAILABLE')
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    need(rename(source_parent, source_name.encode(), destination_parent, destination_name.encode(), 1) == 0,
         'R31_SOURCE_PUBLISH_COLLISION_OR_UNSUPPORTED')
    os.fsync(source_parent)
    os.fsync(destination_parent)


def source_state(h, fd):
    before = metadata(os.fstat(fd))
    first = []
    h.walk(fd, first)
    rows = []
    for entry in first:
        parent, name = parent_fd(fd, entry['path'])
        try:
            value = os.stat(name, dir_fd=parent, follow_symlinks=False)
            need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1, 'R31_SOURCE_STATE_FILE_CHANGED')
            rows.append([entry['path'], *metadata(value)])
        finally:
            os.close(parent)
    second = []
    h.walk(fd, second)
    need(first == second and metadata(os.fstat(fd)) == before, 'R31_SOURCE_DOUBLE_READ_CHANGED')
    return {'sha256': digest(''.join(e['path'] + '\0' + e['sha256'] + '\n' for e in first).encode()),
            'files': len(first), 'bytes': sum(e['bytes'] for e in first),
            'metadataSHA': digest(json.dumps(rows, separators=(',', ':')).encode()),
            'stable': True, 'identity': identity(fd)}, first


def sibling_inventory(fd, excluded):
    excluded = {excluded} if isinstance(excluded, str) else set(excluded)
    return [[name, *metadata(os.stat(name, dir_fd=fd, follow_symlinks=False))]
            for name in sorted(os.listdir(fd)) if name not in excluded]


def destination_metadata(fd):
    value = os.fstat(fd)
    need(value.st_uid == value.st_gid == 0 and stat.S_IMODE(value.st_mode) == 0o755, 'R31_SOURCE_DESTINATION_DIRECTORY_CHANGED')
    for name in sorted(os.listdir(fd)):
        before = os.stat(name, dir_fd=fd, follow_symlinks=False)
        need(before.st_uid == before.st_gid == 0, 'R31_SOURCE_DESTINATION_OWNER_CHANGED')
        if stat.S_ISDIR(before.st_mode):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                need(metadata(before) == metadata(os.fstat(child)), 'R31_SOURCE_DESTINATION_PREOPEN_CHANGED')
                destination_metadata(child)
                need(metadata(os.stat(name, dir_fd=fd, follow_symlinks=False)) == metadata(os.fstat(child)), 'R31_SOURCE_DESTINATION_REPLACED')
            finally:
                os.close(child)
        else:
            need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o644, 'R31_SOURCE_DESTINATION_FILE_CHANGED')


def main(p):
    validate_payload(p)  # Complete fixed scope, paths, hashes and bytes before IO.
    need(os.geteuid() == os.getegid() == 0, 'R31_SOURCE_ROOT_REQUIRED')
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(RuntimeError('R31_SOURCE_HOST_TIMEOUT')))
    signal.alarm(150)
    chains, extra = [], []
    try:
        helper_chain = open_chain(str(PurePosixPath(SCOPE['helperPath']).parent), (0,))
        chains.append(helper_chain)
        body = read_regular(helper_chain[-1][0], 'project-autonomy-evidence.py', limit=100000, root_owned=True)
        need(digest(body) == SCOPE['helperSHA256'], 'R31_SOURCE_HELPER_CHANGED')
        h = ModuleType('trusted_r31_source_bytes')
        exec(compile(body, 'trusted-r31-source-byte-helper', 'exec'), h.__dict__)
        original_chain = open_chain(SCOPE['source'], allow_original_read=True)
        host_chain = open_chain(str(PurePosixPath(SCOPE['parent']).parent))
        prep_parent_chain = open_chain(str(PurePosixPath(SCOPE['preparationRoot']).parent), (0,))
        chains.extend([original_chain, host_chain, prep_parent_chain])
        old, base = source_state(h, original_chain[-1][0])
        need(old == {'sha256': SCOPE['baselineSHA256'], 'files': 621, 'bytes': 18386584,
                     'metadataSHA': SCOPE['baselineMetadataSHA256'], 'stable': True,
                     'identity': SCOPE['baselineIdentity']}, 'R31_SOURCE_BASELINE_CHANGED')
        old_by_path = {e['path']: e for e in base}
        new_by_path = {e['path']: e for e in p['manifest']}
        expected_delta = [{**e, 'baselineSHA256': old_by_path.get(e['path'], {}).get('sha256')}
                          for e in p['manifest'] if old_by_path.get(e['path'], {}).get('sha256') != e['sha256']]
        need(set(old_by_path) <= set(new_by_path) and expected_delta == [{k: v for k, v in e.items() if k != 'base64'} for e in p['delta']], 'R31_SOURCE_BASELINE_DELTA_CHANGED')
        host, prep_parent = host_chain[-1][0], prep_parent_chain[-1][0]
        name = PurePosixPath(SCOPE['preparationRoot']).name
        # R2 publishes under the same protected root parent as its preparation.
        # Exclude only these two exact owned names from both sibling witnesses.
        own_names = ['targets-r31-candidate-r2', 'targets-r31-preparation-r2']
        siblings = sibling_inventory(host, own_names)
        outside_prep = sibling_inventory(prep_parent, own_names)
        if p['action'] == 'prepare':
            need('targets-r31-candidate-r2' not in os.listdir(host), 'R31_SOURCE_EXCLUSIVE_TARGET_REQUIRED')
            need(getattr(ctypes.CDLL(None, use_errno=True), 'renameat2', None) is not None, 'R31_SOURCE_ATOMIC_NOREPLACE_UNAVAILABLE')
            if name not in os.listdir(prep_parent):
                os.mkdir(name, 0o700, dir_fd=prep_parent)
                os.fsync(prep_parent)
        if name not in os.listdir(prep_parent):
            return {'schemaVersion': 1, 'kind': 'r31-target-source-host-observation-r2', 'job': p['job'], 'planSHA256': p['planSHA256'], 'prepared': False, 'originBound': False, 'candidate': None, 'source': old, 'outOfScopeUnchanged': False, 'readOnly': True}
        namespace = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=prep_parent)
        extra.append(namespace)
        ps = os.fstat(namespace)
        need(ps.st_uid == ps.st_gid == 0 and stat.S_IMODE(ps.st_mode) == 0o700, 'R31_SOURCE_PREPARATION_UNTRUSTED')
        if p['action'] == 'prepare':
            need(not os.listdir(namespace), 'R31_SOURCE_PREPARATION_ALREADY_ATTEMPTED')
            lock = os.open('lock', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=namespace)
            extra.append(lock)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            write_new(namespace, 'once.json', raw_json({'schemaVersion': 1, 'kind': 'r31-source-once-intent', 'job': p['job'], 'planSHA256': p['planSHA256'], 'programSHA256': p['programSHA256'], 'automaticRetry': False}), 0o600)
            os.mkdir(p['job'], 0o700, dir_fd=namespace)
            os.fsync(namespace)
        once = json.loads(read_regular(namespace, 'once.json', limit=2000000, root_owned=True))
        need(once == {'schemaVersion': 1, 'kind': 'r31-source-once-intent', 'job': p['job'], 'planSHA256': p['planSHA256'], 'programSHA256': p['programSHA256'], 'automaticRetry': False}, 'R31_SOURCE_HOST_ONCE_CHANGED')
        prep = os.open(p['job'], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=namespace)
        extra.append(prep)
        ps = os.fstat(prep)
        need(ps.st_uid == ps.st_gid == 0 and stat.S_IMODE(ps.st_mode) == 0o700, 'R31_SOURCE_PREPARATION_UNTRUSTED')
        if p['action'] == 'prepare':
            origin = {'schemaVersion': 1, 'kind': 'r31-source-immutable-origin', 'job': p['job'], 'scope': SCOPE,
                      'planSHA256': p['planSHA256'], 'source': old,
                      'programSHA256': p['programSHA256'], 'bytePayloadSHA256': SCOPE['deltaPayloadSHA256'],
                      'sourceAncestorIdentity': [[v[2], *v[3][:5]] for v in original_chain],
                      'hostAncestorIdentity': [[v[2], *v[3][:5]] for v in host_chain],
                      'outOfScopeInventorySHA256': digest(raw_json([siblings, outside_prep])), 'preparationIdentity': identity(prep)}
            write_new(prep, 'origin.json', raw_json(origin), 0o600)
            phase = {'job': p['job'], 'planSHA256': p['planSHA256'], 'phase': 'snapshot-intent'}
            store_phase(prep, phase)
            os.mkdir('snapshot', 0o755, dir_fd=prep)
            os.fsync(prep)
            stage = os.open('snapshot', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=prep)
            extra.append(stage)
            os.fchmod(stage, 0o755)
            os.fsync(stage)
            for entry in base:
                src, src_name = parent_fd(original_chain[-1][0], entry['path'])
                dst, dst_name = parent_fd(stage, entry['path'], create=True)
                try:
                    write_new(dst, dst_name, read_regular(src, src_name, entry))
                finally:
                    os.close(src)
                    os.close(dst)
            copied, copied_manifest = source_state(h, stage)
            need(copied['sha256'] == old['sha256'] and copied_manifest == base, 'R31_SOURCE_SNAPSHOT_CHANGED')
            for entry in p['delta']:
                dst, dst_name = parent_fd(stage, entry['path'], create=True)
                try:
                    data = base64.b64decode(entry['base64'], validate=True)
                    if entry['baselineSHA256'] is None:
                        write_new(dst, dst_name, data)
                    else:
                        replace_known(dst, dst_name, old_by_path[entry['path']], data)
                finally:
                    os.close(dst)
            staged, staged_manifest = source_state(h, stage)
            need(staged['sha256'] == SCOPE['candidateSHA256'] and staged_manifest == p['manifest'], 'R31_SOURCE_STAGED_CANDIDATE_CHANGED')
            destination_metadata(stage)
            phase.update(phase='snapshot-ready', candidate=staged)
            store_phase(prep, phase)
            for chain in chains:
                check_chain(chain)
            need(sibling_inventory(host, own_names) == siblings and sibling_inventory(prep_parent, own_names) == outside_prep
                 and 'targets-r31-candidate-r2' not in os.listdir(host), 'R31_SOURCE_HOST_CHANGED_BEFORE_HANDOFF')
            os.mkdir('handoff', 0o755, dir_fd=prep)
            os.fsync(prep)
            parent = os.open('handoff', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=prep)
            extra.append(parent)
            os.fchmod(parent, 0o755)
            os.fsync(parent)
            phase.update(phase='handoff-intent', parentIdentity=identity(parent), candidateIdentity=identity(stage))
            store_phase(prep, phase)
            os.rename('snapshot', 'source', src_dir_fd=prep, dst_dir_fd=parent)
            os.fsync(prep)
            os.fsync(parent)
            publish_noreplace(prep, 'handoff', host, 'targets-r31-candidate-r2')
            need(metadata(os.stat('targets-r31-candidate-r2', dir_fd=host, follow_symlinks=False)) == metadata(os.fstat(parent)), 'R31_SOURCE_PUBLISHED_PARENT_REPLACED')
            phase.update(phase='ready')
            store_phase(prep, phase)
        origin_raw = read_regular(prep, 'origin.json', limit=2000000, root_owned=True)
        origin = json.loads(origin_raw)
        phase_raw = read_regular(prep, 'phase.json', limit=2000000, root_owned=True)
        phase = json.loads(phase_raw)
        need(origin.get('job') == p['job'] and origin.get('scope') == SCOPE and origin.get('planSHA256') == p['planSHA256']
             and origin.get('programSHA256') == p['programSHA256'] and origin.get('bytePayloadSHA256') == SCOPE['deltaPayloadSHA256']
             and origin.get('source') == old and origin.get('preparationIdentity') == identity(prep)
             and phase.get('job') == p['job'] and phase.get('planSHA256') == p['planSHA256'], 'R31_SOURCE_ORIGIN_CHANGED')
        candidate = None
        bound = False
        if 'targets-r31-candidate-r2' in os.listdir(host):
            parent = os.open('targets-r31-candidate-r2', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=host)
            extra.append(parent)
            ps = os.fstat(parent)
            need(ps.st_uid == ps.st_gid == 0 and stat.S_IMODE(ps.st_mode) == 0o755, 'R31_SOURCE_TARGET_PARENT_CHANGED')
            if 'source' in os.listdir(parent):
                candidate_fd = os.open('source', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                extra.append(candidate_fd)
                candidate, found = source_state(h, candidate_fd)
                destination_metadata(candidate_fd)
                bound = (phase.get('phase') == 'ready' and phase.get('parentIdentity') == identity(parent)
                         and phase.get('candidateIdentity') == identity(candidate_fd)
                         and candidate['sha256'] == SCOPE['candidateSHA256'] and found == p['manifest'])
                need(metadata(os.stat('source', dir_fd=parent, follow_symlinks=False)) == metadata(os.fstat(candidate_fd)), 'R31_SOURCE_TARGET_REPLACED')
            need(metadata(os.stat('targets-r31-candidate-r2', dir_fd=host, follow_symlinks=False)) == metadata(os.fstat(parent)), 'R31_SOURCE_TARGET_PARENT_REPLACED')
        fresh, _ = source_state(h, original_chain[-1][0])
        need(fresh == old and sibling_inventory(host, own_names) == siblings and sibling_inventory(prep_parent, own_names) == outside_prep
             and digest(raw_json([siblings, outside_prep])) == origin['outOfScopeInventorySHA256'], 'R31_SOURCE_ORIGINAL_OR_SIBLINGS_CHANGED')
        for chain in chains:
            check_chain(chain)
        need(metadata(os.stat(name, dir_fd=prep_parent, follow_symlinks=False)) == metadata(os.fstat(namespace))
             and metadata(os.stat(p['job'], dir_fd=namespace, follow_symlinks=False)) == metadata(os.fstat(prep)), 'R31_SOURCE_PREPARATION_REPLACED')
        need(read_regular(prep, 'origin.json', limit=2000000, root_owned=True) == origin_raw
             and read_regular(prep, 'phase.json', limit=2000000, root_owned=True) == phase_raw, 'R31_SOURCE_ORIGIN_DOUBLE_READ_CHANGED')
        return {'schemaVersion': 1, 'kind': 'r31-target-source-host-observation-r2', 'job': p['job'], 'planSHA256': p['planSHA256'],
                'prepared': bound, 'originBound': bound, 'phase': phase['phase'], 'source': fresh, 'candidate': candidate,
                'originSHA256': digest(origin_raw), 'phaseSHA256': digest(phase_raw),
                'rootOrigin': {'path': SCOPE['preparationRoot'] + '/' + p['job'] + '/origin.json', 'sha256': digest(origin_raw), 'job': p['job']},
                'programSHA256': p['programSHA256'],
                'outOfScopeInventorySHA256': digest(raw_json([siblings, outside_prep])), 'outOfScopeUnchanged': True,
                'sourceUID': 0, 'sourceGID': 0, 'sourceFileMode': '0644', 'sourceDirectoryMode': '0755',
                'newInodesIndependent': True, 'privateFilesCopied': False, 'gitHistoryCopied': False,
                'candidateCodeExecuted': False, 'readOnly': p['action'] == 'check', 'modelsInvoked': False}
    finally:
        for fd in reversed(extra):
            os.close(fd)
        for chain in reversed(chains):
            close_chain(chain)


if __name__ == '__main__':
    result = main(globals().get('p'))
    result['observedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    print(json.dumps(result, separators=(',', ':')))
