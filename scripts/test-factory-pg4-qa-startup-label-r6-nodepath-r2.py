"""One pure writer-expression case. No lifecycle function, Docker or Root."""
import ast, hashlib, pathlib, unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class EmptyNodePathWriter(unittest.TestCase):
    def test_only_explicit_empty_node_path_is_added(self):
        old = (ROOT / 'scripts/factory-pg4-qa-startup-worker-r33-main602-label-r6.py').read_bytes()
        new = (ROOT / 'scripts/factory-pg4-qa-startup-worker-r33-main602-label-r6-nodepath-r2.py').read_bytes()
        tree = ast.parse(new)
        calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'store' and n.args and "'pg4-runner.env'" in ast.get_source_segment(new.decode(), n.args[0])]
        self.assertEqual(len(calls), 1)
        expression = ast.Expression(body=calls[0].args[1])
        value = eval(compile(expression, '<controlled-runner-env-expression>', 'eval'), {'password': 'test-only-password', 'database': 'jarvis_truth_pg4_r33'})
        self.assertEqual(value, b'R29_TEST_DATABASE_URL=postgres://qa:test-only-password@postgres:5432/jarvis_truth_pg4_r33\nNODE_PATH=\n')
        fields = dict(row.split('=', 1) for row in value.decode().splitlines())
        self.assertEqual(set(fields), {'R29_TEST_DATABASE_URL', 'NODE_PATH'})
        self.assertEqual(fields['NODE_PATH'], '')
        before = b"('R29_TEST_DATABASE_URL=postgres://qa:' + password + '@postgres:5432/' + database + '\\n').encode()"
        after = b"('R29_TEST_DATABASE_URL=postgres://qa:' + password + '@postgres:5432/' + database + '\\nNODE_PATH=\\n').encode()"
        self.assertEqual(new.replace(after, before), old)
        def check_body(raw):
            n = next(n for n in ast.parse(raw).body if isinstance(n, ast.FunctionDef) and n.name == 'check_resource')
            return ast.get_source_segment(raw.decode(), n).encode()
        self.assertEqual(check_body(new), check_body(old))
        self.assertIn(b"'NODE_PATH'", check_body(new))
        self.assertIn(b"all(not actual_env.get(k) for k in forbidden)", check_body(new))

if __name__ == '__main__':
    unittest.main()
