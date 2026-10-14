#!/bin/sh
set -eu
export LC_ALL=C
printf '===SUDO_PATH===\n'
sudo -V 2>/dev/null | grep -i 'sudoers\|configuration\|plugin' || true
printf '===TOOL_FILES===\n'
ls -l /sbin/get_hd_smartinfo /sbin/qcli_hdd /sbin/qcli_hardware /sbin/hal_app /sbin/snapshot_util /sbin/qcli_volumesnapshot 2>/dev/null || true
printf '===SMART_USAGE===\n'
/sbin/get_hd_smartinfo -h 2>&1 || true
printf '===SMART_DEVICE===\n'
/sbin/get_hd_smartinfo -d /dev/sdc 2>&1 | head -n 45 || true
printf '===QCLI_SMART===\n'
/sbin/qcli_hdd -m diskID=00000001 2>&1 | head -n 45 || true
printf '===QCLI_HARDWARE===\n'
/sbin/qcli_hardware -h 2>&1 | head -n 35 || true
printf '===QCLI_SNAPSHOT===\n'
/sbin/qcli_volumesnapshot -h 2>&1 | head -n 55 || true
printf '===SNAPSHOT_UTIL===\n'
/sbin/snapshot_util --help 2>&1 | head -n 55 || true
printf '===EXTERNAL_VOLUMES===\n'
for p in /share/external/DEV*_1; do test ! -d "$p" || df -k -P "$p"; done
printf '===BACKUP_APP_PATH===\n'
/sbin/getcfg HybridBackup Install_Path -f /etc/config/qpkg.conf || true
printf '===CGI_INVENTORY===\n'
ls /home/httpd/cgi-bin/*disk* /home/httpd/cgi-bin/*backup* /home/httpd/cgi-bin/*snapshot* 2>/dev/null || true
