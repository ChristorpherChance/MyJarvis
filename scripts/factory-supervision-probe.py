#!/usr/bin/python3
"""Fixed, unprivileged pause/resume probe; no model, shell, or project command.

Install this file root-owned outside the workspace.  The driver must confirm
the prior signed cancellation before starting a new run with the same fixed
job.  Reusing a checkpoint proves only local continuity, never remote stop.
"""
import datetime
import fcntl
import hashlib
import json
import os
import re
import stat
import sys
import time
import uuid

WORKSPACE = '/home/superopen/All-Projects/msf-supervised-tests'
WAIT_SECONDS = 90
MAX_BYTES = 65536
RUN_PATTERN = r'[0-9a-f]{40}'
JOB_PATTERN = r'[0-9a-f]{32}'
ZERO_USAGE = {
    'inputTokens': 0, 'outputTokens': 0, 'cacheReadTokens': 0,
    'cacheWriteTokens': 0, 'totalTokens': 0, 'usageComplete': True,
    'provider': 'fixed-supervision-probe', 'model': 'no-model',
    'costUSD': 0, 'costKind': 'provider-reported',
}


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')), flush=True)


def reject(code):
    emit({'type': 'execution.result', 'summary': code, 'needs_more_work': False,
          'artifacts': [], 'usage': ZERO_USAGE})
    raise SystemExit(2)


def trusted_workspace():
    """No symlink at any ancestor; the fixed final directory must belong to us."""
    if os.getuid() == 0:
        reject('PROBE_MUST_BE_UNPRIVILEGED')
    cursor = WORKSPACE
    while True:
        info = os.lstat(cursor)
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            reject('WORKSPACE_LINK_OR_TYPE_REJECTED')
        if cursor == WORKSPACE and info.st_uid != os.getuid():
            reject('WORKSPACE_OWNER_REJECTED')
        parent = os.path.dirname(cursor)
        if cursor == parent:
            break
        cursor = parent
    if os.path.realpath(WORKSPACE) != WORKSPACE:
        reject('WORKSPACE_CANONICAL_PATH_REQUIRED')
    return os.open(WORKSPACE, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)


def read_json(directory, name):
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
    except FileNotFoundError:
        return None
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
            reject('PROBE_FILE_OWNER_OR_TYPE_REJECTED')
        data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        reject('PROBE_FILE_LIMIT')
    try:
        return json.loads(data)
    except (UnicodeDecodeError, ValueError):
        reject('PROBE_JSON_INVALID')


def save_json(directory, name, value):
    """Atomic replacement stays inside the opened fixed-job directory."""
    # Reject an existing non-regular, symlink, hard-linked, or foreign-owned file.
    read_json(directory, name)
    temporary = '.probe-' + uuid.uuid4().hex + '.tmp'
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass


def digest(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def valid_checkpoint(value, job):
    if (not isinstance(value, dict) or set(value) != {
            'formatVersion', 'job', 'workspace', 'firstRunId', 'runs',
            'stage', 'createdAt', 'updatedAt', 'elapsedSec'}
            or value.get('formatVersion') != 1 or value.get('job') != job
            or value.get('workspace') != WORKSPACE
            or not isinstance(value.get('firstRunId'), str)
            or not re.fullmatch(RUN_PATTERN, value['firstRunId'])
            or value.get('stage') not in ['waiting-for-control', 'wait-completed', 'checkpoint-reused']
            or not isinstance(value.get('elapsedSec'), int) or not 0 <= value['elapsedSec'] <= WAIT_SECONDS
            or not isinstance(value.get('runs'), list) or not 1 <= len(value['runs']) <= 20):
        return False
    seen = set()
    for item in value['runs']:
        if (not isinstance(item, dict) or set(item) != {'runId', 'startedAt', 'mode'}
                or not isinstance(item.get('runId'), str) or not re.fullmatch(RUN_PATTERN, item['runId'])
                or item['runId'] in seen or not isinstance(item.get('startedAt'), str)
                or item.get('mode') not in ['initial', 'checkpoint-reuse']):
            return False
        seen.add(item['runId'])
    return (value['runs'][0]['runId'] == value['firstRunId']
            and value['runs'][0]['mode'] == 'initial'
            and all(item['mode'] == 'checkpoint-reuse' for item in value['runs'][1:])
            and isinstance(value.get('createdAt'), str) and isinstance(value.get('updatedAt'), str))


def main():
    if (len(sys.argv) != 5 or sys.argv[1] != '--job'
            or not re.fullmatch(JOB_PATTERN, sys.argv[2])
            or sys.argv[3] != WORKSPACE or not re.fullmatch(RUN_PATTERN, sys.argv[4])):
        reject('FIXED_PROBE_ARGUMENTS_REQUIRED')
    job, run_id = sys.argv[2], sys.argv[4]
    base_name = 'probe-' + job
    workspace = trusted_workspace()
    directory = lock = None
    try:
        try:
            os.mkdir(base_name, 0o700, dir_fd=workspace)
        except FileExistsError:
            pass
        directory = os.open(base_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=workspace)
        info = os.fstat(directory)
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            reject('PROBE_DIRECTORY_OWNER_OR_MODE_REJECTED')
        lock = os.open('run.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW,
                       0o600, dir_fd=directory)
        info = os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
            reject('PROBE_LOCK_OWNER_OR_TYPE_REJECTED')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            reject('PROBE_ALREADY_RUNNING')
        # The OS releases this lock after termination; it is not itself a signed stop receipt.
        checkpoint = read_json(directory, 'checkpoint.json')
        reused = checkpoint is not None
        if reused and not valid_checkpoint(checkpoint, job):
            reject('CHECKPOINT_SCOPE_OR_CONTENT_REJECTED')
        report_name = 'report-' + run_id + '.json'
        if reused and any(item['runId'] == run_id for item in checkpoint['runs']):
            old = read_json(directory, report_name)
            if (not isinstance(old, dict) or old.get('job') != job
                    or old.get('runId') != run_id or old.get('workspace') != WORKSPACE):
                reject('RUN_ID_REPLAY_WITHOUT_FINAL_REPORT')
            emit({'type': 'execution.result', 'summary': '固定控制探针重复回执；未重复运行',
                  'needs_more_work': False, 'artifacts': [base_name + '/' + report_name],
                  'usage': ZERO_USAGE})
            return
        if reused and len(checkpoint['runs']) >= 20:
            reject('PROBE_RUN_LIMIT')
        prior_hash = digest(checkpoint) if reused else None
        previous_run_id = checkpoint['runs'][-1]['runId'] if reused else None
        now = stamp()
        if not reused:
            checkpoint = {'formatVersion': 1, 'job': job, 'workspace': WORKSPACE,
                          'firstRunId': run_id, 'runs': [], 'stage': 'waiting-for-control',
                          'createdAt': now, 'updatedAt': now, 'elapsedSec': 0}
        checkpoint['runs'].append({'runId': run_id, 'startedAt': now,
                                   'mode': 'checkpoint-reuse' if reused else 'initial'})
        checkpoint['stage'] = 'checkpoint-reused' if reused else 'waiting-for-control'
        checkpoint['updatedAt'] = now
        save_json(directory, 'checkpoint.json', checkpoint)
        # Cancellation can occur before a final event; the honest no-model receipt is available now.
        emit({'type': 'execution.result',
              'summary': '固定控制探针已读取原检查点' if reused else '固定控制探针已建立检查点并等待暂停',
              'needs_more_work': False, 'artifacts': [base_name + '/checkpoint.json'],
              'usage': ZERO_USAGE})
        emit({'type': 'execution.progress', 'runId': run_id, 'job': job,
              'stage': checkpoint['stage'], 'elapsedSec': checkpoint['elapsedSec'],
              'previousRunId': previous_run_id, 'remoteStopVerifiedByProbe': False})
        if not reused:
            started = time.monotonic()
            previous_bucket = 0
            while time.monotonic() - started < WAIT_SECONDS:
                time.sleep(min(1, max(0.01, WAIT_SECONDS - (time.monotonic() - started))))
                elapsed = min(WAIT_SECONDS, int(time.monotonic() - started))
                if elapsed // 10 > previous_bucket:
                    previous_bucket = elapsed // 10
                    checkpoint['elapsedSec'] = elapsed
                    checkpoint['updatedAt'] = stamp()
                    save_json(directory, 'checkpoint.json', checkpoint)
                    emit({'type': 'execution.progress', 'runId': run_id, 'job': job,
                          'stage': 'waiting-for-control', 'elapsedSec': elapsed})
            checkpoint['elapsedSec'] = WAIT_SECONDS
            checkpoint['stage'] = 'wait-completed'
            checkpoint['updatedAt'] = stamp()
            save_json(directory, 'checkpoint.json', checkpoint)
        report = {'formatVersion': 1, 'job': job, 'runId': run_id, 'workspace': WORKSPACE,
                  'firstRunId': checkpoint['firstRunId'], 'previousRunId': previous_run_id,
                  'mode': 'checkpoint-reuse' if reused else 'initial',
                  'checkpointBeforeSHA256': prior_hash, 'checkpointAfterSHA256': digest(checkpoint),
                  'checkpointReused': reused, 'remoteStopVerifiedByProbe': False,
                  'modelCalled': False, 'sourceModified': False, 'productTestsRun': False,
                  'finishedAt': stamp(), 'usage': ZERO_USAGE}
        save_json(directory, report_name, report)
        emit({'type': 'execution.result',
              'summary': '固定探针续做完成：复用了原检查点；停止须另核对签名回执' if reused
              else '固定探针等待结束；本次未证明暂停或续做',
              'needs_more_work': False,
              'artifacts': [base_name + '/checkpoint.json', base_name + '/' + report_name],
              'usage': ZERO_USAGE})
    finally:
        if lock is not None:
            os.close(lock)
        if directory is not None:
            os.close(directory)
        os.close(workspace)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError):
        # Paths, other file contents and credentials are never echoed in diagnostics.
        reject('FIXED_PROBE_FAILED')
