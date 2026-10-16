"""Trusted PG4-only lifecycle. Root runs no package, framework or fixture JavaScript.

Preparation is inert. Admission/SQL/source witnesses and an independently reviewed
reader are required by the separate caller before an execution attempt is minted.
Producer facts never qualify the four cases or independently qualify cleanup.
"""
import base64
import contextlib
import datetime
import hashlib
import json
import os
import re
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path

PROTOCOL = 'PG4_QA_STARTUP_R33_V1'
BASE = Path('/var/lib/jarvis-development/101/r37-pg4-qa-context-sentinel-main607-meta-r2')
RUNTIME = Path('/var/lib/jarvis-development/101/r32-truth-artifacts/9e83e22a1ebfcdfc699876860879d8acefe220d3abf49e802333719b549299e3/runtime')
PG_RUNTIME = Path('/var/lib/jarvis-development/101/r29-qa-pg-runtime/3c7ade1178fc47184cd9aaba9e84b855/runtime')
RUNTIME_ID = (66306, 7924569)
RUNTIME_MANIFEST_SHA = 'b4f80840523e838500925387c332aad67b28083a448a17b04ae01999f4b6a8f7'
PG_MANIFEST_SHA = 'd916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1'
PG_METADATA_SHA = '3fee74b974414acce00e557f3d598f0c881f38717465ebd3abfff12d4b3345ca'
FIXTURE_SHA = 'c5645f7567232c7fc797f46f06bc8adc1f2517c18be305daaad01ac9248c3e1a'
EFFECTIVE_SOURCE = 'b3d6fa645cf90044fb70f8a29de5aee33bd1ee9ad33b4d770e374caa6fd696ed'
FIXTURE_TARGET = '/work/source/apps/server/src/modules/test/truth-gate.integration.test.ts'
IMAGES = {'runner': 'sha256:2dee1c25382e87eecb146e7245bb9cbee30feb822b82f8e65929f10c1058ce96', 'postgres': 'sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'}
CONTROL = ('source-contract.json', 'worker-review.json', 'driver-review.json', 'source-admission.json', 'protection.json', 'driver-input-template.json', 'sql-bootstrap-request.json', 'sql-after-request.json', 'fixture.ts')
TOOLS = ('driver.mjs', 'hook-reporter.mjs', 'independent-sql.mjs', 'physical-admission.mjs', 'factory-independent-pg-cjs-consumer-r29.mjs', 'r29-qa-runtime-manifest.json')
PROTECTION_607 = json.loads('{"kind":"software-factory-r37-main607-fixed-metadata-r2-single-entry-protection-observation","physicalKind":"software-factory-r37-main607-fixed-metadata-r2-protection-observation","version":"r37-main607-fixed-metadata-r2-getdents47-hup-source-v1","consumerSHA256":"d26ee32cd9bbbb516baab41e7e68c89938d192fe4ae8738cf0805665eec09e0e","inventoryId":"e02d34e1-0a82-502e-8011-6119ad717b5e","contractVersion":"r37-main607-fixed-metadata-r2-protection-v1","main":{"sha256":"3d08e339e0c0ca78288400b46dae1f24e146ecba2e08e7c69bfbd9ffc9bd91fa","files":607,"bytes":18151378,"metadataSHA":"a952d757430ebd43fa943754e419209b0ab9d399551cb0436f622d47302f8200","stable":true,"identity":{"device":66306,"inode":14417953}},"activationSHA256":"d308b6cefb860b30c1f2f6ba15a43c4acdec130413dfbf2dc42f1d1cbc3a560f","sourceContractSHA256":"de39f1fa5bbc9f596b7af154d985c3044664bfad228b5f173ed05a40c6f904d9","inventoryActivationSHA256":"5ca2f14c07345e6d7c49f9d2eead6a859d5dd56a10c4b120f9b38046a2592413","receiptMethodSHA256":"04dbdd7c07a18384ca3f0fefefba14bb5426d32810624770a996a0f9190a0bad","sourceMethodSHA256":"59f8d3f68938c39f1f969bf76956788754277910caa356ab19be82eb5d0df8ee","physicalSourceSHA256":"95c9f2f19a447a22ddb34d232f1d16ad08738885365f05fc297e4cf005ac00a4","adapterSHA256":"402c5b20d5ec08fda99d5c97b92e4be8366eb654cece5ff5c6ad8b7b4769c788","programs":["280e37068301774f12fe89e6f9df4fe0c8ea9da98760396f29317d3c38d2d917","549c8b8e4711492c75d3b9fccad592a3977f02f556ce15a558a2751a81ba3165","1d4548a82fa40499aca346875c3d9f762967c45c40a1b782c4cc4f8832a9dcdf","280e37068301774f12fe89e6f9df4fe0c8ea9da98760396f29317d3c38d2d917"],"parameters":["279d5bf89a0206c6a7a327a74e682827b0d881dcc3e7dfcf5a52d9f983cf169b","f75e008012f8e6dafb9cbc1f0cd48c8be78aab9238e2ce16eef6fa53bc94f3ff","905a38ec0990aba896ebdcd148289bf6786469e6d4491b475de85bf6e22242e9","279d5bf89a0206c6a7a327a74e682827b0d881dcc3e7dfcf5a52d9f983cf169b"],"originalPrograms":["280e37068301774f12fe89e6f9df4fe0c8ea9da98760396f29317d3c38d2d917","66a241993d910da443bc1b3776ab4c6efc33bc1b44401c7dddff4caa06754155","66e84cadadd232daa58d62b2ee7fd58c6f61cf08baec4e124e7c4ef9a237f8d6","280e37068301774f12fe89e6f9df4fe0c8ea9da98760396f29317d3c38d2d917"],"executedSources":{"orchestrator":"95c9f2f19a447a22ddb34d232f1d16ad08738885365f05fc297e4cf005ac00a4","adapter":"402c5b20d5ec08fda99d5c97b92e4be8366eb654cece5ff5c6ad8b7b4769c788","generator":"7f10715ae744a24117edc34a5d44d2478400a878b77044be289aa616f406ead5","pureModule":"ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8","hupTransformer":"57d207f9e173f07891acb9ab050a0e818840dd87d30c9a150c4b88ec2aa53a13","hupHelper":"c743dcb7c14dd245074c903757747f55721cfe3b164be2af5b4e553898de3a3b","nativeProgram":"549c8b8e4711492c75d3b9fccad592a3977f02f556ce15a558a2751a81ba3165","oldBuildProgram":"1d4548a82fa40499aca346875c3d9f762967c45c40a1b782c4cc4f8832a9dcdf"}}')
H = re.compile(r'[a-f0-9]{64}')
ACTIVE = None
ROOT = None
STATE = None


def need(value, code):
    if not value:
        raise RuntimeError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def key(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def error_frame(error, phase):
    # Never invoke an error's custom message/attribute getters for public state.
    try:args = object.__getattribute__(error, 'args')
    except BaseException:args = ()
    text = args[0] if type(args) is tuple and args and type(args[0]) is str else None
    try:errno = object.__getattribute__(error, 'errno')
    except BaseException:errno = None
    errno = errno if type(errno) is int and abs(errno) <= 4096 else None
    classes = {'RuntimeError','ValueError','TypeError','OSError','FileNotFoundError','PermissionError','TimeoutError','InterruptedError','BrokenPipeError','MemoryError','UnicodeDecodeError'}
    try:name = type(error).__name__
    except BaseException:name = 'OtherException'
    try:original_secondary = object.__getattribute__(error, 'secondaryFailures')
    except BaseException:original_secondary = []
    secondary = []
    if type(original_secondary) is list:
        for row in original_secondary[:32]:
            if type(row) is dict and type(row.get('phase')) is str and re.fullmatch(r'[A-Za-z0-9_.:/-]{1,160}',row['phase']) and type(row.get('errorCode')) is str and re.fullmatch(r'PG4_R33_[A-Z0-9_]{1,120}',row['errorCode']):
                secondary.append({'phase':row['phase'],'errorCode':row['errorCode'],'exceptionClass':row.get('exceptionClass') if row.get('exceptionClass') in classes else 'OtherException','errno':row.get('errno') if type(row.get('errno')) is int and abs(row['errno'])<=4096 else None,'secondaryFailures':[]})
    return {'phase': phase, 'errorCode': text if text is not None and re.fullmatch(r'PG4_R33_[A-Z0-9_]{1,120}', text) else 'PG4_R33_UNKNOWN', 'exceptionClass': name if name in classes else 'OtherException', 'errno': errno, 'secondaryFailures': secondary}

def close_preserving(fd, primary=None):
    try:
        os.close(fd)
    except BaseException as error:
        if primary is None:
            raise
        rows = getattr(primary, 'secondaryFailures', [])
        rows.append(error_frame(error, 'descriptor-close'))
        primary.secondaryFailures = rows


@contextlib.contextmanager
def descriptor(fd, secondary=None):
    primary = None
    try:
        yield fd
    except BaseException as error:
        primary = error
        raise
    finally:
        try:
            os.close(fd)
        except BaseException as error:
            if secondary is not None:
                secondary.append(error_frame(error, 'descriptor-close'))
            if primary is not None:
                rows = getattr(primary, 'secondaryFailures', [])
                rows.append(error_frame(error, 'descriptor-close'))
                primary.secondaryFailures = rows
            if primary is None:
                raise


def held_dir(path):
    path = Path(path)
    need(path.is_absolute() and '..' not in path.parts, 'PG4_R33_DIRECTORY_PATH_INVALID')
    current = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        for part in path.parts[1:]:
            before = os.stat(part, dir_fd=current, follow_symlinks=False)
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == before.st_gid == 0 and not before.st_mode & 0o022, 'PG4_R33_PARENT_UNTRUSTED')
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=current)
            try:
                need(key(before) == key(os.fstat(nxt)), 'PG4_R33_PARENT_CHANGED')
            except BaseException as error:
                close_preserving(nxt, error)
                raise
            try:
                os.close(current)
            except BaseException as error:
                close_preserving(nxt, error)
                raise
            current = nxt
        return current
    except BaseException as error:
        close_preserving(current, error)
        raise


def read_root(path, limit=32 * 1024 * 1024, immutable=False):
    path = Path(path)
    with descriptor(held_dir(path.parent)) as directory:
        before = os.stat(path.name, dir_fd=directory, follow_symlinks=False)
        fd = os.open(path.name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
        with descriptor(fd):
            need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1 and before.st_size <= limit and not before.st_mode & (0o222 if immutable else 0o022) and key(before) == key(os.fstat(fd)), 'PG4_R33_FILE_UNTRUSTED')
            parts = []
            size = 0
            while True:
                block = os.read(fd, min(65536, limit + 1 - size))
                if not block:
                    break
                parts.append(block)
                size += len(block)
                need(size <= limit, 'PG4_R33_FILE_TOO_LARGE')
            need(size == before.st_size and key(before) == key(os.fstat(fd)) == key(os.stat(path.name, dir_fd=directory, follow_symlinks=False)), 'PG4_R33_FILE_CHANGED')
            return b''.join(parts)


def make_dir(path, mode):
    path = Path(path)
    with descriptor(held_dir(path.parent)) as directory:
        os.mkdir(path.name, mode, dir_fd=directory)
        fd = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
        with descriptor(fd):
            os.fchmod(fd, mode)
            need(os.fstat(fd).st_uid == os.fstat(fd).st_gid == 0 and stat.S_IMODE(os.fstat(fd).st_mode) == mode, 'PG4_R33_NEW_DIRECTORY_UNTRUSTED')
            os.fsync(fd)
        os.fsync(directory)


def store(path, raw, mode=0o600):
    path = Path(path)
    need(isinstance(raw, bytes), 'PG4_R33_STORE_BYTES_REQUIRED')
    with descriptor(held_dir(path.parent)) as directory:
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, mode, dir_fd=directory)
        with descriptor(fd):
            rest = memoryview(raw)
            while rest:
                size = os.write(fd, rest)
                need(size > 0, 'PG4_R33_SHORT_WRITE')
                rest = rest[size:]
            os.fchmod(fd, mode)
            os.fsync(fd)
        os.fsync(directory)
    return {'path': str(path), 'sha256': sha(raw), 'bytes': len(raw)}


def save_state():
    raw = compact(STATE) + b'\n'
    tmp = ROOT / ('state.' + secrets.token_hex(8) + '.tmp')
    store(tmp, raw)
    with descriptor(held_dir(ROOT)) as directory:
        os.replace(tmp.name, 'state.json', src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)


def names(attempt):
    need(isinstance(attempt, str) and re.fullmatch(r'[a-f0-9]{32}', attempt), 'PG4_R33_ATTEMPT_INVALID')
    stem = 'jarvis-pg4-qa-r37-context-sentinel-main607-' + attempt
    return {'postgres': stem + '-postgres', 'pg4-runner': stem + '-runner', 'internal-network': stem + '-net', 'postgres-data': stem + '-data'}


def labels(attempt):
    return {'jarvis.pg4.r33.attempt': attempt, 'jarvis.pg4.r33.kind': 'qa-startup-four-cases-v1'}


def fresh_protection(value):
    # The exact already-reviewed configuration is pinned; no observed value becomes a new baseline.
    s=PROTECTION_607; ch=lambda v:sha(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
    need(type(value) is dict and value.get('kind')==s['kind'] and value.get('observerVersion')==s['version'] and value.get('consumerSHA256')==s['consumerSHA256'], 'PG4_R33_PROTECTION_SOURCE_CHANGED')
    need(ch(value.get('activation'))==s['activationSHA256'] and ch(value.get('sourceContract'))==s['sourceContractSHA256'] and value.get('executedSources')==s['executedSources'], 'PG4_R33_PROTECTION_SOURCE_CHANGED')
    need(value.get('ready') is True and all(value.get(k) is True for k in ('protectedInventoryFullyVerified','fullQueueSQLVerified','nodeACKIdle','queueIdle','profileUnchanged','newContractInventoryVerified','newInventoryVerifierUsed','finiteMethodQualified','boundedHupFiniteMethodQualified','protectionOnlyEpoch','changeAuthorsUnknown')) and all(value.get(k) is False for k in ('modelsInvoked','currentR6CleanupQualified','PG4Qualified','productAccepted','productFunctionalQualification','oldObserverExecutionClaimed','inventoryValidationProjectionOnly')), 'PG4_R33_PROTECTION_UNPROVEN')
    need(value.get('contractId')==s['inventoryId'] and value.get('contractVersion')==s['contractVersion'] and value.get('contractRevision')==1 and value.get('sources',{}).get('main')==s['main'], 'PG4_R33_PROTECTION_MAIN607_CHANGED')
    physical=value.get('physicalInventoryProof');need(type(physical) is dict and physical.get('kind')==s['physicalKind'] and all(k=='kind' or value.get(k)==v for k,v in physical.items()), 'PG4_R33_PROTECTION_PHYSICAL_DRIFT')
    pq=physical.get('physicalQualification',{});need(pq.get('sourceSHA256')==s['physicalSourceSHA256'] and pq.get('sourcesStable') is True and ch(pq.get('activation'))==s['inventoryActivationSHA256'] and pq.get('stockProgramSHA256')==s['programs'][0] and pq.get('stockParametersSHA256')==s['parameters'][0], 'PG4_R33_PROTECTION_PHYSICAL_DRIFT')
    o=value.get('observations',{});frames=[o.get('stockBefore'),o.get('nativeSource'),o.get('oldBuild'),o.get('stockAfter')];rows=value.get('sourceReceipts');stages=['inventory-before','native-source','old-build','inventory-after']
    need(type(rows) is list and len(rows)==4 and all(type(f) is dict for f in frames), 'PG4_R33_PROTECTION_RECEIPTS_MISSING')
    for i,row in enumerate(rows):
        need(row.get('schemaVersion')==1 and row.get('kind')=='r37-current-main607-single-entry-protection-source-receipt' and row.get('observerKind')==s['kind'] and row.get('observerVersion')==s['version'] and row.get('stage')==stages[i] and row.get('responseHashDomain')=='canonical-parsed-frame' and ch(row.get('sourceMethod'))==s['receiptMethodSHA256'] and row.get('actualProgramSHA256')==s['programs'][i] and row.get('originalProgramSHA256')==s['originalPrograms'][i] and row.get('parametersSHA256')==s['parameters'][i] and row.get('responseSHA256')==ch(frames[i]), 'PG4_R33_PROTECTION_RECEIPTS_MISSING')
    need(o.get('hostBeforeSHA256')==rows[0]['responseSHA256'] and o.get('hostAfterSHA256')==rows[3]['responseSHA256'], 'PG4_R33_PROTECTION_RECEIPTS_MISSING')
    need(frames[0].get('source')==frames[3].get('source')==s['main'], 'PG4_R33_PROTECTION_MAIN607_CHANGED')
    now=time.time();times=[datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp() for v in [value['at'],*[f['observedAt'] for f in frames]]]
    need(all(-30<=now-at<300 for at in times), 'PG4_R33_PROTECTION_STALE')

def capture(command, phase, timeout, limit=16 * 1024 * 1024):
    """Only trusted lifecycle CLIs. Original stdout/stderr retained before parsing."""
    start = time.monotonic()
    proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'DOCKER_API_VERSION': '1.49'}, close_fds=True)
    streams = {'stdout': bytearray(), 'stderr': bytearray()}
    primary = None
    secondary = []
    timed_out = False
    selector = selectors.DefaultSelector()
    try:
        selector.register(proc.stdout, selectors.EVENT_READ, 'stdout')
        selector.register(proc.stderr, selectors.EVENT_READ, 'stderr')
        while selector.get_map():
            need(time.monotonic() - start < timeout, 'PG4_R33_COMMAND_TIMEOUT')
            for selected, _ in selector.select(min(0.25, timeout - (time.monotonic() - start))):
                block = os.read(selected.fileobj.fileno(), 65536)
                if not block:
                    selector.unregister(selected.fileobj)
                    continue
                streams[selected.data].extend(block)
                need(sum(len(v) for v in streams.values()) <= limit, 'PG4_R33_COMMAND_OUTPUT_LIMIT')
        proc.wait(timeout=max(0.001, timeout - (time.monotonic() - start)))
    except BaseException as error:
        primary = error
        timed_out = str(error) == 'PG4_R33_COMMAND_TIMEOUT' or isinstance(error, subprocess.TimeoutExpired)
    finally:
        if proc.poll() is None:
            try:
                proc.kill()  # Only this owned trusted CLI; does not claim container termination.
                proc.wait(timeout=3)
            except BaseException as error:
                secondary.append(error_frame(error, phase + '-cli-reap'))
        for stream in (proc.stdout, proc.stderr):
            try:
                stream.close()
            except BaseException as error:
                secondary.append(error_frame(error, phase + '-stream-close'))
        try:
            selector.close()
        except BaseException as error:
            secondary.append(error_frame(error, phase + '-selector-close'))
    packet = {'schemaVersion': 1, 'kind': 'r33-pg4-trusted-cli-private-capture', 'phase': phase, 'commandSHA256': sha(compact(command)), 'stdoutBase64': base64.b64encode(streams['stdout']).decode(), 'stderrBase64': base64.b64encode(streams['stderr']).decode(), 'status': proc.returncode, 'timedOut': timed_out, 'complete': primary is None and not secondary, 'firstFailure': error_frame(primary, phase) if primary else None, 'secondaryFailures': secondary}
    try:
        ref = store(ROOT / 'work' / (phase + '-' + secrets.token_hex(8) + '.json'), compact(packet) + b'\n')
    except BaseException as error:
        if primary is not None:
            primary.captureSaveFailure = error_frame(error, phase + '-capture-save')
            raise primary
        raise
    if STATE is not None:
        STATE['captures'].append(ref)
        save_state()
    if primary:
        raise primary
    need(not secondary, 'PG4_R33_CAPTURE_CLOSE_FAILED')
    return proc.returncode, bytes(streams['stdout']), bytes(streams['stderr']), ref


def docker(args, phase, timeout=15):
    return capture(['/usr/bin/docker', *args], phase, min(timeout, max(0.001, ACTIVE['deadline'] - time.monotonic())))


def inspect(role):
    name = names(ACTIVE['attempt'])[role]
    typ = 'container' if role in ('postgres', 'pg4-runner') else ('network' if role == 'internal-network' else 'volume')
    code, raw, err, _ = docker(['inspect', name] if typ == 'container' else [typ, 'inspect', name], 'inspect-' + role)
    if code:
        escaped = re.escape(name)
        patterns = [r'Error: No such object: ' + escaped, r'Error: No such network: ' + escaped, r'Error: No such volume: ' + escaped, r'Error response from daemon: No such container: ' + escaped, r'Error response from daemon: network ' + escaped + r' not found', r'Error response from daemon: get ' + escaped + ': no such volume']
        need(code == 1 and raw.strip() in (b'', b'[]') and any(re.fullmatch(p, err.decode('utf-8', 'strict').strip(), re.I) for p in patterns), 'PG4_R33_RESOURCE_INSPECTION_UNKNOWN')
        return None
    values = decode_image_json(raw) if typ == 'container' else json.loads(raw)
    need(isinstance(values, list) and len(values) == 1 and isinstance(values[0], dict), 'PG4_R33_RESOURCE_INSPECT_INVALID')
    return values[0]


def decode_image_json(raw):
    def object_pairs(pairs):
        value = {}
        for k, v in pairs:
            need(k not in value, 'PG4_R33_IMAGE_JSON_DUPLICATE')
            value[k] = v
        return value
    return json.loads(raw, object_pairs_hook=object_pairs, parse_constant=lambda _: need(False, 'PG4_R33_IMAGE_JSON_NONFINITE'))


def image_label_identity(value, image):
    need(isinstance(value, dict) and value.get('Id') == image and value.get('Os') == 'linux' and value.get('Architecture') == 'amd64', 'PG4_R33_IMAGE_IDENTITY_CHANGED')
    cfg = value.get('Config')
    need(isinstance(cfg, dict) and 'Labels' in cfg, 'PG4_R33_IMAGE_CONFIG_UNKNOWN')
    base = cfg['Labels']
    if base is None:
        base = {}  # Explicit Docker absence of image labels, not an unknown object.
    need(isinstance(base, dict) and all(type(k) is str and k and type(v) is str for k, v in base.items()), 'PG4_R33_IMAGE_LABELS_INVALID')
    need(not set(base).intersection(labels('0' * 32)), 'PG4_R33_IMAGE_RESERVED_LABELS')
    return {'imageID': image, 'os': 'linux', 'architecture': 'amd64', 'baseLabels': base}


def merged_image_container_labels(identity, attempt):
    need(isinstance(identity, dict) and set(identity) == {'imageID', 'os', 'architecture', 'baseLabels'} and identity['imageID'] in IMAGES.values() and identity['os'] == 'linux' and identity['architecture'] == 'amd64', 'PG4_R33_IMAGE_LABEL_BASELINE_CHANGED')
    base = identity['baseLabels']
    need(isinstance(base, dict) and all(type(k) is str and k and type(v) is str for k, v in base.items()) and not set(base).intersection(labels(attempt)), 'PG4_R33_IMAGE_LABEL_BASELINE_CHANGED')
    return {**base, **labels(attempt)}


def read_image_label_baseline():
    path = ROOT / 'work' / 'image-label-baseline.json'
    raw = read_root(path, 2 * 1024**2, True)
    pin = STATE.get('imageLabelBaseline') if isinstance(STATE, dict) else None
    need(isinstance(pin, dict) and pin.get('path') == str(path) and pin.get('sha256') == sha(raw) and pin.get('bytes') == len(raw), 'PG4_R33_IMAGE_LABEL_BASELINE_UNBOUND')
    frame = decode_image_json(raw)
    need(isinstance(frame, dict) and set(frame) == {'schemaVersion', 'kind', 'protocol', 'attempt', 'workerSHA256', 'sourceContractSHA256', 'images', 'identities', 'captures'} and frame['schemaVersion'] == 1 and frame['kind'] == 'r33-pg4-same-batch-image-label-baseline' and frame['protocol'] == PROTOCOL and frame['attempt'] == ACTIVE['attempt'] and frame['workerSHA256'] == ACTIVE['workerSHA256'] and frame['sourceContractSHA256'] == ACTIVE['sourceContractSHA256'] and frame['images'] == IMAGES and set(frame['identities']) == set(IMAGES), 'PG4_R33_IMAGE_LABEL_BASELINE_CHANGED')
    for role, image in IMAGES.items():
        identity = frame['identities'][role]
        merged_image_container_labels(identity, ACTIVE['attempt'])
        need(identity['imageID'] == image, 'PG4_R33_IMAGE_LABEL_BASELINE_CHANGED')
    return frame


def image_label_witness(stage):
    need(stage in ('pre-create', 'post-create'), 'PG4_R33_IMAGE_LABEL_STAGE_INVALID')
    identities, captures = {}, []
    for role, image in IMAGES.items():
        code, raw, err, ref = capture(['/usr/bin/docker', 'image', 'inspect', image], 'image-label-' + stage + '-' + role, min(15, max(0.001, ACTIVE['deadline'] - time.monotonic())), 1024**2)
        need(code == 0 and not err, 'PG4_R33_IMAGE_INSPECTION_UNKNOWN')
        values = decode_image_json(raw)
        need(isinstance(values, list) and len(values) == 1, 'PG4_R33_IMAGE_INSPECT_INVALID')
        identities[role] = image_label_identity(values[0], image)
        captures.append(ref)
    frame = {'schemaVersion': 1, 'kind': 'r33-pg4-same-batch-image-label-baseline', 'protocol': PROTOCOL, 'attempt': ACTIVE['attempt'], 'workerSHA256': ACTIVE['workerSHA256'], 'sourceContractSHA256': ACTIVE['sourceContractSHA256'], 'images': IMAGES, 'identities': identities, 'captures': captures}
    if stage == 'pre-create':
        STATE['imageLabelBaseline'] = store(ROOT / 'work' / 'image-label-baseline.json', compact(frame) + b'\n', 0o444)
    else:
        need(read_image_label_baseline()['identities'] == identities, 'PG4_R33_IMAGE_LABELS_CHANGED_AFTER_CREATE')
        STATE['imageLabelPostCreate'] = store(ROOT / 'work' / 'image-label-post-create.json', compact(frame) + b'\n', 0o444)
    save_state()
    return frame


def expected_container_labels(role):
    image_role = 'runner' if role == 'pg4-runner' else role
    need(image_role in IMAGES, 'PG4_R33_CONTAINER_IMAGE_ROLE_CHANGED')
    return merged_image_container_labels(read_image_label_baseline()['identities'][image_role], ACTIVE['attempt'])


def mount_expectations():
    return sorted([(str(RUNTIME), '/work', False), (str(PG_RUNTIME), '/qa-runtime', False), (str(ROOT / 'tools'), '/tools', False), (str(ROOT / 'control' / 'fixture.ts'), FIXTURE_TARGET, False), (str(ROOT / 'evidence'), '/evidence', True)])


def check_resource(role, value, created=None):
    expected = names(ACTIVE['attempt'])[role]
    need(isinstance(value, dict), 'PG4_R33_RESOURCE_UNKNOWN')
    if role == 'internal-network':
        need(value.get('Name') == expected and value.get('Labels') == labels(ACTIVE['attempt']) and value.get('Driver') == 'bridge' and value.get('Internal') is True and value.get('EnableIPv6') is False and value.get('Options') == {} and value.get('Containers') in ({}, None), 'PG4_R33_NETWORK_CHANGED')
        identity = value.get('Id')
    elif role == 'postgres-data':
        need(value.get('Name') == expected and value.get('Labels') == labels(ACTIVE['attempt']) and value.get('Driver') == 'local' and value.get('Options') in ({}, None), 'PG4_R33_VOLUME_CHANGED')
        identity = value.get('Name')
    else:
        cfg, host = value.get('Config', {}), value.get('HostConfig', {})
        need(value.get('Name') == '/' + expected and cfg.get('Labels') == expected_container_labels(role) and value.get('Image') == IMAGES['runner' if role == 'pg4-runner' else role], 'PG4_R33_CONTAINER_IDENTITY_CHANGED')
        need(host.get('NetworkMode') == names(ACTIVE['attempt'])['internal-network'] and host.get('Privileged') is False and host.get('PidMode') == '' and host.get('IpcMode') == 'private' and host.get('Init') is True and host.get('PortBindings') in ({}, None) and cfg.get('ExposedPorts') in ({}, None, {'5432/tcp': {}}) and host.get('Devices') in ([], None) and host.get('DeviceRequests') in ([], None) and host.get('RestartPolicy', {}).get('Name') == 'no', 'PG4_R33_CONTAINER_SECURITY_CHANGED')
        need(host.get('SecurityOpt') == ['no-new-privileges'] and host.get('LogConfig') == {'Type': 'json-file', 'Config': {'max-size': '4m', 'max-file': '2'}}, 'PG4_R33_CONTAINER_LOG_OR_NNP_CHANGED')
        env = read_root(ROOT / 'control' / (role + '.env'), 65536).decode('utf-8', 'strict').splitlines()
        expected_env = dict(x.split('=', 1) for x in env)
        pairs = [x.split('=', 1) for x in cfg.get('Env', [])]
        need(all(len(x) == 2 for x in pairs) and len({x[0] for x in pairs}) == len(pairs), 'PG4_R33_CONTAINER_ENV_DUPLICATE')
        actual_env = dict(pairs)
        need(all(actual_env.get(k) == v for k, v in expected_env.items()), 'PG4_R33_CONTAINER_ENV_CHANGED')
        forbidden = ('NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'BASH_ENV', 'ENV', 'PG_FORCE_NATIVE', 'MSF_DATABASE_URL')
        need(all(not actual_env.get(k) for k in forbidden) and not any(re.search('API_KEY|TOKEN|OPENAI|ANTHROPIC', k) for k in actual_env), 'PG4_R33_PRODUCTION_OR_EXECUTION_ENV_FORBIDDEN')
        if role == 'pg4-runner':
            need(cfg.get('User') == '1000:1000' and cfg.get('WorkingDir') == '/work/source/apps/server' and cfg.get('Entrypoint') == ['/bin/sleep'] and cfg.get('Cmd') == ['900'] and host.get('CapDrop') == ['ALL'] and host.get('CapAdd') in ([], None) and host.get('ReadonlyRootfs') is True and host.get('Memory') == 4 * 1024**3 and host.get('NanoCpus') == 2 * 10**9 and host.get('PidsLimit') == 256 and host.get('Tmpfs') == {'/tmp': 'rw,nosuid,nodev,size=128m'}, 'PG4_R33_RUNNER_PROFILE_CHANGED')
            mounts = sorted([(m.get('Source'), m.get('Destination'), m.get('RW')) for m in value.get('Mounts', [])])
            need(mounts == mount_expectations() and all(m.get('Type') == 'bind' for m in value.get('Mounts', [])), 'PG4_R33_RUNNER_MOUNTS_CHANGED')
        else:
            caps = host.get('CapAdd')
            need(isinstance(caps, list) and len(caps) == 5 and set(c.removeprefix('CAP_') for c in caps) == {'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETUID', 'SETGID'} and host.get('CapDrop') == ['ALL'] and cfg.get('User') == '' and cfg.get('WorkingDir') == '/' and host.get('ReadonlyRootfs') is False and host.get('Memory') == 768 * 1024**2 and host.get('NanoCpus') == 10**9 and host.get('PidsLimit') == 128, 'PG4_R33_POSTGRES_PROFILE_CHANGED')
            mounts = value.get('Mounts', [])
            need(len(mounts) == 1 and mounts[0].get('Type') == 'volume' and mounts[0].get('Name') == names(ACTIVE['attempt'])['postgres-data'] and mounts[0].get('Destination') == '/var/lib/postgresql/data' and mounts[0].get('RW') is True, 'PG4_R33_POSTGRES_MOUNTS_CHANGED')
        identity = value.get('Id')
    need(isinstance(identity, str) and (identity == expected if role == 'postgres-data' else re.fullmatch(r'[a-f0-9]{64}', identity)), 'PG4_R33_RESOURCE_ID_INVALID')
    if created is not None:
        need(created['identity'] == identity, 'PG4_R33_CREATED_ID_CHANGED')
    return identity


def create_resource(role, args):
    need(inspect(role) is None, 'PG4_R33_RESOURCE_ALREADY_PRESENT')
    fresh_protection(json.loads(read_root(ROOT / 'control' / 'protection.json')))
    intent = {'schemaVersion': 1, 'kind': 'r33-pg4-resource-create-intent', 'protocol': PROTOCOL, 'attempt': ACTIVE['attempt'], 'role': role, 'name': names(ACTIVE['attempt'])[role], 'argumentsSHA256': sha(compact(args)), 'workerSHA256': ACTIVE['workerSHA256']}
    store(ROOT / 'work' / (role + '.intent.json'), compact(intent) + b'\n')
    code, raw, _, _ = docker(args, 'create-' + role, 30)
    need(code == 0, 'PG4_R33_RESOURCE_CREATE_FAILED_UNKNOWN')
    value = inspect(role)
    identity = check_resource(role, value)
    need(raw.decode('utf-8', 'strict').strip() == identity, 'PG4_R33_CREATE_REPLY_ID_MISMATCH')
    created = {'schemaVersion': 1, 'kind': 'r33-pg4-resource-created', 'protocol': PROTOCOL, 'attempt': ACTIVE['attempt'], 'role': role, 'identity': identity, 'inspectSHA256': sha(compact(value))}
    store(ROOT / 'work' / (role + '.created.json'), compact(created) + b'\n')
    STATE['createdRoles'].append(role)
    save_state()


def empty_labels():
    for flag in ('jarvis.pg4.r33.attempt=' + ACTIVE['attempt'], 'jarvis.pg4.r33.kind=qa-startup-four-cases-v1'):
        for command in (['ps', '-aq', '--filter', 'label=' + flag], ['network', 'ls', '-q', '--filter', 'label=' + flag], ['volume', 'ls', '-q', '--filter', 'label=' + flag]):
            code, raw, _, _ = docker(command, 'label-absence')
            need(code == 0 and not raw.strip(), 'PG4_R33_LABEL_SCOPE_NOT_EMPTY')


def load(attempt):
    global ACTIVE, ROOT
    need(os.geteuid() == 0 and sys.flags.isolated == 1, 'PG4_R33_ROOT_ISOLATED_REQUIRED')
    names(attempt)
    ROOT = BASE / attempt
    raw = read_root(ROOT / 'control' / 'activation.json', 2 * 1024**2, True)
    value = json.loads(raw)
    need(set(value) == {'schemaVersion', 'kind', 'protocol', 'attempt', 'sourceContractSHA256', 'workerSHA256', 'starterSHA256', 'driverSHA256', 'controlPins', 'toolPins', 'images', 'source'} and value['kind'] == 'r33-pg4-qa-startup-activation' and value['schemaVersion'] == 1 and value['protocol'] == PROTOCOL and value['attempt'] == attempt and value['images'] == IMAGES and value['source'] == {'fingerprint': EFFECTIVE_SOURCE, 'files': 625, 'bytes': 18413597, 'fixtureSHA256': FIXTURE_SHA}, 'PG4_R33_ACTIVATION_CHANGED')
    need(value['workerSHA256'] == sha(read_root(ROOT / 'control' / 'worker.py', 160000, True)) and set(value['controlPins']) == set(CONTROL) and set(value['toolPins']) == set(TOOLS) and value['driverSHA256'] == value['toolPins']['driver.mjs'], 'PG4_R33_SOURCE_PINS_CHANGED')
    for name, expected in value['controlPins'].items():
        need(H.fullmatch(expected) and sha(read_root(ROOT / 'control' / name, 64 * 1024**2, True)) == expected, 'PG4_R33_CONTROL_SOURCE_CHANGED')
    for name, expected in value['toolPins'].items():
        need(H.fullmatch(expected) and sha(read_root(ROOT / 'tools' / name, 64 * 1024**2, True)) == expected, 'PG4_R33_TOOL_SOURCE_CHANGED')
    need(value['controlPins']['source-contract.json'] == value['sourceContractSHA256'] and value['controlPins']['fixture.ts'] == FIXTURE_SHA and value['toolPins']['hook-reporter.mjs'] == 'ea8fc9d658cc19c9cca9a9e00a615756f4943c9f5e41e80fed998330d1d7f342' and value['toolPins']['factory-independent-pg-cjs-consumer-r29.mjs'] == '45d888de21d3221a66d43d7d601de358338892f26d3d14c9b1ddb5dd32850c99' and value['toolPins']['r29-qa-runtime-manifest.json'] == PG_MANIFEST_SHA, 'PG4_R33_SHARED_PIN_CHANGED')
    for name in ('worker-review.json', 'driver-review.json'):
        review = json.loads(read_root(ROOT / 'control' / name))
        need(review.get('staticPreparationReady') is True and review.get('remainingP0P1') == 0 and review.get('actualPG4Qualified') is False and review.get('workerSHA256') == value['workerSHA256'] and review.get('driverSHA256') == value['driverSHA256'], 'PG4_R33_SOURCE_REVIEW_UNPROVEN')
    ACTIVE = value
    ACTIVE['deadline'] = time.monotonic() + 850
    return value


def read_private_pg_manifest():
    """New purpose, fixed PG receipt only; generic immutable reads are unchanged."""
    with descriptor(held_dir(PG_RUNTIME.parent)) as parent:
        parent_before = key(os.fstat(parent))
        runtime_before = os.stat('runtime', dir_fd=parent, follow_symlinks=False)
        need(stat.S_ISDIR(runtime_before.st_mode) and runtime_before.st_uid == runtime_before.st_gid == 0
             and (runtime_before.st_dev, runtime_before.st_ino) == (66306, 6863174)
             and stat.S_IMODE(runtime_before.st_mode) == 0o555, 'PG4_R33_PRIVATE_PG_RUNTIME_CHANGED')
        with descriptor(os.open('runtime', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)) as runtime:
            need(key(runtime_before) == key(os.fstat(runtime)), 'PG4_R33_PRIVATE_PG_RUNTIME_CHANGED')
            before = os.stat('runtime-manifest.json', dir_fd=parent, follow_symlinks=False)
            need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1
                 and stat.S_IMODE(before.st_mode) == 0o600 and before.st_size == 35825, 'PG4_R33_PRIVATE_PG_MANIFEST_UNTRUSTED')
            flags = os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC
            with descriptor(os.open('runtime-manifest.json', flags, dir_fd=parent)) as leaf:
                need(key(before) == key(os.fstat(leaf)), 'PG4_R33_PRIVATE_PG_MANIFEST_CHANGED')
                first = b''
                while True:
                    block = os.read(leaf, min(8192, 65537 - len(first)))
                    if not block:
                        break
                    first += block
                    need(len(first) <= 65536, 'PG4_R33_PRIVATE_PG_MANIFEST_LIMIT')
                need(len(first) == 35825 and sha(first) == PG_MANIFEST_SHA, 'PG4_R33_PRIVATE_PG_MANIFEST_HASH_CHANGED')
                need(key(before) == key(os.fstat(leaf)), 'PG4_R33_PRIVATE_PG_MANIFEST_CHANGED')
                need(os.lseek(leaf, 0, os.SEEK_SET) == 0, 'PG4_R33_PRIVATE_PG_MANIFEST_SEEK_CHANGED')
                offset = 0
                while True:
                    block = os.read(leaf, 8192)
                    if not block:
                        break
                    need(block == first[offset:offset + len(block)], 'PG4_R33_PRIVATE_PG_MANIFEST_SECOND_READ_CHANGED')
                    offset += len(block)
                need(offset == len(first) and key(before) == key(os.fstat(leaf))
                     == key(os.stat('runtime-manifest.json', dir_fd=parent, follow_symlinks=False)), 'PG4_R33_PRIVATE_PG_MANIFEST_CHANGED')
            need(key(runtime_before) == key(os.fstat(runtime))
                 == key(os.stat('runtime', dir_fd=parent, follow_symlinks=False)), 'PG4_R33_PRIVATE_PG_RUNTIME_CHANGED')
        need(parent_before == key(os.fstat(parent)) == key(os.stat(PG_RUNTIME.parent, follow_symlinks=False)), 'PG4_R33_PRIVATE_PG_PARENT_CHANGED')
        return first


def read_private_pg_metadata():
    """Fixed second PG receipt only; no generic immutable-read exception."""
    limit = 64 * 1024**2
    with descriptor(held_dir(PG_RUNTIME.parent)) as parent:
        parent_before = key(os.fstat(parent))
        runtime_before = os.stat('runtime', dir_fd=parent, follow_symlinks=False)
        need(stat.S_ISDIR(runtime_before.st_mode) and runtime_before.st_uid == runtime_before.st_gid == 0
             and (runtime_before.st_dev, runtime_before.st_ino) == (66306, 6863174)
             and stat.S_IMODE(runtime_before.st_mode) == 0o555, 'PG4_R33_PRIVATE_PG_RUNTIME_CHANGED')
        with descriptor(os.open('runtime', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)) as runtime:
            need(key(runtime_before) == key(os.fstat(runtime)), 'PG4_R33_PRIVATE_PG_RUNTIME_CHANGED')
            before = os.stat('runtime-metadata.json', dir_fd=parent, follow_symlinks=False)
            need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0 and before.st_nlink == 1
                 and stat.S_IMODE(before.st_mode) == 0o600 and 0 < before.st_size <= limit,
                 'PG4_R33_PRIVATE_PG_METADATA_UNTRUSTED')
            flags = os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC
            with descriptor(os.open('runtime-metadata.json', flags, dir_fd=parent)) as leaf:
                need(key(before) == key(os.fstat(leaf)), 'PG4_R33_PRIVATE_PG_METADATA_CHANGED')
                parts, size = [], 0
                while True:
                    block = os.read(leaf, min(65536, limit + 1 - size))
                    if not block:
                        break
                    parts.append(block)
                    size += len(block)
                    need(size <= limit, 'PG4_R33_PRIVATE_PG_METADATA_LIMIT')
                first = b''.join(parts)
                need(size == before.st_size and sha(first) == PG_METADATA_SHA,
                     'PG4_R33_PRIVATE_PG_METADATA_HASH_CHANGED')
                need(key(before) == key(os.fstat(leaf)), 'PG4_R33_PRIVATE_PG_METADATA_CHANGED')
                need(os.lseek(leaf, 0, os.SEEK_SET) == 0, 'PG4_R33_PRIVATE_PG_METADATA_SEEK_CHANGED')
                offset = 0
                while True:
                    block = os.read(leaf, 65536)
                    if not block:
                        break
                    need(block == first[offset:offset + len(block)],
                         'PG4_R33_PRIVATE_PG_METADATA_SECOND_READ_CHANGED')
                    offset += len(block)
                need(offset == size and key(before) == key(os.fstat(leaf))
                     == key(os.stat('runtime-metadata.json', dir_fd=parent, follow_symlinks=False)),
                     'PG4_R33_PRIVATE_PG_METADATA_CHANGED')
            need(key(runtime_before) == key(os.fstat(runtime))
                 == key(os.stat('runtime', dir_fd=parent, follow_symlinks=False)), 'PG4_R33_PRIVATE_PG_RUNTIME_CHANGED')
        need(parent_before == key(os.fstat(parent)) == key(os.stat(PG_RUNTIME.parent, follow_symlinks=False)),
             'PG4_R33_PRIVATE_PG_PARENT_CHANGED')
        return first


def runtime_identity():
    for root, expected in ((RUNTIME, RUNTIME_ID), (PG_RUNTIME, None)):
        with descriptor(held_dir(root)) as fd:
            info = os.fstat(fd)
            need(stat.S_IMODE(info.st_mode) == 0o555 and (expected is None or (info.st_dev, info.st_ino) == expected), 'PG4_R33_RUNTIME_ROOT_CHANGED')
    need(sha(read_root(RUNTIME.parent / 'runtime-manifest.json', 64 * 1024**2, True)) == RUNTIME_MANIFEST_SHA and sha(read_private_pg_manifest()) == PG_MANIFEST_SHA, 'PG4_R33_RUNTIME_MANIFEST_CHANGED')
    need(sha(read_private_pg_metadata()) == PG_METADATA_SHA, 'PG4_R33_RUNTIME_METADATA_CHANGED')
    frame = json.loads(read_root(ROOT / 'control' / 'source-admission.json'))
    need(frame.get('kind') == 'r33-pg4-root-source-runtime-admission' and frame.get('protocol') == PROTOCOL and frame.get('workerSHA256') == ACTIVE['workerSHA256'] and frame.get('driverSHA256') == ACTIVE['driverSHA256'] and frame.get('sourceContractSHA256') == ACTIVE['sourceContractSHA256'] and frame.get('effectiveSource') == ACTIVE['source'] and frame.get('runtimeContractSHA256') == '27f8687bf5678a519684d4b86f21ed6147e923591ec4ba75cc5a28ec82cb7e71' and frame.get('runtimeManifestSHA256') == RUNTIME_MANIFEST_SHA and isinstance(frame.get('evidenceRefs'), list) and len(frame['evidenceRefs']) > 0 and all(H.fullmatch(r.get('sha256', '')) for r in frame['evidenceRefs']), 'PG4_R33_ROOT_SOURCE_ADMISSION_MISSING')


def read_evidence(name, maximum=16 * 1024**2):
    need(name in ('pg4-vitest-result.json', 'pg4-hook-result.json', 'pg4-startup-frame.json', 'pg4-driver-result.json', 'pg4-fixture-start-intent.json', 'pg4-physical-admission-error.json'), 'PG4_R33_REPORT_NAME_INVALID')
    with descriptor(held_dir(ROOT)) as root:
        before = os.stat('evidence', dir_fd=root, follow_symlinks=False)
        fd = os.open('evidence', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root)
        with descriptor(fd):
            need(key(before) == key(os.fstat(fd)) and before.st_uid == before.st_gid == 1000 and stat.S_IMODE(before.st_mode) == 0o700, 'PG4_R33_EVIDENCE_DIRECTORY_CHANGED')
            info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            file = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=fd)
            with descriptor(file):
                need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 1000 and info.st_nlink == 1 and info.st_size <= maximum and not info.st_mode & 0o022 and key(info) == key(os.fstat(file)), 'PG4_R33_REPORT_FILE_UNTRUSTED')
                raw = b''
                while len(raw) <= maximum:
                    block = os.read(file, min(65536, maximum + 1 - len(raw)))
                    if not block:
                        break
                    raw += block
                need(len(raw) == info.st_size and key(info) == key(os.fstat(file)) == key(os.stat(name, dir_fd=fd, follow_symlinks=False)), 'PG4_R33_REPORT_FILE_CHANGED')
                os.lseek(file, 0, os.SEEK_SET)
                offset = 0
                while offset < len(raw):
                    block = os.read(file, min(65536, len(raw) - offset))
                    need(block and raw[offset:offset + len(block)] == block, 'PG4_R33_REPORT_SECOND_READ_CHANGED')
                    offset += len(block)
                need(not os.read(file, 1) and key(info) == key(os.fstat(file)) == key(os.stat(name, dir_fd=fd, follow_symlinks=False)), 'PG4_R33_REPORT_SECOND_READ_CHANGED')
                return raw, key(info)


def retain_reports():
    rows = []
    for name in ('pg4-vitest-result.json', 'pg4-hook-result.json', 'pg4-startup-frame.json', 'pg4-driver-result.json', 'pg4-fixture-start-intent.json'):
        try:
            raw, metadata = read_evidence(name)
            # Root-owned immutable copy first. JSON/framework interpretation is independent.
            ref = store(ROOT / 'work' / ('retained-' + name), raw, 0o444)
            rows.append({'name': name, 'sourceMetadata': metadata, 'retainedOriginal': ref, 'originalSHA256': sha(raw), 'originalBytes': len(raw), 'sourceWasReadTwice': True, 'secondRawExported': False})
        except BaseException as error:
            rows.append({'name': name, 'retainedOriginal': None, 'firstFailure': error_frame(error, 'report-retention-' + name)})
    STATE['reports'] = rows
    save_state()


def optional_physical_error_present():
    # Only a missing exact leaf beneath this bound directory is absence.
    with descriptor(held_dir(ROOT)) as root:
        before = os.stat('evidence', dir_fd=root, follow_symlinks=False)
        fd = os.open('evidence', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root)
        with descriptor(fd):
            need(key(before) == key(os.fstat(fd)) and before.st_uid == before.st_gid == 1000 and stat.S_IMODE(before.st_mode) == 0o700, 'PG4_R33_EVIDENCE_DIRECTORY_CHANGED')
            try:
                info = os.stat('pg4-physical-admission-error.json', dir_fd=fd, follow_symlinks=False)
                need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 1000 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600 and 0 <= info.st_size <= 8 * 1024**2, 'PG4_R33_OPTIONAL_ERROR_UNTRUSTED')
                present = True
            except FileNotFoundError:
                present = False
            need(key(before) == key(os.fstat(fd)) == key(os.stat('evidence', dir_fd=root, follow_symlinks=False)), 'PG4_R33_EVIDENCE_DIRECTORY_CHANGED')
            return present


def retain_optional_physical_error():
    name = 'pg4-physical-admission-error.json'
    value = {'schemaVersion': 1, 'kind': 'r33-pg4-optional-physical-error-original-byte-retention', 'name': name, 'status': 'unknown', 'presenceObservationComplete': False, 'retainedOriginal': None, 'sourceMetadata': None, 'originalSHA256': None, 'originalBytes': None, 'sourceWasReadTwice': None, 'firstFailure': None}
    try:
        if not optional_physical_error_present():
            value['status'] = 'absent'
            value['presenceObservationComplete'] = True
        else:
            raw, metadata = read_evidence(name, 8 * 1024**2)
            need(stat.S_IMODE(metadata[4]) == 0o600, 'PG4_R33_OPTIONAL_ERROR_UNTRUSTED')
            ref = store(ROOT / 'work' / ('retained-' + name), raw, 0o444)
            value.update({'status': 'retained', 'presenceObservationComplete': True, 'retainedOriginal': ref, 'sourceMetadata': metadata, 'originalSHA256': sha(raw), 'originalBytes': len(raw), 'sourceWasReadTwice': True})
    except BaseException as error:
        value['firstFailure'] = error_frame(error, 'optional-physical-error-retention')
        STATE['optionalPhysicalError'] = value
        try:
            save_state()
        except BaseException as saving:
            failures = list(getattr(error, 'secondaryFailures', []))
            failures.append(error_frame(saving, 'optional-physical-error-state-save'))
            error.secondaryFailures = failures
        raise
    STATE['optionalPhysicalError'] = value
    save_state()
    return value


def owner_identity():
    need(os.geteuid() == os.getuid() == os.getegid() == os.getgid() == 0, 'PG4_R33_OWNER_UID_CHANGED')
    pid = os.getpid()
    with descriptor(held_dir('/proc/' + str(pid))) as proc:
        before = os.fstat(proc)
        with descriptor(os.open('stat', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=proc)) as fd:
            raw = os.read(fd, 65536).decode('utf-8', 'strict')
        need(key(before) == key(os.fstat(proc)) == key(os.stat('/proc/' + str(pid), follow_symlinks=False)), 'PG4_R33_OWNER_PROC_CHANGED')
    fields = raw[raw.rfind(')') + 2:].split()
    group = Path('/proc/self/cgroup').read_text().strip()
    unit = 'jarvis-pg4-qa-r37-context-sentinel-main607-' + ACTIVE['attempt'] + '.service'
    need(group == '0::/system.slice/' + unit, 'PG4_R33_OWNER_CGROUP_CHANGED')
    status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    need(status.get('NoNewPrivs', '').strip() == '1', 'PG4_R33_OWNER_NNP_CHANGED')
    return {'pid': pid, 'ppid': int(fields[1]), 'startTicks': fields[19], 'procDevice': before.st_dev, 'procInode': before.st_ino, 'boot': Path('/proc/sys/kernel/random/boot_id').read_text().strip(), 'unit': unit, 'controlGroup': '/system.slice/' + unit, 'uid': 0, 'gid': 0, 'capabilities': {k: status[k].strip() for k in ('CapEff', 'CapPrm', 'CapInh', 'CapAmb')}, 'noNewPrivileges': 1, 'runtimeMaxSec': 900, 'stopTimeoutSec': 120, 'killMode': 'control-group', 'restart': 'no', 'rootOwnerDoesNotClaimCap0': True}


def tool_exec(tool, input_path, phase, timeout):
    runner = inspect('pg4-runner')
    created = json.loads(read_root(ROOT / 'work' / 'pg4-runner.created.json'))
    check_resource('pg4-runner', runner, created)
    local = ROOT / 'tools' / input_path.removeprefix('/tools/')
    need(input_path.startswith('/tools/') and '..' not in Path(input_path).parts, 'PG4_R33_TOOL_INPUT_PATH_INVALID')
    input_sha = sha(read_root(local, 8 * 1024**2, True))
    args = ['exec', '--user', '1000:1000', names(ACTIVE['attempt'])['pg4-runner'], '/usr/local/bin/node', '--disable-proto=throw', '/tools/' + tool, input_path, input_sha]
    return docker(args, phase, timeout)


def stage_sql_request(phase):
    request = json.loads(read_root(ROOT / 'control' / ('sql-' + ('bootstrap' if phase == 'bootstrap' else 'after') + '-request.json')))
    keys = {'schemaVersion', 'kind', 'protocol', 'attempt', 'phase', 'sourceContractSHA256', 'driverSHA256', 'sqlSourceSHA256', 'runtimeWitness', 'migrationWitness', 'databaseIdentity', 'selectedFixtureSHA256'}
    need(set(request) == keys and request['kind'] == 'r33-pg4-independent-sql-request' and request['protocol'] == PROTOCOL and request['phase'] == phase and request['attempt'] in (None, ACTIVE['attempt']) and request['sourceContractSHA256'] == ACTIVE['sourceContractSHA256'] and request['driverSHA256'] == ACTIVE['driverSHA256'] and request['sqlSourceSHA256'] == ACTIVE['toolPins']['independent-sql.mjs'] and request['selectedFixtureSHA256'] == FIXTURE_SHA, 'PG4_R33_SQL_REQUEST_UNPROVEN')
    request['attempt'] = ACTIVE['attempt']
    request['databaseIdentity']['urlSHA256'] = sha(read_root(ROOT / 'tools' / 'pg4-db-url.txt', 65536, True))
    if phase == 'after-hooks':
        request['databaseIdentity']['bootstrapSnapshotRef'] = {'path': '/tools/sql-baseline.json', 'sha256': sha(read_root(ROOT / 'tools' / 'sql-baseline.json'))}
    target = 'sql-bootstrap.json' if phase == 'bootstrap' else 'sql-after-hooks.json'
    # Exact compact request bytes are also the SQL tool's JSON.stringify domain.
    store(ROOT / 'tools' / target, compact(request), 0o444)
    return '/tools/' + target


def sql_phase(phase, timeout):
    path = stage_sql_request(phase)
    code, raw, _, ref = tool_exec('independent-sql.mjs', path, 'sql-' + phase, timeout)
    need(code == 0, 'PG4_R33_INDEPENDENT_SQL_FAILED')
    frame = json.loads(raw)
    request_raw = read_root(ROOT / 'tools' / path.removeprefix('/tools/'), 8 * 1024**2, True)
    need(frame.get('kind') == 'r33-pg4-independent-sql-result' and frame.get('protocol') == PROTOCOL and frame.get('attempt') == ACTIVE['attempt'] and frame.get('phase') == phase and frame.get('sourceContractSHA256') == ACTIVE['sourceContractSHA256'] and frame.get('driverSHA256') == ACTIVE['driverSHA256'] and frame.get('sqlSourceSHA256') == ACTIVE['toolPins']['independent-sql.mjs'] and frame.get('requestSHA256') == sha(request_raw) and frame.get('selectedFixtureSHA256') == FIXTURE_SHA and frame.get('status') == 'complete' and frame.get('actualPG4Qualified') is False and frame.get('overallSourceFamilyQualified') is False and all(H.fullmatch(frame.get(k, '')) for k in ('schemaIdentitySHA256', 'migrationsSHA256', 'businessRowsSHA256')), 'PG4_R33_SQL_RESULT_UNBOUND')
    store(ROOT / 'tools' / ('sql-baseline.json' if phase == 'bootstrap' else 'sql-after-result.json'), raw, 0o444)
    STATE['sql'][phase] = {'capture': ref, 'responseSHA256': sha(raw)}
    save_state()
    return frame


def pre_fixture_admission():
    measure_created_witnesses()
    roles = ('sourceContract', 'sourceReview', 'sourceAdmission', 'runtimeQualification', 'issuerReview', 'entryReview', 'runtimeWitness', 'sourceWitness', 'overlayVirtualWitness', 'pgRuntimeWitness', 'priorScopeAdmission', 'preScopeAbsence', 'mountWitness', 'imageWitness', 'freshProtection')
    admission_refs = {role: {'path': '/tools/admission/' + role + '.json', 'sha256': sha(read_root(ROOT / 'tools' / 'admission' / (role + '.json'), 64 * 1024**2, True))} for role in roles}
    request = {'schemaVersion': 1, 'kind': 'r33-pg4-physical-admission-request', 'protocol': PROTOCOL, 'attempt': ACTIVE['attempt'], 'workerSHA256': ACTIVE['workerSHA256'], 'driverSHA256': ACTIVE['driverSHA256'], 'sourceContractSHA256': ACTIVE['sourceContractSHA256'], 'source': ACTIVE['source'], 'mounts': mount_expectations(), 'admissionRefs': admission_refs, 'nodeExecutableRootWitness': {'path': '/tools/admission/nodeExecutableRootWitness.json', 'sha256': sha(read_root(ROOT / 'tools' / 'admission' / 'nodeExecutableRootWitness.json', 2 * 1024**2, True))}}
    store(ROOT / 'tools' / 'physical-admission-request.json', compact(request) + b'\n', 0o444)
    code, raw, _, _ = tool_exec('physical-admission.mjs', '/tools/physical-admission-request.json', 'pre-fixture-physical-admission', 30)
    need(code == 0, 'PG4_R33_PRE_FIXTURE_ADMISSION_FAILED')
    frame = json.loads(raw)
    need(frame.get('kind') == 'r33-pg4-qa-pre-fixture-physical-admission' and frame.get('protocol') == PROTOCOL and frame.get('attempt') == ACTIVE['attempt'] and frame.get('workerSHA256') == ACTIVE['workerSHA256'] and frame.get('driverSHA256') == ACTIVE['driverSHA256'] and frame.get('sourceContractSHA256') == ACTIVE['sourceContractSHA256'], 'PG4_R33_PRE_FIXTURE_ADMISSION_UNBOUND')
    store(ROOT / 'tools' / 'admission' / 'physical-frame.json', raw, 0o444)
    template = json.loads(read_root(ROOT / 'control' / 'driver-input-template.json'))
    need(set(template) == {'schemaVersion', 'kind', 'protocol', 'attempt', 'sourceContractHash', 'fixedRuntime', 'source', 'images', 'essentialManifestExpectations', 'config', 'preAdmission', 'sqlBaseline'} and template.get('kind') == 'r33-pg4-qa-startup-driver-input' and template.get('protocol') == PROTOCOL and template.get('attempt') in (None, ACTIVE['attempt']) and template.get('sourceContractHash') == ACTIVE['sourceContractSHA256'], 'PG4_R33_DRIVER_INPUT_UNBOUND')
    template['attempt'] = ACTIVE['attempt']
    template['preAdmission']['physicalFrame'] = frame
    template['preAdmission']['expiresAt'] = frame['expiresAt']
    template['preAdmission']['freshProtection']['sha256'] = sha(read_root(ROOT / 'tools' / 'admission' / 'freshProtection.json', 64 * 1024**2, True))
    template['preAdmission']['preScopeAbsence']['sha256'] = admission_refs['preScopeAbsence']['sha256']
    for field, names_ in (('fixedRuntime', ('runtimeWitness', 'mountWitness')), ('source', ('sourceWitness',)), ('images', ('imageWitness',))):
        for role in names_:
            need(template[field][role] == {'path': '/tools/admission/' + role + '.json', 'sha256': None}, 'PG4_R33_DEFERRED_WITNESS_TEMPLATE_CHANGED')
            template[field][role] = admission_refs[role]
    overlay = frame.get('readonlyOverlayWitness')
    need(isinstance(overlay, dict) and set(overlay) == {'sha256', 'bytes', 'base64'}, 'PG4_R33_PHYSICAL_OVERLAY_RAW_MISSING')
    overlay_raw = base64.b64decode(overlay['base64'], validate=True)
    need(sha(overlay_raw) == overlay['sha256'] and len(overlay_raw) == overlay['bytes'] and len(overlay_raw) <= 8 * 1024**2 and base64.b64encode(overlay_raw).decode() == overlay['base64'], 'PG4_R33_PHYSICAL_OVERLAY_RAW_CHANGED')
    store(ROOT / 'tools' / 'admission' / 'readonlyOverlayWitness.json', overlay_raw, 0o444)
    need(template['source']['readonlyOverlayWitness'] == {'path': '/tools/admission/readonlyOverlayWitness.json', 'sha256': None}, 'PG4_R33_DEFERRED_OVERLAY_TEMPLATE_CHANGED')
    template['source']['readonlyOverlayWitness']['sha256'] = overlay['sha256']
    native = json.loads(read_root(ROOT / 'tools' / 'admission' / 'nodeExecutableRootWitness.json', 2 * 1024**2, True))
    node = frame.get('nodeExecutable')
    need(isinstance(node, dict) and node.get('path') == '/usr/local/bin/node' and node.get('sha256') == native['sha256'] and node.get('bytes') == native['bytes'] and node.get('runnerImageID') == IMAGES['runner'] and node.get('nativeWitnessSHA256') == sha(read_root(ROOT / 'tools' / 'admission' / 'nodeExecutableRootWitness.json', 2 * 1024**2, True)), 'PG4_R33_NODE_MEASUREMENT_UNBOUND')
    need(template['essentialManifestExpectations']['node'] == {'path': '/usr/local/bin/node', 'sha256': None, 'bytes': None}, 'PG4_R33_NODE_STATIC_EXPECTATION_CHANGED')
    template['essentialManifestExpectations']['node'] = {'path': node['path'], 'sha256': node['sha256'], 'bytes': node['bytes']}
    baseline = json.loads(read_root(ROOT / 'tools' / 'sql-baseline.json'))
    template['sqlBaseline'] = {'before': {'path': '/tools/sql-baseline.json', 'sha256': sha(read_root(ROOT / 'tools' / 'sql-baseline.json'))}, 'schemaIdentitySHA256': baseline['schemaIdentitySHA256'], 'migrationsSHA256': baseline['migrationsSHA256'], 'businessRowsSHA256': baseline['businessRowsSHA256']}
    store(ROOT / 'tools' / 'driver-input.json', compact(template) + b'\n', 0o444)


def measure_created_witnesses():
    runner = inspect('pg4-runner')
    created = json.loads(read_root(ROOT / 'work' / 'pg4-runner.created.json'))
    check_resource('pg4-runner', runner, created)
    runner_capture = STATE['captures'][-1]
    postgres = inspect('postgres')
    check_resource('postgres', postgres, json.loads(read_root(ROOT / 'work' / 'postgres.created.json')))
    postgres_capture = STATE['captures'][-1]
    frame = {'schemaVersion': 1, 'protocol': PROTOCOL, 'phase': 'C', 'attempt': ACTIVE['attempt'], 'workerSHA256': ACTIVE['workerSHA256'], 'driverSHA256': ACTIVE['driverSHA256'], 'sourceContractSHA256': ACTIVE['sourceContractSHA256'], 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'runnerContainerID': created['identity'], 'runnerImageID': runner['Image'], 'postgresContainerID': postgres['Id'], 'postgresImageID': postgres['Image'], 'captures': [runner_capture, postgres_capture], 'currentBatchClosureClaimed': False}
    mount = {**frame, 'kind': 'r33-pg4-same-batch-created-mount-witness', 'mounts': runner['Mounts'], 'hostConfigSHA256': sha(compact(runner['HostConfig'])), 'sourceCommandMethod': 'source-bound-docker-inspect-after-created-ID-match'}
    image = {**frame, 'kind': 'r33-pg4-same-batch-created-image-witness', 'nodeExecutableRootWitness': {'path': '/tools/admission/nodeExecutableRootWitness.json', 'sha256': sha(read_root(ROOT / 'tools' / 'admission' / 'nodeExecutableRootWitness.json', 2 * 1024**2, True))}}
    store(ROOT / 'tools' / 'admission' / 'mountWitness.json', compact(mount), 0o444)
    store(ROOT / 'tools' / 'admission' / 'imageWitness.json', compact(image), 0o444)


def pre_resource_absence():
    first = len(STATE['captures'])
    empty_labels()
    for role in ('postgres', 'pg4-runner', 'internal-network', 'postgres-data'):
        need(inspect(role) is None, 'PG4_R33_FIRST_CREATE_SCOPE_NOT_EMPTY')
    frame = {'schemaVersion': 1, 'kind': 'r33-pg4-new-attempt-pre-resource-absence-witness', 'protocol': PROTOCOL, 'phase': 'B', 'attempt': ACTIVE['attempt'], 'workerSHA256': ACTIVE['workerSHA256'], 'driverSHA256': ACTIVE['driverSHA256'], 'sourceContractSHA256': ACTIVE['sourceContractSHA256'], 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'resources': names(ACTIVE['attempt']), 'labels': labels(ACTIVE['attempt']), 'resourceCount': 4, 'allExactNamesAbsent': True, 'bothLabelScopesAbsent': True, 'captures': STATE['captures'][first:], 'sourceCommandMethod': 'source-bound-all-four-name-inspects-and-both-label-censuses-before-first-create', 'cleanupIndependentlyVerified': False, 'currentBatchClosureClaimed': False}
    store(ROOT / 'tools' / 'admission' / 'preScopeAbsence.json', compact(frame), 0o444)


def measure_node_image_bytes():
    """Native fixed-image CLIs as UID1000, never JS. Own Node-held reads remain separate.

    Named native stat-before/after equality is not advertised as a Root-held FD
    trace. Only one binary hash is returned; no binary bytes are exported here.
    """
    created = json.loads(read_root(ROOT / 'work' / 'pg4-runner.created.json'))
    runner = inspect('pg4-runner')
    check_resource('pg4-runner', runner, created)
    prefix = ['exec', '--user', '1000:1000', created['identity']]
    fmt = '%d|%i|%f|%u|%g|%h|%s|%y|%z'
    command = prefix + ['/usr/bin/stat', '--printf=' + fmt, '--', '/usr/local/bin/node']
    before_code, before, _, before_ref = docker(command, 'node-native-stat-before', 10)
    need(before_code == 0, 'PG4_R33_NODE_NATIVE_STAT_FAILED')
    code, hashed, _, hash_ref = docker(prefix + ['/usr/bin/sha256sum', '--', '/usr/local/bin/node'], 'node-native-byte-hash', 30)
    need(code == 0, 'PG4_R33_NODE_NATIVE_HASH_FAILED')
    match = re.fullmatch(rb'([a-f0-9]{64})  /usr/local/bin/node\n', hashed)
    need(match is not None, 'PG4_R33_NODE_NATIVE_HASH_FORMAT_INVALID')
    after_code, after, _, after_ref = docker(command, 'node-native-stat-after', 10)
    need(after_code == 0 and before == after, 'PG4_R33_NODE_NATIVE_STAT_CHANGED')
    fields = before.decode('utf-8', 'strict').split('|')
    need(len(fields) == 9 and all(re.fullmatch('[0-9]+', fields[i]) for i in (0, 1, 3, 4, 5, 6)) and re.fullmatch('[a-f0-9]+', fields[2]), 'PG4_R33_NODE_NATIVE_STAT_INVALID')
    need(stat.S_ISREG(int(fields[2], 16)) and int(fields[3]) == int(fields[4]) == 0 and int(fields[5]) == 1 and 0 < int(fields[6]) <= 256 * 1024**2 and not int(fields[2], 16) & 0o022, 'PG4_R33_NODE_NATIVE_FILE_UNTRUSTED')
    check_resource('pg4-runner', inspect('pg4-runner'), created)
    frame = {'schemaVersion': 1, 'kind': 'r33-pg4-root-native-node-byte-stat-witness', 'protocol': PROTOCOL, 'attempt': ACTIVE['attempt'], 'workerSHA256': ACTIVE['workerSHA256'], 'driverSHA256': ACTIVE['driverSHA256'], 'sourceContractSHA256': ACTIVE['sourceContractSHA256'], 'runnerContainerID': created['identity'], 'runnerImageID': IMAGES['runner'], 'path': '/usr/local/bin/node', 'sha256': match.group(1).decode(), 'bytes': int(fields[6]), 'nativeStatRawBase64': base64.b64encode(before).decode(), 'nativeStatRawSHA256': sha(before), 'nativeStatFields': {'device': fields[0], 'inode': fields[1], 'modeHex': fields[2], 'uid': fields[3], 'gid': fields[4], 'nlink': fields[5], 'bytes': fields[6], 'mtimeOriginalText': fields[7], 'ctimeOriginalText': fields[8]}, 'captures': [before_ref, hash_ref, after_ref], 'sourceCommandMethod': 'fixed-image-UID1000-native-sha256sum-with-equal-named-stat-frames', 'RootHeldBinaryDescriptorClaimed': False, 'originalBinaryBytesExported': False, 'frameworkABIQualified': False, 'actualPG4Qualified': False}
    store(ROOT / 'tools' / 'admission' / 'nodeExecutableRootWitness.json', compact(frame) + b'\n', 0o444)


def wait_postgres_ready():
    """Bounded native readiness only; this does not qualify migration or SQL cases."""
    deadline = min(ACTIVE['deadline'], time.monotonic() + 60)
    created = json.loads(read_root(ROOT / 'work' / 'postgres.created.json'))
    for _ in range(30):
        need(time.monotonic() < deadline, 'PG4_R33_POSTGRES_READY_TIMEOUT')
        check_resource('postgres', inspect('postgres'), created)
        code, _, _, _ = docker(['exec', '--user', 'postgres', names(ACTIVE['attempt'])['postgres'], 'pg_isready', '-U', 'qa', '-d', 'jarvis_truth_pg4_r33'], 'postgres-native-readiness', min(5, deadline - time.monotonic()))
        if code == 0:
            return
        need(code in (1, 2), 'PG4_R33_POSTGRES_READINESS_UNKNOWN')
        time.sleep(min(2, max(0, deadline - time.monotonic())))
    raise RuntimeError('PG4_R33_POSTGRES_READY_TIMEOUT')


def cleanup_owned():
    """Finite, exact recorded ownership only. No force, adoption, wildcard or retry."""
    errors = []
    for role in ('pg4-runner', 'postgres', 'internal-network', 'postgres-data'):
        try:
            current = inspect(role)
            if current is None:
                STATE['cleanupFacts'].append({'role': role, 'observedAbsent': True, 'deleted': False})
                continue
            created_path = ROOT / 'work' / (role + '.created.json')
            need(os.path.lexists(created_path), 'PG4_R33_PRESENT_ID_HISTORY_UNKNOWN')
            created = json.loads(read_root(created_path))
            identity = check_resource(role, current, created)
            if role in ('postgres', 'pg4-runner'):
                if current.get('State', {}).get('Running') is True:
                    code, _, _, _ = docker(['stop', '--time', '10', identity], 'stop-' + role, 15)
                    need(code == 0, 'PG4_R33_STOP_FAILED')
                check_resource(role, inspect(role), created)
                command = ['rm', identity]
            elif role == 'internal-network':
                command = ['network', 'rm', identity]
            else:
                command = ['volume', 'rm', identity]
            code, _, _, _ = docker(command, 'remove-' + role, 15)
            need(code == 0 and inspect(role) is None, 'PG4_R33_REMOVE_NOT_CONFIRMED')
            STATE['cleanupFacts'].append({'role': role, 'observedAbsent': True, 'deleted': True, 'identity': identity})
        except BaseException as error:
            errors.append(error_frame(error, 'cleanup-' + role))
    STATE['cleanupFailures'] = errors
    STATE['cleanupIndependentlyVerified'] = False
    save_state()


def private_worker_first_error(error, phase):
    # The caller has loaded an exact source-bound attempt. store/read_root retain the original root ownership, held-directory and no-replace rules.
    need(type(ACTIVE) is dict and type(STATE) is dict and ROOT == BASE / ACTIVE['attempt'] and STATE['attempt'] == ACTIVE['attempt'] and re.fullmatch(r'[a-f0-9]{32}', ACTIVE['attempt']), 'PG4_R33_FIRST_ERROR_CONTEXT_UNVERIFIED')
    fields = {};remaining = 65536
    try:message = str(error)
    except BaseException:message = None
    if type(message) is str:
        original = message[:65536].encode('utf-8', 'replace');saved = original[:16384];remaining -= len(saved)
        fields['message'] = {'encoding':'utf8-original-prefix-base64','base64':base64.b64encode(saved).decode(),'retainedBytes':len(saved),'truncated':len(message)>65536 or len(saved)!=len(original),'sha256':sha(saved)}
    frames=[]
    try:
        tb=object.__getattribute__(error,'__traceback__')
        while tb is not None and len(frames)<12:
            frames.append({'filename':tb.tb_frame.f_code.co_filename[:2048],'line':tb.tb_lineno,'function':tb.tb_frame.f_code.co_name[:256]});tb=tb.tb_next
    except BaseException:frames=[]
    frame_raw=compact(frames);saved=frame_raw[:min(32768,remaining)]
    fields['tracebackFrames']={'encoding':'utf8-original-frame-metadata-prefix-base64','base64':base64.b64encode(saved).decode(),'retainedBytes':len(saved),'truncated':len(saved)!=len(frame_raw),'sha256':sha(saved),'localsRetained':False,'sourceLinesRead':False}
    value={'schemaVersion':1,'kind':'r37-pg4-worker-private-first-error','protocol':PROTOCOL,'attempt':ACTIVE['attempt'],'phase':phase,'summary':error_frame(error,phase),'fields':fields,'maximumRetainedTextBytes':65536,'rawTextPubliclyExported':False}
    raw=compact(value)+b'\n';path=ROOT/'work'/'first-worker-error-r37.json'
    result=store(path,raw,0o600);need(read_root(path,131072)==raw,'PG4_R33_FIRST_ERROR_READBACK_CHANGED');return result


def remember_worker_failure(error, phase):
    frame=error_frame(error,phase)
    if STATE.get('firstFailure') is not None:
        STATE['secondaryFailures'].append(frame);return
    STATE['firstFailure']=frame
    try:
        STATE['firstFailure']['privateErrorRef']=private_worker_first_error(error,phase)
        STATE['firstFailure']['privateErrorRetentionVerified']=True
    except BaseException as retention:
        STATE['firstFailure']['privateErrorRetentionVerified']=False
        STATE['firstFailure']['privateErrorArtifactMayExist']=True
        STATE['secondaryFailures'].append(error_frame(retention,'first-error-retention'))


def safe_driver_failure(value):
    need(type(value) is dict and type(value.get('phase')) is str and re.fullmatch(r'[a-z0-9-]{1,80}',value['phase']), 'PG4_R33_DRIVER_SUMMARY_INVALID')
    classes={'Error','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','AggregateError','unknown'}
    need(value.get('errorClass') in classes and (value.get('errno') is None or type(value['errno']) is int and abs(value['errno'])<=4096), 'PG4_R33_DRIVER_SUMMARY_INVALID')
    node=value.get('nodeCode');need(node is None or type(node) is str and re.fullmatch(r'(?:E[A-Z0-9_]{1,64}|ERR_[A-Z0-9_]{1,64})',node),'PG4_R33_DRIVER_SUMMARY_INVALID')
    code=value.get('closedErrorCode');need(type(code) is str and re.fullmatch(r'R33_[A-Z0-9_]{1,120}',code),'PG4_R33_DRIVER_SUMMARY_INVALID')
    return {'phase':value['phase'],'errorCode':code,'exceptionClass':value['errorClass'],'errno':value.get('errno'),'nodeCode':node,'secondaryFailures':[]}


def structured_driver_result(raw, code):
    # This is the dedicated artifact, not diagnostic stdout. Its independent
    # immutable retention is a separate mandatory gate in the caller below.
    need(type(raw) is bytes and 0<len(raw)<=16*1024**2,'PG4_R33_DRIVER_RESULT_INVALID')
    value=json.loads(raw)
    need(type(value) is dict and value.get('protocol')==PROTOCOL and value.get('kind') in ('r33-pg4-qa-startup-driver-result','r33-pg4-qa-startup-driver-refusal') and value.get('diagnosticVersion')=='r37-first-error-retention-v1' and value.get('PG4Qualified') is False and value.get('productAccepted') is False,'PG4_R33_DRIVER_RESULT_INVALID')
    bound=value.get('attempt')==ACTIVE['attempt'] and value.get('sourceContractSHA256')==ACTIVE['sourceContractSHA256'] and value.get('driverSHA256')==ACTIVE['driverSHA256']
    unknown=value.get('kind')=='r33-pg4-qa-startup-driver-refusal' and all(value.get(k) is None for k in ('attempt','sourceContractSHA256','driverSHA256'))
    need(bound or unknown,'PG4_R33_DRIVER_RESULT_UNBOUND')
    complete=code==0 and bound and value.get('kind')=='r33-pg4-qa-startup-driver-result' and value.get('status')=='framework-finished' and value.get('preFixtureGateVerified') is True and value.get('frameworkExecuted') is True and value.get('fixtureLaunchAttempted') is True and value.get('startsAttempted')==1 and value.get('actualStartupObserved') is True and value.get('firstFailure') is None
    if not complete:
        summary=safe_driver_failure(value['firstFailure']) if value.get('firstFailure') is not None else {'phase':'driver-structured-result','errorCode':'PG4_R33_DRIVER_INCOMPLETE','exceptionClass':'OtherException','errno':None,'nodeCode':None,'secondaryFailures':[]}
        if STATE.get('firstFailure') is None:
            STATE['firstFailure']={**summary,'origin':'source-bound-driver','driverPrivateFailureRetainedReported':value.get('privateFailureRetained') is True,'privateDriverReport':None,'driverInputBindingVerified':bound}
        else:STATE['secondaryFailures'].append(summary)
    return value,complete


def run_driver_with_after_hooks():
    # Parse only the source-bound report. Preserve stdout/stderr as diagnostics.
    result=None
    try:
        code,raw,_,capture_ref=tool_exec('driver.mjs','/tools/driver-input.json','startup-and-four-cases',600)
        STATE['driver']={'status':code,'stdoutSHA256':sha(raw),'capture':capture_ref}
        artifact_raw,artifact_metadata=read_evidence('pg4-driver-result.json')
        result,complete=structured_driver_result(artifact_raw,code)
        save_state()
        retain_reports()
        rows=[r for r in STATE.get('reports',[]) if r.get('name')=='pg4-driver-result.json' and r.get('sourceWasReadTwice') is True and r.get('retainedOriginal') is not None]
        retained_path=ROOT/'work'/'retained-pg4-driver-result.json'
        expected_ref={'path':str(retained_path),'sha256':sha(artifact_raw),'bytes':len(artifact_raw)}
        matched=len(rows)==1 and rows[0].get('sourceMetadata')==artifact_metadata and rows[0].get('originalSHA256')==expected_ref['sha256'] and rows[0].get('originalBytes')==expected_ref['bytes'] and rows[0].get('retainedOriginal')==expected_ref
        need(matched,'PG4_R33_DRIVER_REPORT_RETENTION_UNCONFIRMED')
        report_retention_verified=read_root(retained_path,16*1024**2,True)==artifact_raw
        need(report_retention_verified,'PG4_R33_DRIVER_REPORT_RETENTION_UNCONFIRMED')
        if (STATE.get('firstFailure') or {}).get('origin')=='source-bound-driver':STATE['firstFailure']['privateDriverReport']=rows[0]['retainedOriginal']
        need(complete and report_retention_verified,'PG4_R33_DRIVER_INCOMPLETE')
    except BaseException as error:
        remember_worker_failure(error,'driver')
    finally:
        STATE['phase']='sql-after-hooks'
        try:save_state()
        except BaseException as error:remember_worker_failure(error,'driver-state-save')
        try:sql_phase('after-hooks',60)
        except BaseException as error:remember_worker_failure(error,'sql-after-hooks')
    return STATE.get('firstFailure') is None


def run(attempt):
    global STATE
    load(attempt)
    store(ROOT / 'work' / 'owner-started-once.json', compact({'protocol': PROTOCOL, 'attempt': attempt, 'pid': os.getpid(), 'maximumRuns': 1}) + b'\n')
    STATE = {'schemaVersion': 1, 'kind': 'r33-pg4-qa-startup-producer-state', 'protocol': PROTOCOL, 'attempt': attempt, 'status': 'running', 'owner': owner_identity(), 'resources': names(attempt), 'createdRoles': [], 'captures': [], 'sql': {}, 'cleanupFacts': [], 'cleanupFailures': [], 'phase': 'preflight', 'firstFailure': None, 'secondaryFailures': [], 'fixtureImportMayHaveOccurred': False, 'driverEntryAttempted': False, 'actualPG4Qualified': False, 'cleanupIndependentlyVerified': False, 'modelsInvoked': False}
    save_state()
    try:
        runtime_identity()
        image_label_witness('pre-create')
        fresh_protection(json.loads(read_root(ROOT / 'control' / 'protection.json')))
        pre_resource_absence()
        password = secrets.token_hex(24)
        database = 'jarvis_truth_pg4_r33'
        store(ROOT / 'control' / 'postgres.env', ('POSTGRES_DB=' + database + '\nPOSTGRES_USER=qa\nPOSTGRES_PASSWORD=' + password + '\n').encode())
        store(ROOT / 'control' / 'pg4-runner.env', ('R29_TEST_DATABASE_URL=postgres://qa:' + password + '@postgres:5432/' + database + '\nNODE_PATH=\n').encode())
        store(ROOT / 'tools' / 'pg4-db-url.txt', ('postgres://qa:' + password + '@postgres:5432/' + database).encode(), 0o444)
        label_args = [x for k, v in labels(attempt).items() for x in ('--label', k + '=' + v)]
        create_resource('internal-network', ['network', 'create', '--internal', '--driver', 'bridge', *label_args, names(attempt)['internal-network']])
        create_resource('postgres-data', ['volume', 'create', '--driver', 'local', *label_args, names(attempt)['postgres-data']])
        common = ['--network', names(attempt)['internal-network'], '--init', '--restart', 'no', '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--ipc', 'private', '--log-driver', 'json-file', '--log-opt', 'max-size=4m', '--log-opt', 'max-file=2', *label_args]
        create_resource('postgres', ['create', '--pull', 'never', '--name', names(attempt)['postgres'], *common, '--network-alias', 'postgres', '--workdir', '/', '--memory', '768m', '--cpus', '1', '--pids-limit', '128', *[x for c in ('CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETUID', 'SETGID') for x in ('--cap-add', c)], '--env-file', str(ROOT / 'control' / 'postgres.env'), '--mount', 'type=volume,src=' + names(attempt)['postgres-data'] + ',dst=/var/lib/postgresql/data', IMAGES['postgres']])
        mounts = [x for source, dest, writable in mount_expectations() for x in ('--mount', 'type=bind,src=' + source + ',dst=' + dest + ('' if writable else ',readonly'))]
        create_resource('pg4-runner', ['create', '--pull', 'never', '--name', names(attempt)['pg4-runner'], *common, '--user', '1000:1000', '--workdir', '/work/source/apps/server', '--read-only', '--memory', '4g', '--cpus', '2', '--pids-limit', '256', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m', '--env-file', str(ROOT / 'control' / 'pg4-runner.env'), *mounts, '--entrypoint', '/bin/sleep', IMAGES['runner'], '900'])
        image_label_witness('post-create')
        for role in ('postgres', 'pg4-runner'):
            code, _, _, _ = docker(['start', names(attempt)[role]], 'start-' + role)
            need(code == 0, 'PG4_R33_CONTAINER_START_FAILED')
        STATE['phase'] = 'postgres-native-readiness'
        save_state()
        wait_postgres_ready()
        STATE['phase'] = 'same-batch-native-node-byte-stat'
        save_state()
        measure_node_image_bytes()
        STATE['phase'] = 'sql-bootstrap'
        save_state()
        sql_phase('bootstrap', 240)
        STATE['phase'] = 'pre-fixture-admission'
        save_state()
        pre_fixture_admission()
        STATE['phase'] = 'driver'
        STATE['driverEntryAttempted'] = True
        STATE['fixtureImportMayHaveOccurred'] = None  # Only source-bound driver stage facts can refine this.
        save_state()
        driver_complete = run_driver_with_after_hooks()
        STATE['status'] = 'completed-unqualified' if driver_complete else 'failed'
    except BaseException as error:
        remember_worker_failure(error, STATE['phase'])
        STATE['status'] = 'failed'
    finally:
        ACTIVE['deadline'] = time.monotonic() + 100
        try:
            retain_optional_physical_error()
        except BaseException as error:
            STATE['secondaryFailures'].append(error_frame(error, 'optional-physical-error-retention-outer'))
            try:
                save_state()
            except BaseException as saving:
                STATE['secondaryFailures'].append(error_frame(saving, 'optional-physical-error-outer-state-save'))
        if STATE.get('driverEntryAttempted') and 'reports' not in STATE:
            try:
                retain_reports()
            except BaseException as error:
                STATE['secondaryFailures'].append(error_frame(error, 'report-retention-outer'))
        try:
            cleanup_owned()
        except BaseException as error:
            STATE['secondaryFailures'].append(error_frame(error, 'cleanup-outer'))
            try:save_state()
            except BaseException as saving:STATE['secondaryFailures'].append(error_frame(saving,'cleanup-final-state-save'))
    return 0 if STATE['status'] == 'completed-unqualified' else 1


def stop(attempt):
    global STATE
    load(attempt)
    STATE = json.loads(read_root(ROOT / 'state.json')) if os.path.lexists(ROOT / 'state.json') else {'schemaVersion': 1, 'kind': 'r33-pg4-qa-startup-producer-state', 'protocol': PROTOCOL, 'attempt': attempt, 'status': 'failed', 'phase': 'owner-bootstrap-unknown', 'owner': None, 'createdRoles': [], 'captures': [], 'cleanupFacts': [], 'cleanupFailures': [], 'firstFailure': None, 'secondaryFailures': [], 'actualPG4Qualified': False, 'cleanupIndependentlyVerified': False, 'modelsInvoked': False}
    ACTIVE['deadline'] = time.monotonic() + 100
    cleanup_owned()
    store(ROOT / 'work' / 'stopped.json', compact({'schemaVersion': 1, 'kind': 'r33-pg4-qa-startup-stopped', 'protocol': PROTOCOL, 'attempt': attempt, 'stopIdentity': owner_identity(), 'cleanupIndependentlyVerified': False}) + b'\n')


def parse_properties(raw):
    rows = {}
    for line in raw.decode('utf-8', 'strict').splitlines():
        need('=' in line, 'PG4_R33_UNIT_PROPERTIES_INVALID')
        k, v = line.split('=', 1)
        need(k not in rows, 'PG4_R33_UNIT_PROPERTY_DUPLICATE')
        rows[k] = v
    return rows


def argv_of(value):
    need(type(value) is str and len(value) <= 20000 and value.startswith('{ ') and value.endswith(' }') and value.count('{') == value.count('}') == 1, 'PG4_R33_UNIT_COMMAND_UNKNOWN')
    pairs = []
    for part in value[2:-2].split(';'):
        part = part.strip()
        if not part:
            continue
        need('=' in part, 'PG4_R33_UNIT_COMMAND_UNKNOWN')
        pairs.append(part.split('=', 1))
    values = dict(pairs)
    need(len(values) == len(pairs) and set(values) <= {'path', 'argv[]', 'ignore_errors', 'start_time', 'stop_time', 'pid', 'code', 'status'} and {'path', 'argv[]', 'ignore_errors'} <= set(values) and values['path'] == '/usr/bin/python3' and values['ignore_errors'] == 'no', 'PG4_R33_UNIT_COMMAND_UNKNOWN')
    return values['argv[]'].split()


def unit_property_scope(value, unit, read_only=False):
    fields = ('Id', 'InvocationID', 'LoadState', 'ActiveState', 'SubState', 'MainPID', 'ControlGroup', 'RuntimeMaxUSec', 'TimeoutStopUSec', 'KillMode', 'Restart', 'NoNewPrivileges', 'User', 'Group', 'ExecStart', 'ExecStopPost', 'PrivateTmp', 'UMask')
    need(isinstance(value, dict) and all(type(v) is str for v in value.values()) and value.get('Id') == unit, 'PG4_R33_UNIT_SCOPE_CHANGED')
    if value.get('LoadState') == 'not-found':
        need(read_only is True and set(value) == set(fields) - {'ExecStart', 'ExecStopPost'} and value['MainPID'] == '0' and value['ActiveState'] == 'inactive' and value['SubState'] == 'dead' and value['ControlGroup'] == '' and value['InvocationID'] == '', 'PG4_R33_UNIT_NOT_FOUND_UNKNOWN')
    else:
        need(set(value) == set(fields), 'PG4_R33_UNIT_SCOPE_CHANGED')
    return value


def unit_properties(unit, read_only=False):
    fields = ('Id', 'InvocationID', 'LoadState', 'ActiveState', 'SubState', 'MainPID', 'ControlGroup', 'RuntimeMaxUSec', 'TimeoutStopUSec', 'KillMode', 'Restart', 'NoNewPrivileges', 'User', 'Group', 'ExecStart', 'ExecStopPost', 'PrivateTmp', 'UMask')
    code, raw, _, _ = capture(['/usr/bin/systemctl', 'show', unit, *['--property=' + k for k in fields]], 'unit-show', 15)
    need(code == 0, 'PG4_R33_UNIT_SHOW_FAILED')
    return unit_property_scope(parse_properties(raw), unit, read_only)


def terminal_original_records():
    # Hash/size only; private environment/URL contents stay in Root-held files.
    rows = {}
    def record_file(path, limit, immutable):
        with descriptor(held_dir(path.parent)) as fd:
            before = os.stat(path.name, dir_fd=fd, follow_symlinks=False)
            first = read_root(path, limit, immutable)
            second = read_root(path, limit, immutable)
            need(first == second and key(before) == key(os.stat(path.name, dir_fd=fd, follow_symlinks=False)), 'PG4_R33_TERMINAL_RECORD_CHANGED')
        return first
    for name in ('once.json', 'state.json'):
        raw = record_file(ROOT / name, 64 * 1024**2, name == 'once.json')
        rows[name] = {'sha256': sha(raw), 'bytes': len(raw)}
    def walk(path, prefix, depth=0):
        need(depth <= 8 and len(rows) <= 512, 'PG4_R33_TERMINAL_RECORD_LIMIT')
        with descriptor(held_dir(path)) as fd:
            before = os.fstat(fd)
            names_ = sorted(os.listdir(fd))
            for name in names_:
                need(re.fullmatch('[A-Za-z0-9._-]+', name) is not None, 'PG4_R33_TERMINAL_RECORD_NAME')
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                rel = prefix + name
                if stat.S_ISDIR(info.st_mode):
                    walk(path / name, rel + '/', depth + 1)
                else:
                    need(stat.S_ISREG(info.st_mode) and info.st_uid == info.st_gid == 0 and info.st_nlink == 1, 'PG4_R33_TERMINAL_RECORD_UNTRUSTED')
                    receipt = rel.startswith('work/') or rel in ('control/postgres.env', 'control/pg4-runner.env')
                    raw = record_file(path / name, 128 * 1024**2, not receipt)
                    rows[rel] = {'sha256': sha(raw), 'bytes': len(raw)}
                    need(len(rows) <= 512, 'PG4_R33_TERMINAL_RECORD_LIMIT')
            need(names_ == sorted(os.listdir(fd)) and key(before) == key(os.fstat(fd)), 'PG4_R33_TERMINAL_RECORD_DIRECTORY_CHANGED')
    for folder in ('control', 'tools', 'work'):
        walk(ROOT / folder, folder + '/')
    state = json.loads(read_root(ROOT / 'state.json'))
    optional = state.get('optionalPhysicalError')
    present = optional_physical_error_present()
    if present:
        need(isinstance(optional, dict) and optional.get('status') == 'retained' and optional.get('presenceObservationComplete') is True and optional.get('sourceWasReadTwice') is True, 'PG4_R33_OPTIONAL_ERROR_HISTORY_UNKNOWN')
        raw, metadata = read_evidence('pg4-physical-admission-error.json', 8 * 1024**2)
        pin = {'sha256': sha(raw), 'bytes': len(raw)}
        need(stat.S_IMODE(metadata[4]) == 0o600 and metadata == optional['sourceMetadata'] and pin == {'sha256': optional['originalSHA256'], 'bytes': optional['originalBytes']} and rows.get('work/retained-pg4-physical-admission-error.json') == pin, 'PG4_R33_OPTIONAL_ERROR_ORIGINAL_CHANGED')
        rows['evidence/pg4-physical-admission-error.json'] = pin
    else:
        need(isinstance(optional, dict) and optional.get('status') == 'absent' and optional.get('presenceObservationComplete') is True and optional.get('retainedOriginal') is None and 'work/retained-pg4-physical-admission-error.json' not in rows, 'PG4_R33_OPTIONAL_ERROR_HISTORY_UNKNOWN')
    return rows


def host_request(payload, worker_raw):
    """Trusted source installation and one unit dispatch; check never relaunches."""
    global ROOT, ACTIVE, STATE
    need(os.geteuid() == 0 and sys.flags.isolated == 1 and set(payload) == {'action', 'protocol', 'attempt', 'workerSHA256', 'starterSHA256', 'sourceContractSHA256', 'driverSHA256', 'controls', 'tools', 'admissionFiles'} and payload['protocol'] == PROTOCOL and payload['action'] in ('start', 'check'), 'PG4_R33_HOST_REQUEST_INVALID')
    need(sha(worker_raw) == payload['workerSHA256'], 'PG4_R33_HOST_WORKER_CHANGED')
    attempt = payload['attempt']
    names(attempt)
    ROOT = BASE / attempt
    STATE = None
    if payload['action'] == 'start':
        need(not os.path.lexists(ROOT), 'PG4_R33_ONCE_ALREADY_EXISTS_USE_CHECK')
        if not os.path.lexists(BASE):
            make_dir(BASE, 0o711)
        else:
            with descriptor(held_dir(BASE)) as fd:
                need(stat.S_IMODE(os.fstat(fd).st_mode) == 0o711, 'PG4_R33_BASE_MODE_CHANGED')
        make_dir(ROOT, 0o711)
        for folder, mode in (('control', 0o555), ('tools', 0o555), ('work', 0o700)):
            make_dir(ROOT / folder, mode)
        make_dir(ROOT / 'tools' / 'admission', 0o555)
        make_dir(ROOT / 'tools' / 'meta', 0o555)
        make_dir(ROOT / 'evidence', 0o700)
        with descriptor(held_dir(ROOT)) as fd:
            evidence = os.open('evidence', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            with descriptor(evidence):
                os.fchown(evidence, 1000, 1000)
                os.fchmod(evidence, 0o700)
                os.fsync(evidence)
            os.fsync(fd)
        need(set(payload['controls']) == set(CONTROL) and set(payload['tools']) == set(TOOLS), 'PG4_R33_HOST_BUNDLE_KEYS_CHANGED')
        pins, tool_pins = {}, {}
        for folder, mapping, output in (('control', payload['controls'], pins), ('tools', payload['tools'], tool_pins)):
            for name, item in mapping.items():
                need(set(item) == {'sha256', 'base64'} and H.fullmatch(item['sha256']), 'PG4_R33_BUNDLE_FIELD_INVALID')
                raw = base64.b64decode(item['base64'], validate=True)
                need(len(raw) <= 64 * 1024**2 and sha(raw) == item['sha256'], 'PG4_R33_BUNDLE_BYTES_CHANGED')
                store(ROOT / folder / name, raw, 0o444)
                output[name] = sha(raw)
        required = {'sourceContract', 'sourceReview', 'runtimeQualification', 'freshProtection', 'priorScopeAdmission', 'issuerReview', 'sourceAdmission', 'entryReview'}
        need(required == set(payload['admissionFiles']), 'PG4_R33_ADMISSION_FILE_SET_CHANGED')
        for name, item in payload['admissionFiles'].items():
            raw = base64.b64decode(item['base64'], validate=True)
            need(len(raw) <= 64 * 1024**2 and sha(raw) == item['sha256'], 'PG4_R33_ADMISSION_BYTES_CHANGED')
            store(ROOT / 'tools' / 'admission' / (name + '.json'), raw, 0o444)
        admission = json.loads(read_root(ROOT / 'tools' / 'admission' / 'sourceAdmission.json', 64 * 1024**2, True))
        need(admission.get('phase') == 'A' and admission.get('attempt') is None and admission.get('sourceContractSHA256') == payload['sourceContractSHA256'] and admission.get('workerSHA256') == payload['workerSHA256'] and admission.get('driverSHA256') == payload['driverSHA256'] and admission.get('sourceBytesAdmitted') is True and admission.get('overlayInstalled') is False, 'PG4_R33_STAGED_SOURCE_PHASE_A_CHANGED')
        need(set(admission['witnessBytes']) == {'runtimeWitness', 'sourceWitness', 'overlayVirtualWitness', 'pgRuntimeWitness'}, 'PG4_R33_SOURCE_WITNESS_SET_CHANGED')
        for role, item in admission['witnessBytes'].items():
            need(set(item) == {'sha256', 'bytes', 'base64'}, 'PG4_R33_SOURCE_WITNESS_FIELDS_CHANGED')
            raw = base64.b64decode(item['base64'], validate=True)
            need(len(raw) == item['bytes'] and len(raw) <= 8 * 1024**2 and sha(raw) == item['sha256'] and base64.b64encode(raw).decode() == item['base64'], 'PG4_R33_SOURCE_WITNESS_RAW_CHANGED')
            store(ROOT / 'tools' / 'admission' / (role + '.json'), raw, 0o444)
        store(ROOT / 'tools' / 'admission' / 'issuerSource.mjs', base64.b64decode(payload['tools']['physical-admission.mjs']['base64'], validate=True), 0o444)
        request = json.loads(base64.b64decode(payload['controls']['sql-bootstrap-request.json']['base64'], validate=True))
        for field, role, file in (('sourceAdmissionRef', 'sourceAdmission', 'sourceAdmission.json'), ('sourceFamilyReviewRef', 'sourceReview', 'sourceFamilyReview.json'), ('entryReviewRef', 'entryReview', 'entryReview.json')):
            expected = request['runtimeWitness'][field]
            item = payload['admissionFiles'].get(role)
            need(expected.get('path') == '/tools/meta/' + file and item is not None and item['sha256'] == expected.get('sha256'), 'PG4_R33_SQL_META_BINDING_MISSING')
            store(ROOT / 'tools' / 'meta' / file, base64.b64decode(item['base64'], validate=True), 0o444)
        store(ROOT / 'control' / 'worker.py', worker_raw, 0o444)
        activation = {'schemaVersion': 1, 'kind': 'r33-pg4-qa-startup-activation', 'protocol': PROTOCOL, 'attempt': attempt, 'sourceContractSHA256': payload['sourceContractSHA256'], 'workerSHA256': payload['workerSHA256'], 'starterSHA256': payload['starterSHA256'], 'driverSHA256': payload['driverSHA256'], 'controlPins': pins, 'toolPins': tool_pins, 'images': IMAGES, 'source': {'fingerprint': EFFECTIVE_SOURCE, 'files': 625, 'bytes': 18413597, 'fixtureSHA256': FIXTURE_SHA}}
        store(ROOT / 'control' / 'activation.json', compact(activation) + b'\n', 0o444)
        store(ROOT / 'once.json', compact({'schemaVersion': 1, 'kind': 'r33-pg4-qa-startup-unit-once', 'protocol': PROTOCOL, 'attempt': attempt, 'workerSHA256': payload['workerSHA256'], 'sourceContractSHA256': payload['sourceContractSHA256'], 'automaticRetry': False}) + b'\n', 0o444)
        load(attempt)
        runtime_identity()
        fresh_protection(json.loads(read_root(ROOT / 'control' / 'protection.json')))
        command = ['/usr/bin/systemd-run', '--unit=jarvis-pg4-qa-r37-context-sentinel-main607-' + attempt + '.service', '--collect', '--property=User=root', '--property=Group=root', '--property=RuntimeMaxSec=900', '--property=TimeoutStopSec=120', '--property=KillMode=control-group', '--property=Restart=no', '--property=NoNewPrivileges=yes', '--property=PrivateTmp=yes', '--property=UMask=0077', '--property=ExecStopPost=/usr/bin/python3 -I ' + str(ROOT / 'control' / 'worker.py') + ' --stop ' + attempt, '/usr/bin/python3', '-I', str(ROOT / 'control' / 'worker.py'), '--run', attempt]
        store(ROOT / 'work' / 'unit-dispatch-intent.json', compact({'commandSHA256': sha(compact(command)), 'submittedCommand': command, 'noJavaScriptExecutedByRoot': True}) + b'\n')
        code, _, _, _ = capture(command, 'systemd-run', 15)
        need(code == 0, 'PG4_R33_UNIT_START_UNCERTAIN_USE_CHECK')
    else:
        need(read_root(ROOT / 'control' / 'worker.py', 160000, True) == worker_raw, 'PG4_R33_CHECK_WORKER_CHANGED')
        load(attempt)
        need(ACTIVE['sourceContractSHA256'] == payload['sourceContractSHA256'] and ACTIVE['starterSHA256'] == payload['starterSHA256'] and ACTIVE['driverSHA256'] == payload['driverSHA256'], 'PG4_R33_CHECK_SOURCE_CONTEXT_CHANGED')
    unit = 'jarvis-pg4-qa-r37-context-sentinel-main607-' + attempt + '.service'
    props = unit_properties(unit, payload['action'] == 'check')
    if props['LoadState'] == 'loaded':
        need(props['RuntimeMaxUSec'] == '15min' and props['TimeoutStopUSec'] == '2min' and props['KillMode'] == 'control-group' and props['Restart'] == 'no' and props['NoNewPrivileges'] == 'yes' and props['User'] in ('root', '0') and props['Group'] in ('root', '0') and props['PrivateTmp'] == 'yes' and props['UMask'] == '0077', 'PG4_R33_ACTUAL_UNIT_PROFILE_CHANGED')
        need(argv_of(props['ExecStart']) == ['/usr/bin/python3', '-I', str(ROOT / 'control' / 'worker.py'), '--run', attempt] and argv_of(props['ExecStopPost']) == ['/usr/bin/python3', '-I', str(ROOT / 'control' / 'worker.py'), '--stop', attempt], 'PG4_R33_ACTUAL_UNIT_COMMAND_CHANGED')
    elif props['LoadState'] == 'not-found':
        need(payload['action'] == 'check' and props['MainPID'] == '0' and props['ActiveState'] == 'inactive', 'PG4_R33_UNIT_NOT_FOUND_UNKNOWN')
    else:
        raise RuntimeError('PG4_R33_UNIT_LOAD_STATE_UNKNOWN')
    proof_path = ROOT / 'work' / ('unit-start-proof.json' if payload['action'] == 'start' else 'unit-check-proof.json')
    store(proof_path, compact({'schemaVersion': 1, 'kind': 'r33-pg4-unit-producer-properties', 'protocol': PROTOCOL, 'attempt': attempt, 'properties': props, 'independentLifecycleQualification': False}) + b'\n')
    state_raw = read_root(ROOT / 'state.json') if os.path.lexists(ROOT / 'state.json') else None
    frame = json.loads(state_raw) if state_raw else None
    records = terminal_original_records() if payload['action'] == 'check' and frame and frame.get('status') in ('failed', 'completed-unqualified') and props['MainPID'] == '0' else None
    if records is not None:
        need(records['state.json']['sha256'] == sha(state_raw), 'PG4_R33_TERMINAL_STATE_CHANGED')
    stopped_raw = read_root(ROOT / 'work' / 'stopped.json') if os.path.lexists(ROOT / 'work' / 'stopped.json') else None
    stopped = json.loads(stopped_raw) if stopped_raw else None
    return {'schemaVersion': 1, 'kind': 'r33-pg4-qa-startup-parent-observation', 'protocol': PROTOCOL, 'attempt': attempt, 'readOnly': payload['action'] == 'check', 'workerSHA256': payload['workerSHA256'], 'starterSHA256': payload['starterSHA256'], 'driverSHA256': payload['driverSHA256'], 'sourceContractSHA256': payload['sourceContractSHA256'], 'status': frame.get('status') if frame else 'owner-state-unknown', 'owner': frame.get('owner') if frame else None, 'stopIdentity': stopped.get('stopIdentity') if stopped else None, 'originalRecords': records, 'originalRecordsDomain': 'Root-read-hash-and-size-only-no-file-bytes-exported', 'unitProperties': props, 'resources': names(attempt), 'stateSHA256': sha(state_raw) if state_raw else None, 'firstFailure': frame.get('firstFailure') if frame else None, 'actualPG4Qualified': False, 'cleanupIndependentlyVerified': False, 'modelsInvoked': False}


if __name__ == '__main__':
    # No implicit/default execution, package import, environment read or nonce creation.
    need(len(sys.argv) == 3 and sys.argv[1] in ('--run', '--stop'), 'PG4_R33_EXPLICIT_WORKER_ACTION_REQUIRED')
    if sys.argv[1] == '--run':
        sys.exit(run(sys.argv[2]))
    stop(sys.argv[2])
