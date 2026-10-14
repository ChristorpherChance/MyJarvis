"""Exact adjacent mocker declaration/entry and one standalone reexport byte source. No package code executes."""
import base64
import hashlib
import json
import os
import posixpath
import re
import stat
import sys
import time

SCOPE = {'schemaVersion': 1, 'kind': 'r33-pg4-mocker-node-byte-fixed-scope', 'protocol': 'PG4_MOCKER_NODE_BYTE_R33_V1', 'fixedPhysicalRoot': '/var/lib/jarvis-development/101/r32-truth-artifacts/9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3/runtime', 'rootIdentity': {'device': 66306, 'inode': 7924569}, 'logicalManifestRoot': '/work', 'frozenContractSHA256': '27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71', 'manifestSHA256': 'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7', 'manifestBytes': 18197751, 'limits': {'programAlarmSeconds': 30, 'sshTimeoutSeconds': 45, 'maximumRootCalls': 1, 'localSourceInputMaxBytes': 67108864, 'inputEnvelopeMaxBytes': 33554432, 'leafMaxBytes': 4194304, 'serializedResponseMaxBytes': 8388608, 'combinedWireMaxBytes': 8388608, 'privatePacketMaxBytes': 16777216, 'maximumSelectedFiles': 3, 'automaticRetry': False, 'packageJSONMaxBytes': 65536, 'selectedTotalMaxBytes': 4194304}, 'aliases': [{'path': 'source/apps/server/node_modules/vitest', 'target': '../../../node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vitest', 'normalizedTarget': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vitest'}, {'path': 'source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/@vitest/mocker', 'target': '../../../@vitest+mocker@2.1.9_vite@5.4.21_@types+node@22.20.4_terser@5.51.2_/node_modules/@vitest/mocker', 'normalizedTarget': 'source/node_modules/.pnpm/@vitest+mocker@2.1.9_vite@5.4.21_@types+node@22.20.4_terser@5.51.2_/node_modules/@vitest/mocker'}], 'physicalPackageRoot': 'source/node_modules/.pnpm/@vitest+mocker@2.1.9_vite@5.4.21_@types+node@22.20.4_terser@5.51.2_/node_modules/@vitest/mocker', 'packageJSON': {'path': 'source/node_modules/.pnpm/@vitest+mocker@2.1.9_vite@5.4.21_@types+node@22.20.4_terser@5.51.2_/node_modules/@vitest/mocker/package.json', 'sha256': '86c5c603dcafb8f363d48e87df795568c9c1325b4c8f9c5834c5a5dad3338414', 'bytes': 1897}, 'specifier': '@vitest/mocker/node', 'requiredFactoryExports': ['hoistMocksPlugin', 'automockPlugin']}


def need(v, code):
    if not v:
        raise RuntimeError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def nine(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def compact(v):
    return json.dumps(v, separators=(",", ":")).encode()


def duplicates(pairs):
    v = {}
    for k, x in pairs:
        need(k not in v, "R33_MOCKER_DUPLICATE_JSON")
        v[k] = x
    return v


def decode(raw):
    return json.loads(raw, object_pairs_hook=duplicates,
                      parse_constant=lambda _: need(False, "R33_MOCKER_NONFINITE_JSON"))


def selected_inputs(p):
    need(type(p) is dict and set(p)=={'scope','programSHA256','contractRawBase64','manifestRawBase64'} and p['scope']==SCOPE and type(p['programSHA256']) is str and re.fullmatch('[a-f0-9]{64}',p['programSHA256']),'R33_MOCKER_PARAMETERS_REQUIRED')
    contract_raw=base64.b64decode(p['contractRawBase64'],validate=True);manifest_raw=base64.b64decode(p['manifestRawBase64'],validate=True)
    need(digest(contract_raw)==SCOPE['frozenContractSHA256'] and digest(manifest_raw)==SCOPE['manifestSHA256'] and len(manifest_raw)==SCOPE['manifestBytes'],'R33_MOCKER_ORIGINAL_INPUT_CHANGED')
    contract,manifest=decode(contract_raw),decode(manifest_raw)
    need(contract['root']==SCOPE['fixedPhysicalRoot'] and manifest['root']==SCOPE['logicalManifestRoot'] and manifest['identity']==SCOPE['rootIdentity'] and type(manifest['rootStat']) is list and len(manifest['rootStat'])==9,'R33_MOCKER_ROOT_DOMAIN_CHANGED')
    # The fixed saved raw manifest is input data, not a new whole-tree revalidation.
    entries={r['path']:r for r in manifest['entries']};metas={r[0]:r[1:] for r in manifest['metadata']}
    for alias in SCOPE['aliases']:
        need(entries.get(alias['path'])=={'path':alias['path'],'type':'symlink','target':alias['target']},'R33_MOCKER_ALIAS_ROW_CHANGED')
    need(entries.get(SCOPE['packageJSON']['path'])=={'path':SCOPE['packageJSON']['path'],'type':'file','sha256':SCOPE['packageJSON']['sha256'],'bytes':SCOPE['packageJSON']['bytes']},'R33_MOCKER_PACKAGE_ROW_CHANGED')
    return manifest['rootStat'],entries,metas


def selected_row(path,entries,metas):
    need(type(path) is str and path.startswith(SCOPE['physicalPackageRoot']+'/') and all(x not in ('','.','..') for x in path.split('/')),'R33_MOCKER_PATH_ESCAPE')
    row=entries.get(path);need(type(row) is dict and set(row)=={'path','type','sha256','bytes'} and row['type']=='file' and row['path']==path and re.fullmatch('[a-f0-9]{64}',row['sha256']) and type(row['bytes']) is int and 0<=row['bytes']<=SCOPE['limits']['leafMaxBytes'],'R33_MOCKER_FILE_ROW_CHANGED')
    paths=[path]+['/'.join(path.split('/')[:i]) for i in range(1,len(path.split('/')))]
    for name in paths:
        m=metas.get(name);need(type(m) is list and len(m)==9 and all(type(x) is int and x>=0 for x in m),'R33_MOCKER_METADATA_INTEGER_CHANGED')
        if name!=path:need(entries.get(name)=={'path':name,'type':'directory'},'R33_MOCKER_ANCESTOR_TYPE_CHANGED')
    return row


def declared_node_target(package):
    need(type(package) is dict and package.get('name')=='@vitest/mocker' and type(package.get('exports')) is dict and './node' in package['exports'],'R33_MOCKER_NODE_EXPORT_MISSING')
    def choose(value,depth=0):
        need(depth<16,'R33_MOCKER_EXPORT_DEPTH')
        if type(value) is str:return value
        need(type(value) is dict and len(value)>0,'R33_MOCKER_EXPORT_SHAPE_UNKNOWN')
        for condition,branch in value.items():
            need(type(condition) is str and condition in ('node','import','default','types','require','browser'),'R33_MOCKER_EXPORT_CONDITION_UNKNOWN')
            if condition in ('node','import','default'):return choose(branch,depth+1)
        need(False,'R33_MOCKER_EXPORT_NO_ACTIVE_LITERAL')
    value=choose(package['exports']['./node'])
    need(re.fullmatch(r'\./[A-Za-z0-9_./-]+\.(?:js|mjs|cjs)',value) is not None and all(x not in ('','.','..') for x in value[2:].split('/')),'R33_MOCKER_EXPORT_TARGET_UNKNOWN')
    return value


def unique_standalone_reexport(raw):
    # This bounded branch accepts only an entire named-reexport data module.
    # Mixed executable source is returned as the entry; it is not interpreted to invent dependencies.
    text=raw.decode('utf-8','strict').strip();text=re.sub(r'^\s*/\*.*?\*/\s*','',text,flags=re.S)
    if not text.startswith('export '):return None
    pattern=re.compile(r"export\s*\{([^{}]*)\}\s*from\s*(['\"])(\./[A-Za-z0-9_./-]+\.(?:js|mjs|cjs))\2\s*;?")
    cursor=0;targets={};recognized=False
    while cursor<len(text):
        if text[cursor:].strip().startswith('//# sourceMappingURL='):break
        m=pattern.match(text,cursor)
        if m is None:
            if recognized:need(False,'R33_MOCKER_REEXPORT_MODULE_UNKNOWN')
            return None
        recognized=True
        for piece in m[1].split(','):
            piece=piece.strip()
            if not piece:continue
            item=re.fullmatch(r'([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?',piece)
            need(item is not None,'R33_MOCKER_REEXPORT_BINDING_UNKNOWN')
            name=item[2] or item[1]
            if name in SCOPE['requiredFactoryExports']:
                need(name not in targets,'R33_MOCKER_REEXPORT_DUPLICATE');targets[name]=m[3]
        cursor=m.end()
        while cursor<len(text) and text[cursor].isspace():cursor+=1
    if not recognized:return None
    need(set(targets)==set(SCOPE['requiredFactoryExports']) and len(set(targets.values()))==1,'R33_MOCKER_REEXPORT_FACTORIES_UNKNOWN')
    return next(iter(targets.values()))


class Reader:
    def __init__(self):
        self.phase = "PROFILE"
        self.first = None
        self.secondary = []
        self.fds = []
        self.directories = []
        self.cache = {}
        self.closed = []
        self.alias_frames = []
        self.leaf_frame = {"namedBefore": None, "heldBefore": None, "heldAfter": None, "namedAfter": None}
        self.partial = []
        self.selected = []
        self.complete = False
        self.declaration = None
        self.total_selected = 0

    def error(self, e, phase=None):
        text = str(e)
        row = {"phase": phase or self.phase,
               "code": text if re.fullmatch("R33_MOCKER_[A-Z0-9_]+", text) else "R33_MOCKER_OS_OR_PARSE_ERROR",
               "errno": getattr(e, "errno", None)}
        if self.first is None:
            self.first = row
        else:
            self.secondary.append(row)

    def hold(self, fd, role):
        self.fds.append((fd, role))
        return fd

    def directory(self, parent, name, expected=None):
        self.phase = "DIRECTORY_BIND"
        before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
             and not stat.S_IMODE(before.st_mode) & 0o022, "R33_MOCKER_DIRECTORY_UNTRUSTED")
        if expected is not None:
            need(nine(before) == expected, "R33_MOCKER_DIRECTORY_MANIFEST_CHANGED")
        if (parent, name) in self.cache:
            fd = self.cache[(parent, name)]
            need(nine(os.fstat(fd)) == nine(before), "R33_MOCKER_DIRECTORY_CACHE_CHANGED")
            return fd
        fd = self.hold(os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                               dir_fd=parent), "directory")
        frame = {"fd": fd, "parent": parent, "name": name, "namedBefore": nine(before),
                 "heldBefore": nine(os.fstat(fd)), "heldAfter": None, "namedAfter": None}
        self.directories.append(frame)
        need(frame["heldBefore"] == frame["namedBefore"], "R33_MOCKER_DIRECTORY_REPLACED")
        self.cache[(parent, name)] = fd
        return fd

    def parent(self, root, path, metas):
        cursor, parts = root, []
        for name in path.split("/")[:-1]:
            parts.append(name)
            cursor = self.directory(cursor, name, metas["/".join(parts)])
        return cursor

    def read_leaf(self, parent, path, row, expected_nine):
        name=path.rsplit("/",1)[-1]
        self.leaf_frame={"namedBefore":None,"heldBefore":None,"heldAfter":None,"namedAfter":None}
        frame=self.leaf_frame
        fd, first, body, size, second_offset, mismatch = None, None, None, 0, 0, None
        pieces = []
        try:
            need(len(self.selected)<SCOPE["limits"]["maximumSelectedFiles"] and self.total_selected+row["bytes"]<=SCOPE["limits"]["selectedTotalMaxBytes"],"R33_MOCKER_SELECTED_TOTAL_LIMIT")
            self.phase = "LEAF_NAMED_BIND"
            before = os.stat(name, dir_fd=parent, follow_symlinks=False)
            self.leaf_frame["namedBefore"] = nine(before)
            need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
                 and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) in (0o444, 0o555)
                 and before.st_size == row["bytes"] <= SCOPE["limits"]["leafMaxBytes"]
                 and nine(before) == expected_nine, "R33_MOCKER_LEAF_UNTRUSTED_OR_CHANGED")
            fd = self.hold(os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                                   dir_fd=parent), "selected-file")
            self.leaf_frame["heldBefore"] = nine(os.fstat(fd))
            need(self.leaf_frame["heldBefore"] == expected_nine, "R33_MOCKER_LEAF_REPLACED")
            self.phase = "LEAF_FIRST_READ"
            while True:
                block = os.read(fd, 65536)
                if not block:
                    break
                pieces.append(block)
                size += len(block)
                need(size <= row["bytes"], "R33_MOCKER_LEAF_GREW")
            body = b"".join(pieces)
            need(len(body) == row["bytes"] and digest(body) == row["sha256"],
                 "R33_MOCKER_LEAF_BYTES_CHANGED")
            need(nine(os.fstat(fd)) == nine(os.stat(name, dir_fd=parent, follow_symlinks=False)) == expected_nine,
                 "R33_MOCKER_LEAF_FIRST_METADATA_CHANGED")
            self.phase = "LEAF_SECOND_READ"
            os.lseek(fd, 0, os.SEEK_SET)
            while True:
                block = os.read(fd, 65536)
                if not block:
                    break
                if block != body[second_offset:second_offset + len(block)]:
                    mismatch = block
                    need(False, "R33_MOCKER_LEAF_SECOND_BYTES_CHANGED")
                second_offset += len(block)
            self.leaf_frame["heldAfter"] = nine(os.fstat(fd))
            self.leaf_frame["namedAfter"] = nine(os.stat(name, dir_fd=parent, follow_symlinks=False))
            need(second_offset == len(body) and all(x == expected_nine for x in self.leaf_frame.values()),
                 "R33_MOCKER_LEAF_SECOND_METADATA_CHANGED")
            self.selected.append({"path": path, "bytes": len(body), "sha256": digest(body),
                             "base64": base64.b64encode(body).decode(), "twoReadsStable": True,"metadata":frame.copy()})
            self.total_selected+=len(body)
            return body
        except BaseException as e:
            first = e
            self.error(e)
            raw = body if body is not None else b"".join(pieces)
            self.partial.append({"path": path, "originalFirstReadBase64": base64.b64encode(raw).decode(),
                                 "originalFirstReadBytes": len(raw), "originalFirstReadSHA256": digest(raw),
                                 "secondMatchingPrefixBytes": second_offset,
                                 "secondMismatchBlockBase64": None if mismatch is None else base64.b64encode(mismatch).decode(),
                                 "namedBefore": self.leaf_frame["namedBefore"]})
            raise
        finally:
            # Closing is centralized: no finally-close can replace the primary read exception.
            # A successful first copy is retained in selected even if its later close fails.
            pass

    def observe(self,root_nine,entries,metas):
        need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.platform=='linux' and sys.flags.isolated==1,'R33_MOCKER_PROFILE_UNTRUSTED')
        root=self.directory(None,'/')
        components=SCOPE['fixedPhysicalRoot'].split('/')[1:]
        for i,name in enumerate(components):root=self.directory(root,name,root_nine if i==len(components)-1 else None)
        actual=os.fstat(root);need({'device':actual.st_dev,'inode':actual.st_ino}==SCOPE['rootIdentity'],'R33_MOCKER_ROOT_IDENTITY_CHANGED')
        for alias in SCOPE['aliases']:
            self.phase='ALIAS_BIND';parent=self.parent(root,alias['path'],metas);name=alias['path'].rsplit('/',1)[-1];before=os.stat(name,dir_fd=parent,follow_symlinks=False)
            frame={'path':alias['path'],'namedBefore':nine(before),'target':None,'namedAfter':None};self.alias_frames.append(frame)
            need(stat.S_ISLNK(before.st_mode) and nine(before)==metas[alias['path']],'R33_MOCKER_ALIAS_CHANGED');target=os.readlink(name,dir_fd=parent);frame['target']=target;frame['namedAfter']=nine(os.stat(name,dir_fd=parent,follow_symlinks=False))
            normalized=posixpath.normpath(posixpath.join(posixpath.dirname(alias['path']),target));need(target==alias['target'] and normalized==alias['normalizedTarget'] and not normalized.startswith('/') and all(x not in ('','.','..') for x in normalized.split('/')) and frame['namedBefore']==frame['namedAfter'],'R33_MOCKER_ALIAS_TARGET_CHANGED')
        path=SCOPE['packageJSON']['path'];row=selected_row(path,entries,metas);need(row['bytes']<=SCOPE['limits']['packageJSONMaxBytes'],'R33_MOCKER_PACKAGE_JSON_LIMIT');package_raw=self.read_leaf(self.parent(root,path,metas),path,row,metas[path])
        target=declared_node_target(decode(package_raw));path=SCOPE['physicalPackageRoot']+'/'+target[2:];self.declaration={'specifier':SCOPE['specifier'],'declaredTarget':target,'entryPath':path,'selectionMethod':'literal-package-node-import-default-declaration-data-not-Node-resolution','chunkTarget':None,'chunkPath':None}
        row=selected_row(path,entries,metas);entry_raw=self.read_leaf(self.parent(root,path,metas),path,row,metas[path]);chunk=unique_standalone_reexport(entry_raw)
        if chunk is not None:
            path=posixpath.normpath(posixpath.join(posixpath.dirname(path),chunk));need(path not in [x['path'] for x in self.selected],'R33_MOCKER_REEXPORT_CYCLE');row=selected_row(path,entries,metas);self.declaration['chunkTarget']=chunk;self.declaration['chunkPath']=path;self.read_leaf(self.parent(root,path,metas),path,row,metas[path])
        self.phase='FINAL_BIND'
        for alias,frame in zip(SCOPE['aliases'],self.alias_frames):
            parent=self.parent(root,alias['path'],metas);name=alias['path'].rsplit('/',1)[-1];need(os.readlink(name,dir_fd=parent)==alias['target'] and nine(os.stat(name,dir_fd=parent,follow_symlinks=False))==frame['namedBefore']==frame['namedAfter'],'R33_MOCKER_ALIAS_FINAL_CHANGED')
        for row in self.directories:
            row['heldAfter']=nine(os.fstat(row['fd']));row['namedAfter']=nine(os.stat(row['name'],dir_fd=row['parent'],follow_symlinks=False));need(row['namedBefore']==row['heldBefore']==row['heldAfter']==row['namedAfter'],'R33_MOCKER_DIRECTORY_FINAL_CHANGED')
        self.complete=True

    def close_all(self):
        for fd, role in reversed(self.fds):
            try:
                os.close(fd)
                self.closed.append({"fd": fd, "role": role, "closed": True})
            except BaseException as e:
                self.closed.append({"fd": fd, "role": role, "closed": False})
                self.error(e, "DESCRIPTOR_CLOSE")

    def result(self, program_hash, start):
        all_closed = len(self.closed) == len(self.fds) and all(x["closed"] for x in self.closed)
        complete = self.complete and all_closed and self.first is None
        dirs = [{k: v for k, v in x.items() if k not in ("fd", "parent", "name")} for x in self.directories]
        return {"schemaVersion": 1, "kind": "r33-pg4-mocker-node-byte-observation", "scope": SCOPE,
                "protocol": SCOPE["protocol"], "programSHA256": program_hash,
                "readerProfile": {"uid": os.getuid(), "euid": os.geteuid(), "gid": os.getgid(), "egid": os.getegid(), "isolated": sys.flags.isolated},
                "readComplete": complete, "selectedBytesQualified": complete, "selectedFiles": len(self.selected),
                "selected": self.selected, "leafMetadata": [x["metadata"] for x in self.selected], "aliasMetadata": self.alias_frames, "declaration":self.declaration,
                "trustedDirectoryFrames": dirs, "originalPythonIntegerDomain": True,
                "allDescriptorsClosed": all_closed, "descriptorCloseEvents": self.closed,
                "firstClosedError": self.first, "secondaryClosedErrors": self.secondary, "partialReads": self.partial,
                "elapsedMonotonicSeconds": time.monotonic() - start, "wholeRuntimeRead": False,
                "wholeManifestRevalidated": False, "frameworkExecuted": False, "candidateExecuted": False,
                "actualModuleResolutionExecuted": False, "pluginCreatorQualified": False,
                "effectiveConfigurationQualified": False, "frameworkABIQualified": False, "PG4Qualified": False,
                "PGManifestRead": False, "mutationsPerformed": False, "modelsInvoked": False}


def run(payload=None):
    root_nine, entries, metas = selected_inputs(payload)  # Invalid inputs refuse before filesystem/profile work.
    start, reader = time.monotonic(), Reader()
    try:
        reader.observe(root_nine, entries, metas)
    except BaseException as e:
        if reader.first is None:
            reader.error(e)
    finally:
        reader.close_all()
    return reader.result(payload["programSHA256"], start)
