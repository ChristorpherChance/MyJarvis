"""Same-host transport for the explicit server-planning document release only.
All managed release gates remain in the selected, fingerprinted release helper.
"""
import hashlib
import os
from pathlib import Path
import runpy
import shlex
import subprocess
import sys

RELEASE = '20261023-server-planning-r59'
EXPECTED = '20261020-platform-icons-r58'
if os.getuid() != 1000 or '--node=112' not in sys.argv or '--release=' + RELEASE not in sys.argv:
    raise RuntimeError('SERVER_PLANNING_TARGET_ONLY')
helper = Path('/home/superopen/All-Projects/MyJarvis/scripts/capture-managed-release.py')
expected_helper = '6c1a78752fc69d6cdeafd403ff29d3705de9b93376a363f92c3ef6ee13f87466'
if hashlib.sha256(helper.read_bytes()).hexdigest() != expected_helper:
    raise RuntimeError('MANAGED_RELEASE_HELPER_CHANGED')
original = subprocess.run
current = original(['sudo', '-n', 'readlink', '-f', '/opt/jarvis/current'], capture_output=True, text=True, check=True).stdout.strip()
if Path(current).name not in (EXPECTED, RELEASE):
    raise RuntimeError('UNEXPECTED_CURRENT_RELEASE')

def transport(command, *args, **kwargs):
    if isinstance(command, list) and command and command[0] == 'ssh':
        parts = shlex.split(command[-1])
        if command[-2] != 'jarvis-112' or parts[:4] != ['sudo', '-n', 'python3', '-c'] or len(parts) != 5:
            raise RuntimeError('UNEXPECTED_LOCAL_TRANSPORT')
        command = ['sudo', '-n', 'python3', '-c', parts[4]]
    return original(command, *args, **kwargs)

subprocess.run = transport
sys.argv[0] = str(helper)
runpy.run_path(str(helper), run_name='__main__')
