# KernelSU SSH

OpenSSH and Rsync for rooted Android, based on
[MagiskSSH](https://gitlab.com/d4rcm4rc/MagiskSSH) by D4rCM4rC and contributors.

Requires KernelSU or APatch and Android 7.0 or newer. Supports arm, arm64, x86,
and x86_64. Magisk is not supported.

Runtime files live in `/data/adb/ssh`, with no system mounts. SSH sessions can
access internal storage and use a private `devpts` instance.

## Install

1. Download the artifact from a successful
   [build](https://github.com/chisewaguri/ksu-ssh/actions/workflows/build.yml),
   or [build from source](#build-from-source).
2. Install the module ZIP in KernelSU or APatch.
3. Restart the device.

SSH starts at boot unless **Start on boot** is off in the WebUI.

## Connect

Copy the SSH command from the WebUI, or use:

```sh
ssh shell@DEVICE_IP
ssh root@DEVICE_IP
```

Both accounts accept authorized keys by default. Password sign-in is enabled
for `shell` and disabled for `root`. A fresh install has no passwords. To set
them, use a root terminal on the device:

```sh
passwd shell
passwd root
```

Passwords are stored as SHA-512-crypt or MD5-crypt hashes in
`/data/ssh/etc/shadow` and survive updates. To allow root passwords, also select
**Root: Key or password** in the WebUI.

SFTP, SCP, and Rsync use the same server.

## WebUI

Open KernelSU SSH from the module list.

- **SSH** starts, stops, and restarts the server. Tap the SSH command to copy it.
- **Keys** adds or removes public keys for `root` and `shell`. Paste one key at
  a time. Duplicate keys are rejected.
- **Config** edits `/data/ssh/sshd_config`. Saving validates it with `sshd -t`
  and backs up the previous file as `sshd_config.bak`. Invalid changes are not
  applied.

The SSH page has these settings:

| Setting | Effect |
| --- | --- |
| Start on boot | Starts SSH after boot |
| Port | Listening port, 1 through 65535 |
| Password sign-in | Allows shell passwords, and root passwords when enabled below |
| Root: Off | Blocks root login |
| Root: Key | Allows root login with a key |
| Root: Key or password | Allows root login with either. Requires password sign-in |

Shell key login stays enabled. Restart SSH to apply port and sign-in changes.

## Files

You can manage these from a root terminal instead of the WebUI:

| Path | Purpose |
| --- | --- |
| `/data/ssh/sshd_config` | Server configuration |
| `/data/ssh/root/.ssh/authorized_keys` | Root keys |
| `/data/ssh/shell/.ssh/authorized_keys` | Shell keys |
| `/data/ssh/etc/shadow` | Password hashes |
| `/data/ssh/no-autostart` | Disables startup while present |

Keep key files at mode `0600`, owned by `root:root` or `shell:shell` for the
matching account.

## Uninstall

Uninstalling deletes `/data/adb/ssh` and `/data/ssh`, including keys, passwords,
configuration, and home directories. To preserve `/data/ssh`, create this file
before uninstalling:

```sh
touch /data/ssh/KEEP_ON_UNINSTALL
```

## Build from source

Use GNU/Linux amd64 with GNU Make, Wget, Python 3, 7-Zip or Zip, and Android
NDK r25c.

```sh
git clone https://github.com/chisewaguri/ksu-ssh.git
cd ksu-ssh
mkdir build
cd build
make -f ../all_arches.mk -j"$(nproc)" zip
```

The ZIP lands in `build`. Set `ANDROID_ROOT=/path/to/android-ndk` on the make
command to use another NDK location.

## Maintenance

OpenSSL and Rsync versions are set in their makefiles. After changing one,
regenerate its checksum:

```sh
make -f all_arches.mk update_openssl_with_tofu
make -f all_arches.mk update_rsync_with_tofu
```

For OpenSSH, port the patch to the new release and regenerate it from the
original and patched source trees. Build all architectures before publishing.

For a release, update `version` and `versionCode` in `module_data/module.prop`,
the versions below, and [CHANGELOG.md](CHANGELOG.md). Build from clean `build`
and `src` directories.

See [docs/WEBUI.md](docs/WEBUI.md) for the controller protocol and tests.

## Included software

- [OpenSSH 10.5p1](https://www.openssh.com/)
- [OpenSSL 3.6.4](https://www.openssl.org/)
- [Rsync 3.5.0](https://rsync.samba.org/)
- [Magisk Module Installer](https://github.com/topjohnwu/magisk-module-installer),
  used only for the installer format

## License

KernelSU SSH uses [GPLv3](LICENSE). Bundled software keeps its own license.
The vendored KernelSU JavaScript bridge is Apache-2.0.
