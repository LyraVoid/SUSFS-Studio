export const specVersions = ["2021", "2025"] as const;
export const schemes = [
  "expressive",
  "tonalSpot",
  "vibrant",
  "neutral",
  "monochrome",
  "content",
  "fidelity",
  "fruitSalad",
  "rainbow",
] as const;
export const contrasts = ["standard", "medium", "high"] as const;
export const seeds = {
  slate: 0xff506775,
  blue: 0xff3565b1,
  indigo: 0xff6254a6,
  teal: 0xff247a70,
  green: 0xff53743b,
  amber: 0xffa36b19,
  rose: 0xffa64966,
} as const;
export type Seed = keyof typeof seeds;

export type ColorProfile = {
  seed: Seed;
  specVersion: (typeof specVersions)[number];
  scheme: (typeof schemes)[number];
  contrast: (typeof contrasts)[number];
};

export const defaultAppearance = "dark";
export const defaultColorScheme = "auto";
export const defaultColorProfile: ColorProfile = {
  seed: "slate",
  specVersion: "2025",
  scheme: "tonalSpot",
  contrast: "standard",
};

const storageKey = "studio-color-profile";
const version = 3;

export function parseColorProfile(raw: string | null): ColorProfile {
  try {
    const profile = JSON.parse(raw ?? "null");
    if (
      profile?.version !== version &&
      profile?.version !== 2 &&
      profile?.version !== 1
    )
      return defaultColorProfile;
    const specVersion = specVersions.find(
      (value) => value === profile.specVersion,
    );
    const scheme = schemes.find((value) => value === profile.scheme);
    const contrast = contrasts.find((value) => value === profile.contrast);
    if (!specVersion || !scheme || !contrast) return defaultColorProfile;
    if (profile.version === 1) {
      if (
        specVersion === "2025" &&
        scheme === "expressive" &&
        contrast === "standard"
      )
        return defaultColorProfile;
      return { seed: defaultColorProfile.seed, specVersion, scheme, contrast };
    }
    if (
      typeof profile.seed === "string" &&
      Object.hasOwn(seeds, profile.seed)
    ) {
      return { seed: profile.seed as Seed, specVersion, scheme, contrast };
    }
  } catch {
    return defaultColorProfile;
  }
  return defaultColorProfile;
}

export function readColorProfile(): ColorProfile {
  try {
    return parseColorProfile(localStorage.getItem(storageKey));
  } catch {
    return defaultColorProfile;
  }
}

export function saveColorProfile(profile: ColorProfile) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version, ...profile }));
  } catch {
    return;
  }
}
