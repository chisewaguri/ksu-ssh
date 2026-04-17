print_modname() {
  ui_print "*******************************"
  ui_print "      OpenSSH for Android      "
  ui_print "*******************************"
}

on_install() {
  local TMPDIR="$MODPATH/tmp"
  ui_print "[0/7] Preparing module directory"
  mkdir -p "$TMPDIR"
  mkdir -p "/data/adb/ssh/bin"
  mkdir -p "/data/adb/ssh/usr/libexec/ssh-core"

  ui_print "[1/7] Extracting architecture unspecific module files"
  unzip -o "$ZIPFILE" 'common/opensshd.init' -d "$MODPATH/tmp" >&2
  unzip -o "$ZIPFILE" 'common/wrapper' -d "$MODPATH/tmp" >&2
  mv "$TMPDIR/common/opensshd.init" "$MODPATH"
  mv "$TMPDIR/common/wrapper" "/data/adb/ssh/usr/libexec/ssh-core"

  ui_print "[2/7] Extracting libraries and binaries for $ARCH"
  unzip -o "$ZIPFILE" "arch/$ARCH/*" -d "$TMPDIR" >&2
  mv "$TMPDIR/arch/$ARCH/lib" "/data/adb/ssh/usr"
  mv "$TMPDIR/arch/$ARCH/bin"/* "/data/adb/ssh/usr/libexec/ssh-core"

  ui_print "[3/7] Configuring library path wrapper"
  if [ "$KSU" = true ]; then
      BINDIR=/data/adb/ksu/bin
  elif [ "$APATCH" = true ]; then
      BINDIR=/data/adb/ap/bin
  else
      ui_print "Error: This module requires KernelSU or APatch"
      abort "Neither KernelSU nor APatch detected"
  fi

  for f in scp sftp sftp-server ssh ssh-keygen sshd sshd-session sshd-auth rsync; do
      rm -rf "$BINDIR/$f"
      ln -s /data/adb/ssh/usr/libexec/ssh-core/wrapper "$BINDIR/$f"
      chmod +x "$BINDIR/$f"
  done

  # set prefix according to bindir
  sed -i "s#^prefix=.*#prefix=${BINDIR%/bin}#" "$MODPATH/opensshd.init"

  ui_print "[4/7] Creating SSH user directories"
  mkdir -p /data/ssh
  mkdir -p /data/ssh/root/.ssh
  mkdir -p /data/ssh/shell/.ssh

  # Create password authentication infrastructure
  mkdir -p /data/ssh/etc
  if [ ! -f /data/ssh/etc/shadow ]; then
      touch /data/ssh/etc/shadow
      chmod 600 /data/ssh/etc/shadow
  fi

  if [ -f /data/ssh/sshd_config ]; then
    ui_print "[5/7] Found sshd_config, will not copy a default one"
  else
    ui_print "[5/7] Extracting sshd_config"
    unzip -o "$ZIPFILE" 'common/sshd_config' -d "$TMPDIR" >&2
    mv "$TMPDIR/common/sshd_config" '/data/ssh/'
  fi

  ui_print "[6/7] Ensuring authorized_keys file exist"
  if [ ! -f /data/ssh/root/.ssh/authorized_keys ]; then
    ui_print "[6.1/7] Root authorized keys file not found. Creating and setting permissions"
    mkdir -p /data/ssh/root/.ssh
    touch /data/ssh/root/.ssh/authorized_keys
    chmod 600 /data/ssh/root/.ssh/authorized_keys
  else
    ui_print "[6.1/7] Root authorized keys file found. Setting permission"
    chmod 600 /data/ssh/root/.ssh/authorized_keys
  fi

  if [ ! -f /data/ssh/shell/.ssh/authorized_keys ]; then
    ui_print "[6.2/7] Shell authorized keys file not found. Creating and setting permissions"
    mkdir -p /data/ssh/shell/.ssh
    touch /data/ssh/shell/.ssh/authorized_keys
    chmod 600 /data/ssh/shell/.ssh/authorized_keys
  else
    ui_print "[6.2/7] Shell authorized keys file found. Setting permission"
    chmod 600 /data/ssh/shell/.ssh/authorized_keys
  fi

  ui_print "[7/7] Cleaning up"
  rm -rf "$TMPDIR"
}

set_permissions() {
  set_perm_recursive /data/adb/ssh 0 0 0755 0644

  set_perm_recursive "/data/adb/ssh/usr/libexec/ssh-core" 0 0 0755 0755
  set_perm "$MODPATH/opensshd.init" 0 0 0755
  set_perm /data/ssh/sshd_config 0 0 0600
  set_perm /data/ssh/etc 0 0 0700
  set_perm /data/ssh/etc/shadow 0 0 0600
  chown shell:shell /data/ssh/shell
  chown shell:shell /data/ssh/shell/.ssh
  chown root:root /data/ssh/root
  chown root:root /data/ssh/root/.ssh
  chmod 700 /data/ssh/shell /data/ssh/root
  chmod 700 /data/ssh/shell/.ssh /data/ssh/root/.ssh
}
