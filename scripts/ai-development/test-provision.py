"""Isolated fixture tests: no SSH, network, real credentials, or model requests."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('provision', HERE / 'provision.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def provider(pid, name, model='k3[1M]'):
    return {'id': pid, 'name': name, 'settingsConfig': {'env': {'ANTHROPIC_AUTH_TOKEN': 'fixture-secret-never-output',
                                                            'ANTHROPIC_BASE_URL': 'https://example.invalid', 'ANTHROPIC_MODEL': model}}}


class Storage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.ctx = p.Context(self.home, strict=False)
        for path in (self.ctx.db.parent, self.ctx.settings.parent, self.ctx.state):
            self.ctx.parents(path, True)
        self.live = {'hooks': {'PreToolUse': [{'command': 'fixture-existing-hook'}]}, 'permissions': {'defaultMode': 'default'},
                     'env': {'LOCAL_SAFE_EXISTING': 'keep'}, 'unknownSetting': {'nested': True}, 'model': 'existing-global'}
        self.ctx.settings.write_bytes(p.encode(self.live))
        self.original = {'env': {'ANTHROPIC_AUTH_TOKEN': 'fixture-existing-secret', 'ANTHROPIC_MODEL': 'k3[1M]'},
                         'model': 'k3[1M]', 'hooks': {'fixture': True}, 'unknown': [1, 2]}
        connection = sqlite3.connect(self.ctx.db)
        connection.executescript('CREATE TABLE providers(id TEXT,app_type TEXT,name TEXT,settings_config TEXT,is_current INTEGER DEFAULT 0,PRIMARY KEY(id,app_type));'
                                 'CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE untouched(value TEXT);')
        connection.execute("INSERT INTO providers VALUES('existing','claude','Kimi For Coding-699',?,1)", (json.dumps(self.original),))
        connection.execute("INSERT INTO providers VALUES('other','codex','Other',?,0)", ('{"keep":true}',))
        connection.execute('INSERT INTO settings VALUES(?,?)', ('common_config_claude', '{"permissions":{"keep":true},"unknownCommon":7}'))
        connection.execute("INSERT INTO settings VALUES('default_provider','existing')")
        connection.execute("INSERT INTO untouched VALUES('retain-all-tables')")
        connection.commit()
        connection.close()
        self.which = mock.patch.object(p, 'locate', return_value=str(self.home / 'cc-switch'))
        self.which.start()

    def tearDown(self):
        self.which.stop()
        self.temp.cleanup()

    def read_db(self):
        with contextlib.closing(sqlite3.connect(self.ctx.db)) as db:
            rows = db.execute('SELECT id,app_type,name,settings_config,is_current FROM providers ORDER BY id').fetchall()
            settings = dict(db.execute('SELECT key,value FROM settings').fetchall())
            untouched = db.execute('SELECT value FROM untouched').fetchone()[0]
        return rows, settings, untouched

    def test_preserves_security_active_defaults_and_existing_credentials(self):
        incoming = provider('different-id', 'Kimi For Coding-699', 'must-not-replace')
        p.configure_storage(self.ctx, [incoming, provider('new', 'Another')])
        actual = json.loads(self.ctx.settings.read_bytes())
        self.assertEqual({k: v for k, v in actual.items() if k != 'statusLine'}, self.live)
        rows, settings, untouched = self.read_db()
        old = next(row for row in rows if row[0] == 'existing')
        self.assertEqual({k: v for k, v in json.loads(old[3]).items() if k != 'statusLine'}, self.original)
        self.assertEqual(old[4], 1)
        self.assertEqual(next(r for r in rows if r[0] == 'new')[4], 0)
        self.assertFalse(any(r[0] == 'different-id' for r in rows))
        self.assertEqual(settings['default_provider'], 'existing')
        self.assertEqual(json.loads(settings['common_config_claude'])['unknownCommon'], 7)
        self.assertEqual(untouched, 'retain-all-tables')
        self.assertEqual(next(r for r in rows if r[0] == 'other')[3], '{"keep":true}')
        self.assertIn('start claude existing -- "$@"', (self.ctx.bin / 'claude-k3').read_text())
        public = json.dumps([p.provider_public((r[0], r[2], r[3], r[4])) for r in rows if r[1] == 'claude'])
        self.assertNotIn('secret', public)
        self.assertNotIn('hooks', public)

    def test_idempotence_and_latest_two_same_origin_backups(self):
        p.configure_storage(self.ctx, [])
        count = len(list((self.ctx.state / 'backups').iterdir()))
        self.ctx.changed = False
        p.configure_storage(self.ctx, [])
        self.assertFalse(self.ctx.changed)
        self.assertEqual(len(list((self.ctx.state / 'backups').iterdir())), count)
        for i in range(3):
            live = json.loads(self.ctx.settings.read_bytes())
            live['statusLine'] = {'fixture': i}
            self.ctx.settings.write_bytes(p.encode(live))
            p.configure_storage(self.ctx, [])
        folders = list((self.ctx.state / 'backups').iterdir())
        self.assertEqual(len(folders), 2)
        for folder in folders:
            manifest = json.loads((folder / 'manifest.json').read_bytes())
            self.assertEqual(manifest['profileHash'], p.PROFILE_HASH)
            with contextlib.closing(sqlite3.connect(folder / 'cc-switch.db')) as db:
                self.assertEqual(db.execute('SELECT value FROM untouched').fetchone()[0], 'retain-all-tables')

    def test_mid_transaction_failure_restores_files_and_sqlite(self):
        old_file = self.ctx.settings.read_bytes()
        old_rows = self.read_db()
        original_write = self.ctx.write
        writes = []
        def fail_second(path, raw, expected, mode=0o600):
            writes.append(path)
            if len(writes) == 2:
                raise p.Fault('FIXTURE_WRITE_FAILURE')
            return original_write(path, raw, expected, mode)
        with mock.patch.object(self.ctx, 'write', side_effect=fail_second):
            with self.assertRaisesRegex(p.Fault, 'FIXTURE_WRITE_FAILURE'):
                p.configure_storage(self.ctx, [provider('new', 'New')])
        self.assertEqual(self.ctx.settings.read_bytes(), old_file)
        self.assertEqual(self.read_db(), old_rows)

    def test_cas_and_symlink_escape_rejected(self):
        raw, expected = self.ctx.read(self.ctx.settings)
        self.ctx.settings.write_bytes(raw + b' ')
        with self.assertRaisesRegex(p.Fault, 'FILE_CHANGED'):
            self.ctx.write(self.ctx.settings, b'{}', expected)
        outside = self.home / 'outside'
        outside.mkdir()
        link = self.home / 'unsafe'
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest('host does not permit local symlink fixtures')
        with self.assertRaisesRegex(p.Fault, 'DIRECTORY_UNSAFE'):
            self.ctx.parents(link)

    def test_statusline_matching_missing_invalid_and_private_canary(self):
        self.ctx.parents(self.ctx.share, True)
        expected = p.status_setting(self.ctx)
        (self.ctx.share / 'terminal-statusline.py').write_bytes((HERE / 'terminal-statusline.py').read_bytes())
        self.ctx.settings.write_bytes(p.encode({'statusLine': expected, 'privateCanary': '/private/fixture/path'}))
        rows = [('fixture-provider', 'Private Name', json.dumps({'statusLine': expected, 'token': 'private-canary-value'}), 1)]
        diagnostics, configured = p.inspect_statusline(self.ctx, rows, json.dumps({'statusLine': expected}))
        self.assertTrue(configured)
        self.assertEqual(diagnostics['diagnosticsVersion'], 1)
        self.assertEqual(diagnostics['layers'], {'script': 'match', 'global': 'match', 'common': 'match', 'currentProvider': 'match'})
        self.assertEqual(diagnostics['providers'], {'total': 1, 'matched': 1, 'missing': 0, 'different': 0, 'invalid': 0, 'unknown': 0})
        self.assertIn('STATUSLINE_PROVIDER_COUNT_MATCHED', diagnostics['reasonCodes'])
        missing, configured = p.inspect_statusline(self.ctx, [('p', 'N', '{}', 1)], '{}')
        self.assertFalse(configured)
        self.assertEqual(missing['providers']['missing'], 1)
        self.assertIn('STATUSLINE_PROVIDER_COUNT_MISSING', missing['reasonCodes'])
        invalid, _ = p.inspect_statusline(self.ctx, [('p', 'N', '{bad-json', 1)], '{}')
        self.assertEqual(invalid['providers']['invalid'], 1)
        self.assertIn('STATUSLINE_PROVIDER_COUNT_INVALID', invalid['reasonCodes'])
        self.assertEqual(invalid['layers']['currentProvider'], 'invalid')
        public = json.dumps([diagnostics, missing, invalid])
        self.assertNotIn('/private/fixture/path', public)
        self.assertNotIn('private-canary-value', public)
        self.assertNotIn('Private Name', public)

    def test_statusline_zero_and_multiple_current_never_false_pass(self):
        self.ctx.parents(self.ctx.share, True)
        expected = p.status_setting(self.ctx)
        (self.ctx.share / 'terminal-statusline.py').write_bytes((HERE / 'terminal-statusline.py').read_bytes())
        self.ctx.settings.write_bytes(p.encode({'statusLine': expected}))
        zero, configured = p.inspect_statusline(self.ctx, [], json.dumps({'statusLine': expected}))
        self.assertFalse(configured)
        self.assertEqual(zero['providers']['total'], 0)
        self.assertEqual(zero['layers']['currentProvider'], 'not-applicable')
        self.assertIn('STATUSLINE_PROVIDER_COUNT_ZERO', zero['reasonCodes'])
        self.assertIn('STATUSLINE_CURRENT_PROVIDER_NOT_APPLICABLE', zero['reasonCodes'])
        unknown_db, _ = p.inspect_statusline(self.ctx, [('one', 'One', '{}', 1)], None, True)
        self.assertEqual(unknown_db['providers']['unknown'], 1)
        self.assertNotIn('STATUSLINE_PROVIDER_COUNT_ZERO', unknown_db['reasonCodes'])
        rows = [('one', 'One', json.dumps({'statusLine': expected}), 1),
                ('two', 'Two', json.dumps({'statusLine': expected}), 1)]
        multiple, configured = p.inspect_statusline(self.ctx, rows, json.dumps({'statusLine': expected}))
        self.assertFalse(configured)
        self.assertEqual(multiple['layers']['currentProvider'], 'unknown')
        self.assertEqual(multiple['providers']['matched'], 2)
        self.assertIn('STATUSLINE_PROVIDER_COUNT_MATCHED', multiple['reasonCodes'])

    def test_statusline_unreadable_is_not_missing_and_diagnostics_have_fixed_codes(self):
        self.ctx.parents(self.ctx.share, True)
        with mock.patch.object(self.ctx, 'read', side_effect=PermissionError('private exception text')):
            diagnostics, configured = p.inspect_statusline(self.ctx, [], None, database_error=True)
        self.assertFalse(configured)
        self.assertEqual(diagnostics['layers']['script'], 'unreadable')
        self.assertEqual(diagnostics['layers']['global'], 'unreadable')
        self.assertEqual(diagnostics['layers']['common'], 'unreadable')
        self.assertEqual(diagnostics['layers']['currentProvider'], 'unknown')
        self.assertTrue(set(diagnostics['reasonCodes']) <= p.STATUSLINE_REASON_CODES)
        self.assertNotIn('private exception text', json.dumps(diagnostics))


class Contracts(unittest.TestCase):
    def test_protocol_blocks_unsafe_fields_and_preserves_secret_stdin_only(self):
        valid = {'action': 'configure', 'profileId': 'linux-ai-dev-v1', 'providers': [provider('id', 'Name')]}
        self.assertEqual(p.validate_request(valid), valid)
        for extra in ('hooks', 'statusLine', 'permissions', 'dangerouslySkipPermissions'):
            candidate = json.loads(json.dumps(valid))
            candidate['providers'][0]['settingsConfig'][extra] = {}
            with self.assertRaises(p.Fault):
                p.validate_request(candidate)
        for extra in ('home', 'command', 'argv', 'current'):
            with self.assertRaises(p.Fault):
                p.validate_request({**valid, extra: '/fixture'})

    def test_telemetry_does_not_start_tools_or_write(self):
        with tempfile.TemporaryDirectory() as folder:
            ctx = p.Context(Path(folder), strict=False)
            with mock.patch.object(p, 'locate', return_value=None), mock.patch.object(p.subprocess, 'run', side_effect=AssertionError('no subprocess')):
                result = p.run({'action': 'telemetry', 'profileId': 'linux-ai-dev-v1'}, ctx)
            self.assertTrue(result['complete'])
            self.assertFalse(list(Path(folder).iterdir()))
            self.assertIsNone(result['inventory']['sessionSummary'])

    def test_archive_preflight_rejects_traversal_and_link_parents(self):
        def archive(entries):
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode='w') as output:
                for name, link in entries:
                    member = tarfile.TarInfo(name)
                    if link:
                        member.type, member.linkname = tarfile.SYMTYPE, link
                    output.addfile(member)
            buffer.seek(0)
            return tarfile.open(fileobj=buffer)
        for entries in ([('node/../escape', None)], [('node/link', '../../escape')], [('node/link', 'dir'), ('node/link/file', None)]):
            with archive(entries) as source, self.assertRaises(p.Fault):
                p.archive_members(source, 'node')
        with archive([('node/bin/node', None), ('node/bin/npm', '../lib/npm.js')]) as source:
            self.assertEqual(len(p.archive_members(source, 'node')), 2)

    def test_official_summary_unknown_quota_no_transcript_and_adaptive_width(self):
        summary = p.status.summarize({'session_id': 'safe-id', 'model': {'display_name': 'K3'}, 'transcript_path': '/never/read',
                                      'context_window': {'context_window_size': 1000000, 'current_usage': {'input_tokens': 4, 'output_tokens': 7,
                                          'cache_read_input_tokens': 20, 'cache_creation_input_tokens': 2}}, 'cost': {'total_cost_usd': 0.03}})
        self.assertEqual(summary['contextTokens'], 26)
        self.assertEqual(summary['currentOutputTokens'], 7)
        self.assertEqual(summary['billingStatus'], 'estimated')
        self.assertIsNone(summary['rateLimitFiveHourPercent'])
        self.assertNotIn('transcript', json.dumps(summary))
        resources = dict.fromkeys(p.status.RESOURCE_KEYS)
        narrow = p.status.render(summary, resources, 36)
        self.assertIn('CLI-est', narrow)
        self.assertIn('native 5h/7d ?/?', narrow)
        self.assertIn('cache r/c 20/2', narrow)
        self.assertTrue(all(len(line) <= 36 for line in narrow.splitlines()))
        incomplete = p.status.summarize({'context_window': {'current_usage': {'input_tokens': 3}}})
        self.assertIsNone(incomplete['contextTokens'])

    def test_numeric_resource_cache_cannot_carry_unlisted_data(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            state, proc = home / 'state', home / 'proc'
            state.mkdir()
            proc.mkdir()
            (proc / 'stat').write_text('cpu  1 2 3 4 5 6 7 8\n')
            (proc / 'meminfo').write_text('MemTotal: 100 kB\nMemAvailable: 40 kB\n')
            (proc / 'loadavg').write_text('0.5 0 0 1/1 1\n')
            first = p.status.sample_resources(home, state, proc, now=100, strict=False)
            self.assertIsNone(first['cpuPercent'])
            self.assertEqual(first['ramUsedBytes'], 60 * 1024)
            cache = json.loads((state / 'resource-cache.json').read_bytes())
            cache.update(prompt='private-not-allowed', cpuPercent='secret-not-a-number')
            (state / 'resource-cache.json').write_text(json.dumps(cache))
            result = p.status.sample_resources(home, state, proc, now=110, strict=False)
            self.assertEqual(set(result), set(p.status.RESOURCE_KEYS))
            self.assertIsNone(result['cpuPercent'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
