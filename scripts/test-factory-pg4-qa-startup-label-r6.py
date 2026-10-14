"""One controlled data group. No Docker, Root, lifecycle, framework or package calls."""
import ast, base64, hashlib, json, pathlib, unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/factory-pg4-qa-startup-worker-r33-main602-label-r6.py'

class LabelAndUnitDataGroup(unittest.TestCase):
    def test_actual_label_projection_and_unit_shapes(self):
        raw = SOURCE.read_bytes()
        tree = ast.parse(raw)
        selected = {'need', 'labels', 'decode_image_json', 'image_label_identity', 'merged_image_container_labels', 'unit_property_scope'}
        nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in selected]
        self.assertEqual({n.name for n in nodes}, selected)
        images = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'IMAGES' for t in n.targets))
        namespace = {'json': json, 'IMAGES': images}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), '<controlled-pure-source-functions>', 'exec'), namespace)
        captures = [
            ('.jarvis-dev/maintenance/r33-pg4-proof-r5-inspect-capture-original-1791956111272-2e6fee4e-f56c-4f9e-a732-7f0bf9f3a844.json', '3782b41b438b7c052be6a661d6a1c67fbe3baf0a9a4861b7bfaf0a162d4eddef'),
            ('.jarvis-dev/maintenance/r33-pg4-proof-r5-inspect-capture-original-1791956111355-2a9af425-e246-4136-9a9c-596b0bacad94.json', '160f8feb4d0dc7e48f1908144d5f457694d97b0541d14eed978ed4429e0ea967'),
        ]
        attempt = '69e5926d169160f2b70eaab63c1b4e23'
        reserved = namespace['labels'](attempt)
        for path, expected_h in captures:
            packet_raw = (ROOT / path).read_bytes()
            self.assertEqual(hashlib.sha256(packet_raw).hexdigest(), expected_h)
            packet = json.loads(packet_raw)
            inspected = json.loads(base64.b64decode(packet['stdoutBase64'], validate=True))[0]
            actual = inspected['Config']['Labels']
            self.assertEqual({k: actual[k] for k in reserved}, reserved)
            base = {k: v for k, v in actual.items() if k not in reserved}
            self.assertEqual(set(base), {'jarvis.playwright', 'jarvis.purpose'})
            # The image response here is a controlled fixture, not actual image provenance.
            image = {'Id': images['runner'], 'Os': 'linux', 'Architecture': 'amd64', 'Config': {'Labels': base}}
            identity = namespace['image_label_identity'](image, images['runner'])
            expected = namespace['merged_image_container_labels'](identity, attempt)
            self.assertEqual(actual, expected)
            self.assertNotEqual({**actual, 'jarvis.unexpected': 'extra'}, expected)
            with self.assertRaises(RuntimeError):
                namespace['image_label_identity']({**image, 'Config': {'Labels': {**base, 'jarvis.pg4.r33.attempt': 'reserved'}}}, images['runner'])
            with self.assertRaises(RuntimeError):
                namespace['image_label_identity']({**image, 'Config': {'Labels': {'bad': 3}}}, images['runner'])
        with self.assertRaises(RuntimeError):
            namespace['decode_image_json'](b'{"Config":{"Labels":{"x":"a","x":"b"}}}')
        none = namespace['image_label_identity']({'Id': images['postgres'], 'Os': 'linux', 'Architecture': 'amd64', 'Config': {'Labels': None}}, images['postgres'])
        self.assertEqual(namespace['merged_image_container_labels'](none, attempt), reserved)
        diagnostic_raw = (ROOT / '.jarvis-dev/maintenance/r33-pg4-proof-r5-failure-diagnostic-private-1791954602598-0f3379b3-35e3-4cfc-88a9-bd82d6de63ee.json').read_bytes()
        self.assertEqual(hashlib.sha256(diagnostic_raw).hexdigest(), '44d1bbe779e73c5a6d5ac86c8142fbed01cace671adbb0a13bd0566f70b38be0')
        observation = json.loads(base64.b64decode(json.loads(diagnostic_raw)['stdoutBase64'], validate=True))
        for frame in observation['unitFrames']:
            props = frame['properties']
            self.assertEqual(len(props), 16)
            self.assertEqual(props['LoadState'], 'not-found')
            self.assertEqual(namespace['unit_property_scope'](props, props['Id'], True), props)
            with self.assertRaises(RuntimeError):
                namespace['unit_property_scope'](props, props['Id'], False)
            with self.assertRaises(RuntimeError):
                namespace['unit_property_scope']({**props, 'ExecStart': '', 'ExecStopPost': ''}, props['Id'], True)
            loaded = {**props, 'LoadState': 'loaded', 'ExecStart': '{ real-command-domain }', 'ExecStopPost': '{ real-stop-command-domain }'}
            self.assertEqual(namespace['unit_property_scope'](loaded, props['Id']), loaded)
            with self.assertRaises(RuntimeError):
                namespace['unit_property_scope']({k: v for k, v in loaded.items() if k != 'ExecStart'}, props['Id'], True)
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(), hashlib.sha256(raw).hexdigest())

if __name__ == '__main__':
    unittest.main()
