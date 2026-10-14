#!/bin/bash -p
# Generated account-level sudo grants. Preview by default; apply only as root.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
target_user=@@USER@@
profile=@@PROFILE@@
unit=@@UNIT@@
expected_host=@@HOSTNAME@@
marker=@@MARKER@@
apply=0
create_user=0
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    --create-user) create_user=1 ;;
    --help) printf 'Preview: bash SCRIPT\nApply: sudo bash SCRIPT --apply [--create-user]\n'; exit 0 ;;
    *) die "Unknown argument: $arg" ;;
  esac
done
[[ "$target_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$target_user" != root ]] || die 'Invalid target account'
[[ "$unit" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.@:-]{0,120}\.service$ ]] || die 'Invalid service unit'
case "$profile" in login|diagnostics|operator|admin-password|admin-full) ;; *) die 'Invalid profile' ;; esac
printf 'Account: %s\nProfile: %s\nService: %s\n' "$target_user" "$profile" "$unit"
printf 'Existing permissions from other policies or groups remain unchanged.\n'
policy() {
cat <<'JARVIS_POLICY_EOF'
@@POLICY@@
JARVIS_POLICY_EOF
}
if [ "$apply" = 0 ]; then
  printf '\nProposed managed sudoers file:\n'
  policy
  printf '\nNo permissions changed. To apply, use sudo bash SCRIPT --apply.\n'
  exit 0
fi
[ "$(id -u)" = 0 ] || die 'Apply requires root; use sudo from an existing administrator account'
if [ -n "$expected_host" ]; then [ "$(hostname)" = "$expected_host" ] || die 'Wrong server hostname'; fi
[ -x /usr/sbin/visudo ] || die 'visudo is required'
/usr/sbin/visudo -c >/dev/null || die 'Existing sudo configuration is invalid; nothing changed'

# Every managed parent directory must be root-owned and not writable by others.
safe_directory() {
  local path="$1" mode
  [ ! -L "$path" ] && [ -d "$path" ] || die "Unsafe directory: $path"
  [ "$(stat -c %u -- "$path")" = 0 ] || die "Directory is not root-owned: $path"
  mode=$(stat -c %a -- "$path")
  (( (8#$mode & 0022) == 0 )) || die "Directory is writable by others: $path"
}
safe_file() {
  local path="$1" mode
  [ ! -L "$path" ] && [ -f "$path" ] || die "Unsafe file: $path"
  [ "$(stat -c %u -- "$path")" = 0 ] && [ "$(stat -c %h -- "$path")" = 1 ] || die "Unsafe file owner or links: $path"
  mode=$(stat -c %a -- "$path")
  (( (8#$mode & 0022) == 0 )) || die "File is writable by others: $path"
}
safe_tree_file() {
  local path parent
  path=$(readlink -f -- "$1")
  safe_file "$path"
  parent=$(dirname -- "$path")
  while [ "$parent" != / ]; do safe_directory "$parent"; parent=$(dirname -- "$parent"); done
  safe_directory /
}
safe_directory /etc
safe_directory /etc/sudoers.d
lock="/etc/sudoers.d/.jarvis-permissions-$target_user.lock"
locked=0
unlock() { if [ "$locked" = 1 ]; then rmdir -- "$lock" 2>/dev/null || true; fi; }
trap unlock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for attempt in {1..50}; do
  if mkdir -- "$lock" 2>/dev/null; then locked=1; break; fi
  sleep 0.1
done
[ "$locked" = 1 ] || die 'Another permissions change is running or an old lock needs checking'
safe_directory /usr
safe_directory /usr/local
[ -e /usr/local/libexec ] || install -d -o root -g root -m 0755 /usr/local/libexec
safe_directory /usr/local/libexec
[ -e /usr/local/libexec/jarvis-permissions ] || install -d -o root -g root -m 0755 /usr/local/libexec/jarvis-permissions
safe_directory /usr/local/libexec/jarvis-permissions
wrapper_dir="/usr/local/libexec/jarvis-permissions/$target_user"
policy_file="/etc/sudoers.d/80-jarvis-access-$target_user"
if [ -e "$policy_file" ] || [ -L "$policy_file" ]; then
  safe_file "$policy_file"
  grep -qxF "$marker" "$policy_file" || die 'Existing sudoers file is not managed by this tool'
fi
if [ -e "$wrapper_dir" ] || [ -L "$wrapper_dir" ]; then safe_directory "$wrapper_dir"; fi
for name in diagnostics operator; do
  if [ -e "$wrapper_dir/$name" ] || [ -L "$wrapper_dir/$name" ]; then
    safe_file "$wrapper_dir/$name"
    grep -qxF "# Jarvis managed permission wrapper v1; account=$target_user" "$wrapper_dir/$name" || die 'Existing wrapper is not managed by this tool'
  fi
done
if [ "$profile" = diagnostics ] || [ "$profile" = operator ]; then
  [ -x /usr/sbin/smartctl ] && [ -x /usr/sbin/dmidecode ] || die 'Install smartmontools and dmidecode using an administrator first'
fi
if [ "$profile" = operator ]; then
  [ -x /usr/bin/systemctl ] && [ -x /usr/bin/journalctl ] || die 'systemd tools are unavailable'
  service_user=$(/usr/bin/systemctl show "$unit" --property=User --value)
  [ -n "$service_user" ] && [ "$service_user" != root ] && [ "$service_user" != 0 ] || die 'Operator service must exist and run as a nonroot user'
  [ "$(id -u -- "$service_user")" != 0 ] || die 'Operator service user has root UID'
  unit_file=$(/usr/bin/systemctl show "$unit" --property=FragmentPath --value)
  [ -n "$unit_file" ] || die 'Service definition is missing'
  safe_tree_file "$unit_file"
  for unit_dropin in $(/usr/bin/systemctl show "$unit" --property=DropInPaths --value); do safe_tree_file "$unit_dropin"; done
fi

stage=$(mktemp -d /etc/sudoers.d/.jarvis-permissions.XXXXXXXX)
chmod 700 "$stage"
changed=0
committed=0
had_policy=0
cleanup() {
  local name
  if [ "$changed" = 1 ] && [ "$committed" = 0 ]; then
    if [ "$had_policy" = 1 ]; then install -o root -g root -m 0440 "$stage/old-policy" "$policy_file"; else rm -f -- "$policy_file"; fi
    for name in diagnostics operator; do
      if [ -f "$stage/old-$name" ]; then install -o root -g root -m 0755 "$stage/old-$name" "$wrapper_dir/$name"; else rm -f -- "$wrapper_dir/$name"; fi
    done
    printf 'Installation failed; managed files restored.\n' >&2
    /usr/sbin/visudo -c >/dev/null || printf 'Check sudo configuration immediately.\n' >&2
  fi
  # Stage contains only our bounded, named regular files.
  for name in policy diagnostics operator old-policy old-diagnostics old-operator; do rm -f -- "$stage/$name"; done
  rmdir -- "$stage" 2>/dev/null || true
  unlock
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
policy > "$stage/policy"
chmod 0440 "$stage/policy"
/usr/sbin/visudo -c -f "$stage/policy" >/dev/null || die 'Proposed sudo policy is invalid'
cat > "$stage/diagnostics" <<'JARVIS_DIAGNOSTICS_EOF'
@@DIAGNOSTICS@@
JARVIS_DIAGNOSTICS_EOF
cat > "$stage/operator" <<'JARVIS_OPERATOR_EOF'
@@OPERATOR@@
JARVIS_OPERATOR_EOF
if ! id "$target_user" >/dev/null 2>&1; then
  [ "$create_user" = 1 ] || die 'Account does not exist; use --create-user for a dedicated account'
  /usr/sbin/useradd --create-home --shell /bin/bash -- "$target_user"
  printf 'Created account %s; SSH public key authorization is a separate step.\n' "$target_user"
fi
printf 'Current supplementary groups: '
id -nG "$target_user"
printf 'Selected grants do not revoke existing sudo, Docker, LXD or other privileges.\n'
if [ -f "$policy_file" ]; then cp -p -- "$policy_file" "$stage/old-policy"; had_policy=1; fi
for name in diagnostics operator; do
  if [ -f "$wrapper_dir/$name" ]; then cp -p -- "$wrapper_dir/$name" "$stage/old-$name"; fi
done

# Persist a private history before changing managed policies.
safe_directory /var
[ -e /var/backups ] || install -d -o root -g root -m 0755 /var/backups
safe_directory /var/backups
[ -e /var/backups/jarvis-permissions ] || install -d -o root -g root -m 0700 /var/backups/jarvis-permissions
safe_directory /var/backups/jarvis-permissions
backup=$(mktemp -d /var/backups/jarvis-permissions/change.XXXXXXXX)
chmod 700 "$backup"
for name in policy old-policy old-diagnostics old-operator; do [ ! -f "$stage/$name" ] || cp -p -- "$stage/$name" "$backup/$name"; done
printf 'user=%s\nprofile=%s\nunit=%s\n' "$target_user" "$profile" "$unit" > "$backup/plan"
[ -e "$wrapper_dir" ] || install -d -o root -g root -m 0755 "$wrapper_dir"
safe_directory "$wrapper_dir"
changed=1
if [ "$profile" = diagnostics ] || [ "$profile" = operator ]; then install -o root -g root -m 0755 "$stage/diagnostics" "$wrapper_dir/diagnostics"; fi
if [ "$profile" = operator ]; then install -o root -g root -m 0755 "$stage/operator" "$wrapper_dir/operator"; fi
if [ "$profile" = login ]; then rm -f -- "$policy_file"; else install -o root -g root -m 0440 "$stage/policy" "$policy_file"; fi
/usr/sbin/visudo -c >/dev/null || die 'Final sudo validation failed'
committed=1
printf 'APPLIED user=%s profile=%s backup=%s\n' "$target_user" "$profile" "$backup"
printf 'Verify actual rights with sudo -l from that account. Existing external grants remain.\n'
