"""Use the existing NAS credential through a private askpass socket; never print it."""
import json
import os
from pathlib import Path
import secrets
import socket
import struct
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]

def load_login():
    helper = ROOT / 'scripts/ssh-access/nas-vault-bridge.mjs'
    temporary = '/tmp/jarvis-nas-vault-bridge-20261020.mjs'
    subprocess.run(['sudo', '-n', 'install', '-o', 'jarvis', '-g', 'jarvis', '-m', '600', str(helper), temporary], check=True, capture_output=True)
    value = subprocess.run(['sudo', '-n', '-u', 'jarvis', 'env', 'JARVIS_NAS_PRIVATE_PIPE=1', '/opt/jarvis/node/bin/node', temporary], capture_output=True, text=True, timeout=30)
    if value.returncode:
        raise RuntimeError('NAS_VAULT_UNAVAILABLE')
    login = json.loads(value.stdout)
    if login.get('host') != '192.168.10.120' or login.get('port') != 22 or login.get('username') != 'superopen' or not isinstance(login.get('password'), str) or not login['password']:
        raise RuntimeError('NAS_LOGIN_TARGET_CHANGED')
    return login

def run_ssh(login, command, content='', timeout=40, elevate=False, endpoint=('192.168.10.120', 22), force_pty=False):
    if force_pty and (elevate or content):
        raise RuntimeError('PRIVATE_INPUT_CANNOT_USE_PTY')
    if endpoint not in [('192.168.10.120', 22), ('ssh-120.ikvein.com', 59527)]:
        raise RuntimeError('SSH_TARGET_NOT_ALLOWED')
    with tempfile.TemporaryDirectory(prefix='jarvis-nas-private-') as directory:
        root = Path(directory)
        private_socket = str(root / 'askpass.sock')
        nonce = secrets.token_hex(24)
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(private_socket)
        os.chmod(private_socket, 0o600)
        server.listen(1)
        server.settimeout(timeout)
        requests = []
        def serve():
            try:
                client, _ = server.accept()
                with client:
                    client.settimeout(5)
                    _, uid, _ = struct.unpack('3i', client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                    if uid != os.getuid() or client.recv(256).decode() != nonce:
                        return
                    requests.append(True)
                    client.sendall(login['password'].encode('utf-8'))
            except (OSError, ValueError):
                pass
        worker = threading.Thread(target=serve, daemon=True)
        worker.start()
        askpass = root / 'askpass.py'
        askpass.write_text("#!/usr/bin/python3\nimport os,socket,sys\ns=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)\ns.connect(os.environ['JARVIS_NAS_ASKPASS_SOCKET'])\ns.sendall(os.environ['JARVIS_NAS_ASKPASS_NONCE'].encode())\nparts=[]\nwhile True:\n b=s.recv(4096)\n if not b:break\n parts.append(b)\nsys.stdout.buffer.write(b''.join(parts)+b'\\n')\ns.close()\n")
        askpass.chmod(0o700)
        environment = {**os.environ, 'SSH_ASKPASS': str(askpass), 'SSH_ASKPASS_REQUIRE': 'force', 'DISPLAY': 'jarvis-nas-private', 'JARVIS_NAS_ASKPASS_SOCKET': private_socket, 'JARVIS_NAS_ASKPASS_NONCE': nonce}
        known = ROOT / 'artifacts/ssh-120-59527/nas-120-known_hosts'
        # The wrapper consumes the auth line and writes only the remaining script
        # to a private temporary file. sudo alone receives the password pipe;
        # the root script receives /dev/null even with cached auth/NOPASSWD.
        wrapper = "set +x; export LC_ALL=C; umask 077; case \"$(type printf 2>/dev/null)\" in *builtin*) ;; *) exit 71;; esac; IFS= read -r JARVIS_PRIVATE_SUDO || exit 72; JARVIS_PRIVATE_DIR=$(mktemp -d /tmp/jarvis-nas-admin.XXXXXXXX) || exit 73; trap 'rm -f \"$JARVIS_PRIVATE_DIR/script.sh\"; rmdir \"$JARVIS_PRIVATE_DIR\"' EXIT HUP INT TERM; cat > \"$JARVIS_PRIVATE_DIR/script.sh\" || exit 74; printf '%s\\n' \"$JARVIS_PRIVATE_SUDO\" | sudo -k -S -p \"\" /bin/sh -c 'exec /bin/sh \"$1\" </dev/null' sh \"$JARVIS_PRIVATE_DIR/script.sh\"; JARVIS_SUDO_CODE=$?; unset JARVIS_PRIVATE_SUDO; exit \"$JARVIS_SUDO_CODE\""
        remote = "/bin/sh -c '" + wrapper.replace("'", "'\"'\"'") + "'" if elevate else command
        args = ['ssh', '-F', '/dev/null', '-p', str(endpoint[1]), '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile='+str(known), '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'HostKeyAlias=192.168.10.120', '-o', 'IdentityAgent=none', '-o', 'PubkeyAuthentication=no', '-o', 'KbdInteractiveAuthentication=no', '-o', 'PreferredAuthentications=password', '-o', 'NumberOfPasswordPrompts=1', '-o', 'ConnectTimeout=10', '-tt' if force_pty else '-T', 'superopen@'+endpoint[0], remote]
        payload = (login['password']+'\n' if elevate else '')+content
        try:
            result = subprocess.run(args, input=payload, capture_output=True, text=True, timeout=timeout, env=environment, start_new_session=True)
            return result, len(requests)
        finally:
            server.close()
            worker.join(timeout=1)
