import { Button, Switch } from "@mantine/core";
import { useState } from "react";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Translate } from "../../i18n/messages";
import type { ArchiveBridge } from "../../transport/archiveBridge";
import { capabilityKeys, type Status } from "../../transport/mock";
import {
  DialogActions,
  DialogChoiceGroup,
  M3eDialog,
} from "../molecules/M3eDialog";
import { SegmentedSection } from "../molecules/SegmentedSection";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
import { ArchivePanel } from "./ArchivePanel";
import { Capabilities } from "./Capabilities";
import styles from "./RulesOverview.module.css";

const outcomes = [
  "workflowAccepted",
  "workflowPartial",
  "workflowRejected",
  "workflowUnknown",
] as const;
export type WorkflowReport = {
  revision: string;
  outcome: (typeof outcomes)[number];
  verified: boolean;
};

export function RulesOverview({
  status,
  demo,
  workflow,
  report,
  setReport,
  stale,
  archive,
  bridge,
  t,
}: {
  status: Status;
  demo: boolean;
  workflow: boolean;
  report?: WorkflowReport;
  setReport: (report: WorkflowReport) => void;
  stale: boolean;
  archive: ReturnType<typeof useRuleArchive>;
  bridge?: ArchiveBridge;
  t: Translate;
}) {
  const [review, setReview] = useState<string>();
  const [outcome, setOutcome] =
    useState<(typeof outcomes)[number]>("workflowAccepted");
  const revision = archive.saved?.receipt?.revision;
  const canSimulate =
    workflow &&
    !!revision &&
    !archive.draft &&
    !archive.loading &&
    !archive.saving &&
    !archive.error;
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
          title={t(workflow ? "workflowApply" : "controlApply")}
          detail={t(
            workflow ? "workflowApplyHint" : "controlProviderUnverified",
          )}
          disabled={!canSimulate}
          action={() => {
            if (canSimulate) setReview(revision);
          }}
        />
        <SettingsRow
          title={t("controlLastApplication")}
          detail={
            report && workflow ? t(report.outcome) : t("controlNoReceipt")
          }
        />
        {report && workflow && (
          <>
            <SettingsRow
              title={t("workflowReportedRevision")}
              detail={report.revision}
            />
            {report.revision !== revision && (
              <SettingsRow title={t("workflowPriorRevision")} />
            )}
            <SettingsRow
              title={t("workflowResultA")}
              detail={t(
                report.outcome === "workflowPartial"
                  ? "workflowAccepted"
                  : report.outcome,
              )}
            />
            <SettingsRow
              title={t("workflowResultB")}
              detail={t(
                report.outcome === "workflowPartial"
                  ? "workflowFailed"
                  : report.outcome,
              )}
            />
            <SettingsRow
              title={t("workflowEffect")}
              detail={t(
                report.verified ? "workflowObserved" : "workflowUnverified",
              )}
            />
            <SettingsRow
              title={t("workflowVerify")}
              disabled={
                !canSimulate ||
                report.revision !== revision ||
                report.outcome !== "workflowAccepted" ||
                report.verified
              }
              action={() => setReport({ ...report, verified: true })}
            />
          </>
        )}
      </SegmentedSection>
      <section className={styles.archive}>
        <h2>{t("controlConfiguration")}</h2>
        <ArchivePanel
          archive={bridge}
          workflow={workflow}
          archiveImport={status.archiveImport === true}
          onSaved={() => void archive.refresh()}
          t={t}
        />
      </section>
      {workflow && (
        <M3eDialog
          opened={review !== undefined}
          onClose={() => setReview(undefined)}
          title={t("workflowApply")}
        >
          <p>{t("workflowNotice")}</p>
          <p>
            {t("workflowReportedRevision")}: {review}
          </p>
          <DialogChoiceGroup
            value={outcome}
            options={outcomes.map((value) => ({ value, label: t(value) }))}
            onChange={(value) => {
              const next = outcomes.find((item) => item === value);
              if (next) setOutcome(next);
            }}
          />
          <DialogActions>
            <Button variant="subtle" onClick={() => setReview(undefined)}>
              {t("ruleCancel")}
            </Button>
            <Button
              variant="subtle"
              disabled={!canSimulate || review !== revision}
              onClick={() => {
                if (
                  review !== undefined &&
                  canSimulate &&
                  review === revision
                ) {
                  setReport({ revision: review, outcome, verified: false });
                  setReview(undefined);
                }
              }}
            >
              {t("workflowConfirm")}
            </Button>
          </DialogActions>
        </M3eDialog>
      )}
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
