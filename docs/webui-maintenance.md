# WebUI Maintenance Guide

The browser entry point is [`web/src/app/main.tsx`](../web/src/app/main.tsx). It composes the page shell, locale, theme, and diagnostic state. The [design specification](../DESIGN.md) defines the visual requirements.

## Routes

Route definitions live in [`web/src/app/routes.ts`](../web/src/app/routes.ts). The hash contains the page path, so the server only needs to serve the entry file and its bundled assets. An empty hash opens Home. `#/rules` opens Paths. Unrecognized routes display a fallback with a link back to Home.

| Navigation | Hash route |
| --- | --- |
| Home | `#/` |
| Rules → Paths | `#/rules/paths` |
| Rules → Disguise | `#/rules/disguise` |
| Rules → Redirect | `#/rules/redirect` |
| Extensions | `#/extensions` |
| Settings | `#/settings` |

The [navigation shell](../web/src/layouts/Shell.tsx) restores the main content scroll position when revisiting a route within the session. Below 840 CSS px it uses bottom navigation. At 840 CSS px and above it uses left navigation.

## Source ownership

| Concern | Implementation |
| --- | --- |
| Diagnostic data and scenario fixtures | [`transport/mock.ts`](../web/src/transport/mock.ts) defines the result variants and simulated capabilities. [`useStatus.ts`](../web/src/features/status/useStatus.ts) coordinates requests and discards results from superseded requests. |
| Archive preview | [`preview.ts`](../web/src/features/config/preview.ts) validates local input. [`ArchivePanel.tsx`](../web/src/components/organisms/ArchivePanel.tsx) renders the decoded text and clears preview state when the dialog closes. |
| Theme | [`theme.ts`](../web/src/theme/theme.ts) generates the light and dark tonal palettes. [`tokens.css`](../web/src/theme/tokens.css) defines shared tokens and the home palette. |
| Localization | [`messages.ts`](../web/src/i18n/messages.ts) holds English and Simplified Chinese strings. Keep message keys and placeholders aligned. |

Device access belongs behind the transport boundary. Confirmed interface response, implementation type, and capability availability are separate fields. Keep those distinctions when extending the result model. Treat archive previews independently of diagnostic state.

## Verification

After installing dependencies with the repository lockfile, run the following commands from the repository root.

```bash
pnpm --dir web check
pnpm --dir web exec playwright install chromium
pnpm --dir web test:e2e
pnpm --dir web build
```

`check` runs formatting and lint checks, TypeScript checks, and unit tests. The browser suite covers navigation, demo scenarios, archive previews, preference persistence, the responsive breakpoint, and selected accessibility checks. Set `CHROMIUM_PATH` to use an existing Chromium executable.

The static build writes to `web/dist/`. Serve that directory over HTTP and verify that a direct URL such as `index.html#/rules/disguise` loads under a nested path. Vite emits relative asset URLs and a Content Security Policy that disables runtime network connections for the static build. The output is the browser preview and still uses simulated data.
