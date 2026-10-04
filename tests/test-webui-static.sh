#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
webroot=$root/module_data/webroot

test -f "$webroot/index.html"
test -f "$webroot/style.css"
test -f "$webroot/app.js"
test -f "$webroot/vendor/kernelsu.js"
test -f "$root/module_data/common/ksu-ssh-webui"

grep -Fq './vendor/kernelsu.js' "$webroot/app.js"
grep -Fq '/data/adb/ssh/bin/ksu-ssh-webui' "$webroot/app.js"
grep -Fq 'chmod 755 /data/adb/ssh/bin/ksu-ssh-webui' "$root/module_data/customize.sh"
grep -Fq 'aria-label=' "$webroot/index.html"
grep -Fq 'Password sign-in' "$webroot/index.html"
grep -Fq 'Key or password' "$webroot/index.html"
grep -Fq 'Turn on password sign-in to allow root passwords' "$webroot/app.js"
grep -Fq 'prefers-color-scheme: dark' "$webroot/style.css"
grep -Fq 'prefers-reduced-motion: reduce' "$webroot/style.css"

if find "$webroot" -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' \) \
    -exec grep -Eq 'https?://|src="//' {} +; then
    echo "webui contains a remote asset" >&2
    exit 1
fi

if grep -Eq '\bspawn\s*\(' "$webroot/app.js"; then
    echo "webui uses spawn, which merges output records" >&2
    exit 1
fi
grep -Fq '[CONTROLLER, ...args].map(shellQuote)' "$webroot/app.js"

printf 'webui static tests passed\n'
