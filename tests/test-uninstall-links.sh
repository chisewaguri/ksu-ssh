#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=${TMPDIR:-/tmp}/ksu-ssh-uninstall-$$
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp/bin"

# Keep the real unlink logic, but point its shared bin directory at the fixture.
sed -e '1,2c\:' \
    -e "s|BINDIR=/data/adb/ksu/bin|BINDIR=$tmp/bin|" \
    "$root/module_data/uninstall.sh" > "$tmp/uninstall"

case $(uname -s) in
    MINGW*|MSYS*) symlinks=false ;;
    *) symlinks=true ;;
esac
if [ "$symlinks" = true ]; then
    ln -s /data/adb/ssh/usr/libexec/ssh-core/wrapper "$tmp/bin/ssh"
    ln -s /data/adb/ssh/bin/passwd "$tmp/bin/passwd"
    ln -s /another/module/openssl "$tmp/bin/openssl"
fi
printf 'owned elsewhere\n' > "$tmp/bin/scp"

KSU=true APATCH=false sh "$tmp/uninstall"
[ -f "$tmp/bin/scp" ] || {
    echo 'uninstall removed a command it did not own' >&2
    exit 1
}
if [ "$symlinks" = true ]; then
    [ ! -e "$tmp/bin/ssh" ] && [ ! -L "$tmp/bin/ssh" ]
    [ ! -e "$tmp/bin/passwd" ] && [ ! -L "$tmp/bin/passwd" ]
    [ "$(readlink "$tmp/bin/openssl")" = /another/module/openssl ]
fi

printf 'uninstall link tests passed\n'
