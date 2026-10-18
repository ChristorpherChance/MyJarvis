"""Read pinned R48r2 as ZIP data only, inherit immutable web assets after R49 build."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
archive = root/'artifacts/r48-r2/platform/20261018-project-goals-r48-r2.zip'
mp = archive.parent/'release-manifest.json'
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha(archive.read_bytes()) == 'e0495dc61b879d89c1a09b388c57de01e7d7c54d7291f0f3c1d4cd84704dac40'
mb = mp.read_bytes()
assert sha(mb) == '63c5463c8bb0e118faba9bd1a90cdec6e4be21b6b3cefacc57f4dd8ac0faa1bb'
manifest = json.loads(mb)
assets = []
with ZipFile(archive) as z:
    assert len(z.namelist()) == len(set(z.namelist()))
    assert z.read('release-manifest.json') == mb
    for row in manifest['files']:
        b = z.read(row['path'])
        assert len(b) == row['size'] and sha(b) == row['sha256']
        if not row['path'].startswith('apps/web/dist/assets/'):
            continue
        rel = Path(row['path']).relative_to('apps/web/dist')
        assert not rel.is_absolute() and '..' not in rel.parts
        target = root/'apps/web/.dist-next'/rel
        target.parent.mkdir(parents=True, exist_ok=True)
        assert not target.is_symlink()
        if target.exists():
            assert sha(target.read_bytes()) == row['sha256']
        else:
            target.open('xb').write(b)
        assets.append(row)
old = json.loads((root/'reports/r48-r2-logs/assets.json').read_bytes())
by_path = {r['path']: r['sha256'] for r in assets}
assert all(by_path[r['path']] == r['sha256'] for r in old['inheritedAssets'])
pins = json.loads((root/'reports/r48-logs/start-pins.json').read_bytes())
assert all(sha((root/r['path']).read_bytes()) == r['sha256'] for r in pins['files'])
report = {'priorPackagePayloadsVerified': len(manifest['files']), 'inheritedAssets': assets, 'prior104ClosurePreserved': True, 'oldReportAndR7PinsUnchanged': True, 'nodeInstalled': False}
(root/'reports/r49-logs/assets.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'priorPayloads': len(manifest['files']), 'inheritedAssets': len(assets), 'prior104ClosurePreserved': True}))
