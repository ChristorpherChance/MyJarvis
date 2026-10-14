"""Local request-index protocol/SQLite fault fixtures; no product/model/SSH."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('producer_requests', Path(__file__).with_name('project-autonomy-producer-requests.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CATALOG = json.loads((Path(__file__).parent.parent / 'artifacts/software-factory/autonomy-r22/producer-implementation-plan-r2.json').read_text(encoding='utf-8'))
NOW = '2026-10-11T05:00:10.000Z'


def fixture():
    anchor = {'rawInputSha256': '1' * 64, 'runtimeManifestSha256': '2' * 64,
              'environmentIdentitySha256': '3' * 64, 'projectAuthorizationSha256': '4' * 64,
              'agentDefinitionHashes': ['5' * 64], 'templateHashes': ['6' * 64]}
    scope = {'schemaVersion': 1, 'kind': 'root-producer-request-scope', 'simulated': False,
             'projectId': module.PROJECT, 'workspace': module.WORKSPACE,
             'sourceFingerprint': '7' * 64, 'goalSpecHash': CATALOG['goalSpecHash'],
             'workPackage': 'FA-03', 'objectiveIds': ['MSF-OBJ-' + str(n).zfill(3) for n in range(20, 27)],
             'requiredCheckIds': ['build', 'fa03-definition-model-context'],
             'contextAnchor': anchor, 'contextAnchorSHA256': module.sha(module.canonical(anchor)),
             'run': {'id': '8' * 40, 'status': 'failed', 'outcome': 'failed', 'exitCode': 1},
             'observedAt': '2026-10-11T05:00:09.000Z'}
    pending = {'schemaVersion': 1, 'kind': 'project-autonomy-prerequisite-status', 'simulated': False,
               'runId': scope['run']['id'], 'attempt': '9' * 32, 'sourceFingerprint': scope['sourceFingerprint'],
               'goalSpecHash': scope['goalSpecHash'], 'workPackage': 'FA-03', 'observedAt': '2026-10-11T05:00:08.123Z',
               'waiting': [{'id': 'provider', 'reasonCode': 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING'}],
               'nextCheckSeconds': 60, 'observationsAreAcceptance': False}
    raw = json.dumps(pending, indent=2)
    checks = [{'id': 'build', 'required': True, 'executed': True, 'status': 'pass', 'exitCode': 0,
               'command': 'fixed-build', 'evidenceSha256': 'a' * 64},
              {'id': 'fa03-definition-model-context', 'required': True, 'executed': True, 'status': 'unknown',
               'exitCode': 2, 'command': 'root-fixed-phase-contract', 'evidenceSha256': 'b' * 64,
               'tests': {'total': 2, 'passed': 1, 'failed': 0, 'skipped': 0, 'unknown': 1}}]
    report = {'schemaVersion': 1, 'kind': 'project-autonomy-validation', 'simulated': False,
              'runId': scope['run']['id'], 'sourceFingerprint': scope['sourceFingerprint'], 'goalSpecHash': scope['goalSpecHash'],
              'workPackage': 'FA-03', 'workspace': module.WORKSPACE, 'sourceStable': True, 'status': 'fail',
              'startedAt': '2026-10-11T04:30:00.000Z', 'finishedAt': '2026-10-11T05:00:08.999Z',
              'checks': checks, 'artifacts': [{'path': 'package.json', 'sha256': 'c' * 64, 'bytes': 10}],
              'prerequisiteWaitEligible': True, 'prerequisiteStatusJson': raw,
              'prerequisiteStatusSha256': module.sha(raw),
              'waitingPrerequisites': [{'id': 'provider', 'checkId': 'fa03-definition-model-context',
                                        'objectiveIds': ['MSF-OBJ-020', 'MSF-OBJ-021', 'MSF-OBJ-022'],
                                        'errorCode': 'TRUSTED_PREREQUISITE_RECEIPT_MISSING'}]}
    return scope, report


def requests(scope=None, report=None, now=NOW):
    original_scope, original_report = fixture()
    scope, report = scope or original_scope, report or original_report
    body = json.dumps(report, ensure_ascii=False).encode()
    return module.requests_from_report(body, module.sha(body), scope, CATALOG, now)


class ProtocolFixtures(unittest.TestCase):
    def test_catalog_fourteen_producers_seventy_four_goals_remain_unaccepted(self):
        entries = module.validate_catalog(CATALOG)
        self.assertEqual(len(entries), 14)
        self.assertTrue(all(v['implementation']['completeProducer'] == 'not-implemented' for v in entries.values()))
        self.assertTrue(all(v['coverageState'] == 'planned-not-accepted' for v in CATALOG['objectiveCoverage']['goals']))

    def test_real_matching_report_creates_pending_nonacceptance_only(self):
        row = requests()[0]
        self.assertEqual(row['producerKind'], 'provider')
        self.assertEqual(row['state'], 'pending-adapter')
        self.assertFalse(row['observationsAreAcceptance'])
        self.assertEqual(row['objectiveIds'], ['MSF-OBJ-020', 'MSF-OBJ-021', 'MSF-OBJ-022'])

    def test_report_hash_mismatch_rejected(self):
        scope, report = fixture()
        with self.assertRaisesRegex(ValueError, 'REQUEST_REPORT_HASH_MISMATCH'):
            module.requests_from_report(json.dumps(report).encode(), '0' * 64, scope, CATALOG, NOW)

    def test_scope_cancel_late_stop_and_source_changes_rejected(self):
        for field in ('cancelled', 'lateEvidenceOnly', 'stopRequested'):
            scope, report = fixture()
            scope['run'][field] = True
            with self.assertRaisesRegex(ValueError, 'REQUEST_RUN_REVOKED'):
                requests(scope, report)
        scope, report = fixture()
        report['sourceFingerprint'] = 'e' * 64
        with self.assertRaisesRegex(ValueError, 'REQUEST_REPORT_BINDING_CHANGED'):
            requests(scope, report)

    def test_product_fail_and_unexecuted_checks_cannot_be_pending(self):
        for change in [{'status': 'fail'}, {'status': 'skip'}, {'executed': False}, {'command': ''}, {'exitCode': 137}]:
            scope, report = fixture()
            report['checks'][0].update(change)
            with self.assertRaisesRegex(ValueError, 'REQUEST_ACTUAL_'):
                requests(scope, report)

    def test_eligible_flag_cannot_be_assumed_from_worker_summary(self):
        scope, report = fixture()
        del report['prerequisiteWaitEligible']
        report['summary'] = 'Everything passed, wait for a provider'
        with self.assertRaisesRegex(ValueError, 'REQUEST_REPORT_NOT_RESOURCE_WAIT'):
            requests(scope, report)

    def test_unknown_mapping_denominator_and_wrong_phase_rejected(self):
        scope, report = fixture()
        report['waitingPrerequisites'][0]['checkId'] = 'model-invented-check'
        with self.assertRaisesRegex(ValueError, 'REQUEST_UNKNOWN_MAPPING_INCOMPLETE'):
            requests(scope, report)
        scope, report = fixture()
        report['waitingPrerequisites'][0]['objectiveIds'] = ['MSF-OBJ-074']
        with self.assertRaisesRegex(ValueError, 'REQUEST_UNTRUSTED_OBJECTIVE_MAPPING'):
            requests(scope, report)

    def test_unknown_counts_cannot_hide_failed_skipped_or_empty_tests(self):
        for patch in [{'failed': 1}, {'skipped': 1}, {'total': 0}, {'passed': 99}]:
            scope, report = fixture()
            report['checks'][1]['tests'].update(patch)
            with self.assertRaisesRegex(ValueError, 'REQUEST_TEST_FAILURE_OR_EMPTY_DENOMINATOR'):
                requests(scope, report)

    def test_stale_future_status_and_unrelated_long_wait_rejected(self):
        for observed in ['2026-10-10T05:00:00.000Z', '2026-10-11T05:00:10.001Z']:
            scope, report = fixture()
            pending = json.loads(report['prerequisiteStatusJson'])
            pending['observedAt'] = observed
            report['prerequisiteStatusJson'] = json.dumps(pending)
            report['prerequisiteStatusSha256'] = module.sha(report['prerequisiteStatusJson'])
            with self.assertRaisesRegex(ValueError, 'REQUEST_PREREQUISITE_NOT_FRESH'):
                requests(scope, report)
        scope, report = fixture()
        pending = json.loads(report['prerequisiteStatusJson'])
        pending['waiting'].append({'id': 'long-observation', 'reasonCode': 'LONG_OBSERVATION_IN_PROGRESS', 'actualObservedSeconds': 0, 'requiredSeconds': 259200})
        report['prerequisiteStatusJson'] = json.dumps(pending)
        report['prerequisiteStatusSha256'] = module.sha(report['prerequisiteStatusJson'])
        with self.assertRaisesRegex(ValueError, 'REQUEST_UNKNOWN_MAPPING_INCOMPLETE'):
            requests(scope, report)

    def test_context_actual_hash_required_and_environment_rotation_changes_identity(self):
        scope, report = fixture()
        original = requests(scope, report)[0]['id']
        scope['contextAnchor']['environmentIdentitySha256'] = 'f' * 64
        with self.assertRaisesRegex(ValueError, 'REQUEST_CONTEXT_HASH_MISMATCH'):
            requests(scope, report)
        scope['contextAnchorSHA256'] = module.sha(module.canonical(scope['contextAnchor']))
        self.assertNotEqual(requests(scope, report)[0]['id'], original)

    def test_raw_hash_and_closed_reason_are_checked(self):
        scope, report = fixture()
        report['prerequisiteStatusJson'] += ' '
        with self.assertRaisesRegex(ValueError, 'REQUEST_PREREQUISITE_HASH_MISMATCH'):
            requests(scope, report)
        scope, report = fixture()
        pending = json.loads(report['prerequisiteStatusJson'])
        pending['waiting'][0]['reasonCode'] = 'LONG_OBSERVATION_IN_PROGRESS'
        report['prerequisiteStatusJson'] = json.dumps(pending)
        report['prerequisiteStatusSha256'] = module.sha(report['prerequisiteStatusJson'])
        with self.assertRaisesRegex(ValueError, 'REQUEST_REASON_SCOPE_MISMATCH'):
            requests(scope, report)


class SQLiteFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'requests.sqlite'
        self.box = module.RequestOutbox(self.path)

    def tearDown(self):
        self.box.close()
        self.temp.cleanup()

    def test_registration_deduplicates_and_restart_keeps_pending(self):
        first = self.box.enqueue(requests(), NOW)
        self.assertEqual(len(first['requests']), 1)
        self.box.enqueue(requests(), NOW)
        self.box.close()
        self.box = module.RequestOutbox(self.path)
        result = self.box.snapshot()
        self.assertEqual(len(result['requests']), 1)
        self.assertEqual(result['producersInvoked'], 0)
        self.assertEqual(result['trustedReceiptsCreated'], 0)

    def test_new_attempt_attaches_origin_without_duplicate_source_request(self):
        self.box.enqueue(requests(), NOW)
        scope, report = fixture()
        report['runId'] = scope['run']['id'] = 'c' * 40
        pending = json.loads(report['prerequisiteStatusJson'])
        pending.update({'runId': report['runId'], 'attempt': 'd' * 32})
        report['prerequisiteStatusJson'] = json.dumps(pending)
        report['prerequisiteStatusSha256'] = module.sha(report['prerequisiteStatusJson'])
        result = self.box.enqueue(requests(scope, report), NOW)
        self.assertEqual(len(result['requests']), 1)
        self.assertEqual(self.box.db.execute('SELECT COUNT(*) FROM request_origins').fetchone()[0], 2)

    def test_cancelled_request_does_not_revive_from_redelivery(self):
        self.box.enqueue(requests(), NOW)
        self.box.cancel(module.PROJECT, NOW)
        result = self.box.enqueue(requests(), NOW)
        self.assertEqual(result['requests'][0]['state'], 'cancelled')

    def test_scope_rotation_preserves_history_and_obsoletes_old_pending(self):
        original = requests()[0]
        self.box.enqueue([original], NOW)
        self.box.obsolete(module.PROJECT, 'd' * 64, original['goalSpecHash'], original['contextAnchorSHA256'], NOW)
        self.assertEqual(self.box.enqueue([original], NOW)['requests'][0]['state'], 'obsolete')

    def test_capacity_failure_rolls_back_entire_batch(self):
        self.box.max_requests = 1
        first = requests()[0]
        second = copy.deepcopy(first)
        second['contextAnchorSHA256'] = 'e' * 64
        identity = {k: second[k] for k in ('projectId', 'sourceFingerprint', 'goalSpecHash', 'workspace', 'workPackage', 'contextAnchorSHA256', 'producerKind')}
        second['id'] = module.sha(module.canonical(identity))
        with self.assertRaisesRegex(ValueError, 'REQUEST_OUTBOX_CAPACITY_REACHED'):
            self.box.enqueue([first, second], NOW)
        self.assertEqual(self.box.snapshot()['requests'], [])

    def test_same_identity_with_changed_mapping_is_rejected(self):
        self.box.enqueue(requests(), NOW)
        row = requests()[0]
        row['objectiveIds'] = ['MSF-OBJ-020']
        with self.assertRaisesRegex(ValueError, 'REQUEST_IDENTITY_COLLISION'):
            self.box.enqueue([row], NOW)

    def test_origin_identity_conflict_rolls_back(self):
        self.box.enqueue(requests(), NOW)
        row = requests()[0]
        row['origin']['attempt'] = 'a' * 32
        with self.assertRaisesRegex(ValueError, 'REQUEST_REPORT_IDENTITY_CONFLICT'):
            self.box.enqueue([row], NOW)


@unittest.skipUnless(os.name == 'posix' and os.geteuid() == 0, 'Linux root ownership/no-follow boundary unavailable on Windows')
class LinuxRootFixtures(unittest.TestCase):
    def test_private_symlink_and_hardlink_refused(self):
        with tempfile.TemporaryDirectory(dir='/root') as raw:
            directory = Path(raw)
            directory.chmod(0o700)
            target = directory / 'private.json'
            target.write_bytes(b'{}')
            target.chmod(0o600)
            self.assertEqual(module.read_root(target, 100, True), b'{}')
            linked = directory / 'linked.json'
            linked.symlink_to(target)
            with self.assertRaisesRegex(ValueError, 'REQUEST_PATH_NOT_ROOT_CONTROLLED'):
                module.read_root(linked, 100, True)
            linked.unlink()
            os.link(target, linked)
            with self.assertRaisesRegex(ValueError, 'REQUEST_FILE_LINK_INVALID'):
                module.read_root(target, 100, True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
