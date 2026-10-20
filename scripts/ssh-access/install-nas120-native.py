"""NAS-owned SSH tunnel. Setup uses a private in-memory credential bridge."""
import argparse
import base64
import datetime
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

from nas_ssh_bridge import ROOT, load_login, run_ssh

NAME = 'jarvis-nas120-ssh'
OPERATION = 'nas120-independent-ssh-20261020'
DIRECTORY = '/share/CACHEDEV1_DATA/.jarvis-ssh-access'
DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'
BINARY = Path('/opt/jarvis-frpc/frpc')
BINARY_SHA = '142f447f43fef286acc8da8a6852dda80631db631d604b2e63634b2db4d6848c'
PIN = 'SHA256:6R7RvgtD74nLDuSTqXz4yZC5NcX8tyd0O2sVybmDYas'
TAG = 'jarvis/nas120-ssh:frpc-0.69.1-142f447f43fe'
ARTIFACTS = ROOT / 'artifacts/nas120-independent-ssh'
QUOTE = lambda value: "'" + str(value).replace("'", "'\"'\"'") + "'"

def require(condition, code):
    if not condition:
        raise RuntimeError(code)

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def source_hash():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

def fixed_prefix():
    return f"""set +x
set -eu
export LC_ALL=C
umask 077
test "$(id -u)" = 0
test "$(hostname)" = NAS9527
test "$(uname -m)" = x86_64
test "$(/sbin/getcfg container-station Enable -f /etc/config/qpkg.conf)" = TRUE
docker={QUOTE(DOCKER)}
d={QUOTE(DIRECTORY)}
name={QUOTE(NAME)}
operation={QUOTE(OPERATION)}
test -x "$docker"
"""

def protected_section(marker):
    return f"""
printf 'JARVIS_{marker}_BEGIN\\n'
for cid in $("$docker" ps -aq --no-trunc); do
 "$docker" inspect --format '{{{{.Id}}}}|{{{{.Name}}}}|{{{{.State.Pid}}}}|{{{{.State.Running}}}}|{{{{.State.StartedAt}}}}|{{{{.Image}}}}|{{{{.HostConfig.RestartPolicy.Name}}}}|{{{{.HostConfig.NetworkMode}}}}|{{{{.HostConfig.ReadonlyRootfs}}}}|{{{{.Config.User}}}}' "$cid"
done
printf 'JARVIS_{marker}_END\\n'
"""

def section(text, name):
    return text.split('JARVIS_'+name+'_BEGIN\n', 1)[1].split('JARVIS_'+name+'_END', 1)[0].strip().splitlines()

def tar_payload():
    value = BINARY.read_bytes()
    require(hashlib.sha256(value).hexdigest() == BINARY_SHA, 'BINARY_CHANGED')
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz', compresslevel=6) as archive:
        for name in ['run', 'etc']:
            item = tarfile.TarInfo(name)
            item.type = tarfile.DIRTYPE
            item.mode = 0o755
            item.mtime = 0
            archive.addfile(item)
        item = tarfile.TarInfo('frpc')
        item.size = len(value)
        item.mode = 0o555
        item.mtime = 0
        archive.addfile(item, io.BytesIO(value))
    return output.getvalue()

def private_config():
    code = "from pathlib import Path; print(Path('/etc/jarvis-nas120-ssh-access/frpc.toml').read_text(),end='')"
    result = subprocess.run(['sudo', '-n', 'python3', '-c', code], capture_output=True, text=True, timeout=10)
    require(result.returncode == 0, 'OLD_FORWARD_CONFIGURATION_UNAVAILABLE')
    import tomllib
    prior = tomllib.loads(result.stdout)
    require(prior['serverAddr'] == '8.163.127.192' and prior['serverPort'] == 7000 and prior['auth']['method'] == 'token' and bool(prior['auth']['token']), 'OLD_FORWARD_CONFIGURATION_CHANGED')
    require(prior['proxies'][0]['localIP'] == '192.168.10.120' and prior['proxies'][0]['localPort'] == 22 and prior['proxies'][0]['remotePort'] == 59527, 'OLD_FORWARD_TARGET_CHANGED')
    return '\n'.join(['serverAddr = "8.163.127.192"', 'serverPort = 7000', 'user = "nas120-independent-ssh"', 'loginFailExit = false', 'auth.method = "token"', 'auth.token = '+json.dumps(prior['auth']['token']), 'transport.tls.enable = true', 'log.to = "console"', 'log.level = "warn"', 'log.disablePrintColor = true', '', '[[proxies]]', 'name = "ssh-120-direct-59527"', 'type = "tcp"', 'localIP = "127.0.0.1"', 'localPort = 22', 'remotePort = 59527', ''])

def prepare(login):
    archive = tar_payload()
    config = private_config().encode()
    archive_sha = hashlib.sha256(archive).hexdigest()
    # The generated payload contains private config and is sent only via encrypted stdin.
    script = fixed_prefix()+protected_section('BEFORE')+f"""
test ! -e "$d"
test ! -L "$d"
test -z "$("$docker" ps -aq --filter "name=^/$name$")"
if "$docker" image inspect {QUOTE(TAG)} >/dev/null 2>&1; then exit 41; fi
mkdir "$d"
chmod 700 "$d"
chown 0:0 "$d"
printf '%s\\n' "$operation" > "$d/operation"
cat > "$d/rootfs.tar.gz.b64" <<'JARVIS_PUBLIC_BINARY_EOF'
{base64.b64encode(archive).decode()}
JARVIS_PUBLIC_BINARY_EOF
tr -d '\\r\\n' < "$d/rootfs.tar.gz.b64" | base64 -d > "$d/rootfs.tar.gz"
rm "$d/rootfs.tar.gz.b64"
test "$(sha256sum "$d/rootfs.tar.gz" | cut -d' ' -f1)" = {QUOTE(archive_sha)}
tar -xzf "$d/rootfs.tar.gz" -C "$d"
test "$(sha256sum "$d/frpc" | cut -d' ' -f1)" = {QUOTE(BINARY_SHA)}
test "$("$d/frpc" --version)" = 0.69.1
cat > "$d/frpc.toml.b64" <<'JARVIS_PRIVATE_CONFIG_EOF'
{base64.b64encode(config).decode()}
JARVIS_PRIVATE_CONFIG_EOF
tr -d '\\r\\n' < "$d/frpc.toml.b64" | base64 -d > "$d/frpc.toml"
rm "$d/frpc.toml.b64"
chown 65532:65532 "$d/frpc.toml"
chmod 400 "$d/frpc.toml"
"$d/frpc" verify -c "$d/frpc.toml" >/dev/null 2>&1
image=$("$docker" import --change 'ENTRYPOINT ["/frpc"]' --change 'CMD ["-c","/run/frpc.toml"]' --change 'USER 65532:65532' --change 'LABEL com.ikvein.managed=nas120-independent-ssh-20261020' "$d/rootfs.tar.gz" {QUOTE(TAG)})
printf '%s\\n' "$image" > "$d/image-id"
cid=$("$docker" create --name "$name" --pull never --label "com.ikvein.managed=$operation" --restart unless-stopped --network host --read-only --cap-drop ALL --security-opt no-new-privileges=true --pids-limit 64 --memory 128m --cpus 0.50 --log-driver json-file --log-opt max-size=5m --log-opt max-file=2 --mount "type=bind,src=$d/frpc.toml,dst=/run/frpc.toml,readonly" --user 65532:65532 "$image")
printf '%s\\n' "$cid" > "$d/container-id"
printf 'JARVIS_IMAGE_BEGIN\\n%s\\nJARVIS_IMAGE_END\\n' "$image"
printf 'JARVIS_CONTAINER_BEGIN\\n%s\\nJARVIS_CONTAINER_END\\n' "$cid"
"""
    script += protected_section('AFTER')
    result, requests = run_ssh(login, '', script, timeout=150, elevate=True)
    if result.returncode:
        flags = {word: word.lower() in result.stderr.lower() for word in ['not found', 'No such file', 'invalid option', 'permission denied', 'Cannot connect', 'No space', 'already exists']}
        diagnostic = {'at': now(), 'status': 'failed', 'remoteExitCode': result.returncode, 'safeErrorFlags': flags, 'stdoutStageBeforePresent': 'JARVIS_BEFORE_END' in result.stdout, 'stdoutImagePresent': 'JARVIS_IMAGE_END' in result.stdout, 'privateOutputsWithheld': True}
        (ARTIFACTS/'native-prepare-failure-public.json').write_text(json.dumps(diagnostic, indent=2)+'\n')
        raise RuntimeError('NAS_PREPARE_FAILED')
    before = section(result.stdout, 'BEFORE')
    after = section(result.stdout, 'AFTER')
    cid = section(result.stdout, 'CONTAINER')[0]
    image = section(result.stdout, 'IMAGE')[0]
    require(len(cid) == 64 and image.startswith('sha256:'), 'PREPARE_IDENTITY_INVALID')
    require(before == [line for line in after if not line.startswith(cid+'|')], 'EXISTING_CONTAINER_STATE_CHANGED')
    return {'status': 'prepared', 'imageId': image, 'containerId': cid, 'binarySHA256': BINARY_SHA, 'publicArchiveSHA256': archive_sha, 'privateConfigurationInImage': False, 'externalImagePulled': False, 'existingContainersBefore': before, 'existingContainersAfterExcludingNew': [line for line in after if not line.startswith(cid+'|')], 'existingContainersUnchanged': True, 'containerStarted': False, 'askpassRequests': requests}

def container_action(login, action, record):
    cid = record['containerId']
    image = record['imageId']
    require(len(cid) == 64 and all(c in '0123456789abcdef' for c in cid), 'INVALID_CONTAINER_ID')
    require(image.startswith('sha256:') and len(image) == 71, 'INVALID_IMAGE_ID')
    script = fixed_prefix()+f"""
test "$(cat "$d/operation")" = "$operation"
test "$(cat "$d/container-id")" = {QUOTE(cid)}
test "$(cat "$d/image-id")" = {QUOTE(image)}
test "$("$docker" inspect --format '{{{{.Id}}}}' {QUOTE(cid)})" = {QUOTE(cid)}
test "$("$docker" inspect --format '{{{{.Image}}}}' {QUOTE(cid)})" = {QUOTE(image)}
test "$("$docker" inspect --format '{{{{index .Config.Labels "com.ikvein.managed"}}}}' {QUOTE(cid)})" = "$operation"
"""
    if action == 'start':
        script += f'"$docker" start {QUOTE(cid)} >/dev/null\n'
    elif action == 'stop':
        script += f'"$docker" stop -t 10 {QUOTE(cid)} >/dev/null\n'
    script += f"""
printf 'JARVIS_STATUS_BEGIN\\n'
"$docker" inspect --format '{{{{.Id}}}}|{{{{.Name}}}}|{{{{.State.Status}}}}|{{{{.State.Pid}}}}|{{{{.RestartCount}}}}|{{{{.HostConfig.RestartPolicy.Name}}}}|{{{{.HostConfig.NetworkMode}}}}|{{{{.HostConfig.ReadonlyRootfs}}}}|{{{{.Config.User}}}}|{{{{index .Config.Labels "com.ikvein.managed"}}}}' {QUOTE(cid)}
printf 'JARVIS_STATUS_END\\n'
"""
    script += protected_section('ALL')
    result, requests = run_ssh(login, '', script, timeout=45, elevate=True)
    require(result.returncode == 0, 'NAS_CONTAINER_ACTION_FAILED')
    state = section(result.stdout, 'STATUS')[0].split('|')
    others = [line for line in section(result.stdout, 'ALL') if not line.startswith(cid+'|')]
    require(others == record['existingContainersBefore'], 'EXISTING_CONTAINER_STATE_CHANGED')
    return {'status': 'passed', 'action': action, 'containerId': cid, 'imageId': image, 'containerState': state[2], 'pid': int(state[3]), 'restartCount': int(state[4]), 'restartPolicy': state[5], 'networkMode': state[6], 'readOnlyRootfs': state[7] == 'true', 'user': state[8], 'operationLabel': state[9], 'existingContainersUnchanged': True, 'askpassRequests': requests}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepare', 'start', 'status', 'stop'])
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    require(ARTIFACTS.is_dir(), 'ARTIFACT_DIRECTORY_MISSING')
    if not args.execute:
        print(json.dumps({'status': 'planned', 'phase': args.phase, 'nativeHost': '192.168.10.120', 'name': NAME, 'target': '127.0.0.1:22', 'remotePort': 59527, 'runtimeDependsOn112': False, 'requiresExistingDocker': True, 'externalPullPlanned': False}))
        return
    login = load_login()
    try:
        if args.phase == 'prepare':
            record = prepare(login)
        else:
            record = json.loads((ARTIFACTS/'native-prepare-public.json').read_text())
            record = container_action(login, args.phase, record)
        record.update({'at': now(), 'nativeHost': '192.168.10.120', 'domain': 'ssh-120.ikvein.com', 'port': 59527, 'target': '127.0.0.1:22', 'runtimeDependsOn112': False, 'nasSshConfigurationModified': False, 'collectorAuthorizationModified': False, 'passwordDisplayedOrPersisted': False, 'sourceSHA256': source_hash()})
        (ARTIFACTS/('native-'+args.phase+'-public.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps(record))
    finally:
        login['password'] = None

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error) if isinstance(error, RuntimeError) and str(error).replace('_', '').isalnum() else type(error).__name__
        print(json.dumps({'status': 'failed', 'code': code, 'privateOutputsWithheld': True}))
        sys.exit(1)
