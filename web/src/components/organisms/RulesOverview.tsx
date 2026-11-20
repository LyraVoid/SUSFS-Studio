import { Button } from "@mantine/core";
import { useState } from "react";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Translate } from "../../i18n/messages";
import type { ArchiveBridge } from "../../transport/archiveBridge";
import type { HostChannel } from "../../transport/host";
import { capabilityKeys, type Status } from "../../transport/mock";
import type { OperationPlanStatus } from "../../transport/operations";
import { ExpressiveSwitch } from "../atoms/ExpressiveSwitch";
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
  "workflowPendingReboot",
] as const;
const operationStatuses = [
  "ready",
  "applying",
  "saved",
  "applied",
  "partial",
  "failed",
  "unknown",
  "recovery_required",
  "pending_reboot",
  "deferred",
  "blocked",
  "verified",
  "idle",
] as const satisfies readonly OperationPlanStatus[];
const operationReasons: Record<string, string> = {
  CAPABILITY_VERIFIED: "operationReasonVerified",
  ABI_NOT_AUDITED: "operationReasonAbiUnaudited",
  PROC_EXTENSION_REQUIRED: "operationReasonProcMissing",
  CAPABILITY_UNREPORTED: "operationReasonUnreported",
  LIVE_KSTAT_STAGE_MISSED: "operationReasonKstatStage",
  PRE_MOUNT_KSTAT_MISSED: "operationReasonKstatPreMount",
  RULE_REPLACEMENT_REQUIRES_REBOOT: "operationReasonRebootReplace",
  KSTAT_SNAPSHOT_CAPTURED: "operationReasonSnapshot",
  KSTAT_SNAPSHOT_ALREADY_CAPTURED: "operationReasonSnapshotAlreadyCaptured",
  BOOT_STAGE: "operationReasonBootStage",
  PLAN_ITEM_MISMATCH: "operationReasonMismatch",
  PLAN_ACTION_MISSING: "operationReasonMismatch",
  PROVIDER_MISSING: "operationProviderMissing",
  PROVIDER_UNKNOWN_PROTOCOL: "operationProtocolUnknown",
  PROVIDER_DIAGNOSTIC_FAILED: "operationDiagnosticsFailed",
  EXPLICIT_RESET_REQUIRES_REBOOT: "operationReasonCmdlineReset",
};
const categoryMessages = {
  paths: "paths",
  maps: "mapRules",
  kstats: "kstatRules",
  redirects: "redirectRules",
  hideMounts: "controlHideMounts",
  logging: "controlLogging",
  avcSpoof: "controlAvcSpoof",
  priorityUidFilter: "controlUid",
  uname: "controlUname",
  cmdline: "controlCmdline",
  hiddenModules: "controlModules",
  mountPrefixes: "controlPrefixes",
} as const;
const operationStatusMessage = (status: string) =>
  status === "recovered"
    ? "operationRecovered"
    : operationStatuses.includes(status as OperationPlanStatus)
      ? status === "unknown"
        ? "operationUnknown"
        : (status as OperationPlanStatus)
      : "operationUnknown";
export type WorkflowReport = {
  revision: string;
  instance: number;
  refreshGeneration: number;
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
  channel,
  archive,
  bridge,
  refresh,
  refreshGeneration,
  t,
}: {
  status: Status;
  demo: boolean;
  workflow: boolean;
  report?: WorkflowReport;
  setReport: (report: WorkflowReport) => void;
  stale: boolean;
  channel: HostChannel;
  archive: ReturnType<typeof useRuleArchive>;
  bridge?: ArchiveBridge;
  refresh: () => void;
  refreshGeneration: number;
  t: Translate;
}) {
  const [review, setReview] = useState<string>();
  const [reviewOperation, setReviewOperation] = useState<
    "apply" | "retry" | undefined
  >();
  const [outcome, setOutcome] =
    useState<(typeof outcomes)[number]>("workflowAccepted");
  const [instance, setInstance] = useState((report?.instance ?? 0) + 1);
  const awaitingRefresh =
    report?.outcome === "workflowUnknown" &&
    report.refreshGeneration === refreshGeneration;
  const revision = archive.saved?.receipt?.revision;
  const canSimulate =
    workflow &&
    !!revision &&
    !awaitingRefresh &&
    !archive.draft &&
    !archive.loading &&
    !archive.saving &&
    !archive.error;
  const canApplyOperation =
    !workflow &&
    archive.plan?.status === "ready" &&
    archive.saved?.revision === archive.plan.candidateRevision &&
    !archive.draft &&
    !archive.loading &&
    !archive.saving &&
    !archive.operationBusy &&
    !archive.error;
  const canVerifyOperation =
    !workflow &&
    !!archive.plan &&
    archive.plan.items.some((item) => item.status === "applied") &&
    !archive.operationBusy;
  const canRecoverOperation =
    !workflow &&
    !!archive.plan &&
    ["applying", "unknown", "recovery_required"].includes(
      archive.plan.status,
    ) &&
    !archive.operationBusy;
  const canRetryOperation =
    !workflow &&
    !!archive.plan &&
    ["failed", "partial"].includes(archive.plan.status) &&
    archive.saved?.revision === archive.plan.candidateRevision &&
    !archive.operationBusy;
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
            <ExpressiveSwitch
              label={t("controlAutomatic")}
              checked={automatic === true}
              disabled={autoDisabled}
              onChange={(checked) =>
                archive.edit({
                  section: "root",
                  key: "automatic",
                  before: automatic,
                  after: checked,
                })
              }
            />
          }
        />
        <SettingsRow
          icon="active"
          title={t(workflow ? "workflowApply" : "controlApply")}
          detail={t(
            workflow
              ? "workflowApplyHint"
              : archive.plan
                ? "operationPlanReadyHint"
                : "operationPlanMissing",
          )}
          disabled={workflow ? !canSimulate : !canApplyOperation}
          action={() => {
            if (canSimulate) setReview(revision);
            if (canApplyOperation) setReviewOperation("apply");
          }}
        />
        {!workflow && (
          <>
            <SettingsRow
              title={t("operationPlan")}
              detail={
                archive.plan
                  ? [
                      t(operationStatusMessage(archive.plan.status)),
                      archive.plan.candidateRevision.slice(0, 12),
                      archive.plan.reason
                        ? t(
                            (operationReasons[archive.plan.reason] ??
                              "operationReasonMismatch") as Parameters<Translate>[0],
                          )
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t("operationPlanMissing")
              }
            />
            {archive.plan && (
              <SettingsRow
                title={t("operationCandidateRevision")}
                detail={archive.plan.candidateRevision}
              />
            )}
            {archive.plan && (
              <SettingsRow
                title={t("workflowEffect")}
                detail={[
                  t(
                    archive.plan.effectStatus === "verified"
                      ? "operationEffectVerified"
                      : archive.plan.effectStatus === "partial"
                        ? "operationEffectPartial"
                        : "operationEffectPending",
                  ),
                  t("operationEffectSeparate"),
                ].join(" · ")}
              />
            )}
            <SettingsRow
              icon="active"
              title={t("operationVerify")}
              detail={t("operationVerifyHint")}
              disabled={!canVerifyOperation}
              action={() => void archive.verifyOperation()}
            />
            {archive.plan &&
              ["applying", "unknown", "recovery_required"].includes(
                archive.plan.status,
              ) && (
                <SettingsRow
                  icon="restore"
                  title={t("operationRecover")}
                  detail={t("operationRecoverHint")}
                  disabled={!canRecoverOperation}
                  action={() => void archive.recoverOperation()}
                />
              )}
            {archive.plan &&
              ["failed", "partial"].includes(archive.plan.status) && (
                <SettingsRow
                  icon="restore"
                  title={t("operationRetry")}
                  detail={t("operationRetryHint")}
                  disabled={!canRetryOperation}
                  action={() => setReviewOperation("retry")}
                />
              )}
            {archive.plan && (
              <SettingsRow
                icon="status"
                title={t("operationInspect")}
                disabled={archive.operationBusy}
                action={() => void archive.inspectOperation()}
              />
            )}
          </>
        )}
        <SettingsRow
          title={t("controlLastApplication")}
          detail={
            report && workflow
              ? t(report.outcome)
              : archive.report
                ? t(operationStatusMessage(archive.report.status))
                : t("controlNoReceipt")
          }
        />
        {!workflow &&
          archive.plan?.items.map((item) => {
            const category =
              categoryMessages[item.category as keyof typeof categoryMessages];
            const reason =
              operationReasons[item.reason as keyof typeof operationReasons];
            const status = operationStatusMessage(item.status);
            return (
              <SettingsRow
                key={item.id}
                icon="status"
                title={`${category ? t(category) : item.category} · ${t(item.intent === "remove" ? "archiveRemoved" : item.intent === "update" ? "archiveChanged" : "archiveAdded")}`}
                detail={[
                  t(status),
                  reason ? t(reason as Parameters<Translate>[0]) : item.reason,
                  item.effect
                    ? t(
                        item.effect.observed
                          ? "operationEffectObserved"
                          : "operationEffectUnobserved",
                      )
                    : t("operationEffectPending"),
                ].join("\n")}
              />
            );
          })}
        {report && workflow && (
          <>
            <SettingsRow
              title={t("workflowInstance")}
              detail={String(report.instance)}
            />
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
            {awaitingRefresh && (
              <SettingsRow
                title={t("workflowRefreshCheck")}
                detail={t("workflowUnknownBlocked")}
                action={() => {
                  refresh();
                  void archive.refresh();
                }}
                disabled={archive.loading}
              />
            )}
          </>
        )}
      </SegmentedSection>
      <section className={styles.archive}>
        <h2>{t("controlConfiguration")}</h2>
        <ArchivePanel
          archive={bridge}
          workflow={workflow}
          archiveImport={status.control?.archiveImport === true}
          onSaved={(plan) => {
            archive.adoptPlan(plan);
            void archive.refresh();
          }}
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
                  setReport({
                    revision: review,
                    instance,
                    refreshGeneration,
                    outcome,
                    verified: false,
                  });
                  setInstance((value) => value + 1);
                  setReview(undefined);
                }
              }}
            >
              {t("workflowConfirm")}
            </Button>
          </DialogActions>
        </M3eDialog>
      )}
      <M3eDialog
        opened={reviewOperation !== undefined}
        onClose={() => setReviewOperation(undefined)}
        title={t(
          reviewOperation === "retry" ? "operationRetry" : "controlApply",
        )}
      >
        <p>
          {t(
            reviewOperation === "retry"
              ? "operationConfirmRetry"
              : "operationConfirmWarning",
          )}
        </p>
        {archive.plan && (
          <p>
            {t("operationCandidateRevision")}: {archive.plan.candidateRevision}
          </p>
        )}
        <DialogActions>
          <Button
            variant="subtle"
            onClick={() => setReviewOperation(undefined)}
          >
            {t("ruleCancel")}
          </Button>
          <Button
            variant="subtle"
            disabled={
              (reviewOperation === "retry"
                ? !canRetryOperation
                : !canApplyOperation) || archive.operationBusy
            }
            onClick={async () => {
              const success =
                reviewOperation === "retry"
                  ? await archive.retryOperation()
                  : await archive.applyOperation();
              if (success) setReviewOperation(undefined);
            }}
          >
            {t(
              reviewOperation === "retry"
                ? "operationConfirmRetryAction"
                : "operationConfirmApply",
            )}
          </Button>
        </DialogActions>
      </M3eDialog>
      <section className={styles.capabilities}>
        <h2>{t("compatibility")}</h2>
        <SettingsList label={t("compatibility")}>
          <Capabilities
            status={status}
            demo={demo}
            stale={stale}
            fields={capabilityKeys}
            channel={channel}
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
  channel,
  t,
}: {
  status: Status;
  stale: boolean;
  channel: HostChannel;
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
  const adapter =
    !stale && status.control
      ? t(
          status.control.adapter === "confirmed"
            ? "adapterConfirmed"
            : status.control.adapter === "unsupported"
              ? "adapterUnsupported"
              : "adapterUnknown",
        )
      : t("adapterUnknown");
  const features =
    !stale && provider?.features?.length
      ? provider.features.join("\n")
      : t("rawFeaturesUnreported");
  return (
    <SegmentedSection title={t("controlProtocol")}>
      <SettingsRow
        icon="status"
        title={t("hostChannel")}
        detail={t(
          channel === "demo"
            ? "hostChannelDemo"
            : channel === "injected"
              ? "hostChannelInjected"
              : channel === "ksu"
                ? "hostChannelKsu"
                : "hostChannelInaccessible",
        )}
      />
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
      <SettingsRow icon="status" title={t("adapter")} detail={adapter} />
      <SettingsRow icon="status" title={t("controlAudit")} detail={t(audit)} />
      <SettingsRow icon="status" title={t("rawFeatures")} detail={features} />
    </SegmentedSection>
  );
}
