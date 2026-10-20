"""Add only the NAS120 SSH tunnel on 112. Default mode is a read-only plan."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import tomllib

UNIT = "jarvis-nas120-ssh-tunnel.service"
CONFIG_DIR = Path("/etc/jarvis-nas120-ssh-access")
CONFIG = CONFIG_DIR / "frpc.toml"
UNIT_PATH = Path("/etc/systemd/system") / UNIT
SOURCE = Path("/etc/jarvis-ssh-access/frpc.toml")
BINARY = Path("/opt/jarvis-frpc/frpc")
BINARY_SHA = "142f447f43fef286acc8da8a6852dda80631db631d604b2e63634b2db4d6848c"
SOURCE_SHA = "b55f6144a6d462c165a585dadd96bb13bdcc1db3e75c2db308904141411888d4"
PROTECTED_UNITS = ["jarvis-platform.service", "jarvis-observer.service", "ssh.service", "jarvis-ssh-public.service", "jarvis-ssh-tunnel.service", "jarvis-frpc.service", "myoperation-frpc.service"]
PROTECTED_FILES = [SOURCE, Path("/etc/jarvis-ssh-access/sshd_config"), Path("/etc/ssh/sshd_config"), Path("/etc/jarvis-frpc/frpc.toml"), Path("/etc/myoperation-frpc/frpc.toml")]

def require(value, code):
    if not value:
        raise RuntimeError(code)

def run(args, timeout=20, check=True):
    value = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if check:
        require(value.returncode == 0, "COMMAND_FAILED_" + Path(args[0]).name.upper().replace("-", "_"))
    return value

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def state():
    units = {}
    for unit in PROTECTED_UNITS:
        output = run(["systemctl", "show", unit, "--property=MainPID,ActiveState,UnitFileState"]).stdout
        units[unit] = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
    return {"units": units, "files": {str(p): sha(p) for p in PROTECTED_FILES if p.exists()}}

def main():
    require(os.geteuid() == 0, "ROOT_REQUIRED")
    require(sys.argv[1:] in ([], ["--execute"]), "INVALID_ARGUMENTS")
    execute = sys.argv[1:] == ["--execute"]
    require(socket.gethostname() == "superopen-ProDesk-i7", "WRONG_MACHINE")
    lock_descriptor = None
    if execute:
        lock_descriptor = os.open("/run/lock/jarvis-nas120-ssh-tunnel.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        require(os.fstat(lock_descriptor).st_uid == 0, "UNTRUSTED_EXECUTION_LOCK")
        try:
            fcntl.flock(lock_descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("ANOTHER_EXECUTION_IS_RUNNING")
    require(BINARY.is_file() and sha(BINARY) == BINARY_SHA, "FRPC_BINARY_CHANGED")
    require(SOURCE.is_file() and sha(SOURCE) == SOURCE_SHA, "SOURCE_CONFIG_CHANGED")
    require(not os.path.lexists(CONFIG_DIR) and not os.path.lexists(UNIT_PATH), "TARGET_ALREADY_EXISTS")
    require(run(["systemctl", "show", UNIT, "--property=LoadState", "--value"]).stdout.strip() == "not-found", "UNIT_NAME_ALREADY_REGISTERED")
    source = tomllib.loads(SOURCE.read_text())
    require(source.get("serverAddr") == "8.163.127.192" and source.get("serverPort", 7000) == 7000, "GATEWAY_CHANGED")
    auth = source.get("auth", {})
    require(set(auth) <= {"method", "token"} and auth.get("method", "token") == "token", "AUTH_UNSUPPORTED")
    require(isinstance(auth.get("token"), str) and bool(auth["token"]) and "{{" not in auth["token"], "AUTH_UNAVAILABLE")
    transport = source.get("transport", {})
    require(set(transport) <= {"tls"} and set(transport.get("tls", {})) <= {"enable"} and transport.get("tls", {}).get("enable", True), "TLS_CONFIGURATION_CHANGED")
    # This file is never returned in reports or passed as an argv value.
    config = '\n'.join([
        'serverAddr = "8.163.127.192"', 'serverPort = 7000', 'user = "jarvis-nas120-ssh"',
        'loginFailExit = false', 'auth.method = "token"', 'auth.token = ' + json.dumps(auth["token"]),
        'transport.tls.enable = true', 'log.to = "console"', 'log.level = "warn"',
        'log.disablePrintColor = true', '', '[[proxies]]', 'name = "ssh-120-direct-59527"',
        'type = "tcp"', 'localIP = "192.168.10.120"', 'localPort = 22', 'remotePort = 59527', ''
    ])
    unit = f"""[Unit]
Description=NAS120 SSH TCP tunnel via Guangzhou (59527)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
DynamicUser=yes
LoadCredential=frpc.toml:{CONFIG}
ExecStart={BINARY} -c %d/frpc.toml
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0077

[Install]
WantedBy=multi-user.target
"""
    before = state()
    with socket.create_connection(("192.168.10.120", 22), timeout=5) as sock:
        banner = sock.recv(256).decode("ascii", "replace").splitlines()[0]
    require(banner.startswith("SSH-2.0-"), "TARGET_IS_NOT_SSH")
    report = {"phase": "install" if execute else "prepare", "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "node": "112", "target": "192.168.10.120:22", "remotePort": 59527, "domain": "ssh-120.ikvein.com", "unit": UNIT, "runtimeUser": "DynamicUser", "credentialDelivery": "systemd LoadCredential; source/new config root-only", "targetBanner": banner, "binarySHA256": BINARY_SHA, "sourceConfigSHA256": SOURCE_SHA, "protectedBefore": before, "existingConfigurationsModified": False, "nasConfigurationModified": False, "privateConfigReturned": False}
    # Schema validation is offline; no second persistent FRPC is launched here.
    with tempfile.TemporaryDirectory(prefix="jarvis-nas120-prepare-") as temporary:
        private = Path(temporary) / "frpc.toml"
        private.write_text(config)
        private.chmod(0o600)
        run([str(BINARY), "verify", "-c", str(private)])
        require(state() == before, "PROTECTED_STATE_CHANGED_DURING_PREPARE")
    report["offlineConfigValidation"] = "passed"
    if execute:
        created_unit = False
        activation_attempted = False
        owned_identity = None
        try:
            require(not os.path.lexists(CONFIG_DIR) and not os.path.lexists(UNIT_PATH), "TARGET_APPEARED_CONCURRENTLY")
            require(run(["systemctl", "show", UNIT, "--property=LoadState", "--value"]).stdout.strip() == "not-found", "UNIT_NAME_APPEARED_CONCURRENTLY")
            CONFIG_DIR.mkdir(mode=0o700)
            descriptor = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(config)
            descriptor = os.open(UNIT_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(unit)
            created_unit = True
            owned_identity = (UNIT_PATH.stat().st_dev, UNIT_PATH.stat().st_ino)
            run(["systemd-analyze", "verify", str(UNIT_PATH)])
            require(state() == before, "PROTECTED_STATE_CHANGED_BEFORE_ACTIVATION")
            run(["systemctl", "daemon-reload"])
            fragment = run(["systemctl", "show", UNIT, "--property=FragmentPath", "--value"]).stdout.strip()
            require(fragment == str(UNIT_PATH), "NEW_UNIT_FRAGMENT_CHANGED")
            activation_attempted = True
            run(["systemctl", "enable", "--now", UNIT])
            time.sleep(2)
            require(run(["systemctl", "is-active", UNIT]).stdout.strip() == "active", "NEW_UNIT_NOT_ACTIVE")
            after = state()
            require(after == before, "PROTECTED_STATE_CHANGED_AFTER_ACTIVATION")
            report.update({"status": "activated", "enabled": run(["systemctl", "is-enabled", UNIT]).stdout.strip(), "active": True, "protectedAfter": after, "protectedStateUnchanged": True, "unitSHA256": sha(UNIT_PATH), "privateConfigMode": oct(CONFIG.stat().st_mode & 0o777)})
        except Exception:
            # Only the new tunnel is stopped. Existing services/data are never restored.
            if created_unit and activation_attempted and not UNIT_PATH.is_symlink() and UNIT_PATH.is_file():
                current_identity = (UNIT_PATH.stat().st_dev, UNIT_PATH.stat().st_ino)
                fragment = run(["systemctl", "show", UNIT, "--property=FragmentPath", "--value"], check=False).stdout.strip()
                if current_identity == owned_identity and UNIT_PATH.read_text() == unit and fragment == str(UNIT_PATH):
                    run(["systemctl", "disable", "--now", UNIT], check=False)
            raise
    else:
        report["status"] = "prepared"
    print(json.dumps(report))

try:
    main()
except Exception as error:
    code = str(error) if isinstance(error, RuntimeError) and str(error).replace("_", "").isalnum() else type(error).__name__
    print(json.dumps({"status": "failed", "code": code, "privateConfigReturned": False}))
    sys.exit(1)
