#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=${TMPDIR:-/tmp}/ksu-ssh-crypt-$$
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp"

cat > "$tmp/crypt-test.c" <<'EOF'
#include <openssl/md5.h>
#include <openssl/sha.h>
#include <openssl/des.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
EOF

awk '
    /^static const char itoa64\[\] =/ { copying = 1 }
    /^#else \/\* !WITH_OPENSSL \*\// { copying = 0 }
    copying { print }
' "$root/overlay/openssh/android-tweaks.c" >> "$tmp/crypt-test.c"

cat >> "$tmp/crypt-test.c" <<'EOF'
int main(int argc, char **argv)
{
    const char *md5 = "$1$salt123$gULJBLjZ3PwPTgH6ysqQf1";
    const char *sha512 = "$6$salt123$TsezOEVlTpVpUJ5tnMyf85.7fF2MU8oAh12aJX0m2/YwQ73h9s4GT9RtYb/d3qBjGb0GO4S9mteFyLItnsHd8.";
    if (strcmp(crypt("testpass", md5), md5) != 0) {
        fprintf(stderr, "MD5-crypt vector failed\n");
        return 1;
    }
    if (strcmp(crypt("testpass", sha512), sha512) != 0) {
        fprintf(stderr, "SHA-512-crypt vector failed\n");
        return 1;
    }
    if (strcmp(crypt("wrong", md5), md5) == 0 ||
        strcmp(crypt("wrong", sha512), sha512) == 0) {
        fprintf(stderr, "wrong password matched a stored hash\n");
        return 1;
    }
    if (argc == 3 && strcmp(crypt(argv[1], argv[2]), argv[2]) != 0) {
        fprintf(stderr, "OpenSSL password hash did not match\n");
        return 1;
    }
    return 0;
}
EOF

case $(uname -s) in
    MINGW*|MSYS*)
        mingw_root=$(CDPATH= cd -- "$(dirname "$(command -v cc)")/.." && pwd)
        set -- -I"$mingw_root/opt/include" -L"$mingw_root/opt/lib"
        ;;
    *) set -- ;;
esac
cat > "$tmp/config.h" <<'EOF'
#define malloc rpl_malloc
EOF
touch "$tmp/android-tweaks.h"
awk '/^#include/ {
    print
    if ($0 ~ /"config.h"/) config = 1
    if ($0 ~ /<stdlib.h>/) stdlib = 1
    if (config && stdlib) exit
}' \
    "$root/overlay/openssh/android-tweaks.c" > "$tmp/include-order.c"
printf 'void *test_alloc(size_t n) { return malloc(n); }\n' >> "$tmp/include-order.c"
cc -Werror=implicit-function-declaration -Werror=int-conversion \
    "$@" -I"$tmp" -c "$tmp/include-order.c" -o "$tmp/include-order.o"
cc -Wno-deprecated-declarations "$@" -o "$tmp/crypt-test" "$tmp/crypt-test.c" -lcrypto
"$tmp/crypt-test"
long_password=$(printf '%064d' 0)
for algorithm in -1 -6; do
    for password in 'ab\cd with spaces' "$long_password" "${long_password}x" "${long_password}${long_password}"; do
        hash=$(printf '%s' "$password" | openssl passwd "$algorithm" -salt salt123 -stdin)
        "$tmp/crypt-test" "$password" "$hash"
    done
done
printf 'password crypt vectors passed\n'
