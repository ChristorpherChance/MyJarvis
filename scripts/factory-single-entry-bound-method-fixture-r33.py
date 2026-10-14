"""Prepared finite R33 acquisition-method fixture; no whole census or parent.

Only fixed pure definitions and three original functions execute as UID1000.
The future trusted parent must provide an 80-second work / 10-second stop bound.
"""
import ast
from contextlib import contextmanager
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import stat
import subprocess
import sys
import time

GENERATED_SHA256 = {
    "native": "2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73",
    "build": "909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188",
}
MODULE_SHA256 = "ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8"
GENERATOR_SHA256 = "7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5"
SELECTED_SHA256 = {
    "SingleEntryR33": "34b11bfa298198de1d6476c0d41cfef28b7912e95dfc2692446fce0a3528a495",
    "SingleEntryDirectoryR33": "a0b59cc1a28b47715b24f2b1ffd6f949b56c039e5d48dfe156b74fa70b33dd17",
    "process_record": "d6cf839ecd4cc6fba03b7c4f6a44b6cf73180ef5809d8fc8d79914902139f640",
    "pidfd_poll": "94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533",
    "pidfd_exit_proof": "ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109",
}
MODULE_BEGIN = "# BEGIN R33 SINGLE-DIRENT EXACT MODULE\n"
MODULE_END = "# END R33 SINGLE-DIRENT EXACT MODULE\n"
FIXTURE_SECONDS = 45
PARENT_WORK_SECONDS = 80
PARENT_STOP_SECONDS = 10
READY_SECONDS = 5
SELF_ENTRY_LIMIT = 2048
CHILD_FD_LIMIT = 100000
BOOT = re.compile(r"[a-f0-9-]{36}\Z")
SAFE_ERROR = re.compile(r"(?:R33_METHOD|R33_SINGLE_DIRENT|R29_CLEANUP)_[A-Z0-9_]{1,100}\Z")
READ_SUBPHASES = {
    "PIDFD_OPEN", "POST_ATTACH_PROC_IDENTITY", "PROCESS_READ", "PROC_DIRECTORY_OPEN",
    "PROC_DIRECTORY_METADATA", "STAT_BEFORE", "CMDLINE_READ", "CGROUP_READ", "CWD_READLINK",
    "EXE_READLINK", "FD_DIRECTORY_OPEN", "FD_SCANDIR_OPEN", "FD_SCANDIR_NEXT",
    "FD_SCANDIR_CLOSE", "FD_ENTRY_LIMIT", "FD_TARGET_READLINK", "FD_DIRECTORY_CLOSE",
    "STAT_AFTER", "PROC_PATH_IDENTITY_AFTER", "PROC_DIRECTORY_CLOSE", "PIDFD_POLL",
    "PIDFD_EXIT_PATH_CHECK", "SCAN_CLOSE_PROC_IDENTITY", "SCAN_CLOSE",
}
PHASES = {
    "ARGUMENTS", "SOURCE_INPUT", "SOURCE_DEFINITIONS", "RUNTIME", "SELF_PRIMITIVE",
    "SELF_ADAPTER", "PIPE_CREATE", "CHILD_SPAWN", "PARENT_CHILD_ENDS_CLOSE", "READY_HANDSHAKE",
    "PIDFD_ATTACH", "CHILD_FD_ADAPTER", "PROCESS_RECORD", "LIVE_RECORD_VALIDATE",
    "RELEASE_GATE", "NATURAL_EXIT", "BOUND_EXIT_PROOF", "CHILD_CLEANUP", "DESCRIPTOR_CLOSE",
    "COMPLETE",
}
METHOD_TAGS = {"PROC_SINGLE_GETDENTS47", "FD_SINGLE_GETDENTS47"}
READY_TOKEN = b"R33_METHOD_READY_V1\n"
RELEASE_TOKEN = b"R33_METHOD_RELEASE_V1\n"
CHILD_ENVIRONMENT = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
CHILD_CODE = """import os,select,sys
ready,gate=int(sys.argv[1]),int(sys.argv[2])
poll=select.poll();poll.register(gate,select.POLLIN)
token=b'R33_METHOD_READY_V1\\n'
if os.write(ready,token)!=len(token):raise SystemExit(2)
events=poll.poll(15000)
if len(events)!=1 or events[0][0]!=gate or not events[0][1]&select.POLLIN:raise SystemExit(3)
if os.read(gate,22)!=b'R33_METHOD_RELEASE_V1\\n':raise SystemExit(4)
"""


def need(value, code):
    if not value:
        raise RuntimeError(code)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else str(value).encode()).hexdigest()


def extract_definitions(raw=None, phase=None):
    """Pure byte/AST validation, before runtime reads or definition execution."""
    need(phase in GENERATED_SHA256 and type(raw) is bytes and 0 < len(raw) <= 1048576,
         "R33_METHOD_SOURCE_INPUT_REQUIRED")
    need(digest(raw) == GENERATED_SHA256[phase], "R33_METHOD_GENERATED_SOURCE_CHANGED")
    source = raw.decode("utf-8", "strict")
    need(source.count(MODULE_BEGIN) == source.count(MODULE_END) == 1,
         "R33_METHOD_MODULE_ANCHOR_CHANGED")
    start = source.index(MODULE_BEGIN) + len(MODULE_BEGIN)
    end = source.index(MODULE_END)
    module_source = source[start:end]
    need(digest(module_source.encode()) == MODULE_SHA256, "R33_METHOD_MODULE_SOURCE_CHANGED")
    tree, module_tree = ast.parse(source), ast.parse(module_source)
    need(all(isinstance(node, (ast.Import, ast.Assign, ast.FunctionDef))
             or isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
             and type(node.value.value) is str for node in module_tree.body),
         "R33_METHOD_MODULE_NOT_DEFINITION_ONLY")
    selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef))
                and node.name in SELECTED_SHA256]
    actual = {node.name: digest(ast.get_source_segment(source, node)) for node in selected}
    need(len(selected) == 5 and actual == SELECTED_SHA256
         and all(not node.decorator_list for node in selected), "R33_METHOD_SELECTED_SOURCE_CHANGED")
    return ast.Module(body=module_tree.body + selected, type_ignores=[]), {
        "phase": phase, "generatedSourceSHA256": digest(raw), "generatorSHA256": GENERATOR_SHA256,
        "pureModuleSHA256": MODULE_SHA256, "selectedSourceSHA256": actual,
        "wholeProgramTopLevelExecuted": False, "censusDefinitionLoaded": False,
        "actualSourceMappingQualified": False}


def load_definitions(raw=None, phase=None):
    """Local definition validation may use this pure, non-kernel loader."""
    selected_module, source_evidence = extract_definitions(raw, phase)
    workspace = "/__r33_owned_child_method_not_a_production_scope__"
    scope = {"os": os, "Path": Path, "re": re, "select": select, "errno": errno,
             "need": need, "digest": digest, "CLOSED_READ_SUBPHASES": READ_SUBPHASES,
             "in_workspace": lambda value: value.removesuffix(" (deleted)") == workspace
             or value.removesuffix(" (deleted)").startswith(workspace + "/"),
             "argv_workspace": lambda value: bool(re.search(
                 r"(?<![A-Za-z0-9_./-])" + re.escape(workspace) + r"(?=$|[/\s\x00\x22\x27])", value))}
    # The pinned module contains imports, literal assignments and function definitions.
    # Selected nodes contain only the two adapter classes and three original functions.
    exec(compile(selected_module, "<fixed-r33-method-definitions>", "exec"), scope)
    return scope, source_evidence


def proc_identity(pid):
    info = os.stat("/proc/" + str(pid), follow_symlinks=False)
    return {"device": info.st_dev, "inode": info.st_ino}


def safe_identity(attachment):
    if not isinstance(attachment, dict) or attachment.get("identityBound") is not True:
        return None
    value = attachment.get("observedIdentity")
    if not isinstance(value, dict):
        return None
    integers = ("pid", "procDevice", "procInode")
    if not all(type(value.get(k)) is int and value[k] >= (1 if k != "procDevice" else 0) for k in integers):
        return None
    if not isinstance(value.get("boot"), str) or BOOT.fullmatch(value["boot"]) is None:
        return None
    listed = attachment.get("listedProcIdentity")
    if (value["pid"] != attachment.get("requestedPID") or value["boot"] != attachment.get("boot")
            or not isinstance(listed, dict) or type(listed.get("device")) is not int
            or type(listed.get("inode")) is not int
            or value["procDevice"] != listed["device"] or value["procInode"] != listed["inode"]):
        return None
    return {k: value[k] for k in (*integers, "boot")} | {
        "ppid": value.get("ppid") if type(value.get("ppid")) is int and value["ppid"] >= 0 else None,
        "startTicks": value.get("startTicks") if isinstance(value.get("startTicks"), str)
        and re.fullmatch(r"[0-9]+", value["startTicks"]) is not None else None,
    }


def safe_error(error):
    text = str(error)
    return {"errorCode": text if SAFE_ERROR.fullmatch(text) else "R33_METHOD_INCOMPLETE",
            "errno": error.errno if type(getattr(error, "errno", None)) is int
            and 0 <= error.errno <= 4095 else None}


def base_result(phase):
    return {"schemaVersion": 1, "kind": "r33-single-entry-bound-method-fixture-result",
            "phase": phase if phase in GENERATED_SHA256 else None,
            "wholeProgramQualified": False, "fullProtectionQualified": False,
            "fullProcCensusExecuted": False, "foreignProcessInspected": False,
            "protectedInventoryRead": False, "nodeACKRead": False, "queueRead": False,
            "productCodeExecuted": False, "modelsInvoked": False, "getfdFallbackUsed": False,
            "entryToPIDRaceEliminated": False, "externalHoldersAbsenceProved": False,
            "parentImplementedByThisFixture": False, "independentClosureVerified": False,
            "internalWorkSeconds": FIXTURE_SECONDS, "cleanupWaitSeconds": [3, 3],
            "requiredParentWorkSeconds": PARENT_WORK_SECONDS,
            "requiredParentStopSeconds": PARENT_STOP_SECONDS,
            "requiredParentTotalSeconds": PARENT_WORK_SECONDS + PARENT_STOP_SECONDS}


class Diagnostics:
    def __init__(self, phase):
        self.phase = "ARGUMENTS"
        self.source_phase = phase
        self.first = None
        self.secondary = []
        self.attachment = None
        self.requested_pid = None
        self.ready = False
        self.release_sent = False
        self.signals_sent = False
        self.child_reaped = False

    def enter(self, phase):
        need(phase in PHASES, "R33_METHOD_DIAGNOSTIC_PHASE_INVALID")
        self.phase = phase

    def capture(self, error, read=False):
        attachment = self.attachment
        primary = attachment.get("failedReadError", error) if isinstance(attachment, dict) and read else error
        subphase = attachment.get("failedReadSubphase") if isinstance(attachment, dict) and read else None
        tag = getattr(primary, "singleDirentAcquisitionR33", None)
        row = {"fixturePhase": self.phase,
               "firstReadSubphase": subphase if subphase in READ_SUBPHASES else None,
               "singleDirentAcquisitionR33": tag if tag in METHOD_TAGS else None, **safe_error(primary)}
        if self.first is None:
            self.first = row
        elif len(self.secondary) < 8:
            self.secondary.append(row)


def fd_metadata(info):
    return {"device": info.st_dev, "inode": info.st_ino, "mode": info.st_mode,
            "uid": info.st_uid, "gid": info.st_gid}


class DescriptorLedger:
    """Record this fixture's allocations, including unmodified function opens/closes.

    No target duplication or slot retry. Failure to close one FD does not skip others.
    """
    def __init__(self):
        self.rows = []
        self.active = {}

    def register(self, name, fd):
        need(type(fd) is int and fd >= 0 and fd not in self.active, "R33_METHOD_FD_LEDGER_CHANGED")
        row = {"sequence": len(self.rows), "role": name, "fd": fd, "identity": None,
               "closeAttempted": False, "closed": False, "closeError": None}
        self.rows.append(row)
        self.active[fd] = row  # Registration precedes any fallible metadata read.
        row["identity"] = fd_metadata(os.fstat(fd))
        return fd

    def open(self, name, path, flags, **kwargs):
        return self.register(name, os.open(path, flags, **kwargs))

    def pipe(self, name):
        read_fd, write_fd = os.pipe()
        # Register both returned FDs before any fstat can raise.
        for role, fd in ((name + "Read", read_fd), (name + "Write", write_fd)):
            row = {"sequence": len(self.rows), "role": role, "fd": fd, "identity": None,
                   "closeAttempted": False, "closed": False, "closeError": None}
            self.rows.append(row); self.active[fd] = row
        for fd in (read_fd, write_fd):
            self.active[fd]["identity"] = fd_metadata(os.fstat(fd))
        return read_fd, write_fd

    def close(self, fd):
        row = self.active.pop(fd, None)
        need(row is not None, "R33_METHOD_UNOWNED_DESCRIPTOR_CLOSE")
        row["closeAttempted"] = True
        try:
            current = fd_metadata(os.fstat(fd))
            need(row["identity"] is None or current == row["identity"], "R33_METHOD_DESCRIPTOR_IDENTITY_CHANGED")
            os.close(fd)
            try:
                os.fstat(fd)
            except OSError as error:
                need(error.errno == errno.EBADF, "R33_METHOD_DESCRIPTOR_CLOSE_UNPROVEN")
            else:
                raise RuntimeError("R33_METHOD_DESCRIPTOR_STILL_OPEN")
            row["closed"] = True
        except BaseException as error:
            row["closeError"] = safe_error(error)
            raise

    def close_all(self, diagnostics):
        for fd in list(self.active):
            try:
                self.close(fd)
            except BaseException as error:
                diagnostics.capture(error)

    def complete(self):
        return not self.active and all(row["closed"] is True for row in self.rows)


class ObservedOS:
    """Transparent open/close accounting; shared function source stays exact."""
    def __init__(self, ledger):
        self.ledger = ledger

    def __getattr__(self, name):
        return getattr(os, name)

    def open(self, path, flags, **kwargs):
        return self.ledger.open("selectedFunctionOpen", path, flags, **kwargs)

    def close(self, fd):
        return self.ledger.close(fd)


@contextmanager
def preserving_descriptor(ledger, fd, diagnostics):
    """Capture a read failure before close; a failed close always remains failure."""
    primary = None
    try:
        yield fd
    except BaseException as error:
        primary = error
        diagnostics.capture(error)
        raise
    finally:
        try:
            ledger.close(fd)
        except BaseException as error:
            diagnostics.capture(error)
            if primary is None:
                raise


def runtime_guard():
    need(sys.platform == "linux" and hasattr(os, "getresuid") and os.getresuid() == (1000, 1000, 1000)
         and hasattr(os, "getresgid") and os.getresgid() == (1000, 1000, 1000),
         "R33_METHOD_UID1000_LINUX_REQUIRED")
    need(sys.flags.isolated == 1 and sys.flags.no_user_site == 1,
         "R33_METHOD_ISOLATED_PYTHON_REQUIRED")
    need(hasattr(os, "pidfd_open") and hasattr(select, "poll") and hasattr(signal, "pidfd_send_signal"),
         "R33_METHOD_PIDFD_UNSUPPORTED")
    need(not any(os.environ.get(name) for name in ("PYTHONPATH", "PYTHONHOME", "LD_PRELOAD", "LD_LIBRARY_PATH")),
         "R33_METHOD_ENVIRONMENT_UNTRUSTED")
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines() if ":" in line)
    caps = {name: status.get(name, "invalid").strip() for name in ("CapEff", "CapPrm", "CapInh")}
    need(all(int(value, 16) == 0 for value in caps.values()) and status.get("NoNewPrivs", "").strip() == "1",
         "R33_METHOD_PRIVILEGE_BOUNDARY_CHANGED")
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    need(BOOT.fullmatch(boot) is not None, "R33_METHOD_BOOT_INVALID")
    groups = [line.split(":", 2)[2] for line in Path("/proc/self/cgroup").read_text().splitlines()
              if line.count(":") == 2]
    need(groups and all(group.startswith("/") for group in groups), "R33_METHOD_CGROUP_UNREADABLE")
    text = Path("/proc/self/stat").read_text(); fields = text[text.rfind(")") + 2:].split()
    need(len(fields) >= 20 and fields[19].isdigit(), "R33_METHOD_SELF_STAT_INVALID")
    own = proc_identity(os.getpid())
    return {"fixtureIdentity": {"pid": os.getpid(), "ppid": int(fields[1]), "startTicks": fields[19],
                                "boot": boot, "procDevice": own["device"], "procInode": own["inode"]},
            "realEffectiveSavedUID": list(os.getresuid()), "realEffectiveSavedGID": list(os.getresgid()),
            "capabilities": caps, "noNewPrivileges": 1, "seccomp": status.get("Seccomp", "").strip(),
            "cgroups": groups, "isolatedPython": True, "kernelRelease": os.uname().release,
            "architecture": os.uname().machine, "forbiddenEnvironmentNonempty": False,
            "childEnvironmentSHA256": digest(json.dumps(CHILD_ENVIRONMENT, sort_keys=True, separators=(",", ":"))),
            "rootOwnerProfileAsserted": False}


def self_acquisition(scope, ledger, runtime, diagnostics):
    """Logical self scope, numeric proc path. No enumeration of the /proc table."""
    identity = runtime["fixtureIdentity"]
    expected = {"device": identity["procDevice"], "inode": identity["procInode"]}
    path = "/proc/" + str(identity["pid"])
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    diagnostics.enter("SELF_PRIMITIVE")
    fd = ledger.open("selfPrimitiveDirectory", path, flags)
    records = []; calls = 0
    with preserving_descriptor(ledger, fd, diagnostics):
        need(proc_identity(identity["pid"]) == expected, "R33_METHOD_SELF_IDENTITY_CHANGED")
        library = scope["_linux_libc_r33"]()
        while True:
            record = scope["_read_single_dirent_from_libc_r33"](fd, library); calls += 1
            if record is None:
                break
            need(len(records) < SELF_ENTRY_LIMIT, "R33_METHOD_SELF_ENTRY_LIMIT")
            records.append({"nameHex": record["name"].hex(), "inode": record["inode"],
                            "type": record["type"], "recordBytes": record["recordBytes"]})
        need(proc_identity(identity["pid"]) == expected, "R33_METHOD_SELF_IDENTITY_CHANGED")
    diagnostics.enter("SELF_ADAPTER")
    fd = ledger.open("selfAdapterDirectory", path, flags)
    entries = []
    with preserving_descriptor(ledger, fd, diagnostics):
        directory = scope["SingleEntryDirectoryR33"](fd, "PROC_SINGLE_GETDENTS47")
        with directory as iterator:
            for entry in iterator:
                need(len(entries) < SELF_ENTRY_LIMIT, "R33_METHOD_SELF_ENTRY_LIMIT")
                entries.append({"nameHex": os.fsencode(entry.name).hex(), "inode": entry.inode()})
        held = os.fstat(fd)
        need(directory.closed and {"device": held.st_dev, "inode": held.st_ino} == expected
             and proc_identity(identity["pid"]) == expected, "R33_METHOD_BORROWED_DIRECTORY_CHANGED")
        raw_entries = [{"nameHex": row["nameHex"], "inode": row["inode"]} for row in records
                       if row["nameHex"] not in (b".".hex(), b"..".hex())]
        need(entries == raw_entries, "R33_METHOD_SELF_ADAPTER_RECORDS_CHANGED")
    sizes = sorted({record["recordBytes"] for record in records})
    return {"logicalScope": "fixture-own-proc-directory", "numericPIDPathUsed": True,
            "primitiveRecords": records, "primitiveCallsIncludingEOF": calls, "eofObserved": True,
            "actualRecordBytesObserved": sizes, "actual32ByteRecordObserved": 32 in sizes,
            "actual40ByteRecordObserved": 40 in sizes, "adapterEntries": entries,
            "adapterMatchedPrimitiveWithoutDotEntries": True, "adapterBorrowedFDStayedOpen": True}


def read_ready(fd, deadline):
    received = b""
    while len(received) < len(READY_TOKEN):
        remaining = deadline - time.monotonic()
        need(remaining > 0, "R33_METHOD_READY_TIMEOUT")
        readable, _, _ = select.select([fd], [], [], remaining)
        need(readable == [fd], "R33_METHOD_READY_TIMEOUT")
        chunk = os.read(fd, len(READY_TOKEN) + 1 - len(received))
        need(chunk and len(received) + len(chunk) <= len(READY_TOKEN), "R33_METHOD_READY_TOKEN_INVALID")
        received += chunk
        need(READY_TOKEN.startswith(received), "R33_METHOD_READY_TOKEN_INVALID")
    readable, _, _ = select.select([fd], [], [], 0)
    need(received == READY_TOKEN and not readable, "R33_METHOD_READY_TOKEN_INVALID")
    return True


def attach_child(pid, boot, attachment, ledger):
    listed = proc_identity(pid)
    attachment.update({"requestedPID": pid, "boot": boot, "listedProcIdentity": listed,
                       "observedIdentity": None, "identityBound": False})
    subphase = "PIDFD_OPEN"
    try:
        attachment["fd"] = os.pidfd_open(pid, 0)
        ledger.register("childPIDFD", attachment["fd"])
        subphase = "POST_ATTACH_PROC_IDENTITY"
        current = proc_identity(pid)
        need(current == listed, "R33_METHOD_POST_ATTACH_IDENTITY_CHANGED")
    except BaseException as error:
        attachment.setdefault("failedReadSubphase", subphase)
        attachment.setdefault("failedReadError", error)
        raise
    attachment["observedIdentity"] = {"pid": pid, "boot": boot,
                                      "procDevice": current["device"], "procInode": current["inode"]}
    attachment["identityBound"] = True


def child_fd_acquisition(scope, ledger, attachment, known_slots, diagnostics):
    pid = attachment["requestedPID"]; expected = attachment["listedProcIdentity"]
    need(not scope["pidfd_poll"](attachment["fd"])["exitConfirmed"], "R33_METHOD_CHILD_NOT_LIVE")
    proc = ledger.open("childDirectProcDirectory", "/proc/" + str(pid),
                       os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    entries = []; seen = set(); known = {}
    with preserving_descriptor(ledger, proc, diagnostics):
        held = os.fstat(proc)
        need({"device": held.st_dev, "inode": held.st_ino} == expected, "R33_METHOD_CHILD_IDENTITY_CHANGED")
        status_fd = ledger.open("childSecurityStatus", "status", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=proc)
        with preserving_descriptor(ledger, status_fd, diagnostics):
            raw = b""
            while len(raw) <= 16384:
                piece = os.read(status_fd, min(4096, 16385 - len(raw)))
                if not piece:
                    break
                raw += piece
            need(len(raw) <= 16384, "R33_METHOD_CHILD_STATUS_LIMIT")
            values = dict(line.split(":", 1) for line in raw.decode("utf-8", "strict").splitlines() if ":" in line)
            child_security = {"UID": [int(item) for item in values.get("Uid", "").split()],
                              "GID": [int(item) for item in values.get("Gid", "").split()],
                              "capabilities": {name: values.get(name, "invalid").strip()
                                               for name in ("CapEff", "CapPrm", "CapInh")},
                              "noNewPrivileges": values.get("NoNewPrivs", "").strip(),
                              "seccomp": values.get("Seccomp", "").strip()}
            need(child_security["UID"] == child_security["GID"] == [1000, 1000, 1000, 1000]
                 and child_security["noNewPrivileges"] == "1"
                 and all(int(value, 16) == 0 for value in child_security["capabilities"].values()),
                 "R33_METHOD_CHILD_PRIVILEGE_BOUNDARY_CHANGED")
        fd = ledger.open("childDirectFDDirectory", "fd",
                         os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=proc)
        with preserving_descriptor(ledger, fd, diagnostics):
            directory = scope["SingleEntryDirectoryR33"](fd, "FD_SINGLE_GETDENTS47")
            with directory as iterator:
                for entry in iterator:
                    need(len(entries) < CHILD_FD_LIMIT and entry.name.isdigit() and entry.name not in seen,
                         "R33_METHOD_CHILD_FD_ENTRY_INVALID")
                    seen.add(entry.name)
                    info = os.stat(entry.name, dir_fd=fd, follow_symlinks=False)
                    need(stat.S_ISLNK(info.st_mode) and info.st_ino == entry.inode(),
                         "R33_METHOD_CHILD_FD_ENTRY_CHANGED")
                    target = os.readlink(entry.name, dir_fd=fd)
                    row = {"slot": int(entry.name), "entryInode": entry.inode(), "targetSHA256": digest(target)}
                    entries.append(row)
                    if row["slot"] in known_slots:
                        reference = known_slots[row["slot"]]
                        need(target == "pipe:[" + str(reference["inode"]) + "]",
                             "R33_METHOD_KNOWN_PIPE_TARGET_CHANGED")
                        actual = os.stat(entry.name, dir_fd=fd, follow_symlinks=True)
                        need(stat.S_ISFIFO(actual.st_mode) and actual.st_dev == reference["device"]
                             and actual.st_ino == reference["inode"], "R33_METHOD_KNOWN_PIPE_IDENTITY_CHANGED")
                        known[str(row["slot"])] = {"expectedPipeIdentity": reference, "actualPipeIdentity": fd_metadata(actual),
                                                  "targetSHA256": row["targetSHA256"], "matched": True}
            need(directory.closed and stat.S_ISDIR(os.fstat(fd).st_mode),
                 "R33_METHOD_CHILD_BORROWED_FD_CLOSED")
        need(set(known) == {str(slot) for slot in known_slots}
             and proc_identity(pid) == expected
             and not scope["pidfd_poll"](attachment["fd"])["exitConfirmed"],
             "R33_METHOD_CHILD_FD_SCOPE_NOT_CLOSED")
    return {"entries": entries, "knownPipeSlots": known, "childSecurity": child_security,
            "borrowedFDStayedOpen": True,
            "foreignPIDRead": False, "targetsReadAsContents": False, "getfdUsed": False}


def exact_child_alive(child, attachment, boot, scope):
    need(attachment.get("requestedPID") == child.pid and attachment.get("boot") == boot
         and attachment.get("identityBound") is True, "R33_METHOD_CHILD_IDENTITY_UNBOUND")
    need(not scope["pidfd_poll"](attachment["fd"])["exitConfirmed"], "R33_METHOD_CHILD_ALREADY_EXITED")
    need(Path("/proc/sys/kernel/random/boot_id").read_text().strip() == boot
         and proc_identity(child.pid) == attachment["listedProcIdentity"], "R33_METHOD_CHILD_IDENTITY_CHANGED")
    fresh = scope["process_record"](child.pid, boot, attachment)
    need(re.fullmatch(r"[0-9]+", attachment.get("fixtureStartTicks", "")) is not None
         and fresh["pid"] == child.pid and fresh["ppid"] == os.getpid()
         and fresh["startTicks"] == attachment["fixtureStartTicks"], "R33_METHOD_CHILD_START_CHANGED")


def finish_child(child, attachment, boot, scope, diagnostics):
    if child is None:
        return
    try:
        child.wait(timeout=3)
    except subprocess.TimeoutExpired:
        exact_child_alive(child, attachment, boot, scope)
        diagnostics.signals_sent = True
        signal.pidfd_send_signal(attachment["fd"], signal.SIGTERM, None, 0)
        child.wait(timeout=3)
    diagnostics.child_reaped = True


def execute_fixture(raw=None, phase=None, deadline=None):
    diagnostics = Diagnostics(phase); evidence = {}; ledger = DescriptorLedger()
    child = None; attachment = {}; diagnostics.attachment = attachment
    gate_write = None; boot = None; scope = None; qualified = False; work_timer_armed = False
    started = time.monotonic()

    def release_gate():
        if child is not None and not diagnostics.release_sent:
            need(gate_write is not None and gate_write in ledger.active, "R33_METHOD_RELEASE_GATE_MISSING")
            need(os.write(gate_write, RELEASE_TOKEN) == len(RELEASE_TOKEN), "R33_METHOD_RELEASE_WRITE_INCOMPLETE")
            diagnostics.release_sent = True

    try:
        diagnostics.enter("SOURCE_INPUT")
        # A missing/changed source rejects before runtime reads, child creation or getdents.
        _, evidence["source"] = extract_definitions(raw, phase)
        diagnostics.enter("RUNTIME"); evidence["runtime"] = runtime_guard()
        diagnostics.enter("SOURCE_DEFINITIONS"); scope, _ = load_definitions(raw, phase)
        boot = evidence["runtime"]["fixtureIdentity"]["boot"]
        deadline = time.monotonic() + FIXTURE_SECONDS if deadline is None else deadline
        need(deadline > time.monotonic(), "R33_METHOD_WORK_DEADLINE_EXCEEDED")
        signal.signal(signal.SIGALRM, alarm_failure)
        signal.setitimer(signal.ITIMER_REAL, max(0.001, deadline - time.monotonic()))
        work_timer_armed = True
        scope["os"] = ObservedOS(ledger)
        evidence["selfAcquisition"] = self_acquisition(scope, ledger, evidence["runtime"], diagnostics)
        diagnostics.enter("PIPE_CREATE")
        ready_read, ready_write = ledger.pipe("ready")
        gate_read, gate_write = ledger.pipe("gate")
        known_slots = {ready_write: dict(ledger.active[ready_write]["identity"]),
                       gate_read: dict(ledger.active[gate_read]["identity"])}
        diagnostics.enter("CHILD_SPAWN")
        child = subprocess.Popen([sys.executable, "-I", "-c", CHILD_CODE, str(ready_write), str(gate_read)],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 env=CHILD_ENVIRONMENT, close_fds=True, pass_fds=(ready_write, gate_read))
        diagnostics.requested_pid = child.pid
        diagnostics.enter("PARENT_CHILD_ENDS_CLOSE")
        ledger.close(ready_write); ledger.close(gate_read)
        diagnostics.enter("READY_HANDSHAKE")
        diagnostics.ready = read_ready(ready_read, min(deadline, time.monotonic() + READY_SECONDS))
        diagnostics.enter("PIDFD_ATTACH"); attach_child(child.pid, boot, attachment, ledger)
        diagnostics.enter("CHILD_FD_ADAPTER")
        evidence["childFDAcquisition"] = child_fd_acquisition(scope, ledger, attachment, known_slots, diagnostics)
        diagnostics.enter("PROCESS_RECORD")
        try:
            live = scope["process_record"](child.pid, boot, attachment)
        except BaseException as error:
            diagnostics.capture(error, read=True)
            raise
        attachment["fixtureStartTicks"] = live["startTicks"]
        evidence["liveRecord"] = live
        diagnostics.enter("LIVE_RECORD_VALIDATE")
        need(live["uid"] == 1000 and live["ppid"] == os.getpid() and live["state"] != "Z"
             and live["cgroups"] == evidence["runtime"]["cgroups"]
             and safe_identity(attachment) is not None
             and not scope["pidfd_poll"](attachment["fd"])["exitConfirmed"], "R33_METHOD_LIVE_RECORD_NOT_VALID")
        diagnostics.enter("RELEASE_GATE"); release_gate()
        diagnostics.enter("NATURAL_EXIT"); child.wait(timeout=4); diagnostics.child_reaped = True
        need(child.returncode == 0, "R33_METHOD_NATURAL_CHILD_EXIT_FAILED")
        evidence["childExitCode"] = child.returncode
        diagnostics.enter("BOUND_EXIT_PROOF")
        proof = scope["pidfd_exit_proof"](child.pid, attachment, boot)
        need(proof is not None and proof["kernelProof"]["procPathAbsent"] is True,
             "R33_METHOD_BOUND_EXIT_NOT_PROVED")
        evidence["originalBoundExitProof"] = proof
        qualified = True
    except BaseException as error:
        diagnostics.capture(error, read=diagnostics.phase in ("PIDFD_ATTACH", "PROCESS_RECORD"))
    finally:
        # The 45-second work timer is not a total-process bound. The separately
        # qualified parent must enforce 80+10 seconds and independently read closure.
        if work_timer_armed:
            try:
                signal.setitimer(signal.ITIMER_REAL, 0)
            except BaseException as error:
                diagnostics.capture(error)
        if child is not None:
            diagnostics.enter("RELEASE_GATE")
            try:
                release_gate()
            except BaseException as error:
                diagnostics.capture(error)
            diagnostics.enter("CHILD_CLEANUP")
            try:
                finish_child(child, attachment, boot, scope, diagnostics)
            except BaseException as error:
                diagnostics.capture(error, read=True)
        diagnostics.enter("DESCRIPTOR_CLOSE"); ledger.close_all(diagnostics)
    qualified = qualified and diagnostics.first is None and diagnostics.child_reaped and ledger.complete() \
        and not diagnostics.signals_sent
    if qualified:
        diagnostics.enter("COMPLETE")
    return {**base_result(phase), "fixtureQualified": qualified, "methodSubsetExercised": qualified,
            "requestedChildPID": diagnostics.requested_pid, "childIdentity": safe_identity(attachment),
            "readyHandshakeCompleted": diagnostics.ready, "releaseGateSent": diagnostics.release_sent,
            "naturalChildExit": qualified, "childReaped": diagnostics.child_reaped,
            "descriptorClosed": ledger.complete(), "signalsSent": diagnostics.signals_sent,
            "firstFailure": diagnostics.first, "secondaryFailures": diagnostics.secondary,
            "fixturePhase": diagnostics.phase, "descriptorLedger": ledger.rows,
            "descriptorLedgerScope": "explicit fixture allocations and selected-function os.open/os.close; excludes standard streams and transient Popen implementation handles",
            "elapsedSeconds": time.monotonic() - started, "readyProtocolSHA256": digest(CHILD_CODE),
            "rawArgvExported": False, "privateEnvironmentExported": False, **evidence}


def alarm_failure(signum, frame):
    raise RuntimeError("R33_METHOD_WORK_DEADLINE_EXCEEDED")


def main():
    phase = sys.argv[1].split("=", 1)[1] if len(sys.argv) == 2 \
        and sys.argv[1] in ("--phase=native", "--phase=build") else None
    if phase is None:
        # Default invocation performs no runtime/proc/source-input or child read.
        result = {**base_result(None), "fixtureQualified": False, "preparedOnly": True,
                  "errorCode": "R33_METHOD_SOURCE_INPUT_REQUIRED", "runtimeIOPerformed": False}
    else:
        # Parent provides the fixed source bytes on stdin; this finite read has a
        # work alarm. No caller/installation/activation is implemented here.
        deadline = time.monotonic() + FIXTURE_SECONDS
        if sys.platform == "linux":
            signal.signal(signal.SIGALRM, alarm_failure); signal.setitimer(signal.ITIMER_REAL, FIXTURE_SECONDS)
        try:
            raw = sys.stdin.buffer.read(1048577)
            result = execute_fixture(raw, phase, deadline=deadline)
        except BaseException as error:
            result = {**base_result(phase), "fixtureQualified": False, "firstFailure": safe_error(error)}
        finally:
            if sys.platform == "linux":
                signal.setitimer(signal.ITIMER_REAL, 0)
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["fixtureQualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
