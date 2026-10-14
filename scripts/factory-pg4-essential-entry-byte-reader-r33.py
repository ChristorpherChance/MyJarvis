"""Finite package declaration/entry and PG manifest byte reader. No package code executes.
Root bootstrap supplies a 30-second timer before stdin; run never resets/cancels it.
"""
import base64, hashlib, json, os, posixpath, re, signal, stat, sys
PROTOCOL='PG4_ESSENTIAL_ENTRY_BYTES_R33_V1'
METADATA_MAX=8388608
SCOPE={'schemaVersion': 1, 'kind': 'r33-pg4-essential-entry-byte-fixed-scope', 'protocol': 'PG4_ESSENTIAL_ENTRY_BYTES_R33_V1', 'mainRoot': '/var/lib/jarvis-development/101/r32-truth-artifacts/9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3/runtime', 'mainRootIdentity': {'device': 66306, 'inode': 7924569}, 'contractSHA256': '27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71', 'manifestSHA256': 'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7', 'treeSHA256': '9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3', 'metadataSHA256': '07924f72531aa654275d09be16f238210a9c6c7985054fc64e1c10d8bf9af834', 'pgRoot': '/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime', 'pgRootIdentity': {'device': 66306, 'inode': 6863174}, 'pgManifestPath': '/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime-manifest.json', 'pgManifestSHA256': 'd916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1', 'packageGroups': [{'requiredRoles': ['vite'], 'alias': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vite', 'target': '../../vite@5.4.21_@types+node@22.20.4_terser@5.51.2/node_modules/vite', 'root': 'source/node_modules/.pnpm/vite@5.4.21_@types+node@22.20.4_terser@5.51.2/node_modules/vite', 'packageJSON': {'runtimeRelativePath': 'source/node_modules/.pnpm/vite@5.4.21_@types+node@22.20.4_terser@5.51.2/node_modules/vite/package.json', 'sha256': 'e9802045cdc313b6da55ec2e2dd79312074645816089d64f6021f567c10c0a03', 'bytes': 4893}}, {'requiredRoles': ['vite-node/client', 'vite-node/server'], 'alias': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vite-node', 'target': '../../vite-node@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vite-node', 'root': 'source/node_modules/.pnpm/vite-node@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vite-node', 'packageJSON': {'runtimeRelativePath': 'source/node_modules/.pnpm/vite-node@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vite-node/package.json', 'sha256': '7018dacaa212db8e05f454147ac95b817c96b5e45fe56379f8ed54e11617b138', 'bytes': 2357}}, {'requiredRoles': ['@vitest/expect'], 'alias': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/@vitest/expect', 'target': '../../../@vitest+expect@2.1.9/node_modules/@vitest/expect', 'root': 'source/node_modules/.pnpm/@vitest+expect@2.1.9/node_modules/@vitest/expect', 'packageJSON': {'runtimeRelativePath': 'source/node_modules/.pnpm/@vitest+expect@2.1.9/node_modules/@vitest/expect/package.json', 'sha256': 'd446341ca2232dd04f2ffbd08a83d124c124ba7023b6b89c505c19a377eec832', 'bytes': 1121}}, {'requiredRoles': ['@vitest/snapshot'], 'alias': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/@vitest/snapshot', 'target': '../../../@vitest+snapshot@2.1.9/node_modules/@vitest/snapshot', 'root': 'source/node_modules/.pnpm/@vitest+snapshot@2.1.9/node_modules/@vitest/snapshot', 'packageJSON': {'runtimeRelativePath': 'source/node_modules/.pnpm/@vitest+snapshot@2.1.9/node_modules/@vitest/snapshot/package.json', 'sha256': '840f3e3c952ccffd91aac10a57249e5c1f3d3d61392f101477fa4c948913ff36', 'bytes': 1327}}, {'requiredRoles': ['@vitest/spy'], 'alias': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/@vitest/spy', 'target': '../../../@vitest+spy@2.1.9/node_modules/@vitest/spy', 'root': 'source/node_modules/.pnpm/@vitest+spy@2.1.9/node_modules/@vitest/spy', 'packageJSON': {'runtimeRelativePath': 'source/node_modules/.pnpm/@vitest+spy@2.1.9/node_modules/@vitest/spy/package.json', 'sha256': 'cda41d60e2fb9b45919624528413d2e17d537523448380759e47bcba91c3782a', 'bytes': 909}}, {'requiredRoles': ['chai'], 'alias': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/chai', 'target': '../../chai@5.3.3/node_modules/chai', 'root': 'source/node_modules/.pnpm/chai@5.3.3/node_modules/chai', 'packageJSON': {'runtimeRelativePath': 'source/node_modules/.pnpm/chai@5.3.3/node_modules/chai/package.json', 'sha256': '25ef536c7435582fe1bfa2c299c691517763bb7a6aac25c4e33a508a5905f02e', 'bytes': 2071}}], 'exportPolicy': {'activeConditions': ['node', 'import', 'default'], 'inactiveConditions': ['types', 'require', 'browser'], 'declarationOrderPreserved': True, 'literalMainForRootWithExportsAbsentOnly': True, 'unknownArrayPatternRefused': True, 'actualNodeResolutionClaimed': False}, 'limits': {'programAlarmSeconds': 30, 'sshTimeoutSeconds': 45, 'maxRootCalls': 1, 'maxUniqueFiles': 14, 'maxMainFiles': 13, 'packageJSONMaxBytes': 65536, 'entryMaxBytes': 4194304, 'mainSelectedMaxBytes': 16777216, 'manifestInputMaxBytes': 67108864, 'pgManifestMaxBytes': 67108864, 'serializedResponseMaxBytes': 134217728, 'combinedWireMaxBytes': 134217728, 'privatePacketMaxBytes': 268435456, 'automaticRetry': False}}
MAIN_AUTHORITY={'manifestMaxBytes': 67108864, 'manifestSHA256': 'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7', 'sourceFingerprint': 'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2', 'sourceIndexSHA256': 'c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927', 'manifestNodes': 47827, 'files': 39400, 'bytes': 498481064, 'symlinks': 2168, 'rootIdentity': {'device': 66306, 'inode': 7924569}, 'treeSHA256': '9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3', 'metadataSHA256': '07924f72531aa654275d09be16f238210a9c6c7985054fc64e1c10d8bf9af834'}

def need(value, code):
    if not value: raise RuntimeError(code)

def compact(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()

def digest(value): return hashlib.sha256(value).hexdigest()

def metadata(s): return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]

def duplicate(items):
    result = {}
    for k, v in items:
        need(k not in result, 'R33_PG4_EB_DUPLICATE_JSON'); result[k] = v
    return result

def decode(raw): return json.loads(raw, object_pairs_hook=duplicate, parse_constant=lambda _: need(False, 'R33_PG4_EB_NONFINITE_JSON'))

def path_ok(path): return type(path) is str and 0 < len(path) < 4096 and not path.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]', path) and all(p not in ('', '.', '..') for p in path.split('/')) and len(path.split('/')) <= 48

def integer(value): return type(value) is int and value >= 0

def hash_ok(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None

def validate_manifest(raw, expected=MAIN_AUTHORITY):
    need(len(raw) <= expected['manifestMaxBytes'] and digest(raw) == expected['manifestSHA256'], 'R33_PG4_EB_MANIFEST_RAW_CHANGED')
    v = decode(raw)
    need(type(v) is dict and set(v) == {'schemaVersion','kind','root','sourceFingerprint','sourceIndexSHA256','entries','treeSHA256','metadata','rootStat','metadataSHA256','identity','files','bytes','legacyWorkMetadataSHA256','legacyWorkEntries'}, 'R33_PG4_EB_MANIFEST_SCHEMA_CHANGED')
    need(v['schemaVersion'] == 1 and type(v['schemaVersion']) is int and v['kind'] == 'r32-application-runtime-manifest' and v['root'] == '/work' and v['sourceFingerprint'] == expected['sourceFingerprint'] and v['sourceIndexSHA256'] == expected['sourceIndexSHA256'], 'R33_PG4_EB_MANIFEST_ORIGIN_CHANGED')
    entries, rows, root = v['entries'], v['metadata'], v['rootStat']
    need(type(entries) is list and len(entries) == expected['manifestNodes'] and type(rows) is list and len(rows) == len(entries) and type(root) is list and len(root) == 9 and all(integer(x) for x in root), 'R33_PG4_EB_MANIFEST_COUNTS_CHANGED')
    need(type(v['identity']) is dict and v['identity'] == expected['rootIdentity'] and v['identity'] == {'device':root[0],'inode':root[1]} and root[2:4] == [0,0] and stat.S_ISDIR(root[4]) and stat.S_IMODE(root[4]) == 0o555, 'R33_PG4_EB_MANIFEST_ROOT_CHANGED')
    nodes, metas, previous, totals = {}, {}, '', {'file':0, 'symlink':0, 'bytes':0}
    for e, row in zip(entries, rows):
        need(type(e) is dict and path_ok(e.get('path')) and e['path'] > previous and e.get('type') in ('directory','file','symlink'), 'R33_PG4_EB_MANIFEST_ENTRY_CHANGED'); previous = e['path']
        kind = e['type']; need(set(e) == ({'path','type','sha256','bytes'} if kind == 'file' else {'path','type','target'} if kind == 'symlink' else {'path','type'}), 'R33_PG4_EB_MANIFEST_ENTRY_FIELDS_CHANGED')
        need(type(row) is list and len(row) == 10 and row[0] == e['path'] and all(integer(x) for x in row[1:]) and row[3:5] == [0,0], 'R33_PG4_EB_MANIFEST_METADATA_CHANGED')
        m = row[1:]; need((stat.S_ISDIR(m[4]) and stat.S_IMODE(m[4]) == 0o555) if kind == 'directory' else (stat.S_ISREG(m[4]) and stat.S_IMODE(m[4]) in (0o444,0o555) and m[5] == 1) if kind == 'file' else (stat.S_ISLNK(m[4]) and m[5] == 1), 'R33_PG4_EB_MANIFEST_MODE_CHANGED')
        if kind == 'file':
            need(hash_ok(e['sha256']) and integer(e['bytes']) and e['bytes'] == m[6], 'R33_PG4_EB_MANIFEST_FILE_CHANGED'); totals['file'] += 1; totals['bytes'] += e['bytes']
        if kind == 'symlink':
            need(type(e['target']) is str and 0 < len(e['target']) < 4096 and not e['target'].startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',e['target']), 'R33_PG4_EB_MANIFEST_LINK_CHANGED'); totals['symlink'] += 1
        nodes[e['path']] = e; metas[e['path']] = m
    need(totals == {'file':expected['files'],'bytes':expected['bytes'],'symlink':expected['symlinks']} and v['files'] == expected['files'] and v['bytes'] == expected['bytes'] and hash_ok(v['legacyWorkMetadataSHA256']) and v['legacyWorkEntries'] == expected['manifestNodes'], 'R33_PG4_EB_MANIFEST_TOTAL_CHANGED')
    need(digest(compact(entries)) == v['treeSHA256'] == expected['treeSHA256'] and digest(compact({'rootIdentity':root,'metadata':rows})) == v['metadataSHA256'] == expected['metadataSHA256'], 'R33_PG4_EB_MANIFEST_HASH_DOMAIN_CHANGED')
    for path, e in nodes.items():
        parent = posixpath.dirname(path); need(not parent or parent in nodes and nodes[parent]['type'] == 'directory', 'R33_PG4_EB_MANIFEST_PARENT_CHANGED')
    return v, nodes, metas

def resolve_manifest(path, nodes, visit=None):
    need(path_ok(path), 'R33_PG4_EB_LOGICAL_PATH_CHANGED'); seen = set()
    for _ in range(64):
        parts = path.split('/'); changed = False
        for i in range(len(parts)):
            prefix = '/'.join(parts[:i+1]); e = nodes.get(prefix); need(e is not None, 'R33_PG4_EB_MANIFEST_LINK_MISSING')
            if visit is not None: visit(prefix, e)
            if e['type'] == 'symlink':
                need(path not in seen, 'R33_PG4_EB_MANIFEST_LINK_CYCLE'); seen.add(path)
                target = e['target']; need(type(target) is str and target and not target.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',target), 'R33_PG4_EB_MANIFEST_LINK_INVALID')
                path = posixpath.normpath(posixpath.join(posixpath.dirname(prefix), target, *parts[i+1:])); need(path_ok(path), 'R33_PG4_EB_MANIFEST_LINK_ESCAPE'); changed = True; break
            if i < len(parts)-1: need(e['type'] == 'directory', 'R33_PG4_EB_MANIFEST_NOT_DIRECTORY')
        if not changed: return path
    need(False, 'R33_PG4_EB_MANIFEST_LINK_LIMIT')

class Reader:
    def __init__(self):
        self.phase = 'PARAMETERS'; self.first = None; self.secondary = []; self.partial = []; self.fds = {}; self.file_fds = set(); self.close_unresolved = set(); self.directories = {}; self.trace = {}; self.trace_bytes = 0
    def error(self, error, phase=None):
        text = str(error); code = text if re.fullmatch('R33_PG4_EB_[A-Z0-9_]+',text) else 'R33_PG4_EB_OS_OR_PARSE_INCOMPLETE'
        item = {'phase':phase or self.phase,'code':code,'errno':error.errno if isinstance(error,OSError) else None}
        if self.first is None: self.first = item
        else: self.secondary.append(item)
    def close(self, fd, primary=None):
        try: os.close(fd); self.fds.pop(fd, None); self.file_fds.discard(fd)
        except BaseException as e:
            self.fds.pop(fd, None); self.file_fds.discard(fd); self.close_unresolved.add(fd)
            self.error(e, 'DESCRIPTOR_CLOSE')
            if primary is None: raise
    def open_dir(self, parent, name, expected=None):
        self.phase = 'DIRECTORY_BIND'; before = os.stat(name,dir_fd=parent,follow_symlinks=False) if parent is not None else os.stat(name,follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0 and not before.st_mode & 0o022, 'R33_PG4_EB_DIRECTORY_UNTRUSTED')
        if expected is not None: need(metadata(before) == expected, 'R33_PG4_EB_DIRECTORY_MANIFEST_CHANGED')
        cached = self.directories.get((parent,name))
        if cached is not None:
            need(metadata(os.fstat(cached)) == metadata(before) == self.fds[cached][2], 'R33_PG4_EB_DIRECTORY_CACHE_CHANGED'); return cached
        fd = os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent); self.fds[fd] = (parent,name,metadata(before))
        need(metadata(os.fstat(fd)) == metadata(before), 'R33_PG4_EB_DIRECTORY_REPLACED'); self.directories[(parent,name)] = fd; return fd
    def check_dirs(self):
        for fd,(parent,name,m) in self.fds.items(): need(metadata(os.fstat(fd)) == m and metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)) == m, 'R33_PG4_EB_DIRECTORY_CHANGED')
    def chain(self, absolute):
        need(absolute.startswith('/') and all(path_ok(x) for x in absolute.split('/')[1:]), 'R33_PG4_EB_ANCHOR_PATH_CHANGED')
        fd = self.open_dir(None,'/')
        for name in absolute.split('/')[1:]: fd = self.open_dir(fd,name)
        return fd
    def parent(self, root, path, metas):
        fd = root; prefix = []
        for name in path.split('/')[:-1]:
            prefix.append(name); fd = self.open_dir(fd,name,metas['/'.join(prefix)])
        return fd
    def record(self, path, entry, m):
        if path in self.trace: return
        item = {'path':path,'type':entry['type'],'metadata':m}
        if entry['type'] == 'symlink': item['target'] = entry['target']
        amount = len(compact(item)); need(self.trace_bytes + amount <= METADATA_MAX, 'R33_PG4_EB_METADATA_EVIDENCE_LIMIT'); self.trace_bytes += amount; self.trace[path] = item
    def visit(self, root, path, entry, metas):
        if path in self.trace: return
        parent = self.parent(root,path,metas); name = path.rsplit('/',1)[-1]; before = os.stat(name,dir_fd=parent,follow_symlinks=False)
        need(metadata(before) == metas[path], 'R33_PG4_EB_TRAVERSED_METADATA_CHANGED')
        if entry['type'] == 'symlink': need(os.readlink(name,dir_fd=parent) == entry['target'] and metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)) == metas[path], 'R33_PG4_EB_TRAVERSED_LINK_CHANGED')
        self.record(path,entry,metas[path]); self.check_dirs()
    def read(self, parent, name, limit, expected=None, label=None):
        self.phase = 'FILE_BIND'; before = os.stat(name,dir_fd=parent,follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) in (0o444,0o555) and 0 <= before.st_size <= limit, 'R33_PG4_EB_FILE_UNTRUSTED')
        if expected is not None: need(metadata(before) == expected['metadata'] and before.st_size == expected['bytes'], 'R33_PG4_EB_FILE_MANIFEST_CHANGED')
        fd = None; primary = None; parts = []; second_prefix = 0; second_hash = hashlib.sha256(); mismatch = None; body = None
        try:
            fd = os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
            self.file_fds.add(fd)
            need(metadata(os.fstat(fd)) == metadata(before), 'R33_PG4_EB_FILE_REPLACED'); self.phase = 'FILE_FIRST_READ'; size = 0
            while True:
                b = os.read(fd,65536)
                if not b: break
                parts.append(b); size += len(b); need(size <= before.st_size, 'R33_PG4_EB_FILE_GREW')
            body = b''.join(parts); need(len(body) == before.st_size and (expected is None or digest(body) == expected['sha256']), 'R33_PG4_EB_FILE_BYTES_CHANGED')
            need(metadata(os.fstat(fd)) == metadata(before) == metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)), 'R33_PG4_EB_FILE_FIRST_CHANGED')
            os.lseek(fd,0,os.SEEK_SET); self.phase = 'FILE_SECOND_READ'
            while True:
                b = os.read(fd,65536)
                if not b: break
                if b != body[second_prefix:second_prefix+len(b)]: mismatch = b; need(False,'R33_PG4_EB_FILE_SECOND_BYTES_CHANGED')
                second_hash.update(b); second_prefix += len(b)
            need(second_prefix == len(body) and metadata(os.fstat(fd)) == metadata(before) == metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)), 'R33_PG4_EB_FILE_SECOND_CHANGED')
            return {'path':label or name,'sha256':digest(body),'bytes':len(body),'metadata':metadata(before),'base64':base64.b64encode(body).decode(),'twoReadsStable':True}
        except BaseException as e:
            primary = e; self.error(e)
            raw = body if body is not None else b''.join(parts)
            self.partial.append({'path':label or name,'originalFirstReadBase64':base64.b64encode(raw).decode(),'originalFirstReadBytes':len(raw),'originalFirstReadSHA256':digest(raw),'secondReadMatchingPrefixBytes':second_prefix,'secondReadMatchingPrefixSHA256':second_hash.hexdigest(),'secondReadMatchingPrefixUsesIdenticalFirstReadBytes':True,'secondReadMismatchBlockBase64':None if mismatch is None else base64.b64encode(mismatch).decode()})
            raise
        finally:
            if fd is not None:
                try: self.close(fd,primary)
                except BaseException:
                    raw = body if body is not None else b''.join(parts)
                    self.partial.append({'path':label or name,'originalFirstReadBase64':base64.b64encode(raw).decode(),'originalFirstReadBytes':len(raw),'originalFirstReadSHA256':digest(raw),'closeOnlyFailure':True})
                    raise
    def finish(self):
        # Every retained chain FD is closed, including acquisition failures and descriptor zero.
        error = None
        for fd in [*self.file_fds,*reversed(list(self.fds))]:
            try: self.close(fd,error or self.first)
            except BaseException as e:
                if error is None: error = e
        if error is not None: raise error


def select_entry(package, role, package_root):
    need(type(package) is dict and type(role) is str and path_ok(package_root),'R33_PG4_EB_PACKAGE_DATA_CHANGED')
    subpath='./'+role.split('/',1)[1] if role in ('vite-node/client','vite-node/server') else '.'
    if 'exports' not in package:
        need(subpath=='.' and type(package.get('main')) is str and package['main'],'R33_PG4_EB_NO_LITERAL_MAIN')
        target=package['main'];branch=['main']
    else:
        value=package['exports'];branch=['exports']
        if type(value) is dict and any(k.startswith('.') for k in value):
            need(all(type(k) is str and k.startswith('.') for k in value) and subpath in value,'R33_PG4_EB_EXACT_EXPORT_SUBPATH_MISSING')
            # Only exact selected keys participate. No wildcard expansion or index fallback.
            value=value[subpath];branch.append(subpath)
        else:need(subpath=='.','R33_PG4_EB_EXACT_EXPORT_SUBPATH_MISSING')
        for _ in range(12):
            if type(value) is str:break
            need(type(value) is dict and value and all(k in SCOPE['exportPolicy']['activeConditions']+SCOPE['exportPolicy']['inactiveConditions'] for k in value),'R33_PG4_EB_EXPORT_CONDITION_UNSUPPORTED')
            chosen=next((k for k in value if k in SCOPE['exportPolicy']['activeConditions']),None);need(chosen is not None,'R33_PG4_EB_EXPORT_CONDITION_UNRESOLVED');branch.append(chosen);value=value[chosen]
        need(type(value) is str and value.startswith('./'),'R33_PG4_EB_EXPORT_TARGET_UNSUPPORTED');target=value
    need(type(target) is str and '*' not in target and not target.startswith('/') and path_ok(target[2:] if target.startswith('./') else target),'R33_PG4_EB_ENTRY_PATH_ESCAPE')
    relative=target[2:] if target.startswith('./') else target
    return package_root+'/'+relative,branch

def run(p=None):
    output={'schemaVersion':1,'kind':'r33-pg4-essential-entry-selected-byte-observation','protocol':PROTOCOL,'programSHA256':None,'scope':SCOPE,'readComplete':False,'selectedBytesQualified':False,'readerProfile':None,'files':[],'roleBindings':[],'packageDeclarations':[],'runtimeRootIdentity':None,'pgRuntimeRootIdentity':None,'manifestPinned':False,'manifestSelfConsistency':False,'manifestOriginalIntegerDomainPreserved':False,'selectedTwoReadsStable':False,'allReaderDescriptorsClosed':False,'readOnly':True,'firstClosedError':None,'secondaryClosedErrors':[],'partialReads':[],'historicalPGManifestLeafMetadataKnown':False,'wholeRuntimeRead':False,'frameworkABIQualified':False,'frameworkSemanticsQualified':False,'PG4Qualified':False,'frameworkExecuted':False,'candidateExecuted':False,'modelsInvoked':False,'mutationsPerformed':False}
    reader=Reader();complete=False
    try:
        need(type(p) is dict and set(p)=={'scope','programSHA256','contractRawBase64','manifestRawBase64'} and json.dumps(p['scope'],sort_keys=True,separators=(',',':'))==json.dumps(SCOPE,sort_keys=True,separators=(',',':')) and hash_ok(p['programSHA256']),'R33_PG4_EB_INPUT_REQUIRED')
        output['programSHA256']=p['programSHA256'];reader.phase='ORIGINAL_INPUT'
        def original(value,maximum):
            need(type(value) is str and len(value)<=4*((maximum+2)//3),'R33_PG4_EB_INPUT_LIMIT');raw=base64.b64decode(value,validate=True);need(len(raw)<=maximum,'R33_PG4_EB_INPUT_LIMIT');return raw
        contract_raw=original(p['contractRawBase64'],1048576);need(digest(contract_raw)==SCOPE['contractSHA256'],'R33_PG4_EB_CONTRACT_CHANGED');contract=decode(contract_raw)
        need(contract['root']==SCOPE['mainRoot'] and contract['rootIdentity']==SCOPE['mainRootIdentity'] and contract['manifestSHA256']==SCOPE['manifestSHA256'] and contract['treeSHA256']==SCOPE['treeSHA256'] and contract['metadataSHA256']==SCOPE['metadataSHA256'],'R33_PG4_EB_CONTRACT_SCOPE_CHANGED')
        manifest_raw=original(p['manifestRawBase64'],SCOPE['limits']['manifestInputMaxBytes']);manifest,nodes,metas=validate_manifest(manifest_raw);output['manifestPinned']=True;output['manifestSelfConsistency']=True;output['manifestOriginalIntegerDomainPreserved']=True
        remaining=signal.getitimer(signal.ITIMER_REAL)[0];need(0<remaining<=30,'R33_PG4_EB_PARENT_TIMER_REQUIRED')
        output['readerProfile']={'uid':os.getuid(),'euid':os.geteuid(),'gid':os.getgid(),'egid':os.getegid(),'isolated':sys.flags.isolated};need(output['readerProfile']=={'uid':0,'euid':0,'gid':0,'egid':0,'isolated':1},'R33_PG4_EB_ROOT_ISOLATED_REQUIRED')
        root=reader.chain(SCOPE['mainRoot']);need(metadata(os.fstat(root))==manifest['rootStat'],'R33_PG4_EB_MAIN_ROOT_CHANGED');output['runtimeRootIdentity']=SCOPE['mainRootIdentity']
        selected={};main_total=0
        def selected_read(path,limit,domain='main',parent=None,expected=None):
            nonlocal main_total
            if path in selected:return selected[path]
            need(len(selected)<SCOPE['limits']['maxUniqueFiles'],'R33_PG4_EB_SELECTED_FILE_LIMIT')
            if domain=='main':
                need(len([x for x in selected.values() if x['domain']=='main'])<SCOPE['limits']['maxMainFiles'] and nodes.get(path,{}).get('type')=='file','R33_PG4_EB_MAIN_FILE_LIMIT')
                need(main_total+nodes[path]['bytes']<=SCOPE['limits']['mainSelectedMaxBytes'],'R33_PG4_EB_MAIN_BYTE_LIMIT');parent=reader.parent(root,path,metas);expected={**nodes[path],'metadata':metas[path]}
            row=reader.read(parent,path.rsplit('/',1)[-1],limit,expected,path);row['domain']=domain;selected[path]=row;output['files'].append(row)
            if domain=='main':main_total+=row['bytes']
            return row
        resolve=lambda path:resolve_manifest(path,nodes,lambda a,e:reader.visit(root,a,e,metas))
        declarations=[]
        for group in SCOPE['packageGroups']:
            reader.phase='ALIAS_BIND';alias=nodes.get(group['alias']);need(alias and alias['type']=='symlink' and alias['target']==group['target'] and resolve(group['alias'])==group['root'],'R33_PG4_EB_PACKAGE_ALIAS_CHANGED')
            package_path=group['packageJSON']['runtimeRelativePath'];need(package_path==group['root']+'/package.json' and nodes.get(package_path,{}).get('sha256')==group['packageJSON']['sha256'] and nodes[package_path]['bytes']==group['packageJSON']['bytes'],'R33_PG4_EB_PACKAGE_MANIFEST_CHANGED')
            row=selected_read(package_path,SCOPE['limits']['packageJSONMaxBytes']);package=decode(base64.b64decode(row['base64'],validate=True));output['packageDeclarations'].append({'packagePath':package_path,'sha256':row['sha256'],'bytes':row['bytes'],'name':package.get('name'),'version':package.get('version'),'hasExports':'exports' in package,'exports':package.get('exports'),'hasMain':'main' in package,'main':package.get('main')})
            declarations.append((group,package_path,package))
        for group,package_path,package in declarations:
            for role in group['requiredRoles']:
                reader.phase='EXPORT_DATA_SELECTION';logical,branch=select_entry(package,role,group['root']);physical=resolve(logical);need(physical.startswith(group['root']+'/'),'R33_PG4_EB_ENTRY_PHYSICAL_PACKAGE_ESCAPE');selected_read(physical,SCOPE['limits']['entryMaxBytes']);output['roleBindings'].append({'specifier':role,'packagePath':package_path,'entryPath':physical,'selectionBranch':branch,'actualNodeResolutionExecuted':False})
        need(len(output['roleBindings'])==7 and len(output['packageDeclarations'])==6,'R33_PG4_EB_SELECTED_ROLE_COUNTS_CHANGED')
        pg=reader.chain(SCOPE['pgRoot']);actual=os.fstat(pg);need({'device':actual.st_dev,'inode':actual.st_ino}==SCOPE['pgRootIdentity'] and stat.S_IMODE(actual.st_mode)==0o555,'R33_PG4_EB_PG_ROOT_CHANGED');output['pgRuntimeRootIdentity']=SCOPE['pgRootIdentity']
        parent=reader.chain(posixpath.dirname(SCOPE['pgManifestPath']));row=selected_read(SCOPE['pgManifestPath'],SCOPE['limits']['pgManifestMaxBytes'],'pg-manifest',parent);need(row['sha256']==SCOPE['pgManifestSHA256'],'R33_PG4_EB_PG_MANIFEST_CHANGED')
        reader.check_dirs()
        for path,item in reader.trace.items():
            directory=reader.parent(root,path,metas);name=path.rsplit('/',1)[-1];need(metadata(os.stat(name,dir_fd=directory,follow_symlinks=False))==item['metadata'],'R33_PG4_EB_ALIAS_FINAL_CHANGED')
            if item['type']=='symlink':need(os.readlink(name,dir_fd=directory)==item['target'],'R33_PG4_EB_ALIAS_FINAL_CHANGED')
        for path,row in selected.items():
            directory=reader.parent(root,path,metas) if row['domain']=='main' else parent;need(metadata(os.stat(path.rsplit('/',1)[-1],dir_fd=directory,follow_symlinks=False))==row['metadata'],'R33_PG4_EB_SELECTED_FINAL_CHANGED')
        complete=True
    except BaseException as e:reader.error(e)
    finally:
        try:reader.finish()
        except BaseException as e:reader.error(e)
    output['allReaderDescriptorsClosed']=not reader.fds and not reader.file_fds and not reader.close_unresolved;output['firstClosedError']=reader.first;output['secondaryClosedErrors']=reader.secondary;output['partialReads']=reader.partial;output['traversedMetadata']=list(reader.trace.values());output['readComplete']=complete and reader.first is None and output['allReaderDescriptorsClosed'];output['selectedBytesQualified']=output['readComplete'];output['selectedTwoReadsStable']=output['readComplete'];output['selectedFiles']=len(output['files']);output['selectedMainBytes']=sum(r['bytes'] for r in output['files'] if r['domain']=='main');output['selectedPGManifestBytes']=sum(r['bytes'] for r in output['files'] if r['domain']=='pg-manifest')
    serialized=compact(output)
    if len(serialized)>SCOPE['limits']['serializedResponseMaxBytes']:
        output['readComplete']=output['selectedBytesQualified']=False;item={'phase':'SERIALIZE','code':'R33_PG4_EB_RESPONSE_LIMIT','errno':None};output['secondaryClosedErrors'].append(item) if output['firstClosedError'] else output.update({'firstClosedError':item});output['serializedResponseOverflow']=True
    return output
