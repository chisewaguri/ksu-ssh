# WebUI architecture and controller protocol

The KSU SSH WebUI runs inside the current KernelSU and APatch module WebView.
It uses plain HTML, CSS, and JavaScript. The module does not ship a web server,
JavaScript framework, package manager, or build step.

## Components

| Component | Installed location | Responsibility |
| --- | --- | --- |
| WebUI | Module `webroot` directory | Renders service state, keys, settings, and configuration |
| KernelSU bridge | `webroot/vendor/kernelsu.js` | Provides the root `spawn()` API through the vendored `kernelsu-alt` 3.1.2 implementation |
| Controller | `/data/adb/ssh/bin/ksu-ssh-webui` | Validates requests and changes root-owned files |
| Private terminal launcher | `/data/adb/ssh/usr/libexec/ssh-core/sshd-private-devpts` | Starts SSH with a private `devpts` instance |

APatch exposes a KernelSU-compatible WebUI bridge. The WebUI supports current
KernelSU and APatch releases and does not include an old-manager fallback.

## Security boundary

The browser can start only `/data/adb/ssh/bin/ksu-ssh-webui`. It passes a fixed
command and an argument array through `spawn()`. The frontend does not build a
shell command string and cannot request arbitrary command execution.

The controller accepts these commands:

```text
state
service start|stop|restart
keys list|add|delete root|shell
settings get
settings set autostart|port|password-auth|root-login value
config get|save
```

The controller rejects unknown commands, actions, users, settings, values, and
extra arguments. Key and configuration payloads use base64 arguments. Records
that contain user-controlled text return that text as base64.

The WebUI never receives plaintext account passwords. Users create passwords
from a root terminal with `passwd root` or `passwd shell`.

## Controller responses

Responses use tab-separated records.

### `state`

```text
state\trunning|stopped
port\tPORT
```

The controller reads the configured `PidFile`, which defaults to
`/data/ssh/sshd.pid`, and confirms that the process still exists with `kill -0`.
It does not call `opensshd.init status`; the upstream init script has no status
action.

### `keys list USER`

Each key produces one record:

```text
key\tBASE64_PUBLIC_KEY\tBASE64_SSH_KEYGEN_OUTPUT
```

### `settings get`

```text
autostart\t0|1
port\t1-65535
password-auth\t0|1
root-login\tdisabled|keys|password
```

### `config get`

```text
config\tBASE64_SSHD_CONFIG
```

Mutation commands produce no output when they succeed. They write a short
error to standard error and return a nonzero status when they fail.

## Setting mappings

The UI groups login settings by account, but OpenSSH uses one global password
setting plus a root policy.

| WebUI setting | Controller value | `sshd_config` result |
| --- | --- | --- |
| Shell password login off | `password-auth 0` | `PasswordAuthentication no` |
| Shell password login on | `password-auth 1` | `PasswordAuthentication yes` |
| Root key login off | `root-login disabled` | `PermitRootLogin no` |
| Root key login on | `root-login keys` | `PermitRootLogin prohibit-password` |
| Root password login on | `root-login password` | `PermitRootLogin yes` |

Root password login requires global password authentication. The UI keeps the
root password row visible but disables it until shell password login and root
key login are both enabled.

Setting changes do not restart SSH. The new values apply the next time SSH
starts.

Configuration writes take a lock so concurrent controller commands cannot
discard each other's settings. The WebUI also queues setting changes. When the
Advanced editor has no unsaved edits, reopening it loads the current file.
Before saving a draft, the WebUI checks that the file has not changed since it
was loaded and asks the user to reload if it has.

## File updates

The controller updates `authorized_keys` through a temporary file and an atomic
rename. It restores these owners and modes after every write:

| File | Owner | Mode |
| --- | --- | --- |
| `/data/ssh/root/.ssh/authorized_keys` | `root:root` | `0600` |
| `/data/ssh/shell/.ssh/authorized_keys` | `shell:shell` | `0600` |

The controller validates each new key with `ssh-keygen -lf`. It accepts one
public key per request and rejects an existing key even when the comment is
different. Deletion matches the complete authorized-key line.

Before saving a raw configuration, the controller:

1. Decodes the candidate into a temporary file beside `sshd_config`.
2. Runs `sshd -t -f CANDIDATE`.
3. Leaves the live file unchanged when validation fails.
4. Replaces `/data/ssh/sshd_config.bak` with the previous live file.
5. Atomically renames the valid candidate to `/data/ssh/sshd_config`.

## Service control

The WebUI starts SSH with:

```text
sshd-private-devpts opensshd.init start
```

For a restart, the controller stops the existing service through
`opensshd.init`, then starts it through `sshd-private-devpts`. Do not replace
this sequence with the init script's restart action. Starting through the init
script alone exposes SSH terminals through the device's shared `devpts` mount.

## Tests

Run the controller integration test and static WebUI checks from the repository
root:

```sh
sh tests/test-webui-controller.sh
sh tests/test-webui-static.sh
sh tests/test-passwd.sh
sh tests/test-password-crypt.sh
sh tests/test-uninstall-links.sh
node tests/test-webui-bridge.mjs
node tests/test-webui-app.mjs stale
node tests/test-webui-app.mjs concurrent
```

The integration test uses temporary SSH data and stubbed service commands. It
covers key validation, duplicates, exact deletion, file modes, setting maps,
configuration validation, backups, atomic replacement, and private `devpts`
restart behavior.

The static test checks the required files, local bridge import, fixed controller
path, accessible labels, system theme support, reduced-motion support, and the
absence of remote assets or `exec()` calls.

The bridge test simulates the native `ksu.spawn` callback, including a string
exit code, and checks asynchronous failure when the WebUI bridge is absent.
