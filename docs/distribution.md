# Distribution Notes

SUSFS Studio is licensed under the GNU Affero General Public License, version 3
only (`AGPL-3.0-only`). See [LICENSE](../LICENSE) and
[third-party notices](../THIRD_PARTY_NOTICES.md).

## What is distributed

Two forms are published:

1. **Source repository** — https://github.com/LyraVoid/SUSFS-Studio, including
   `web/`, `native/`, `module/`, `scripts/`, `contracts/`, and documentation.
2. **Module ZIP** — `susfs-studio-<version>-arm64.zip` attached to the matching
   `v<version>` release tag. The archive contains:

   ```text
   module.prop
   customize.sh
   post-fs-data.sh
   service.sh
   banner.webp
   bin/studioctl
   webroot/index.html
   webroot/assets/*.js
   webroot/assets/*.css
   LICENSE
   THIRD_PARTY_NOTICES.md
   LICENSES/AGPL-3.0-only.txt
   LICENSES/GPL-3.0-only.txt
   LICENSES/Apache-2.0.txt
   LICENSES/MIT.txt
   LICENSES/ISC.txt
   ```

The ZIP does not include a SUSFS kernel patch, a SUSFS kernel module, or a host
manager.

## Corresponding source

The source for a published ZIP is the repository content at the same
`v<version>` tag. Release builds are produced from a clean checkout of that tag
by the workflows described in [releases](releases.md). No build-time secrets,
private patches, or non-public sources are used.

If you received a ZIP without access to the repository, write to the maintainers
through the repository issue tracker to obtain the corresponding source for that
exact version.

## Building from source

Prerequisites: Node.js 22.12 or later, pnpm 12.21.0, a Rust toolchain, the Android
NDK, and `cargo-ndk`.

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web check
pnpm --dir web build
(cd native && cargo ndk -t arm64-v8a -P 26 build --locked)
python3 scripts/package.py \
  --web web/dist \
  --cli native/target/aarch64-linux-android/debug/studioctl \
  --output dist/susfs-studio-dev-arm64.zip
```

Release packaging uses the pinned version metadata in `module/module.prop` and
`update.json`; see [releases](releases.md) and [diagnostic CLI](diagnostic-cli.md).

## Network interaction

The module runs a local WebUI inside a host manager and does not operate a
public network service. It opens no listener and makes no outbound connections at
runtime. AGPL-3.0 section 13 applies if you modify Studio and let users interact
with that modified version over a network; in that case you must offer those
users the corresponding source of your modified version.

## Modifying and redistributing

If you distribute a modified module or WebUI:

- keep `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the `LICENSES/` directory;
- mark your changes and their dates, and do not present them as the original;
- provide the complete corresponding source under AGPL-3.0;
- do not use the project name or the maintainers' names to imply endorsement;
- comply with the licenses of any additionally bundled components.

## Warranty and safety

Studio is provided without warranty, to the extent permitted by law. It can
change kernel-visible behavior when the user applies provider operations. Keep a
verified recovery path, back up configuration and boot images, and test on a
device you can restore. Installing a kernel module or changing kernel components
can prevent the device from booting.
