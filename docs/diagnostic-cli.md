# Diagnostic CLI

`studioctl` is an experimental read-only diagnostic command for Android arm64. Results require validation on each device and provider combination.

## Commands

Run `studioctl hello` to check that the executable starts and reports protocol version 1. Run `studioctl status` as root to query the device interface. Both commands emit one JSON object on standard output. Other arguments are rejected.

Version 1 responses contain `protocol`, `requestId`, `ok`, and `data`. The command name is the response's `requestId`. `hello` returns `"studioctl"` as its data. A `status` response uses `data.kind` for the diagnostic result, including when the query itself fails. Rust serialization and WebUI status parsing share the [version 1 fixtures](../contracts/diagnostic-v1.json).

The status result distinguishes a complete recognized response (`active`), an absent response (`missing`), a malformed or unrecognized response (`unknownProtocol`), and an indeterminate or unauthorized query (`failed`). An active response includes the version, implementation, kernel type, and capability indications. Capability indications report interface features, not verified effects or permission to change device state.

The executable makes no configuration changes. It does not open a network listener, apply rules, or manage startup tasks.

## WebUI host contract

A host may inject `window.studioDiagnostics` before the WebUI starts. Its argument-free `hello()` and `status()` methods return a JSON string or a promise resolving to one. Expose the bridge only to the bundled WebUI and bind each method to its fixed diagnostic command. The host owns execution and should resolve only after the command succeeds. The WebUI checks the handshake before reading status and applies a shared five-second deadline to asynchronous calls. The host should execute commands off the WebView UI thread and impose its own execution deadline.

When the bridge is absent, the browser uses demo data. When it is present, errors are shown as host diagnostic failures. This repository provides the WebUI adapter. Android bridge injection and packaging require a host implementation.

## Build and verify

From the repository root, with an Android NDK, the Rust Android target, and `cargo-ndk` installed:

```bash
cargo test --manifest-path native/Cargo.toml --locked
cargo clippy --manifest-path native/Cargo.toml --locked --all-targets -- -D warnings
(cd native && cargo ndk -t arm64-v8a -P 26 build --locked)
```

The debug executable is written to `native/target/aarch64-linux-android/debug/studioctl`. Validate the host transport and device ABI separately before distributing it.

## Package the development artifacts

Build the WebUI and the Android executable first. Run the packager from the repository root with Python 3.9 or later.

```bash
pnpm --dir web exec vite build --mode development
python3 scripts/package.py \
  --web web/dist \
  --cli native/target/aarch64-linux-android/debug/studioctl \
  --output .local/susfs-studio-dev-arm64.zip
```

The ZIP contains module metadata, `webroot/`, and `bin/studioctl`. The packager validates the executable's ELF architecture and Android interpreter, checks the relative WebUI entry assets, and prints the archive's SHA-256 digest. Use a new output path for each build. Android host bridge injection and module installation still require integration testing.
