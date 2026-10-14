#!/bin/sh
# Administrator preflight: fixed hardware tools and SSH path only.
set -eu
export LC_ALL=C
printf '===ROOT===\n'
id
printf '===SSH_KEYS_PATH===\n'
grep -E '^[[:space:]]*(AuthorizedKeysFile|AllowUsers|AuthorizedKeysCommand)' /etc/ssh/sshd_config || true
printf '===TOOLS===\n'
for tool in jq smartctl python3 python bash stat get_hd_smartinfo; do command -v "$tool" || true; done
printf '===HARDWARE_HELP===\n'
qcli_hardware -h 2>&1 || true
printf '===STORAGE_HELP===\n'
qcli_storage -h 2>&1 || true
printf '===SMART_HELP===\n'
/sbin/get_hd_smartinfo -h 2>&1 || true
printf '===VERSION_KEYS===\n'
for key in Version 'Build Number' 'Build Date' 'Build Version'; do printf '%s=' "$key"; /sbin/getcfg System "$key" -f /etc/config/uLinux.conf || true; done
