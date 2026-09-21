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
mkdir -p "$data/root/.ssh" "$data/shell/.ssh" "$core" "$module" "$bin"
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
exit 0
EOF

cat > "$module/opensshd.init" <<EOF
#!/bin/sh
echo "init \$1" >> "$log"
case \$1 in
  start) echo "\$TEST_DAEMON_PID" > "$data/sshd.pid" ;;
  stop) rm -f "$data/sshd.pid" ;;
  *) exit 1 ;;
esac
EOF
chmod 755 "$bin/sshd" "$module/opensshd.init"

controller=$root/module_data/common/ksu-ssh-webui
run() {
    SSH_DATA_DIR=$data \
    SSH_CORE_DIR=$core \
    SSH_MODULE_DIR=$module \
    SSH_SSHD_BIN=$bin/sshd \
    SSH_KEYGEN_BIN=$(command -v ssh-keygen) \
    SSH_OPENSSL_BIN=$(command -v openssl) \
    SSH_PID_FILE=$data/sshd.pid \
    SSH_ROOT_UID=$(id -u) SSH_ROOT_GID=$(id -g) \
    SSH_SHELL_UID=$(id -u) SSH_SHELL_GID=$(id -g) \
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
sleep 30 &
service_pid=$!
printf '%s\n' "$service_pid" > "$data/sshd.pid"
state=$(run state)
printf '%s\n' "$state" | grep -q '^state	running$'
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

sleep 30 &
service_pid=$!
export TEST_DAEMON_PID=$service_pid
run service start
run service start
[ "$(grep -c '^init start$' "$log")" = 1 ]
run service restart
grep -q '^init stop$' "$log"
[ "$(grep -c '^init start$' "$log")" = 2 ]
run service stop
run service stop
[ "$(grep -c '^init stop$' "$log")" = 2 ]
run log | grep -q 'restart'
printf '#!/bin/sh\necho startup-failed >&2\nexit 7\n' > "$module/opensshd.init"
expect_fail run service start
run log | grep -q 'startup-failed'

# Existing key files need not end with a newline.
printf '%s' "$key" > "$data/root/.ssh/authorized_keys"
run keys add root "$second_encoded"
[ "$(wc -l < "$data/root/.ssh/authorized_keys" | tr -d ' ')" = 2 ]
grep -Fqx "$key" "$data/root/.ssh/authorized_keys"

printf '\nMatch User shell\n  PasswordAuthentication no\n' >> "$data/sshd_config"
run settings set password-auth 1
grep -q '^PasswordAuthentication yes$' "$data/sshd_config"
grep -q '^  PasswordAuthentication no$' "$data/sshd_config"

printf 'webui controller tests passed\n'
