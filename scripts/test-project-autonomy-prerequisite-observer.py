import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('observer', Path(__file__).with_name('project-autonomy-prerequisite-observer.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'observer.sqlite'
        self.ledger = module.ObservationLedger(self.path)

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def sample(self, at=1000, mono=50, boot='real-boot', binding='current-source-goal', healthy=True):
        return self.ledger.tick(at, mono, boot, binding, {'platform': {'healthy': healthy}, 'node': {'healthy': healthy}, 'candidate': {'healthy': healthy}})

    def test_real_minutes_reopen_chain_without_counting_unobserved_hours(self):
        self.sample()
        result = self.sample(1060, 110)
        self.assertEqual(result['actualObservedSeconds'], 60)
        self.ledger.close()
        self.ledger = module.ObservationLedger(self.path)
        result = self.sample(1120, 170)
        self.assertEqual(result['actualObservedSeconds'], 120)
        self.assertEqual(self.ledger.verify_chain(), result['chainHash'])
        result = self.sample(1120 + 72 * 3600, 170 + 72 * 3600)
        self.assertEqual(result['actualObservedSeconds'], 0)
        self.assertEqual(result['samples'], 1)

    def test_missing_health_resets_continuous_window(self):
        self.sample()
        self.sample(1060, 110, healthy=False)
        self.assertEqual(self.sample(1120, 170)['actualObservedSeconds'], 0)

    def test_boot_source_goal_and_target_changes_do_not_join_versions(self):
        self.sample()
        self.assertEqual(self.sample(1060, 110, boot='new-boot')['actualObservedSeconds'], 0)
        self.assertEqual(self.sample(1120, 170, boot='new-boot', binding='new-source-goal')['actualObservedSeconds'], 0)

    def test_wall_clock_jump_backward_or_forward_does_not_count(self):
        self.sample()
        self.assertEqual(self.sample(1060, 55)['actualObservedSeconds'], 0)
        self.assertEqual(self.sample(1050, 110)['actualObservedSeconds'], 0)

    def test_actual_72h_bounded_samples_accumulate_but_do_not_create_acceptance(self):
        # Injected timestamps exercise arithmetic only, not real 72h evidence.
        self.sample()
        result = None
        for n in range(1, 4321):
            result = self.sample(1000 + n * 60, 50 + n * 60)
        self.assertEqual(result['actualObservedSeconds'], 72 * 3600)
        self.assertEqual(result['samples'], 4321)
        self.assertEqual(self.ledger.verify_chain(), result['chainHash'])
        identity = {'runId': 'a' * 40, 'attempt': 'b' * 32, 'sourceFingerprint': 'c' * 64, 'goalSpecHash': 'd' * 64, 'workPackage': 'FA-09'}
        status = module.status(identity, result)
        pending = next(v for v in status['waiting'] if v['id'] == 'long-observation')
        self.assertEqual(pending['reasonCode'], 'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING')
        self.assertIs(status['observationsAreAcceptance'], False)

    def test_tamper_in_private_ledger_is_detected(self):
        self.sample()
        self.ledger.db.execute("UPDATE samples SET seconds=259200")
        self.ledger.db.commit()
        with self.assertRaisesRegex(ValueError, 'OBSERVER_CHAIN_INVALID'):
            self.ledger.verify_chain()


class CentralFactsTests(unittest.TestCase):
    def setUp(self):
        self.execution, self.usage = sqlite3.connect(':memory:'), sqlite3.connect(':memory:')
        self.execution.executescript('''CREATE TABLE execution_runs(id TEXT,object_id TEXT,agent_id TEXT,status TEXT,json TEXT,updated_at TEXT);
            CREATE TABLE execution_deliveries(agent_id TEXT,delivery_id TEXT,run_id TEXT,kind TEXT,body_sha TEXT,response TEXT,usage_json TEXT,usage_reconciled INTEGER,created_at TEXT);''')
        self.usage.executescript('''CREATE TABLE runtime_ai_usage(id TEXT,run_id TEXT,project_id TEXT,provider TEXT,model TEXT,measurement_status TEXT,input_tokens INTEGER,output_tokens INTEGER,cache_read INTEGER,cache_write INTEGER,total_tokens INTEGER,cost_usd REAL,cost_complete INTEGER,fingerprint TEXT);''')
        self.run_id = 'a' * 40
        self.execution.execute('INSERT INTO execution_runs VALUES(?,?,?,?,?,?)', (self.run_id, 'task-real', 'agent-real', 'succeeded', json.dumps({'projectId': 'project-real'}), '2026-10-11T00:00:00Z'))
        self.actual = {'inputTokens': 10, 'outputTokens': 5, 'cacheReadTokens': 0, 'cacheWriteTokens': 0, 'totalTokens': 15, 'model': 'actual-model'}
        self.response = {'delivery': {'deliveryId': 'delivery-real', 'runId': self.run_id, 'kind': 'result', 'bodySHA256': 'b' * 64, 'accepted': True}}
        self.execution.execute('INSERT INTO execution_deliveries VALUES(?,?,?,?,?,?,?,?,?)', ('agent-real', 'delivery-real', self.run_id, 'result', 'b' * 64, json.dumps(self.response), json.dumps(self.actual), 1, '2026-10-11T00:00:00Z'))
        self.usage.execute('INSERT INTO runtime_ai_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ('usage-real', 'execution_' + self.run_id, 'project-real', 'observed-provider', 'actual-model', 'reported', 10, 5, 0, 0, 15, None, 0, 'c' * 64))

    def tearDown(self):
        self.execution.close()
        self.usage.close()

    def fact(self):
        return module.central_facts(self.execution, self.usage, self.run_id)['facts'][0]

    def test_actual_authenticated_receipt_and_unpriced_tokens_are_not_internal_factory_proof(self):
        fact = self.fact()
        self.assertTrue(fact['centralAuthenticatedProvenance'])
        self.assertTrue(fact['tokenCountsMatch'])
        self.assertEqual(fact['actualTokens'], 15)
        self.assertIsNone(fact['costUSD'])
        self.assertFalse(fact['originalSignatureRetained'])
        self.assertFalse(fact['originalSignatureReverified'])
        self.assertFalse(fact['factoryInternalProviderProven'])
        self.assertFalse(fact['contextCapabilityProven'])

    def test_unknown_usage_is_not_assumed_zero(self):
        self.usage.execute('INSERT INTO runtime_ai_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ('unknown', 'execution_' + self.run_id, 'project-real', 'observed-provider', 'actual-model', 'unknown', 0, 0, 0, 0, 0, None, 0, 'd' * 64))
        fact = self.fact()
        self.assertTrue(fact['unknownUsagePresent'])
        self.assertIsNone(fact['actualTokens'])

    def test_cancelled_late_evidence_is_not_a_completed_development_claim(self):
        self.execution.execute("UPDATE execution_runs SET status='cancelled'")
        self.assertTrue(self.fact()['lateEvidenceOnly'])

    def test_changed_delivery_identity_cannot_pass_provenance(self):
        self.response['delivery']['bodySHA256'] = 'e' * 64
        self.execution.execute('UPDATE execution_deliveries SET response=?', (json.dumps(self.response),))
        self.assertFalse(self.fact()['centralAuthenticatedProvenance'])

    def test_incomplete_sink_or_model_mismatch_does_not_hide_uncertainty(self):
        self.execution.execute('UPDATE execution_deliveries SET usage_reconciled=0')
        self.usage.execute("UPDATE runtime_ai_usage SET model='other-model'")
        fact = self.fact()
        self.assertFalse(fact['usageReconciled'])
        self.assertFalse(fact['ledgerModelsMatch'])


class StatusAndControlTests(unittest.TestCase):
    def identity(self):
        return {'runId': 'a' * 40, 'attempt': 'b' * 32, 'sourceFingerprint': 'c' * 64, 'goalSpecHash': 'd' * 64, 'workPackage': 'FA-09'}

    def test_closed_waiting_ids_and_stale_progress_without_fake_phase_receipts(self):
        value = module.status(self.identity(), {'actualObservedSeconds': 900}, fresh=False)
        self.assertEqual(len(value['waiting']), 14)
        self.assertEqual(len({v['id'] for v in value['waiting']}), 14)
        self.assertEqual(next(v for v in value['waiting'] if v['id'] == 'long-observation')['actualObservedSeconds'], 0)
        self.assertNotIn('password', module.canonical(value))
        with self.assertRaisesRegex(ValueError, 'PREREQUISITE_EXPORT_IDENTITY_INVALID'):
            module.status({**self.identity(), 'workPackage': 'FA-99'}, None)

    def test_factory_restart_requires_explicit_root_policy(self):
        with self.assertRaisesRegex(ValueError, 'FACTORY_RESTART_PROBE_NOT_AUTHORIZED'):
            module.observe_installation({'role': 'development'}, None)

    def test_root_current_attempt_waiting_export_works_before_long_observer_is_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence_root = Path(directory) / 'autonomy-evidence'
            policy_dir = Path(directory) / 'policies'
            policy_dir.mkdir()
            identity = self.identity()
            target = evidence_root / identity['runId'] / identity['attempt'] / 'evidence'
            target.mkdir(parents=True)
            (target.parent / 'source-before.json').write_text(json.dumps({'sha256': identity['sourceFingerprint']}))
            (policy_dir / 'FA-09.json').write_text(json.dumps({'workPackage': 'FA-09', 'goalSpecHash': identity['goalSpecHash']}))
            env = {key: identity[field] for key, field in [('JARVIS_AUTONOMY_RUN_ID', 'runId'), ('JARVIS_VALIDATION_ATTEMPT', 'attempt'), ('JARVIS_SOURCE_SHA256', 'sourceFingerprint'), ('JARVIS_GOAL_SPEC_HASH', 'goalSpecHash'), ('JARVIS_WORK_PACKAGE', 'workPackage')]}
            with patch.object(module, 'trusted'), patch.object(module, 'EVIDENCE', evidence_root), patch.object(module, 'POLICY', policy_dir / 'prerequisite-observer.json'), patch.object(module.os, 'O_NOFOLLOW', 0, create=True), patch.dict(module.os.environ, env):
                result = module.export(None, None, str(target))
                body = (target / 'prerequisite-status.json').read_bytes()
                self.assertEqual(result['evidence']['sha256'], module.sha(body))
                self.assertEqual(result['trustedReceiptsCreated'], 0)
                self.assertEqual(result['status'], 'waiting')
                self.assertEqual(result['prerequisiteStatus']['sourceFingerprint'], identity['sourceFingerprint'])
                self.assertEqual(next(v for v in result['prerequisiteStatus']['waiting'] if v['id'] == 'long-observation')['actualObservedSeconds'], 0)
                with self.assertRaises(FileExistsError):
                    module.export(None, None, str(target))

    def test_wrong_attempt_output_scope_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'PREREQUISITE_EXPORT_SCOPE_INVALID'):
            module.export(None, None, '/tmp/worker-claimed/evidence')

    def test_runtime_identity_tracks_actual_generated_bytes_not_only_source_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for folder in ['apps/server/dist', 'apps/web/dist', 'packages/shared/dist']:
                (root / folder).mkdir(parents=True)
                (root / folder / 'output.js').write_text('actual compiled output')
            before = module.runtime_manifest(root)
            self.assertEqual(before, module.runtime_manifest(root))
            (root / 'apps/server/dist/output.js').write_text('different actual compiled output')
            self.assertNotEqual(before, module.runtime_manifest(root))

    def test_factory_only_restart_observer_has_fixed_argv_and_does_not_claim_customer_delivery(self):
        policy = {'role': 'development', 'allowIsolatedFactoryRestart': True, 'sourceFingerprint': 'c' * 64, 'goalSpecHash': 'd' * 64}
        before = {'id': 'our-immutable-id', 'pid': 12, 'startedAt': 'before', 'running': True}
        after = {**before, 'pid': 13, 'startedAt': 'after'}
        calls, saved = [], []
        def run(argv, timeout=15, body=None):
            calls.append(argv)
            if argv[1] == 'restart':
                return b''
            if json.loads(body)['action'] == 'create':
                return json.dumps({'projectId': '1' * 8 + '-1111-1111-1111-' + '1' * 12, 'createReadback': True}).encode()
            return b'{"restartReadback":true,"archiveReadback":true}'
        class Sink:
            def save_fact(self, kind, fact):
                saved.append((kind, fact))
        with patch.object(module, 'container_identity', side_effect=[before, before, after]), patch.object(module, 'read_private', return_value=json.dumps({'user': 'jarvis-observer', 'password': 'private-value-' * 4}).encode()), patch.object(module, 'fixed', side_effect=run):
            fact = module.observe_installation(policy, Sink())
        self.assertEqual(calls[1], ['/usr/bin/docker', 'restart', '--time', '10', 'our-immutable-id'])
        self.assertEqual(fact['scope'], 'factory-only')
        self.assertTrue(fact['restartPersistence'])
        self.assertFalse(fact['customerInstallationProven'])
        self.assertFalse(fact['nativeRecoveryProven'])
        self.assertNotIn('private-value', module.canonical(fact))
        self.assertEqual(len(saved), 1)

    @unittest.skipUnless(module.os.name == 'posix', 'Linux root ownership/NOFOLLOW file semantics')
    def test_root_file_link_and_private_path_checks(self):
        with tempfile.TemporaryDirectory(dir='/root') as root:
            path = Path(root) / 'proof.json'
            path.write_bytes(b'{}')
            path.chmod(0o600)
            module.trusted(path, private=True)
            link = Path(root) / 'hardlink.json'
            module.os.link(path, link)
            with self.assertRaisesRegex(ValueError, 'OBSERVER_FILE_LINK_INVALID'):
                module.trusted(path, private=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
