#!/bin/sh
set -eu
export LC_ALL=C
printf '===HBS_SYSTEM_METADATA===\n'
find /share/CACHEDEV1_DATA/.qpkg/HybridBackup/data/system -maxdepth 3 -type f -name '*.db*' -print
printf '===HBS_CONFIG_METADATA===\n'
for dir in /etc/config/HybridBackup /etc/config/CloudConnector3 /etc/config/rsyncRR.conf /etc/config/rsync_schedule.conf; do test ! -e "$dir" || ls -ld "$dir"; done
printf '===HBS_CLI_HELP===\n'
/share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3 -c 'import sys,sqlite3,json;print(sys.version);print(sqlite3.sqlite_version)' 2>&1 || true
printf '===SNAPSHOT_SCHEDULE===\n'
for p in /etc/config/qsnapshot/snapshot.conf /etc/config/qsnapshot/snapshotSchedule.conf; do
 if test -f "$p"; then awk '/^\[/{print;next}/^[^#;]+=/{key=$0;sub(/=.*/,"",key);if(key~/[Ee]nable|[Cc]ount|[Ss]chedule|[Ii]nterval|[Tt]ime|[Hh]our|[Dd]ay|[Ll]ast|[Ss]tatus|[Vv]ol|[Ss]nap/){print}else{print key"=<omitted>"}}' "$p"; fi
done
printf '===UPS_CONFIG_KEYS===\n'
awk '/^\[UPS\]/{on=1;next}/^\[/{on=0}on&&/^[^#;]+=/{key=$0;sub(/=.*/,"",key);print key}' /etc/config/uLinux.conf
printf '===UPS_COMMON_SETTINGS===\n'
for key in 'Enable' 'UPS Enable' 'Auto Shutdown' 'UPS Auto Shutdown' 'Shutdown' 'Delay' 'UPS Delay' 'Shutdown Time' 'UPS Type' 'Type' 'Mode' 'AC Power' 'Battery Power'; do printf '%s=' "$key"; /sbin/getcfg UPS "$key" -f /etc/config/uLinux.conf || true; done
printf '===UPS_FULL_STATUS===\n'
/sbin/upsc qnapups@localhost 2>/dev/null | grep -v -E 'serial|contact|password|community' || true
printf '===CRON_METADATA===\n'
ls -l /etc/config/crontab /usr/bin/crontab /usr/bin/stat /bin/stat 2>/dev/null || true
