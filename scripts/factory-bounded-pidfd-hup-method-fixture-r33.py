"""Definition-only, one new owned-child lifecycle. A separately reviewed owner runs it."""
import ast
import ctypes
import errno
import hashlib
import math
import os
import re
import select
import signal
import stat
import subprocess
import sys
import threading
import time

NATIVE_SHA256 = "2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73"
HELPER_SHA256 = "c743dcb7c14dd245074c903757747f55721cfe3b164be2af5b4e553898de3a3b"
ORIGINAL_DEFINITIONS = {
    "need": "e4eaf757341336073fd627bfdb678da5e330c94ded6b36a13057b7a9269a36ca",
    "pidfd_poll": "94132b924aa09bc655f476438286999b10dc37d3e6e1a27feb3bd9196ef2e533",
    "pidfd_exit_proof": "ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109",
}
IDENTITY_KEYS = {"pid", "ppid", "startTime", "boot", "procDevice", "procInode", "uid", "gid"}
READY = b"R33_HUP_OWN_CHILD_READY_V1\n"
RELEASE = b"R33_HUP_OWN_CHILD_EXIT_V1\n"
CHILD_CODE = r'''import ctypes,os,select,signal,sys
ready,gate,parent,start,device,inode=map(int,sys.argv[1:7])
def match():
 if os.getppid()!=parent:raise SystemExit(11)
 p='/proc/'+str(parent);s=os.stat(p,follow_symlinks=False)
 with open(p+'/stat','r',encoding='utf-8') as f:v=f.read(16385)
 a=v[v.rfind(')')+2:].split()
 if len(v)>16384 or len(a)<20 or int(a[19])!=start or (s.st_dev,s.st_ino)!=(device,inode):raise SystemExit(12)
match()
libc=ctypes.CDLL(None,use_errno=True)
if libc.prctl(1,signal.SIGKILL,0,0,0)!=0:raise SystemExit(13)
match()
death=ctypes.c_int()
if libc.prctl(2,ctypes.byref(death),0,0,0)!=0 or death.value!=signal.SIGKILL:raise SystemExit(14)
try:
 token=b'R33_HUP_OWN_CHILD_READY_V1\n'
 if os.write(ready,token)!=len(token):raise SystemExit(15)
 os.close(ready);ready=-1
 p=select.poll();p.register(gate,select.POLLIN);e=p.poll(5000)
 if len(e)!=1 or e[0][0]!=gate or e[0][1] not in (select.POLLIN,select.POLLIN|select.POLLHUP):raise SystemExit(16)
 if os.read(gate,128)!=b'R33_HUP_OWN_CHILD_EXIT_V1\n':raise SystemExit(17)
finally:
 if ready>=0:os.close(ready)
 os.close(gate)
'''


def require(value, code):
    if not value:
        raise RuntimeError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_error(error):
    value = str(error)
    return {"type": type(error).__name__, "code": value if re.fullmatch(
        r"(?:R33_HUP|R29_CLEANUP)_[A-Z0-9_]{1,100}", value) else "R33_HUP_METHOD_EXCEPTION",
        "errno": getattr(error, "errno", None)}


def source_definitions(native_raw, helper_raw):
    require(type(native_raw) is bytes and type(helper_raw) is bytes
            and digest(native_raw) == NATIVE_SHA256 and digest(helper_raw) == HELPER_SHA256,
            "R33_HUP_SOURCE_CHANGED")
    text = native_raw.decode("utf-8", "strict")
    tree = ast.parse(text)
    chosen = [n for n in tree.body if isinstance(n, ast.FunctionDef)
              and n.name in ORIGINAL_DEFINITIONS]
    hashes = {n.name: digest(ast.get_source_segment(text, n).encode()) for n in chosen}
    require(len(chosen) == 3 and hashes == ORIGINAL_DEFINITIONS
            and all(not n.decorator_list for n in chosen), "R33_HUP_ORIGINAL_DEFINITION_CHANGED")
    original = {"os": os, "select": select, "errno": errno}
    exec(compile(ast.Module(body=chosen, type_ignores=[]), "<exact-r33-exit-definitions>", "exec"), original)
    helper_tree = ast.parse(helper_raw.decode("utf-8", "strict"))
    require(all(isinstance(n, (ast.Import, ast.Assign, ast.FunctionDef, ast.ClassDef))
                or isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant)
                and type(n.value.value) is str for n in helper_tree.body),
            "R33_HUP_HELPER_NOT_DEFINITION_ONLY")
    helper = {}
    exec(compile(helper_tree, "<fixed-r33-hup-helper>", "exec"), helper)
    return original, helper, {"nativeSHA256": NATIVE_SHA256, "helperSHA256": HELPER_SHA256,
                              "originalDefinitionSHA256": hashes,
                              "nativeTopLevelExecuted": False, "censusLoaded": False,
                              "helperDefinitions": sorted(n.name for n in helper_tree.body
                                                          if isinstance(n, (ast.FunctionDef, ast.ClassDef)))}


class DescriptorLedger:
    def __init__(self):
        self.rows = []
        self.active = {}

    def add(self, fd, role):
        require(fd not in self.active, "R33_HUP_DESCRIPTOR_ALREADY_OWNED")
        row = {"role": role, "fd": fd, "identity": None, "closeAttempted": False,
               "closed": False, "closeError": None}
        self.rows.append(row); self.active[fd] = row
        info = os.fstat(fd)
        row["identity"] = {"device": info.st_dev, "inode": info.st_ino, "mode": info.st_mode}
        return fd

    def open(self, role, path, **kwargs):
        return self.add(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | kwargs.pop("extra_flags", 0), **kwargs), role)

    def pipe(self, role):
        read, write = os.pipe()
        # Register both ownerships before metadata operations can fail.
        for fd, suffix in ((read, "Read"), (write, "Write")):
            row = {"role": role + suffix, "fd": fd, "identity": None,
                   "closeAttempted": False, "closed": False, "closeError": None}
            self.rows.append(row); self.active[fd] = row
        for fd in (read, write):
            info = os.fstat(fd)
            self.active[fd]["identity"] = {"device": info.st_dev, "inode": info.st_ino, "mode": info.st_mode}
        return read, write

    def close(self, fd):
        row = self.active.pop(fd, None)
        require(row is not None, "R33_HUP_DESCRIPTOR_CLOSE_NOT_OWNED")
        row["closeAttempted"] = True
        try:
            info = os.fstat(fd)
            require(row["identity"] is None or row["identity"] == {
                "device": info.st_dev, "inode": info.st_ino, "mode": info.st_mode},
                "R33_HUP_DESCRIPTOR_IDENTITY_CHANGED")
            os.close(fd)
            try:
                os.fstat(fd)
            except OSError as error:
                require(error.errno == errno.EBADF, "R33_HUP_DESCRIPTOR_CLOSE_UNPROVEN")
            else:
                raise RuntimeError("R33_HUP_DESCRIPTOR_STILL_OPEN")
            row["closed"] = True
        except BaseException as error:
            row["closeError"] = safe_error(error)
            raise

    def read(self, role, path, limit=16384, **kwargs):
        fd = self.open(role, path, **kwargs)
        primary = None
        try:
            raw = os.read(fd, limit + 1)
            require(0 < len(raw) <= limit, "R33_HUP_PROC_READ_INVALID")
            return raw.decode("utf-8", "strict")
        except BaseException as error:
            primary = error
            raise
        finally:
            try:
                self.close(fd)
            except BaseException:
                if primary is None:
                    raise

    def complete(self):
        return not self.active and all(row["closed"] for row in self.rows)


def proc_identity(pid, boot, ledger):
    fd = ledger.open("ProcDirectory", "/proc/" + str(pid), extra_flags=os.O_DIRECTORY)
    primary = None
    try:
        first = os.fstat(fd)
        text = ledger.read("ProcStat", "stat", dir_fd=fd)
        fields = text[text.rfind(")") + 2:].split()
        require(len(fields) >= 20 and fields[19].isdigit(), "R33_HUP_PROC_STAT_INVALID")
        status = dict(line.split(":", 1) for line in ledger.read("ProcStatus", "status", dir_fd=fd).splitlines()
                      if ":" in line)
        uids = [int(x) for x in status["Uid"].split()]
        gids = [int(x) for x in status["Gid"].split()]
        last = os.stat("/proc/" + str(pid), follow_symlinks=False)
        require((first.st_dev, first.st_ino) == (last.st_dev, last.st_ino),
                "R33_HUP_PROC_IDENTITY_CHANGED")
        identity = {"pid": pid, "ppid": int(fields[1]), "startTime": int(fields[19]), "boot": boot,
                    "procDevice": first.st_dev, "procInode": first.st_ino, "uid": uids[1], "gid": gids[1]}
        security = {"uids": uids, "gids": gids, "noNewPrivileges": int(status["NoNewPrivs"].strip()),
                    "capabilities": {k: int(status[k].strip(), 16)
                                     for k in ("CapEff", "CapPrm", "CapInh", "CapAmb")}}
        return identity, security
    except BaseException as error:
        primary = error
        raise
    finally:
        try:
            ledger.close(fd)
        except BaseException:
            if primary is None:
                raise


def require_unprivileged(security):
    require(security["uids"] == [1000] * 4 and security["gids"] == [1000] * 4
            and security["noNewPrivileges"] == 1
            and all(v == 0 for v in security["capabilities"].values()),
            "R33_HUP_PRIVILEGE_BOUNDARY_CHANGED")


def runtime_guard(expected_parent_identity, ledger, public_state):
    require(sys.platform == "linux" and sys.flags.isolated == 1 and sys.dont_write_bytecode
            and hasattr(os, "pidfd_open") and hasattr(select, "poll")
            and os.getresuid() == (1000, 1000, 1000) and os.getresgid() == (1000, 1000, 1000)
            and os.getgroups() == [], "R33_HUP_LINUX_ISOLATED_UID1000_REQUIRED")
    require(threading.active_count() == 1 and signal.getsignal(signal.SIGCHLD) == signal.SIG_DFL,
            "R33_HUP_COMPETING_REAPER_REFUSED")
    boot = ledger.read("BootID", "/proc/sys/kernel/random/boot_id", limit=64).strip()
    require(re.fullmatch(r"[a-f0-9-]{36}", boot) is not None, "R33_HUP_BOOT_ID_INVALID")
    own, security = proc_identity(os.getpid(), boot, ledger)
    public_state.update({"selfIdentity": own, "selfSecurity": security})
    require_unprivileged(security)
    require(own["ppid"] == expected_parent_identity["pid"], "R33_HUP_PARENT_CHANGED")
    parent, _ = proc_identity(own["ppid"], boot, ledger)
    require(parent == expected_parent_identity, "R33_HUP_PARENT_CHANGED")
    libc = ctypes.CDLL(None, use_errno=True)
    death = ctypes.c_int()
    require(libc.prctl(2, ctypes.byref(death), 0, 0, 0) == 0 and death.value == signal.SIGKILL,
            "R33_HUP_PDEATHSIG_REQUIRED")
    again, _ = proc_identity(os.getppid(), boot, ledger)
    require(os.getppid() == expected_parent_identity["pid"] and again == expected_parent_identity,
            "R33_HUP_PARENT_CHANGED")
    return {"selfIdentity": own, "selfSecurity": security,
            "expectedParentIdentity": parent, "selfPdeathsig": death.value, "boot": boot}


def bounded_events(fd, mask, milliseconds, deadline):
    remaining = math.floor(min(milliseconds / 1000.0, deadline - time.monotonic()) * 1000.0)
    require(remaining > 0, "R33_HUP_METHOD_DEADLINE_EXCEEDED")
    poller = select.poll(); poller.register(fd, mask)
    events = poller.poll(remaining)
    require(time.monotonic() <= deadline, "R33_HUP_METHOD_DEADLINE_EXCEEDED")
    return events


def execute_method(native_source_bytes=None, helper_source_bytes=None, enclosing_deadline=None,
                   expected_parent_identity=None):
    result = {"schemaVersion": 1, "kind": "r33-bounded-hup-owned-child-method",
              "fixtureQualified": False, "selfIdentity": None, "childIdentity": None,
              "childReaped": False, "normalChildExit": False, "childExitCode": None,
              "descriptorClosed": False, "signalsSent": False, "kernelWaitBlockedProved": False,
              "firstFailure": None, "secondaryFailures": [], "phase": "INPUT",
              "actualLinuxLifecycleAttempted": False, "methodSubsetExercised": False,
              "fullProtectionQualified": False,
              "actualPG4Qualified": False, "productAccepted": False}
    # Deliberately before a clock, source load, proc read, descriptor or thread operation.
    if not (type(native_source_bytes) is bytes and type(helper_source_bytes) is bytes
            and type(enclosing_deadline) in (int, float) and math.isfinite(enclosing_deadline)
            and type(expected_parent_identity) is dict and set(expected_parent_identity) == IDENTITY_KEYS
            and all(type(expected_parent_identity[k]) is int and expected_parent_identity[k] >= 0
                    for k in IDENTITY_KEYS - {"boot"})
            and type(expected_parent_identity["boot"]) is str):
        result["firstFailure"] = {"phase": "INPUT", "code": "R33_HUP_METHOD_NULL_INTERFACE"}
        return result
    ledger = DescriptorLedger(); child = None; attachment = None; child_fd = None
    gate_write = None; gate_released = False; reaper = None
    reaper_gate = threading.Event(); abort_reaper = threading.Event(); reaper_data = {}
    original = None; started = time.monotonic(); deadline = min(enclosing_deadline, started + 8.0)

    def capture(error):
        item = {"phase": result["phase"], **safe_error(error)}
        if result["firstFailure"] is None:
            result["firstFailure"] = item
        else:
            result["secondaryFailures"].append(item)
        evidence = getattr(error, "evidence", getattr(error, "hup_wait_evidence", None))
        if evidence is not None:
            result["hupWait"] = evidence

    def release():
        nonlocal gate_released
        if not gate_released:
            require(gate_write is not None and gate_write in ledger.active, "R33_HUP_RELEASE_GATE_MISSING")
            require(os.write(gate_write, RELEASE) == len(RELEASE), "R33_HUP_RELEASE_FAILED")
            gate_released = True

    try:
        result["phase"] = "SOURCE"
        original, helper, result["source"] = source_definitions(native_source_bytes, helper_source_bytes)
        require(time.monotonic() < deadline, "R33_HUP_METHOD_DEADLINE_EXCEEDED")
        result["phase"] = "RUNTIME"
        runtime = runtime_guard(expected_parent_identity, ledger, result)
        result.update(runtime)
        own = runtime["selfIdentity"]; boot = runtime["boot"]
        result["phase"] = "CHILD_CREATE"
        result["actualLinuxLifecycleAttempted"] = True
        ready_read, ready_write = ledger.pipe("Ready")
        gate_read, gate_write = ledger.pipe("Gate")
        child = subprocess.Popen([sys.executable, "-I", "-B", "-c", CHILD_CODE,
                                  str(ready_write), str(gate_read), str(own["pid"]),
                                  str(own["startTime"]), str(own["procDevice"]), str(own["procInode"])],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, close_fds=True,
                                 pass_fds=(ready_write, gate_read))
        result["requestedChildPID"] = child.pid
        ledger.close(ready_write); ledger.close(gate_read)
        result["phase"] = "CHILD_READY"
        events = bounded_events(ready_read, select.POLLIN, 1500, deadline)
        require(len(events) == 1 and events[0][0] == ready_read
                and events[0][1] in (select.POLLIN, select.POLLIN | select.POLLHUP)
                and os.read(ready_read, len(READY) + 1) == READY, "R33_HUP_READY_FAILED")
        result.update({"childPdeathsig": signal.SIGKILL,
                       "childPdeathsigVerifiedByReadyProtocol": True,
                       "childReadyProtocolSHA256": digest(CHILD_CODE.encode())})
        ledger.close(ready_read)
        result["phase"] = "CHILD_BIND"
        before, child_security = proc_identity(child.pid, boot, ledger)
        result["childIdentity"] = before; result["childSecurity"] = child_security
        require_unprivileged(child_security)
        require(before["ppid"] == own["pid"], "R33_HUP_CHILD_PARENT_CHANGED")
        child_fd = ledger.add(os.pidfd_open(child.pid, 0), "OriginalChildPIDFD")
        held_fd = dict(ledger.active[child_fd]["identity"])
        after, _ = proc_identity(child.pid, boot, ledger)
        require(after == before, "R33_HUP_CHILD_BINDING_CHANGED")
        attachment = {"requestedPID": child.pid, "boot": boot, "identityBound": True, "fd": child_fd,
                      "listedProcIdentity": {"device": before["procDevice"], "inode": before["procInode"]},
                      "observedIdentity": {"pid": child.pid, "boot": boot, "procDevice": before["procDevice"],
                                           "procInode": before["procInode"], "ppid": own["pid"],
                                           "startTicks": str(before["startTime"])}}
        require(original["pidfd_poll"](child_fd)["exitConfirmed"] is False, "R33_HUP_CHILD_ALREADY_EXITED")
        result["phase"] = "NATURAL_EXIT_UNREAPED"
        release()
        events = bounded_events(child_fd, select.POLLIN, 1500, deadline)
        require(len(events) == 1 and events[0][0] == child_fd and events[0][1] == select.POLLIN,
                "R33_HUP_UNREAPED_EXIT_REQUIRED")
        first = original["pidfd_poll"](child_fd)
        no_hup_poller = select.poll(); no_hup_poller.register(child_fd, 0)
        no_hup = no_hup_poller.poll(0)
        initial_proof = original["pidfd_exit_proof"](child.pid, attachment, boot)
        present = os.stat("/proc/" + str(child.pid), follow_symlinks=False)
        require(first == {"exitConfirmed": True, "pollEvents": select.POLLIN} and no_hup == []
                and initial_proof is None and (present.st_dev, present.st_ino) ==
                (before["procDevice"], before["procInode"]), "R33_HUP_UNREAPED_BASELINE_INVALID")
        result["unreapedBaseline"] = {"poll": first, "hupEvents": [], "originalProofWasNone": True,
                                      "originalProcPathPresent": True, "observedMonotonic": time.monotonic()}

        def reap_own_child():
            try:
                remaining = deadline - time.monotonic()
                require(remaining > 0 and reaper_gate.wait(remaining), "R33_HUP_REAPER_GATE_TIMEOUT")
                if abort_reaper.is_set():
                    reaper_data["aborted"] = True
                    return
                reaper_data["callStartedMonotonic"] = time.monotonic()
                waited_pid, status = os.waitpid(child.pid, os.WNOHANG)
                reaper_data["callReturnedMonotonic"] = time.monotonic()
                require(waited_pid == child.pid, "R33_HUP_EXACT_CHILD_REAP_FAILED")
                code = os.waitstatus_to_exitcode(status)
                child.returncode = code
                reaper_data.update({"reaped": True, "waitedPID": waited_pid, "exitCode": code})
                require(code == 0, "R33_HUP_CHILD_NATURAL_EXIT_FAILED")
            except BaseException as error:
                reaper_data["failure"] = safe_error(error)

        class CoordinatedPoll:
            def __init__(self):
                self.poller = select.poll()
            def register(self, fd, mask):
                require(fd == child_fd and mask == 0, "R33_HUP_COORDINATED_REGISTER_INVALID")
                self.poller.register(fd, mask)
            def poll(self, timeout):
                result["observerPollEnteredMonotonic"] = time.monotonic()
                reaper_gate.set()
                return self.poller.poll(timeout)

        result["phase"] = "BOUNDED_HUP_WAIT"
        reaper = threading.Thread(target=reap_own_child, name="r33-own-child-reaper", daemon=True)
        reaper.start()
        budget = helper["BoundedHupBudget"](deadline)
        result["hupWait"] = helper["wait_for_hup_then_prove"](
            child.pid, attachment, boot, first, budget, original["pidfd_exit_proof"], held_fd,
            poll_factory=CoordinatedPoll)
        reaper.join(max(0.0, deadline - time.monotonic()))
        require(not reaper.is_alive() and reaper_data.get("reaped") is True
                and reaper_data.get("exitCode") == 0 and "failure" not in reaper_data,
                "R33_HUP_REAPER_INCOMPLETE")
        require(result["observerPollEnteredMonotonic"] <= reaper_data["callStartedMonotonic"]
                <= result["hupWait"]["pollReturnedMonotonic"], "R33_HUP_COORDINATION_ORDER_INVALID")
        result["coordinationOrderObserved"] = True
        result["coordinationLimitation"] = "Python wrapper entry precedes reap call; kernel blocking is not proved. Reaper return bookkeeping may follow observer wakeup."
        result["phase"] = "METHOD_COMPLETE"
    except BaseException as error:
        capture(error)
    finally:
        result["phase"] = "OWNED_CLEANUP"
        abort_reaper.set(); reaper_gate.set()
        reaper_still_alive = False
        if reaper is not None:
            reaper.join(max(0.0, min(1.0, enclosing_deadline - time.monotonic())))
            if reaper.is_alive():
                reaper_still_alive = True
                capture(RuntimeError("R33_HUP_REAPER_STILL_ALIVE"))
        if child is not None and not reaper_data.get("reaped") and not reaper_still_alive:
            try:
                if not gate_released:
                    release()
                if child_fd is not None:
                    bounded_events(child_fd, select.POLLIN, 1000, enclosing_deadline)
                waited, status = os.waitpid(child.pid, os.WNOHANG)
                require(waited == child.pid, "R33_HUP_CLEANUP_CHILD_UNREAPED")
                child.returncode = os.waitstatus_to_exitcode(status)
                reaper_data.update({"reaped": True, "exitCode": child.returncode,
                                    "waitedPID": waited, "cleanupReaped": True})
            except BaseException as error:
                capture(error)
        if "failure" in reaper_data:
            result["secondaryFailures"].append({"phase": "REAPER", **reaper_data["failure"]})
        result["phase"] = "DESCRIPTOR_CLOSE"
        for fd in list(ledger.active):
            try:
                ledger.close(fd)
            except BaseException as error:
                capture(error)
        result["descriptorLedger"] = ledger.rows
        result["descriptorClosed"] = ledger.complete()
        result["descriptorLedgerScope"] = "All explicit fixture allocations; excludes standard streams and transient interpreter/Popen implementation descriptors. The helper never owns or closes an fd."
        result["reaper"] = reaper_data
        result["childReaped"] = reaper_data.get("reaped") is True
        result["childExitCode"] = reaper_data.get("exitCode")
        result["normalChildExit"] = result["childReaped"] and result["childExitCode"] == 0
        result["elapsedSeconds"] = time.monotonic() - started
        result["fixtureQualified"] = bool(result["firstFailure"] is None and not result["secondaryFailures"]
            and result["normalChildExit"] and result["descriptorClosed"] and result.get("coordinationOrderObserved")
            and result.get("hupWait", {}).get("qualified") is True and not reaper_data.get("cleanupReaped")
            and time.monotonic() <= deadline)
        result["phase"] = "COMPLETE" if result["fixtureQualified"] else "REFUSED"
        result["methodSubsetExercised"] = result["fixtureQualified"]
    return result
