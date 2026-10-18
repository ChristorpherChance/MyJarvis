"""Five isolated real-ZIP/filesystem groups; no application, build or service."""
import ast
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('release_web_assets', HERE / 'release-web-assets.py')
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class AssetCompatibility(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jarvis-assets-owned-')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def package(self, version, entries, bad_inventory=False):
        rows = [{'path': p, 'size': len(b), 'sha256': assets.digest(b), 'mode': 0o644}
                for p, b in entries.items()]
        m = {'schema': 1, 'archiveVersion': version, 'runtimeBuild': version,
             'sourceCommit': 'a' * 40, 'files': rows}
        raw = (json.dumps(m, sort_keys=True) + '\n').encode()
        path = self.root / (version + '.zip')
        with ZipFile(path, 'x', compression=ZIP_DEFLATED) as z:
            for name, data in {**entries, 'release-manifest.json': raw}.items():
                info = ZipInfo(name)
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                z.writestr(info, data)
            if bad_inventory:
                info = ZipInfo('apps/web/dist/assets/not-declared.js')
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                z.writestr(info, b'export const missing = true;')
        return assets.digest(path.read_bytes()) + ':' + str(path), m

    def web(self):
        web = self.root / 'fresh-web'
        (web / 'assets').mkdir(parents=True)
        (web / 'assets/current.js').write_bytes(b'export const current = true;')
        (web / 'index.html').write_bytes(b'CURRENT INDEX')
        (web / 'offline-capture-sw.js').write_bytes(b'CURRENT WORKER')
        return web

    def release(self, name, entries, compatibility=None):
        root = self.root / name
        root.mkdir()
        rows = []
        for path, content in entries.items():
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            rows.append({'path': path, 'size': len(content), 'sha256': assets.digest(content), 'mode': 0o644})
        m = {'schema': 1, 'archiveVersion': name, 'runtimeBuild': name,
             'sourceCommit': 'b' * 40, 'files': rows}
        if compatibility is not None:
            m['compatibility'] = compatibility
        (root / 'release-manifest.json').write_text(json.dumps(m) + '\n', encoding='utf-8')
        return root

    def declared(self, prior):
        raw = (prior / 'release-manifest.json').read_bytes()
        m = json.loads(raw)
        return {'schema': 1, 'kind': 'previous-release-js-css-assets',
                'inputs': [{'archiveVersion': m['archiveVersion'], 'manifestSHA256': assets.digest(raw),
                            'archiveSHA256': 'c' * 64}], 'assets': []}

    def test_1_two_real_zip_inputs_union_and_actual_inherit_cli(self):
        prefix = assets.PREFIX
        first, _ = self.package('old-one', {
            prefix + 'first.js': b'import "./shared.js";import("./lazy.js");const x=["assets/old.css"];',
            prefix + 'shared.js': b'export const shared = true;',
            prefix + 'lazy.js': b'export const lazy = true;',
            prefix + 'old.css': b'@import "./nested.css";',
            prefix + 'nested.css': b'body{color:red}',
            'apps/web/dist/index.html': b'OLD INDEX',
            'apps/web/dist/offline-capture-sw.js': b'OLD WORKER',
        })
        second, _ = self.package('old-two', {prefix + 'shared.js': b'export const shared = true;',
                                              prefix + 'second.js': b'export const second = true;'})
        web = self.web()
        before = {p.name: p.read_bytes() for p in web.iterdir() if p.is_file()}
        result = subprocess.run([sys.executable, str(HERE / 'release-web-assets.py'), 'inherit',
                                 '--web-root', str(web), '--previous-package', first,
                                 '--previous-package', second], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(len(value['assets']), 6)
        self.assertEqual(len(value['compatibility']['inputs']), 2)
        self.assertTrue(all(assets.is_asset(r['path']) for r in value['assets']))
        for row in value['assets']:
            self.assertEqual(assets.digest(base64.b64decode(row['base64'])), row['sha256'])
        self.assertEqual(before, {p.name: p.read_bytes() for p in web.iterdir() if p.is_file()})

    def test_2_wrong_archive_hash_inventory_and_missing_dependency_rejected(self):
        prefix = assets.PREFIX
        good, _ = self.package('good-pin', {prefix + 'x.js': b'export const x = true;'})
        web = self.web()
        with self.assertRaisesRegex(ValueError, 'ASSET_PRIOR_ARCHIVE_HASH'):
            assets.inheritance(['0' * 64 + good[64:]], web)
        bad, _ = self.package('bad-inventory', {prefix + 'x.js': b'x'}, bad_inventory=True)
        with self.assertRaisesRegex(ValueError, 'ASSET_PRIOR_ZIP_INVENTORY'):
            assets.inheritance([bad], web)
        missing, _ = self.package('missing-dependency', {prefix + 'x.js': b'import("./not-present.js");'})
        with self.assertRaisesRegex(ValueError, 'ASSET_DEPENDENCY_MISSING'):
            assets.inheritance([missing], web)
        with patch.object(assets, 'MAX_ASSETS', 1):
            with self.assertRaisesRegex(ValueError, 'ASSET_INHERITANCE_LIMIT'):
                assets.inheritance([good], web)  # 1 current + 1 inherited exceeds the union limit.
        node = os.environ.get('JARVIS_TEST_NODE', 'node')
        result = subprocess.run([node, str(HERE / 'package-capture-release.mjs'), '--version=owned',
                                 '--source-commit=' + 'a' * 40, '--api-dist=' + str(web),
                                 '--web-dist=' + str(web), '--output=' + str(self.root / 'not-created')],
                                capture_output=True, text=True, timeout=20)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('no implicit initial-release exemption', result.stderr)
        self.assertFalse((self.root / 'not-created').exists())

    def test_3_identical_path_deduplicates_but_changed_path_never_overwrites(self):
        path = assets.PREFIX + 'same.js'
        first, _ = self.package('same-a', {path: b'original'})
        same, _ = self.package('same-b', {path: b'original'})
        changed, _ = self.package('changed', {path: b'changed'})
        web = self.web()
        self.assertEqual(len(assets.inheritance([first, same], web)['assets']), 1)
        with self.assertRaisesRegex(ValueError, 'ASSET_PATH_COLLISION'):
            assets.inheritance([first, changed], web)
        (web / 'assets/same.js').write_bytes(b'new different bytes')
        with self.assertRaisesRegex(ValueError, 'ASSET_PATH_COLLISION'):
            assets.inheritance([first], web)
        self.assertEqual((web / 'assets/same.js').read_bytes(), b'new different bytes')

    def test_4_actual_overlay_is_mandatory_before_stop_and_valid_union_is_read_only(self):
        prefix = assets.PREFIX
        prior = self.release('previous', {prefix + 'main.js': b'export const old = true;'})
        overlay = prior / (prefix + 'emergency-overlay.js')
        overlay.write_bytes(b'export const emergency = true;')
        compatibility = self.declared(prior)
        missing = self.release('missing-overlay', {prefix + 'main.js': b'export const old = true;'}, compatibility)
        stopped = []
        with self.assertRaisesRegex(ValueError, 'ASSET_CURRENT_SUBSET_MISSING_OR_CHANGED'):
            assets.verify_current_assets(prior, missing, owner_uid=None)
            stopped.append(True)
        self.assertEqual(stopped, [])
        candidate = self.release('candidate', {prefix + 'main.js': b'export const old = true;',
                                              prefix + 'emergency-overlay.js': overlay.read_bytes()}, compatibility)
        saved = {p: (p.stat().st_mtime_ns, p.read_bytes()) for p in candidate.rglob('*') if p.is_file()}
        result = assets.verify_current_assets(prior, candidate, owner_uid=None)
        self.assertEqual(result['actualCurrentAssets'], 2)
        self.assertEqual(result['overlayAssetsIncluded'], 1)
        self.assertEqual(saved, {p: (p.stat().st_mtime_ns, p.read_bytes()) for p in candidate.rglob('*') if p.is_file()})
        tree = ast.parse((HERE / 'capture-managed-release.py').read_text(encoding='utf-8-sig'))
        programs = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                        and any(isinstance(t, ast.Name) and t.id == 'programs' for t in n.targets))
        activate = programs['activate']
        self.assertLess(activate.index("asset_guard=base/"), activate.index('control=Path('))
        self.assertLess(activate.index("asset_guard=base/"), activate.index("services('stop')"))

    def test_5_tampered_candidate_hardlink_and_concurrent_directory_change_rejected(self):
        path = assets.PREFIX + 'same.js'
        prior = self.release('old', {path: b'original'})
        candidate = self.release('new', {path: b'original'}, self.declared(prior))
        (candidate / path).write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'ASSET_CANDIDATE_BYTES_CHANGED'):
            assets.verify_current_assets(prior, candidate, owner_uid=None)
        (candidate / path).write_bytes(b'original')
        hardlink = self.root / 'hardlink'
        os.link(prior / path, hardlink)
        with self.assertRaisesRegex(ValueError, 'ASSET_UNSAFE_FILE'):
            assets.verify_current_assets(prior, candidate, owner_uid=None)
        hardlink.unlink()
        original = assets.recheck_snapshot

        def race(files, directories, owner_uid=None):
            (prior / (assets.PREFIX + 'arrived.js')).write_bytes(b'new file')
            return original(files, directories, owner_uid)

        with patch.object(assets, 'recheck_snapshot', race):
            with self.assertRaisesRegex(ValueError, 'ASSET_DIRECTORY_CHANGED'):
                assets.verify_current_assets(prior, candidate, owner_uid=None)


if __name__ == '__main__':
    unittest.main(verbosity=2)
