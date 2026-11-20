# Module Releases

Studio publishes arm64 KernelSU module ZIPs through two manual GitHub Actions
workflows. Both workflows require a clean source-controlled version; they do not
derive a tag from an unreviewed working tree.

## Release metadata

`module/module.prop` is the source of truth for the installed version:

- `version` is the version without a leading `v`.
- `versionCode` is a positive 32-bit decimal integer.
- `updateJson` points to the update manifest on the default branch.

`update.json` is the source of truth for module updates. Its `zipUrl` and
`changelog` point to the matching `v<version>` Git tag. The release workflow
rejects a version, version code, or manifest that does not exactly match the
checked-in files.

To prepare a release, update `module/module.prop` and `update.json`, commit the
change, and push it to `main`. The asset name is:

```text
susfs-studio-<version>-arm64.zip
```

For example, version `0.1.0-beta.1` uses tag `v0.1.0-beta.1` and asset
`susfs-studio-0.1.0-beta.1-arm64.zip`.

## Release workflow

Run **Release module** from `main` and provide the version and version code from
`module/module.prop`. The workflow:

1. Validates the checked-in release metadata and rejects an existing tag.
2. Runs script, native, WebUI, end-to-end, static-policy, and arm64 build checks.
3. Builds the arm64 module ZIP with the checked-in update URL.
4. Creates the matching Git tag.
5. Creates the GitHub release with the module ZIP, `update.json`, and
   `SHA256SUMS`.

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
