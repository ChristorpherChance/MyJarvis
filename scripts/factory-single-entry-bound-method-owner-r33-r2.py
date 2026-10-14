"""Trusted root lifecycle only. The acquisition fixture executes after UID1000 exec.

No generated definition, candidate package, whole census or production API loads here.
"""
import errno
from contextlib import contextmanager
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

BASE = "/var/lib/jarvis-single-entry-bound-method-r33-r2"
FIXTURE_SHA = "3c97393af43ce6290baa5ca9e1253fcad16c6a62bb2677a9566c534ef4bd0fb8"
INPUT_SHA = "2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73"
BUILD_STATIC_SHA = "909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188"
MODULE_SHA = "ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8"
GENERATOR_SHA = "7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5"
PROTOCOL = "r33-single-entry-owned-method-v2"
CONTROLS = ("owner.py", "fixture.py", "generated.py", "activation.json", "once.json")
N = re.compile(r"[a-f0-9]{32}\Z")
H = re.compile(r"[a-f0-9]{64}\Z")
BOOT = re.compile(r"[a-f0-9-]{36}\Z")
ROOT_CAPS = 0xE2  # DAC_OVERRIDE, KILL, SETGID, SETUID. This is not a cap0 actor.
SELECTED_SHA = {
    "SingleEntryR33": "34b11bfa298198de1d6476c0d41cfef28b7912e95dfc2692446fce0a3528a495",
    "SingleEntryDirectoryR33": "a0b59cc1a28b47715b24f2b1ffd6f949b56c039e5d48dfe156b74fa70b33dd17",
    "process_record": "d6cf839ecd4cc6fba03b7c4f6a44b6cf73180ef5809d8fc8d79914902139f640",
    "pidfd_poll": "94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533",
    "pidfd_exit_proof": "ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109",
}


def need(value, code):
    if not value:
        raise RuntimeError(code)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def key(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


@contextmanager
def closing_read(fd, role):
    """A secondary close cannot replace an earlier lifecycle/source read error."""
    primary = None
    try:
        yield fd
    except BaseException as error:
        primary = error
        raise
    finally:
        try:
            os.close(fd)
        except BaseException as error:
            if primary is None:
                raise
            rows = getattr(primary, "secondaryCloseErrors", [])
            if len(rows) < 8:
                rows.append({"phase": "READ_CLOSE", "role": role,
                             "errorCode": "R33_METHOD_OWNER_READ_CLOSE_INCOMPLETE",
                             "errno": error.errno if type(getattr(error, "errno", None)) is int else None})
            primary.secondaryCloseErrors = rows


def root_directory(path):
    fd = os.open("/", os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in Path(path).parts[1:]:
            before = os.stat(name, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
                 and not before.st_mode & 0o022 and before.st_mode & 0o001,
                 "R33_METHOD_OWNER_PARENT_UNTRUSTED")
            child = os.open(name, os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                need(key(before) == key(os.fstat(child)), "R33_METHOD_OWNER_PARENT_CHANGED")
            except BaseException:
                os.close(child)
                raise
            os.close(fd); fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_control(control, name):
    fd = root_directory(control)
    with closing_read(fd, "control-directory"):
        s = os.stat(name, dir_fd=fd, follow_symlinks=False)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == s.st_gid == 0 and s.st_nlink == 1
             and stat.S_IMODE(s.st_mode) == 0o444 and 0 < s.st_size <= 1048576,
             "R33_METHOD_OWNER_CONTROL_UNTRUSTED")
        source = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with closing_read(source, "control-file"):
            need(key(s) == key(os.fstat(source)), "R33_METHOD_OWNER_CONTROL_CHANGED")
            data = b""
            while len(data) <= s.st_size:
                block = os.read(source, min(65536, s.st_size + 1 - len(data)))
                if not block:
                    break
                data += block
            need(len(data) == s.st_size and key(s) == key(os.fstat(source))
                 == key(os.stat(name, dir_fd=fd, follow_symlinks=False)), "R33_METHOD_OWNER_CONTROL_CHANGED")
            return data, key(s)


def save_bytes_work(work, name, raw):
    parent = root_directory(work.parent)
    with closing_read(parent, "work-parent"):
        before = os.stat(work.name, dir_fd=parent, follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
             and stat.S_IMODE(before.st_mode) == 0o700, "R33_METHOD_OWNER_WORK_UNTRUSTED")
        directory = os.open(work.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        with closing_read(directory, "work-directory"):
            need(key(before) == key(os.fstat(directory)), "R33_METHOD_OWNER_WORK_CHANGED")
            target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            with closing_read(target, "work-output"):
                view = memoryview(raw)
                while view:
                    count = os.write(target, view)
                    need(type(count) is int and 0 < count <= len(view), "R33_METHOD_OWNER_SHORT_WRITE")
                    view = view[count:]
                os.fchmod(target, 0o600); os.fsync(target)
            os.fsync(directory)


def save_work(work, name, value):
    save_bytes_work(work, name, json.dumps(value, separators=(",", ":")).encode() + b"\n")


EARLY_PHASES = frozenset(("ARGUMENTS", "RUNTIME_PROFILE", "CONTROL_READ", "CONTEXT_FIELDS",
                         "INVOCATION", "CGROUP", "OWNER_IDENTITY", "OWNER_PIDFD_OPEN",
                         "OWNER_PIDFD_VERIFY", "OWNER_RECORD_SAVE", "STOP_STATUS", "STOP_RECORD_SAVE",
                         "FIXTURE_LIFECYCLE", "OWNER_PIDFD_CLOSE", "EARLY_RECORD_SAVE"))


def early_phase(early, phase, control=None):
    need(phase in EARLY_PHASES and (control is None or control in CONTROLS),
         "R33_METHOD_OWNER_EARLY_STAGE_CHANGED")
    early["phase"] = phase
    early["control"] = control


def write_early_failure(error, early):
    """Inherited systemd stderr is a root-prepared private regular sink, never a path fallback."""
    sink = os.fstat(2)
    need(stat.S_ISREG(sink.st_mode) and sink.st_uid == sink.st_gid == 0
         and sink.st_nlink == 1 and stat.S_IMODE(sink.st_mode) == 0o600,
         "R33_METHOD_OWNER_EARLY_SINK_UNTRUSTED")
    message = str(error).encode("utf-8", "replace")
    record = {"schemaVersion": 1, "kind": "r33-single-entry-method-owner-early-failure-r2",
              "nonce": early.get("nonce"), "action": early.get("action"),
              "sourceProtocol": PROTOCOL, "control": early.get("control"),
              "firstFailure": closed_error(error, early["phase"]),
              "runtimeObserved": early.get("runtimeObserved"),
              "privateExceptionClass": type(error).__name__[:128],
              "privateExceptionMessage": message[:4096].decode("utf-8", "replace"),
              "privateExceptionMessageSHA256": sha(message), "privateMessageTruncated": len(message) > 4096,
              "secondaryCloseErrors": getattr(error, "secondaryCloseErrors", [])[:8],
              "methodSubsetProducerPassed": False, "actualMethodIndependentlyQualified": False,
              "currentScopeCleanupIndependentlyVerified": False, "fullProtectionQualified": False,
              "productCodeExecuted": False, "modelsInvoked": False}
    raw = json.dumps(record, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"
    need(len(raw) <= 16384, "R33_METHOD_OWNER_EARLY_RECORD_LIMIT")
    view = memoryview(raw)
    while view:
        count = os.write(2, view)
        need(type(count) is int and 0 < count <= len(view), "R33_METHOD_OWNER_EARLY_SHORT_WRITE")
        view = view[count:]
    os.fsync(2)


def runtime(early=None):
    need(sys.platform == "linux" and os.getresuid() == (0, 0, 0) and os.getresgid() == (0, 0, 0)
         and sys.flags.isolated == 1 and hasattr(os, "pidfd_open"), "R33_METHOD_OWNER_ROOT_LINUX_REQUIRED")
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines() if ":" in line)
    caps = {name: status.get(name, "invalid").strip() for name in ("CapEff", "CapPrm", "CapInh", "CapAmb")}
    if early is not None:
        early["runtimeObserved"] = {"realEffectiveSavedUID": list(os.getresuid()),
                                   "realEffectiveSavedGID": list(os.getresgid()), "isolated": sys.flags.isolated,
                                   "capabilities": caps, "noNewPrivileges": status.get("NoNewPrivs", "").strip()}
    need(int(caps["CapEff"], 16) == int(caps["CapPrm"], 16) == ROOT_CAPS
         and int(caps["CapInh"], 16) == int(caps["CapAmb"], 16) == 0
         and status.get("NoNewPrivs", "").strip() == "1", "R33_METHOD_OWNER_PRIVILEGES_CHANGED")
    need(not any(os.environ.get(k) for k in ("PYTHONHOME", "PYTHONPATH", "LD_PRELOAD", "LD_LIBRARY_PATH")),
         "R33_METHOD_OWNER_ENVIRONMENT_CHANGED")
    return {"realEffectiveSavedUID": list(os.getresuid()), "realEffectiveSavedGID": list(os.getresgid()),
            "capabilities": caps, "noNewPrivileges": 1, "rootCapabilitiesAreZero": False,
            "generatedDefinitionsLoaded": False, "methodExecutedAsRoot": False}


def context(nonce, early):
    early_phase(early, "RUNTIME_PROFILE")
    profile = runtime(early)
    need(N.fullmatch(nonce) is not None, "R33_METHOD_OWNER_NONCE_INVALID")
    root = Path(BASE) / nonce; control = root / "control"
    content = {}
    for name in CONTROLS:
        early_phase(early, "CONTROL_READ", name)
        content[name] = read_control(control, name)
    early_phase(early, "CONTEXT_FIELDS")
    activation, once = json.loads(content["activation.json"][0]), json.loads(content["once.json"][0])
    unit = "jarvis-single-entry-method-r33-r2-" + nonce + ".service"
    fields = {"schemaVersion": 1, "nonce": nonce, "phase": "native", "sourceProtocol": PROTOCOL,
              "fixtureSHA256": FIXTURE_SHA, "generatedSHA256": INPUT_SHA,
              "buildStaticMappingSHA256": BUILD_STATIC_SHA, "fixtureWorkSeconds": 45,
              "runtimeMaxSec": 80, "timeoutStopSec": 10, "hardParentBoundSeconds": 90}
    need(activation.get("kind") == "r33-single-entry-method-root-activation-r2"
         and once.get("kind") == "r33-single-entry-method-root-once-r2" and once.get("unit") == unit
         and all(activation.get(k) == v and once.get(k) == v for k, v in fields.items())
         and H.fullmatch(activation.get("ownerSHA256", "")) is not None
         and once.get("ownerSHA256") == activation["ownerSHA256"]
         and sha(content["owner.py"][0]) == activation["ownerSHA256"]
         and sha(content["fixture.py"][0]) == FIXTURE_SHA and sha(content["generated.py"][0]) == INPUT_SHA
         and once.get("activationSHA256") == sha(content["activation.json"][0]),
         "R33_METHOD_OWNER_CONTEXT_CHANGED")
    early_phase(early, "INVOCATION")
    need(N.fullmatch(os.environ.get("INVOCATION_ID", "")) is not None, "R33_METHOD_OWNER_INVOCATION_REQUIRED")
    early_phase(early, "CGROUP")
    groups = [line.split(":", 2)[2] for line in Path("/proc/self/cgroup").read_text().splitlines() if line.count(":") == 2]
    need("/system.slice/" + unit in groups, "R33_METHOD_OWNER_CGROUP_CHANGED")
    return root, content, activation, unit, profile


def process_identity(unit, content, activation, profile):
    fields = Path("/proc/self/stat").read_text().rsplit(")", 1)[1].split()
    s = os.stat("/proc/" + str(os.getpid()), follow_symlinks=False)
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    need(len(fields) >= 20 and fields[19].isdigit() and BOOT.fullmatch(boot), "R33_METHOD_OWNER_IDENTITY_INCOMPLETE")
    return {"pid": os.getpid(), "ppid": int(fields[1]), "startTicks": fields[19], "boot": boot,
            "procDevice": s.st_dev, "procInode": s.st_ino, "unit": unit,
            "controlGroup": "/system.slice/" + unit, "invocationId": os.environ["INVOCATION_ID"],
            "uid": 0, "gid": 0, "profile": profile, "ownerSHA256": activation["ownerSHA256"],
            "fixtureSHA256": FIXTURE_SHA, "generatedSHA256": INPUT_SHA,
            "activationSHA256": sha(content["activation.json"][0]), "onceSHA256": sha(content["once.json"][0]),
            "runtimeMaxSec": 80, "stopTimeoutSec": 10, "hardParentBoundSeconds": 90,
            "killMode": "control-group", "killSignal": "SIGKILL", "restart": "no"}


def fixture_record(pid, owner, command):
    path = Path("/proc") / str(pid); fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    with closing_read(fd, "fixture-proc-directory"):
        before = os.fstat(fd)
        # Proc directory ownership is not the task's credential tuple: dumpability
        # can make a UID1000 task's proc directory root-owned. Preserve both facts.
        need((before.st_uid, before.st_gid) in ((0, 0), (1000, 1000)),
             "R33_METHOD_OWNER_FIXTURE_PROC_OWNER_CHANGED")

        def text(name):
            source = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
            with closing_read(source, "fixture-" + name):
                value = b""
                while len(value) <= 1048576:
                    block = os.read(source, 65536)
                    if not block:
                        break
                    value += block
                need(len(value) <= 1048576, "R33_METHOD_OWNER_FIXTURE_READ_LIMIT")
                return value.decode("utf-8", "strict")

        fields = text("stat").rsplit(")", 1)[1].split()
        need(len(fields) >= 20 and fields[19].isdigit() and int(fields[1]) == owner["pid"],
             "R33_METHOD_OWNER_FIXTURE_PARENT_CHANGED")
        status = dict(line.split(":", 1) for line in text("status").splitlines() if ":" in line)
        profile = {"UID": [int(item) for item in status.get("Uid", "").split()],
                   "GID": [int(item) for item in status.get("Gid", "").split()],
                   "capabilities": {name: status.get(name, "invalid").strip() for name in ("CapEff", "CapPrm", "CapInh", "CapAmb")},
                   "noNewPrivileges": status.get("NoNewPrivs", "").strip()}
        need(profile["UID"] == profile["GID"] == [1000, 1000, 1000, 1000]
             and profile["noNewPrivileges"] == "1" and all(int(v, 16) == 0 for v in profile["capabilities"].values()),
             "R33_METHOD_OWNER_FIXTURE_CREDENTIALS_CHANGED")
        argv_raw = text("cmdline")
        need(argv_raw.split("\0") == command + [""], "R33_METHOD_OWNER_FIXTURE_COMMAND_CHANGED")
        groups = [line.split(":", 2)[2] for line in text("cgroup").splitlines() if line.count(":") == 2]
        need(owner["controlGroup"] in groups, "R33_METHOD_OWNER_FIXTURE_CGROUP_CHANGED")
        again = text("stat").rsplit(")", 1)[1].split(); after = os.stat(path, follow_symlinks=False)
        need(fields[19] == again[19] and fields[1] == again[1]
             and (before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
             and Path("/proc/sys/kernel/random/boot_id").read_text().strip() == owner["boot"],
             "R33_METHOD_OWNER_FIXTURE_IDENTITY_CHANGED")
        return {"pid": pid, "ppid": int(fields[1]), "startTicks": fields[19], "boot": owner["boot"],
                "procDevice": before.st_dev, "procInode": before.st_ino, "uid": 1000, "gid": 1000,
                "procDirectoryUID": before.st_uid, "procDirectoryGID": before.st_gid, "profile": profile,
                "controlGroup": owner["controlGroup"], "argvSHA256": sha(argv_raw.encode()),
                "commandSHA256": sha(json.dumps(command, separators=(",", ":")).encode())}


def bind_fixture(process, owner, command, held):
    before = os.stat("/proc/" + str(process.pid), follow_symlinks=False)
    held["fd"] = os.pidfd_open(process.pid, 0)
    after = os.stat("/proc/" + str(process.pid), follow_symlinks=False)
    need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino), "R33_METHOD_OWNER_FIXTURE_ATTACH_CHANGED")
    value = fixture_record(process.pid, owner, command)
    need((value["procDevice"], value["procInode"]) == (before.st_dev, before.st_ino), "R33_METHOD_OWNER_FIXTURE_ATTACH_CHANGED")
    held["identity"] = value
    return value


def fixture_poll(fd):
    poll = select.poll(); poll.register(fd, select.POLLIN); events = poll.poll(0)
    need(len(events) <= 1 and all(item[0] == fd for item in events), "R33_METHOD_OWNER_FIXTURE_POLL_UNKNOWN")
    mask = events[0][1] if events else 0
    need(mask == 0 or (mask & select.POLLIN and not mask & ~(select.POLLIN | select.POLLHUP)),
         "R33_METHOD_OWNER_FIXTURE_POLL_UNKNOWN")
    return mask


def close_pidfd(fd):
    os.close(fd)
    try:
        os.fstat(fd)
    except OSError as error:
        need(error.errno == errno.EBADF, "R33_METHOD_OWNER_PIDFD_CLOSE_UNPROVEN")
    else:
        raise RuntimeError("R33_METHOD_OWNER_PIDFD_STILL_OPEN")


def fixture_exit_proof(held, owner):
    identity = held.get("identity")
    need(identity is not None and identity["ppid"] == owner["pid"] and identity["boot"] == owner["boot"]
         and Path("/proc/sys/kernel/random/boot_id").read_text().strip() == owner["boot"],
         "R33_METHOD_OWNER_FIXTURE_IDENTITY_UNBOUND")
    events = fixture_poll(held["fd"]); need(events & select.POLLIN, "R33_METHOD_OWNER_FIXTURE_EXIT_UNPROVEN")
    try:
        os.stat("/proc/" + str(identity["pid"]), follow_symlinks=False)
    except FileNotFoundError as error:
        need(error.errno == errno.ENOENT, "R33_METHOD_OWNER_FIXTURE_ABSENCE_UNKNOWN")
    else:
        raise RuntimeError("R33_METHOD_OWNER_FIXTURE_PID_PRESENT")
    return {"type": "parent-owned-fixture-pidfd-POLLIN", "requestedPID": identity["pid"],
            "processIdentity": identity, "attached": True, "identityBound": True,
            "exitConfirmed": True, "pollEvents": events, "procPathAbsent": True}


def finish_fixture(process, held, owner, command):
    if process is None or process.poll() is not None:
        return
    # EOF is the natural failure path when binding fails before source admission.
    # Never release generated bytes after a failed bind or start a second fixture.
    if process.stdin is not None and not process.stdin.closed:
        process.stdin.close()
        process.stdin = None
    try:
        process.communicate(timeout=6)
    except subprocess.TimeoutExpired:
        need(held.get("identity") is not None and held.get("fd") is not None
             and fixture_poll(held["fd"]) == 0, "R33_METHOD_OWNER_STOP_UNBOUND")
        need(fixture_record(process.pid, owner, command) == held["identity"], "R33_METHOD_OWNER_STOP_IDENTITY_CHANGED")
        held["emergencyStopAttempted"] = True
        signal.pidfd_send_signal(held["fd"], signal.SIGKILL, None, 0)
        process.communicate(timeout=3)


def validate_fixture_result(value, fixture):
    """Data only. Never import/execute fixture code in this trusted root process."""
    need(type(value) is dict and value.get("schemaVersion") == 1
         and value.get("kind") == "r33-single-entry-bound-method-fixture-result" and value.get("phase") == "native"
         and type(value.get("fixtureQualified")) is bool, "R33_METHOD_OWNER_RESULT_SCOPE_CHANGED")
    false_keys = ("wholeProgramQualified", "fullProtectionQualified", "fullProcCensusExecuted", "foreignProcessInspected",
                  "protectedInventoryRead", "nodeACKRead", "queueRead", "productCodeExecuted", "modelsInvoked",
                  "getfdFallbackUsed", "entryToPIDRaceEliminated", "externalHoldersAbsenceProved",
                  "parentImplementedByThisFixture", "independentClosureVerified", "rawArgvExported", "privateEnvironmentExported")
    need(all(value.get(k) is False for k in false_keys)
         and value.get("internalWorkSeconds") == 45 and value.get("cleanupWaitSeconds") == [3, 3]
         and value.get("requiredParentWorkSeconds") == 80 and value.get("requiredParentStopSeconds") == 10
         and value.get("requiredParentTotalSeconds") == 90, "R33_METHOD_OWNER_RESULT_BOUNDARY_CHANGED")
    need(type(value.get("descriptorLedger")) is list and len(value["descriptorLedger"]) <= 1000
         and type(value.get("secondaryFailures")) is list and len(value["secondaryFailures"]) <= 8,
         "R33_METHOD_OWNER_RESULT_LEDGER_CHANGED")
    if value["fixtureQualified"] is False:
        return value
    source, runtime = value.get("source"), value.get("runtime")
    need(type(source) is dict and source.get("phase") == "native" and source.get("generatedSourceSHA256") == INPUT_SHA
         and source.get("generatorSHA256") == GENERATOR_SHA and source.get("pureModuleSHA256") == MODULE_SHA
         and source.get("selectedSourceSHA256") == SELECTED_SHA
         and all(source.get(k) is False for k in ("wholeProgramTopLevelExecuted", "censusDefinitionLoaded", "actualSourceMappingQualified")),
         "R33_METHOD_OWNER_RESULT_SOURCE_CHANGED")
    need(type(runtime) is dict and runtime.get("realEffectiveSavedUID") == runtime.get("realEffectiveSavedGID") == [1000, 1000, 1000]
         and runtime.get("noNewPrivileges") == 1 and runtime.get("isolatedPython") is True
         and runtime.get("rootOwnerProfileAsserted") is False and runtime.get("cgroups") == [fixture["controlGroup"]]
         and all(int(v, 16) == 0 for v in runtime.get("capabilities", {}).values())
         and set(runtime.get("capabilities", {})) == {"CapEff", "CapPrm", "CapInh"},
         "R33_METHOD_OWNER_RESULT_RUNTIME_CHANGED")
    own = runtime.get("fixtureIdentity")
    need(type(own) is dict and all(own.get(k) == fixture[k] for k in ("pid", "ppid", "boot", "startTicks", "procDevice", "procInode")),
         "R33_METHOD_OWNER_RESULT_FIXTURE_IDENTITY_CHANGED")
    child = value.get("childIdentity"); live = value.get("liveRecord"); proof = value.get("originalBoundExitProof")
    need(type(child) is dict and set(child) == {"pid", "ppid", "startTicks", "boot", "procDevice", "procInode"}
         and type(child["pid"]) is int and child["pid"] > 1 and child["ppid"] == fixture["pid"]
         and child["boot"] == fixture["boot"] and value.get("requestedChildPID") == child["pid"]
         and type(live) is dict and all(live.get(k) == child[k] for k in child)
         and live.get("uid") == 1000 and live.get("state") != "Z" and live.get("cgroups") == runtime["cgroups"],
         "R33_METHOD_OWNER_RESULT_CHILD_IDENTITY_CHANGED")
    need(type(proof) is dict and proof.get("processIdentity") == child and proof.get("pid") == child["pid"]
         and proof.get("boot") == child["boot"] and proof.get("listedProcIdentity") == {"device": child["procDevice"], "inode": child["procInode"]},
         "R33_METHOD_OWNER_RESULT_EXIT_IDENTITY_CHANGED")
    kernel = proof.get("kernelProof", {})
    need(set(kernel) == {"type", "attached", "identityBound", "requestedPID", "exitConfirmed", "pollEvents", "procPathAbsent"}
         and kernel.get("type") == "pidfd-POLLIN" and kernel.get("requestedPID") == child["pid"]
         and kernel.get("pollEvents") in (1, 17)
         and all(kernel.get(k) is True for k in ("attached", "identityBound", "exitConfirmed", "procPathAbsent")),
         "R33_METHOD_OWNER_RESULT_EXIT_PROOF_CHANGED")
    need(all(value.get(k) is True for k in ("methodSubsetExercised", "readyHandshakeCompleted", "releaseGateSent", "naturalChildExit",
                                          "childReaped", "descriptorClosed")) and value.get("signalsSent") is False
         and value.get("firstFailure") is None and value.get("secondaryFailures") == [] and value.get("fixturePhase") == "COMPLETE"
         and value.get("childExitCode") == 0
         and all(row.get("closeAttempted") is True and row.get("closed") is True and row.get("closeError") is None
                 for row in value["descriptorLedger"]), "R33_METHOD_OWNER_RESULT_LIFECYCLE_CHANGED")
    own_dir, child_fd = value.get("selfAcquisition", {}), value.get("childFDAcquisition", {})
    need(own_dir.get("numericPIDPathUsed") is True and own_dir.get("eofObserved") is True
         and own_dir.get("adapterMatchedPrimitiveWithoutDotEntries") is True and own_dir.get("adapterBorrowedFDStayedOpen") is True
         and type(own_dir.get("primitiveRecords")) is list and own_dir.get("primitiveCallsIncludingEOF") == len(own_dir["primitiveRecords"]) + 1
         and child_fd.get("borrowedFDStayedOpen") is True and child_fd.get("getfdUsed") is False
         and type(child_fd.get("knownPipeSlots")) is dict and len(child_fd["knownPipeSlots"]) == 2
         and all(row.get("matched") is True for row in child_fd["knownPipeSlots"].values()),
         "R33_METHOD_OWNER_RESULT_ACQUISITION_CHANGED")
    return value


def closed_error(error, phase):
    text = str(error)
    return {"phase": phase, "errorCode": text if re.fullmatch(r"R33_METHOD_OWNER_[A-Z0-9_]{1,100}", text)
            else "R33_METHOD_OWNER_INCOMPLETE", "errno": error.errno if type(getattr(error, "errno", None)) is int else None}


def run_main(early):
    if len(sys.argv) != 3 or sys.argv[1] not in ("--run", "--stopped") or N.fullmatch(sys.argv[2]) is None:
        print(json.dumps({"kind": "r33-single-entry-method-owner-preparation-r2", "ready": False,
                          "runtimeIOPerformed": False, "actualMethodQualified": False}))
        return 1
    nonce = sys.argv[2]
    early.update({"nonce": nonce, "action": sys.argv[1]})
    root, content, activation, unit, profile = context(nonce, early)
    early_phase(early, "OWNER_IDENTITY")
    identity = process_identity(unit, content, activation, profile)
    if sys.argv[1] == "--stopped":
        early_phase(early, "STOP_STATUS")
        service, code, status = (os.environ.get(k) for k in ("SERVICE_RESULT", "EXIT_CODE", "EXIT_STATUS"))
        need(service in ("success", "timeout", "exit-code", "signal", "core-dump", "resources", "protocol", "start-limit-hit", "watchdog", "oom-kill")
             and code in (None, "exited", "killed", "dumped") and (status is None or re.fullmatch(r"[A-Z0-9]+", status)),
             "R33_METHOD_OWNER_STOP_STATUS_UNKNOWN")
        early_phase(early, "STOP_RECORD_SAVE")
        save_work(root / "work", "stopped.json", {"kind": "r33-single-entry-method-owner-stopped-r2", "nonce": nonce, "unit": unit,
                  "invocationId": os.environ["INVOCATION_ID"], "serviceResult": service, "exitCode": code, "exitStatus": status,
                  "stopProcessIdentity": identity, "ownerSHA256": activation["ownerSHA256"], "activationSHA256": sha(content["activation.json"][0]),
                  "methodQualified": False, "fullProtectionQualified": False})
        return 0
    early_phase(early, "OWNER_PIDFD_OPEN")
    self_fd = os.pidfd_open(identity["pid"], 0)
    try:
        early_phase(early, "OWNER_PIDFD_VERIFY")
        need(fixture_poll(self_fd) == 0 and proc_identity_matches(identity), "R33_METHOD_OWNER_SELF_IDENTITY_CHANGED")
        identity["selfPIDFD"] = {"requestedPID": identity["pid"], "attached": True, "identityBound": True,
                                  "livePollEvents": 0, "fdIdentity": key(os.fstat(self_fd))}
        early_phase(early, "OWNER_RECORD_SAVE")
        save_work(root / "work", "owner.json", identity)
        early_phase(early, "FIXTURE_LIFECYCLE")
        result = None; process = None; stdout = stderr = None; proof = None; held = {"fd": None, "identity": None}
        first = None; secondary = []; fixture_closed = False; phase = "FIXTURE_INPUT"
        command = ["/usr/bin/python3", "-I", str(root / "control" / "fixture.py"), "--phase=native"]
        try:
            phase = "FIXTURE_SPAWN"
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, close_fds=True,
                                       user=1000, group=1000, extra_groups=[], umask=0o077)
            # The unchanged fixture blocks in stdin.read until this exact PIDFD,
            # metadata/credentials/argv chain and immutable record are established.
            phase = "FIXTURE_BIND"; fixture_identity = bind_fixture(process, identity, command, held)
            save_work(root / "work", "fixture-process.json", fixture_identity)
            phase = "FIXTURE_WAIT"; stdout, stderr = process.communicate(input=content["generated.py"][0], timeout=55)
            need(len(stdout) <= 1048576 and len(stderr) <= 1048576, "R33_METHOD_OWNER_OUTPUT_LIMIT")
            phase = "FIXTURE_RAW_SAVE"
            save_bytes_work(root / "work", "fixture.stdout.json", stdout)
            save_bytes_work(root / "work", "fixture.stderr.raw", stderr)
            # Original stdout has been durably saved before parsing or validation.
            phase = "FIXTURE_PARSE"; result = json.loads(stdout)
            phase = "FIXTURE_VALIDATE"; validate_fixture_result(result, fixture_identity)
            phase = "FIXTURE_EXIT_PROOF"; proof = fixture_exit_proof(held, identity)
        except BaseException as error:
            first = closed_error(error, phase)
            secondary.extend(getattr(error, "secondaryCloseErrors", []))
        finally:
            try:
                finish_fixture(process, held, identity, command)
            except BaseException as error:
                row = closed_error(error, "FIXTURE_CLEANUP")
                if first is None: first = row
                else: secondary.append(row)
            if held["fd"] is not None:
                try:
                    close_pidfd(held["fd"]); fixture_closed = True
                except BaseException as error:
                    row = closed_error(error, "FIXTURE_PIDFD_CLOSE")
                    if first is None: first = row
                    else: secondary.append(row)
            try:
                need({name: read_control(root / "control", name) for name in content} == content,
                     "R33_METHOD_OWNER_CONTROL_CHANGED_AFTER")
            except BaseException as error:
                row = closed_error(error, "SOURCE_FINAL")
                if first is None: first = row
                else: secondary.append(row)
            self_closed = False
            try:
                closing_self_fd = self_fd; self_fd = None
                close_pidfd(closing_self_fd); self_closed = True
            except BaseException as error:
                row = closed_error(error, "OWNER_PIDFD_CLOSE")
                if first is None: first = row
                else: secondary.append(row)
            passed = bool(process is not None and process.returncode == 0 and result is not None and result.get("fixtureQualified") is True
                          and proof is not None and fixture_closed and self_closed and first is None and not held.get("emergencyStopAttempted", False))
            save_work(root / "work", "result.json", {"schemaVersion": 1, "kind": "r33-single-entry-method-owner-result-r2", "nonce": nonce,
                      "phase": "native", "sourceProtocol": PROTOCOL, "owner": identity, "fixtureProcessIdentity": held["identity"],
                      "requestedFixturePID": process.pid if process is not None else None,
                      "fixtureResult": result, "fixtureExitCode": process.returncode if process is not None else None,
                      "fixtureStdoutSHA256": sha(stdout) if stdout is not None else None, "fixtureStderrSHA256": sha(stderr) if stderr is not None else None,
                      "fixtureKernelExitProof": proof, "fixturePIDFDClosed": fixture_closed, "ownerSelfPIDFDClosed": self_closed,
                      "emergencyStopAttempted": held.get("emergencyStopAttempted", False), "firstFailure": first, "secondaryFailures": secondary,
                      "methodSubsetProducerPassed": passed, "actualMethodIndependentlyQualified": False,
                      "currentScopeCleanupIndependentlyVerified": False, "fullProtectionQualified": False, "productCodeExecuted": False,
                      "modelsInvoked": False, "buildWholeProgramExecuted": False})
        return 0 if passed else 1
    finally:
        if self_fd is not None:
            primary = sys.exc_info()[1]
            try:
                os.close(self_fd)
            except BaseException as error:
                if primary is None:
                    early_phase(early, "OWNER_PIDFD_CLOSE")
                    raise
                rows = getattr(primary, "secondaryCloseErrors", [])
                if len(rows) < 8:
                    rows.append(closed_error(error, "OWNER_PIDFD_CLOSE"))
                primary.secondaryCloseErrors = rows


def main():
    early = {"phase": "ARGUMENTS", "nonce": None, "action": None, "control": None}
    try:
        return run_main(early)
    except BaseException as error:
        # This writer uses inherited stderr, independent of whichever context/work guard failed.
        # A writer failure also remains a failure; it never fabricates owner/result/stop success.
        try:
            write_early_failure(error, early)
        except BaseException as writer_error:
            rows = getattr(error, "secondaryCloseErrors", [])
            if len(rows) < 8:
                rows.append(closed_error(writer_error, "EARLY_RECORD_SAVE"))
            error.secondaryCloseErrors = rows
            raise error from writer_error
        return 1


def proc_identity_matches(identity):
    s = os.stat("/proc/" + str(identity["pid"]), follow_symlinks=False)
    return (s.st_dev, s.st_ino) == (identity["procDevice"], identity["procInode"])


if __name__ == "__main__":
    raise SystemExit(main())
