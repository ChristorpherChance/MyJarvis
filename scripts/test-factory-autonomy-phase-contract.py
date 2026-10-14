"""Local trusted collector contract tests; no product/model/remote execution."""
import ast
import base64
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

HERE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


c = load('phase_contract_under_test', HERE / 'factory-autonomy-phase-contract.py')
coordinator = load('phase_coordinator_protocol', HERE / 'project-autonomy-fa01-coordinator.py')
io_helper = load('phase_safe_io_protocol', HERE / 'project-autonomy-evidence.py')
observer = load('phase_root_observer_protocol', HERE / 'project-autonomy-prerequisite-observer.py')
SPEC = json.loads((HERE.parent / 'artifacts/software-factory/autonomy-r22/objectives.json').read_text(encoding='utf-8'))
RUN, ATTEMPT, SOURCE = 'a' * 40, 'b' * 32, 'c' * 64
GOAL = c.canonical_goal_hash(SPEC)
CONTAINER = 'jarvis-fa01-' + 'd' * 40 + '-runtime'
P1 = '11111111-1111-4111-8111-111111111111'
P2 = '22222222-2222-4222-8222-222222222222'


def response(value, status=200, cookie=''):
    return {'status': status, 'bodyBase64': base64.b64encode(c.encoded(value)).decode(),
            'contentType': 'application/json', 'setCookie': cookie}


def collector(phase='FA-02', transport=None):
    x = c.Collector(phase, '/not-production/source', '/not-production/evidence/phase-contract.json', CONTAINER, RUN, ATTEMPT, SOURCE, GOAL, transport=transport)
    x.goal_spec = SPEC
    return x


def own_info():
    return {'Name': '/' + CONTAINER, 'State': {'Running': True},
        'Config': {'Labels': {'jarvis.validation.runId': RUN, 'jarvis.validation.attempt': ATTEMPT,
            'jarvis.validation.role': 'project-autonomy-fa01', 'jarvis.validation.sourceFingerprint': SOURCE}},
        'HostConfig': {'PortBindings': {}, 'Privileged': False, 'NetworkMode': CONTAINER.removesuffix('-runtime') + '-net'},
        'NetworkSettings': {'Ports': {}}}


class PhaseContractTests(unittest.TestCase):
    def test_exact_all_66_remaining_objectives_once(self):
        mapped = ['MSF-OBJ-%03d' % n for groups in c.PHASES.values() for _, nums in groups for n in nums]
        actual = [v['id'] for v in SPEC['objectives'] if v['workPackage'] != 'FA-01']
        self.assertEqual(sorted(mapped), sorted(actual))
        self.assertEqual(len(mapped), 66)
        self.assertEqual(len(set(mapped)), len(mapped))

    def test_per_phase_goal_dependency_registry_matches(self):
        for phase, groups in c.PHASES.items():
            self.assertEqual({'MSF-OBJ-%03d' % n for _, nums in groups for n in nums}, {v['id'] for v in SPEC['objectives'] if v['workPackage'] == phase})

    def test_canonical_goal_hash_not_pretty_file_hash(self):
        self.assertEqual(GOAL, '23d7db28c5b8d3c8516d2607564a03475609cf590b1523e1cd7e6596eac34b42')
        self.assertNotEqual(c.sha((HERE.parent / 'artifacts/software-factory/autonomy-r22/objectives.json').read_bytes()), GOAL)

    def test_closed_owned_container_identity(self):
        c.owned_labels(own_info(), CONTAINER, RUN, ATTEMPT, SOURCE)

    def test_same_run_old_attempt_denied(self):
        bad = own_info()
        bad['Config']['Labels']['jarvis.validation.attempt'] = 'e' * 32
        with self.assertRaisesRegex(ValueError, 'OWN_RUNTIME_IDENTITY_MISMATCH'):
            c.owned_labels(bad, CONTAINER, RUN, ATTEMPT, SOURCE)

    def test_wrong_source_denied(self):
        with self.assertRaisesRegex(ValueError, 'OWN_RUNTIME_IDENTITY_MISMATCH'):
            c.owned_labels(own_info(), CONTAINER, RUN, ATTEMPT, 'e' * 64)

    def test_host_ports_denied(self):
        bad = own_info()
        bad['HostConfig']['PortBindings'] = {'18930/tcp': [{'HostPort': '18930'}]}
        with self.assertRaisesRegex(ValueError, 'HOST_PORTS_FORBIDDEN'):
            c.owned_labels(bad, CONTAINER, RUN, ATTEMPT, SOURCE)

    def test_wrong_runtime_and_host_network_denied(self):
        for name, field in [('unrelated-runtime', None), (CONTAINER, 'host')]:
            bad = own_info()
            if field:
                bad['HostConfig']['NetworkMode'] = field
            with self.assertRaises(ValueError):
                c.owned_labels(bad, name, RUN, ATTEMPT, SOURCE)

    def test_public_relative_paths_allowed(self):
        for v in ('doc/evidence/current.json', 'docs/产品使用.md', 'artifacts/current/screens.png', 'delivery/app.zip', 'dist/app.js'):
            self.assertEqual(str(c.relative_public(v)), v)

    def test_private_traversal_encoded_and_ambiguous_paths_denied(self):
        for v in ('../doc/a.json', '/doc/a.json', 'doc/../a.json', 'doc//a.json', 'doc/./a.json', 'doc/.env', 'doc/private/a.json', 'doc/password.json', 'doc/a%2f.json', 'doc/a?key=x', 'doc/a#x', 'doc/a\\b.json', 'node_modules/a.json', 'docs/a\x00.md'):
            with self.subTest(path=v), self.assertRaises(ValueError):
                c.relative_public(v)

    def test_never_calls_arbitrary_or_foreign_project_write(self):
        called = []
        x = collector(transport=lambda r: called.append(r) or response({}))
        x.primary, x.secondary, x.projects = P1, P2, {P1, P2}
        for path in ('/api/system/settings', '/api/v1/projects/33333333-3333-4333-8333-333333333333/tasks', '/api/v1/ai/models'):
            with self.assertRaises(ValueError):
                x.raw(path, 'POST', {})
        self.assertEqual(called, [])

    def test_never_calls_encoded_path_or_external_origin(self):
        x = collector(transport=lambda _: self.fail('transport must not be invoked'))
        for path in ('https://public.example/api/projects', '//public.example', '/api/projects/../auth', '/api/projects/%2e%2e/auth'):
            with self.assertRaises(ValueError):
                x.raw(path)

    def test_call_limit_fails_before_transport(self):
        x = collector(transport=lambda _: self.fail('limit must prevent request'))
        x.calls = c.MAX_CALLS
        with self.assertRaisesRegex(ValueError, 'PHASE_EXECUTION_LIMIT'):
            x.raw('/health')

    def test_root_receipt_absence_unknown_never_pass_or_repair(self):
        x = collector('FA-03')
        p = c.Probe(x, 'fa03-definition-model-context', ['MSF-OBJ-022'])
        p.test('root-real-provider-required', lambda: x.trusted_receipt('provider', ['requestedModel']))
        p.done()
        self.assertEqual(x.checks[0]['status'], 'unknown')
        self.assertEqual(x.checks[0]['tests'], {'total': 1, 'passed': 0, 'failed': 0, 'skipped': 0, 'unknown': 1})
        self.assertEqual(x.waiting_prerequisites[0]['id'], 'provider')
        self.assertEqual(x.waiting_prerequisites[0]['checkId'], 'fa03-definition-model-context')

    def test_real_observer_status_cross_module_and_phase_filter(self):
        x = collector('FA-09')
        identity = {'runId': RUN, 'attempt': ATTEMPT, 'sourceFingerprint': SOURCE, 'goalSpecHash': GOAL, 'workPackage': 'FA-09'}
        actual = observer.status(identity, {'actualObservedSeconds': 127.5}, True)
        clean = x.validate_prerequisite_status(actual)
        self.assertEqual({v['id'] for v in clean['waiting']}, {'e2e', 'long-observation', 'reuse-records'})
        long = next(v for v in clean['waiting'] if v['id'] == 'long-observation')
        self.assertEqual(long['actualObservedSeconds'], 127.5)
        self.assertIs(clean['observationsAreAcceptance'], False)

    def test_old_attempt_or_fake_observer_pass_metadata_denied(self):
        x = collector('FA-03')
        identity = {'runId': RUN, 'attempt': ATTEMPT, 'sourceFingerprint': SOURCE, 'goalSpecHash': GOAL, 'workPackage': 'FA-03'}
        row = observer.status(identity, None, False)
        for mutate in (lambda v: v.update(attempt='f' * 32), lambda v: v.update(observationsAreAcceptance=True), lambda v: v['waiting'][0].update(reasonCode='SECRET_UNKNOWN_STATUS')):
            bad = copy.deepcopy(row)
            mutate(bad)
            with self.assertRaises(ValueError):
                x.validate_prerequisite_status(bad)

    def test_observer_time_must_be_utc_current_not_future_or_stale(self):
        x = collector('FA-03')
        identity = {'runId': RUN, 'attempt': ATTEMPT, 'sourceFingerprint': SOURCE, 'goalSpecHash': GOAL, 'workPackage': 'FA-03'}
        row = observer.status(identity, None, False)
        for stamp in ('2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z', datetime.now().isoformat(), datetime.now(timezone(timedelta(hours=8))).isoformat()):
            bad = copy.deepcopy(row)
            bad['observedAt'] = stamp
            with self.assertRaises(ValueError):
                x.validate_prerequisite_status(bad)

    def test_actual_function_failure_is_fail(self):
        x = collector()
        p = c.Probe(x, 'fa02-input-contract', ['MSF-OBJ-009'])
        p.test('negative-missing-endpoint', lambda: c.need(False, 'REQUIRED_ENDPOINT_OR_SCHEMA_MISSING'))
        p.done()
        self.assertEqual(x.checks[0]['status'], 'fail')
        self.assertEqual(x.waiting_prerequisites, [])

    def test_root_observer_export_is_once_after_all_phase_checks(self):
        x = collector('FA-08')
        order = []
        x.setup = lambda: order.append('setup')
        def group(check_id, numbers):
            order.append(check_id)
            p = c.Probe(x, check_id, ['MSF-OBJ-%03d' % n for n in numbers])
            p.test('executed-contract-assertion', lambda: True)
            p.done()
        x.run_group = group
        x.export_prerequisites = lambda: order.append('export')
        self.assertEqual(x.run()['status'], 'pass')
        self.assertEqual(order, ['setup', *[v[0] for v in c.PHASES['FA-08']], 'export'])

    def test_missing_prerequisite_cannot_mask_real_product_failure(self):
        x = collector('FA-08', transport=lambda _: None)
        x.setup = lambda: None
        def group(check_id, numbers):
            p = c.Probe(x, check_id, ['MSF-OBJ-%03d' % n for n in numbers])
            if check_id == 'fa08-bundle-export-download':
                p.test('actual-product-bytes-missing', lambda: c.need(False, 'EVIDENCE_BYTES_MISMATCH'))
            else:
                p.test('actual-install-observer-pending', lambda: (_ for _ in ()).throw(c.PrerequisiteWait('customer-installation')))
            p.done()
        x.run_group = group
        report = x.run()
        self.assertEqual(report['status'], 'fail')
        self.assertEqual([v['status'] for v in report['checks']], ['fail', 'unknown'])
        self.assertEqual(report['waitingPrerequisites'][0]['checkId'], 'fa08-install-use-recovery')

    def test_real_zip_bytes_safe_and_unsafe_names_before_decompression(self):
        for name in ('../escape.txt', 'a/../escape.txt', '/absolute.txt', 'C:/absolute.txt', 'a\\escape.txt', 'a/%2e%2e/escape.txt', 'a//b.txt'):
            with self.subTest(name=name):
                buffer = io.BytesIO()
                with zipfile.ZipFile(buffer, 'w') as z:
                    entry = zipfile.ZipInfo('fixture.txt')
                    # Windows ZipInfo normalizes backslashes at construction;
                    # assign afterward so the actual hostile bytes survive.
                    entry.filename = name
                    z.writestr(entry, b'fixture')
                with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as z:
                    with self.assertRaisesRegex(ValueError, 'ARCHIVE_ENTRY_PATH_INVALID'):
                        c.safe_archive(z)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            z.writestr('[Content_Types].xml', '<Types>real fixture xml</Types>')
            z.writestr('word/document.xml', '<document>real fixture xml</document>')
        with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as z:
            self.assertEqual(len(c.safe_archive(z)), 2)
            self.assertIsNone(z.testzip())

    def test_actual_compressed_zip_expansion_and_symlink_denied(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('word/document.xml', b'x' * (c.MAX_BYTES + 1))
        self.assertLess(len(buffer.getvalue()), 15000)
        with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as z:
            with self.assertRaisesRegex(ValueError, 'ARCHIVE_LINK_ENCRYPTION_OR_FILE_LIMIT'):
                c.safe_archive(z)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            entry = zipfile.ZipInfo('linked.txt')
            entry.create_system = 3
            entry.external_attr = 0o120777 << 16
            z.writestr(entry, 'other-file')
        with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as z:
            with self.assertRaisesRegex(ValueError, 'ARCHIVE_LINK_ENCRYPTION_OR_FILE_LIMIT'):
                c.safe_archive(z)

    def test_generic_missing_route_is_not_successful_negative_business_test(self):
        with self.assertRaisesRegex(ValueError, 'GENERIC_MISSING_ROUTE_IS_NOT_BUSINESS_REJECTION'):
            c.business_rejection({'status': 404, 'value': {'statusCode': 404, 'message': 'Cannot POST missing', 'error': 'Not Found'}}, (404,), 'NEGATIVE_NOT_REJECTED')

    def test_actual_domain_rejection_error_shell(self):
        c.business_rejection({'status': 422, 'value': {'error': {'code': 'UPLOAD_REJECTED', 'message': 'public safe text'}}}, (400, 409, 413, 422), 'UNSAFE_ZIP_NOT_REJECTED')

    def test_error_output_never_contains_exception_secret_text(self):
        x = collector()
        p = c.Probe(x, 'fa02-input-contract', ['MSF-OBJ-009'])
        p.test('transport-exception', lambda: (_ for _ in ()).throw(RuntimeError('PRIVATE value never publish')))
        p.done()
        self.assertNotIn('PRIVATE value', json.dumps(x.problems))
        self.assertEqual(x.problems[0]['errorCode'], 'PHASE_ASSERTION_FAILED')

    def test_probe_fresh_counts_and_string_command_real_protocol(self):
        x = collector('FA-08')
        for check_id, ids in c.PHASES['FA-08']:
            p = c.Probe(x, check_id, ['MSF-OBJ-%03d' % n for n in ids])
            p.test('actual-assertion-success', lambda: {'rawHash': 'f' * 64})
            p.done()
        report = {'runId': RUN, 'sourceFingerprint': SOURCE, 'goalSpecHash': GOAL, 'workPackage': 'FA-08', 'checks': x.checks, 'problems': x.problems, 'artifacts': []}
        self.assertIs(coordinator.phase_report(report, RUN, SOURCE, 'FA-08', GOAL, [v[0] for v in c.PHASES['FA-08']]), report)
        self.assertTrue(all(isinstance(v['command'], str) for v in report['checks']))

    def test_cross_module_rejects_array_command(self):
        x = collector('FA-08')
        for check_id, ids in c.PHASES['FA-08']:
            p = c.Probe(x, check_id, [])
            p.test('assertion', lambda: True)
            p.done()
        report = {'runId': RUN, 'sourceFingerprint': SOURCE, 'goalSpecHash': GOAL, 'workPackage': 'FA-08', 'checks': copy.deepcopy(x.checks), 'artifacts': [], 'problems': []}
        report['checks'][0]['command'] = ['incorrect', 'array']
        with self.assertRaisesRegex(ValueError, 'PHASE_CHECK_INVALID'):
            coordinator.phase_report(report, RUN, SOURCE, 'FA-08', GOAL, [v[0] for v in c.PHASES['FA-08']])

    def test_all_eight_phase_reports_actual_404_fail_closed_and_protocol(self):
        def missing(request):
            path = request['path']
            if path == '/health':
                return response({'ok': True, 'db': True, 'redis': True, 'minio': True})
            if path == '/api/projects' and request['method'] == 'GET':
                return response({'error': 'unauthenticated'}, 401)
            if path == '/api/auth/login':
                return response({'ok': True}, cookie='msf_auth=isolated-test; HttpOnly; SameSite=Lax')
            if path == '/api/projects' and request['method'] == 'POST':
                payload = json.loads(base64.b64decode(request['bodyBase64']))
                pid = P1 if 'primary' in payload['name'] else P2
                names[pid] = payload['name']
                return response({'id': pid}, 201)
            if path in ('/api/projects/' + P1, '/api/projects/' + P2):
                return response({'id': path.split('/')[-1], 'name': names[path.split('/')[-1]]})
            return response({'error': 'missing-product-resource'}, 404)
        for phase, groups in c.PHASES.items():
            with self.subTest(phase=phase):
                names = {}
                x = collector(phase, missing)
                r = x.run()
                self.assertEqual(r['status'], 'fail')
                self.assertTrue(all(v['status'] != 'pass' for v in r['checks']))
                self.assertEqual(r['limits']['modelRequestsIssued'], 0)
                coordinator.phase_report(r, RUN, SOURCE, phase, GOAL, [v[0] for v in groups])

    def test_evidence_index_wrong_baseline_never_reaches_files(self):
        x = collector(transport=lambda _: response({'schemaVersion': 1, 'projectId': P1, 'workPackage': 'FA-02', 'sourceFingerprint': 'e' * 64, 'goalSpecHash': GOAL, 'resources': [], 'objectiveEvidence': []}))
        x.primary, x.projects = P1, {P1}
        with self.assertRaisesRegex(ValueError, 'PHASE_EVIDENCE_BASELINE_STALE'):
            x.get_index()

    def test_objective_clause_empty_or_wrong_denominator_rejected(self):
        for entries in ([], [{'objectiveId': 'MSF-OBJ-009', 'acceptanceEvidence': []}]):
            x = collector()
            x.primary = P1
            x.index = {'resources': [], 'objectiveEvidence': entries}
            with self.assertRaises(ValueError):
                x.evidence(c.Probe(x, 'fa02-input-contract', ['MSF-OBJ-009']))

    def test_native_provider_paid_routes_not_issued_by_helper(self):
        source = (HERE / 'factory-autonomy-phase-contract.py').read_text(encoding='utf-8')
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ('raw', 'json'):
                constants = [v.value for v in ast.walk(node) if isinstance(v, ast.Constant) and isinstance(v.value, str)]
                self.assertFalse(any('messages:send' in v or 'docs:generate' in v or 'prototype:generate' in v for v in constants))

    @unittest.skipUnless(os.name == 'posix', 'Linux directory-fd IO is not emulated on Windows')
    def test_actual_safe_bytes_and_symlink_hardlink_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'doc').mkdir()
            body = b'actual public artifact independent bytes'
            original = root / 'doc/a.json'
            original.write_bytes(body)
            self.assertEqual(c.actual_file(root, 'doc/a.json', c.sha(body), len(body), io_helper), body)
            with self.assertRaisesRegex(ValueError, 'EVIDENCE_BYTES_MISMATCH'):
                c.actual_file(root, 'doc/a.json', 'e' * 64, len(body), io_helper)
            (root / 'doc/link.json').symlink_to(original)
            with self.assertRaises((OSError, ValueError)):
                c.actual_file(root, 'doc/link.json', c.sha(body), len(body), io_helper)
            os.link(original, root / 'doc/hard.json')
            with self.assertRaises(ValueError):
                c.actual_file(root, 'doc/a.json', c.sha(body), len(body), io_helper)


if __name__ == '__main__':
    unittest.main(verbosity=2)
