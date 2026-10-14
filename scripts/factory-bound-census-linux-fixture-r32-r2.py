"""Prepared R2 PIDFD subset fixture: an explicit child-ready/release protocol.

No full census or operational qualification. Old fixture and failures stay intact.
"""
import ast
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import time

GENERATED_SHA256 = {
    "native": "b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78",
    "build": "e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba",
}
FIXTURE_SECONDS = 45
PARENT_SECONDS = 90
READY_SECONDS = 5
FUNCTIONS = ("process_record", "pidfd_poll", "pidfd_exit_proof")
READ_SUBPHASES = {
    "PIDFD_OPEN", "POST_ATTACH_PROC_IDENTITY", "PROCESS_READ", "PROC_DIRECTORY_OPEN",
    "PROC_DIRECTORY_METADATA", "STAT_BEFORE", "CMDLINE_READ", "CGROUP_READ", "CWD_READLINK",
    "EXE_READLINK", "FD_DIRECTORY_OPEN", "FD_SCANDIR_OPEN", "FD_SCANDIR_NEXT",
    "FD_SCANDIR_CLOSE", "FD_ENTRY_LIMIT", "FD_TARGET_READLINK", "FD_DIRECTORY_CLOSE",
    "STAT_AFTER", "PROC_PATH_IDENTITY_AFTER", "PROC_DIRECTORY_CLOSE", "PIDFD_POLL",
    "PIDFD_EXIT_PATH_CHECK", "SCAN_CLOSE_PROC_IDENTITY", "SCAN_CLOSE",
}
FIXTURE_PHASES = {
    "ARGUMENTS", "RUNTIME", "SOURCE_INPUT", "SOURCE_FUNCTIONS", "BOOT_IDENTITY",
    "PIPE_CREATE", "CHILD_SPAWN", "PARENT_CHILD_ENDS_CLOSE", "READY_HANDSHAKE",
    "PIDFD_ATTACH", "PROCESS_RECORD", "LIVE_RECORD_VALIDATE", "RELEASE_GATE",
    "NATURAL_EXIT", "BOUND_EXIT_PROOF", "DEAD_ATTACH", "CHILD_CLEANUP",
    "DESCRIPTOR_CLOSE", "DESCRIPTOR_VERIFY", "COMPLETE",
}
BOOT = re.compile(r"[a-f0-9-]{36}\Z")
SAFE_ERROR = re.compile(r"(?:R32_FIXTURE|R29_CLEANUP)_[A-Z0-9_]{1,100}\Z")
READY_TOKEN = b"R32_PIDFD_READY_V2\n"
RELEASE_TOKEN = b"R32_PIDFD_RELEASE_V2\n"
CHILD_CODE = """import os,select,sys
ready,gate=int(sys.argv[1]),int(sys.argv[2])
poll=select.poll();poll.register(gate,select.POLLIN)
token=b'R32_PIDFD_READY_V2\\n'
if os.write(ready,token)!=len(token):raise SystemExit(2)
events=poll.poll(15000)
if len(events)!=1 or events[0][0]!=gate or not events[0][1]&select.POLLIN:raise SystemExit(3)
if os.read(gate,22)!=b'R32_PIDFD_RELEASE_V2\\n':raise SystemExit(4)
"""


def need(value, code):
    if not value:
        raise RuntimeError(code)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else str(value).encode()).hexdigest()


def load_functions(raw, phase):
    """The fixed whole-program hash precedes AST parsing or definition execution."""
    need(phase in GENERATED_SHA256 and isinstance(raw, bytes) and 0 < len(raw) <= 1048576,
         "R32_FIXTURE_SOURCE_ARGUMENT_INVALID")
    need(digest(raw) == GENERATED_SHA256[phase], "R32_FIXTURE_GENERATED_SOURCE_CHANGED")
    source = raw.decode("utf-8", "strict")
    tree = ast.parse(source)
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in FUNCTIONS]
    need(len(selected) == 3 and {node.name for node in selected} == set(FUNCTIONS)
         and all(not node.decorator_list for node in selected), "R32_FIXTURE_FUNCTION_SET_CHANGED")
    # These local helpers only classify this fixture's impossible production workspace.
    # No source top-level statement, census, unit, stock, ACK, API, or helper module executes.
    workspace = "/__r32_pidfd_fixture_not_a_production_scope__"
    scope = {"os": os, "Path": Path, "re": re, "select": select, "errno": errno,
             "need": need, "digest": digest, "CLOSED_READ_SUBPHASES": READ_SUBPHASES,
             "in_workspace": lambda value: value.removesuffix(" (deleted)") == workspace
             or value.removesuffix(" (deleted)").startswith(workspace + "/"),
             "argv_workspace": lambda value: bool(re.search(
                 r"(?<![A-Za-z0-9_./-])" + re.escape(workspace) + r"(?=$|[/\s\x00\x22\x27])", value))}
    module = ast.Module(body=selected, type_ignores=[])
    exec(compile(module, "<fixed-bound-census-functions>", "exec"), scope)
    return scope, {node.name: digest(ast.get_source_segment(source, node)) for node in selected}


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
    return {"errorCode": text if SAFE_ERROR.fullmatch(text) else "R32_FIXTURE_INCOMPLETE",
            "errno": error.errno if type(getattr(error, "errno", None)) is int
            and 0 <= error.errno <= 4095 else None}


class Diagnostics:
    def __init__(self, phase):
        self.phase = "ARGUMENTS"
        self.source_phase = phase if phase in GENERATED_SHA256 else None
        self.first = None
        self.secondary = []
        self.attachment = None
        self.requested_pid = None
        self.ready = False
        self.release_sent = False
        self.signals_sent = False
        self.child_reaped = False
        self.descriptors_closed = False

    def enter(self, phase):
        need(phase in FIXTURE_PHASES, "R32_FIXTURE_DIAGNOSTIC_PHASE_INVALID")
        self.phase = phase

    def capture(self, error, read=False):
        attachment = self.attachment
        subphase = attachment.get("failedReadSubphase") if isinstance(attachment, dict) and read else None
        primary = attachment.get("failedReadError", error) if isinstance(attachment, dict) and read else error
        row = {"fixturePhase": self.phase, "firstReadSubphase": subphase if isinstance(subphase, str)
               and subphase in READ_SUBPHASES else None,
               **safe_error(primary)}
        if self.first is None:
            self.first = row
        elif len(self.secondary) < 8:
            self.secondary.append(row)

    def failure(self):
        return {"schemaVersion": 1, "kind": "r32-bound-census-linux-subset-qualification-r2",
                "phase": self.source_phase, "fixtureQualified": False, "fullProtectionQualified": False,
                "requestedChildPID": self.requested_pid, "childIdentity": safe_identity(self.attachment),
                "readyHandshakeCompleted": self.ready, "releaseGateSent": self.release_sent,
                "childReaped": self.child_reaped, "descriptorClosed": self.descriptors_closed,
                "signalsSent": self.signals_sent, "rawErrorExported": False,
                "rawArgvExported": False, "privateEnvironmentExported": False,
                "productCodeExecuted": False, "modelsInvoked": False,
                "fullProcCensusExecuted": False, "protectedInventoryRead": False,
                "nodeACKRead": False, "queueRead": False,
                "secondaryFailures": self.secondary, **(self.first or {
                    "fixturePhase": self.phase, "firstReadSubphase": None,
                    "errorCode": "R32_FIXTURE_INCOMPLETE", "errno": None})}


def read_ready(fd, deadline):
    """Read only an exact, bounded ready token. No EOF or timeout is treated as ready."""
    received = b""
    while len(received) < len(READY_TOKEN):
        remaining = deadline - time.monotonic()
        need(remaining > 0, "R32_FIXTURE_READY_TIMEOUT")
        readable, _, _ = select.select([fd], [], [], remaining)
        need(readable == [fd], "R32_FIXTURE_READY_TIMEOUT")
        chunk = os.read(fd, len(READY_TOKEN) + 1 - len(received))
        need(chunk and len(received) + len(chunk) <= len(READY_TOKEN), "R32_FIXTURE_READY_TOKEN_INVALID")
        received += chunk
        need(READY_TOKEN.startswith(received), "R32_FIXTURE_READY_TOKEN_INVALID")
    # The pinned child makes exactly one small atomic write and holds this FD open.
    readable, _, _ = select.select([fd], [], [], 0)
    need(received == READY_TOKEN and not readable, "R32_FIXTURE_READY_TOKEN_INVALID")
    return True


def attach_child(pid, boot, attachment):
    listed = proc_identity(pid)
    attachment.update({"requestedPID": pid, "boot": boot, "listedProcIdentity": listed,
                       "observedIdentity": None, "identityBound": False})
    # Register FD immediately, including FD 0; outer cleanup retains it if post-stat fails.
    subphase = "PIDFD_OPEN"
    try:
        attachment["fd"] = os.pidfd_open(pid, 0)
        subphase = "POST_ATTACH_PROC_IDENTITY"
        current = proc_identity(pid)
        need(current == listed, "R32_FIXTURE_POST_ATTACH_IDENTITY_CHANGED")
    except BaseException as error:
        attachment.setdefault("failedReadSubphase", subphase)
        attachment.setdefault("failedReadError", error)
        raise
    attachment["observedIdentity"] = {"pid": pid, "boot": boot,
                                      "procDevice": current["device"], "procInode": current["inode"]}
    attachment["identityBound"] = True


def exact_child_alive(child, attachment, boot, scope):
    need(attachment is not None and attachment.get("requestedPID") == child.pid
         and attachment.get("boot") == boot and attachment.get("identityBound") is True,
         "R32_FIXTURE_CHILD_IDENTITY_UNBOUND")
    need(not scope["pidfd_poll"](attachment["fd"])["exitConfirmed"],
         "R32_FIXTURE_CHILD_ALREADY_EXITED")
    need(Path("/proc/sys/kernel/random/boot_id").read_text().strip() == boot,
         "R32_FIXTURE_CHILD_BOOT_CHANGED")
    need(proc_identity(child.pid) == attachment["listedProcIdentity"],
         "R32_FIXTURE_CHILD_IDENTITY_CHANGED")
    fresh = scope["process_record"](child.pid, boot, attachment)
    need(re.fullmatch(r"[0-9]+", attachment.get("fixtureStartTicks", "")) is not None
         and fresh["pid"] == child.pid and fresh["ppid"] == os.getpid()
         and fresh["startTicks"] == attachment["fixtureStartTicks"],
         "R32_FIXTURE_CHILD_START_CHANGED")
    return True


def finish_child(child, attachment, boot, scope, diagnostics):
    if child is None:
        return
    try:
        child.wait(timeout=3)
    except subprocess.TimeoutExpired:
        exact_child_alive(child, attachment, boot, scope)
        need(hasattr(signal, "pidfd_send_signal"), "R32_FIXTURE_PIDFD_SIGNAL_UNAVAILABLE")
        diagnostics.signals_sent = True  # Attempt is evidence even if the signal/wait fails.
        signal.pidfd_send_signal(attachment["fd"], signal.SIGTERM, None, 0)
        child.wait(timeout=3)
    diagnostics.child_reaped = True


def runtime_guard():
    need(sys.platform == "linux" and hasattr(os, "getresuid") and os.getresuid() == (1000, 1000, 1000)
         and hasattr(os, "getresgid") and os.getresgid() == (1000, 1000, 1000),
         "R32_FIXTURE_UID1000_LINUX_REQUIRED")
    need(hasattr(os, "pidfd_open") and hasattr(select, "poll") and hasattr(signal, "pidfd_send_signal"),
         "R32_FIXTURE_PIDFD_UNSUPPORTED")
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines() if ":" in line)
    need(int(status.get("CapEff", "invalid").strip(), 16) == 0
         and status.get("NoNewPrivs", "").strip() == "1", "R32_FIXTURE_PRIVILEGE_BOUNDARY_CHANGED")
    need(not any(os.environ.get(name) for name in ("PYTHONPATH", "PYTHONHOME", "LD_PRELOAD", "LD_LIBRARY_PATH")),
         "R32_FIXTURE_ENVIRONMENT_UNTRUSTED")


def execute_fixture(raw, phase, deadline=None, diagnostics=None):
    d = diagnostics or Diagnostics(phase)
    deadline = time.monotonic() + FIXTURE_SECONDS if deadline is None else deadline
    need(deadline > time.monotonic(), "R32_FIXTURE_DEADLINE_EXCEEDED")
    signal.setitimer(signal.ITIMER_REAL, max(0.001, deadline - time.monotonic()))
    d.enter("RUNTIME"); runtime_guard()
    d.enter("SOURCE_FUNCTIONS"); scope, function_hashes = load_functions(raw, phase)
    d.enter("BOOT_IDENTITY"); boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    need(BOOT.fullmatch(boot) is not None, "R32_FIXTURE_BOOT_INVALID")
    child = None
    attachment = {}
    d.attachment = attachment
    descriptors = {}
    outcome = None
    close_failed = False

    def close_one(name):
        nonlocal close_failed
        fd = descriptors.pop(name, None)
        if fd is None:
            return
        try:
            os.close(fd)
            try:
                os.fstat(fd)
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise
            else:
                raise RuntimeError("R32_FIXTURE_DESCRIPTOR_STILL_OPEN")
        except BaseException as error:
            close_failed = True
            d.capture(error)

    def release_gate():
        if child is not None and not d.release_sent:
            need("gateWrite" in descriptors, "R32_FIXTURE_RELEASE_GATE_MISSING")
            need(os.write(descriptors["gateWrite"], RELEASE_TOKEN) == len(RELEASE_TOKEN),
                 "R32_FIXTURE_RELEASE_GATE_WRITE_INCOMPLETE")
            d.release_sent = True

    try:
        d.enter("PIPE_CREATE")
        descriptors["readyRead"], descriptors["readyWrite"] = os.pipe()
        descriptors["gateRead"], descriptors["gateWrite"] = os.pipe()
        d.enter("CHILD_SPAWN")
        child = subprocess.Popen([sys.executable, "-I", "-c", CHILD_CODE,
                                  str(descriptors["readyWrite"]), str(descriptors["gateRead"])],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, close_fds=True,
                                 pass_fds=(descriptors["readyWrite"], descriptors["gateRead"]))
        d.requested_pid = child.pid
        d.enter("PARENT_CHILD_ENDS_CLOSE")
        close_one("readyWrite"); close_one("gateRead")
        need(d.first is None, "R32_FIXTURE_CHILD_PIPE_CLOSE_INCOMPLETE")
        d.enter("READY_HANDSHAKE")
        d.ready = read_ready(descriptors["readyRead"], min(deadline, time.monotonic() + READY_SECONDS))
        d.enter("PIDFD_ATTACH"); attach_child(child.pid, boot, attachment)
        descriptors["pidfd"] = attachment["fd"]
        d.enter("PROCESS_RECORD")
        try:
            live = scope["process_record"](child.pid, boot, attachment)
        except BaseException as error:
            d.capture(error, read=True)
            raise
        attachment["fixtureStartTicks"] = live["startTicks"]
        d.enter("LIVE_RECORD_VALIDATE")
        need(live["uid"] == 1000 and live["ppid"] == os.getpid() and live["state"] != "Z"
             and not scope["pidfd_poll"](attachment["fd"])["exitConfirmed"], "R32_FIXTURE_LIVE_RECORD_NOT_VALID")
        d.enter("RELEASE_GATE"); release_gate()
        d.enter("NATURAL_EXIT"); child.wait(timeout=4); d.child_reaped = True
        need(child.returncode == 0, "R32_FIXTURE_NATURAL_CHILD_EXIT_FAILED")
        d.enter("BOUND_EXIT_PROOF"); proof = scope["pidfd_exit_proof"](child.pid, attachment, boot)
        need(proof is not None and proof["kernelProof"]["procPathAbsent"] is True,
             "R32_FIXTURE_BOUND_EXIT_NOT_PROVED")
        d.enter("DEAD_ATTACH")
        try:
            unexpected = os.pidfd_open(child.pid, 0)
        except OSError as error:
            if error.errno != errno.ESRCH:
                d.capture(error)
                raise RuntimeError("R32_FIXTURE_DEAD_ATTACH_OTHER_ERROR")
            already_dead_errno = error.errno
        else:
            os.close(unexpected)
            raise RuntimeError("R32_FIXTURE_DEAD_ATTACH_DID_NOT_REJECT")
        outcome = {"generatedSourceSHA256": digest(raw), "functionSHA256": function_hashes,
                   "liveRecordRead": True, "naturalChildExit": True, "originalBoundExitProof": proof,
                   "alreadyDeadAttachRejected": True, "alreadyDeadAttachErrno": already_dead_errno}
    except BaseException as error:
        d.capture(error, read=d.phase == "PIDFD_ATTACH")
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        # Release even after failure; this gives the tool-owned child a natural exit path.
        d.enter("RELEASE_GATE")
        try:
            release_gate()
        except BaseException as error:
            d.capture(error)
        d.enter("CHILD_CLEANUP")
        try:
            finish_child(child, attachment, boot, scope, d)
        except BaseException as error:
            d.capture(error, read=True)
        d.enter("DESCRIPTOR_CLOSE")
        # An attach error can occur after FD allocation but before registration in descriptors.
        if "fd" in attachment and "pidfd" not in descriptors:
            descriptors["pidfd"] = attachment["fd"]
        for name in list(descriptors):
            close_one(name)
        d.descriptors_closed = not close_failed
    if d.first is not None:
        return d.failure()
    d.enter("COMPLETE")
    if outcome is None or not d.child_reaped or not d.descriptors_closed or d.signals_sent:
        d.capture(RuntimeError("R32_FIXTURE_LIFECYCLE_NOT_QUALIFIED"))
        return d.failure()
    return {"schemaVersion": 1, "kind": "r32-bound-census-linux-subset-qualification-r2", "phase": phase,
            "fixtureQualified": True, "uid": 1000, "gid": 1000, "internalDeadlineSeconds": FIXTURE_SECONDS,
            "requiredParentDeadlineSeconds": PARENT_SECONDS, "descriptorClosed": True, "childReaped": True,
            "signalsSent": False, "readyHandshakeCompleted": True, "releaseGateSent": True,
            "childIdentity": safe_identity(attachment), "requestedChildPID": d.requested_pid,
            "readyProtocolSHA256": digest(CHILD_CODE), "fixturePhase": "COMPLETE", "firstReadSubphase": None,
            "fullProtectionQualified": False, "fullProcCensusExecuted": False, "protectedInventoryRead": False,
            "nodeACKRead": False, "queueRead": False, "productCodeExecuted": False, "modelsInvoked": False,
            "rawArgvExported": False, "privateEnvironmentExported": False, **outcome}


def alarm_failure(signum, frame):
    raise RuntimeError("R32_FIXTURE_DEADLINE_EXCEEDED")


def main():
    signal.signal(signal.SIGALRM, alarm_failure) if hasattr(signal, "SIGALRM") else None
    phase = sys.argv[1].split("=", 1)[1] if len(sys.argv) == 2 and sys.argv[1] in ("--phase=native", "--phase=build") else None
    d = Diagnostics(phase)
    try:
        need(phase is not None, "R32_FIXTURE_PHASE_REQUIRED")
        d.enter("RUNTIME"); runtime_guard()
        deadline = time.monotonic() + FIXTURE_SECONDS
        signal.setitimer(signal.ITIMER_REAL, FIXTURE_SECONDS)
        d.enter("SOURCE_INPUT"); raw = sys.stdin.buffer.read(1048577)
        result = execute_fixture(raw, phase, deadline, d)
    except BaseException as error:
        d.capture(error)
        result = d.failure()
    finally:
        if hasattr(signal, "alarm"):
            signal.alarm(0)
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["fixtureQualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
