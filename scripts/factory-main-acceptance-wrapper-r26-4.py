#!/usr/bin/python3 -I
"""Finite, source-pinned current-main FA01 validation adapter, revision R26-4.

Reuses exact trusted FA01 tools without changing their files or R22 policy.
This validates existing tests/package/runtime, never all product objectives.
Only the two fixed workspace/run arguments and a private watchdog are accepted.
"""
import os
import sys

# The coordinator starts its watchdog with python3 rather than this shebang.
# Re-enter isolation before loading any optional modules or trusted tool code.
if __name__ == '__main__':
    os.environ.clear()
    os.environ.update({'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
                       'LC_ALL': 'C.UTF-8', 'HOME': '/root'})
    if not sys.flags.isolated:
        if globals().get('__file__') != '/usr/local/libexec/jarvis-msf-main-acceptance-r26-4':
            sys.stderr.write('MAIN_ACCEPTANCE_INSTALLED_ENTRY_REQUIRED\n')
            sys.exit(2)
        os.execve('/usr/bin/python3', ['/usr/bin/python3', '-I', __file__, *sys.argv[1:]], dict(os.environ))

import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import stat
from types import ModuleType

WORKSPACE = '/home/superopen/All-Projects/msf'
SOURCE_SHA256 = '151300cf55e8e46445e5e3b85293c047f981b14f620350a217a61d9a987056ea'
GOAL_HASH = '23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42'
WORK_PACKAGE = 'FA-01'
ENTRY = '/usr/local/libexec/jarvis-msf-main-acceptance-r26-4'
CONFIG_ROOT = '/etc/jarvis-development/main-acceptance-r26-4'
POLICY = CONFIG_ROOT + '/policy.json'
BASELINE = CONFIG_ROOT + '/baseline.json'
ROOT = '/var/lib/jarvis-development/101/main-acceptance-r26-4'
TOOLS = '/opt/jarvis-development/software-factory'
BROKER_ROOT = '/var/lib/jarvis-development/101/full-validation'
RUN_RE = r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'
REQUIRED = ['source-stability', 'build', 'typecheck', 'tests', 'package',
            'isolated-health', 'frontend', 'write-readback']
TOOL_SHA256 = {
    'project-autonomy-fa01-coordinator.py': 'f60c3e88056515e41bd0486285809b2342d783f21e225f9ffc64c3d96477740b',
    'project-autonomy-fa01-collector.mjs': 'a6cc30f63134fdc6d5be4aaba6049b99c0920c0db3e89b612d607b7991e647b7',
    'project-autonomy-evidence.py': '57aa1d8c49c189f0a9d2f4c1438ce154b556c263b907543462167b1faa673dd2',
    'project-autonomy-fa01-browser.mjs': '4836a22a44155ad0a1bc2beedf18e2efb0c52aa57baa1c3c1cb735e47fbbada0',
    'factory-sandbox-broker-control.py': '43afea4244f741bbaa3b4d347304c51e6886b8533aceb04967a439de0a4d3dbd',
    'factory-sandbox-broker.py': 'd4bcec4e88990e45c82d76574fe7c8de8eebd1db239cedceefd95a6b204d1954',
}

# The frozen collector also writes applicable-tests.json as an inventory list.
# Only its three actual Vitest reports belong in this diagnostic scanner.
# This exact, hash-guarded in-memory change leaves every validation check,
# source-consistency rule, test denominator and original installed tool intact.
SUMMARY_SCAN_FROM = '''    for path in evidence.glob('*-tests.json'):
        try:
            data = json.loads(path.read_text())
            for entry in data.get('testResults', []):
                rel = str(entry.get('name', '')).removeprefix('/work/source/')
                if entry.get('status') != 'passed' and rel in known_files:
                    failed_files.append(rel)
        except (OSError, ValueError, TypeError):
            pass
'''.encode('utf-8')
SUMMARY_SCAN_TO = '''    for report_name in ['packages-shared-tests.json', 'apps-server-tests.json', 'apps-web-tests.json']:
        path = evidence / report_name
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text())
            need(isinstance(data, dict) and isinstance(data.get('testResults'), list), 'FAILURE_TEST_REPORT_INVALID')
            for entry in data['testResults']:
                need(isinstance(entry, dict) and isinstance(entry.get('name'), str) and isinstance(entry.get('status'), str), 'FAILURE_TEST_ENTRY_INVALID')
                rel = entry['name'].removeprefix('/work/source/')
                if entry['status'] != 'passed' and rel in known_files:
                    failed_files.append(rel)
        except (OSError, ValueError, TypeError):
            errors.append({'id': 'failure-summary-tests', 'errorCode': 'FAILURE_TEST_REPORT_INVALID'})
'''.encode('utf-8')


def patched_coordinator_body(body):
    need(isinstance(body, bytes) and hashlib.sha256(body).hexdigest()
         == TOOL_SHA256['project-autonomy-fa01-coordinator.py'], 'MAIN_ACCEPTANCE_COORDINATOR_HASH_CHANGED')
    need(body.count(SUMMARY_SCAN_FROM) == 1, 'MAIN_ACCEPTANCE_COORDINATOR_PATCH_TARGET_CHANGED')
    result = body.replace(SUMMARY_SCAN_FROM, SUMMARY_SCAN_TO, 1)
    need(result.count(SUMMARY_SCAN_TO) == 1, 'MAIN_ACCEPTANCE_COORDINATOR_PATCH_NOT_UNIQUE')
    return result

# Frozen original denominator, including all three shared tests. The main
# baseline may add requirements, but may neither remove nor silently dedupe.
ORIGINAL_TESTS = (
    'apps/server/src/modules/ai/delegations.integration.test.ts',
    'apps/server/src/modules/ai/models.integration.test.ts',
    'apps/server/src/modules/ai/sessions.integration.test.ts',
    'apps/server/src/modules/ai/stream-pipeline.test.ts',
    'apps/server/src/modules/ai/template-draft.test.ts',
    'apps/server/src/modules/ai/tools-prompts-usage.integration.test.ts',
    'apps/server/src/modules/api/http-map-coverage.test.ts',
    'apps/server/src/modules/api/idempotency.e2e.test.ts',
    'apps/server/src/modules/design/design.integration.test.ts',
    'apps/server/src/modules/design/prototype-pages.integration.test.ts',
    'apps/server/src/modules/design/prototype-pages.test.ts',
    'apps/server/src/modules/dev/dev-routes.e2e.test.ts',
    'apps/server/src/modules/dev/dev.integration.test.ts',
    'apps/server/src/modules/evidence/audit.service.test.ts',
    'apps/server/src/modules/evidence/command-bus.integration.test.ts',
    'apps/server/src/modules/evidence/command-bus.test.ts',
    'apps/server/src/modules/executor/sandbox.integration.test.ts',
    'apps/server/src/modules/integration/integration.test.ts',
    'apps/server/src/modules/material/batch.integration.test.ts',
    'apps/server/src/modules/material/files.integration.test.ts',
    'apps/server/src/modules/material/materials.e2e.test.ts',
    'apps/server/src/modules/material/parse-engine.integration.test.ts',
    'apps/server/src/modules/material/parse.integration.test.ts',
    'apps/server/src/modules/material/uploads.integration.test.ts',
    'apps/server/src/modules/material/zip-check.test.ts',
    'apps/server/src/modules/material/zip-extract.integration.test.ts',
    'apps/server/src/modules/platform/auth.test.ts',
    'apps/server/src/modules/platform/cross-session-digest.test.ts',
    'apps/server/src/modules/platform/doc-conventions.test.ts',
    'apps/server/src/modules/platform/doc-export.test.ts',
    'apps/server/src/modules/platform/doc-prompts.test.ts',
    'apps/server/src/modules/platform/doc-sections.test.ts',
    'apps/server/src/modules/platform/doc-templates.test.ts',
    'apps/server/src/modules/platform/external-tools.test.ts',
    'apps/server/src/modules/platform/platform.integration.test.ts',
    'apps/server/src/modules/platform/rtm-health.test.ts',
    'apps/server/src/modules/platform/storage.service.test.ts',
    'apps/server/src/modules/platform/ui-score.test.ts',
    'apps/server/src/modules/policy/policy.integration.test.ts',
    'apps/server/src/modules/req/propose-edits.integration.test.ts',
    'apps/server/src/modules/req/req.integration.test.ts',
    'apps/server/src/modules/test/test.integration.test.ts',
    'packages/shared/src/doc-numbering.test.ts',
    'packages/shared/src/error-codes.test.ts',
    'packages/shared/src/fingerprint.test.ts',
)
ORIGINAL_SUITES = (
    'syntax', 'logic', 'task-data', 'design-catalog', 'customer-prototype',
    'customer-authority-boundary', 'customer-state-kernel', 'customer-route-matrix',
    'customer-privacy-projection', 'prototype-commands', 'prototype-effects-integration',
    'design-baseline', 'design-boundary', 'prototype-content', 'ui-scoring',
    'selftest', 'selftest-boundary', 'build-artifact', 'merge-basis',
    'contract-hardening', 'main-integration-boundary', 'attention-auto',
    'autopilot-boundary', 'review-cases', 'boundary', 'failure-matrix',
    'workflow', 'regression', 'visual', 'design-visual',
)


def need(value, code):
    if not value:
        raise ValueError(code)


def clean_environment():
    need(getattr(os, 'geteuid', lambda: -1)() == 0, 'MAIN_ACCEPTANCE_ROOT_REQUIRED')
    need(sys.flags.isolated, 'MAIN_ACCEPTANCE_ISOLATED_PYTHON_REQUIRED')
    os.environ.clear()
    os.environ.update({'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
                       'LC_ALL': 'C.UTF-8', 'HOME': '/root'})
    os.umask(0o077)
    sys.dont_write_bytecode = True


def trusted(path, private=False, directory=False):
    q = Path(path)
    for part in [q, *q.parents]:
        info = part.lstat()
        need(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
             'MAIN_ACCEPTANCE_PATH_UNTRUSTED')
        if part != q or directory:
            need(stat.S_ISDIR(info.st_mode), 'MAIN_ACCEPTANCE_DIRECTORY_REQUIRED')
        if part == q and private:
            need(not info.st_mode & 0o077, 'MAIN_ACCEPTANCE_PRIVATE_PATH_REQUIRED')


def read_trusted(path, private=False):
    trusted(path, private=private)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
             and not info.st_mode & (0o077 if private else 0o022)
             and 0 < info.st_size <= 1024 * 1024, 'MAIN_ACCEPTANCE_FILE_INVALID')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            body = stream.read(1024 * 1024 + 1)
        end = os.fstat(fd)
        need(len(body) == info.st_size and (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
             == (end.st_dev, end.st_ino, end.st_size, end.st_mtime_ns), 'MAIN_ACCEPTANCE_FILE_CHANGED')
        return body
    finally:
        os.close(fd)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'MAIN_ACCEPTANCE_JSON_DUPLICATE_KEY')
        result[key] = value
    return result


def decode_json(body):
    def invalid_constant(_):
        raise ValueError('MAIN_ACCEPTANCE_JSON_NONFINITE')
    value = json.loads(body, object_pairs_hook=unique_object, parse_constant=invalid_constant)
    need(isinstance(value, dict), 'MAIN_ACCEPTANCE_JSON_OBJECT_REQUIRED')
    return value


def validate_config(policy, baseline):
    need(policy.get('mode') in ('fa01-isolated-v1', 'project-isolated-v1')
         and policy.get('workspace') == WORKSPACE and policy.get('workPackage') == WORK_PACKAGE
         and policy.get('goalSpecHash') == GOAL_HASH and policy.get('evidenceRoot') == ROOT
         and policy.get('sourceFingerprint') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_POLICY_MISMATCH')
    checks = policy.get('expectedChecks')
    need(isinstance(checks, list) and all(isinstance(v, str) for v in checks)
         and len(checks) == len(REQUIRED) and set(checks) == set(REQUIRED),
         'MAIN_ACCEPTANCE_CHECKS_CHANGED')
    images = policy.get('imageIds')
    need(isinstance(images, dict) and set(images) == {'node', 'postgres', 'redis', 'minio'}
         and all(isinstance(v, str) and re.fullmatch(r'sha256:[a-f0-9]{64}', v) for v in images.values()),
         'MAIN_ACCEPTANCE_IMAGE_IDS_REQUIRED')
    need(baseline.get('schemaVersion') == 1 and baseline.get('kind') == 'project-autonomy-test-baseline'
         and baseline.get('workspace') == WORKSPACE
         and baseline.get('sourceFingerprintObserved') == SOURCE_SHA256,
         'MAIN_ACCEPTANCE_BASELINE_SCOPE_MISMATCH')
    tests, suites = baseline.get('requiredTestFiles'), baseline.get('requiredPrototypeSuites')
    need(isinstance(tests, list) and 45 <= len(tests) <= 1000
         and all(isinstance(v, str) and re.fullmatch(r'(?:apps|packages)/[a-zA-Z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?', v)
                 and '..' not in v.split('/') for v in tests)
         and len(set(tests)) == len(tests) and set(ORIGINAL_TESTS).issubset(tests),
         'MAIN_ACCEPTANCE_ORIGINAL_TESTS_REQUIRED')
    need(isinstance(suites, list) and 30 <= len(suites) <= 100
         and all(isinstance(v, str) and re.fullmatch(r'[a-z][a-z0-9-]+', v) for v in suites)
         and len(set(suites)) == len(suites) and set(ORIGINAL_SUITES).issubset(suites),
         'MAIN_ACCEPTANCE_ORIGINAL_SUITES_REQUIRED')
    coverage = baseline.get('minimumCoverage', {})
    need(isinstance(coverage, dict) and all(type(coverage.get(k)) in (int, float)
         and math.isfinite(coverage[k]) and minimum <= coverage[k] <= 100
         for k, minimum in [('lines', 90), ('branches', 80)]), 'MAIN_ACCEPTANCE_COVERAGE_FLOOR_REQUIRED')


def tool_bodies():
    result = {}
    for name, expected in TOOL_SHA256.items():
        body = read_trusted(TOOLS + '/' + name)
        need(hashlib.sha256(body).hexdigest() == expected, 'MAIN_ACCEPTANCE_TOOL_HASH_CHANGED')
        result[name] = body
    return result


def load_python(name, body, filename):
    module = ModuleType(name)
    module.__file__ = filename
    exec(compile(body, filename, 'exec', dont_inherit=True), module.__dict__)
    return module


def adapt_tools(bodies, run_id=None):
    coordinator = load_python('main_acceptance_coordinator_r26_4',
                              patched_coordinator_body(bodies['project-autonomy-fa01-coordinator.py']), ENTRY)
    helper = load_python('main_acceptance_evidence_r26', bodies['project-autonomy-evidence.py'],
                         TOOLS + '/project-autonomy-evidence.py')
    coordinator.WORKSPACE = WORKSPACE
    coordinator.ROOT = Path(ROOT)
    coordinator.BASELINE = Path(BASELINE)
    snapshot = helper.snapshot

    def pinned_snapshot(workspace, destination):
        need(workspace == WORKSPACE and run_id is not None, 'MAIN_ACCEPTANCE_SNAPSHOT_SCOPE_INVALID')
        relative = PurePosixPath(str(destination)).relative_to(PurePosixPath(ROOT))
        need(len(relative.parts) == 3 and relative.parts[0] == run_id
             and re.fullmatch(r'[a-f0-9]{32}', relative.parts[1]) and relative.parts[2] == 'snapshot',
             'MAIN_ACCEPTANCE_SNAPSHOT_SCOPE_INVALID')
        before = helper.fingerprint(workspace)
        need(before.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SOURCE_CHANGED')
        result = snapshot(workspace, destination)
        need(result.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SNAPSHOT_CHANGED')
        return result

    helper.snapshot = pinned_snapshot
    coordinator.load_helper = lambda: helper
    return coordinator, helper


def watchdog_identity(path):
    relative = PurePosixPath(path).relative_to(PurePosixPath(ROOT))
    need(len(relative.parts) == 3 and re.fullmatch(RUN_RE, relative.parts[0])
         and re.fullmatch(r'[a-f0-9]{32}', relative.parts[1]) and relative.parts[2] == 'lifecycle.json'
         and str(PurePosixPath(ROOT) / relative) == path, 'MAIN_ACCEPTANCE_WATCHDOG_PATH_INVALID')
    return relative.parts[:2]


def validate_watchdog(path, state):
    run_id, attempt = watchdog_identity(path)
    resource = hashlib.sha256((run_id + attempt).encode()).hexdigest()[:40]
    prefix = 'jarvis-fa01-' + resource
    labels = {'jarvis.validation.runId': run_id, 'jarvis.validation.attempt': attempt,
              'jarvis.validation.role': 'project-autonomy-fa01',
              'jarvis.validation.sourceFingerprint': SOURCE_SHA256}
    owner = state.get('owner')
    need(state.get('labels') == labels and state.get('resourceId') == resource
         and state.get('fingerprint') == SOURCE_SHA256
         and state.get('brokerScope') == BROKER_ROOT + '/' + resource
         and state.get('network') == prefix + '-net'
         and state.get('containers') == [prefix + '-' + v for v in ['postgres', 'redis', 'minio', 'build', 'runtime', 'probe']]
         and isinstance(owner, dict) and set(owner) == {'pid', 'start', 'boot'}
         and type(owner['pid']) is int and owner['pid'] > 1
         and isinstance(owner['start'], str) and re.fullmatch(r'[0-9]+', owner['start'])
         and isinstance(owner['boot'], str) and re.fullmatch(r'[a-f0-9-]{36}', owner['boot']),
         'MAIN_ACCEPTANCE_WATCHDOG_IDENTITY_INVALID')


def execute(args):
    clean_environment()
    need(__file__ == ENTRY, 'MAIN_ACCEPTANCE_INSTALLED_ENTRY_REQUIRED')
    read_trusted(ENTRY)
    trusted(CONFIG_ROOT, private=True, directory=True)
    trusted(ROOT, private=True, directory=True)
    policy = decode_json(read_trusted(POLICY, private=True))
    baseline = decode_json(read_trusted(BASELINE, private=True))
    validate_config(policy, baseline)
    bodies = tool_bodies()
    if len(args) == 2 and args[0] == '--watchdog':
        watchdog_identity(args[1])
        state = decode_json(read_trusted(args[1], private=True))
        validate_watchdog(args[1], state)
        coordinator, _ = adapt_tools(bodies)
        return coordinator.watchdog(args[1])
    need(len(args) == 2 and args[0] == WORKSPACE and re.fullmatch(RUN_RE, args[1]),
         'MAIN_ACCEPTANCE_FIXED_ARGUMENTS_REQUIRED')
    run_id = args[1]
    need(not os.path.lexists(ROOT + '/' + run_id), 'MAIN_ACCEPTANCE_RUN_ALREADY_EXISTS')
    coordinator, helper = adapt_tools(bodies, run_id)
    observed = helper.fingerprint(WORKSPACE)
    need(observed.get('sha256') == SOURCE_SHA256, 'MAIN_ACCEPTANCE_SOURCE_CHANGED')
    # Exclusive run directory also prevents two simultaneous wrapper calls
    # from starting competing attempts under the same platform run identity.
    os.mkdir(ROOT + '/' + run_id, 0o700)
    return coordinator.run(POLICY, WORKSPACE, run_id, WORK_PACKAGE, GOAL_HASH)


def failure_code(exc):
    value = str(exc)
    return value if re.fullmatch(r'[A-Z][A-Z0-9_]{0,150}', value) else 'MAIN_ACCEPTANCE_EXECUTION_FAILED'


def main(args=None):
    try:
        return execute(list(sys.argv[1:] if args is None else args))
    except (ValueError, OSError, KeyError, TypeError) as exc:
        # Same failure envelope as the trusted original coordinator. No raw
        # private paths/configuration/traceback or invented acceptance result.
        print(json.dumps({'schemaVersion': 1, 'kind': 'project-autonomy-validation',
                          'status': 'fail', 'simulated': False, 'errorCode': failure_code(exc)}), flush=True)
        return 2


if __name__ == '__main__':
    sys.exit(main())
