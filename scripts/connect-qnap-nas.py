"""NAS bootstrap with a pinned host key; password remains in memory, never argv/logs."""
import base64
import hashlib
import json
from pathlib import Path
import sys

import paramiko

workspace = Path(__file__).resolve().parent.parent
private_file = workspace / '.secrets' / 'nas-connection.json'
connection = json.loads(sys.stdin.read()) if '--vault-stdin' in sys.argv else json.loads(private_file.read_text(encoding='utf-8-sig'))
if connection.get('host') != '192.168.10.120' or connection.get('sshPort') != 22:
    raise RuntimeError('NAS_CONNECTION_TARGET_CHANGED')
if not connection.get('username') or not connection.get('password'):
    raise RuntimeError('NAS_LOGIN_INFORMATION_MISSING')

client = paramiko.SSHClient()
client.load_host_keys(str(workspace / 'artifacts' / 'nas-onboarding' / 'known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    client.connect(connection['host'], port=connection['sshPort'],
                   username=connection['username'], password=connection['password'],
                   look_for_keys=False, allow_agent=False,
                   timeout=12, banner_timeout=12, auth_timeout=12)
    _, stdout, stderr = client.exec_command('hostname', timeout=10)
    if stdout.read().decode().strip() != 'NAS9527':
        raise RuntimeError('NAS_HOSTNAME_MISMATCH')
    args = [arg for arg in sys.argv[1:] if arg not in ('--sudo', '--vault-stdin')]
    if args:
        script = Path(args[0]).resolve()
        if workspace not in script.parents or script.suffix != '.sh':
            raise RuntimeError('EXPECTED_WORKSPACE_SHELL_SCRIPT')
        elevated = '--sudo' in sys.argv[1:]
        stdin, stdout, stderr = client.exec_command('sudo -S -p "" /bin/sh -s' if elevated else '/bin/sh -s', timeout=75)
        if elevated:
            stdin.write(connection['password'] + '\n')
        connection['password'] = None
        stdin.write(script.read_text(encoding='utf-8'))
        stdin.channel.shutdown_write()
        result = stdout.read(256_001)
        error = stderr.read(8000)
        code = stdout.channel.recv_exit_status()
        if len(result) > 256_000 or code:
            if script.name in ('inspect-qnap-nas.sh', 'qnap-node-collector.sh'):
                # This fixed preflight emits only hardware and OS facts.
                print(result.decode('utf-8', errors='replace').strip())
                print(error.decode('utf-8', errors='replace').strip())
            # Do not print server error text that might contain private paths or input.
            raise RuntimeError('NAS_SCRIPT_FAILED_' + str(code))
        print(result.decode('utf-8').strip())
    else:
        key = client.get_transport().get_remote_server_key()
        fp = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
        print(json.dumps({'host': connection['host'], 'hostname': 'NAS9527',
                          'connected': True, 'fingerprint': fp, 'hostTrust': 'first-observed-key-pinned'}))
finally:
    client.close()
