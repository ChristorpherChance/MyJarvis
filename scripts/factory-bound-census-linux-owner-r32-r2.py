"""Unprivileged finite tool owner. No product, inventory, network, or database code."""
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

BASE = "/var/lib/jarvis-bound-census-linux-r32-r2"
FIXTURE_SHA = "85ce3f6cd528851f360453ccab5e46208a6708cd45a9e45992524f8192d2e15d"
INPUT_SHA = {"native": "b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78",
             "build": "e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba"}
N = re.compile(r"[a-f0-9]{32}\Z")
H = re.compile(r"[a-f0-9]{64}\Z")


def need(value, code):
    if not value:
        raise RuntimeError(code)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def key(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def root_directory(path):
    fd = os.open("/", os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in Path(path).parts[1:]:
            before = os.stat(name, dir_fd=fd, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0
                 and not before.st_mode & 0o022 and before.st_mode & 0o001,
                 "R32_BOUND_OWNER_PARENT_UNTRUSTED")
            child = os.open(name, os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                need(key(before) == key(os.fstat(child)), "R32_BOUND_OWNER_PARENT_CHANGED")
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_control(control, name):
    fd = root_directory(control)
    try:
        s = os.stat(name, dir_fd=fd, follow_symlinks=False)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == s.st_gid == 0 and s.st_nlink == 1
             and stat.S_IMODE(s.st_mode) == 0o444 and s.st_size <= 1048576,
             "R32_BOUND_OWNER_CONTROL_UNTRUSTED")
        source = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            need(key(s) == key(os.fstat(source)), "R32_BOUND_OWNER_CONTROL_CHANGED")
            data = b""
            while len(data) <= s.st_size:
                block = os.read(source, min(65536, s.st_size + 1 - len(data)))
                if not block:
                    break
                data += block
            need(len(data) == s.st_size and key(s) == key(os.fstat(source))
                 == key(os.stat(name, dir_fd=fd, follow_symlinks=False)),
                 "R32_BOUND_OWNER_CONTROL_CHANGED")
            return data, key(s)
        finally:
            os.close(source)
    finally:
        os.close(fd)


def save_bytes_work(work, name, raw):
    parent = root_directory(work.parent)
    try:
        before = os.stat(work.name, dir_fd=parent, follow_symlinks=False)
        need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 1000
             and stat.S_IMODE(before.st_mode) == 0o700, "R32_BOUND_OWNER_WORK_UNTRUSTED")
        d = os.open(work.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            need(key(before) == key(os.fstat(d)), "R32_BOUND_OWNER_WORK_CHANGED")
            f = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=d)
            try:
                view = memoryview(raw)
                while view:
                    count = os.write(f, view)
                    need(type(count) is int and 0 < count <= len(view), "R32_BOUND_OWNER_SHORT_WRITE")
                    view = view[count:]
                os.fchmod(f, 0o600)
                os.fsync(f)
            finally:
                os.close(f)
            os.fsync(d)
        finally:
            os.close(d)
    finally:
        os.close(parent)


def save_work(work, name, value):
    save_bytes_work(work, name, json.dumps(value, separators=(",", ":")).encode() + b"\n")


def runtime():
    need(sys.platform == "linux" and os.getresuid() == (1000, 1000, 1000)
         and os.getresgid() == (1000, 1000, 1000), "R32_BOUND_OWNER_UID_REQUIRED")
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines() if ":" in line)
    need(int(status.get("CapEff", "invalid").strip(), 16) == 0
         and status.get("NoNewPrivs", "").strip() == "1", "R32_BOUND_OWNER_PRIVILEGES_CHANGED")
    need(not any(os.environ.get(k) for k in ["PYTHONHOME", "PYTHONPATH", "LD_PRELOAD", "LD_LIBRARY_PATH"]),
         "R32_BOUND_OWNER_ENVIRONMENT_CHANGED")


def context(nonce):
    runtime()
    need(N.fullmatch(nonce) is not None, "R32_BOUND_OWNER_NONCE_INVALID")
    root = Path(BASE) / nonce
    control = root / "control"
    names = ["owner.py", "fixture.py", "generated.py", "activation.json", "once.json"]
    content = {name: read_control(control, name) for name in names}
    activation = json.loads(content["activation.json"][0])
    once = json.loads(content["once.json"][0])
    phase = activation.get("phase")
    unit = "jarvis-bound-census-r32-r2-" + nonce + ".service"
    need(activation.get("kind") == "r32-bound-census-root-activation-r2" and activation.get("nonce") == nonce
         and phase in INPUT_SHA and activation.get("fixtureSHA256") == FIXTURE_SHA
         and activation.get("generatedSHA256") == INPUT_SHA[phase]
         and sha(content["fixture.py"][0]) == FIXTURE_SHA
         and sha(content["generated.py"][0]) == INPUT_SHA[phase]
         and H.fullmatch(activation.get("ownerSHA256", "")) is not None
         and sha(content["owner.py"][0]) == activation["ownerSHA256"]
         and once.get("kind") == "r32-bound-census-root-once-r2" and once.get("nonce") == nonce
         and once.get("phase") == phase and once.get("unit") == unit
         and once.get("ownerSHA256") == activation["ownerSHA256"]
         and once.get("generatedSHA256") == INPUT_SHA[phase]
         and once.get("fixtureSHA256") == FIXTURE_SHA,
         "R32_BOUND_OWNER_CONTEXT_CHANGED")
    need(os.environ.get("INVOCATION_ID") is not None and N.fullmatch(os.environ["INVOCATION_ID"]) is not None,
         "R32_BOUND_OWNER_INVOCATION_REQUIRED")
    cgroups = [line.split(":", 2)[2] for line in Path("/proc/self/cgroup").read_text().splitlines() if line.count(":") >= 2]
    need("/system.slice/" + unit in cgroups, "R32_BOUND_OWNER_CGROUP_CHANGED")
    return root, content, activation, unit


def process_identity(unit, content, activation):
    fields = Path("/proc/self/stat").read_text().rsplit(")", 1)[1].split()
    s = os.stat("/proc/" + str(os.getpid()), follow_symlinks=False)
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    need(len(fields) >= 20 and fields[19].isdigit() and re.fullmatch(r"[a-f0-9-]{36}", boot),
         "R32_BOUND_OWNER_IDENTITY_INCOMPLETE")
    return {"pid": os.getpid(), "startTicks": fields[19], "boot": boot, "procDevice": s.st_dev,
            "procInode": s.st_ino, "unit": unit, "controlGroup": "/system.slice/" + unit,
            "invocationId": os.environ["INVOCATION_ID"], "uid": 1000, "gid": 1000,
            "ownerSHA256": activation["ownerSHA256"], "fixtureSHA256": FIXTURE_SHA,
            "generatedSHA256": activation["generatedSHA256"], "activationSHA256": sha(content["activation.json"][0]),
            "onceSHA256": sha(content["once.json"][0]), "runtimeMaxSec": 80, "stopTimeoutSec": 10,
            "hardParentBoundSeconds": 90, "killMode": "control-group",
            "killSignal": "SIGKILL", "restart": "no", "noNewPrivileges": True, "capabilitiesEmpty": True}


def fixture_record(pid, owner, command):
    path = Path("/proc") / str(pid)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(before.st_uid == 1000, "R32_BOUND_OWNER_FIXTURE_UID_CHANGED")

        def text(name):
            source = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                value = b""
                while len(value) <= 1048576:
                    block = os.read(source, 65536)
                    if not block:
                        break
                    value += block
                need(len(value) <= 1048576, "R32_BOUND_OWNER_FIXTURE_READ_LIMIT")
                return value.decode("utf-8", "strict")
            finally:
                os.close(source)

        fields = text("stat").rsplit(")", 1)[1].split()
        need(len(fields) >= 20 and fields[19].isdigit() and int(fields[1]) == owner["pid"],
             "R32_BOUND_OWNER_FIXTURE_PARENT_CHANGED")
        argv_raw = text("cmdline")
        need(argv_raw.split("\0") == command + [""], "R32_BOUND_OWNER_FIXTURE_COMMAND_CHANGED")
        groups = [line.split(":", 2)[2] for line in text("cgroup").splitlines() if line.count(":") >= 2]
        need(owner["controlGroup"] in groups, "R32_BOUND_OWNER_FIXTURE_CGROUP_CHANGED")
        again = text("stat").rsplit(")", 1)[1].split()
        after = os.stat(path, follow_symlinks=False)
        need(fields[19] == again[19] and fields[1] == again[1]
             and (before.st_dev, before.st_ino) == (after.st_dev, after.st_ino),
             "R32_BOUND_OWNER_FIXTURE_IDENTITY_CHANGED")
        need(Path("/proc/sys/kernel/random/boot_id").read_text().strip() == owner["boot"],
             "R32_BOUND_OWNER_FIXTURE_BOOT_CHANGED")
        return {"pid": pid, "ppid": int(fields[1]), "startTicks": fields[19], "boot": owner["boot"],
                "procDevice": before.st_dev, "procInode": before.st_ino, "uid": 1000,
                "controlGroup": owner["controlGroup"], "argvSHA256": sha(argv_raw.encode()),
                "commandSHA256": sha(json.dumps(command, separators=(",", ":")).encode())}
    finally:
        os.close(fd)


def bind_fixture(process, owner, command, held):
    before = os.stat("/proc/" + str(process.pid), follow_symlinks=False)
    held["fd"] = os.pidfd_open(process.pid, 0)  # Register before any subsequent operation can fail.
    after = os.stat("/proc/" + str(process.pid), follow_symlinks=False)
    need((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino),
         "R32_BOUND_OWNER_FIXTURE_ATTACH_IDENTITY_CHANGED")
    identity = fixture_record(process.pid, owner, command)
    need((identity["procDevice"], identity["procInode"]) == (before.st_dev, before.st_ino),
         "R32_BOUND_OWNER_FIXTURE_ATTACH_IDENTITY_CHANGED")
    held["identity"] = identity
    return identity


def fixture_poll(fd):
    poll = select.poll()
    poll.register(fd, select.POLLIN)
    events = poll.poll(0)
    need(len(events) <= 1 and all(item[0] == fd for item in events), "R32_BOUND_OWNER_FIXTURE_POLL_UNKNOWN")
    mask = events[0][1] if events else 0
    need(mask == 0 or (mask & select.POLLIN and not mask & ~(select.POLLIN | select.POLLHUP)),
         "R32_BOUND_OWNER_FIXTURE_POLL_UNKNOWN")
    return mask


def fixture_exit_proof(held, owner):
    identity = held.get("identity")
    need(identity is not None and identity["ppid"] == owner["pid"] and identity["boot"] == owner["boot"]
         and Path("/proc/sys/kernel/random/boot_id").read_text().strip() == owner["boot"],
         "R32_BOUND_OWNER_FIXTURE_IDENTITY_UNBOUND")
    events = fixture_poll(held["fd"])
    need(events & select.POLLIN, "R32_BOUND_OWNER_FIXTURE_EXIT_NOT_PROVED")
    try:
        os.stat("/proc/" + str(identity["pid"]), follow_symlinks=False)
    except FileNotFoundError as error:
        need(error.errno == errno.ENOENT, "R32_BOUND_OWNER_FIXTURE_ABSENCE_UNKNOWN")
    else:
        raise RuntimeError("R32_BOUND_OWNER_FIXTURE_EXIT_PID_PRESENT")
    return {"type": "parent-owned-fixture-pidfd-POLLIN", "requestedPID": identity["pid"],
            "processIdentity": identity, "attached": True, "identityBound": True,
            "exitConfirmed": True, "pollEvents": events, "procPathAbsent": True}


def finish_fixture(process, held, owner, command):
    """Reap naturally first; an emergency signal requires a currently matching owned PIDFD."""
    if process is None or process.poll() is not None:
        return False
    try:
        process.communicate(timeout=6)
        return False
    except subprocess.TimeoutExpired:
        need(held.get("identity") is not None and held.get("fd") is not None,
             "R32_BOUND_OWNER_FIXTURE_STOP_IDENTITY_UNBOUND")
        need(fixture_poll(held["fd"]) == 0, "R32_BOUND_OWNER_FIXTURE_STOP_ALREADY_EXITED")
        need(fixture_record(process.pid, owner, command) == held["identity"],
             "R32_BOUND_OWNER_FIXTURE_STOP_IDENTITY_CHANGED")
        held["emergencyStopAttempted"] = True
        signal.pidfd_send_signal(held["fd"], signal.SIGKILL, None, 0)
        process.communicate(timeout=3)
        return True


# Source recipe only; copied into the new pinned owner/controller, never imported remotely.
R2_FUNCTION_SHA = {
    "process_record": "ef969eb538c98e9614a558da26986ab6a4247c6ec1edd6a6728b2b5fc95f2c93",
    "pidfd_poll": "94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533",
    "pidfd_exit_proof": "ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109",
}
R2_READY_PROTOCOL_SHA = "14bf08734c1a58057bb3df1c7427f1896ae91b11c8c4b3b5698f9c71a61becb4"
R2_FIXTURE_PHASES = {
    "ARGUMENTS", "RUNTIME", "SOURCE_INPUT", "SOURCE_FUNCTIONS", "BOOT_IDENTITY",
    "PIPE_CREATE", "CHILD_SPAWN", "PARENT_CHILD_ENDS_CLOSE", "READY_HANDSHAKE",
    "PIDFD_ATTACH", "PROCESS_RECORD", "LIVE_RECORD_VALIDATE", "RELEASE_GATE",
    "NATURAL_EXIT", "BOUND_EXIT_PROOF", "DEAD_ATTACH", "CHILD_CLEANUP",
    "DESCRIPTOR_CLOSE", "DESCRIPTOR_VERIFY", "COMPLETE",
}
R2_READ_SUBPHASES = {
    "PIDFD_OPEN", "POST_ATTACH_PROC_IDENTITY", "PROCESS_READ", "PROC_DIRECTORY_OPEN",
    "PROC_DIRECTORY_METADATA", "STAT_BEFORE", "CMDLINE_READ", "CGROUP_READ", "CWD_READLINK",
    "EXE_READLINK", "FD_DIRECTORY_OPEN", "FD_SCANDIR_OPEN", "FD_SCANDIR_NEXT",
    "FD_SCANDIR_CLOSE", "FD_ENTRY_LIMIT", "FD_TARGET_READLINK", "FD_DIRECTORY_CLOSE",
    "STAT_AFTER", "PROC_PATH_IDENTITY_AFTER", "PROC_DIRECTORY_CLOSE", "PIDFD_POLL",
    "PIDFD_EXIT_PATH_CHECK", "SCAN_CLOSE_PROC_IDENTITY", "SCAN_CLOSE",
}


def r2_error_row(value):
    need(type(value) is dict and set(value) == {"fixturePhase", "firstReadSubphase", "errorCode", "errno"},
         "R32_BOUND_OWNER_FIXTURE_R2_ERROR_SHAPE_CHANGED")
    need(type(value["fixturePhase"]) is str and value["fixturePhase"] in R2_FIXTURE_PHASES
         and (value["firstReadSubphase"] is None or type(value["firstReadSubphase"]) is str
              and value["firstReadSubphase"] in R2_READ_SUBPHASES)
         and type(value["errorCode"]) is str
         and re.fullmatch(r"(?:R32_FIXTURE|R29_CLEANUP)_[A-Z0-9_]{1,100}", value["errorCode"])
         and (value["errno"] is None or type(value["errno"]) is int and 0 <= value["errno"] <= 4095),
         "R32_BOUND_OWNER_FIXTURE_R2_DIAGNOSTIC_CHANGED")


def r2_child_identity(value, nullable, fixture):
    if value is None:
        need(nullable, "R32_BOUND_OWNER_FIXTURE_R2_CHILD_UNBOUND")
        return
    need(type(value) is dict and set(value) == {"pid", "boot", "procDevice", "procInode", "ppid", "startTicks"},
         "R32_BOUND_OWNER_FIXTURE_R2_CHILD_SHAPE_CHANGED")
    need(type(value["pid"]) is int and value["pid"] > 1
         and type(value["procDevice"]) is int and value["procDevice"] >= 0
         and type(value["procInode"]) is int and value["procInode"] > 0
         and type(value["boot"]) is str and re.fullmatch(r"[a-f0-9-]{36}", value["boot"])
         and (nullable and value["ppid"] is None or type(value["ppid"]) is int and value["ppid"] >= 0)
         and (nullable and value["startTicks"] is None or type(value["startTicks"]) is str
              and re.fullmatch(r"[0-9]+", value["startTicks"])), "R32_BOUND_OWNER_FIXTURE_R2_CHILD_CHANGED")
    need(type(fixture) is dict and value["boot"] == fixture["boot"]
         and (value["ppid"] is None or value["ppid"] == fixture["pid"]),
         "R32_BOUND_OWNER_FIXTURE_R2_CHILD_PARENT_CHANGED")


def validate_fixture_result_r2(value, phase, generated_sha, fixture):
    need(type(value) is dict and type(value.get("schemaVersion")) is int and value.get("schemaVersion") == 1
         and value.get("kind") == "r32-bound-census-linux-subset-qualification-r2"
         and value.get("phase") == phase and type(value.get("fixtureQualified")) is bool,
         "R32_BOUND_OWNER_FIXTURE_R2_SCOPE_CHANGED")
    false_keys = {"fullProtectionQualified", "fullProcCensusExecuted", "protectedInventoryRead", "nodeACKRead",
                  "queueRead", "productCodeExecuted", "modelsInvoked", "rawArgvExported", "privateEnvironmentExported"}
    need(all(value.get(k) is False for k in false_keys), "R32_BOUND_OWNER_FIXTURE_R2_FALSE_FLAGS_CHANGED")
    common = {"schemaVersion", "kind", "phase", "fixtureQualified", "requestedChildPID", "childIdentity",
              "readyHandshakeCompleted", "releaseGateSent", "childReaped", "descriptorClosed", "signalsSent",
              "fixturePhase", "firstReadSubphase"} | false_keys
    need(all(type(value.get(k)) is bool for k in ["readyHandshakeCompleted", "releaseGateSent", "childReaped",
                                               "descriptorClosed", "signalsSent"]),
         "R32_BOUND_OWNER_FIXTURE_R2_STATUS_UNKNOWN")
    if value["fixtureQualified"] is False:
        need(set(value) == common | {"rawErrorExported", "errorCode", "errno", "secondaryFailures"}
             and value["rawErrorExported"] is False and type(value["secondaryFailures"]) is list
             and len(value["secondaryFailures"]) <= 8, "R32_BOUND_OWNER_FIXTURE_R2_FAILURE_SHAPE_CHANGED")
        r2_error_row({k: value[k] for k in ["fixturePhase", "firstReadSubphase", "errorCode", "errno"]})
        for row in value["secondaryFailures"]:
            r2_error_row(row)
        need(value["requestedChildPID"] is None or type(value["requestedChildPID"]) is int
             and value["requestedChildPID"] > 1, "R32_BOUND_OWNER_FIXTURE_R2_REQUESTED_PID_CHANGED")
        r2_child_identity(value["childIdentity"], True, fixture)
        if value["childIdentity"] is not None:
            need(value["requestedChildPID"] == value["childIdentity"]["pid"]
                 and value["readyHandshakeCompleted"] is True, "R32_BOUND_OWNER_FIXTURE_R2_FAILED_BIND_CHANGED")
        need(not value["releaseGateSent"] or value["requestedChildPID"] is not None,
             "R32_BOUND_OWNER_FIXTURE_R2_RELEASE_WITHOUT_CHILD")
        return value
    need(set(value) == common | {"uid", "gid", "internalDeadlineSeconds", "requiredParentDeadlineSeconds",
         "readyProtocolSHA256", "generatedSourceSHA256", "functionSHA256", "liveRecordRead", "naturalChildExit",
         "originalBoundExitProof", "alreadyDeadAttachRejected", "alreadyDeadAttachErrno"},
         "R32_BOUND_OWNER_FIXTURE_R2_SUCCESS_SHAPE_CHANGED")
    need(value["uid"] == value["gid"] == 1000 and value["internalDeadlineSeconds"] == 45
         and value["requiredParentDeadlineSeconds"] == 90 and value["readyProtocolSHA256"] == R2_READY_PROTOCOL_SHA
         and value["generatedSourceSHA256"] == generated_sha and value["functionSHA256"] == R2_FUNCTION_SHA
         and all(value[k] is True for k in ["readyHandshakeCompleted", "releaseGateSent", "descriptorClosed",
                                          "childReaped", "liveRecordRead", "naturalChildExit", "alreadyDeadAttachRejected"])
         and value["signalsSent"] is False and value["fixturePhase"] == "COMPLETE"
         and value["firstReadSubphase"] is None and type(value["alreadyDeadAttachErrno"]) is int
         and value["alreadyDeadAttachErrno"] == errno.ESRCH,
         "R32_BOUND_OWNER_FIXTURE_R2_SUCCESS_FLAGS_CHANGED")
    r2_child_identity(value["childIdentity"], False, fixture)
    need(type(value["requestedChildPID"]) is int and value["requestedChildPID"] == value["childIdentity"]["pid"],
         "R32_BOUND_OWNER_FIXTURE_R2_CHILD_PID_CHANGED")
    proof = value["originalBoundExitProof"]
    need(type(proof) is dict and set(proof) == {"pid", "boot", "listedProcIdentity", "processIdentity", "kernelProof"}
         and proof["processIdentity"] == value["childIdentity"] and proof["pid"] == value["requestedChildPID"]
         and proof["boot"] == value["childIdentity"]["boot"], "R32_BOUND_OWNER_FIXTURE_R2_EXIT_IDENTITY_CHANGED")
    listed = proof["listedProcIdentity"]
    need(type(listed) is dict and set(listed) == {"device", "inode"}
         and type(listed["device"]) is int and type(listed["inode"]) is int
         and listed["device"] == value["childIdentity"]["procDevice"]
         and listed["inode"] == value["childIdentity"]["procInode"], "R32_BOUND_OWNER_FIXTURE_R2_LIST_IDENTITY_CHANGED")
    kernel = proof["kernelProof"]
    need(type(kernel) is dict and set(kernel) == {"type", "attached", "identityBound", "requestedPID", "exitConfirmed",
         "pollEvents", "procPathAbsent"} and kernel["type"] == "pidfd-POLLIN"
         and all(kernel[k] is True for k in ["attached", "identityBound", "exitConfirmed", "procPathAbsent"])
         and type(kernel["requestedPID"]) is int and kernel["requestedPID"] == value["requestedChildPID"]
         and type(kernel["pollEvents"]) is int and kernel["pollEvents"] in [1, 17],
         "R32_BOUND_OWNER_FIXTURE_R2_EXIT_PROOF_CHANGED")
    return value


def main():
    need(len(sys.argv) == 3 and sys.argv[1] in ["--run", "--stopped"], "R32_BOUND_OWNER_ARGUMENT_INVALID")
    root, content, activation, unit = context(sys.argv[2])
    if sys.argv[1] == "--stopped":
        result = os.environ.get("SERVICE_RESULT")
        code = os.environ.get("EXIT_CODE")
        status = os.environ.get("EXIT_STATUS")
        need(result in ["success", "timeout", "exit-code", "signal", "core-dump", "resources", "protocol",
                        "start-limit-hit", "watchdog", "oom-kill"] and code in [None, "exited", "killed", "dumped"]
             and (status is None or re.fullmatch(r"[A-Z0-9]+", status)), "R32_BOUND_OWNER_STOP_STATUS_UNKNOWN")
        save_work(root / "work", "stopped.json", {"kind": "r32-bound-census-owner-stopped-r2", "nonce": sys.argv[2],
                  "unit": unit, "invocationId": os.environ["INVOCATION_ID"], "serviceResult": result,
                  "exitCode": code, "exitStatus": status, "ownerSHA256": activation["ownerSHA256"],
                  "activationSHA256": sha(content["activation.json"][0]), "productCodeExecuted": False,
                  "fullProtectionQualified": False})
        return 0
    identity = process_identity(unit, content, activation)
    save_work(root / "work", "owner.json", identity)
    result = None
    error_code = None
    process = None
    command = ["/usr/bin/python3", "-I", str(root / "control" / "fixture.py"), "--phase=" + activation["phase"]]
    held_fixture = {"fd": None, "identity": None}
    fixture_proof = None
    fixture_closed = False
    fixture_emergency = False
    stdout = None
    stderr = None
    try:
        input_fd = os.open(root / "control" / "generated.py", os.O_RDONLY | os.O_NOFOLLOW)
        try:
            need(key(os.fstat(input_fd)) == content["generated.py"][1], "R32_BOUND_OWNER_INPUT_CHANGED")
            with os.fdopen(input_fd, "rb", closefd=False) as stream:
                process = subprocess.Popen(command, stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                           env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, close_fds=True)
                fixture_identity = bind_fixture(process, identity, command, held_fixture)
                save_work(root / "work", "fixture-process.json", fixture_identity)
                stdout, stderr = process.communicate(timeout=55)
        finally:
            os.close(input_fd)
        need(len(stdout) <= 1048576 and len(stderr) <= 1048576,
             "R32_BOUND_OWNER_OUTPUT_LIMIT")
        save_bytes_work(root / "work", "fixture.stdout.json", stdout)
        result = json.loads(stdout)
        validate_fixture_result_r2(result, activation["phase"], activation["generatedSHA256"], fixture_identity)
        fixture_proof = fixture_exit_proof(held_fixture, identity)
        if result.get("fixtureQualified") is True:
            need(result["originalBoundExitProof"]["processIdentity"]["ppid"] == fixture_identity["pid"],
                 "R32_BOUND_OWNER_TINY_CHILD_PARENT_CHANGED")
    except BaseException as error:
        error_code = str(error) if re.fullmatch(r"R32_BOUND_OWNER_[A-Z0-9_]{1,100}", str(error)) else "R32_BOUND_OWNER_FIXTURE_INCOMPLETE"
    finally:
        try:
            fixture_emergency = finish_fixture(process, held_fixture, identity, command)
        except BaseException as error:
            if error_code is None:
                error_code = str(error) if re.fullmatch(r"R32_BOUND_OWNER_[A-Z0-9_]{1,100}", str(error)) else "R32_BOUND_OWNER_FIXTURE_REAP_INCOMPLETE"
        finally:
            fixture_emergency = fixture_emergency or held_fixture.get("emergencyStopAttempted", False)
            if held_fixture["fd"] is not None:
                try:
                    os.close(held_fixture["fd"])
                    fixture_closed = True
                except OSError:
                    if error_code is None:
                        error_code = "R32_BOUND_OWNER_FIXTURE_PIDFD_CLOSE_INCOMPLETE"
        after = {name: read_control(root / "control", name) for name in content}
        need(after == content, "R32_BOUND_OWNER_CONTROL_CHANGED_AFTER")
        save_work(root / "work", "result.json", {"schemaVersion": 1, "kind": "r32-bound-census-owner-result-r2",
                  "nonce": sys.argv[2], "phase": activation["phase"], "owner": identity,
                  "fixtureResult": result, "fixtureExitCode": process.returncode if process is not None else None,
                  "fixtureStdoutSHA256": sha(stdout) if stdout is not None else None,
                  "fixtureStderrSHA256": sha(stderr) if stderr is not None else None,
                  "fixtureProcessIdentity": held_fixture["identity"], "fixtureKernelExitProof": fixture_proof,
                  "fixturePIDFDClosed": fixture_closed, "fixtureEmergencyStopUsed": fixture_emergency,
                  "errorCode": error_code, "ownerInputsStable": True, "productCodeExecuted": False,
                  "modelsInvoked": False, "fullProtectionQualified": False})
    return 0 if process is not None and process.returncode == 0 and result is not None and result.get("fixtureQualified") is True and fixture_proof is not None and fixture_closed and not fixture_emergency and error_code is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
