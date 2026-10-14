"""Local transport/API fixtures only; no remote/product/paid model calls."""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(path))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


witness = module('provider_witness', 'project-autonomy-provider-witness.py')
observer = module('provider_observer', 'project-autonomy-provider-observer.py')
BINDING = {'runId': 'a' * 40, 'attempt': 'b' * 32, 'sourceFingerprint': 'c' * 64,
           'goalSpecHash': 'd' * 64, 'probeNonce': 'e' * 32}


def call(model=observer.MODEL, status=200, returned='gpt-6.1-sol', tokens=12, minute=0):
    return {'kind': 'root-provider-egress-observation', 'simulated': False, **BINDING,
            'requestMethod': 'POST', 'actualUpstreamObserved': True, 'requestedModel': model,
            'upstreamStatus': status, 'returnedModels': [returned] if returned else [],
            'startedAt': '2026-10-11T05:' + str(minute).zfill(2) + ':00.000Z',
            'usage': {'known': tokens is not None, 'tokens': tokens, 'inputTokens': tokens, 'cost': None}}


class Response(io.BytesIO):
    def __init__(self, value, headers=None, status=200):
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        super().__init__(body)
        self.headers, self.status = headers or {}, status


class FactoryFixture:
    def __init__(self):
        self.requests = []

    def open(self, req, timeout):
        self.requests.append(req)
        path = req.full_url.removeprefix(observer.FACTORY)
        if path == '/health':
            return Response({'ok': True, 'db': True, 'redis': True, 'minio': True})
        if path == '/api/auth/login':
            return Response({'ok': True}, {'Set-Cookie': 'msf_auth=private-fixture; HttpOnly; SameSite=Lax'})
        if path == '/api/v1/ai/models':
            return Response({'id': '00000000-0000-0000-0000-000000000001'})
        if path == '/api/v1/ai/routes/chat':
            return Response({'ok': True})
        if path == '/api/projects':
            return Response({'id': '00000000-0000-0000-0000-000000000002'})
        if path.endswith('/sessions'):
            return Response({'id': '00000000-0000-0000-0000-000000000003'})
        if path.endswith('/messages:send'):
            return Response(b'data: {"type":"stream.start","operationId":"fixture"}\n\ndata: {"type":"stream.end"}\n\n')
        if '/usage?' in path:
            return Response({'items': [{'id': 'fixture-usage', 'session_id': '00000000-0000-0000-0000-000000000003', 'tokens_in': 10, 'tokens_out': 2, 'cost': 0}]})
        raise AssertionError('Unexpected fixed API route')


class TransportFixtures(unittest.TestCase):
    def test_openai_actual_response_model_and_usage(self):
        body = b'data: {"model":"gpt-6.1-sol","choices":[]}\n\ndata: {"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\ndata: [DONE]\n\n'
        result = witness.response_facts(body, 'text/event-stream')
        self.assertEqual(result['returnedModels'], ['gpt-6.1-sol'])
        self.assertEqual(result['usage']['tokens'], 12)
        self.assertIsNone(result['usage']['cost'])

    def test_unknown_usage_never_becomes_zero(self):
        result = witness.response_facts(b'{"model":"gpt-6.1-sol"}', 'application/json')
        self.assertFalse(result['usage']['known'])
        self.assertIsNone(result['usage']['tokens'])
        self.assertIsNone(result['usage']['cost'])

    def test_explicit_zero_cost_is_distinct_from_unknown(self):
        result = witness.response_facts(b'{"model":"gpt-6.1-sol","usage":{"prompt_tokens":3,"completion_tokens":1,"cost":0}}', 'application/json')
        self.assertEqual(result['usage']['cost'], 0)
        self.assertEqual(result['usage']['tokens'], 4)

    def test_anthropic_start_input_final_output_accumulate(self):
        body = b'data: {"type":"message_start","message":{"model":"claude-real","usage":{"input_tokens":8,"output_tokens":0}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n'
        result = witness.response_facts(body, 'text/event-stream')
        self.assertEqual(result['usage']['tokens'], 11)
        self.assertEqual(result['returnedModels'], ['claude-real'])

    def test_same_request_requires_nonce_sealed_model_stream_and_output_bound(self):
        policy = {'allowedModels': [observer.MODEL], 'probeNonce': BINDING['probeNonce'], 'maxOutputTokens': 256}
        value = {'model': observer.MODEL, 'stream': True, 'max_tokens': 10, 'messages': [{'role': 'user', 'content': BINDING['probeNonce']}]}
        self.assertEqual(witness.validate_request(json.dumps(value).encode(), policy)['model'], observer.MODEL)
        for patch in [{'model': 'unknown-model'}, {'stream': False}, {'max_tokens': 8192}, {'max_tokens': True}, {'messages': [{'content': 'no-nonce'}]}]:
            with self.assertRaises(ValueError):
                witness.validate_request(json.dumps({**value, **patch}).encode(), policy)

    def test_upstream_and_factory_redirects_forbidden(self):
        for klass in (witness.NoRedirect, observer.NoRedirect):
            with self.assertRaises(ValueError):
                klass().redirect_request(None, None, 302, 'redirect', {}, 'https://evil.invalid')

    def test_existing_witness_start_refuses_retry_before_listener_or_upstream(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            (output / 'witness-started.json').write_bytes(b'{}')
            policy = {**BINDING, 'evidenceDir': folder}
            with patch.object(witness, 'trusted'), patch.object(witness.os, 'O_NOFOLLOW', 0, create=True), patch.object(witness, 'HTTPServer') as server:
                with self.assertRaises(FileExistsError):
                    witness.serve(policy, 'fixture-not-real', opener=object())
                server.assert_not_called()

    def test_effect_bytes_refuse_fresh_sequence_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / 'upstream-1.bin').write_bytes(b'fixture')
            with patch.object(witness, 'trusted'), patch.object(witness, 'HTTPServer') as server:
                with self.assertRaisesRegex(ValueError, 'PROVIDER_ATTEMPT_ALREADY_HAS_EFFECTS'):
                    witness.serve({**BINDING, 'evidenceDir': folder}, 'fixture-not-real', opener=object())
                server.assert_not_called()


class InternalProviderFixtures(unittest.TestCase):
    def test_factory_internal_api_chain_never_directly_calls_gateway(self):
        fixture = FactoryFixture()
        facts = observer.drive_factory({**BINDING, 'proxyToken': 'f' * 32}, {'username': 'fixed', 'password': 'private-fixture'}, fixture)
        self.assertEqual(len(fixture.requests), 8)
        self.assertTrue(all(v.full_url.startswith(observer.FACTORY + '/api/') or v.full_url.endswith('/health') for v in fixture.requests))
        self.assertTrue(any('/messages:send' in v.full_url for v in fixture.requests))
        self.assertFalse(facts['independentSdkInvocationObserved'])
        self.assertIsNone(facts['factoryUnknownUsagePreserved'])
        self.assertNotIn('private-fixture', json.dumps(facts))

    def test_missing_sdk_fallback_and_context_never_full_receipt(self):
        result = observer.evaluate_calls([call()], BINDING, {})
        self.assertIn('FACTORY_RUNTIME_SDK_INVOCATION_HOOK_MISSING', result['gaps'])
        self.assertIn('ACTUAL_1M_CONTEXT_BOUNDARY_NOT_OBSERVED', result['gaps'])
        self.assertIn('ACTUAL_CROSS_MODEL_FAILURE_FALLBACK_NOT_OBSERVED', result['gaps'])
        self.assertEqual(result['trustedReceiptsCreated'], 0)
        self.assertFalse(result['productAcceptance'])

    def test_same_model_retry_is_not_fallback(self):
        result = observer.evaluate_calls([call(status=429, returned=None, tokens=None), call(minute=1)], BINDING, {})
        self.assertFalse(result['crossModelFallbackActuallyObserved'])
        self.assertFalse(result['usage']['known'])
        self.assertEqual(result['usage']['knownTokenLowerBound'], 12)

    def test_actual_failure_precedes_different_model_response_for_fallback(self):
        rows = [call(status=429, returned=None, tokens=None), call(minute=1), call(model='approved-fallback', returned='actual-fallback', minute=2)]
        result = observer.evaluate_calls(rows, BINDING, {})
        self.assertTrue(result['crossModelFallbackActuallyObserved'])
        self.assertIsNone(result['usage']['cost'])

    def test_real_response_bad_model_is_not_strong_alias(self):
        result = observer.evaluate_calls([call(returned='inferior-real-model')], BINDING, {})
        self.assertIn('ACTUAL_PRIMARY_RESPONSE_MODEL_NOT_STRONG', result['gaps'])

    def test_actual_context_input_not_model_name_or_config(self):
        result = observer.evaluate_calls([call(tokens=1000000)], BINDING, {})
        self.assertTrue(result['contextCapabilityEvidence']['observed'])
        self.assertEqual(result['contextCapabilityEvidence']['actualAcceptedInputTokens'], 1000000)
        self.assertEqual(result['trustedReceiptsCreated'], 0)

    def test_wrong_run_goal_source_or_nonce_cannot_reuse_egress(self):
        for key in BINDING:
            row = call()
            row[key] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'PROVIDER_EGRESS_BINDING_MISMATCH'):
                observer.evaluate_calls([row], BINDING, {})

    def test_upstream_failure_or_unobserved_response_is_not_generation(self):
        for row in [call(status=503), {**call(), 'actualUpstreamObserved': False}]:
            with self.assertRaisesRegex(ValueError, 'PROVIDER_REAL_GENERATION_MISSING'):
                observer.evaluate_calls([row], BINDING, {})


if __name__ == '__main__':
    unittest.main(verbosity=2)
