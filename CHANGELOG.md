# Changelog

All notable changes to SUSFS Studio are documented here. The project follows
semantic versioning for released module versions.

## [1.0.0] - 2026-11-20

First stable release.

### Added

- Independent SUSFS management WebUI for KernelSU-family hosts. Studio does not
  call FinaSU's `ksud susfs` controller or the `ksu_susfs` binary, and does not
  modify the host manager.
- Provider detection over the fixed protocol-1 query, with separate results for
  implementation, kernel type, reported features, protocol audit, runtime proc
  extensions, and execution identity. Unaudited providers remain operable but are
  labelled as unaudited.
- Versioned Studio archive (schema 1 and 2) covering paths (regular and looping),
  maps, dynamic/full-clone/static kstat, redirects, hide-mount/logging/AVC
  tri-state settings, uname, cmdline/bootconfig, hidden LKM modules, mount
  prefixes, Priority UID filtering, and automatic application preference.
- Provider-qualified operation plans: preview, explicit confirmation, write-ahead
  journal, per-item results, independent effect verification, retry of known
  failures, and recovery after unknown results.
- Studio-owned boot stages (`pre-mount`, `late-pre-mount`, `post-mount`,
  `late-load`) with pending-reboot handling for operations that cannot complete
  in the current boot.
- Private archive storage under `/data/adb/susfs-studio`: atomic save,
  revision-bound receipts, restore with a pre-restore backup, automatic backup
  listing, export, non-blocking write locking, and interruption handling.
- WebUI with Home, Rules (Overview, Basic settings, Path hiding, File disguise,
  Redirect, Extensions), and Settings. Material 3 Expressive colour profiles,
  light and dark palettes, Simplified Chinese and English, hash routing, and
  bundled offline assets.
- Security controls: strict archive validation, exact numeric preservation,
  duplicate-key rejection, trusted private-directory checks, no shell
  interpolation of user values, restricted page connections and frames, and
  fail-closed behaviour for unknown identity or stage.
- Release packaging with module metadata, native executable, WebUI assets,
  licenses, `update.json`, `SHA256SUMS`, and Sigstore keyless signatures for the
  module ZIP and checksum file.
- Project licensing under AGPL-3.0-only, with third-party notices and full licence
  texts in the module ZIP.

### Compatibility

Verified device combinations:

- GKI-LKM SUSFS 2.3.0 on Android 17 / API 37, kernel 6.6.118, host
  `v3.3.1-50-g64833c00` — diagnostics, archive round trip, unified plans,
  partial and unknown recovery, effects, boot stages, and cleanup.
- Built-In GKI SUSFS 2.4.0 on host `v1.6.5` — runtime detection, rules and
  settings, two restart lifecycles, pending-reboot boundaries, effects, restore,
  and cleanup.
- Archive save, restore, and export through a second host version `v1.6.4`
  (33211).

See the [host integration matrix](docs/host-integration.md#compatibility-evidence-matrix)
for exact environments and operation-level evidence.

### Known limitations

- Built-In SUSFS 2.3, LKM SUSFS 2.4, NON-GKI kernels, other architectures, and
  untested host versions remain unverified. Protocol gates still apply.
- Enabled AVC spoof-event effects and some Map effect evidence are narrower than
  the other tested rules.
- Host WebView bridges remain general-purpose privileged interfaces. Studio
  restricts its own calls but cannot guarantee host-level navigation or origin
  isolation.
- Interruption handling is covered by process-level fault injection and device
  tests; hardware power-loss durability was not tested.
- Archive restore restores Studio configuration only. It does not change kernel
  runtime state.
- A signed release proves which workflow produced an asset. It does not by itself
  prove compatibility with a particular device or provider build.
