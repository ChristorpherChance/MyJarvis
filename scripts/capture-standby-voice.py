"""Server-local, explicit 112 export / 101 cold voice installation. No SSH or inference.

Root runs one phase at a time. Failures retain partial installation and private logs;
the tool never deletes an existing installation, installs Python, or starts business.
"""
import argparse
import fcntl
import hashlib
import io
import json
import os
import pwd
import re
import shlex
import signal
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
from pathlib import Path, PurePosixPath

CONTROL = Path('/var/lib/jarvis-control/capture-standby-voice')
BASE = Path('/var/lib/jarvis/voice-models')
STAGE = Path('/var/lib/jarvis/voice-staging-20261010-multilingual')
MODELS = STAGE / 'models'
VENV = STAGE / 'venv'
BASE_PYTHON = Path('/opt/jarvis/venv/bin/python')
WORKER = Path('/opt/jarvis/resident_voice.py')
UNIT = Path('/etc/systemd/system/jarvis-voice.service')
DROPINS = Path('/etc/systemd/system/jarvis-voice.service.d')
RUNTIME = Path('/var/lib/jarvis/voice-runtime')
TOKEN = RUNTIME / 'service-token'
EMPTY = RUNTIME / 'empty-keywords.txt'
SERVICE = 'jarvis-voice.service'
BUSINESS = 'jarvis-platform.service'
MANIFEST = 'standby-voice-manifest.json'
RECEIPT = CONTROL / 'installation.json'
VERIFICATION = CONTROL / 'verification.json'
REVISION = '20261010-multilingual-r2'
PINS = {'sherpa-onnx': '1.13.8', 'numpy': '2.2.6', 'av': '19.0.0',
        'pypinyin': '0.55.0', 'sentencepiece': '0.2.1',
        'faster-whisper': '1.2.1', 'ctranslate2': '4.6.0'}
BASE_NAMES = ['sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
              'kokoro-int8-multi-lang-v1_1', 'matcha-icefall-zh-en',
              'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20']
MULTI_NAMES = ['faster-whisper-small', 'vits-piper-en_US-lessac-medium',
               'vits-piper-fr_FR-siwis-medium', 'vits-piper-de_DE-thorsten-medium']
TREES = [*(BASE / name for name in BASE_NAMES), *(MODELS / name for name in MULTI_NAMES)]
SINGLES = [BASE / 'vocos-16khz-univ.onnx', BASE / 'silero_vad.onnx',
           MODELS / 'manifest.json', WORKER, UNIT, TOKEN, EMPTY]
TARGETS = [BASE, STAGE, RUNTIME, WORKER, UNIT, DROPINS]
HEALTH_KEYS = ['ready', 'runtime', 'asrRevision', 'asr', 'fastTts', 'tts', 'kws',
               'multilingualAsr', 'asrLanguages', 'ttsLanguages', 'piperLanguages',
               'speechDetection', 'recognizerCacheLimit']
HASH = re.compile(r'^[a-f0-9]{64}$')
MAX_FILES, MAX_BYTES = 100000, 32 * 1024 ** 3
EXPECTED_RELEASE = None


class VoiceError(Exception):
    pass


def need(condition, code):
    if not condition:
        raise VoiceError(code)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def sha_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns)


def checked(path, directory=False, private=False, root_only=False):
    path = Path(path)
    need(path.is_absolute(), 'ABSOLUTE_PATH_REQUIRED')
    for parent in [*reversed(path.parents), path]:
        info = parent.lstat()
        need(not stat.S_ISLNK(info.st_mode), 'LINK_REFUSED')
        need(info.st_uid in ({0} if root_only else {0, pwd.getpwnam('jarvis').pw_uid})
             and not info.st_mode & 0o022, 'UNTRUSTED_OWNER_OR_MODE')
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) if directory else
         stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'UNSAFE_ENTRY_TYPE')
    if private:
        need(stat.S_IMODE(info.st_mode) == (0o700 if directory else 0o600), 'PRIVATE_MODE_REQUIRED')
    return info


def systemd(unit=SERVICE):
    result = subprocess.run(['systemctl', 'show', unit, '--property=' + ','.join([
        'LoadState', 'ActiveState', 'SubState', 'MainPID', 'FragmentPath',
        'DropInPaths', 'User', 'Group', 'UnitFileState'])], capture_output=True, text=True, timeout=15)
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)


def node(expected, standby=False):
    checked(Path('/etc/jarvis/node.json'), root_only=True)
    config = json.loads(Path('/etc/jarvis/node.json').read_bytes())
    # Node IDs may be deployment-specific strings. Root selects the machine;
    # role, fixed data root and the expected deployed release are checked here.
    need(config.get('role') == ('primary' if expected == '112' else 'standby')
         and config.get('dataDir') == '/var/lib/jarvis/data'
         and config.get('release') == EXPECTED_RELEASE, 'NODE_ROLE_OR_RELEASE_MISMATCH')
    if standby:
        need(systemd(BUSINESS).get('ActiveState') == 'inactive', 'STANDBY_BUSINESS_MUST_BE_INACTIVE')
    return {'node': expected, 'role': config['role']}


def python_state(executable):
    if not executable.is_file():
        return {'present': False}
    actual = executable.resolve(strict=True)
    checked(actual, root_only=True)
    # The local venv itself is trusted, and its actual base binary remains managed.
    checked(executable.parent, directory=True)
    # Missing distributions are inventory results, not a traceback containing paths.
    code = ("import sys,json,importlib.metadata as m\nversions={}\n"
            "for name in " + repr(list(PINS)) + ":\n"
            " try:versions[name]=m.version(name)\n"
            " except m.PackageNotFoundError:versions[name]=None\n"
            "print(json.dumps({'version':'.'.join(map(str,sys.version_info[:3])),"
            "'baseUnderManagedPrefix':str(sys.base_prefix).startswith('/opt/jarvis/python/'),"
            "'packages':versions}))")
    result = subprocess.run(['runuser', '-u', 'jarvis', '--', str(executable), '-I', '-B', '-c', code], capture_output=True,
                            text=True, timeout=30, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
    need(result.returncode == 0, 'PYTHON_METADATA_FAILED')
    return {'present': True, **json.loads(result.stdout)}


def health():
    checked(TOKEN, private=True)
    token = TOKEN.read_text().strip()
    need(re.fullmatch(r'[A-Za-z0-9_-]{40,256}', token), 'TOKEN_FORMAT_INVALID')
    request = urllib.request.Request('http://127.0.0.1:3153/health',
                                     headers={'Authorization': 'Bearer ' + token})
    # Never follow redirects or environment proxy settings with a private credential.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args, **_kwargs):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=3) as response:
        raw = response.read(65537)
    need(len(raw) <= 65536, 'HEALTH_BODY_TOO_LARGE')
    value = json.loads(raw)
    need(value.get('ready') is True and value.get('runtime') == PINS['sherpa-onnx']
         and value.get('asrRevision') == REVISION
         and value.get('asr') == BASE_NAMES[0] and value.get('fastTts') == BASE_NAMES[2]
         and value.get('tts') == BASE_NAMES[1] and value.get('kws') == BASE_NAMES[3]
         and value.get('multilingualAsr') == MULTI_NAMES[0]
         and set(value.get('piperLanguages', [])) == {'en', 'fr', 'de'}
         and {'auto', 'zh', 'en', 'fr', 'de'}.issubset(value.get('asrLanguages', [])),
         'RESIDENT_HEALTH_NOT_READY')
    return {key: value.get(key) for key in HEALTH_KEYS}


def control():
    checked(CONTROL.parent, directory=True, root_only=True)
    if not CONTROL.exists():
        CONTROL.mkdir(mode=0o700)
    checked(CONTROL, directory=True, private=True, root_only=True)
    fd = os.open(CONTROL / 'operation.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    checked(CONTROL / 'operation.lock', private=True, root_only=True)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise VoiceError('VOICE_OPERATION_IN_PROGRESS')
    return fd


def write_new(path, data, mode=0o600, owner=None):
    checked(path.parent, directory=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, mode)
    if owner:
        os.chown(path, *owner)


def private_record(path, value):
    if path.exists():
        checked(path, private=True, root_only=True)
    temporary = path.with_suffix('.next.json')
    write_new(temporary, encoded(value))
    os.replace(temporary, path)


def receipt(value):
    private_record(RECEIPT, value)


def dropins(state):
    need(state.get('FragmentPath') == str(UNIT), 'UNIT_SOURCE_CHANGED')
    paths = [Path(item) for item in state.get('DropInPaths', '').split()]
    need(len(paths) <= 16 and len(paths) == len(set(paths)), 'DROPIN_LIST_INVALID')
    for path in paths:
        need(path.parent == DROPINS and re.fullmatch(r'[A-Za-z0-9_-]+\.conf', path.name),
             'DROPIN_OUTSIDE_ALLOWLIST')
        checked(path, root_only=True)
    return paths


def validate_unit(contents):
    directives = {}
    for raw in contents:
        section = ''
        for line in raw.decode('utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith(('#', ';')):
                continue
            need(not line.endswith('\\'), 'UNIT_CONTINUATION_REFUSED')
            if line.startswith('[') and line.endswith(']'):
                section = line[1:-1]
            elif section == 'Service':
                name, sep, value = line.partition('=')
                need(sep and not (name.startswith('Exec') and name != 'ExecStart')
                     and name not in {'EnvironmentFile', 'RootDirectory', 'RootImage',
                                      'BindPaths', 'BindReadOnlyPaths', 'LoadCredential',
                                      'SetCredential'}, 'UNEXPECTED_SERVICE_DIRECTIVE')
                directives.setdefault(name, []).append(value)
    expected = {'User': 'jarvis', 'Group': 'jarvis', 'WorkingDirectory': str(RUNTIME),
                'UMask': '0077', 'NoNewPrivileges': 'true', 'PrivateTmp': 'true',
                'ProtectSystem': 'strict', 'ProtectHome': 'true', 'ReadWritePaths': str(RUNTIME)}
    for name, value in expected.items():
        need(directives.get(name, []) == [value], 'UNIT_SANDBOX_CHANGED')
    for value in directives.get('Environment', []):
        need(all(re.fullmatch(r'(?:OMP|OPENBLAS|MKL)_NUM_THREADS=[1-4]', item)
                 for item in shlex.split(value)), 'UNIT_ENVIRONMENT_CHANGED')
    need(len(directives.get('ExecStart', [])) == 1, 'UNIT_EXECSTART_CHANGED')
    argv = shlex.split(directives['ExecStart'][0])
    need(argv[:2] == [str(VENV / 'bin/python'), str(WORKER)], 'UNIT_INTERPRETER_CHANGED')
    need(len(argv[2:]) == 8, 'UNIT_ARGUMENTS_CHANGED')
    options = dict(zip(argv[2::2], argv[3::2]))
    need(options == {'--models': str(BASE), '--multilingual-models': str(MODELS),
                     '--token-file': str(TOKEN), '--threads': options.get('--threads')}
         and options.get('--threads') in {'1', '2', '3', '4'}, 'UNIT_ARGUMENTS_CHANGED')


def allowed(path, kind, extra):
    if path in SINGLES or path in extra:
        return kind == 'file'
    return any(path == tree and kind == 'directory' or tree in path.parents for tree in TREES)


def check_required(rows):
    inventory = {row['path']: row['type'] for row in rows}
    need(all(inventory.get(str(path).lstrip('/')) == 'file' for path in SINGLES), 'REQUIRED_FILE_MISSING')
    need(all(inventory.get(str(path).lstrip('/')) == 'directory' for path in TREES), 'REQUIRED_MODEL_ROOT_MISSING')
    leaves = {BASE_NAMES[0]: ['model.int8.onnx', 'tokens.txt'],
              BASE_NAMES[1]: ['model.int8.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt', 'lexicon-zh.txt'],
              BASE_NAMES[2]: ['model-steps-3.onnx', 'lexicon.txt', 'tokens.txt', 'phone-zh.fst', 'date-zh.fst', 'number-zh.fst'],
              BASE_NAMES[3]: ['tokens.txt', 'en.phone', 'encoder-epoch-13-avg-2-chunk-8-left-64.int8.onnx',
                              'decoder-epoch-13-avg-2-chunk-8-left-64.onnx', 'joiner-epoch-13-avg-2-chunk-8-left-64.int8.onnx']}
    for name, names in leaves.items():
        need(all(inventory.get(str(BASE / name / leaf).lstrip('/')) == 'file' for leaf in names), 'MODEL_DEPENDENCY_MISSING')
    for leaf in ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt']:
        need(inventory.get(str(MODELS / MULTI_NAMES[0] / leaf).lstrip('/')) == 'file', 'WHISPER_DEPENDENCY_MISSING')
    for name in MULTI_NAMES[1:]:
        prefix = str(MODELS / name).lstrip('/') + '/'
        need(sum(path.startswith(prefix) and '/' not in path[len(prefix):] and path.endswith('.onnx')
                 and kind == 'file' for path, kind in inventory.items()) == 1, 'PIPER_MODEL_INVALID')
        need(inventory.get(prefix + 'tokens.txt') == 'file' and inventory.get(prefix + 'espeak-ng-data') == 'directory', 'PIPER_DEPENDENCY_MISSING')


def export_bundle(destination):
    node('112')
    need(destination.parent == CONTROL and re.fullmatch(r'[A-Za-z0-9_-]{1,64}', destination.name), 'BUNDLE_DESTINATION_INVALID')
    need(not os.path.lexists(destination), 'BUNDLE_ALREADY_EXISTS')
    state = systemd()
    need(state.get('ActiveState') == 'active', 'PRIMARY_RESIDENT_NOT_ACTIVE')
    extras = dropins(state)
    checked(UNIT, root_only=True)
    validate_unit([UNIT.read_bytes(), *(path.read_bytes() for path in extras)])
    metadata = python_state(VENV / 'bin/python')
    need(metadata.get('version') == '3.12.15' and metadata.get('packages') == PINS, 'PRIMARY_PACKAGE_PINS_CHANGED')
    sources = []
    for tree in TREES:
        checked(tree, directory=True)
        sources.append(tree)
        for current, directories, files in os.walk(tree, followlinks=False):
            for name in sorted(directories + files):
                path = Path(current) / name
                checked(path, directory=path.is_dir())
                sources.append(path)
    sources.extend(SINGLES + extras)
    need(len(sources) == len(set(sources)) and len(sources) <= MAX_FILES, 'EXPORT_INVENTORY_INVALID')
    # These leaves are the literal runtime constructor/upload paths. Check all
    # metadata before beginning the large archive, rather than failing at its end.
    preliminary = []
    for path in sources:
        info = checked(path, directory=path.is_dir(), private=path == TOKEN,
                       root_only=path in {UNIT, WORKER, *extras})
        preliminary.append({'path': str(path).lstrip('/'),
                            'type': 'directory' if path.is_dir() else 'file'})
        if path == EMPTY:
            need(info.st_size == 0, 'KEYWORDS_NOT_EMPTY')
    check_required(preliminary)
    destination.mkdir(mode=0o700)
    rows, total = [], 0
    archive = destination / 'resident.tar'
    with archive.open('xb') as output, tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as bundle:
        os.chmod(archive, 0o600)
        for path in sorted(sources):
            info = checked(path, directory=path.is_dir(), private=path == TOKEN,
                           root_only=path in {UNIT, WORKER, *extras})
            name = str(path).lstrip('/')
            entry = tarfile.TarInfo(name)
            row = {'path': name, 'type': 'directory' if path.is_dir() else 'file'}
            entry.mode = 0o700 if path.is_dir() else 0o600
            entry.uid = entry.gid = 0
            if row['type'] == 'directory':
                entry.type = tarfile.DIRTYPE
                bundle.addfile(entry)
            else:
                entry.size = info.st_size
                need(entry.size <= 2 * 1024 ** 3, 'EXPORT_FILE_TOO_LARGE')
                total += entry.size
                need(total <= MAX_BYTES, 'EXPORT_TOTAL_TOO_LARGE')
                row['size'] = info.st_size
                with path.open('rb') as stream:
                    need(signature(os.fstat(stream.fileno())) == signature(info), 'EXPORT_SOURCE_CHANGED')
                    if path == TOKEN:
                        private = stream.read(257)
                        need(len(private) <= 256 and re.fullmatch(rb'[A-Za-z0-9_-]{40,256}\s*', private), 'TOKEN_FORMAT_INVALID')
                        row['private'] = True
                        bundle.addfile(entry, io.BytesIO(private))
                    else:
                        digest = hashlib.sha256()
                        class Reader:
                            def read(self, size=-1):
                                data = stream.read(size)
                                digest.update(data)
                                return data
                        bundle.addfile(entry, Reader())
                        row['sha256'] = digest.hexdigest()
                    need(signature(os.fstat(stream.fileno())) == signature(info)
                         and signature(path.lstat()) == signature(info), 'EXPORT_SOURCE_CHANGED')
                if path == EMPTY:
                    need(info.st_size == 0, 'KEYWORDS_NOT_EMPTY')
            rows.append(row)
        check_required(rows)
        manifest = {'schema': 1, 'sourceNode': '112', 'revision': REVISION, 'pins': PINS,
                    'dropins': [str(path).lstrip('/') for path in extras], 'entries': rows}
        raw = encoded(manifest)
        entry = tarfile.TarInfo(MANIFEST)
        entry.mode, entry.size = 0o600, len(raw)
        bundle.addfile(entry, io.BytesIO(raw))
    write_new(destination / 'manifest.json', raw)
    need(sum(row.get('size', 0) for row in rows) <= MAX_BYTES, 'EXPORT_TOTAL_TOO_LARGE')
    return {'phase': 'export', 'node': '112', 'exported': True, 'files': len(rows),
            'archiveSha256': sha_file(archive), 'archiveBytes': archive.stat().st_size,
            'manifestSha256': hashlib.sha256(raw).hexdigest(), 'tokenIndividualHashRecorded': False,
            'venvOrLogsExported': False, 'inferenceCalls': 0}


def read_bundle(archive, expected):
    need(HASH.fullmatch(expected or ''), 'ARCHIVE_HASH_REQUIRED')
    original = checked(archive, private=True, root_only=True)
    need(archive.is_relative_to(CONTROL) and archive.stat().st_size <= MAX_BYTES, 'ARCHIVE_PATH_OR_SIZE_INVALID')
    need(sha_file(archive) == expected, 'ARCHIVE_HASH_MISMATCH')
    bundle = tarfile.open(archive, mode='r:')
    need(signature(os.fstat(bundle.fileobj.fileno())) == signature(original), 'ARCHIVE_CHANGED')
    members = bundle.getmembers()
    need(len(members) <= MAX_FILES + 1 and len(members) == len({item.name for item in members}), 'TAR_INVENTORY_INVALID')
    for member in members:
        path = PurePosixPath(member.name)
        need(not path.is_absolute() and str(path) == member.name and '..' not in path.parts
             and '\\' not in member.name and '\x00' not in member.name
             and (member.isfile() or member.isdir()), 'TAR_LINK_OR_UNSAFE_PATH')
    item = bundle.getmember(MANIFEST)
    need(item.isfile() and item.size <= 8 * 1024 ** 2, 'MANIFEST_INVALID')
    raw = bundle.extractfile(item).read()
    manifest = json.loads(raw)
    need(manifest.get('schema') == 1 and manifest.get('sourceNode') == '112'
         and manifest.get('revision') == REVISION and manifest.get('pins') == PINS, 'BUNDLE_IDENTITY_MISMATCH')
    extras = [Path('/' + name) for name in manifest['dropins']]
    need(len(extras) <= 16 and len(extras) == len(set(extras)), 'DROPIN_LIST_INVALID')
    for path in extras:
        need(path.parent == DROPINS and re.fullmatch(r'[A-Za-z0-9_-]+\.conf', path.name), 'DROPIN_OUTSIDE_ALLOWLIST')
    rows = manifest['entries']
    need(len(rows) <= MAX_FILES and len(rows) == len({row['path'] for row in rows}), 'MANIFEST_INVENTORY_INVALID')
    need({item.name for item in members} == {row['path'] for row in rows} | {MANIFEST}, 'TAR_MANIFEST_NOT_CLOSED')
    total = 0
    for row in rows:
        path = Path('/' + row['path'])
        need(row['type'] in {'file', 'directory'} and allowed(path, row['type'], extras), 'UNEXPECTED_BUNDLE_PATH')
        member = bundle.getmember(row['path'])
        need(member.isfile() == (row['type'] == 'file'), 'TAR_TYPE_MISMATCH')
        if member.isfile():
            need(member.size == row['size'] and 0 <= member.size <= 2 * 1024 ** 3, 'TAR_SIZE_MISMATCH')
            total += member.size
            with bundle.extractfile(member) as stream:
                if path == TOKEN:
                    need(row.get('private') is True and 'sha256' not in row and member.size <= 256
                         and re.fullmatch(rb'[A-Za-z0-9_-]{40,256}\s*', stream.read(257)), 'PRIVATE_TOKEN_INVALID')
                else:
                    need(not row.get('private') and HASH.fullmatch(row.get('sha256', ''))
                         and hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], 'TAR_RAW_HASH_MISMATCH')
    need(total <= MAX_BYTES, 'TAR_TOTAL_TOO_LARGE')
    check_required(rows)
    validate_unit([bundle.extractfile(str(UNIT).lstrip('/')).read(),
                   *(bundle.extractfile(str(path).lstrip('/')).read() for path in extras)])
    need(signature(os.fstat(bundle.fileobj.fileno())) == signature(original)
         and signature(archive.lstat()) == signature(original), 'ARCHIVE_CHANGED')
    return bundle, manifest, raw


def make_directory(path, uid, gid, mode=0o750):
    if path.exists():
        checked(path, directory=True)
        return
    make_directory(path.parent, uid, gid)
    path.mkdir(mode=mode)
    os.chown(path, uid, gid)
    os.chmod(path, mode)


def installation(archive, expected):
    node('101', standby=True)
    need(all(not os.path.lexists(path) for path in TARGETS), 'VOICE_TARGET_ALREADY_EXISTS')
    need(systemd().get('LoadState') == 'not-found', 'VOICE_UNIT_ALREADY_LOADED')
    base = python_state(BASE_PYTHON)
    need(base.get('version') == '3.12.15' and base.get('baseUnderManagedPrefix'), 'MANAGED_PYTHON_31215_REQUIRED')
    bundle, manifest, raw = read_bundle(archive, expected)
    need(not RECEIPT.exists(), 'INSTALL_ALREADY_ATTEMPTED')
    status = {'schema': 1, 'status': 'installing', 'node': '101', 'role': 'standby',
              'expectedRelease': EXPECTED_RELEASE, 'release': EXPECTED_RELEASE,
              'installed': False, 'pipCheck': False, 'pipCheckPassed': False,
              'venv': str(VENV), 'archiveSha256': expected,
              'manifestSha256': hashlib.sha256(raw).hexdigest(), 'healthLoadAttempted': False}
    receipt(status)
    account = pwd.getpwnam('jarvis')
    try:
        node('101', standby=True)
        need(all(not os.path.lexists(path) for path in TARGETS), 'VOICE_TARGET_CHANGED')
        make_directory(STAGE, 0, account.pw_gid)
        log = CONTROL / 'dependency-install.log'
        with os.fdopen(os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as output:
            env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(CONTROL),
                   'PIP_CONFIG_FILE': '/dev/null', 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'}
            commands = [[str(BASE_PYTHON), '-I', '-B', '-m', 'venv', str(VENV)],
                        [str(VENV / 'bin/python'), '-I', '-B', '-m', 'pip', 'install', '--isolated',
                         '--disable-pip-version-check', '--no-input', '--no-cache-dir', '--only-binary=:all:',
                         '--index-url', 'https://pypi.org/simple', '--retries', '0', '--timeout', '60',
                         *(name + '==' + version for name, version in PINS.items())],
                        [str(VENV / 'bin/python'), '-I', '-B', '-m', 'pip', 'check']]
            for command in commands:
                result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, env=env, timeout=600)
                need(result.returncode == 0, 'VOICE_DEPENDENCY_INSTALL_FAILED')
        # This newly generated venv may contain its normal internal and managed-base symlinks.
        for current, directories, files in os.walk(VENV, followlinks=False):
            for path in [Path(current), *(Path(current) / name for name in directories + files)]:
                if path.is_symlink():
                    target = path.resolve(strict=True)
                    need(target.is_relative_to(VENV) or target.is_relative_to('/opt/jarvis/python'), 'NEW_VENV_LINK_INVALID')
                    continue
                info = path.stat()
                os.chown(path, 0, account.pw_gid)
                os.chmod(path, 0o750 if path.is_dir() or info.st_mode & 0o111 else 0o640)
        metadata = python_state(VENV / 'bin/python')
        need(metadata.get('version') == '3.12.15' and metadata.get('packages') == PINS, 'INSTALLED_PACKAGE_PINS_CHANGED')
        for row in sorted(manifest['entries'], key=lambda row: (row['path'] == str(UNIT).lstrip('/'), row['path'])):
            path = Path('/' + row['path'])
            owner = (account.pw_uid, account.pw_gid) if path in {TOKEN, EMPTY} else (0, account.pw_gid)
            make_directory(path.parent, *owner)
            if row['type'] == 'directory':
                make_directory(path, 0, account.pw_gid)
            else:
                mode = 0o600 if path in {TOKEN, EMPTY} else 0o750 if path == WORKER else 0o644 if path == UNIT or path.parent == DROPINS else 0o640
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
                digest, length = hashlib.sha256() if path != TOKEN else None, 0
                with os.fdopen(fd, 'wb') as output, bundle.extractfile(row['path']) as source:
                    while chunk := source.read(1024 ** 2):
                        length += len(chunk)
                        if digest is not None:
                            digest.update(chunk)
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                os.chown(path, *owner)
                os.chmod(path, mode)
                need(length == row['size'] and (digest is None or digest.hexdigest() == row['sha256']), 'INSTALL_STREAM_CHANGED')
        os.chown(RUNTIME, account.pw_uid, account.pw_gid)
        os.chmod(RUNTIME, 0o700)
        write_new(CONTROL / 'installed-manifest.json', raw)
        subprocess.run(['systemctl', 'daemon-reload'], check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=30)
        node('101', standby=True)
        final_state = systemd()
        need(final_state.get('ActiveState') == 'inactive', 'RESIDENT_NOT_LEFT_INACTIVE')
        need(final_state.get('UnitFileState') in {'disabled', 'static'}, 'RESIDENT_MUST_NOT_BE_ENABLED')
        status.update(status='installed-inactive', packages=metadata['packages'], inferenceCalls=0,
                      pythonVersion=metadata['version'], installed=True, pipCheck=True, pipCheckPassed=True,
                      pythonCopied=False, venvCopied=False, serviceEnabled=False,
                      unitFileState=final_state['UnitFileState'])
        receipt(status)
        return status
    except BaseException:
        status['status'] = 'failed-partial-retained'
        receipt(status)
        raise
    finally:
        bundle.close()


def verify(load_health=False):
    node('101', standby=True)
    checked(RECEIPT, private=True, root_only=True)
    status = json.loads(RECEIPT.read_bytes())
    need(status.get('status') in {'installed-inactive', 'verified-inactive'}, 'COMPLETE_INSTALL_REQUIRED')
    need(status.get('expectedRelease') == EXPECTED_RELEASE and status.get('node') == '101'
         and status.get('installed') is True and status.get('pipCheck') is True,
         'INSTALL_RECEIPT_BINDING_CHANGED')
    checked(CONTROL / 'installed-manifest.json', private=True, root_only=True)
    raw = (CONTROL / 'installed-manifest.json').read_bytes()
    need(hashlib.sha256(raw).hexdigest() == status['manifestSha256'], 'INSTALLED_MANIFEST_CHANGED')
    manifest = json.loads(raw)
    for row in manifest['entries']:
        path = Path('/' + row['path'])
        info = checked(path, directory=row['type'] == 'directory', private=path == TOKEN)
        if row['type'] == 'file':
            need(info.st_size == row['size'], 'INSTALLED_SIZE_CHANGED')
            if path != TOKEN:
                need(sha_file(path) == row['sha256'], 'INSTALLED_RAW_HASH_CHANGED')
    # No unknown files, links or directory entries may join the installed model trees.
    for tree in [BASE, MODELS, RUNTIME, *([DROPINS] if DROPINS.exists() else [])]:
        actual = set()
        for current, directories, files in os.walk(tree, followlinks=False):
            for name in directories + files:
                path = Path(current) / name
                checked(path, directory=path.is_dir())
                actual.add(str(path).lstrip('/'))
        expected = {row['path'] for row in manifest['entries'] if tree in Path('/' + row['path']).parents}
        need(actual == expected, 'INSTALLED_TREE_NOT_CLOSED')
    extras = dropins(systemd())
    need({str(path).lstrip('/') for path in extras} == set(manifest['dropins']), 'INSTALLED_DROPINS_CHANGED')
    validate_unit([UNIT.read_bytes(), *(path.read_bytes() for path in extras)])
    metadata = python_state(VENV / 'bin/python')
    need(metadata.get('version') == '3.12.15' and metadata.get('packages') == PINS, 'INSTALLED_PACKAGE_PINS_CHANGED')
    need(systemd().get('ActiveState') == 'inactive', 'RESIDENT_MUST_START_INACTIVE')
    need(systemd().get('UnitFileState') in {'disabled', 'static'}, 'RESIDENT_MUST_NOT_BE_ENABLED')
    result = {'schema': 1, 'phase': 'verify', 'node': '101', 'role': 'standby',
              'expectedRelease': EXPECTED_RELEASE, 'release': EXPECTED_RELEASE,
              'installed': True, 'pipCheck': True, 'pipCheckPassed': True,
              'venv': str(VENV), 'pythonVersion': metadata['version'],
              'archiveSha256': status['archiveSha256'], 'manifestSha256': status['manifestSha256'],
              'installedBytesVerified': True, 'packages': metadata['packages'],
              'residentLoadHealthVerified': False, 'singleLoadAttempts': int(status.get('healthLoadAttempted', False)),
              'inferenceCalls': 0}
    if load_health:
        need(not status.get('healthLoadAttempted'), 'RESIDENT_LOAD_ALREADY_ATTEMPTED')
        transient = Path('/run/systemd/system/jarvis-voice.service.d')
        need(not os.path.lexists(transient), 'RUNTIME_OVERRIDE_ALREADY_EXISTS')
        checked(transient.parent, directory=True, root_only=True)
        status['healthLoadAttempted'] = True
        result['singleLoadAttempts'] = 1
        receipt(status)
        transient.mkdir(mode=0o755)
        override = transient / '90-capture-no-restart.conf'
        write_new(override, b'[Service]\nRestart=no\n', mode=0o644)
        try:
            subprocess.run(['systemctl', 'daemon-reload'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            node('101', standby=True)
            subprocess.run(['systemctl', 'start', SERVICE], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            end = time.monotonic() + 90
            while True:
                try:
                    result['resident'] = health()
                    break
                except Exception:
                    need(time.monotonic() < end and systemd().get('ActiveState') not in {'failed', 'inactive'}, 'RESIDENT_LOAD_HEALTH_FAILED')
                    time.sleep(0.5)
            result['residentLoadHealthVerified'] = True
        except BaseException:
            status['healthLoadOutcome'] = 'failed'
            receipt(status)
            private_record(VERIFICATION, {**result, 'status': 'failed', 'leftInactive': False})
            raise
        finally:
            subprocess.run(['systemctl', 'stop', SERVICE], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
            need(systemd().get('ActiveState') == 'inactive', 'RESIDENT_STOP_NOT_CONFIRMED')
            override.unlink()
            transient.rmdir()
            subprocess.run(['systemctl', 'daemon-reload'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    node('101', standby=True)
    final_state = systemd()
    result['leftInactive'] = final_state.get('ActiveState') == 'inactive'
    need(result['leftInactive'], 'RESIDENT_NOT_LEFT_INACTIVE')
    need(final_state.get('UnitFileState') in {'disabled', 'static'}, 'RESIDENT_MUST_NOT_BE_ENABLED')
    result.update(serviceEnabled=False, unitFileState=final_state['UnitFileState'])
    result.update(status='passed', businessInactive=True)
    status.update(status='verified-inactive', installedBytesVerified=True, leftInactive=True,
                  businessInactive=True, inferenceCalls=0,
                  residentLoadHealthVerified=result['residentLoadHealthVerified'] or status.get('residentLoadHealthVerified', False))
    if result['residentLoadHealthVerified']:
        status['healthLoadOutcome'] = 'passed'
        status['singleLoadAttempts'] = 1
    receipt(status)
    private_record(VERIFICATION, result)
    return result


def main():
    global EXPECTED_RELEASE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['inspect', 'export', 'install', 'verify'])
    parser.add_argument('--node', choices=['101', '112'], required=True)
    parser.add_argument('--expected-release', required=True)
    parser.add_argument('--bundle-dir', type=Path)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--expect-archive-sha256')
    parser.add_argument('--health', action='store_true', help='inspect only: GET an already active resident')
    parser.add_argument('--load-health', action='store_true', help='verify only: one resident start/GET/stop, no inference')
    args = parser.parse_args()
    need(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', args.expected_release), 'EXPECTED_RELEASE_INVALID')
    EXPECTED_RELEASE = args.expected_release
    need(sys.platform == 'linux' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
    os.umask(0o077)
    node(args.node, standby=args.node == '101')
    if args.phase == 'inspect':
        need(not args.load_health, 'PHASE_OPTIONS_INVALID')
        value = {'phase': 'inspect', 'node': args.node, 'service': systemd(),
                 'basePython': python_state(BASE_PYTHON), 'stagedPython': python_state(VENV / 'bin/python'),
                 'pathsPresent': {str(path): path.exists() for path in TARGETS}, 'inferenceCalls': 0}
        if args.health and value['service'].get('ActiveState') == 'active':
            value['resident'] = health()
        print(json.dumps(value))
        return
    need(not args.health and (not args.load_health or args.phase == 'verify'), 'PHASE_OPTIONS_INVALID')
    need(args.node == ('112' if args.phase == 'export' else '101'), 'WRITE_NODE_FORBIDDEN')
    lock = control()
    try:
        if args.phase == 'export':
            need(args.bundle_dir is not None, 'BUNDLE_DIRECTORY_REQUIRED')
            result = export_bundle(args.bundle_dir)
        elif args.phase == 'install':
            need(args.archive is not None, 'ARCHIVE_REQUIRED')
            result = installation(args.archive, args.expect_archive_sha256)
        else:
            result = verify(args.load_health)
        print(json.dumps(result))
    finally:
        os.close(lock)


if __name__ == '__main__':
    def interrupted(_signal, _frame):
        raise VoiceError('VOICE_OPERATION_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main()
    except VoiceError as error:
        print(json.dumps({'status': 'failed', 'code': str(error), 'inferenceCalls': 0}), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Never include commands, private configuration, service output or token bytes.
        print(json.dumps({'status': 'failed', 'code': 'VOICE_OPERATION_FAILED', 'inferenceCalls': 0}), file=sys.stderr)
        sys.exit(1)
