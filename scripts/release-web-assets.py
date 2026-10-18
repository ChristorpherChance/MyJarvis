"""Read-only release asset validation and explicitly pinned package inheritance.

The managed activation calls verify before any service stop. This module never
changes a release, configuration, service, or archive.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
from zipfile import ZipFile

PREFIX = 'apps/web/dist/assets/'
MAX_ASSET_BYTES = 32 * 1024 * 1024
MAX_ASSETS = 4096
HASH = re.compile(r'^[a-f0-9]{64}$')
VERSION = re.compile(r'^[a-z0-9][a-z0-9-]{0,79}$')


def need(value, code):
    if not value:
        raise ValueError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def stamp(s):
    return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid,
            s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def safe_name(name):
    return (isinstance(name, str) and bool(name) and '\\' not in name
            and '\0' not in name and ':' not in name and not name.startswith('/')
            and all(part not in ('', '.', '..') for part in name.split('/')))


def is_asset(name):
    return (safe_name(name) and name.startswith(PREFIX)
            and PurePosixPath(name).suffix in ('.js', '.css'))


def safe_parents(path, owner_uid=None):
    for parent in [path, *path.parents]:
        s = parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode), 'ASSET_UNSAFE_DIRECTORY')
        if owner_uid is not None:
            need(s.st_uid == owner_uid and not s.st_mode & 0o022, 'ASSET_UNSAFE_DIRECTORY_OWNER')


def stable_bytes(path, owner_uid=None):
    path = Path(path).absolute()
    safe_parents(path.parent, owner_uid)
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'ASSET_UNSAFE_FILE')
    if owner_uid is not None:
        need(before.st_uid == owner_uid and not before.st_mode & 0o022, 'ASSET_UNSAFE_FILE_OWNER')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        held_before = stamp(os.fstat(fd))
        # Windows Python exposes different ctime meanings through path stat
        # and fd stat. Compare identity/mtime across APIs, then each full
        # independent stamp before/after; POSIX keeps the full cross-check.
        need((held_before[:-1] == stamp(before)[:-1]) if os.name == 'nt'
             else held_before == stamp(before), 'ASSET_FILE_CHANGED')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read()
        need(stamp(os.fstat(fd)) == held_before and stamp(path.lstat()) == stamp(before), 'ASSET_FILE_CHANGED')
    finally:
        os.close(fd)
    return data, stamp(before)


def manifest_rows(raw):
    m = json.loads(raw)
    need(m.get('schema') == 1 and VERSION.fullmatch(m.get('archiveVersion', ''))
         and m.get('runtimeBuild') == m['archiveVersion'], 'ASSET_PRIOR_IDENTITY')
    need(isinstance(m.get('files'), list), 'ASSET_MANIFEST_FILES')
    rows = {}
    folded = set()
    for row in m['files']:
        name = row.get('path') if isinstance(row, dict) else None
        need(safe_name(name) and name not in rows and name.casefold() not in folded, 'ASSET_MANIFEST_PATH')
        need(type(row.get('size')) is int and row['size'] >= 0
             and isinstance(row.get('sha256'), str) and HASH.fullmatch(row['sha256'])
             and row.get('mode') in (0o644, 0o755), 'ASSET_MANIFEST_ROW')
        rows[name] = row
        folded.add(name.casefold())
    return m, rows


def previous_package(spec):
    match = re.fullmatch(r'([a-f0-9]{64}):(.+)', spec)
    need(match is not None, 'ASSET_PRIOR_SPEC_SHA256_COLON_PATH_REQUIRED')
    expected, path = match.groups()
    data, _ = stable_bytes(Path(path))
    need(digest(data) == expected, 'ASSET_PRIOR_ARCHIVE_HASH')
    # The whole supplied ZIP is already bound by SHA; independently check its
    # manifest inventory, all payload hashes/modes and CRC while reading.
    import io
    with ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        need(len(names) == len(set(names)) == len({n.casefold() for n in names})
             and all(safe_name(n) for n in names), 'ASSET_PRIOR_ZIP_NAMES')
        raw = z.read('release-manifest.json')
        m, rows = manifest_rows(raw)
        need(set(names) == set(rows) | {'release-manifest.json'}, 'ASSET_PRIOR_ZIP_INVENTORY')
        assets = {}
        total = 0
        for name in names:
            info = z.getinfo(name)
            need(stat.S_ISREG(info.external_attr >> 16), 'ASSET_PRIOR_ZIP_TYPE')
            if name == 'release-manifest.json':
                continue
            row = rows[name]
            content = z.read(name)
            need(len(content) == row['size'] and digest(content) == row['sha256']
                 and stat.S_IMODE(info.external_attr >> 16) == row['mode'], 'ASSET_PRIOR_PAYLOAD_HASH')
            if is_asset(name):
                total += len(content)
                need(total <= MAX_ASSET_BYTES and len(assets) < MAX_ASSETS, 'ASSET_INHERITANCE_LIMIT')
                assets[name] = {**row, 'content': content}
        need(bool(assets), 'ASSET_PRIOR_EMPTY')
    return ({'archiveVersion': m['archiveVersion'], 'runtimeBuild': m['runtimeBuild'],
             'sourceCommit': m.get('sourceCommit'), 'archiveSHA256': expected,
             'manifestSHA256': digest(raw), 'assetCount': len(assets)}, assets)


def snapshot_assets(release_root, owner_uid=None, web_root=False):
    root = Path(release_root).absolute()
    assets_root = root / ('assets' if web_root else PREFIX)
    safe_parents(assets_root, owner_uid)
    directories, files = {}, {}

    def walk(directory):
        before = directory.lstat()
        need(stat.S_ISDIR(before.st_mode), 'ASSET_UNSAFE_DIRECTORY')
        if owner_uid is not None:
            need(before.st_uid == owner_uid and not before.st_mode & 0o022, 'ASSET_UNSAFE_DIRECTORY_OWNER')
        directories[directory] = stamp(before)
        for path in sorted(directory.iterdir()):
            s = path.lstat()
            need(not stat.S_ISLNK(s.st_mode), 'ASSET_SYMLINK')
            if stat.S_ISDIR(s.st_mode):
                walk(path)
            else:
                need(stat.S_ISREG(s.st_mode), 'ASSET_UNSAFE_FILE')
                name = PREFIX + path.relative_to(assets_root).as_posix()
                if is_asset(name):
                    data, held = stable_bytes(path, owner_uid)
                    files[name] = {'path': name, 'size': len(data), 'sha256': digest(data),
                                   'mode': 0o644, 'content': data, '_path': path, '_stamp': held}
        need(stamp(directory.lstat()) == stamp(before), 'ASSET_DIRECTORY_CHANGED')

    walk(assets_root)
    need(len(files) <= MAX_ASSETS and sum(v['size'] for v in files.values()) <= MAX_ASSET_BYTES, 'ASSET_INHERITANCE_LIMIT')
    return files, directories


def recheck_snapshot(files, directories, owner_uid=None):
    for path, expected in directories.items():
        need(stamp(path.lstat()) == expected, 'ASSET_DIRECTORY_CHANGED')
    for row in files.values():
        data, held = stable_bytes(row['_path'], owner_uid)
        need(held == row['_stamp'] and digest(data) == row['sha256'], 'ASSET_FILE_CHANGED')
    for path, expected in directories.items():
        need(stamp(path.lstat()) == expected, 'ASSET_DIRECTORY_CHANGED')


def check_dependencies(assets, available):
    # Match the finite static/literal import and Vite map/CSS forms emitted by
    # this build. Never execute or import inherited JavaScript.
    for name, row in assets.items():
        text = row['content'].decode('utf-8', errors='strict')
        if name.endswith('.js'):
            refs = re.findall(r'(?:^|[;\n])\s*(?:import|export)\s*(?:\{[^}]*\}|\*\s*as\s*[\w$]+|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s*from\s*["\']([^"\']+)["\']|(?:^|[;\n])\s*import\s*["\']([^"\']+)["\']', text)
            targets = [a or b for a, b in refs]
            targets += re.findall(r'\bimport\s*\(\s*["\']([^"\']+)["\']\s*\)', text)
            targets += re.findall(r'["\'](assets/[^"\']+\.(?:js|css))["\']', text)
        else:
            targets = [a or b for a, b in re.findall(r'url\(\s*["\']?([^\s)"\']+)["\']?\s*\)|@import\s*["\']([^"\']+)["\']', text)]
        for raw in targets:
            if re.match(r'^(?:data:|https?:|//|#)', raw):
                continue
            value = raw.split('#', 1)[0].split('?', 1)[0]
            if value.startswith('/assets/'):
                target = 'apps/web/dist' + value
            elif value.startswith('assets/'):
                target = 'apps/web/dist/' + value
            elif value.startswith('/'):
                continue  # Public paths outside assets are not inherited.
            else:
                import posixpath
                target = posixpath.normpath(posixpath.join(str(PurePosixPath(name).parent), value))
            need(target in available, 'ASSET_DEPENDENCY_MISSING')


def inheritance(specs, web_root):
    need(bool(specs), 'ASSET_PREVIOUS_PACKAGE_REQUIRED')
    inputs, inherited = [], {}
    for spec in specs:
        origin, assets = previous_package(spec)
        need(origin['archiveSHA256'] not in {x['archiveSHA256'] for x in inputs}, 'ASSET_PRIOR_DUPLICATE')
        inputs.append(origin)
        for name, row in assets.items():
            old = inherited.get(name)
            need(old is None or (old['sha256'], old['size']) == (row['sha256'], row['size']), 'ASSET_PATH_COLLISION')
            inherited[name] = row
    current, directories = snapshot_assets(web_root, web_root=True)
    for name, row in inherited.items():
        old = current.get(name)
        need(old is None or (old['sha256'], old['size']) == (row['sha256'], row['size']), 'ASSET_PATH_COLLISION')
    combined = {**current, **inherited}
    need(len(combined) <= MAX_ASSETS and sum(v['size'] for v in combined.values()) <= MAX_ASSET_BYTES, 'ASSET_INHERITANCE_LIMIT')
    check_dependencies(inherited, combined)
    recheck_snapshot(current, directories)
    rows = [{k: row[k] for k in ('path', 'size', 'sha256', 'mode')} for row in sorted(inherited.values(), key=lambda x: x['path'])]
    return {'compatibility': {'schema': 1, 'kind': 'previous-release-js-css-assets', 'inputs': inputs,
                              'assets': rows, 'addedAssets': sum(x['path'] not in current for x in rows),
                              'reusedAssets': sum(x['path'] in current for x in rows)},
            'assets': [{**row, 'base64': base64.b64encode(inherited[row['path']]['content']).decode('ascii')} for row in rows]}


def verify_current_assets(previous_root, candidate_root, owner_uid=0):
    prior, candidate = Path(previous_root).absolute(), Path(candidate_root).absolute()
    old_raw, old_stamp = stable_bytes(prior / 'release-manifest.json', owner_uid)
    new_raw, new_stamp = stable_bytes(candidate / 'release-manifest.json', owner_uid)
    old, old_rows = manifest_rows(old_raw)
    new, new_rows = manifest_rows(new_raw)
    compatibility = new.get('compatibility')
    need(isinstance(compatibility, dict) and compatibility.get('schema') == 1
         and compatibility.get('kind') == 'previous-release-js-css-assets'
         and isinstance(compatibility.get('inputs'), list), 'ASSET_COMPATIBILITY_REQUIRED')
    need(any(x.get('archiveVersion') == old['archiveVersion'] and x.get('manifestSHA256') == digest(old_raw)
             and HASH.fullmatch(x.get('archiveSHA256', '')) for x in compatibility['inputs'] if isinstance(x, dict)), 'ASSET_ACTUAL_PREVIOUS_NOT_DECLARED')
    actual, directories = snapshot_assets(prior, owner_uid)
    candidate_assets, candidate_directories = snapshot_assets(candidate, owner_uid)
    # Explicitly enumerate disk, not only the previous manifest: emergency
    # add-only overlays must also survive the next ordinary release.
    for name, row in actual.items():
        declared = new_rows.get(name)
        need(declared is not None and (declared['size'], declared['sha256']) == (row['size'], row['sha256']), 'ASSET_CURRENT_SUBSET_MISSING_OR_CHANGED')
        on_disk = candidate_assets.get(name)
        need(on_disk is not None and (on_disk['size'], on_disk['sha256']) == (row['size'], row['sha256']), 'ASSET_CANDIDATE_BYTES_CHANGED')
    recheck_snapshot(actual, directories, owner_uid)
    recheck_snapshot(candidate_assets, candidate_directories, owner_uid)
    for path, raw, expected in [(prior / 'release-manifest.json', old_raw, old_stamp), (candidate / 'release-manifest.json', new_raw, new_stamp)]:
        now, held = stable_bytes(path, owner_uid)
        need(held == expected and now == raw, 'ASSET_MANIFEST_CHANGED')
    return {'verified': True, 'previousRelease': old['archiveVersion'], 'release': new['archiveVersion'],
            'previousManifestSHA256': digest(old_raw), 'actualCurrentAssets': len(actual),
            'overlayAssetsIncluded': sum(name not in old_rows for name in actual), 'serviceActions': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    inherit = sub.add_parser('inherit')
    inherit.add_argument('--previous-package', action='append', required=True)
    inherit.add_argument('--web-root', required=True)
    verify = sub.add_parser('verify')
    verify.add_argument('--previous-root', required=True)
    verify.add_argument('--candidate-root', required=True)
    args = parser.parse_args()
    result = inheritance(args.previous_package, args.web_root) if args.action == 'inherit' else verify_current_assets(args.previous_root, args.candidate_root)
    print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))


if __name__ == '__main__':
    main()
