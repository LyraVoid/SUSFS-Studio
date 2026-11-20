import { Switch } from "@mantine/core";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Translate } from "../../i18n/messages";
import type { ArchiveBridge } from "../../transport/archiveBridge";
import { capabilityKeys, type Status } from "../../transport/mock";
import { SegmentedSection } from "../molecules/SegmentedSection";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
import { ArchivePanel } from "./ArchivePanel";
import { Capabilities } from "./Capabilities";
import styles from "./RulesOverview.module.css";

export function RulesOverview({
  status,
  demo,
  stale,
  archive,
  bridge,
  t,
}: {
  status: Status;
  demo: boolean;
  stale: boolean;
  archive: ReturnType<typeof useRuleArchive>;
  bridge?: ArchiveBridge;
  t: Translate;
}) {
  const automatic =
    archive.current?.formatStatus === "valid" && archive.current.schema === "2"
      ? archive.current.value.automatic
      : undefined;
  const autoDisabled =
    !archive.canEdit ||
    archive.current?.formatStatus !== "valid" ||
    archive.current.schema !== "2";
  return (
    <div className={styles.overview}>
      <SegmentedSection title={t("controlOverview")}>
        <SettingsRow
          title={t("controlStudioManaged")}
          detail={t("controlStudioManagedHint")}
        />
        <SettingsRow
          title={t("controlAutomatic")}
          detail={
            automatic === true
              ? t("controlOn")
              : automatic === false
                ? t("controlOff")
                : t("controlUnmanaged")
          }
          trailing={
            <Switch
              aria-label={t("controlAutomatic")}
              checked={automatic === true}
              disabled={autoDisabled}
              onChange={(event) =>
                archive.edit({
                  section: "root",
                  key: "automatic",
                  before: automatic,
                  after: event.currentTarget.checked,
                })
              }
            />
          }
        />
        <SettingsRow
          icon="active"
          title={t("controlApply")}
          detail={t("controlProviderUnverified")}
          disabled
        />
        <SettingsRow
          title={t("controlLastApplication")}
          detail={t("controlNoReceipt")}
        />
      </SegmentedSection>
      <section className={styles.archive}>
        <h2>{t("controlConfiguration")}</h2>
        <ArchivePanel
          archive={bridge}
          archiveImport={status.archiveImport === true}
          onSaved={() => void archive.refresh()}
          t={t}
        />
      </section>
      <section className={styles.capabilities}>
        <h2>{t("compatibility")}</h2>
        <SettingsList label={t("compatibility")}>
          <Capabilities
            status={status}
            demo={demo}
            stale={stale}
            fields={capabilityKeys}
            t={t}
          />
        </SettingsList>
        <p>{t(demo ? "fixtureOnly" : "hostCapabilities")}</p>
      </section>
    </div>
  );
}

export function RulesOverviewLead({
  status,
  stale,
  t,
}: {
  status: Status;
  stale: boolean;
  t: Translate;
}) {
  const provider =
    !stale && status.kind === "active" ? status.provider : undefined;
  const mode = provider?.implementation
    ? t(provider.implementation)
    : t("unknown");
  const audit =
    stale || provider?.audited === undefined
      ? "controlAuditUnknown"
      : provider.audited
        ? "controlAudited"
        : "controlUnaudited";
  return (
    <SegmentedSection title={t("controlProtocol")}>
      <SettingsRow
        icon="status"
        title={
          provider ? t("controlProvider", { mode }) : t(`${status.kind}Detail`)
        }
        detail={
          provider
            ? t("controlProviderVersion", {
                version: provider.version,
                variant: provider.variant ?? t("absent"),
              })
            : undefined
        }
      />
      <SettingsRow icon="status" title={t("controlAudit")} detail={t(audit)} />
    </SegmentedSection>
  );
}
