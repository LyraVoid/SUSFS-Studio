import { Alert, Button, Group, Modal, Stack } from "@mantine/core";
import { type ReactNode, useState } from "react";
import { compareArchives } from "../../features/config/preview";
import {
  type Rule,
  type RuleGroup,
  readRules,
} from "../../features/config/ruleEdits";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import {
  type Message,
  redirectSchemeLabels,
  type Translate,
} from "../../i18n/messages";
import type { Provider } from "../../transport/mock";
import { Icon } from "../atoms/Icon";
import { BatchRuleForm } from "../molecules/BatchRuleForm";
import { modeLabels, RuleForm } from "../molecules/RuleForm";
import { SegmentedSection } from "../molecules/SegmentedSection";
import { SettingsRow } from "../molecules/SettingsList";
import { ArchiveDifference } from "./ArchivePanel";
import styles from "./Panels.module.css";
import rules from "./RuleArchive.module.css";

const groupLabels = {
  paths: "pathRules",
  maps: "mapRules",
  kstats: "kstatRules",
  redirects: "redirectRules",
} satisfies Record<RuleGroup, Message>;
const groupHints = {
  paths: "rulePathHint",
  maps: "ruleMapHint",
  kstats: "ruleKstatHint",
  redirects: "ruleRedirectHint",
} satisfies Record<RuleGroup, Message>;

type Dialog =
  | {
      kind: "edit" | "remove" | "batch";
      group: RuleGroup;
      rule?: Rule;
      staticMode?: boolean;
    }
  | { kind: "discard" };

export function RuleArchive({
  groups,
  state,
  demo,
  connected,
  provider,
  leading,
  mode = "rules",
  children,
  t,
}: {
  groups: RuleGroup[];
  state: ReturnType<typeof useRuleArchive>;
  demo: boolean;
  connected: boolean;
  provider?: Provider;
  leading?: ReactNode;
  mode?: "overview" | "rules";
  children?: ReactNode;
  t: Translate;
}) {
  const [removeError, setRemoveError] = useState(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [review, setReview] = useState<{
    draft: NonNullable<typeof state.draft>;
    saved: NonNullable<typeof state.saved>;
  }>();
  const { current, base, draft, saved, loading, saving, canEdit, error } =
    state;
  const close = () => {
    if (!saving) {
      setRemoveError(false);
      setDialog(undefined);
      setReview(undefined);
    }
  };
  const diff =
    base?.formatStatus === "valid" && current?.formatStatus === "valid" && draft
      ? compareArchives(base.value, current.value)
      : undefined;
  const empty = saved?.kind === "empty";
  const reason = !connected
    ? demo
      ? "ruleLocalOnly"
      : "archiveHostUnavailable"
    : loading
      ? "loading"
      : error
        ? "ruleWaitForRefresh"
        : !base
          ? "archiveUnavailable"
          : base.formatStatus !== "valid"
            ? base.formatStatus === "unknown"
              ? "archiveSchemaNote"
              : "archiveFormatInvalid"
            : !state.writable
              ? "archiveStreamUnavailable"
              : base.unrepresentable
                ? "ruleDiffBlocked"
                : undefined;
  const title =
    dialog?.kind === "discard"
      ? "ruleDiscard"
      : dialog?.kind === "batch"
        ? "ruleBatchAdd"
        : dialog?.kind === "remove"
          ? "ruleDelete"
          : dialog?.rule
            ? canEdit
              ? "ruleEdit"
              : "ruleView"
            : dialog?.staticMode
              ? "ruleAddStatic"
              : "ruleAdd";
  const receipt = saved?.receipt;
  return (
    <>
      {mode === "overview" && (
        <>
          {leading}
          <SegmentedSection title={t("archiveDeviceState")}>
            <SettingsRow
              icon="archive"
              title={
                loading
                  ? t("loading")
                  : empty
                    ? t("archiveNoSaved")
                    : saved
                      ? t("archiveSaved")
                      : t("archiveUnavailable")
              }
              detail={t("ruleArchiveOnly")}
            />
            {saved?.kind === "saved" && base?.formatStatus === "valid" && (
              <SettingsRow
                icon="archive"
                title={t("archiveRuleCount", {
                  count: base.ruleCount ?? 0,
                })}
              />
            )}
            {reason && (
              <SettingsRow
                icon="notice"
                title={t("archiveAvailability")}
                detail={t(reason)}
              />
            )}
            {draft && <SettingsRow icon="notice" title={t("ruleDraft")} />}
            {error && (
              <SettingsRow
                icon="notice"
                title={t("archiveOperationFailed")}
                detail={t(error)}
                role="alert"
              />
            )}
            {state.verified && receipt && (
              <SettingsRow
                icon="active"
                title={t("archiveSaved")}
                detail={t("ruleSaved", {
                  revision: receipt.revision,
                  bytes: receipt.bytes,
                })}
                role="status"
              />
            )}
            {!state.verified && saved?.kind === "saved" && !receipt && (
              <SettingsRow icon="notice" title={t("archiveReceiptMissing")} />
            )}
            <SettingsRow
              icon="restore"
              title={t("archiveRefresh")}
              disabled={!connected || loading || saving}
              action={() => void state.refresh()}
            />
          </SegmentedSection>
          <SegmentedSection title={t("saveDraft")}>
            <SettingsRow
              icon="save"
              title={t("archiveReviewSave")}
              detail={t(reason ?? "ruleNoEdits")}
              disabled={
                !canEdit ||
                !draft ||
                !saved ||
                !diff?.changes.length ||
                diff.truncated
              }
              action={() => {
                if (draft && saved) setReview({ draft, saved });
              }}
            />
            {draft && (
              <>
                <SettingsRow
                  icon="restore"
                  title={t("ruleDiscard")}
                  disabled={loading || saving}
                  action={() => setDialog({ kind: "discard" })}
                />
                <details className={rules.sourceBlock}>
                  <summary>{t("ruleDraftText")}</summary>
                  <pre className={rules.source}>{draft.text}</pre>
                </details>
              </>
            )}
            {saved?.text !== undefined && (
              <details className={rules.sourceBlock}>
                <summary>{t("ruleSourceText")}</summary>
                <pre className={rules.source}>{saved.text}</pre>
              </details>
            )}
          </SegmentedSection>
        </>
      )}
      {children}
      {groups.map((group) => {
        const entries = current ? readRules(current, group) : [];
        return (
          <div key={group} className={rules.group}>
            <SegmentedSection title={t(groupLabels[group])}>
              {group === "kstats" && (
                <SettingsRow
                  icon="add"
                  title={t("ruleAddStatic")}
                  detail={t("ruleStaticAddHint")}
                  disabled={!canEdit}
                  action={() =>
                    setDialog({ kind: "edit", group, staticMode: true })
                  }
                />
              )}
              <SettingsRow
                icon="add"
                title={t("ruleAdd")}
                detail={t(groupHints[group])}
                disabled={!canEdit}
                action={() => setDialog({ kind: "edit", group })}
              />
              {group !== "kstats" && (
                <SettingsRow
                  icon="batch"
                  title={t("ruleBatchAdd")}
                  detail={t(
                    group === "redirects"
                      ? "ruleBatchRedirects"
                      : "ruleBatchPaths",
                  )}
                  disabled={!canEdit}
                  action={() => setDialog({ kind: "batch", group })}
                />
              )}
              {entries.map((rule) => {
                const detail =
                  group === "paths"
                    ? t(rule.looping ? "ruleLooping" : "ruleOnce")
                    : group === "kstats"
                      ? t(modeLabels[rule.mode as keyof typeof modeLabels])
                      : group === "redirects"
                        ? `→ ${rule.destination}\n${String(rule.uidScheme)} · ${t(redirectSchemeLabels[Number(rule.uidScheme)] ?? "unknown")}`
                        : t("mapRules");
                return (
                  <SettingsRow
                    key={rule.id}
                    icon={group}
                    title={rule.path}
                    detail={detail}
                    action={() => setDialog({ kind: "edit", group, rule })}
                    trailing={<Icon name="chevron" />}
                  />
                );
              })}
              {!entries.length &&
                !loading &&
                !error &&
                current?.formatStatus === "valid" && (
                  <SettingsRow icon={group} title={t("rulesEmpty")} />
                )}
            </SegmentedSection>
            {entries.length > 0 && (
              <p className={rules.removalHint}>{t("ruleRemovalArchiveOnly")}</p>
            )}
          </div>
        );
      })}
      {mode === "rules" && draft && (
        <SegmentedSection title={t("ruleDraft")}>
          <SettingsRow
            icon="notice"
            title={t("rulesDraftOverview")}
            action={() => {
              window.location.hash = "/rules/overview";
            }}
          />
        </SegmentedSection>
      )}
      <Modal
        opened={Boolean(dialog || review)}
        onClose={close}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
        title={t(review ? "archiveConfirmSave" : title)}
        closeButtonProps={{ "aria-label": t("close") }}
        classNames={{ content: styles.dialog, header: styles.dialogHeader }}
      >
        {review && base && current && (
          <Stack>
            <p>{t("archiveConfirmWarning")}</p>
            <p className={styles.change}>
              {empty
                ? t("archiveNoSaved")
                : t("ruleCurrentRevision", {
                    revision: review.saved.revision ?? "",
                  })}
            </p>
            <p>{t("archiveConfirmDiff")}</p>
            <ArchiveDifference base={base} candidate={current} t={t} />
            {review.saved.text !== undefined && (
              <details>
                <summary>{t("ruleSourceText")}</summary>
                <pre className={rules.source}>{review.saved.text}</pre>
              </details>
            )}
            <details>
              <summary>{t("ruleDraftText")}</summary>
              <pre className={rules.source}>{review.draft.text}</pre>
            </details>
            <Alert color="blue">{t("archiveSaveEffect")}</Alert>
            <Group justify="flex-end">
              <Button variant="subtle" disabled={saving} onClick={close}>
                {t("ruleCancel")}
              </Button>
              <Button
                loading={saving}
                disabled={
                  !canEdit ||
                  review.saved !== saved ||
                  review.draft !== draft ||
                  diff?.truncated
                }
                onClick={async () => {
                  await state.save(review.draft, review.saved);
                  setReview(undefined);
                }}
              >
                {t("archiveConfirmSaveAction")}
              </Button>
            </Group>
          </Stack>
        )}
        {dialog?.kind === "edit" && (
          <Stack>
            <RuleForm
              group={dialog.group}
              rule={dialog.rule}
              staticMode={dialog.staticMode}
              readOnly={!canEdit}
              provider={provider}
              onEdit={state.edit}
              onClose={close}
              t={t}
            />
            {dialog.rule && canEdit && (
              <Button
                variant="subtle"
                color="red"
                onClick={() => setDialog({ ...dialog, kind: "remove" })}
              >
                {t("ruleDelete")}
              </Button>
            )}
          </Stack>
        )}
        {dialog?.kind === "batch" && canEdit && (
          <BatchRuleForm
            group={dialog.group}
            provider={provider}
            onEdit={state.edit}
            onClose={close}
            t={t}
          />
        )}
        {dialog && (dialog.kind === "remove" || dialog.kind === "discard") && (
          <Stack>
            <p className={styles.change}>
              {dialog.kind === "discard"
                ? t("ruleDiscardNote")
                : t("ruleDeleteNote", { path: dialog.rule?.path ?? "" })}
            </p>
            {removeError && <p role="alert">{t("ruleWaitForRefresh")}</p>}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={close}>
                {t("ruleCancel")}
              </Button>
              <Button
                color="red"
                disabled={dialog.kind === "remove" && !canEdit}
                onClick={() => {
                  if (dialog.kind === "discard") state.discard();
                  else if (
                    !dialog.rule ||
                    !state.edit({ group: dialog.group, before: dialog.rule })
                  ) {
                    setRemoveError(true);
                    return;
                  }
                  close();
                }}
              >
                {t(dialog.kind === "discard" ? "ruleDiscard" : "ruleDelete")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
