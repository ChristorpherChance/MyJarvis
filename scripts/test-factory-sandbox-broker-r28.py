"""R28 offline compatibility boundaries; all daemon/control actions use isolated fakes."""
import copy
import json
from pathlib import Path
import subprocess
import unittest
import urllib.parse
from unittest.mock import patch

import importlib.util


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


legacy = load('r28_legacy_boundary_tests', 'test-factory-sandbox-broker.py')
broker = load('r28_broker_fixture', 'factory-sandbox-broker-r28.py')
control = load('r28_control_fixture', 'factory-sandbox-broker-control-r28.py')
# Original test bodies resolve these globals at execution time. Retain every
# original boundary test against the new modules and the same fake daemon.
legacy.broker, legacy.control = broker, control
RUN, SOURCE, NETWORK_ID, IMAGE, IMAGE_ID = legacy.RUN, legacy.SOURCE, legacy.NETWORK_ID, legacy.IMAGE, legacy.IMAGE_ID


def echo_items(value):
    return [('Image', value['Image'])] + [('Cmd', part) for part in value['Cmd']] + [
        ('HostConfig', json.dumps(value['HostConfig'], separators=(',', ':')))]


def target(items, path='/containers/create'):
    return path + '?' + urllib.parse.urlencode(items)


SDK_CAPTURE_JS = r"""
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),querystring=require('node:querystring'),url=require('node:url'),path=require('node:path');
const bytes=fs.readFileSync('artifacts/software-factory/acceptance-r27/public-sdk-query-source-1791777802817-b4110fc4-dc36-44d2-90bb-4dd4e786beb3.json');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
if(digest(bytes)!=='46673dca25e810d6ad9efc13b1c48630154fb958158d1aaa9c6c1048e473f1a6')throw Error('PINNED_SDK_REPORT_CHANGED');
const report=JSON.parse(bytes),rows=report.diagnosis.sdkPublicSources,methods=rows.filter(r=>r.tree==='installed');
if(methods.length!==13)throw Error('PINNED_SDK_METHOD_COUNT_CHANGED');
for(const row of methods){if(digest(row.publicFunctionSource)!==row.functionSHA256)throw Error('PINNED_SDK_METHOD_CHANGED');
 const work=rows.find(v=>v.tree==='work'&&v.package===row.package&&v.functionSHA256===row.functionSHA256);
 if(!work||work.fileSHA256!==row.fileSHA256||work.publicFunctionSource!==row.publicFunctionSource)throw Error('PINNED_SDK_SOURCE_BINDING_CHANGED');}
if(methods.filter(r=>r.package==='docker-modem').some(r=>r.querystringIsNodeCore!==true))throw Error('SDK_QUERYSTRING_BINDING_CHANGED');
const captures=[],context=vm.createContext({querystring,url,path,Buffer,module:{exports:{}},util:{},each:Array.prototype.forEach,slice:Array.prototype.slice,fs:{createReadStream:()=>{throw Error('FILE_IO_FORBIDDEN');}}});
context.makeModem=()=>{const modem=new context.Modem();modem.Promise=Promise;modem.headers={};
 modem.buildRequest=(request,options,data,callback)=>{if(request.method!=='POST'||url.parse(request.path).pathname!=='/containers/create')throw Error('UNAPPROVED_CAPTURE_ROUTE');captures.push({target:request.path,body:JSON.parse(data)});callback(null,{Id:'d'.repeat(64)});};return modem;};
vm.runInContext('function Docker(){this.modem=makeModem();}function Modem(){};',context,{timeout:1000});
for(const row of methods)vm.runInContext(row.publicFunctionSource,context,{timeout:1000});
context.module.exports.extend=context.extend;context.util.processArgs=context.processArgs;
const bodies=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{for(const body of bodies)await new context.Docker().createContainer(body);process.stdout.write(JSON.stringify(captures));})().catch(()=>{process.stderr.write('CONTROLLED_SDK_CAPTURE_FAILED');process.exitCode=1;});
"""


class R28BoundaryTests(legacy.BoundaryTests):
    def reset_fixture(self):
        self.daemon = legacy.FakeDaemon()
        self.fixture = broker.Broker(self.daemon, RUN, SOURCE, NETWORK_ID, IMAGE)

    def denied_before_daemon(self, value, items, method='POST', path='/containers/create', code=None, status=None):
        before = copy.deepcopy(self.daemon.calls)
        with self.assertRaises(broker.Denied) as caught:
            self.fixture.dispatch(method, target(items, path), json.dumps(value).encode())
        if code is not None:
            self.assertEqual(caught.exception.code, code)
        if status is not None:
            self.assertEqual(caught.exception.status, status)
        self.assertEqual(self.daemon.calls, before, 'Rejected input must never reach the fake daemon')
        self.assertEqual(self.fixture.creates, 0)

    def test_short_runtime_path_is_75_bytes_and_never_accepts_cross_run_path(self):
        # Namespace changes account for four additional bytes; the same short
        # socket and cross-run/max-path safeguards remain in force.
        self.assertEqual(broker.runtime_socket(RUN).as_posix(), '/run/jarvis-ft-sandbox-r28/' + RUN + '/docker.sock')
        self.assertEqual(len(str(broker.runtime_socket(RUN)).encode()), 79)
        self.assert_denied(lambda: broker.runtime_socket('../' + RUN), 'FIXTURE_IDENTITY_REQUIRED')
        with patch.object(broker, 'RUNTIME_ROOT', Path('/run/' + 'x' * 80)):
            self.assert_denied(lambda: broker.runtime_socket(RUN), 'AF_UNIX_PATH_LIMIT')

    def test_r28_namespaces_are_independent_of_old_and_r27_tools(self):
        self.assertEqual(broker.ROOT.as_posix(), '/var/lib/jarvis-development/101/full-validation-r28')
        self.assertEqual(broker.RUNTIME_ROOT.as_posix(), '/run/jarvis-ft-sandbox-r28')
        self.assertEqual(control.BROKER_FILE.name, 'factory-sandbox-broker-r28.py')
        self.assertEqual(broker.PIN, legacy.IMAGE_ID)

    def test_actual_sdk_echo_accepts_three_two_one_cmd_values_in_order(self):
        for command in [('sh', '-c', 'echo hello-sandbox'), ('sleep', '30'), ('true',)]:
            with self.subTest(command=command):
                self.reset_fixture()
                value = legacy.body(command)
                items = echo_items(value)
                self.assertEqual(broker.parse_target_items(target(items, '/v1.41/containers/create')),
                                 ('/containers/create', items))
                self.assertEqual(broker.normalize_create_echo_query(items, value), {})
                code, result, content_type = self.fixture.dispatch('POST', target(items), json.dumps(value).encode())
                self.assertEqual(code, 201)
                self.assertEqual(content_type, 'application/json')
                self.assertIn(result['Id'], self.daemon.objects)
                calls = [row for row in self.daemon.calls if row[1].startswith('/containers/create?')]
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0][2]['Cmd'], list(command))
                self.assertEqual(calls[0][2]['Image'], 'alpine@' + broker.PIN)
                self.assertEqual(calls[0][2]['HostConfig'], dict(value['HostConfig'], PidsLimit=64))
                self.assertEqual(calls[0][2]['Labels'], broker.identities(RUN, SOURCE))
                forwarded = urllib.parse.parse_qs(urllib.parse.urlsplit(calls[0][1]).query)
                self.assertEqual(set(forwarded), {'name'})
                self.assertEqual(forwarded['name'], ['jarvis-ft-' + RUN + '-sandbox-1'])

    def test_empty_query_remains_the_original_create_path(self):
        value = legacy.body()
        self.assertEqual(broker.normalize_create_echo_query([], value), {})
        result = self.fixture.dispatch('POST', '/containers/create', json.dumps(value).encode())
        self.assertEqual(result[0], 201)
        self.assertEqual(self.fixture.creates, 1)

    def test_pinned_actual_sdk_methods_generate_targets_accepted_by_new_fake_broker(self):
        # All six allowed commands, including the seven-token wget command and
        # the two quota slots for sleep 5, must use the same SDK echo path.
        bodies = [legacy.body(command) for command, cap in broker.COMMAND_CAPS.items() for _ in range(cap)]
        bodies.append(legacy.body(('true',)))  # Eighth SDK request must stay denied.
        # Raw targets/bodies remain only in this subprocess pipe and test memory.
        # No real SDK transport, HTTP request, socket, Docker daemon or model is used.
        capture = subprocess.run(['node', '-e', SDK_CAPTURE_JS], input=json.dumps(bodies),
                                 text=True, capture_output=True, cwd=Path(__file__).resolve().parents[1], timeout=10)
        self.assertEqual(capture.returncode, 0, 'Pinned, transport-free SDK capture failed')
        rows = json.loads(capture.stdout)
        self.assertEqual(len(rows), 8)
        self.reset_fixture()
        for ordinal, (value, row) in enumerate(zip(bodies[:-1], rows[:-1]), start=1):
            self.assertEqual(row['body'], value)
            path, items = broker.parse_target_items(row['target'])
            self.assertEqual(path, '/containers/create')
            self.assertEqual([value for key, value in items if key == 'Cmd'], row['body']['Cmd'])
            self.assertEqual(broker.normalize_create_echo_query(items, row['body']), {})
            response = self.fixture.dispatch('POST', row['target'], json.dumps(row['body']).encode())
            self.assertEqual(response[0], 201)
            self.assertEqual(self.fixture.creates, ordinal)
            self.assertEqual(self.fixture.dispatch('DELETE', '/containers/' + response[1]['Id'] + '?force=true')[0], 204)
        before = copy.deepcopy(self.daemon.calls)
        with self.assertRaises(broker.Denied) as caught:
            self.fixture.dispatch('POST', rows[-1]['target'], json.dumps(rows[-1]['body']).encode())
        self.assertEqual(caught.exception.code, 'CREATE_BUDGET_EXHAUSTED')
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(self.daemon.calls, before)
        self.assertEqual(self.fixture.creates, 7)

    def test_cmd_echo_cannot_be_changed_reordered_missing_or_extra(self):
        value = legacy.body()
        cases = [
            [('Image', value['Image']), ('Cmd', 'sh'), ('Cmd', '-c'), ('Cmd', 'echo changed'), ('HostConfig', json.dumps(value['HostConfig']))],
            [('Image', value['Image']), ('Cmd', '-c'), ('Cmd', 'sh'), ('Cmd', value['Cmd'][2]), ('HostConfig', json.dumps(value['HostConfig']))],
            [(key, val) for index, (key, val) in enumerate(echo_items(value)) if index != 2],
            [(key, val) for key, val in echo_items(value) if key != 'Cmd'],
            echo_items(value) + [('Cmd', 'extra')],
        ]
        for items in cases:
            with self.subTest(items=items):
                self.denied_before_daemon(value, items)

    def test_duplicate_image_host_and_forbidden_query_keys_reject_before_daemon(self):
        value = legacy.body()
        for addition in [('Image', value['Image']), ('HostConfig', json.dumps(value['HostConfig'])),
                         ('Env', ''), ('Env', '[]'), ('name', 'foreign'), ('Labels', '{}'), ('Unknown', 'x')]:
            with self.subTest(key=addition[0], value=addition[1]):
                self.denied_before_daemon(value, echo_items(value) + [addition])

    def test_image_echo_must_match_body_and_cannot_omit_host(self):
        value = legacy.body()
        for items in [[(key, 'alpine:other' if key == 'Image' else val) for key, val in echo_items(value)],
                      [(key, val) for key, val in echo_items(value) if key != 'Image'],
                      [(key, val) for key, val in echo_items(value) if key != 'HostConfig']]:
            self.denied_before_daemon(value, items)

    def test_host_echo_rejects_duplicate_nonfinite_empty_and_mismatched_json(self):
        value = legacy.body()
        duplicate = json.dumps(value['HostConfig'])[:-1] + ',"Memory":268435456}'
        nonfinite = json.dumps(value['HostConfig']).replace('268435456', 'NaN')
        changed = copy.deepcopy(value['HostConfig']); changed['ReadonlyRootfs'] = 1
        host_values = [duplicate, nonfinite, '', '{}', 'null', '[1]', json.dumps(changed)]
        for host in host_values:
            with self.subTest(host=host):
                items = [(key, host if key == 'HostConfig' else val) for key, val in echo_items(value)]
                self.denied_before_daemon(value, items)

    def test_host_query_json_key_order_does_not_change_its_exact_value(self):
        value = legacy.body()
        reversed_host = {key: value['HostConfig'][key] for key in reversed(value['HostConfig'])}
        items = [(key, json.dumps(reversed_host) if key == 'HostConfig' else val) for key, val in echo_items(value)]
        self.assertEqual(self.fixture.dispatch('POST', target(items), json.dumps(value).encode())[0], 201)

    def test_env_body_and_create_cap_limits_are_not_weakened_by_echo_normalization(self):
        for env in [['A=not-allowed'], None, '']:
            value = legacy.body(); value['Env'] = env
            self.denied_before_daemon(value, echo_items(value))
        value = legacy.body(); value['HostConfig']['Memory'] = 536870912
        self.denied_before_daemon(value, echo_items(value))

    def test_unsupported_image_command_and_host_extra_still_reject_after_valid_echo(self):
        cases = [legacy.body(('sh', '-c', 'echo unlisted'))]
        image = legacy.body(); image['Image'] = 'ubuntu:latest'; cases.append(image)
        host = legacy.body(); host['HostConfig']['Privileged'] = True; cases.append(host)
        for value in cases:
            self.denied_before_daemon(value, echo_items(value))

    def test_bad_percent_encoding_never_reaches_daemon(self):
        value = legacy.body()
        for query in ['Image=%zz', 'Cmd=%', 'HostConfig=%1', 'HostConfig=%GG', 'Image=%FF']:
            with self.subTest(query=query), self.assertRaises(broker.Denied):
                self.fixture.dispatch('POST', '/containers/create?' + query, json.dumps(value).encode())
        self.assertEqual(self.daemon.calls, [])
        self.assertEqual(self.fixture.creates, 0)

    def test_other_methods_and_endpoints_preserve_duplicate_query_400_guard(self):
        values = [('GET', '/images/json', [('filters', '{}'), ('filters', '{}')]),
                  ('GET', '/_ping', [('x', '1'), ('x', '1')]),
                  ('GET', '/containers/create', [('Cmd', 'sh'), ('Cmd', '-c')]),
                  ('DELETE', '/containers/' + 'd' * 64, [('force', 'true'), ('force', 'true')]),
                  ('POST', '/containers/' + 'd' * 64 + '/start', [('x', '1'), ('x', '1')]),
                  ('PUT', '/containers/create', [('Cmd', 'sh'), ('Cmd', '-c')])]
        for method, path, items in values:
            with self.subTest(method=method, path=path):
                with self.assertRaises(broker.Denied) as caught:
                    self.fixture.dispatch(method, target(items, path))
                self.assertEqual(caught.exception.code, 'DUPLICATE_QUERY')
                self.assertEqual(caught.exception.status, 400)
        self.assertEqual(self.daemon.calls, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
