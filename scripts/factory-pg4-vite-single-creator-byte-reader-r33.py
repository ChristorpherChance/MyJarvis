"""One fixed Vite chunk, original bytes only. No package or candidate code executes."""
import base64
import hashlib
import json
import os
import posixpath
import re
import stat
import sys
import time

SCOPE = {
    "schemaVersion": 1, "kind": "r33-pg4-vite-single-creator-byte-fixed-scope",
    "protocol": "PG4_VITE_SINGLE_CREATOR_BYTE_R33_V1",
    "fixedPhysicalRoot": "/var/lib/jarvis-development/101/r32-truth-artifacts/9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3/runtime",
    "rootIdentity": {"device": 66306, "inode": 7924569}, "logicalManifestRoot": "/work",
    "frozenContractSHA256": "27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71",
    "manifestSHA256": "b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7",
    "manifestBytes": 18197751,
    "aliasPath": "source/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.4_terser@5.51.2/node_modules/vite",
    "aliasTarget": "../../vite@5.4.21_@types+node@22.20.4_terser@5.51.2/node_modules/vite",
    "physicalPackageRoot": "source/node_modules/.pnpm/vite@5.4.21_@types+node@22.20.4_terser@5.51.2/node_modules/vite",
    "selectedPath": "source/node_modules/.pnpm/vite@5.4.21_@types+node@22.20.4_terser@5.51.2/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js",
    "selectedSHA256": "bfa94186daff535fefdf286088c1588fad6b02c01ef11cd3b42a6cb3e4c90767",
    "selectedBytes": 2086035,
    "limits": {"programAlarmSeconds": 30, "sshTimeoutSeconds": 45, "maximumRootCalls": 1,
               "localSourceInputMaxBytes": 67108864, "inputEnvelopeMaxBytes": 33554432,
               "leafMaxBytes": 4194304, "serializedResponseMaxBytes": 8388608,
               "combinedWireMaxBytes": 8388608, "privatePacketMaxBytes": 16777216,
               "maximumSelectedFiles": 1, "automaticRetry": False},
}


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
        need(k not in v, "R33_VITE_DUPLICATE_JSON")
        v[k] = x
    return v


def decode(raw):
    return json.loads(raw, object_pairs_hook=duplicates,
                      parse_constant=lambda _: need(False, "R33_VITE_NONFINITE_JSON"))


def selected_inputs(p):
    need(type(p) is dict and set(p) == {"scope", "programSHA256", "contractRawBase64", "manifestRawBase64"}
         and p["scope"] == SCOPE and type(p["programSHA256"]) is str
         and re.fullmatch("[a-f0-9]{64}", p["programSHA256"]), "R33_VITE_PARAMETERS_REQUIRED")
    contract_raw = base64.b64decode(p["contractRawBase64"], validate=True)
    manifest_raw = base64.b64decode(p["manifestRawBase64"], validate=True)
    need(digest(contract_raw) == SCOPE["frozenContractSHA256"]
         and digest(manifest_raw) == SCOPE["manifestSHA256"]
         and len(manifest_raw) == SCOPE["manifestBytes"], "R33_VITE_ORIGINAL_INPUT_CHANGED")
    contract, manifest = decode(contract_raw), decode(manifest_raw)
    need(contract["root"] == SCOPE["fixedPhysicalRoot"] and manifest["root"] == SCOPE["logicalManifestRoot"]
         and manifest["identity"] == SCOPE["rootIdentity"], "R33_VITE_ROOT_DOMAIN_CHANGED")
    # This is a pinned, previously audited raw input. Only selected paths/ancestors are extracted.
    # No new whole tree/metadata digest or package export graph is reconstructed.
    required = {SCOPE["aliasPath"], SCOPE["selectedPath"]}
    for path in tuple(required):
        parts = path.split("/")
        required.update("/".join(parts[:i]) for i in range(1, len(parts)))
    entries = {r["path"]: r for r in manifest["entries"] if r["path"] in required}
    metas = {r[0]: r[1:] for r in manifest["metadata"] if r[0] in required}
    need(set(entries) == required == set(metas) and type(manifest["rootStat"]) is list
         and len(manifest["rootStat"]) == 9, "R33_VITE_SELECTED_MANIFEST_ROWS_MISSING")
    need(entries[SCOPE["selectedPath"]] == {"path": SCOPE["selectedPath"], "type": "file",
         "sha256": SCOPE["selectedSHA256"], "bytes": SCOPE["selectedBytes"]}
         and entries[SCOPE["aliasPath"]] == {"path": SCOPE["aliasPath"], "type": "symlink",
         "target": SCOPE["aliasTarget"]}, "R33_VITE_SELECTED_MANIFEST_ROW_CHANGED")
    for path in required:
        need(len(metas[path]) == 9 and all(type(x) is int and x >= 0 for x in metas[path]),
             "R33_VITE_METADATA_INTEGER_CHANGED")
        if path not in (SCOPE["selectedPath"], SCOPE["aliasPath"]):
            need(entries[path] == {"path": path, "type": "directory"}, "R33_VITE_ANCESTOR_TYPE_CHANGED")
    return manifest["rootStat"], entries, metas


class Reader:
    def __init__(self):
        self.phase = "PROFILE"
        self.first = None
        self.secondary = []
        self.fds = []
        self.directories = []
        self.cache = {}
        self.closed = []
        self.alias_frame = None
        self.leaf_frame = {"namedBefore": None, "heldBefore": None, "heldAfter": None, "namedAfter": None}
        self.partial = []
        self.selected = None
        self.complete = False

    def error(self, e, phase=None):
        text = str(e)
        row = {"phase": phase or self.phase,
               "code": text if re.fullmatch("R33_VITE_[A-Z0-9_]+", text) else "R33_VITE_OS_OR_PARSE_ERROR",
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
             and not stat.S_IMODE(before.st_mode) & 0o022, "R33_VITE_DIRECTORY_UNTRUSTED")
        if expected is not None:
            need(nine(before) == expected, "R33_VITE_DIRECTORY_MANIFEST_CHANGED")
        if (parent, name) in self.cache:
            fd = self.cache[(parent, name)]
            need(nine(os.fstat(fd)) == nine(before), "R33_VITE_DIRECTORY_CACHE_CHANGED")
            return fd
        fd = self.hold(os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                               dir_fd=parent), "directory")
        frame = {"fd": fd, "parent": parent, "name": name, "namedBefore": nine(before),
                 "heldBefore": nine(os.fstat(fd)), "heldAfter": None, "namedAfter": None}
        self.directories.append(frame)
        need(frame["heldBefore"] == frame["namedBefore"], "R33_VITE_DIRECTORY_REPLACED")
        self.cache[(parent, name)] = fd
        return fd

    def parent(self, root, path, metas):
        cursor, parts = root, []
        for name in path.split("/")[:-1]:
            parts.append(name)
            cursor = self.directory(cursor, name, metas["/".join(parts)])
        return cursor

    def read_leaf(self, parent, name, expected_nine):
        fd, first, body, size, second_offset, mismatch = None, None, None, 0, 0, None
        pieces = []
        try:
            self.phase = "LEAF_NAMED_BIND"
            before = os.stat(name, dir_fd=parent, follow_symlinks=False)
            self.leaf_frame["namedBefore"] = nine(before)
            need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
                 and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) in (0o444, 0o555)
                 and before.st_size == SCOPE["selectedBytes"] <= SCOPE["limits"]["leafMaxBytes"]
                 and nine(before) == expected_nine, "R33_VITE_LEAF_UNTRUSTED_OR_CHANGED")
            fd = self.hold(os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                                   dir_fd=parent), "selected-file")
            self.leaf_frame["heldBefore"] = nine(os.fstat(fd))
            need(self.leaf_frame["heldBefore"] == expected_nine, "R33_VITE_LEAF_REPLACED")
            self.phase = "LEAF_FIRST_READ"
            while True:
                block = os.read(fd, 65536)
                if not block:
                    break
                pieces.append(block)
                size += len(block)
                need(size <= SCOPE["selectedBytes"], "R33_VITE_LEAF_GREW")
            body = b"".join(pieces)
            need(len(body) == SCOPE["selectedBytes"] and digest(body) == SCOPE["selectedSHA256"],
                 "R33_VITE_LEAF_BYTES_CHANGED")
            need(nine(os.fstat(fd)) == nine(os.stat(name, dir_fd=parent, follow_symlinks=False)) == expected_nine,
                 "R33_VITE_LEAF_FIRST_METADATA_CHANGED")
            self.phase = "LEAF_SECOND_READ"
            os.lseek(fd, 0, os.SEEK_SET)
            while True:
                block = os.read(fd, 65536)
                if not block:
                    break
                if block != body[second_offset:second_offset + len(block)]:
                    mismatch = block
                    need(False, "R33_VITE_LEAF_SECOND_BYTES_CHANGED")
                second_offset += len(block)
            self.leaf_frame["heldAfter"] = nine(os.fstat(fd))
            self.leaf_frame["namedAfter"] = nine(os.stat(name, dir_fd=parent, follow_symlinks=False))
            need(second_offset == len(body) and all(x == expected_nine for x in self.leaf_frame.values()),
                 "R33_VITE_LEAF_SECOND_METADATA_CHANGED")
            self.selected = {"path": SCOPE["selectedPath"], "bytes": len(body), "sha256": digest(body),
                             "base64": base64.b64encode(body).decode(), "twoReadsStable": True}
        except BaseException as e:
            first = e
            self.error(e)
            raw = body if body is not None else b"".join(pieces)
            self.partial.append({"path": SCOPE["selectedPath"], "originalFirstReadBase64": base64.b64encode(raw).decode(),
                                 "originalFirstReadBytes": len(raw), "originalFirstReadSHA256": digest(raw),
                                 "secondMatchingPrefixBytes": second_offset,
                                 "secondMismatchBlockBase64": None if mismatch is None else base64.b64encode(mismatch).decode(),
                                 "namedBefore": self.leaf_frame["namedBefore"]})
            raise
        finally:
            # Closing is centralized: no finally-close can replace the primary read exception.
            # A successful first copy is retained in selected even if its later close fails.
            pass

    def observe(self, root_nine, entries, metas):
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0
             and sys.platform == "linux" and sys.flags.isolated == 1, "R33_VITE_PROFILE_UNTRUSTED")
        root = self.directory(None, "/")
        components = SCOPE["fixedPhysicalRoot"].split("/")[1:]
        for i, name in enumerate(components):
            root = self.directory(root, name, root_nine if i == len(components) - 1 else None)
        actual = os.fstat(root)
        need({"device": actual.st_dev, "inode": actual.st_ino} == SCOPE["rootIdentity"], "R33_VITE_ROOT_IDENTITY_CHANGED")
        self.phase = "ALIAS_BIND"
        parent = self.parent(root, SCOPE["aliasPath"], metas)
        name = SCOPE["aliasPath"].rsplit("/", 1)[-1]
        self.phase = "ALIAS_BIND"
        before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        self.alias_frame = {"path": SCOPE["aliasPath"], "namedBefore": nine(before), "target": None, "namedAfter": None}
        need(stat.S_ISLNK(before.st_mode) and nine(before) == metas[SCOPE["aliasPath"]], "R33_VITE_ALIAS_CHANGED")
        target = os.readlink(name, dir_fd=parent)
        self.alias_frame["target"] = target
        self.alias_frame["namedAfter"] = nine(os.stat(name, dir_fd=parent, follow_symlinks=False))
        normalized = posixpath.normpath(posixpath.join(posixpath.dirname(SCOPE["aliasPath"]), target))
        need(target == SCOPE["aliasTarget"] and normalized == SCOPE["physicalPackageRoot"]
             and not normalized.startswith("/") and all(x not in ("", ".", "..") for x in normalized.split("/"))
             and self.alias_frame["namedBefore"] == self.alias_frame["namedAfter"], "R33_VITE_ALIAS_TARGET_CHANGED")
        parent = self.parent(root, SCOPE["selectedPath"], metas)
        self.read_leaf(parent, SCOPE["selectedPath"].rsplit("/", 1)[-1], metas[SCOPE["selectedPath"]])
        self.phase = "FINAL_BIND"
        need(os.readlink(name, dir_fd=self.parent(root, SCOPE["aliasPath"], metas)) == target
             and nine(os.stat(name, dir_fd=self.parent(root, SCOPE["aliasPath"], metas), follow_symlinks=False)) == metas[SCOPE["aliasPath"]],
             "R33_VITE_ALIAS_FINAL_CHANGED")
        for row in reversed(self.directories):
            row["heldAfter"] = nine(os.fstat(row["fd"]))
            row["namedAfter"] = nine(os.stat(row["name"], dir_fd=row["parent"], follow_symlinks=False))
            need(row["namedBefore"] == row["heldBefore"] == row["heldAfter"] == row["namedAfter"], "R33_VITE_DIRECTORY_FINAL_CHANGED")
        self.complete = True

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
        return {"schemaVersion": 1, "kind": "r33-pg4-vite-single-creator-byte-observation", "scope": SCOPE,
                "protocol": SCOPE["protocol"], "programSHA256": program_hash,
                "readerProfile": {"uid": os.getuid(), "euid": os.geteuid(), "gid": os.getgid(), "egid": os.getegid(), "isolated": sys.flags.isolated},
                "readComplete": complete, "selectedBytesQualified": complete, "selectedFiles": 1 if self.selected else 0,
                "selected": self.selected, "leafMetadata": self.leaf_frame, "aliasMetadata": self.alias_frame,
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
