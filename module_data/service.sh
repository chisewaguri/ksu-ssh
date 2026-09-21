#!/system/bin/sh
MODDIR=${0%/*}

[ -f /data/ssh/no-autostart ] || sh "$MODDIR/common/ksu-ssh-webui" service start
