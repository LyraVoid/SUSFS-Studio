---
version: alpha
name: SUSFS Studio
description: An offline interface for device diagnostics and configuration archives, based on Material 3 Expressive.
colors:
  primary: "#0762a4"
  on-primary: "#f7f9ff"
  secondary-container: "#d0f8d9"
  on-secondary-container: "#3d6049"
  surface: "#f8f9ff"
  surface-container-low: "#eef4ff"
  surface-container: "#e5eeff"
  surface-container-high: "#dbe9ff"
  surface-container-highest: "#d2e4ff"
  on-surface: "#133454"
  on-surface-variant: "#446183"
  outline: "#607da1"
  error: "#ac3434"
typography:
  headline-lg:
    fontFamily: 'Roboto, "Noto Sans", system-ui, sans-serif'
    fontSize: 2rem
    fontWeight: 450
    lineHeight: 1.25
  title-md:
    fontSize: 1rem
    lineHeight: 1.5
  body-md:
    fontSize: 0.875rem
    lineHeight: 1.25rem
  label-md:
    fontSize: 0.75rem
    lineHeight: 1rem
rounded:
  extra-small: 4px
  control: 10px
  large: 16px
  extra-large: 28px
  full: 999px
spacing:
  unit: 4px
  compact: 8px
  control: 12px
  gutter: 16px
  section: 24px
  content: 32px
components:
  page-heading:
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-lg}"
  settings-row:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title-md}"
    rounded: "{rounded.extra-small}"
    padding: "{spacing.control}"
  navigation-bar:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-md}"
    height: 74px
  navigation-indicator:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.full}"
  archive-dialog:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.extra-large}"
---

# SUSFS Studio Design Specification

## Overview

Home summarizes interface response and device status. Rules owns the complete SUSFS surface: Overview, Basic settings, Path hiding, File disguise, Redirect, and Extensions. Its Overview contains provider status, archive save state, the device application boundary, configuration exchange, and the complete reported capability list. Settings groups appearance preferences, diagnostics, and browser demo controls. Material 3 Expressive guides tonal hierarchy, shape, and typography. Mantine provides the control primitives.

## Color and Hierarchy

The YAML color values are light-mode samples generated from the default seed. At runtime, `web/src/theme/theme.ts` computes the HCT palette using `SchemeExpressive` from Material Color Utilities. The current settings are the Studio blue-gray seed `#566579`, the 2025 specification, the phone platform, and standard contrast. Wallpaper-based colors require a seed supplied by the Android host.

- Use `surface` for the canvas and `surface-container` for standard panels and navigation outside Home. The Rules page uses a dedicated dark palette: canvas `#1a2024`, group material `#21262c`, active material `#2e3d47`, primary accent `#afc1ce`, primary text `#dae1e7`, and supporting text `#9ba3a9`. Settings rows use `surface-container-low` in light mode and `surface-container-high` in dark mode. The archive dialog uses `surface-container-high`.
- Use `on-surface` for body text and `on-surface-variant` (`--on-muted` in CSS) for supporting text and unselected icons. Pair `secondary-container` with `on-secondary-container` for selected items. Use `primary` for focus and `outline` for input boundaries.
- Use tonal surfaces and spacing for persistent panels. Reserve shadows for overlays. The home palette is specified below and implemented in `web/src/theme/tokens.css`.

## Typography and Adaptive Layout

- Use 32/40 for standard page titles, 17/22 for Rules row titles, 15/20 for Rules supporting text, and 14/20 for Rules section titles and navigation labels. Home uses its own typography below. Use rem units with system sans-serif and monospace fallbacks.
- Use a 4px spacing step. On phones, keep 16px content gutters and three bottom navigation items: Home, Rules, Settings. Use left navigation from 840 CSS px. Add the bottom safe-area inset to the 74px navigation content height.

## Shape and Components

- Use connected lists in Rules and Settings. Rules rows may omit a leading icon. Use a 14/20 primary section title with 16px start padding and 8px bottom spacing. Use 16px outer corners, 4px inner corners, and 2px gaps. Keep pending host actions visible with the reason they are unavailable.
- Use a pill for the selected navigation indicator and 28px corners for the archive dialog. Pages and business components use the semantic tokens in `web/src/theme/`.

## Interaction and Validation

- Aim for interactive targets of at least 48×48 CSS px. Communicate status with text and visual indicators. Check text contrast, control boundaries, and visible keyboard focus against WCAG AA.
- Use 120ms as the state transition baseline and 200ms as the container transition baseline. Respect `prefers-reduced-motion`. Restore focus to the trigger after a dialog closes. Verify system Back behavior and keyboard insets on the host device.
- Store theme and language as browser preferences. Bundle icons and styles locally. Use the [WebUI maintenance guide](docs/webui-maintenance.md#verification) to run the browser checks and verify the layout across viewport sizes, themes, and status fixtures.

## Mobile Home — Active State

Use a viewport width of 360 CSS px as the mobile baseline. Measure top and bottom safe-area insets separately.

| Element | Mobile layout |
|---|---|
| Heading | Left-align `SUSFS Studio` at 28px with a 36px line height and weight 500. At the mobile baseline, start approximately 96px from the top and 20px from the left. |
| Activation card | Use 16px page gutters and a full-width, borderless card approximately 96px tall with 16px corners. Align the ringed checkmark with the icon column below. Stack the localized Active label above the SUSFS version. Put a verified `LKM` or `Built-In` badge in its own column on the right and center it vertically. Use approximately 20px for the title, 14px for the version, and 12px at weight 600 for the badge. |
| Status card | Place it 16px below the activation card. Use an approximately 72px height and 16px corners. A branch icon precedes the state title and a diagnostic summary. Report facts confirmed by the current result. |
| Device group | List model, system, and kernel in that order. Rows start at approximately 72px and can grow with content. Use gaps of approximately 2px, outer corners of 16px, and inner corners of approximately 2px. Align the device, system, and chip icons. Use approximately 16px for labels and 14px for values. Allow long kernel strings to wrap. |
| Bottom navigation | Use three equal-width items and approximately 74px of content height plus the safe-area inset. The selected item has an approximately 64×34px blue-gray indicator, a filled icon, and a label. Other items use outline icons. Give every item an accessible name and a 48px touch target. Reserve space so the navigation does not cover content. |

The dark home palette uses `#0F1012` for the canvas, `#16191E` for standard cards, `#2D3947` for the activation card, and `#14171C` for bottom navigation. The activation card uses `#E1E7EF` for primary text, `#B1C0D0` for the checkmark, secondary text, and badge background, and `#293543` for badge text. Light mode retains the same layout and contrast hierarchy. Keep configuration actions on their respective pages.

`LKM` identifies a loadable kernel module. `Built-In` identifies an implementation compiled into the kernel. Report `GKI` separately as the kernel type in diagnostic details.

## Rules surface

Rules uses a large `SUSFS` title, a top-right Refresh action, and a horizontally scrollable row of six 48px pill tabs with 6px gaps and 20px inline padding. As a top-level destination in the single-page shell, Rules has no back button or synthetic secondary-page chrome. Page content is centered at a maximum 840px, uses 16px gutters and 20px section spacing. Tabs are Overview, Basic settings, Path hiding, File disguise, Redirect, and Extensions in that order.

Group Map and kstat separately under File disguise. Lead each rule group with the add actions, then list each rule by source path with mode or destination underneath. Use a dialog for details, field edits, and destructive draft actions. Confirm the archive difference separately from field edits. Long paths and revisions wrap; the static fields stack on phones. Do not repeat the full capability panel on category tabs.

For Paths, Map, and Redirect, place the batch action directly below single add. In kstat, place static add before normal add and omit batch add. Keep supporting text in the connected rows and show the empty state only once the archive has actually been read. Category tabs show only a compact notice when a draft still needs review on Overview.

Basic settings uses labeled three-state rows and read-only fields with a reason when device facts are unavailable. Extensions uses separate module and prefix lists. Both share the rule draft and review confirmation. In Rules → Overview, an upgrade or import is a candidate, never an immediate write. Archive save, device application and independently observed effects remain separate.
