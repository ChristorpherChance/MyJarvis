#!/usr/bin/python3
"""Finite root egress witness for an isolated factory provider probe.

The factory, not this program, constructs and submits Pi requests. This proxy
only forwards a sealed route and independently preserves actual upstream
bytes. It never infers factory/Pi adoption or product acceptance from traffic.
No direct model test is offered. Namespace/resource provisioning is separate.
"""
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import signal
import ssl
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

POLICY = Path('/etc/jarvis-development/project-autonomy/provider-witness.json')
PORT = 17993
MAX_BYTES = 8 * 1024 * 1024
ALLOWED_HOSTS = {'cc-gateway.ikvein.com', 'gw.superopen.top'}
ENDPOINTS = {'/v1/chat/completions', '/v1/messages', '/v1/models'}


def need(condition, code):
    if not condition:
        raise ValueError(code)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def trusted(path, private=False):
    path = Path(path)
    need(path.is_absolute() and '..' not in path.parts, 'PROVIDER_PATH_INVALID')
    for entry in [*reversed(path.parents), path]:
        state = entry.lstat()
        need(not stat.S_ISLNK(state.st_mode) and state.st_uid == 0 and not state.st_mode & 0o022, 'PROVIDER_ROOT_PATH_REQUIRED')
        if stat.S_ISREG(state.st_mode):
            need(state.st_nlink == 1, 'PROVIDER_LINK_INVALID')
    if private:
        need(path.lstat().st_mode & 0o077 == 0, 'PROVIDER_PRIVATE_PATH_REQUIRED')


def read_private(path, limit=MAX_BYTES):
    trusted(path, True)
    need(stat.S_ISREG(Path(path).lstat().st_mode), 'PROVIDER_FILE_INVALID')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        state = os.fstat(stream.fileno())
        need(0 < state.st_size <= limit and state.st_uid == 0 and state.st_nlink == 1, 'PROVIDER_FILE_INVALID')
        return stream.read(limit + 1)


def new_file(path, body):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    return {'file': path.name, 'sha256': sha(body), 'bytes': len(body)}


def objects(body, content_type):
    if 'text/event-stream' in content_type:
        result = []
        for line in body.decode('utf-8').splitlines():
            if line.startswith('data:'):
                value = line[5:].strip()
                if value and value != '[DONE]':
                    result.append(json.loads(value))
        return result
    value = json.loads(body)
    return value if isinstance(value, list) else [value]


def response_facts(body, content_type):
    """Extract only actual response fields; missing counters stay unknown."""
    models, usage_rows = [], []
    for item in objects(body, content_type):
        message = item.get('message', {})
        model = item.get('model') or message.get('model')
        if isinstance(model, str) and model and model not in models:
            models.append(model)
        usage = item.get('usage') or message.get('usage')
        if isinstance(usage, dict):
            usage_rows.append(usage)
    inputs, outputs, total, cost = None, None, None, None
    # OpenAI final aggregate; Anthropic message_start input + message_delta output.
    for row in usage_rows:
        a = row.get('prompt_tokens', row.get('input_tokens'))
        b = row.get('completion_tokens', row.get('output_tokens'))
        c = row.get('total_tokens')
        if type(a) is int and a >= 0:
            inputs = a
        if type(b) is int and b >= 0:
            outputs = b
        if type(c) is int and c >= 0:
            total = c
        if type(row.get('cost')) in (int, float) and row['cost'] >= 0:
            cost = row['cost']
    if total is None and inputs is not None and outputs is not None:
        total = inputs + outputs
    return {'returnedModels': models, 'usage': {'known': total is not None and total > 0,
            'tokens': total if total is not None and total > 0 else None,
            'inputTokens': inputs, 'outputTokens': outputs, 'cost': cost},
            'rawResponseSHA256': sha(body)}


def validate_request(body, policy):
    need(0 < len(body) <= MAX_BYTES, 'PROVIDER_REQUEST_SIZE_INVALID')
    value = json.loads(body)
    need(isinstance(value, dict) and value.get('model') in policy['allowedModels'], 'PROVIDER_MODEL_NOT_SEALED')
    messages = value.get('messages')
    need(isinstance(messages, list) and 0 < len(messages) <= 100, 'PROVIDER_MESSAGES_INVALID')
    need(policy['probeNonce'] in json.dumps(messages, ensure_ascii=False), 'PROVIDER_NOT_FIXED_PROBE_INPUT')
    output = value.get('max_completion_tokens', value.get('max_tokens'))
    need(type(output) is int and 1 <= output <= policy['maxOutputTokens'], 'PROVIDER_OUTPUT_LIMIT_REQUIRED')
    need(value.get('stream') is True, 'PROVIDER_STREAM_REQUIRED')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('PROVIDER_REDIRECT_FORBIDDEN')


def serve(policy, secret, opener=None):
    """Only sealed localhost listener; installer must establish isolated scope."""
    output = Path(policy['evidenceDir'])
    trusted(output, True)
    # A restart is uncertain, not an authorization to repeat chargeable calls.
    # Root must reconcile old effects and create a fresh scoped attempt first.
    need(not any(output.glob('egress-*.json')) and not any(output.glob('upstream-*.bin')), 'PROVIDER_ATTEMPT_ALREADY_HAS_EFFECTS')
    new_file(output / 'witness-started.json', json.dumps({'runId': policy['runId'], 'attempt': policy['attempt'], 'startedAt': utc()}).encode())
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    state = {'calls': 0, 'sequence': 0, 'requests': 0}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, format, *args):
            pass  # Provider errors/headers can contain secrets; never stderr raw.

        def do_GET(self):
            self.forward()

        def do_POST(self):
            self.forward()

        def forward(self):
            started = utc()
            row = {'schemaVersion': 1, 'kind': 'root-provider-egress-observation', 'simulated': False,
                   **{k: policy[k] for k in ('runId', 'attempt', 'sourceFingerprint', 'goalSpecHash', 'probeNonce')},
                   'startedAt': started, 'requestMethod': self.command, 'requestPath': self.path,
                   'observerScope': 'isolated-factory-egress-only', 'factoryPiAdoptionProven': False}
            try:
                self.connection.settimeout(15)
                need(state['requests'] < 8, 'PROVIDER_REQUEST_LIMIT_REACHED')
                state['requests'] += 1
                need(self.path in ENDPOINTS and '?' not in self.path, 'PROVIDER_ENDPOINT_NOT_CLOSED')
                need((self.command == 'GET') == (self.path == '/v1/models'), 'PROVIDER_METHOD_NOT_CLOSED')
                need(self.headers.get('Authorization') == 'Bearer ' + policy['proxyToken'] or self.headers.get('x-api-key') == policy['proxyToken'], 'PROVIDER_PROXY_AUTH_INVALID')
                need(self.headers.get('Transfer-Encoding') is None, 'PROVIDER_TRANSFER_ENCODING_FORBIDDEN')
                size = int(self.headers.get('Content-Length', '0'))
                need(0 <= size <= MAX_BYTES, 'PROVIDER_REQUEST_SIZE_INVALID')
                body = self.rfile.read(size)
                need(len(body) == size, 'PROVIDER_REQUEST_TRUNCATED')
                if self.command == 'POST':
                    need(state['calls'] < policy['maxCalls'], 'PROVIDER_CALL_LIMIT_REACHED')
                    value = validate_request(body, policy)
                    state['calls'] += 1
                    row.update({'requestedModel': value['model'], 'actualAttemptNumber': state['calls'], 'requestSHA256': sha(body), 'requestBytes': len(body)})
                base = policy['upstreamOrigin'].rstrip('/')
                target = base + self.path
                headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret,
                           'x-api-key': secret, 'anthropic-version': '2023-06-01'}
                request = urllib.request.Request(target, data=body if self.command == 'POST' else None, headers=headers, method=self.command)
                try:
                    response = opener.open(request, timeout=30)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    row['upstreamStatus'] = response.status
                    kind = response.headers.get('Content-Type', 'application/json')
                    self.send_response(response.status)
                    self.send_header('Content-Type', kind)
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    chunks, count, deadline = [], 0, time.monotonic() + 120
                    while True:
                        need(time.monotonic() < deadline, 'PROVIDER_CALL_TIME_LIMIT_REACHED')
                        chunk = response.read(8192)
                        if not chunk:
                            break
                        count += len(chunk)
                        need(count <= MAX_BYTES, 'PROVIDER_RESPONSE_TOO_LARGE')
                        chunks.append(chunk)
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    raw = b''.join(chunks)
                    need(raw, 'PROVIDER_RESPONSE_EMPTY')
                    state['sequence'] += 1
                    evidence = new_file(output / ('upstream-' + str(state['sequence']) + '.bin'), raw)
                    row.update({'finishedAt': utc(), 'actualUpstreamObserved': True, 'rawEvidence': [evidence], **response_facts(raw, kind)})
            except Exception as error:
                code = str(error)
                row['errorCode'] = code if re.fullmatch(r'[A-Z][A-Z0-9_]{1,100}', code) else 'PROVIDER_TRANSPORT_FAILED'
                row['finishedAt'] = utc()
                # A partial/failed transfer is never an observed successful call.
                row['actualUpstreamObserved'] = False
                try:
                    self.send_error(502, 'Fixed provider probe failed')
                except Exception:
                    pass
            finally:
                self.close_connection = True
                state['sequence'] += 1
                new_file(output / ('egress-' + str(state['sequence']) + '.json'), json.dumps(row, sort_keys=True, separators=(',', ':')).encode())

    server = HTTPServer(('127.0.0.1', PORT), Handler)
    server.timeout = 1
    stop = {'requested': False}
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *args: stop.update(requested=True))
    deadline = datetime.now(timezone.utc).timestamp() + policy['lifetimeSeconds']
    try:
        while not stop['requested'] and datetime.now(timezone.utc).timestamp() < deadline:
            server.handle_request()
    finally:
        server.server_close()
    return state


def main():
    need(len(sys.argv) == 1, 'PROVIDER_FIXED_ARGUMENTS_REQUIRED')
    need(os.name == 'posix' and os.geteuid() == 0, 'PROVIDER_ROOT_REQUIRED')
    trusted(__file__)
    policy = json.loads(read_private(POLICY, 64 * 1024))
    need(policy.get('schemaVersion') == 1 and policy.get('kind') == 'root-provider-egress-policy' and policy.get('allowActualModelCalls') is True, 'PROVIDER_ACTUAL_CALL_SCOPE_NOT_ENABLED')
    need(policy.get('isolatedNamespacePrepared') is True and os.readlink('/proc/self/ns/net') == policy.get('networkNamespaceIdentity'), 'PROVIDER_NAMESPACE_SCOPE_NOT_READY')
    need(re.fullmatch(r'(?:[a-f0-9]{40}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', policy.get('runId', '')) and re.fullmatch('[a-f0-9]{64}', policy.get('sourceFingerprint', '')) and re.fullmatch('[a-f0-9]{64}', policy.get('goalSpecHash', '')) and re.fullmatch('[a-f0-9]{32}', policy.get('attempt', '')) and re.fullmatch('[a-f0-9]{32}', policy.get('probeNonce', '')) and re.fullmatch('[a-f0-9]{32}', policy.get('proxyToken', '')), 'PROVIDER_IDENTITY_INVALID')
    target = urllib.parse.urlsplit(policy.get('upstreamOrigin', ''))
    need(target.scheme == 'https' and target.hostname in ALLOWED_HOSTS and target.port in (None, 443) and not target.username and not target.password and not target.query and not target.fragment and target.path in ('', '/'), 'PROVIDER_UPSTREAM_NOT_CLOSED')
    need(isinstance(policy.get('allowedModels'), list) and 0 < len(policy['allowedModels']) <= 5 and policy['allowedModels'][0] == 'gpt-6.1-sol[1m]' and all(isinstance(v, str) and 0 < len(v) <= 200 for v in policy['allowedModels']), 'PROVIDER_MODELS_NOT_SEALED')
    need(type(policy.get('maxCalls')) is int and 1 <= policy['maxCalls'] <= 6 and type(policy.get('maxOutputTokens')) is int and 1 <= policy['maxOutputTokens'] <= 8192 and type(policy.get('lifetimeSeconds')) is int and 60 <= policy['lifetimeSeconds'] <= 600, 'PROVIDER_TECHNICAL_LIMIT_INVALID')
    secret = read_private(policy['secretFile'], 8192).decode().strip()
    need(secret and '\n' not in secret, 'PROVIDER_SECRET_INVALID')
    serve(policy, secret)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error)
        print(json.dumps({'kind': 'root-provider-witness-error', 'errorCode': code if re.fullmatch(r'[A-Z][A-Z0-9_]{1,100}', code) else 'PROVIDER_WITNESS_FAILED', 'trustedReceiptsCreated': 0}))
        raise SystemExit(1)
