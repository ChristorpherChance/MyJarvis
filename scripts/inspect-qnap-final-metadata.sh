#!/bin/sh
set -eu
printf '===BACKUP_COUNT===\n'
/share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3 - <<'PY'
import sqlite3,json
c=sqlite3.connect('file:/etc/config/cloudconnector/CloudConnector3/config.db?mode=ro',uri=True)
print(json.dumps({'hbsJobs':c.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]}));c.close()
PY
printf '===EXTERNAL_QTS_BINDING===\n'
for port in 4 6 7; do
 printf 'port=%s\n' "$port"
 /sbin/hal_app --pd_get_sys_name "enc_id=33,port_id=$port" 2>&1 || true
 /sbin/hal_app --pd_get_slot_name "enc_id=33,port_id=$port" 2>&1 || true
done
printf '===SNAPSHOT_JOB_FIELDS===\n'
awk '/^\[(Schedule|Global)/{on=1;print;next}/^\[/{on=0}on&&/^(source_lv_id|Schedule|MonthDay|WeekDay|Hour|Minute|ScheduleTime|snapshot_type|status|Count|schedulelvBitmap)[[:space:]]*=/{print}' /etc/config/qsnapshot/snapshotSchedule.conf /etc/config/qsnapshot/snapshot.conf
printf '===UPS_USER_READ===\n'
su -s /bin/sh superopen -c '/sbin/upsc qnapups@localhost 2>/dev/null | grep -E "^(ups.status|battery.charge|battery.runtime):"' 2>/dev/null || true
printf '===ROOT_CACHE_SOURCE_ACCESS===\n'
ls -l /sbin/crontab /usr/bin/crontab /etc/config/jarvis-nas/node.conf 2>/dev/null || true
