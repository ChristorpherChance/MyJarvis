"""One controlled new-guard group; no Linux method, process, original proof or old suite."""
import ast
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/factory-bounded-pidfd-hup-wait-r33.py"
FIXTURE = ROOT / "scripts/factory-bounded-pidfd-hup-method-fixture-r33.py"
NATIVE = ROOT / "artifacts/software-factory/goals-r29/r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py"


def load(path):
    raw = path.read_bytes()
    scope = {}
    exec(compile(ast.parse(raw), str(path), "exec"), scope)
    return scope, raw


def main():
    helper, helper_raw = load(HELPER)
    fixture, fixture_raw = load(FIXTURE)
    checks = []

    def record(name, assertion):
        if not assertion:
            raise AssertionError(name)
        checks.append(name)

    class Clock:
        def __init__(self): self.value = 0.0
        def __call__(self): return self.value

    class Poll:
        def __init__(self, events=None, action=None, error=None):
            self.events = [(42, 16)] if events is None else events
            self.action = action; self.error = error; self.calls = 0; self.registered = None
        def register(self, fd, mask): self.registered = (fd, mask)
        def poll(self, timeout):
            self.calls += 1
            if self.action: self.action()
            if self.error: raise self.error
            return self.events

    def attachment():
        return {"requestedPID": 7, "boot": "controlled-boot", "identityBound": True, "fd": 42,
                "listedProcIdentity": {"device": 1, "inode": 2},
                "observedIdentity": {"pid": 7, "boot": "controlled-boot", "procDevice": 1,
                                     "procInode": 2, "ppid": 3, "startTicks": "4"}}

    held = {"device": 9, "inode": 10, "mode": 11}
    good_poll = {"exitConfirmed": True, "pollEvents": 1}
    proof_calls = []

    def proof(*args):
        proof_calls.append(args)
        return {"kernelProof": {"procPathAbsent": True, "exitConfirmed": True}}

    def invoke(a=None, clock=None, poll=None, budget=None, first=None, identity=None, fn=proof):
        a = attachment() if a is None else a
        clock = Clock() if clock is None else clock
        poll = Poll() if poll is None else poll
        budget = helper["BoundedHupBudget"](10.0, clock) if budget is None else budget
        return helper["wait_for_hup_then_prove"](7, a, "controlled-boot",
            good_poll if first is None else first, budget, fn, held,
            poll_factory=lambda: poll, fd_identity=(lambda fd: dict(held)) if identity is None else identity)

    def refused(name, expected, **kwargs):
        try:
            invoke(**kwargs)
        except helper["HupWaitRefusal"] as error:
            record(name, error.code == expected and not error.evidence["qualified"])
        else:
            raise AssertionError(name + " accepted")

    p = Poll(); value = invoke(poll=p)
    record("exact_hup_original_proof_success_once", value["qualified"] and p.calls == 1
           and p.registered == (42, 0) and value["requestedTimeoutMilliseconds"] == 250)
    refused("first_exit_required", "R33_HUP_FIRST_EXIT_POLL_REQUIRED",
            first={"exitConfirmed": False, "pollEvents": 0})
    a = attachment(); a["identityBound"] = False
    refused("identity_bound_required", "R33_HUP_IDENTITY_UNBOUND", a=a)
    for name, events in [("timeout", []), ("readable", [(42, 1)]), ("mixed_in_hup", [(42, 17)]),
                         ("error_hup", [(42, 24)]), ("invalid_fd", [(42, 32)]),
                         ("wrong_fd", [(43, 16)]), ("duplicate", [(42, 16), (42, 16)])]:
        p = Poll(events=events)
        refused(name, "R33_HUP_EVENT_REFUSED", poll=p)
        record(name + "_no_retry", p.calls == 1)
    a = attachment(); p = Poll(action=lambda: a.update(fd=43))
    refused("attachment_fd_changed", "R33_HUP_BINDING_CHANGED", a=a, poll=p)
    changed = {"value": False}; p = Poll(action=lambda: changed.update(value=True))
    refused("same_fd_slot_reused", "R33_HUP_BINDING_CHANGED", poll=p,
            identity=lambda fd: {**held, "inode": 99 if changed["value"] else 10})
    refused("held_fd_changed_before_wait", "R33_HUP_DESCRIPTOR_IDENTITY_CHANGED",
            identity=lambda fd: {**held, "inode": 99})
    clock = Clock(); a = attachment(); budget = helper["BoundedHupBudget"](10.0, clock)
    invoke(a=a, clock=clock, budget=budget)
    refused("attachment_one_opportunity", "R33_HUP_ATTEMPT_ALREADY_CONSUMED", a=a, clock=clock, budget=budget)
    clock.value = 1.001
    refused("shared_budget_not_reset", "R33_HUP_BUDGET_EXHAUSTED", clock=clock, budget=budget)
    clock = Clock(); p = Poll(action=lambda: setattr(clock, "value", 0.251))
    refused("actual_elapsed_overrun", "R33_HUP_DEADLINE_EXCEEDED", clock=clock, poll=p)
    clock = Clock(); budget = helper["BoundedHupBudget"](0.1, clock)
    p = Poll(action=lambda: setattr(clock, "value", 0.101))
    refused("enclosing_deadline_overrun", "R33_HUP_DEADLINE_EXCEEDED", clock=clock, budget=budget, poll=p)
    clock = Clock(); budget = helper["BoundedHupBudget"](0.0005, clock)
    refused("submillisecond_no_infinite_wait", "R33_HUP_BUDGET_EXHAUSTED", clock=clock, budget=budget)
    refused("present_path_original_none", "R33_HUP_ORIGINAL_PROOF_REFUSED", fn=lambda *a: None)
    clock = Clock()
    def late_proof(*args):
        clock.value = 0.251
        return proof(*args)
    refused("final_proof_elapsed_overrun", "R33_HUP_DEADLINE_EXCEEDED", clock=clock, fn=late_proof)
    alarm = RuntimeError("MAIN_REPAIR_HOST_OBSERVATION_TIMEOUT"); p = Poll(error=alarm)
    try:
        invoke(poll=p)
    except RuntimeError as error:
        record("raising_alarm_same_object_no_retry", error is alarm and p.calls == 1
               and error.hup_wait_evidence["qualified"] is False)
    else:
        raise AssertionError("alarm swallowed")
    def forbidden(*args, **kwargs): raise AssertionError("default interface performed work")
    real_clock, real_ledger = fixture["time"], fixture["DescriptorLedger"]
    fixture["time"] = SimpleNamespace(monotonic=forbidden)
    fixture["DescriptorLedger"] = forbidden
    value = fixture["execute_method"]()
    record("null_interface_no_clock_fd_or_thread", not value["fixtureQualified"]
           and value["firstFailure"]["code"] == "R33_HUP_METHOD_NULL_INTERFACE")
    fixture["time"], fixture["DescriptorLedger"] = real_clock, real_ledger
    original, _, evidence = fixture["source_definitions"](NATIVE.read_bytes(), helper_raw)
    record("exact_only_original_three_definitions", evidence["originalDefinitionSHA256"] == fixture["ORIGINAL_DEFINITIONS"]
           and not evidence["nativeTopLevelExecuted"] and not evidence["censusLoaded"]
           and {x for x in original if not x.startswith("__")} == {"os", "select", "errno", "need", "pidfd_poll", "pidfd_exit_proof"})
    print(json.dumps({"schemaVersion": 1, "kind": "r33-hup-new-controlled-guard-group",
                      "passed": True, "checkCount": len(checks), "checks": checks,
                      "helperSHA256": hashlib.sha256(helper_raw).hexdigest(),
                      "fixtureSHA256": hashlib.sha256(fixture_raw).hexdigest(),
                      "actualLinuxMethodExecuted": False, "originalProofExecuted": False,
                      "oldTestsRerun": False, "processesCreated": 0, "remoteOperations": 0}, sort_keys=True))


if __name__ == "__main__":
    main()
