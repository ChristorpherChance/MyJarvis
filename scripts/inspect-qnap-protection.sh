#!/bin/sh
set -eu
export LC_ALL=C
printf '===SMART_CACHE_FILES===\n'
for p in /tmp/smart/*; do test ! -f "$p" || ls -l "$p"; done
printf '===SMART_CACHE_FORMAT===\n'
for p in /tmp/smart/*; do test ! -f "$p" || head -c 4500 "$p"; done
printf '\n===SNAPSHOT_FILES===\n'
for p in /etc/config/qsnapshot/*; do test ! -f "$p" || ls -l "$p"; done
printf '===HBS_METADATA_FILES===\n'
for dir in data logs tools python/bin; do
 for p in /share/CACHEDEV1_DATA/.qpkg/HybridBackup/$dir/*; do test ! -e "$p" || ls -ld "$p"; done
done
printf '===UPS_TOOLS===\n'
for p in /sbin/upsc /usr/bin/upsc /usr/local/ups/bin/upsc /usr/sbin/upsc /sbin/upsdrvctl; do test ! -x "$p" || printf '%s\n' "$p"; done
command -v upsc || true
printf '===UPS_NAMES===\n'
if command -v upsc >/dev/null; then upsc -l localhost 2>/dev/null || true; fi
printf '===UPS_INFORMATION===\n'
if command -v upsc >/dev/null; then
 for name in $(upsc -l localhost 2>/dev/null); do upsc "$name@localhost" 2>/dev/null | grep -E '^(battery\.(charge|runtime|voltage|status)|device\.(mfr|model|type)|driver\.name|input\.voltage|ups\.(status|load|mfr|model|power|realpower|temperature|delay)):'; done
fi
printf '===UPS_SETTING_KEYS===\n'
if test -f /etc/config/ups/upsmon.conf; then grep -E '^(SHUTDOWNCMD|POWERDOWNFLAG|FINALDELAY|MINSUPPLIES)' /etc/config/ups/upsmon.conf || true; fi
grep -E '^\[.*UPS.*\]|^UPS (Enable|Mode|Auto Shutdown|Shutdown|Delay|Type)' /etc/config/uLinux.conf || true
