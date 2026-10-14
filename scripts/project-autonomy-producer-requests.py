#!/usr/bin/python3
"""Root-private prerequisite request index; never executes a producer.

The outbox records real missing receipts from an immutable fixed report. It
cannot manufacture trusted observations, mark acceptance, invoke a model or
restart a process. A later fixed dispatcher must reconcile effects before any
retry. Local tests exercise pure methods with fixture input, not product proof.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import sys

TOOLS = Path('/opt/jarvis-development/software-factory')
CATALOG = TOOLS / 'producer-implementation-plan.json'
STATE = Path('/var/lib/jarvis-development/101/autonomy-producer-requests')
PUBLIC = Path('/var/lib/jarvis-development/101/autonomy-public')
WORKSPACE = '/home/superopen/All-Projects/msf-jarvis-autonomy-r22'
PROJECT = '70ec346f-6520-46ed-abed-22cac770a3e4'
MAX_REQUESTS = 10000
MAX_ORIGINS_PER_REQUEST = 128
MAX_REPORT = 1024 * 1024
HEX64 = r'[a-f0-9]{64}'
RUN_RE = r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'
NAMES = {'provider', 'native-execution', 'native-recovery', 'ui-comparison',
         'regression', 'performance-data', 'agent-evaluation', 'agent-promotion',
         'jarvis-workflow', 'workflow-controls', 'customer-installation', 'e2e',
         'long-observation', 'reuse-records'}
REASONS = {'FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING', 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING',
           'FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING', 'CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING',
           'LONG_OBSERVATION_IN_PROGRESS', 'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING'}


def need(condition, code):
    if not condition:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':'))


def sha(body):
    return hashlib.sha256(body if isinstance(body, bytes) else body.encode()).hexdigest()


def stamp(value):
    need(isinstance(value, str) and value.endswith('Z'), 'REQUEST_TIME_INVALID')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(result.tzinfo == timezone.utc, 'REQUEST_TIME_INVALID')
    return result.timestamp()


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def digest(value):
    return isinstance(value, str) and re.fullmatch(HEX64, value) is not None


def distinct_strings(values, limit=1000):
    return isinstance(values, list) and 0 < len(values) <= limit and all(isinstance(v, str) and 0 < len(v) <= 200 for v in values) and len(set(values)) == len(values)


def validate_catalog(catalog):
    need(catalog.get('schemaVersion') == 1 and catalog.get('kind') == 'project-autonomy-producer-implementation-plan', 'REQUEST_CATALOG_INVALID')
    need(catalog.get('projectId') == PROJECT and digest(catalog.get('goalSpecHash')), 'REQUEST_CATALOG_SCOPE_INVALID')
    entries = catalog.get('producers', [])
    need(len(entries) == 14 and {v.get('id') for v in entries} == NAMES, 'REQUEST_PRODUCER_DENOMINATOR_INVALID')
    goals = catalog.get('objectiveCoverage', {}).get('goals', [])
    need(len(goals) == 74 and {v.get('objectiveId') for v in goals} == {'MSF-OBJ-' + str(i).zfill(3) for i in range(1, 75)}, 'REQUEST_OBJECTIVE_DENOMINATOR_INVALID')
    return {v['id']: v for v in entries}


def validate_scope(scope, catalog, now):
    need(scope.get('schemaVersion') == 1 and scope.get('kind') == 'root-producer-request-scope' and scope.get('simulated') is False, 'REQUEST_SCOPE_INVALID')
    need(scope.get('projectId') == PROJECT and scope.get('goalSpecHash') == catalog.get('goalSpecHash') and scope.get('workspace') == WORKSPACE, 'REQUEST_SCOPE_BINDING_INVALID')
    need(digest(scope.get('sourceFingerprint')) and re.fullmatch(r'FA-0[1-9]', scope.get('workPackage', '')), 'REQUEST_SOURCE_OR_PHASE_INVALID')
    need(distinct_strings(scope.get('requiredCheckIds')) and distinct_strings(scope.get('objectiveIds')), 'REQUEST_SCOPE_DENOMINATOR_INVALID')
    need(all(re.fullmatch(r'MSF-OBJ-\d{3}', v) for v in scope['objectiveIds']), 'REQUEST_OBJECTIVE_INVALID')
    available = {v['objectiveId'] for v in catalog['objectiveCoverage']['goals'] if v['workPackage'] == scope['workPackage']}
    all_goals = {v['objectiveId'] for v in catalog['objectiveCoverage']['goals']}
    need(set(scope['objectiveIds']) == available or scope['workPackage'] == 'FA-09' and set(scope['objectiveIds']) == all_goals, 'REQUEST_OBJECTIVE_DENOMINATOR_CHANGED')
    anchor = scope.get('contextAnchor', {})
    required = {'rawInputSha256', 'runtimeManifestSha256', 'environmentIdentitySha256', 'projectAuthorizationSha256', 'agentDefinitionHashes', 'templateHashes'}
    need(isinstance(anchor, dict) and required <= set(anchor) and set(anchor) <= required | {'prototypeSha256', 'customerBundleSha256', 'evaluationDatasetSha256', 'heldOutDatasetSha256'}, 'REQUEST_CONTEXT_ANCHOR_INVALID')
    need(all(digest(v) for k, v in anchor.items() if k not in ('agentDefinitionHashes', 'templateHashes')), 'REQUEST_CONTEXT_DIGEST_INVALID')
    need(all(distinct_strings(anchor[k], 100) and all(digest(v) for v in anchor[k]) for k in ('agentDefinitionHashes', 'templateHashes')), 'REQUEST_DEFINITION_HASH_INVALID')
    need(scope.get('contextAnchorSHA256') == sha(canonical(anchor)), 'REQUEST_CONTEXT_HASH_MISMATCH')
    run = scope.get('run', {})
    need(re.fullmatch(RUN_RE, run.get('id', '')) and run.get('status') == 'failed' and run.get('outcome') == 'failed' and type(run.get('exitCode')) is int and run.get('exitCode') == 1, 'REQUEST_RUN_NOT_FIXED_FINAL')
    need(not any(run.get(k) for k in ('cancelled', 'lateEvidenceOnly', 'stopRequested')) and not scope.get('projectCancelled'), 'REQUEST_RUN_REVOKED')
    need(0 <= stamp(now) - stamp(scope.get('observedAt')) <= 180, 'REQUEST_SCOPE_NOT_FRESH')


def requests_from_report(body, body_sha, scope, catalog, now):
    """Strictly fail closed. Registration remains non-acceptance metadata."""
    need(isinstance(body, bytes) and 0 < len(body) <= MAX_REPORT and digest(body_sha) and sha(body) == body_sha, 'REQUEST_REPORT_HASH_MISMATCH')
    entries = validate_catalog(catalog)
    validate_scope(scope, catalog, now)
    report = json.loads(body)
    need(report.get('schemaVersion') == 1 and report.get('kind') == 'project-autonomy-validation' and report.get('simulated') is False and report.get('sourceStable') is True and report.get('status') == 'fail' and report.get('prerequisiteWaitEligible') is True, 'REQUEST_REPORT_NOT_RESOURCE_WAIT')
    need(all(report.get(k) == scope.get(k) for k in ('workspace', 'goalSpecHash', 'workPackage', 'sourceFingerprint')) and report.get('runId') == scope['run']['id'], 'REQUEST_REPORT_BINDING_CHANGED')
    started, finished = stamp(report.get('startedAt')), stamp(report.get('finishedAt'))
    need(started <= finished <= stamp(now) and stamp(now) - finished <= 180, 'REQUEST_REPORT_NOT_FRESH')
    checks = report.get('checks', [])
    need(len(checks) <= 1000 and len({v.get('id') for v in checks}) == len(checks) and set(scope['requiredCheckIds']) <= {v.get('id') for v in checks if v.get('required') is True}, 'REQUEST_CHECK_DENOMINATOR_INVALID')
    for check in checks:
        need(check.get('executed') is True and check.get('required') is True and check.get('status') in ('pass', 'unknown') and isinstance(check.get('command'), str) and 0 < len(check['command'].strip()) <= 4000 and digest(check.get('evidenceSha256')), 'REQUEST_ACTUAL_CHECK_FAILURE')
        need((type(check.get('exitCode')) is int and check['exitCode'] == 0) if check['status'] == 'pass' else (check.get('exitCode') is None or type(check.get('exitCode')) is int and check['exitCode'] in (1, 2)), 'REQUEST_ACTUAL_PROCESS_FAILURE')
        if 'tests' in check:
            counts = check['tests']
            need(set(counts) == {'total', 'passed', 'failed', 'skipped', 'unknown'} and all(type(v) is int and 0 <= v <= 1e9 for v in counts.values()) and counts['total'] > 0 and counts['total'] == sum(counts[k] for k in ('passed', 'failed', 'skipped', 'unknown')) and counts['failed'] == counts['skipped'] == 0 and (check['status'] != 'pass' or counts['unknown'] == 0), 'REQUEST_TEST_FAILURE_OR_EMPTY_DENOMINATOR')
    raw = report.get('prerequisiteStatusJson')
    need(isinstance(raw, str) and len(raw.encode()) <= 256 * 1024 and sha(raw) == report.get('prerequisiteStatusSha256'), 'REQUEST_PREREQUISITE_HASH_MISMATCH')
    status = json.loads(raw)
    need(status.get('schemaVersion') == 1 and status.get('kind') == 'project-autonomy-prerequisite-status' and status.get('simulated') is False and status.get('observationsAreAcceptance') is False, 'REQUEST_PREREQUISITE_SCHEMA_INVALID')
    need(all(status.get(k) == report.get(k) for k in ('runId', 'sourceFingerprint', 'goalSpecHash', 'workPackage')) and re.fullmatch('[a-f0-9]{32}', status.get('attempt', '')), 'REQUEST_PREREQUISITE_BINDING_CHANGED')
    observed = stamp(status.get('observedAt'))
    need(started <= observed <= finished and 0 <= stamp(now) - observed <= 180, 'REQUEST_PREREQUISITE_NOT_FRESH')
    waiting = status.get('waiting', [])
    need(0 < len(waiting) <= 14 and len({v.get('id') for v in waiting}) == len(waiting), 'REQUEST_PREREQUISITE_DENOMINATOR_INVALID')
    waiting_map = {}
    for item in waiting:
        name = item.get('id')
        need(name in NAMES and item.get('reasonCode') in REASONS, 'REQUEST_PREREQUISITE_KIND_INVALID')
        expected = 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING' if name == 'provider' else 'FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING' if name in ('native-execution', 'native-recovery') else 'CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING' if name == 'customer-installation' else 'FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING'
        if name == 'long-observation':
            seconds = item.get('actualObservedSeconds')
            need(type(seconds) is int and 0 <= seconds <= 259200 and item.get('requiredSeconds') == 259200, 'REQUEST_OBSERVATION_DURATION_INVALID')
            expected = 'LONG_OBSERVATION_IN_PROGRESS' if seconds < 259200 else 'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING'
        else:
            need('actualObservedSeconds' not in item and 'requiredSeconds' not in item, 'REQUEST_DURATION_WRONG_SCOPE')
        need(item.get('reasonCode') == expected, 'REQUEST_REASON_SCOPE_MISMATCH')
        waiting_map[name] = item
    mappings = report.get('waitingPrerequisites', [])
    unknown = {v['id'] for v in checks if v['status'] == 'unknown'}
    need(unknown and 0 < len(mappings) <= 1000 and len({(v.get('id'), v.get('checkId')) for v in mappings}) == len(mappings), 'REQUEST_UNKNOWN_MAPPING_INVALID')
    need(unknown == {v.get('checkId') for v in mappings} and set(waiting_map) == {v.get('id') for v in mappings}, 'REQUEST_UNKNOWN_MAPPING_INCOMPLETE')
    grouped = {}
    for mapping in mappings:
        name = mapping.get('id')
        need(name in entries and mapping.get('errorCode') == 'TRUSTED_PREREQUISITE_RECEIPT_MISSING' and mapping.get('checkId') in entries[name]['checkIds'] and scope['workPackage'] in entries[name]['workPackages'], 'REQUEST_UNTRUSTED_PRODUCER_MAPPING')
        need(distinct_strings(mapping.get('objectiveIds')) and set(mapping['objectiveIds']) <= set(scope['objectiveIds']) and set(mapping['objectiveIds']) <= set(entries[name]['objectiveIds']), 'REQUEST_UNTRUSTED_OBJECTIVE_MAPPING')
        group = grouped.setdefault(name, {'checkIds': [], 'objectiveIds': set()})
        group['checkIds'].append(mapping['checkId'])
        group['objectiveIds'].update(mapping['objectiveIds'])
    result = []
    for name, group in sorted(grouped.items()):
        identity = {k: scope[k] for k in ('projectId', 'sourceFingerprint', 'goalSpecHash', 'workspace', 'workPackage', 'contextAnchorSHA256')}
        identity['producerKind'] = name
        result.append({'id': sha(canonical(identity)), **identity, 'checkIds': sorted(group['checkIds']), 'objectiveIds': sorted(group['objectiveIds']), 'reasonCode': waiting_map[name]['reasonCode'], 'origin': {'runId': report['runId'], 'attempt': status['attempt'], 'fixedReportSHA256': body_sha, 'observedAt': status['observedAt']}, 'state': 'pending-adapter', 'observationsAreAcceptance': False})
    return result


class RequestOutbox:
    """Atomic idempotent pending registration; no effect/dispatch methods."""
    def __init__(self, path, max_requests=MAX_REQUESTS):
        need(type(max_requests) is int and 0 < max_requests <= MAX_REQUESTS, 'REQUEST_CAPACITY_INVALID')
        self.max_requests = max_requests
        self.db = sqlite3.connect(path, timeout=5)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS producer_requests(id TEXT PRIMARY KEY, identity TEXT NOT NULL,
            json TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS request_origins(request_id TEXT NOT NULL,report_sha TEXT NOT NULL,
            json TEXT NOT NULL,PRIMARY KEY(request_id,report_sha));
        ''')

    def enqueue(self, requests, now):
        stamp(now)
        need(isinstance(requests, list) and 0 < len(requests) <= 14, 'REQUEST_BATCH_INVALID')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            count = self.db.execute('SELECT COUNT(*) FROM producer_requests').fetchone()[0]
            for item in requests:
                identity = {k: item[k] for k in ('projectId', 'sourceFingerprint', 'goalSpecHash', 'workspace', 'workPackage', 'contextAnchorSHA256', 'producerKind')}
                serialized = canonical(identity)
                need(sha(serialized) == item.get('id') and item.get('state') == 'pending-adapter' and item.get('observationsAreAcceptance') is False, 'REQUEST_ITEM_INVALID')
                old = self.db.execute('SELECT identity,state,json FROM producer_requests WHERE id=?', (item['id'],)).fetchone()
                if old:
                    need(old[0] == serialized and json.loads(old[2])['checkIds'] == item['checkIds'] and json.loads(old[2])['objectiveIds'] == item['objectiveIds'], 'REQUEST_IDENTITY_COLLISION')
                    # Duplicate receipt never resurrects obsolete/cancelled state.
                else:
                    need(count < self.max_requests, 'REQUEST_OUTBOX_CAPACITY_REACHED')
                    self.db.execute('INSERT INTO producer_requests VALUES(?,?,?,?,?,?)', (item['id'], serialized, canonical(item), 'pending-adapter', now, now))
                    count += 1
                origin = item['origin']
                previous = self.db.execute('SELECT json FROM request_origins WHERE request_id=? AND report_sha=?', (item['id'], origin['fixedReportSHA256'])).fetchone()
                need(not previous or previous[0] == canonical(origin), 'REQUEST_REPORT_IDENTITY_CONFLICT')
                if not previous:
                    origins = self.db.execute('SELECT COUNT(*) FROM request_origins WHERE request_id=?', (item['id'],)).fetchone()[0]
                    need(origins < MAX_ORIGINS_PER_REQUEST, 'REQUEST_ORIGIN_CAPACITY_REACHED')
                self.db.execute('INSERT OR IGNORE INTO request_origins VALUES(?,?,?)', (item['id'], origin['fixedReportSHA256'], canonical(origin)))
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise
        return self.snapshot()

    def obsolete(self, project_id, source, goal, anchor, now):
        """Scope rotation only closes previous pending requests, never dispatches."""
        need(project_id == PROJECT and all(digest(v) for v in (source, goal, anchor)), 'REQUEST_ROTATION_INVALID')
        with self.db:
            for request_id, body in self.db.execute('SELECT id,json FROM producer_requests WHERE state=?', ('pending-adapter',)).fetchall():
                row = json.loads(body)
                if row['projectId'] == project_id and (row['sourceFingerprint'], row['goalSpecHash'], row['contextAnchorSHA256']) != (source, goal, anchor):
                    self.db.execute('UPDATE producer_requests SET state=?,updated_at=? WHERE id=?', ('obsolete', now, request_id))

    def cancel(self, project_id, now):
        need(project_id == PROJECT, 'REQUEST_PROJECT_INVALID')
        with self.db:
            self.db.execute('UPDATE producer_requests SET state=?,updated_at=? WHERE json_extract(json,\'$.projectId\')=? AND state=?', ('cancelled', now, project_id, 'pending-adapter'))

    def snapshot(self):
        rows = []
        for body, state in self.db.execute('SELECT json,state FROM producer_requests ORDER BY created_at,id LIMIT 10000'):
            item = json.loads(body)
            rows.append({**item, 'state': state})
        return {'schemaVersion': 1, 'kind': 'root-producer-request-index', 'requests': rows,
                'observationsAreAcceptance': False, 'producersInvoked': 0, 'trustedReceiptsCreated': 0}

    def close(self):
        self.db.close()


def trusted(path, private=False):
    path = Path(path)
    need(path.is_absolute() and '..' not in path.parts, 'REQUEST_PATH_INVALID')
    for parent in [*reversed(path.parents), path]:
        info = parent.lstat()
        need(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, 'REQUEST_PATH_NOT_ROOT_CONTROLLED')
        if stat.S_ISREG(info.st_mode):
            need(info.st_nlink == 1, 'REQUEST_FILE_LINK_INVALID')
    if private:
        need(path.lstat().st_mode & 0o077 == 0, 'REQUEST_PATH_NOT_PRIVATE')


def read_root(path, limit, private=False):
    trusted(path, private)
    need(stat.S_ISREG(Path(path).lstat().st_mode), 'REQUEST_ROOT_FILE_INVALID')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and 0 < info.st_size <= limit, 'REQUEST_ROOT_FILE_INVALID')
        return stream.read(limit + 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['enqueue', 'list'], required=True)
    parser.add_argument('--report-sha256')
    parser.add_argument('--scope-sha256')
    args = parser.parse_args()
    need(os.name == 'posix' and os.geteuid() == 0, 'REQUEST_ROOT_REQUIRED')
    trusted(__file__)
    trusted(STATE, True)
    db_path = STATE / 'requests.sqlite'
    if not db_path.exists():
        fd = os.open(db_path, os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_WRONLY, 0o600)
        os.close(fd)
    for side in [db_path, Path(str(db_path) + '-wal'), Path(str(db_path) + '-shm')]:
        if side.exists():
            trusted(side, True)
    outbox = RequestOutbox(db_path)
    try:
        if args.mode == 'enqueue':
            need(digest(args.report_sha256) and digest(args.scope_sha256), 'REQUEST_FIXED_HASH_ARGUMENT_REQUIRED')
            catalog = json.loads(read_root(CATALOG, 256 * 1024))
            body = read_root(PUBLIC / (args.report_sha256 + '.json'), MAX_REPORT)
            scope_body = read_root(STATE / 'scopes' / (args.scope_sha256 + '.json'), 64 * 1024, True)
            need(sha(scope_body) == args.scope_sha256, 'REQUEST_SCOPE_FILE_HASH_MISMATCH')
            requests = requests_from_report(body, args.report_sha256, json.loads(scope_body), catalog, utc())
            result = outbox.enqueue(requests, utc())
        else:
            need(args.report_sha256 is None and args.scope_sha256 is None, 'REQUEST_LIST_FIXED_ARGUMENTS_REQUIRED')
            result = outbox.snapshot()
        print(canonical(result))
    finally:
        outbox.close()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, sqlite3.Error) as exc:
        # No private path, raw report, model body or credentials in stdout.
        text = str(exc)
        code = text if re.fullmatch(r'[A-Z][A-Z0-9_]{1,100}', text) else 'REQUEST_OPERATION_FAILED'
        print(canonical({'schemaVersion': 1, 'kind': 'root-producer-request-error', 'errorCode': code, 'observationsAreAcceptance': False}))
        sys.exit(1)
