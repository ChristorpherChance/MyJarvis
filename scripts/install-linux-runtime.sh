#!/bin/bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
[ "$(id -u)" = 0 ] || { printf 'Run using an existing administrator.\n' >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { printf 'This locked runtime is for Linux x86_64.\n' >&2; exit 1; }
node_version=24.15.0
node_sha=472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6
if ! id jarvis >/dev/null 2>&1; then useradd --system --user-group --home-dir /var/lib/jarvis --shell /usr/sbin/nologin jarvis; fi
[ "$(id -u jarvis)" != 0 ] || exit 1
for directory in /opt/jarvis /opt/jarvis/runtimes /opt/jarvis/releases /var/cache/jarvis /etc/jarvis /var/lib/jarvis-control; do
  [ ! -L "$directory" ] || { printf 'Refusing linked managed directory.\n' >&2; exit 1; }
  if [ -e "$directory" ]; then [ "$(stat -c %u "$directory")" = 0 ] || exit 1; fi
  install -d -o root -g jarvis -m 0750 "$directory"
done
install -d -o jarvis -g jarvis -m 0700 /var/lib/jarvis /var/lib/jarvis/data
archive="/var/cache/jarvis/node-v$node_version-linux-x64.tar.xz"
if [ ! -f "$archive" ]; then curl --fail --location --retry 2 --connect-timeout 15 --max-time 300 "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-x64.tar.xz" -o "$archive"; fi
printf '%s  %s\n' "$node_sha" "$archive" | sha256sum --check -
destination="/opt/jarvis/runtimes/node-v$node_version-linux-x64"
if [ ! -d "$destination" ]; then tar -xJf "$archive" -C /opt/jarvis/runtimes; fi
[ "$($destination/bin/node --version)" = "v$node_version" ] || exit 1
if [ -e /opt/jarvis/node ] || [ -L /opt/jarvis/node ]; then
  [ -L /opt/jarvis/node ] && [[ "$(readlink /opt/jarvis/node)" = /opt/jarvis/runtimes/node-v*-linux-x64 ]] || exit 1
fi
ln -sfn "$destination" /opt/jarvis/node
/opt/jarvis/node/bin/node --version
printf 'Nonroot account and locked Node runtime installed.\n'
