import { hexFromArgb } from "@material/material-color-utilities";
import { describe, expect, it } from "vitest";
import {
  contrasts,
  defaultColorProfile,
  parseColorProfile,
  type Seed,
  schemes,
  seeds,
  specVersions,
} from "../src/theme/colorProfile";
import { createColorScheme, materialColors } from "../src/theme/theme";

describe("color preferences", () => {
  const stored = {
    version: 1,
    specVersion: "2021",
    scheme: "neutral",
    contrast: "high",
  };

  it("restores a supported profile", () => {
    expect(parseColorProfile(JSON.stringify(stored))).toEqual({
      seed: "slate",
      specVersion: "2021",
      scheme: "neutral",
      contrast: "high",
    });
  });
  it("migrates the original default and restores an explicit seed", () => {
    expect(
      parseColorProfile(
        JSON.stringify({
          version: 1,
          specVersion: "2025",
          scheme: "expressive",
          contrast: "standard",
        }),
      ),
    ).toEqual(defaultColorProfile);
    expect(
      parseColorProfile(
        JSON.stringify({ version: 3, ...defaultColorProfile, seed: "rose" }),
      ),
    ).toEqual({ ...defaultColorProfile, seed: "rose" });
  });

  it("retains saved profiles from the previous storage version", () => {
    const previous = { ...defaultColorProfile, scheme: "neutral" };
    expect(
      parseColorProfile(JSON.stringify({ version: 2, ...previous })),
    ).toEqual(previous);
    expect(
      parseColorProfile(JSON.stringify({ version: 3, ...previous })),
    ).toEqual(previous);
    expect(
      parseColorProfile(
        JSON.stringify({ version: 2, ...previous, seed: "blue" }),
      ),
    ).toEqual({ ...previous, seed: "blue" });
  });

  it.each([
    null,
    "{",
    "null",
    "[]",
    "{}",
    '{"version":1}',
    JSON.stringify({ ...stored, version: 0 }),
    JSON.stringify({ ...stored, specVersion: "2026" }),
    JSON.stringify({ ...stored, scheme: "constructor" }),
    JSON.stringify({ ...stored, contrast: "unknown" }),
    JSON.stringify({ ...stored, version: 2, seed: "constructor" }),
  ])("falls back for %s", (raw) => {
    expect(parseColorProfile(raw)).toEqual(defaultColorProfile);
  });
});

function luminance(color: string | undefined) {
  if (!color) throw new Error("Missing Material color role");
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const start = 1 + index * 2;
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    const linear =
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + weight * linear;
  }, 0);
}

const textPairs = [
  ["on-primary", "primary"],
  ["on-primary-container", "primary-container"],
  ["on-secondary-container", "secondary-container"],
  ["on-tertiary-container", "tertiary-container"],
  ["on-error", "error"],
  ["on-error-container", "error-container"],
  ["on-surface", "surface"],
  ["on-surface", "surface-container-low"],
  ["on-surface", "surface-container"],
  ["on-surface", "surface-bright"],
  ["on-surface-variant", "surface-bright"],
  ["on-surface-variant", "surface-container"],
  ["on-surface-variant", "surface-container-low"],
  ["on-surface-variant", "surface-container-high"],
  ["on-error-container", "surface-container-high"],
  ["primary", "surface-container-low"],
  ["primary", "surface-container-high"],
  ["primary", "surface"],
  ["primary", "surface-bright"],
  ["primary", "surface-container"],
  ["secondary", "surface-container-high"],
  ["secondary", "surface-container-low"],
  ["secondary", "surface-bright"],
  ["tertiary", "surface-container-high"],
] as const;

describe("Material roles", () => {
  it.each(
    schemes,
  )("generates the full accessible role set for %s", (scheme) => {
    for (const seed of Object.keys(seeds) as Seed[]) {
      for (const specVersion of specVersions) {
        for (const dark of [false, true]) {
          for (const [index, contrast] of contrasts.entries()) {
            const dynamic = createColorScheme(
              { seed, specVersion, scheme, contrast },
              dark,
            );
            expect(dynamic.isDark).toBe(dark);
            expect(dynamic.platform).toBe("phone");
            expect(dynamic.contrastLevel).toBe(index / 2);
            expect(dynamic.specVersion).toBe(
              schemes.slice(0, 4).some((style) => style === scheme)
                ? specVersion
                : "2021",
            );
            const colors = materialColors(dynamic);
            expect(Object.keys(colors)).toHaveLength(53);
            expect(
              Object.values(colors).every((color) =>
                /^#[a-f\d]{6}$/.test(color),
              ),
            ).toBe(true);
            expect(colors["--md-sys-color-primary-dim"]).toBe(
              hexFromArgb(
                dynamic.specVersion === "2021"
                  ? dynamic.primary
                  : dynamic.primaryDim,
              ),
            );
            const check = (
              foreground: string,
              background: string,
              minimum: number,
            ) => {
              const a = luminance(colors[`--md-sys-color-${foreground}`]);
              const b = luminance(colors[`--md-sys-color-${background}`]);
              const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
              expect(
                ratio,
                `${foreground} on ${background}, ${seed}/${specVersion}/${dark}/${contrast}`,
              ).toBeGreaterThanOrEqual(minimum);
            };
            for (const [foreground, background] of textPairs)
              check(foreground, background, 4.5);
            check("outline", "surface", 3);
            check("outline", "surface-container-highest", 3);
            check("primary", "surface-container", 3);
            check("primary", "surface-container-highest", 3);
          }
        }
      }
    }
  });

  it("changes generated colors when a compatible spec, style, appearance or contrast changes", () => {
    const baseline = materialColors(
      createColorScheme(defaultColorProfile, false),
    );
    for (const scheme of schemes.filter(
      (style) => style !== defaultColorProfile.scheme,
    )) {
      expect(
        materialColors(
          createColorScheme({ ...defaultColorProfile, scheme }, false),
        ),
      ).not.toEqual(baseline);
    }
    for (const scheme of schemes.slice(0, 4)) {
      const colors = (specVersion: "2021" | "2025") =>
        materialColors(
          createColorScheme(
            { ...defaultColorProfile, scheme, specVersion },
            false,
          ),
        );
      expect(colors("2021")).not.toEqual(colors("2025"));
    }
    expect(
      materialColors(createColorScheme(defaultColorProfile, true)),
    ).not.toEqual(baseline);
    expect(
      materialColors(
        createColorScheme({ ...defaultColorProfile, contrast: "high" }, false),
      ),
    ).not.toEqual(baseline);
  });

  it.each([
    false,
    true,
  ])("keeps the semantic error palette stable (dark=%s)", (dark) => {
    const error = (profile: Parameters<typeof createColorScheme>[0]) =>
      Object.entries(materialColors(createColorScheme(profile, dark))).filter(
        ([name]) => name.includes("error") && !name.endsWith("-dim"),
      );
    for (const scheme of schemes) {
      expect(
        error({
          ...defaultColorProfile,
          specVersion: "2021",
          scheme,
          contrast: "high",
        }),
      ).toEqual(error(defaultColorProfile));
    }
  });
});
