#!/usr/bin/env bash
# Authorize one public key for the current Linux account. No sudo or passwords.
set -euo pipefail
umask 077

default_user=''
default_host=''
default_key=''
expected_user="$default_user"
expected_host="$default_host"
key="$default_key"
key_file=''

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --user|--hostname|--key|--key-file)
      [ "$#" -ge 2 ] || die "Missing value for $1"
      case "$1" in
        --user) expected_user="$2" ;;
        --hostname) expected_host="$2" ;;
        --key) key="$2" ;;
        --key-file) key_file="$2" ;;
      esac
      shift 2 ;;
    --help)
      printf 'Usage: bash authorize-ssh-key.sh --user USER [--hostname HOST] --key-file PUBLIC_KEY.pub\n'
      printf 'Alternatively use --key "ssh-ed25519 ..."; generated scripts need no arguments.\n'
      exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ "$expected_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die 'A valid --user is required'
[ -z "${SUDO_USER:-}" ] || die 'Run as the intended account, without sudo'
actual_user=$(id -un)
[ "$actual_user" = "$expected_user" ] || die "Run as $expected_user; current account is $actual_user"
if [ -n "$expected_host" ]; then
  [ "$(hostname)" = "$expected_host" ] || die 'Hostname does not match the intended server'
fi
if [ -n "$key_file" ]; then
  [ -f "$key_file" ] || die 'Public key file not found'
  [ "$(wc -c < "$key_file")" -le 4096 ] || die 'Public key file is too large'
  key=$(cat -- "$key_file")
fi
key=${key%$'\r'}
[ -n "$key" ] && [ "${#key}" -le 4096 ] || die 'A single public key is required'
[[ "$key" != *$'\n'* && "$key" != *$'\r'* ]] || die 'Expected one public key line'
if printf '%s' "$key" | LC_ALL=C grep -q '[[:cntrl:]]'; then die 'Control characters in public key'; fi
read -r key_type key_blob key_comment <<< "$key"
[[ "$key_type" = ssh-ed25519 && "$key_blob" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || die 'Expected an Ed25519 public key, not a private key'
command -v ssh-keygen >/dev/null || die 'ssh-keygen is required'

uid=$(id -u)
[ -n "${HOME:-}" ] && [ -d "$HOME" ] || die 'HOME directory is unavailable'
[ "$(stat -c %u -- "$HOME")" = "$uid" ] || die 'HOME is not owned by the current account'
ssh_dir="$HOME/.ssh"
auth="$ssh_dir/authorized_keys"
lock="$ssh_dir/.jarvis-authorize.lock"
check_paths() {
  [ ! -L "$ssh_dir" ] && [ ! -L "$auth" ] || die 'Refusing a symbolic link at the SSH authorization path'
  [ -d "$ssh_dir" ] || die 'SSH path is not a directory'
  [ "$(stat -c %u -- "$ssh_dir")" = "$uid" ] || die 'SSH directory owner mismatch'
  if [ -e "$auth" ]; then
    [ -f "$auth" ] || die 'authorized_keys is not a regular file'
    [ "$(stat -c %u -- "$auth")" = "$uid" ] || die 'authorized_keys owner mismatch'
    [ "$(stat -c %h -- "$auth")" = 1 ] || die 'Refusing a hard-linked authorized_keys'
  fi
}
[ ! -L "$ssh_dir" ] || die 'Refusing a symbolic SSH directory'
mkdir -p -- "$ssh_dir"
check_paths
chmod 700 -- "$ssh_dir"

locked=0
validation_dir=''
cleanup() {
  if [ -n "$validation_dir" ]; then
    rm -f -- "$validation_dir/key.pub"
    rmdir -- "$validation_dir" 2>/dev/null || true
  fi
  if [ "$locked" = 1 ]; then rmdir -- "$lock" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for attempt in {1..50}; do
  if mkdir -- "$lock" 2>/dev/null; then locked=1; break; fi
  sleep 0.1
done
[ "$locked" = 1 ] || die 'Another authorization is running or an old lock needs checking'
check_paths
validation_dir=$(mktemp -d "$ssh_dir/.key-check.XXXXXXXX")
printf '%s\n' "$key" > "$validation_dir/key.pub"
ssh-keygen -lf "$validation_dir/key.pub" -E sha256 >/dev/null 2>&1 || die 'Invalid Ed25519 public key'
if [ ! -e "$auth" ]; then (set -o noclobber; : > "$auth"); fi

# Tokenize outside quoted options. Match key material, regardless of its comment.
# Existing restrictions (from=, command=, etc.) are preserved, never relaxed.
if awk -v blob="$key_blob" '
  /^[[:space:]]*#/ { next }
  {
    delete fields; n=0; token=""; quoted=0; escaped=0;
    for (i=1; i<=length($0); i++) {
      c=substr($0,i,1);
      if (escaped) { token=token c; escaped=0; continue }
      if (quoted && c=="\\") { token=token c; escaped=1; continue }
      if (c=="\"") { quoted=!quoted; token=token c; continue }
      if (!quoted && c ~ /[ \t]/) { if (length(token)) { fields[++n]=token; token="" } }
      else token=token c;
    }
    if (length(token)) fields[++n]=token;
    if ((fields[1]=="ssh-ed25519" && fields[2]==blob) || (fields[2]=="ssh-ed25519" && fields[3]==blob)) found=1;
  }
  END { exit found ? 0 : 1 }
' "$auth"; then
  status='already-present'
else
  if [ -s "$auth" ] && [ "$(tail -c 1 -- "$auth" | od -An -t u1 | tr -d '[:space:]')" != 10 ]; then
    printf '\n' >> "$auth"
  fi
  printf '%s\n' "$key" >> "$auth"
  status='added'
fi
chmod 600 -- "$auth"
printf 'AUTHORIZED user=%s status=%s\n' "$actual_user" "$status"
