#!/bin/sh
set -eu
printf '===HBS_METADATA_LAYOUT===\n'
find /share/CACHEDEV1_DATA/.qpkg/HybridBackup/data /share/CACHEDEV1_DATA/.qpkg/HybridBackup/CloudConnector3 -maxdepth 3 -type d -print | head -n 90
printf '===HBS_SYSTEM_FILES===\n'
find /share/CACHEDEV1_DATA/.qpkg/HybridBackup/data/system -maxdepth 4 -type f -print | head -n 80
printf '===CLOUD_CONFIG_DIRS===\n'
for p in /etc/config/*[Cc]loud* /etc/config/*[Bb]ackup* /etc/config/*[Ss]ync* /etc/config/*[Rr]sync*; do test ! -e "$p" || ls -ld "$p"; done
printf '===UPS_PROTECTION===\n'
for key in 'Enable' 'Power Loss Mode' 'Shutdown System In' 'Standby System In' 'Enable Network UPS Server'; do printf '%s=' "$key"; /sbin/getcfg UPS "$key" -f /etc/config/uLinux.conf || true; done
printf '===QTS_STORAGE_SUMMARY_TOOLS===\n'
/sbin/hal_app --help 2>&1 | grep -Ei 'pd_.*(status|info|enclosure)|se_get' | head -n 30 || true
