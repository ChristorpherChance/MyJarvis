#!/usr/bin/python3
"""Finite root-owned FA01 isolation, package installation, evidence and cleanup.

Only approved local images, a fixed independent workspace, UID1000 candidate
commands and run-specific private resources. Never a general Docker/shell API.
"""
import hashlib
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid

WORKSPACE = '/home/superopen/All-Projects/msf-jarvis-autonomy-r22'
ROOT = Path('/var/lib/jarvis-development/101/autonomy-evidence')
TOOLS = Path('/opt/jarvis-development/software-factory')
HELPER = TOOLS / 'project-autonomy-evidence.py'
COLLECTOR = TOOLS / 'project-autonomy-fa01-collector.mjs'
BROWSER = TOOLS / 'project-autonomy-fa01-browser.mjs'
BASELINE = Path('/etc/jarvis-development/project-autonomy/baseline.json')
PHASE_CONTRACT = TOOLS / 'factory-autonomy-phase-contract.py'
BROKER_CONTROL = TOOLS / 'factory-sandbox-broker-control.py'
BROKER_ROOT = Path('/var/lib/jarvis-development/101/full-validation')
DOCKER = '/usr/bin/docker'
IMAGES = {'node': 'jarvis-msf-test:20261010-r2', 'postgres': 'postgres:16',
          'redis': 'redis:7', 'minio': 'quay.io/minio/minio'}
REQUIRED = ['source-stability', 'build', 'typecheck', 'tests', 'package',
            'isolated-health', 'frontend', 'write-readback']
PHASE_IDS = {
    'FA-02': ['fa02-input-contract', 'fa02-doc-history', 'fa02-trace-design-context'],
    'FA-03': ['fa03-definition-model-context', 'fa03-session-tools-usage', 'fa03-template-versions'],
    'FA-04': ['fa04-delegation-execution', 'fa04-transaction-isolation', 'fa04-pause-recovery'],
    'FA-05': ['fa05-plan-build-ui', 'fa05-independent-tests-defects', 'fa05-reports-release-safety', 'fa05-performance-data-pages'],
    'FA-06': ['fa06-candidate-evaluation', 'fa06-promotion-skill'],
    'FA-07': ['fa07-policy-workflow', 'fa07-invalidation-controls', 'fa07-progress-notifications'],
    'FA-08': ['fa08-bundle-export-download', 'fa08-install-use-recovery'],
    'FA-09': ['fa09-e2e-autonomous', 'fa09-exceptions-observation', 'fa09-reuse-records']
}
MAX_PACKAGE = 512 * 1024 * 1024
PREREQUISITE_NAMES = {'provider', 'native-execution', 'native-recovery', 'ui-comparison', 'regression', 'performance-data',
                      'agent-evaluation', 'agent-promotion', 'jarvis-workflow', 'workflow-controls', 'customer-installation',
                      'e2e', 'long-observation', 'reuse-records'}
PREREQUISITE_REASONS = {'FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING', 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING',
                        'FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING', 'CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING',
                        'LONG_OBSERVATION_IN_PROGRESS', 'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING'}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def prerequisite_wait_metadata(value, evidence, run_id, attempt, fingerprint, work_package, goal_hash, checks, errors, stable, now=None):
    """Preserve actual observer bytes only for a proved resource-only wait.

    A product failure, signal/nonzero collector, missing required check, cleanup
    fault, changed source or incomplete mapping is never hidden by pending root
    receipts. The caller embeds this only in its signed fixed report.
    """
    if not value or not stable or not checks or any(v.get('status') not in ('pass', 'unknown') or not v.get('executed') for v in checks):
        return {}
    if any(v.get('errorCode') != 'TRUSTED_PREREQUISITE_RECEIPT_MISSING' for v in errors):
        return {}
    missing = {v['id'] for v in checks if v.get('status') == 'unknown'}
    if not missing:
        return {}
    for row in checks:
        counts = row.get('tests')
        if counts and (counts.get('failed', 0) or counts.get('skipped', 0)):
            return {}
        if row.get('status') == 'pass' and row.get('exitCode') != 0:
            return {}
    bindings = value.get('waitingPrerequisites')
    need(isinstance(bindings, list) and 0 < len(bindings) <= 100, 'PREREQUISITE_CHECK_MAPPING_INVALID')
    clean, seen = [], set()
    for item in bindings:
        need(isinstance(item, dict) and item.get('id') in PREREQUISITE_NAMES and item.get('checkId') in missing and
             item.get('errorCode') == 'TRUSTED_PREREQUISITE_RECEIPT_MISSING' and item.get('sourceFingerprint') == fingerprint and
             item.get('goalSpecHash') == goal_hash and item.get('workPackage') == work_package,
             'PREREQUISITE_CHECK_MAPPING_INVALID')
        objective_ids = item.get('objectiveIds')
        need(isinstance(objective_ids, list) and 0 < len(objective_ids) <= 100 and len(set(objective_ids)) == len(objective_ids) and
             all(isinstance(v, str) and re.fullmatch('[A-Za-z0-9_-]{1,200}', v) for v in objective_ids), 'PREREQUISITE_OBJECTIVE_MAPPING_INVALID')
        key = (item['id'], item['checkId'])
        need(key not in seen, 'PREREQUISITE_CHECK_MAPPING_DUPLICATE')
        seen.add(key)
        clean.append({'id': item['id'], 'checkId': item['checkId'], 'objectiveIds': objective_ids, 'errorCode': item['errorCode']})
    need({v['checkId'] for v in clean} == missing, 'PREREQUISITE_CHECK_MAPPING_INCOMPLETE')
    path = Path(evidence) / 'prerequisite-status.json'
    trusted(path, private=True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= 256 * 1024, 'PREREQUISITE_STATUS_FILE_INVALID')
        body = stream.read(256 * 1024 + 1)
    text = body.decode('utf-8')
    metadata = json.loads(text)
    declared = value.get('observerExport', {})
    need(declared.get('status') == 'waiting' and declared.get('sha256') == hashlib.sha256(body).hexdigest() and declared.get('bytes') == len(body), 'PREREQUISITE_STATUS_BYTES_MISMATCH')
    identity = {'runId': run_id, 'attempt': attempt, 'sourceFingerprint': fingerprint, 'goalSpecHash': goal_hash, 'workPackage': work_package}
    need(metadata.get('schemaVersion') == 1 and metadata.get('kind') == 'project-autonomy-prerequisite-status' and
         metadata.get('simulated') is False and metadata.get('observationsAreAcceptance') is False and
         all(metadata.get(k) == v for k, v in identity.items()), 'PREREQUISITE_STATUS_IDENTITY_MISMATCH')
    observed = datetime.fromisoformat(str(metadata.get('observedAt')).replace('Z', '+00:00'))
    clock = now or datetime.now(timezone.utc)
    need(observed.tzinfo is not None and 0 <= (clock - observed).total_seconds() <= 180, 'PREREQUISITE_STATUS_NOT_FRESH')
    waiting = metadata.get('waiting')
    need(isinstance(waiting, list) and 0 < len(waiting) <= 14 and len({v.get('id') for v in waiting}) == len(waiting), 'PREREQUISITE_WAITING_DENOMINATOR_INVALID')
    for item in waiting:
        need(item.get('id') in PREREQUISITE_NAMES and item.get('reasonCode') in PREREQUISITE_REASONS, 'PREREQUISITE_STATUS_REASON_INVALID')
        if item['id'] == 'long-observation':
            need(type(item.get('actualObservedSeconds')) in (int, float) and 0 <= item['actualObservedSeconds'] <= 259200 and item.get('requiredSeconds') == 259200, 'PREREQUISITE_STATUS_DURATION_INVALID')
    need({v['id'] for v in clean} <= {v['id'] for v in waiting}, 'PREREQUISITE_STATUS_RECEIPT_MAPPING_MISSING')
    # Keep the original observer file unchanged/private. This new fixed root
    # producer binds ONLY missing receipts for actual unknown checks in this
    # phase; an unrelated 72h prerequisite must not delay a provider check.
    active_names = {v['id'] for v in clean}
    active = []
    for item in waiting:
        if item['id'] in active_names:
            row = {'id': item['id'], 'reasonCode': item['reasonCode']}
            if item['id'] == 'long-observation':
                row.update({'actualObservedSeconds': int(item['actualObservedSeconds']), 'requiredSeconds': 259200})
            active.append(row)
    bound = {'schemaVersion': 1, 'kind': 'project-autonomy-prerequisite-status', 'simulated': False,
             **identity, 'waiting': active, 'observedAt': metadata['observedAt'], 'nextCheckSeconds': 60,
             'observationsAreAcceptance': False}
    bound_text = json.dumps(bound, sort_keys=True, ensure_ascii=True, separators=(',', ':'))
    bound_bytes = bound_text.encode('utf-8')
    fd = os.open(Path(evidence) / 'prerequisite-bound-status.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(bound_bytes)
        stream.flush()
        os.fsync(stream.fileno())
    return {'prerequisiteWaitEligible': True, 'prerequisiteStatusJson': bound_text,
            'prerequisiteStatusSha256': hashlib.sha256(bound_bytes).hexdigest(), 'waitingPrerequisites': clean}
RUN_RE = r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'


def need(value, code):
    if not value:
        raise ValueError(code)


def code(exc):
    return str(exc) if isinstance(exc, ValueError) and re.fullmatch('[A-Z][A-Z_0-9]+', str(exc)) else 'FA01_ISOLATION_FAILED'


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for body in iter(lambda: stream.read(65536), b''):
            h.update(body)
    return h.hexdigest()


def trusted(path, private=False):
    p = Path(path)
    for item in [p, *p.parents]:
        info = item.lstat()
        need(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
             'FA01_TRUST_BOUNDARY_INVALID')
        if item == p and private:
            need(not info.st_mode & 0o077, 'FA01_PRIVATE_DIRECTORY_REQUIRED')


def write_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, ensure_ascii=True, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def load_helper():
    trusted(HELPER)
    spec = importlib.util.spec_from_file_location('autonomy_secure_evidence', HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_archive(path, destination=None):
    """Validate every real header and required bytes before extraction.

    Python's data filter additionally checks resolution through archive links;
    the destination is a new private directory, never a production path.
    """
    need(Path(path).stat().st_size <= MAX_PACKAGE, 'PACKAGE_COMPRESSED_LIMIT')
    entries, total, names, members, links = [], 0, set(), {}, []
    with tarfile.open(path, 'r:gz') as archive:
        for item in archive:
            p = PurePosixPath(item.name)
            name = str(p)
            need(not p.is_absolute() and '..' not in p.parts and not re.search(r'[\x00-\x1f\x7f]', name), 'PACKAGE_PATH_INVALID')
            need(name not in names and (item.isfile() or item.isdir() or item.issym() or item.islnk()), 'PACKAGE_ENTRY_INVALID')
            names.add(name)
            members[name] = item
            total += item.size
            need(len(names) <= 100000 and total <= 2 * 1024 * 1024 * 1024, 'PACKAGE_EXPANSION_LIMIT')
            if item.issym() or item.islnk():
                link = PurePosixPath(item.linkname)
                need(not link.is_absolute() and not re.search(r'[\x00-\x1f\x7f]', item.linkname), 'PACKAGE_LINK_INVALID')
                components = list(p.parent.parts if item.issym() else [])
                for part in link.parts:
                    if part == '..':
                        need(components, 'PACKAGE_LINK_OUTSIDE_ROOT')
                        components.pop()
                    elif part != '.':
                        components.append(part)
                links.append({'path': name, 'linktext': item.linkname,
                              'kind': 'symlink' if item.issym() else 'hardlink',
                              'lexicalTarget': '/'.join(components)})
            entries.append({'path': name, 'bytes': item.size, 'type': item.type.decode('ascii', 'replace')})
        required = ['apps/server/dist/main.js', 'apps/web/dist/index.html', 'packages/shared/dist/index.js',
                    'packages/shared/dist/esm/index.js', 'pnpm-lock.yaml', 'package.json', 'jarvis-package-manifest.json']
        need(all(v in names for v in required) and 'node_modules/.pnpm' in names, 'PACKAGE_COMPONENT_MISSING')
        need(any(v.startswith('apps/server/src/db/migrations/') and v.endswith('.sql') for v in names), 'PACKAGE_MIGRATIONS_MISSING')
        need(members['jarvis-package-manifest.json'].isfile(), 'PACKAGE_MANIFEST_INVALID')
        manifest = json.load(archive.extractfile(members['jarvis-package-manifest.json']))
        for item in manifest.get('files', []):
            need(item.get('path') in names and re.fullmatch('[a-f0-9]{64}', str(item.get('sha256', ''))), 'PACKAGE_MANIFEST_INVALID')
            need(members[item['path']].isfile(), 'PACKAGE_MANIFEST_INVALID')
            body = archive.extractfile(members[item['path']]).read()
            need(hashlib.sha256(body).hexdigest() == item['sha256'] and len(body) == item['bytes'], 'PACKAGE_MANIFEST_BYTES_MISMATCH')
        need({v['path'] for v in manifest.get('files', [])} == set(required) - {'jarvis-package-manifest.json'}, 'PACKAGE_MANIFEST_INCOMPLETE')
        if destination is not None:
            dest = Path(destination)
            need(not dest.exists(), 'PACKAGE_INSTALL_DESTINATION_EXISTS')
            dest.mkdir(mode=0o700)
            archive.extractall(dest, filter='data')
            for item in links:
                # Only dependencies extracted from this verified archive may
                # retain links; source/snapshot permission preparation is strict.
                need('node_modules' in PurePosixPath(item['path']).parts, 'PACKAGE_SOURCE_LINK_NOT_ALLOWED')
                path = dest / item['path']
                info = path.lstat()
                if item['kind'] == 'symlink':
                    need(stat.S_ISLNK(info.st_mode) and os.readlink(path) == item['linktext'], 'PACKAGE_LINK_CHANGED')
                else:
                    target = (dest / item['lexicalTarget']).stat()
                    need(stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == (target.st_dev, target.st_ino), 'PACKAGE_LINK_CHANGED')
                resolved = (path if item['kind'] == 'symlink' else dest / item['lexicalTarget']).resolve()
                need(resolved.is_relative_to(dest.resolve()), 'PACKAGE_LINK_OUTSIDE_ROOT')
                item['resolved'] = resolved.relative_to(dest.resolve()).as_posix()
    return {'entries': len(entries), 'uncompressedBytes': total, 'manifest': manifest,
            'manifestSha256': hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest(),
            'validatedLinks': links if destination is not None else []}


def process_identity(pid):
    try:
        p = Path('/proc') / str(pid)
        status = p.joinpath('stat').read_text().rsplit(')', 1)[1].split()
        if status[0] == 'Z' or p.stat().st_uid != 0:
            return None
        return {'pid': pid, 'start': status[19], 'boot': Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
    except (OSError, IndexError, ValueError):
        return None


def docker(args, log, timeout=120, progress=False, on_progress=None):
    with open(log, 'ab', buffering=0) as output:
        if not progress:
            return subprocess.run([DOCKER, *args], stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                  timeout=timeout, check=False).returncode
        child = subprocess.Popen([DOCKER, *args], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, start_new_session=True)
        poll = selectors.DefaultSelector()
        poll.register(child.stdout, selectors.EVENT_READ)
        pending, start = b'', time.monotonic()
        try:
            while poll.get_map():
                need(time.monotonic() - start <= timeout, 'ISOLATED_COLLECTOR_TIMEOUT')
                for key, _ in poll.select(1):
                    body = os.read(key.fd, 65536)
                    if not body:
                        poll.unregister(child.stdout)
                        break
                    output.write(body)
                    pending += body
                    while b'\n' in pending:
                        line, pending = pending.split(b'\n', 1)
                        try:
                            v = json.loads(line)
                            if re.fullmatch('[a-z][a-z0-9-]{0,100}', str(v.get('phase', ''))):
                                print(json.dumps({'type': 'execution.progress', 'phase': v['phase'],
                                                  'ok': v.get('ok') is True}), flush=True)
                                if on_progress is not None:
                                    on_progress(v)
                        except (ValueError, UnicodeDecodeError, AttributeError):
                            pass
                    if len(pending) > 65536:
                        pending = b''
            return child.wait(timeout=15)
        finally:
            poll.close()
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=15)
            child.stdout.close()


def inspect(kind, name):
    r = subprocess.run([DOCKER, kind, 'inspect', name], capture_output=True, text=True, timeout=15)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout)[0]


def cleanup(state, log):
    errors = []
    labels = state['labels']
    for name in reversed(state['containers']):
        info = inspect('container', name)
        if info is None:
            continue
        actual = info.get('Config', {}).get('Labels', {})
        if any(actual.get(k) != v for k, v in labels.items()):
            errors.append('CLEANUP_CONTAINER_IDENTITY_MISMATCH')
            continue
        if docker(['rm', '--force', '--volumes', info['Id']], log, 30) != 0:
            errors.append('OWN_CONTAINER_CLEANUP_FAILED')
    if state.get('brokerScope'):
        scope = Path(state['brokerScope'])
        if (scope / 'sandbox-broker/control.json').is_file():
            with open(log, 'ab') as output:
                r = subprocess.run(['/usr/bin/python3', str(BROKER_CONTROL), '--stop', state['resourceId'], state['fingerprint']],
                                   stdout=output, stderr=output, timeout=120)
            if r.returncode != 0:
                errors.append('OWN_SANDBOX_BROKER_CLEANUP_FAILED')
    net = inspect('network', state['network'])
    if net is not None:
        if any(net.get('Labels', {}).get(k) != v for k, v in labels.items()) or net.get('Internal') is not True:
            errors.append('CLEANUP_NETWORK_IDENTITY_MISMATCH')
        elif docker(['network', 'rm', net['Id']], log, 30) != 0:
            errors.append('OWN_NETWORK_CLEANUP_FAILED')
    return {'complete': not errors, 'errorCodes': errors, 'businessResourcesTouched': False}


def watchdog(state_file):
    trusted(state_file)
    state = json.loads(Path(state_file).read_text())
    end = time.monotonic() + 3600
    cleanup_incomplete = False
    while time.monotonic() < end:
        if process_identity(state['owner']['pid']) != state['owner']:
            break
        if (Path(state_file).parent / 'cleanup.json').exists():
            if json.loads((Path(state_file).parent / 'cleanup.json').read_text()).get('complete') is True:
                return 0
            cleanup_incomplete = True
            break
        time.sleep(2)
    # An incomplete normal cleanup must not interrupt publication of its honest
    # failure report. Wait briefly for the coordinator to exit, then retry only
    # its recorded resources. Timeout/abrupt termination still kills that exact
    # process identity; never a recycled PID or another validator.
    if cleanup_incomplete:
        for _ in range(15):
            if process_identity(state['owner']['pid']) != state['owner']:
                break
            time.sleep(2)
    if process_identity(state['owner']['pid']) == state['owner']:
        fd = os.pidfd_open(state['owner']['pid'], 0)
        try:
            if process_identity(state['owner']['pid']) == state['owner']:
                signal.pidfd_send_signal(fd, signal.SIGTERM)
        finally:
            os.close(fd)
        for _ in range(75):
            if process_identity(state['owner']['pid']) != state['owner']:
                break
            time.sleep(2)
        if process_identity(state['owner']['pid']) == state['owner']:
            fd = os.pidfd_open(state['owner']['pid'], 0)
            try:
                if process_identity(state['owner']['pid']) == state['owner']:
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
            finally:
                os.close(fd)
    result = cleanup(state, Path(state_file).parent / 'watchdog.log')
    path = Path(state_file).parent / 'watchdog-cleanup.json'
    if not path.exists():
        write_json(path, result)
    return 0 if result['complete'] else 1


def publish_file(helper, workspace, source, relative):
    """Root never follows model-writable path components during publication."""
    parts = helper.relative_parts(relative)
    parent = helper.open_directory(workspace)
    try:
        for part in parts[:-1]:
            try:
                os.mkdir(part, mode=0o755, dir_fd=parent)
            except FileExistsError:
                pass
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            info = os.fstat(child)
            need(info.st_uid == 0 and not info.st_mode & 0o022, 'PUBLIC_ARTIFACT_DIRECTORY_NOT_ROOT_OWNED')
            os.fchmod(child, 0o755)
            os.close(parent)
            parent = child
        fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644, dir_fd=parent)
        with os.fdopen(fd, 'wb') as out, open(source, 'rb') as inp:
            for body in iter(lambda: inp.read(65536), b''):
                out.write(body)
            out.flush()
            os.fchmod(out.fileno(), 0o644)
            os.fsync(out.fileno())
    finally:
        os.close(parent)
    return {'path': relative, 'sha256': digest(source), 'bytes': Path(source).stat().st_size}


def chown_copy(root, validated_links=()):
    # Only disposable candidate copies reach this function. The UID0/GID0
    # collector has no DAC capabilities; group read/traversal lets it inspect
    # UID1000-owned bytes while /evidence and the immutable snapshot stay private.
    # Validate the complete tree before applying permissions: an unexpected link
    # must not leave a partially prepared copy or grant access to its target.
    root = Path(root)
    root_info = root.lstat()
    need(stat.S_ISDIR(root_info.st_mode) and not stat.S_ISLNK(root_info.st_mode), 'COPY_PERMISSION_ROOT_INVALID')
    entries = [(root, root_info)]
    approved = {}
    linked_inodes = set()
    for item in validated_links:
        relative = PurePosixPath(item['path'])
        need(not relative.is_absolute() and '..' not in relative.parts and
             'node_modules' in relative.parts and item['path'] not in approved and
             item['kind'] in ('symlink', 'hardlink'), 'COPY_PACKAGE_LINK_INVALID')
        path = root / item['path']
        info = path.lstat()
        need(path.resolve().is_relative_to(root.resolve()), 'COPY_PACKAGE_LINK_CHANGED')
        if item['kind'] == 'symlink':
            need(path.resolve().relative_to(root.resolve()).as_posix() == item['resolved'], 'COPY_PACKAGE_LINK_CHANGED')
            need(stat.S_ISLNK(info.st_mode) and os.readlink(path) == item['linktext'], 'COPY_PACKAGE_LINK_CHANGED')
        else:
            target_path = (root / item['resolved']).resolve()
            need(target_path.is_relative_to(root.resolve()) and
                 target_path.relative_to(root.resolve()).as_posix() == item['resolved'], 'COPY_PACKAGE_LINK_CHANGED')
            target = target_path.stat()
            need(stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == (target.st_dev, target.st_ino), 'COPY_PACKAGE_LINK_CHANGED')
            linked_inodes.add((info.st_dev, info.st_ino))
        approved[item['path']] = (item, info)

    def unreadable(_error):
        raise ValueError('COPY_PERMISSION_TREE_UNREADABLE')

    for base, dirs, files in os.walk(root, followlinks=False, onerror=unreadable):
        for name in dirs + files:
            path = Path(base) / name
            info = path.lstat()
            allowed = approved.get(path.relative_to(root).as_posix())
            if stat.S_ISLNK(info.st_mode) and allowed:
                need(allowed[0]['kind'] == 'symlink' and info.st_dev == allowed[1].st_dev and
                     info.st_ino == allowed[1].st_ino and os.readlink(path) == allowed[0]['linktext'], 'COPY_PACKAGE_LINK_CHANGED')
                continue  # Never chmod/chown/follow an approved archive link.
            need(not stat.S_ISLNK(info.st_mode) and
                 (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)), 'COPY_PERMISSION_ENTRY_INVALID')
            need(not stat.S_ISREG(info.st_mode) or info.st_nlink == 1 or
                 (info.st_dev, info.st_ino) in linked_inodes, 'COPY_PERMISSION_ENTRY_INVALID')
            entries.append((path, info))
    applied_inodes = {}
    for path, before in entries:
        current = path.lstat()
        identity = (before.st_dev, before.st_ino)
        need(current.st_dev == before.st_dev and current.st_ino == before.st_ino and
             stat.S_IFMT(current.st_mode) == stat.S_IFMT(before.st_mode) and
             stat.S_IMODE(current.st_mode) == applied_inodes.get(identity, stat.S_IMODE(before.st_mode)), 'COPY_PERMISSION_ENTRY_CHANGED')
        if identity in applied_inodes:
            continue  # An archive-approved hardlink shares an already prepared inode.
        # Preserve owner access/execution; remove other access and special bits.
        mode = (stat.S_IMODE(before.st_mode) & 0o700) | (0o050 if stat.S_ISDIR(before.st_mode) else 0o040)
        os.chown(path, 1000, 0, follow_symlinks=False)
        os.chmod(path, mode, follow_symlinks=False)
        applied_inodes[identity] = mode


def prepare_collector_manifest(source, existing=False):
    # Only run-private copies reach this function; snapshot/original are never
    # modified. The collector needs one writable file, not a writable directory.
    path = Path(source) / 'jarvis-package-manifest.json'
    flags = os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK
    if not existing:
        flags |= os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o640)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'COPY_MANIFEST_FILE_INVALID')
        os.fchown(fd, 0, 0)
        os.fchmod(fd, 0o640)
        os.fsync(fd)
    finally:
        os.close(fd)


def source_manifest(manifest):
    # Only documented generated prototype output is excluded here. New source,
    # tests, docs and deployment files are included, so tests cannot introduce
    # extra public code into a package without changing this exact identity.
    return sorted([(v['path'], v['sha256'], v['bytes']) for v in manifest
                   if not v['path'].startswith('doc/evidence/')])


def phase_report(value, run_id, fingerprint, work_package, goal_hash, expected):
    need(value.get('runId') == run_id and value.get('sourceFingerprint') == fingerprint and value.get('workPackage') == work_package and value.get('goalSpecHash') == goal_hash, 'PHASE_REPORT_IDENTITY_MISMATCH')
    rows = value.get('checks')
    need(isinstance(rows, list) and len(rows) == len(expected) and {v.get('id') for v in rows} == set(expected), 'PHASE_REPORT_DENOMINATOR_MISMATCH')
    for row in rows:
        need(row.get('required') is True and isinstance(row.get('executed'), bool) and row.get('status') in ['pass', 'fail', 'skip', 'unknown'] and isinstance(row.get('command'), str) and 0 < len(row['command']) <= 4000 and re.fullmatch('[a-f0-9]{64}', str(row.get('evidenceSha256'))), 'PHASE_CHECK_INVALID')
        need(row.get('exitCode') is None or type(row['exitCode']) is int and -1 <= row['exitCode'] <= 255, 'PHASE_CHECK_INVALID')
        if row.get('status') == 'pass':
            need(row['executed'] and row.get('exitCode') == 0, 'PHASE_CHECK_INVALID')
        if row.get('tests') is not None:
            tests = row['tests']
            need(isinstance(tests, dict) and set(tests) == {'total', 'passed', 'failed', 'skipped', 'unknown'} and all(type(v) is int and v >= 0 for v in tests.values()) and tests['total'] > 0 and tests['total'] == sum(tests[k] for k in ['passed', 'failed', 'skipped', 'unknown']), 'PHASE_TEST_COUNTS_INVALID')
            need(row['status'] != 'pass' or tests['failed'] == tests['skipped'] == tests['unknown'] == 0, 'PHASE_CHECK_INVALID')
    need(isinstance(value.get('problems', []), list) and isinstance(value.get('artifacts', []), list) and len(value.get('artifacts', [])) <= 100, 'PHASE_REPORT_INVALID')
    need(all(isinstance(v, dict) and re.fullmatch('[a-z][a-z0-9-]{0,100}', str(v.get('id'))) and re.fullmatch('[A-Z][A-Z_0-9]{0,150}', str(v.get('errorCode'))) for v in value.get('problems', [])), 'PHASE_PUBLIC_PROBLEM_INVALID')
    return value


def collector_process_result(mode, exit_code, report, errors):
    # A completed JSON file is evidence, not the process result. In particular
    # SIGTERM can arrive after its last passing check. Preserve that evidence
    # but fail the enclosing fixed validation on every non-zero process exit.
    need(mode in ['build', 'runtime'] and type(exit_code) is int, 'COLLECTOR_PROCESS_RESULT_INVALID')
    if exit_code != 0:
        errors.append({'id': 'collector-' + mode, 'errorCode': 'COLLECTOR_PROCESS_NONZERO'})
    return report


def phase_process_result(exit_code, report, errors):
    # Preserve reports, but only the helper's exact documented terminal pair
    # can represent a resource wait. A signal after an unknown JSON is an
    # abnormal process, not a successfully observed missing prerequisite.
    status = report.get('status')
    normal = (exit_code == 0 and status == 'pass' or
              exit_code == 1 and status == 'fail' or
              exit_code == 2 and status == 'unknown')
    if not normal:
        errors.append({'id': 'phase-contract', 'errorCode': 'PHASE_PROCESS_ABNORMAL_EXIT'})
    return report


def run(policy_path, workspace, run_id, work_package, goal_hash):
    need(workspace == WORKSPACE and re.fullmatch(RUN_RE, run_id) and re.fullmatch('FA-?0[1-9]', work_package) and re.fullmatch('[a-f0-9]{64}', goal_hash), 'FA01_IDENTITY_INVALID')
    normalized_package = work_package if '-' in work_package else 'FA-' + work_package[2:]
    phase_ids = PHASE_IDS.get(normalized_package, [])
    for item in [__file__, HELPER, COLLECTOR, BROWSER, BASELINE, BROKER_CONTROL, TOOLS / 'factory-sandbox-broker.py', DOCKER, policy_path]:
        trusted(item)
    # Later-phase installation is independent of the already frozen FA01 core.
    # Missing helper is an explicit prerequisite, never a reduced denominator.
    if phase_ids:
        trusted(PHASE_CONTRACT)
    policy = json.loads(Path(policy_path).read_text())
    need(policy.get('mode') in ['fa01-isolated-v1', 'project-isolated-v1'] and policy.get('workspace') == workspace and policy.get('workPackage') == work_package and policy.get('goalSpecHash') == goal_hash and policy.get('evidenceRoot') == str(ROOT), 'FA01_POLICY_MISMATCH')
    need(not phase_ids or policy.get('mode') == 'project-isolated-v1', 'PHASE_POLICY_MISMATCH')
    expected = REQUIRED + phase_ids
    need(len(policy.get('expectedChecks', [])) == len(set(policy.get('expectedChecks', []))) and set(policy.get('expectedChecks', [])) == set(expected), 'FA01_REQUIRED_CHECK_MISSING')
    need(not phase_ids or policy.get('contractChecks') == phase_ids, 'PHASE_REQUIRED_CHECK_MISSING')
    baseline = json.loads(BASELINE.read_text())
    need(baseline.get('schemaVersion') == 1 and baseline.get('kind') == 'project-autonomy-test-baseline' and baseline.get('workspace') == workspace, 'TEST_BASELINE_INVALID')
    trusted(ROOT, private=True)
    run_root = ROOT / run_id
    run_root.mkdir(mode=0o700, exist_ok=True)
    trusted(run_root, private=True)
    attempt = uuid.uuid4().hex
    private = run_root / attempt
    private.mkdir(mode=0o700)
    helper = load_helper()
    started = utc_now()
    before = helper.snapshot(workspace, str(private / 'snapshot'))
    write_json(private / 'source-before.json', before)
    resource_id = hashlib.sha256((run_id + attempt).encode()).hexdigest()[:40]
    prefix = 'jarvis-fa01-' + resource_id
    labels = {'jarvis.validation.runId': run_id, 'jarvis.validation.attempt': attempt,
              'jarvis.validation.role': 'project-autonomy-fa01', 'jarvis.validation.sourceFingerprint': before['sha256']}
    names = {k: prefix + '-' + k for k in ['postgres', 'redis', 'minio', 'build', 'runtime', 'probe']}
    state = {'owner': process_identity(os.getpid()), 'labels': labels, 'containers': list(names.values()),
             'network': prefix + '-net', 'resourceId': resource_id, 'fingerprint': before['sha256'],
             'brokerScope': str(BROKER_ROOT / resource_id)}
    write_json(private / 'lifecycle.json', state)
    log = private / 'infrastructure.log'
    log.touch(mode=0o600)
    wd_log = open(private / 'watchdog-process.log', 'wb')
    subprocess.Popen(['/usr/bin/python3', str(Path(__file__).resolve()), '--watchdog', str(private / 'lifecycle.json')],
                     stdin=subprocess.DEVNULL, stdout=wd_log, stderr=wd_log, start_new_session=True,
                     env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    wd_log.close()
    checks, artifacts, errors, after, phase_value = [], [], [], None, None
    evidence = private / 'evidence'
    evidence.mkdir(mode=0o700)
    work = private / 'work'
    work.mkdir(mode=0o700)
    # Snapshot itself is immutable/root-owned; an independent disposable copy is
    # provided for compilers. copytree never reads the original model workspace.
    import shutil
    shutil.copytree(private / 'snapshot', work / 'source', symlinks=False)
    (work / 'home').mkdir(mode=0o700)
    chown_copy(work)
    prepare_collector_manifest(work / 'source')
    password = secrets.token_hex(24)
    secret = secrets.token_hex(32)
    auth_password = secrets.token_hex(24)
    envs = {
        'postgres.env': 'POSTGRES_USER=jarvis_test\nPOSTGRES_PASSWORD=' + password + '\nPOSTGRES_DB=jarvis_test\n',
        'minio.env': 'MINIO_ROOT_USER=jarvis_test\nMINIO_ROOT_PASSWORD=' + password + '\n',
        'node.env': 'CI=1\nHOME=/work/home\nCOREPACK_HOME=/corepack-cache\nCOREPACK_ENABLE_NETWORK=0\nMSF_DATABASE_URL=postgres://jarvis_test:' + password + '@postgres:5432/jarvis_test\nMSF_REDIS_URL=redis://redis:6379\nMSF_MINIO_ENDPOINT=minio\nMSF_MINIO_PORT=9000\nMSF_MINIO_ACCESS_KEY=jarvis_test\nMSF_MINIO_SECRET_KEY=' + password + '\nMSF_MINIO_BUCKET=jarvis-test-' + resource_id + '\nMSF_SECRET_KEY=' + secret + '\nJARVIS_AUTONOMY_RUN_ID=' + run_id + '\nJARVIS_FULL_TEST_RUN_ID=' + resource_id + '\nJARVIS_SOURCE_SHA256=' + before['sha256'] + '\nJARVIS_GOAL_SPEC_HASH=' + goal_hash + '\nJARVIS_WORK_PACKAGE=' + work_package + '\nJARVIS_VALIDATION_ATTEMPT=' + attempt + '\nJARVIS_TEST_BASELINE=' + json.dumps(baseline, separators=(',', ':')) + '\nJARVIS_PHASE_CONTRACT_REQUIRED=' + ('1' if phase_ids else '0') + '\nMSF_SANDBOX_NETWORK=jarvis-ft-' + resource_id + '-sandbox-net\nJARVIS_SANDBOX_FIXTURE_READY=1\nJARVIS_VALIDATION_USER=jarvis-validator\nJARVIS_VALIDATION_PASSWORD=' + auth_password + '\n'}
    for name, value in envs.items():
        fd = os.open(private / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(value)
    def interrupted(_signum, _frame):
        raise ValueError('VALIDATION_CANCELLED')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        ids = {}
        for kind, tag in IMAGES.items():
            r = subprocess.run([DOCKER, 'image', 'inspect', '--format', '{{.Id}}', tag], capture_output=True, text=True, timeout=15)
            need(r.returncode == 0 and re.fullmatch('sha256:[a-f0-9]{64}', r.stdout.strip()), 'APPROVED_OFFLINE_IMAGE_MISSING')
            ids[kind] = r.stdout.strip()
            if policy.get('imageIds'):
                need(policy['imageIds'].get(kind) == ids[kind], 'APPROVED_IMAGE_ID_CHANGED')
        write_json(private / 'image-ids.json', ids)
        need(all(inspect('container', name) is None for name in names.values()) and inspect('network', state['network']) is None, 'NEW_ISOLATED_RESOURCES_REQUIRED')
        label_args = [item for pair in labels.items() for item in ['--label', pair[0] + '=' + pair[1]]]
        need(docker(['network', 'create', '--internal', *label_args, state['network']], log) == 0, 'PRIVATE_NETWORK_CREATE_FAILED')
        common = ['run', '--pull=never', '--detach', *label_args, '--network', state['network'], '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--memory', '768m', '--cpus', '1', '--pids-limit', '128']
        for kind, args in [('postgres', ['--env-file', str(private / 'postgres.env'), ids['postgres']]), ('redis', [ids['redis'], 'redis-server', '--save', '', '--appendonly', 'no']), ('minio', ['--env-file', str(private / 'minio.env'), ids['minio'], 'server', '/data'])]:
            need(docker([*common, '--name', names[kind], '--network-alias', kind, *args], log) == 0, 'PRIVATE_DEPENDENCY_START_FAILED')
        ready = False
        readiness_deadline = time.monotonic() + 90
        while time.monotonic() < readiness_deadline:
            pg = docker(['exec', names['postgres'], 'pg_isready', '-U', 'jarvis_test', '-d', 'jarvis_test'], log, 15)
            redis = docker(['exec', names['redis'], 'redis-cli', 'ping'], log, 15)
            mini = docker(['run', '--rm', '--pull=never', *label_args, '--name', names['probe'], '--network', state['network'], '--user', '1000:1000', '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--read-only', '--memory', '256m', '--cpus', '1', '--pids-limit', '32', ids['node'], 'node', '-e', "fetch('http://minio:9000/minio/health/live',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], log, 15)
            if pg == redis == mini == 0:
                ready = True
                break
            time.sleep(2)
        need(ready, 'PRIVATE_DEPENDENCIES_NOT_READY')
        def migrate(source, database):
            files = sorted((source / 'apps/server/src/db/migrations').glob('*.sql'))
            need(files, 'PACKAGE_MIGRATIONS_MISSING')
            for path in files:
                with open(path, 'rb') as sql, open(log, 'ab') as out:
                    r = subprocess.run([DOCKER, 'exec', '-i', names['postgres'], 'psql', '-U', 'jarvis_test', '-d', database, '-v', 'ON_ERROR_STOP=1'], stdin=sql, stdout=out, stderr=out, timeout=30)
                need(r.returncode == 0, 'ISOLATED_MIGRATION_FAILED')
        migrate(private / 'snapshot', 'jarvis_test')
        trusted(BROKER_ROOT)
        broker_dir = BROKER_ROOT / resource_id
        broker_dir.mkdir(mode=0o700)
        write_json(broker_dir / 'copy.json', {'sha256': before['sha256']})
        broker = subprocess.run(['/usr/bin/python3', str(BROKER_CONTROL), '--start', resource_id, before['sha256']], capture_output=True, text=True, timeout=60)
        broker_value = json.loads(broker.stdout)
        need(broker.returncode == 0 and broker_value.get('ok') is True, 'FINITE_SANDBOX_FIXTURE_NOT_READY')
        sock = Path(broker_value['socketPath'])
        need(str(sock) == '/run/jarvis-ft-sandbox/' + resource_id + '/docker.sock' and stat.S_ISSOCK(sock.lstat().st_mode) and sock.lstat().st_uid == 1000, 'SANDBOX_FIXTURE_SOCKET_INVALID')
        phase_artifacts = []
        def collector(mode, mounted_work, env_path):
            phase_started = False
            def phase_ready(progress):
                nonlocal phase_started, phase_value
                if not phase_ids or mode != 'runtime' or progress.get('phase') != 'phase-contract-ready' or phase_started:
                    return
                phase_started = True
                output = evidence / 'phase-contract.json'
                phase_env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'JARVIS_AUTONOMY_RUN_ID': run_id, 'JARVIS_SOURCE_SHA256': before['sha256'], 'JARVIS_GOAL_SPEC_HASH': goal_hash, 'JARVIS_VALIDATION_ATTEMPT': attempt, 'JARVIS_WORK_PACKAGE': work_package, 'JARVIS_VALIDATION_USER': 'jarvis-validator', 'JARVIS_VALIDATION_PASSWORD': auth_password}
                try:
                    with open(private / 'phase-contract.log', 'xb') as out:
                        result = subprocess.run(['/usr/bin/python3', str(PHASE_CONTRACT), '--work-package', work_package, '--workspace', str(mounted_work / 'source'), '--output', str(output), '--base-url', 'http://127.0.0.1:18930', '--container', names['runtime']], stdin=subprocess.DEVNULL, stdout=out, stderr=out, timeout=420, env=phase_env)
                    need(output.stat().st_size <= 4 * 1024 * 1024, 'PHASE_REPORT_SIZE_LIMIT')
                    value = phase_report(json.loads(output.read_text()), run_id, before['sha256'], work_package, goal_hash, phase_ids)
                    phase_value = value
                    checks.extend(value['checks'])
                    errors.extend(value.get('problems', []))
                    phase_artifacts.extend(value.get('artifacts', []))
                    phase_process_result(result.returncode, value, errors)
                except Exception as exc:
                    errors.append({'id': 'phase-contract', 'errorCode': code(exc)})
                finally:
                    write_json(evidence / 'phase-contract-complete.json', {'runId': run_id, 'sourceFingerprint': before['sha256'], 'workPackage': work_package, 'attempt': attempt})
            command = ['run', '--pull=never', '--init', *label_args, '--name', names[mode], '--network', state['network'], '--user', '0:0', '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--read-only', '--memory', '8g', '--cpus', '3', '--pids-limit', '512', '--shm-size', '512m', '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m', '--env-file', str(env_path), '--workdir', '/work/source', '--mount', 'type=bind,src=' + str(mounted_work) + ',dst=/work', '--mount', 'type=bind,src=' + str(evidence) + ',dst=/evidence', '--mount', 'type=bind,src=' + str(TOOLS) + ',dst=/tools,readonly', '--mount', 'type=bind,src=/home/superopen/opt/node22/lib/node_modules/corepack,dst=/corepack-runtime,readonly', '--mount', 'type=bind,src=/home/superopen/.cache/node/corepack,dst=/corepack-cache,readonly', '--mount', 'type=bind,src=/home/superopen/.local/share/pnpm/store,dst=/pnpm-store,readonly']
            if mode == 'build':
                command += ['--mount', 'type=bind,src=' + str(sock) + ',dst=/var/run/docker.sock,readonly']
            command += [ids['node'], 'node', '/tools/project-autonomy-fa01-collector.mjs', mode]
            result = docker(command, log, 2800 if mode == 'build' else 900 if phase_ids else 240, progress=True, on_progress=phase_ready)
            # Freeze the candidate processes before reading any evidence.
            need(docker(['rm', '--force', '--volumes', names[mode]], log, 30) == 0, 'COLLECTOR_FREEZE_FAILED')
            report = json.loads((evidence / ('collector-' + mode + '.json')).read_text())
            need(report.get('runId') == run_id and report.get('sourceFingerprint') == before['sha256'], 'COLLECTOR_REPORT_BINDING_MISMATCH')
            collector_process_result(mode, result, report, errors)
            checks.extend(report.get('checks', []))
            errors.extend(report.get('problems', []))
            return result
        collector('build', work, private / 'node.env')
        source_matches = source_manifest(helper.fingerprint(str(work / 'source'))['manifest']) == source_manifest(before['manifest'])
        checks.append({'id': 'snapshot-source-consistency', 'required': True, 'command': json.dumps(['actual-public-snapshot-files-unchanged-by-tests']), 'executed': True, 'status': 'pass' if source_matches else 'fail', 'exitCode': 0 if source_matches else 1, 'evidenceSha256': hashlib.sha256(json.dumps({'sourceMatches': source_matches, 'originalFingerprint': before['sha256']}).encode()).hexdigest()})
        need(source_matches, 'TESTS_CHANGED_CANDIDATE_PUBLIC_SOURCE')
        package = evidence / 'candidate.tar.gz'
        installed = private / 'installed'
        installed.mkdir(mode=0o700)
        verified = safe_archive(package, installed / 'source')
        need(verified['manifest'] == json.loads((evidence / 'package-manifest.json').read_text()) and verified['manifest'].get('sourceFingerprint') == before['sha256'] and verified['manifest'].get('runId') == run_id and verified['manifest'].get('goalSpecHash') == goal_hash, 'PACKAGE_IDENTITY_MISMATCH')
        checks.append({'id': 'package-install', 'required': True, 'command': json.dumps(['verified-real-tar-extraction', 'fresh-private-directory']), 'executed': True, 'status': 'pass', 'exitCode': 0, 'evidenceSha256': hashlib.sha256(json.dumps(verified, sort_keys=True).encode()).hexdigest()})
        installed_matches = source_manifest(helper.fingerprint(str(installed / 'source'))['manifest']) == source_manifest(before['manifest'])
        checks.append({'id': 'package-public-source-consistency', 'required': True, 'command': json.dumps(['actual-installed-public-source-manifest', 'all-original-and-no-added-source']), 'executed': True, 'status': 'pass' if installed_matches else 'fail', 'exitCode': 0 if installed_matches else 1, 'evidenceSha256': hashlib.sha256(json.dumps({'installedMatches': installed_matches, 'sourceFingerprint': before['sha256']}).encode()).hexdigest()})
        need(installed_matches, 'PACKAGE_PUBLIC_SOURCE_CHANGED')
        (installed / 'home').mkdir(mode=0o700)
        chown_copy(installed, [{**item, 'path': 'source/' + item['path'],
                              'resolved': 'source/' + item['resolved']}
                             for item in verified['validatedLinks']])
        prepare_collector_manifest(installed / 'source', existing=True)
        need(docker(['exec', names['postgres'], 'createdb', '-U', 'jarvis_test', 'jarvis_runtime'], log, 30) == 0, 'NEW_RUNTIME_DATABASE_CREATE_FAILED')
        migrate(installed / 'source', 'jarvis_runtime')
        runtime_env = private / 'runtime.env'
        runtime_env.write_text(envs['node.env'].replace('@postgres:5432/jarvis_test', '@postgres:5432/jarvis_runtime'))
        os.chmod(runtime_env, 0o600)
        collector('runtime', installed, runtime_env)
        relative_base = '.jarvis-validation-output/' + run_id + '/' + attempt
        for name in ['candidate.tar.gz', 'frontend.png']:
            if (evidence / name).is_file():
                artifacts.append(publish_file(helper, workspace, evidence / name, relative_base + '/' + name))
        for index, item in enumerate(phase_artifacts):
            need(isinstance(item.get('path'), str) and re.fullmatch('[a-f0-9]{64}', str(item.get('sha256'))) and type(item.get('bytes')) is int and item['bytes'] > 0, 'PHASE_ARTIFACT_INVALID')
            snap = private / ('phase-artifact-' + str(index) + '.bin')
            observed = helper.artifact(str(installed / 'source'), item['path'], str(snap))
            need(observed['sha256'] == item['sha256'] and observed['bytes'] == item['bytes'], 'PHASE_ARTIFACT_BYTES_MISMATCH')
            artifacts.append(publish_file(helper, workspace, snap, relative_base + '/phase/' + item['path']))
    except Exception as exc:
        errors.append({'id': 'coordinator', 'errorCode': code(exc)})
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        try:
            cleaned = cleanup(state, log)
        except Exception:
            cleaned = {'complete': False, 'errorCodes': ['SCOPED_CLEANUP_FAILED'], 'businessResourcesTouched': False}
        write_json(private / 'cleanup.json', cleaned)
        if not cleaned['complete']:
            errors.append({'id': 'cleanup', 'errorCode': 'SCOPED_CLEANUP_INCOMPLETE'})
        try:
            after = helper.fingerprint(workspace)
            write_json(private / 'source-after.json', after)
        except Exception:
            errors.append({'id': 'source-stability', 'errorCode': 'SOURCE_AFTER_NOT_OBSERVED'})
    stable = after is not None and before['sha256'] == after['sha256']
    # Bounded public diagnostic metadata; never raw logs/assertion text/chat.
    known_files = {v['path'] for v in before['manifest']}
    failed_files, compile_refs = [], []
    for path in evidence.glob('*-tests.json'):
        try:
            data = json.loads(path.read_text())
            for entry in data.get('testResults', []):
                rel = str(entry.get('name', '')).removeprefix('/work/source/')
                if entry.get('status') != 'passed' and rel in known_files:
                    failed_files.append(rel)
        except (OSError, ValueError, TypeError):
            pass
    for path in evidence.glob('*.log'):
        if path.stat().st_size > 16 * 1024 * 1024:
            continue
        for match in re.finditer(r'([a-zA-Z0-9_./-]+\.[cm]?[jt]sx?)\((\d+),(\d+)\):\s*error\s*(TS\d+)', path.read_text(errors='replace')):
            rel = match[1].removeprefix('/work/source/')
            choices = [v for v in known_files if v == rel or v.endswith('/' + rel)]
            if len(choices) == 1:
                compile_refs.append({'path': choices[0], 'line': int(match[2]), 'column': int(match[3]), 'code': match[4]})
            if len(compile_refs) >= 100:
                break
    summary = {'schemaVersion': 1, 'kind': 'project-autonomy-failure-summary', 'runId': run_id,
               'sourceFingerprint': before['sha256'], 'requiredChecks': [{'id': v.get('id'), 'status': v.get('status'), 'exitCode': v.get('exitCode')} for v in checks],
               'errorCodes': [{'id': v.get('id'), 'errorCode': v.get('errorCode')} for v in errors],
               'failedTestFiles': sorted(set(failed_files))[:100], 'compileReferences': compile_refs,
               'rawLogsExported': False}
    write_json(private / 'failure-summary.json', summary)
    try:
        artifacts.append(publish_file(helper, workspace, private / 'failure-summary.json', '.jarvis-validation-output/' + run_id + '/' + attempt + '/failure-summary.json'))
    except Exception:
        errors.append({'id': 'evidence-publication', 'errorCode': 'PUBLIC_FAILURE_SUMMARY_NOT_PUBLISHED'})
    checks.append({'id': 'source-stability', 'required': True, 'command': json.dumps(['dirfd-public-source-fingerprint', 'before-and-after']), 'executed': after is not None, 'status': 'pass' if stable else 'fail', 'exitCode': 0 if stable else 1, 'evidenceSha256': hashlib.sha256(json.dumps({'before': before['sha256'], 'after': after['sha256'] if after else None}).encode()).hexdigest()})
    for item in expected:
        if not any(row.get('id') == item for row in checks):
            checks.append({'id': item, 'required': True, 'command': json.dumps(['fixed-fa01-check', item]), 'executed': False, 'status': 'unknown', 'exitCode': None, 'evidenceSha256': hashlib.sha256((item + ':not-executed').encode()).hexdigest()})
    protocol_checks = [{k: row[k] for k in ['id', 'required', 'command', 'executed', 'status', 'exitCode', 'evidenceSha256', *(['tests'] if row.get('tests') else [])]} for row in checks]
    wait_metadata = {}
    try:
        wait_metadata = prerequisite_wait_metadata(phase_value, evidence, run_id, attempt, before['sha256'], work_package, goal_hash, protocol_checks, errors, stable)
    except Exception as exc:
        errors.append({'id': 'prerequisite-status', 'errorCode': code(exc)})
    passed = not errors and stable and artifacts and len({row['id'] for row in protocol_checks}) == len(protocol_checks) and all(row['executed'] and row['status'] == 'pass' and row['exitCode'] == 0 for row in protocol_checks)
    report = {'schemaVersion': 1, 'kind': 'project-autonomy-validation', 'runId': run_id, 'workspace': workspace, 'goalSpecHash': goal_hash, 'workPackage': work_package, 'sourceFingerprint': before['sha256'], 'sourceStable': stable, 'status': 'pass' if passed else 'fail', 'simulated': False, 'startedAt': started, 'finishedAt': utc_now(), 'checks': protocol_checks, 'artifacts': artifacts}
    report.update(wait_metadata)
    write_json(private / 'detailed-report.json', {'report': report, 'errorCodes': errors, 'cleanup': cleaned, 'modelsInvoked': False, 'productionDatabaseUsed': False, 'privateEnvCopied': False, 'tools': {str(path): digest(path) for path in [Path(__file__), HELPER, COLLECTOR, BROWSER]}})
    text = json.dumps(report, ensure_ascii=False, separators=(',', ':'))
    helper.publish_protocol(text)
    print(text, flush=True)
    # All failures stay visible as fixed phase/code metadata, never raw logs.
    if errors:
        print(json.dumps({'type': 'execution.progress', 'phase': 'fa01-failed', 'errorCodes': [{'id': v.get('id'), 'errorCode': v.get('errorCode')} for v in errors]}), flush=True)
    return 0 if passed else 1


if __name__ == '__main__':
    try:
        need(os.geteuid() == 0, 'FA01_ROOT_REQUIRED')
        if len(sys.argv) == 3 and sys.argv[1] == '--watchdog':
            status = watchdog(sys.argv[2])
        else:
            need(len(sys.argv) == 6, 'FA01_FIXED_ARGUMENTS_REQUIRED')
            status = run(*sys.argv[1:])
        sys.exit(status)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(json.dumps({'schemaVersion': 1, 'kind': 'project-autonomy-validation', 'status': 'fail', 'simulated': False, 'errorCode': code(exc)}), flush=True)
        sys.exit(2)
