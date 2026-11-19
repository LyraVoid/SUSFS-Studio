import {
  type CSSVariablesResolver,
  createTheme,
  localStorageColorSchemeManager,
} from "@mantine/core";
import {
  Hct,
  hexFromArgb,
  SchemeExpressive,
} from "@material/material-color-utilities";

function materialColors(dark: boolean) {
  const scheme = new SchemeExpressive(
    Hct.fromInt(0xff566579),
    dark,
    0,
    "2025",
    "phone",
  );
  const role = hexFromArgb;
  return {
    "--settings-row-surface": role(
      dark ? scheme.surfaceContainerHigh : scheme.surfaceContainerLow,
    ),
    "--surface": role(scheme.surface),
    "--surface-container": role(scheme.surfaceContainer),
    "--surface-container-low": role(scheme.surfaceContainerLow),
    "--surface-container-high": role(scheme.surfaceContainerHigh),
    "--surface-container-highest": role(scheme.surfaceContainerHighest),
    "--on-surface": role(scheme.onSurface),
    "--on-muted": role(scheme.onSurfaceVariant),
    "--outline": role(scheme.outline),
    "--primary": role(scheme.primary),
    "--on-primary": role(scheme.onPrimary),
    "--secondary-container": role(scheme.secondaryContainer),
    "--on-secondary-container": role(scheme.onSecondaryContainer),
    "--error": role(scheme.error),
  };
}

export const colorVariables: CSSVariablesResolver = () => ({
  variables: {
    "--mantine-color-body": "var(--surface)",
    "--mantine-color-text": "var(--on-surface)",
    "--mantine-primary-color-filled": "var(--primary)",
    "--mantine-primary-color-filled-hover":
      "color-mix(in srgb, var(--primary), var(--on-primary) 8%)",
    "--mantine-primary-color-contrast": "var(--on-primary)",
  },
  light: materialColors(false),
  dark: materialColors(true),
});

export const theme = createTheme({
  fontFamily: 'Roboto, "Noto Sans", system-ui, sans-serif',
  defaultRadius: "md",
});
export const colorSchemeManager = localStorageColorSchemeManager({
  key: "studio-theme",
});
