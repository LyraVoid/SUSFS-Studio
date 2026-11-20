import {
  Alert,
  type CSSVariablesResolver,
  createTheme,
  defaultVariantColorsResolver,
  localStorageColorSchemeManager,
  Switch,
} from "@mantine/core";
import {
  type DynamicScheme,
  Hct,
  hexFromArgb,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
} from "@material/material-color-utilities";
import { type ColorProfile, seeds } from "./colorProfile";

const constructors = {
  expressive: SchemeExpressive,
  tonalSpot: SchemeTonalSpot,
  vibrant: SchemeVibrant,
  neutral: SchemeNeutral,
  monochrome: SchemeMonochrome,
  content: SchemeContent,
  fidelity: SchemeFidelity,
  fruitSalad: SchemeFruitSalad,
  rainbow: SchemeRainbow,
} satisfies Record<ColorProfile["scheme"], typeof SchemeExpressive>;

const contrastLevels = { standard: 0, medium: 0.5, high: 1 };

export function createColorScheme(
  profile: ColorProfile,
  dark: boolean,
): DynamicScheme {
  const Scheme = constructors[profile.scheme];
  return new Scheme(
    Hct.fromInt(seeds[profile.seed]),
    dark,
    contrastLevels[profile.contrast],
    profile.specVersion,
    "phone",
  );
}

const roles = [
  "background",
  "onBackground",
  "surface",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "inverseSurface",
  "inverseOnSurface",
  "outline",
  "outlineVariant",
  "shadow",
  "scrim",
  "surfaceTint",
  "primary",
  "primaryDim",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "inversePrimary",
  "secondary",
  "secondaryDim",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiary",
  "tertiaryDim",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
  "error",
  "errorDim",
  "onError",
  "errorContainer",
  "onErrorContainer",
] as const satisfies readonly (keyof DynamicScheme)[];

const legacyDimRoles = {
  primaryDim: "primary",
  secondaryDim: "secondary",
  tertiaryDim: "tertiary",
  errorDim: "error",
} as const;

const semanticErrors = {
  light: {
    error: "#ba1a1a",
    onError: "#ffffff",
    errorContainer: "#ffdad6",
    onErrorContainer: "#410002",
  },
  dark: {
    error: "#ffb4ab",
    onError: "#690005",
    errorContainer: "#93000a",
    onErrorContainer: "#ffdad6",
  },
};

const cssRole = (role: string) =>
  `--md-sys-color-${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

export function materialColors(scheme: DynamicScheme): Record<string, string> {
  const errors: Partial<Record<(typeof roles)[number], string>> =
    semanticErrors[scheme.isDark ? "dark" : "light"];
  return Object.fromEntries(
    roles.map((role) => {
      const getter =
        scheme.specVersion === "2021" && role in legacyDimRoles
          ? legacyDimRoles[role as keyof typeof legacyDimRoles]
          : role;
      return [cssRole(role), errors[getter] ?? hexFromArgb(scheme[getter])];
    }),
  );
}

export function createThemeColors(profile: ColorProfile) {
  const light = createColorScheme(profile, false);
  const variables = {
    variables: {
      "--mantine-color-body": "var(--canvas)",
      "--mantine-color-text": "var(--on-surface)",
      "--mantine-color-dimmed": "var(--on-muted)",
      "--mantine-color-placeholder": "var(--on-muted)",
      "--mantine-color-error": "var(--on-error-container)",
      "--mantine-primary-color-filled": "var(--primary)",
      "--mantine-primary-color-filled-hover":
        "color-mix(in srgb, var(--primary), var(--on-primary) 8%)",
      "--mantine-primary-color-contrast": "var(--on-primary)",
    },
    light: materialColors(light),
    dark: materialColors(createColorScheme(profile, true)),
  };
  const resolver: CSSVariablesResolver = () => variables;
  return { resolver, effectiveSpec: light.specVersion };
}

const noticeTones = {
  info: ["--primary-container", "--on-primary-container"],
  success: ["--status-success-container", "--on-status-success-container"],
  warning: ["--status-warning-container", "--on-status-warning-container"],
  danger: ["--error-container", "--on-error-container"],
} as const;

export const theme = createTheme({
  fontFamily: 'Roboto, "Noto Sans", system-ui, sans-serif',
  defaultRadius: "md",
  components: {
    Alert: Alert.extend({ styles: { message: { color: "inherit" } } }),
    Switch: Switch.extend({
      classNames: {
        track: "studio-switch-track",
        thumb: "studio-switch-thumb",
      },
    }),
  },
  variantColorResolver: (input) => {
    const tone =
      input.color && Object.hasOwn(noticeTones, input.color)
        ? noticeTones[input.color as keyof typeof noticeTones]
        : undefined;
    if (tone && input.variant === "light") {
      return {
        background: `var(${tone[0]})`,
        color: `var(${tone[1]})`,
        border: "1px solid transparent",
        hover: `var(${tone[0]})`,
      };
    }
    if (input.variant === "subtle") {
      const color =
        input.color === "danger"
          ? "var(--on-error-container)"
          : "var(--primary)";
      return {
        background: "transparent",
        color,
        border: "1px solid transparent",
        hover: `color-mix(in srgb, ${color} 8%, transparent)`,
      };
    }
    return defaultVariantColorsResolver(input);
  },
});

export const colorSchemeManager = localStorageColorSchemeManager({
  key: "studio-theme",
});
