# Diagnostic CLI

`studioctl` is an experimental read-only diagnostic command for Android arm64. It is not yet connected to the WebUI or packaged for an Android host. Results require validation on each device and provider combination.

## Commands

Run `studioctl hello` to check that the executable starts and reports protocol version 1. Run `studioctl status` as root to query the device interface. Both commands emit one JSON object on standard output. Other arguments are rejected.

The status result distinguishes a complete recognized response (`active`), an absent response (`missing`), a malformed or unrecognized response (`unknownProtocol`), and an indeterminate or unauthorized query (`failed`). An active response includes the version, implementation, kernel type, and capability indications. Capability indications report interface features, not verified effects or permission to change device state.

The executable makes no configuration changes. It does not open a network listener, apply rules, or manage startup tasks. The WebUI still uses simulated data.

## Build and verify

From the repository root, with an Android NDK, the Rust Android target, and `cargo-ndk` installed:

```bash
cargo test --manifest-path native/Cargo.toml --locked
cargo clippy --manifest-path native/Cargo.toml --locked --all-targets -- -D warnings
cargo ndk --manifest-path native/Cargo.toml -t arm64-v8a -P 26 build --locked
```

The debug executable is written to `native/target/aarch64-linux-android/debug/studioctl`. Validate the host transport and device ABI separately before distributing it.
