#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=${TMPDIR:-/tmp}/ksu-ssh-webui-$$
trap '[ -z "${service_pid:-}" ] || kill "$service_pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT HUP INT TERM

data=$tmp/data
core=$tmp/core
module=$tmp/module
bin=$tmp/bin
log=$tmp/service.log
proc=$tmp/proc
mkdir -p "$proc" "$data/root/.ssh" "$data/shell/.ssh" "$core" "$module" "$bin"
: > "$data/root/.ssh/authorized_keys"
: > "$data/shell/.ssh/authorized_keys"

cat > "$data/sshd_config" <<'EOF'
Port 22
PasswordAuthentication yes
PermitRootLogin prohibit-password
Subsystem sftp internal-sftp
EOF

cat > "$bin/sshd" <<'EOF'
#!/bin/sh
config=
while [ "$#" -gt 0 ]; do
    [ "$1" = -f ] && { config=$2; shift 2; continue; }
    shift
done
grep -q '^InvalidDirective ' "$config" && exit 1
[ -z "${SSH_TEST_VALIDATE_MARKER:-}" ] || {
    touch "$SSH_TEST_VALIDATE_MARKER"
    sleep 1
}
exit 0
EOF

cat > "$module/opensshd.init" <<EOF
#!/bin/sh
echo "init \$1" >> "$log"
[ "\$1" != status ] || exit 1
EOF

cat > "$bin/private-devpts" <<EOF
#!/bin/sh
echo "launcher \$*" >> "$log"
exec "\$@"
EOF
cat > "$bin/su" <<EOF
#!/bin/sh
[ "\$1" = -c ] || exit 1
echo "su \$2" >> "$log"
exec sh -c "\$2"
EOF
cat > "$bin/ip" <<'EOF'
#!/bin/sh
case "$*" in
    "-4 route get 1.1.1.1") [ -n "${SSH_TEST_NO_ROUTE:-}" ] || echo "1.1.1.1 via 192.168.1.1 dev wlan0 src 192.168.1.42 uid 0" ;;
    "-4 addr show") printf '    inet 127.0.0.1/8 scope host lo\n    inet 10.0.0.7/24 brd 10.0.0.255 scope global wlan0\n' ;;
esac
EOF
chmod 755 "$bin/sshd" "$bin/private-devpts" "$bin/su" "$bin/ip" "$module/opensshd.init"

real_readlink=$(command -v readlink)
cat > "$bin/readlink" <<EOF
#!/bin/sh
case "\$1" in
    "$proc"/*/exe) cat "\$1" ;;
    *) exec "$real_readlink" "\$@" ;;
esac
EOF
chmod 755 "$bin/readlink"

controller=$root/module_data/common/ksu-ssh-webui
run() {
    PATH="$bin:$PATH" \
    SSH_DATA_DIR=$data \
    SSH_CORE_DIR=$core \
    SSH_MODULE_DIR=$module \
    SSH_SSHD_BIN=$bin/sshd \
    SSH_KEYGEN_BIN=$(command -v ssh-keygen) \
    SSH_OPENSSL_BIN=$(command -v openssl) \
    SSH_PRIVATE_DEVPTS=$bin/private-devpts \
    SSH_PID_FILE=$data/sshd.pid \
    SSH_IP_BIN=$bin/ip \
    SSH_SU_BIN=${SSH_SU_BIN:-$bin/su} \
    SSH_PROC_DIR=$proc \
    SSH_TEST_NO_ROUTE=${SSH_TEST_NO_ROUTE:-} \
    SSH_ROOT_UID=$(id -u) SSH_ROOT_GID=$(id -g) \
    SSH_SHELL_UID=$(id -u) SSH_SHELL_GID=$(id -g) \
    SSH_TEST_VALIDATE_MARKER=${SSH_TEST_VALIDATE_MARKER:-} \
    sh "$controller" "$@"
}

expect_fail() {
    if "$@" >/dev/null 2>&1; then
        echo "expected failure: $*" >&2
        exit 1
    fi
}

assert_mode() {
	case $(uname -s) in
		MINGW*|MSYS*) return ;;
	esac
	[ "$(stat -c %a "$1")" = "$2" ]
}

encode() {
    printf '%s' "$1" | openssl enc -base64 -A
}

keybase=$tmp/test-key
ssh-keygen -q -t ed25519 -N '' -C pixel-laptop -f "$keybase"
key=$(cat "$keybase.pub")
encoded=$(encode "$key")
secondbase=$tmp/second-key
ssh-keygen -q -t ed25519 -N '' -C tablet -f "$secondbase"
second=$(cat "$secondbase.pub")
second_encoded=$(encode "$second")

service_pid=
state=$(run state)
printf '%s\n' "$state" | grep -q '^state	stopped$'
printf '%s\n' "$state" | grep -q '^address	192.168.1.42$'
state=$(SSH_TEST_NO_ROUTE=1 run state)
printf '%s\n' "$state" | grep -q '^address	10.0.0.7$'
sleep 30 &
service_pid=$!
printf '%s\n' "$service_pid" > "$data/sshd.pid"
mkdir -p "$proc/$service_pid"
readlink -f "$bin/sshd" > "$proc/$service_pid/exe"
state=$(run state)
printf '%s\n' "$state" | grep -q '^state	running$'
printf '%s\n' "$state" | grep -q '^app-bound	unknown$'
mkdir -p "$proc/$service_pid"
printf '0::/apps/uid_10293/pid_4000\n' > "$proc/$service_pid/cgroup"
state=$(run state)
printf '%s\n' "$state" | grep -q '^app-bound	1$'
printf '0::/\n' > "$proc/$service_pid/cgroup"
state=$(run state)
printf '%s\n' "$state" | grep -q '^app-bound	0$'
printf '4:memory:/uid_10293/pid_4000\n0::/\n' > "$proc/$service_pid/cgroup"
state=$(run state)
printf '%s\n' "$state" | grep -q '^app-bound	1$'
rm "$proc/$service_pid/exe"
printf /not/sshd > "$proc/$service_pid/exe"
state=$(run state)
printf '%s\n' "$state" | grep -q '^state	stopped$'
kill "$service_pid"
wait "$service_pid" 2>/dev/null || true
service_pid=
state=$(run state)
printf '%s\n' "$state" | grep -q '^state	stopped$'
printf 'not-a-pid\n' > "$data/sshd.pid"
state=$(run state)
printf '%s\n' "$state" | grep -q '^state	stopped$'

expect_fail run keys list nobody
expect_fail run keys add root "$(encode 'not a public key')"
expect_fail run keys add root "$(encode "$key
$second")"
[ ! -s "$data/root/.ssh/authorized_keys" ]
run keys add root "$encoded"
expect_fail run keys add root "$encoded"
chmod 666 "$data/root/.ssh/authorized_keys"
run keys add root "$second_encoded"
list=$(run keys list root)
printf '%s\n' "$list" | grep -q '^key	'
printf '%s\n' "$list" | head -n 1 | cut -f3 | openssl enc -d -base64 -A | grep -q 'SHA256:'
[ "$(wc -l < "$data/root/.ssh/authorized_keys" | tr -d ' ')" = 2 ]
assert_mode "$data/root/.ssh/authorized_keys" 600
run keys delete root "$encoded"
grep -Fqx "$second" "$data/root/.ssh/authorized_keys"
! grep -Fqx "$key" "$data/root/.ssh/authorized_keys"
run keys delete root "$second_encoded"
[ ! -s "$data/root/.ssh/authorized_keys" ]
run keys add shell "$encoded"
assert_mode "$data/shell/.ssh/authorized_keys" 600
run keys delete shell "$encoded"

settings=$(run settings get)
printf '%s\n' "$settings" | grep -q '^autostart	1$'
printf '%s\n' "$settings" | grep -q '^port	22$'
printf '%s\n' "$settings" | grep -q '^password-auth	1$'
printf '%s\n' "$settings" | grep -q '^root-login	keys$'

expect_fail run settings set port 0
expect_fail run settings set port 65536
run settings set autostart 0
[ -f "$data/no-autostart" ]
run settings set autostart 1
[ ! -e "$data/no-autostart" ]
run settings set port 2222
run settings set password-auth 0
grep -q '^PasswordAuthentication no$' "$data/sshd_config"
run settings set password-auth 1
grep -q '^PasswordAuthentication yes$' "$data/sshd_config"
run settings set root-login disabled
grep -q '^PermitRootLogin no$' "$data/sshd_config"
run settings set root-login keys
grep -q '^PermitRootLogin prohibit-password$' "$data/sshd_config"
run settings set root-login password
grep -q '^Port 2222$' "$data/sshd_config"
grep -q '^PasswordAuthentication yes$' "$data/sshd_config"
grep -q '^PermitRootLogin yes$' "$data/sshd_config"
[ -f "$data/sshd_config.bak" ]

config_record=$(run config get)
[ "$(printf '%s\n' "$config_record" | cut -f1)" = config ]
printf '%s\n' "$config_record" | cut -f2 | openssl enc -d -base64 -A | grep -q '^Port 2222$'
before=$(cat "$data/sshd_config")
before_inode=$(stat -c %i "$data/sshd_config")
expect_fail run config save "$(encode 'InvalidDirective yes')"
[ "$(cat "$data/sshd_config")" = "$before" ]
run config save "$(encode 'Port 2200
PasswordAuthentication yes
PermitRootLogin no')"
grep -q '^Port 2200$' "$data/sshd_config"
[ "$(stat -c %i "$data/sshd_config")" != "$before_inode" ]

run service restart
grep -q "^su exec '$bin/private-devpts' '$module/opensshd.init' start$" "$log"
grep -q '^init stop$' "$log"
grep -q '^launcher .*opensshd.init start$' "$log"
if grep -q '^init restart$' "$log"; then
    echo "restart bypassed private devpts" >&2
    exit 1
fi
: > "$log"
SSH_SU_BIN=$tmp/missing-su run service start
grep -q '^launcher .*opensshd.init start$' "$log"
if grep -q '^su ' "$log"; then
    echo "missing su was used" >&2
    exit 1
fi

run settings set root-login keys
marker=$tmp/validation-started
SSH_TEST_VALIDATE_MARKER=$marker run settings set password-auth 0 > "$tmp/first-write.log" &
first_write=$!
attempts=0
while [ ! -f "$marker" ]; do
    [ "$attempts" -lt 500 ] || { echo 'validation did not start' >&2; exit 1; }
    attempts=$((attempts + 1))
    sleep 0.01
done
run settings set root-login disabled
wait "$first_write"
grep -q '^PasswordAuthentication no$' "$data/sshd_config"
grep -q '^PermitRootLogin no$' "$data/sshd_config" || {
    echo 'concurrent settings update was lost' >&2
    exit 1
}

printf 'webui controller tests passed\n'
