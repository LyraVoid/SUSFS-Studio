import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { hexFromArgb } from "@material/material-color-utilities";
import { useId, useMemo } from "react";
import { ExpressiveSwitch } from "../components/atoms/ExpressiveSwitch";
import { Icon, type IconName } from "../components/atoms/Icon";
import { FlexiblePageHeader } from "../components/molecules/FlexiblePageHeader";
import {
  SettingsList,
  SettingsRow,
} from "../components/molecules/SettingsList";
import type { Locale, Message, Translate } from "../i18n/messages";
import {
  type ColorProfile,
  contrasts,
  defaultAppearance,
  defaultColorProfile,
  type Seed,
  schemes,
  seeds,
  specVersions,
} from "../theme/colorProfile";
import { createColorScheme } from "../theme/theme";
import { type Scenario, type Status, scenarios } from "../transport/mock";
import styles from "./Settings.module.css";

const seedOptions = Object.keys(seeds) as Seed[];

function ChoiceRow<T extends Message>({
  icon,
  label,
  value,
  options,
  change,
  detail,
  t,
}: {
  icon: IconName;
  label: Message;
  value: T;
  options: readonly T[];
  change: (value: T) => void;
  detail?: string;
  t: Translate;
}) {
  const id = useId();
  return (
    <div className={styles.choice}>
      <SettingsRow
        icon={icon}
        title={t(label)}
        detail={detail ?? t(value)}
        id={id}
        trailing={<Icon name="chevron" />}
      />
      <select
        aria-labelledby={id}
        onPointerDown={(event) => {
          event.currentTarget.dataset.pointerFocus = "true";
        }}
        onKeyDown={(event) => {
          delete event.currentTarget.dataset.pointerFocus;
        }}
        onBlur={(event) => {
          delete event.currentTarget.dataset.pointerFocus;
        }}
        value={value}
        onChange={(event) => {
          const next = options.find(
            (option) => option === event.currentTarget.value,
          );
          if (next) change(next);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Settings({
  profile,
  effectiveSpec,
  setProfile,
  demo,
  scenario,
  setScenario,
  locale,
  setLocale,
  status,
  t,
}: {
  profile: ColorProfile;
  effectiveSpec: ColorProfile["specVersion"];
  setProfile: (profile: ColorProfile) => void;
  demo: boolean;
  scenario: Scenario;
  setScenario: (value: Scenario) => void;
  locale: Locale;
  setLocale: (value: Locale) => void;
  status: Status;
  t: Translate;
}) {
  const { setColorScheme } = useMantineColorScheme();
  const appearance = useComputedColorScheme(defaultAppearance);
  const seedGroup = useId();
  const { specVersion, contrast } = profile;
  const previews = useMemo(
    () =>
      seedOptions.map((seed) => {
        const preview = createColorScheme(
          { seed, scheme: "tonalSpot", specVersion, contrast },
          appearance === "dark",
        );
        return {
          seed,
          primary: hexFromArgb(preview.primary),
          secondary: hexFromArgb(preview.secondaryContainer),
        };
      }),
    [specVersion, contrast, appearance],
  );
  const defaults = t("themeDefaults", {
    appearance: t(defaultAppearance),
    seed: t(defaultColorProfile.seed),
    version: t(defaultColorProfile.specVersion),
    scheme: t(defaultColorProfile.scheme),
    contrast: t(defaultColorProfile.contrast),
  });
  return (
    <>
      <FlexiblePageHeader title={t("settings")} />
      <SettingsList label={t("colorPreferences")}>
        <ChoiceRow
          icon="palette"
          label="theme"
          value={appearance}
          options={["dark", "light"]}
          change={setColorScheme}
          t={t}
        />
        <fieldset className={styles.seedField} aria-labelledby={seedGroup}>
          <SettingsRow
            icon="palette"
            id={seedGroup}
            title={t("colorSeed")}
            detail={t(profile.seed)}
          />
          <div className={styles.swatches}>
            {previews.map(({ seed, primary, secondary }) => (
              <label key={seed} title={t(seed)}>
                <input
                  type="radio"
                  name={seedGroup}
                  aria-label={t(seed)}
                  checked={profile.seed === seed}
                  onChange={() => setProfile({ ...profile, seed })}
                />
                <span
                  style={{
                    background: `linear-gradient(to bottom, ${primary} 50%, ${secondary} 50%)`,
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <ChoiceRow
          icon="palette"
          label="colorSpec"
          value={profile.specVersion}
          detail={t(effectiveSpec)}
          options={specVersions}
          change={(specVersion) => setProfile({ ...profile, specVersion })}
          t={t}
        />
        <ChoiceRow
          icon="palette"
          label="colorScheme"
          value={profile.scheme}
          options={schemes}
          change={(scheme) => setProfile({ ...profile, scheme })}
          t={t}
        />
        <ChoiceRow
          icon="palette"
          label="colorContrast"
          value={profile.contrast}
          options={contrasts}
          change={(contrast) => setProfile({ ...profile, contrast })}
          t={t}
        />
        <SettingsRow
          icon="restore"
          title={t("resetTheme")}
          detail={defaults}
          action={() => {
            setColorScheme(defaultAppearance);
            setProfile(defaultColorProfile);
          }}
        />
      </SettingsList>
      <SettingsList label={t("preferences")}>
        <ChoiceRow
          icon="language"
          label="language"
          value={locale}
          options={["zh", "en"]}
          change={setLocale}
          t={t}
        />
      </SettingsList>
      {demo && (
        <SettingsList label={t("demo")}>
          <ChoiceRow
            icon="status"
            label="scenario"
            value={scenario}
            options={scenarios}
            change={setScenario}
            t={t}
          />
        </SettingsList>
      )}
      <SettingsList label={t("diagnostics")}>
        <SettingsRow
          icon="status"
          title={t("automatic")}
          detail={t("hostPending")}
          trailing={
            <ExpressiveSwitch label={t("automatic")} checked={false} disabled />
          }
        />
        <SettingsRow
          icon="extensions"
          title={t("scope")}
          detail={t("localOnly")}
        />
        <SettingsRow
          icon="kernel"
          title={t("kernel")}
          detail={status.device?.kernel ?? t("absent")}
        />
      </SettingsList>
    </>
  );
}
