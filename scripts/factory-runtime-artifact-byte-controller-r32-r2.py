"""Fixed R32 artifact bytes and image metadata only. Never loads package code."""
import base64
import ctypes
import hashlib
import json
import os
import posixpath
import re
import signal
import stat
import subprocess
import sys
import time
from pathlib import PurePosixPath

SCOPE = {
    'kind': 'r32-runtime-artifact-byte-scope-r2', 'schemaVersion': 1,
    'work': '/var/lib/jarvis-development/101/truth-gate-r32-build/febd0e7c2b6eb5eac1947c0725c51416/work',
    'workIdentity': {'device': 66306, 'inode': 8054874},
    'workMetadataSHA256': '461b6c1b791f74dce4b7dcf520d12f12a87ec9b2ba6e6f3c634769af221227ab',
    'workEntries': 47822,
    'freezeRoot': '/var/lib/jarvis-development/101/r32-truth-artifacts',
    'sourceIndexSHA256': 'c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927',
    'sourceFingerprint': 'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2',
    'sourceFiles': 625, 'sourceBytes': 18413560,
    'buildSHA256': '4731b3387b48855baa5368154b1a27c9b6a6ef768aacd80c12da01eaa130cd51',
    'cleanupSHA256': 'f8139d980104ad47d29164e885827b27efbc7195e5f1f2af50f18bc5cb4e0dae',
    'buildProofSHA256': '10a73afac570f5918541c391e574d76c3793694299db47257e4da7fc98aa72e4',
    'images': {
        'node': 'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96',
        'postgres': 'sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d',
        'redis': 'sha256:4fa24486b8bcca8eec45ee0eb166edc674795e53a2b53d1a9ef263eecebaac85',
        'minio': 'sha256:a16cad481969d7ddb6fcd2f1c58284af3d1266190b9bedc3ef0801aeb05a93a9'},
}
LIMIT_FILE = 128 * 1024 * 1024
LIMIT_BYTES = 3 * 1024 * 1024 * 1024
LIMIT_ENTRIES = 200000
SUPPLEMENT_ROOT = 'source/node_modules/.pnpm/@napi-rs+lzma-linux-x64-gnu@1.5.1/node_modules/@napi-rs/lzma-linux-x64-gnu'
SUPPLEMENT_CONTRACT_SHA = '75f4d010ea262b3b4a190dee1124be54a3169ceebf7cfcfc173f69e8e8f090fd'
SUPPLEMENT_FILES = [
    {'path': 'README.md', 'bytes': 101, 'sha256': '7834d70d367925c2c04144eb00e93685a2e7ce78bd541f5a28424b30e3176b27', 'executable': False},
    {'path': 'lzma.linux-x64-gnu.node', 'bytes': 1445448, 'sha256': '1f62f0ff272b69f09dff7c867d840d407f2b43c5b6170fd6af0928ed0f542ed4', 'executable': False},
    {'path': 'package.json', 'bytes': 756, 'sha256': '578e2a50ae69cd627c2953f8fa677efbf89f3087efeafff2db65aa31b81dc136', 'executable': False}]
SUPPLEMENT_ALIASES = {
    'source/node_modules/.pnpm/node_modules/@napi-rs/lzma-linux-x64-gnu': '../../@napi-rs+lzma-linux-x64-gnu@1.5.1/node_modules/@napi-rs/lzma-linux-x64-gnu',
    'source/node_modules/.pnpm/rollup@4.63.4/node_modules/@napi-rs/lzma-linux-x64-gnu': '../../../@napi-rs+lzma-linux-x64-gnu@1.5.1/node_modules/@napi-rs/lzma-linux-x64-gnu'}
SUPPLEMENT_BYTES = None


def validate_supplement(value):
    global SUPPLEMENT_BYTES
    need(type(value) is dict and set(value) == {'contractRawBase64', 'files'} and type(value['contractRawBase64']) is str and len(value['contractRawBase64']) < 32768 and type(value['files']) is dict and set(value['files']) == {e['path'] for e in SUPPLEMENT_FILES}, 'R32_ARTIFACT_SUPPLEMENT_TRANSPORT_CHANGED')
    contract_raw = base64.b64decode(value['contractRawBase64'], validate=True)
    need(sha(contract_raw) == SUPPLEMENT_CONTRACT_SHA, 'R32_ARTIFACT_SUPPLEMENT_CONTRACT_CHANGED')
    c = json.loads(contract_raw)
    need(c.get('package') == '@napi-rs/lzma-linux-x64-gnu' and c.get('version') == '1.5.1' and c.get('files') == SUPPLEMENT_FILES and c.get('fileCount') == 3 and c.get('totalBytes') == 1446305 and c.get('packageCodeExecuted') is False and c.get('tarballSHA256') == 'e69ca2a96510be330953f5b04b1d74617e7ce5d4487db4876c4b02b8364ef7e7' and c.get('lockedIntegrity') == 'sha512-oTXEIha4SsuXdTA4Iyskj0kpdx2yVXdhd75c2v3xGrHFfVMsbhTPZU/nMPL4sWKo4pBHm3aucLaqGlF696dTyQ==', 'R32_ARTIFACT_SUPPLEMENT_ORIGIN_UNPROVEN')
    result = {}
    for e in SUPPLEMENT_FILES:
        encoded = value['files'][e['path']]
        need(type(encoded) is str and len(encoded) <= 2 * 1024 * 1024, 'R32_ARTIFACT_SUPPLEMENT_BYTE_LIMIT')
        body = base64.b64decode(encoded, validate=True)
        need(base64.b64encode(body).decode() == encoded and len(body) == e['bytes'] and sha(body) == e['sha256'], 'R32_ARTIFACT_SUPPLEMENT_FILE_BYTES_CHANGED')
        result[e['path']] = body
    pkg = json.loads(result['package.json'])
    need(pkg.get('name') == '@napi-rs/lzma-linux-x64-gnu' and pkg.get('version') == '1.5.1' and pkg.get('os') == ['linux'] and pkg.get('cpu') == ['x64'] and pkg.get('main') == 'lzma.linux-x64-gnu.node' and not pkg.get('scripts') and not pkg.get('dependencies'), 'R32_ARTIFACT_SUPPLEMENT_PACKAGE_SCOPE_CHANGED')
    SUPPLEMENT_BYTES = result


def supplement_descriptor():
    return {'schemaVersion': 1, 'kind': 'r32-exact-locked-native-dependency-supplement', 'package': '@napi-rs/lzma-linux-x64-gnu', 'version': '1.5.1', 'relativeRoot': SUPPLEMENT_ROOT, 'contractSHA256': SUPPLEMENT_CONTRACT_SHA, 'registry': 'https://registry.npmjs.org', 'archiveSHA256': 'e69ca2a96510be330953f5b04b1d74617e7ce5d4487db4876c4b02b8364ef7e7', 'lockedIntegrity': 'sha512-oTXEIha4SsuXdTA4Iyskj0kpdx2yVXdhd75c2v3xGrHFfVMsbhTPZU/nMPL4sWKo4pBHm3aucLaqGlF696dTyQ==', 'files': SUPPLEMENT_FILES, 'fileCount': 3, 'totalBytes': 1446305, 'originalWorkUnmodified': True, 'originalSource625Unmodified': True, 'newDependencyPreviouslyBuiltOrExecuted': False, 'packageScriptsExecutedByRoot': False, 'aliasesRemoved': False}


def native_prerequisite():
    return {'schemaVersion': 1, 'kind': 'r32-locked-native-load-prerequisite', 'package': '@napi-rs/lzma-linux-x64-gnu', 'version': '1.5.1', 'packageJSON': {'path': SUPPLEMENT_ROOT + '/package.json', 'bytes': 756, 'sha256': SUPPLEMENT_FILES[2]['sha256']}, 'nativeModule': {'path': SUPPLEMENT_ROOT + '/lzma.linux-x64-gnu.node', 'bytes': 1445448, 'sha256': SUPPLEMENT_FILES[1]['sha256']}, 'sourceOptionalAliases': SUPPLEMENT_ALIASES, 'originalBuildProofCoversSupplement': False, 'requiresUID1000ActualLoad': True, 'actualLoadVerified': False, 'httpSQLDenominatorUnchanged': 34, 'additionalPGDenominatorUnchanged': 4}


def virtual_output_entries(entries):
    need(SUPPLEMENT_BYTES is not None, 'R32_ARTIFACT_SUPPLEMENT_NOT_QUALIFIED')
    nodes = {e['path']: e for e in entries}
    need(SUPPLEMENT_ROOT not in nodes, 'R32_ARTIFACT_SUPPLEMENT_TARGET_ALREADY_EXISTS')
    parts = SUPPLEMENT_ROOT.split('/')
    for i in range(1, len(parts) + 1):
        path = '/'.join(parts[:i])
        if path in nodes:
            need(nodes[path]['type'] == 'directory', 'R32_ARTIFACT_SUPPLEMENT_PARENT_NOT_DIRECTORY')
        else:
            need(path.startswith('source/node_modules/.pnpm/@napi-rs+lzma-linux-x64-gnu@1.5.1/node_modules/@napi-rs'), 'R32_ARTIFACT_SUPPLEMENT_UNEXPECTED_MISSING_PARENT')
            nodes[path] = {'path': path, 'type': 'directory'}
    for e in SUPPLEMENT_FILES:
        path = SUPPLEMENT_ROOT + '/' + e['path']
        need(path not in nodes, 'R32_ARTIFACT_SUPPLEMENT_FILE_ALREADY_EXISTS')
        nodes[path] = {'path': path, 'type': 'file', 'sha256': e['sha256'], 'bytes': e['bytes']}
    result = sorted(nodes.values(), key=lambda e: e['path'])
    resolve_closure(result)
    return result


def validate_input_links(entries):
    nodes = {e['path']: e for e in entries}
    failed = {}
    for e in entries:
        if e['type'] != 'symlink':
            continue
        try:
            resolve_path(e['path'], nodes)
        except RuntimeError as error:
            need(str(error) == 'R32_ARTIFACT_LINK_TARGET_MISSING' and SUPPLEMENT_ALIASES.get(e['path']) == e['target'], 'R32_ARTIFACT_UNEXPECTED_INPUT_LINK_FAILURE')
            failed[e['path']] = e['target']
    need(failed == SUPPLEMENT_ALIASES, 'R32_ARTIFACT_EXACT_TWO_SUPPLEMENT_ALIASES_CHANGED')
    virtual_output_entries(entries)


def install_supplement(root):
    need(SUPPLEMENT_BYTES is not None, 'R32_ARTIFACT_SUPPLEMENT_NOT_QUALIFIED')
    fd = os.dup(root)
    try:
        for component in SUPPLEMENT_ROOT.split('/'):
            if component not in os.listdir(fd):
                os.mkdir(component, 0o700, dir_fd=fd)
                os.fsync(fd)
            before = os.stat(component, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0 and stat.S_IMODE(before.st_mode) == 0o700, 'R32_ARTIFACT_SUPPLEMENT_OUTPUT_PARENT_UNTRUSTED')
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                need(meta(before) == meta(os.fstat(child)), 'R32_ARTIFACT_SUPPLEMENT_OUTPUT_PARENT_CHANGED')
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        need(not os.listdir(fd), 'R32_ARTIFACT_SUPPLEMENT_OUTPUT_TARGET_NOT_EMPTY')
        for e in SUPPLEMENT_FILES:
            write_new(fd, e['path'], SUPPLEMENT_BYTES[e['path']], 0o444)
    finally:
        os.close(fd)


def freeze_directories(root, depth=0):
    need(depth <= 48, 'R32_ARTIFACT_OUTPUT_DIRECTORY_DEPTH')
    for name in sorted(os.listdir(root)):
        s = os.stat(name, dir_fd=root, follow_symlinks=False)
        if stat.S_ISDIR(s.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
            try:
                need(meta(s) == meta(os.fstat(fd)) and s.st_uid == s.st_gid == 0, 'R32_ARTIFACT_OUTPUT_DIRECTORY_CHANGED')
                freeze_directories(fd, depth + 1)
                os.fchmod(fd, 0o555)
                os.fsync(fd)
            finally:
                os.close(fd)


def need(value, code):
    if not value:
        raise RuntimeError(code)


def raw(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def meta(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def ident(s):
    return {'device': s.st_dev, 'inode': s.st_ino}


def path_ok(path):
    return isinstance(path, str) and 0 < len(path) < 4096 and not path.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]', path) and all(x not in ['', '.', '..'] for x in path.split('/'))


def validate(p):
    need(isinstance(p, dict) and set(p) == {'scope', 'action', 'nonce', 'sourceIndex', 'expectedInspection', 'programSHA256', 'packageSupplement'}, 'R32_ARTIFACT_PARAMETER_SET_CHANGED')
    need(canonical(p['scope']) == canonical(SCOPE) and p['action'] in ['inspect', 'freeze', 'check'], 'R32_ARTIFACT_SCOPE_CHANGED')
    need(isinstance(p['programSHA256'], str) and re.fullmatch('[a-f0-9]{64}', p['programSHA256']), 'R32_ARTIFACT_PROGRAM_BINDING_UNKNOWN')
    need(p['action'] == 'inspect' and p['nonce'] is None and p['expectedInspection'] is None or p['action'] in ['freeze', 'check'] and isinstance(p['nonce'], str) and re.fullmatch('[a-f0-9]{32}', p['nonce']) and isinstance(p['expectedInspection'], dict) and set(p['expectedInspection']) == {'_rawBase64'}, 'R32_ARTIFACT_ACTION_BINDING_INVALID')
    if p['action'] != 'inspect':
        need(isinstance(p['expectedInspection']['_rawBase64'], str) and len(p['expectedInspection']['_rawBase64']) <= 90 * 1024 * 1024, 'R32_ARTIFACT_EXPECTED_BYTE_LIMIT')
    index = p['sourceIndex']
    need(isinstance(index, dict) and isinstance(index.get('_rawBase64'), str) and len(index['_rawBase64']) <= 4 * 1024 * 1024, 'R32_ARTIFACT_SOURCE_INDEX_UNPROVEN')
    # Original pretty-printed byte identity is preserved; never hash a normalized adapter.
    need(set(index) == {'_rawBase64'}, 'R32_ARTIFACT_SOURCE_INDEX_TRANSPORT_CHANGED')
    source_raw = base64.b64decode(index['_rawBase64'], validate=True)
    need(base64.b64encode(source_raw).decode() == index['_rawBase64'] and sha(source_raw) == SCOPE['sourceIndexSHA256'], 'R32_ARTIFACT_SOURCE_INDEX_BYTES_CHANGED')
    v = json.loads(source_raw)
    need(v.get('candidate') == {'sha256': SCOPE['sourceFingerprint'], 'files': 625, 'bytes': SCOPE['sourceBytes']} and v.get('localMirrorByteVerification') is True and v.get('actualTwoCompleteSourceReadbacks') is True, 'R32_ARTIFACT_SOURCE_INDEX_CHANGED')
    m = v.get('manifest')
    need(isinstance(m, list) and len(m) == 625 and len({e.get('path') for e in m}) == 625 and all(set(e) == {'path', 'sha256', 'bytes'} and path_ok(e['path']) and re.fullmatch('[a-f0-9]{64}', e['sha256']) and type(e['bytes']) is int and e['bytes'] >= 0 for e in m) and sum(e['bytes'] for e in m) == SCOPE['sourceBytes'], 'R32_ARTIFACT_SOURCE_MANIFEST_INVALID')
    validate_supplement(p['packageSupplement'])
    return m


def open_chain(path, work=False):
    current = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    chain = [(current, None, None, meta(os.fstat(current)))]
    try:
        for name in PurePosixPath(path).parts[1:]:
            parent = chain[-1][0]
            s = os.stat(name, dir_fd=parent, follow_symlinks=False)
            expected_work = work and name == 'work' and len(chain) == len(PurePosixPath(path).parts) - 1
            need(stat.S_ISDIR(s.st_mode) and (s.st_uid == s.st_gid == 1000 and ident(s) == SCOPE['workIdentity'] and stat.S_IMODE(s.st_mode) == 0o700 if expected_work else s.st_uid == s.st_gid == 0 and not s.st_mode & 0o022), 'R32_ARTIFACT_ANCESTOR_UNTRUSTED')
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                need(meta(s) == meta(os.fstat(fd)), 'R32_ARTIFACT_ANCESTOR_REPLACED')
            except BaseException:
                os.close(fd)
                raise
            chain.append((fd, parent, name, meta(s)))
        return chain
    except BaseException:
        close_chain(chain)
        raise


def close_chain(chain):
    for fd, _, _, _ in reversed(chain):
        os.close(fd)


def check_chain(chain):
    for fd, parent, name, initial in chain:
        s = meta(os.fstat(fd))
        need(s[:5] == initial[:5] and (parent is None or s == meta(os.stat(name, dir_fd=parent, follow_symlinks=False))), 'R32_ARTIFACT_ANCESTOR_REPLACED')


def read_file(parent, name, expected=None, out=None):
    s = os.stat(name, dir_fd=parent, follow_symlinks=False)
    need(stat.S_ISREG(s.st_mode) and 0 <= s.st_size <= LIMIT_FILE, 'R32_ARTIFACT_FILE_UNTRUSTED')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        need(meta(s) == meta(os.fstat(fd)), 'R32_ARTIFACT_FILE_PREOPEN_CHANGED')
        digest, size = hashlib.sha256(), 0
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            size += len(block)
            need(size <= s.st_size, 'R32_ARTIFACT_FILE_GREW')
            digest.update(block)
            if out is not None:
                write_all(out, block)
        need(size == s.st_size and meta(s) == meta(os.fstat(fd)) == meta(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'R32_ARTIFACT_FILE_CHANGED')
        value = {'sha256': digest.hexdigest(), 'bytes': size}
        if expected is not None:
            need(value == {'sha256': expected['sha256'], 'bytes': expected['bytes']}, 'R32_ARTIFACT_FILE_BYTES_CHANGED')
        return value, meta(s)
    finally:
        os.close(fd)


def write_all(fd, data):
    view = memoryview(data)
    while view:
        n = os.write(fd, view)
        need(type(n) is int and 0 < n <= len(view), 'R32_ARTIFACT_SHORT_WRITE')
        view = view[n:]


def write_new(fd, name, body, mode=0o600):
    f = os.open(name, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode, dir_fd=fd)
    try:
        write_all(f, body)
        os.fchmod(f, mode)
        os.fsync(f)
    finally:
        os.close(f)
    os.fsync(fd)


def scan(fd, immutable=False):
    entries, metadata, legacy_rows, total = [], [], [], 0
    root_stat = meta(os.fstat(fd))
    def walk(parent, prefix='', depth=0):
        nonlocal total
        need(depth <= 48, 'R32_ARTIFACT_DEPTH_LIMIT')
        before = meta(os.fstat(parent))
        names = sorted(os.listdir(parent))
        for name in names:
            path = prefix + name
            need(path_ok(path) and len(entries) < LIMIT_ENTRIES, 'R32_ARTIFACT_PATH_OR_COUNT_LIMIT')
            s = os.stat(name, dir_fd=parent, follow_symlinks=False)
            legacy_rows.append([path, *meta(s), sha(os.readlink(name, dir_fd=parent).encode()) if stat.S_ISLNK(s.st_mode) else None])
            if immutable:
                need(s.st_uid == s.st_gid == 0, 'R32_ARTIFACT_OUTPUT_OWNER_CHANGED')
            if stat.S_ISDIR(s.st_mode):
                if immutable:
                    need(stat.S_IMODE(s.st_mode) == 0o555, 'R32_ARTIFACT_OUTPUT_DIRECTORY_WRITABLE')
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                try:
                    need(meta(s) == meta(os.fstat(child)), 'R32_ARTIFACT_DIRECTORY_PREOPEN_CHANGED')
                    entries.append({'path': path, 'type': 'directory'})
                    metadata.append([path, *meta(s)])
                    walk(child, path + '/', depth + 1)
                    need(meta(s) == meta(os.fstat(child)) == meta(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'R32_ARTIFACT_DIRECTORY_CHANGED')
                finally:
                    os.close(child)
            elif stat.S_ISREG(s.st_mode):
                if immutable:
                    need(s.st_nlink == 1 and stat.S_IMODE(s.st_mode) in [0o444, 0o555], 'R32_ARTIFACT_OUTPUT_FILE_MUTABLE_OR_SHARED')
                value, st = read_file(parent, name)
                total += value['bytes']
                need(total <= LIMIT_BYTES, 'R32_ARTIFACT_BYTE_LIMIT')
                entries.append({'path': path, 'type': 'file', **value})
                metadata.append([path, *st])
            elif stat.S_ISLNK(s.st_mode):
                target = os.readlink(name, dir_fd=parent)
                need(isinstance(target, str) and 0 < len(target) < 4096 and not target.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]', target) and meta(s) == meta(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'R32_ARTIFACT_LINK_UNTRUSTED')
                if immutable:
                    need(s.st_nlink == 1, 'R32_ARTIFACT_OUTPUT_LINK_SHARED')
                entries.append({'path': path, 'type': 'symlink', 'target': target})
                metadata.append([path, *meta(s)])
            else:
                raise RuntimeError('R32_ARTIFACT_SPECIAL_FILE_REJECTED')
        need(names == sorted(os.listdir(parent)) and before == meta(os.fstat(parent)), 'R32_ARTIFACT_DIRECTORY_CLOSURE_CHANGED')
    if immutable:
        need(root_stat[2:4] == [0, 0] and stat.S_IMODE(root_stat[4]) == 0o555, 'R32_ARTIFACT_OUTPUT_ROOT_UNTRUSTED')
    walk(fd)
    entries.sort(key=lambda e: e['path'])
    metadata.sort(key=lambda e: e[0])
    need(root_stat == meta(os.fstat(fd)), 'R32_ARTIFACT_ROOT_CHANGED')
    if immutable:
        resolve_closure(entries)
    else:
        validate_input_links(entries)
    return {'entries': entries, 'treeSHA256': sha(raw(entries)), 'metadata': metadata,
            'rootStat': root_stat, 'metadataSHA256': sha(raw({'rootIdentity': root_stat, 'metadata': metadata})),
            'identity': ident(os.fstat(fd)), 'files': sum(e['type'] == 'file' for e in entries), 'bytes': total,
            'legacyWorkMetadataSHA256': sha(canonical(legacy_rows)), 'legacyWorkEntries': len(legacy_rows)}


def resolve_path(path, nodes):
    need(path_ok(path), 'R32_ARTIFACT_RESOLUTION_PATH_INVALID')
    seen = set()
    for _ in range(64):
        parts = path.split('/')
        rewritten = False
        for i in range(len(parts)):
            prefix = '/'.join(parts[:i + 1])
            entry = nodes.get(prefix)
            need(entry is not None, 'R32_ARTIFACT_LINK_TARGET_MISSING')
            if entry['type'] == 'symlink':
                need(path not in seen, 'R32_ARTIFACT_LINK_CYCLE')
                seen.add(path)
                path = posixpath.normpath(posixpath.join(posixpath.dirname(prefix), entry['target'], *parts[i + 1:]))
                need(path_ok(path), 'R32_ARTIFACT_LINK_OUTSIDE_ROOT')
                rewritten = True
                break
            if i != len(parts) - 1:
                need(entry['type'] == 'directory', 'R32_ARTIFACT_NON_DIRECTORY_LINK_PATH')
        if not rewritten:
            return path
    raise RuntimeError('R32_ARTIFACT_LINK_DEPTH_LIMIT')


def resolve_closure(entries):
    nodes = {e['path']: e for e in entries}
    for e in entries:
        if e['type'] == 'symlink':
            resolve_path(e['path'], nodes)
    return nodes


def double_scan(fd, immutable=False):
    first, second = scan(fd, immutable), scan(fd, immutable)
    need(first == second, 'R32_ARTIFACT_DOUBLE_READ_CHANGED')
    return first


def qualify_source(value, source_manifest):
    nodes = resolve_closure(virtual_output_entries(value['entries']))
    for e in source_manifest:
        actual = nodes.get('source/' + e['path'])
        need(actual == {'path': 'source/' + e['path'], 'type': 'file', 'sha256': e['sha256'], 'bytes': e['bytes']}, 'R32_ARTIFACT_PUBLIC_SOURCE_CHANGED')
    for entry in ['source/apps/server/dist/main.js', 'source/apps/server/node_modules/vitest/vitest.mjs', 'source/apps/server/node_modules/vitest/package.json']:
        resolved = resolve_path(entry, nodes)
        need(nodes[resolved]['type'] == 'file', 'R32_ARTIFACT_COMPILED_OR_VITEST_ENTRY_MISSING')
    return nodes


def read_under(root, path, expected):
    need(path_ok(path), 'R32_ARTIFACT_NESTED_PATH_INVALID')
    fd = os.dup(root)
    try:
        parts = path.split('/')
        for name in parts[:-1]:
            s = os.stat(name, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(s.st_mode), 'R32_ARTIFACT_NESTED_DIRECTORY_INVALID')
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                need(meta(s) == meta(os.fstat(child)), 'R32_ARTIFACT_NESTED_DIRECTORY_CHANGED')
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        name = parts[-1]
        s = os.stat(name, dir_fd=fd, follow_symlinks=False)
        need(stat.S_ISREG(s.st_mode) and s.st_size <= 1024 * 1024, 'R32_ARTIFACT_PACKAGE_JSON_UNTRUSTED')
        f = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            need(meta(s) == meta(os.fstat(f)), 'R32_ARTIFACT_PACKAGE_JSON_PREOPEN_CHANGED')
            chunks, count = [], 0
            while True:
                block = os.read(f, 65536)
                if not block:
                    break
                count += len(block)
                need(count <= s.st_size, 'R32_ARTIFACT_PACKAGE_JSON_GREW')
                chunks.append(block)
            body = b''.join(chunks)
            need(count == s.st_size and sha(body) == expected['sha256'] and count == expected['bytes'] and meta(s) == meta(os.fstat(f)) == meta(os.stat(name, dir_fd=fd, follow_symlinks=False)), 'R32_ARTIFACT_PACKAGE_JSON_CHANGED')
            return json.loads(body)
        finally:
            os.close(f)
    finally:
        os.close(fd)


def image_contract():
    result = {}
    for name, pin in SCOPE['images'].items():
        env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/root', 'DOCKER_API_VERSION': '1.49'}
        r = subprocess.run(['/usr/bin/docker', 'image', 'inspect', pin], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, env=env)
        need(r.returncode == 0 and len(r.stdout) <= 1024 * 1024, 'R32_ARTIFACT_IMAGE_READ_INCOMPLETE')
        rows = json.loads(r.stdout)
        need(type(rows) is list and len(rows) == 1, 'R32_ARTIFACT_IMAGE_IDENTITY_INVALID')
        v, c = rows[0], rows[0].get('Config')
        need(v.get('Id') == pin and v.get('Os') == 'linux' and v.get('Architecture') == 'amd64' and type(c) is dict and 'Volumes' in c and isinstance(c.get('User'), str), 'R32_ARTIFACT_IMAGE_CONFIG_INCOMPLETE')
        allowed = {'node': set(), 'postgres': {'/var/lib/postgresql/data'}, 'redis': {'/data'}, 'minio': {'/data'}}[name]
        volumes = c['Volumes']
        need(volumes is None or type(volumes) is dict and set(volumes) <= allowed and all(type(x) is dict and not x for x in volumes.values()), 'R32_ARTIFACT_IMAGE_UNLISTED_VOLUME')
        for field in ['Entrypoint', 'Cmd']:
            need(c.get(field) is None or type(c[field]) is list and all(isinstance(x, str) and len(x) <= 8192 for x in c[field]) and len(c[field]) <= 64, 'R32_ARTIFACT_IMAGE_COMMAND_SHAPE_INVALID')
        result[name] = {'Id': pin, 'Os': v['Os'], 'Architecture': v['Architecture'], 'Config': {k: c[k] for k in ['User', 'Volumes', 'Entrypoint', 'Cmd']}}
    return {'schemaVersion': 1, 'kind': 'r32-exact-dependency-image-config', 'images': result}


def copy_tree(src, dst, source_rows, prefix=''):
    nodes = {e['path']: e for e in source_rows['entries']}
    metadata = {r[0]: r[1:] for r in source_rows['metadata']}
    for name in sorted(os.listdir(src)):
        path = prefix + name
        s = os.stat(name, dir_fd=src, follow_symlinks=False)
        need(path in nodes and meta(s) == metadata[path], 'R32_ARTIFACT_COPY_INPUT_CHANGED')
        e = nodes[path]
        if e['type'] == 'directory':
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=src)
            try:
                need(meta(s) == meta(os.fstat(child)), 'R32_ARTIFACT_COPY_DIRECTORY_CHANGED')
                os.mkdir(name, 0o700, dir_fd=dst)
                os.fsync(dst)
                out = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=dst)
                try:
                    copy_tree(child, out, source_rows, path + '/')
                    os.fsync(out)
                finally:
                    os.close(out)
            finally:
                os.close(child)
        elif e['type'] == 'file':
            out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=dst)
            try:
                _, actual_metadata = read_file(src, name, e, out)
                need(actual_metadata == metadata[path], 'R32_ARTIFACT_COPY_FILE_CHANGED')
                os.fchmod(out, 0o555 if s.st_mode & 0o111 else 0o444)
                os.fsync(out)
            finally:
                os.close(out)
            os.fsync(dst)
        else:
            need(e['type'] == 'symlink' and os.readlink(name, dir_fd=src) == e['target'], 'R32_ARTIFACT_COPY_LINK_CHANGED')
            os.symlink(e['target'], name, dir_fd=dst)
            os.fsync(dst)
        need(meta(s) == meta(os.stat(name, dir_fd=src, follow_symlinks=False)), 'R32_ARTIFACT_COPY_INPUT_REPLACED')


def read_json(fd, name):
    s = os.stat(name, dir_fd=fd, follow_symlinks=False)
    need(stat.S_ISREG(s.st_mode) and s.st_uid == s.st_gid == 0 and s.st_nlink == 1 and not s.st_mode & 0o022 and s.st_size <= 64 * 1024 * 1024, 'R32_ARTIFACT_RECEIPT_UNTRUSTED')
    f = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    try:
        need(meta(s) == meta(os.fstat(f)), 'R32_ARTIFACT_RECEIPT_PREOPEN_CHANGED')
        parts, size = [], 0
        while True:
            b = os.read(f, 65536)
            if not b:
                break
            size += len(b)
            need(size <= s.st_size, 'R32_ARTIFACT_RECEIPT_GREW')
            parts.append(b)
        need(size == s.st_size and meta(s) == meta(os.fstat(f)) == meta(os.stat(name, dir_fd=fd, follow_symlinks=False)), 'R32_ARTIFACT_RECEIPT_CHANGED')
        b = b''.join(parts)
        return json.loads(b), b
    finally:
        os.close(f)


def publish(src_fd, dst_fd, target):
    libc = ctypes.CDLL(None, use_errno=True)
    fn = getattr(libc, 'renameat2', None)
    need(fn is not None, 'R32_ARTIFACT_NOREPLACE_UNAVAILABLE')
    fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    fn.restype = ctypes.c_int
    need(fn(src_fd, b'bundle', dst_fd, target.encode(), 1) == 0, 'R32_ARTIFACT_PUBLICATION_COLLISION')
    os.fsync(src_fd)
    os.fsync(dst_fd)


def artifact_contract(tree, result, manifest_raw):
    destination = SCOPE['freezeRoot'] + '/' + tree
    return {'schemaVersion': 1, 'kind': 'r32-frozen-application-runtime-artifact', 'root': destination + '/runtime', 'rootIdentity': result['identity'], 'manifestPath': destination + '/runtime-manifest.json', 'manifestSHA256': sha(manifest_raw), 'metadataSHA256': result['metadataSHA256'], 'treeSHA256': tree, 'source': {'fingerprint': SCOPE['sourceFingerprint'], 'files': 625, 'bytes': SCOPE['sourceBytes']}, 'sourceIndexSHA256': SCOPE['sourceIndexSHA256'], 'buildProofSHA256': SCOPE['buildProofSHA256'], 'readOnlyRootOwned': True, 'twoCompleteReadbacks': True, 'dependencySupplement': supplement_descriptor(), 'nativePrerequisite': native_prerequisite()}


def main(p):
    source_manifest = validate(p)
    need(os.geteuid() == os.getegid() == 0, 'R32_ARTIFACT_ROOT_REQUIRED')
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(RuntimeError('R32_ARTIFACT_TIME_LIMIT')))
    signal.alarm(150)
    chains, held = [], []
    try:
        chain = open_chain(SCOPE['work'], work=True)
        chains.append(chain)
        work = chain[-1][0]
        observation = double_scan(work)
        need(observation['legacyWorkMetadataSHA256'] == SCOPE['workMetadataSHA256'] and observation['legacyWorkEntries'] == SCOPE['workEntries'], 'R32_ARTIFACT_COMPILED_WORK_CHANGED_SINCE_BUILD_PROOF')
        nodes = qualify_source(observation, source_manifest)
        vitest_path = resolve_path('source/apps/server/node_modules/vitest/package.json', nodes)
        vitest = read_under(work, vitest_path, nodes[vitest_path])
        need(vitest.get('name') == 'vitest' and vitest.get('version') == '2.1.9', 'R32_ARTIFACT_LOCKED_VITEST_VERSION_CHANGED')
        images = image_contract()
        qualified = {'schemaVersion': 1, 'kind': 'r32-runtime-artifact-readonly-qualification-r2', 'scope': SCOPE,
                     'sourceIndexSHA256': SCOPE['sourceIndexSHA256'], 'buildSHA256': SCOPE['buildSHA256'], 'cleanupSHA256': SCOPE['cleanupSHA256'],
                     'runtime': observation, 'images': images, 'prospectiveTreeSHA256': sha(raw(virtual_output_entries(observation['entries']))), 'dependencySupplement': supplement_descriptor(), 'twoCompleteReadbacks': True,
                     'candidateCodeExecuted': False, 'modelsInvoked': False, 'immutableArtifactExists': False}
        if p['action'] == 'inspect':
            check_chain(chain)
            return qualified
        need(isinstance(p['expectedInspection']['_rawBase64'], str) and len(p['expectedInspection']['_rawBase64']) <= 90 * 1024 * 1024, 'R32_ARTIFACT_EXPECTED_BYTE_LIMIT')
        expected_raw = base64.b64decode(p['expectedInspection']['_rawBase64'], validate=True)
        need(base64.b64encode(expected_raw).decode() == p['expectedInspection']['_rawBase64'] and len(expected_raw) <= 64 * 1024 * 1024 and qualified == json.loads(expected_raw), 'R32_ARTIFACT_QUALIFIED_INPUT_CHANGED')
        parent_chain = open_chain(str(PurePosixPath(SCOPE['freezeRoot']).parent))
        chains.append(parent_chain)
        parent = parent_chain[-1][0]
        name = PurePosixPath(SCOPE['freezeRoot']).name
        if name not in os.listdir(parent):
            need(p['action'] == 'freeze', 'R32_ARTIFACT_NO_ATTEMPT')
            os.mkdir(name, 0o700, dir_fd=parent)
            os.fsync(parent)
        outer = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        held.append(outer)
        s = os.fstat(outer)
        need(s.st_uid == s.st_gid == 0 and stat.S_IMODE(s.st_mode) == 0o700, 'R32_ARTIFACT_NAMESPACE_UNTRUSTED')
        nonce, tree = p['nonce'], sha(raw(virtual_output_entries(observation['entries'])))
        if p['action'] == 'freeze':
            need(nonce not in os.listdir(outer) and tree not in os.listdir(outer), 'R32_ARTIFACT_ALREADY_ATTEMPTED')
            os.mkdir(nonce, 0o700, dir_fd=outer)
            os.fsync(outer)
        attempt = os.open(nonce, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=outer)
        held.append(attempt)
        s = os.fstat(attempt)
        need(s.st_uid == s.st_gid == 0 and stat.S_IMODE(s.st_mode) == 0o700, 'R32_ARTIFACT_ATTEMPT_UNTRUSTED')
        intent = {'schemaVersion': 1, 'kind': 'r32-artifact-byte-once-intent', 'nonce': nonce, 'scope': SCOPE, 'qualifiedSHA256': sha(raw(qualified)), 'programSHA256': p['programSHA256'], 'treeSHA256': tree}
        if p['action'] == 'freeze':
            write_new(attempt, 'once.json', raw(intent))
            os.mkdir('bundle', 0o700, dir_fd=attempt)
            os.fsync(attempt)
            bundle = os.open('bundle', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=attempt)
            held.append(bundle)
            os.mkdir('runtime', 0o700, dir_fd=bundle)
            os.fsync(bundle)
            runtime = os.open('runtime', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=bundle)
            held.append(runtime)
            copy_tree(work, runtime, observation)
            install_supplement(runtime)
            freeze_directories(runtime)
            os.fchmod(runtime, 0o555)
            os.fsync(runtime)
            result = double_scan(runtime, immutable=True)
            old_inodes = {tuple(row[1:3]) for row in observation['metadata']}
            need(result['entries'] == virtual_output_entries(observation['entries']) and result['treeSHA256'] == tree and all(tuple(row[1:3]) not in old_inodes for row in result['metadata']) and result['identity'] != observation['identity'], 'R32_ARTIFACT_OUTPUT_BYTES_OR_INODES_CHANGED')
            need(double_scan(work) == observation, 'R32_ARTIFACT_INPUT_CHANGED_AFTER_COPY')
            manifest = {'schemaVersion': 1, 'kind': 'r32-application-runtime-manifest', 'root': '/work', 'sourceFingerprint': SCOPE['sourceFingerprint'], 'sourceIndexSHA256': SCOPE['sourceIndexSHA256'], **result}
            manifest_raw = raw(manifest)
            contract = artifact_contract(tree, result, manifest_raw)
            write_new(bundle, 'runtime-manifest.json', manifest_raw, 0o444)
            write_new(bundle, 'artifact-contract.json', raw(contract), 0o444)
            write_new(bundle, 'image-contract.json', raw(images), 0o444)
            for c in chains:
                check_chain(c)
            publish(attempt, outer, tree)
        actual_intent, _ = read_json(attempt, 'once.json')
        need(actual_intent == intent, 'R32_ARTIFACT_ONCE_CHANGED')
        if tree not in os.listdir(outer):
            return {'schemaVersion': 1, 'kind': 'r32-artifact-byte-freeze-observation', 'nonce': nonce, 'ready': False, 'reason': 'R32_ARTIFACT_PUBLICATION_INCOMPLETE', 'modelsInvoked': False, 'candidateCodeExecuted': False}
        final = os.open(tree, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=outer)
        held.append(final)
        s = os.fstat(final)
        need(s.st_uid == s.st_gid == 0 and stat.S_IMODE(s.st_mode) == 0o700, 'R32_ARTIFACT_FROZEN_PARENT_UNTRUSTED')
        manifest, manifest_raw = read_json(final, 'runtime-manifest.json')
        contract, contract_raw = read_json(final, 'artifact-contract.json')
        image, image_raw = read_json(final, 'image-contract.json')
        runtime = os.open('runtime', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=final)
        held.append(runtime)
        readback = double_scan(runtime, immutable=True)
        need(readback['entries'] == virtual_output_entries(observation['entries']) and manifest == {'schemaVersion': 1, 'kind': 'r32-application-runtime-manifest', 'root': '/work', 'sourceFingerprint': SCOPE['sourceFingerprint'], 'sourceIndexSHA256': SCOPE['sourceIndexSHA256'], **readback} and contract == artifact_contract(tree, readback, manifest_raw) and image == images, 'R32_ARTIFACT_FROZEN_READBACK_CHANGED')
        need(double_scan(work) == observation and image_contract() == images, 'R32_ARTIFACT_INPUT_OR_IMAGE_CHANGED')
        for c in chains:
            check_chain(c)
        need(meta(os.stat(name, dir_fd=parent, follow_symlinks=False)) == meta(os.fstat(outer)) and meta(os.stat(nonce, dir_fd=outer, follow_symlinks=False)) == meta(os.fstat(attempt)) and meta(os.stat(tree, dir_fd=outer, follow_symlinks=False)) == meta(os.fstat(final)) and meta(os.stat('runtime', dir_fd=final, follow_symlinks=False)) == meta(os.fstat(runtime)), 'R32_ARTIFACT_PUBLISHED_PATH_REPLACED')
        need(read_json(final, 'runtime-manifest.json')[1] == manifest_raw and read_json(final, 'artifact-contract.json')[1] == contract_raw and read_json(final, 'image-contract.json')[1] == image_raw, 'R32_ARTIFACT_RECEIPT_DOUBLE_READ_CHANGED')
        return {'schemaVersion': 1, 'kind': 'r32-artifact-byte-freeze-observation', 'nonce': nonce, 'ready': True, 'artifact': contract, 'imageContract': images, 'contractSHA256': sha(contract_raw), 'imageContractSHA256': sha(image_raw), 'sourceUnchanged': True, 'newInodesIndependent': True, 'candidateCodeExecuted': False, 'modelsInvoked': False, 'readOnly': p['action'] == 'check'}
    finally:
        for fd in reversed(held):
            os.close(fd)
        for chain in reversed(chains):
            close_chain(chain)


if __name__ == '__main__':
    if sys.argv[1:] == ['--inspect']:
        print(json.dumps({'kind': 'r32-artifact-byte-controller-preparation', 'ready': False, 'reviewedActivationRequired': True, 'remoteOperations': False, 'candidateCodeExecuted': False, 'modelsInvoked': False}))
    else:
        print(json.dumps(main(globals().get('p')), separators=(',', ':')))
