"""Prepared data-only, exact single-leaf metadata observation. No content reads."""
import hashlib
import json
import os
import platform
import stat
import sys
import time

SCOPE = {
    "schemaVersion": 1,
    "kind": "r33-pg4-pg-manifest-leaf-metadata-fixed-scope",
    "protocol": "PG4_PG_LEAF_METADATA_R33_V1",
    "parentPath": "/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855",
    "runtimeName": "runtime",
    "runtimeRootIdentity": {"device": 66306, "inode": 6863174},
    "leafName": "runtime-manifest.json",
    "historicalContentSHA256": "d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1",
    "historicalLeafNineStat": None,
    "oldPredicateMaxBytes": 67108864,
    "limits": {"programAlarmSeconds": 8, "sshTimeoutSeconds": 15, "maximumRootCalls": 1,
               "inputMaxBytes": 131072, "serializedResponseMaxBytes": 1048576,
               "combinedWireMaxBytes": 2097152, "privatePacketMaxBytes": 4194304,
               "automaticRetry": False},
}


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
    code = str(error) if isinstance(error, RuntimeError) else "R33_PG_LEAF_METADATA_OS_ERROR"
    if not code.startswith("R33_PG_LEAF_"):
        code = "R33_PG_LEAF_METADATA_INTERNAL_ERROR"
    return {"phase": phase, "code": code, "errno": getattr(error, "errno", None),
            "exceptionClass": cls if cls in ("RuntimeError", "OSError", "FileNotFoundError",
                                             "PermissionError", "NotADirectoryError") else "OtherError"}


def current_predicates(st):
    return {"regularFile": stat.S_ISREG(st.st_mode), "ownerUID0": st.st_uid == 0,
            "ownerGID0": st.st_gid == 0, "singleHardLink": st.st_nlink == 1,
            "immutableMode444Or555": stat.S_IMODE(st.st_mode) in (0o444, 0o555),
            "boundedSize": 0 <= st.st_size <= SCOPE["oldPredicateMaxBytes"]}


def safe_attributes(st):
    kind = "regular" if stat.S_ISREG(st.st_mode) else "symlink" if stat.S_ISLNK(st.st_mode) else "directory" if stat.S_ISDIR(st.st_mode) else "other"
    safe = lambda n: n if abs(n) <= 9007199254740991 else None
    return {"type": kind, "uid": safe(st.st_uid), "gid": safe(st.st_gid),
            "mode": stat.S_IMODE(st.st_mode), "nlink": safe(st.st_nlink), "size": safe(st.st_size)}


class Observer:
    def __init__(self):
        self.phase = "PROFILE"
        self.descriptors = []
        self.directories = []
        self.close_events = []
        self.first_error = None
        self.secondary_errors = []
        self.leaf = {"namedBefore": None, "heldBefore": None, "heldAfter": None, "namedAfter": None}
        self.attributes = None
        self.predicates = None
        self.runtime_identity = None
        self.binding_complete = False

    def hold(self, fd, role):
        # FD 0 is a real descriptor and must be tracked and closed.
        self.descriptors.append((fd, role))
        return fd

    def directory(self, parent_fd, name, role):
        self.phase = "DIRECTORY_BIND"
        before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
             and stat.S_IMODE(before.st_mode) & 0o022 == 0, "R33_PG_LEAF_DIRECTORY_UNTRUSTED")
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        fd = self.hold(os.open(name, flags, dir_fd=parent_fd), role)
        held = os.fstat(fd)
        row = {"role": role, "parentFD": parent_fd, "name": name, "fd": fd,
               "namedBefore": nine(before), "heldBefore": nine(held), "heldAfter": None, "namedAfter": None}
        self.directories.append(row)
        need(nine(before) == nine(held), "R33_PG_LEAF_DIRECTORY_CHANGED")
        return fd

    def observe(self):
        need(platform.system() == "Linux" and os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0
             and sys.flags.isolated == 1, "R33_PG_LEAF_PROFILE_UNTRUSTED")
        need(hasattr(os, "O_PATH") and hasattr(os, "O_NOFOLLOW"), "R33_PG_LEAF_OPATH_UNSUPPORTED")
        cursor = self.directory(None, "/", "filesystem-root")
        for index, component in enumerate(SCOPE["parentPath"].split("/")[1:]):
            cursor = self.directory(cursor, component, "parent-component-" + str(index))
        parent_fd = cursor
        runtime_fd = self.directory(parent_fd, SCOPE["runtimeName"], "fixed-runtime-root")
        runtime = os.fstat(runtime_fd)
        self.runtime_identity = {"device": runtime.st_dev, "inode": runtime.st_ino}
        need(self.runtime_identity == SCOPE["runtimeRootIdentity"], "R33_PG_LEAF_RUNTIME_IDENTITY_CHANGED")
        self.phase = "LEAF_NAMED_BEFORE"
        before = os.stat(SCOPE["leafName"], dir_fd=parent_fd, follow_symlinks=False)
        self.leaf["namedBefore"] = nine(before)
        self.attributes = safe_attributes(before)
        self.predicates = current_predicates(before)
        # Intentionally preserve the named tuple BEFORE evaluating old trust conjuncts.
        # O_PATH|NOFOLLOW holds even a symlink object; its target is never followed/read.
        self.phase = "LEAF_OPATH_BIND"
        fd = self.hold(os.open(SCOPE["leafName"], os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC,
                               dir_fd=parent_fd), "fixed-leaf-opath")
        self.leaf["heldBefore"] = nine(os.fstat(fd))
        need(self.leaf["heldBefore"] == self.leaf["namedBefore"], "R33_PG_LEAF_OBJECT_CHANGED")
        self.phase = "LEAF_NAMED_AFTER"
        self.leaf["heldAfter"] = nine(os.fstat(fd))
        self.leaf["namedAfter"] = nine(os.stat(SCOPE["leafName"], dir_fd=parent_fd, follow_symlinks=False))
        need(all(x == self.leaf["namedBefore"] for x in self.leaf.values()), "R33_PG_LEAF_OBJECT_CHANGED")
        self.phase = "DIRECTORY_FINAL"
        for row in reversed(self.directories):
            row["heldAfter"] = nine(os.fstat(row["fd"]))
            row["namedAfter"] = nine(os.stat(row["name"], dir_fd=row["parentFD"], follow_symlinks=False))
            need(row["namedBefore"] == row["heldBefore"] == row["heldAfter"] == row["namedAfter"],
                 "R33_PG_LEAF_DIRECTORY_CHANGED")
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
        closed = len(self.close_events) == len(self.descriptors) and all(x["closed"] for x in self.close_events)
        complete = self.binding_complete and closed and self.first_error is None
        directories = [{k: v for k, v in row.items() if k not in ("fd", "parentFD", "name")} for row in self.directories]
        return {"schemaVersion": 1, "kind": "r33-pg4-pg-manifest-leaf-metadata-observation",
                "protocol": SCOPE["protocol"], "programSHA256": program_hash, "scope": SCOPE,
                "readerProfile": {"uid": os.getuid(), "euid": os.geteuid(), "gid": os.getgid(),
                                  "egid": os.getegid(), "isolated": sys.flags.isolated},
                "runtimeRootIdentity": self.runtime_identity,
                "leafMetadata": self.leaf, "leafMetadataSHA256": fingerprint(self.leaf),
                "leafAttributesSafe": self.attributes, "currentOldPredicateConjuncts": self.predicates,
                "currentOldPredicateAll": all(self.predicates.values()) if self.predicates is not None else None,
                "trustedDirectoryFrames": directories, "trustedDirectoryFramesSHA256": fingerprint(directories),
                "bindingComplete": self.binding_complete, "allDescriptorsClosed": closed,
                "descriptorCloseEvents": self.close_events, "firstClosedError": self.first_error,
                "secondaryClosedErrors": self.secondary_errors, "metadataReadComplete": complete,
                "currentMetadataObservationQualified": complete,
                "elapsedMonotonicSeconds": time.monotonic() - started,
                "historicalFailedConjunct": None, "historicalLeafNineStat": None,
                "d916ContentRead": False, "d916ContentQualified": False, "PGManifestToolQualified": False,
                "wholeRuntimeQualified": False, "frameworkABIQualified": False, "PG4Qualified": False,
                "leafContentRead": False, "symlinkTargetRead": False, "mutationsPerformed": False,
                "candidateExecuted": False, "modelsInvoked": False}


def run(payload=None):
    need(type(payload) is dict and set(payload) == {"scope", "programSHA256"}
         and payload["scope"] == SCOPE and type(payload["programSHA256"]) is str
         and len(payload["programSHA256"]) == 64 and all(x in "0123456789abcdef" for x in payload["programSHA256"]),
         "R33_PG_LEAF_SOURCE_INPUT_REQUIRED")
    started = time.monotonic()
    observer = Observer()
    try:
        observer.observe()
    except BaseException as error:
        observer.first_error = closed_error(error, observer.phase)
    finally:
        observer.close_all()
    return observer.result(payload["programSHA256"], started)
