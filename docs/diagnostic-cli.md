# Diagnostic CLI

`studioctl` is an experimental read-only diagnostic command for Android arm64. Results require validation on each device and provider combination.

## Commands

Run `studioctl hello` to check that the executable starts and reports protocol version 1. Run `studioctl status` as root to query the device interface. Run `studioctl preview` with an archive on standard input to classify its envelope without writing it. Commands emit one JSON object on standard output. Other arguments are rejected.

The device archive commands are:

| Command | Effect |
| --- | --- |
| `studioctl stage` | Captures the current archive baseline and creates one empty, `0600`, token-named input below the private staging directory. It returns the token, upload path, baseline text, and revision. |
| `studioctl save <token>` | Validates and consumes the staged bytes, checks the baseline under the write lock, then atomically stores the archive and receipt. The token is a fixed 32-character lowercase hexadecimal value. |
| `studioctl restore <token>` | Checks the staged candidate and baseline, durably preserves the current archive in a new private backup, then replaces the archive and receipt. |
| `studioctl read` | Validates and returns the saved archive text, SHA-256 revision, and matching receipt when available. |
| `studioctl backups` | Lists up to 32 newest trusted automatic backups, with ID, modification time, byte count, revision, and validation state. |
| `studioctl backup <id>` | Reads and validates one private backup. The identifier is exactly 32 lowercase hexadecimal characters; the command does not accept paths. |

The host adapter constructs `stage` and `read` as fixed commands. For `save`, it accepts only a token returned by that adapter's own successful `stage` call and embeds only the validated hexadecimal token. Selected file names, JSON, and form values are never incorporated into a root shell command.

Version 1 responses contain `protocol`, `requestId`, `ok`, and `data`. The command name is the response's `requestId`. `hello` returns `"studioctl"` as its data. A `status` response uses `data.kind` for the diagnostic result, including when the query itself fails. Rust serialization and WebUI status parsing share the [version 1 fixtures](../contracts/diagnostic-v1.json).

The status result distinguishes a complete recognized response (`active`), an absent response (`missing`), a malformed or unrecognized response (`unknownProtocol`), and an indeterminate or unauthorized query (`failed`). An active response includes the version, implementation, kernel type, and capability indications. Capability indications report interface features, not verified effects or permission to change device state.

The implementation is reported as LKM only when both the variant and feature marker agree. Conflicting evidence leaves the implementation unknown. An implementation badge must not be inferred from the kernel type alone.

On Android, `status` can include `data.device` with the model, Android release and API level, and kernel release. Each field is optional. The WebUI shows the available fields independently of the provider state.

After a matching protocol-1 response has been received, invalid provider data is reported as a diagnostic failure. Validated device facts remain visible, but no activation state or provider badge is inferred from the malformed provider data. Device fields from a mismatched request or unsupported protocol are not used.

Archive operations belong only to Studio. They do not call SUSFS write operations, alter the provider, or manage startup tasks. The executable does not open a network listener.

## WebUI host contract

A host may inject `window.studioDiagnostics` before the WebUI starts. Its argument-free `hello()` and `status()` methods return a JSON string or a promise resolving to one. Expose the bridge only to the bundled WebUI and bind each method to its fixed diagnostic command. The host owns execution and should resolve only after the command succeeds. The WebUI checks the handshake before reading status and applies a shared five-second deadline to asynchronous calls. The host should execute commands off the WebView UI thread and impose its own execution deadline.

In a standalone browser with no host interface, the WebUI uses demo data. A host exposing the compatible `ksu.exec` callback API is used for fixed commands. Archive save is enabled only when the same host exposes the verified `ksu.io()` version-1 file stream API. Export still requires only the fixed `read` command and the host's download path. An unsupported or malformed host interface reports a connection failure. Host-side navigation and bridge security vary; see [host integration](host-integration.md) for the boundary and validation status.

## Test the WebUI in Android WebView

The smoke APK bundles the built WebUI, the shared protocol fixtures, and the debug CLI. It serves bundled assets under a local HTTPS origin, blocks page-initiated navigation outside the loaded document, and disables file and content access. The fixture scenarios return canned responses through the same bridge interface used by the native and capture scenarios.

Build the WebUI first. Run `bash scripts/build-webview-smoke.sh` with JDK 17 or later, Android SDK Platform 36, Build Tools 36.0.0, the Android arm64 Rust build prerequisites below, and a standard Android debug keystore. The script builds and bundles the debug CLI and prints the APK path under `.local/`. Set `STUDIO_DEBUG_KEYSTORE` to use a debug keystore at a different path.

Launch the installed smoke activity with ADB. Omit the `scenario` extra for the active fixture. Use `failed`, `mismatch`, or `demo` to check the diagnostic failure, unsupported protocol, or absent bridge respectively.

```bash
adb shell am start -S -W -n dev.susfs.studio.smoke/.SmokeActivity --es scenario mismatch
```

Run `bash scripts/test-webview-smoke.sh` with an unlocked arm64 ADB device, Python 3, and the same build prerequisites. Set `ANDROID_SERIAL` when more than one device is connected. The script rebuilds the WebUI and checks the Chinese UI labels for active status, demo mode, protocol mismatch, query failure, and a host marker without a diagnostic bridge. It also checks that the smoke host rejects page-initiated top-level navigation to another HTTPS origin and to an unknown path on the local origin. It refuses to replace an installed smoke app and removes its temporary app and UI dump on exit.

The `native` scenario runs the bundled CLI under the smoke application's ordinary Android UID. The bridge invokes the fixed `hello` and `status` subcommands with a two-second process timeout and a 4 KiB response limit. The regression checks that both commands complete and that the WebUI displays the expected diagnostic failure from the unprivileged status query. This scenario covers process execution and the WebView response path. Successful device status and archive storage require a privileged host integration.

Pass a captured `studioctl status` response as the only argument to the smoke script to check a successful device response in WebView. Use an active protocol-1 response of at most 4 KiB and keep the capture and APK in `.local/`. The APK displays a capture notice. The regression checks the displayed version and any reported implementation badge, then confirms that the refresh button replays the same capture. Live reads still require the dedicated host bridge.

## Build and verify

From the repository root, with an Android NDK, the Rust Android target, and `cargo-ndk` installed:

```bash
cargo test --manifest-path native/Cargo.toml --locked
cargo test --manifest-path native/Cargo.toml --locked -- --ignored --test-threads=1
cargo clippy --manifest-path native/Cargo.toml --locked --all-targets -- -D warnings
(cd native && cargo ndk -t arm64-v8a -P 26 build --locked)
```

The debug executable is written to `native/target/aarch64-linux-android/debug/studioctl`. Validate the host transport and device ABI separately before distributing it.

The separate serial tests run writers in child processes against ordinary-permission temporary directories. They check a stale staged baseline and process exits after archive write, file sync, and rename. They do not simulate power loss, storage hardware failure, or every transaction boundary.

The two-writer race starts independent processes with distinct candidates staged against the same baseline. A test-only synchronization point holds the first process inside the write lock until the second has returned busy; the first then succeeds and retrying the second stage reports conflict. The final archive and receipt match the winner. An earlier version without this synchronization passed under UID 2000 in an isolated Android directory; the synchronized version requires a fresh device run. A separate Playwright regression checks two independent pages with a shared test bridge, including draft retention and the required review after refresh. Neither check proves simultaneous concurrency in the installed manager's WebUI.

The restore fault matrix injects a storage error or sends `SIGKILL` at eleven boundaries from stage validation through receipt rename. It checks archive bytes and digest, receipt association, listed backup bytes and revision, and stage consumption, then verifies that a subsequent save still works. The earlier ten-boundary matrix passed on Linux and isolated Android arm64; the new validation boundary requires a fresh device run. Observations after process exit reflect the running filesystem; a visible rename is not proof of persistence across power loss.

The staging test injects a storage error or ends the child after creating the empty input and after writing its baseline. A returned error cleans up the failed stage; a killed process can leave unreturned staging files. Neither case changes the current archive or receipt, and another stage can be prepared without reusing those files. This test also passed on Linux and isolated Android arm64 storage.

On 2026-11-20, the arm64 debug test executable ran these serial tests and `restore_preserves_current_archive_before_replacement` as the shell UID with `TMPDIR=/data/local/tmp` on the PKX110 device described in [host integration](host-integration.md). The test directories and executable were removed. This does not exercise the installed manager or its privileged store.

## Package the development artifacts

Build the WebUI and the Android executable first. Run the packager from the repository root with Python 3.9 or later.

```bash
pnpm --dir web exec vite build --mode development
python3 scripts/package.py \
  --web web/dist \
  --cli native/target/aarch64-linux-android/debug/studioctl \
  --output .local/susfs-studio-dev-arm64.zip
```

The ZIP contains module metadata, an install script, `webroot/`, and `bin/studioctl`. The install script accepts arm64 and applies executable permissions to the CLI. The packager validates the executable's ELF architecture and Android interpreter, checks the relative WebUI entry assets, and prints the archive's SHA-256 digest. Use a new output path for each build. See [host integration](host-integration.md) for the tested host and remaining security limitations.
