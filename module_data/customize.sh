#!/system/bin/sh
TMPDIR="$MODPATH/tmp"

mkdir -p "$TMPDIR" /data/adb/ssh/bin /data/adb/ssh/usr/libexec/ssh-core

unzip -o "$ZIPFILE" 'common/opensshd.init' -d "$MODPATH/tmp" >&2
unzip -o "$ZIPFILE" 'common/wrapper' -d "$MODPATH/tmp" >&2
unzip -o "$ZIPFILE" 'common/passwd' -d "$MODPATH/tmp" >&2
unzip -o "$ZIPFILE" "arch/$ARCH/*" -d "$TMPDIR" >&2

mv "$TMPDIR/common/opensshd.init" "$MODPATH"
mv "$TMPDIR/common/wrapper" /data/adb/ssh/usr/libexec/ssh-core
mv "$TMPDIR/common/passwd" /data/adb/ssh/bin/
mv "$TMPDIR/arch/$ARCH/lib" /data/adb/ssh/usr
mv "$TMPDIR/arch/$ARCH/bin"/* /data/adb/ssh/usr/libexec/ssh-core

if [ "$KSU" = true ]; then
    BINDIR=/data/adb/ksu/bin
elif [ "$APATCH" = true ]; then
    BINDIR=/data/adb/ap/bin
else
    abort "This module requires KernelSU or APatch"
fi

for f in scp sftp sftp-server ssh ssh-keygen sshd sshd-session sshd-auth rsync openssl; do
    ln -sf /data/adb/ssh/usr/libexec/ssh-core/wrapper "$BINDIR/$f"
done
ln -sf /data/adb/ssh/bin/passwd "$BINDIR/passwd"

sed -i "s#^prefix=.*#prefix=${BINDIR%/bin}#" "$MODPATH/opensshd.init"

mkdir -p /data/ssh/root/.ssh /data/ssh/shell/.ssh /data/ssh/etc
touch /data/ssh/etc/shadow /data/ssh/root/.ssh/authorized_keys /data/ssh/shell/.ssh/authorized_keys

if [ ! -f /data/ssh/sshd_config ]; then
    unzip -o "$ZIPFILE" 'common/sshd_config' -d "$TMPDIR" >&2
    mv "$TMPDIR/common/sshd_config" /data/ssh/
fi

rm -rf "$TMPDIR" "$MODPATH/arch"

# permissions
chmod -R 755 /data/adb/ssh/usr/libexec/ssh-core
chmod 755 /data/adb/ssh/bin/passwd
chmod -R 644 /data/adb/ssh/usr/lib/*
chmod 755 "$MODPATH/opensshd.init"
chmod 600 /data/ssh/sshd_config /data/ssh/etc/shadow
chmod 600 /data/ssh/root/.ssh/authorized_keys /data/ssh/shell/.ssh/authorized_keys
chmod 700 /data/ssh/etc /data/ssh/root /data/ssh/root/.ssh /data/ssh/shell /data/ssh/shell/.ssh
chown -R 0:0 /data/adb/ssh /data/ssh/root /data/ssh/etc /data/ssh/sshd_config
chown -R 2000:2000 /data/ssh/shell
