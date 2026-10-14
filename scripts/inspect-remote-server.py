"""Read-only SSH acceptance snapshot, using only the remote Python standard library."""
import json
import os
import pathlib
import pwd
import shutil
import socket
from datetime import datetime, timezone

def read(path):
    return pathlib.Path(path).read_text(encoding="utf-8")

release = {}
for line in read("/etc/os-release").splitlines():
    if "=" in line:
        key, value = line.split("=", 1)
        release[key] = value.strip('"')
memory = {}
for line in read("/proc/meminfo").splitlines():
    key, value = line.split(":", 1)
    memory[key] = int(value.split()[0]) * 1024
cpu_models = sorted({line.split(":", 1)[1].strip() for line in read("/proc/cpuinfo").splitlines() if line.startswith("model name")})
disk = shutil.disk_usage("/")
print(json.dumps({
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "readOnly": True,
    "user": pwd.getpwuid(os.getuid()).pw_name,
    "hostname": socket.gethostname(),
    "os": release.get("PRETTY_NAME"),
    "kernel": os.uname().release,
    "cpuModels": cpu_models,
    "logicalCpus": os.cpu_count(),
    "memoryTotalGiB": round(memory["MemTotal"] / 1024**3, 2),
    "memoryAvailableGiB": round(memory["MemAvailable"] / 1024**3, 2),
    "rootDiskTotalGiB": round(disk.total / 1024**3, 2),
    "rootDiskFreeGiB": round(disk.free / 1024**3, 2),
    "uptimeSeconds": float(read("/proc/uptime").split()[0]),
    "executables": {name: shutil.which(name) for name in ["node", "npm", "python3", "docker", "smartctl"]},
}, ensure_ascii=False, indent=2))
