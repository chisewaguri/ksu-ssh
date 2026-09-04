#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=${TMPDIR:-/tmp}/ksu-ssh-private-devpts-$$
trap 'rm -f "$tmp"' EXIT HUP INT TERM

if printf '#include <sys/mount.h>\n' | cc -E - >/dev/null 2>&1; then
    cc -Wall -Wextra -Werror -o "$tmp" "$root/native/sshd-private-devpts.c"

    if "$tmp" >/dev/null 2>&1; then
        echo "launcher accepted a missing command" >&2
        exit 1
    fi
fi

grep -Fq '/data/adb/ssh/usr/libexec/ssh-core/sshd-private-devpts' \
    "$root/module_data/service.sh"
grep -Fq '$(BUILD_DIR)/usr/bin/sshd-private-devpts' "$root/main.mk"
awk '
    /^define arch-targets$/ { in_arch_targets = 1 }
    in_arch_targets && /usr\/bin\/sshd-private-devpts:/ { found = 1 }
    in_arch_targets && /^endef$/ { exit }
    END { exit !found }
' "$root/main.mk"
grep -Fq 'unshare(CLONE_NEWNS)' "$root/native/sshd-private-devpts.c"
grep -Fq 'setns(fd, CLONE_NEWNS)' "$root/native/sshd-private-devpts.c"
grep -Fq 'open("/proc/1/ns/mnt"' "$root/native/sshd-private-devpts.c"
grep -Fq 'newinstance,ptmxmode=0666,mode=0620,gid=2000' \
    "$root/native/sshd-private-devpts.c"
