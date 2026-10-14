"""Local definition/AST guards only; never call the Linux method or spawn a child."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
path = BASE / "scripts/factory-single-entry-bound-method-fixture-r33.py"
raw_fixture = path.read_bytes()
spec = importlib.util.spec_from_file_location("prepared_method_fixture", path)
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
snapshots = {
    "native": "r33-single-entry-bound-census-native-source-2d05cf4bd18f10e0044981168b2bbad78957a07cbb5f89dab3eea3c972f37b73.py",
    "build": "r33-single-entry-bound-census-build-source-909f014941f1adbe3adf62a1dcd8d783c48f292c41f936c339cb293a2d0f7188.py",
}
checks = []


def required_rejection(call, code):
    try:
        call()
    except RuntimeError as error:
        assert str(error) == code, str(error)
    else:
        raise AssertionError("unexpected acceptance")


required_rejection(lambda: fixture.load_definitions(), "R33_METHOD_SOURCE_INPUT_REQUIRED")
required_rejection(lambda: fixture.load_definitions(b"changed", "native"), "R33_METHOD_GENERATED_SOURCE_CHANGED")
checks.append("missing_or_changed_source_rejected_before_definition_execution")

called = []


def closed_runtime():
    called.append("runtime")
    raise RuntimeError("R33_METHOD_UID1000_LINUX_REQUIRED")


fixture.runtime_guard = closed_runtime
default = fixture.execute_fixture()
assert default["fixtureQualified"] is False and called == [] and default["descriptorLedger"] == []
assert default["firstFailure"]["errorCode"] == "R33_METHOD_SOURCE_INPUT_REQUIRED"
checks.append("default_source_gate_precedes_runtime_or_kernel_method")

old = (BASE / "scripts/factory-bound-census-linux-fixture-r32-r2.py").read_text(encoding="utf-8")
new = raw_fixture.decode("utf-8")
old_nodes = {node.name: ast.get_source_segment(old, node) for node in ast.parse(old).body if isinstance(node, ast.FunctionDef)}
new_nodes = {node.name: ast.get_source_segment(new, node) for node in ast.parse(new).body if isinstance(node, ast.FunctionDef)}
assert old_nodes["safe_identity"] == new_nodes["safe_identity"]
checks.append("old_nullable_identity_binding_function_exact_bytes_preserved")

selected_by_phase = {}
for phase, name in snapshots.items():
    raw = (BASE / "artifacts/software-factory/goals-r29" / name).read_bytes()
    scope, source = fixture.load_definitions(raw, phase)
    assert source["generatedSourceSHA256"] == fixture.GENERATED_SHA256[phase]
    assert source["selectedSourceSHA256"] == fixture.SELECTED_SHA256
    assert "census" not in scope and "unit_state" not in scope and "ack_state" not in scope
    assert callable(scope["process_record"]) and callable(scope["SingleEntryDirectoryR33"])
    selected_by_phase[phase] = source["selectedSourceSHA256"]
    result = fixture.execute_fixture(raw, phase)
    assert result["fixtureQualified"] is False and result["descriptorLedger"] == []
    assert result["firstFailure"]["errorCode"] == "R33_METHOD_UID1000_LINUX_REQUIRED"
checks.append("both_actual_generated_snapshots_load_only_exact_pure_definitions")
assert called == ["runtime", "runtime"]
assert selected_by_phase["native"] == selected_by_phase["build"]
checks.append("runtime_rejection_precedes_child_or_getdents_and_both_selected_sets_equal")

print(json.dumps({"passed": len(checks), "checks": checks,
                  "fixtureSHA256": hashlib.sha256(raw_fixture).hexdigest(),
                  "generatedWholeProgramExecuted": False, "pureDefinitionsLoaded": True,
                  "linuxMethodSyscallExecuted": False,
                  "childSpawned": False, "remoteOperationsPerformed": False}, separators=(",", ":")))
