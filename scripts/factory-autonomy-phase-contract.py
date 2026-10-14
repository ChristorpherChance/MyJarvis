#!/usr/bin/python3
"""Trusted, finite FA02--09 behavioral and artifact collector.

This is a host/root tool, not a candidate shell API. It probes an already
installed isolated candidate while the FA01 coordinator keeps that API alive.
The candidate's evidence index is a locator, never a verdict: this tool reads
actual bytes and executes its own positive and negative assertions. An
independent reviewer must still evaluate every original acceptance clause.
No model requests, target deployment, host port or production database access.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import time
import uuid
import zipfile

DOCKER = '/usr/bin/docker'
TOOLS = Path('/opt/jarvis-development/software-factory')
PRIVATE_ROOT = Path('/var/lib/jarvis-development/101/autonomy-evidence')
BASE_URL = 'http://127.0.0.1:18930'
MAX_BYTES = 8 * 1024 * 1024
MAX_CALLS = 160
MAX_SECONDS = 300
HASH_RE = r'[a-f0-9]{64}'
UUID_RE = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
RUN_RE = r'(?:[a-f0-9]{40}|' + UUID_RE + ')'
PHASES = {
    'FA-02': [('fa02-input-contract', range(9, 12)), ('fa02-doc-history', [14]), ('fa02-trace-design-context', [12, 13, 15, 16, 17, 18, 19])],
    'FA-03': [('fa03-definition-model-context', [20, 21, 22]), ('fa03-session-tools-usage', [23, 24, 25]), ('fa03-template-versions', [26])],
    'FA-04': [('fa04-delegation-execution', [27, 28]), ('fa04-transaction-isolation', [29, 30, 33]), ('fa04-pause-recovery', [31, 32])],
    'FA-05': [('fa05-plan-build-ui', [34, 35, 36, 37, 38]), ('fa05-independent-tests-defects', [40, 41, 42]), ('fa05-reports-release-safety', [39, 43]), ('fa05-performance-data-pages', [44, 45, 46])],
    'FA-06': [('fa06-candidate-evaluation', [47, 48, 49, 50]), ('fa06-promotion-skill', [51, 52])],
    'FA-07': [('fa07-policy-workflow', [53, 54, 55, 56]), ('fa07-invalidation-controls', [57, 58, 59, 60]), ('fa07-progress-notifications', [61])],
    'FA-08': [('fa08-bundle-export-download', [62, 63, 64, 65]), ('fa08-install-use-recovery', [66, 67, 68])],
    'FA-09': [('fa09-e2e-autonomous', [69, 70]), ('fa09-exceptions-observation', [71, 72]), ('fa09-reuse-records', [73, 74])],
}
PHASE_RECEIPTS = {
    'FA-02': [], 'FA-03': ['provider'],
    'FA-04': ['native-execution', 'native-recovery'],
    'FA-05': ['ui-comparison', 'regression', 'performance-data'],
    'FA-06': ['agent-evaluation', 'agent-promotion'],
    'FA-07': ['jarvis-workflow', 'workflow-controls'],
    'FA-08': ['customer-installation'],
    'FA-09': ['e2e', 'long-observation', 'reuse-records'],
}
WAIT_REASONS = {
    'FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING', 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING',
    'FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING', 'CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING',
    'LONG_OBSERVATION_IN_PROGRESS', 'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING',
}
# Source-defined public endpoints plus new raw evidence resources. No arbitrary
# URL/program/candidate test command is ever accepted from the response.
READ_SUFFIXES = {
    'FA-02': ['requirements/rtm', 'requirements/rtm/health', 'design/catalog', 'design/baselines', 'design/source-audit'],
    'FA-03': ['ai/usage', 'ai/usage/breakdown', 'doc-templates', 'template-sets'],
    'FA-04': ['ai/delegations', 'ai/delegation-targets'],
    'FA-05': ['dev/plan', 'dev/plan/coverage', 'dev/build', 'dev/selftest/reports', 'acceptance/batches'],
    'FA-06': ['ai/improvements'],
    'FA-07': ['policy-gates', 'autonomy/workflows', 'autonomy/impacts', 'tasks', 'events'],
    'FA-08': ['delivery/manifest', 'delivery/installations', 'delivery/recovery-tests'],
    'FA-09': ['autonomy/workflows', 'autonomy/observations', 'autonomy/reuse', 'autonomy/records'],
}

# This constant program has a closed input protocol and bounded responses. It
# runs as UID1000 inside the coordinator-owned runtime, not a host shell.
HTTP_JS = r"""
const fs=require('node:fs');
(async()=>{
 const p=JSON.parse(fs.readFileSync(0,'utf8'));
 if(!p||Object.keys(p).some(k=>!['method','path','bodyBase64','headers','downloadHost'].includes(k)))throw Error('PROTOCOL');
 if(!['GET','POST','PUT','DELETE'].includes(p.method))throw Error('METHOD');
 let url;
 if(p.downloadHost){
   url=new URL(p.path); if(url.protocol!=='http:'||url.hostname!==p.downloadHost||url.port!=='9000'||url.username||url.password||p.method!=='GET')throw Error('DOWNLOAD');
 }else{
   if(typeof p.path!=='string'||!p.path.startsWith('/')||p.path.startsWith('//')||p.path.includes('\\')||/[\x00-\x1f\x7f]/.test(p.path))throw Error('PATH');
   url=new URL(p.path,'http://127.0.0.1:18930'); if(url.origin!=='http://127.0.0.1:18930')throw Error('ORIGIN');
 }
 if(p.headers&&Object.keys(p.headers).some(k=>!['content-type','cookie','idempotency-key'].includes(k)))throw Error('HEADER');
 const body=p.bodyBase64?Buffer.from(p.bodyBase64,'base64'):undefined;
 if(body&&body.length>8*1024*1024)throw Error('INPUT_LIMIT');
 const r=await fetch(url,{method:p.method,headers:p.headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
 const reader=r.body?.getReader(), chunks=[];let n=0;
 if(reader)for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>8*1024*1024){await reader.cancel();throw Error('OUTPUT_LIMIT')}chunks.push(Buffer.from(v.value));}
 const b=Buffer.concat(chunks);
 process.stdout.write(JSON.stringify({status:r.status,contentType:r.headers.get('content-type')||'',setCookie:r.headers.get('set-cookie')||'',bodyBase64:b.toString('base64')}));
})().catch(()=>{process.stdout.write(JSON.stringify({errorCode:'PHASE_HTTP_TRANSPORT_FAILED'}));process.exitCode=1});
"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':')).encode()


def canonical_goal_hash(value):
    return sha(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))


def docker_run(args, **options):
    return subprocess.run([DOCKER, '--host', 'unix:///var/run/docker.sock', *args],
                          env={'PATH': '/usr/bin:/bin', 'HOME': '/root', 'LANG': 'C.UTF-8'}, **options)


def need(value, code):
    if not value:
        raise ValueError(code)


def business_rejection(response, statuses, code):
    need(response.get('status') in statuses, code)
    value = response.get('value')
    error = value.get('error') if isinstance(value, dict) else None
    actual = error.get('code') if isinstance(error, dict) else value.get('code') if isinstance(value, dict) else None
    need(isinstance(actual, str) and re.fullmatch(r'[A-Z][A-Z0-9_]+', actual), 'GENERIC_MISSING_ROUTE_IS_NOT_BUSINESS_REJECTION')


def safe_code(exc):
    text = str(exc)
    return text if isinstance(exc, ValueError) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,100}', text) else 'PHASE_ASSERTION_FAILED'


class PrerequisiteWait(ValueError):
    def __init__(self, name, error_code='TRUSTED_PREREQUISITE_RECEIPT_MISSING'):
        super().__init__(error_code)
        self.name = name


def relative_public(value):
    need(isinstance(value, str) and 0 < len(value) <= 600 and '\\' not in value and not re.search(r'[\x00-\x1f\x7f:%?#]', value), 'EVIDENCE_PATH_INVALID')
    p = PurePosixPath(value)
    need(not p.is_absolute() and str(p) == value and all(v not in ('', '.', '..') and not v.startswith('.') for v in p.parts), 'EVIDENCE_PATH_INVALID')
    need(p.parts[0] in ('doc', 'docs', 'artifacts', 'delivery', 'dist'), 'EVIDENCE_PATH_NOT_PUBLIC')
    need(not any(re.search(r'(?:secret|private|credential|password|cookie|recording|chat-log|node_modules)', v, re.I) for v in p.parts), 'EVIDENCE_PATH_PRIVATE')
    return p


def safe_archive(archive):
    """Bound and validate names before any CRC test or decompression."""
    entries = archive.infolist()
    need(entries and len(entries) <= 10000 and sum(v.file_size for v in entries) <= 64 * 1024 * 1024,
         'ARCHIVE_ENTRY_OR_EXPANSION_LIMIT')
    names = []
    for item in entries:
        # orig_filename preserves the raw decoded member name before platform
        # normalization or null-byte truncation inside Python's ZipInfo.
        name = item.orig_filename
        need(isinstance(name, str) and 0 < len(name) <= 600 and not re.search(r'[\x00-\x1f\x7f\\:%?#]', name),
             'ARCHIVE_ENTRY_PATH_INVALID')
        path = PurePosixPath(name)
        need(not path.is_absolute() and str(path) == name.rstrip('/') and all(v not in ('', '.', '..') for v in path.parts),
             'ARCHIVE_ENTRY_PATH_INVALID')
        kind = stat.S_IFMT(item.external_attr >> 16)
        need(kind in (0, stat.S_IFREG, stat.S_IFDIR) and item.file_size <= MAX_BYTES and not item.flag_bits & 1,
             'ARCHIVE_LINK_ENCRYPTION_OR_FILE_LIMIT')
        names.append(name.rstrip('/'))
    need(len(names) == len(set(names)), 'ARCHIVE_DUPLICATE_OR_COLLIDING_PATH')
    return entries


def owned_labels(info, container, run_id, attempt, fingerprint):
    need(re.fullmatch(r'jarvis-fa01-[a-f0-9]{40}-runtime', container), 'RUNTIME_NAME_INVALID')
    need(info.get('Name') == '/' + container and info.get('State', {}).get('Running') is True, 'OWN_RUNTIME_NOT_RUNNING')
    labels = info.get('Config', {}).get('Labels', {})
    expected = {'jarvis.validation.runId': run_id, 'jarvis.validation.attempt': attempt,
                'jarvis.validation.role': 'project-autonomy-fa01', 'jarvis.validation.sourceFingerprint': fingerprint}
    need(all(labels.get(k) == v for k, v in expected.items()), 'OWN_RUNTIME_IDENTITY_MISMATCH')
    need(not info.get('HostConfig', {}).get('PortBindings') and not any(v for v in info.get('NetworkSettings', {}).get('Ports', {}).values()), 'HOST_PORTS_FORBIDDEN')
    need(info.get('HostConfig', {}).get('Privileged') is not True and info.get('HostConfig', {}).get('NetworkMode') not in ('host', 'bridge'), 'OWN_RUNTIME_ISOLATION_INVALID')


def trusted(path, private=False):
    p = Path(path)
    for item in [p, *p.parents]:
        row = item.lstat()
        need(not stat.S_ISLNK(row.st_mode) and row.st_uid == 0 and not row.st_mode & 0o022, 'PHASE_ROOT_TRUST_INVALID')
        if item == p and private:
            need(not row.st_mode & 0o077, 'PHASE_PRIVATE_DIRECTORY_REQUIRED')


def write_new(path, value, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(encoded(value))
        stream.flush()
        os.fsync(stream.fileno())


def load_evidence_io():
    path = TOOLS / 'project-autonomy-evidence.py'
    trusted(path)
    spec = importlib.util.spec_from_file_location('trusted_phase_evidence_io', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def actual_file(workspace, locator, expected_hash, expected_bytes, evidence_io=None):
    relative = relative_public(locator)
    helper = evidence_io or load_evidence_io()
    root = helper.open_directory(str(workspace))
    try:
        fd = helper.open_relative(root, str(relative))
        try:
            body = helper.read_fd(fd, MAX_BYTES)
        finally:
            os.close(fd)
    finally:
        os.close(root)
    need(type(expected_bytes) is int and len(body) == expected_bytes and re.fullmatch(HASH_RE, expected_hash or '') and sha(body) == expected_hash, 'EVIDENCE_BYTES_MISMATCH')
    return body


class Probe:
    def __init__(self, collector, check_id, objectives):
        self.collector, self.id, self.objectives = collector, check_id, objectives
        self.tests, self.proof = [], []

    def test(self, name, action):
        try:
            result = action()
            self.tests.append({'name': name, 'status': 'pass'})
            if result is not None:
                self.proof.append({'name': name, 'value': result})
            return result
        except Exception as exc:
            failure = safe_code(exc)
            waiting = isinstance(exc, PrerequisiteWait)
            self.tests.append({'name': name, 'status': 'unknown' if waiting else 'fail', 'errorCode': failure})
            self.collector.problems.append({'id': self.id, 'errorCode': failure, 'objectiveIds': self.objectives, 'assertion': name})
            if waiting:
                self.collector.waiting_prerequisites.append({'id': exc.name, 'checkId': self.id, 'errorCode': failure,
                    'sourceFingerprint': self.collector.fingerprint, 'goalSpecHash': self.collector.goal_hash,
                    'workPackage': self.collector.phase, 'objectiveIds': self.objectives})
            return None

    def done(self):
        failed = sum(v['status'] == 'fail' for v in self.tests)
        unknown = sum(v['status'] == 'unknown' for v in self.tests)
        status = 'fail' if failed else 'unknown' if unknown else 'pass'
        row = {'id': self.id, 'required': True, 'command': json.dumps(['trusted-phase-contract', self.collector.phase, self.id], separators=(',', ':')),
               'executed': True, 'status': status, 'exitCode': 1 if failed else 2 if unknown else 0,
               'evidenceSha256': sha(encoded({'tests': self.tests, 'proof': self.proof})),
               'tests': {'total': len(self.tests), 'passed': len(self.tests) - failed - unknown, 'failed': failed, 'skipped': 0, 'unknown': unknown}}
        self.collector.checks.append(row)
        self.collector.proofs.append({'id': self.id, 'objectiveIds': self.objectives, 'tests': self.tests, 'proof': self.proof})


class Collector:
    def __init__(self, phase, workspace, output, container, run_id, attempt, fingerprint, goal_hash, transport=None):
        self.phase, self.workspace, self.output, self.container = phase, Path(workspace), Path(output), container
        self.run_id, self.attempt, self.fingerprint, self.goal_hash = run_id, attempt, fingerprint, goal_hash
        self.started = time.monotonic()
        self.calls, self.cookie, self.projects = 0, '', set()
        self.checks, self.problems, self.proofs, self.artifacts, self.observations = [], [], [], [], []
        self.waiting_prerequisites = []
        self.prerequisite_status = None
        self.observer_export = {'status': 'not-attempted'}
        self.transport = transport
        self.primary = self.secondary = None
        self.index = None
        self.goal_spec = None
        self.evidence_io = None
        self.nonce = uuid.uuid4().hex

    def raw(self, path, method='GET', body=None, raw=None, authenticated=True, key=None, download_host=None):
        need(time.monotonic() - self.started < MAX_SECONDS and self.calls < MAX_CALLS, 'PHASE_EXECUTION_LIMIT')
        need(method in ('GET', 'POST', 'PUT', 'DELETE'), 'PHASE_METHOD_INVALID')
        need(isinstance(path, str), 'PHASE_PATH_INVALID')
        if not download_host:
            need(not re.search(r'[\x00-\x1f\x7f\\%]', path) and not any(v in ('.', '..') for v in path.split('?')[0].split('/')), 'PHASE_PATH_INVALID')
            allowed_global = {'/health', '/api/auth/login', '/api/projects', '/api/v1/ai/prompts', '/api/v1/ai/routes', '/api/v1/ai/models'}
            match = re.match(r'/api/(?:v1/)?projects/(' + UUID_RE + r')(?:/|$)', path)
            need(path in allowed_global or match and match.group(1) in self.projects, 'PHASE_READ_SCOPE_FORBIDDEN')
        if method != 'GET' and path not in ('/api/auth/login', '/api/projects'):
            match = re.match(r'/api/(?:v1/)?projects/(' + UUID_RE + r')(?:/|$)', path)
            need(match and match.group(1) in self.projects, 'PHASE_WRITE_SCOPE_FORBIDDEN')
        payload = raw if raw is not None else encoded(body) if body is not None else None
        headers = {}
        if body is not None:
            headers['content-type'] = 'application/json'
        elif raw is not None:
            headers['content-type'] = 'application/octet-stream'
        if authenticated and self.cookie and not download_host:
            headers['cookie'] = self.cookie
        if method != 'GET':
            headers['idempotency-key'] = key or str(uuid.uuid4())
        request = {'method': method, 'path': path, 'headers': headers}
        if payload is not None:
            request['bodyBase64'] = base64.b64encode(payload).decode()
        if download_host:
            request['downloadHost'] = download_host
        self.calls += 1
        if self.transport:
            response = self.transport(request)
        else:
            process = docker_run(['exec', '--user', '1000:1000', '--interactive', self.container,
                                  '/usr/local/bin/node', '-e', HTTP_JS], input=encoded(request), capture_output=True, timeout=20)
            need(process.returncode == 0 and len(process.stdout) <= 12 * 1024 * 1024, 'PHASE_HTTP_TRANSPORT_FAILED')
            response = json.loads(process.stdout)
        need(isinstance(response, dict) and type(response.get('status')) is int and 100 <= response['status'] <= 599, 'PHASE_HTTP_PROTOCOL_INVALID')
        blob = base64.b64decode(response.get('bodyBase64', ''), validate=True)
        need(len(blob) <= MAX_BYTES, 'PHASE_RESPONSE_LIMIT')
        try:
            value = json.loads(blob)
        except (ValueError, UnicodeError):
            value = None
        self.observations.append({'method': method, 'path': path.split('?')[0] if not download_host else 'owned-minio-download',
                                  'status': response['status'], 'bytes': len(blob), 'sha256': sha(blob)})
        return {'status': response['status'], 'value': value, 'body': blob, 'contentType': response.get('contentType', ''), 'setCookie': response.get('setCookie', '')}

    def json(self, path, method='GET', body=None, statuses=(200, 201), **kwargs):
        response = self.raw(path, method, body, **kwargs)
        need(response['status'] in statuses and isinstance(response['value'], (dict, list)), 'REQUIRED_ENDPOINT_OR_SCHEMA_MISSING')
        return response['value']

    def project(self, suffix, project=None):
        need(project or self.primary, 'ISOLATED_PROJECT_NOT_READY')
        return '/api/v1/projects/' + (project or self.primary) + '/' + suffix

    def export_prerequisites(self):
        """One fixed root export, no candidate program or caller-controlled mode."""
        program = TOOLS / 'project-autonomy-prerequisite-observer.py'
        if not program.is_file():
            self.observer_export = {'status': 'unavailable', 'reasonCode': 'OBSERVER_EXPORT_NOT_INSTALLED'}
            return
        try:
            trusted(program)
            identity = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'JARVIS_AUTONOMY_RUN_ID': self.run_id,
                        'JARVIS_VALIDATION_ATTEMPT': self.attempt, 'JARVIS_SOURCE_SHA256': self.fingerprint,
                        'JARVIS_GOAL_SPEC_HASH': self.goal_hash, 'JARVIS_WORK_PACKAGE': self.phase}
            result = subprocess.run(['/usr/bin/python3', str(program), '--mode', 'export', '--attempt-evidence', str(self.output.parent)],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20, env=identity)
            need(result.returncode == 0 and len(result.stdout) <= 256 * 1024, 'OBSERVER_EXPORT_UNAVAILABLE')
            summary = json.loads(result.stdout)
            need(summary.get('trustedReceiptsCreated') == 0, 'OBSERVER_EXPORT_MUST_NOT_CREATE_ACCEPTANCE')
            path = self.output.parent / 'prerequisite-status.json'
            trusted(path, private=True)
            info = path.lstat()
            need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= 256 * 1024, 'OBSERVER_STATUS_FILE_INVALID')
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as stream:
                body = stream.read(256 * 1024 + 1)
            row = self.validate_prerequisite_status(json.loads(body))
            declared = summary.get('evidence')
            need(isinstance(declared, dict) and declared.get('file') == 'prerequisite-status.json' and declared.get('sha256') == sha(body) and declared.get('bytes') == len(body), 'OBSERVER_STATUS_BYTES_MISMATCH')
            self.prerequisite_status = row
            self.observer_export = {'status': 'waiting', 'file': 'prerequisite-status.json', 'sha256': sha(body), 'bytes': len(body), 'trustedReceiptsCreated': 0}
        except Exception as exc:
            self.observer_export = {'status': 'unavailable', 'reasonCode': safe_code(exc)}

    def validate_prerequisite_status(self, row):
        need(isinstance(row, dict) and row.get('schemaVersion') == 1 and row.get('kind') == 'project-autonomy-prerequisite-status'
             and row.get('simulated') is False and row.get('observationsAreAcceptance') is False, 'OBSERVER_STATUS_SCHEMA_INVALID')
        expected = {'runId': self.run_id, 'attempt': self.attempt, 'sourceFingerprint': self.fingerprint, 'goalSpecHash': self.goal_hash, 'workPackage': self.phase}
        need(all(row.get(k) == v for k, v in expected.items()), 'OBSERVER_STATUS_IDENTITY_MISMATCH')
        observed = row.get('observedAt')
        need(isinstance(observed, str), 'OBSERVER_STATUS_TIMESTAMP_INVALID')
        observed_time = datetime.fromisoformat(observed.replace('Z', '+00:00'))
        need(observed_time.tzinfo is not None and observed_time.utcoffset().total_seconds() == 0
             and 0 <= (datetime.now(timezone.utc) - observed_time).total_seconds() <= 180, 'OBSERVER_STATUS_STALE_OR_FUTURE')
        waiting = row.get('waiting')
        all_names = {v for names in PHASE_RECEIPTS.values() for v in names}
        need(isinstance(waiting, list) and len(waiting) <= 14 and len({v.get('id') for v in waiting}) == len(waiting), 'OBSERVER_WAITING_DENOMINATOR_INVALID')
        clean = []
        for item in waiting:
            need(isinstance(item, dict) and item.get('id') in all_names and item.get('reasonCode') in WAIT_REASONS, 'OBSERVER_WAITING_METADATA_INVALID')
            out = {'id': item['id'], 'reasonCode': item['reasonCode']}
            if item['id'] == 'long-observation':
                actual, required = item.get('actualObservedSeconds'), item.get('requiredSeconds')
                need(type(actual) in (int, float) and type(required) is int and required == 72 * 3600 and 0 <= actual <= required, 'OBSERVER_DURATION_METADATA_INVALID')
                out.update({'actualObservedSeconds': actual, 'requiredSeconds': required})
            if item['id'] in PHASE_RECEIPTS[self.phase]:
                clean.append(out)
        return {'schemaVersion': 1, 'kind': 'project-autonomy-prerequisite-status', 'simulated': False,
                **expected, 'waiting': clean, 'observedAt': observed, 'observationsAreAcceptance': False, 'nextCheckSeconds': 60}

    def setup(self):
        health = self.json('/health')
        need(health.get('ok') is True and health.get('db') and health.get('redis') and health.get('minio'), 'PHASE_API_NOT_HEALTHY')
        need(self.raw('/api/projects', authenticated=False)['status'] == 401, 'PHASE_AUTH_NOT_ENFORCED')
        login = self.raw('/api/auth/login', 'POST', {'username': os.environ.get('JARVIS_VALIDATION_USER'), 'password': os.environ.get('JARVIS_VALIDATION_PASSWORD')}, authenticated=False)
        need(login['status'] in (200, 201) and login['value'].get('ok') is True and 'HttpOnly' in login['setCookie'], 'PHASE_AUTHENTICATION_FAILED')
        self.cookie = login['setCookie'].split(';')[0]
        for label in ('primary', 'secondary'):
            name = 'Jarvis phase ' + self.phase + ' ' + label + ' ' + self.nonce
            row = self.json('/api/projects', 'POST', {'name': name, 'description': 'isolated fixed-contract fixture', 'isDemo': False})
            pid = row.get('id')
            need(re.fullmatch(UUID_RE, pid or ''), 'PHASE_PROJECT_CREATE_FAILED')
            self.projects.add(pid)
            setattr(self, label, pid)
            read = self.json('/api/projects/' + pid)
            need(read.get('name') == name, 'PHASE_PROJECT_READBACK_FAILED')

    def upload(self, name, data):
        base = self.project('materials/')
        start = self.json(base + 'uploads', 'POST', {'fileName': name, 'size': len(data), 'sha256': sha(data)})
        uid = start.get('uploadId')
        need(re.fullmatch(UUID_RE, uid or ''), 'UPLOAD_SESSION_INVALID')
        chunks = start.get('parts')
        need(type(chunks) is int and chunks == 1, 'UPLOAD_PART_PROTOCOL_INVALID')
        part = self.raw(base + 'uploads/' + uid + '/parts/1', 'PUT', raw=data)
        need(part['status'] in (200, 201, 204), 'UPLOAD_PART_FAILED')
        return self.raw(base + 'uploads/' + uid + ':complete', 'POST', {})

    def get_index(self):
        if self.index is not None:
            return self.index
        row = self.json(self.project('autonomy/evidence?workPackage=' + self.phase))
        need(row.get('schemaVersion') == 1 and row.get('projectId') == self.primary and row.get('workPackage') == self.phase,
             'PHASE_EVIDENCE_IDENTITY_INVALID')
        need(row.get('sourceFingerprint') == self.fingerprint and row.get('goalSpecHash') == self.goal_hash,
             'PHASE_EVIDENCE_BASELINE_STALE')
        need(isinstance(row.get('resources'), list) and len(row['resources']) <= 100 and isinstance(row.get('objectiveEvidence'), list),
             'PHASE_EVIDENCE_SCHEMA_INVALID')
        ids = [r.get('id') for r in row['resources'] if isinstance(r, dict)]
        need(len(ids) == len(row['resources']) and len(set(ids)) == len(ids) and all(isinstance(v, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,120}', v) for v in ids),
             'PHASE_RESOURCE_IDS_INVALID')
        self.index = row
        return row

    def evidence(self, probe):
        """Actual bytes for every original clause; semantics remain review-owned."""
        index = self.get_index()
        by_id = {r['id']: r for r in index['resources']}
        goal_map = {v['id']: v for v in self.goal_spec['objectives']}
        expected = set(probe.objectives)
        entries = [v for v in index['objectiveEvidence'] if v.get('objectiveId') in expected]
        need(len(entries) == len(expected) and {v['objectiveId'] for v in entries} == expected, 'OBJECTIVE_EVIDENCE_INCOMPLETE')
        checked = {}
        for entry in entries:
            objective = goal_map[entry['objectiveId']]
            clauses = entry.get('acceptanceEvidence')
            need(isinstance(clauses, list) and len(clauses) == len(objective['acceptance']), 'ACCEPTANCE_EVIDENCE_INCOMPLETE')
            need([v.get('index') for v in clauses] == list(range(len(objective['acceptance']))), 'ACCEPTANCE_EVIDENCE_INDEX_INVALID')
            for clause in clauses:
                refs = clause.get('resourceIds')
                need(isinstance(refs, list) and refs and len(refs) <= 100 and len(set(refs)) == len(refs) and all(v in by_id for v in refs), 'ACCEPTANCE_RESOURCE_REFERENCES_INVALID')
                for rid in refs:
                    if rid in checked:
                        continue
                    r = by_id[rid]
                    need(r.get('projectId') == self.primary and isinstance(r.get('kind'), str) and 0 < len(r['kind']) <= 100 and isinstance(r.get('version'), str) and 0 < len(r['version']) <= 200, 'RESOURCE_IDENTITY_INVALID')
                    body = actual_file(self.workspace, r.get('path'), r.get('sha256'), r.get('bytes'), self.evidence_io)
                    # Status/pass/cost claims in a JSON object are not executable
                    # evidence. Every locator needs raw semantic content.
                    need(len(body) >= 32 and r['kind'] not in ('verdict', 'self-assessment', 'status-only'), 'SELF_REPORTED_VERDICT_NOT_EVIDENCE')
                    checked[rid] = {'id': rid, 'path': r['path'], 'sha256': sha(body), 'bytes': len(body), 'kind': r['kind'], 'version': r['version']}
                    self.artifacts.append({'path': r['path'], 'sha256': sha(body), 'bytes': len(body)})
        return {'clauseReferencesVerified': sum(len(e['acceptanceEvidence']) for e in entries),
                'actualResources': list(checked.values()), 'semanticAcceptance': 'independent-review-required'}

    def endpoint_inventory(self, suffixes):
        result = []
        for suffix in suffixes:
            row = self.json(self.project(suffix))
            need(isinstance(row, dict), 'PHASE_RESOURCE_SCHEMA_INVALID')
            need(len(row) <= 256 and all(isinstance(k, str) and len(k) <= 120 for k in row), 'PHASE_RESOURCE_SCHEMA_LIMIT')
            result.append({'resource': suffix, 'keys': sorted(row.keys()), 'sha256': sha(encoded(row))})
        return result

    def run_group(self, check_id, numbers):
        ids = ['MSF-OBJ-%03d' % v for v in numbers]
        probe = Probe(self, check_id, ids)
        function = getattr(self, check_id.replace('-', '_'))
        probe.test('trusted-isolated-runtime-ready', lambda: need(self.primary and self.secondary, 'ISOLATED_PROJECT_NOT_READY'))
        if self.primary:
            function(probe)
            probe.test('every-original-clause-references-real-current-resource-bytes', lambda: self.evidence(probe))
        probe.done()

    def fa02_input_contract(self, p):
        state = {}
        def accepted():
            markers = ['BEGIN-' + self.nonce, 'MIDDLE-' + self.nonce, 'END-' + self.nonce]
            text = '# Fixed raw source\n' + markers[0] + '\n' + ('中文 Français Deutsch English\n' * 700) + markers[1] + '\n' + ('independent long input\n' * 1300) + markers[2]
            data = text.encode()
            result = self.upload('source-' + self.nonce + '.md', data)
            need(result['status'] in (200, 201) and isinstance(result['value'], dict), 'ACCEPTED_UPLOAD_FAILED')
            fid = result['value'].get('file', {}).get('id')
            need(re.fullmatch(UUID_RE, fid or ''), 'ACCEPTED_UPLOAD_FILE_INVALID')
            source = self.json(self.project('materials/files/' + fid + '?view=source'))
            url = source.get('url')
            # The coordinator explicitly gives its verified owned Minio the
            # private-network alias "minio"; no arbitrary download host.
            host = 'minio'
            fetched = self.raw(url, download_host=host)
            need(fetched['status'] == 200 and fetched['body'] == data, 'ORIGINAL_UPLOAD_BYTES_NOT_PRESERVED')
            state.update(fileId=fid, markers=markers)
            return {'fileId': fid, 'sourceBytes': len(data), 'sourceSha256': sha(data), 'longerThan24000': len(data) > 24000}
        p.test('original-multilingual-long-source-byte-preservation', accepted)
        def parse():
            need(state, 'UPLOAD_FIXTURE_NOT_READY')
            fid = state['fileId']
            self.json(self.project('materials/files/' + fid + ':parse'), 'POST', {}, statuses=(200, 201, 202))
            until = time.monotonic() + 55
            while time.monotonic() < until:
                row = self.json(self.project('materials/files/' + fid))
                text = row.get('parsedMd') or ''
                if all(v in text for v in state['markers']):
                    return {'fileId': fid, 'parsedBytes': len(text.encode()), 'allThreeCanariesObserved': True}
                if row.get('status') in ('failed', 'parse_failed'):
                    raise ValueError('LONG_PARSE_FAILED')
                time.sleep(0.5)
            raise ValueError('LONG_PARSE_TRUNCATED_OR_TIMED_OUT')
        p.test('actual-parse-preserves-start-middle-end-without-context-truncation', parse)
        def malicious():
            before = self.json(self.project('materials/files')).get('total')
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
                z.writestr('../escape-' + self.nonce + '.txt', 'must never write')
            result = self.upload('unsafe-' + self.nonce + '.zip', buf.getvalue())
            business_rejection(result, (400, 409, 413, 422), 'UNSAFE_ZIP_NOT_REJECTED')
            after = self.json(self.project('materials/files')).get('total')
            need(type(before) is int and after == before, 'UNSAFE_ZIP_PARTIAL_WRITE')
            return {'rejectedStatus': result['status'], 'fileCountUnchanged': True}
        p.test('zip-traversal-rejects-before-any-file-row-is-written', malicious)

    def fa02_doc_history(self, p):
        def history():
            self.json(self.project('requirements/docs'))
            path = self.project('requirements/docs/crd')
            first = self.json(path)
            need(first.get('secs') and type(first.get('cur')) is int and first['cur'] > 0, 'DOCUMENT_BASELINE_INVALID')
            old = self.json(path + '?v=' + str(first['cur']))
            base = first['cur']
            content = '# Fixed original requirement\n\nREQ-' + self.nonce + '\n用户必须能真实创建并保存事项。'
            saved = self.json(path + '/draft', 'POST', {'secId': 's0', 'md': content, 'baseVersion': base, 'baseFingerprint': first.get('contentFingerprint')})
            current = self.json(path)
            need(content in '\n'.join(str(v.get('md', '')) for v in current.get('secs', [])) and current.get('modified') is True, 'DRAFT_READBACK_FAILED')
            stale = self.raw(path + '/draft', 'POST', {'secId': 's0', 'md': 'late stale destructive update', 'baseVersion': base, 'baseFingerprint': first.get('contentFingerprint')})
            business_rejection(stale, (409,), 'DOCUMENT_STALE_WRITE_NOT_REJECTED')
            after_stale = self.json(path)
            need(after_stale.get('contentFingerprint') == current.get('contentFingerprint'), 'DOCUMENT_STALE_WRITE_CHANGED_STATE')
            commit = self.json(path + '/versions:commit', 'POST', {'baseVersion': base, 'note': 'fixed contract current bytes'})
            need(type(commit.get('v')) is int and commit['v'] > base, 'DOCUMENT_COMMIT_NOT_NEW_VERSION')
            old_after = self.json(path + '?v=' + str(base))
            need(old.get('secs') == old_after.get('secs') and old.get('viewing') == old_after.get('viewing'), 'HISTORICAL_CONTENT_MUTATED')
            versions = self.json(path + '/versions').get('items')
            need(isinstance(versions, list) and len(versions) >= 2 and all(v.get('readonly') is True for v in versions), 'VERSION_HISTORY_NOT_IMMUTABLE')
            foreign = self.raw(self.project('requirements/docs/crd', self.secondary) + '/references', 'POST', {'fileId': str(uuid.uuid4())})
            business_rejection(foreign, (400, 404, 409, 422), 'UNKNOWN_REFERENCE_NOT_REJECTED')
            return {'originalVersion': base, 'newVersion': commit['v'], 'historicSectionsUnchanged': True, 'staleWriteZeroChange': True, 'draftHash': sha(encoded(saved))}
        p.test('real-draft-lock-commit-historical-readback-and-foreign-reference', history)

    def fa02_trace_design_context(self, p):
        p.test('actual-requirement-design-catalog-baseline-source-audit-resources', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase]))
        def design():
            self.json(self.project('design/docs'))
            kinds = ['hld', 'mod', 'alg', 'cls', 'db', 'api', 'ui', 'nfr']
            result = []
            for kind in kinds:
                row = self.json(self.project('design/docs/' + kind))
                need(row.get('secs') and row.get('contentFingerprint'), 'DESIGN_DOCUMENT_RESOURCE_INCOMPLETE')
                result.append({'kind': kind, 'id': row.get('id'), 'contentFingerprint': row['contentFingerprint']})
            return result
        p.test('hld-and-all-seven-lld-distinct-current-resources', design)

    def fa03_definition_model_context(self, p):
        def definitions():
            prompts = self.json('/api/v1/ai/prompts').get('items')
            need(isinstance(prompts, list) and prompts, 'AGENT_DEFINITIONS_NOT_CONFIGURED')
            current = [v for v in prompts if v.get('is_current') is True]
            keys = [v.get('agent_key') for v in current]
            need(current and len(set(keys)) == len(keys) and all(type(v.get('version_no')) is int and v['version_no'] > 0 and v.get('base_prompt') for v in current), 'AGENT_EFFECTIVE_VERSIONS_INVALID')
            routes = self.json('/api/v1/ai/routes')
            models = self.json('/api/v1/ai/models')
            return {'activeDefinitionCount': len(current), 'activeVersionContentHashes': [sha(encoded({k: v.get(k) for k in ('agent_key', 'version_no', 'base_prompt', 'overlay_text', 'skill_pack')})) for v in current], 'routeResourceHash': sha(encoded(routes)), 'modelResourceHash': sha(encoded(models)), 'providerActuallyInvokedHere': False}
        p.test('effective-agent-versions-and-model-route-resources-actual-read', definitions)
        # Strong-model/token/context truth is a separate root-owned provider
        # receipt. Candidate aliases cannot establish 1M capability or cost.
        p.test('trusted-real-model-route-and-context-receipt', lambda: self.trusted_receipt('provider', ['requestedModel', 'returnedModel', 'usage', 'contextCapabilityEvidence'], required_model='gpt-6.1-sol[1m]'))

    def fa03_session_tools_usage(self, p):
        def sessions():
            base = self.project('ai/')
            created = self.json(base + 'sessions', 'POST', {'ctx': 'req', 'name': 'fixed-' + self.nonce})
            sid = created.get('id') or created.get('sessionId')
            need(re.fullmatch(UUID_RE, sid or ''), 'SESSION_CREATE_FAILED')
            listing = self.json(base + 'sessions?limit=100')
            need(any(v.get('id') == sid for v in listing.get('items', [])), 'SESSION_PERSISTENCE_NOT_OBSERVED')
            self.json(base + 'sessions/' + sid + ':rename', 'POST', {'name': 'renamed-' + self.nonce})
            listing2 = self.json(base + 'sessions?limit=100')
            need(any(v.get('id') == sid and v.get('name') == 'renamed-' + self.nonce for v in listing2.get('items', [])), 'SESSION_RENAME_READBACK_FAILED')
            self.json(base + 'sessions/' + sid + '/messages')
            tools = self.json(base + 'tools')
            invalid = self.raw(base + 'tools:invoke', 'POST', {'sessionId': sid, 'toolName': 'shell.arbitrary-root-command', 'args': {'command': 'must-never-execute'}})
            business_rejection(invalid, (400, 403, 404, 409, 422), 'ARBITRARY_TOOL_NOT_REJECTED')
            return {'sessionId': sid, 'persistedRename': True, 'toolInventoryHash': sha(encoded(tools)), 'arbitraryToolRejected': True}
        p.test('actual-session-persistence-rename-and-closed-tool-negative', sessions)
        p.test('usage-resources-and-ledger-aggregation', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase][:2]))

    def fa03_template_versions(self, p):
        def templates():
            before = self.json(self.project('doc-templates'))
            kinds = {v.get('kind') for v in before.get('items', [])}
            need({'crd', 'prd', 'hld', 'mod', 'alg', 'cls', 'db', 'api', 'ui', 'nfr'} <= kinds, 'TEMPLATE_KINDS_INCOMPLETE')
            created = self.json(self.project('template-sets'), 'POST', {'name': 'fixed-' + self.nonce, 'description': 'isolated template clone', 'cloneFrom': 'default'})
            sid = created.get('id') or created.get('setId')
            need(re.fullmatch(UUID_RE, sid or ''), 'TEMPLATE_SET_CREATE_INVALID')
            self.json(self.project('template-binding'), 'PUT', {'setId': sid})
            after = self.json(self.project('doc-templates'))
            need(after.get('activeSetId') == sid and {v.get('kind') for v in after.get('items', [])} == kinds, 'TEMPLATE_BINDING_READBACK_INVALID')
            return {'templateSetId': sid, 'allKindsPreserved': True, 'boundReadback': True}
        p.test('complete-template-set-clone-binding-and-default-fallback', templates)

    def fa04_delegation_execution(self, p):
        p.test('actual-delegation-and-target-resources', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase]))
        def closed():
            bad = self.raw(self.project('ai/delegations'), 'POST', {'target': 'unregistered-' + self.nonce, 'taskDesc': 'negative closed registry', 'workspaceScope': '/etc', 'budgetLimit': 1})
            business_rejection(bad, (400, 403, 404, 409, 422), 'UNREGISTERED_EXECUTOR_NOT_REJECTED')
            return {'unregisteredTargetRejected': True}
        p.test('unregistered-executor-and-external-workspace-negative', closed)
        p.test('trusted-native-cli-actual-execution-parent-child-receipt', lambda: self.trusted_receipt('native-execution', ['nativeSessionId', 'parentRunId', 'childRunIds', 'workspace', 'processIdentity', 'usage', 'artifactHashes']))

    def fa04_transaction_isolation(self, p):
        def isolation():
            path = self.project('materials/folders')
            key = str(uuid.uuid4())
            body = {'name': 'dedup-' + self.nonce}
            first = self.json(path, 'POST', body, key=key)
            second = self.json(path, 'POST', body, key=key)
            need(first.get('folderId') and first.get('folderId') == second.get('folderId'), 'COMMAND_DUPLICATE_CREATED_SECOND_RESOURCE')
            changed = self.raw(path, 'POST', {'name': 'conflict-' + self.nonce}, key=key)
            business_rejection(changed, (409,), 'IDEMPOTENCY_KEY_REUSE_NOT_CONFLICT')
            tree = self.json(self.project('materials/tree'))
            other = self.json(self.project('materials/tree', self.secondary))
            need(self.nonce.encode() in encoded(tree) and self.nonce.encode() not in encoded(other), 'PROJECT_STATE_LEAK')
            return {'sameKeySameResource': True, 'differentPayloadConflict': True, 'projectIsolation': True}
        p.test('same-command-id-replay-conflict-and-cross-project-isolation', isolation)

    def fa04_pause_recovery(self, p):
        p.test('trusted-owned-process-pause-cancel-late-write-and-native-recovery', lambda: self.trusted_receipt('native-recovery', ['nativeSessionId', 'beforeProcessIdentity', 'afterProcessIdentity', 'cancelledChildIds', 'lateWriteRejected', 'usageReconciled', 'restartObserved']))

    def fa05_plan_build_ui(self, p):
        p.test('actual-plan-coverage-build-resources', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase][:3]))
        p.test('actual-page-browser-comparison-and-current-package-receipt', lambda: self.trusted_receipt('ui-comparison', ['prototypeIdentity', 'implementationIdentity', 'pageCases', 'requiredCases', 'screenshots', 'criticalMismatchCount']))

    def fa05_independent_tests_defects(self, p):
        p.test('actual-test-batches-and-report-resources', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase][3:]))
        def reject():
            bad = self.raw(self.project('acceptance/batches/' + str(uuid.uuid4()) + '/report:generate'), 'POST', {'status': 'pass', 'coverage': 100, 'simulated': True})
            business_rejection(bad, (400, 404, 409, 422), 'FAKE_REPORT_CREATE_NOT_REJECTED')
            return {'nonexistentBatchFakePassRejected': True}
        p.test('fabricated-empty-batch-pass-negative', reject)
        p.test('trusted-defect-fix-and-independent-new-build-regression', lambda: self.trusted_receipt('regression', ['failedBuildHash', 'fixedBuildHash', 'defectIds', 'firstFailure', 'regressionTests', 'independentExecutor']))

    def fa05_reports_release_safety(self, p):
        def negative():
            path = self.project('dev/transfer')
            before = self.json(self.project('acceptance/handoffs/pending'))
            first = self.raw(path, 'POST', {'reportId': str(uuid.uuid4()), 'reportFingerprint': 'sha256:' + '0' * 64, 'confirm': True})
            business_rejection(first, (400, 404, 409, 422, 423), 'FAKE_REPORT_HANDOFF_NOT_REJECTED')
            after = self.json(self.project('acceptance/handoffs/pending'))
            need(before == after, 'FAKE_REPORT_CREATED_PENDING_HANDOFF')
            return {'unknownReportRejected': True, 'status': first['status'], 'pendingHandoffsUnchanged': True}
        p.test('fake-report-old-fingerprint-cannot-transfer', negative)

    def fa05_performance_data_pages(self, p):
        def response():
            measures = []
            for _ in range(10):
                start = time.monotonic()
                self.json('/health')
                measures.append(time.monotonic() - start)
            return {'samples': len(measures), 'transportInclusiveMaxMs': round(max(measures) * 1000, 2), 'performanceThresholdAcceptance': 'trusted-load-receipt-required'}
        p.test('actual-bounded-health-responsiveness-samples', response)
        p.test('trusted-load-migration-security-and-full-page-receipt', lambda: self.trusted_receipt('performance-data', ['concurrency', 'taskCount', 'fileCount', 'p95Ms', 'stateTransitionMs', 'migrationRestoreHashes', 'pageCases']))

    def fa06_candidate_evaluation(self, p):
        p.test('actual-capability-improvement-resource', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase]))
        p.test('trusted-stable-candidate-independent-held-out-evaluation', lambda: self.trusted_receipt('agent-evaluation', ['stableDefinitionHash', 'candidateDefinitionHash', 'evaluationDatasetHash', 'heldOutDatasetHash', 'independentEvaluator', 'qualityResults', 'usage', 'budgetScope']))

    def fa06_promotion_skill(self, p):
        p.test('trusted-version-promotion-fixed-inflight-and-rollback-adoption', lambda: self.trusted_receipt('agent-promotion', ['oldVersion', 'newVersion', 'inflightDefinitionHash', 'newRunDefinitionHash', 'rollbackRunDefinitionHash', 'verifiedSkillHash', 'actualAdoptionRunId']))

    def fa07_policy_workflow(self, p):
        def policies():
            before = self.json(self.project('policy-gates'))
            gates = before.get('gates')
            need(isinstance(gates, list) and len(gates) == 7 and len({v.get('gateKey') for v in gates}) == 7, 'SEVEN_QUALITY_GATES_INCOMPLETE')
            for gate in gates:
                key = gate['gateKey']
                self.json(self.project('policy-gates/' + key + ':set-mode'), 'POST', {'mode': 'auto', 'reason': 'fixed isolated authorization ' + self.nonce})
            after = self.json(self.project('policy-gates'))
            need(all(v.get('mode') == 'auto' for v in after.get('gates', [])) and len(after['gates']) == 7, 'AUTO_POLICY_CONFIGURATION_NOT_PERSISTED')
            return {'sevenModesReadBackAuto': True, 'automaticAdvanceAcceptance': 'real-system-decisions-required'}
        p.test('seven-quality-gate-auto-policy-persists-with-events', policies)
        p.test('actual-workflow-resource', lambda: self.endpoint_inventory(['autonomy/workflows']))
        p.test('trusted-jarvis-durable-project-authorization-and-system-decisions', lambda: self.trusted_receipt('jarvis-workflow', ['jarvisSourceHash', 'projectAuthorizationHash', 'leaseEvents', 'systemGateDecisions', 'restartObserved', 'nonGateActionDecisions']))

    def fa07_invalidation_controls(self, p):
        p.test('actual-upstream-impact-resource', lambda: self.endpoint_inventory(['autonomy/impacts']))
        p.test('trusted-cancel-lease-late-retry-source-and-full-dag-invalidation', lambda: self.trusted_receipt('workflow-controls', ['beforeSourceHash', 'afterSourceHash', 'invalidatedArtifacts', 'unaffectedArtifacts', 'pauseReceipt', 'cancelReceipt', 'lateCompletionRejected', 'quotaRecovery', 'noProgressStop']))

    def fa07_progress_notifications(self, p):
        p.test('actual-task-event-progress-resources', lambda: self.endpoint_inventory(['tasks', 'events']))

    def fa08_bundle_export_download(self, p):
        def bundle():
            manifest = self.json(self.project('delivery/manifest'))
            need(manifest.get('schemaVersion') == 1 and manifest.get('projectId') == self.primary and re.fullmatch(UUID_RE, manifest.get('releaseId') or ''), 'DELIVERY_MANIFEST_IDENTITY_INVALID')
            files = manifest.get('files')
            need(isinstance(files, list) and files and len(files) <= 10000, 'DELIVERY_MANIFEST_EMPTY')
            need(len({v.get('path') for v in files}) == len(files), 'DELIVERY_MANIFEST_DUPLICATE')
            content = []
            for item in files:
                body = actual_file(self.workspace, item.get('path'), item.get('sha256'), item.get('bytes'), self.evidence_io)
                content.append({'path': item['path'], 'sha256': sha(body), 'bytes': len(body), 'role': item.get('role'), 'format': item.get('format')})
            roles = {v['role'] for v in content}
            need({'software', 'requirements', 'design', 'prototype', 'tests', 'installation', 'user-guide', 'admin-guide', 'migration', 'rollback', 'support'} <= roles, 'DELIVERY_REQUIRED_DOCUMENT_ROLES_MISSING')
            formats = {v['format'] for v in content if v['role'] != 'software'}
            need({'md', 'html', 'docx', 'pdf'} <= formats, 'DELIVERY_DOCUMENT_FORMATS_MISSING')
            requested = manifest.get('requestedFormats')
            need(isinstance(requested, list) and set(requested) == {'md', 'html', 'docx', 'pdf'}, 'DELIVERY_REQUESTED_FORMATS_NOT_BOUND')
            for role in roles - {'software'}:
                need(set(requested) <= {v['format'] for v in content if v['role'] == role}, 'DELIVERY_ROLE_FORMAT_COVERAGE_INCOMPLETE')
            # Byte signatures and zip CRC validation are independent of the API's
            # declaration. Rendering/layout/semantic completeness remain review.
            for item in files:
                body = actual_file(self.workspace, item['path'], item['sha256'], item['bytes'], self.evidence_io)
                fmt = item.get('format')
                if fmt == 'pdf':
                    need(body.startswith(b'%PDF-') and b'%%EOF' in body[-2048:], 'PDF_NOT_REAL_OR_TRUNCATED')
                elif fmt == 'docx':
                    with zipfile.ZipFile(io.BytesIO(body)) as z:
                        safe_archive(z)
                        need(z.testzip() is None and '[Content_Types].xml' in z.namelist() and 'word/document.xml' in z.namelist(), 'DOCX_NOT_REAL_OR_CORRUPT')
                elif fmt in ('md', 'html'):
                    text = body.decode('utf-8')
                    need(len(text.strip()) > 40 and (fmt != 'html' or '<' in text), 'TEXT_EXPORT_EMPTY_OR_INVALID')
            path = self.project('delivery/releases/' + manifest['releaseId'] + '/download')
            downloadable = self.raw(path)
            need(downloadable['status'] == 200 and len(downloadable['body']) > 128 and manifest.get('bundleSha256') == sha(downloadable['body']), 'CUSTOMER_BUNDLE_DOWNLOAD_BYTES_MISMATCH')
            archive = zipfile.ZipFile(io.BytesIO(downloadable['body']))
            with archive:
                entries = safe_archive(archive)
                need(archive.testzip() is None, 'CUSTOMER_BUNDLE_ARCHIVE_CORRUPT')
                names = archive.namelist()
                manifest_names = {v.get('archivePath') or v['path'] for v in files}
                need({v.filename for v in entries if not v.is_dir()} <= manifest_names | {'manifest.json'}, 'CUSTOMER_BUNDLE_UNMANIFESTED_FILE')
                for item in files:
                    name = item.get('archivePath') or item['path']
                    need(name in names and sha(archive.read(name)) == item['sha256'], 'CUSTOMER_BUNDLE_FILE_NOT_ACTUAL_OR_WRONG_VERSION')
            return {'releaseId': manifest['releaseId'], 'downloadBytes': len(downloadable['body']), 'bundleSha256': sha(downloadable['body']), 'files': content}
        p.test('actual-all-document-formats-bundle-download-decompress-hashes', bundle)

    def fa08_install_use_recovery(self, p):
        p.test('actual-delivery-install-and-recovery-record-resources', lambda: self.endpoint_inventory(READ_SUFFIXES[self.phase][1:]))
        p.test('trusted-target-clean-install-user-crud-restart-migrate-and-full-restore', lambda: self.trusted_receipt('customer-installation', ['bundleSha256', 'targetIdentity', 'cleanInstall', 'userTaskResults', 'administratorTaskResults', 'restartPersistence', 'migrationResult', 'factoryRestoreHashes', 'customerRestoreHashes', 'rollbackResult', 'supportResponsibility']))

    def fa09_e2e_autonomous(self, p):
        p.test('actual-e2e-workflow-resources', lambda: self.endpoint_inventory(['autonomy/workflows']))
        p.test('trusted-raw-input-to-all-products-real-use-without-manual-gate-clicks', lambda: self.trusted_receipt('e2e', ['rawInputSha256', 'factoryVersion', 'customerVersion', 'allStageArtifacts', 'requiredRequirementIds', 'coveredRequirementIds', 'manualGateClickCount', 'failedThenFixed', 'customerUseReceipt', 'archiveReceipt']))

    def fa09_exceptions_observation(self, p):
        p.test('actual-observation-resource', lambda: self.endpoint_inventory(['autonomy/observations']))
        p.test('trusted-real-exception-matrix-and-24-72-hour-observation', lambda: self.trusted_receipt('long-observation', ['observerIdentity', 'chainHash', 'startedAt', 'finishedAt', 'durationSeconds', 'samples', 'exceptions', 'usage', 'modelIdleCalls']))

    def fa09_reuse_records(self, p):
        p.test('actual-reuse-and-construction-record-resources', lambda: self.endpoint_inventory(['autonomy/reuse', 'autonomy/records']))
        p.test('trusted-second-project-isolation-and-immutable-build-records', lambda: self.trusted_receipt('reuse-records', ['firstProjectId', 'secondProjectId', 'newGoalHash', 'newEnvironmentIdentity', 'secondProjectAcceptance', 'recordChainHashes', 'versionProtectedSync', 'privateDataExported']))

    def trusted_receipt(self, name, required_fields, required_model=None):
        """Read only coordinator-side root receipts, never candidate files.

        Missing or old receipts fail closed; the orchestrator classifies the
        exact missing prerequisite without claiming a repaired product. Merely
        copying an API's JSON into this directory is forbidden by the publisher
        contract and is not a valid independent observation.
        """
        folder = self.output.parent / 'trusted-receipts'
        if not folder.is_dir():
            raise PrerequisiteWait(name)
        trusted(folder, private=True)
        path = folder / (name + '.json')
        if not path.is_file():
            raise PrerequisiteWait(name)
        trusted(path, private=True)
        info = path.lstat()
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= MAX_BYTES, 'TRUSTED_RECEIPT_FILE_INVALID')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as stream:
            body = stream.read(MAX_BYTES + 1)
        row = json.loads(body)
        need(row.get('schemaVersion') == 1 and row.get('kind') == 'trusted-phase-observation' and row.get('simulated') is False,
             'TRUSTED_RECEIPT_SCHEMA_INVALID')
        need(row.get('runId') == self.run_id and row.get('attempt') == self.attempt and row.get('sourceFingerprint') == self.fingerprint and row.get('goalSpecHash') == self.goal_hash and row.get('name') == name,
             'TRUSTED_RECEIPT_IDENTITY_MISMATCH')
        need(row.get('producer') in ('root-fixed-provider-observer', 'root-fixed-native-observer', 'root-fixed-browser-observer', 'root-fixed-workflow-observer', 'root-fixed-delivery-observer', 'root-fixed-long-observer'), 'TRUSTED_RECEIPT_PRODUCER_INVALID')
        result = row.get('observations')
        need(isinstance(result, dict) and all(k in result and result[k] is not None for k in required_fields), 'TRUSTED_RECEIPT_OBSERVATIONS_INCOMPLETE')
        need(isinstance(row.get('rawEvidence'), list) and row['rawEvidence'], 'TRUSTED_RECEIPT_RAW_EVIDENCE_MISSING')
        # Root observer stores actual raw bytes beside its private receipt; every
        # entry is a flat filename, never a candidate path or public URL.
        proofs = []
        for ref in row['rawEvidence']:
            file_name = ref.get('file')
            need(isinstance(file_name, str) and re.fullmatch(r'[a-zA-Z0-9_-]+\.(?:json|log|png|bin|zip|pdf)', file_name), 'TRUSTED_RAW_PATH_INVALID')
            raw_path = folder / file_name
            trusted(raw_path, private=True)
            raw_info = raw_path.lstat()
            need(stat.S_ISREG(raw_info.st_mode) and raw_info.st_nlink == 1 and 0 < raw_info.st_size <= MAX_BYTES, 'TRUSTED_RAW_FILE_INVALID')
            fd = os.open(raw_path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as stream:
                raw_body = stream.read(MAX_BYTES + 1)
            need(len(raw_body) == ref.get('bytes') and sha(raw_body) == ref.get('sha256'), 'TRUSTED_RAW_BYTES_MISMATCH')
            proofs.append({'sha256': sha(raw_body), 'bytes': len(raw_body)})
        if required_model:
            need(result['requestedModel'] == required_model and isinstance(result['returnedModel'], str) and result['returnedModel'], 'STRONG_MODEL_ROUTE_NOT_ACTUAL')
            usage = result['usage']
            need(isinstance(usage, dict) and type(usage.get('known')) is bool and type(usage.get('calls')) is int and usage['calls'] > 0,
                 'REAL_MODEL_CALL_OR_USAGE_RECORD_MISSING')
            need(usage.get('tokens') is None and usage['known'] is False or type(usage.get('tokens')) is int and usage['tokens'] > 0 and usage['known'] is True,
                 'REAL_MODEL_USAGE_UNKNOWN_MUST_BE_EXPLICIT')
            context = result['contextCapabilityEvidence']
            need(isinstance(context, dict) and context.get('observed') is True and context.get('rawEvidenceSha256') in {v['sha256'] for v in proofs}, 'MODEL_CONTEXT_CAPABILITY_NOT_OBSERVED')
        if name == 'long-observation':
            need(type(result['durationSeconds']) in (int, float) and result['durationSeconds'] >= 72 * 3600 and type(result['samples']) is int and result['samples'] >= 72 and result['modelIdleCalls'] == 0,
                 'REAL_72_HOUR_OBSERVATION_NOT_COMPLETE')
            start = datetime.fromisoformat(result['startedAt'].replace('Z', '+00:00'))
            finish = datetime.fromisoformat(result['finishedAt'].replace('Z', '+00:00'))
            need(start.tzinfo is not None and finish.tzinfo is not None and finish <= datetime.now(timezone.utc) and abs((finish - start).total_seconds() - result['durationSeconds']) < 2,
                 'OBSERVATION_TIMESTAMP_OR_DURATION_INVALID')
            need(isinstance(result['exceptions'], list) and result['exceptions'] and all(v.get('actual') is True and v.get('safeResult') is True for v in result['exceptions']), 'EXCEPTION_MATRIX_NOT_ACTUALLY_OBSERVED')
        if name == 'e2e':
            need(result['manualGateClickCount'] == 0 and result['coveredRequirementIds'] and set(result['requiredRequirementIds']) == set(result['coveredRequirementIds']), 'E2E_NORMAL_AUTOMATION_OR_COVERAGE_NOT_COMPLETE')
            need(isinstance(result['allStageArtifacts'], list) and len(result['allStageArtifacts']) >= 8 and result['failedThenFixed'] is True and result['customerUseReceipt'] and result['archiveReceipt'], 'E2E_REAL_FIX_USE_OR_ARTIFACT_CHAIN_MISSING')
        if name == 'ui-comparison':
            need(result['criticalMismatchCount'] == 0 and result['requiredCases'] and set(result['requiredCases']) <= set(result['pageCases']), 'UI_REQUIRED_CASES_NOT_ALL_ACTUAL')
            need(result['prototypeIdentity'] != result['implementationIdentity'] and result['screenshots'], 'PROTOTYPE_AND_IMPLEMENTATION_NOT_DISTINCT')
        if name == 'regression':
            need(result['failedBuildHash'] != result['fixedBuildHash'] and result['defectIds'] and result['regressionTests'], 'DEFECT_FIX_NOT_INDEPENDENT_NEW_BUILD')
        if name == 'native-recovery':
            need(result['lateWriteRejected'] is True and result['usageReconciled'] is True and result['restartObserved'] is True, 'NATIVE_RECOVERY_NOT_ACTUAL')
            need(result['nativeSessionId'] and result['beforeProcessIdentity'] != result['afterProcessIdentity'] and isinstance(result['cancelledChildIds'], list) and result['cancelledChildIds'], 'NATIVE_PROCESS_RESUME_OR_CHILD_CANCEL_MISSING')
        if name == 'native-execution':
            need(result['nativeSessionId'] and result['parentRunId'] and result['childRunIds'] and result['processIdentity'] and result['artifactHashes'], 'NATIVE_EXECUTION_NOT_ACTUAL')
        if name == 'performance-data':
            need(result['concurrency'] >= 20 and result['taskCount'] >= 100 and result['fileCount'] >= 1000 and 0 <= result['p95Ms'] < 1000 and 0 <= result['stateTransitionMs'] < 500 and result['migrationRestoreHashes'] and result['pageCases'], 'CURRENT_REQUIRED_PERFORMANCE_NOT_MET')
        if name == 'agent-evaluation':
            need(result['stableDefinitionHash'] != result['candidateDefinitionHash'] and result['evaluationDatasetHash'] != result['heldOutDatasetHash'] and result['independentEvaluator'] and result['budgetScope'] == 'agent-improvement', 'AGENT_EVALUATION_ISOLATION_INVALID')
            need(isinstance(result['qualityResults'], list) and result['qualityResults'] and all(v.get('required') is True and v.get('candidatePassed') is True and v.get('stablePassed') is True for v in result['qualityResults']), 'AGENT_CANDIDATE_QUALITY_OR_CROSS_STAGE_REGRESSION_FAILED')
        if name == 'agent-promotion':
            need(result['oldVersion'] != result['newVersion'] and result['inflightDefinitionHash'] != result['newRunDefinitionHash'] and result['rollbackRunDefinitionHash'] == result['inflightDefinitionHash'] and result['actualAdoptionRunId'] and re.fullmatch(HASH_RE, result['verifiedSkillHash'] or ''), 'PROMOTION_INFLIGHT_ROLLBACK_OR_SKILL_ADOPTION_NOT_ACTUAL')
        if name == 'jarvis-workflow':
            decisions = result['systemGateDecisions']
            need(re.fullmatch(HASH_RE, result['jarvisSourceHash'] or '') and result['leaseEvents'] and result['restartObserved'] is True and isinstance(decisions, list) and len(decisions) >= 7 and all(v.get('actorKind') == 'system' and v.get('outcome') == 'pass' and v.get('evidenceHash') for v in decisions) and result['nonGateActionDecisions'], 'DURABLE_AUTO_SYSTEM_GATE_DECISIONS_NOT_ACTUAL')
        if name == 'workflow-controls':
            need(result['beforeSourceHash'] != result['afterSourceHash'] and result['invalidatedArtifacts'] and isinstance(result['unaffectedArtifacts'], list) and result['pauseReceipt'] and result['cancelReceipt'] and result['lateCompletionRejected'] is True and result['quotaRecovery'] is True and result['noProgressStop'] is True, 'DAG_INVALIDATION_OR_AUTONOMY_CONTROLS_NOT_ACTUAL')
        if name == 'customer-installation':
            need(result['cleanInstall'] is True and result['restartPersistence'] is True and result['migrationResult'] is True and result['rollbackResult'] is True and result['supportResponsibility'] and result['factoryRestoreHashes'] and result['customerRestoreHashes'], 'REAL_INSTALL_MIGRATE_RESTART_OR_RESTORE_NOT_COMPLETE')
            for kind in ('userTaskResults', 'administratorTaskResults'):
                need(isinstance(result[kind], list) and result[kind] and all(v.get('actual') is True and v.get('passed') is True for v in result[kind]), 'CUSTOMER_USER_OR_ADMIN_REAL_USE_NOT_COMPLETE')
        if name == 'reuse-records':
            need(result['firstProjectId'] != result['secondProjectId'] and result['privateDataExported'] is False and result['versionProtectedSync'] is True, 'REUSE_OR_RECORD_ISOLATION_FAILED')
        return {'receiptName': name, 'receiptSha256': sha(body), 'rawEvidence': proofs, 'rootObserved': True}

    def run(self):
        try:
            self.setup()
        except Exception as exc:
            self.problems.append({'id': 'phase-setup', 'errorCode': safe_code(exc)})
        for check_id, numbers in PHASES[self.phase]:
            self.run_group(check_id, numbers)
        # Export after assertions so the root observation timestamp is still
        # fresh when the coordinator verifies and binds the actual unknown rows.
        if self.transport is None:
            self.export_prerequisites()
        unique = {v['path']: v for v in self.artifacts}
        return {'schemaVersion': 1, 'kind': 'trusted-factory-phase-contract', 'simulated': False,
                'workPackage': self.phase, 'runId': self.run_id, 'attempt': self.attempt,
                'sourceFingerprint': self.fingerprint, 'goalSpecHash': self.goal_hash,
                'status': 'fail' if any(v['status'] == 'fail' for v in self.checks) else 'unknown' if self.waiting_prerequisites else 'pass',
                'checks': self.checks, 'problems': self.problems, 'artifacts': list(unique.values()),
                'waitingPrerequisites': self.waiting_prerequisites,
                'prerequisiteStatus': self.prerequisite_status, 'observerExport': self.observer_export,
                'proofs': self.proofs, 'observations': self.observations,
                'limits': {'maxCalls': MAX_CALLS, 'maxSeconds': MAX_SECONDS, 'modelRequestsIssued': 0, 'externalNetworkUsed': False},
                'acceptanceBoundary': 'Fixed behavior/byte checks plus every clause reference. All semantics require independent review; no self-reported progress accepted.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work-package', required=True, choices=PHASES)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--container', required=True)
    parser.add_argument('--base-url', default=BASE_URL, choices=[BASE_URL])
    args = parser.parse_args()
    need(os.name == 'posix' and os.geteuid() == 0, 'PHASE_HOST_ROOT_REQUIRED')
    trusted(Path(__file__).resolve())
    run_id = os.environ.get('JARVIS_AUTONOMY_RUN_ID', '')
    attempt = os.environ.get('JARVIS_VALIDATION_ATTEMPT', '')
    fingerprint = os.environ.get('JARVIS_SOURCE_SHA256', '')
    goal_hash = os.environ.get('JARVIS_GOAL_SPEC_HASH', '')
    need(re.fullmatch(RUN_RE, run_id) and re.fullmatch(r'[a-f0-9]{32}', attempt) and re.fullmatch(HASH_RE, fingerprint) and re.fullmatch(HASH_RE, goal_hash), 'PHASE_IDENTITY_INVALID')
    need(os.environ.get('JARVIS_VALIDATION_USER') and os.environ.get('JARVIS_VALIDATION_PASSWORD'), 'PHASE_TEMPORARY_AUTH_MISSING')
    output, workspace = Path(args.output), Path(args.workspace)
    need(output.is_absolute() and output.name == 'phase-contract.json' and output.parent.resolve().is_relative_to(PRIVATE_ROOT), 'PHASE_OUTPUT_SCOPE_INVALID')
    trusted(output.parent, private=True)
    need(workspace.is_absolute() and workspace.resolve().is_relative_to(output.parent.parent) and workspace.name == 'source', 'PHASE_WORKSPACE_SCOPE_INVALID')
    for item in [workspace, *workspace.parents]:
        need(not stat.S_ISLNK(item.lstat().st_mode), 'PHASE_WORKSPACE_LINK_FORBIDDEN')
    inspected = docker_run(['inspect', args.container], capture_output=True, timeout=10)
    need(inspected.returncode == 0 and len(inspected.stdout) < MAX_BYTES, 'OWN_RUNTIME_INSPECT_FAILED')
    rows = json.loads(inspected.stdout)
    need(isinstance(rows, list) and len(rows) == 1, 'OWN_RUNTIME_INSPECT_INVALID')
    owned_labels(rows[0], args.container, run_id, attempt, fingerprint)
    network_name = args.container.removesuffix('-runtime') + '-net'
    need(rows[0].get('HostConfig', {}).get('NetworkMode') == network_name, 'OWN_NETWORK_IDENTITY_MISMATCH')
    network = docker_run(['network', 'inspect', network_name], capture_output=True, timeout=10)
    need(network.returncode == 0 and len(network.stdout) < MAX_BYTES, 'OWN_NETWORK_INSPECT_FAILED')
    nets = json.loads(network.stdout)
    need(len(nets) == 1 and nets[0].get('Internal') is True, 'EXTERNAL_NETWORK_FORBIDDEN')
    labels = nets[0].get('Labels', {})
    need(labels.get('jarvis.validation.runId') == run_id and labels.get('jarvis.validation.attempt') == attempt and labels.get('jarvis.validation.sourceFingerprint') == fingerprint,
         'OWN_NETWORK_LABELS_MISMATCH')
    peer_names = {v.get('Name') for v in nets[0].get('Containers', {}).values()}
    prefix = args.container.removesuffix('-runtime')
    need(peer_names <= {prefix + '-' + v for v in ('postgres', 'redis', 'minio', 'build', 'runtime')} and prefix + '-minio' in peer_names, 'UNOWNED_NETWORK_PEER_FORBIDDEN')
    policy = TOOLS / 'objectives-r22.json'
    trusted(policy)
    goal_bytes = policy.read_bytes()
    goal_spec = json.loads(goal_bytes)
    need(canonical_goal_hash(goal_spec) == goal_hash, 'PHASE_GOAL_SPEC_HASH_MISMATCH')
    collector = Collector(args.work_package, workspace, output, args.container, run_id, attempt, fingerprint, goal_hash)
    collector.goal_spec = goal_spec
    collector.evidence_io = load_evidence_io()
    actual_ids = {v['id'] for v in collector.goal_spec['objectives'] if v['workPackage'] == args.work_package}
    expected_ids = {'MSF-OBJ-%03d' % v for _, nums in PHASES[args.work_package] for v in nums}
    need(actual_ids == expected_ids, 'PHASE_GOAL_COVERAGE_MISMATCH')
    result = collector.run()
    write_new(output, result)
    summary = {'status': result['status'], 'workPackage': args.work_package, 'checks': len(result['checks']),
               'failed': sum(v['status'] != 'pass' for v in result['checks']), 'errorCodes': sorted({v['errorCode'] for v in result['problems']})}
    print(json.dumps(summary, separators=(',', ':')))
    return 0 if result['status'] == 'pass' else 2 if result['status'] == 'unknown' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print(json.dumps({'status': 'fail', 'errorCode': safe_code(exc)}, separators=(',', ':')))
        sys.exit(1)
