"""One controlled integration group. No real proc, fd, poll, process or transport IO."""
import ast
import errno
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "artifacts/software-factory/goals-r29/r33-bounded-hup-census-pure-export-and-inverse-1791973616105.json"
sha = lambda value: hashlib.sha256(value).hexdigest()
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
definitions = {
    "need", "HupWaitRefusal", "require", "descriptor_identity", "binding_snapshot",
    "BoundedHupBudget", "wait_for_hup_then_prove", "R33HupIntegrationRefusal",
    "r33_hup_exit_proof", "pidfd_poll", "pidfd_exit_proof", "census",
}
constants = {"PER_PID_MS", "SHARED_SCAN_MS", "POLLIN", "POLLHUP", "_R33_HUP_REFUSAL_CODES"}
BOOT = "00000000-0000-0000-0000-000000000001"
SCENARIOS = (
    "both-sites-success", "first-ENOENT", "first-ESRCH", "close-ENOENT", "close-ESRCH",
    "original-proof-None-both", "shared-budget-exhausted-at-close",
    "first-postelapsed-refusal", "first-original-alarm", "first-attach-fstat-failure",
)


def controlled(program, scenario):
    now = [0.0]
    close_calls, poll_calls, wait_calls, caught, states = [], [], [], [], {}
    stat_counts, first_counts = {}, {}
    thrown = RuntimeError("MAIN_REPAIR_HOST_OBSERVATION_TIMEOUT") if scenario == "first-original-alarm" else None

    class OS:
        O_RDONLY, O_DIRECTORY, O_NOFOLLOW = 0, 1, 2

        def open(self, value, flags):
            assert value == "/proc"
            return 99

        def pidfd_open(self, pid, flags):
            assert pid in (1, 2, 3) and flags == 0
            return 100 + pid

        def fstat(self, fd):
            if scenario == "first-attach-fstat-failure" and fd == 102:
                raise OSError(errno.EBADF, "controlled")
            return SimpleNamespace(st_dev=1 if fd == 99 else 7,
                                   st_ino=fd * 10, st_mode=384)

        def stat(self, path, follow_symlinks):
            assert follow_symlinks is False and path.startswith("/proc/")
            pid = int(path.rsplit("/", 1)[1])
            stat_counts[pid] = stat_counts.get(pid, 0) + 1
            if pid != 1 and stat_counts[pid] > 1 and scenario != "original-proof-None-both":
                raise FileNotFoundError(errno.ENOENT, "controlled")
            return SimpleNamespace(st_dev=1, st_ino=pid * 10)

        def close(self, fd):
            close_calls.append(fd)

    class Poll:
        def register(self, fd, mask):
            self.fd, self.mask = fd, mask

        def poll(self, timeout):
            nonlocal thrown
            fd, requested = self.fd, self.mask
            poll_calls.append((fd, requested, timeout))
            if requested == 1:
                assert timeout == 0
                n = first_counts.get(fd, 0)
                first_counts[fd] = n + 1
                masks = {101: [0, 0], 102: [1, 17], 103: [0, 1, 17]}
                assert n < len(masks[fd]), "Unexpected fallback/rescue/extra first poll"
                if fd == 103 and n == 1 and scenario == "shared-budget-exhausted-at-close":
                    now[0] = 1.01
                mask = masks[fd][n]
                return [] if mask == 0 else [(fd, mask)]
            assert requested == 0 and 0 < timeout <= 250
            site = "first" if fd == 102 else "close"
            if scenario in (site + "-ENOENT", site + "-ESRCH"):
                number = errno.ENOENT if scenario.endswith("ENOENT") else errno.ESRCH
                thrown = OSError(number, "controlled")
                raise thrown
            if fd == 102 and scenario == "first-original-alarm":
                raise thrown
            now[0] += 0.251 if fd == 102 and scenario == "first-postelapsed-refusal" else 0.05
            return [(fd, 16)]

    class Entries:
        def __init__(self, fd, tag):
            assert fd == 99 and tag == "PROC_SINGLE_GETDENTS47"

        def __enter__(self):
            return [SimpleNamespace(name=str(pid), inode=lambda pid=pid: pid * 10) for pid in (1, 2, 3)]

        def __exit__(self, *args):
            return False

    def process_record(pid, boot, attachment):
        assert boot == BOOT
        attachment["observedIdentity"].update(ppid=0, startTicks="1")
        if pid == 3 and scenario == "shared-budget-exhausted-at-close":
            now[0] = 0.9
        return dict(pid=pid, ppid=0, startTicks="1", boot=BOOT, procDevice=1,
                    procInode=pid * 10, uid=1000, state="S", cwdSHA256="a",
                    exeSHA256="b", argvSHA256="c", cgroups=["/unit"],
                    workspaceRelated=False)

    tree = ast.parse(program)
    selected = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in definitions:
            selected.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in constants for t in node.targets):
            selected.append(node)
    assert len([n for n in selected if isinstance(n, (ast.FunctionDef, ast.ClassDef))]) == len(definitions)
    namespace = {
        "os": OS(), "select": SimpleNamespace(POLLIN=1, POLLHUP=16, poll=Poll),
        "errno": errno, "math": math, "time": SimpleNamespace(monotonic=lambda: now[0]),
        "Path": lambda p: SimpleNamespace(read_text=lambda: BOOT) if p == "/proc/sys/kernel/random/boot_id" else None,
        "re": re, "unit_state": lambda: {"pid": 1, "cgroup": "/unit"},
        "account": SimpleNamespace(pw_uid=1000), "SingleEntryDirectoryR33": Entries,
        "OWNER_CGROUP": "/controlled-owned-build-scope",
        "process_record": process_record, "ack_state": lambda: {},
        "_R33_HUP_ENCLOSING_DEADLINE": 150,
        "CLOSED_READ_SUBPHASES": {"PIDFD_OPEN", "POST_ATTACH_PROC_IDENTITY", "PROCESS_READ",
                                "PIDFD_POLL", "PIDFD_EXIT_PATH_CHECK", "SCAN_CLOSE_PROC_IDENTITY"},
    }
    exec(compile(ast.Module(body=selected, type_ignores=[]), "<controlled-exact-definitions>", "exec"), namespace)
    old_poll, old_glue = namespace["pidfd_poll"], namespace["r33_hup_exit_proof"]

    def traced_poll(fd):
        value = old_poll(fd)
        states[fd] = value
        return value

    def traced_glue(pid, attachment, boot, state, budget):
        assert state is states[attachment["fd"]]
        assert attachment["hupHeldDescriptorIdentity"] == {"device": 7, "inode": attachment["fd"] * 10, "mode": 384}
        wait_calls.append((pid, attachment, budget))
        try:
            return old_glue(pid, attachment, boot, state, budget)
        except BaseException as error:
            caught.append(error)
            raise

    namespace["pidfd_poll"], namespace["r33_hup_exit_proof"] = traced_poll, traced_glue
    result = namespace["census"]()
    assert sorted(close_calls) == [99, 101, 102, 103] and len(set(close_calls)) == 4
    assert result["counts"]["listed"] == 3
    assert sum(result["counts"][key] for key in ("inspected", "pidfdProvenExits", "incomplete")) == 3
    assert result["listedPIDs"] == [1, 2, 3] and result["inspectedPIDs"] == [1]
    if len(wait_calls) == 2:
        assert wait_calls[0][2] is wait_calls[1][2], "Both call sites must share one budget"
        assert len(wait_calls[0][2].attempts) == 2
        assert wait_calls[0][2].shared_deadline == 1.0
    failures = {row["pid"]: row for row in result["readIncompleteReasons"]}
    if scenario == "both-sites-success":
        assert result["counts"] == {"listed": 3, "inspected": 1, "pidfdProvenExits": 2, "incomplete": 0}
        assert first_counts == {101: 2, 102: 2, 103: 3}
    elif scenario.endswith(("ENOENT", "ESRCH")):
        pid = 2 if scenario.startswith("first") else 3
        assert set(failures) == {pid} and failures[pid]["errorCode"] == "R29_CLEANUP_HUP_WAIT_EXCEPTION"
        assert failures[pid]["errno"] == thrown.errno
        assert len(caught) == 1 and not isinstance(caught[0], OSError)
        assert caught[0].__cause__ is thrown and caught[0].originalExceptionType == type(thrown).__name__
        assert first_counts[100 + pid] == (1 if pid == 2 else 2), "New error must not call old fallback proof"
    elif scenario == "original-proof-None-both":
        assert set(failures) == {2, 3}
        assert all(row["errorCode"] == "R29_CLEANUP_EXITED_PID_STILL_PRESENT" for row in failures.values())
        assert first_counts == {101: 2, 102: 2, 103: 3}, "None must not retry proof"
    elif scenario == "shared-budget-exhausted-at-close":
        assert set(failures) == {3} and failures[3]["errorCode"] == "R29_CLEANUP_HUP_BUDGET_EXHAUSTED"
        assert not any(fd == 103 and mask == 0 for fd, mask, _ in poll_calls)
        assert first_counts[103] == 2
    elif scenario == "first-postelapsed-refusal":
        assert set(failures) == {2} and failures[2]["errorCode"] == "R29_CLEANUP_HUP_DEADLINE_EXCEEDED"
        assert first_counts[102] == 1
    elif scenario == "first-original-alarm":
        assert set(failures) == {2} and failures[2]["errorCode"] == "PROCESS_READ_ERROR"
        assert caught == [thrown] and first_counts[102] == 1
    elif scenario == "first-attach-fstat-failure":
        assert set(failures) == {2} and failures[2]["phase"] == "pidfd-attach"
        assert failures[2]["readSubphase"] == "POST_ATTACH_PROC_IDENTITY"
        assert not any(fd == 102 for fd, _, _ in poll_calls)
        assert len(wait_calls) == 1
    else:
        raise AssertionError("Unknown scenario")
    assert len([row for row in poll_calls if row[0] == 102 and row[1] == 0]) <= 1
    assert len([row for row in poll_calls if row[0] == 103 and row[1] == 0]) <= 1
    return {"case": scenario, "passed": True, "unknownCount": len(failures),
            "allOwnedDescriptorsClosedExactlyOnce": True}


checks, cases = [], []
assert sys.argv[1:] in ([], ["--remaining-build-only"])
for row in manifest["outputs"]:
    if sys.argv[1:] and row["role"] != "build":
        continue
    original_row = next(x for x in manifest["inputs"] if x["role"] == row["role"])
    raw = (ROOT / row["path"]).read_bytes()
    original_raw = (ROOT / original_row["path"]).read_bytes()
    assert sha(raw) == row["sha256"] and len(raw) == row["bytes"]
    assert sha(original_raw) == original_row["sha256"] and len(original_raw) == original_row["bytes"]
    program, original = raw.decode(), original_raw.decode()
    inverse = program
    for delta in reversed(row["evidence"]["recipe"]):
        assert inverse.count(delta["after"]) == 1
        inverse = inverse.replace(delta["after"], delta["before"])
    assert inverse == original
    def definition(text, name):
        node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == name)
        return node, ast.get_source_segment(text, node)
    proof = program[program.index("def pidfd_exit_proof("):program.index("def census():")]
    assert sha(proof.encode()) == "c0e02a02fe488c474e879c80cc89c2c445aead72c42275f9f0b0f264cc4d660a"
    assert sha(definition(program, "pidfd_exit_proof")[1].encode()) == "ee4ab7a845eb51a031f8fccaf8daf3eefabe9b222e3bf03a1a3819aa1c200109"
    assert definition(program, "process_record")[1] == definition(original, "process_record")[1]
    new_census, _ = definition(program, "census")
    old_census, _ = definition(original, "census")
    handlers = lambda text, node: [ast.get_source_segment(text, h) for h in ast.walk(node) if isinstance(h, ast.ExceptHandler)]
    assert handlers(program, new_census) == handlers(original, old_census)
    outer_new = next(n for n in new_census.body if isinstance(n, ast.Try))
    outer_old = next(n for n in old_census.body if isinstance(n, ast.Try))
    assert [ast.get_source_segment(program, n) for n in outer_new.finalbody] == [ast.get_source_segment(original, n) for n in outer_old.finalbody]
    calls = [n.func.id for n in ast.walk(new_census) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)]
    assert calls.count("r33_hup_exit_proof") == 2 and calls.count("pidfd_poll") == 2 and calls.count("pidfd_exit_proof") == 2
    assert program.count("signal.signal(signal.SIGALRM,deadline);signal.alarm(150)") == 1
    assert "_R33_HUP_ENCLOSING_DEADLINE=_r33_hup_time.monotonic()+150\nsignal.signal(signal.SIGALRM,deadline);signal.alarm(150)" in program
    helper_row = next(x for x in manifest["inputs"] if x["role"] == "helper")
    helper = (ROOT / helper_row["path"]).read_bytes()
    assert sha(helper) == helper_row["sha256"]
    assert ("# BEGIN R33 BOUNDED-HUP EXACT HELPER\n" + helper.decode() + "# END R33 BOUNDED-HUP EXACT HELPER\n") in program
    checks.append({"program": row["role"], "exactInverse": True, "exactOriginalProofAndProcessRecord": True,
                   "allOriginalCatchBodiesAndFinalizerExact": True, "onlyTwoEligibleCallsAndOriginalFirstPolls": True,
                   "sameOriginalAlarmBoundary": True, "exactQualifiedHelperBytes": True})
    for scenario in SCENARIOS:
        cases.append({"program": row["role"], **controlled(program, scenario)})
print(json.dumps({"kind": "r33-bounded-hup-census-new-controlled-integration-group", "passed": True,
                  "caseCount": len(cases), "cases": cases, "sourceChecks": checks,
                  "wholeProgramsExecuted": 0, "exactCensusDefinitionsExecutedOnlyWithControlledDependencies": True,
                  "actualLinuxExecuted": False, "realProcFDOrPollOperations": 0, "remoteOperations": 0,
                  "oldTestsRerun": 0, "wholeCensusQualified": False}, separators=(",", ":")))
