import { Alert, Button, Group, Modal, Stack } from "@mantine/core";
import { type ReactNode, useState } from "react";
import { compareArchives } from "../../features/config/preview";
import {
  type Rule,
  type RuleGroup,
  readRules,
} from "../../features/config/ruleEdits";
import type { useRuleArchive } from "../../features/config/useRuleArchive";
import type { Message, Translate } from "../../i18n/messages";
import { Icon } from "../atoms/Icon";
import { BatchRuleForm } from "../molecules/BatchRuleForm";
import { modeLabels, RuleForm } from "../molecules/RuleForm";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
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
  children,
  t,
}: {
  groups: RuleGroup[];
  state: ReturnType<typeof useRuleArchive>;
  demo: boolean;
  connected: boolean;
  children?: ReactNode;
  t: Translate;
}) {
  const [dialog, setDialog] = useState<Dialog>();
  const [review, setReview] = useState<{
    draft: NonNullable<typeof state.draft>;
    saved: NonNullable<typeof state.saved>;
  }>();
  const { current, base, draft, saved, loading, saving, canEdit, error } =
    state;
  const close = () => {
    if (!saving) {
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
      <section className={styles.panel} aria-label={t("archiveDeviceState")}>
        <h2>{t("archiveDeviceState")}</h2>
        <p>{t("ruleArchiveOnly")}</p>
        {empty && <p>{t("archiveNoSaved")}</p>}
        {reason && <p className={styles.muted}>{t(reason)}</p>}
        {draft && <p>{t("ruleDraft")}</p>}
        {error && (
          <Alert color="red" role="alert">
            {t(error)}
          </Alert>
        )}
        {state.verified && receipt && (
          <Alert color="green" role="status" className={styles.change}>
            {t("ruleSaved", {
              revision: receipt.revision,
              bytes: receipt.bytes,
            })}
          </Alert>
        )}
        {!state.verified && saved?.kind === "saved" && !receipt && (
          <p>{t("archiveReceiptMissing")}</p>
        )}
        {connected && (
          <Button
            variant="outline"
            className={rules.control}
            loading={loading}
            disabled={saving}
            onClick={() => void state.refresh()}
          >
            {t("archiveRefresh")}
          </Button>
        )}
      </section>
      {children}
      {groups.map((group) => {
        const entries = current ? readRules(current, group) : [];
        return (
          <section key={group} className={rules.group}>
            <h2>{t(groupLabels[group])}</h2>
            <SettingsList label={t(groupLabels[group])}>
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
                        ? `→ ${rule.destination}\n${t("ruleUidValue", { value: String(rule.uidScheme) })}`
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
              {!entries.length && current?.formatStatus === "valid" && (
                <SettingsRow icon={group} title={t("rulesEmpty")} />
              )}
            </SettingsList>
          </section>
        );
      })}
      <section className={styles.panel} aria-label={t("archive")}>
        {diff?.truncated && <p>{t("ruleDiffBlocked")}</p>}
        {!draft && <p className={styles.muted}>{t(reason ?? "ruleNoEdits")}</p>}
        <Group>
          <Button
            className={rules.control}
            disabled={
              !canEdit ||
              !draft ||
              !saved ||
              !diff?.changes.length ||
              diff.truncated
            }
            onClick={() => {
              if (draft && saved) setReview({ draft, saved });
            }}
          >
            {t("archiveReviewSave")}
          </Button>
          {draft && (
            <Button
              className={rules.control}
              variant="subtle"
              disabled={loading || saving}
              onClick={() => setDialog({ kind: "discard" })}
            >
              {t("ruleDiscard")}
            </Button>
          )}
        </Group>
        {draft && (
          <details>
            <summary>{t("ruleDraftText")}</summary>
            <pre className={rules.source}>{draft.text}</pre>
          </details>
        )}
        {saved?.text !== undefined && (
          <details>
            <summary>{t("ruleSourceText")}</summary>
            <pre className={rules.source}>{saved.text}</pre>
          </details>
        )}
      </section>
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
                  )
                    return;
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
