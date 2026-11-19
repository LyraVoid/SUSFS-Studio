# SUSFS Studio Development Guidelines

## Project Overview

SUSFS Studio is an offline WebUI for device diagnostics and configuration archives in Android module hosts. The React, strict TypeScript, Vite, Mantine, and pnpm frontend lives in `web/`. The browser preview uses `MockTransport`. Rust and host integration are planned for later stages.

## Required Practices

- Read `DESIGN.md` before making visual changes. Its YAML front matter describes tokens and component mappings. The prose explains their use, page-specific exceptions, and acceptance criteria. Runtime color generation lives in `web/src/theme/`.
- Compose components from higher to lower layers: `pages`, `layouts`, `organisms`, `molecules`, and `atoms`. Layouts own the navigation shell. Feature modules provide data to business components. Base components do not access the host bridge or persist business state.
- Keep user-visible text in `web/src/i18n/messages.ts`. Add Simplified Chinese and English together and use identical placeholder names. Route icons through `web/src/components/atoms/Icon.tsx` and bundle runtime assets locally.
- Preserve the six-page structure, hash routes, and relative asset URLs. Explain why unavailable actions are disabled and what they need to become available. Label demo data explicitly.
- The native layer is authoritative for configuration and device capabilities. Keep the device provider read-only and archive previews independent of device state. Update the specification, fixtures, and tests together when the protocol, configuration schema, or compatibility findings change.
- Write `AGENTS.md`, `DESIGN.md`, and `docs/` in English. Keep public documentation neutral and self-contained. Use `docs/` for user guides, verified technical references, and stable maintenance procedures. Store implementation plans, handoffs, and progress notes in the ignored `.local/` directory.
- Run local checks and CI without elevated privileges. Create commits only after explicit authorization.

## Required Reading

- [README.md](README.md) describes the project and how to start the preview.
- [DESIGN.md](DESIGN.md) defines visual tokens, components, and page baselines.
- [docs/user-guide.md](docs/user-guide.md) explains diagnostic states, archive previews, and browser preferences.
- [docs/webui-maintenance.md](docs/webui-maintenance.md) documents routes, source ownership, and validation.
- [docs/diagnostic-cli.md](docs/diagnostic-cli.md) documents the experimental read-only diagnostic executable.

## Validation

- Run `pnpm --dir web check` after frontend changes. It runs read-only Biome checks, TypeScript checks, and Vitest tests including localization checks.
- Run relevant Playwright tests after changing pages, navigation, or themes. Wait for theme initialization and motion to settle before taking screenshots or running axe. Review visual differences before updating baselines.
- Use `pnpm --dir web dev` for the development preview. Follow the WebUI maintenance guide for static builds. Support claims require evidence from the tested device and host.
