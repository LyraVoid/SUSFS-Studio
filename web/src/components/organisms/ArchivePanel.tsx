import {
  Alert,
  Button,
  FileInput,
  Group,
  NativeSelect,
  Stack,
} from "@mantine/core";
import { useRef, useState } from "react";
import {
  archiveErrorMessage,
  hasArchiveWriter,
  writeArchive,
} from "../../features/config/archiveSave";
import { exportConfig, importConfig } from "../../features/config/interchange";
import {
  compareArchives,
  inspectArchive,
  previewArchive,
} from "../../features/config/preview";
import { upgradeArchive } from "../../features/config/ruleEdits";
import type { Message, Translate } from "../../i18n/messages";
import {
  type ArchiveBackup,
  type ArchiveBridge,
  ArchiveCommandError,
  type ArchiveReceipt,
  type SavedArchive,
} from "../../transport/archiveBridge";
import type { OperationPlan } from "../../transport/operations";
import { Icon } from "../atoms/Icon";
import { DialogActions, M3eDialog } from "../molecules/M3eDialog";
import { SettingsList, SettingsRow } from "../molecules/SettingsList";
import styles from "./Panels.module.css";

type Preview = Awaited<ReturnType<typeof previewArchive>>;

function parseSaved(archive?: SavedArchive) {
  return archive?.text === undefined
    ? Promise.resolve(undefined)
    : previewArchive(new Blob([archive.text]));
}

export function ArchiveDifference({
  base,
  candidate,
  t,
}: {
  base: Preview | undefined;
  candidate: Preview;
  t: Translate;
}) {
  if (candidate.error || !candidate.value) return null;
  let result: ReturnType<typeof compareArchives> | undefined;
  if (base && !base.error && base.value)
    result = compareArchives(base.value, candidate.value);
  return (
    <>
      {result && result.changes.length === 0 && !result.truncated && (
        <p>{t("archiveNoChanges")}</p>
      )}
      {result?.changes.map((change) => (
        <p className={styles.change} key={`${change.kind}:${change.path}`}>
          <strong>
            {t(
              change.kind === "added"
                ? "archiveAdded"
                : change.kind === "removed"
                  ? "archiveRemoved"
                  : "archiveChanged",
            )}
            :
          </strong>{" "}
          <code>{change.path || "/"}</code>
        </p>
      ))}
      {result?.truncated && <output>{t("archiveDiffTruncated")}</output>}
    </>
  );
}

function download(text: string, revision?: string, filename?: string) {
  const suffix = revision?.slice(0, 12) ?? "archive";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  link.download = filename ?? `susfs-studio-${suffix}.json`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

export function ArchivePanel({
  t,
  archive,
  archiveImport,
  workflow,
  onSaved,
}: {
  t: Translate;
  archive?: ArchiveBridge;
  archiveImport: boolean;
  workflow: boolean;
  onSaved?: (plan?: OperationPlan) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [result, setResult] = useState<Preview>();
  const [savedResult, setSavedResult] = useState<Preview>();
  const [saved, setSaved] = useState<SavedArchive>();
  const [comparison, setComparison] = useState<Preview>();
  const [source, setSource] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [importing, setImporting] = useState(false);
  const [original, setOriginal] = useState<string>();
  const [upgradeBase, setUpgradeBase] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [operationError, setOperationError] = useState<Message>();
  const [receipt, setReceipt] = useState<ArchiveReceipt>();
  const [plan, setPlan] = useState<OperationPlan>();
  const [backups, setBackups] = useState<ArchiveBackup[]>();
  const [backupListError, setBackupListError] = useState(false);
  const [backupId, setBackupId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const request = useRef(0);
  const compareRequest = useRef(0);
  const savedRequest = useRef(0);
  const committing = useRef(false);
  const listRequest = useRef(0);

  const refreshBackups = async () => {
    if (!archive) return;
    const id = ++listRequest.current;
    setBackupListError(false);
    try {
      const list = await archive.backups();
      if (id === listRequest.current) setBackups(list);
    } catch {
      if (id === listRequest.current) setBackupListError(true);
    }
  };

  const selectBackup = async (backup: ArchiveBackup | undefined) => {
    const id = ++request.current;
    compareRequest.current++;
    setComparison(undefined);
    setBackupId(backup?.id ?? "");
    setFile(null);
    setResult(undefined);
    setSource(undefined);
    setOperationError(undefined);
    setReceipt(undefined);
    setPlan(undefined);
    if (!backup?.valid || !archive) return;
    try {
      const candidate = await archive.backup(backup.id);
      const parsed = await parseSaved(candidate);
      if (
        candidate.revision !== backup.revision ||
        !parsed ||
        parsed.formatStatus !== "valid"
      )
        throw new ArchiveCommandError("STORE_CORRUPT");
      if (id === request.current) {
        setSource(
          `${t("archiveBackupList")} · ${backup.id.slice(0, 8)} · ${candidate.revision}`,
        );
        setResult(parsed);
      }
    } catch (error) {
      if (id === request.current) setOperationError(archiveErrorMessage(error));
    }
  };

  const refreshSaved = async () => {
    if (!archive) return;
    const id = ++savedRequest.current;
    setLoadingSaved(true);
    setOperationError(undefined);
    setSaved(undefined);
    setSavedResult(undefined);
    try {
      const next = await archive.read();
      const parsed =
        next.kind === "empty"
          ? await previewArchive(new Blob(["{}"]))
          : await parseSaved(next);
      if (id !== savedRequest.current) return;
      setSaved(next);
      setSavedResult(parsed);
      setConfirming(false);
      setNeedsVerification(false);
    } catch (error) {
      if (id === savedRequest.current)
        setOperationError(archiveErrorMessage(error));
    } finally {
      if (id === savedRequest.current) setLoadingSaved(false);
    }
  };

  const open = (restore = false, interchange = false) => {
    setRestoring(restore);
    setImporting(interchange);
    setOpened(true);
    setOperationError(undefined);
    setReceipt(undefined);
    setPlan(undefined);
    setNeedsVerification(false);
    void refreshSaved();
    if (restore) void refreshBackups();
  };

  const close = () => {
    if (committing.current) return;
    request.current++;
    compareRequest.current++;
    savedRequest.current++;
    listRequest.current++;
    setBackups(undefined);
    setBackupId("");
    setFile(null);
    setOpened(false);
    setResult(undefined);
    setSavedResult(undefined);
    setSaved(undefined);
    setComparison(undefined);
    setSource(undefined);
    setOriginal(undefined);
    setUpgradeBase(undefined);
    setConfirming(false);
    setOperationError(undefined);
    setReceipt(undefined);
    setPlan(undefined);
    setNeedsVerification(false);
  };

  const exportSaved = async (interchange = false) => {
    const id = savedRequest.current;
    setOperationError(undefined);
    try {
      const current = await archive?.read();
      if (id !== savedRequest.current) return;
      if (!current || current.kind === "empty" || current.text === undefined) {
        setOperationError("archiveNoSaved");
        return;
      }
      if (interchange) {
        const text = exportConfig(current.text);
        if (!text) setOperationError("archiveInterchangeInvalid");
        else download(text, undefined, "susfs-config.json");
      } else download(current.text, current.revision);
    } catch (error) {
      if (id === savedRequest.current)
        setOperationError(archiveErrorMessage(error));
    }
  };

  const completeDiff =
    result?.formatStatus === "valid" &&
    !result.unrepresentable &&
    savedResult?.value !== undefined &&
    !savedResult.unrepresentable &&
    !compareArchives(savedResult.value, result.value).truncated;
  const canConfirm =
    hasArchiveWriter(archive) &&
    completeDiff &&
    !needsVerification &&
    !loadingSaved &&
    (saved?.kind === "empty" || savedResult?.formatStatus === "valid") &&
    (upgradeBase === undefined || saved?.text === upgradeBase) &&
    (!importing || (archiveImport && !!archive?.import)) &&
    (!restoring || (saved?.kind === "saved" && !!archive?.restore));

  const save = async () => {
    if (committing.current || !canConfirm || !archive || !result || !saved)
      return;
    committing.current = true;
    savedRequest.current++;
    setSaving(true);
    setOperationError(undefined);
    setReceipt(undefined);
    try {
      const { receipt: next, plan: candidatePlan } = await writeArchive(
        archive,
        saved,
        result.bytes,
        restoring ? "restore" : importing ? "import" : "save",
      );
      const persisted = await archive.read().catch(() => undefined);
      if (
        persisted?.text !== result.text ||
        persisted.revision !== next.revision ||
        persisted.receiptStatus !== "available" ||
        persisted.receipt?.revision !== next.revision ||
        persisted.receipt.bytes !== result.bytes.length ||
        persisted.receipt.savedAt !== next.savedAt ||
        next.bytes !== result.bytes.length
      )
        throw new ArchiveCommandError("RESULT_UNKNOWN");
      setReceipt(next);
      setPlan(candidatePlan);
      setSaved(persisted);
      setSavedResult(result);
      setConfirming(false);
      setNeedsVerification(false);
      onSaved?.(candidatePlan);
      if (restoring) void refreshBackups();
    } catch (error) {
      const message = archiveErrorMessage(error);
      setOperationError(message);
      if (
        error instanceof ArchiveCommandError &&
        (error.code === "REVISION_CONFLICT" || error.code === "RESULT_UNKNOWN")
      ) {
        setNeedsVerification(true);
        setSaved(undefined);
        setSavedResult(undefined);
        savedRequest.current++;
        setLoadingSaved(false);
      }
    } finally {
      committing.current = false;
      setSaving(false);
    }
  };

  const hasWriter = hasArchiveWriter(archive);
  const upgrade =
    !restoring && !importing && !result && saved?.text
      ? upgradeArchive(saved.text)
      : undefined;

  return (
    <>
      <SettingsList label={t("archive")}>
        <SettingsRow
          icon="archive"
          title={t("preview")}
          detail={archive ? t("archiveHostNote") : t("archivePreviewOnly")}
          action={() => open()}
          trailing={<Icon name="chevron" />}
        />
        <SettingsRow
          icon="save"
          title={t(workflow ? "workflowSaveArchive" : "save")}
          detail={
            workflow
              ? t("workflowNotice")
              : hasWriter
                ? t("archiveSaveDetail")
                : archive
                  ? t("archiveStreamUnavailable")
                  : t("archiveHostUnavailable")
          }
          disabled={!hasWriter}
          action={hasWriter ? () => open() : undefined}
        />
        <SettingsRow
          icon="export"
          title={t(workflow ? "workflowExportArchive" : "export")}
          detail={
            workflow
              ? t("workflowNotice")
              : archive
                ? t("archiveExportDetail")
                : t("archiveHostUnavailable")
          }
          disabled={!archive}
          action={archive ? () => open() : undefined}
        />
        <SettingsRow
          icon="restore"
          title={t("restore")}
          detail={t("archiveRestoreDetail")}
          disabled={!hasWriter || !archive?.restore}
          action={hasWriter && archive?.restore ? () => open(true) : undefined}
        />
        <SettingsRow
          icon="archive"
          title={t("archiveInterchange")}
          detail={t("archiveInterchangeNote")}
          action={() => open(false, true)}
          trailing={<Icon name="chevron" />}
        />
      </SettingsList>
      <M3eDialog
        opened={opened}
        onClose={close}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        title={
          confirming
            ? t(restoring ? "archiveConfirmRestore" : "archiveConfirmSave")
            : t(importing ? "archiveInterchange" : "preview")
        }
      >
        <Stack>
          {workflow && <p>{t("workflowNotice")}</p>}
          {!confirming ? (
            <>
              <p>{t(restoring ? "archiveRestoreDetail" : "previewPending")}</p>
              {importing && (!archiveImport || !archive?.import) && (
                <p>{t("archiveImportUnavailable")}</p>
              )}
              <section aria-label={t("archiveDeviceState")}>
                <strong>{t("archiveDeviceState")}:</strong>{" "}
                {loadingSaved
                  ? t("loading")
                  : saved?.kind === "saved"
                    ? t("archiveSaved")
                    : saved?.kind === "empty"
                      ? t("archiveNoSaved")
                      : t("archiveUnavailable")}
                {saved?.receipt && (
                  <p className={styles.muted}>
                    {t("archiveReceipt", {
                      revision: saved.receipt.revision.slice(0, 12),
                      bytes: saved.receipt.bytes,
                    })}
                  </p>
                )}
                {saved?.kind === "saved" &&
                  saved.receiptStatus === "missing" && (
                    <Alert color="warning" mt="xs">
                      {t("archiveReceiptMissing")}
                    </Alert>
                  )}
              </section>
              {upgrade && (
                <Button
                  variant="subtle"
                  onClick={() => {
                    setResult(inspectArchive(upgrade));
                    setSource(t("archiveUpgrade"));
                    setUpgradeBase(saved?.text);
                  }}
                >
                  {t("archiveUpgrade")}
                </Button>
              )}
              {restoring && (
                <NativeSelect
                  size="md"
                  classNames={{ input: styles.file }}
                  label={t("archiveBackupList")}
                  description={t(
                    backupListError
                      ? "archiveBackupsUnavailable"
                      : backups?.length
                        ? "archiveBackupChoice"
                        : backups
                          ? "archiveBackupsEmpty"
                          : "loading",
                  )}
                  value={backupId}
                  disabled={!backups?.length || backupListError}
                  onChange={(event) =>
                    void selectBackup(
                      backups?.find(
                        (item) => item.id === event.currentTarget.value,
                      ),
                    )
                  }
                  data={[
                    { value: "", label: t("archiveBackupChoice") },
                    ...(backups ?? []).map((backup) => ({
                      value: backup.id,
                      label: t(
                        backup.valid
                          ? "archiveBackupEntry"
                          : "archiveBackupInvalid",
                        {
                          time: new Date(
                            backup.modifiedAt * 1000,
                          ).toLocaleString(),
                          bytes: backup.bytes,
                          revision:
                            backup.revision?.slice(0, 12) ??
                            backup.id.slice(0, 8),
                        },
                      ),
                      disabled: !backup.valid,
                    })),
                  ]}
                />
              )}
              <FileInput
                size="md"
                classNames={{ input: styles.file }}
                label={t(importing ? "archiveImportFile" : "archiveFile")}
                value={file}
                accept=".json,application/json"
                clearable
                clearButtonProps={{ "aria-label": t("clearFile") }}
                onChange={async (file) => {
                  const id = ++request.current;
                  setFile(file);
                  setBackupId("");
                  compareRequest.current++;
                  setComparison(undefined);
                  setResult(undefined);
                  setOriginal(undefined);
                  setUpgradeBase(undefined);
                  setSource(undefined);
                  setOperationError(undefined);
                  setReceipt(undefined);
                  if (!file) return;
                  const preview = await previewArchive(file);
                  if (id === request.current) {
                    setSource(file.name);
                    if (importing && !preview.error) {
                      setOriginal(preview.text);
                      const mapped = importConfig(preview.text);
                      if (mapped) setResult(inspectArchive(mapped));
                      else setOperationError("archiveInterchangeInvalid");
                    } else setResult(preview);
                  }
                }}
              />
              {result?.error && <p role="alert">{t(result.error)}</p>}
              {original !== undefined && (
                <details>
                  <summary>{t("archiveImportOriginal")}</summary>
                  <pre className={styles.preview}>{original}</pre>
                </details>
              )}
              {result && !result.error && (
                <>
                  <section aria-label={t("archiveSource")}>
                    <p>
                      <strong>{t("archiveSource")}:</strong> {source}
                    </p>
                    <p>
                      <strong>{t("archiveSchema")}:</strong>{" "}
                      {result.schema ?? t("archiveSchemaUnknown")}
                    </p>
                    <p className={styles.muted}>
                      {t(
                        result.formatStatus === "valid"
                          ? "archiveFormatValid"
                          : result.formatStatus === "invalid"
                            ? "archiveFormatInvalid"
                            : "archiveSchemaNote",
                      )}
                    </p>
                    {result.ambiguous && (
                      <p role="alert">{t("archiveAmbiguous")}</p>
                    )}
                    {result.ruleCount !== undefined && (
                      <p>
                        {t("archiveRuleCount", { count: result.ruleCount })}
                      </p>
                    )}
                    {result.unknownFields.length > 0 && (
                      <Alert color="info" mt="xs">
                        {t("archiveUnknownFields", {
                          fields: result.unknownFields.slice(0, 20).join(", "),
                        })}
                      </Alert>
                    )}
                    <p>
                      <strong>{t("archiveExpectedEffect")}:</strong>{" "}
                      {t("archiveSaveEffect")}
                    </p>
                  </section>
                  <section aria-label={t("archiveDeviceDiff")}>
                    <strong>{t("archiveDeviceDiff")}</strong>
                    <ArchiveDifference
                      base={savedResult}
                      candidate={result}
                      t={t}
                    />
                    {saved?.text !== undefined && (
                      <details>
                        <summary>{t("controlSavedOriginal")}</summary>
                        <pre className={styles.preview}>{saved.text}</pre>
                      </details>
                    )}
                  </section>
                  <FileInput
                    size="md"
                    classNames={{ input: styles.file }}
                    label={t("archiveCompare")}
                    accept=".json,application/json"
                    clearable
                    clearButtonProps={{ "aria-label": t("clearFile") }}
                    onChange={async (file) => {
                      const id = ++compareRequest.current;
                      setComparison(undefined);
                      if (!file) return;
                      const preview = await previewArchive(file);
                      if (id === compareRequest.current) setComparison(preview);
                    }}
                  />
                  {comparison?.error && (
                    <p role="alert">{t(comparison.error)}</p>
                  )}
                  {comparison?.text !== undefined && (
                    <>
                      <p className={styles.muted}>{t("archiveCompareNote")}</p>
                      {comparison.ambiguous && (
                        <p role="alert">{t("archiveAmbiguous")}</p>
                      )}
                      <ArchiveDifference
                        base={result}
                        candidate={comparison}
                        t={t}
                      />
                      <p>
                        <strong>
                          {t("archiveCandidate")} · {t("archiveSchema")}:
                        </strong>{" "}
                        {comparison.schema ?? t("archiveSchemaUnknown")}
                      </p>
                      <pre className={styles.preview}>{comparison.text}</pre>
                    </>
                  )}
                  <p>
                    <strong>{t("archiveBaseline")}</strong>
                  </p>
                  <pre className={styles.preview}>{result.text}</pre>
                </>
              )}
              {operationError && (
                <Alert color="danger" role="alert">
                  {t(operationError)}
                </Alert>
              )}
              {upgradeBase !== undefined &&
                saved?.text !== upgradeBase &&
                !receipt && <p role="alert">{t("archiveUpgradeStale")}</p>}
              {result?.formatStatus === "valid" &&
                savedResult &&
                !completeDiff && <p role="alert">{t("ruleDiffBlocked")}</p>}
              {receipt && (
                <Alert color="success" role="status">
                  {t(
                    restoring
                      ? "archiveRestoredReceipt"
                      : "archiveSavedReceipt",
                    {
                      revision: receipt.revision.slice(0, 12),
                      bytes: receipt.bytes,
                    },
                  )}
                </Alert>
              )}
              {plan && (
                <Alert color={plan.status === "blocked" ? "warning" : "info"}>
                  {t("operationPlanSummary", {
                    count: plan.items.length,
                    eligible: plan.items.filter(
                      (item) => item.eligibility === "eligible",
                    ).length,
                    blocked: plan.items.filter(
                      (item) => item.eligibility !== "eligible",
                    ).length,
                  })}
                </Alert>
              )}
              <DialogActions justify="space-between">
                <Button
                  variant="subtle"
                  onClick={() => {
                    void refreshSaved();
                    if (restoring) void refreshBackups();
                  }}
                >
                  {t("archiveRefresh")}
                </Button>
                <Group>
                  <Button
                    variant="subtle"
                    disabled={saved?.kind !== "saved"}
                    onClick={() => void exportSaved(importing)}
                  >
                    {t(
                      importing
                        ? "archiveExportConfig"
                        : workflow
                          ? "workflowExportArchive"
                          : "export",
                    )}
                  </Button>
                  <Button
                    variant="subtle"
                    disabled={!canConfirm}
                    onClick={() => {
                      setOperationError(undefined);
                      setConfirming(true);
                    }}
                  >
                    {t(
                      restoring ? "archiveReviewRestore" : "archiveReviewSave",
                    )}
                  </Button>
                </Group>
              </DialogActions>
            </>
          ) : (
            <>
              <p>
                {t(
                  restoring ? "archiveRestoreWarning" : "archiveConfirmWarning",
                )}
              </p>
              {result && !result.error && (
                <section
                  aria-label={t(
                    restoring ? "archiveConfirmRestore" : "archiveConfirmSave",
                  )}
                >
                  <p>
                    <strong>{t("archiveSource")}:</strong> {source}
                  </p>
                  <p>
                    <strong>{t("archiveSchema")}:</strong>{" "}
                    {result.schema ?? t("archiveSchemaUnknown")}
                  </p>
                  <p>
                    {t("archiveRuleCount", { count: result.ruleCount ?? 0 })}
                  </p>
                  <p>{t("archiveConfirmDiff")}</p>
                  <ArchiveDifference
                    base={savedResult}
                    candidate={result}
                    t={t}
                  />
                  {saved?.text !== undefined && (
                    <details>
                      <summary>{t("controlSavedOriginal")}</summary>
                      <pre className={styles.preview}>{saved.text}</pre>
                    </details>
                  )}
                  <details>
                    <summary>{t("controlCandidateOriginal")}</summary>
                    <pre className={styles.preview}>{result.text}</pre>
                  </details>
                </section>
              )}
              <Alert color="info">{t("archiveSaveEffect")}</Alert>
              {operationError && (
                <Alert color="danger" role="alert">
                  {t(operationError)}
                </Alert>
              )}
              <DialogActions>
                <Button
                  variant="subtle"
                  disabled={saving}
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  {t("archiveBack")}
                </Button>
                <Button
                  variant="subtle"
                  loading={loadingSaved}
                  disabled={saving}
                  onClick={() => void refreshSaved()}
                >
                  {t("archiveRefresh")}
                </Button>
                <Button
                  loading={saving}
                  disabled={!canConfirm}
                  variant="subtle"
                  onClick={() => void save()}
                >
                  {t(
                    restoring
                      ? "archiveRestoreAction"
                      : "archiveConfirmSaveAction",
                  )}
                </Button>
              </DialogActions>
            </>
          )}
        </Stack>
      </M3eDialog>
    </>
  );
}
