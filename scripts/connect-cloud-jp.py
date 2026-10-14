"""Scoped JP bootstrap, using the user's supplied credential file in memory only.

First-use host trust is saved after the archived hostname is checked. Subsequent
connections reject key changes. No credentials are written to reports or argv.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import paramiko

workspace = Path(__file__).resolve().parent.parent
vault = Path.home() / '.jarvis-deployment' / 'MyJevis'
known = vault / 'cloud-known-hosts'
source = (workspace / 'serverinfo' / 'JP' / 'server-info.txt').read_text(encoding='utf-8-sig').splitlines()
host = source[0].strip()
user, password = source[1].strip().split('/', 1)
if host != '8.209.253.19' or user != 'root':
    raise RuntimeError('JP supplied connection target differs from archived server')
client = paramiko.SSHClient()
if known.exists():
    client.load_host_keys(str(known))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
else:
    # This is explicitly recorded as first-use trust, not out-of-band verification.
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect(host, username=user, password=password, look_for_keys=False,
                   allow_agent=False, timeout=15, banner_timeout=15, auth_timeout=15)
    password = None
    stdin, stdout, stderr = client.exec_command('hostname', timeout=10)
    hostname = stdout.read().decode().strip()
    if hostname != 'iZ6weh9v2znkrilvwc1vxlZ':
        raise RuntimeError('JP hostname does not match supplied archive; bootstrap stopped')
    first = not known.exists()
    if first:
        client.save_host_keys(str(known))
    key = client.get_transport().get_remote_server_key()
    fingerprint = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
    if len(sys.argv) > 1:
        script = Path(sys.argv[1]).resolve()
        # Only a repository-owned script can be passed, never a shell command string.
        if workspace not in script.parents:
            raise RuntimeError('Remote script must be a workspace file')
        if script.suffix == '.py':
            command = 'python3 -'
        elif script.suffix == '.sh':
            command = 'bash -s'
        else:
            raise RuntimeError('Expected Python or shell script file')
        stdin, stdout, stderr = client.exec_command(command, timeout=60)
        stdin.write(script.read_text(encoding='utf-8'))
        stdin.channel.shutdown_write()
        output = stdout.read().decode()
        error = stderr.read().decode()
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError('Remote script failed with exit ' + str(code))
        print(output.strip())
    else:
        print(json.dumps({'host': host, 'hostname': hostname, 'connected': True,
                          'fingerprint': fingerprint, 'hostTrust': 'first-use' if first else 'pinned'}))
finally:
    client.close()
