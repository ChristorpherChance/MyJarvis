#!/usr/bin/python3
"""Root fixed observers for resource prerequisites; never a model or shell API.

Health, accounting and installation observations are facts with an explicit
scope. A Jarvis CLI delivery is NOT the factory's internal provider proof; a
factory installation is NOT a customer installation. Incomplete observations
publish waiting metadata and never manufacture a trusted-phase-observation.
Production entry points use only the installed root policy, closed targets and
bounded fixed argv. Tests call the pure ledger/projection helpers directly.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import ssl
import stat
import subprocess
import sys
import time
import urllib.request

TOOLS = Path('/opt/jarvis-development/software-factory')
POLICY = Path('/etc/jarvis-development/project-autonomy/prerequisite-observer.json')
STATE = Path('/var/lib/jarvis-development/101/autonomy-observer')
CENTRAL_STATE = Path('/var/lib/jarvis/autonomy-observer')
EVIDENCE = Path('/var/lib/jarvis-development/101/autonomy-evidence')
EXECUTION_DB = Path('/var/lib/jarvis/data/execution/execution.sqlite')
USAGE_DB = Path('/var/lib/jarvis/data/jarvis.db')
DOCKER = '/usr/bin/docker'
UNIT = 'jarvis-software-factory-development.service'
MAX_BYTES = 8 * 1024 * 1024
MAX_GAP = 180
REQUIRED_SECONDS = 72 * 3600
RUN_RE = r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'
NAMES = ('provider', 'native-execution', 'native-recovery', 'ui-comparison',
         'regression', 'performance-data', 'agent-evaluation', 'agent-promotion',
         'jarvis-workflow', 'workflow-controls', 'customer-installation', 'e2e',
         'long-observation', 'reuse-records')


def need(condition, code):
    if not condition:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def sha(body):
    return hashlib.sha256(body if isinstance(body, bytes) else body.encode()).hexdigest()


def utc(stamp=None):
    return datetime.fromtimestamp(time.time() if stamp is None else stamp, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def trusted(path, private=False):
    """All parents root controlled, no links; DB opens need stable ancestors."""
    p = Path(path)
    need(p.is_absolute() and '..' not in p.parts, 'OBSERVER_PATH_INVALID')
    for item in [*reversed(p.parents), p]:
        info = item.lstat()
        need(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
             'OBSERVER_PATH_NOT_ROOT_CONTROLLED')
        if stat.S_ISREG(info.st_mode):
            need(info.st_nlink == 1, 'OBSERVER_FILE_LINK_INVALID')
    info = p.lstat()
    if private:
        need(info.st_mode & 0o077 == 0, 'OBSERVER_PATH_NOT_PRIVATE')


def trusted_database(path, owner_uid):
    # The signed central application, rather than root, may own its live DB.
    # Its exact UID is sealed by the installer, never selected by a worker.
    need(type(owner_uid) is int and 0 <= owner_uid < 65536, 'CENTRAL_DB_OWNER_NOT_CONFIGURED')
    p = Path(path)
    need(p in (EXECUTION_DB, USAGE_DB), 'CENTRAL_DB_SCOPE_INVALID')
    for item in [*reversed(p.parents), p]:
        info = item.lstat()
        need(not stat.S_ISLNK(info.st_mode) and info.st_uid in (0, owner_uid) and not info.st_mode & 0o022,
             'CENTRAL_DB_TRUST_BOUNDARY_INVALID')
    info = p.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == owner_uid and info.st_nlink == 1 and p.parent.lstat().st_mode & 0o077 == 0,
         'CENTRAL_DB_PRIVATE_BOUNDARY_INVALID')
    for suffix in ('-wal', '-shm'):
        side = Path(str(p) + suffix)
        if side.exists():
            state = side.lstat()
            need(stat.S_ISREG(state.st_mode) and state.st_uid == owner_uid and state.st_nlink == 1 and not state.st_mode & 0o022,
                 'CENTRAL_DB_SIDECAR_BOUNDARY_INVALID')


def read_private(path):
    trusted(path, private=True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= MAX_BYTES, 'OBSERVER_FILE_INVALID')
        return stream.read(MAX_BYTES + 1)


def write_new(path, value):
    body = canonical(value).encode() if not isinstance(value, bytes) else value
    trusted(Path(path).parent, private=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    return {'file': Path(path).name, 'sha256': sha(body), 'bytes': len(body)}


def load_policy():
    need(os.name == 'posix' and os.geteuid() == 0, 'OBSERVER_ROOT_REQUIRED')
    trusted(__file__)
    trusted(POLICY)
    fd = os.open(POLICY, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        body = stream.read(64 * 1024 + 1)
    need(len(body) <= 64 * 1024, 'OBSERVER_POLICY_TOO_LARGE')
    policy = json.loads(body)
    need(policy.get('schemaVersion') == 1 and policy.get('kind') == 'project-autonomy-prerequisite-policy', 'OBSERVER_POLICY_INVALID')
    need(policy.get('role') in ('central', 'development') and re.fullmatch('[a-f0-9]{64}', policy.get('sourceFingerprint', '')) and re.fullmatch('[a-f0-9]{64}', policy.get('goalSpecHash', '')), 'OBSERVER_POLICY_IDENTITY_INVALID')
    need(policy.get('intervalSeconds') == 60 and policy.get('maxGapSeconds') == MAX_GAP and policy.get('requiredSeconds') == REQUIRED_SECONDS, 'OBSERVER_OBSERVATION_WINDOW_INVALID')
    policy['policyHash'] = sha(body)
    return policy


class ObservationLedger:
    """Real bounded intervals, boot identity and source-bound immutable chain.

    Restarting the observer on the same boot may preserve a short interval.
    Unhealthy/missing samples, boot changes, clock jumps or target/source/goal
    changes reset the continuous window. Never interpolate hours of downtime.
    This database is operational state, not an assertion that 72h passed.
    """
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=5)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS samples(seq INTEGER PRIMARY KEY, at REAL NOT NULL,
            mono REAL NOT NULL, boot TEXT NOT NULL, binding TEXT NOT NULL, healthy INTEGER NOT NULL,
            started REAL, seconds REAL NOT NULL, consecutive INTEGER NOT NULL,
            facts TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);
          CREATE TABLE IF NOT EXISTS facts(id TEXT PRIMARY KEY, kind TEXT NOT NULL, json TEXT NOT NULL);
        ''')

    def tick(self, at, mono, boot, binding, targets):
        need(type(at) in (float, int) and type(mono) in (float, int) and math.isfinite(at) and math.isfinite(mono) and at > 0 and mono >= 0 and bool(boot), 'OBSERVER_CLOCK_INVALID')
        at, mono = float(at), float(mono)
        need(bool(targets) and len(targets) <= 8, 'OBSERVER_TARGETS_INVALID')
        # Public facts contain only fixed statuses/identities, no raw payloads.
        healthy = all(v.get('healthy') is True for v in targets.values())
        self.db.execute('BEGIN IMMEDIATE')
        try:
            old = self.db.execute('SELECT seq,at,mono,boot,binding,healthy,started,seconds,consecutive,hash FROM samples ORDER BY seq DESC LIMIT 1').fetchone()
            continuous = bool(old and old[5] and healthy and boot == old[3] and binding == old[4] and
                              0 < at - old[1] <= MAX_GAP and 0 < mono - old[2] <= MAX_GAP and
                              abs((at - old[1]) - (mono - old[2])) <= 2)
            started = old[6] if continuous else at if healthy else None
            seconds = at - started if healthy else 0
            consecutive = old[8] + 1 if continuous else 1 if healthy else 0
            row = {'at': at, 'mono': mono, 'boot': boot, 'binding': binding, 'healthy': healthy,
                   'started': started, 'seconds': seconds, 'consecutive': consecutive,
                   'targets': targets, 'previous': old[9] if old else '0' * 64}
            digest = sha(canonical(row))
            self.db.execute('INSERT INTO samples(at,mono,boot,binding,healthy,started,seconds,consecutive,facts,previous,hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                            (at, mono, boot, binding, int(healthy), started, seconds, consecutive, canonical(targets), row['previous'], digest))
            self.db.commit()
            return {'healthy': healthy, 'startedAt': utc(started) if started is not None else None,
                    'finishedAt': utc(at), 'actualObservedSeconds': seconds, 'samples': consecutive,
                    'chainHash': digest, 'binding': binding}
        except BaseException:
            self.db.rollback()
            raise

    def current(self):
        row = self.db.execute('SELECT at,started,seconds,consecutive,hash,binding,healthy,facts FROM samples ORDER BY seq DESC LIMIT 1').fetchone()
        return None if not row else {'startedAt': utc(row[1]) if row[1] is not None else None,
                                    'finishedAt': utc(row[0]), 'actualObservedSeconds': row[2],
                                    'samples': row[3], 'chainHash': row[4], 'binding': row[5], 'healthy': bool(row[6]), 'scope': json.loads(row[7]).get('observation-scope')}

    def verify_chain(self):
        previous = '0' * 64
        for row in self.db.execute('SELECT at,mono,boot,binding,healthy,started,seconds,consecutive,facts,previous,hash FROM samples ORDER BY seq'):
            value = {'at': row[0], 'mono': row[1], 'boot': row[2], 'binding': row[3], 'healthy': bool(row[4]),
                     'started': row[5], 'seconds': row[6], 'consecutive': row[7], 'targets': json.loads(row[8]), 'previous': previous}
            need(row[9] == previous and row[10] == sha(canonical(value)), 'OBSERVER_CHAIN_INVALID')
            previous = row[10]
        return previous

    def save_fact(self, kind, value):
        body = canonical(value)
        key = sha(body)
        self.db.execute('INSERT OR IGNORE INTO facts VALUES(?,?,?)', (key, kind, body))
        self.db.commit()
        return key

    def close(self):
        self.db.close()


def open_ledger(policy):
    root = CENTRAL_STATE if policy['role'] == 'central' else STATE
    trusted(root, private=True)
    path = root / 'observer.sqlite'
    if path.exists():
        trusted(path, private=True)
    else:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
    for suffix in ('-wal', '-shm'):
        side = Path(str(path) + suffix)
        if side.exists():
            trusted(side, private=True)
    return ObservationLedger(path)


def fixed(argv, timeout=15, body=None):
    # Neither program nor args come from a model. Call sites below are finite.
    result = subprocess.run(argv, input=body, capture_output=True, timeout=timeout,
                            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, shell=False)
    need(result.returncode == 0 and len(result.stdout) <= MAX_BYTES, 'OBSERVER_FIXED_PROCESS_FAILED')
    return result.stdout


def container_identity(policy):
    target = policy.get('candidate')
    need(isinstance(target, dict) and re.fullmatch(r'jarvis-observer-[a-f0-9]{40}-runtime', target.get('container', '')),
         'CONTROLLED_LONG_CANDIDATE_NOT_CONFIGURED')
    info = json.loads(fixed([DOCKER, 'inspect', '--type', 'container', target['container']]))[0]
    labels = info.get('Config', {}).get('Labels', {})
    need(labels.get('jarvis.validation.role') == 'project-autonomy-long-candidate' and
         labels.get('jarvis.validation.sourceFingerprint') == policy['sourceFingerprint'] and
         labels.get('jarvis.validation.goalSpecHash') == policy['goalSpecHash'] and
         info.get('Image') == target.get('imageId') and re.fullmatch(r'sha256:[a-f0-9]{64}', target.get('imageId', '')),
         'CONTROLLED_CANDIDATE_IDENTITY_MISMATCH')
    need(not info.get('HostConfig', {}).get('Privileged') and not info.get('HostConfig', {}).get('PortBindings') and
         info.get('HostConfig', {}).get('NetworkMode') not in ('host', 'bridge') and
         info.get('HostConfig', {}).get('ReadonlyRootfs') is True and
         info.get('Config', {}).get('User') == '1000:1000', 'CONTROLLED_CANDIDATE_ISOLATION_INVALID')
    need(all(v.get('Destination') not in ('/var/run/docker.sock', '/run/docker.sock') for v in info.get('Mounts', [])),
         'CONTROLLED_CANDIDATE_SOCKET_FORBIDDEN')
    source_mount = [v for v in info.get('Mounts', []) if v.get('Destination') == '/work/source']
    root = STATE / 'candidates' / target['container'].split('-')[2] / 'source'
    need(len(source_mount) == 1 and source_mount[0].get('Source') == str(root) and source_mount[0].get('RW') is False,
         'CONTROLLED_CANDIDATE_SOURCE_NOT_IMMUTABLE')
    trusted(root)
    need(all(v.get('Type') != 'bind' or v.get('Destination') == '/work/source' for v in info.get('Mounts', [])),
         'CONTROLLED_CANDIDATE_OTHER_HOST_MOUNT_FORBIDDEN')
    helper = TOOLS / 'project-autonomy-evidence.py'
    trusted(helper)
    actual_source = json.loads(fixed(['/usr/bin/python3', str(helper), 'fingerprint', str(root)], timeout=30))
    need(actual_source.get('sha256') == policy['sourceFingerprint'], 'CONTROLLED_CANDIDATE_PUBLIC_SOURCE_CHANGED')
    need(runtime_manifest(root) == target.get('runtimeManifestSHA256'), 'CONTROLLED_CANDIDATE_RUNTIME_BYTES_CHANGED')
    networks = info.get('NetworkSettings', {}).get('Networks', {})
    need(len(networks) == 1, 'CONTROLLED_CANDIDATE_NETWORK_INVALID')
    network_name = next(iter(networks))
    need(re.fullmatch(r'jarvis-observer-[a-f0-9]{40}-net', network_name), 'CONTROLLED_CANDIDATE_NETWORK_INVALID')
    network = json.loads(fixed([DOCKER, 'network', 'inspect', network_name]))[0]
    need(network.get('Internal') is True and network.get('Labels', {}).get('jarvis.validation.goalSpecHash') == policy['goalSpecHash'],
         'CONTROLLED_CANDIDATE_NETWORK_INVALID')
    prefix = target['container'].removesuffix('-runtime')
    need({v.get('Name') for v in network.get('Containers', {}).values()} <= {prefix + '-' + v for v in ('runtime', 'postgres', 'redis', 'minio')},
         'CONTROLLED_CANDIDATE_UNOWNED_NETWORK_PEER')
    return {'container': target['container'], 'id': info['Id'], 'pid': info['State']['Pid'],
            'startedAt': info['State']['StartedAt'], 'running': info['State']['Running'],
            'sourceFingerprint': policy['sourceFingerprint'], 'goalSpecHash': policy['goalSpecHash']}


def runtime_manifest(root):
    # Root installer seals the actual installed package's executable output,
    # because public-source fingerprints deliberately exclude generated dist.
    files, total = [], 0
    for relative in ('apps/server/dist', 'apps/web/dist', 'packages/shared/dist'):
        folder = Path(root) / relative
        need(folder.is_dir() and not folder.is_symlink(), 'CONTROLLED_RUNTIME_OUTPUT_MISSING')
        for base, dirs, names in os.walk(folder, followlinks=False):
            need(all(not (Path(base) / v).is_symlink() for v in dirs), 'CONTROLLED_RUNTIME_LINK_INVALID')
            for name in sorted(names):
                path = Path(base) / name
                info = path.lstat()
                need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 20 * 1024 * 1024, 'CONTROLLED_RUNTIME_FILE_INVALID')
                total += info.st_size
                need(total <= 200 * 1024 * 1024 and len(files) < 20000, 'CONTROLLED_RUNTIME_MANIFEST_LIMIT')
                body = path.read_bytes()
                files.append({'path': path.relative_to(root).as_posix(), 'bytes': len(body), 'sha256': sha(body)})
    need(files, 'CONTROLLED_RUNTIME_OUTPUT_MISSING')
    return sha(canonical(sorted(files, key=lambda v: v['path'])))


NODE_HEALTH = "fetch('http://127.0.0.1:18930/health',{signal:AbortSignal.timeout(5000)}).then(async r=>{const v=await r.json();console.log(JSON.stringify({status:r.status,ok:v.ok===true,db:v.db===true,redis:v.redis===true,minio:v.minio===true}));process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"


def health_targets(policy):
    targets = {}
    try:
        ca = Path('/etc/jarvis-development/project-autonomy/jarvis-lan-ca.crt')
        trusted(ca)
        context = ssl.create_default_context(cafile=str(ca))
        # No HTTP redirects or permissive cert bypass; one installed LAN target.
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), NoRedirect())
        with opener.open('https://192.168.10.112:3140/api/health', timeout=10) as response:
            raw = response.read(64 * 1024 + 1)
            need(len(raw) <= 64 * 1024 and response.status == 200, 'PLATFORM_HEALTH_INVALID')
            value = json.loads(raw)
            need(value.get('status') == 'ok' and value.get('build') == policy.get('platformBuild'), 'PLATFORM_IDENTITY_CHANGED')
            targets['platform'] = {'healthy': True, 'identity': sha(canonical({k: value.get(k) for k in ('build', 'instanceId', 'nodeId', 'epoch')}))}
    except Exception:
        targets['platform'] = {'healthy': False, 'reasonCode': 'PLATFORM_HEALTH_OR_IDENTITY_UNAVAILABLE'}
    if policy['role'] == 'development':
        try:
            body = fixed(['/usr/bin/systemctl', 'show', UNIT, '--property=ActiveState,SubState,MainPID,InvocationID'])
            props = dict(line.split('=', 1) for line in body.decode().splitlines() if '=' in line)
            need(props.get('ActiveState') == 'active' and props.get('SubState') == 'running' and int(props.get('MainPID', '0')) > 0, 'NODE_UNIT_NOT_RUNNING')
            targets['development-node'] = {'healthy': True, 'identity': sha(canonical(props))}
        except Exception:
            targets['development-node'] = {'healthy': False, 'reasonCode': 'DEVELOPMENT_NODE_NOT_RUNNING'}
        try:
            identity = container_identity(policy)
            need(identity['running'], 'CONTROLLED_CANDIDATE_NOT_RUNNING')
            value = json.loads(fixed([DOCKER, 'exec', identity['id'], 'node', '-e', NODE_HEALTH], timeout=10))
            need(value == {'status': 200, 'ok': True, 'db': True, 'redis': True, 'minio': True}, 'CANDIDATE_HEALTH_INVALID')
            targets['candidate'] = {'healthy': True, 'identity': sha(canonical(identity))}
        except Exception:
            targets['candidate'] = {'healthy': False, 'reasonCode': 'CONTROLLED_LONG_CANDIDATE_UNAVAILABLE'}
    return targets


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('OBSERVER_REDIRECT_REFUSED')


def tick(policy, ledger):
    targets = health_targets(policy)
    targets['observation-scope'] = {'healthy': True, 'policyHash': policy['policyHash'], 'role': policy['role'],
                                    'sourceFingerprint': policy['sourceFingerprint'], 'goalSpecHash': policy['goalSpecHash']}
    # Identity changes reset the continuous chain even when both versions live.
    binding = sha(canonical({'policy': policy['policyHash'], 'targets': {k: v.get('identity') for k, v in targets.items()}}))
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    return ledger.tick(time.time(), time.monotonic(), boot, binding, targets)


def central_facts(execution, usage, run_id):
    """Read existing authenticated deliveries, not arbitrary candidate JSON.

    Original Ed25519 signature/headers are not stored in R22. This projection
    names that limitation rather than pretending to re-verify them. The two DB
    snapshots may race; an unreconciled/mismatch result is waiting, not zero.
    """
    need(re.fullmatch(RUN_RE, run_id), 'CENTRAL_RUN_ID_INVALID')
    execution.row_factory = usage.row_factory = sqlite3.Row
    run = execution.execute('SELECT id,object_id,agent_id,status,json,updated_at FROM execution_runs WHERE id=?', (run_id,)).fetchone()
    need(run is not None, 'CENTRAL_RUN_NOT_FOUND')
    data = json.loads(run['json'])
    args = data.get('template', {}).get('args', [])
    requested = args[args.index('--model') + 1] if isinstance(args, list) and '--model' in args and args.index('--model') + 1 < len(args) else None
    project = data.get('projectId')
    need(isinstance(project, str) and project, 'CENTRAL_PROJECT_ID_MISSING')
    deliveries = execution.execute("SELECT agent_id,delivery_id,run_id,body_sha,response,usage_json,usage_reconciled,created_at FROM execution_deliveries WHERE run_id=? AND kind='result' ORDER BY created_at", (run_id,)).fetchall()
    facts = []
    for raw in deliveries:
        response = json.loads(raw['response'])
        confirmation = response.get('delivery', {})
        confirmed = (raw['agent_id'] == run['agent_id'] and confirmation.get('deliveryId') == raw['delivery_id'] and
                     confirmation.get('runId') == run_id and confirmation.get('kind') == 'result' and
                     confirmation.get('accepted') is True and confirmation.get('bodySHA256') == raw['body_sha'])
        late = response.get('lateEvidenceOnly') is True or run['status'] == 'cancelled'
        measured = json.loads(raw['usage_json']) if raw['usage_json'] else None
        rows = usage.execute('SELECT id,provider,model,measurement_status,input_tokens,output_tokens,cache_read,cache_write,total_tokens,cost_usd,cost_complete,fingerprint FROM runtime_ai_usage WHERE run_id=? AND project_id=? ORDER BY id', ('execution_' + run_id, project)).fetchall()
        reported = [v for v in rows if v['measurement_status'] == 'reported']
        sums = {k: sum(v[k] or 0 for v in reported) for k in ('input_tokens', 'output_tokens', 'cache_read', 'cache_write', 'total_tokens')}
        keys = {'inputTokens': 'input_tokens', 'outputTokens': 'output_tokens', 'cacheReadTokens': 'cache_read', 'cacheWriteTokens': 'cache_write', 'totalTokens': 'total_tokens'}
        counts_match = bool(measured and all(type(measured.get(k, 0)) is int and measured.get(k, 0) == sums[v] for k, v in keys.items()))
        actual_model = measured.get('model') if measured else None
        model_match = bool(actual_model and reported and all(v['model'] == actual_model for v in reported))
        any_unknown = any(v['measurement_status'] == 'unknown' for v in rows)
        all_priced = bool(reported) and all(v['cost_usd'] is not None and v['cost_complete'] == 1 for v in reported) and not any_unknown
        fact = {'scope': 'jarvis-outer-cli', 'runId': run_id, 'projectId': project,
                'taskId': run['object_id'], 'agentId': raw['agent_id'], 'deliveryId': raw['delivery_id'],
                'deliveryBodySHA256': raw['body_sha'], 'centralAuthenticatedProvenance': confirmed,
                'originalSignatureRetained': False, 'originalSignatureReverified': False,
                'lateEvidenceOnly': late, 'terminalStatus': run['status'], 'usageReconciled': raw['usage_reconciled'] == 1,
                'requestedOuterModel': requested, 'actualReturnedModel': actual_model, 'ledgerModelsMatch': model_match,
                'actualTokens': sums['total_tokens'] if counts_match and not any_unknown else None,
                'tokenCountsMatch': counts_match, 'unknownUsagePresent': any_unknown,
                'costUSD': sum(v['cost_usd'] for v in reported) if all_priced else None,
                'knownCostUSD': sum(v['cost_usd'] or 0 for v in reported), 'costComplete': all_priced,
                'recordFingerprints': [v['fingerprint'] for v in rows], 'observedAt': utc(),
                'factoryInternalProviderProven': False, 'contextCapabilityProven': False,
                'nativeProcessAndChildChainProven': False}
        facts.append(fact)
    return {'schemaVersion': 1, 'kind': 'central-authenticated-execution-observation', 'simulated': False,
            'runId': run_id, 'status': 'observed' if facts else 'waiting', 'facts': facts}


def observe_central(policy, ledger, run_id):
    need(policy['role'] == 'central', 'CENTRAL_OBSERVER_WRONG_HOST')
    for path in (EXECUTION_DB, USAGE_DB):
        trusted_database(path, policy.get('centralDatabaseOwnerUID'))
    with sqlite3.connect(EXECUTION_DB.as_uri() + '?mode=ro', uri=True) as execution, sqlite3.connect(USAGE_DB.as_uri() + '?mode=ro', uri=True) as usage:
        execution.execute('BEGIN')
        usage.execute('BEGIN')
        value = central_facts(execution, usage, run_id)
    need(all(v['projectId'] == policy.get('projectId') for v in value['facts']), 'CENTRAL_PROJECT_SCOPE_MISMATCH')
    ledger.save_fact('central-execution', value)
    return value


NODE_INSTALL_PROBE = r"""
const f=require('node:fs');const input=JSON.parse(f.readFileSync(0,'utf8'));
const call=async(path,init={})=>{const r=await fetch('http://127.0.0.1:18930'+path,{...init,signal:AbortSignal.timeout(10000)});const body=await r.json();return{r,body}};
(async()=>{const login=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:input.user,password:input.password})});if(login.r.status!==200||login.body.ok!==true)throw Error();const cookie=login.r.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error();const headers={'content-type':'application/json',cookie};
if(input.action==='create'){const value=await call('/api/projects',{method:'POST',headers,body:JSON.stringify({name:input.name,description:'root isolated restart-persistence observation'})});if(![200,201].includes(value.r.status)||!(/^[a-f0-9-]{36}$/.test(value.body.id)))throw Error();const read=await call('/api/projects/'+value.body.id,{headers});if(read.r.status!==200||read.body.name!==input.name)throw Error();console.log(JSON.stringify({projectId:value.body.id,nameHash:require('node:crypto').createHash('sha256').update(input.name).digest('hex'),createReadback:true}));}
else {if(!/^[a-f0-9-]{36}$/.test(input.projectId))throw Error();const read=await call('/api/projects/'+input.projectId,{headers});if(read.r.status!==200||read.body.name!==input.name)throw Error();const archive=await call('/api/projects/'+input.projectId+'/archive',{method:'POST',headers,body:'{}'});if(![200,201].includes(archive.r.status))throw Error();const final=await call('/api/projects/'+input.projectId,{headers});if(final.body.status!=='archived')throw Error();console.log(JSON.stringify({projectId:input.projectId,restartReadback:true,archiveReadback:true}));}})().catch(()=>process.exit(1));
"""


def observe_installation(policy, ledger):
    """Finite actual factory-only test in an explicitly dedicated candidate.

    Only opt-in root policy permits this one-container restart. No platform,
    development agent, native CLI or customer service can be targeted here.
    A successful fact is insufficient for the full customer-installation gate.
    """
    need(policy['role'] == 'development' and policy.get('allowIsolatedFactoryRestart') is True, 'FACTORY_RESTART_PROBE_NOT_AUTHORIZED')
    before = container_identity(policy)
    need(before['running'], 'CONTROLLED_CANDIDATE_NOT_RUNNING')
    credential_path = STATE / 'candidate-auth.json'
    credentials = json.loads(read_private(credential_path))
    need(set(credentials) == {'user', 'password'} and credentials['user'] == 'jarvis-observer' and isinstance(credentials['password'], str) and len(credentials['password']) >= 24, 'OBSERVATION_CREDENTIALS_INVALID')
    name = 'root-observer-' + os.urandom(12).hex()
    inputs = {**credentials, 'action': 'create', 'name': name}
    created = json.loads(fixed([DOCKER, 'exec', '-i', before['id'], 'node', '-e', NODE_INSTALL_PROBE], 40, canonical(inputs).encode()))
    # Reinspect the immutable id before the single finite control operation.
    need(container_identity(policy) == before, 'CONTROLLED_CANDIDATE_CHANGED_BEFORE_RESTART')
    fixed([DOCKER, 'restart', '--time', '10', before['id']], 40)
    deadline = time.monotonic() + 90
    after, result = None, None
    while time.monotonic() < deadline:
        try:
            after = container_identity(policy)
            need(after['id'] == before['id'] and after['pid'] != before['pid'] and after['startedAt'] != before['startedAt'] and after['running'], 'FACTORY_PROCESS_RESTART_NOT_OBSERVED')
            result = json.loads(fixed([DOCKER, 'exec', '-i', after['id'], 'node', '-e', NODE_INSTALL_PROBE], 40,
                                     canonical({**credentials, 'action': 'read', 'name': name, 'projectId': created['projectId']}).encode()))
            break
        except Exception:
            time.sleep(2)
    need(result is not None, 'FACTORY_RESTART_READBACK_FAILED')
    fact = {'schemaVersion': 1, 'kind': 'controlled-factory-installation-observation', 'simulated': False,
            'scope': 'factory-only', 'sourceFingerprint': policy['sourceFingerprint'], 'goalSpecHash': policy['goalSpecHash'],
            'beforeProcessIdentity': before, 'afterProcessIdentity': after, 'createReadback': created.get('createReadback') is True,
            'restartPersistence': result.get('restartReadback') is True, 'archiveReadback': result.get('archiveReadback') is True,
            'projectId': created['projectId'], 'observedAt': utc(), 'customerInstallationProven': False,
            'nativeRecoveryProven': False, 'backupRestoreAndRollbackProven': False, 'privateCredentialsExported': False}
    ledger.save_fact('factory-installation', fact)
    return fact


def status(identity, progress, fresh=True):
    need(all(re.fullmatch(pattern, str(identity.get(key, ''))) for key, pattern in
             (('runId', RUN_RE), ('attempt', '[a-f0-9]{32}'), ('sourceFingerprint', '[a-f0-9]{64}'),
              ('goalSpecHash', '[a-f0-9]{64}'), ('workPackage', 'FA-0[1-9]'))), 'PREREQUISITE_EXPORT_IDENTITY_INVALID')
    waiting = []
    for name in NAMES:
        reason = 'FIXED_SCOPE_PRODUCER_EVIDENCE_PENDING'
        if name == 'provider':
            reason = 'FACTORY_INTERNAL_PROVIDER_CONTEXT_EVIDENCE_PENDING'
        elif name in ('native-execution', 'native-recovery'):
            reason = 'FACTORY_NATIVE_PROCESS_CHAIN_EVIDENCE_PENDING'
        elif name == 'customer-installation':
            reason = 'CUSTOMER_INSTALL_RESTORE_ROLLBACK_EVIDENCE_PENDING'
        row = {'id': name, 'reasonCode': reason}
        if name == 'long-observation':
            seconds = min(REQUIRED_SECONDS, progress.get('actualObservedSeconds', 0)) if progress and fresh else 0
            row.update({'reasonCode': 'LONG_OBSERVATION_IN_PROGRESS' if seconds < REQUIRED_SECONDS else 'LONG_EXCEPTION_AND_IDLE_USAGE_EVIDENCE_PENDING',
                        'actualObservedSeconds': seconds, 'requiredSeconds': REQUIRED_SECONDS})
        waiting.append(row)
    return {'schemaVersion': 1, 'kind': 'project-autonomy-prerequisite-status', 'simulated': False,
            **identity, 'waiting': waiting, 'observedAt': utc(), 'nextCheckSeconds': 60,
            'observationsAreAcceptance': False}


def export(policy, ledger, attempt_evidence):
    target = Path(attempt_evidence)
    need(target.is_absolute() and target.name == 'evidence' and len(target.parents) >= 3 and
         target.parent.parent.parent == EVIDENCE and re.fullmatch('[a-f0-9]{32}', target.parent.name) and
         re.fullmatch(RUN_RE, target.parent.parent.name), 'PREREQUISITE_EXPORT_SCOPE_INVALID')
    trusted(target, private=True)
    identity = {'runId': os.environ.get('JARVIS_AUTONOMY_RUN_ID'), 'attempt': os.environ.get('JARVIS_VALIDATION_ATTEMPT'),
                'sourceFingerprint': os.environ.get('JARVIS_SOURCE_SHA256'), 'goalSpecHash': os.environ.get('JARVIS_GOAL_SPEC_HASH'),
                'workPackage': os.environ.get('JARVIS_WORK_PACKAGE')}
    need(identity['runId'] == target.parent.parent.name and identity['attempt'] == target.parent.name, 'PREREQUISITE_POLICY_IDENTITY_MISMATCH')
    # Current attempt identity comes from the actual root snapshot and the
    # installed phase policy, even before a long-lived observer is configured.
    snapshot = json.loads(read_private(target.parent / 'source-before.json'))
    phase_policy_path = POLICY.parent / (str(identity.get('workPackage')) + '.json')
    trusted(phase_policy_path)
    fd = os.open(phase_policy_path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        phase_policy = json.loads(stream.read(128 * 1024 + 1))
    need(snapshot.get('sha256') == identity['sourceFingerprint'] and phase_policy.get('workPackage') == identity['workPackage'] and
         phase_policy.get('goalSpecHash') == identity['goalSpecHash'], 'PREREQUISITE_ATTEMPT_NOT_ROOT_BOUND')
    progress = ledger.current() if ledger else None
    if ledger:
        ledger.verify_chain()
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(progress['finishedAt'].replace('Z', '+00:00'))).total_seconds() if progress else -1
    scope = progress.get('scope') if progress else None
    fresh = bool(policy and progress and 0 <= age <= MAX_GAP and policy['sourceFingerprint'] == identity['sourceFingerprint'] and policy['goalSpecHash'] == identity['goalSpecHash'] and
                 scope == {'healthy': True, 'policyHash': policy['policyHash'], 'role': 'development', 'sourceFingerprint': policy['sourceFingerprint'], 'goalSpecHash': policy['goalSpecHash']})
    value = status(identity, progress, fresh)
    ref = write_new(target / 'prerequisite-status.json', value)
    # No full phase receipt is created by incomplete fact projections.
    return {'status': 'waiting', 'prerequisiteStatus': value, 'evidence': ref, 'trustedReceiptsCreated': 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('tick', 'central', 'installation', 'export'), required=True)
    parser.add_argument('--attempt-evidence')
    parser.add_argument('--run-id')
    args = parser.parse_args()
    policy, ledger = None, None
    if args.mode == 'export':
        need(os.name == 'posix' and os.geteuid() == 0, 'OBSERVER_ROOT_REQUIRED')
        trusted(__file__)
        # Missing configuration/state is a genuine resource prerequisite. It
        # still publishes current root-bound waiting metadata, no fake health.
        try:
            policy = load_policy()
            ledger = open_ledger(policy)
        except (OSError, ValueError):
            policy, ledger = None, None
    else:
        policy = load_policy()
        ledger = open_ledger(policy)
    try:
        if args.mode == 'tick':
            result = tick(policy, ledger)
        elif args.mode == 'central':
            result = observe_central(policy, ledger, args.run_id or '')
        elif args.mode == 'installation':
            result = observe_installation(policy, ledger)
        else:
            result = export(policy, ledger, args.attempt_evidence or '')
        print(canonical(result))
    finally:
        if ledger:
            ledger.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print raw exception strings from HTTP, DB, Docker or auth IO.
        code = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z][A-Z_0-9]{0,120}', str(error)) else 'PREREQUISITE_OBSERVER_FAILED'
        print(canonical({'schemaVersion': 1, 'kind': 'project-autonomy-prerequisite-error', 'status': 'waiting', 'reasonCode': code}))
        sys.exit(2)
