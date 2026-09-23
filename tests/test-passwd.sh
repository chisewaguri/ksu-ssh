#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=${TMPDIR:-/tmp}/ksu-ssh-passwd-$$
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp"

# Redirect the device-only path while running the installed script on a host.
sed -e "s|^SHADOW_FILE=/data/ssh/etc/shadow|SHADOW_FILE=$tmp/shadow|" \
    -e "s|^mkdir -p /data/ssh/etc|mkdir -p $tmp|" \
    "$root/module_data/common/passwd" > "$tmp/passwd"

printf '%s\n' 'ab\cd' 'ab\cd' | sh "$tmp/passwd" shell > "$tmp/output"
hash=$(cut -d: -f2 "$tmp/shadow")
salt=$(printf '%s\n' "$hash" | cut -d'$' -f3)
expected=$(printf '%s' 'ab\cd' | openssl passwd -6 -salt "$salt" -stdin)
if [ "$hash" != "$expected" ]; then
    echo 'passwd changed a password containing a backslash' >&2
    exit 1
fi

mkdir -p "$tmp/bin"
printf '#!/bin/sh\nexit 1\n' > "$tmp/bin/sed"
chmod 755 "$tmp/bin/sed"
if printf '%s\n' 'new-secret' 'new-secret' | \
    PATH="$tmp/bin:$PATH" sh "$tmp/passwd" shell > "$tmp/output" 2>&1; then
    echo 'passwd reported success after the shadow update failed' >&2
    exit 1
fi
if [ "$(cut -d: -f2 "$tmp/shadow")" != "$hash" ]; then
    echo 'failed shadow update changed the stored password' >&2
    exit 1
fi

printf 'passwd tests passed\n'
