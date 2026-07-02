test -e /data/ssh/KEEP_ON_UNINSTALL || rm -rf /data/ssh
rm -rf /data/adb/ssh

if [ "$KSU" = true ]; then
    BINDIR=/data/adb/ksu/bin
elif [ "$APATCH" = true ]; then
    BINDIR=/data/adb/ap/bin
else
    exit 0
fi

for f in scp sftp sftp-server ssh ssh-keygen sshd sshd-session sshd-auth rsync openssl passwd; do
    rm -f "$BINDIR/$f"
done
