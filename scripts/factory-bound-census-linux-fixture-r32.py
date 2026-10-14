"""Finite, unprivileged PIDFD fixture. Prepared only; never a full protection proof."""
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
FUNCTIONS = ("process_record", "pidfd_poll", "pidfd_exit_proof")
READ_SUBPHASES = {
    "PIDFD_OPEN", "POST_ATTACH_PROC_IDENTITY", "PROCESS_READ", "PROC_DIRECTORY_OPEN",
    "PROC_DIRECTORY_METADATA", "STAT_BEFORE", "CMDLINE_READ", "CGROUP_READ", "CWD_READLINK",
    "EXE_READLINK", "FD_DIRECTORY_OPEN", "FD_SCANDIR_OPEN", "FD_SCANDIR_NEXT",
    "FD_SCANDIR_CLOSE", "FD_ENTRY_LIMIT", "FD_TARGET_READLINK", "FD_DIRECTORY_CLOSE",
    "STAT_AFTER", "PROC_PATH_IDENTITY_AFTER", "PROC_DIRECTORY_CLOSE", "PIDFD_POLL",
    "PIDFD_EXIT_PATH_CHECK", "SCAN_CLOSE_PROC_IDENTITY", "SCAN_CLOSE",
}
BOOT = re.compile(r"[a-f0-9-]{36}\Z")
SAFE_ERROR = re.compile(r"(?:R32_FIXTURE|R29_CLEANUP)_[A-Z0-9_]{1,100}\Z")


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


def attach_child(pid, boot):
    listed = proc_identity(pid)
    value = {"requestedPID": pid, "boot": boot, "listedProcIdentity": listed,
             "observedIdentity": None, "identityBound": False}
    try:
        value["fd"] = os.pidfd_open(pid, 0)
        current = proc_identity(pid)
        need(current == listed, "R32_FIXTURE_POST_ATTACH_IDENTITY_CHANGED")
        value["observedIdentity"] = {"pid": pid, "boot": boot,
                                     "procDevice": current["device"], "procInode": current["inode"]}
        value["identityBound"] = True
        return value
    except BaseException:
        if "fd" in value:
            os.close(value["fd"])
        raise


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


def finish_child(child, attachment, boot, scope):
    """Natural exit first. Emergency signal only via this exact, still-bound PIDFD."""
    if child is None:
        return False
    try:
        child.wait(timeout=3)
        return False
    except subprocess.TimeoutExpired:
        exact_child_alive(child, attachment, boot, scope)
        need(hasattr(signal, "pidfd_send_signal"), "R32_FIXTURE_PIDFD_SIGNAL_UNAVAILABLE")
        signal.pidfd_send_signal(attachment["fd"], signal.SIGTERM, None, 0)
        child.wait(timeout=3)
        return True


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


def execute_fixture(raw, phase, deadline=None):
    deadline = time.monotonic() + FIXTURE_SECONDS if deadline is None else deadline
    need(deadline > time.monotonic(), "R32_FIXTURE_DEADLINE_EXCEEDED")
    signal.setitimer(signal.ITIMER_REAL, max(0.001, deadline - time.monotonic()))
    runtime_guard()
    scope, function_hashes = load_functions(raw, phase)
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    need(BOOT.fullmatch(boot) is not None, "R32_FIXTURE_BOOT_INVALID")
    child = None
    attachment = None
    fd = None
    stop_used = False
    outcome = None
    child_final_error = None
    try:
        # Exact tool-owned child; no candidate/package code and no network or database use.
        child = subprocess.Popen([sys.executable, "-I", "-c", "import time;time.sleep(1.5)"],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, close_fds=True)
        attachment = attach_child(child.pid, boot)
        fd = attachment["fd"]
        live = scope["process_record"](child.pid, boot, attachment)
        attachment["fixtureStartTicks"] = live["startTicks"]
        need(live["uid"] == 1000 and live["ppid"] == os.getpid() and live["state"] != "Z"
             and not scope["pidfd_poll"](fd)["exitConfirmed"], "R32_FIXTURE_LIVE_RECORD_NOT_VALID")
        child.wait(timeout=4)
        need(child.returncode == 0, "R32_FIXTURE_NATURAL_CHILD_EXIT_FAILED")
        proof = scope["pidfd_exit_proof"](child.pid, attachment, boot)
        need(proof is not None and proof["kernelProof"]["procPathAbsent"] is True,
             "R32_FIXTURE_BOUND_EXIT_NOT_PROVED")
        already_dead_errno = None
        try:
            unexpected = os.pidfd_open(child.pid, 0)
        except OSError as error:
            need(error.errno == errno.ESRCH, "R32_FIXTURE_DEAD_ATTACH_OTHER_ERROR")
            already_dead_errno = error.errno
        else:
            os.close(unexpected)
            raise RuntimeError("R32_FIXTURE_DEAD_ATTACH_DID_NOT_REJECT")
        outcome = {"generatedSourceSHA256": digest(raw), "functionSHA256": function_hashes,
                   "liveRecordRead": True, "naturalChildExit": True, "originalBoundExitProof": proof,
                   "alreadyDeadAttachRejected": True, "alreadyDeadAttachErrno": already_dead_errno}
    finally:
        # Always try both lifecycle stages; never let child cleanup skip descriptor closure.
        try:
            stop_used = finish_child(child, attachment, boot, scope)
        except BaseException as error:
            child_final_error = error
        finally:
            if fd is not None:
                os.close(fd)
            signal.setitimer(signal.ITIMER_REAL, 0)
        if child_final_error is not None:
            raise child_final_error
    need(fd is not None and child is not None and child.poll() is not None,
         "R32_FIXTURE_LIFECYCLE_NOT_COMPLETE")
    try:
        os.fstat(fd)
    except OSError as error:
        need(error.errno == errno.EBADF, "R32_FIXTURE_DESCRIPTOR_CLOSE_UNKNOWN")
    else:
        raise RuntimeError("R32_FIXTURE_DESCRIPTOR_STILL_OPEN")
    need(not stop_used, "R32_FIXTURE_EMERGENCY_STOP_USED_NOT_QUALIFIED")
    return {"schemaVersion": 1, "kind": "r32-bound-census-linux-subset-qualification", "phase": phase,
            "fixtureQualified": True, "uid": 1000, "gid": 1000, "internalDeadlineSeconds": FIXTURE_SECONDS,
            "requiredParentDeadlineSeconds": PARENT_SECONDS, "descriptorClosed": True,
            "childReaped": True, "signalsSent": False, "fullProtectionQualified": False,
            "fullProcCensusExecuted": False, "protectedInventoryRead": False, "nodeACKRead": False,
            "queueRead": False, "productCodeExecuted": False, "modelsInvoked": False,
            "rawArgvExported": False, "privateEnvironmentExported": False, **outcome}


def alarm_failure(signum, frame):
    raise RuntimeError("R32_FIXTURE_DEADLINE_EXCEEDED")


def main():
    signal.signal(signal.SIGALRM, alarm_failure) if hasattr(signal, "SIGALRM") else None
    try:
        need(len(sys.argv) == 2 and sys.argv[1] in ("--phase=native", "--phase=build"),
             "R32_FIXTURE_PHASE_REQUIRED")
        runtime_guard()  # Root or unsupported platforms reject before reading input or executing definitions.
        deadline = time.monotonic() + FIXTURE_SECONDS
        signal.setitimer(signal.ITIMER_REAL, FIXTURE_SECONDS)
        raw = sys.stdin.buffer.read(1048577)
        result = execute_fixture(raw, sys.argv[1].split("=", 1)[1], deadline)
    except BaseException as error:
        result = {"schemaVersion": 1, "kind": "r32-bound-census-linux-subset-qualification",
                  "fixtureQualified": False, "fullProtectionQualified": False,
                  "errorCode": str(error) if SAFE_ERROR.fullmatch(str(error)) else "R32_FIXTURE_INCOMPLETE",
                  "errno": getattr(error, "errno", None), "rawErrorExported": False,
                  "productCodeExecuted": False, "modelsInvoked": False}
    finally:
        if hasattr(signal, "alarm"):
            signal.alarm(0)
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result["fixtureQualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
