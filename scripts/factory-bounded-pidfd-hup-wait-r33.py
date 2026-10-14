"""Definition-only bounded wait; borrows one already bound pidfd, never closes it."""
import math
import os
import select
import time

PER_PID_MS = 250
SHARED_SCAN_MS = 1000
POLLIN = 0x001
POLLHUP = 0x010


class HupWaitRefusal(RuntimeError):
    def __init__(self, code, evidence=None):
        super().__init__(code)
        self.code = code
        self.evidence = {} if evidence is None else evidence


def require(value, code):
    if not value:
        raise HupWaitRefusal(code)


def descriptor_identity(fd):
    value = os.fstat(fd)
    return {"device": value.st_dev, "inode": value.st_ino, "mode": value.st_mode}


def binding_snapshot(pid, attachment, boot):
    require(type(pid) is int and pid > 0 and type(boot) is str and bool(boot),
            "R33_HUP_BINDING_INVALID")
    require(type(attachment) is dict and attachment.get("requestedPID") == pid
            and attachment.get("boot") == boot and attachment.get("identityBound") is True,
            "R33_HUP_IDENTITY_UNBOUND")
    known, listed = attachment.get("observedIdentity"), attachment.get("listedProcIdentity")
    require(type(known) is dict and type(listed) is dict
            and known.get("pid") == pid and known.get("boot") == boot
            and set(listed) == {"device", "inode"}
            and all(type(listed[k]) is int and listed[k] >= 0 for k in listed)
            and known.get("procDevice") == listed["device"]
            and known.get("procInode") == listed["inode"], "R33_HUP_IDENTITY_UNBOUND")
    require(type(attachment.get("fd")) is int and attachment["fd"] >= 0,
            "R33_HUP_DESCRIPTOR_INVALID")
    require(set(known).issubset({"pid", "boot", "procDevice", "procInode", "ppid", "startTicks"})
            and all(type(v) in (str, int) for v in known.values()), "R33_HUP_IDENTITY_INVALID")
    return {"requestedPID": pid, "boot": boot, "identityBound": True,
            "fd": attachment["fd"], "listedProcIdentity": dict(listed),
            "observedIdentity": dict(known)}


class BoundedHupBudget:
    """One instance per scan, shared by all eligible call sites and attachments."""
    def __init__(self, enclosing_deadline, clock=None):
        require(type(enclosing_deadline) in (int, float) and math.isfinite(enclosing_deadline),
                "R33_HUP_ENCLOSING_DEADLINE_REQUIRED")
        self.enclosing_deadline = float(enclosing_deadline)
        self.clock = time.monotonic if clock is None else clock
        self.shared_deadline = None
        self.attempts = {}
        self.last_clock = None

    def now(self):
        current = self.clock()
        require(type(current) in (int, float) and math.isfinite(current)
                and (self.last_clock is None or current >= self.last_clock),
                "R33_HUP_MONOTONIC_INVALID")
        self.last_clock = current
        return current

    def claim(self, attachment):
        key = id(attachment)
        require(key not in self.attempts, "R33_HUP_ATTEMPT_ALREADY_CONSUMED")
        # Strong reference prevents object-id reuse during the scan.
        self.attempts[key] = attachment


def wait_for_hup_then_prove(pid, attachment, boot, first_poll, budget,
                            original_proof, held_fd_identity, poll_factory=None,
                            fd_identity=None):
    """One Python poll invocation; exceptions refuse, and original proof stays external."""
    evidence = {"qualified": False, "requestedPID": pid, "pollInvocationCount": 0,
                "eventMaskRequested": 0, "perPIDMilliseconds": PER_PID_MS,
                "sharedPerScanMilliseconds": SHARED_SCAN_MS,
                "signalsSent": False, "descriptorClosedByHelper": False,
                "oneKernelSyscallClaimed": False}
    try:
        require(type(budget) is BoundedHupBudget, "R33_HUP_SHARED_BUDGET_REQUIRED")
        budget.claim(attachment)
        snapshot = binding_snapshot(pid, attachment, boot)
        require(type(first_poll) is dict and first_poll.get("exitConfirmed") is True
                and type(first_poll.get("pollEvents")) is int
                and first_poll["pollEvents"] in (POLLIN, POLLIN | POLLHUP),
                "R33_HUP_FIRST_EXIT_POLL_REQUIRED")
        require(type(held_fd_identity) is dict
                and set(held_fd_identity) == {"device", "inode", "mode"}
                and all(type(x) is int and x >= 0 for x in held_fd_identity.values()),
                "R33_HUP_HELD_DESCRIPTOR_IDENTITY_REQUIRED")
        expected_fd = dict(held_fd_identity)
        fd = snapshot["fd"]
        identity = descriptor_identity if fd_identity is None else fd_identity
        require(identity(fd) == expected_fd, "R33_HUP_DESCRIPTOR_IDENTITY_CHANGED")
        require(callable(original_proof), "R33_HUP_ORIGINAL_PROOF_REQUIRED")
        started = budget.now()
        if budget.shared_deadline is None:
            budget.shared_deadline = started + SHARED_SCAN_MS / 1000.0
        deadline = min(started + PER_PID_MS / 1000.0,
                       budget.shared_deadline, budget.enclosing_deadline)
        require(deadline > started, "R33_HUP_BUDGET_EXHAUSTED")
        poller = (select.poll if poll_factory is None else poll_factory)()
        poller.register(fd, 0)
        before = budget.now()
        # Floor, never ceil: a sub-millisecond remainder refuses instead of extending.
        timeout_ms = math.floor((deadline - before) * 1000.0)
        require(0 < timeout_ms <= PER_PID_MS, "R33_HUP_BUDGET_EXHAUSTED")
        evidence.update({"firstPoll": dict(first_poll), "originalIdentity": snapshot,
                         "heldDescriptorIdentity": expected_fd, "startedMonotonic": started,
                         "pollStartedMonotonic": before, "deadlineMonotonic": deadline,
                         "sharedDeadlineMonotonic": budget.shared_deadline,
                         "enclosingDeadlineMonotonic": budget.enclosing_deadline,
                         "requestedTimeoutMilliseconds": timeout_ms})
        evidence["pollInvocationCount"] = 1
        events = poller.poll(timeout_ms)
        after = budget.now()
        evidence.update({"pollReturnedMonotonic": after, "pollElapsedSeconds": after - before,
                         "totalElapsedSeconds": after - started})
        evidence["returnedEventCount"] = len(events) if type(events) is list else None
        evidence["returnedEvents"] = [{"fd": row[0], "mask": row[1]} for row in events
            if type(row) is tuple and len(row) == 2 and all(type(x) is int for x in row)] \
            if type(events) is list else None
        require(after <= deadline, "R33_HUP_DEADLINE_EXCEEDED")
        require(type(events) is list and len(events) == 1
                and type(events[0]) is tuple and len(events[0]) == 2
                and type(events[0][0]) is int and events[0][0] == fd
                and type(events[0][1]) is int and events[0][1] == POLLHUP,
                "R33_HUP_EVENT_REFUSED")
        evidence["waitMask"] = events[0][1]
        require(binding_snapshot(pid, attachment, boot) == snapshot
                and identity(fd) == expected_fd, "R33_HUP_BINDING_CHANGED")
        require(budget.now() <= deadline, "R33_HUP_DEADLINE_EXCEEDED")
        proof = original_proof(pid, attachment, boot)
        require(type(proof) is dict and proof.get("kernelProof", {}).get("procPathAbsent") is True
                and proof["kernelProof"].get("exitConfirmed") is True,
                "R33_HUP_ORIGINAL_PROOF_REFUSED")
        require(binding_snapshot(pid, attachment, boot) == snapshot
                and identity(fd) == expected_fd, "R33_HUP_BINDING_CHANGED")
        final = budget.now()
        evidence.update({"completedMonotonic": final, "totalElapsedSeconds": final - started})
        require(final <= deadline, "R33_HUP_DEADLINE_EXCEEDED")
        evidence.update({"qualified": True, "originalExitProof": proof})
        return evidence
    except HupWaitRefusal as error:
        evidence["refusalCode"] = error.code
        error.evidence = evidence
        raise
    except BaseException as error:
        # Includes a raising original alarm: retain its exception, never retry or succeed.
        evidence["refusalCode"] = "R33_HUP_WAIT_EXCEPTION"
        evidence["exceptionType"] = type(error).__name__
        evidence["errno"] = getattr(error, "errno", None)
        try:
            error.hup_wait_evidence = evidence
        except (AttributeError, TypeError):
            pass
        raise
