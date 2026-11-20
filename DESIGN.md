---
version: alpha
name: SUSFS Studio
description: An offline interface for device diagnostics and configuration archives, based on Material 3 Expressive.
colors:
  primary: "#2d6581"
  on-primary: "#f4faff"
  secondary-container: "#d1e5f4"
  on-secondary-container: "#415460"
  surface: "#f7f9fd"
  surface-bright: "#f7f9fd"
  surface-container-low: "#f0f4f8"
  surface-container: "#e9eef4"
  surface-container-high: "#e3e9ee"
  surface-container-highest: "#dce3ea"
  on-surface: "#2c3339"
  on-surface-variant: "#586066"
  outline: "#747c82"
  error: "#ba1a1a"
  error-container: "#ffdad6"
  on-error-container: "#410002"
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
    backgroundColor: "{colors.surface-bright}"
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
  active-card:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
  implementation-badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  archive-dialog:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.extra-large}"
---

# SUSFS Studio Design Specification

## Overview

Home summarizes interface response and information about the device and Studio. Rules owns the complete SUSFS surface: Overview, Basic settings, Path hiding, File disguise, Redirect, and Extensions. Its Overview contains provider status, archive state, the provider-qualified operation plan, separate effect state, recovery and retry actions, configuration exchange, and the complete reported capability list. Settings groups appearance preferences, language, browser demo controls, and developer credits. Material 3 Expressive guides tonal hierarchy, shape, and typography. Mantine provides the control primitives.

## Color and Hierarchy

The YAML color values are reference samples for the default profile in light mode, not runtime overrides. Material Color Utilities generates the `--md-sys-color-*` roles on the phone platform. Appearance defaults to following the system color-scheme preference exposed to the WebView, with dark as the fallback when the media preference is unavailable. Manager-forced themes that do not update this WebView preference are outside this signal. The default color profile is Slate (`#506775`), 2025 Tonal Spot, at standard contrast. The seven seed colors are independent of the palette style. Present them as a single scrollable row of two-tone swatches with a selection ring and a center dot. Generate swatch colors in Tonal Spot so seed hues remain recognizable even when the active style is Monochrome. Expressive, Tonal Spot, Vibrant, and Neutral support both 2021 and 2025. Monochrome, Content, Fidelity, Fruit Salad, and Rainbow use 2021; the specification row shows the effective year. Under 2021, the four accent `*-dim` tokens alias their corresponding accent roles because the library does not define accent dim roles for that specification.

- All routes share `surface-container` for the canvas, navigation, and pinned app bar to continue through the safe insets. Standard cards and connected rows use `surface-bright` in both appearances. Dialogs use `surface-container-high` with `scrim` and `shadow` for overlays. Use tonal fills instead of decorative separators.
- Use `on-surface` for body text and the active navigation label on the bar. Use `on-surface-variant` (`--on-muted` in CSS) for supporting text and unselected icons. Pair `secondary-container` with `on-secondary-container` for navigation indicators, selected tabs and selected dialog choices. Use `primary` for focus except on selected tonal containers, where the paired foreground provides contrast. Use `outline` for input boundaries.
- Map generic success to `tertiary`, warning to `secondary`, and destructive actions to the Material error family. Keep the four standard error roles fixed per appearance regardless of style or contrast. Use paired roles for notices and the deeper `on-error-container` for standalone error text on dialog surfaces. Status must remain readable without color.
- `web/src/theme/tokens.css` maps Material roles to shared application semantics and component tokens. Pages and components consume those aliases instead of declaring private palettes. Use tonal surfaces and spacing for persistent panels; reserve shadows for overlays. Blend colors only for interaction states, overlays and similar transparency effects.

## Typography and Adaptive Layout

- Use 36/44 expanded and 22/28 collapsed for flexible app-bar titles, 17/22 for Rules row titles, 15/20 for Rules supporting text, and 14/20 for Rules section titles and navigation labels. Use system sans-serif and monospace fallbacks.
- Use a 4px spacing step. On phones, keep 16px content gutters and three bottom navigation items: Home, Rules, Settings. Use left navigation from 840 CSS px. Add the top and bottom safe-area insets to the immersive Rules surface and the 74px navigation content height.

## Shape and Components

- Use connected lists in Rules and Settings. Rules rows may omit a leading icon. Use a 14/20 primary section title with 16px start padding and 8px bottom spacing. Use 16px outer corners, 4px inner corners, and 2px gaps. Keep pending host actions visible with the reason they are unavailable.
- Keep host-channel, raw provider, adapter, capability and operation-authorization facts in separate connected rows. A missing host, absent provider, unknown protocol, unreported feature, explicit lack of support and missing write authorization must remain visually and textually distinct. Keep complete archive JSON inside save, restore, or conflict-review flows; do not render it as a default overview section.
- Settings single-choice rows show their current value at the trailing edge and open a compact menu anchored to the touch or click point. Keyboard activation anchors to the row instead. Use a 24px group radius, 48px option targets, and a checked pill with a leading checkmark. Long menus scroll internally, open above the anchor when space is limited, and return keyboard focus to the trigger on Escape. An outside tap dismisses the menu without activating controls underneath. Seed swatches remain inline.
- Rule and archive boolean controls use the same icon-bearing switch: a 52×32px track, 24px thumb, and a 48px touch target. Dialog switch rows use a tonal 16px surface and keep the label adjacent to the control.
- Use a pill for the selected navigation indicator and 28px corners for the archive dialog. Pages and business components use the semantic tokens in `web/src/theme/`.
- Use a pinned Material 3 Expressive large flexible top app bar on Home, Rules, and Settings. Excluding the top safe inset, it is 120px high when expanded and collapses to 64px across the first 56px of vertical scroll. Home and Settings keep a stable scroll extent as the sticky header changes size and remain collapsible even with short content. Rules also pins its refresh action and six tab pills above its separate scroll area.
- Use the shared M3E dialog shell for every modal flow. It uses a centered 28px container, a 24/32 title, no header close icon, a scrollable body, and right-aligned sticky text actions. Keep the container inside the safe-area insets plus 16px. Dialog tabs use a primary tab row with a short selected underline. Choice dialogs use connected 4px-radius rows with 24px outer ends, a trailing radio indicator, and a selected tonal fill. Inputs use 16px outlined fields. Destructive actions stay textual and use the error color; dialogs do not mix filled navigation buttons with text actions.

## Interaction and Validation

- Aim for interactive targets of at least 48×48 CSS px. Communicate status with text and visual indicators. Check text contrast, control boundaries, and visible keyboard focus against WCAG AA.
- Use 120ms as the state transition baseline and 200ms as the container transition baseline. Respect `prefers-reduced-motion`. Restore focus to the trigger after a dialog closes. Verify system Back behavior and keyboard insets on the host device.
- On a host with `ksu.enableEdgeToEdge`, request edge-to-edge layout and consume the injected `--safe-area-inset-*` values. The page background must continue through the status and gesture areas while titles, actions, content, and navigation remain inside their safe bounds.
- Store theme and language as browser preferences. The theme defaults to following the system color-scheme preference exposed to the WebView, with explicit light and dark overrides. Bundle icons and styles locally. The developer avatar is the only remote image source: the fixed QQ avatar API, with a local initials fallback. Use the [WebUI maintenance guide](docs/webui-maintenance.md#verification) to run the browser checks and verify the layout across viewport sizes, themes, and status fixtures.

## Mobile Home — Active State

Use a viewport width of 360 CSS px as the mobile baseline. Measure top and bottom safe-area insets separately.

| Element | Mobile layout |
|---|---|
| Heading | Left-align `SUSFS Studio` in the flexible top app bar at the 16px gutter plus the left safe inset. Keep the diagnostic source label in the toolbar area. |
| Activation card | Use 16px page gutters and a full-width, borderless card approximately 96px tall with 16px corners. Align the ringed checkmark with the icon column below. Stack the localized Active label above the SUSFS version. Put a verified `LKM` or `Built-In` badge in its own column on the right and center it vertically. Use approximately 20px for the title, 14px for the version, and 12px at weight 600 for the badge. |
| Status card | Place it 16px below the activation card. Use an approximately 72px height and 16px corners. A branch icon precedes the state title and a diagnostic summary. Report facts confirmed by the current result. |
| Information group | List model, system, kernel, and SUSFS Studio version in that order. Rows start at approximately 72px and can grow with content. Use gaps of approximately 2px, outer corners of 16px, and inner corners of approximately 2px. Each row responds to presses without modifying data. Align the device, system, chip, and tag icons. Use approximately 16px for labels and 14px for values. Allow long kernel strings to wrap. |
| Bottom navigation | Use three equal-width items and approximately 74px of content height plus the safe-area inset. The selected item has an approximately 64×34px tonal indicator, a filled icon, and a label. Other items use outline icons. Give every item an accessible name and a 48px touch target. Reserve space so the navigation does not cover content. |

The active card pairs `secondary-container` with `on-secondary-container` for its checkmark and text. Only the implementation badge uses `primary` with `on-primary`. A failed or missing interface uses `error-container` with `on-error-container`. Loading and unconfirmed protocol retain a neutral card so pending or uncertain results do not look like confirmed failures. Both appearances share this hierarchy. Keep configuration actions on their respective pages.

`LKM` identifies a loadable kernel module. `Built-In` identifies an implementation compiled into the kernel. Report `GKI` separately as the kernel type in diagnostic details.

## Rules surface

Rules uses a M3E large flexible top app bar with a `SUSFS` title and top-right Refresh action. The expanded bar is 120px high with a 36/44 title; the first 56px of vertical scroll collapses it to 64px with a 22/28 title in the toolbar row. The app bar and horizontally scrollable row of six 48px pill tabs remain pinned above the scrolling content. As a top-level destination in the single-page shell, Rules has no back button or synthetic secondary-page chrome. Page content is centered at a maximum 840px, uses 16px gutters and 20px section spacing. Tabs are Overview, Basic settings, Path hiding, File disguise, Redirect, and Extensions in that order.

Group Map and kstat separately under File disguise. Lead each rule group with the add actions, then list each rule by source path with mode or destination underneath. Editable rule and extension rows expose a separate trailing Remove action with draft confirmation. Confirm the archive difference separately from field edits. Long paths and revisions wrap; the static fields stack on phones. Do not repeat the full capability panel on category tabs.

For Paths, Map, and Redirect, place the batch action directly below single add. In kstat, place static add before normal add and omit batch add. Keep supporting text in the connected rows and show the empty state only once the archive has actually been read. Category tabs show only a compact notice when a draft still needs review on Overview.

Basic settings uses labeled three-state rows and manual archive fields. Device-sourced values remain unavailable without verified facts. Label unmanaged, real-value reset, and filter removal as distinct draft intents. Extensions uses separate module and prefix lists. Both share the rule draft and review confirmation. In Rules → Overview, an upgrade or import is a candidate, never an immediate write. Archive save, plan application, syscall acceptance, and independently observed effects remain separate. Unknown and recovery-required plans expose inspection or recovery instead of automatic replay; known failed items may be retried only after explicit confirmation.

Protected apps opens the shared M3E dialog with a 56px pill search field, selected count, shared-app-ID warning, and a connected scrollable app list. Each installed app row uses a 40px icon, app label, package name and UID, and a trailing checkbox indicator; a missing archived app remains selectable so it can be removed. Loading, load failure, no matches, and a search clear action are explicit. App icons come from the host's read-only icon scheme when available and fall back to a tonal initial tile. The dialog keeps Close and Update draft as text actions.

When the active Provider is not a known LKM implementation, the Extensions tab shows one connected unavailable row and its reason. Hide the module and prefix add actions, entries and empty states until a supported LKM Provider is active.
