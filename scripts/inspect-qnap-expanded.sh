#!/bin/sh
# Fixed read-only hardware and installed backup/snapshot tool inventory.
set -eu
export LC_ALL=C
id
printf '===QCLI_DISKS===\n'
/sbin/qcli_storage -d 2>/dev/null || true
printf '===QCLI_POOLS===\n'
/sbin/qcli_storage -p 2>/dev/null || true
printf '===MOUNTS===\n'
awk '$1~/^\/dev\//&&$2~/^\/share\//{print $1,$2,$3}' /proc/mounts
printf '===BLOCKS===\n'
for block in /sys/block/sd*; do
 test -d "$block" || continue
 printf '%s ' "${block##*/}"
 cat "$block/size" "$block/device/vendor" "$block/device/model" 2>/dev/null | tr '\n' ' '
 printf '\n'
done
printf '===STORAGE_TOOLS===\n'
for p in /sbin/*smart* /sbin/*snapshot* /sbin/*hal* /sbin/*volume* /sbin/*backup* /sbin/*storage*; do test -f "$p" && printf '%s\n' "$p"; done
printf '===SUDO_PERSISTENCE===\n'
for p in /etc/sudoers /etc/sudoers.d /etc/config/sudoers; do ls -ld "$p" 2>/dev/null || true; done
if test -f /etc/sudoers; then grep -E '^[[:space:]]*([#@]include|Defaults)' /etc/sudoers || true; fi
printf '===QPKG_NAMES===\n'
if test -f /etc/config/qpkg.conf; then grep '^\[' /etc/config/qpkg.conf; fi
printf '===SMART_ONE===\n'
/sbin/get_hd_smartinfo -d 1 2>/dev/null | head -n 30 || true
printf '===SNAPSHOT_HELP===\n'
for p in /sbin/snapshot_util /sbin/qcli_storage; do test ! -x "$p" || "$p" -h 2>&1 | head -n 45 || true; done
