# Module Releases

Studio publishes arm64 KernelSU module ZIPs through two manual GitHub Actions
workflows. Both workflows require a clean source-controlled version; they do not
derive a tag from an unreviewed working tree.

## Release metadata

`module/module.prop` is the source of truth for the installed version:

- `version` is the version without a leading `v`.
- `versionCode` is a positive 32-bit decimal integer.
- `updateJson` points to the update manifest on the default branch.
- `banner` names the 16:9 cover image in the module root; hosts that read it show it on the module card.

`update.json` is the source of truth for module updates. Its `zipUrl` and
`changelog` point to the matching `v<version>` Git tag. The release workflow
rejects a version, version code, or manifest that does not exactly match the
checked-in files.

Record user-facing changes in [CHANGELOG.md](../CHANGELOG.md).

To prepare a release, update `module/module.prop`, `update.json`, and the
changelog, commit the change, and push it to `main`. The asset name is:

```text
susfs-studio-<version>-arm64.zip
```

For example, version `1.0.0` uses tag `v1.0.0` and asset
`susfs-studio-1.0.0-arm64.zip`.

## Release workflow

Run **Release module** from `main` and provide the version and version code from
`module/module.prop`. The workflow:

1. Validates the checked-in release metadata and rejects an existing tag.
2. Runs script, native, WebUI, end-to-end, static-policy, and arm64 build checks.
3. Builds the arm64 module ZIP with the checked-in update URL.
4. Creates the matching Git tag.
5. Creates the GitHub release with the module ZIP, `update.json`, and
   `SHA256SUMS`.

The module ZIP includes `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the applicable
licence texts. See [distribution notes](distribution.md) for the corresponding
source and redistribution terms.

## Release signatures

Release assets are signed with Sigstore keyless signing. The workflow requests a
short-lived OIDC identity from GitHub Actions and records the signature in the
Sigstore transparency log, so no long-lived private key is stored in the
repository. The release includes a `.bundle` file for the module ZIP and for
`SHA256SUMS`.

Verify a downloaded asset with cosign 3.x:

```bash
cosign verify-blob \
  --bundle susfs-studio-1.0.0-arm64.zip.bundle \
  --certificate-identity https://github.com/LyraVoid/SUSFS-Studio/.github/workflows/release.yml@refs/heads/main \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  susfs-studio-1.0.0-arm64.zip
```

Use the same identity and issuer with `SHA256SUMS.bundle` to verify the checksum
file. A signature proves which workflow built the asset; it does not by itself
prove that the module works on a particular device.

Set `prerelease=true` for beta, development, or release-candidate tags. The
checked-in `update.json` still points to that exact tag, so a module installed
from a pre-release can see the next update.

## Debug workflow

Run **Build debug module** from `main`. It runs the native and WebUI checks,
builds the arm64 executable, appends `.debug.<run-number>` to the module version,
and uploads a 14-day GitHub Actions artifact. Debug builds are not GitHub
Releases and are not written to `update.json`.

The debug artifact preserves Studio's normal update URL. Installing a debug build
does not publish it to other users, and the next versioned release remains the
update target.
