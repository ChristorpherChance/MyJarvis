#!/bin/sh
# Fixed read-only preflight. Do not read shares, application secrets, or user files.
set -eu
export LC_ALL=C
printf '===IDENTITY===\n'
hostname
id
uname -srm
printf '===QTS===\n'
for key in Model 'Internal Model' Version 'Build Number' 'Server Name'; do
 printf '%s=' "$key"
 /sbin/getcfg System "$key" -f /etc/config/uLinux.conf || true
done
printf '===CPU===\n'
awk '/^model name/{print;exit}' /proc/cpuinfo
grep -c '^processor' /proc/cpuinfo
printf '===MEMORY===\n'
awk '/^MemTotal:|^MemAvailable:|^MemFree:|^Buffers:|^Cached:/{print}' /proc/meminfo
printf '===FILESYSTEMS===\n'
df -k -P 2>/dev/null || true
printf '===RAID===\n'
cat /proc/mdstat
printf '===TOOLS===\n'
for tool in python3 python openssl ssh-keygen smartctl qcli_storage qcli_hardware docker sudo flock curl; do
 command -v "$tool" || true
done
printf '===PERSISTENT_PATHS===\n'
readlink -f /etc/config
printf '===SSH_HOME===\n'
printf '%s\n' "$HOME"
ls -ld "$HOME" "$HOME/.ssh" "$HOME/.ssh/authorized_keys" 2>/dev/null || true
printf '===CRYPTO===\n'
openssl version || true
printf '===SUDO===\n'
if sudo -n true 2>/dev/null; then printf 'passwordless-root=yes\n'; else printf 'passwordless-root=no\n'; fi
printf '===TIME===\n'
date -u '+%Y-%m-%dT%H:%M:%SZ'
printf '===QCLI===\n'
qcli_storage -v 2>/dev/null || true
