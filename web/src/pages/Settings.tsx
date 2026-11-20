import { Switch, useMantineColorScheme } from "@mantine/core";
import { useId } from "react";
import { Icon, type IconName } from "../components/atoms/Icon";
import {
  SettingsList,
  SettingsRow,
} from "../components/molecules/SettingsList";
import { ArchivePanel } from "../components/organisms/ArchivePanel";
import type { Locale, Message, Translate } from "../i18n/messages";
import type { ArchiveBridge } from "../transport/archiveBridge";
import { type Scenario, type Status, scenarios } from "../transport/mock";
import page from "./PageHeader.module.css";
import styles from "./Settings.module.css";

function ChoiceRow<T extends Message>({
  icon,
  label,
  value,
  options,
  change,
  t,
}: {
  icon: IconName;
  label: Message;
  value: T;
  options: readonly T[];
  change: (value: T) => void;
  t: Translate;
}) {
  const id = useId();
  return (
    <div className={styles.choice}>
      <SettingsRow
        icon={icon}
        title={t(label)}
        detail={t(value)}
        id={id}
        trailing={<Icon name="chevron" />}
      />
      <select
        aria-labelledby={id}
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
  demo,
  scenario,
  setScenario,
  locale,
  setLocale,
  status,
  archive,
  t,
}: {
  demo: boolean;
  scenario: Scenario;
  setScenario: (value: Scenario) => void;
  locale: Locale;
  setLocale: (value: Locale) => void;
  status: Status;
  archive?: ArchiveBridge;
  t: Translate;
}) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <>
      <header className={page.header}>
        <h1>{t("settings")}</h1>
      </header>
      <SettingsList label={t("preferences")}>
        <ChoiceRow
          icon="palette"
          label="theme"
          value={colorScheme === "light" ? "light" : "dark"}
          options={["dark", "light"]}
          change={setColorScheme}
          t={t}
        />
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
            <Switch
              aria-label={t("automatic")}
              checked={false}
              disabled
              size="md"
              thumbIcon="×"
              classNames={{ track: styles.track, thumb: styles.thumb }}
            />
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
      <ArchivePanel
        archive={archive}
        archiveImport={status.archiveImport === true}
        t={t}
      />
    </>
  );
}
