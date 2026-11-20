# WebUI Maintenance Guide

The browser entry point is [`web/src/app/main.tsx`](../web/src/app/main.tsx). It composes the page shell, locale, theme, and diagnostic state. The [design specification](../DESIGN.md) defines the visual requirements.

## Routes

Route definitions live in [`web/src/app/routes.ts`](../web/src/app/routes.ts). The hash contains the page path, so the server only needs to serve the entry file and its bundled assets. An empty hash opens Home. `#/rules` opens Rules → Overview. The legacy `#/extensions` address resolves to Rules → Extensions. Unrecognized routes display a fallback with a link back to Home.

| Navigation | Hash route |
| --- | --- |
| Home | `#/` |
| Rules → Overview | `#/rules/overview` |
| Rules → Paths | `#/rules/paths` |
| Rules → Disguise | `#/rules/disguise` |
| Rules → Redirect | `#/rules/redirect` |
| Rules → Basic settings | `#/rules/basic` |
| Rules → Extensions | `#/rules/extensions` |
| Settings | `#/settings` |

The [navigation shell](../web/src/layouts/Shell.tsx) has exactly three destinations: Home, Rules and Settings. It restores the main content scroll position when revisiting a route within the session. Below 840 CSS px it uses bottom navigation. At 840 CSS px and above it uses left navigation. Rules owns six scrollable tabs in the order Overview, Basic settings, Path hiding, File disguise, Redirect and Extensions.

When the host exposes `ksu.enableEdgeToEdge`, the WebUI requests immersive layout and reads the host-injected `--safe-area-inset-*` variables. The shell background continues through the status and gesture areas while content and navigation remain inside safe bounds. Home, Rules, and Settings use the M3E large flexible top app bar: 36/44 expanded, 22/28 collapsed, 120px to 64px over the first 56px of vertical scroll. Home and Settings scroll inside the shell with a sticky title and fixed expanded header track; Rules pins its title and tabs above its own scrolling content.

## Source ownership

| Concern | Implementation |
| --- | --- |
| Diagnostic data and scenario fixtures | [`transport/mock.ts`](../web/src/transport/mock.ts) defines the result variants and the complete capability key list. [`protocol.ts`](../web/src/transport/protocol.ts) validates optional raw features, variant, audit, control, static-field, and redirect-scheme metadata. [`useStatus.ts`](../web/src/features/status/useStatus.ts) coordinates requests and discards results from superseded requests. [`operationQualification.ts`](../web/src/features/status/operationQualification.ts) distinguishes host, protocol, provider, capability, adapter, staleness and authorization gates without turning a feature marker into write permission. |
| Archive preview and device flow | [`preview.ts`](../web/src/features/config/preview.ts) validates local input. [`archiveBridge.ts`](../web/src/transport/archiveBridge.ts) owns fixed command calls, token validation, and file-stream writes. [`operations.ts`](../web/src/transport/operations.ts) validates version-2 plans and reports. [`ArchivePanel.tsx`](../web/src/components/organisms/ArchivePanel.tsx) renders comparison, confirmation, receipts, refresh, export, restore, and retained drafts. |
| Operation and recovery flow | [`useRuleArchive.ts`](../web/src/features/config/useRuleArchive.ts) owns save/plan binding, apply, independent verification, journal inspection, recovery, and known-failure retry. [`RulesOverview.tsx`](../web/src/components/organisms/RulesOverview.tsx) presents candidate revision, per-item state, effects, blocked/deferred items, and explicit recovery controls. |
| Automatic startup | [`post-fs-data.sh`](../module/post-fs-data.sh) checks the saved automatic preference, optionally loads the fixed host GKI-LKM KO, and runs pre-mount/late-pre-mount. [`service.sh`](../module/service.sh) runs post-mount/late-load. Both log fixed phase names and opaque plan IDs only. |
| Rules surface | [`CapabilityPage.tsx`](../web/src/pages/CapabilityPage.tsx) owns the SUSFS header and six tabs. [`RulesOverview.tsx`](../web/src/components/organisms/RulesOverview.tsx) owns provider status, the application boundary and capabilities. [`RuleArchive.tsx`](../web/src/components/organisms/RuleArchive.tsx) owns the archive transaction and Path/Map/kstat/Redirect dialogs; [`ControlArchive.tsx`](../web/src/components/organisms/ControlArchive.tsx) owns Basic settings and LKM archive fields. [`ruleEdits.ts`](../web/src/features/config/ruleEdits.ts) edits validated source spans, and [`useRuleArchive.ts`](../web/src/features/config/useRuleArchive.ts) owns the shared draft and readback verification. |
| Dialog shell | [`M3eDialog.tsx`](../web/src/components/molecules/M3eDialog.tsx) owns the centered M3E surface, title, scroll body, action row, and connected radio choices. Feature dialogs provide content and actions but do not restyle the modal shell independently. |
| Theme | [`theme.ts`](../web/src/theme/theme.ts) generates Material roles for both appearances. [`tokens.css`](../web/src/theme/tokens.css) maps them to shared application and component tokens. [`colorProfile.ts`](../web/src/theme/colorProfile.ts) validates the versioned `studio-color-profile` browser preference without replacing the existing `studio-theme` appearance key. |
| Localization | [`messages.ts`](../web/src/i18n/messages.ts) holds English and Simplified Chinese strings. Keep message keys and placeholders aligned. |

Device access belongs behind the transport boundary. Confirmed interface response, implementation type, and capability availability are separate fields. Keep those distinctions when extending the result model. Treat archive previews independently of diagnostic state.

When changing the default profile, compare the generated light and dark role pairs on the actual canvas and work card. A different scheme can change the hue relationship even when the component roles are unchanged. The original version 1 default migrates to the current default. Other valid profiles retain their palette settings; version 1 profiles without a seed use Slate.

## Verification

After installing dependencies with the repository lockfile, run the following commands from the repository root.

```bash
pnpm --dir web check
pnpm --dir web exec playwright install chromium
pnpm --dir web test:e2e
pnpm --dir web test:static
pnpm --dir web build
```

`check` runs formatting and lint checks, TypeScript checks, and unit tests. The browser suite covers navigation, demo scenarios, archive preview, fixed command/token boundaries, save, receipt refresh, export, failure-state draft retention, operation apply/verify/recover/retry, preference persistence, the responsive breakpoint, and selected accessibility checks. `test:static` builds the WebUI in development mode and checks that its CSP blocks embedded frames. Set `CHROMIUM_PATH` to use an existing Chromium executable.

Packaging validates that `post-fs-data.sh` and `service.sh` are regular executable module files. Device acceptance separately checks that `automatic=false` exits before KO loading, that enabled boot stages persist plans across the pre-Android wall-clock interval, that a missed pre-mount kstat snapshot cannot execute post-mount, and that cleanup removes the Provider state after reboot.

The static build writes to `web/dist/`. Serve that directory over HTTP and verify that a direct URL such as `index.html#/rules/disguise` loads under a nested path. Vite emits relative asset URLs and a Content Security Policy that disables network connections and embedded frames. The policy does not prevent top-level navigation or restrict a host's JavaScript bridge; the host must enforce trusted page origins and navigation separately. The output uses simulated data unless a diagnostic bridge is provided.
