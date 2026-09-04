#!/system/bin/sh
MODDIR=${0%/*}

[ -f /data/ssh/no-autostart ] || \
    /data/adb/ssh/usr/libexec/ssh-core/sshd-private-devpts \
        "$MODDIR/opensshd.init" start
