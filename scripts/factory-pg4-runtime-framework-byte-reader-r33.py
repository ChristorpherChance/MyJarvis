"""Fixed framework source bytes only. No library load, process census, environment or mutation."""
import base64, datetime, hashlib, json, os, posixpath, re, signal, stat, sys, time

TREE = '9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3'
PARENT = '/var/lib/jarvis-development/101/r32-truth-artifacts/' + TREE
SCOPE = {'schemaVersion': 1, 'kind': 'r33-pg4-runtime-framework-byte-read-scope',
 'root': PARENT + '/runtime', 'rootIdentity': {'device': 66306, 'inode': 7924569},
 'manifestPath': PARENT + '/runtime-manifest.json', 'manifestSHA256': 'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7',
 'contractSHA256': '27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71',
 'metadataSHA256': '07924f72531aa654275d09be16f238210a9c6c7985054fc64e1c10d8bf9af834', 'treeSHA256': TREE,
 'sourceFingerprint': 'f4a86cfb949863b6f5cb0dd80dde83f8b97ea4a66e1e047fbd77fc90f92d53e2',
 'sourceIndexSHA256': 'c2a18d38676c0df2b3868095e0a27fb236acf1092574bdda81c52edb7f43d927',
 'manifestNodes': 47827, 'files': 39400, 'bytes': 498481064, 'symlinks': 2168,
 'logicalVitestPackage': 'source/apps/server/node_modules/vitest/package.json',
 'logicalVitestCLI': 'source/apps/server/node_modules/vitest/vitest.mjs',
 'rootAlarmSeconds': 30, 'manifestMaxBytes': 67108864, 'packageJSONMaxBytes': 65536, 'codeFileMaxBytes': 4194304,
 'packageEnvelopeMaxFiles': 256, 'packageEnvelopeMaxBytes': 16777216, 'depthLimit': 48, 'linkRewriteLimit': 64,
 'transportCombinedMaxBytes': 134217728, 'privatePacketMaxBytes': 268435456, 'metadataEvidenceMaxBytes': 8388608}

def need(value, code):
    if not value: raise RuntimeError(code)
def compact(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
def digest(value): return hashlib.sha256(value).hexdigest()
def metadata(s): return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]
def duplicate(items):
    result = {}
    for k, v in items:
        need(k not in result, 'R33_PG4_FW_DUPLICATE_JSON'); result[k] = v
    return result
def decode(raw): return json.loads(raw, object_pairs_hook=duplicate, parse_constant=lambda _: need(False, 'R33_PG4_FW_NONFINITE_JSON'))
def path_ok(path): return type(path) is str and 0 < len(path) < 4096 and not path.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]', path) and all(p not in ('', '.', '..') for p in path.split('/')) and len(path.split('/')) <= 48
def integer(value): return type(value) is int and value >= 0
def hash_ok(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None

def validate_manifest(raw, expected=SCOPE):
    need(len(raw) <= expected['manifestMaxBytes'] and digest(raw) == expected['manifestSHA256'], 'R33_PG4_FW_MANIFEST_RAW_CHANGED')
    v = decode(raw)
    need(type(v) is dict and set(v) == {'schemaVersion','kind','root','sourceFingerprint','sourceIndexSHA256','entries','treeSHA256','metadata','rootStat','metadataSHA256','identity','files','bytes','legacyWorkMetadataSHA256','legacyWorkEntries'}, 'R33_PG4_FW_MANIFEST_SCHEMA_CHANGED')
    need(v['schemaVersion'] == 1 and type(v['schemaVersion']) is int and v['kind'] == 'r32-application-runtime-manifest' and v['root'] == '/work' and v['sourceFingerprint'] == expected['sourceFingerprint'] and v['sourceIndexSHA256'] == expected['sourceIndexSHA256'], 'R33_PG4_FW_MANIFEST_ORIGIN_CHANGED')
    entries, rows, root = v['entries'], v['metadata'], v['rootStat']
    need(type(entries) is list and len(entries) == expected['manifestNodes'] and type(rows) is list and len(rows) == len(entries) and type(root) is list and len(root) == 9 and all(integer(x) for x in root), 'R33_PG4_FW_MANIFEST_COUNTS_CHANGED')
    need(type(v['identity']) is dict and v['identity'] == expected['rootIdentity'] and v['identity'] == {'device':root[0],'inode':root[1]} and root[2:4] == [0,0] and stat.S_ISDIR(root[4]) and stat.S_IMODE(root[4]) == 0o555, 'R33_PG4_FW_MANIFEST_ROOT_CHANGED')
    nodes, metas, previous, totals = {}, {}, '', {'file':0, 'symlink':0, 'bytes':0}
    for e, row in zip(entries, rows):
        need(type(e) is dict and path_ok(e.get('path')) and e['path'] > previous and e.get('type') in ('directory','file','symlink'), 'R33_PG4_FW_MANIFEST_ENTRY_CHANGED'); previous = e['path']
        kind = e['type']; need(set(e) == ({'path','type','sha256','bytes'} if kind == 'file' else {'path','type','target'} if kind == 'symlink' else {'path','type'}), 'R33_PG4_FW_MANIFEST_ENTRY_FIELDS_CHANGED')
        need(type(row) is list and len(row) == 10 and row[0] == e['path'] and all(integer(x) for x in row[1:]) and row[3:5] == [0,0], 'R33_PG4_FW_MANIFEST_METADATA_CHANGED')
        m = row[1:]; need((stat.S_ISDIR(m[4]) and stat.S_IMODE(m[4]) == 0o555) if kind == 'directory' else (stat.S_ISREG(m[4]) and stat.S_IMODE(m[4]) in (0o444,0o555) and m[5] == 1) if kind == 'file' else (stat.S_ISLNK(m[4]) and m[5] == 1), 'R33_PG4_FW_MANIFEST_MODE_CHANGED')
        if kind == 'file':
            need(hash_ok(e['sha256']) and integer(e['bytes']) and e['bytes'] == m[6], 'R33_PG4_FW_MANIFEST_FILE_CHANGED'); totals['file'] += 1; totals['bytes'] += e['bytes']
        if kind == 'symlink':
            need(type(e['target']) is str and 0 < len(e['target']) < 4096 and not e['target'].startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',e['target']), 'R33_PG4_FW_MANIFEST_LINK_CHANGED'); totals['symlink'] += 1
        nodes[e['path']] = e; metas[e['path']] = m
    need(totals == {'file':expected['files'],'bytes':expected['bytes'],'symlink':expected['symlinks']} and v['files'] == expected['files'] and v['bytes'] == expected['bytes'] and hash_ok(v['legacyWorkMetadataSHA256']) and v['legacyWorkEntries'] == expected['manifestNodes'], 'R33_PG4_FW_MANIFEST_TOTAL_CHANGED')
    need(digest(compact(entries)) == v['treeSHA256'] == expected['treeSHA256'] and digest(compact({'rootIdentity':root,'metadata':rows})) == v['metadataSHA256'] == expected['metadataSHA256'], 'R33_PG4_FW_MANIFEST_HASH_DOMAIN_CHANGED')
    for path, e in nodes.items():
        parent = posixpath.dirname(path); need(not parent or parent in nodes and nodes[parent]['type'] == 'directory', 'R33_PG4_FW_MANIFEST_PARENT_CHANGED')
    return v, nodes, metas

def resolve_manifest(path, nodes, visit=None):
    need(path_ok(path), 'R33_PG4_FW_LOGICAL_PATH_CHANGED'); seen = set()
    for _ in range(64):
        parts = path.split('/'); changed = False
        for i in range(len(parts)):
            prefix = '/'.join(parts[:i+1]); e = nodes.get(prefix); need(e is not None, 'R33_PG4_FW_MANIFEST_LINK_MISSING')
            if visit is not None: visit(prefix, e)
            if e['type'] == 'symlink':
                need(path not in seen, 'R33_PG4_FW_MANIFEST_LINK_CYCLE'); seen.add(path)
                target = e['target']; need(type(target) is str and target and not target.startswith('/') and not re.search(r'[\\\x00-\x1f\x7f]',target), 'R33_PG4_FW_MANIFEST_LINK_INVALID')
                path = posixpath.normpath(posixpath.join(posixpath.dirname(prefix), target, *parts[i+1:])); need(path_ok(path), 'R33_PG4_FW_MANIFEST_LINK_ESCAPE'); changed = True; break
            if i < len(parts)-1: need(e['type'] == 'directory', 'R33_PG4_FW_MANIFEST_NOT_DIRECTORY')
        if not changed: return path
    need(False, 'R33_PG4_FW_MANIFEST_LINK_LIMIT')

def package_bindings(nodes, resolve):
    vitest = posixpath.dirname(resolve(SCOPE['logicalVitestPackage'])); cli = resolve(SCOPE['logicalVitestCLI'])
    need(posixpath.dirname(cli) == vitest and nodes[cli]['type'] == 'file', 'R33_PG4_FW_CLI_ALIAS_CHANGED')
    adjacent = posixpath.dirname(vitest)
    runner = posixpath.dirname(resolve(adjacent + '/@vitest/runner/package.json'))
    utils = posixpath.dirname(resolve(adjacent + '/@vitest/utils/package.json'))
    runner_adjacent = posixpath.dirname(posixpath.dirname(runner))
    runner_utils = posixpath.dirname(resolve(runner_adjacent + '/@vitest/utils/package.json'))
    need(runner_utils == utils and len({vitest,runner,utils}) == 3, 'R33_PG4_FW_ADJACENT_PACKAGE_ALIAS_CHANGED')
    return {'vitest':vitest,'runner':runner,'utils':utils}, cli

class Reader:
    def __init__(self):
        self.phase = 'PARAMETERS'; self.first = None; self.secondary = []; self.partial = []; self.fds = {}; self.file_fds = set(); self.close_unresolved = set(); self.directories = {}; self.trace = {}; self.trace_bytes = 0
    def error(self, error, phase=None):
        text = str(error); code = text if re.fullmatch('R33_PG4_FW_[A-Z0-9_]+',text) else 'R33_PG4_FW_OS_OR_PARSE_INCOMPLETE'
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
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0 and not before.st_mode & 0o022, 'R33_PG4_FW_DIRECTORY_UNTRUSTED')
        if expected is not None: need(metadata(before) == expected, 'R33_PG4_FW_DIRECTORY_MANIFEST_CHANGED')
        cached = self.directories.get((parent,name))
        if cached is not None:
            need(metadata(os.fstat(cached)) == metadata(before) == self.fds[cached][2], 'R33_PG4_FW_DIRECTORY_CACHE_CHANGED'); return cached
        fd = os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent); self.fds[fd] = (parent,name,metadata(before))
        need(metadata(os.fstat(fd)) == metadata(before), 'R33_PG4_FW_DIRECTORY_REPLACED'); self.directories[(parent,name)] = fd; return fd
    def check_dirs(self):
        for fd,(parent,name,m) in self.fds.items(): need(metadata(os.fstat(fd)) == m and metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)) == m, 'R33_PG4_FW_DIRECTORY_CHANGED')
    def chain(self, absolute):
        need(absolute.startswith('/') and all(path_ok(x) for x in absolute.split('/')[1:]), 'R33_PG4_FW_ANCHOR_PATH_CHANGED')
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
        amount = len(compact(item)); need(self.trace_bytes + amount <= SCOPE['metadataEvidenceMaxBytes'], 'R33_PG4_FW_METADATA_EVIDENCE_LIMIT'); self.trace_bytes += amount; self.trace[path] = item
    def visit(self, root, path, entry, metas):
        if path in self.trace: return
        parent = self.parent(root,path,metas); name = path.rsplit('/',1)[-1]; before = os.stat(name,dir_fd=parent,follow_symlinks=False)
        need(metadata(before) == metas[path], 'R33_PG4_FW_TRAVERSED_METADATA_CHANGED')
        if entry['type'] == 'symlink': need(os.readlink(name,dir_fd=parent) == entry['target'] and metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)) == metas[path], 'R33_PG4_FW_TRAVERSED_LINK_CHANGED')
        self.record(path,entry,metas[path]); self.check_dirs()
    def read(self, parent, name, limit, expected=None, label=None):
        self.phase = 'FILE_BIND'; before = os.stat(name,dir_fd=parent,follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) in (0o444,0o555) and 0 <= before.st_size <= limit, 'R33_PG4_FW_FILE_UNTRUSTED')
        if expected is not None: need(metadata(before) == expected['metadata'] and before.st_size == expected['bytes'], 'R33_PG4_FW_FILE_MANIFEST_CHANGED')
        fd = None; primary = None; parts = []; second_prefix = 0; second_hash = hashlib.sha256(); mismatch = None; body = None
        try:
            fd = os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=parent)
            self.file_fds.add(fd)
            need(metadata(os.fstat(fd)) == metadata(before), 'R33_PG4_FW_FILE_REPLACED'); self.phase = 'FILE_FIRST_READ'; size = 0
            while True:
                b = os.read(fd,65536)
                if not b: break
                parts.append(b); size += len(b); need(size <= before.st_size, 'R33_PG4_FW_FILE_GREW')
            body = b''.join(parts); need(len(body) == before.st_size and (expected is None or digest(body) == expected['sha256']), 'R33_PG4_FW_FILE_BYTES_CHANGED')
            need(metadata(os.fstat(fd)) == metadata(before) == metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)), 'R33_PG4_FW_FILE_FIRST_CHANGED')
            os.lseek(fd,0,os.SEEK_SET); self.phase = 'FILE_SECOND_READ'
            while True:
                b = os.read(fd,65536)
                if not b: break
                if b != body[second_prefix:second_prefix+len(b)]: mismatch = b; need(False,'R33_PG4_FW_FILE_SECOND_BYTES_CHANGED')
                second_hash.update(b); second_prefix += len(b)
            need(second_prefix == len(body) and metadata(os.fstat(fd)) == metadata(before) == metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)), 'R33_PG4_FW_FILE_SECOND_CHANGED')
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

def run(p):
    reader = Reader(); output = {'schemaVersion':1,'kind':'r33-pg4-runtime-framework-selected-byte-observation','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readComplete':False,'selectedBytesQualified':False,'wholeRuntimeRead':False,'frameworkABIQualified':False,'frameworkSemanticsQualified':False,'PG4Qualified':False,'readOnly':True,'files':[],'manifest':None,'artifactContract':None}
    primary = None; start = time.monotonic()
    def deadline(_s,_f): raise RuntimeError('R33_PG4_FW_DEADLINE')
    signal.signal(signal.SIGALRM,deadline); signal.alarm(30)
    try:
        need(type(p) is dict and set(p) == {'scope','programSHA256','contractRawBase64'} and p['scope'] == SCOPE and hash_ok(p['programSHA256']), 'R33_PG4_FW_PARAMETERS_CHANGED')
        need(sys.platform == 'linux' and os.geteuid() == os.getegid() == 0, 'R33_PG4_FW_ROOT_PROFILE_REQUIRED')
        output['readerProfile'] = {'uid':os.getuid(),'euid':os.geteuid(),'gid':os.getgid(),'egid':os.getegid(),'isolated':sys.flags.isolated}
        need(output['readerProfile'] == {'uid':0,'euid':0,'gid':0,'egid':0,'isolated':1}, 'R33_PG4_FW_ISOLATED_ROOT_PROFILE_REQUIRED')
        supplied = base64.b64decode(p['contractRawBase64'],validate=True); need(len(supplied) <= 65536 and digest(supplied) == SCOPE['contractSHA256'] and base64.b64encode(supplied).decode() == p['contractRawBase64'], 'R33_PG4_FW_CONTRACT_TRANSPORT_CHANGED')
        parent = reader.chain(PARENT); need(stat.S_IMODE(os.fstat(parent).st_mode) == 0o700,'R33_PG4_FW_PUBLISH_PARENT_CHANGED')
        reader.phase = 'MANIFEST_READ'; output['manifest'] = reader.read(parent,'runtime-manifest.json',SCOPE['manifestMaxBytes'],label='runtime-manifest.json')
        raw = base64.b64decode(output['manifest']['base64']); m,nodes,metas = validate_manifest(raw)
        output['artifactContract'] = reader.read(parent,'artifact-contract.json',65536,label='artifact-contract.json'); need(base64.b64decode(output['artifactContract']['base64']) == supplied,'R33_PG4_FW_CONTRACT_BYTES_CHANGED')
        root = reader.open_dir(parent,'runtime',m['rootStat']); reader.phase = 'ALIAS_RESOLUTION'
        resolve = lambda path: resolve_manifest(path,nodes,lambda p,e:reader.visit(root,p,e,metas))
        bindings, cli = package_bindings(nodes,resolve); selected = []
        for name, package in bindings.items():
            selected.extend((path,name) for path,e in nodes.items() if path.startswith(package+'/') and e['type'] == 'file' and (path == package+'/package.json' or path.endswith(('.js','.mjs','.cjs'))))
        need(len(selected) <= SCOPE['packageEnvelopeMaxFiles'] and len({p for p,_ in selected}) == len(selected) and sum(nodes[p]['bytes'] for p,_ in selected) <= SCOPE['packageEnvelopeMaxBytes'] and cli in {p for p,_ in selected},'R33_PG4_FW_PACKAGE_ENVELOPE_LIMIT')
        packages = {}
        for path,name in sorted(selected):
            resolved = resolve(path); need(resolved == path and nodes[path]['type'] == 'file','R33_PG4_FW_SELECTED_PATH_CHANGED')
            limit = SCOPE['packageJSONMaxBytes'] if path.endswith('/package.json') else SCOPE['codeFileMaxBytes']; need(nodes[path]['bytes'] <= limit,'R33_PG4_FW_SELECTED_FILE_LIMIT')
            directory = reader.parent(root,path,metas); row = reader.read(directory,path.rsplit('/',1)[-1],limit,{**nodes[path],'metadata':metas[path]},path); row['packageRole'] = name; output['files'].append(row)
            if path == bindings[name]+'/package.json':
                package = decode(base64.b64decode(row['base64'])); need(package.get('name') == {'vitest':'vitest','runner':'@vitest/runner','utils':'@vitest/utils'}[name] and package.get('version') == '2.1.9','R33_PG4_FW_PACKAGE_IDENTITY_CHANGED'); packages[name] = {'path':path,'sha256':row['sha256'],'bytes':row['bytes'],'name':package['name'],'version':package['version']}
        need(set(packages) == set(bindings), 'R33_PG4_FW_PACKAGE_JSON_MISSING'); reader.phase = 'FINAL_METADATA'
        for path,record in reader.trace.items():
            directory = reader.parent(root,path,metas); name = path.rsplit('/',1)[-1]; need(metadata(os.stat(name,dir_fd=directory,follow_symlinks=False)) == record['metadata'],'R33_PG4_FW_TRAVERSED_FINAL_CHANGED')
            if record['type'] == 'symlink': need(os.readlink(name,dir_fd=directory) == record['target'],'R33_PG4_FW_LINK_FINAL_CHANGED')
        for name,record in [('runtime-manifest.json',output['manifest']),('artifact-contract.json',output['artifactContract'])]:
            # No third byte traversal: verify held/named receipt metadata after the existing two byte reads.
            need(metadata(os.stat(name,dir_fd=parent,follow_symlinks=False)) == record['metadata'],'R33_PG4_FW_RECEIPT_FINAL_CHANGED')
        reader.check_dirs(); need(time.monotonic()-start < 30,'R33_PG4_FW_DEADLINE')
        output.update({'programSHA256':p['programSHA256'],'scope':SCOPE,'selectedPackageBindings':bindings,'packageIdentities':packages,'selectedCLI':cli,'selectedFiles':len(selected),'selectedBytes':sum(nodes[path]['bytes'] for path,_ in selected),'runtimeRootIdentity':m['identity'],'manifestSelfConsistency':True,'manifestPinned':True,'manifestTreeSHA256':m['treeSHA256'],'manifestMetadataSHA256':m['metadataSHA256'],'manifestOriginalIntegerDomainPreserved':True,'selectedTwoReadsStable':True,'readComplete':True,'selectedBytesQualified':True})
    except BaseException as e:
        primary = e
        if reader.first is None: reader.error(e)
    finally:
        try: reader.finish()
        except BaseException as e:
            if primary is None: primary=e
    output.update({'firstClosedError':reader.first,'secondaryClosedErrors':reader.secondary,'partialEvidence':reader.partial,'traversalEvidence':list(reader.trace.values()),'allReaderDescriptorsClosed':not reader.fds and not reader.file_fds and not reader.close_unresolved,'frameworkExecuted':False,'candidateExecuted':False,'mutationsPerformed':False,'modelsInvoked':False,'elapsedSeconds':time.monotonic()-start})
    if primary is not None or reader.first is not None or not output['allReaderDescriptorsClosed']: output['readComplete']=output['selectedBytesQualified']=False
    need(len(compact(output)) <= SCOPE['transportCombinedMaxBytes'],'R33_PG4_FW_SERIALIZED_OUTPUT_LIMIT')
    return output

if __name__ == '__main__':
    print(compact(run(p)).decode())
