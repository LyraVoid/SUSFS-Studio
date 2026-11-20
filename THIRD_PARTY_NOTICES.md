# Third-Party Notices

SUSFS Studio is licensed under the GNU Affero General Public License, version 3
only. See [LICENSE](LICENSE). This file lists third-party components used by the
distributed module and the WebUI build.

License texts are provided in [LICENSES/](LICENSES/). Copyright notices below are
reproduced from each component's published metadata or license file. When an
upstream project provides its own notice file, that file governs.

## Runtime components

### Native executable

| Component | Version | License | Copyright |
| --- | --- | --- | --- |
| android-bootimg | 150425b | GPL-3.0 | 5ec1cff and contributors |
| libc | 0.2 | MIT OR Apache-2.0 | The Rust Project Developers |
| memmap2 | 0.9 | MIT OR Apache-2.0 | Yevhenii Reizner, Dan Burkert |
| serde | 1.0 | MIT OR Apache-2.0 | David Tolnay and contributors |
| serde_json | 1.0 | MIT OR Apache-2.0 | David Tolnay and contributors |
| sha2 | 0.10 | MIT OR Apache-2.0 | RustCrypto Developers; Graydon Hoare, Mozilla Foundation, Artyom Pavlov |

`android-bootimg` is GPL-3.0. It is combined with Studio under the terms of
GPL-3.0 section 13, and the combined work is conveyed under AGPL-3.0. The GPL-3.0
text is included in `LICENSES/GPL-3.0-only.txt`.

### WebUI bundle

| Component | Version | License | Copyright |
| --- | --- | --- | --- |
| react | 19.2.3 | MIT | Meta Platforms, Inc. and affiliates |
| react-dom | 19.2.3 | MIT | Meta Platforms, Inc. and affiliates |
| @mantine/core | 8.3.14 | MIT | Vitaly Rtishchev and contributors |
| @mantine/hooks | 8.3.14 | MIT | Vitaly Rtishchev and contributors |
| @material/material-color-utilities | 0.4.0 | Apache-2.0 | Google LLC |
| lossless-json | 4.3.0 | MIT | Jos de Jong |
| lucide-react | 0.468.0 | ISC | Lucide Contributors; portions held by Cole Bemis as part of Feather (MIT) |

### Build and test tooling

Vite, TypeScript, Biome, Vitest, Playwright, and axe are used to build or test
the project. They are not included in the distributed module ZIP.

## Not included

The module does not include a SUSFS kernel patch, a SUSFS kernel module, or any
host manager. SUSFS providers are downloaded and installed separately by the
user. Provider projects carry their own licenses and notices.

## Trademarks

Android, KernelSU, Magisk, and other product names are trademarks of their
respective owners. Reference to them does not imply endorsement.
