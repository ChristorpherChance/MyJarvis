#!/usr/bin/python3
"""Fixed factory-internal Pi probe, with independent egress observations.

No direct gateway generation call. Only an explicitly prepared, source-sealed
isolated factory is driven. This first producer records facts and remaining
gaps; it does not issue a complete trusted provider receipt. Missing actual
context/fallback or SDK adoption evidence remains unverified.
"""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import urllib.error
import urllib.request

POLICY = Path('/etc/jarvis-development/project-autonomy/provider-observer.json')
TOOLS = Path('/opt/jarvis-development/software-factory')
FACTORY = 'http://127.0.0.1:18930'
MODEL = 'gpt-6.1-sol[1m]'
MAX_BYTES = 8 * 1024 * 1024


def need(condition, code):
    if not condition:
        raise ValueError(code)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def load_witness():
    path = Path(__file__).with_name('project-autonomy-provider-witness.py')
    spec = importlib.util.spec_from_file_location('root_provider_witness', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def trusted_tool(path):
    for entry in [*reversed(Path(path).parents), Path(path)]:
        state = entry.lstat()
        need(state.st_uid == 0 and not stat.S_ISLNK(state.st_mode) and not state.st_mode & 0o022, 'PROVIDER_TOOL_NOT_ROOT_CONTROLLED')
        if stat.S_ISREG(state.st_mode):
            need(state.st_nlink == 1, 'PROVIDER_TOOL_LINK_INVALID')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('PROVIDER_FACTORY_REDIRECT_FORBIDDEN')


def evaluate_calls(calls, run_binding, factory_facts):
    """No alias inference, no configured DB cost substituted for actual cost."""
    need(calls and len(calls) <= 8, 'PROVIDER_REAL_CALLS_MISSING')
    for call in calls:
        need(call.get('kind') == 'root-provider-egress-observation' and call.get('simulated') is False and all(call.get(k) == v for k, v in run_binding.items()), 'PROVIDER_EGRESS_BINDING_MISMATCH')
    generated = [v for v in calls if v.get('requestMethod') == 'POST' and v.get('actualUpstreamObserved') is True]
    successes = [v for v in generated if v.get('upstreamStatus') == 200]
    need(successes, 'PROVIDER_REAL_GENERATION_MISSING')
    primary = [v for v in successes if v.get('requestedModel') == MODEL]
    returned = [name for v in primary for name in v.get('returnedModels', [])]
    known = all(v.get('usage', {}).get('known') is True for v in generated)
    tokens = sum(v['usage']['tokens'] for v in generated) if known else None
    cost_known = all(v.get('usage', {}).get('cost') is not None for v in generated)
    cost = sum(v['usage']['cost'] for v in generated) if cost_known else None
    input_boundary = max((v.get('usage', {}).get('inputTokens') or 0 for v in primary), default=0)
    failed = [v for v in generated if v.get('upstreamStatus') in (429, 500, 502, 503, 504)]
    # A same-model retry is not a cross-model fallback. Order is real sequence.
    fallback = any(v.get('requestedModel') != MODEL and v.get('returnedModels') and any(e['startedAt'] < v['startedAt'] for e in failed) for v in successes)
    gaps = []
    if not factory_facts.get('independentSdkInvocationObserved'):
        gaps.append('FACTORY_RUNTIME_SDK_INVOCATION_HOOK_MISSING')
    if not primary or not returned:
        gaps.append('ACTUAL_PRIMARY_RESPONSE_MODEL_MISSING')
    elif any(name not in (MODEL, 'gpt-6.1-sol') for name in returned):
        gaps.append('ACTUAL_PRIMARY_RESPONSE_MODEL_NOT_STRONG')
    if input_boundary < 1000000:
        gaps.append('ACTUAL_1M_CONTEXT_BOUNDARY_NOT_OBSERVED')
    if not fallback:
        gaps.append('ACTUAL_CROSS_MODEL_FAILURE_FALLBACK_NOT_OBSERVED')
    if factory_facts.get('factoryUnknownUsagePreserved') is not True:
        gaps.append('FACTORY_UNKNOWN_USAGE_ACCOUNTING_NOT_VERIFIED')
    return {'requestedModel': MODEL, 'returnedModel': returned[-1] if returned else None,
            'usage': {'known': known, 'calls': len(generated), 'tokens': tokens, 'cost': cost,
                      'unknownUsageCallCount': sum(not v.get('usage', {}).get('known') for v in generated),
                      'knownTokenLowerBound': sum(v.get('usage', {}).get('tokens') or 0 for v in generated)},
            'contextCapabilityEvidence': {'observed': input_boundary >= 1000000, 'actualAcceptedInputTokens': input_boundary,
                                          'scope': 'real-factory-internal-request-not-model-alias'},
            'crossModelFallbackActuallyObserved': fallback, 'gaps': gaps,
            'trustedReceiptsCreated': 0, 'productAcceptance': False}


def drive_factory(policy, credentials, opener=None):
    """Fixed concrete API chain observed in current public factory source."""
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    cookie = None
    api_observations = []

    def request(path, method='GET', data=None, stream=False):
        need(path.startswith('/api/') or path == '/health', 'PROVIDER_FACTORY_ROUTE_INVALID')
        headers = {'Content-Type': 'application/json'}
        if cookie:
            headers['Cookie'] = cookie
        raw = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(FACTORY + path, data=raw, method=method, headers=headers)
        with opener.open(req, timeout=150 if stream else 20) as response:
            body = response.read(MAX_BYTES + 1)
            need(len(body) <= MAX_BYTES, 'PROVIDER_FACTORY_RESPONSE_TOO_LARGE')
            api_observations.append({'path': path, 'method': method, 'status': response.status,
                                     'responseSHA256': sha(body), 'bytes': len(body)})
            if stream:
                return body
            return json.loads(body), response.headers.get('Set-Cookie')

    health, _ = request('/health')
    need(health.get('ok') is True and health.get('db') and health.get('redis') and health.get('minio'), 'PROVIDER_ISOLATED_FACTORY_NOT_HEALTHY')
    login, set_cookie = request('/api/auth/login', 'POST', credentials)
    need(login.get('ok') is True and set_cookie and 'HttpOnly' in set_cookie, 'PROVIDER_ISOLATED_AUTH_FAILED')
    cookie = set_cookie.split(';')[0]
    # Register only a dummy proxy token in this new isolated DB; real key stays root.
    model, _ = request('/api/v1/ai/models', 'POST', {'name': 'Root provider ' + policy['probeNonce'],
        'provider': 'gateway', 'baseUrl': 'http://127.0.0.1:17993/v1', 'modelCode': MODEL,
        'apiKey': policy['proxyToken'], 'enabled': True, 'supportsThinking': False, 'contextWindow': 1000000})
    need(re.fullmatch('[a-f0-9-]{36}', model.get('id', '')), 'PROVIDER_FACTORY_MODEL_CREATE_FAILED')
    request('/api/v1/ai/routes/chat', 'PUT', {'modelId': model['id']})
    project, _ = request('/api/projects', 'POST', {'name': 'Root provider ' + policy['probeNonce'], 'description': 'isolated nonprivate provider probe', 'isDemo': False})
    project_id = project.get('id')
    need(re.fullmatch('[a-f0-9-]{36}', project_id or ''), 'PROVIDER_FACTORY_PROJECT_CREATE_FAILED')
    base = '/api/v1/projects/' + project_id + '/ai/'
    session, _ = request(base + 'sessions', 'POST', {'ctx': 'req', 'name': 'Root fixed probe'})
    session_id = session.get('id') or session.get('sessionId')
    need(re.fullmatch('[a-f0-9-]{36}', session_id or ''), 'PROVIDER_FACTORY_SESSION_CREATE_FAILED')
    stream = request(base + 'sessions/' + session_id + '/messages:send', 'POST',
                     {'content': 'Fixed verification nonce ' + policy['probeNonce'] + '. Reply OK only. Do not invoke tools.'}, True)
    frames = []
    for line in stream.decode().splitlines():
        if line.startswith('data:'):
            frames.append(json.loads(line[5:].strip()))
    need(frames and any(v.get('type') == 'stream.start' for v in frames), 'PROVIDER_FACTORY_SSE_START_MISSING')
    usage, _ = request(base + 'usage?limit=100')
    rows = [v for v in usage.get('items', []) if v.get('session_id') == session_id]
    need(rows, 'PROVIDER_FACTORY_USAGE_RECEIPT_MISSING')
    # Exact upstream truth is reconciled separately; these are candidate ledger values.
    return {'projectId': project_id, 'sessionId': session_id, 'modelId': model['id'],
            'factoryAPIObservations': api_observations, 'factoryStreamTypes': sorted({v.get('type', '') for v in frames}),
            'factoryUsageRows': [{k: r.get(k) for k in ('id', 'tokens_in', 'tokens_out', 'cost', 'session_id')} for r in rows],
            'independentSdkInvocationObserved': False, 'factoryUnknownUsagePreserved': None}


def main():
    need(len(sys.argv) == 1, 'PROVIDER_FIXED_ARGUMENTS_REQUIRED')
    need(os.name == 'posix' and os.geteuid() == 0, 'PROVIDER_ROOT_REQUIRED')
    trusted_tool(__file__)
    trusted_tool(Path(__file__).with_name('project-autonomy-provider-witness.py'))
    witness = load_witness()
    witness.trusted(__file__)
    witness.trusted(Path(__file__).with_name('project-autonomy-provider-witness.py'))
    policy = json.loads(witness.read_private(POLICY, 64 * 1024))
    need(policy.get('schemaVersion') == 1 and policy.get('kind') == 'root-factory-provider-probe-policy' and policy.get('allowActualModelCalls') is True and policy.get('isolatedNamespacePrepared') is True, 'PROVIDER_SCOPE_NOT_PREPARED')
    need(all(re.fullmatch('[a-f0-9]{64}', policy.get(k, '')) for k in ('sourceFingerprint', 'goalSpecHash')) and all(re.fullmatch('[a-f0-9]{32}', policy.get(k, '')) for k in ('attempt', 'probeNonce', 'proxyToken')) and re.fullmatch(r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', policy.get('runId', '')), 'PROVIDER_IDENTITY_INVALID')
    need(os.readlink('/proc/self/ns/net') == policy.get('networkNamespaceIdentity'), 'PROVIDER_NAMESPACE_MISMATCH')
    pid = policy.get('factoryPID')
    need(type(pid) is int and pid > 1 and os.readlink('/proc/' + str(pid) + '/ns/net') == policy['networkNamespaceIdentity'], 'PROVIDER_FACTORY_PROCESS_SCOPE_INVALID')
    # Verify actual process mode privately. No other environment fields exported.
    environ = Path('/proc/' + str(pid) + '/environ').read_bytes().split(b'\0')
    need(b'MSF_AI_PROVIDER=pi' in environ, 'PROVIDER_FACTORY_MODE_IS_NOT_PI')
    need(Path('/proc/' + str(pid) + '/stat').read_text().rsplit(')', 1)[1].split()[19] == policy.get('factoryProcessStartTicks'), 'PROVIDER_FACTORY_PROCESS_CHANGED')
    output = Path(policy['evidenceDir'])
    witness.trusted(output, True)
    binding = {k: policy[k] for k in ('runId', 'attempt', 'sourceFingerprint', 'goalSpecHash', 'probeNonce')}
    credentials = json.loads(witness.read_private(policy['authenticationFile'], 8192))
    witness.new_file(output / 'observer-started.json', json.dumps({**binding, 'startedAt': utc()}).encode())
    facts = drive_factory(policy, {k: credentials[k] for k in ('username', 'password')})
    calls = []
    for path in sorted(output.glob('egress-*.json')):
        body = witness.read_private(path)
        row = json.loads(body)
        for ref in row.get('rawEvidence', []):
            need(re.fullmatch(r'upstream-\d+\.bin', ref.get('file', '')), 'PROVIDER_RAW_REFERENCE_INVALID')
            raw = witness.read_private(output / ref['file'])
            need(sha(raw) == ref.get('sha256') and len(raw) == ref.get('bytes'), 'PROVIDER_RAW_BYTES_MISMATCH')
        calls.append(row)
    evaluation = evaluate_calls(calls, binding, facts)
    result = {'schemaVersion': 1, 'kind': 'root-factory-provider-probe-facts', 'simulated': False,
              **binding, 'finishedAt': utc(), 'facts': facts, 'evaluation': evaluation,
              'completeProducerReady': False, 'trustedReceiptsCreated': 0}
    raw = json.dumps(result, sort_keys=True, separators=(',', ':')).encode()
    ref = witness.new_file(output / 'factory-provider-facts.json', raw)
    print(json.dumps({'schemaVersion': 1, 'kind': result['kind'], 'status': 'incomplete',
                      'evidenceSHA256': ref['sha256'], 'bytes': ref['bytes'], 'gaps': evaluation['gaps'],
                      'modelInvocationScope': 'isolated-factory-internal-Pi-HTTP-chain', 'trustedReceiptsCreated': 0}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error)
        print(json.dumps({'kind': 'root-factory-provider-probe-error', 'errorCode': code if re.fullmatch('[A-Z][A-Z0-9_]{1,100}', code) else 'PROVIDER_FIXED_PROBE_FAILED', 'trustedReceiptsCreated': 0}))
        sys.exit(1)
