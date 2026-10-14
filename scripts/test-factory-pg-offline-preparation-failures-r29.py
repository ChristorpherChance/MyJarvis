"""Closed local counterexamples for the retained 631f PG preparation source.

Only frozen Python AST function/fragments are executed against controlled
adapters. No product code, Docker, SSH, PG, HTTP, or package installation runs.
Passing these tests confirms the old preparation flaws, not readiness.
"""
import ast
import copy
import hashlib
import json
import re
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

SOURCE_SHA = '631f9c2fdc469f074f6ec73b85cce7fdc11aea189693c662fda996d53bbfcbc4'
if len(sys.argv) != 2:
    raise RuntimeError('PG_REVIEW_FROZEN_SOURCE_ARGUMENT_REQUIRED')
source_path = Path(sys.argv.pop()).resolve(strict=True)
source_raw = source_path.read_bytes()
if hashlib.sha256(source_raw).hexdigest() != SOURCE_SHA:
    raise RuntimeError('PG_REVIEW_FROZEN_SOURCE_CHANGED')
source_tree = ast.parse(source_raw.decode(), filename=str(source_path))
functions = {n.name: n for n in source_tree.body if isinstance(n, ast.FunctionDef)}


def need(value, code):
    if not value:
        raise RuntimeError(code)


def source_function(name, namespace):
    node = copy.deepcopy(functions[name])
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
    exec(compile(module, str(source_path), 'exec'), namespace)
    return namespace[name]


class FrozenPreparationCounterexamples(unittest.TestCase):
    def test_submitted_create_without_saved_id_cannot_be_reconciled(self):
        attempt = 'a' * 32
        worker = 'b' * 64
        image = 'sha256:' + 'c' * 64
        removed = []
        namespace = {
            'need': need, 'ROOT': Path('/frozen-qa-root'), 'json': json,
            'H': re.compile('[a-f0-9]{64}'), 'IMAGE': image,
            'os': SimpleNamespace(geteuid=lambda: 0,
                                  path=SimpleNamespace(lexists=lambda _: True)),
            'attempt_valid': lambda x: x == attempt,
            'root_directory': lambda *args: None,
            'self_source': lambda: worker,
            'read_private': lambda p: json.dumps(
                {'workerSHA256': worker, 'attempt': attempt, 'imageID': image}
                if p.name == 'once.json' else {'containerID': None}
            ).encode(),
            'container': lambda _: {'Id': 'd' * 64},
            'docker': lambda args: removed.append(args),
        }
        fn = source_function('reconcile_cleanup', namespace)
        with self.assertRaisesRegex(RuntimeError, '^QA_PG_CLEANUP_RESOURCE_NOT_OWNED$'):
            fn(attempt)
        self.assertEqual(removed, [])

    def test_actual_finally_skips_cleanup_when_receipt_save_throws(self):
        run_node = functions['run_install']
        final_body = next(n.finalbody for n in run_node.body
                          if isinstance(n, ast.Try) and n.finalbody)
        arguments = ast.arguments(posonlyargs=[], args=[ast.arg(arg=x)
                                  for x in ['state', 'result', 'attempt']],
                                  vararg=None, kwonlyargs=[], kw_defaults=[],
                                  kwarg=None, defaults=[])
        fragment = ast.FunctionDef(name='actual_finally_fragment', args=arguments,
                                   body=copy.deepcopy(final_body), decorator_list=[])
        calls = []

        def failed_save(*args):
            raise OSError('CONTROLLED_RECEIPT_SAVE_FAILURE')

        namespace = {'replace_state': failed_save,
                     'reconcile_cleanup': lambda _: calls.append('cleanup'),
                     'container': lambda _: None,
                     'empty_labels': lambda _: calls.append('labels')}
        module = ast.fix_missing_locations(ast.Module(body=[fragment], type_ignores=[]))
        exec(compile(module, str(source_path), 'exec'), namespace)
        with self.assertRaisesRegex(OSError, '^CONTROLLED_RECEIPT_SAVE_FAILURE$'):
            namespace['actual_finally_fragment'](None, {}, 'a' * 32)
        self.assertEqual(calls, [])

    def test_cleanup_cache_verifier_permits_six_traversals_beyond_stop_budget(self):
        attempt = 'a' * 32
        names = ('corepack-runtime', 'corepack-cache', 'pnpm-store')
        raw = b'{}'
        raw_sha = hashlib.sha256(raw).hexdigest()
        base = Path('/var/lib/jarvis-development/101/truth-gate-r29-build') / attempt
        contract = {'schemaVersion': 1, 'kind': 'r29-pg-root-cache-reuse',
                    'producerAttempt': attempt,
                    'caches': [{'name': name, 'root': str(base / 'caches' / name),
                                'manifestPath': str(base / 'cache-manifests' /
                                                    (name + '.json')),
                                'manifestSHA256': raw_sha} for name in names]}
        traversals = []
        namespace = {'need': need, 'Path': Path, 'json': json, 'CACHE_NAMES': names,
                     'H': re.compile('[a-f0-9]{64}'),
                     'attempt_valid': lambda x: x == attempt,
                     'read_private': lambda _: raw,
                     'sha': lambda x: hashlib.sha256(x).hexdigest(),
                     'validate_cache_manifest': lambda value, root: value,
                     'cache_closure': lambda root: traversals.append(root) or {}}
        fn = source_function('verify_cache_reuse', namespace)
        self.assertEqual(fn(contract), contract['caches'])
        self.assertEqual(len(traversals), 6)
        deadline = next(n for n in ast.walk(functions['cache_closure'])
                        if isinstance(n, ast.Assign) and any(
                            isinstance(t, ast.Name) and t.id == 'deadline'
                            for t in n.targets))
        self.assertIsInstance(deadline.value, ast.BinOp)
        self.assertEqual(deadline.value.right.value, 120)
        owner_strings = [n.value for n in ast.walk(functions['owner'])
                         if isinstance(n, ast.Constant) and isinstance(n.value, str)]
        self.assertIn('TimeoutStopUSec', owner_strings)
        self.assertIn('2min', owner_strings)
        self.assertGreater(len(traversals) * deadline.value.right.value, 120)

    def test_actual_image_guard_accepts_missing_config_but_rejects_volume(self):
        guard = next(n for n in ast.walk(functions['run_install'])
                     if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
                     and len(n.value.args) == 2 and isinstance(n.value.args[1], ast.Constant)
                     and n.value.args[1].value == 'QA_PG_IMAGE_CHANGED')
        image = 'sha256:' + 'a' * 64
        module = ast.fix_missing_locations(ast.Module(body=[copy.deepcopy(guard)],
                                                      type_ignores=[]))
        code = compile(module, str(source_path), 'exec')
        namespace = {'need': need, 'IMAGE': image,
                     'iv': [{'Id': image, 'Os': 'linux', 'Architecture': 'amd64'}]}
        exec(code, namespace)
        namespace['iv'][0]['Config'] = {'Volumes': {'/unknown-volume': {}}}
        with self.assertRaisesRegex(RuntimeError, '^QA_PG_IMAGE_CHANGED$'):
            exec(code, namespace)


if __name__ == '__main__':
    unittest.main()
