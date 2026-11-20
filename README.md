![SUSFS Studio illustrated banner](assets/susfs-studio-banner.png)

# SUSFS Studio

English · [简体中文](README.zh-CN.md)

SUSFS Studio is an independent WebUI for Android devices with SUSFS. It shows device capabilities, manages configuration archives, and lets you review supported operations and their results without modifying the host manager.

[Download Beta v0.1.0-beta.1](https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v0.1.0-beta.1) · [User guide](docs/user-guide.md) · [Compatibility](docs/host-integration.md#compatibility-evidence-matrix)

## Features

- **Diagnostics** — inspect the interface response, implementation, device information, and reported capabilities.
- **Rules and settings** — organize paths, maps, kstat, redirects, and supported settings in a versioned Studio archive. Review a provider-qualified plan before applying eligible operations.
- **Archives and recovery** — preview differences, save, export, and restore Studio's private configuration. Revision checks and receipts help identify conflicts and uncertain results.
- **Operation reports** — review per-item results and independently checked effects. An accepted request is not automatically proof that an effect was observed.
- **Offline WebUI** — resources are bundled with the module. A standalone browser preview uses clearly marked simulated data.

## Requirements and installation

- An Android arm64 device with SUSFS already available in the kernel or through a loaded module. Studio does not install SUSFS itself.
- A compatible root manager capable of opening module WebUI. Diagnostic commands and archive file transfer depend on the host interfaces available on that device.
- Download the module ZIP from the [Beta release](https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v0.1.0-beta.1), install it through the manager, and follow the manager's instructions to activate it. Open **SUSFS Studio** from the module list.

Back up existing configuration and confirm that the module can be disabled before testing device operations. Availability depends on the provider, version, capability, and boot stage; unavailable operations remain gated. Saving an archive is separate from applying a plan, and restoring an archive does not itself restore kernel runtime state.

### Optional SUSFS providers

If your kernel already includes SUSFS, use that implementation rather than loading another copy. Otherwise, choose a provider compatible with your device:

**LKM**

1. Download the `.ko` matching your device's kernel/KMI from the [LKM releases](https://github.com/inforcqb/susfs4ksu-for-lkm/releases). FinaSU users can load it using the kernel module loader on the Modules page.
2. Other KernelSU-family users can use the packaged loader module where supported, or load the matching `.ko` with `ksud insmod`. For devices outside the KernelSU family, the upstream release also provides the `susfs_insmod` loader; follow its release instructions for the matching `.ko`. The upstream packaged ZIP is arm64 and KernelSU-family only, not a universal Magisk package. Loader availability does not by itself establish Studio WebUI compatibility with a manager.

**Built-In (GKI / NON-GKI)**

The original [SUSFS patch source and releases](https://gitlab.com/simonpunk/susfs4ksu/) can be integrated into a compatible kernel source and built as part of the kernel. Studio reports a responding implementation as **Built-In** when its implementation type is confirmed. Kernel integration, installation, and recovery depend on the device and kernel; NON-GKI combinations have not been verified by Studio.

Match the full kernel/KMI and provider build, check the provider's compatibility instructions, and avoid loading an LKM on top of an existing SUSFS implementation. A matching filename alone does not guarantee compatibility. Confirm a recovery path before changing kernel components.

## Compatibility and security

Device testing has covered specific **GKI-LKM SUSFS 2.3.0** and **GKI Built-In SUSFS 2.4.0** combinations and operations. This does not establish support for every kernel, manager, provider version, or operation. See the [compatibility evidence matrix](docs/host-integration.md#compatibility-evidence-matrix) for exact environments, tested operations, and gaps.

Some host WebUI bridges expose general-purpose privileged command and file interfaces. Studio restricts its own calls, but cannot guarantee the host's navigation or origin isolation. Review the [security model](docs/security-model.md) and [host integration notes](docs/host-integration.md) before use.

## Development

The WebUI uses React, TypeScript, Vite, pnpm, and Mantine. The Android arm64 diagnostic and transaction executable is written in Rust.

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
- [Design specification](DESIGN.md) — visual tokens and layout requirements.

## Credits

Developed by **LyraVoid and matsuzaka-yuki**.
