#!/bin/sh
set -eu
export LC_ALL=C
printf '===HAL_READ_HELP===\n'
/sbin/hal_app --help 2>&1 | grep -Ei 'smart|temp|pd_get|snapshot|external' | head -n 55 || true
printf '===SMART_NUMBER===\n'
for n in 1 2 3 4 5 6 7; do printf 'disk=%s\n' "$n"; /sbin/get_hd_smartinfo -d "$n" 2>&1 | head -n 8 || true; done
printf '===HAL_SMART===\n'
/sbin/hal_app --pd_get_smart_info enc_id=0,port_id=1 2>&1 | head -n 45 || true
printf '===SMART_CACHE_PATHS===\n'
for p in /tmp/*smart* /tmp/*temperature* /tmp/*diskinfo* /etc/config/*smart* /etc/config/*snapshot*; do test ! -e "$p" || ls -ld "$p"; done
printf '===HBS_FILES===\n'
for p in /share/CACHEDEV1_DATA/.qpkg/HybridBackup/*; do printf '%s\n' "$p"; done
printf '===SUDO_INCLUDES===\n'
ls -l /usr/etc/sudoers /usr/etc/sudoers.d /etc/config/sudoers* 2>/dev/null || true
grep -E '^[[:space:]]*([#@]include|Defaults)' /usr/etc/sudoers || true
