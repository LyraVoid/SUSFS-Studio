![SUSFS Studio illustrated banner](assets/susfs-studio-banner.png)

# SUSFS Studio

Developed by **LyraVoid and matsuzaka-yuki**.

English · [简体中文](README.zh-CN.md)

SUSFS Studio is an independent WebUI for Android devices with SUSFS. It shows device capabilities, manages configuration archives, and lets you review supported operations and their results without modifying the host manager.

[Download v1.0.0](https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v1.0.0) · [User guide](docs/user-guide.md) · [Compatibility](docs/host-integration.md#compatibility-evidence-matrix)

## Features

- **Diagnostics** — inspect the interface response, implementation, device information, and reported capabilities.
- **Rules and settings** — organize paths, maps, kstat, redirects, and supported settings in a versioned Studio archive. Review a provider-qualified plan before applying eligible operations.
- **Archives and recovery** — preview differences, save, export, and restore Studio's private configuration. Revision checks and receipts help identify conflicts and uncertain results.
- **Operation reports** — review per-item results and independently checked effects. An accepted request is not automatically proof that an effect was observed.
- **Offline WebUI** — resources are bundled with the module. A standalone browser preview uses clearly marked simulated data.

## Requirements and installation

- An Android arm64 device with SUSFS already available in the kernel or through a loaded module. Studio does not install SUSFS itself.
- A compatible root manager capable of opening module WebUI. Diagnostic commands and archive file transfer depend on the host interfaces available on that device.
- Download the module ZIP from the [v1.0.0 release](https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v1.0.0), install it through the manager, and follow the manager's instructions to activate it. Open **SUSFS Studio** from the module list.

Back up existing configuration and confirm that the module can be disabled before testing device operations. Availability depends on the provider, version, capability, and boot stage; unavailable operations remain gated. Saving an archive is separate from applying a plan, and restoring an archive does not itself restore kernel runtime state.

Release ZIPs and `SHA256SUMS` are signed with Sigstore keyless signing. See [release signatures](docs/releases.md#release-signatures) for verification commands.

### Optional SUSFS providers

If your kernel already includes SUSFS, use that implementation rather than loading another copy. Otherwise, choose a provider compatible with your device:

**LKM**

1. Download the `.ko` matching your device's kernel/KMI from the [LKM releases](https://github.com/inforcqb/susfs4ksu-for-lkm/releases). FinaSU users can load it using the kernel module loader on the Modules page.
2. Other KernelSU-family users can use the packaged loader module where supported, or load the matching `.ko` with `ksud insmod`. For devices outside the KernelSU family, the upstream release also provides the `susfs_insmod` loader; follow its release instructions for the matching `.ko`. The upstream packaged ZIP is arm64 and KernelSU-family only, not a universal Magisk package. Loader availability does not by itself establish Studio WebUI compatibility with a manager.

**Built-In (GKI / NON-GKI)**

The original [SUSFS patch source and releases](https://gitlab.com/simonpunk/susfs4ksu/) can be integrated into a compatible kernel source and built as part of the kernel. Studio reports a responding implementation as **Built-In** when its implementation type is confirmed. Kernel integration, installation, and recovery depend on the device and kernel; NON-GKI combinations have not been verified by Studio.

Match the full kernel/KMI and provider build, check the provider's compatibility instructions, and avoid loading an LKM on top of an existing SUSFS implementation. A matching filename alone does not guarantee compatibility. Confirm a recovery path before changing kernel components.

## Compatibility and security

Studio implements the SUSFS 2.3 and 2.4 protocol surfaces: regular and looping paths, Map, dynamic/full-clone/static kstat, redirects, hide-mount/logging/AVC tri-state settings, uname, cmdline/bootconfig, hidden LKM modules, mount prefixes, and Priority UID filtering. Each operation is still gated by the Provider's reported capability, implementation type, proc extensions, and boot stage.

Device testing has covered specific **GKI-LKM SUSFS 2.3.0** and **GKI Built-In SUSFS 2.4.0** combinations. Other Provider builds use the same protocol layers but remain unaudited until tested; unsupported features and stages are blocked rather than assumed. See the [compatibility evidence matrix](docs/host-integration.md#compatibility-evidence-matrix) for exact environments, tested operations, and gaps.

Some host WebUI bridges expose general-purpose privileged command and file interfaces. Studio restricts its own calls, but cannot guarantee the host's navigation or origin isolation. Review the [security model](docs/security-model.md) and [host integration notes](docs/host-integration.md) before use.

## Tech stack

**WebUI** — React 19 and strict TypeScript, built with Vite 7 and pnpm 12. Mantine 8 supplies accessible controls while CSS Modules and project tokens control the final appearance. Material Color Utilities generates the HCT-based light and dark palettes. `lossless-json` preserves numeric tokens exactly. Routing is hash-based, and all runtime assets are bundled for offline use. The interface ships in Simplified Chinese and English. Biome, TypeScript, Vitest, Playwright, and axe form the check suite.

**Userspace and native layer** — a single Rust 2024 `studioctl` binary cross-compiled with `cargo-ndk` for Android arm64 (API 26+). It uses `serde`/`serde_json` with arbitrary-precision numbers, `sha2` for archive revisions, `memmap2`, and `android-bootimg` for boot-image handling. The executable implements the protocol-1 diagnostic query and the protocol-2 plan, write-ahead journal, operation, effect, and recovery commands. Module scripts (`customize.sh`, `post-fs-data.sh`, `service.sh`) only prepare the module, run Studio-owned boot stages, and keep configuration under the private `/data/adb/susfs-studio/` store. No daemon or network listener runs in the background.

## Development

To run the browser preview with Node.js 22.12 or later and pnpm 12.21.0:

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev --host 127.0.0.1 --port 5176 --strictPort
```

Open [the local preview](http://127.0.0.1:5176/#/). It uses simulated data and does not connect to the device.

## Documentation

- [User guide](docs/user-guide.md) — diagnostics, rules, archives, and preferences.
- [Archive format](docs/archive-format.md) — schema, validation, private storage, receipts, and export.
- [Host integration](docs/host-integration.md) — tested host combinations and bridge boundaries.
- [Rule operation boundary](docs/rule-operation-boundary.md) — eligibility, ABI evidence, and effect verification.
- [Diagnostic CLI](docs/diagnostic-cli.md) — native commands and builds.
- [WebUI maintenance](docs/webui-maintenance.md) — routes, source ownership, and validation.
- [Module releases](docs/releases.md) — build and release procedures.
- [Distribution notes](docs/distribution.md) — shipped files, corresponding source, and redistribution terms.
- [Design specification](DESIGN.md) — visual tokens and layout requirements.

## Licence

SUSFS Studio is released under the **GNU Affero General Public License, version 3
only** (`AGPL-3.0-only`). See [LICENSE](LICENSE). Third-party components and their
licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The module ZIP includes `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the applicable
licence texts. [Distribution notes](docs/distribution.md) explain what is shipped,
where to obtain the corresponding source for a release, and the rules for
redistributing modified builds.

## Acknowledgements

- [Shirone](https://github.com/LyraVoid/Shirone) — reference for frontend engineering structure and parts of the Material 3 Expressive component design.
- [susfs4ksu-module](https://github.com/sidex15/susfs4ksu-module) — reference for the independent SUSFS management module approach. Studio does not bundle or call its userspace tools.
