#!/usr/bin/python3
"""The sole sudo entry for fixed project verification (no caller-selected code).

Install as /usr/local/libexec/jarvis-project-autonomy-validation, root:root 0755.
Policies/validator/helper/evidence parent paths are also root-owned. Product
commands drop to policy.runAsUser; this entry does not grant Docker/root access.
"""
import json
import os
from pathlib import Path
import re
import stat
import sys

NODE = '/opt/jarvis-development/node/bin/node'
VALIDATOR = '/opt/jarvis-development/software-factory/project-autonomy-validator.mjs'
HELPER = '/opt/jarvis-development/software-factory/project-autonomy-evidence.py'
COORDINATOR = '/opt/jarvis-development/software-factory/project-autonomy-fa01-coordinator.py'
POLICY_ROOT = '/etc/jarvis-development/project-autonomy'
RUN_ID = r'(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'


def reject(code):
    print(json.dumps({'schemaVersion': 1, 'kind': 'project-autonomy-validation',
                      'status': 'fail', 'simulated': False, 'errorCode': code}), flush=True)
    raise SystemExit(2)


def trusted(path, regular=False):
    p = Path(path)
    if not p.is_absolute():
        reject('VALIDATOR_TRUST_PATH_INVALID')
    for part in [p, *p.parents]:
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            reject('VALIDATOR_TRUST_BOUNDARY_INVALID')
    if regular and (not stat.S_ISREG(p.lstat().st_mode) or p.lstat().st_nlink != 1):
        reject('VALIDATOR_TRUST_FILE_INVALID')


def main():
    if os.geteuid() != 0:
        reject('VALIDATOR_ROOT_REQUIRED')
    if len(sys.argv) != 5:
        reject('VALIDATION_ARGUMENTS_INVALID')
    workspace, run_id, work_package, goal_hash = sys.argv[1:]
    if (not re.fullmatch(RUN_ID, run_id) or not re.fullmatch(r'FA-?\d{2}', work_package)
            or not re.fullmatch(r'[0-9a-f]{64}', goal_hash)):
        reject('VALIDATION_IDENTITY_INVALID')
    p = Path(workspace)
    if not p.is_absolute() or str(p) != workspace or '..' in p.parts:
        reject('WORKSPACE_PATH_INVALID')
    policy_path = str(Path(POLICY_ROOT) / (work_package + '.json'))
    for file in [str(Path(__file__).absolute()), NODE, VALIDATOR, HELPER, policy_path]:
        trusted(file, regular=True)
    # Read only bounded root-owned policy. No source/env/key is read here.
    with open(policy_path, 'rb') as handle:
        raw = handle.read(128 * 1024 + 1)
    if len(raw) > 128 * 1024:
        reject('POLICY_SIZE_LIMIT')
    policy = json.loads(raw)
    if policy.get('workPackage') != work_package or policy.get('goalSpecHash') != goal_hash:
        reject('POLICY_IDENTITY_MISMATCH')
    if bool(policy.get('workspace')) == bool(policy.get('workspaceRoot')):
        reject('POLICY_WORKSPACE_INVALID')
    approved = policy.get('workspace') or str(Path(policy['workspaceRoot']) / run_id / 'source')
    if workspace != approved:
        reject('WORKSPACE_NOT_APPROVED')
    # An untrusted caller cannot inject NODE_OPTIONS, module loaders, home rc or
    # a PATH into privileged code. argv/policy itself has no arbitrary shell.
    os.umask(0o077)
    os.chdir('/')
    if policy.get('mode') in ('fa01-isolated-v1', 'project-isolated-v1'):
        if not re.fullmatch(r'FA-?0[1-9]', work_package) or (policy['mode'] == 'fa01-isolated-v1' and work_package not in ('FA-01', 'FA01')):
            reject('FA01_POLICY_MISMATCH')
        trusted(COORDINATOR, regular=True)
        python = str(Path('/usr/bin/python3').resolve())
        trusted(python, regular=True)
        os.execve(python, [python, COORDINATOR, policy_path, workspace, run_id,
                          work_package, goal_hash],
                  {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'})
    os.execve(NODE, [NODE, VALIDATOR, '--policy', policy_path, '--workspace', workspace,
                    '--run-id', run_id, '--goal-spec-hash', goal_hash,
                    '--work-package', work_package],
              {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'})


if __name__ == '__main__':
    try:
        main()
    except (FileNotFoundError, PermissionError):
        reject('TRUSTED_VALIDATOR_OR_POLICY_MISSING')
    except (OSError, ValueError, KeyError, TypeError):
        reject('VALIDATOR_CONFIGURATION_INVALID')
