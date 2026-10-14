#!/bin/bash
set -euo pipefail
umask 027
[ "$(id -u)" = 0 ] || exit 1
node_id=${1:?Node ID}
case "$node_id" in 112) allowed_host=192.168.10.112;;101) allowed_host=192.168.10.101;;*) exit 1;;esac
release=/opt/jarvis/releases/20261007-linux-cluster
[ -f "$release/apps/api/dist/index.js" ] && [ -f /etc/jarvis/node.json ] && [ -f /etc/jarvis/tls/server.crt ] || exit 1
if [ -e /opt/jarvis/current ] || [ -L /opt/jarvis/current ]; then [ -L /opt/jarvis/current ] || exit 1; fi
ln -sfn "$release" /opt/jarvis/current
cat > /etc/jarvis/service.env <<EOF
PATH=/opt/jarvis/node/bin:/usr/bin:/bin
NODE_ENV=production
NODE_EXTRA_CA_CERTS=/etc/jarvis/tls/ca.crt
HOME=/var/lib/jarvis
JARVIS_DATA_DIR=/var/lib/jarvis/data
JARVIS_NODE_CONFIG=/etc/jarvis/node.json
JARVIS_PYTHON=/opt/jarvis/venv/bin/python
JARVIS_HOST=0.0.0.0
JARVIS_PORT=3140
JARVIS_ALLOW_LAN=1
JARVIS_ALLOWED_HOSTS=$allowed_host,127.0.0.1,localhost
JARVIS_TLS_KEY=/etc/jarvis/tls/server.key
JARVIS_TLS_CERT=/etc/jarvis/tls/server.crt
PYTHONIOENCODING=utf-8
TZ=Asia/Shanghai
EOF
chown root:jarvis /etc/jarvis/service.env
chmod 0640 /etc/jarvis/service.env
for service in platform observer; do
  if [ "$service" = platform ]; then entry=apps/api/dist/index.js; else entry=scripts/node-observer.mjs; fi
  cat > "/etc/systemd/system/jarvis-$service.service" <<EOF
[Unit]
Description=Jarvis $service ($node_id)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=4

[Service]
Type=simple
User=jarvis
Group=jarvis
WorkingDirectory=/opt/jarvis/current
EnvironmentFile=/etc/jarvis/service.env
ExecStart=/opt/jarvis/node/bin/node /opt/jarvis/current/$entry
Restart=on-failure
RestartSec=8
TimeoutStopSec=45
KillMode=control-group
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/jarvis
MemoryMax=12G
TasksMax=256

[Install]
WantedBy=multi-user.target
EOF
done
systemd-analyze verify /etc/systemd/system/jarvis-platform.service /etc/systemd/system/jarvis-observer.service
systemctl daemon-reload
if [ "$node_id" = 101 ]; then systemctl disable --now jarvis-platform.service; fi
printf 'Service definitions installed; primary business activation remains a separate verified step.\n'
