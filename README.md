# KSU SSH

KSU SSH runs OpenSSH and Rsync on Android devices with KernelSU or APatch. It
does not mount files into the system partition. Runtime files live under
`/data/adb/ssh`, and SSH terminals use a private `devpts` instance.

This project is based on
[MagiskSSH](https://gitlab.com/d4rcm4rc/MagiskSSH) by D4rCM4rC and its
contributors.

## Features

- Supports KernelSU and APatch. Magisk is not supported.
- Runs on arm, arm64, x86, and x86_64 devices with Android 7.0 or newer.
- Includes OpenSSH, OpenSSL, and Rsync.
- Supports authorized keys and password authentication for `root` and `shell`.
- Starts SSH sessions with a private `devpts` instance.
- Starts SSH in the primary mount namespace, so sessions can reach internal
  storage at `/sdcard` and `/storage/emulated/0`.
- Includes a WebUI for service control, keys, settings, and raw configuration.

## Install the module

1. Download the ZIP artifact from a successful
   [Build ksu-ssh workflow](https://github.com/chisewaguri/ksu-ssh/actions/workflows/build.yml),
   or [build the module from source](#build-from-source).
2. Open KernelSU or APatch.
3. Install the ZIP as a module.
4. Restart the device.

The module starts SSH after boot unless you disable **Start on boot** in the
WebUI.

## Manage SSH in the WebUI

Open KSU SSH from the module list in KernelSU or APatch. The WebUI has three
pages.

### Home

Use **Home** to start, stop, or restart the SSH service. Starting and restarting
SSH always use the private `devpts` launcher.

The **Service settings** group contains:

- **Start on boot**: Starts SSH after the device boots.
- **Port**: Sets the listening port from `1` through `65535`.

The **Login methods** group separates access by account:

- **Shell → Password login**: Lets `shell` sign in with its password.
- **Root → Key login**: Lets `root` sign in with an authorized key.
- **Root → Password login**: Also lets `root` sign in with its password. This
  option requires both shell password login and root key login.

Setting changes do not restart SSH. They apply the next time SSH starts.

The default login settings are:

| Account | Authorized key | Password |
| --- | --- | --- |
| `shell` | Yes | Yes |
| `root` | Yes | No |

### Keys

Use **Keys** to manage the `root` and `shell` authorized-key files. The WebUI
accepts one valid OpenSSH public key at a time, rejects duplicates, and shows
the key type, fingerprint, and comment.

The WebUI stores keys in:

- `/data/ssh/root/.ssh/authorized_keys`
- `/data/ssh/shell/.ssh/authorized_keys`

It writes each file atomically and restores the correct owner and `0600` mode.

### Advanced

Use **Advanced** to edit `/data/ssh/sshd_config`. Before replacing the live
file, the WebUI validates the candidate with `sshd -t` and saves the previous
configuration as `/data/ssh/sshd_config.bak`.

An invalid configuration does not replace the live file.

## Set account passwords

The WebUI does not handle plaintext passwords. Set passwords from a root shell
on the device:

```sh
passwd shell
```

To set the root password, run:

```sh
passwd root
```

Passwords use SHA-512-crypt or MD5-crypt hashes in `/data/ssh/etc/shadow`.
Updating the module preserves this file. A clean installation does not have an
account password, so run `passwd` after installing it.

## Connect to the device

Connect as the unprivileged `shell` account:

```sh
ssh shell@DEVICE_IP
```

Connect as `root` when root login is enabled:

```sh
ssh root@DEVICE_IP
```

The SSH client asks for a password when no accepted key is available. SFTP,
SCP, and Rsync use the same SSH server and credentials.

## Manage files manually

The WebUI is optional. You can edit the following files from a root shell:

| Path | Purpose |
| --- | --- |
| `/data/ssh/sshd_config` | OpenSSH server configuration |
| `/data/ssh/root/.ssh/authorized_keys` | Root authorized keys |
| `/data/ssh/shell/.ssh/authorized_keys` | Shell authorized keys |
| `/data/ssh/etc/shadow` | Password hashes |
| `/data/ssh/no-autostart` | Disables automatic startup when present |

Keep each `authorized_keys` file at mode `0600`. The root file must use
`root:root`; the shell file must use `shell:shell`.

## Uninstall the module

Uninstall KSU SSH from KernelSU or APatch. The uninstaller removes
`/data/adb/ssh` and `/data/ssh`, including host keys, passwords, configuration,
and account home directories.

To preserve `/data/ssh`, create this file before uninstalling:

```sh
touch /data/ssh/KEEP_ON_UNINSTALL
```

## Build from source

Install GNU Make, Wget, Python 3, 7-Zip or Zip, and Android NDK r25c on a recent
GNU/Linux amd64 system. Then run:

```sh
git clone https://github.com/chisewaguri/ksu-ssh.git
cd ksu-ssh
mkdir build
cd build
make -f ../all_arches.mk -j"$(nproc)" zip
```

The build writes the module ZIP to the `build` directory. To use another NDK
location, pass `ANDROID_ROOT`:

```sh
make -f ../all_arches.mk -j"$(nproc)" zip ANDROID_ROOT=/path/to/android-ndk
```

## Update bundled software

OpenSSL and Rsync updates use the version in their package makefile. After
changing a version, regenerate its checksum with the matching target:

```sh
make -f all_arches.mk update_openssl_with_tofu
make -f all_arches.mk update_rsync_with_tofu
```

OpenSSH updates also require a patch for the new release. Apply the previous
patch to two unpacked source trees, fix rejected hunks, and generate the new
patch from the resulting diff. Build every architecture before publishing the
update.

For every release:

1. Update `version` and `versionCode` in `module_data/module.prop`.
2. Update bundled software versions in this README.
3. Add the release notes to [CHANGELOG.md](CHANGELOG.md).
4. Build the module from a clean `build` and `src` directory.

## Developer documentation

See [WebUI architecture and controller protocol](docs/WEBUI.md) before changing
the WebUI, its root controller, or SSH setting mappings.

## Included software

- [OpenSSL 3.6.4](https://www.openssl.org/)
- [OpenSSH 10.5p1](https://www.openssh.com/)
- [Rsync 3.5.0](https://rsync.samba.org/)
- [Magisk Module Installer](https://github.com/topjohnwu/magisk-module-installer),
  used only as the installer format

## License

KSU SSH is licensed under [GPLv3](LICENSE). Bundled software keeps its own
license. The vendored KernelSU JavaScript bridge is licensed under Apache-2.0.

See [CHANGELOG.md](CHANGELOG.md) for release notes.
