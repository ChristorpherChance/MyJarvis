"""Prepared exact Root-private manifest byte reader; stdlib data only, no default IO."""
import base64
import hashlib
import json
import os
import platform
import signal
import stat
import sys
import time

SCOPE = {'schemaVersion': 1, 'kind': 'r33-pg4-private-pg-manifest-byte-fixed-scope', 'protocol': 'PG4_PG_PRIVATE_MANIFEST_BYTES_R33_V1', 'parentPath': '/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855', 'runtimeName': 'runtime', 'runtimeRootIdentity': {'device': 66306, 'inode': 6863174}, 'leafName': 'runtime-manifest.json', 'expectedContentSHA256': 'd916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1', 'privateLeafPolicy': {'regularFile': True, 'uid': 0, 'gid': 0, 'mode': 384, 'nlink': 1, 'exactSize': 35825}, 'basisTupleSHA256': '899b023db2f124d39c1a8b5a1e8e9400d29a2a3fcbcee63f2a79f5951efb4852', 'basisTupleBytes': 73, 'basisStdoutSHA256': 'e3e2b92122a0d312c7a9cb3e5cbf95051bb8f44854873f1c1d4d6395e3558ec3', 'basisStdoutBytes': 6000, 'basisTupleSpan': {'startByte': 1064, 'endByte': 1137}, 'limits': {'programAlarmSeconds': 8, 'sshTimeoutSeconds': 15, 'maximumRootCalls': 1, 'leafReadMaxBytes': 65536, 'inputMaxBytes': 131072, 'serializedResponseMaxBytes': 262144, 'combinedWireMaxBytes': 262144, 'privatePacketMaxBytes': 524288, 'automaticRetry': False}}

def need(value, code):
    if not value:
        raise RuntimeError(code)


def nine(st):
    return [st.st_dev, st.st_ino, st.st_uid, st.st_gid, st.st_mode, st.st_nlink,
            st.st_size, st.st_mtime_ns, st.st_ctime_ns]


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def closed_error(error, phase):
    cls = type(error).__name__
    code = str(error) if isinstance(error, RuntimeError) else "R33_PG_PRIVATE_METADATA_OS_ERROR"
    if not code.startswith("R33_PG_PRIVATE_"):
        code = "R33_PG_PRIVATE_METADATA_INTERNAL_ERROR"
    return {"phase": phase, "code": code, "errno": getattr(error, "errno", None),
            "exceptionClass": cls if cls in ("RuntimeError", "OSError", "FileNotFoundError",
                                             "PermissionError", "NotADirectoryError") else "OtherError"}



def checked_basis(payload):
    need(type(payload) is dict and set(payload) == {"scope", "programSHA256", "basisTupleRawBase64", "metadataStdoutRawBase64"}
         and payload["scope"] == SCOPE and type(payload["programSHA256"]) is str
         and len(payload["programSHA256"]) == 64 and all(x in "0123456789abcdef" for x in payload["programSHA256"]),
         "R33_PG_PRIVATE_SOURCE_INPUT_REQUIRED")
    raw = base64.b64decode(payload["basisTupleRawBase64"], validate=True)
    parent = base64.b64decode(payload["metadataStdoutRawBase64"], validate=True)
    need(len(raw) == SCOPE["basisTupleBytes"] and hashlib.sha256(raw).hexdigest() == SCOPE["basisTupleSHA256"]
         and len(parent) == SCOPE["basisStdoutBytes"] and hashlib.sha256(parent).hexdigest() == SCOPE["basisStdoutSHA256"]
         and parent[SCOPE["basisTupleSpan"]["startByte"]:SCOPE["basisTupleSpan"]["endByte"]] == raw,
         "R33_PG_PRIVATE_BASIS_BYTES_CHANGED")
    basis, metadata = json.loads(raw), json.loads(parent)
    need(type(basis) is list and len(basis) == 9 and all(type(x) is int for x in basis)
         and all(metadata["leafMetadata"][k] == basis for k in ("namedBefore", "heldBefore", "heldAfter", "namedAfter"))
         and metadata["metadataReadComplete"] is True and metadata["currentMetadataObservationQualified"] is True
         and metadata["runtimeRootIdentity"] == SCOPE["runtimeRootIdentity"], "R33_PG_PRIVATE_BASIS_DOMAIN_CHANGED")
    return basis


def private_predicates(st, basis):
    return {"regularFile": stat.S_ISREG(st.st_mode), "ownerUID0": st.st_uid == 0,
            "ownerGID0": st.st_gid == 0, "singleHardLink": st.st_nlink == 1,
            "privateMode0600": stat.S_IMODE(st.st_mode) == 0o600,
            "exactSize35825": st.st_size == 35825, "originalBasisTupleEqual": nine(st) == basis}


class Observer:
    def __init__(self, basis):
        self.basis = basis
        self.phase = "PROFILE"
        self.descriptors = []
        self.directories = []
        self.close_events = []
        self.first_error = None
        self.secondary_errors = []
        self.leaf = {"namedBefore": None, "heldBefore": None, "heldAfter": None, "namedAfter": None}
        self.predicates = None
        self.runtime_identity = None
        self.binding_complete = False
        self.first_bytes = b""
        self.content_hash = None
        self.second_equal = False
        self.second_compared_bytes = 0
        self.mismatch = None

    def hold(self, fd, role):
        # FD 0 is a real descriptor and must be tracked and closed.
        self.descriptors.append((fd, role))
        return fd

    def directory(self, parent_fd, name, role):
        self.phase = "DIRECTORY_BIND"
        before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
             and stat.S_IMODE(before.st_mode) & 0o022 == 0, "R33_PG_PRIVATE_DIRECTORY_UNTRUSTED")
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        fd = self.hold(os.open(name, flags, dir_fd=parent_fd), role)
        held = os.fstat(fd)
        row = {"role": role, "parentFD": parent_fd, "name": name, "fd": fd,
               "namedBefore": nine(before), "heldBefore": nine(held), "heldAfter": None, "namedAfter": None}
        self.directories.append(row)
        need(nine(before) == nine(held), "R33_PG_PRIVATE_DIRECTORY_CHANGED")
        return fd

    def observe(self):
        need(platform.system() == "Linux" and os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0
             and sys.flags.isolated == 1, "R33_PG_PRIVATE_PROFILE_UNTRUSTED")
        remaining = signal.getitimer(signal.ITIMER_REAL)[0]
        need(0 < remaining <= 8, "R33_PG_PRIVATE_PARENT_TIMER_REQUIRED")
        need(hasattr(os, "O_NOFOLLOW") and hasattr(os, "O_NONBLOCK"), "R33_PG_PRIVATE_NOFOLLOW_UNSUPPORTED")
        cursor = self.directory(None, "/", "filesystem-root")
        for index, component in enumerate(SCOPE["parentPath"].split("/")[1:]):
            cursor = self.directory(cursor, component, "parent-component-" + str(index))
        parent_fd = cursor
        runtime_fd = self.directory(parent_fd, SCOPE["runtimeName"], "fixed-runtime-root")
        runtime = os.fstat(runtime_fd)
        self.runtime_identity = {"device": runtime.st_dev, "inode": runtime.st_ino}
        need(self.runtime_identity == SCOPE["runtimeRootIdentity"], "R33_PG_PRIVATE_RUNTIME_IDENTITY_CHANGED")
        self.phase = "LEAF_NAMED_BEFORE"
        before = os.stat(SCOPE["leafName"], dir_fd=parent_fd, follow_symlinks=False)
        self.leaf["namedBefore"] = nine(before)
        self.predicates = private_predicates(before, self.basis)
        need(all(self.predicates.values()), "R33_PG_PRIVATE_PRIVATE_LEAF_POLICY_CHANGED")
        self.phase = "LEAF_HELD_BEFORE"
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
        fd = self.hold(os.open(SCOPE["leafName"], flags, dir_fd=parent_fd), "fixed-private-leaf")
        self.leaf["heldBefore"] = nine(os.fstat(fd))
        need(self.leaf["heldBefore"] == self.basis, "R33_PG_PRIVATE_LEAF_CHANGED")
        self.phase = "LEAF_FIRST_READ"
        while True:
            block = os.read(fd, min(8192, SCOPE["limits"]["leafReadMaxBytes"] + 1 - len(self.first_bytes)))
            if not block:
                break
            self.first_bytes += block
            need(len(self.first_bytes) <= SCOPE["limits"]["leafReadMaxBytes"], "R33_PG_PRIVATE_LEAF_LIMIT")
        self.content_hash = hashlib.sha256(self.first_bytes).hexdigest()
        need(len(self.first_bytes) == 35825 and self.content_hash == SCOPE["expectedContentSHA256"],
             "R33_PG_PRIVATE_CONTENT_CHANGED")
        self.phase = "LEAF_SECOND_READ"
        need(os.lseek(fd, 0, os.SEEK_SET) == 0, "R33_PG_PRIVATE_REWIND_INCOMPLETE")
        while True:
            block = os.read(fd, 8192)
            if not block:
                break
            offset = self.second_compared_bytes
            if block != self.first_bytes[offset:offset + len(block)]:
                self.mismatch = {"offset": offset, "bytes": len(block), "sha256": hashlib.sha256(block).hexdigest(),
                                 "base64": base64.b64encode(block).decode()}
                raise RuntimeError("R33_PG_PRIVATE_SECOND_READ_CHANGED")
            self.second_compared_bytes += len(block)
        need(self.second_compared_bytes == len(self.first_bytes), "R33_PG_PRIVATE_SECOND_READ_SHORT")
        self.second_equal = True
        self.phase = "LEAF_FINAL"
        self.leaf["heldAfter"] = nine(os.fstat(fd))
        self.leaf["namedAfter"] = nine(os.stat(SCOPE["leafName"], dir_fd=parent_fd, follow_symlinks=False))
        need(all(x == self.basis for x in self.leaf.values()), "R33_PG_PRIVATE_LEAF_CHANGED")
        self.phase = "DIRECTORY_FINAL"
        for row in reversed(self.directories):
            row["heldAfter"] = nine(os.fstat(row["fd"]))
            row["namedAfter"] = nine(os.stat(row["name"], dir_fd=row["parentFD"], follow_symlinks=False))
            need(row["namedBefore"] == row["heldBefore"] == row["heldAfter"] == row["namedAfter"],
                 "R33_PG_PRIVATE_DIRECTORY_CHANGED")
        self.binding_complete = True

    def close_all(self):
        for fd, role in reversed(self.descriptors):
            try:
                os.close(fd)
                self.close_events.append({"role": role, "descriptor": fd, "closed": True})
            except BaseException as error:
                info = closed_error(error, "DESCRIPTOR_CLOSE")
                self.close_events.append({"role": role, "descriptor": fd, "closed": False, "error": info})
                if self.first_error is None:
                    self.first_error = info
                else:
                    self.secondary_errors.append(info)

    def result(self, program_hash, started):
        all_closed = len(self.close_events) == len(self.descriptors) and all(x["closed"] for x in self.close_events)
        complete = self.binding_complete and self.second_equal and all_closed and self.first_error is None
        directories = [{k: v for k, v in row.items() if k not in ("fd", "parentFD", "name")} for row in self.directories]
        return {"schemaVersion": 1, "kind": "r33-pg4-private-pg-manifest-byte-observation",
                "protocol": SCOPE["protocol"], "programSHA256": program_hash, "scope": SCOPE,
                "readerProfile": {"uid": os.getuid(), "euid": os.geteuid(), "gid": os.getgid(), "egid": os.getegid(), "isolated": sys.flags.isolated},
                "runtimeRootIdentity": self.runtime_identity, "leafMetadata": self.leaf,
                "leafMetadataSHA256": fingerprint(self.leaf), "privatePolicyConjuncts": self.predicates,
                "trustedDirectoryFrames": directories, "trustedDirectoryFramesSHA256": fingerprint(directories),
                "bindingComplete": self.binding_complete, "allDescriptorsClosed": all_closed,
                "descriptorCloseEvents": self.close_events, "firstClosedError": self.first_error,
                "secondaryClosedErrors": self.secondary_errors, "readComplete": complete,
                "selectedByteQualified": complete, "firstReadBase64": base64.b64encode(self.first_bytes).decode(),
                "firstReadBytes": len(self.first_bytes), "firstReadSHA256": hashlib.sha256(self.first_bytes).hexdigest(),
                "secondReadComparedBytes": self.second_compared_bytes, "secondReadEqual": self.second_equal,
                "secondReadMismatch": self.mismatch, "twoRawCopiesExported": False,
                "basisTupleSHA256": SCOPE["basisTupleSHA256"], "originalIntegerDomainPreserved": True,
                "elapsedMonotonicSeconds": time.monotonic() - started,
                "newPrivateLeafPolicy": True, "oldImmutableLeafQualified": False,
                "oldSelected14Qualified": False, "historicalFailedConjunct": None,
                "PGManifestToolInputQualified": False, "wholeRuntimeQualified": False,
                "frameworkABIQualified": False, "PG4Qualified": False, "candidateExecuted": False,
                "frameworkExecuted": False, "symlinkTargetRead": False, "mutationsPerformed": False, "modelsInvoked": False}


def run(payload=None):
    basis = checked_basis(payload)
    started = time.monotonic()
    observer = Observer(basis)
    try:
        observer.observe()
    except BaseException as error:
        observer.first_error = closed_error(error, observer.phase)
    finally:
        observer.close_all()
    return observer.result(payload["programSHA256"], started)
