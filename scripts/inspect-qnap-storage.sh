#!/bin/sh
set -eu
export LC_ALL=C
printf '===DISKS===\n'
qcli_storage -d 2>/dev/null || true
printf '===STORAGE===\n'
qcli_storage -p 2>/dev/null || true
printf '===CGI_TOOLS===\n'
ls /sbin/smartctl /usr/sbin/smartctl /usr/local/sbin/smartctl 2>/dev/null || true
printf '===PROC_MOUNTS===\n'
awk '$2 ~ /^\/share\/CACHEDEV[0-9]+_DATA$/ {print $1,$2,$3}' /proc/mounts
