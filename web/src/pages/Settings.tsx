import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { hexFromArgb } from "@material/material-color-utilities";
import { useId, useMemo, useState } from "react";
import { ChoiceMenu } from "../components/atoms/ChoiceMenu";
import type { IconName } from "../components/atoms/Icon";
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
  defaultColorScheme,
  type Seed,
  schemes,
  seeds,
  specVersions,
} from "../theme/colorProfile";
import { createColorScheme } from "../theme/theme";
import { type Scenario, scenarios } from "../transport/mock";
import styles from "./Settings.module.css";

const seedOptions = Object.keys(seeds) as Seed[];
const developerAvatar =
  "https://q.qlogo.cn/headimg_dl?dst_uin=3231515355&spec=640&img_type=jpg";

function DeveloperCard({ t }: { t: Translate }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  return (
    <div className={styles.developer} data-testid="developer-card">
      <span className={styles.avatar} aria-hidden="true">
        <span>LY</span>
        {!avatarFailed && (
          <img
            src={developerAvatar}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
          />
        )}
      </span>
      <span className={styles.developerCopy}>
        <span className={styles.developerName}>{t("developerTeam")}</span>
        <span className={styles.developerDetail}>{t("developerName")}</span>
      </span>
    </div>
  );
}

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
  return (
    <ChoiceMenu
      label={t(label)}
      value={value}
      options={options.map((value) => ({ value, label: t(value) }))}
      onChange={change}
    >
      <SettingsRow
        icon={icon}
        title={t(label)}
        aria-description={detail ?? t(value)}
        trailing={<span className={styles.value}>{detail ?? t(value)}</span>}
      />
    </ChoiceMenu>
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
  t: Translate;
}) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
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
    appearance: t(defaultColorScheme),
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
          value={colorScheme}
          options={["auto", "dark", "light"]}
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
            setColorScheme(defaultColorScheme);
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
      <SettingsList label={t("developers")}>
        <DeveloperCard t={t} />
      </SettingsList>
    </>
  );
}
